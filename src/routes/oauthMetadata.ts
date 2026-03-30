import type { FastifyInstance } from "fastify";

import { buildAuthorizationServerMetadata, buildProtectedResourceMetadata } from "../auth/oauth.js";

export const registerOAuthMetadataRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get("/.well-known/oauth-protected-resource", async (request, reply) => {
    return reply.send(buildProtectedResourceMetadata(request));
  });

  app.get("/.well-known/oauth-protected-resource/mcp", async (request, reply) => {
    return reply.send(buildProtectedResourceMetadata(request));
  });

  app.get("/.well-known/oauth-authorization-server", async (request, reply) => {
    return reply.send(buildAuthorizationServerMetadata(request));
  });
};
