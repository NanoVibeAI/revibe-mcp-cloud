import type { FastifyInstance } from "fastify";

import { apiToolDescriptors } from "../tools/catalog.js";
import { executeTool } from "../tools/executor.js";

export const registerApiRoutes = async (app: FastifyInstance): Promise<void> => {
  app.post("/mcp/tools/upload_component", async (request, reply) => {
    const result = await executeTool("upload_component", request.body);
    return reply.send(result);
  });

  app.post("/mcp/tools/discover_components", async (request, reply) => {
    const result = await executeTool("discover_components", request.body);
    return reply.send(result);
  });

  app.post("/mcp/tools/download_component", async (request, reply) => {
    const result = await executeTool("download_component", request.body);
    return reply.send(result);
  });

  app.get("/mcp/tools", async (_request, reply) => {
    return reply.send({
      tools: apiToolDescriptors
    });
  });
};
