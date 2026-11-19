function coverScreens({ state, components, viewportHeight, pageHeight } = {}) {
  if (typeof state !== 'string' || !state || /[\\/]/.test(state) || state.startsWith('.')) throw new Error(`状态 id 不对（它会成为图的文件名）：${JSON.stringify(state ?? null)}`);
  if (!(viewportHeight > 0)) throw new Error('没有主视口高：补拍的一屏跟主视口一样高');
  if (!Array.isArray(components)) throw new Error('组件位置要是一个列表：[{ id, top, bottom }, …]');
  if (!(pageHeight > 0)) throw new Error('没有页面总高：最后一屏要往上收到整屏高');
  const inViewport = [];
  const rest = [];
  components.forEach((c, i) => (c.bottom <= Math.min(viewportHeight, Number.isFinite(c.visibleBottom) ? c.visibleBottom : viewportHeight) ? inViewport.push(c.id) : rest.push({ ...c, i })));
  rest.sort((a, b) => a.top - b.top || a.i - b.i);
  const margin = Math.round(viewportHeight / 4);
  const lastStart = Math.max(0, pageHeight - viewportHeight);
  const screens = [];
  const shot = {};
  let k = 0;
  while (k < rest.length) {
    const first = rest[k];
    const start = Math.max(0, Math.min(first.top - margin, lastStart));
    const end = start + viewportHeight;
    const edges = [first.id];
    k += 1;
    while (k < rest.length && rest[k].top >= start && rest[k].bottom <= end) {
      edges.push(rest[k].id);
      k += 1;
    }
    const file = `${state}@${first.id}.png`;
    screens.push({ id: first.id, file, start, end, edges });
    for (const id of edges) shot[id] = file;
  }
  return { screens, shot, inViewport };
}