import { z } from "zod";

const CameraIdSchema = z.string().uuid();

export const DashboardGroupSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  cameraIds: z.array(CameraIdSchema).max(64),
}).strict();

export const DashboardLayoutSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  slots: z.array(CameraIdSchema.nullable()).max(16),
  groupId: z.string().uuid().nullable(),
}).strict();

export const DashboardLayoutConfigSchema = z.object({
  groups: z.array(DashboardGroupSchema).max(32).default([]),
  layouts: z.array(DashboardLayoutSchema).max(32).default([]),
  selectedLayoutId: z.string().uuid().nullable().default(null),
}).default({ groups: [], layouts: [], selectedLayoutId: null });

export type DashboardGroup = z.infer<typeof DashboardGroupSchema>;
export type DashboardLayout = z.infer<typeof DashboardLayoutSchema>;
export type DashboardLayoutConfig = z.infer<typeof DashboardLayoutConfigSchema>;
