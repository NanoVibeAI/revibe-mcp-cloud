import type { DiscoveryRequest, DiscoveryResponse } from "../schemas/discovery.js";

export class DiscoveryService {
  async discoverComponents(request: DiscoveryRequest): Promise<DiscoveryResponse> {
    return {
      query: request.intent,
      results: [],
      total_count: 0,
      default_selected_id: null
    };
  }
}
