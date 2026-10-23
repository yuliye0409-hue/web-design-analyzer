import dns from 'node:dns/promises';
import net from 'node:net';

const MAX_SECTIONS = 18;
const MAX_TEXT = 520;

function isBlockedIPv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19));
}

function isBlockedIPv6(address) {
  const normalized = address.toLowerCase().split('%')[0];
  if (normalized === '::' || normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb') || normalized.startsWith('ff')) return true;
  const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isBlockedIPv4(mapped[1]) : false;
}

export async function assertPublicTarget(rawUrl) {
  let url;
  try { url = new URL(rawUrl); } catch { throw new Error('网址格式无效，请输入完整的 http 或 https 网址。'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('仅支持不包含账号密码的 HTTP/HTTPS 公开网页。');
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) throw new Error('为保护本地网络，不能分析本机或内部地址。');
  if (net.isIP(hostname)) {
    const blocked = net.isIPv4(hostname) ? isBlockedIPv4(hostname) : isBlockedIPv6(hostname);
    if (blocked) throw new Error('目标不是可访问的公网地址。');
    return url.href;
  }
  let records;
  try { records = await dns.lookup(hostname, { all: true, verbatim: true }); }
  catch { throw new Error('无法解析该网址的域名。'); }
  if (!records.length || records.some(({ address }) => net.isIPv4(address) ? isBlockedIPv4(address) : isBlockedIPv6(address))) throw new Error('目标域名解析到非公网地址，已阻止访问。');
  return url.href;
}

function compact(text, length = MAX_TEXT) {
  return String(text || '').replace(/[\u200b-\u200f\u2060]/g, '').replace(/\s+/g, ' ').trim().slice(0, length);
}

function evidenceToModules(snapshot, scrollSamples = [], interactions = []) {
  const modules = [];
  const scrollSummary = scrollSamples.length ? `滚动实测：逐屏采集 ${scrollSamples.length} 个视口（${scrollSamples.map(sample => `${sample.position}%${sample.heading ? `“${compact(sample.heading, 32)}”` : ''}`).join('、')}）；只记录内容/懒加载可见性，不将普通滚动误报为已验证动画。` : '滚动触发状态未观察到有效视口样本，需人工复核。';
  const interactionText = (title) => {
    const relevant = interactions.filter(item => item.section === title || (title === '页头与导航' && item.area === '页头与导航') || (title === '页脚' && item.area === '页脚'));
    const observed = relevant.length ? `浏览器实测交互：${relevant.slice(0, 8).map(item => `${item.trigger}“${item.label}”${item.change ? `：${item.change}` : '：已触发，未检测到可见状态差异'}${item.motion ? `（${item.motion}）` : ''}`).join('；')}。` : '本模块未观察到可安全触发且有可见差异的交互；不代表模块没有交互。';
    return `${scrollSummary}${observed}仅覆盖安全候选；未自动提交表单、执行交易、删除操作或访问链接目标，其它控件未验证。`;
  };
  if (snapshot.header.text || snapshot.navigation.length) {
    modules.push({
      title: '页头与导航',
      purpose: '观察事实：' + compact(snapshot.header.text || snapshot.navigation.map(item => item.label).join(' / '), 180),
      style: `观察事实：页头背景 ${snapshot.header.background}；导航区包含 ${snapshot.navigation.length} 个可见链接。`,
      components: `实测组件：${snapshot.navigation.slice(0, 12).map(item => item.label).filter(Boolean).join('、') || '检测到页头区域，但未提取到有文本的导航链接'}。`,
      interaction: `实测控件：页头内有 ${snapshot.header.buttons} 个按钮、${snapshot.navigation.length} 个链接。${interactionText('页头与导航')}`,
      analysis: '建议：检查桌面/移动导航是否保持一致的信息优先级，并验证菜单打开、关闭、键盘焦点及当前页状态。',
    });
  }
  for (const section of snapshot.sections.slice(0, MAX_SECTIONS - 2)) {
    const label = section.heading || `内容区块 ${modules.length + 1}`;
    const content = section.text || '该区块有可见结构，但没有提取到足够文本。';
    modules.push({
      title: label,
      purpose: `观察事实：区块标题为“${label}”。内容摘要：${compact(content, 200)}`,
      style: `观察事实：标题层级 ${section.headingLevel || '未识别'}；背景 ${section.background}；标题字号约 ${section.headingSize}px。区块含 ${section.images} 张图片，文字宽度与图文构图请结合截图核对。`,
      components: `实测结构：${section.headings.join('、') || '未识别子标题'}；${section.buttons} 个按钮、${section.links} 个链接、${section.images} 张图片。${section.imageAlts.length ? `图片替代文本：${section.imageAlts.join('；')}` : '未提取到图片替代文本。'}`,
      interaction: `实测控件：该区块包含 ${section.buttons} 个按钮、${section.links} 个链接${section.forms ? `、${section.forms} 个表单` : ''}。${interactionText(label)}`,
      analysis: `设计判断（基于已采集结构的推断）：该区块围绕“${label}”组织内容。建议核对内容优先级、图文关系、键盘可达性及手机端顺序；此建议不是对隐藏交互的事实描述。`,
    });
  }
  if (snapshot.sections.length < 2 && scrollSamples.length) {
    const seen = new Set();
    for (const sample of scrollSamples) {
      const normalized = compact(sample.text, 180);
      if (!normalized || normalized.length < 28) continue;
      const title = sample.heading || `滚动区段 ${modules.length + 1}`;
      const key = normalized.toLowerCase().replace(/[\u200b-\u200f\u2060\s\p{P}\p{S}]+/gu, ' ').trim();
      if ([...seen].some(previous => previous === key || (Math.min(previous.length, key.length) > 40 && (previous.startsWith(key.slice(0, 60)) || key.startsWith(previous.slice(0, 60)))))) continue;
      seen.add(key);
      modules.push({
        title,
        purpose: `滚动采样观察：视口约位于页面纵向 ${sample.position}%。可见内容：${normalized}`,
        style: `逐屏采样区段。标题字号约 ${sample.headingSize || '未检测'}px；正文继承页面主要字体 ${snapshot.body.fontFamily}、约 ${snapshot.body.fontSize}px。具体区块背景与图文构图以截图复核。`,
        components: `当前视口检测到 ${sample.images} 张图片、${sample.buttons} 个按钮、${sample.links} 个链接。可见文字：${normalized}`,
        interaction: `滚动触发的内容加载已通过页面滚动采样；${interactionText(title)} 未验证键盘操作、媒体播放和表单提交。`,
        analysis: `推断：此页面纵向区段以“${title}”相关内容延展叙事。建议结合桌面/手机截图检查图文节奏、滚动停留和后续行动路径；动态状态需人工核验。`,
      });
      if (modules.length >= MAX_SECTIONS) break;
    }
  }
  if (snapshot.footer.text) {
    modules.push({
      title: '页脚',
      purpose: `观察事实：${compact(snapshot.footer.text, 180)}`,
      style: `观察事实：页脚背景 ${snapshot.footer.background}。`,
      components: `实测结构：${snapshot.footer.links} 个链接、${snapshot.footer.buttons} 个按钮。`,
      interaction: `只识别页脚控件，链接目标及表单反馈未验证。${interactionText('页脚')}`,
      analysis: '建议核实联系信息、政策入口和版权内容，并确保所有链接有明确目的地。',
    });
  }
  if (!modules.length) {
    modules.push({ title: snapshot.title || '页面主体', purpose: `观察事实：页面标题“${snapshot.title || '未设置'}”。${compact(snapshot.description, 220) || '没有 meta description。'}`, style: `观察事实：页面默认字体 ${snapshot.body.fontFamily}，正文约 ${snapshot.body.fontSize}px，文字颜色 ${snapshot.body.color}，背景 ${snapshot.body.background}。`, components: `实测结构：${snapshot.headings.map(item => item.text).filter(Boolean).slice(0, 12).join('、') || '未检测到标题'}；${snapshot.body.buttons} 个按钮、${snapshot.body.links} 个链接、${snapshot.body.images} 张图片。`, interaction: interactionText(snapshot.title || '页面主体'), analysis: '页面结构语义标记较少，建议补充清楚的主要内容区块与标题层级，以提高可扫描性和辅助技术可理解度。' });
  }
  return modules;
}

export function interactionDelta(before, after) {
  const changes = [];
  if (before.expanded !== after.expanded && (before.expanded !== null || after.expanded !== null)) changes.push(`展开状态 ${before.expanded ?? '无'}→${after.expanded ?? '无'}`);
  if (before.selected !== after.selected && (before.selected !== null || after.selected !== null)) changes.push(`选中状态 ${before.selected ?? '无'}→${after.selected ?? '无'}`);
  if (before.pressed !== after.pressed && (before.pressed !== null || after.pressed !== null)) changes.push(`按下状态 ${before.pressed ?? '无'}→${after.pressed ?? '无'}`);
  if (before.checked !== after.checked && (before.checked !== null || after.checked !== null)) changes.push(`勾选状态 ${before.checked ?? '无'}→${after.checked ?? '无'}`);
  if (before.open !== after.open && (before.open !== null || after.open !== null)) changes.push(`内容面板 ${before.open ? '打开' : '关闭'}→${after.open ? '打开' : '关闭'}`);
  if (before.controlled !== after.controlled && (before.controlled || after.controlled)) changes.push(`关联内容${after.controlled ? '显示' : '隐藏'}`);
  if (before.color !== after.color) changes.push(`文字颜色 ${before.color}→${after.color}`);
  if (before.background !== after.background) changes.push(`背景 ${before.background}→${after.background}`);
  if (before.borderColor !== after.borderColor) changes.push(`边框颜色 ${before.borderColor}→${after.borderColor}`);
  if (before.boxShadow !== after.boxShadow) changes.push('阴影发生变化');
  if (before.filter !== after.filter) changes.push(`滤镜 ${before.filter}→${after.filter}`);
  if (before.opacity !== after.opacity) changes.push(`透明度 ${before.opacity}→${after.opacity}`);
  const dx = Math.round(after.x - before.x), dy = Math.round(after.y - before.y);
  if (dx || dy) changes.push(`元素位置 ${dx > 0 ? '向右' : dx < 0 ? '向左' : ''}${dx && dy ? '、' : ''}${dy > 0 ? '向下' : dy < 0 ? '向上' : ''}${Math.max(Math.abs(dx), Math.abs(dy))}px`);
  const transition = [after.duration, after.delay].filter(Boolean).join(' + ');
  const motion = transition && (changes.length || before.transform !== after.transform) ? `transition ${transition}${after.easing ? ` ${after.easing}` : ''}${before.transform !== after.transform ? `；transform ${before.transform}→${after.transform}` : ''}` : '';
  return { change: changes.join('；'), motion };
}

export async function captureInteractiveEvidence(page) {
  const evidence=[];
  const inspect=el=>el.evaluate(node=>{ const s=getComputedStyle(node),r=node.getBoundingClientRect(),id=node.getAttribute('aria-controls'); const controlled=id?document.getElementById(id):null; const visible=x=>{if(!x)return null;const cs=getComputedStyle(x),b=x.getBoundingClientRect();return cs.display!=='none'&&cs.visibility!=='hidden'&&Number(cs.opacity)!==0&&b.width>0&&b.height>0}; return {x:r.x,y:r.y,color:s.color,background:s.backgroundColor,borderColor:s.borderColor,boxShadow:s.boxShadow,filter:s.filter,opacity:s.opacity,transform:s.transform,duration:s.transitionDuration.split(',').map(v=>v.trim())[0],delay:s.transitionDelay.split(',').map(v=>v.trim())[0],easing:s.transitionTimingFunction.split(',').map(v=>v.trim())[0],expanded:node.getAttribute('aria-expanded'),selected:node.getAttribute('aria-selected'),pressed:node.getAttribute('aria-pressed'),checked:'checked'in node?String(node.checked):null,open:node instanceof HTMLDetailsElement?node.open:null,controlled:visible(controlled)}; });
  const areaAndLabel=el=>el.evaluate(node=>{const region=node.closest('header,[role="banner"],footer,[role="contentinfo"],main section,main article,main [role="region"],section,article');const heading=region?.querySelector('h1,h2,h3,h4,h5,h6,[role="heading"]');return {label:(node.innerText||node.getAttribute('aria-label')||node.title||node.getAttribute('alt')||node.tagName).trim().replace(/\s+/g,' ').slice(0,90),area:region?.matches('header,[role="banner"]')?'页头与导航':region?.matches('footer,[role="contentinfo"]')?'页脚':'',section:(heading?.innerText||region?.getAttribute('aria-label')||'').trim().replace(/\s+/g,' ').slice(0,100)};});
  const scrollHeight=await page.evaluate(()=>Math.max(0,document.documentElement.scrollHeight-innerHeight));
  const positions=[...new Set([0,.25,.5,.75,1].map(fraction=>Math.round(scrollHeight*fraction)))];
  const hoverSeen=new Set();let hoverCandidates=0;
  for(const position of positions){
    await page.evaluate(y=>scrollTo(0,y),position);await page.waitForTimeout(140);
    const handles=await page.evaluateHandle(()=>[...document.querySelectorAll('button,a[href],[role="button"],[role="tab"],summary,[tabindex]')].filter(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0&&r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&s.cursor==='pointer'}).slice(0,8));
    const elements=await handles.getProperties();
    for(let i=0;i<elements.size&&i<8;i++){
      const handle=elements.get(String(i))?.asElement();if(!handle)continue;
      try{const meta=await areaAndLabel(handle);const key=`${meta.section}|${meta.label}`;if(hoverSeen.has(key))continue;hoverSeen.add(key);hoverCandidates++;const before=await inspect(handle);await handle.hover({timeout:900});await page.waitForTimeout(220);const after=await inspect(handle);const delta=interactionDelta(before,after);if(delta.change)evidence.push({trigger:'悬停',...meta,...delta});}
      catch{/* detached or inaccessible elements are skipped */}
    }
    await handles.dispose();
  }
  await page.mouse.move(1,1).catch(()=>{});
  await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(120);
  const unsafeLabel=/购买|下单|结账|支付|删除|移除|退出|注销|登录|注册|提交|发送|保存|发布|确认|授权|subscribe|purchase|checkout|payment|delete|remove|logout|log out|sign in|sign up|submit|send|save|publish|confirm/i;
  const found=await page.evaluate(()=>{const isVisible=el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0&&r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight};const area=el=>{const region=el.closest('header,[role="banner"],footer,[role="contentinfo"],main section,main article,main [role="region"],section,article');const heading=region?.querySelector('h1,h2,h3,h4,h5,h6,[role="heading"]');return {area:region?.matches('header,[role="banner"]')?'页头与导航':region?.matches('footer,[role="contentinfo"]')?'页脚':'',section:(heading?.innerText||region?.getAttribute('aria-label')||'').trim().replace(/\s+/g,' ').slice(0,100)}};const unsafe=/购买|下单|结账|支付|删除|移除|退出|注销|登录|注册|提交|发送|保存|发布|确认|授权|subscribe|purchase|checkout|payment|delete|remove|logout|log out|sign in|sign up|submit|send|save|publish|confirm/i;const clicks=[...document.querySelectorAll('button[aria-expanded],[role="button"][aria-expanded],button[aria-pressed],[role="button"][aria-pressed],[role="tab"],summary,input[type="checkbox"]')].filter(el=>isVisible(el)&&!el.closest('form')&&!(el instanceof HTMLButtonElement&&(el.type==='submit'||el.type==='reset'))&&!(el instanceof HTMLAnchorElement)&&!el.hasAttribute('href')&&!unsafe.test((el.innerText||el.getAttribute('aria-label')||el.title||'').trim())).slice(0,12);return {clicks:clicks.map(el=>({label:(el.innerText||el.getAttribute('aria-label')||el.title||el.tagName).trim().replace(/\s+/g,' ').slice(0,90),...area(el)}))}});
  const clickHandles=await page.evaluateHandle(()=>[...document.querySelectorAll('button[aria-expanded],[role="button"][aria-expanded],button[aria-pressed],[role="button"][aria-pressed],[role="tab"],summary,input[type="checkbox"]')].filter(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect(),label=(el.innerText||el.getAttribute('aria-label')||el.title||'').trim();return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0&&r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&!el.closest('form')&&!(el instanceof HTMLButtonElement&&(el.type==='submit'||el.type==='reset'))&&!(el instanceof HTMLAnchorElement)&&!el.hasAttribute('href')&&!/购买|下单|结账|支付|删除|移除|退出|注销|登录|注册|提交|发送|保存|发布|确认|授权|subscribe|purchase|checkout|payment|delete|remove|logout|log out|sign in|sign up|submit|send|save|publish|confirm/i.test(label)}).slice(0,12));
  const clickElements=await clickHandles.getProperties();
  for (let i=0;i<found.clicks.length;i++) {
    const handle=clickElements.get(String(i))?.asElement();if(!handle)continue;
    try { const restoreTab=await page.locator('[role="tab"][aria-selected="true"]').first().elementHandle().catch(()=>null); const before=await inspect(handle); await handle.click({timeout:900}); await page.waitForTimeout(180); const after=await inspect(handle); const delta=interactionDelta(before,after); if(delta.change)evidence.push({trigger:'点击',label:found.clicks[i].label,section:found.clicks[i].section,area:found.clicks[i].area,...delta}); if(before.selected!==after.selected&&restoreTab)await restoreTab.click({timeout:900}).catch(()=>{}); else if(before.expanded!==after.expanded||before.pressed!==after.pressed||before.checked!==after.checked||before.open!==after.open){await handle.click({timeout:900}).catch(()=>{});await page.waitForTimeout(100);} await restoreTab?.dispose(); }
    catch { /* unsafe-to-complete or detached controls are skipped */ }
  }
  await clickHandles.dispose();
  return { evidence, hoverCandidates, safeClickCandidates:found.clicks.length };
}

export async function analyzeReference(rawUrl, { playwright, executablePath } = {}) {
  const safeUrl = await assertPublicTarget(rawUrl);
  if (!playwright?.chromium) throw new Error('网页分析浏览器未安装。请安装项目依赖并执行浏览器安装步骤。');
  const browser = await playwright.chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, serviceWorkers: 'block', ignoreHTTPSErrors: false });
  const page = await context.newPage();
  const blockedRequests = [];
  await context.route('**/*', async route => {
    const requestUrl = route.request().url();
    if (/^(data:|blob:|about:)/i.test(requestUrl)) return route.continue();
    try { await assertPublicTarget(requestUrl); return route.continue(); }
    catch { blockedRequests.push(new URL(requestUrl).hostname); return route.abort('blockedbyclient'); }
  });
  try {
    const response = await page.goto(safeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1200);
    const scrollSamples = [];
    let lastHeight = 0;
    let stableBottomCount = 0;
    for (let step = 0; step < 24; step += 1) {
      const sample = await page.evaluate(position => {
        const visible = element => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
        };
        const read = element => (element.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 220);
        const nodes = [...document.querySelectorAll('h1,h2,h3,h4,[role="heading"],p,li,blockquote')].filter(visible);
        const candidates = nodes.map(node => ({ node, text: read(node), level: node.tagName.match(/^H[1-6]$/)?.[0] || node.getAttribute('role') || '' })).filter(item => item.text.length > 12);
        const heading = candidates.find(item => /^H[1-6]$/.test(item.level) || item.level === 'heading');
        const imageCount = [...document.querySelectorAll('img')].filter(visible).length;
        const buttonCount = [...document.querySelectorAll('button,[role="button"]')].filter(visible).length;
        const linkCount = [...document.querySelectorAll('a[href]')].filter(visible).length;
        return { position, height: document.documentElement.scrollHeight, heading: heading?.text || candidates[0]?.text.slice(0, 64) || '', headingSize: heading ? Math.round(parseFloat(getComputedStyle(heading.node).fontSize)) : 0, text: candidates.map(item => item.text).filter((text, index, all) => all.indexOf(text) === index).slice(0, 8).join(' | '), images: imageCount, buttons: buttonCount, links: linkCount };
      }, Math.round((await page.evaluate(() => scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight))) * 100));
      if (sample.text && !scrollSamples.some(previous => previous.position === sample.position && compact(previous.text, 180) === compact(sample.text, 180))) scrollSamples.push(sample);
      lastHeight = Math.max(lastHeight, sample.height);
      const atBottom = await page.evaluate(() => scrollY + innerHeight >= document.documentElement.scrollHeight - 4);
      if (atBottom && sample.height <= lastHeight) stableBottomCount += 1;
      else stableBottomCount = 0;
      if (stableBottomCount >= 2) break;
      await page.evaluate(() => scrollBy(0, Math.max(560, innerHeight * 0.72)));
      await page.waitForTimeout(320);
    }
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(300);
    const snapshot = await page.evaluate(() => {
      const visible = element => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
      };
      const text = (element, limit = 520) => (element.innerText || '').replace(/\s+/g, ' ').trim().slice(0, limit);
      const color = element => { const s = getComputedStyle(element); return { color: s.color, background: s.backgroundColor, fontFamily: s.fontFamily.split(',')[0].replace(/["']/g, ''), fontSize: Math.round(parseFloat(s.fontSize)), fontWeight: s.fontWeight, lineHeight: s.lineHeight }; };
      const main = document.querySelector('main,[role="main"]') || document.body;
      const headings = [...main.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(visible).slice(0, 40).map(node => ({ level: node.tagName.toLowerCase(), text: text(node, 150), ...color(node) })).filter(item => item.text);
      let blocks = [...main.querySelectorAll('section,article,[role="region"]')].filter(visible).filter(node => text(node, 120).length > 15);
      if (blocks.length > 28) blocks = blocks.filter(node => ![...node.querySelectorAll('section,article,[role="region"]')].some(child => visible(child) && text(child, 120).length > 15));
      if (!blocks.length) blocks = [...main.children].filter(node => visible(node) && text(node, 120).length > 15 && !['SCRIPT','STYLE','NAV'].includes(node.tagName));
      const sections = blocks.slice(0, 18).map(node => {
        const h = node.querySelector('h1,h2,h3,h4,h5,h6');
        const cs = color(node);
        const images = [...node.querySelectorAll('img')].filter(visible);
        return { heading: h ? text(h, 120) : (node.getAttribute('aria-label') || ''), headingLevel: h?.tagName.toLowerCase() || '', headingSize: h ? Math.round(parseFloat(getComputedStyle(h).fontSize)) : cs.fontSize, text: text(node), background: cs.background, headings: [...node.querySelectorAll('h2,h3,h4')].filter(visible).map(x => text(x, 100)).filter(Boolean).slice(0, 8), buttons: [...node.querySelectorAll('button,[role="button"]')].filter(visible).length, links: [...node.querySelectorAll('a[href]')].filter(visible).length, images: images.length, imageAlts: images.map(image => image.alt).filter(Boolean).slice(0, 5), forms: [...node.querySelectorAll('form')].filter(visible).length };
      }).filter(item => item.heading || item.text.length > 35);
      const header = document.querySelector('header,[role="banner"]');
      const footer = document.querySelector('footer,[role="contentinfo"]');
      const navigation = [...document.querySelectorAll('header nav a[href],[role="banner"] a[href],nav a[href]')].filter(visible).map(a => ({ label: text(a, 80) || a.getAttribute('aria-label') || '', href: a.href })).filter(a => a.label).slice(0, 20);
      const bodyStyle = color(main);
      const controlText = element => text(element, 80) || element.getAttribute('aria-label') || element.getAttribute('title') || element.getAttribute('name') || '';
      const controls = [...main.querySelectorAll('button,[role="button"],a[href],input,select,textarea')].filter(visible).slice(0, 120).map(node => ({ type: node.tagName.toLowerCase(), label: controlText(node), href: node instanceof HTMLAnchorElement ? node.href : '' })).filter(item => item.label);
      return {
        title: document.title || '', description: document.querySelector('meta[name="description"]')?.content || '',
        headings, sections, navigation,
        header: { text: header && visible(header) ? text(header, 280) : '', background: header && visible(header) ? color(header).background : '未检测到可见页头', buttons: header && visible(header) ? header.querySelectorAll('button,[role="button"]').length : 0 },
        footer: { text: footer && visible(footer) ? text(footer, 360) : '', background: footer && visible(footer) ? color(footer).background : '未检测到语义化页脚', links: footer && visible(footer) ? footer.querySelectorAll('a[href]').length : 0, buttons: footer && visible(footer) ? footer.querySelectorAll('button,[role="button"]').length : 0 },
        body: { ...bodyStyle, buttons: [...main.querySelectorAll('button,[role="button"]')].filter(visible).length, links: [...main.querySelectorAll('a[href]')].filter(visible).length, images: [...main.querySelectorAll('img')].filter(visible).length }, controls,
        finalUrl: location.href,
      };
    });
    const interactionRun = await captureInteractiveEvidence(page);
    const interactionEvidence = interactionRun.evidence;
    const desktopShot = await page.screenshot({ type: 'jpeg', quality: 62, fullPage: false, animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(350);
    const mobile = await page.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth, hasHorizontalOverflow: document.documentElement.scrollWidth > innerWidth + 2 }));
    const mobileShot = await page.screenshot({ type: 'jpeg', quality: 56, fullPage: false, animations: 'disabled' });
    const modules = evidenceToModules(snapshot, scrollSamples, interactionEvidence);
    const warning = [];
    if (!response?.ok()) warning.push(`网页返回 HTTP ${response?.status() ?? '未知'}，部分内容可能未能加载。`);
    if (blockedRequests.length) warning.push(`为保护本地网络，已阻止 ${blockedRequests.length} 个指向内部地址的请求。`);
    if (mobile.hasHorizontalOverflow) warning.push('手机视口检测到横向溢出。');
    warning.push(`交互实测：扫描 ${interactionRun.hoverCandidates} 个悬停候选、${interactionRun.safeClickCandidates} 个安全点击候选，记录 ${interactionEvidence.length} 条可见状态变化；受权限限制的交互及未观察到差异的控件仍需人工检查。`);
    if (!snapshot.sections.length) warning.push('未识别到清晰的语义区块；已按滚动视口采样归纳内容区段。');
    return {
      source: { requestedUrl: safeUrl, finalUrl: snapshot.finalUrl, title: snapshot.title, description: snapshot.description, analyzedAt: new Date().toISOString(), httpStatus: response?.status() ?? null },
      modules,
      facts: { desktop: { viewport: '1440×1000', headingCount: snapshot.headings.length }, mobile: { viewport: '390×844', ...mobile }, body: snapshot.body, navigation: snapshot.navigation, controls: snapshot.controls, sampledViewports: scrollSamples.length, interactions: { hoverCandidates: interactionRun.hoverCandidates, safeClickCandidates: interactionRun.safeClickCandidates, observedChanges: interactionEvidence.length, evidence: interactionEvidence }, warnings: warning },
      screenshots: { desktop: `data:image/jpeg;base64,${desktopShot.toString('base64')}`, mobile: `data:image/jpeg;base64,${mobileShot.toString('base64')}` },
      analysisMode: 'browser-observed',
    };
  } finally {
    await context.close();
    await browser.close();
  }
}
