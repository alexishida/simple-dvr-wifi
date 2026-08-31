import { z } from 'zod'

export const CAMERA_STATUSES = [
  'disabled',
  'disconnected',
  'connecting',
  'connected',
  'reconnecting',
  'auth_error',
  'network_error',
  'media_error',
  'codec_error',
  'unavailable',
] as const

export const RECORDING_STATUSES = [
  'idle',
  'starting',
  'recording',
  'stopping',
  'completed',
  'interrupted',
  'failed',
] as const

export const CameraStatusSchema = z.enum(CAMERA_STATUSES)
export const RecordingStatusSchema = z.enum(RECORDING_STATUSES)

export const CameraIdSchema = z.string().uuid()
export const CameraNameSchema = z.string().trim().min(1).max(120)
export const HostSchema = z.string().trim().min(1).max(253)
export const PortSchema = z.number().int().min(1).max(65_535)
export const StreamProfileSchema = z.enum(['main', 'sub'])

export const CameraSummarySchema = z
  .object({
    id: CameraIdSchema,
    name: CameraNameSchema,
    host: HostSchema,
    status: CameraStatusSchema,
    recordingStatus: RecordingStatusSchema,
    hasCredential: z.boolean(),
    supportsPtz: z.boolean(),
  })
  .strict()

export const AppErrorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'AUTH_ERROR',
  'NETWORK_ERROR',
  'MEDIA_ERROR',
  'CODEC_ERROR',
  'STORAGE_ERROR',
  'INTERNAL_ERROR',
])

export const AppErrorSchema = z.object({
  code: AppErrorCodeSchema,
  message: z.string().min(1).max(500),
  retryable: z.boolean(),
})

export const ResultSchema = <T extends z.ZodType>(value: T) =>
  z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), value }),
    z.object({ ok: z.literal(false), error: AppErrorSchema }),
  ])

export type CameraStatus = z.infer<typeof CameraStatusSchema>
export type RecordingStatus = z.infer<typeof RecordingStatusSchema>
export type CameraSummary = z.infer<typeof CameraSummarySchema>
export type AppError = z.infer<typeof AppErrorSchema>
export type Result<T> = { ok: true; value: T } | { ok: false; error: AppError }

export function success<T>(value: T): Result<T> {
  return { ok: true, value }
}

export function failure(code: AppError['code'], message: string, retryable = false): Result<never> {
  return { ok: false, error: { code, message, retryable } }
}
