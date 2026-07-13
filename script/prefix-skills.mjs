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
  // 支持 CRLF (\r\n) 与 LF (\n) 两种行结尾
  const m = content.match(/^---\r?\n([\s\S]*?\r?\n)---/m);
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
  content = content.replace(/^---(\r?\n)([\s\S]*?\r?\n)---/m, (block, openingNL, fm) => {
    const newFm = fm.replace(/^(name:\s*)(.+?)\s*$/m, (line, k, v) => {
      const clean = v.replace(/^["']|["']$/g, '');
      return clean.startsWith(PREFIX) ? line : `${k}${PREFIX}${clean}`;
    });
    // 保留原文件行结尾（CRLF 或 LF），避免"虚假改动"导致 --check 误报
    return `---${openingNL}${newFm}---`;
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
