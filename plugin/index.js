// plugin/index.js
// kilo-superpowers-compose — Kilo 插件模块（Path B）。
//
// 这是 Path A（npm CLI 安装器，见 bin/）之外的另一条安装路径：
// 在 kilo.jsonc 里写 `"plugin": ["kilo-superpowers-compose"]`，Kilo 启动时
// 会加载本模块的默认导出（工厂函数），调用其 `config(config)` 钩子，向**运行时**
// 配置对象直接注入 3 个 agent 与 skills.paths —— agent 从不落盘，仅存活于运行时。
// 用户通过在代理选择器中选取 `compose` 代理即可进入工作流，无需注册斜杠命令。
//
// 设计参考：moyu-by/opencode-mimo-compose 的 src/index.js（OpenCode 插件机制）。
// Kilo 是 OpenCode 的 fork，复用同样的 `config` 钩子契约。
//
// 硬性约束（与 bin/lib.js 一致）：
// - 零第三方依赖；仅用 node:fs / node:path / node:url。
// - 绝不抛异常：**插件崩溃会让 Kilo 启动失败**。所有 fs / 解析操作均包 try/catch。
// - 跨平台路径一律用 path.join，绝不手拼反斜杠。
// - skills.paths 幂等判定用规范化路径比较（path.resolve + toLowerCase）。
//
// 自动更新原理：
// - agents：每次 Kilo 启动由 config 钩子重注（永远取包内最新内容）。
// - skills：config.skills.paths 指向**包内** skills 目录，`npm update -g` 后即时刷新。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── 路径常量 ──────────────────────────────────────────────────────────
// 本文件即 plugin/index.js；其上一级为包根。
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, '..');

const AGENTS_SRC = path.join(PKG_ROOT, 'agents');
const SKILLS_SRC = path.join(PKG_ROOT, 'skills');

// ─── 纯函数 / 路径规范化 ───────────────────────────────────────────────
// 与 bin/lib.js 的 normalizePath 行为一致，便于 skills.paths 去重判定。
export function normalizePath(p) {
  try {
    return path.resolve(p).toLowerCase();
  } catch (_) {
    return String(p || '').toLowerCase();
  }
}

// skills.paths 是否已包含目标（规范化比较，跨分隔符 / 大小写）。
export function skillsPathsContains(paths, target) {
  const t = normalizePath(target);
  return Array.isArray(paths) && paths.some((p) => normalizePath(p) === t);
}

// 去除字符串两端的成对引号。
function stripQuotes(v) {
  if (v.length >= 2) {
    const a = v[0];
    const b = v[v.length - 1];
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) {
      return v.slice(1, -1);
    }
  }
  return v;
}

// ─── Frontmatter 解析 ──────────────────────────────────────────────────
// 既支持单行 `key: value`（我们的 3 个 agent description 现均为单行），
// 也防御性地支持 YAML 块标量（`|` 字面量 / `>` 折叠）以防有人改回多行。
// 不引入第三方 YAML 解析器 —— 只覆盖我们用到的子集。
export function parseFrontmatter(content) {
  const m = typeof content === 'string'
    ? content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
    : null;
  if (!m) return { data: {}, body: typeof content === 'string' ? content : '' };
  const lines = m[1].split(/\r?\n/);
  const data = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const kv = line.match(/^([\w-]+)[ \t]*:[ \t]*(.*)$/);
    if (!kv) {
      i++;
      continue;
    }
    const key = kv[1];
    let val = kv[2];
    // 块标量：|（字面量，保留换行）或 >（折叠为空格）。
    if (/^[|>][+-]?$/.test(val)) {
      const folded = val.startsWith('>');
      const collected = [];
      i++;
      while (i < lines.length && (lines[i] === '' || /^[ \t]/.test(lines[i]))) {
        collected.push(lines[i].replace(/^[ \t]+/, ''));
        i++;
      }
      val = (folded ? collected.join(' ') : collected.join('\n')).trim();
      data[key] = val;
      continue;
    }
    const tv = val.trim();
    if (tv === 'true') data[key] = true;
    else if (tv === 'false') data[key] = false;
    else data[key] = stripQuotes(tv);
    i++;
  }
  return { data, body: m[2] };
}

// ─── Agent 加载 ────────────────────────────────────────────────────────
// 读取包内 agents/*.md，剥离 frontmatter 取 description / mode 与正文 prompt。
export function loadAgents(agentsSrc) {
  const dir = agentsSrc || AGENTS_SRC;
  const agents = {};
  try {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(dir, file), 'utf8');
        const { data, body } = parseFrontmatter(content);
        const name = file.replace(/\.md$/, '');
        agents[name] = {
          description: data.description || name,
          // primary 保持 primary；其余一律按 subagent 处理（防御性默认）。
          mode: data.mode === 'primary' ? 'primary' : 'subagent',
          prompt: body,
        };
      } catch (_) {
        // 单个 agent 解析失败不阻断其余 agent。
      }
    }
  } catch (_) {
    // agents 目录不存在 / 不可读 → 返回空集（不抛）。
  }
  return agents;
}

// ─── 插件工厂（Kilo 加载入口，当前休眠）──────────────────────────────
// 设计目标：Kilo 按 PluginModule 契约（{ server: Plugin }，见 @kilocode/plugin）
// import 本模块、调用 server() 工厂、再调用返回的 config() 钩子，向运行时配置
// 注入 agents/skills。
//
// 用户使用方式：在代理选择器中选取 `compose` 代理即可进入 Superpowers 工作流，
// 流程由 compose 编排器（agents/compose.md）驱动：brainstorming → planning →
// dispatch compose-dev → dispatch compose-review。
//
// 实测结论（2026-07，见 docs/DESIGN.md §10 Q5）：当前 Kilo **不会**经
// `kilo.jsonc` 的 `plugin:["包名"]` 字段加载 npm 命名插件（该字段无效，还会拖慢
// 启动）。本模块的 config() 钩子契约本身正确（经 glob 加载器实测可注入 agent），
// 但作为用户安装方式暂不启用 —— 安装走 npm CLI（见 bin/）。本模块保留待 Kilo
// 正式支持插件加载后即可启用。命名兼容：同时以 server 命名导出（与 mimo 一致）。
export async function plugin(_input, _options) {
  const agents = loadAgents();

  return {
    // config 钩子：**副作用式**改写传入的 Kilo 配置对象（不返回新对象）。
    config: async (kiloConfig) => {
      try {
        if (!kiloConfig || typeof kiloConfig !== 'object') return;
        // 1. 注册 agents：config.agent[name] = { prompt, description, mode }。
        if (!kiloConfig.agent) kiloConfig.agent = {};
        for (const [name, agent] of Object.entries(agents)) {
          kiloConfig.agent[name] = {
            prompt: agent.prompt,
            description: agent.description,
            mode: agent.mode,
          };
        }
        // 2. 注册 skills：config.skills.paths 追加包内 skills 目录（规范化去重）。
        if (!kiloConfig.skills) kiloConfig.skills = {};
        if (!Array.isArray(kiloConfig.skills.paths)) kiloConfig.skills.paths = [];
        if (fs.existsSync(SKILLS_SRC) && !skillsPathsContains(kiloConfig.skills.paths, SKILLS_SRC)) {
          kiloConfig.skills.paths.push(SKILLS_SRC);
        }
      } catch (_) {
        // config 钩子内任何异常都不外泄，避免拖垮 Kilo 启动。
      }
    },
  };
}

export { plugin as server };
export default plugin;
