# compose 技能命名空间隔离 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 kilo-superpowers-compose 的 14 个技能加 `compose-` 命名空间前缀，并通过 kilo 的 `permission.skill` 机制实现模型侧隔离（内置 agent 看不到也调不动，compose 三件套照常可用，用户手敲 `/compose-xxx` 仍可加载）。

**Architecture:** 前缀烘焙进仓库 `skills/` 源码（`name` 字段 + 交叉引用），由幂等的 `script/prefix-skills.mjs` 施加；installer 向 `kilo.jsonc` 幂等写入全局 `permission.skill["compose-*"]="deny"`，三个 agent frontmatter 带 `compose-*:allow`（靠 kilo `findLast` 赢回）；卸载精确移除单键。维护者用 `script/vendor.mjs` + `prefix-skills.mjs` 升级 obra。

**Tech Stack:** Node.js ≥ 18 ESM、零第三方依赖、`node:test` + `node:assert/strict`。维护者脚本可用 `node:child_process`（git）。

## Global Constraints

- 所有实现都在当前 worktree（分支 `halved-ping`）内进行，路径相对 worktree 根。
- 零 npm 依赖；仅用 `node:*` 内置模块。
- `script/` **不进 npm 包**（`package.json` 的 `files` 白名单 = `["bin","skills","agents","plugin","NOTICE"]`，不含 `script/`）。
- 跨平台路径用 `path.join` + `os.homedir()`，绝不手拼反斜杠。
- 测试用临时 `KILO_HOME`（`os.tmpdir()` 下），绝不触碰真实配置。
- `permission.skill` 的键 `compose-*` 必须在对象中**位于 `"*"` 之后**（依赖 kilo `findLast`）。
- 技能 `name` 前缀固定 `compose-`；目录名保持 verbatim 不变。
- 提交信息用简体中文，沿用仓库 `type(scope): subject` 风格。

## File Structure

| 文件 | 责任 | 动作 |
|---|---|---|
| `script/prefix-skills.mjs` | 幂等施加 `compose-` 前缀（name + 交叉引用）到 skills + agents | 新建 |
| `script/vendor.mjs` | 从 obra tag 重新 vendor `skills/`（还原 verbatim） | 新建 |
| `test/prefix-skills.test.js` | prefix 脚本的单元测试 | 新建 |
| `bin/lib.js` | 安装器：permission 块写入/移除、junction 改名、manifest 字段、移除死桩 | 修改 |
| `test/installer.test.js` | 安装器测试：新增 isolation 用例 + 更新 resolvePaths/readEnv 旧断言 | 修改 |
| `skills/*/SKILL.md`（14 个） | `name` 前缀化 + 交叉引用前缀化（由脚本产出） | 修改 |
| `agents/compose.md`, `compose-dev.md`, `compose-review.md` | 引用前缀化 + 新增 `permission.skill` frontmatter | 修改 |
| `NOTICE` | "verbatim" → "derived/namespaced" 修订 + vendor 流程 | 修改 |
| `docs/DESIGN.md` | §6 / §10 Q1 / §10 Q3 修订 + 新增 §13 隔离机制 | 修改 |
| `AGENTS.md` | verbatim 硬约束条款修订 | 修改 |

---

### Task 1: `script/prefix-skills.mjs` + 单元测试

**Files:**
- Create: `script/prefix-skills.mjs`
- Create: `test/prefix-skills.test.js`

**Interfaces:**
- Produces: CLI `node script/prefix-skills.mjs [--check] [--root <path>]`，退出码 0（正常）/1（`--check` 发现需改动）。数据驱动发现 `skills/*/SKILL.md` 的裸名，不硬编码。

- [ ] **Step 1: 写失败测试** `test/prefix-skills.test.js`

```js
// test/prefix-skills.test.js
// prefix-skills.mjs 单元测试（node:test，零依赖）。
// 用 os.tmpdir() 下的临时目录构造 fixture，绝不触碰真实 skills/。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.resolve(here, '..', 'script', 'prefix-skills.mjs');

function mkRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prefix-test-'));
  fs.mkdirSync(path.join(root, 'skills'), { recursive: true });
  fs.mkdirSync(path.join(root, 'agents'), { recursive: true });
  return root;
}
function rmrf(p) { try { fs.rmSync(p, { recursive: true, force: true }); } catch {} }
function writeSkill(root, dir, name, body) {
  const d = path.join(root, 'skills', dir);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'SKILL.md'),
    `---\nname: ${name}\ndescription: "d"\n---\n${body}\n`, 'utf8');
}
function run(root, args = []) {
  return execFileSync(process.execPath, [script, '--root', root, ...args],
    { encoding: 'utf8' });
}

test('prefix: name 字段加 compose- 前缀', () => {
  const root = mkRoot();
  try {
    writeSkill(root, 'brainstorming', 'brainstorming', '# body');
    run(root);
    const out = fs.readFileSync(path.join(root, 'skills', 'brainstorming', 'SKILL.md'), 'utf8');
    assert.match(out, /^name: compose-brainstorming$/m);
  } finally { rmrf(root); }
});

test('prefix: 交叉引用整词前缀化', () => {
  const root = mkRoot();
  try {
    writeSkill(root, 'a', 'alpha', 'see brainstorming skill');
    writeSkill(root, 'brainstorming', 'brainstorming', '# b');
    run(root);
    const out = fs.readFileSync(path.join(root, 'skills', 'a', 'SKILL.md'), 'utf8');
    assert.match(out, /see compose-brainstorming skill/);
  } finally { rmrf(root); }
});

test('prefix: 幂等——连跑两次第二次零改动且 --check 退出 0', () => {
  const root = mkRoot();
  try {
    writeSkill(root, 'brainstorming', 'brainstorming', '# b');
    run(root);                       // 第一次
    const after1 = fs.readFileSync(path.join(root, 'skills', 'brainstorming', 'SKILL.md'), 'utf8');
    run(root);                       // 第二次
    const after2 = fs.readFileSync(path.join(root, 'skills', 'brainstorming', 'SKILL.md'), 'utf8');
    assert.equal(after1, after2, '第二次不应再改动');
    // --check 应退出 0
    let code = 0;
    try { run(root, ['--check']); } catch (e) { code = e.status ?? 1; }
    assert.equal(code, 0, '--check 在已前缀化时应退出 0');
  } finally { rmrf(root); }
});

test('prefix: 不双前缀（负向断言）', () => {
  const root = mkRoot();
  try {
    writeSkill(root, 'x', 'compose-brainstorming', 'see brainstorming');
    writeSkill(root, 'brainstorming', 'brainstorming', '# b');
    run(root);
    const out = fs.readFileSync(path.join(root, 'skills', 'x', 'SKILL.md'), 'utf8');
    assert.doesNotMatch(out, /compose-compose/);
    assert.match(out, /see compose-brainstorming/);
  } finally { rmrf(root); }
});

test('prefix: 数据驱动——自动覆盖新增技能', () => {
  const root = mkRoot();
  try {
    writeSkill(root, 'brainstorming', 'brainstorming', 'see new-skill');
    writeSkill(root, 'new-skill', 'new-skill', '# n');   // 脚本不认识的新名字
    run(root);
    const out = fs.readFileSync(path.join(root, 'skills', 'brainstorming', 'SKILL.md'), 'utf8');
    assert.match(out, /see compose-new-skill/);
  } finally { rmrf(root); }
});

test('prefix: --check 未前缀化时退出 1', () => {
  const root = mkRoot();
  try {
    writeSkill(root, 'brainstorming', 'brainstorming', '# b');
    let code = 0;
    try { run(root, ['--check']); } catch (e) { code = e.status ?? 1; }
    assert.equal(code, 1, '--check 发现需改动应退出 1');
  } finally { rmrf(root); }
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `node --test test/prefix-skills.test.js`
Expected: FAIL（脚本不存在，`execFileSync` 抛 ENOENT）。

- [ ] **Step 3: 写实现** `script/prefix-skills.mjs`

```js
#!/usr/bin/env node
// script/prefix-skills.mjs
// 维护者工具：对 skills/*/SKILL.md 与 agents/*.md 幂等地施加 compose- 前缀。
// 不进 npm 包（package.json files 白名单不含 script/）。
//
// 用法：
//   node script/prefix-skills.mjs            # 施加前缀（写文件）
//   node script/prefix-skills.mjs --check    # 只检查，不写；有改动退出 1
//   node script/prefix-skills.mjs --root <p> # 指定包根（默认脚本上一级）

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PREFIX = 'compose-';

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const root = argValue('--root') ? path.resolve(argValue('--root')) : path.resolve(here, '..');
const checkOnly = process.argv.includes('--check');
const skillsDir = path.join(root, 'skills');
const agentsDir = path.join(root, 'agents');

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readFrontmatterName(content) {
  const m = content.match(/^---\n([\s\S]*?\n)---/m);
  if (!m) return null;
  const nm = m[1].match(/^name:\s*(.+?)\s*$/m);
  return nm ? nm[1].replace(/^["']|["']$/g, '') : null;
}

// 从磁盘发现所有技能的"原始裸名"（去掉已有 compose- 前缀）
function collectBareNames() {
  if (!fs.existsSync(skillsDir)) return [];
  const dirs = fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory()).map((d) => d.name);
  const names = [];
  for (const dir of dirs) {
    const file = path.join(skillsDir, dir, 'SKILL.md');
    if (!fs.existsSync(file)) continue;
    const name = readFrontmatterName(fs.readFileSync(file, 'utf8'));
    if (!name) continue;
    names.push(name.startsWith(PREFIX) ? name.slice(PREFIX.length) : name);
  }
  return [...new Set(names)].sort();
}

function prefixFile(filePath, bareNames) {
  const original = fs.readFileSync(filePath, 'utf8');
  let content = original;

  // 1) frontmatter name 字段前缀化（仅 frontmatter 块内）
  content = content.replace(/^---\n([\s\S]*?\n)---/m, (block, fm) => {
    const newFm = fm.replace(/^(name:\s*)(.+?)\s*$/m, (line, k, v) => {
      const clean = v.replace(/^["']|["']$/g, '');
      return clean.startsWith(PREFIX) ? line : `${k}${PREFIX}${clean}`;
    });
    return `---\n${newFm}---`;
  });

  // 2) 全文每个裸名：带负向断言的整词替换（幂等，防双前缀）
  for (const bare of bareNames) {
    const re = new RegExp(`(?<!${escapeRe(PREFIX)})\\b${escapeRe(bare)}\\b`, 'gu');
    content = content.replace(re, PREFIX + bare);
  }
  return { content, changed: content !== original };
}

function listTargets() {
  const t = [];
  if (fs.existsSync(skillsDir)) {
    for (const dir of fs.readdirSync(skillsDir, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      const f = path.join(skillsDir, dir.name, 'SKILL.md');
      if (fs.existsSync(f)) t.push(f);
    }
  }
  if (fs.existsSync(agentsDir)) {
    for (const f of fs.readdirSync(agentsDir)) {
      if (f.endsWith('.md')) t.push(path.join(agentsDir, f));
    }
  }
  return t;
}

function main() {
  const bareNames = collectBareNames();
  if (bareNames.length === 0) {
    console.error(`未在 ${skillsDir} 发现任何技能，退出。`);
    process.exit(1);
  }
  let changed = 0;
  const changedFiles = [];
  for (const file of listTargets()) {
    const r = prefixFile(file, bareNames);
    if (r.changed) {
      changed++;
      changedFiles.push(path.relative(root, file));
      if (!checkOnly) fs.writeFileSync(file, r.content, 'utf8');
    }
  }
  console.log(`发现 ${bareNames.length} 个技能裸名：${bareNames.join(', ')}`);
  if (changed === 0) {
    console.log(checkOnly ? '[check] 全部已是 compose- 前缀，无需改动。' : '全部已是 compose- 前缀，无需改动。');
  } else {
    console.log(checkOnly ? `[check] ${changed} 个文件需要前缀化：` : `已前缀化 ${changed} 个文件：`);
    for (const f of changedFiles) console.log(`  ${f}`);
  }
  process.exit(checkOnly && changed > 0 ? 1 : 0);
}

main();
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `node --test test/prefix-skills.test.js`
Expected: PASS（6 个用例全过）。

- [ ] **Step 5: 提交**

```bash
git add script/prefix-skills.mjs test/prefix-skills.test.js
git commit -m "feat(script): 新增 prefix-skills.mjs 幂等前缀化工具及测试"
```

---

### Task 2: 对 skills/ 与 agents/ 施加前缀 + agent permission frontmatter

**Files:**
- Modify: `skills/*/SKILL.md`（14 个，由脚本产出）
- Modify: `agents/compose.md`, `agents/compose-dev.md`, `agents/compose-review.md`（脚本前缀化引用 + 手动加 permission frontmatter）

**Interfaces:**
- Consumes: Task 1 的 `script/prefix-skills.mjs`
- Produces: 仓库内 14 个技能 `name` 全部为 `compose-*`；3 个 agent 引用全部为 `compose-*` 且 frontmatter 带 `permission.skill."compose-*"="allow"`。

- [ ] **Step 1: 跑前缀脚本**

Run: `node script/prefix-skills.mjs`
Expected: 输出发现 14 个裸名，并列出被改动的 14 个 SKILL.md + 3 个 agents/*.md。

- [ ] **Step 2: 抽查产出正确**

Run: `rg "^name:" skills/*/SKILL.md`
Expected: 每行均为 `name: compose-<原名>`，无裸名残留、无 `compose-compose-`。

Run: `rg "compose-compose" skills agents`
Expected: 无匹配（无退出码 1 = 无匹配，正常）。

Run: `node script/prefix-skills.mjs --check; echo "exit=$LASTEXITCODE"`（PowerShell：`$LASTEXITCODE`）
Expected: `全部已是 compose- 前缀` 且退出码 0。

- [ ] **Step 3: 给三个 agent 加 permission frontmatter**

对 `agents/compose.md`，把 frontmatter 从：
```yaml
---
description: "The Superpowers development workflow."
mode: primary
color: "#8B5CF6"
steps: 100
---
```
改为：
```yaml
---
description: "The Superpowers development workflow."
mode: primary
color: "#8B5CF6"
steps: 100
permission:
  skill:
    "compose-*": "allow"
---
```

对 `agents/compose-dev.md`，从：
```yaml
---
description: "Implementation subagent for the compose workflow. Executes a single discrete task via TDD, systematic debugging, and verification."
mode: subagent
---
```
改为：
```yaml
---
description: "Implementation subagent for the compose workflow. Executes a single discrete task via TDD, systematic debugging, and verification."
mode: subagent
permission:
  skill:
    "compose-*": "allow"
---
```
（注：该 description 文本会被 Step 1 的脚本原样保留——脚本只改技能名 token，不动 description 里的普通词。`systematic debugging` 是普通词组不含连字符技能名，不受影响。）

对 `agents/compose-review.md`，从：
```yaml
---
description: "Two-stage code review subagent (spec compliance + code quality) for the compose workflow. Reports findings only; never edits code."
mode: subagent
---
```
改为：
```yaml
---
description: "Two-stage code review subagent (spec compliance + code quality) for the compose workflow. Reports findings only; never edits code."
mode: subagent
permission:
  skill:
    "compose-*": "allow"
---
```

- [ ] **Step 4: 确认 agent 正文引用已前缀化**

Run: `rg -n "using-superpowers|brainstorming|test-driven-development|systematic-debugging|verification-before-completion|writing-plans|executing-plans|subagent-driven-development|requesting-code-review|receiving-code-review|using-git-worktrees|finishing-a-development-branch|dispatching-parallel-agents|writing-skills" agents/`
Expected: 每个匹配都已带 `compose-` 前缀（无裸名）。重点核对 `compose.md` 的 bootstrap 行（`invoke the compose-using-superpowers skill`）、`compose-dev.md` 的 Mandatory skill load order 四项、`compose-review.md` 的 load order 两项。

- [ ] **Step 5: 提交**

```bash
git add skills agents
git commit -m "feat: 14 技能 compose- 命名空间化 + agent permission allow frontmatter

- skills/*/SKILL.md 的 name 与交叉引用前缀化为 compose-（由 prefix-skills.mjs 产出）
- 三个 agent frontmatter 新增 permission.skill compose-*:allow（isolation 的 allow 侧）"
```

---

### Task 3: installer — 全局 permission deny 块幂等写入

**Files:**
- Modify: `bin/lib.js`（新增常量 + `ensureSkillDeny` 纯函数 + 接入 `runInstall`）
- Modify: `test/installer.test.js`（新增 permission 用例）

**Interfaces:**
- Produces: `bin/lib.js` 导出 `SKILL_PERMISSION_KEY='compose-*'`、`SKILL_PREFIX='compose-'`、`ensureSkillDeny(config)`（返回 changed 布尔，原地改 config）。`runInstall` 在 skills.paths 步骤后调用它。

- [ ] **Step 1: 写失败测试**（追加到 `test/installer.test.js` 末尾）

```js
// ─── permission.skill compose-* deny 幂等写入 ─────────────────────────
test('ensureSkillDeny: 空 config 写入 compose-*:deny', () => {
  const cfg = {};
  assert.equal(lib.ensureSkillDeny(cfg), true);
  assert.deepEqual(cfg.permission.skill, { 'compose-*': 'deny' });
});

test('ensureSkillDeny: 标量 skill 升级为对象并保留原值于 *', () => {
  const cfg = { permission: { skill: 'ask' } };
  assert.equal(lib.ensureSkillDeny(cfg), true);
  assert.deepEqual(cfg.permission.skill, { '*': 'ask', 'compose-*': 'deny' });
});

test('ensureSkillDeny: 保留用户其它 skill 规则，compose-* 置于末尾', () => {
  const cfg = { permission: { skill: { 'pdf': 'allow' } } };
  assert.equal(lib.ensureSkillDeny(cfg), true);
  assert.deepEqual(cfg.permission.skill, { 'pdf': 'allow', 'compose-*': 'deny' });
  // compose-* 必须在 '*' 之后（这里无 *，但顺序仍为追加）
  assert.equal(Object.keys(cfg.permission.skill).pop(), 'compose-*');
});

test('ensureSkillDeny: 已是 deny 时幂等无改动', () => {
  const cfg = { permission: { skill: { '*': 'ask', 'compose-*': 'deny' } } };
  assert.equal(lib.ensureSkillDeny(cfg), false);
});

test('ensureSkillDeny: 若 compose-* 为非 deny 值则强制改 deny', () => {
  const cfg = { permission: { skill: { 'compose-*': 'allow' } } };
  assert.equal(lib.ensureSkillDeny(cfg), true);
  assert.equal(cfg.permission.skill['compose-*'], 'deny');
});

test('runInstall: kilo.jsonc 写入 permission.skill compose-*:deny', () => {
  const home = mkTempHome();
  try {
    const ctx = ctxFor(home);
    assert.equal(lib.runInstall({ context: ctx }), EXIT.OK);
    const cfg = lib.readJsonc(ctx.configFile);
    assert.equal(cfg.permission.skill['compose-*'], 'deny');
  } finally { rmrf(home); }
});

test('runInstall: 不破坏用户已有的其它 skill 规则', () => {
  const home = mkTempHome();
  try {
    const ctx = ctxFor(home);
    fs.mkdirSync(ctx.configDir, { recursive: true });
    fs.writeFileSync(ctx.configFile, JSON.stringify({
      permission: { skill: { 'pdf': 'allow' }, bash: 'allow' },
    }), 'utf8');
    assert.equal(lib.runInstall({ context: ctx }), EXIT.OK);
    const cfg = lib.readJsonc(ctx.configFile);
    assert.equal(cfg.permission.skill['pdf'], 'allow', '用户 pdf 规则保留');
    assert.equal(cfg.permission.skill['compose-*'], 'deny');
    assert.equal(cfg.permission.bash, 'allow', '用户 bash 规则保留');
  } finally { rmrf(home); }
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `node --test test/installer.test.js`
Expected: 新增 7 个用例 FAIL（`ensureSkillDeny` 未定义）。

- [ ] **Step 3: 实现** `bin/lib.js`

3a. 在常量区（`UPSTREAM_TAG` 附近）新增：
```js
// compose 技能命名空间前缀与权限键（见 docs/superpowers/specs/2026-07-13-...）。
export const SKILL_PREFIX = 'compose-';
export const SKILL_PERMISSION_KEY = 'compose-*';
```

3b. 在纯函数区（`skillsPathsContains` 附近）新增：
```js
// 确保 config.permission.skill[SKILL_PERMISSION_KEY] = 'deny'，且该键位于对象末尾
// （依赖 kilo Permission.evaluate 的 findLast：末尾的 compose-*:deny 才能赢过 *）。
// 标量 skill 升级为对象，原值保留于 '*' 键。返回是否发生改动。
export function ensureSkillDeny(config, key = SKILL_PERMISSION_KEY) {
  config.permission = config.permission || {};
  let skill = config.permission.skill;
  if (typeof skill === 'string') skill = { '*': skill };
  if (skill === undefined || skill === null) skill = {};
  skill = { ...skill };
  const changed = skill[key] !== 'deny';
  if (changed) {
    delete skill[key];
    skill[key] = 'deny'; // 删后重插末尾，保证顺序
  }
  config.permission.skill = skill;
  return changed;
}
```

3c. 在 `runInstall` 中，把现有 step 6（skills.paths 追加 + `if (added && !dryRun) writeJson(...)`）改为同时处理 permission：

定位现有代码块：
```js
  // 6. 追加 skills.paths（config 已在第 3 步解析校验通过）
  config.skills = config.skills || {};
  config.skills.paths = config.skills.paths || [];
  let added = false;
  if (!skillsPathsContains(config.skills.paths, srcSkills)) {
    config.skills.paths.push(srcSkills);
    added = true;
  }
  if (added && !dryRun) writeJson(ctx.configFile, config);
```
替换为：
```js
  // 6. 追加 skills.paths（config 已在第 3 步解析校验通过）
  config.skills = config.skills || {};
  config.skills.paths = config.skills.paths || [];
  let added = false;
  if (!skillsPathsContains(config.skills.paths, srcSkills)) {
    config.skills.paths.push(srcSkills);
    added = true;
  }
  // 6b. 确保 permission.skill['compose-*']='deny'（模型侧隔离的 deny 侧，幂等）
  const permChanged = ensureSkillDeny(config);
  if ((added || permChanged) && !dryRun) writeJson(ctx.configFile, config);
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `node --test test/installer.test.js`
Expected: PASS（全部用例，含新增 7 个）。

- [ ] **Step 5: 提交**

```bash
git add bin/lib.js test/installer.test.js
git commit -m "feat(installer): 全局 permission.skill compose-*:deny 幂等写入"
```

---

### Task 4: installer — junction 改名 compose + 旧 superpowers 迁移清理

**Files:**
- Modify: `bin/lib.js`（`resolvePaths` 的 skillLink、`runInstall` 加迁移清理、汇总输出）
- Modify: `test/installer.test.js`（更新 `resolvePaths` 断言、新增迁移用例）

**Interfaces:**
- Produces: `resolvePaths(home).skillLink` = `<home>/.kilo/skills/compose`。`runInstall` 在创建链接前，若 `<home>/.kilo/skills/superpowers` 存在则 `safeRemove`。

- [ ] **Step 1: 更新现有 resolvePaths 测试 + 写新迁移测试**

定位 `test/installer.test.js` 中的：
```js
test('resolvePaths: 派生所有目标路径', () => {
  const p = lib.resolvePaths('/tmp/fake');
  assert.equal(p.configDir, path.join('/tmp/fake', '.config', 'kilo'));
  assert.equal(p.configFile, path.join(p.configDir, 'kilo.jsonc'));
  assert.equal(p.skillLink, path.join('/tmp/fake', '.kilo', 'skills', 'superpowers'));
  assert.equal(p.manifestFile, path.join(p.configDir, '.kilo-superpowers-compose.json'));
});
```
把 `superpowers` 改为 `compose`：
```js
  assert.equal(p.skillLink, path.join('/tmp/fake', '.kilo', 'skills', 'compose'));
```

并定位往返测试中这行（约 212 行）：
```js
    assert.ok(lib.skillsPathsContains(cfg.skills.paths, ctx.skillLink.replace(/superpowers$/, '')) || cfg.skills.paths.length === 1);
```
替换为（去掉失效启发式，留确定性断言）：
```js
    assert.equal(cfg.skills.paths.length, 1, 'paths 应只有本包一条');
```

在文件末尾追加迁移用例：
```js
// ─── junction 改名 + 旧 superpowers 迁移清理 ──────────────────────────
test('install: 迁移清理旧 superpowers junction，新建 compose', () => {
  const home = mkTempHome();
  try {
    const ctx = ctxFor(home);
    fs.mkdirSync(ctx.skillsDir, { recursive: true });
    const legacy = path.join(ctx.skillsDir, 'superpowers');
    fs.symlinkSync(ctx.skillsDir, legacy, process.platform === 'win32' ? 'junction' : 'dir');
    assert.ok(fs.existsSync(legacy), '前置：旧 junction 存在');

    assert.equal(lib.runInstall({ context: ctx }), EXIT.OK);
    assert.ok(!fs.existsSync(legacy), '旧 superpowers junction 应被清理');
    assert.ok(fs.existsSync(ctx.skillLink), '新 compose junction 应存在');
    assert.ok(ctx.skillLink.endsWith(path.join('.kilo', 'skills', 'compose')));
  } finally { rmrf(home); }
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `node --test test/installer.test.js`
Expected: resolvePaths 测试 + 迁移测试 FAIL（skillLink 仍是 superpowers）。

- [ ] **Step 3: 实现** `bin/lib.js`

3a. 定位 `resolvePaths`：
```js
    skillLink: path.join(skillsDir, 'superpowers'),
```
改为：
```js
    skillLink: path.join(skillsDir, 'compose'),
```

3b. 在 `runInstall` 创建技能链接之前（即调用 `makeSkillsLink` 之前），新增迁移清理。定位：
```js
  // 4. 创建技能链接
  if (!fs.existsSync(srcSkills)) {
```
在其**之前**插入：
```js
  // 3.5 迁移清理：v0.1.x 旧版 junction 名为 'superpowers'，现已改名 'compose'。
  //     老用户升级时，旧的 superpowers 链接（指向旧 verbatim skills 源）已无意义，
  //     主动删掉以免残留两个链接。safeRemove 对 symlink 只删链接本身，安全。
  const legacyLink = path.join(ctx.skillsDir, 'superpowers');
  let legacyLinkRemoved = false;
  if (linkExists(legacyLink)) {
    legacyLinkRemoved = safeRemove(legacyLink, { dryRun, log });
  }

```

3c. 在汇总输出区（`console.log('✓ kilo-superpowers-compose 已安装')` 之后那段），新增一行提示。定位：
```js
  if (legacyRemovedOnInstall) {
    console.log(`  遗留命令: 已移除 ~/.config/kilo/commands/superpowers.md（来自 v0.1.3 之前版本）`);
  }
```
在其后加：
```js
  if (legacyLinkRemoved) {
    console.log(`  迁移: 已移除旧 ~/.kilo/skills/superpowers 链接（改为 compose）`);
  }
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `node --test test/installer.test.js`
Expected: PASS（含更新后的 resolvePaths + 新迁移用例）。

- [ ] **Step 5: 提交**

```bash
git add bin/lib.js test/installer.test.js
git commit -m "feat(installer): junction 改名 superpowers→compose 并迁移清理旧链接"
```

---

### Task 5: installer — 卸载精确移除 permission + manifest 字段

**Files:**
- Modify: `bin/lib.js`（`removeSkillDeny` 纯函数 + 接入 `runUninstall` + manifest 新增 `permissionKey`/`skillPrefix` + 卸载也清旧 superpowers 链接）
- Modify: `test/installer.test.js`（新增卸载精确移除用例）

**Interfaces:**
- Produces: `removeSkillDeny(config)` 返回是否移除；`runUninstall` 调用它并清理空容器。manifest 多两个字段。

- [ ] **Step 1: 写失败测试**（追加到 `test/installer.test.js` 末尾）

```js
// ─── removeSkillDeny 精确移除 ─────────────────────────────────────────
test('removeSkillDeny: 移除 compose-*，保留其它 skill 规则', () => {
  const cfg = { permission: { skill: { 'pdf': 'allow', 'compose-*': 'deny' } } };
  assert.equal(lib.removeSkillDeny(cfg), true);
  assert.deepEqual(cfg.permission.skill, { 'pdf': 'allow' });
});

test('removeSkillDeny: 仅 compose-* 时清空 skill 键与 permission 键', () => {
  const cfg = { permission: { skill: { 'compose-*': 'deny' } } };
  assert.equal(lib.removeSkillDeny(cfg), true);
  assert.ok(!('skill' in (cfg.permission || {})), 'skill 键应被删');
  assert.ok(cfg.permission === undefined || Object.keys(cfg.permission).length === 0,
    'permission 应被删或为空');
});

test('removeSkillDeny: 无 compose-* 时无改动返回 false', () => {
  const cfg = { permission: { skill: { 'pdf': 'allow' }, bash: 'allow' } };
  assert.equal(lib.removeSkillDeny(cfg), false);
  assert.equal(cfg.permission.bash, 'allow');
});

test('卸载：install→uninstall 后 kilo.jsonc 无 compose-* 且无 permission 残留', () => {
  const home = mkTempHome();
  try {
    const ctx = ctxFor(home);
    assert.equal(lib.runInstall({ context: ctx }), EXIT.OK);
    assert.equal(lib.runUninstall({ context: ctx }), EXIT.OK);
    const cfg = lib.readJsonc(ctx.configFile);
    assert.ok(!cfg.permission || !cfg.permission.skill || !('compose-*' in cfg.permission.skill),
      '卸载后不应残留 compose-*');
  } finally { rmrf(home); }
});

test('卸载：保留用户已有的 permission（非 compose-*）', () => {
  const home = mkTempHome();
  try {
    const ctx = ctxFor(home);
    fs.mkdirSync(ctx.configDir, { recursive: true });
    fs.writeFileSync(ctx.configFile, JSON.stringify({
      permission: { skill: { 'pdf': 'allow' }, bash: 'allow' },
    }), 'utf8');
    assert.equal(lib.runInstall({ context: ctx }), EXIT.OK);
    assert.equal(lib.runUninstall({ context: ctx }), EXIT.OK);
    const cfg = lib.readJsonc(ctx.configFile);
    assert.equal(cfg.permission.skill['pdf'], 'allow', '用户 pdf 规则保留');
    assert.equal(cfg.permission.bash, 'allow', '用户 bash 规则保留');
  } finally { rmrf(home); }
});

test('manifest: 含 permissionKey 与 skillPrefix 字段', () => {
  const home = mkTempHome();
  try {
    const ctx = ctxFor(home);
    assert.equal(lib.runInstall({ context: ctx }), EXIT.OK);
    const m = lib.readManifest(ctx.manifestFile);
    assert.equal(m.permissionKey, lib.SKILL_PERMISSION_KEY);
    assert.equal(m.skillPrefix, lib.SKILL_PREFIX);
  } finally { rmrf(home); }
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `node --test test/installer.test.js`
Expected: 新增 6 个用例 FAIL（`removeSkillDeny` 未定义、manifest 无新字段）。

- [ ] **Step 3: 实现** `bin/lib.js`

3a. 在 `ensureSkillDeny` 之后新增：
```js
// 移除 config.permission.skill[SKILL_PERMISSION_KEY]；删后容器若空则一并清理。
// 绝不动用户其它 skill / permission 规则。返回是否发生移除。
export function removeSkillDeny(config, key = SKILL_PERMISSION_KEY) {
  if (!config.permission || !config.permission.skill) return false;
  const skill = config.permission.skill;
  if (!(key in skill)) return false;
  delete skill[key];
  if (Object.keys(skill).length === 0) delete config.permission.skill;
  if (config.permission && Object.keys(config.permission).length === 0) delete config.permission;
  return true;
}
```

3b. `runUninstall` 中，定位现有"移除 skills.paths 条目"后写回的代码块：
```js
    removedEntries = before - config.skills.paths.length;
    if (!dryRun) writeJson(ctx.configFile, config);
  }
```
在 `removedEntries = ...` 之后、`if (!dryRun) writeJson` 之前插入 permission 移除，并把写回条件改为任一改动即写：
```js
    removedEntries = before - config.skills.paths.length;
    // 同步移除 permission.skill 的 compose-* 键（精确，保留用户其它规则）
    const permRemoved = removeSkillDeny(config);
    if ((removedEntries > 0 || permRemoved) && !dryRun) writeJson(ctx.configFile, config);
  }
```

3c. `runUninstall` 中，定位清理旧 `/superpowers.md` 命令的那段之后、移除技能链接之前，新增清旧 `superpowers` 链接（防御性，与 install 迁移对称）。定位：
```js
  // 2. 移除技能链接（清单有记录类型则用之，否则按链接处理）
  if (linkExists(ctx.skillLink)) {
    safeRemove(ctx.skillLink, { dryRun, log });
  }
```
替换为：
```js
  // 2. 移除技能链接（compose）；同时防御性清理旧版 'superpowers' 链接
  if (linkExists(ctx.skillLink)) {
    safeRemove(ctx.skillLink, { dryRun, log });
  }
  const legacyLinkUn = path.join(ctx.skillsDir, 'superpowers');
  if (linkExists(legacyLinkUn)) {
    safeRemove(legacyLinkUn, { dryRun, log });
  }
```

3d. manifest 写入新增字段。定位 `runInstall` 的 `writeManifest(ctx.manifestFile, { ... })` 块，在 `skillsLinkType` 之后、`skillsPathsEntry` 之前插入两个字段：
```js
      skillsLinkType: linkRes.type,
      permissionKey: SKILL_PERMISSION_KEY,
      skillPrefix: SKILL_PREFIX,
      skillsPathsEntry: srcSkills,
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `node --test test/installer.test.js`
Expected: PASS（含新增 6 个用例）。

- [ ] **Step 5: 提交**

```bash
git add bin/lib.js test/installer.test.js
git commit -m "feat(installer): 卸载精确移除 compose-* 权限键 + manifest 新增字段"
```

---

### Task 6: installer — 移除 KILO_SUPERPOWERS_PREFIX 死桩

**Files:**
- Modify: `bin/lib.js`（`readEnv` 删 `USE_PREFIX`）
- Modify: `test/installer.test.js`（`readEnv` 测试删 `USE_PREFIX` 断言）

**Interfaces:**
- Produces: `readEnv` 不再返回 `USE_PREFIX`。前缀内生为 `compose-`。

- [ ] **Step 1: 更新现有 readEnv 测试**

定位 `test/installer.test.js` 中：
```js
test('readEnv: 标志位按 "1" 解析', () => {
  const e = lib.readEnv({
    KILO_HOME: '/tmp/fake',
    KILO_SUPERPOWERS_DRY_RUN: '1',
    KILO_SUPERPOWERS_VERBOSE: '1',
    KILO_SUPERPOWERS_PREFIX: '1',
  });
  assert.equal(e.DRY_RUN, true);
  assert.equal(e.VERBOSE, true);
  assert.equal(e.USE_PREFIX, true);
});
```
改为（移除 PREFIX 入参与断言）：
```js
test('readEnv: 标志位按 "1" 解析（无 PREFIX 死桩）', () => {
  const e = lib.readEnv({
    KILO_HOME: '/tmp/fake',
    KILO_SUPERPOWERS_DRY_RUN: '1',
    KILO_SUPERPOWERS_VERBOSE: '1',
  });
  assert.equal(e.DRY_RUN, true);
  assert.equal(e.VERBOSE, true);
  assert.equal(e.USE_PREFIX, undefined, 'USE_PREFIX 死桩应已移除');
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `node --test test/installer.test.js`
Expected: 该用例 FAIL（`USE_PREFIX` 仍为 true）。

- [ ] **Step 3: 实现** `bin/lib.js`

定位 `readEnv`：
```js
export function readEnv(env = process.env) {
  return {
    HOME: env.KILO_HOME || os.homedir(),
    DRY_RUN: env.KILO_SUPERPOWERS_DRY_RUN === '1',
    VERBOSE: env.KILO_SUPERPOWERS_VERBOSE === '1',
    USE_PREFIX: env.KILO_SUPERPOWERS_PREFIX === '1',
  };
}
```
改为：
```js
export function readEnv(env = process.env) {
  return {
    HOME: env.KILO_HOME || os.homedir(),
    DRY_RUN: env.KILO_SUPERPOWERS_DRY_RUN === '1',
    VERBOSE: env.KILO_SUPERPOWERS_VERBOSE === '1',
  };
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `node --test`
Expected: 全部 PASS（两个测试文件）。

- [ ] **Step 5: 提交**

```bash
git add bin/lib.js test/installer.test.js
git commit -m "chore(installer): 移除未消费的 KILO_SUPERPOWERS_PREFIX 死桩"
```

---

### Task 7: `script/vendor.mjs`（维护者重新 vendor 工具）

**Files:**
- Create: `script/vendor.mjs`
- Create: `test/vendor.test.js`（仅纯函数 validateTag）

**Interfaces:**
- Produces: CLI `node script/vendor.mjs <tag>`，用 git 克隆 obra/superpowers@tag 到临时目录，把其 `skills/` 覆盖到包根 `skills/`（还原 verbatim，不施加前缀）。

- [ ] **Step 1: 写失败测试** `test/vendor.test.js`

```js
// test/vendor.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';

// 直接导入待测纯函数
const mod = await import('../script/vendor.mjs');

test('validateTag: 接受 vX.Y.Z 形式', () => {
  assert.equal(mod.validateTag('v6.1.1'), 'v6.1.1');
  assert.equal(mod.validateTag('v6.2.0'), 'v6.2.0');
});

test('validateTag: 拒绝非法 tag', () => {
  assert.throws(() => mod.validateTag('main'), /tag must match/);
  assert.throws(() => mod.validateTag(''), /tag must match/);
  assert.throws(() => mod.validateTag('v6'), /tag must match/);
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `node --test test/vendor.test.js`
Expected: FAIL（模块不存在 / `validateTag` 未导出）。

- [ ] **Step 3: 写实现** `script/vendor.mjs`

```js
#!/usr/bin/env node
// script/vendor.mjs
// 维护者工具：从 obra/superpowers 指定 tag 重新 vendor skills/（还原 verbatim）。
// 不施加前缀——前缀由 prefix-skills.mjs 单独负责（职责分离，便于审 diff）。
// 不进 npm 包。需要本机有 git。
//
// 用法：node script/vendor.mjs <tag>   例：node script/vendor.mjs v6.2.0

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = 'https://github.com/obra/superpowers.git';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

// tag 必须形如 vX.Y.Z，避免误用分支名（分支会漂移）。
export function validateTag(tag) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) {
    throw new Error(`tag must match vX.Y.Z, got: ${JSON.stringify(tag)}`);
  }
  return tag;
}

function main() {
  const tag = process.argv[2];
  if (!tag) {
    console.error('用法：node script/vendor.mjs <tag>   例：v6.2.0');
    process.exit(1);
  }
  validateTag(tag);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'obra-vendor-'));
  try {
    console.log(`克隆 obra/superpowers@${tag} → ${tmp}`);
    execSync(`git clone --depth 1 --branch ${tag} ${REPO} ${tmp}`, { stdio: 'inherit' });

    const commit = execSync(`git -C ${tmp} rev-parse HEAD`, { encoding: 'utf8' }).trim();
    const srcSkills = path.join(tmp, 'skills');
    if (!fs.existsSync(srcSkills)) {
      console.error(`✗ 上游 ${tag} 无 skills/ 目录`);
      process.exit(1);
    }

    const dstSkills = path.join(root, 'skills');
    // 清空旧 skills/（含前缀化产物），写入 verbatim 新内容
    fs.rmSync(dstSkills, { recursive: true, force: true });
    fs.cpSync(srcSkills, dstSkills, { recursive: true });

    const count = fs.readdirSync(dstSkills, { withFileTypes: true })
      .filter((d) => d.isDirectory()).length;
    console.log(`✓ 已 vendor ${count} 个技能（verbatim，未前缀化）`);
    console.log(`  tag=${tag}  commit=${commit}`);
    console.log(`  下一步：node script/prefix-skills.mjs  ① node --test  ② 更新 NOTICE/DESIGN.md`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// 仅在直接运行时执行 main；被 import（测试）时不自动跑。
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `node --test test/vendor.test.js`
Expected: PASS（2 个用例）。

- [ ] **Step 5: 提交**

```bash
git add script/vendor.mjs test/vendor.test.js
git commit -m "feat(script): 新增 vendor.mjs 从 obra 重新 vendor skills（含 validateTag 测试）"
```

---

### Task 8: 文档修订（NOTICE / DESIGN.md / AGENTS.md）

**Files:**
- Modify: `NOTICE`
- Modify: `docs/DESIGN.md`
- Modify: `AGENTS.md`

**Interfaces:** 无（纯文档）。

- [ ] **Step 1: 修订 NOTICE**

定位 NOTICE 中：
```
The `skills/` directory of this package is a **verbatim, unmodified copy**
of the `skills/` directory from the upstream project:
```
改为：
```
The `skills/` directory of this package is **derived from** the `skills/`
directory of the upstream project:
```

定位：
```
The 14 vendored skills (each a `<name>/SKILL.md` plus any sibling files
such as reference notes, example prompts, or helper scripts) are copied
unchanged so that the upstream MIT attribution and authorship are
preserved:
```
改为：
```
The 14 vendored skills (each a `<name>/SKILL.md` plus any sibling files)
are derived from the upstream: each skill's frontmatter `name` field is
namespaced under a `compose-` prefix (e.g. `compose-brainstorming`) and
all cross-references between skills are updated accordingly, to achieve
model-side isolation of the compose workflow via Kilo's `permission.skill`
mechanism. All other content (skill bodies, reference notes, helper
scripts, copyright/attribution headers) is preserved unchanged. The
upstream MIT attribution and authorship are retained:
```

在 NOTICE 末尾的升级说明段（`To upgrade the vendored skills: ...`）替换为：
```
To upgrade the vendored skills:

  1. node script/vendor.mjs <new-tag>      # re-vendor verbatim skills/
  2. node script/prefix-skills.mjs         # re-apply compose- prefix (idempotent)
  3. node --test                            # verify
  4. update the tag/commit above in this file; update docs/DESIGN.md §10 Q3

Because skill permission uses the `compose-*` glob (not an enumerated
list), newly added upstream skills are covered automatically — the only
manual work is deciding whether to wire a new skill into the compose
agent prompts.
```

- [ ] **Step 2: 修订 docs/DESIGN.md**

2a. §6 中定位：
```
└─ ~/.config/kilo/kilo.jsonc.skills.paths += pkg/skills
```
这行所在的架构图与正文不必改路径（仍是 pkg/skills），但在 §6 正文 "We **don't copy**..." 之后补一段：
```
> 注（v0.2）：技能 junction 名从 `superpowers` 改为 `compose`（与命名空间
> 一致）；老版本残留的 `superpowers` 链接由 installer 迁移清理。
```

2b. §10 Q1，把状态从 ❓ 改为 ✅：
```
### ✅ Q1: Skill name collision strategy  (resolved — namespaced under `compose-`)

All 14 skills are prefixed `compose-` (e.g. `compose-brainstorming`), which
eliminates collisions with user skills at both the discovery layer (distinct
names) and the permission layer (glob `compose-*`). The legacy
`KILO_SUPERPOWERS_PREFIX` env var has been removed — prefixing is now intrinsic.
```

2c. §10 Q3，修订 verbatim 措辞。定位：
```
**Decision:** pinned to tag **`v6.1.1`** (commit `d884ae04edebef577e82ff7c4e143debd0bbec99`).
Skills are vendored (copied into the repo, not a submodule), so the repo
holds a frozen snapshot. `NOTICE` records the tag, commit, source URL, and
MIT license. To upgrade: re-vendor `skills/` from a newer tag deliberately
and update `NOTICE`. The 14 skills at this tag are enumerated in §3.
```
改为：
```
**Decision:** pinned to tag **`v6.1.1`** (commit `d884ae04edebef577e82ff7c4e143debd0bbec99`).
Skills are vendored (copied into the repo, not a submodule) and **derived**:
each `name` field is namespaced `compose-` and cross-references updated
(see §13). `NOTICE` records the tag, commit, source URL, and MIT license.
To upgrade: `node script/vendor.mjs <tag>` then `node script/prefix-skills.mjs`
(idempotent), then update `NOTICE`. The 14 skills at this tag are enumerated in §3.
```

2d. 新增 §13（在 §12 风险登记之后）：
```
## 13. Compose skill isolation (model-side)

The 14 compose skills are namespaced `compose-*` and isolated via Kilo's
`permission.skill` mechanism:

- **Global deny** (written by installer into `~/.config/kilo/kilo.jsonc`):
  `permission.skill["compose-*"] = "deny"`. Built-in agents (code/plan/
  debug/ask/explore/general) inherit this and can neither see nor invoke
  compose skills. Other (non-compose) skills remain available to them.
- **Compose allow** (baked into `compose`/`compose-dev`/`compose-review`
  frontmatter): `permission.skill["compose-*"] = "allow"`. Kilo's
  `Permission.evaluate` uses `findLast`, so the agent-frontmatter `allow`
  (merged last) wins over the global `deny`.

**Scope — model-side only:** this hides compose skills from the *models*
of other agents. Users can still manually invoke `/compose-<skill>` in any
agent (Kilo's slash menu and Skills dialog read `skill.all()` unfiltered);
this is an intentional escape hatch, not a defect. Full user-side hiding
would require a Kilo core change (filtering `command.list()`/Skills dialog
by `Skill.available(agent)`) and is out of scope for this plugin.

See `docs/superpowers/specs/2026-07-13-compose-skill-isolation-design.md`
for the full design and verified Kilo source evidence.
```

- [ ] **Step 3: 修订 AGENTS.md**

定位 AGENTS.md 中：
```
- **技能原样内嵌自 obra/superpowers（MIT 许可）。** 每个 `SKILL.md` 都要保留原始
  版权 / 署名头。锁定到 obra/superpowers `v6.1.1`，并谨慎升级（DESIGN.md §10 Q3）。
  本包自身为 MIT 许可（见 `LICENSE` 与 `NOTICE`）。
```
改为：
```
- **技能派生自 obra/superpowers（MIT 许可）。** 每个技能的 frontmatter `name`
  命名空间化为 `compose-`、交叉引用同步更新（实现模型侧隔离，见 DESIGN.md §13）；
  技能正文、references、scripts、版权署名头保持不变。锁定到 obra/superpowers
  `v6.1.1`。重新 vendor 须跑 `script/vendor.mjs <tag>` + `script/prefix-skills.mjs`
  （幂等），并谨慎升级（DESIGN.md §10 Q3）。本包自身为 MIT 许可（见 `LICENSE`
  与 `NOTICE`）。
```

- [ ] **Step 4: 全量测试确认未破坏**

Run: `node --test`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add NOTICE docs/DESIGN.md AGENTS.md
git commit -m "docs: 修订 NOTICE/DESIGN/AGENTS 反映 compose- 派生命名与隔离机制"
```

---

### Task 9: 全量验证（verification-before-completion）

**Files:** 无（验证步骤，不产生提交；若发现缺陷则回到对应任务）。

- [ ] **Step 1: 全量测试**

Run: `node --test`
Expected: 三个测试文件全部 PASS。

- [ ] **Step 2: 前缀化完整性自检**

Run: `node script/prefix-skills.mjs --check; echo exit=$LASTEXITCODE`
Expected: `全部已是 compose- 前缀`，退出码 0。

Run: `rg "^name:" skills/*/SKILL.md | rg -v "compose-"`
Expected: 无输出（所有 name 都带前缀）。

Run: `rg "compose-compose" skills agents`
Expected: 无输出（无双前缀）。

- [ ] **Step 3: 发布包不含 script/**

Run: `npm pack --dry-run 2>&1 | rg "script/"`
Expected: 无输出（script/ 不在包内）。

- [ ] **Step 4: 隔离 KILO_HOME 实测**

在隔离环境跑一次真实安装，确认行为：
```powershell
$t = Join-Path $env:TEMP "kilo-iso-verify"
$env:KILO_HOME = $t
node bin/cli.js install
```
检查 `$t\.config\kilo\kilo.jsonc` 含 `permission.skill` 的 `compose-*:deny`；
检查 `$t\.kilo\skills\compose` junction 存在、无 `superpowers` 残留；
检查 `$t\.config\kilo\agent\compose.md` frontmatter 含 `compose-*:allow`。
然后 `node bin/cli.js uninstall`，确认 `compose-*` 键被精确移除、用户其它配置不动。

实测后清理：`Remove-Item -Recurse -Force $t`，`Remove-Item Env:\KILO_HOME`。

- [ ] **Step 5: 验证总结**

确认全部通过后，向 compose 汇报：隔离机制（模型侧）按 spec §3 工作，前缀化完整，installer 幂等，卸载精确，文档已同步。准备进入 `finishing-a-development-branch`。

---

## Self-Review（plan vs spec 覆盖核对）

- spec §3（隔离设计 / 权限形态）→ Task 3（deny 写入）+ Task 2（agent allow frontmatter）。✓
- spec §4（前缀规则 / 14 名单 / 目录保持 verbatim）→ Task 1+2。✓
- spec §5（prefix-skills / vendor 脚本契约）→ Task 1+7。✓
- spec §6.1–6.6（installer 全部改动）→ Task 3（6.1）+ Task 4（6.3 junction）+ Task 5（6.2 manifest / 6.4 卸载）+ Task 6（6.5 移除死桩）。6.2 manifest 的 permissionKey/skillPrefix 在 Task 5；6.3 迁移清理在 Task 4；6.6 既有保证不变（未改动）。✓
- spec §7（agent frontmatter 改动）→ Task 2 Step 3。✓
- spec §8（升级与迁移）→ Task 4（迁移）+ Task 9（实测）。✓
- spec §9（文档修订 NOTICE/DESIGN/AGENTS）→ Task 8。✓
- spec §10（测试矩阵）→ Task 1/3/4/5/6/7 测试 + Task 9 验证。✓
- spec §11（风险）→ 标量升级（Task 3 测试覆盖）、键顺序（Task 3 ensureSkillDeny 注释 + 测试）、findLast 依赖（DESIGN §13 文档化）。✓

无占位符；类型/函数名一致（`ensureSkillDeny` / `removeSkillDeny` / `SKILL_PERMISSION_KEY` / `SKILL_PREFIX` / `validateTag` 跨任务一致）。
