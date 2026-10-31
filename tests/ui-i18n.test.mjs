import test from 'node:test';
import assert from 'node:assert/strict';
import { additionalUiTranslations, translateUiTemplate } from '../ui-i18n.mjs';

test('supplemental English UI copy has no untranslated Chinese or duplicate keys', () => {
  const keys = new Set();
  for (const [zh, en] of additionalUiTranslations) {
    assert.ok(!keys.has(zh), `Duplicate translation: ${zh}`);
    keys.add(zh);
    assert.ok(en.trim(), `Empty translation: ${zh}`);
    assert.doesNotMatch(en, /[\u3400-\u9fff]/u, zh);
  }
});

test('variable UI messages translate counts and preserve supplied filenames and URLs', () => {
  const dictionary = new Map(additionalUiTranslations);
  const translate = text => dictionary.get(text) || text;
  assert.equal(translateUiTemplate('约 2,627 字'), 'About 2,627 characters');
  assert.equal(translateUiTemplate('1 项本地素材'), '1 local asset');
  assert.equal(translateUiTemplate('4 项本地素材'), '4 local assets');
  assert.equal(translateUiTemplate('第 2 个模块名称',translate), 'Section 2: Name');
  assert.equal(translateUiTemplate('简历.txt 的用途'), 'Purpose of 简历.txt');
  assert.equal(translateUiTemplate('删除第 3 个模块'), 'Delete section 3');
  assert.equal(translateUiTemplate('已实测 https://example.com/ · 4 个标题 · 手机端未发现横向溢出 · 交互状态 2 项 · 链接 5 个 · 滚动动画 1 条'), 'Inspected https://example.com/ · 4 headings · No mobile horizontal overflow detected · 2 interaction states · 5 links · 1 scroll animations');
  assert.equal(translateUiTemplate('用户提供的原文'), '用户提供的原文');
});
