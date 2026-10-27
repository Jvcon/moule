import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { loadCatalog, type Catalog } from "../../lib/catalog";
import { buildLayers } from "../../lib/layers";
import { runWizard, type Question } from "../../lib/wizard";
import { writeRecipe, type Recipe } from "../../lib/recipe";
import { buildSet, writeGenerated } from "../../lib/generator";
import { resolve } from "../../lib/resolver";

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

const isWeb = (a: Record<string, string>) => ["webapp", "ssr", "ssg"].includes(a.projectType);

const QUESTIONS: Question[] = [
  {
    id: "pm",
    prompt: "包管理器?",
    options: [
      { value: "pnpm", label: "pnpm" },
      { value: "bun", label: "bun" },
      { value: "npm", label: "npm" },
    ],
  },
  {
    id: "projectType",
    prompt: "项目类型?",
    options: [
      { value: "webapp", label: "Web 应用（SPA，vite）" },
      { value: "ssr", label: "Web 应用（SSR，next）" },
      { value: "ssg", label: "静态站点（astro）" },
      { value: "library", label: "库" },
      { value: "cli", label: "CLI 工具" },
      { value: "api", label: "API 服务" },
    ],
  },
  {
    id: "ui",
    prompt: "UI 框架?",
    when: isWeb,
    options: [
      { value: "react", label: "React" },
      { value: "vue", label: "Vue" },
      { value: "svelte", label: "Svelte" },
      { value: "solid", label: "Solid" },
    ],
  },
  {
    id: "styling",
    prompt: "样式?",
    when: isWeb,
    options: [
      { value: "tailwind", label: "Tailwind CSS" },
      { value: "none", label: "无 / 自己配" },
    ],
  },
  {
    id: "components",
    prompt: "组件库?",
    when: (a) => a.ui === "react" && a.styling === "tailwind",
    options: [
      { value: "shadcn", label: "shadcn/ui" },
      { value: "none", label: "无" },
    ],
  },
  {
    id: "data",
    prompt: "数据层?",
    when: (a) => a.ui === "react",
    options: [
      { value: "tanstack-query", label: "TanStack Query" },
      { value: "swr", label: "SWR" },
      { value: "none", label: "无" },
    ],
  },
  {
    id: "routing",
    prompt: "路由?",
    when: (a) => a.ui === "react",
    options: [
      { value: "tanstack-router", label: "TanStack Router" },
      { value: "react-router", label: "React Router" },
      { value: "none", label: "无" },
    ],
  },
  {
    id: "testing",
    prompt: "测试?",
    options: [
      { value: "vitest", label: "Vitest" },
      { value: "none", label: "无" },
    ],
  },
];

function bundlerOf(answers: Record<string, string>): string | undefined {
  switch (answers.projectType) {
    case "webapp":
      return "vite";
    case "ssr":
      return "next";
    case "ssg":
      return "astro";
    default:
      return undefined;
  }
}

function selectFrameworks(answers: Record<string, string>): string[] {
  const ids = new Set<string>();
  const bundler = bundlerOf(answers);
  if (bundler) ids.add(bundler);
  const add = (v?: string) => {
    if (v && v !== "none") ids.add(v);
  };
  add(answers.ui);
  add(answers.styling === "tailwind" ? "tailwind" : undefined);
  add(answers.components);
  add(answers.data);
  add(answers.routing);
  add(answers.testing);
  return [...ids];
}

function substitute(t: string, pm: string, answers: Record<string, string>): string {
  const pkgx = pm === "bun" ? "bunx" : pm === "pnpm" ? "pnpm dlx" : "npx";
  const dev = pm === "bun" ? "-d" : "-D";
  return t
    .replaceAll("{{pm}}", pm)
    .replaceAll("{{pkgx}}", pkgx)
    .replaceAll("{{dev}}", dev)
    .replaceAll("{{ui}}", answers.ui ?? "react");
}

interface Action {
  type: string;
  run: string;
}

function planActions(recipe: Recipe, cat: Catalog): Action[] {
  const actions: Action[] = [];
  const sub = (s: string) => substitute(s, recipe.pm, recipe.answers);

  const bundler = bundlerOf(recipe.answers);
  const scaffold = bundler ? cat.frameworks.get(bundler)?.scaffold : undefined;
  if (scaffold) actions.push({ type: "scaffold", run: sub(scaffold) });

  for (const id of recipe.frameworks) {
    const f = cat.frameworks.get(id);
    if (f?.install) actions.push({ type: "install", run: sub(f.install) });
  }
  for (const id of recipe.frameworks) {
    const f = cat.frameworks.get(id);
    if (f?.generate) actions.push({ type: "generate", run: sub(f.generate) });
  }
  return actions;
}

function runCmd(run: string, cwd: string) {
  console.log(`\n$ ${run}`);
  const r = spawnSync(run, { shell: true, cwd, stdio: "inherit" });
  if (r.status !== 0) die(`✗ 命令失败 (exit ${r.status}): ${run}`);
}

function runCmdSoft(run: string, cwd: string): boolean {
  console.log(`\n$ ${run}`);
  const r = spawnSync(run, { shell: true, cwd, stdio: "inherit" });
  return r.status === 0;
}

export async function cmdNew(name: string, opts: { dryRun: boolean }, cwd: string) {
  const target = join(cwd, name);
  if (existsSync(target)) die(`目标已存在: ${target}`);

  const cat = loadCatalog(buildLayers(cwd));
  const answers = await runWizard(QUESTIONS);
  const frameworks = selectFrameworks(answers);
  const recipe: Recipe = {
    version: 1,
    base: "node-base",
    pm: answers.pm ?? "pnpm",
    answers,
    frameworks,
  };

  const tc = resolve([recipe.base], cat);
  const files = buildSet(tc, name).files;
  const actions = planActions(recipe, cat);

  console.log("\n== 配方（moule.recipe.json）==");
  console.log(`  base: ${recipe.base}    pm: ${recipe.pm}`);
  console.log(`  frameworks: ${frameworks.join(", ")}`);

  console.log("\n== 动作计划 ==");
  for (const a of actions) console.log(`  [${a.type}] ${a.run}`);
  for (const f of files) console.log(`  [env] ${f.path}`);

  const notes = frameworks.map((id) => cat.frameworks.get(id)).filter(Boolean);
  if (notes.length) {
    console.log("\n== 框架说明 ==");
    for (const f of notes) if (f?.notes) console.log(`  ${f.id}: ${f.notes}`);
  }

  if (opts.dryRun) {
    console.log("\n(dry-run：未创建目录、未执行)");
    return;
  }

  mkdirSync(target, { recursive: true });

  // 1. 脚手架（必须在空目录里，先于 recipe/env，否则 create-vite 会因非空而提示）
  const scaffold = actions.find((a) => a.type === "scaffold");
  if (scaffold) runCmd(scaffold.run, target);

  // 2. recipe + 环境层（.mise.toml + devcontainer）
  writeRecipe(target, recipe);
  for (const f of files) writeGenerated(f, target);

  // 3. 依赖 + 代码生成器（generator 需项目已就绪，失败不致命，只告警）
  for (const a of actions) {
    if (a.type === "scaffold") continue;
    if (a.type === "generate") {
      if (!runCmdSoft(a.run, target)) {
        console.warn(`  ⚠ 生成器失败（通常需先配置 tailwind / 路径别名）：${a.run}`);
      }
    } else {
      runCmd(a.run, target);
    }
  }

  console.log(`\n✓ 完成: ${target}`);
  console.log("  下一步: cd 进去 → `mise install` → 需要在容器里就 Reopen in Container");
}
