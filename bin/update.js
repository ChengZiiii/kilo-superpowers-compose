#!/usr/bin/env node
// bin/update.js — 更新入口（重新运行安装，幂等）。
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runUpdate } from './lib.js';

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  process.exit(runUpdate());
}
