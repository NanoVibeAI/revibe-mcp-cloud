import type { DownloadBundleResponse, DownloadComponentRequest } from "../schemas/download.js";

export class DownloadService {
  async downloadComponentBundle(request: DownloadComponentRequest): Promise<DownloadBundleResponse> {
    return {
      component_id: request.component_id,
      version: request.version ?? "1.0.0",
      files: {},
      context_md: "",
      dependency_manifest: null,
      checksums: {},
      download_expires_in: 3600
    };
  }
}
