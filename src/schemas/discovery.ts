import { z } from "zod";

export const discoveryRequestSchema = z.object({
  intent: z.string().min(1),
  framework: z.string().optional(),
  tags: z.array(z.string()).optional(),
  status: z.string().optional(),
  complexity: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(10)
});

export const discoveryCardSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  rating: z.number().min(0).max(5),
  tags: z.array(z.string()),
  score: z.number().min(0).max(1),
  preview_url: z.string(),
  component_page_url: z.string(),
  default_selected: z.boolean()
});

export const discoveryResponseSchema = z.object({
  query: z.string(),
  results: z.array(discoveryCardSchema),
  total_count: z.number().int(),
  default_selected_id: z.string().nullable()
});

export type DiscoveryRequest = z.infer<typeof discoveryRequestSchema>;
export type DiscoveryResponse = z.infer<typeof discoveryResponseSchema>;
