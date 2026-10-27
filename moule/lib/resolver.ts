import type { Catalog } from "./catalog";

export interface MiseTool {
  id: string;
  version: string;
  backend?: string;
  plugin?: string;
}

export interface DepTool {
  id: string;
  manager: string;
  package: string;
  version: string;
}

export interface SystemPkg {
  id: string;
  apt: string[];
}

export interface ResolvedToolchain {
  roots: string[];
  /** 层 3：mise 工具（写进 .mise.toml） */
  mise: MiseTool[];
  /** 层 4：项目依赖（只作建议，moule 不装） */
  deps: DepTool[];
  /** 层 1：系统包（apt / Dockerfile） */
  system: SystemPkg[];
  extensions: string[];
  notes: string[];
  warnings: string[];
}

/**
 * 选型 → 完整工具链。
 * selection 可以是 stack id 或 entry id。companion 递归展开，按 kind 分到四层。
 */
export function resolve(selection: string[], cat: Catalog): ResolvedToolchain {
  const roots: string[] = [];
  const excludes = new Set<string>();

  for (const s of selection) {
    const stack = cat.stacks.get(s);
    if (stack) {
      roots.push(...stack.include);
      for (const x of stack.exclude ?? []) excludes.add(x);
    } else {
      roots.push(s);
    }
  }

  const seen = new Set<string>();
  const queue = [...roots];
  const warnings: string[] = [];

  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id) || excludes.has(id)) continue;
    seen.add(id);
    const e = cat.entries.get(id);
    if (!e) {
      warnings.push(`未找到条目: ${id}`);
      continue;
    }
    for (const c of e.companions ?? []) queue.push(c);
  }

  const mise: MiseTool[] = [];
  const deps: DepTool[] = [];
  const system: SystemPkg[] = [];
  const extensions = new Set<string>();
  const notes: string[] = [];

  for (const id of seen) {
    const e = cat.entries.get(id);
    if (!e) continue; // 未知条目已在 warnings 里记录
    if (e.kind === "runtime" || e.kind === "cli") {
      if (e.mise) mise.push({ id, version: e.defaultVersion, backend: e.mise.backend, plugin: e.mise.plugin });
    } else if (e.kind === "dep") {
      if (e.dep) deps.push({ id, manager: e.dep.manager, package: e.dep.package ?? id, version: e.defaultVersion });
    } else if (e.kind === "system") {
      system.push({ id, apt: e.apt ?? [] });
    }
    for (const x of e.extensions ?? []) extensions.add(x);
    if (e.notes) notes.push(`${id}: ${e.notes}`);
  }

  mise.sort((a, b) => a.id.localeCompare(b.id));
  deps.sort((a, b) => a.id.localeCompare(b.id));

  return { roots, mise, deps, system, extensions: [...extensions].sort(), notes, warnings };
}
