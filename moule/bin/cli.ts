import { cmdStatus, cmdList, cmdShow, cmdDiff, cmdAdd, cmdEdit, parseAddOpts } from "./commands/catalog";
import { cmdPlan, cmdApply } from "./commands/generate";
import { cmdVerify } from "./commands/verify";
import { cmdNew } from "./commands/new";

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function parseArgs(args: string[]) {
  const force = args.includes("--force");
  const sel = args.filter((a) => !a.startsWith("--"));
  return { force, sel };
}

function printHelp() {
  console.log(`moule — 个人可复用的开发环境 playbook

用法:
  moule catalog status          查看 catalog 分层与合并摘要
  moule catalog list            列出条目与 stacks
  moule catalog show <id>       查看单个条目/栈的完整定义与来源
  moule catalog diff            你的覆盖 vs built-in base
  moule catalog add <id> ...    新增条目（--project 写到项目层）
  moule catalog edit <id>       编辑条目（内置会复制到 global 做 override）
  moule plan <stack|entry...>   解析选型，预览将生成的文件（不落盘）
  moule apply <stack|entry...>  解析选型并写入 .mise.toml + .devcontainer/
       --force                  覆盖手写的 .mise.toml
  moule verify [<selection>]    验证环境可安装（默认 mise dry-run；--install 真实安装）
  moule new <name> [--dry-run]  交互决策树选框架 → 生成项目（真执行）+ recipe

例:
  moule catalog show node
  moule catalog add mytool --kind cli --backend npm
  moule plan python-base
  moule apply node python
`);
}

function printCatalogHelp() {
  console.log(`moule catalog — 查看/维护目录内容

  status          分层与合并摘要
  list            条目与 stacks
  show <id>       单个条目/栈详情 + 来源
  diff            你的覆盖 vs built-in base
  add <id>        新增条目（--kind 必填；--project 写到项目层）
  edit <id>       编辑条目文件（内置会复制到 global override）
`);
}

const argv = process.argv.slice(2);
const cmd = argv[0];
const rest = argv.slice(1);
const cwd = process.cwd();

if (cmd === "catalog") {
  const sub = rest[0];
  if (sub === "status") cmdStatus(cwd);
  else if (sub === "list") cmdList(cwd);
  else if (sub === "show") {
    const id = rest[1];
    if (!id) die("用法: moule catalog show <id>");
    cmdShow(id, cwd);
  } else if (sub === "diff") cmdDiff(cwd);
  else if (sub === "add") {
    const id = rest[1];
    if (!id) die("用法: moule catalog add <id> --kind <runtime|cli|dep|system> [...]");
    cmdAdd(id, parseAddOpts(rest.slice(2)), cwd);
  } else if (sub === "edit") {
    const id = rest[1];
    if (!id) die("用法: moule catalog edit <id>");
    cmdEdit(id, cwd);
  } else printCatalogHelp();
} else if (cmd === "plan") {
  const { sel } = parseArgs(rest);
  if (!sel.length) die("用法: moule plan <stack|entry...>");
  cmdPlan(sel, cwd);
} else if (cmd === "apply") {
  const { force, sel } = parseArgs(rest);
  if (!sel.length) die("用法: moule apply <stack|entry...>");
  cmdApply(sel, cwd, force);
} else if (cmd === "verify") {
  const install = rest.includes("--install");
  const sel = rest.filter((a) => !a.startsWith("--"));
  cmdVerify(sel, cwd, install);
} else if (cmd === "new") {
  const dryRun = rest.includes("--dry-run");
  const name = rest.find((a) => !a.startsWith("--"));
  if (!name) die("用法: moule new <name> [--dry-run]");
  await cmdNew(name, { dryRun }, cwd);
} else printHelp();
