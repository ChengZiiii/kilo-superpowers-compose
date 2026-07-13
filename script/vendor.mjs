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
