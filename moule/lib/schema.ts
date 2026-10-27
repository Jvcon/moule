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

export const ToolEntry = z.object({
  id: z.string().min(1),
  kind: z.enum(["runtime", "cli", "system"]),
  mise: MiseSpec.optional(),
  defaultVersion: z.string().min(1),
  apt: z.array(z.string()).optional(),
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
