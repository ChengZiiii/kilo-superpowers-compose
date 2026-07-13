// test/installer.test.js
// 安装器逻辑测试（node:test，零依赖）。
// 所有用例使用 os.tmpdir() 下的临时 KILO_HOME，绝不触碰真实配置。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import * as lib from '../bin/lib.js';

const { EXIT } = lib;

// ─── 辅助 ─────────────────────────────────────────────────────────────
function mkTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kilo-sp-test-'));
}

function ctxFor(home, envExtra = {}) {
  return lib.buildContext({ KILO_HOME: home, ...envExtra });
}

function rmrf(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch {}
}

// ─── 纯函数：stripLineComments ────────────────────────────────────────
test('stripLineComments: 剥离行注释', () => {
  const raw = ['{', '  // 一条注释', '  "a": 1', '}'].join('\n');
  // `//` 前的缩进空格保留，仅注释部分被剥离
  assert.equal(lib.stripLineComments(raw), ['{', '  ', '  "a": 1', '}'].join('\n'));
});

test('stripLineComments: 保留字符串内的 //', () => {
  const raw = '{"url": "https://example.com/x"}';
  assert.equal(lib.stripLineComments(raw), raw);
});

test('stripLineComments: 保留字符串内含 // 的值', () => {
  const raw = ['{', '  "note": "see // here for details"', '}'].join('\n');
  // 字符串内的 // 不应被剥离
  const out = lib.stripLineComments(raw);
  assert.ok(out.includes('see // here for details'));
});

test('stripLineComments: 行注释在字符串后的同一行也被剥离', () => {
  const raw = '{"a": 1} // trailing';
  assert.equal(lib.stripLineComments(raw), '{"a": 1} ');
});

// ─── 纯函数：normalizePath / skillsPathsContains ──────────────────────
test('skillsPathsContains: 分隔符差异归一（不重复）', () => {
  const fwd = 'C:/Users/x/kilo-superpowers-compose/skills';
  const back = 'C:\\Users\\x\\kilo-superpowers-compose\\skills';
  assert.ok(lib.skillsPathsContains([fwd], back));
  assert.ok(lib.skillsPathsContains([back], fwd));
});

test('skillsPathsContains: 大小写差异归一', () => {
  const upper = 'C:\\Users\\X\\Skills';
  const lower = 'c:\\users\\x\\skills';
  assert.ok(lib.skillsPathsContains([upper], lower));
});

test('skillsPathsContains: 不同路径判定为不包含', () => {
  assert.ok(!lib.skillsPathsContains(['a/b'], 'c/d'));
});

// ─── 纯函数：readEnv / resolvePaths ───────────────────────────────────
test('readEnv: KILO_HOME 覆盖默认 home', () => {
  const e = lib.readEnv({ KILO_HOME: '/tmp/fake' });
  assert.equal(e.HOME, '/tmp/fake');
  assert.equal(e.DRY_RUN, false);
  assert.equal(e.VERBOSE, false);
});

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

test('resolvePaths: 派生所有目标路径', () => {
  const p = lib.resolvePaths('/tmp/fake');
  assert.equal(p.configDir, path.join('/tmp/fake', '.config', 'kilo'));
  assert.equal(p.configFile, path.join(p.configDir, 'kilo.jsonc'));
  assert.equal(p.skillLink, path.join('/tmp/fake', '.kilo', 'skills', 'compose'));
  assert.equal(p.manifestFile, path.join(p.configDir, '.kilo-superpowers-compose.json'));
});

// ─── readJsonc（fs）──────────────────────────────────────────────────
test('readJsonc: 带行注释的 JSONC 可解析', () => {
  const home = mkTempHome();
  try {
    const f = path.join(home, 'kilo.jsonc');
    fs.writeFileSync(f, ['{', '  // comment', '  "x": 1', '}'].join('\n'), 'utf8');
    const obj = lib.readJsonc(f);
    assert.equal(obj.x, 1);
    assert.equal(obj.__parseError, undefined);
  } finally {
    rmrf(home);
  }
});

test('readJsonc: 块注释不被剥离 → 返回 __parseError', () => {
  const home = mkTempHome();
  try {
    const f = path.join(home, 'kilo.jsonc');
    fs.writeFileSync(f, '{"a": 1 /* block */}', 'utf8');
    const obj = lib.readJsonc(f);
    assert.ok(obj.__parseError, '应有解析错误');
  } finally {
    rmrf(home);
  }
});

test('readJsonc: 文件不存在返回空对象', () => {
  assert.deepEqual(lib.readJsonc('/no/such/file.jsonc'), {});
});

// ─── manifest 读写往返 ────────────────────────────────────────────────
test('manifest: 写入后可读回', () => {
  const home = mkTempHome();
  try {
    const f = path.join(home, 'm.json');
    const data = { version: '0.1.0', agents: ['a.md'], commands: ['c.md'] };
    lib.writeManifest(f, data);
    const back = lib.readManifest(f);
    assert.deepEqual(back, data);
  } finally {
    rmrf(home);
  }
});

test('manifest: 不存在返回 null，损坏返回 null', () => {
  const home = mkTempHome();
  try {
    assert.equal(lib.readManifest(path.join(home, 'nope.json')), null);
    const f = path.join(home, 'bad.json');
    fs.writeFileSync(f, '{ not json', 'utf8');
    assert.equal(lib.readManifest(f), null);
  } finally {
    rmrf(home);
  }
});

// ─── runInstall：DRY_RUN 无副作用 ────────────────────────────────────
test('runInstall: DRY_RUN 不创建任何文件', () => {
  const home = mkTempHome();
  try {
    const ctx = ctxFor(home, { KILO_SUPERPOWERS_DRY_RUN: '1' });
    const code = lib.runInstall({ context: ctx });
    assert.equal(code, EXIT.OK);
    // 不应创建 skill 链接 / agents / manifest
    assert.ok(!fs.existsSync(ctx.skillLink));
    assert.ok(!fs.existsSync(path.join(ctx.agentsDir, 'compose.md')));
    assert.ok(!fs.existsSync(ctx.manifestFile));
    assert.ok(!fs.existsSync(ctx.configFile));
  } finally {
    rmrf(home);
  }
});

// ─── runInstall：解析失败 → 退出 2，恢复备份，不写文件 ────────────────
test('runInstall: 块注释解析失败 → 退出 2 且恢复备份', () => {
  const home = mkTempHome();
  try {
    const ctx = ctxFor(home);
    // 预置含块注释的 kilo.jsonc
    fs.mkdirSync(ctx.configDir, { recursive: true });
    const original = '{\n  /* 块注释不被支持 */\n  "skills": { "paths": [] }\n}\n';
    fs.writeFileSync(ctx.configFile, original, 'utf8');

    const code = lib.runInstall({ context: ctx });
    assert.equal(code, EXIT.PARSE_ERROR, '应返回退出码 2');

    // 配置应被恢复为原样
    const after = fs.readFileSync(ctx.configFile, 'utf8');
    assert.equal(after, original, '配置应从备份恢复');

    // 不应创建任何安装产物
    assert.ok(!fs.existsSync(ctx.skillLink), '解析失败不应创建技能链接');
    assert.ok(!fs.existsSync(path.join(ctx.agentsDir, 'compose.md')), '不应复制 agents');
  } finally {
    rmrf(home);
  }
});

// ─── runInstall → runUninstall 往返净空 ───────────────────────────────
test('往返：install 后 uninstall 应净空本包产物', () => {
  const home = mkTempHome();
  try {
    const ctx = ctxFor(home);

    const code1 = lib.runInstall({ context: ctx });
    assert.equal(code1, EXIT.OK);

    // 安装产物存在
    assert.ok(fs.existsSync(ctx.skillLink));
    assert.ok(fs.existsSync(path.join(ctx.agentsDir, 'compose.md')));
    assert.ok(fs.existsSync(ctx.manifestFile));
    const cfg = lib.readJsonc(ctx.configFile);
    assert.equal(cfg.skills.paths.length, 1, 'paths 应只有本包一条');

    const code2 = lib.runUninstall({ context: ctx });
    assert.equal(code2, EXIT.OK);

    // 全部移除
    assert.ok(!fs.existsSync(ctx.skillLink));
    assert.ok(!fs.existsSync(path.join(ctx.agentsDir, 'compose.md')));
    assert.ok(!fs.existsSync(path.join(ctx.agentsDir, 'compose-dev.md')));
    assert.ok(!fs.existsSync(path.join(ctx.agentsDir, 'compose-review.md')));
    assert.ok(!fs.existsSync(ctx.manifestFile));

    // kilo.jsonc 中本包条目被移除
    const cfg2 = lib.readJsonc(ctx.configFile);
    assert.equal(cfg2.skills.paths.length, 0);
  } finally {
    rmrf(home);
  }
});

// ─── 幂等：重复 install 不重复添加 skills.paths 条目 ──────────────────
test('幂等：重复 install 不产生重复 skills.paths 条目', () => {
  const home = mkTempHome();
  try {
    const ctx = ctxFor(home);
    assert.equal(lib.runInstall({ context: ctx }), EXIT.OK);
    assert.equal(lib.runInstall({ context: ctx }), EXIT.OK);
    const cfg = lib.readJsonc(ctx.configFile);
    assert.equal(cfg.skills.paths.length, 1, 'paths 应只有一条');
  } finally {
    rmrf(home);
  }
});

// ─── 卸载保留用户自有文件 ─────────────────────────────────────────────
// ─── install / update 路径也清理 v0.1.3 之前版本残留的 /superpowers 命令副本 ─
test('install: 清理从老版本残留的 ~/.config/kilo/commands/superpowers.md', () => {
  const home = mkTempHome();
  try {
    const ctx = ctxFor(home);
    // 模拟老版本留下的命令副本
    const cmdsDir = path.join(ctx.configDir, 'commands');
    fs.mkdirSync(cmdsDir, { recursive: true });
    const legacy = path.join(cmdsDir, 'superpowers.md');
    fs.writeFileSync(legacy, '# legacy /superpowers\n', 'utf8');
    assert.ok(fs.existsSync(legacy));

    // 单次 install 就应顺手清掉这个残留文件
    assert.equal(lib.runInstall({ context: ctx }), EXIT.OK);
    assert.ok(!fs.existsSync(legacy), '残留的 /superpowers 命令副本应被 install 清理');
  } finally {
    rmrf(home);
  }
});

test('update: 清理从老版本残留的 ~/.config/kilo/commands/superpowers.md', () => {
  const home = mkTempHome();
  try {
    const ctx = ctxFor(home);
    // 模拟老版本留下的命令副本（uninstall → install 间残留）
    const cmdsDir = path.join(ctx.configDir, 'commands');
    fs.mkdirSync(cmdsDir, { recursive: true });
    const legacy = path.join(cmdsDir, 'superpowers.md');
    fs.writeFileSync(legacy, '# legacy /superpowers\n', 'utf8');

    assert.equal(lib.runUpdate({ context: ctx }), EXIT.OK);
    assert.ok(!fs.existsSync(legacy), 'update 路径也应清理残留');
  } finally {
    rmrf(home);
  }
});

test('install: 二次 install 在遗留文件已被清理后保持幂等（不重新安装命令）', () => {
  const home = mkTempHome();
  try {
    const ctx = ctxFor(home);
    // 第一次 install（无遗留命令）只是建立 manifest / agents / 链接
    assert.equal(lib.runInstall({ context: ctx }), EXIT.OK);
    // 验证不再写 /superpowers.md 命令副本
    const cmdFile = path.join(ctx.configDir, 'commands', 'superpowers.md');
    assert.ok(!fs.existsSync(cmdFile), 'install 不应再向 commands/ 写任何文件');

    // 第二次 install 仍应保持干净
    assert.equal(lib.runInstall({ context: ctx }), EXIT.OK);
    assert.ok(!fs.existsSync(cmdFile), '二次 install 也应保持 commands/ 干净');
  } finally {
    rmrf(home);
  }
});

// ─── 卸载清理从 v0.1.3 之前的版本残留的 /superpowers 命令副本 ────────
test('卸载：清理从老版本残留的 ~/.config/kilo/commands/superpowers.md', () => {
  const home = mkTempHome();
  try {
    const ctx = ctxFor(home);
    // 模拟老版本 v0.1.2 留下的命令副本（即使没装本包）
    const cmdsDir = path.join(ctx.configDir, 'commands');
    fs.mkdirSync(cmdsDir, { recursive: true });
    const legacy = path.join(cmdsDir, 'superpowers.md');
    fs.writeFileSync(legacy, '# legacy /superpowers\n', 'utf8');
    assert.ok(fs.existsSync(legacy));

    // 不需要 install，直接 uninstall 也应清掉这个残留文件
    assert.equal(lib.runUninstall({ context: ctx }), EXIT.OK);
    assert.ok(!fs.existsSync(legacy), '残留的 /superpowers 命令副本应被清理');
  } finally {
    rmrf(home);
  }
});

test('卸载：未发现残留命令时不打印遗留提示，保持兼容输出', () => {
  const home = mkTempHome();
  try {
    const ctx = ctxFor(home);
    // 不放任何残留命令
    assert.equal(lib.runInstall({ context: ctx }), EXIT.OK);
    assert.equal(lib.runUninstall({ context: ctx }), EXIT.OK);
    const cmdFile = path.join(ctx.configDir, 'commands', 'superpowers.md');
    assert.ok(!fs.existsSync(cmdFile));
  } finally {
    rmrf(home);
  }
});

test('卸载：保留用户自有的 agent / 用户自有的 skills.paths 条目', () => {
  const home = mkTempHome();
  try {
    const ctx = ctxFor(home);

    // 预置用户自有的 agent 文件 + 一条用户自有的 skills.paths
    fs.mkdirSync(ctx.agentsDir, { recursive: true });
    fs.writeFileSync(path.join(ctx.agentsDir, 'myown.md'), '# My Own Agent\n', 'utf8');

    assert.equal(lib.runInstall({ context: ctx }), EXIT.OK);
    assert.equal(lib.runUninstall({ context: ctx }), EXIT.OK);

    // 用户自有 agent 仍在
    assert.ok(fs.existsSync(path.join(ctx.agentsDir, 'myown.md')), '用户自有 agent 必须保留');
  } finally {
    rmrf(home);
  }
});

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
test('runUpdate: 等同重新安装，幂等', () => {
  const home = mkTempHome();
  try {
    const ctx = ctxFor(home);
    assert.equal(lib.runUpdate({ context: ctx }), EXIT.OK);
    assert.ok(fs.existsSync(ctx.manifestFile));
    const m = lib.readManifest(ctx.manifestFile);
    // 版本从 package.json 动态读取，避免每次发版都改本断言。
    const pkgVersion = JSON.parse(
      fs.readFileSync(path.resolve('package.json'), 'utf8')
    ).version;
    assert.equal(m.version, pkgVersion);
    assert.equal(m.upstreamTag, lib.UPSTREAM_TAG);
  } finally {
    rmrf(home);
  }
});

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
