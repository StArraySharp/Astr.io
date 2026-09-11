/**
 * format — HTML 转义与质量缩写工具(原 `by` / `bz` 两个顶层函数)。
 *
 *  - escapeHtml(原 by):借 DOM 转义——创建临时 div,append 一个文本节点,
 *    再读 innerHTML。浏览器序列化只转义 & < >,引号保持原样;
 *    输入非字符串时由 createTextNode 强制 toString。
 *  - formatMass(原 bz):>= 1e6 → "x.xM";>= 1000 → "x.xK";
 *    否则 String(mass) 原样返回(不做任何舍入)。
 */

export function escapeHtml(text) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}

export function formatMass(mass) {
  if (mass >= 1000000) {
    return (mass / 1000000).toFixed(1) + 'M';
  }
  if (mass >= 1000) {
    return (mass / 1000).toFixed(1) + 'K';
  }
  return String(mass);
}
