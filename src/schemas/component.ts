import { z } from "zod";

export const sourceFileSchema = z.object({
  path: z.string().min(1),
  content: z.string()
});

export const componentSourceBundleSchema = z.object({
  type: z.literal("bundle"),
  entrypoint: z.string().min(1),
  files: z.array(sourceFileSchema).min(1),
  dependencies: z.record(z.string()).default({}),
  peer_dependencies: z.record(z.string()).default({}),
  dev_dependencies: z.record(z.string()).default({})
});

export const uploadComponentRequestSchema = z.object({
  component_intent: z.string().min(1),
  target_framework: z.string().min(1),
  constraints: z.string().optional(),
  style_system: z.string().optional(),
  source: componentSourceBundleSchema,
  metadata: z.record(z.any()).optional()
});

export const reviewArtifactSpecSchema = z.object({
  component_id: z.string(),
  checklist: z.array(z.string()),
  acceptance_criteria: z.array(z.string()),
  compatibility_notes: z.string(),
  risk_flags: z.array(z.string()),
  recommended_next_steps: z.array(z.string())
});

export const uploadComponentResponseSchema = z.object({
  success: z.boolean(),
  component_id: z.string(),
  review_artifact: reviewArtifactSpecSchema
});

export type SourceFile = z.infer<typeof sourceFileSchema>;
export type ComponentSourceBundle = z.infer<typeof componentSourceBundleSchema>;
export type UploadComponentRequest = z.infer<typeof uploadComponentRequestSchema>;
export type ReviewArtifactSpec = z.infer<typeof reviewArtifactSpecSchema>;
export type UploadComponentResponse = z.infer<typeof uploadComponentResponseSchema>;
