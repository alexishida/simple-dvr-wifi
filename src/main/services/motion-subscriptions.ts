export interface MotionSubscriptionClient {
  subscribe(signal: AbortSignal): Promise<{ renewAfterMs: number }>;
  renew(signal: AbortSignal): Promise<{ renewAfterMs: number }>;
  unsubscribe(): Promise<void>;
  pull(signal: AbortSignal): Promise<string[]>;
}

export interface MotionSubscriptionProvider {
  getClient(cameraId: string): Promise<MotionSubscriptionClient | null>;
}

interface ActiveSubscription {
  client: MotionSubscriptionClient;
  abort: AbortController;
  timer: ReturnType<typeof setTimeout> | null;
  generation: number;
}

/** One cancellable PullPoint subscription and one bounded reconnect timer per camera. */
export class MotionSubscriptionRegistry {
  private readonly active = new Map<string, ActiveSubscription>();
  private readonly starting = new Map<string, { generation: number; promise: Promise<boolean> }>();
  private readonly reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly generations = new Map<string, number>();
  private readonly failures = new Map<string, number>();

  constructor(
    private readonly provider: MotionSubscriptionProvider,
    private readonly onMessages: (cameraId: string, messages: string[]) => Promise<void> = async () => undefined,
    private readonly reconnectDelayMs = 5_000,
    private readonly minimumRenewalMs = 5_000,
  ) {}

  async start(cameraId: string): Promise<boolean> {
    if (this.active.has(cameraId)) return true;
    const generation = this.generations.get(cameraId) ?? 0;
    const pending = this.starting.get(cameraId);
    if (pending?.generation === generation) return pending.promise;
    const timer = this.reconnectTimers.get(cameraId);
    if (timer) clearTimeout(timer);
    this.reconnectTimers.delete(cameraId);
    const attempt = this.startInternal(cameraId, generation);
    this.starting.set(cameraId, { generation, promise: attempt });
    try {
      return await attempt;
    } finally {
      if (this.starting.get(cameraId)?.promise === attempt) this.starting.delete(cameraId);
    }
  }

  private async startInternal(cameraId: string, generation: number): Promise<boolean> {
    let client: MotionSubscriptionClient | null;
    try {
      client = await this.provider.getClient(cameraId);
    } catch {
      this.scheduleReconnect(cameraId, generation);
      return false;
    }
    if (!client || (this.generations.get(cameraId) ?? 0) !== generation) return false;
    const entry: ActiveSubscription = {
      client,
      abort: new AbortController(),
      timer: null,
      generation,
    };
    this.active.set(cameraId, entry);
    try {
      const subscription = await client.subscribe(entry.abort.signal);
      if (!this.isCurrent(cameraId, entry)) {
        await client.unsubscribe().catch(() => undefined);
        return false;
      }
      this.scheduleRenewal(cameraId, entry, subscription.renewAfterMs);
      void this.poll(cameraId, entry);
      return true;
    } catch {
      await this.disconnect(cameraId, entry, true);
      return false;
    }
  }

  private isCurrent(cameraId: string, entry: ActiveSubscription): boolean {
    return this.active.get(cameraId) === entry && !entry.abort.signal.aborted
      && (this.generations.get(cameraId) ?? 0) === entry.generation;
  }

  private async poll(cameraId: string, entry: ActiveSubscription): Promise<void> {
    while (this.isCurrent(cameraId, entry)) {
      try {
        const messages = await entry.client.pull(entry.abort.signal);
        if (!this.isCurrent(cameraId, entry)) return;
        this.failures.delete(cameraId);
        if (messages.length > 0) await this.onMessages(cameraId, messages);
        else await new Promise((done) => setTimeout(done, 50));
      } catch {
        if (this.isCurrent(cameraId, entry)) await this.disconnect(cameraId, entry, true);
        return;
      }
    }
  }

  private scheduleRenewal(cameraId: string, entry: ActiveSubscription, renewAfterMs: number): void {
    if (!this.isCurrent(cameraId, entry)) return;
    entry.timer = setTimeout(() => void this.renew(cameraId, entry), Math.max(this.minimumRenewalMs, renewAfterMs));
    entry.timer.unref?.();
  }

  private async renew(cameraId: string, entry: ActiveSubscription): Promise<void> {
    if (!this.isCurrent(cameraId, entry)) return;
    entry.timer = null;
    try {
      const renewed = await entry.client.renew(entry.abort.signal);
      this.scheduleRenewal(cameraId, entry, renewed.renewAfterMs);
    } catch {
      if (this.isCurrent(cameraId, entry)) await this.disconnect(cameraId, entry, true);
    }
  }

  private scheduleReconnect(cameraId: string, generation: number): void {
    if ((this.generations.get(cameraId) ?? 0) !== generation || this.reconnectTimers.has(cameraId)) return;
    const failures = Math.min(8, (this.failures.get(cameraId) ?? 0) + 1);
    this.failures.set(cameraId, failures);
    const delay = Math.min(5 * 60_000, this.reconnectDelayMs * 2 ** (failures - 1));
    const timer = setTimeout(() => {
      this.reconnectTimers.delete(cameraId);
      if ((this.generations.get(cameraId) ?? 0) === generation) void this.start(cameraId);
    }, delay);
    timer.unref?.();
    this.reconnectTimers.set(cameraId, timer);
  }

  private async disconnect(cameraId: string, entry: ActiveSubscription, reconnect: boolean): Promise<void> {
    if (this.active.get(cameraId) !== entry) return;
    this.active.delete(cameraId);
    if (entry.timer) clearTimeout(entry.timer);
    entry.abort.abort();
    await entry.client.unsubscribe().catch(() => undefined);
    if (reconnect) this.scheduleReconnect(cameraId, entry.generation);
  }

  async stop(cameraId: string): Promise<void> {
    this.generations.set(cameraId, (this.generations.get(cameraId) ?? 0) + 1);
    const timer = this.reconnectTimers.get(cameraId);
    if (timer) clearTimeout(timer);
    this.reconnectTimers.delete(cameraId);
    this.failures.delete(cameraId);
    const entry = this.active.get(cameraId);
    if (entry) await this.disconnect(cameraId, entry, false);
  }

  async stopAll(): Promise<void> {
    await Promise.all([...new Set([...this.active.keys(), ...this.starting.keys(), ...this.reconnectTimers.keys()])]
      .map((cameraId) => this.stop(cameraId)));
  }
}
