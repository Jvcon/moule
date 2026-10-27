import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ToolEntry, Stack, FrameworkEntry } from "./schema";

export interface Layer {
  name: string;
  entriesDir: string;
  stacksDir: string;
  frameworksDir: string;
  /** 越高越优先：project > global > bucket > builtin */
  priority: number;
}

export interface Catalog {
  entries: Map<string, ToolEntry>;
  stacks: Map<string, Stack>;
  frameworks: Map<string, FrameworkEntry>;
  errors: string[];
  layers: { name: string; priority: number; entries: number; stacks: number; frameworks: number }[];
  overriddenEntries: Set<string>;
  overriddenStacks: Set<string>;
  overriddenFrameworks: Set<string>;
}

const ENTRY_ARRAY_FIELDS = ["apt", "extensions", "companions"] as const;
const STACK_ARRAY_FIELDS = ["include", "recommends", "exclude"] as const;
const FRAMEWORK_ARRAY_FIELDS = ["requires", "excludes", "extensions"] as const;

interface LoadedLayer {
  entries: ToolEntry[];
  stacks: Stack[];
  frameworks: FrameworkEntry[];
  errors: string[];
}

function loadLayer(layer: Layer): LoadedLayer {
  const res: LoadedLayer = { entries: [], stacks: [], frameworks: [], errors: [] };
  const specs = [
    [layer.entriesDir, "entry"],
    [layer.stacksDir, "stack"],
    [layer.frameworksDir, "framework"],
  ] as const;

  for (const [dir, kind] of specs) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".json")) continue;
      const p = join(dir, f);
      let raw: unknown;
      try {
        raw = JSON.parse(readFileSync(p, "utf8"));
      } catch {
        res.errors.push(`${layer.name}/${f}: JSON 解析失败`);
        continue;
      }
      if (kind === "entry") {
        const r = ToolEntry.safeParse(raw);
        if (r.success) res.entries.push(r.data);
        else res.errors.push(`${layer.name}/${f}: ${r.error.issues.map((i) => i.message).join("; ")}`);
      } else if (kind === "stack") {
        const r = Stack.safeParse(raw);
        if (r.success) res.stacks.push(r.data);
        else res.errors.push(`${layer.name}/${f}: ${r.error.issues.map((i) => i.message).join("; ")}`);
      } else {
        const r = FrameworkEntry.safeParse(raw);
        if (r.success) res.frameworks.push(r.data);
        else res.errors.push(`${layer.name}/${f}: ${r.error.issues.map((i) => i.message).join("; ")}`);
      }
    }
  }
  return res;
}

function union(a: string[] | undefined, b: string[] | undefined): string[] {
  return [...new Set([...(a ?? []), ...(b ?? [])])];
}

function mergeEntry(base: ToolEntry | undefined, overlay: ToolEntry): ToolEntry {
  if (!base) return { ...overlay };
  const merged: ToolEntry = { ...base, ...overlay };
  for (const f of ENTRY_ARRAY_FIELDS) merged[f] = union(base[f], overlay[f]);
  return merged;
}

function mergeStack(base: Stack | undefined, overlay: Stack): Stack {
  if (!base) return { ...overlay };
  const merged: Stack = { ...base, ...overlay };
  for (const f of STACK_ARRAY_FIELDS) merged[f] = union(base[f], overlay[f]);
  return merged;
}

function mergeFramework(base: FrameworkEntry | undefined, overlay: FrameworkEntry): FrameworkEntry {
  if (!base) return { ...overlay };
  const merged: FrameworkEntry = { ...base, ...overlay };
  for (const f of FRAMEWORK_ARRAY_FIELDS) merged[f] = union(base[f], overlay[f]);
  return merged;
}

export function loadCatalog(layers: Layer[]): Catalog {
  const sorted = [...layers].sort((a, b) => a.priority - b.priority);
  const entries = new Map<string, ToolEntry>();
  const stacks = new Map<string, Stack>();
  const frameworks = new Map<string, FrameworkEntry>();
  const errors: string[] = [];
  const overriddenEntries = new Set<string>();
  const overriddenStacks = new Set<string>();
  const overriddenFrameworks = new Set<string>();
  const layerInfo: Catalog["layers"] = [];

  for (const layer of sorted) {
    const loaded = loadLayer(layer);
    errors.push(...loaded.errors);
    layerInfo.push({
      name: layer.name,
      priority: layer.priority,
      entries: loaded.entries.length,
      stacks: loaded.stacks.length,
      frameworks: loaded.frameworks.length,
    });

    for (const e of loaded.entries) {
      if (entries.has(e.id)) overriddenEntries.add(e.id);
      entries.set(e.id, mergeEntry(entries.get(e.id), e));
    }
    for (const s of loaded.stacks) {
      if (stacks.has(s.id)) overriddenStacks.add(s.id);
      stacks.set(s.id, mergeStack(stacks.get(s.id), s));
    }
    for (const fw of loaded.frameworks) {
      if (frameworks.has(fw.id)) overriddenFrameworks.add(fw.id);
      frameworks.set(fw.id, mergeFramework(frameworks.get(fw.id), fw));
    }
  }

  return {
    entries,
    stacks,
    frameworks,
    errors,
    layers: layerInfo,
    overriddenEntries,
    overriddenStacks,
    overriddenFrameworks,
  };
}
