import { join } from "node:path";
import type { Layer } from "./catalog";
import { builtinCatalogDir, globalCatalogDir, projectCatalogDir, bucketCatalogDirs } from "./paths";

const PRIORITY = { builtin: 0, bucket: 10, global: 20, project: 30 } as const;

/** 按优先级组装四层（bucket 为 0 个或多个）。 */
export function buildLayers(cwd: string): Layer[] {
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
