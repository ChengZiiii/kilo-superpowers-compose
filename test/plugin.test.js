// test/plugin.test.js
// 插件模块（plugin/index.js，Path B）纯逻辑测试（node:test，零依赖）。
// 所有用例使用 os.tmpdir() 下的临时目录或显式传入的路径，绝不触碰真实配置。
// 注：本包不再注册任何斜杠命令；用户通过选取 compose 代理进入工作流。
// 因此不需要 needsSetup / runSetup 这类用于同步命令副本的机制。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import * as P from '../plugin/index.js';

// ─── 辅助 ─────────────────────────────────────────────────────────────
function mkTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kilo-sp-plugin-'));
}

function rmrf(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch {}
}

// 临时接管 KILO_HOME，返回恢复函数。
function withKiloHome(home) {
  const prev = process.env.KILO_HOME;
  process.env.KILO_HOME = home;
  return () => {
    if (prev === undefined) delete process.env.KILO_HOME;
    else process.env.KILO_HOME = prev;
  };
}

// ─── 纯函数：normalizePath / skillsPathsContains ───────────────────────
test('normalizePath: 归一大小写与分隔符', () => {
  assert.equal(P.normalizePath('C:/Users/X/Skills'), P.normalizePath('c:\\users\\x\\skills'));
});

test('skillsPathsContains: 分隔符差异归一（不重复）', () => {
  const fwd = 'C:/Users/x/kilo-superpowers-compose/skills';
  const back = 'C:\\Users\\x\\kilo-superpowers-compose\\skills';
  assert.ok(P.skillsPathsContains([fwd], back));
  assert.ok(P.skillsPathsContains([back], fwd));
});

test('skillsPathsContains: 不同路径判定为不包含', () => {
  assert.ok(!P.skillsPathsContains(['a/b'], 'c/d'));
});

test('skillsPathsContains: 非数组安全返回 false', () => {
  assert.ok(!P.skillsPathsContains(null, 'x'));
});

// ─── parseFrontmatter ─────────────────────────────────────────────────
test('parseFrontmatter: 无 frontmatter → 整体作为 body', () => {
  const { data, body } = P.parseFrontmatter('# just markdown\nno fm here');
  assert.deepEqual(data, {});
  assert.ok(body.includes('# just markdown'));
});

test('parseFrontmatter: 单行带引号 description', () => {
  const c = '---\ndescription: "The Superpowers development workflow."\nmode: primary\n---\n\n# Body\n';
  const { data, body } = P.parseFrontmatter(c);
  assert.equal(data.description, 'The Superpowers development workflow.');
  assert.equal(data.mode, 'primary');
  assert.ok(body.trim().startsWith('# Body'));
});

test('parseFrontmatter: 布尔值解析', () => {
  const c = '---\nhidden: false\nsteps: true\nname: x\n---\nbody';
  const { data } = P.parseFrontmatter(c);
  assert.equal(data.hidden, false);
  assert.equal(data.steps, true);
  assert.equal(data.name, 'x');
});

test('parseFrontmatter: 块标量 | 字面量（保留换行）', () => {
  const c = ['---', 'description: |', '  line one', '  line two', 'mode: subagent', '---', 'body'].join('\n');
  const { data } = P.parseFrontmatter(c);
  assert.equal(data.description, 'line one\nline two');
  assert.equal(data.mode, 'subagent');
});

test('parseFrontmatter: 块标量 > 折叠（空格连接）', () => {
  const c = ['---', 'description: >', '  one two', '  three', '---', 'body'].join('\n');
  const { data } = P.parseFrontmatter(c);
  assert.equal(data.description, 'one two three');
});

test('parseFrontmatter: CRLF 行尾兼容', () => {
  const c = '---\r\ndescription: "hi"\r\nmode: primary\r\n---\r\n\r\n# Body\r\n';
  const { data, body } = P.parseFrontmatter(c);
  assert.equal(data.description, 'hi');
  assert.equal(data.mode, 'primary');
  assert.ok(body.includes('# Body'));
});

// ─── loadAgents：对模拟目录 ────────────────────────────────────────────
test('loadAgents: 解析目录内 agent 文件，mode 缺省为 subagent', () => {
  const dir = mkTempHome();
  try {
    fs.writeFileSync(
      path.join(dir, 'alpha.md'),
      '---\ndescription: "Alpha agent"\nmode: primary\n---\n\n# Alpha\nYou are alpha.\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(dir, 'beta.md'),
      '---\ndescription: "Beta"\n---\n\n# Beta\nbody\n',
      'utf8'
    );
    const agents = P.loadAgents(dir);
    assert.equal(agents.alpha.mode, 'primary');
    assert.equal(agents.alpha.description, 'Alpha agent');
    assert.ok(agents.alpha.prompt.includes('You are alpha.'));
    assert.equal(agents.beta.mode, 'subagent', 'mode 缺省应回退 subagent');
    assert.equal(agents.beta.description, 'Beta');
  } finally {
    rmrf(dir);
  }
});

test('loadAgents: 目录不存在 → 空对象，不抛', () => {
  assert.deepEqual(P.loadAgents(path.join(mkTempHomeRm(), 'nope')), {});
  function mkTempHomeRm() {
    const h = mkTempHome();
    rmrf(h);
    return h;
  }
});

// ─── loadAgents：对真实包内 agents 目录（集成）─────────────────────────
test('loadAgents(真实包): 注册 compose/compose-dev/compose-review', () => {
  const agents = P.loadAgents();
  for (const name of ['compose', 'compose-dev', 'compose-review']) {
    assert.ok(agents[name], `应有 agent: ${name}`);
    assert.equal(typeof agents[name].prompt, 'string');
    assert.ok(agents[name].prompt.length > 0, `${name} prompt 不应为空`);
    assert.equal(typeof agents[name].description, 'string');
  }
  assert.equal(agents.compose.mode, 'primary');
  assert.equal(agents['compose-dev'].mode, 'subagent');
  assert.equal(agents['compose-review'].mode, 'subagent');
});

// ─── 插件工厂 + config 钩子（集成，隔离 KILO_HOME）──────────────────────
test('plugin(): config 钩子注入 3 个 agent 与 skills.paths', async () => {
  const home = mkTempHome();
  const restore = withKiloHome(home);
  try {
    const mockConfig = { agent: {}, skills: { paths: [] } };
    const result = await P.plugin();
    assert.equal(typeof result.config, 'function');
    await result.config(mockConfig);

    // 1. 3 个 agent 注入
    for (const name of ['compose', 'compose-dev', 'compose-review']) {
      assert.ok(mockConfig.agent[name], `应注入 ${name}`);
      assert.equal(typeof mockConfig.agent[name].prompt, 'string');
      assert.equal(typeof mockConfig.agent[name].description, 'string');
    }
    assert.equal(mockConfig.agent.compose.mode, 'primary');

    // 2. skills.paths 追加了包内 skills 目录（且仅一条）
    assert.ok(mockConfig.skills.paths.length >= 1, '应至少追加一条 skills.paths');
    assert.ok(
      mockConfig.skills.paths.some((p) => P.normalizePath(p).endsWith(path.sep + 'skills')),
      'skills.paths 应包含包内 skills 目录'
    );

    // 3. 不应在隔离配置目录创建任何斜杠命令副本或版本标记文件
    const cmdDst = path.join(home, '.config', 'kilo', 'commands', 'superpowers.md');
    const marker = path.join(home, '.config', 'kilo', '.kilo-superpowers-compose-plugin');
    assert.ok(!fs.existsSync(cmdDst), '不应再复制 /superpowers 命令');
    assert.ok(!fs.existsSync(marker), '不应再写版本标记文件');
  } finally {
    restore();
    rmrf(home);
  }
});

test('plugin(): 无 agent/skills 字段的空 config 也会被安全初始化', async () => {
  const home = mkTempHome();
  const restore = withKiloHome(home);
  try {
    const mockConfig = {};
    const result = await P.plugin();
    await result.config(mockConfig);
    assert.ok(mockConfig.agent && mockConfig.agent.compose, '应自动创建 agent 对象并注入');
    assert.ok(Array.isArray(mockConfig.skills.paths), '应自动创建 skills.paths 数组');
  } finally {
    restore();
    rmrf(home);
  }
});

test('plugin(): 二次调用不重复追加 skills.paths（幂等）', async () => {
  const home = mkTempHome();
  const restore = withKiloHome(home);
  try {
    const result = await P.plugin();
    const mockConfig = { skills: { paths: [] } };
    await result.config(mockConfig);
    const firstCount = mockConfig.skills.paths.length;
    // 重新拿一份 agents（模拟第二次启动），对同一 config 再跑一次钩子
    const result2 = await P.plugin();
    await result2.config(mockConfig);
    assert.equal(mockConfig.skills.paths.length, firstCount, '不应重复追加');
  } finally {
    restore();
    rmrf(home);
  }
});

test('plugin(): config 钩子传入 null/非法对象不抛异常', async () => {
  const home = mkTempHome();
  const restore = withKiloHome(home);
  try {
    const result = await P.plugin();
    await result.config(null);
    await result.config(undefined);
    await result.config('not-an-object');
    // 不抛即通过
    assert.ok(true);
  } finally {
    restore();
    rmrf(home);
  }
});

// ─── 默认导出 / server 别名 ────────────────────────────────────────────
test('默认导出与 server 别名均指向同一函数', () => {
  assert.equal(P.default, P.plugin);
  assert.equal(P.server, P.plugin);
});
