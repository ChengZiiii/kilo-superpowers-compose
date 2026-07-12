#!/usr/bin/env node
// bin/uninstall.js — 卸载入口（清单法精确移除）。
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runUninstall } from './lib.js';

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  process.exit(runUninstall());
}
