import {
  enumerateInterfaces,
  resolveInterfaceAddress,
} from "../../workers/discovery/interfaces.js";
import type { DiscoveryTarget } from "../../workers/discovery/ws-discovery.js";

export class DiscoveryService {
  private active: AbortController | null = null;

  listInterfaces() {
    return enumerateInterfaces();
  }

  async start(input: {
    interfaceName: string;
    timeoutMs?: number;
  }): Promise<DiscoveryTarget[]> {
    await this.cancel();
    const controller = new AbortController();
    this.active = controller;

    const address = resolveInterfaceAddress(input.interfaceName);
    if (!address) {
      this.active = null;
      throw new Error(
        `Nenhum endereço elegível para a interface "${input.interfaceName}". Escolha outra interface ou use o cadastro manual.`,
      );
    }

    const { discoverOnInterface } =
      await import("../../workers/discovery/ws-discovery.js");
    const targets = await discoverOnInterface(address, {
      timeoutMs: input.timeoutMs ?? 6_000,
      signal: controller.signal,
    });
    this.active = null;
    return targets;
  }

  async cancel(): Promise<{ cancelled: boolean }> {
    if (this.active) {
      this.active.abort();
      this.active = null;
      return { cancelled: true };
    }
    return { cancelled: false };
  }
}
