import { z } from "zod";

export const CameraChannelSchema = z.object({
  key: z.string().min(1).max(512),
  name: z.string().min(1).max(120),
  rtspUrl: z.string().min(1).max(2048),
  rtspSubUrl: z.string().max(2048).nullable(),
});

export type CameraChannel = z.infer<typeof CameraChannelSchema>;
