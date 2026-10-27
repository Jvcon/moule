import { basename } from "node:path";
import { loadCatalog } from "../../lib/catalog";
import { buildLayers } from "../../lib/layers";
import { resolve, type ResolvedToolchain } from "../../lib/resolver";
import { buildSet, fileStatus, writeGenerated, canOverwrite } from "../../lib/generator";

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

export function cmdPlan(sel: string[], cwd: string) {
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

export function cmdApply(sel: string[], cwd: string, force: boolean) {
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
