import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

test('English covers all workspaces, dynamic UI, and reloads without changing user data', {timeout:60000}, async () => {
  const socket = net.createServer();
  await new Promise(resolve => socket.listen(0,'127.0.0.1',resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const server = spawn(process.execPath,['server.mjs'],{env:{...process.env,HOST:'127.0.0.1',PORT:String(port)},stdio:'ignore'});
  let browser;
  try {
    let ready = false;
    for (let i=0;i<40;i++) {
      try { if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) {ready=true;break;} } catch {}
      await new Promise(resolve => setTimeout(resolve,50));
    }
    assert.ok(ready,'The test server must be ready');
    const channel = process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined);
    browser = await chromium.launch({headless:true,...(channel ? {channel} : {})});
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.locator('#audience').fill('目标用户');
    await page.locator('.side-link[data-panel="prompt"]').click();
    await page.locator('#custom-brief').fill('品牌官网：这是用户提供的资料，必须保留原文。');
    const optionValues = () => page.locator('#analysis-form select option').evaluateAll(options=>options.map(option=>option.value));
    const initialOptions = await optionValues();
    const guideHeading = await page.locator('[data-view="guide"] h1').textContent();
    const assertEnglish = async () => {
      const untranslated = await page.evaluate(()=>{
        const remaining=[];
        const skip='script,style,input,textarea,code,pre,[data-i18n-ignore],[data-preview-url],[data-preview-title],[data-preview-section]';
        const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
        while(walker.nextNode()) {
          const node=walker.currentNode;
          if(!node.parentElement.closest(skip) && !node.parentElement.closest('[data-language-toggle]') && /[\u3400-\u9fff]/u.test(node.textContent)) remaining.push(node.textContent.trim());
        }
        for(const element of document.querySelectorAll('*')) {
          if(element.closest('[data-i18n-ignore],.asset-list')) continue;
          for(const attribute of ['placeholder','aria-label','title','alt']) {
            const value=element.getAttribute(attribute);
            if(value && /[\u3400-\u9fff]/u.test(value)) remaining.push(`${attribute}: ${value}`);
          }
        }
        return [...new Set(remaining)];
      });
      assert.deepEqual(untranslated,[],'English UI must not contain Chinese interface copy, including hidden sections and attributes');
    };
    await page.locator('[data-language-toggle]').click();
    await assertEnglish();
    assert.deepEqual(await optionValues(),initialOptions,'Translation must not change option values');
    for(const panel of ['guide','vibehub','prompt','analysis']) {
      await page.locator(`.side-link[data-panel="${panel}"]`).click();
      await assertEnglish();
    }
    await page.locator('[data-submit-analysis]').click();
    await page.locator('#result').waitFor({state:'visible'});
    await assertEnglish();
    assert.match(await page.locator('[data-submit-analysis]').innerText(),/Analyze reference page/);
    await page.locator('#reference-url').fill('invalid URL');
    await page.locator('[data-submit-analysis]').click();
    await page.locator('[data-analysis-error]').waitFor({state:'visible'});
    await assertEnglish();
    assert.match(await page.locator('[data-analysis-error-message]').innerText(),/Invalid URL/);
    await page.locator('#reference-url').fill('');
    await page.locator('[data-add-module]').click();
    await assertEnglish();
    await page.locator('.module-title-input').last().fill('这是用户编辑的模块');
    await page.locator('.side-link[data-panel="prompt"]').click();
    await page.locator('#custom-file-input').setInputFiles({name:'网页分析',mimeType:'text/plain',buffer:Buffer.from('这是上传的中文资料，不得翻译。')});
    await page.locator('.asset-item').waitFor();
    await assertEnglish();
    assert.equal(await page.locator('.asset-heading strong').innerText(),'网页分析');
    assert.equal(await page.locator('[data-asset-text]').inputValue(),'这是上传的中文资料，不得翻译。');
    await page.locator('#design-md-content').fill('# 用户自己的 DESIGN.md');
    await assertEnglish();
    await page.locator('[data-load-design-system]').click();
    await assertEnglish();
    for(let i=0;i<3;i++) {
      await page.locator('[data-language-toggle]').click();
      assert.equal(await page.locator('html').getAttribute('lang'),'zh-CN');
      assert.equal(await page.locator('[data-view="guide"] h1').textContent(),guideHeading);
      assert.deepEqual(await optionValues(),initialOptions);
      assert.match(await page.locator('[data-submit-analysis]').textContent(),/实际分析参考网页/);
      await page.locator('[data-language-toggle]').click();
      await assertEnglish();
    }
    assert.equal(await page.locator('#audience').inputValue(),'目标用户');
    assert.equal(await page.locator('#custom-brief').inputValue(),'品牌官网：这是用户提供的资料，必须保留原文。');
    await page.reload();
    await page.locator('.asset-item').waitFor();
    await assertEnglish();
    assert.equal(await page.locator('html').getAttribute('lang'),'en');
    assert.deepEqual(await optionValues(),initialOptions);
    assert.equal(await page.locator('.module-title-input').last().inputValue(),'这是用户编辑的模块');
    assert.equal(await page.locator('#design-md-content').inputValue(),'# 用户自己的 DESIGN.md');
    await page.locator('[data-theme-toggle]').click();
    await page.locator('.side-link[data-panel="guide"]').click();
    await page.locator('.guide-faq-list summary').first().click();
    assert.equal(await page.locator('.guide-faq-list details').first().getAttribute('open'),'');
    await assertEnglish();
    await mkdir('artifacts',{recursive:true});
    await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
    await page.screenshot({path:'artifacts/english-guide-fixed.png'});
    await page.locator('.side-link[data-panel="vibehub"]').click();
    await assertEnglish();
    await page.screenshot({path:'artifacts/english-knowledge-fixed.png'});
    await page.setViewportSize({width:390,height:844});
    await assertEnglish();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'English mobile layout must not overflow horizontally');
    await page.locator('[data-language-toggle]').click();
    assert.equal(await page.locator('html').getAttribute('lang'),'zh-CN');
    assert.deepEqual(errors,[],'No uncaught page errors');
  } finally {
    if(browser) await browser.close();
    server.kill();
    if(server.exitCode===null) await new Promise(resolve=>server.once('exit',resolve));
  }
});
