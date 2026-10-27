import { join } from "node:path";
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { loadCatalog, type Layer } from "../../lib/catalog";
import { buildLayers } from "../../lib/layers";
import { ToolEntry } from "../../lib/schema";
import { globalCatalogDir, projectCatalogDir } from "../../lib/paths";

export interface AddOpts {
  kind?: string;
  backend?: string;
  plugin?: string;
  manager?: string;
  pkg?: string;
  version?: string;
  apt?: string[];
  extensions?: string[];
  companions?: string[];
  notes?: string;
  project?: boolean;
  force?: boolean;
}

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

export function cmdStatus(cwd: string) {
  const cat = loadCatalog(buildLayers(cwd));
  console.log("== 分层 ==");
  for (const l of cat.layers) {
    const empty = !l.entries && !l.stacks && !l.frameworks ? "  (空)" : "";
    console.log(
      `  ${l.name.padEnd(18)} priority=${l.priority}  entries=${l.entries}  stacks=${l.stacks}  frameworks=${l.frameworks}${empty}`,
    );
  }
  console.log(`\n合计: ${cat.entries.size} entries, ${cat.stacks.size} stacks, ${cat.frameworks.size} frameworks`);
  if (cat.overriddenEntries.size) console.log(`覆盖的 entries: ${[...cat.overriddenEntries].sort().join(", ")}`);
  if (cat.overriddenStacks.size) console.log(`覆盖的 stacks: ${[...cat.overriddenStacks].sort().join(", ")}`);
  if (cat.overriddenFrameworks.size) console.log(`覆盖的 frameworks: ${[...cat.overriddenFrameworks].sort().join(", ")}`);
  if (cat.errors.length) {
    console.log("\n== 校验错误（warn + skip）==");
    for (const e of cat.errors) console.log(`  ✗ ${e}`);
  }
}

export function cmdList(cwd: string) {
  const cat = loadCatalog(buildLayers(cwd));
  console.log("== entries ==");
  for (const [id, e] of [...cat.entries].sort((a, b) => a[0].localeCompare(b[0]))) {
    const kindLabel = e.kind === "dep" && e.dep ? `dep/${e.dep.manager}` : e.kind;
    const parts = [`${id.padEnd(16)} ${kindLabel.padEnd(12)} ${e.defaultVersion.padEnd(8)}`];
    if (e.companions?.length) parts.push(`companions=[${e.companions.join(", ")}]`);
    console.log("  " + parts.join(" "));
  }
  console.log("\n== stacks ==");
  for (const [id, s] of [...cat.stacks].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${id.padEnd(16)} ${s.name}  include=[${s.include.join(", ")}]`);
  }
  console.log("\n== frameworks ==");
  for (const [id, f] of [...cat.frameworks].sort((a, b) => a[0].localeCompare(b[0]))) {
    const kind = f.scaffold ? "scaffold" : f.generate ? "generate" : "install";
    const req = f.requires?.length ? `  requires=[${f.requires.join(", ")}]` : "";
    console.log(`  ${id.padEnd(18)} ${f.category.padEnd(10)} ${kind}${req}`);
  }
}

/** 在层里找到定义某 id 的文件（高优先级优先）。 */
function findSource(id: string, cwd: string, kind: "entry" | "stack"): { layer: Layer; path: string } | undefined {
  const layers = [...buildLayers(cwd)].sort((a, b) => b.priority - a.priority);
  for (const l of layers) {
    const dir = kind === "entry" ? l.entriesDir : l.stacksDir;
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".json")) continue;
      const p = join(dir, f);
      try {
        const raw = JSON.parse(readFileSync(p, "utf8")) as { id?: string };
        if (raw?.id === id) return { layer: l, path: p };
      } catch {
        /* skip 非法 json */
      }
    }
  }
  return undefined;
}

export function cmdShow(id: string, cwd: string) {
  const cat = loadCatalog(buildLayers(cwd));
  const e = cat.entries.get(id);
  const s = cat.stacks.get(id);
  if (!e && !s) die(`未找到: ${id}`);

  if (e) {
    console.log(JSON.stringify(e, null, 2));
    const src = findSource(id, cwd, "entry");
    if (src) console.log(`\n来自: ${src.layer.name}  (${src.path})`);
  } else if (s) {
    console.log(JSON.stringify(s, null, 2));
    const src = findSource(id, cwd, "stack");
    if (src) console.log(`\n来自: ${src.layer.name}  (${src.path})`);
  }
}

function describeDiff(base: Record<string, unknown>, cur: Record<string, unknown>): string[] {
  const out: string[] = [];
  const keys = new Set([...Object.keys(base), ...Object.keys(cur)]);
  for (const k of keys) {
    const a = base[k];
    const b = cur[k];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    if (Array.isArray(a) || Array.isArray(b)) {
      out.push(`${k}: [${(a as unknown[] | undefined)?.join(",") ?? ""}] → [${(b as unknown[] | undefined)?.join(",") ?? ""}]`);
    } else if (a && b && typeof a === "object" && typeof b === "object") {
      out.push(`${k}: 对象变更`);
    } else {
      out.push(`${k}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
    }
  }
  return out;
}

export function cmdDiff(cwd: string) {
  const layers = buildLayers(cwd);
  const full = loadCatalog(layers);
  const builtinLayer = layers.find((l) => l.name === "builtin")!;
  const builtin = loadCatalog([builtinLayer]);

  let any = false;

  const entryLines: string[] = [];
  for (const [id, e] of full.entries) {
    const b = builtin.entries.get(id);
    if (!b) {
      entryLines.push(`  + ${id}  （新增，base 无）`);
      any = true;
      continue;
    }
    const d = describeDiff(b as Record<string, unknown>, e as Record<string, unknown>);
    if (d.length) {
      entryLines.push(`  ~ ${id}`);
      for (const line of d) entryLines.push(`      ${line}`);
      any = true;
    }
  }
  if (entryLines.length) {
    console.log("== 你的 entries 覆盖 vs base ==");
    for (const l of entryLines) console.log(l);
  }

  const stackLines: string[] = [];
  for (const [id, s] of full.stacks) {
    const b = builtin.stacks.get(id);
    if (!b) {
      stackLines.push(`  + ${id}  （新增，base 无）`);
      any = true;
      continue;
    }
    const d = describeDiff(b as Record<string, unknown>, s as Record<string, unknown>);
    if (d.length) {
      stackLines.push(`  ~ ${id}`);
      for (const line of d) stackLines.push(`      ${line}`);
      any = true;
    }
  }
  if (stackLines.length) {
    console.log("\n== 你的 stacks 覆盖 vs base ==");
    for (const l of stackLines) console.log(l);
  }

  if (!any) console.log("（无覆盖：你的 catalog 与 built-in base 完全一致）");
}

export function cmdAdd(id: string, opts: AddOpts, cwd: string) {
  if (!opts.kind) die("需要 --kind <runtime|cli|dep|system>");
  const targetDir = opts.project
    ? join(projectCatalogDir(cwd), "entries")
    : join(globalCatalogDir(), "entries");
  const path = join(targetDir, `${id}.json`);
  if (existsSync(path) && !opts.force) die(`已存在: ${path}（--force 覆盖）`);

  const entry: Record<string, unknown> = { id, kind: opts.kind, defaultVersion: opts.version ?? "latest" };
  if (opts.kind === "runtime" || opts.kind === "cli") {
    const mise: Record<string, unknown> = { backend: opts.backend ?? "core" };
    if (opts.plugin) mise.plugin = opts.plugin;
    entry.mise = mise;
  } else if (opts.kind === "dep") {
    if (!opts.manager) die("dep 需要 --manager <uv|pnpm|npm|poetry|...>");
    const dep: Record<string, unknown> = { manager: opts.manager };
    if (opts.pkg) dep.package = opts.pkg;
    entry.dep = dep;
  } else if (opts.kind === "system") {
    if (!opts.apt?.length) die("system 需要 --apt <pkg,...>");
    entry.apt = opts.apt;
  }
  if (opts.extensions?.length) entry.extensions = opts.extensions;
  if (opts.companions?.length) entry.companions = opts.companions;
  if (opts.notes) entry.notes = opts.notes;

  const parsed = ToolEntry.safeParse(entry);
  if (!parsed.success) {
    die("生成条目不合法:\n  " + parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n  "));
  }

  mkdirSync(targetDir, { recursive: true });
  writeFileSync(path, JSON.stringify(entry, null, 2) + "\n");
  console.log(`✓ 写入 ${path}`);
  console.log(`  用 \`moule catalog edit ${id}\` 继续调整。`);
}

function openEditor(path: string) {
  const editor = process.env.EDITOR || process.env.VISUAL || "vi";
  const r = spawnSync(editor, [path], { stdio: "inherit" });
  if (r.error) die(`打开编辑器失败（${editor}）：${r.error.message}`);
}

export function cmdEdit(id: string, cwd: string) {
  let kind: "entry" | "stack" | undefined;
  let src = findSource(id, cwd, "entry");
  if (src) kind = "entry";
  else {
    src = findSource(id, cwd, "stack");
    if (src) kind = "stack";
  }
  if (!src || !kind) die(`未找到: ${id}`);

  // 内置只读 → 复制到 global 做 override，再编辑
  if (src.layer.name === "builtin") {
    const sub = kind === "entry" ? "entries" : "stacks";
    const targetDir = join(globalCatalogDir(), sub);
    const path = join(targetDir, `${id}.json`);
    if (!existsSync(path)) {
      mkdirSync(targetDir, { recursive: true });
      writeFileSync(path, readFileSync(src.path, "utf8"));
      console.log(`内置条目 → 复制到 global override: ${path}`);
    }
    openEditor(path);
    return;
  }
  openEditor(src.path);
}

export function parseAddOpts(args: string[]): AddOpts {
  const opts: AddOpts = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = () => {
      const v = args[++i];
      if (v === undefined) die(`${a} 缺少参数`);
      return v;
    };
    switch (a) {
      case "--kind": opts.kind = next(); break;
      case "--backend": opts.backend = next(); break;
      case "--plugin": opts.plugin = next(); break;
      case "--manager": opts.manager = next(); break;
      case "--package": opts.pkg = next(); break;
      case "--version": opts.version = next(); break;
      case "--apt": opts.apt = next().split(",").filter(Boolean); break;
      case "--extensions": opts.extensions = next().split(",").filter(Boolean); break;
      case "--companions": opts.companions = next().split(",").filter(Boolean); break;
      case "--notes": opts.notes = next(); break;
      case "--project": opts.project = true; break;
      case "--force": opts.force = true; break;
      default: die(`未知参数: ${a}`);
    }
  }
  return opts;
}
