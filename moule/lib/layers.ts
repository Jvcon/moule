import { join } from "node:path";
import type { Layer } from "./catalog";
import { builtinCatalogDir, globalCatalogDir, projectCatalogDir, bucketCatalogDirs } from "./paths";

const PRIORITY = { builtin: 0, bucket: 10, global: 20, project: 30 } as const;

function dirs(base: string, priority: number, name: string): Layer {
  return {
    name,
    entriesDir: join(base, "entries"),
    stacksDir: join(base, "stacks"),
    frameworksDir: join(base, "frameworks"),
    priority,
  };
}

/** 按优先级组装四层（bucket 为 0 个或多个）。 */
export function buildLayers(cwd: string): Layer[] {
  const layers: Layer[] = [dirs(builtinCatalogDir(), PRIORITY.builtin, "builtin")];
  for (const b of bucketCatalogDirs()) {
    layers.push(dirs(b.dir, PRIORITY.bucket, `bucket:${b.name}`));
  }
  layers.push(dirs(globalCatalogDir(), PRIORITY.global, "global"));
  layers.push(dirs(projectCatalogDir(cwd), PRIORITY.project, "project"));
  return layers;
}
