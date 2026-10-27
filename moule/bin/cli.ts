import { join, basename } from "node:path";
import { builtinCatalogDir, globalCatalogDir, projectCatalogDir, bucketCatalogDirs } from "../lib/paths";
import { loadCatalog, type Layer } from "../lib/catalog";
import { resolve, type ResolvedToolchain } from "../lib/resolver";
import { buildSet, fileStatus, writeGenerated, canOverwrite } from "../lib/generator";

const PRIORITY = { builtin: 0, bucket: 10, global: 20, project: 30 } as const;

function buildLayers(cwd: string): Layer[] {
  const layers: Layer[] = [
    {
      name: "builtin",
      entriesDir: join(builtinCatalogDir(), "entries"),
      stacksDir: join(builtinCatalogDir(), "stacks"),
      priority: PRIORITY.builtin,
    },
  ];
  for (const b of bucketCatalogDirs()) {
    layers.push({
      name: `bucket:${b.name}`,
      entriesDir: join(b.dir, "entries"),
      stacksDir: join(b.dir, "stacks"),
      priority: PRIORITY.bucket,
    });
  }
  layers.push({
    name: "global",
    entriesDir: join(globalCatalogDir(), "entries"),
    stacksDir: join(globalCatalogDir(), "stacks"),
    priority: PRIORITY.global,
  });
  layers.push({
    name: "project",
    entriesDir: join(projectCatalogDir(cwd), "entries"),
    stacksDir: join(projectCatalogDir(cwd), "stacks"),
    priority: PRIORITY.project,
  });
  return layers;
}

function cmdStatus(cwd: string) {
  const cat = loadCatalog(buildLayers(cwd));
  console.log("== 分层 ==");
  for (const l of cat.layers) {
    const empty = !l.entries && !l.stacks ? "  (空)" : "";
    console.log(`  ${l.name.padEnd(18)} priority=${l.priority}  entries=${l.entries}  stacks=${l.stacks}${empty}`);
  }
  console.log(`\n合计: ${cat.entries.size} entries, ${cat.stacks.size} stacks`);
  if (cat.overriddenEntries.size) console.log(`覆盖的 entries: ${[...cat.overriddenEntries].sort().join(", ")}`);
  if (cat.overriddenStacks.size) console.log(`覆盖的 stacks: ${[...cat.overriddenStacks].sort().join(", ")}`);
  if (cat.errors.length) {
    console.log("\n== 校验错误（warn + skip）==");
    for (const e of cat.errors) console.log(`  ✗ ${e}`);
  }
}

function cmdList(cwd: string) {
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
}

function printResolved(tc: ResolvedToolchain) {
  console.log("== 解析结果 ==");
  console.log(`  层3 mise : ${tc.mise.map((t) => `${t.id}@${t.version}`).join(", ") || "（无）"}`);
  console.log(`  层4 deps : ${tc.deps.map((d) => `${d.package}(${d.manager})`).join(", ") || "（无）"}`);
  if (tc.system.length) console.log(`  层1 sys  : ${tc.system.map((s) => s.id).join(", ")}`);
  console.log(`  扩展     : ${tc.extensions.join(", ") || "（无）"}`);
  if (tc.warnings.length) {
    console.log("  警告:");
    for (const w of tc.warnings) console.log(`    ✗ ${w}`);
  }
}

function printLayer4(tc: ResolvedToolchain) {
  if (!tc.deps.length) return;
  console.log("\n== 层4 建议（moule 不装，写进项目依赖）==");
  const byManager = new Map<string, string[]>();
  for (const d of tc.deps) {
    const arr = byManager.get(d.manager) ?? [];
    arr.push(`${d.package}@${d.version}`);
    byManager.set(d.manager, arr);
  }
  for (const [mgr, pkgs] of byManager) console.log(`  ${mgr}: ${pkgs.join(" ")}`);
}

function cmdPlan(sel: string[], cwd: string) {
  const cat = loadCatalog(buildLayers(cwd));
  const tc = resolve(sel, cat);
  printResolved(tc);

  const set = buildSet(tc, basename(cwd));
  console.log("\n== 文件（plan，不落盘）==");
  for (const f of set.files) {
    const st = fileStatus(f, cwd);
    console.log(`  [${st.padEnd(9)}] ${f.path}`);
    if (st !== "unchanged") {
      for (const line of f.content.split("\n")) console.log(`      ${line}`);
    }
  }
  printLayer4(tc);
}

function cmdApply(sel: string[], cwd: string, force: boolean) {
  const cat = loadCatalog(buildLayers(cwd));
  const tc = resolve(sel, cat);
  printResolved(tc);

  const set = buildSet(tc, basename(cwd));
  const changed: string[] = [];
  for (const f of set.files) {
    if (fileStatus(f, cwd) === "unchanged") continue;
    const check = canOverwrite(f, cwd);
    if (!check.ok && !force) {
      console.error(`\n  ✗ ${check.reason}`);
      process.exit(1);
    }
    writeGenerated(f, cwd);
    changed.push(f.path);
  }

  console.log("\n== 已写入 ==");
  if (!changed.length) console.log("  （无变化，已是最新）");
  for (const p of changed) console.log(`  ✓ ${p}`);

  const miseChanged = changed.includes(".mise.toml");
  const dcChanged = changed.some((p) => p.startsWith(".devcontainer/") || p === "Dockerfile");
  if (miseChanged) console.log("  → mise 变更：即时生效请跑 `mise install`（无需重建）");
  if (dcChanged) console.log("  → devcontainer 变更：需重建（`gh cs rebuild` / *Rebuild Container*）");
  printLayer4(tc);
}

function parseArgs(args: string[]) {
  const force = args.includes("--force");
  const sel = args.filter((a) => !a.startsWith("--"));
  return { force, sel };
}

function printHelp() {
  console.log(`moule — 个人可复用的开发环境 playbook

用法:
  moule catalog status         查看 catalog 分层加载与合并摘要
  moule catalog list           列出条目与 stacks
  moule plan <stack|entry...>  解析选型，预览将生成的文件（不落盘）
  moule apply <stack|entry...> 解析选型并写入 .mise.toml + .devcontainer/
       --force                 覆盖手写的 .mise.toml

例:
  moule plan python-base
  moule apply node python
`);
}

const argv = process.argv.slice(2);
const cmd = argv[0];
const rest = argv.slice(1);
const cwd = process.cwd();

if (cmd === "catalog" && rest[0] === "status") cmdStatus(cwd);
else if (cmd === "catalog" && rest[0] === "list") cmdList(cwd);
else if (cmd === "plan") {
  const { sel } = parseArgs(rest);
  if (!sel.length) {
    console.error("用法: moule plan <stack|entry...>");
    process.exit(1);
  }
  cmdPlan(sel, cwd);
} else if (cmd === "apply") {
  const { force, sel } = parseArgs(rest);
  if (!sel.length) {
    console.error("用法: moule apply <stack|entry...>");
    process.exit(1);
  }
  cmdApply(sel, cwd, force);
} else printHelp();
