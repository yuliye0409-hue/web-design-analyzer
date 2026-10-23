export function observationTriggerLabel(trigger) {
  return ({ hover:'悬停', click:'点击', scroll:'滚动', focus:'键盘聚焦' })[trigger] || '交互';
}

export function observationSpec(item) {
  const detail = [item.module && `所属模块：${item.module}`,item.target && `目标元素：${item.target}`,item.condition && `触发条件：${item.condition}`,item.before && `触发前：${item.before}`,item.after && `触发后：${item.after}`,item.direction && `动效方向：${item.direction}`,item.timing && `时长/节奏：${item.timing}`,item.easing && `缓动：${item.easing}`].filter(Boolean);
  return `${observationTriggerLabel(item.trigger)}：${detail.join('；') || '待补充观察细节'}（人工观察；以填写内容为准）`;
}
