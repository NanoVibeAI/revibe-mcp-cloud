import crypto from "node:crypto";
import path from "node:path";

import { lookup as lookupMimeType } from "mime-types";

import { isInvalidSchemaError, schemaTable } from "../db/supabase.js";
import {
  type ComponentSourceBundle,
  type ReviewArtifactSpec,
  type SourceFile,
  type UploadComponentRequest
} from "../schemas/component.js";
import { getStorageProvider } from "../storage/factory.js";

const SOURCE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs", ".css", ".scss", ".json", ".md"];

export class ComponentUploadService {
  private readonly tableName = "components";

  async uploadComponent(request: UploadComponentRequest): Promise<ReviewArtifactSpec> {
    const normalized = this.validateAndNormalizeBundle(request.source);
    const componentId = this.buildComponentId(request.component_intent, request.target_framework);
    const sourceManifest = this.buildSourceManifest(normalized);

    const reviewArtifact = this.buildReviewArtifact(componentId, request);
    const storagePrefix = `components/${componentId}`;

    await this.writeArtifacts(storagePrefix, request, normalized, sourceManifest, reviewArtifact);
    await this.upsertComponentRecord(componentId, storagePrefix, request, sourceManifest, reviewArtifact);

    return reviewArtifact;
  }

  async getComponentMetadata(componentId: string): Promise<Record<string, unknown> | null> {
    const { data, error } = await schemaTable(this.tableName).select("*").eq("id", componentId).single();

    if (error) {
      return null;
    }
    return data as Record<string, unknown>;
  }

  async listComponents(limit = 10): Promise<Array<Record<string, unknown>>> {
    const { data, error } = await schemaTable(this.tableName)
      .select("id, component_intent, target_framework, entrypoint, source_file_count, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data) {
      return [];
    }

    return data as Array<Record<string, unknown>>;
  }

  private buildComponentId(intent: string, framework: string): string {
    const digest = crypto.createHash("sha1").update(`${framework}:${intent}`).digest("hex").slice(0, 10);
    const entropy = crypto.randomUUID().replaceAll("-", "").slice(0, 8);
    return `cmp_${framework.toLowerCase()}_${digest}_${entropy}`;
  }

  private buildReviewArtifact(componentId: string, request: UploadComponentRequest): ReviewArtifactSpec {
    const riskFlags = [
      request.component_intent.toLowerCase().includes("complex") ? "Component complexity: high" : null,
      request.style_system ? "Custom styling required" : null,
      Object.keys(request.source.dependencies).length > 3 ? "Multiple external dependencies" : null
    ].filter((value): value is string => Boolean(value));

    return {
      component_id: componentId,
      checklist: [
        "Component renders without errors",
        "All props are properly typed",
        "Accessibility attributes present (aria-label, role, etc)",
        "Responsive design tested",
        "Dark mode support verified",
        "Component story added to Storybook"
      ],
      acceptance_criteria: [
        "Component passes unit tests (>80% coverage)",
        "No console errors or warnings in development",
        `Compatible with ${request.target_framework}`,
        "Matches design system tokens",
        "No performance regressions (Lighthouse >90)"
      ],
      compatibility_notes: `Built for ${request.target_framework}. Style system: ${request.style_system ?? "CSS"}. Constraints: ${request.constraints ?? "None specified"}`,
      risk_flags: riskFlags,
      recommended_next_steps: [
        "1. Create component file with TypeScript types",
        "2. Write unit tests for all props",
        "3. Add component story to Storybook",
        "4. Get design review from team",
        "5. Optimize bundle size"
      ]
    };
  }

  private validateAndNormalizeBundle(bundle: ComponentSourceBundle): ComponentSourceBundle {
    const files = this.normalizeSourceFiles(bundle.files);
    const entrypoint = this.normalizeRelativePath(bundle.entrypoint);
    const fileSet = new Set(files.map((file) => file.path));

    if (!fileSet.has(entrypoint)) {
      throw new Error(`Entrypoint '${entrypoint}' is missing from source.files`);
    }

    this.validateImports(bundle, files, fileSet);

    return {
      ...bundle,
      entrypoint,
      files
    };
  }

  private normalizeSourceFiles(files: SourceFile[]): SourceFile[] {
    const seen = new Set<string>();
    return files.map((file) => {
      const normalized = this.normalizeRelativePath(file.path);
      if (seen.has(normalized)) {
        throw new Error(`Duplicate file path in bundle: ${normalized}`);
      }
      seen.add(normalized);
      return { ...file, path: normalized };
    });
  }

  private normalizeRelativePath(rawPath: string): string {
    const normalized = path.posix.normalize(rawPath.replaceAll("\\", "/").trim());
    if (!normalized || normalized === "." || normalized.startsWith("../") || normalized.startsWith("/")) {
      throw new Error(`Invalid source file path: ${rawPath}`);
    }
    return normalized;
  }

  private validateImports(bundle: ComponentSourceBundle, files: SourceFile[], fileSet: Set<string>): void {
    const allowedExternal = new Set<string>([
      ...Object.keys(bundle.dependencies),
      ...Object.keys(bundle.peer_dependencies),
      ...Object.keys(bundle.dev_dependencies)
    ]);

    const unresolvedRelative: string[] = [];
    const undeclaredExternal: string[] = [];

    for (const file of files) {
      const imports = this.extractImportTargets(file.content);
      for (const target of imports) {
        if (target.startsWith(".")) {
          const resolved = this.resolveRelativeImport(file.path, target, fileSet);
          if (!resolved) {
            unresolvedRelative.push(`${file.path} -> ${target}`);
          }
          continue;
        }

        const packageName = this.normalizePackageName(target);
        if (packageName && !allowedExternal.has(packageName)) {
          undeclaredExternal.push(`${file.path} -> ${target}`);
        }
      }
    }

    if (unresolvedRelative.length > 0) {
      throw new Error(`Bundle has unresolved relative imports: ${unresolvedRelative.slice(0, 10).join("; ")}`);
    }

    if (undeclaredExternal.length > 0) {
      throw new Error(
        `Bundle imports undeclared external dependencies: ${undeclaredExternal.slice(0, 10).join("; ")}`
      );
    }
  }

  private extractImportTargets(content: string): Set<string> {
    const patterns = [
      /import\s+[^'\"]*?from\s+['\"]([^'\"]+)['\"]/g,
      /import\s+['\"]([^'\"]+)['\"]/g,
      /require\(\s*['\"]([^'\"]+)['\"]\s*\)/g,
      /import\(\s*['\"]([^'\"]+)['\"]\s*\)/g
    ];

    const imports = new Set<string>();
    for (const pattern of patterns) {
      for (const match of content.matchAll(pattern)) {
        imports.add(match[1]);
      }
    }
    return imports;
  }

  private resolveRelativeImport(currentFile: string, importTarget: string, fileSet: Set<string>): boolean {
    const parent = path.posix.dirname(currentFile);
    const baseCandidate = path.posix.normalize(path.posix.join(parent, importTarget));

    const candidates = new Set<string>([baseCandidate]);
    if (!SOURCE_EXTENSIONS.some((ext) => baseCandidate.endsWith(ext))) {
      for (const ext of SOURCE_EXTENSIONS) {
        candidates.add(`${baseCandidate}${ext}`);
        candidates.add(`${baseCandidate}/index${ext}`);
      }
    }

    for (const candidate of candidates) {
      if (fileSet.has(candidate)) {
        return true;
      }
    }

    return false;
  }

  private normalizePackageName(importTarget: string): string {
    if (!importTarget || importTarget.startsWith(".")) {
      return "";
    }

    if (importTarget.startsWith("@")) {
      const parts = importTarget.split("/");
      if (parts.length >= 2) {
        return `${parts[0]}/${parts[1]}`;
      }
      return importTarget;
    }

    return importTarget.split("/")[0] ?? "";
  }

  private buildSourceManifest(bundle: ComponentSourceBundle): Record<string, unknown> {
    const fileChecksums: Record<string, string> = {};

    for (const file of bundle.files) {
      fileChecksums[file.path] = crypto.createHash("sha256").update(file.content).digest("hex");
    }

    const bundleChecksum = crypto
      .createHash("sha256")
      .update(JSON.stringify(fileChecksums, Object.keys(fileChecksums).sort()))
      .digest("hex");

    return {
      entrypoint: bundle.entrypoint,
      file_count: bundle.files.length,
      file_checksums: fileChecksums,
      bundle_checksum: bundleChecksum
    };
  }

  private async writeArtifacts(
    storagePrefix: string,
    request: UploadComponentRequest,
    bundle: ComponentSourceBundle,
    sourceManifest: Record<string, unknown>,
    reviewArtifact: ReviewArtifactSpec
  ): Promise<void> {
    const storage = getStorageProvider();

    await storage.upload({
      filePath: `${storagePrefix}/request.json`,
      content: Buffer.from(
        JSON.stringify(
          {
            component_intent: request.component_intent,
            target_framework: request.target_framework,
            constraints: request.constraints,
            style_system: request.style_system,
            source: bundle,
            metadata: request.metadata ?? {},
            created_at: new Date().toISOString()
          },
          null,
          2
        ),
        "utf-8"
      ),
      contentType: "application/json"
    });

    await storage.upload({
      filePath: `${storagePrefix}/review_artifact.json`,
      content: Buffer.from(JSON.stringify(reviewArtifact, null, 2), "utf-8"),
      contentType: "application/json"
    });

    await storage.upload({
      filePath: `${storagePrefix}/source_manifest.json`,
      content: Buffer.from(JSON.stringify(sourceManifest, null, 2), "utf-8"),
      contentType: "application/json"
    });

    for (const file of bundle.files) {
      await storage.upload({
        filePath: `${storagePrefix}/files/${file.path}`,
        content: Buffer.from(file.content, "utf-8"),
        contentType: lookupMimeType(file.path) || "text/plain"
      });
    }

    const contextMd = this.buildContextMarkdown(request, bundle, reviewArtifact);
    await storage.upload({
      filePath: `${storagePrefix}/context.md`,
      content: Buffer.from(contextMd, "utf-8"),
      contentType: "text/markdown"
    });
  }

  private buildContextMarkdown(
    request: UploadComponentRequest,
    bundle: ComponentSourceBundle,
    reviewArtifact: ReviewArtifactSpec
  ): string {
    const deps = Object.entries(bundle.dependencies)
      .map(([name, version]) => `- ${name}: ${version}`)
      .join("\n");

    return [
      `# ${reviewArtifact.component_id}`,
      "",
      "## Intent",
      request.component_intent,
      "",
      "## Framework",
      request.target_framework,
      "",
      "## Style System",
      request.style_system ?? "Not specified",
      "",
      "## Constraints",
      request.constraints ?? "None",
      "",
      "## Entrypoint",
      bundle.entrypoint,
      "",
      "## Source Files",
      `${bundle.files.length} files`,
      "",
      "## Dependencies",
      deps || "- None",
      "",
      "## Review Checklist",
      ...reviewArtifact.checklist.map((item) => `- ${item}`),
      "",
      "## Acceptance Criteria",
      ...reviewArtifact.acceptance_criteria.map((item) => `- ${item}`),
      ""
    ].join("\n");
  }

  private async upsertComponentRecord(
    componentId: string,
    storagePrefix: string,
    request: UploadComponentRequest,
    sourceManifest: Record<string, unknown>,
    reviewArtifact: ReviewArtifactSpec
  ): Promise<void> {
    const payload = {
      id: componentId,
      component_intent: request.component_intent,
      target_framework: request.target_framework,
      constraints: request.constraints ?? null,
      style_system: request.style_system ?? null,
      assets: [],
      metadata: request.metadata ?? {},
      review_artifact: reviewArtifact,
      storage_prefix: storagePrefix,
      entrypoint: request.source.entrypoint,
      source_manifest: sourceManifest,
      dependency_manifest: {
        dependencies: request.source.dependencies,
        peer_dependencies: request.source.peer_dependencies,
        dev_dependencies: request.source.dev_dependencies
      },
      source_file_count: request.source.files.length
    };

    const { error } = await schemaTable(this.tableName).upsert(payload);

    if (error) {
      if (isInvalidSchemaError(error)) {
        throw new Error(
          `Failed to upsert component metadata: ${error.message}. Ensure schema '${process.env.SUPABASE_DB_SCHEMA ?? "apps_revibe"}' is added to Supabase API Exposed schemas and authenticator.pgrst.db_schemas is reset or includes it.`
        );
      }

      throw new Error(`Failed to upsert component metadata: ${error.message}`);
    }
  }
}
