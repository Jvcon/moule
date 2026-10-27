import { z } from "zod";

export const MISE_BACKENDS = [
  "core",
  "asdf",
  "aqua",
  "npm",
  "cargo",
  "go",
  "ubi",
  "pipx",
  "vfox",
  "spm",
] as const;

export const MiseSpec = z.object({
  backend: z.enum(MISE_BACKENDS),
  plugin: z.string().optional(),
});

/** 项目依赖（层 4）：由语言包管理器声明，装进 .venv / node_modules */
export const DEP_MANAGERS = ["pnpm", "npm", "yarn", "uv", "poetry", "pip"] as const;

export const DepSpec = z.object({
  manager: z.enum(DEP_MANAGERS),
  /** registry 上的包名（如 @biomejs/biome），默认同 id */
  package: z.string().optional(),
});

/**
 * kind → 四层工具安装模型（见 plan §3）
 *   runtime / cli → mise（层 2/3）
 *   dep           → 项目依赖（层 4）
 *   system        → devcontainer/apt（层 1）
 */
export const TOOL_KINDS = ["runtime", "cli", "dep", "system"] as const;

export const ToolEntry = z.object({
  id: z.string().min(1),
  kind: z.enum(TOOL_KINDS),
  mise: MiseSpec.optional(), // 仅 runtime/cli
  dep: DepSpec.optional(), // 仅 dep
  defaultVersion: z.string().min(1),
  apt: z.array(z.string()).optional(), // 仅 system
  extensions: z.array(z.string()).optional(),
  companions: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

export const Stack = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  include: z.array(z.string()).min(1),
  recommends: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
});

export type ToolEntry = z.infer<typeof ToolEntry>;
export type Stack = z.infer<typeof Stack>;
export type MiseBackend = z.infer<typeof MiseSpec>["backend"];
export type DepManager = z.infer<typeof DepSpec>["manager"];
export type ToolKind = z.infer<typeof ToolEntry>["kind"];
