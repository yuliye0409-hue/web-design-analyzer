import { observationSpec, observationTriggerLabel } from './interaction-observations.mjs';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const STORAGE_KEY = 'web-design-analyzer-v1';
const ASSET_DB = 'web-design-assets-v1';
const ASSET_STORE = 'assets';
const MAX_ASSET_SIZE = 15 * 1024 * 1024;
const MAX_ASSETS = 20;
const MAX_TEXT_PER_ASSET = 20000;
const form = $('#analysis-form');
const toast = $('.toast');
const result = $('#result');
const moduleList = $('[data-module-list]');
const promptEditor = $('#prompt-output');
const crawlEvidence = $('[data-crawl-evidence]');
const observationList = $('[data-observation-list]');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let toastTimer;
let modules = [];
let generated = false;
let taskMode = 'analyze-build';
let manualObservations = [];
let customAssets = [];
let assetDbPromise;
let assetsReadyResolve;
const assetsReady = new Promise(resolve => { assetsReadyResolve = resolve; });
const assetUrls = new Map();

const initialModules = [
  { title: '导航与页头', purpose: '快速识别品牌并前往核心页面。', style:'横向结构、克制字号；记录标识与导航比例、吸顶高度和分隔方式。', components: '品牌标识、主导航、语言或主题入口、移动端菜单。', interaction: '当前页提示、菜单开合、吸顶、点击外部关闭和 Escape 键状态。', analysis:'这是全页定位锚点。导航项控制在可扫描范围，链接必须有真实目标并保留键盘焦点。' },
  { title: '首屏主视觉', purpose: '在首屏建立品牌印象，并明确页面最重要的行动。', style:'检查标题字形/断行、对齐、文字与主图比例、图像裁切、色彩和留白节奏。', components: '主标题、辅助说明、主行动按钮、产品或人物主图。', interaction: '记录视差、入场、CTA 状态和移动端重排；动画不能阻止阅读或行动。', analysis:'首屏应说明页面定位并指向核心行动。检查信息可读性、图像焦点和主按钮对比度。' },
  { title: '核心内容 / 作品展示', purpose: '按用户决策顺序解释价值或呈现代表作品。', style:'拆解栅格列数、卡片比例、图片统一性、标题信息层级和区块留白。', components: '区块标题、图文内容、作品卡片、类别或编号。', interaction: '记录悬停位移/遮罩、点击路径、筛选、触屏替代反馈和加载状态。', analysis:'卡片要呈现清楚的内容排序；筛选具备空结果与重置；案例区分真实交付与概念稿。' },
  { title: '信任与证明', purpose: '用可核实的信息降低访问者的决策成本。', style:'以数字、引用或标志阵列建立可信感，视觉权重低于主转化区。', components: '客户评价、合作品牌、数据指标、资历或服务承诺。', interaction: '如有轮播注明手动控制、暂停与无自动播放方案；关键数据不依赖动效。', analysis:'客户、评价和数字需要来源；没有真实材料时不生成假数据，改为明确待补或移除。' },
  { title: '关键交互模块', purpose: '让主要信息更容易浏览并鼓励继续探索。', style:'状态表达须同时使用文本、边框或形状，不可只通过颜色区分。', components: '标签页、筛选器、手风琴、图库或产品选项。', interaction: '定义默认、悬停、聚焦、选中、展开、加载、空、错误和禁用状态；说明触屏/键盘操作。', analysis:'每个交互服务于信息组织或任务完成；检查焦点管理、ARIA 语义和无脚本内容兜底。' },
  { title: '联系与页脚', purpose: '为访问者提供明确的下一步及完整页面收尾。', style:'用背景区块或边界收尾，联系行动醒目，辅助链接分组且不抢主视觉。', components: '最终行动区、联系方式、辅助导航、版权信息。', interaction: '表单具备验证/提交/成功/错误状态，联系方式可复制，外链安全打开。', analysis:'页脚补充导航与信任，不堆砌无关链接；联系按钮和版权信息需真实有效。' },
];
const pageOverrides = {
  '品牌官网': [
    ['品牌导航与页头','建立完整品牌识别与站点导航。','品牌标识、品牌导航、语言切换、菜单入口。','桌面与移动导航切换；滚动状态和当前页面状态明确。'],
    ['品牌首屏叙事','用产品或品牌主张快速建立记忆。','品牌标题、价值主张、核心视觉、主要行动。','主行动跳转至品牌故事或精选产品；动效不阻塞阅读。'],
    ['产品 / 品牌系列','展示产品类别与差异化。','系列卡片、产品图、名称、简短价值说明。','卡片点击进入对应集合；焦点和悬停状态一致。'],
    ['品牌故事与工艺','补足品牌可信度与产品背景。','品牌由来、设计细节、材料或制作过程。','可用内容展开交互，但重要信息不能只藏在悬停中。'],
    ['社会证明与服务','建立购买信心与预期管理。','评价、保障、配送或售后政策。','信息来源真实、边界明确；移动端阅读顺序合理。'],
    ['转化区与页脚','让用户能继续购物或获取品牌信息。','主行动按钮、联系入口、辅助链接、社交入口。','链接目标明确，表单具备成功、失败和校验反馈。'],
  ],
  '电商商品详情页': [
    ['品牌导航与商品定位','帮助用户辨认品牌并浏览商品分类。','品牌标识、品类导航、搜索、购物袋入口。','搜索可提交；移动端用可关闭的菜单抽屉。'],
    ['商品媒体与购买区','清楚呈现商品并缩短购买决策路径。','主图、缩略图、商品名、价格、选项、购买按钮。','缩略图切换主图；选项联动库存状态；加入购物车有结果反馈。'],
    ['核心卖点与场景','用消费者语言解释商品价值。','优先级明确的卖点、使用场景、功能对照。','锚点导航滚动到相应详情；减少重复描述。'],
    ['规格与兼容信息','回答购买前的实际疑问。','尺寸、材质、连接方式、兼容性、包装内容。','采用易扫描的信息分组；无数据时不要猜测补写。'],
    ['评价与疑问','用用户反馈和问题回答建立信任。','商品评价、常见问题、保修配送政策。','评价筛选或问答展开状态清晰；服务承诺须来源可靠。'],
    ['相关商品与页脚','支持继续发现商品及访问支持服务。','相关商品、品牌故事、帮助中心、联系信息。','商品卡片可打开详情；避免装饰性死按钮。'],
  ],
  '个人作品集': [
    ['个人导航与身份','明确创作者身份并让主要页面可达。','姓名或标识、作品、关于、能力、联系入口。','移动菜单支持展开关闭；当前所在区段有可见状态。'],
    ['个人首屏定位','一句话传达专业方向及作品集价值。','身份标题、简介、主视觉、浏览作品按钮。','行动入口直达作品；动画尊重减少动态偏好。'],
    ['精选项目档案','用有层级的案例展示工作质量与方法。','作品卡片、分类、缩略图、角色和成果摘要。','筛选、画廊或目录视图；点击查看可分享的项目详情。'],
    ['案例详情','解释问题、过程、设计决策和结果。','案例背景、目标、职责、过程图、结果与反思。','详情支持关闭、返回与浏览器历史；图片标注说明。'],
    ['个人能力与经历','展示专业能力、履历和协作方式。','能力分组、工具、工作经历、教育或成果。','标签切换或折叠项可由键盘访问；非重点信息默认收起。'],
    ['联系与页脚','提供直接、可信的沟通方式。','合作邀请、邮件、社交链接、简历和版权说明。','邮箱可复制并显示反馈；所有联系按钮有实际目标。'],
  ],
};
const demo = {
  url: 'https://nesilnoble.com/',
  pageType: '品牌官网',
  audience: '关注设计感与高品质桌面外设的消费者',
  goal: '建立品牌识别，介绍键盘产品并引导用户查看产品系列',
  visualNotes: '大面积留白，产品摄影质感突出；粗细对比鲜明的标题；导航克制；滚动时分段讲述品牌故事；交互要细腻但不能影响购买信息的可读性。',
  palette: '黑白灰，简洁高级',
  responsive: '桌面、平板、手机完整适配',
};

function notify(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}
function esc(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
}
function currentInputs() {
  return Object.fromEntries(new FormData(form).entries());
}
function titleCase(value) { return String(value || '').trim() || '其他网页'; }
function moduleStyle(title,pageType) {
  const t=title.toLowerCase();
  if(/导航|页头/.test(t)) return '记录品牌标识与导航的对齐、比例、间距、吸顶前后高度和边界；指出固定/吸顶形式以及桌面与移动端布局变化。';
  if(/首屏|主视觉|主张|行动区|hero/.test(t)) return '逐项说明标题的字体风格、字重、大小层级与断行；文案宽度、图文占比、主图裁切、背景、留白、CTA 色彩与对齐关系。';
  if(/商品媒体|产品|作品|项目|集合|系列|商品/.test(t)) return '描述网格列数、卡片宽高比、图片比例和背景、卡片间距、标题/价格层级、图文构图及筛选控件的位置。';
  if(/故事|工艺|能力|经历|解决方案|功能/.test(t)) return '说明内容分段、图文交替关系、标题层级、正文最大宽度、背景色带和阅读节奏；关注长页中的视觉变化。';
  if(/信任|评价|证明|规格|兼容|疑问|faq/.test(t)) return '拆解高密度信息的分组、标签/引用/数字的视觉权重、表格或折叠内容的可扫描性以及移动端排版。';
  if(/联系|页脚|转化/.test(t)) return '说明结尾区域的底色/边界、行动按钮层级、联系信息分组、辅助链接列数和页脚留白。';
  return `针对${titleCase(pageType)}的“${title}”记录字体层级、网格与间距、色彩、图片比例、内容密度和区块边界，并区分参考网站事实与设计建议。`;
}
function moduleAnalysis(title,pageType) {
  const t=title.toLowerCase();
  if(/导航|页头/.test(t)) return '作为站点定位与导览入口，分析导航数量、信息优先级、当前状态、可达性和移动端替代方案；确认每个链接目标真实存在。';
  if(/首屏|主视觉|主张|行动区|hero/.test(t)) return '首屏负责快速回答“这是什么、适合谁、下一步是什么”。检查主标题可读性、视觉焦点和行动路径，标注低优先级装饰。';
  if(/商品媒体|产品|作品|项目|集合|系列|商品/.test(t)) return '内容卡片应便于比较并保持一致的媒体比例。分析排序、筛选/分页状态、可点击区域及图片缺失后备，避免装饰压过商品/案例信息。';
  if(/信任|评价|证明|规格|兼容|疑问|faq/.test(t)) return '这类信息用于降低购买或合作风险。检查可核验来源、信息完整性、比较效率和移动端阅读；禁止编造评价、规格或数据。';
  if(/联系|页脚|转化/.test(t)) return '验证行动目标、表单状态、联系信息和政策链接是否完整；移除视觉上可点击但没有行为的控件。';
  return `说明该模块在${titleCase(pageType)}的信息架构中承接什么任务、解决什么用户疑问、与前后模块如何衔接，并提出一项改善建议。`;
}
function learningPoint(title) {
  const t=title.toLowerCase();
  if(/导航|页头/.test(t)) return ['信息架构','把导航按用户任务分组，并将最重要行动与辅助链接区分，可以降低查找成本。'];
  if(/首屏|主视觉|主张|行动区|hero/.test(t)) return ['视觉层级','先用字号、位置和对比建立阅读顺序，再加入装饰；首屏应在几秒内说明页面是什么、下一步做什么。'];
  if(/商品媒体|产品|作品|项目|集合|系列/.test(t)) return ['格式塔：相似性','卡片使用一致的比例、间距和信息顺序，用户才能快速比较产品或案例，而不会被布局差异分散注意力。'];
  if(/信任|评价|证明/.test(t)) return ['可信度与证据','评价、数字和标志属于“社会证明”；必须来自可核验来源，展示方式应让用户判断真实性。'];
  if(/规格|兼容|疑问|faq/.test(t)) return ['渐进披露','次要信息可通过折叠收纳，重要决策信息应默认可见；折叠内容必须有明确状态并可访问。'];
  if(/联系|页脚|转化/.test(t)) return ['行动成本','行动按钮的文案、位置和目标要一致；表单字段越精简，完成任务的成本通常越低。'];
  return ['用户任务','模块应围绕一个清楚的用户任务组织信息，并与前后区块形成自然的阅读路径。'];
}
function moduleDefaults(pageType) {
  let defaults;
  if (pageOverrides[pageType]) defaults=pageOverrides[pageType].map(([title,purpose,components,interaction]) => ({ title,purpose,components,interaction }));
  else if (pageType === '营销落地页') defaults = [
    { title:'品牌页头', purpose:'快速确认品牌来源并提供必要导航。', components:'品牌标识、精简导航、联系入口。', interaction:'移动端菜单可展开关闭；避免导航分散转化注意力。' },
    { title:'主张与行动区', purpose:'清楚呈现价值主张、目标人群和唯一主行动。', components:'一句主标题、补充说明、主行动按钮、可信视觉。', interaction:'按钮滚动到表单或转化区；点击后有明确反馈。' },
    { title:'问题与解决方案', purpose:'对应目标用户痛点并解释产品如何解决。', components:'用户问题、解决方法、核心差异。', interaction:'通过顺序阅读建立论证，不强迫自动播放。' },
    { title:'功能与社会证明', purpose:'提供支持决策的功能细节和真实证据。', components:'功能说明、案例、评价、可核实指标。', interaction:'评价和数字必须真实；媒体素材提供替代文本。' },
    { title:'常见问题与转化', purpose:'消除最后疑虑并收集或完成转化。', components:'常见问题、短表单、再次出现的主行动。', interaction:'表单有必填校验、提交中、成功及错误状态。' },
    { title:'页脚', purpose:'提供必要补充信息而不冲淡主转化。', components:'联系、政策、版权、社交入口。', interaction:'链接可访问并有清楚目标。' },
  ];
  else defaults=initialModules.map(module => ({ ...module }));
  return defaults.map(module => ({ ...module, style:module.style || moduleStyle(module.title,pageType), analysis:module.analysis || moduleAnalysis(module.title,pageType) }));
}
function setProgress(step) {
  $$('.workflow-step').forEach((node, index) => node.classList.toggle('is-active', index < step));
}
function updatePreview(input) {
  const isEcom = /商品|品牌|电商/.test(input.pageType || '');
  const headline = (input.visualNotes || '').match(/[“"「]([^”"」]{2,18})[”"」]/)?.[1];
  $('[data-preview-url]').textContent = input.url ? input.url.replace(/^https?:\/\//, '').replace(/\/$/, '').toUpperCase() : 'REFERENCE / WAITING FOR INPUT';
  $('[data-preview-brand]').textContent = isEcom ? 'PRODUCT / BRAND' : 'NAME / PRACTICE';
  $('[data-preview-title]').innerHTML = headline ? esc(headline).replace(/\s+/g, '<br>') : isEcom ? 'MADE FOR<br>BETTER DAYS.' : 'DESIGN<br>WITH INTENT.';
  $('[data-preview-eyebrow]').textContent = isEcom ? '01 — PRODUCT EXPERIENCE' : '01 — DIGITAL EXPERIENCE';
  $('[data-preview-cta]').textContent = isEcom ? 'EXPLORE THE COLLECTION ↗' : 'EXPLORE THE WORK ↗';
  $('[data-preview-section]').textContent = isEcom ? 'The collection.' : 'Selected projects.';
}
function renderModules() {
  moduleList.innerHTML = modules.map((module,index) => `<article class="module-card" data-index="${index}">
    <span class="module-order">${String(index+1).padStart(2,'0')}</span>
    <div class="module-fields">
      <label>模块名称<input class="module-title-input" data-field="title" value="${esc(module.title)}" aria-label="第 ${index+1} 个模块名称"></label>
      <label>模块目的<input data-field="purpose" value="${esc(module.purpose)}" aria-label="第 ${index+1} 个模块目的"></label>
      <label>设计风格与排版<textarea data-field="style" aria-label="第 ${index+1} 个模块设计风格与排版">${esc(module.style || '')}</textarea></label>
      <label>组件与信息层级<textarea data-field="components" aria-label="第 ${index+1} 个模块组件与信息层级">${esc(module.components || '')}</textarea></label>
      <label>动效与交互<textarea data-field="interaction" aria-label="第 ${index+1} 个模块动效与交互">${esc(module.interaction || '')}</textarea></label>
      <label>专业判断与建议<textarea data-field="analysis" aria-label="第 ${index+1} 个模块专业判断与建议">${esc(module.analysis || '')}</textarea></label>
    </div>
    <aside class="module-lesson"><span>DESIGN NOTE / ${esc(learningPoint(module.title || '')[0])}</span><p>${esc(learningPoint(module.title || '')[1])}</p></aside>
    <div class="module-actions"><button type="button" data-move="up" aria-label="第 ${index+1} 个模块上移" title="上移" ${index===0?'disabled':''}>↑</button><button type="button" data-move="down" aria-label="第 ${index+1} 个模块下移" title="下移" ${index===modules.length-1?'disabled':''}>↓</button><button type="button" data-remove aria-label="删除第 ${index+1} 个模块" title="删除">×</button></div>
  </article>`).join('');
  $('[data-module-count]').textContent = String(modules.length).padStart(2,'0');
  if (generated) buildPrompt();
}
function modulesFromUI() {
  return $$('.module-card',moduleList).map(card => Object.fromEntries($$('[data-field]',card).map(field => [field.dataset.field,field.value.trim()])));
}
function renderObservations() {
  const triggerName = observationTriggerLabel;
  observationList.innerHTML = manualObservations.map((item,index) => `<article class="observation-card" data-observation-index="${index}">
    <div class="observation-card-head"><strong>${String(index+1).padStart(2,'0')} / ${triggerName(item.trigger)}观察</strong><button type="button" data-remove-observation aria-label="删除第 ${index+1} 条观察" title="删除记录">×</button></div>
    <div class="observation-fields">
      <label>所属模块<input data-observation-field="module" value="${esc(item.module || '')}" placeholder="例如：产品展示区"></label>
      <label>目标元素<input data-observation-field="target" value="${esc(item.target || '')}" placeholder="例如：产品卡片 / 价格筛选"></label>
      <label>触发条件<input data-observation-field="condition" value="${esc(item.condition || '')}" placeholder="例如：鼠标移入卡片"></label>
      <label>动效方向<input data-observation-field="direction" value="${esc(item.direction || '')}" placeholder="例如：向上 4px / 淡入"></label>
      <label class="observation-wide">触发前状态<textarea data-observation-field="before" placeholder="记录触发前的内容、颜色、位置或展开状态">${esc(item.before || '')}</textarea></label>
      <label class="observation-wide">触发后状态<textarea data-observation-field="after" placeholder="记录触发后变化以及结束状态">${esc(item.after || '')}</textarea></label>
      <label>动效时长 / 节奏<input data-observation-field="timing" value="${esc(item.timing || '')}" placeholder="例如：约 240ms，轻缓"></label>
      <label>缓动 / 补充<input data-observation-field="easing" value="${esc(item.easing || '')}" placeholder="例如：ease-out / 先快后慢"></label>
    </div>
  </article>`).join('');
  $('[data-observer-count]').textContent = manualObservations.length ? `已记录 ${manualObservations.length} 条人工观察` : '尚无手动观察记录';
  const reference = $('#reference-url').value.trim();
  const open = $('[data-open-reference]');
  try { const url = new URL(reference); open.href = ['http:','https:'].includes(url.protocol) ? url.href : 'about:blank'; open.toggleAttribute('aria-disabled', !['http:','https:'].includes(url.protocol)); }
  catch { open.href = 'about:blank'; open.toggleAttribute('aria-disabled', true); }
}
function currentModeLabel() {
  return ({ 'analyze-build':'分析并搭建','build':'按现有分析搭建','analyze':'只分析网页' })[taskMode];
}
function termRules(enabled) {
  return enabled ? `\n## VibeHub 需求表达约定\n- 保留用户原意，不擅自新增业务目标或技术方案。\n- 如果描述较模糊，先把它改写成可观察、可验证的界面行为，再开始执行；仍有关键歧义时列出明确假设。\n- 只在能改善协作时补充一个准确 UI/网页术语，并用一句通俗话解释；不要堆砌术语。\n` : '';
}
function selectedSkillRules() {
  const blocks=[];
  if ($('#include-design-skill').checked) blocks.push(`## 前端视觉设计技能\n- 开始前确认目标用户、页面用途、设计语气、品牌约束和可用素材；先确定视觉方向与设计 token，再搭建组件。\n- 根据内容选择有辨识度的字体组合、色彩比例、空间构图和图片语言；避免套用无关的常见模板，设计差异必须服务页面定位。\n- 动效有明确的触发、持续与结束状态；优先使用轻量 CSS 动效，避免无目的的装饰动画。\n- 将设计风格转成可维护的 CSS 变量或主题配置，保持组件和页面之间的一致性。`);
  if ($('#include-quality-skill').checked) blocks.push(`## 交互与质量评审技能\n- 按用户任务评审：主要行动是否清楚、步骤是否直接、每个界面是否说明当前状态与下一步。\n- 检查视觉工艺：一致的类型层级、色彩和间距 token、图片裁切、对比度、组件状态、响应式重排与动效节制。\n- 检查可信与可用：键盘可操作、焦点可见且不被遮挡、触屏目标足够大、缩放有效、表单和错误信息可恢复、反馈可理解。\n- 优先列出影响用户完成任务的问题，并区分阻断/高/一般优先级；建议应指向具体模块与观察证据。`);
  return blocks.length ? `\n${blocks.join('\n\n')}\n` : '';
}
function openAssetDb() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('此浏览器不支持本地素材保存'));
  if (!assetDbPromise) assetDbPromise = new Promise((resolve,reject) => {
    const request = indexedDB.open(ASSET_DB,1);
    request.onupgradeneeded = () => request.result.createObjectStore(ASSET_STORE,{keyPath:'id'});
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return assetDbPromise;
}
async function storeAsset(asset) {
  const db = await openAssetDb();
  return new Promise((resolve,reject) => {
    const transaction = db.transaction(ASSET_STORE,'readwrite');
    transaction.objectStore(ASSET_STORE).put(asset);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}
async function deleteStoredAsset(id) {
  const db = await openAssetDb();
  return new Promise((resolve,reject) => {
    const transaction = db.transaction(ASSET_STORE,'readwrite');
    transaction.objectStore(ASSET_STORE).delete(id);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}
async function readStoredAssets() {
  const db = await openAssetDb();
  return new Promise((resolve,reject) => {
    const request = db.transaction(ASSET_STORE,'readonly').objectStore(ASSET_STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}
function assetRole(name,type) {
  if (type.startsWith('image/')) return '网页图片 / 视觉素材';
  if (/简历|resume|cv/i.test(name)) return '个人简历';
  if (/公司|company|brand/i.test(name)) return '公司 / 品牌信息';
  return '其他资料';
}
function formatBytes(size) { return size < 1024 * 1024 ? `${Math.max(1,Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`; }
function assetText(file) {
  return file.type.startsWith('text/') || /\.(txt|md|csv|json)$/i.test(file.name);
}
function renderAssets() {
  const list = $('[data-asset-list]');
  $('[data-asset-count]').textContent = customAssets.length ? `${customAssets.length} 项本地素材` : '尚未添加素材';
  list.innerHTML = customAssets.map(asset => `<article class="asset-item" data-asset-id="${esc(asset.id)}">
    <div class="asset-preview">${asset.type.startsWith('image/') ? `<img data-asset-image alt="${esc(asset.name)}">` : `<span>${esc((asset.name.split('.').pop() || 'FILE').slice(0,5).toUpperCase())}</span>`}</div>
    <div class="asset-content"><div class="asset-heading"><strong title="${esc(asset.name)}">${esc(asset.name)}</strong><span>${formatBytes(asset.size)}</span></div>
      <div class="asset-controls"><label>用途<select data-asset-role aria-label="${esc(asset.name)} 的用途"><option ${asset.role==='网页图片 / 视觉素材'?'selected':''}>网页图片 / 视觉素材</option><option ${asset.role==='个人简历'?'selected':''}>个人简历</option><option ${asset.role==='公司 / 品牌信息'?'selected':''}>公司 / 品牌信息</option><option ${asset.role==='产品资料'?'selected':''}>产品资料</option><option ${asset.role==='项目案例'?'selected':''}>项目案例</option><option ${asset.role==='其他资料'?'selected':''}>其他资料</option></select></label>
      <label>使用备注<input data-asset-note value="${esc(asset.note || '')}" placeholder="说明替换哪个模块、需保留什么内容" aria-label="${esc(asset.name)} 的使用备注"></label></div>
      <div class="asset-actions"><button type="button" class="small-button" data-asset-download>下载到项目</button><button type="button" class="text-button" data-asset-remove>移除</button></div>
      ${asset.textContent !== undefined ? `<details class="asset-details"><summary>提示词将包含文本内容</summary><textarea data-asset-text aria-label="${esc(asset.name)} 的提取文本">${esc(asset.textContent)}</textarea></details>` : ''}
      ${asset.extractionNote ? `<small class="asset-note">${esc(asset.extractionNote)}</small>` : ''}</div></article>`).join('');
  customAssets.forEach(asset => {
    if (!asset.type.startsWith('image/') || !asset.blob) return;
    let url = assetUrls.get(asset.id);
    if (!url) { url = URL.createObjectURL(asset.blob); assetUrls.set(asset.id,url); }
    const image = list.querySelector(`[data-asset-id="${CSS.escape(asset.id)}"] [data-asset-image]`);
    if (image) image.src = url;
  });
}
async function addAssets(files) {
  await assetsReady;
  const selected = [...files];
  for (const file of selected) {
    if (customAssets.length >= MAX_ASSETS) { notify(`最多保存 ${MAX_ASSETS} 项素材`); break; }
    if (!file.type.startsWith('image/') && !assetText(file) && !/\.(pdf|docx)$/i.test(file.name)) { notify(`${file.name} 格式暂不支持`); continue; }
    if (file.size > MAX_ASSET_SIZE) { notify(`${file.name} 超过 15 MB，未添加`); continue; }
    const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const textContent = assetText(file) ? (await file.text()).slice(0,MAX_TEXT_PER_ASSET) : undefined;
    const canReadText = assetText(file);
    const asset = { id,name:file.name,type:file.type || 'application/octet-stream',size:file.size,role:assetRole(file.name,file.type || ''),note:'',blob:file, ...(canReadText ? {textContent} : {extractionNote:/\.(pdf|docx)$/i.test(file.name) ? '此格式不会自动解析文字；请将关键事实粘贴到上方资料框。' : '二进制文件仅保存在本地；请下载并放入 Agent 可访问的项目目录。'}) };
    try { await storeAsset(asset); customAssets.push(asset); }
    catch { notify('本地素材保存失败，请检查浏览器存储空间'); break; }
  }
  renderAssets();
  buildPrompt();
}
async function loadAssets() {
  try { customAssets = await readStoredAssets(); renderAssets(); }
  catch { $('[data-asset-count]').textContent = '本机素材存储不可用'; }
  assetsReadyResolve();
  if (!promptEditor.value) buildPrompt();
}
function customContentPrompt() {
  const brief = $('#custom-brief').value.trim();
  if (!brief && !customAssets.length) return '';
  const inventory = customAssets.map(asset => {
    const text = asset.textContent?.trim();
    return `- 文件：${asset.name}（${asset.role}，${formatBytes(asset.size)}）${asset.note ? `；使用备注：${asset.note}` : ''}${text ? `\n  - 文件文本：\n${text}` : ''}`;
  }).join('\n');
  return `\n## 用户自定义资料与素材替换规则\n以下是用户提供的真实资料。制作网页时，按用途将它们替换到对应模块，替换通用示例、虚构身份/公司/产品信息和占位内容；简历经历、公司信息及产品卖点只允许依据下方事实，不得自行补造。\n${brief ? `\n### 用户粘贴的品牌与业务事实\n${brief}\n` : ''}${inventory ? `\n### 已上传素材清单\n${inventory}\n` : ''}\n### 附件交接约束\n- 纯文本附件内容已嵌入本提示词；若超过 20,000 字符，内容可能被截断，请核验原文件。\n- 图片、PDF、DOCX 等二进制文件仍保存在用户浏览器本机，不会随提示词自动发送。仅当这些文件已作为附件提供或已存在于当前项目工作区时才能读取和使用。\n- 如果目标文件在 Agent 工作区不可见，先明确告知用户将对应文件下载并放入项目；不要伪称已读取、不要用随机图片或虚构资料替代。\n- 将每个可用图片映射到清单所写用途/备注对应的模块，保留文件原名并为图片补充准确替代文本。\n`;
}
function buildPrompt() {
  const data = currentInputs();
  modules = modulesFromUI();
  const urlLine = data.url ? `参考网页：${data.url}` : '参考网页：未提供。请基于下方页面目标完成分析，不要声称已检查外部网站。';
  const audienceLine = data.audience?.trim() ? data.audience.trim() : '结合页面类型推断；在交付说明中列明假设。';
  const goalLine = data.goal?.trim() ? data.goal.trim() : '让目标用户快速理解页面价值，并完成最重要的下一步。';
  const observationLine = data.visualNotes?.trim() ? data.visualNotes.trim() : '请先观察参考网页的实际视觉与内容，再归纳；若无法访问，向用户说明并基于页面目标提出有标注的建议。';
  const stack = $('#tech-stack').value.trim() || '先检查当前工作区结构及技术栈，优先沿用现有方案；若是空项目，再选择最简单可运行的实现。不要擅自添加依赖。';
  const extras = $('#extra-constraints').value.trim() || '所有区块内容、图片、色彩、顺序和开关应便于后续独立修改；不要加入没有业务依据的功能。';
  const moduleSpecContent = modules.length ? modules.map((m,index) => { const manual = manualObservations.filter(item => item.module && item.module.trim().toLowerCase() === String(m.title || '').trim().toLowerCase()).map(observationSpec); const interaction = [m.interaction || '定义加载、悬停、点击、滚动、键盘/触屏及反馈状态',...manual].join('\n  - 人工观察补充：'); return `### ${String(index+1).padStart(2,'0')} ${m.title || '未命名模块'}\n- 模块目的：${m.purpose || '结合上下文定义并说明假设'}\n- 设计风格与排版：${m.style || '检查参考页的字体层级、色彩、栅格、间距、图片比例和区块边界'}\n- 组件与信息层级：${m.components || '列出真实内容、交互组件及其优先级'}\n- 动效与交互：${interaction}\n- 专业判断与实施建议：${m.analysis || '解释该模块解决的用户任务、设计取舍和实现注意事项'}`; }).join('\n\n') : '根据目标页面先提炼合理的模块层级，避免使用空洞的默认区块。';
  const unassignedObservations = manualObservations.filter(item => !item.module || !modules.some(module => String(module.title || '').trim().toLowerCase() === item.module.trim().toLowerCase()));
  const manualEvidence = unassignedObservations.length ? `\n\n## 尚未归类的人工交互记录\n${unassignedObservations.map((item,index) => `${index+1}. ${observationSpec(item)}`).join('\n')}\n请将这些记录归入最匹配的页面模块，不要遗漏。` : '';
  const moduleSpec = `${moduleSpecContent}${manualEvidence}`;
  const ref = $('#reference-url').value.trim();
  const mode = taskMode === 'analyze' ? '本次只做分析，不写或修改代码。' : taskMode === 'build' ? '根据已整理的模块直接实现，不重复开展大范围竞品分析；如果参考页可访问，仍需先核对视觉方向。' : '先检查参考页面并完成结构化分析，再按分析落地网页；不要在分析前直接开始堆 UI。';
  const moduleAction = taskMode === 'analyze' ? '逐模块分析输出' : '模块搭建与交付';
  const agentIntro = $('#agent-name').value.trim() ? `交付对象：${$('#agent-name').value.trim()}。` : '交付对象：任意具备网页浏览或代码能力的 AI Agent。';
  const prompt = `# 网页设计分析与搭建任务\n\n${agentIntro}\n任务方式：${currentModeLabel()}。${mode}\n\n## 项目目标\n- 页面类型：${titleCase(data.pageType)}\n- 目标用户：${audienceLine}\n- 页面主要目标：${goalLine}\n- 期望色调：${data.palette || '由参考网站决定'}\n- 设备适配：${data.responsive || '桌面与手机都适配'}\n- ${urlLine}\n- 用户观察：${observationLine}\n${customContentPrompt()}\n## 第一阶段：逐页检查参考网站\n${ref ? `请在你具备的浏览器或网页检查工具中打开并实际检查 ${ref}。先确认页面是否可访问，再遍历完整长页，按“导航/页头、首屏、每个内容区段、转化区、页脚”逐一编号，不可只分析首屏。` : '未提供参考网址。请根据目标页面类型和目标用户进行分析，并将基于常见模式的判断标注为建议，不得伪称是来源网站的事实。'}\n对于每个区段分别记录：①实际看到的内容及其目的；②布局、网格、对齐、留白、字体层级、色彩、图片比例/裁切和装饰风格；③组件职责和内容优先级；④进入视口、滚动、悬停、点击、切换、展开、加载时的动效曲线/方向/时长（只能描述能观察到的内容）；⑤桌面与移动端行为；⑥专业评价：有效之处、可用性或转化风险、可复用的设计原则和实施建议。区分“观察到的事实”“推断”“建议”，不确定处明确标注。\n如果你无法访问参考网页，请明确说明无法访问；不要编造页面内容。此时继续使用下方输入和假设，给出可执行的替代方案。不要尝试绕过登录或访问限制。\n\n## 第二阶段：输出完整设计分析\n1. 页面定位、受众、核心转化与主要用户路径。\n2. 全站信息架构及从首屏到页脚的模块顺序。\n3. 对每个实际存在的模块分别给出：模块目标、视觉风格/版式、组件与内容层级、动效/交互时序与触发、状态反馈、响应式变化、专业评估及可复用设计知识。\n4. 汇总交互矩阵：触发方式、反馈、键盘/触屏操作、加载/空/错误/成功状态。\n5. 汇总视觉规范：颜色（尽量给出可观察的色值/近似值并注明估算）、字体层级、网格、间距、图片比例、边框/圆角和动效原则。\n6. 列出移动端与桌面端差异、无障碍风险、性能风险、素材真实性风险。\n7. 提供可复用组件清单和方便后续改内容、图片、排序、显示开关的配置设计。\n\n## 第三阶段：${moduleAction}\n${moduleSpec}\n\n## 实施约束\n- 技术环境：${stack}\n- 其他要求：${extras}\n- 主要模块需独立成组件，并有便于非开发者调整文案、图片、主题、顺序和启用状态的配置入口。\n- 实现完整交互与状态，不要留下无行为的假按钮；动效需说明触发与结束状态，并支持减少动态效果设置。\n- 确保桌面、平板、手机布局可用且无横向溢出；图片具备替代文本和合理加载/失败后备。\n- 使用真实、可授权且相关的视觉素材；不将参考品牌素材误作用户自有资产。\n- 不引入不必要的库，不覆盖工作区未提交的用户改动；完成后运行现有检查并说明结果。\n- 严禁虚构客户、销量、评价、个人经历或业务数据；缺少事实时使用明确占位或询问。\n\n## 交付顺序\n先交逐模块专业分析，再简述信息架构和组件边界，之后实现；最后说明修改文件、模块编辑方式、运行/验证结果，以及尚未解决的假设或限制。${selectedSkillRules()}${termRules($('#include-vibehub').checked)}`;
  promptEditor.value = `${prompt}\n\n## 参考站交互复核与实现要求\n- 若具备浏览器，沿页面滚动观察视口变化和懒加载；检查常见控件的悬停状态，并仅对可恢复的手风琴、标签页、展开/按压和非表单勾选控件做点击前后对照。\n- 若工作台模块中已附交互实测证据，以该证据为依据列明触发条件、区域/控件、前后状态、可读取的 transition 时长/延迟/缓动及 transform/位置方向；候选数量不等于已验证效果。\n- 不提交表单，不触发购买、登录、删除等业务动作，不跟随普通外链。无法安全验证、未检测到差异或缺少浏览器时，明确标注“未实测/待人工确认”，不得臆造交互。\n- 生成页面时将已验证的触发方式和反馈状态转化为可访问的实际交互，兼顾键盘、触屏及 prefers-reduced-motion；对未实测部分说明实现假设。`;
  $('[data-prompt-word-count]').textContent = `约 ${promptEditor.value.length.toLocaleString('zh-CN')} 字`;
  $('[data-prompt-ready]').textContent = generated ? '已同步最新模块' : '草稿：尚未生成模块分析';
  setProgress(generated ? taskMode === 'analyze' ? 2 : 3 : 1);
  saveState();
}
function navigate(panel) {
  $$('[data-view]').forEach(view => { view.hidden = view.dataset.view !== panel; });
  $$('.side-link').forEach(link => link.classList.toggle('active', link.dataset.panel === panel));
  const labels = { analysis:'独立分析工作区',prompt:'提示词工作台',vibehub:'设计知识与术语',guide:'使用 SOP' };
  $('[data-current-view]').textContent = labels[panel];
  if (panel === 'prompt') buildPrompt();
  history.replaceState(null,'',`#${panel === 'analysis' ? 'workspace' : panel}`);
  window.scrollTo({ top:0, behavior:reducedMotion.matches?'instant':'smooth' });
}
function saveState() {
  const state = { input:currentInputs(), customBrief:$('#custom-brief').value, modules:generated ? modules : [], observations:manualObservations, generated, mode:taskMode, agent:$('#agent-name').value, stack:$('#tech-stack').value, extras:$('#extra-constraints').value, includeVibe:$('#include-vibehub').checked, includeDesign:$('#include-design-skill').checked, includeQuality:$('#include-quality-skill').checked, prompt:promptEditor.value };
  try { localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); $('[data-save-status]').textContent='已自动保存'; }
  catch { $('[data-save-status]').textContent='本地保存不可用'; }
}
function restoreState() {
  try {
    const state = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!state) return;
    for (const [name,value] of Object.entries(state.input || {})) if (form.elements[name]) form.elements[name].value = value;
    $('#custom-brief').value = state.customBrief || '';
    $('#agent-name').value = state.agent || '';
    $('#tech-stack').value = state.stack || '';
    $('#extra-constraints').value = state.extras || '';
    $('#include-vibehub').checked = state.includeVibe !== false;
    $('#include-design-skill').checked = state.includeDesign !== false;
    $('#include-quality-skill').checked = state.includeQuality !== false;
    taskMode = state.mode || 'analyze-build';
    modules = Array.isArray(state.modules) ? state.modules : [];
    manualObservations = Array.isArray(state.observations) ? state.observations : [];
    generated = Boolean(state.generated && modules.length);
    if (generated) { renderModules(); result.hidden = false; $('[data-analysis-source]').textContent='已从本机恢复上次分析草稿'; }
    updatePreview(currentInputs());
    renderObservations();
    if (state.prompt) promptEditor.value = state.prompt;
    updatePromptMeta();
    $$('.mode-card').forEach(button => { const active=button.dataset.mode===taskMode; button.classList.toggle('selected',active); button.setAttribute('aria-pressed',String(active)); });
  } catch { localStorage.removeItem(STORAGE_KEY); }
}
function updatePromptMeta() { $('[data-prompt-word-count]').textContent=`约 ${promptEditor.value.length.toLocaleString('zh-CN')} 字`; }
function showCrawlEvidence(data) {
  if (!data?.screenshots) { crawlEvidence.hidden = true; return; }
  $('[data-evidence-desktop]').src = data.screenshots.desktop;
  $('[data-evidence-mobile]').src = data.screenshots.mobile;
  $('[data-evidence-summary]').textContent = `${data.source.title || '无标题页面'} · 最终地址 ${data.source.finalUrl} · HTTP ${data.source.httpStatus ?? '未知'} · ${new Date(data.source.analyzedAt).toLocaleString()}`;
  $('[data-evidence-status]').textContent = data.analysisMode === 'browser-observed' ? '浏览器实测 / 本地规则建议' : '实测证据';
  $('[data-evidence-warnings]').innerHTML = (data.facts.warnings || []).map(item => `<li>${esc(item)}</li>`).join('');
  crawlEvidence.hidden = false;
}
async function startAnalysis() {
  const data = currentInputs();
  const submit = $('[data-submit-analysis]');
  const originalLabel = submit.innerHTML;
  let analysisPayload = null;
  submit.disabled = true;
  submit.innerHTML = data.url ? '正在打开并采集网页…' : '正在整理通用框架…';
  try {
    if (data.url?.trim()) {
      const response = await fetch('/api/analyze', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({url:data.url.trim()}) });
      const contentType = response.headers.get('content-type') || '';
      analysisPayload = contentType.includes('application/json') ? await response.json() : null;
      if (!response.ok) throw new Error(analysisPayload?.error || `网页实采服务当前不可用（HTTP ${response.status}）。GitHub Pages 仅发布静态界面；要分析参考网址，请在项目根目录运行 npm install、npm run browser:install 和 npm start 后访问本地工作台。`);
      modules = Array.isArray(analysisPayload.modules) ? analysisPayload.modules : [];
      if (!modules.length) throw new Error('网页已打开，但未能提取到可编辑的内容区块。');
      generated = true;
      showCrawlEvidence(analysisPayload);
      const facts = analysisPayload.facts;
      const interactionFacts = facts.interactions || {};
      $('[data-analysis-source]').textContent = `已实测 ${analysisPayload.source.finalUrl} · ${facts.desktop.headingCount} 个标题 · ${facts.mobile.hasHorizontalOverflow ? '手机端有横向溢出' : '手机端未发现横向溢出'} · 交互状态 ${interactionFacts.observedChanges || 0} 项`;
    } else {
      modules = moduleDefaults(titleCase(data.pageType));
      generated = true;
      showCrawlEvidence(null);
      $('[data-analysis-source]').textContent = '未提供参考网址；以下为按网页类型生成的通用建议框架，不代表网页实测';
      notify('未填写网址，已生成通用框架；如需实际分析，请输入可公开访问的网址');
    }
    result.hidden = false;
    updatePreview(data);
    if (data.url?.trim()) {
      $('[data-preview-url]').textContent = analysisPayload.source.title || analysisPayload.source.finalUrl.replace(/^https?:\/\//, '').toUpperCase();
      $('[data-preview-brand]').textContent = 'LIVE PAGE / OBSERVED';
      $('[data-preview-section]').textContent = modules[1]?.title || modules[0]?.title || 'Observed content';
    }
    renderModules();
    setProgress(2);
    navigate('analysis');
    result.hidden = false;
    result.scrollIntoView({ behavior:reducedMotion.matches?'instant':'smooth', block:'start' });
    saveState();
  } catch (error) {
    const message = error instanceof TypeError && error.message.includes('fetch') ? '无法连接网页实采服务。在线 GitHub Pages 仅托管静态界面；请在项目根目录运行 npm install、npm run browser:install 和 npm start 后使用本地工作台。' : error.message || '网页分析失败，请检查网址或分析服务';
    notify(message);
    $('[data-analysis-source]').textContent = `本次没有完成网页实测：${message}；旧分析未被覆盖`;
  } finally {
    submit.disabled = false;
    submit.innerHTML = originalLabel;
  }
}
function loadDemo() {
  for (const [key,value] of Object.entries(demo)) if (form.elements[key]) form.elements[key].value = value;
  $('#tech-stack').value='尽量沿用已有项目的技术栈与组件；独立演示时提供无构建步骤的静态网页实现。';
  $('#extra-constraints').value='页面模块、项目内容、图片路径和视觉主题需要在独立配置中修改；桌面和移动端均要完整适配。';
  updatePreview(currentInputs());
  startAnalysis();
  notify('已载入键鼠品牌官网分析示例');
}

form.addEventListener('submit', event => { event.preventDefault(); startAnalysis(); });
form.addEventListener('input', () => { updatePreview(currentInputs()); if (generated) buildPrompt(); else saveState(); });
$$('[data-panel]').forEach(link => link.addEventListener('click', event => { event.preventDefault(); navigate(link.dataset.panel); }));
$$('[data-load-demo]').forEach(button => button.addEventListener('click', loadDemo));
$$('[data-clear-url]').forEach(button => button.addEventListener('click', () => { $('#reference-url').value=''; updatePreview(currentInputs()); renderObservations(); buildPrompt(); $('#reference-url').focus(); }));
$('[data-close-result]').addEventListener('click', () => { result.hidden=true; });
$('[data-reset-modules]').addEventListener('click', () => { modules=moduleDefaults(titleCase($('#page-type').value)); renderModules(); notify('已恢复此页面类型的建议模块'); });
$('[data-add-module]').addEventListener('click', () => { modules=modulesFromUI(); modules.push({ title:'新增内容模块',purpose:'说明此模块帮助用户理解或完成什么。',components:'列出要呈现的内容、文字或组件。',interaction:'说明点击、展开或提交之后的可见结果。' }); renderModules(); $('.module-title-input',moduleList.lastElementChild).focus(); });
$('[data-make-prompt]').addEventListener('click', () => { generated=true; buildPrompt(); navigate('prompt'); });
$$('[data-guide-go]').forEach(link => link.addEventListener('click', event => { event.preventDefault(); navigate(link.dataset.guideGo); }));
$('[data-guide-demo]').addEventListener('click', () => { loadDemo(); navigate('analysis'); });
$('[data-guide-copy]').addEventListener('click', async () => {
  const checklist = '网页分析生成站｜上手清单\n1. 选择可公开访问的参考网页，填写页面类型、用户和目标。\n2. 点击实际分析，检查桌面/手机截图与实采证据。\n3. 逐模块修订目的、视觉、组件、交互和专业判断；补充未实测状态。\n4. 在提示词工作台填写真实资料，上传并标注素材用途。\n5. 选择任务模式与技术约束，生成后检查提示词。\n6. 复制给 Agent 或导出 Markdown；所需素材另行下载并放入 Agent 项目。\n注意：GitHub Pages 不运行实采接口；新电脑需安装 Node.js、依赖和 Chromium。草稿/附件留在本机，不会自动跨设备同步。';
  try { await navigator.clipboard.writeText(checklist); notify('上手清单已复制'); }
  catch { notify('浏览器未开放剪贴板；请按 SOP 逐步操作'); }
});
moduleList.addEventListener('input', () => { modules=modulesFromUI(); buildPrompt(); });
$$('[data-add-observation]').forEach(button => button.addEventListener('click', () => {
  manualObservations.push({ trigger:button.dataset.addObservation,module:modulesFromUI()[0]?.title || '',target:'',condition:'',before:'',after:'',direction:'',timing:'',easing:'' });
  renderObservations(); buildPrompt();
  $('[data-observation-field="target"]',observationList.lastElementChild)?.focus();
}));
observationList.addEventListener('input', event => {
  const field=event.target.closest('[data-observation-field]');const card=event.target.closest('[data-observation-index]');if(!field||!card)return;
  manualObservations[Number(card.dataset.observationIndex)][field.dataset.observationField]=field.value;
  buildPrompt();
});
observationList.addEventListener('click', event => {
  const button=event.target.closest('[data-remove-observation]');if(!button)return;
  manualObservations.splice(Number(button.closest('[data-observation-index]').dataset.observationIndex),1);
  renderObservations();buildPrompt();
});
$('[data-open-reference]').addEventListener('click', event => { if(event.currentTarget.getAttribute('aria-disabled')==='true'){event.preventDefault();notify('请先填写有效的 HTTP 或 HTTPS 参考网址');} });
$('#reference-url').addEventListener('input', renderObservations);
moduleList.addEventListener('click', event => {
  const card = event.target.closest('.module-card');
  if (!card) return;
  const index = Number(card.dataset.index);
  if (event.target.closest('[data-remove]')) modules.splice(index,1);
  else if (event.target.closest('[data-move="up"]') && index>0) [modules[index-1],modules[index]]=[modules[index],modules[index-1]];
  else if (event.target.closest('[data-move="down"]') && index<modules.length-1) [modules[index+1],modules[index]]=[modules[index],modules[index+1]];
  else return;
  renderModules();
});
$$('[data-mode]').forEach(button => button.addEventListener('click', () => {
  taskMode=button.dataset.mode;
  $$('.mode-card').forEach(card => { const active=card===button; card.classList.toggle('selected',active); card.setAttribute('aria-pressed',String(active)); });
  buildPrompt();
}));
['agent-name','tech-stack','extra-constraints','include-vibehub','include-design-skill','include-quality-skill'].forEach(id => { $(`#${id}`).addEventListener('input', buildPrompt); $(`#${id}`).addEventListener('change', buildPrompt); });
$('[data-refresh-prompt]').addEventListener('click', () => { buildPrompt(); notify('已按当前分析更新提示词'); });
promptEditor.addEventListener('input', () => { updatePromptMeta(); saveState(); });
$('[data-copy-prompt]').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(promptEditor.value); notify('提示词已复制，可以粘贴给任意 Agent'); }
  catch { promptEditor.focus(); promptEditor.select(); notify('浏览器未开放剪贴板，请按 Ctrl+C 复制'); }
});
$('[data-download-prompt]').addEventListener('click', () => {
  const blob = new Blob([promptEditor.value],{type:'text/markdown;charset=utf-8'});
  const anchor = document.createElement('a');
  anchor.href=URL.createObjectURL(blob); anchor.download='web-design-analyzer-prompt.md'; anchor.click();
  setTimeout(()=>URL.revokeObjectURL(anchor.href),1000);
  notify('已导出 Markdown 提示词');
});
$('[data-use-example]').addEventListener('click', () => { $('#visual-notes').value='帮助图标的悬停和键盘聚焦时显示一条简短说明；移出或失焦后收起。请同时保证触屏用户可以点按查看。'; navigate('prompt'); $('#include-vibehub').checked=true; buildPrompt(); notify('已将可执行交互示例加入项目观察'); });
$('#custom-brief').addEventListener('input',buildPrompt);
const fileInput = $('#custom-file-input');
fileInput.addEventListener('change',async () => { await addAssets(fileInput.files); fileInput.value=''; });
const dropzone = $('[data-dropzone]');
dropzone.addEventListener('dragover',event => { event.preventDefault(); dropzone.classList.add('is-dragging'); });
dropzone.addEventListener('dragleave',event => { if (!dropzone.contains(event.relatedTarget)) dropzone.classList.remove('is-dragging'); });
dropzone.addEventListener('drop',async event => { event.preventDefault(); dropzone.classList.remove('is-dragging'); await addAssets(event.dataTransfer.files); });
$('[data-asset-list]').addEventListener('change',async event => {
  const card = event.target.closest('[data-asset-id]');
  if (!card) return;
  const asset = customAssets.find(item => item.id === card.dataset.assetId);
  if (!asset) return;
  if (event.target.matches('[data-asset-role]')) asset.role = event.target.value;
  if (event.target.matches('[data-asset-note]')) asset.note = event.target.value;
  if (event.target.matches('[data-asset-text]')) asset.textContent = event.target.value.slice(0,MAX_TEXT_PER_ASSET);
  try { await storeAsset(asset); buildPrompt(); }
  catch { notify('素材备注保存失败'); }
});
$('[data-asset-list]').addEventListener('click',async event => {
  const card = event.target.closest('[data-asset-id]');
  if (!card) return;
  const asset = customAssets.find(item => item.id === card.dataset.assetId);
  if (!asset) return;
  if (event.target.closest('[data-asset-remove]')) {
    try { await deleteStoredAsset(asset.id); }
    catch { notify('无法从本地素材库移除'); return; }
    const url = assetUrls.get(asset.id);
    if (url) URL.revokeObjectURL(url);
    assetUrls.delete(asset.id);
    customAssets = customAssets.filter(item => item.id !== asset.id);
    renderAssets(); buildPrompt(); notify('已从本机素材库移除');
  }
  if (event.target.closest('[data-asset-download]')) {
    const url = URL.createObjectURL(asset.blob);
    const link = document.createElement('a'); link.href=url; link.download=asset.name; link.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
    notify('已下载素材，请加入 Agent 项目工作区');
  }
});
const help = $('.help-dialog');
$$('[data-help]').forEach(button => button.addEventListener('click', () => help.showModal()));
$$('[data-close-help]').forEach(button => button.addEventListener('click', () => help.close()));
help.addEventListener('click',event => { if (event.target===help) help.close(); });
window.addEventListener('hashchange', () => { const panel=location.hash.slice(1); if (['analysis','prompt','vibehub','guide'].includes(panel)) navigate(panel); });
restoreState();
renderObservations();
const route=location.hash.slice(1);
if (['prompt','vibehub','guide'].includes(route)) navigate(route);
updatePreview(currentInputs());
loadAssets();
