import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPublicTarget, interactionDelta } from '../analyzer.mjs';
import { observationSpec } from '../interaction-observations.mjs';

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

test('interaction evidence reports state, visual, direction, and CSS timing changes', () => {
  const delta = interactionDelta(
    { x: 10, y: 20, color: 'rgb(0, 0, 0)', background: 'rgba(0, 0, 0, 0)', borderColor: 'rgb(0, 0, 0)', boxShadow: 'none', filter: 'none', opacity: '1', transform: 'none', duration: '0s', delay: '0s', easing: 'ease', expanded: 'false', selected: null, pressed: null, checked: null, open: null, controlled: false },
    { x: 16, y: 20, color: 'rgb(180, 0, 0)', background: 'rgb(255, 255, 255)', borderColor: 'rgb(1, 1, 1)', boxShadow: '0px 2px 4px rgb(0, 0, 0)', filter: 'none', opacity: '1', transform: 'matrix(1, 0, 0, 1, 6, 0)', duration: '0.3s', delay: '0.05s', easing: 'ease-out', expanded: 'true', selected: null, pressed: null, checked: null, open: null, controlled: true },
  );
  assert.match(delta.change, /展开状态 false→true/);
  assert.match(delta.change, /向右6px/);
  assert.match(delta.change, /阴影发生变化/);
  assert.match(delta.motion, /0.3s \+ 0.05s ease-out/);
  assert.match(delta.motion, /transform none→matrix/);
});

test('manual observations become prompt-ready interaction requirements', () => {
  const spec = observationSpec({
    trigger: 'hover',
    module: '作品展示',
    target: '作品卡片',
    condition: '鼠标移入卡片',
    before: '图片正常显示',
    after: '遮罩和标题淡入',
    direction: '标题向上 8px',
    timing: '240ms',
    easing: 'ease-out',
  });
  assert.match(spec, /悬停/);
  assert.match(spec, /触发条件：鼠标移入卡片/);
  assert.match(spec, /触发前：图片正常显示/);
  assert.match(spec, /触发后：遮罩和标题淡入/);
  assert.match(spec, /动效方向：标题向上 8px/);
  assert.match(spec, /时长\/节奏：240ms/);
  assert.match(spec, /缓动：ease-out/);
});
