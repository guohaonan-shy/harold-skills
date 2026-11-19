package flow

// pageTemplate is the page one flow is rendered into; the {{...}} words are filled by RenderHTML. It is the old
// script's template as it was, byte for byte.
const pageTemplate = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>{{TITLE}}</title>
<style>
  :root { --ink:#1f2937; --muted:#6b7280; --line:#9ca3af; --ring:#ef4444; --ground:#ffffff; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--ground); color:var(--ink);
    font:14px/1.5 -apple-system,"PingFang SC","Hiragino Sans GB","Noto Sans CJK SC","Microsoft YaHei",sans-serif; }
  #flow { display:inline-block; padding:28px 32px; position:relative; background:var(--ground); }
  h1 { font-size:16px; margin:0 0 20px; font-weight:600; }
  .grid { display:grid; grid-template-columns:repeat({{COLS}}, auto); column-gap:0; row-gap:28px; align-items:start; justify-content:start; }
  .cell { display:flex; align-items:flex-start; }
  .gutter { width:120px; flex:none; }
  .cell.first .gutter { width:0; }
  .trigger { position:absolute; z-index:1; font-size:12px; line-height:1.3; color:var(--ink); background:var(--ground);
    padding:0 4px; text-align:center; width:104px; transform:translate(-50%, -100%); }
  figure { margin:0; display:flex; flex-direction:column; align-items:flex-start; }
  .shot { position:relative; line-height:0; border:1px solid #e5e7eb; border-radius:6px; }
  .shot img { display:block; border-radius:6px; }
  .ring { position:absolute; border:3px solid var(--ring); border-radius:50%; box-shadow:0 0 0 3px rgba(239,68,68,.18); pointer-events:none; }
  figcaption { margin-top:8px; font-size:12px; color:var(--muted); max-width:260px; line-height:1.45; }
{{STATECSS}}  .label { font-size:12px; color:var(--muted); padding-left:120px; margin-bottom:-16px; }
  .label.first { padding-left:0; }
  .note { margin-top:24px; font-size:13px; color:var(--ink); max-width:720px; }
  svg#wires { position:absolute; left:0; top:0; pointer-events:none; overflow:visible; }
</style></head>
<body><div id="flow"><h1>{{TITLE}}</h1><div class="grid">{{CELLS}}</div>{{NOTE}}<svg id="wires"></svg></div>
<script>
(async () => {
  const imgs = [...document.querySelectorAll('.shot img')];
  await Promise.all(imgs.map((i) => (i.complete ? i.decode().catch(() => {}) : new Promise((ok) => { i.onload = i.onerror = ok; }))));
  for (const i of imgs) { const k = Number(i.dataset.scale); i.style.width = i.naturalWidth * k + 'px'; i.style.height = i.naturalHeight * k + 'px'; }
  await document.fonts.ready;
  const root = document.getElementById('flow');
  const box = root.getBoundingClientRect();
  const svg = document.getElementById('wires');
  svg.setAttribute('width', box.width); svg.setAttribute('height', box.height);
  const rel = (el) => { const b = el.getBoundingClientRect(); return { l: b.left - box.left, r: b.right - box.left, t: b.top - box.top, b: b.bottom - box.top, cx: (b.left + b.right) / 2 - box.left, cy: (b.top + b.bottom) / 2 - box.top }; };
  const NS = 'http://www.w3.org/2000/svg';
  svg.innerHTML = '<defs><marker id="head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#9ca3af"/></marker></defs>';
  for (const t of document.querySelectorAll('.trigger')) {
    const to = rel(document.querySelector('#' + t.dataset.to + ' .shot'));
    const from = rel(document.querySelector('#' + t.dataset.from + ' .shot'));
    const branch = t.dataset.branch === '1';
    // Shots in one row are top-aligned, so half the shorter one's height lies inside both.
    const y = branch ? to.cy : to.t + Math.min(from.b - from.t, to.b - to.t) / 2;
    const x0 = branch ? from.cx : from.r + 6;
    const d = branch
      ? 'M' + x0 + ',' + (from.b + 4) + ' L' + x0 + ',' + y + ' L' + (to.l - 6) + ',' + y
      : 'M' + x0 + ',' + y + ' L' + (to.l - 6) + ',' + y;
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d); p.setAttribute('fill', 'none'); p.setAttribute('stroke', '#9ca3af'); p.setAttribute('stroke-width', '2'); p.setAttribute('marker-end', 'url(#head)');
    svg.appendChild(p);
    root.appendChild(t);
    t.style.left = (to.l - 60) + 'px';
    t.style.top = (y - 4) + 'px';
  }
  document.body.dataset.ready = '1';
})();
</script></body></html>
`
