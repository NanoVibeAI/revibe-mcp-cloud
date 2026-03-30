import type { FastifyInstance } from "fastify";

export const registerHealthRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get("/health", async () => ({ status: "healthy" }));
};
