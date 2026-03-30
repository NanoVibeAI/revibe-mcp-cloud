import { z } from "zod";

export const downloadComponentRequestSchema = z.object({
  component_id: z.string().min(1),
  version: z.string().optional()
});

export const downloadBundleResponseSchema = z.object({
  component_id: z.string(),
  version: z.string(),
  files: z.record(z.string()),
  context_md: z.string(),
  dependency_manifest: z.record(z.any()).nullable(),
  checksums: z.record(z.string()),
  download_expires_in: z.number().int()
});

export type DownloadComponentRequest = z.infer<typeof downloadComponentRequestSchema>;
export type DownloadBundleResponse = z.infer<typeof downloadBundleResponseSchema>;
