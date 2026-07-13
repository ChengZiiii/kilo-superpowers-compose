// test/vendor.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';

// 直接导入待测纯函数
const mod = await import('../script/vendor.mjs');

test('validateTag: 接受 vX.Y.Z 形式', () => {
  assert.equal(mod.validateTag('v6.1.1'), 'v6.1.1');
  assert.equal(mod.validateTag('v6.2.0'), 'v6.2.0');
});

test('validateTag: 拒绝非法 tag', () => {
  assert.throws(() => mod.validateTag('main'), /tag must match/);
  assert.throws(() => mod.validateTag(''), /tag must match/);
  assert.throws(() => mod.validateTag('v6'), /tag must match/);
});
