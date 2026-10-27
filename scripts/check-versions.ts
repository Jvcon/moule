// 报告 built-in catalog 里各 mise 工具的「固定版本 vs 最新版本」差异。
// 只报告、不自动改：LTS vs latest 的取舍由人决定（如 node 24 LTS vs latest 26）。
import { spawnSync } from "node:child_process";
import { loadCatalog } from "../moule/lib/catalog";
import { builtinCatalogDir } from "../moule/lib/paths";
import type { ToolEntry } from "../moule/lib/schema";

function miseKey(e: ToolEntry): string {
  if (!e.mise) return e.id;
  if (e.mise.backend === "core") return e.id;
  return e.mise.plugin ? `${e.mise.backend}:${e.mise.plugin}` : `${e.mise.backend}:${e.id}`;
}

const major = (v: string) => v.split(".")[0];

const dir = builtinCatalogDir();
const cat = loadCatalog([
  {
    name: "builtin",
    entriesDir: `${dir}/entries`,
    stacksDir: `${dir}/stacks`,
    frameworksDir: `${dir}/frameworks`,
    priority: 0,
  },
]);

let flagged = 0;
for (const [id, e] of [...cat.entries].sort((a, b) => a[0].localeCompare(b[0]))) {
  if ((e.kind !== "runtime" && e.kind !== "cli") || !e.mise) continue;
  if (e.defaultVersion === "latest") continue;

  const key = miseKey(e);
  const r = spawnSync("mise", ["latest", key], { encoding: "utf8" });
  const latest = (r.stdout ?? "").trim();
  if (r.status !== 0 || !latest) {
    console.log(`?  ${id.padEnd(14)} pinned=${e.defaultVersion.padEnd(8)} （无法查询 ${key}）`);
    continue;
  }

  const newerMajor = major(latest) !== major(e.defaultVersion);
  if (newerMajor) flagged++;
  console.log(
    `${newerMajor ? "! " : "  "}${id.padEnd(14)} pinned=${e.defaultVersion.padEnd(8)} latest=${latest}${newerMajor ? "  ← 新 major 可用" : ""}`,
  );
}

console.log(`\n${flagged} 个条目有新 major 可用（LTS vs latest 由人决定，不自动改）。`);
