import { join } from "node:path";
import { builtinCatalogDir, globalCatalogDir, projectCatalogDir, bucketCatalogDirs } from "../lib/paths";
import { loadCatalog, type Layer } from "../lib/catalog";

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

const [cmd, sub] = process.argv.slice(2);
const cwd = process.cwd();

if (cmd === "catalog" && sub === "status") cmdStatus(cwd);
else if (cmd === "catalog" && sub === "list") cmdList(cwd);
else {
  console.log(`moule — 个人可复用的开发环境 playbook

用法:
  moule catalog status   查看 catalog 分层加载与合并摘要
  moule catalog list     列出条目与 stacks

更多命令（init/add/plan/apply/verify/bucket）见后续里程碑。
`);
}
