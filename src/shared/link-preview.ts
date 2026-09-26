import { z } from "zod";
import { iconReferenceSchema } from "./config";

export const linkPreviewRequestSchema = z.object({
  url: z.string().url().max(2048),
  allowLocalNetwork: z.boolean().default(false)
});

export const linkPreviewSchema = z.object({
  url: z.string().url(),
  title: z.string().max(120),
  description: z.string().max(240).optional(),
  icon: iconReferenceSchema.optional(),
  warning: z.string().optional()
});

export type LinkPreview = z.infer<typeof linkPreviewSchema>;
