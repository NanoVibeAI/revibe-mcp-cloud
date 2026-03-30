import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { config } from "../config.js";
import { type ToolName, toolDescriptors } from "../tools/catalog.js";
import { executeTool } from "../tools/executor.js";

const PROTOCOL_VERSION = "2024-11-05";

const jsonRpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string(),
  params: z.unknown().optional()
});

type JsonRpcRequest = z.infer<typeof jsonRpcRequestSchema>;

type JsonRpcSuccess = {
  jsonrpc: "2.0";
  id: string | number | null;
  result: unknown;
};

type JsonRpcError = {
  jsonrpc: "2.0";
  id: string | number | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
};

const success = (id: string | number | null, result: unknown): JsonRpcSuccess => ({
  jsonrpc: "2.0",
  id,
  result
});

const error = (
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): JsonRpcError => ({
  jsonrpc: "2.0",
  id,
  error: {
    code,
    message,
    ...(data !== undefined ? { data } : {})
  }
});

const isToolName = (value: string): value is ToolName => toolDescriptors.some((tool) => tool.name === value);

const callTool = async (name: string, args: unknown): Promise<unknown> => {
  if (!isToolName(name)) {
    throw new Error(`Unknown tool: ${name}`);
  }

  return executeTool(name, args);
};

const handleRequest = async (request: JsonRpcRequest): Promise<JsonRpcSuccess | JsonRpcError | null> => {
  const id = request.id ?? null;

  if (request.method === "notifications/initialized") {
    return null;
  }

  if (request.method === "initialize") {
    return success(id, {
      protocolVersion: PROTOCOL_VERSION,
      serverInfo: {
        name: config.MCP_SERVER_NAME,
        version: config.MCP_SERVER_VERSION
      },
      capabilities: {
        tools: {}
      }
    });
  }

  if (request.method === "ping") {
    return success(id, {});
  }

  if (request.method === "tools/list") {
    return success(id, { tools: toolDescriptors });
  }

  if (request.method === "tools/call") {
    const params = (request.params ?? {}) as { name?: string; arguments?: unknown };
    const toolName = params.name;

    if (!toolName) {
      return error(id, -32602, "Invalid params: tools/call requires 'name'");
    }

    try {
      const result = await callTool(toolName, params.arguments ?? {});
      return success(id, {
        content: [
          {
            type: "text",
            text: JSON.stringify(result)
          }
        ],
        structuredContent: result
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Tool call failed";
      return error(id, -32000, message);
    }
  }

  return error(id, -32601, `Method not found: ${request.method}`);
};

export const registerMcpRoutes = async (app: FastifyInstance): Promise<void> => {
  app.post("/mcp", async (request, reply) => {
    const payload = request.body;

    if (Array.isArray(payload)) {
      const results: Array<JsonRpcSuccess | JsonRpcError> = [];

      for (const item of payload) {
        const parsed = jsonRpcRequestSchema.safeParse(item);
        if (!parsed.success) {
          results.push(error(null, -32600, "Invalid Request", parsed.error.flatten()));
          continue;
        }

        const handled = await handleRequest(parsed.data);
        if (handled) {
          results.push(handled);
        }
      }

      if (results.length === 0) {
        return reply.status(204).send();
      }

      return reply.send(results);
    }

    const parsed = jsonRpcRequestSchema.safeParse(payload);
    if (!parsed.success) {
      return reply.status(400).send(error(null, -32600, "Invalid Request", parsed.error.flatten()));
    }

    const handled = await handleRequest(parsed.data);
    if (!handled) {
      return reply.status(204).send();
    }

    return reply.send(handled);
  });
};
