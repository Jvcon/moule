import { existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { loadCatalog } from "../../lib/catalog";
import { buildLayers } from "../../lib/layers";
import { resolve } from "../../lib/resolver";
import { renderMiseToml } from "../../lib/generator";

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

/**
 * verify：验证「生成的环境真的能装」。
 *   默认：mise install --dry-run（解析所有工具的 backend/包名，不下载 → 快）
 *   --install：真实 mise install（慢，但最彻底）
 */
export function cmdVerify(sel: string[], cwd: string, install: boolean) {
  const cat = loadCatalog(buildLayers(cwd));
  let dir: string;
  let tmp: string | undefined;

  if (sel.length) {
    const tc = resolve(sel, cat);
    if (!tc.mise.length) die("该选型没有层3（mise）工具可验证");
    tmp = mkdtempSync(join(tmpdir(), "moule-verify-"));
    writeFileSync(join(tmp, ".mise.toml"), renderMiseToml(tc), "utf8");
    dir = tmp;
    console.log(`== verify ${sel.join(" ")} → ${tc.mise.map((t) => `${t.id}@${t.version}`).join(", ")} ==`);
  } else {
    if (!existsSync(join(cwd, ".mise.toml"))) die("当前目录没有 .mise.toml，也没有指定 selection");
    dir = cwd;
    console.log("== verify 当前 .mise.toml ==");
  }

  const args = install ? ["install"] : ["install", "--dry-run"];
  console.log(`   $ mise ${args.join(" ")}`);
  const r = spawnSync("mise", args, { cwd: dir, stdio: "inherit" });
  if (tmp) rmSync(tmp, { recursive: true, force: true });

  if (r.error) die(`无法运行 mise: ${r.error.message}`);
  if (r.status !== 0) {
    console.error(`\n✗ verify 失败（${install ? "真实安装" : "解析"}）`);
    process.exit(1);
  }
  console.log(
    `\n✓ verify 通过（${install ? "真实安装成功" : "全部工具可解析；加 --install 做真实安装"}）`,
  );
}
