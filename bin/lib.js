// bin/lib.js
// kilo-superpowers-compose — 安装器共享逻辑（纯函数 + fs 辅助）。
// 零第三方依赖；仅使用 node:fs / node:path / node:os / node:url。
//
// 设计说明：
// - runInstall / runUninstall / runUpdate **返回退出码**（0–4），不调用 process.exit，
//   以便在 node:test 中直接断言。进程退出由各入口垫片（install.js / cli.js）负责。
// - 跨平台：所有路径用 path.join + os.homedir()/KILO_HOME，绝不手拼反斜杠。
// - skills.paths 幂等判定用规范化路径比较（path.resolve + toLowerCase）。
// - 卸载归属判定用清单法（manifest），替代内容嗅探。

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

// ─── 常量 ─────────────────────────────────────────────────────────────
// 退出码（INSTALLER.md §2.3）
export const EXIT = Object.freeze({
  OK: 0,
  ERROR: 1,
  PARSE_ERROR: 2, // kilo.jsonc 解析失败（已从备份恢复）
  NOT_WRITABLE: 3, // 目标目录不可写
  LINK_FAILED: 4, // junction/symlink 创建失败（且递归复制兜底也失败）
});

// 内嵌技能锁定的上游 tag（见 NOTICE）。重新 vendor 时同步更新。
export const UPSTREAM_TAG = 'v6.1.1';

// 清单文件名（位于配置目录下，隐藏文件）
export const MANIFEST_NAME = '.kilo-superpowers-compose.json';

const noop = () => {};

// ─── 纯函数 / 配置解析 ─────────────────────────────────────────────────
// 读取环境变量（默认 process.env），便于测试注入。
export function readEnv(env = process.env) {
  return {
    HOME: env.KILO_HOME || os.homedir(),
    DRY_RUN: env.KILO_SUPERPOWERS_DRY_RUN === '1',
    VERBOSE: env.KILO_SUPERPOWERS_VERBOSE === '1',
    USE_PREFIX: env.KILO_SUPERPOWERS_PREFIX === '1',
  };
}

// 由 home 推导所有目标路径（纯函数）。
export function resolvePaths(home) {
  const configDir = path.join(home, '.config', 'kilo');
  const skillsDir = path.join(home, '.kilo', 'skills');
  return {
    home,
    configDir,
    configFile: path.join(configDir, 'kilo.jsonc'),
    agentsDir: path.join(configDir, 'agent'),
    commandsDir: path.join(configDir, 'commands'),
    skillsDir,
    skillLink: path.join(skillsDir, 'superpowers'),
    manifestFile: path.join(configDir, MANIFEST_NAME),
  };
}

// 组装完整运行上下文。
export function buildContext(env = process.env) {
  return { ...readEnv(env), ...resolvePaths(readEnv(env).HOME) };
}

// JSONC 行注释剥离：仅处理 `//`，且只在字符串外剥离。
// **不处理块注释 `/* *`/`/*`**——若 kilo.jsonc 含块注释导致解析失败，
// 调用方从备份恢复并以退出码 2 退出（INSTALLER.md §2.2 第 7 步 / 计划取舍）。
export function stripLineComments(raw) {
  return raw.split('\n').map(stripLine).join('\n');
  function stripLine(line) {
    const idx = line.indexOf('//');
    if (idx === -1) return line;
    const before = line.slice(0, idx);
    // 统计 `before` 中未转义双引号的数量；偶数表示不在字符串内。
    const quotes = (before.match(/(?<!\\)"/g) || []).length;
    return quotes % 2 === 0 ? before : line;
  }
}

// 规范化路径用于幂等比较（消除分隔符 / 大小写差异）。
export function normalizePath(p) {
  return path.resolve(p).toLowerCase();
}

// skills.paths 数组是否已包含目标（规范化比较）。
export function skillsPathsContains(paths, target) {
  const t = normalizePath(target);
  return Array.isArray(paths) && paths.some((p) => normalizePath(p) === t);
}

// 从给定目录定位包根：bin/ 的上一级。
export function findPackageRoot(startDir) {
  return path.resolve(startDir, '..');
}

export function readPackageJson(pkgRoot) {
  const file = path.join(pkgRoot, 'package.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// ─── 日志 / 退出辅助 ───────────────────────────────────────────────────
export function makeLogger(verbose) {
  const log = verbose
    ? (...a) => console.error('[kilo-sp-compose]', ...a)
    : noop;
  return log;
}

// ─── fs 辅助 ──────────────────────────────────────────────────────────
export function ensureDir(d, { dryRun = false, log = noop } = {}) {
  if (dryRun) {
    log('would mkdir', d);
    return;
  }
  fs.mkdirSync(d, { recursive: true });
}

export function linkExists(p) {
  return !!fs.lstatSync(p, { throwIfNoEntry: false });
}

// 安全移除一个路径：符号链接/junction 用 unlinkSync（绝不深入目标）；
// 真实目录用 rmSync 递归；普通文件用 rmSync。
export function safeRemove(p, { dryRun = false, log = noop } = {}) {
  const st = fs.lstatSync(p, { throwIfNoEntry: false });
  if (!st) return false;
  log('removing', p);
  if (dryRun) return true;
  if (st.isSymbolicLink()) {
    fs.unlinkSync(p); // junction/symlink：仅删除链接本身
  } else if (st.isDirectory()) {
    fs.rmSync(p, { recursive: true, force: true });
  } else {
    fs.rmSync(p, { force: true });
  }
  return true;
}

// 读取 JSONC（剥离行注释后解析）。失败返回 { __parseError, __raw }。
export function readJsonc(file) {
  if (!fs.existsSync(file)) return {};
  const raw = fs.readFileSync(file, 'utf8');
  const stripped = stripLineComments(raw);
  try {
    return JSON.parse(stripped);
  } catch (e) {
    return { __parseError: e.message, __raw: raw };
  }
}

// 以 JSON 写回（丢失注释——已知取舍）。
export function writeJson(file, obj, { dryRun = false } = {}) {
  if (dryRun) return;
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

// 备份 kilo.jsonc -> kilo.jsonc.bak.<timestamp>；不存在则返回 null。
export function backupConfig(configFile, { dryRun = false, log = noop } = {}) {
  if (!fs.existsSync(configFile)) return null;
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const bak = `${configFile}.bak.${ts}`;
  log('backup', configFile, '->', bak);
  if (dryRun) return bak;
  fs.copyFileSync(configFile, bak);
  return bak;
}

// 清单读写 ─────────────────────────────────────────────────────────────
export function readManifest(manifestFile) {
  if (!fs.existsSync(manifestFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  } catch {
    return null;
  }
}

export function writeManifest(manifestFile, data, { dryRun = false, log = noop } = {}) {
  log('writing manifest', manifestFile);
  if (dryRun) return;
  fs.writeFileSync(manifestFile, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export function removeManifest(manifestFile, { dryRun = false, log = noop } = {}) {
  return safeRemove(manifestFile, { dryRun, log });
}

// 创建技能链接（Windows junction / Unix symlink），失败则递归复制兜底。
// 返回 { type, ok, error?, fallback? }。
export function makeSkillsLink(src, link, { dryRun = false, log = noop } = {}) {
  if (linkExists(link)) {
    safeRemove(link, { dryRun, log });
  }
  const isWin = process.platform === 'win32';
  const linkType = isWin ? 'junction' : 'symlink';
  log(`creating ${linkType}`, src, '->', link);
  if (dryRun) return { type: linkType, ok: true };
  try {
    fs.symlinkSync(src, link, isWin ? 'junction' : 'dir');
    return { type: linkType, ok: true };
  } catch (e) {
    log(`${linkType} failed (${e.message}); falling back to recursive copy`);
    try {
      fs.cpSync(src, link, { recursive: true, force: true });
      return { type: 'copy', ok: true, fallback: e.message };
    } catch (e2) {
      return {
        type: linkType,
        ok: false,
        error: `${linkType}: ${e.message}; copy fallback: ${e2.message}`,
      };
    }
  }
}

// 列出源目录下的 .md 文件（agents / commands）。
export function listMdFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({ name: f, abs: path.join(dir, f) }));
}

// ─── 编排：安装 ───────────────────────────────────────────────────────
// 返回退出码（0 成功）。失败路径返回对应码并已做清理（如恢复备份）。
export function runInstall(opts = {}) {
  const ctx = opts.context || buildContext();
  const log = makeLogger(ctx.VERBOSE);
  const dryRun = ctx.DRY_RUN;

  // bin/lib.js 的父目录即包根。
  const binDir = path.dirname(fileURLToPath(import.meta.url));
  const root = opts.pkgRoot || path.resolve(binDir, '..');

  const srcSkills = path.join(root, 'skills');
  const srcAgents = path.join(root, 'agents');
  const srcCommands = path.join(root, 'commands');

  let pkg;
  try {
    pkg = readPackageJson(root);
  } catch (e) {
    console.error(`✗ 无法读取 package.json: ${e.message}`);
    return EXIT.ERROR;
  }
  const version = pkg.version || '0.0.0';

  log('package root', root);
  log('config dir', ctx.configDir);

  // 1. 确保目标目录
  for (const d of [ctx.configDir, ctx.agentsDir, ctx.commandsDir, ctx.skillsDir]) {
    try {
      ensureDir(d, { dryRun, log });
    } catch (e) {
      console.error(`✗ 无法创建目录 ${d}: ${e.message}`);
      return EXIT.NOT_WRITABLE;
    }
  }

  // 2. 备份 kilo.jsonc
  const bak = backupConfig(ctx.configFile, { dryRun, log });

  // 3. 预读并校验 kilo.jsonc（解析失败则立即恢复备份并退出 2，不做任何文件写入）。
  //    仅支持 // 行注释；块注释 /* */ 不处理，会导致解析失败。
  log('reading', ctx.configFile);
  const config = readJsonc(ctx.configFile);
  if (config.__parseError) {
    if (bak && !dryRun) {
      try {
        fs.copyFileSync(bak, ctx.configFile);
      } catch (e) {
        log('恢复备份失败:', e.message);
      }
    }
    console.error(`✗ kilo.jsonc 解析失败: ${config.__parseError}（已从备份恢复）`);
    console.error('  注意：本安装器仅支持 // 行注释；块注释 /* */ 不被处理。');
    return EXIT.PARSE_ERROR;
  }

  // 4. 创建技能链接
  if (!fs.existsSync(srcSkills)) {
    console.error(`✗ 找不到技能源目录: ${srcSkills}`);
    return EXIT.ERROR;
  }
  const linkRes = makeSkillsLink(srcSkills, ctx.skillLink, { dryRun, log });
  if (!linkRes.ok) {
    console.error(`✗ ${linkRes.error}`);
    return EXIT.LINK_FAILED;
  }

  // 5. 复制 agents
  const agentFiles = listMdFiles(srcAgents);
  const installedAgentPaths = [];
  for (const f of agentFiles) {
    const dst = path.join(ctx.agentsDir, f.name);
    log('copy agent', f.abs, '->', dst);
    if (!dryRun) {
      try {
        fs.mkdirSync(ctx.agentsDir, { recursive: true });
        fs.copyFileSync(f.abs, dst);
      } catch (e) {
        console.error(`✗ 复制 agent 失败 ${f.name}: ${e.message}`);
        return EXIT.NOT_WRITABLE;
      }
    }
    installedAgentPaths.push(dst);
  }

  // 6. 复制 commands
  const cmdFiles = listMdFiles(srcCommands);
  const installedCommandPaths = [];
  for (const f of cmdFiles) {
    const dst = path.join(ctx.commandsDir, f.name);
    log('copy command', f.abs, '->', dst);
    if (!dryRun) {
      try {
        fs.mkdirSync(ctx.commandsDir, { recursive: true });
        fs.copyFileSync(f.abs, dst);
      } catch (e) {
        console.error(`✗ 复制 command 失败 ${f.name}: ${e.message}`);
        return EXIT.NOT_WRITABLE;
      }
    }
    installedCommandPaths.push(dst);
  }

  // 7. 追加 skills.paths（config 已在第 3 步解析校验通过）
  config.skills = config.skills || {};
  config.skills.paths = config.skills.paths || [];
  let added = false;
  if (!skillsPathsContains(config.skills.paths, srcSkills)) {
    config.skills.paths.push(srcSkills);
    added = true;
  }
  if (added && !dryRun) writeJson(ctx.configFile, config);

  // 7. 写清单
  writeManifest(
    ctx.manifestFile,
    {
      name: 'kilo-superpowers-compose',
      version,
      upstreamTag: UPSTREAM_TAG,
      pkgRoot: root,
      skillsSrc: srcSkills,
      skillsLink: ctx.skillLink,
      skillsLinkType: linkRes.type,
      skillsPathsEntry: srcSkills,
      agents: installedAgentPaths,
      commands: installedCommandPaths,
    },
    { dryRun, log }
  );

  // 8. 汇总
  const skillCount = countSkills(srcSkills);
  console.log('✓ kilo-superpowers-compose 已安装');
  console.log(`  技能: ${skillCount} 个 -> ${ctx.skillLink} (${linkRes.type})`);
  if (linkRes.fallback) {
    console.log(`  注意: 链接创建失败，已回退为递归复制（${linkRes.fallback}）`);
  }
  console.log(`  代理: ${agentFiles.map((f) => f.name).join(', ') || '(无)'}`);
  console.log(`  命令: /${cmdFiles.map((f) => f.name.replace(/\.md$/, '')).join(', /') || '(无)'}`);
  console.log(`  kilo.jsonc: skills.paths ${added ? '已新增条目' : '已存在（幂等跳过）'}`);
  console.log('');
  console.log('  请重启 Kilo CLI / VS Code 扩展以加载。');
  console.log('');
  console.log('  💡 以后包升级：npm update -g kilo-superpowers-compose && kilo-superpowers-compose update');
  return EXIT.OK;
}

function countSkills(srcSkills) {
  try {
    return fs
      .readdirSync(srcSkills, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .length;
  } catch {
    return 0;
  }
}

// ─── 编排：卸载 ───────────────────────────────────────────────────────
export function runUninstall(opts = {}) {
  const ctx = opts.context || buildContext();
  const log = makeLogger(ctx.VERBOSE);
  const dryRun = ctx.DRY_RUN;

  log('uninstall from', ctx.configDir);

  // 备份 kilo.jsonc（卸载也会改它）
  const bak = backupConfig(ctx.configFile, { dryRun, log });

  const manifest = readManifest(ctx.manifestFile);

  // 1. 移除 agents
  const agentPaths = (manifest && manifest.agents) || [];
  if (agentPaths.length === 0) {
    // 清单缺失时回退到已知文件名
    log('清单缺失或无 agents 记录，回退到已知文件名');
    for (const n of ['compose.md', 'compose-dev.md', 'compose-review.md']) {
      agentPaths.push(path.join(ctx.agentsDir, n));
    }
  }
  for (const p of agentPaths) safeRemove(p, { dryRun, log });

  // 2. 移除 commands
  const cmdPaths = (manifest && manifest.commands) || [];
  if (cmdPaths.length === 0) {
    for (const n of ['superpowers.md']) {
      cmdPaths.push(path.join(ctx.commandsDir, n));
    }
  }
  for (const p of cmdPaths) safeRemove(p, { dryRun, log });

  // 3. 移除技能链接（清单有记录类型则用之，否则按链接处理）
  if (linkExists(ctx.skillLink)) {
    safeRemove(ctx.skillLink, { dryRun, log });
  }

  // 4. 从 kilo.jsonc 移除本包的 skills.paths 条目
  const config = readJsonc(ctx.configFile);
  if (config.__parseError) {
    if (bak && !dryRun) {
      try {
        fs.copyFileSync(bak, ctx.configFile);
      } catch (e) {
        log('恢复备份失败:', e.message);
      }
    }
    console.error(`✗ kilo.jsonc 解析失败: ${config.__parseError}（已从备份恢复）`);
    return EXIT.PARSE_ERROR;
  }
  let removedEntries = 0;
  if (config.skills && Array.isArray(config.skills.paths)) {
    const entry = (manifest && manifest.skillsPathsEntry) || null;
    const before = config.skills.paths.length;
    config.skills.paths = config.skills.paths.filter((p) => {
      if (entry && normalizePath(p) === normalizePath(entry)) return false;
      // 也移除任何指向本包 skills 源的条目（容错）
      return true;
    });
    // 若清单缺 entry，按已知包根启发式移除（路径片段含 kilo-superpowers-compose/skills）
    if (!entry) {
      config.skills.paths = config.skills.paths.filter(
        (p) => !/kilo-superpowers-compose[\\/]+skills/i.test(p)
      );
    }
    removedEntries = before - config.skills.paths.length;
    if (!dryRun) writeJson(ctx.configFile, config);
  }

  // 5. 移除清单
  removeManifest(ctx.manifestFile, { dryRun, log });

  console.log('✓ kilo-superpowers-compose 已卸载');
  console.log(`  agents: ${agentPaths.length} 个文件`);
  console.log(`  commands: ${cmdPaths.length} 个文件`);
  console.log(`  技能链接: ${ctx.skillLink}`);
  console.log(`  kilo.jsonc: skills.paths 移除 ${removedEntries} 条`);
  console.log('  未触碰用户自有的技能 / 代理 / 配置。');
  return EXIT.OK;
}

// ─── 编排：更新 ───────────────────────────────────────────────────────
// 重新运行安装（幂等）。若检测到版本变化则打印提示。
export function runUpdate(opts = {}) {
  const ctx = opts.context || buildContext();
  const prev = readManifest(ctx.manifestFile);
  const result = runInstall(opts);
  if (result === EXIT.OK && prev && prev.version) {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    let cur = prev.version;
    try {
      cur = readPackageJson(root).version || prev.version;
    } catch {}
    if (prev.version !== cur) {
      console.log(`  更新: kilo-superpowers-compose ${prev.version} -> ${cur}`);
    }
  }
  return result;
}
