import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPublicTarget } from '../analyzer.mjs';

test('reference analyzer accepts public HTTP(S) URLs', async () => {
  assert.equal(await assertPublicTarget('https://example.com/path'), 'https://example.com/path');
});

test('reference analyzer rejects local, private, credentialed, and non-web URLs', async () => {
  for (const url of [
    'http://127.0.0.1:4173/',
    'http://10.0.0.1/',
    'http://192.168.1.2/',
    'http://localhost/',
    'ftp://example.com/file',
    'https://user:pass@example.com/',
    'not a url',
  ]) {
    await assert.rejects(() => assertPublicTarget(url), { message: /无效|仅支持|内部地址|公网地址/ });
  }
});
