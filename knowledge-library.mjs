export const knowledgeEntries = [
  { id:'tooltip', category:'interaction', symbol:'↗', title:'Tooltip / 文字提示', description:'鼠标悬停或键盘聚焦到控件时，出现一条简短、贴近目标的说明。', example:'鼠标悬停或键盘聚焦到帮助图标时显示简短说明；移出或失焦后关闭，并为触屏提供点按查看方式。' },
  { id:'responsive', category:'responsive', symbol:'⇄', title:'Responsive / 响应式', description:'布局随屏幕宽度调整，让内容保持可读、可浏览、可操作。', example:'窄屏时将三列卡片改为单列，导航收拢为可关闭菜单，避免横向溢出。' },
  { id:'accordion', category:'interaction', symbol:'⌁', title:'Accordion / 手风琴', description:'点击标题展开或收起内容，并清楚表达当前状态。', example:'点击问题标题展开对应答案，再次点击收起；用 aria-expanded 同步状态并支持键盘操作。' },
  { id:'microinteraction', category:'interaction', symbol:'◎', title:'Microinteraction / 微交互', description:'操作后及时出现的小反馈，让用户知道系统已接收输入并完成了什么。', example:'点击复制后显示“已复制”，提示短暂出现并可被屏幕阅读器读到。' },
  { id:'visual-hierarchy', category:'visual', symbol:'≋', title:'视觉层级 / Visual Hierarchy', description:'通过字号、对比、位置和间距安排内容主次，让重要信息先被看到。', example:'主标题最突出，正文说明次一级，主要行动使用清楚的视觉对比；次要操作保持安静。' },
  { id:'progressive-disclosure', category:'structure', symbol:'⊞', title:'Progressive Disclosure / 渐进披露', description:'先呈现完成当前任务所需的信息，再逐步展开次要内容。', example:'默认展示核心规格，用户选择“查看全部参数”后再展开细节；不折叠关键决策信息。' },
  { id:'hit-target', category:'accessibility', symbol:'↔', title:'Hit Target / 命中区域', description:'控件真实可点击范围要足够大，特别照顾触屏用户。', example:'为小图标按钮扩大透明点击区域，确保触屏上容易准确点中且不与邻近操作冲突。' },
];

export function filterKnowledge(entries, { query = '', category = 'all', favoritesOnly = false, favorites = new Set() } = {}) {
  const normalized = String(query).trim().toLocaleLowerCase();
  return entries.filter(entry => {
    const matchesCategory = category === 'all' || entry.category === category;
    const matchesFavorite = !favoritesOnly || favorites.has(entry.id);
    const searchable = `${entry.title} ${entry.description} ${entry.example}`.toLocaleLowerCase();
    return matchesCategory && matchesFavorite && (!normalized || searchable.includes(normalized));
  });
}
