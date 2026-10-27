import * as readline from "node:readline";

export interface Option {
  value: string;
  label: string;
}

export interface Question {
  id: string;
  prompt: string;
  options: Option[];
  when?: (answers: Record<string, string>) => boolean;
}

/**
 * 代码驱动的决策树：逐题询问，返回 answers。
 * 用 async iterator 读行，兼容交互 TTY 与管道输入。
 */
export async function runWizard(questions: Question[]): Promise<Record<string, string>> {
  const answers: Record<string, string> = {};
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
  const it = rl[Symbol.asyncIterator]();

  const ask = async (prompt: string): Promise<string> => {
    process.stdout.write(prompt);
    const { value, done } = await it.next();
    return done ? "" : (value ?? "");
  };

  try {
    for (const q of questions) {
      if (q.when && !q.when(answers)) continue;
      const lines = [`\n${q.prompt}`];
      q.options.forEach((o, i) => lines.push(`  ${i + 1}) ${o.label}`));
      const raw = (await ask(lines.join("\n") + "\n> ")).trim();
      const idx = Number.parseInt(raw, 10) - 1;
      const opt = q.options[idx] ?? q.options[0];
      answers[q.id] = opt.value;
      console.log(`  → ${opt.label}`);
    }
  } finally {
    rl.close();
  }
  return answers;
}
