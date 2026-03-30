import discoverComponentsDescriptor from "./descriptors/discover_components.json" with { type: "json" };
import downloadComponentDescriptor from "./descriptors/download_component.json" with { type: "json" };
import uploadComponentDescriptor from "./descriptors/upload_component.json" with { type: "json" };

type JsonSchema = Record<string, unknown>;

export type ToolName = "upload_component" | "discover_components" | "download_component";

export type ToolDescriptor = {
  name: ToolName;
  description: string;
  inputSchema: JsonSchema;
};

export const toolDescriptors = [
  uploadComponentDescriptor as ToolDescriptor,
  discoverComponentsDescriptor as ToolDescriptor,
  downloadComponentDescriptor as ToolDescriptor
];

export const apiToolDescriptors = toolDescriptors.map((tool) => ({
  name: tool.name,
  description: tool.description,
  input_schema: tool.inputSchema
}));
