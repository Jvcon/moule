import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const RECIPE_FILE = "moule.recipe.json";

export interface Recipe {
  version: 1;
  base: string;
  pm: string;
  answers: Record<string, string>;
  frameworks: string[];
}

export function writeRecipe(dir: string, recipe: Recipe) {
  writeFileSync(join(dir, RECIPE_FILE), JSON.stringify(recipe, null, 2) + "\n");
}

export function readRecipe(dir: string): Recipe | undefined {
  const p = join(dir, RECIPE_FILE);
  if (!existsSync(p)) return undefined;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as Recipe;
  } catch {
    return undefined;
  }
}
