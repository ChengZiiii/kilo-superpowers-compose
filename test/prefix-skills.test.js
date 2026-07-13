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
