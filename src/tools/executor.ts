import { z } from "zod";

import { uploadComponentResponseSchema, uploadComponentRequestSchema } from "../schemas/component.js";
import { discoveryRequestSchema } from "../schemas/discovery.js";
import { downloadComponentRequestSchema } from "../schemas/download.js";
import { ComponentUploadService } from "../services/uploadService.js";
import { DiscoveryService } from "../services/discoveryService.js";
import { DownloadService } from "../services/downloadService.js";
import type { ToolName } from "./catalog.js";

const componentService = new ComponentUploadService();
const discoveryService = new DiscoveryService();
const downloadService = new DownloadService();

const parseWithSchema = <S extends z.ZodTypeAny>(schema: S, payload: unknown): z.infer<S> => {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(parsed.error.message);
  }
  return parsed.data;
};

const toolValidators = {
  upload_component: uploadComponentRequestSchema,
  discover_components: discoveryRequestSchema,
  download_component: downloadComponentRequestSchema
};

type ToolInputByName = {
  [K in keyof typeof toolValidators]: z.infer<(typeof toolValidators)[K]>;
};

export const validateToolInput = <T extends ToolName>(name: T, payload: unknown): ToolInputByName[T] =>
  parseWithSchema(toolValidators[name], payload);

export const executeTool = async (name: ToolName, payload: unknown): Promise<unknown> => {
  if (name === "upload_component") {
    const input = validateToolInput(name, payload);
    const reviewArtifact = await componentService.uploadComponent(input);
    return uploadComponentResponseSchema.parse({
      success: true,
      component_id: reviewArtifact.component_id,
      review_artifact: reviewArtifact
    });
  }

  if (name === "discover_components") {
    const input = validateToolInput(name, payload);
    return discoveryService.discoverComponents(input);
  }

  const input = validateToolInput("download_component", payload);
  return downloadService.downloadComponentBundle(input);
};
