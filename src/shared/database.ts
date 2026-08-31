import { z } from 'zod'
import { CameraIdSchema, CameraStatusSchema, RecordingStatusSchema } from './contracts.js'

export const DbRequestIdSchema = z.string().min(1).max(64)
export const ServiceNameSchema = z.enum(['onvif', 'rtsp', 'snapshot', 'ptz'])

export const EncryptedCredentialSchema = z.object({
  keyVersion: z.number().int().positive(),
  ciphertext: z.string().min(1).max(8192),
  nonce: z.string().min(1).max(128),
  tag: z.string().min(1).max(128),
})

export type EncryptedCredential = z.infer<typeof EncryptedCredentialSchema>

export const DbRequestSchema = z.object({
  id: DbRequestIdSchema,
  op: z.string().min(1).max(64),
  payload: z.unknown(),
})

export type DbRequest = z.infer<typeof DbRequestSchema>

export const DbResponseSchema = z.discriminatedUnion('ok', [
  z.object({ id: DbRequestIdSchema, ok: z.literal(true), value: z.unknown() }),
  z.object({
    id: DbRequestIdSchema,
    ok: z.literal(false),
    error: z.object({
      code: z.enum([
        'VALIDATION_ERROR',
        'NOT_FOUND',
        'AUTH_ERROR',
        'NETWORK_ERROR',
        'MEDIA_ERROR',
        'CODEC_ERROR',
        'STORAGE_ERROR',
        'INTERNAL_ERROR',
      ]),
      message: z.string().min(1).max(500),
      retryable: z.boolean(),
    }),
  }),
])

export type DbResponse = z.infer<typeof DbResponseSchema>

export const CameraEndpointSchema = z.object({
  service: ServiceNameSchema,
  url: z.string().min(1).max(2048),
})

export type CameraEndpoint = z.infer<typeof CameraEndpointSchema>

export const CameraRecordSchema = z.object({
  id: CameraIdSchema,
  name: z.string().trim().min(1).max(120),
  host: z.string().trim().min(1).max(253),
  port: z.number().int().min(1).max(65_535).nullable(),
  manufacturer: z.string().max(120).nullable(),
  model: z.string().max(120).nullable(),
  serialNumber: z.string().max(120).nullable(),
  epr: z.string().max(2048).nullable(),
  status: CameraStatusSchema,
  recordingStatus: RecordingStatusSchema,
  supportsPtz: z.boolean(),
  active: z.boolean(),
  endpoints: z.array(CameraEndpointSchema),
})

export type CameraRecord = z.infer<typeof CameraRecordSchema>

export const CameraProfileSchema = z.object({
  id: z.string().uuid(),
  cameraId: CameraIdSchema,
  token: z.string().max(512),
  name: z.string().max(120).nullable(),
  streamType: z.enum(['main', 'sub']),
  codec: z.string().max(32).nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  fps: z.number().positive().nullable(),
  active: z.boolean(),
})

export type CameraProfile = z.infer<typeof CameraProfileSchema>

export const RecordingRecordSchema = z.object({
  id: z.string().uuid(),
  cameraId: CameraIdSchema,
  status: RecordingStatusSchema,
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  durationMs: z.number().nonnegative().nullable(),
})

export type RecordingRecord = z.infer<typeof RecordingRecordSchema>

export const SnapshotRecordSchema = z.object({
  id: z.string().uuid(),
  cameraId: CameraIdSchema,
  path: z.string().min(1).max(2048),
  capturedAt: z.string(),
})

export type SnapshotRecord = z.infer<typeof SnapshotRecordSchema>

export const DiagnosticRecordSchema = z.object({
  id: z.number().int().positive(),
  cameraId: CameraIdSchema.nullable(),
  code: z.string().min(1).max(64),
  message: z.string().max(500),
  count: z.number().int().positive(),
  firstSeen: z.string(),
  lastSeen: z.string(),
})

export type DiagnosticRecord = z.infer<typeof DiagnosticRecordSchema>
