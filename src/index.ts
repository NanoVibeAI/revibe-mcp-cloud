import Fastify from "fastify";
import cors from "@fastify/cors";

import { config } from "./config.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerApiRoutes } from "./routes/api.js";
import { registerMcpRoutes } from "./routes/mcp.js";
import { registerOAuthMetadataRoutes } from "./routes/oauthMetadata.js";

const buildServer = async () => {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: true,
    credentials: true
  });

  await registerHealthRoutes(app);
  await registerApiRoutes(app);
  await registerOAuthMetadataRoutes(app);
  await registerMcpRoutes(app);

  return app;
};

const start = async () => {
  const app = await buildServer();

  try {
    await app.listen({
      host: "0.0.0.0",
      port: config.PORT
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

start();
