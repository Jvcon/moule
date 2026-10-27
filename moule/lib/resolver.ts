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

/** 可由用户所选 base/pm 覆盖的 JS 包管理器。 */
const JS_MANAGERS = new Set(["bun", "pnpm", "npm", "yarn"]);

export interface ResolveOptions {
  /** 用户选择的 JS 包管理器；优先于 entry 里声明的 dep.manager。 */
  pm?: string;
}

/**
 * 未显式传 pm 时，从选型里的工具推断（plan/apply 会走这里）。
 * bun / pnpm 是显式工具；只有 node 时用 node 自带的 npm。
 */
function inferJsManager(seen: Set<string>): string | undefined {
  if (seen.has("bun")) return "bun";
  if (seen.has("pnpm")) return "pnpm";
  if (seen.has("node")) return "npm";
  return undefined;
}

/**
 * 选型 → 完整工具链。
 * selection 可以是 stack id 或 entry id。companion 递归展开，按 kind 分到四层。
 * 层 4 的 JS 依赖管理器由 pm（显式选择或从 base 推断）优先决定。
 */
export function resolve(selection: string[], cat: Catalog, opts: ResolveOptions = {}): ResolvedToolchain {
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
  const selectedPm = opts.pm && JS_MANAGERS.has(opts.pm) ? opts.pm : inferJsManager(seen);

  for (const id of seen) {
    const e = cat.entries.get(id);
    if (!e) continue; // 未知条目已在 warnings 里记录
    if (e.kind === "runtime" || e.kind === "cli") {
      if (e.mise) mise.push({ id, version: e.defaultVersion, backend: e.mise.backend, plugin: e.mise.plugin });
    } else if (e.kind === "dep") {
      if (e.dep) {
        const manager =
          selectedPm && JS_MANAGERS.has(e.dep.manager) ? selectedPm : e.dep.manager;
        deps.push({
          id,
          manager,
          package: e.dep.package ?? id,
          version: e.defaultVersion,
        });
      }
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
