import os from "node:os";
import { join } from "node:path";

/** built-in（main bucket）目录：<repo>/moule/catalog */
export function builtinCatalogDir(): string {
  // 本文件在 moule/lib/，catalog 在 moule/catalog/
  return join(import.meta.dir, "..", "catalog");
}

/** global 目录：~/.config/moule/catalog */
export function globalCatalogDir(): string {
  return join(os.homedir(), ".config", "moule", "catalog");
}

/** project 目录：<cwd>/.moule/catalog（TODO: 后续改为向上找 .git 定位 repo 根） */
export function projectCatalogDir(cwd: string): string {
  return join(cwd, ".moule", "catalog");
}

/**
 * 已注册的远程 bucket 目录。
 * TODO(milestone 4)：从 ~/.config/moule/config.toml 读取 bucket 列表，
 * 解析到 ~/.cache/moule/buckets/<name>/。里程碑 2 先返回空。
 */
export function bucketCatalogDirs(): { name: string; dir: string }[] {
  return [];
}
