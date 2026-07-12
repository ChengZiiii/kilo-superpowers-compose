#!/usr/bin/env node
// bin/install.js — 安装入口（直接运行时执行；被导入时无副作用）。
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInstall } from './lib.js';

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  process.exit(runInstall());
}
