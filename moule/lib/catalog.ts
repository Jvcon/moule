import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ToolEntry, Stack } from "./schema";

export interface Layer {
  name: string;
  entriesDir: string;
  stacksDir: string;
  /** 越高越优先：project > global > bucket > builtin */
  priority: number;
}

export interface Catalog {
  entries: Map<string, ToolEntry>;
  stacks: Map<string, Stack>;
  errors: string[];
  layers: { name: string; priority: number; entries: number; stacks: number }[];
  overriddenEntries: Set<string>;
  overriddenStacks: Set<string>;
}

/** 数组字段跨层做并集（而非覆盖） */
const ENTRY_ARRAY_FIELDS = ["apt", "extensions", "companions"] as const;
const STACK_ARRAY_FIELDS = ["include", "recommends", "exclude"] as const;

interface LoadedLayer {
  entries: ToolEntry[];
  stacks: Stack[];
  errors: string[];
}

function loadLayer(layer: Layer): LoadedLayer {
  const res: LoadedLayer = { entries: [], stacks: [], errors: [] };

  for (const [dir, kind] of [
    [layer.entriesDir, "entry"],
    [layer.stacksDir, "stack"],
  ] as const) {
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
      } else {
        const r = Stack.safeParse(raw);
        if (r.success) res.stacks.push(r.data);
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

export function loadCatalog(layers: Layer[]): Catalog {
  const sorted = [...layers].sort((a, b) => a.priority - b.priority);
  const entries = new Map<string, ToolEntry>();
  const stacks = new Map<string, Stack>();
  const errors: string[] = [];
  const overriddenEntries = new Set<string>();
  const overriddenStacks = new Set<string>();
  const layerInfo: Catalog["layers"] = [];

  for (const layer of sorted) {
    const loaded = loadLayer(layer);
    errors.push(...loaded.errors);
    layerInfo.push({
      name: layer.name,
      priority: layer.priority,
      entries: loaded.entries.length,
      stacks: loaded.stacks.length,
    });

    for (const e of loaded.entries) {
      if (entries.has(e.id)) overriddenEntries.add(e.id);
      entries.set(e.id, mergeEntry(entries.get(e.id), e));
    }
    for (const s of loaded.stacks) {
      if (stacks.has(s.id)) overriddenStacks.add(s.id);
      stacks.set(s.id, mergeStack(stacks.get(s.id), s));
    }
  }

  return { entries, stacks, errors, layers: layerInfo, overriddenEntries, overriddenStacks };
}
