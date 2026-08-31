import { z } from 'zod'

export const ThemeSchema = z.enum(['dark', 'light', 'system'])
export type Theme = z.infer<typeof ThemeSchema>

export const LogLevelSchema = z.enum(['error', 'warn', 'info', 'debug'])
export type LogLevel = z.infer<typeof LogLevelSchema>

export const StreamBehaviorSchema = z.enum(['sub-first', 'main-only', 'balanced'])
export type StreamBehavior = z.infer<typeof StreamBehaviorSchema>

export const AppConfigSchema = z.object({
  theme: ThemeSchema,
  snapshotDir: z.string().max(2048),
  recordingsDir: z.string().max(2048),
  reconnect: z.object({
    initialDelayMs: z.number().int().min(500).max(60_000),
    maxDelayMs: z.number().int().min(1_000).max(300_000),
    maxAttempts: z.number().int().min(0).max(100),
  }),
  streams: z.object({
    behavior: StreamBehaviorSchema,
    maxTranscodes: z.number().int().min(0).max(16),
    enableHardwareAcceleration: z.boolean(),
  }),
  log: z.object({
    level: LogLevelSchema,
    maxBytes: z
      .number()
      .int()
      .min(64 * 1024)
      .max(64 * 1024 * 1024),
    maxFiles: z.number().int().min(1).max(50),
  }),
})

export type AppConfig = z.infer<typeof AppConfigSchema>

export const CONFIG_DEFAULTS: AppConfig = {
  theme: 'dark',
  snapshotDir: '',
  recordingsDir: '',
  reconnect: {
    initialDelayMs: 1_000,
    maxDelayMs: 60_000,
    maxAttempts: 10,
  },
  streams: {
    behavior: 'sub-first',
    maxTranscodes: 2,
    enableHardwareAcceleration: false,
  },
  log: {
    level: 'info',
    maxBytes: 4 * 1024 * 1024,
    maxFiles: 5,
  },
}

export function parseConfig(raw: string): AppConfig {
  try {
    const parsed = AppConfigSchema.safeParse(JSON.parse(raw))
    if (parsed.success) return parsed.data
  } catch {
    // ignore malformed stored config
  }
  return { ...CONFIG_DEFAULTS }
}

export function serializeConfig(config: AppConfig): string {
  return JSON.stringify(AppConfigSchema.parse(config))
}
