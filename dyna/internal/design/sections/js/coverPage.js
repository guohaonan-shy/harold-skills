async function coverPage(page, C, T, D, coverScreens, shootPage) {
  await page.setViewportSize({ width: C.viewport.width, height: C.viewport.height });
  await page.emulateMedia({ colorScheme: C.theme, reducedMotion: C.motion === 'reduce' ? 'reduce' : 'no-preference' });
  await page.evaluate(() => document.fonts.ready);
  try {
    await page.waitForLoadState('networkidle', { timeout: 3000 });
  } catch (e) {
    // a page that never goes quiet is looked at as it stands
  }
  // late content moves everything below it: wait until the height holds still
  let height = -1;
  for (let i = 0; i < 6; i += 1) {
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    if (h === height) break;
    height = h;
    await page.waitForTimeout(300);
  }
  // what scrolls, and where, at scroll 0 (the same pick as `measure`)
  const scroller = await page.evaluate(() => {
    const px = (v) => Math.round(v * 100) / 100;
    window.scrollTo({ top: 0, behavior: 'instant' });
    const shown = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    const pathOf = (el) => {
      if (el === document.body) return 'body';
      if (el.id && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) return '#' + CSS.escape(el.id);
      const parts = [];
      for (let p = el; p && p !== document.body; p = p.parentElement) parts.unshift(p.tagName.toLowerCase() + ':nth-child(' + ([...p.parentElement.children].indexOf(p) + 1) + ')');
      return 'body > ' + parts.join(' > ');
    };
    const ofDocument = { kind: 'document', selector: null, top: 0, pageHeight: document.documentElement.scrollHeight };
    if (document.documentElement.scrollHeight > window.innerHeight) return ofDocument;
    const best = [document.body, ...document.querySelectorAll('body *')]
      .flatMap((el) => {
        if (/^(TEXTAREA|SELECT|INPUT)$/.test(el.tagName) || el.clientHeight === 0 || el.scrollHeight <= el.clientHeight) return [];
        if (!/^(auto|scroll)$/.test(getComputedStyle(el).overflowY) || !shown(el)) return [];
        const r = el.getBoundingClientRect();
        const area = Math.max(0, Math.min(r.right, window.innerWidth) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
        return area > 0 ? [{ el, area }] : [];
      })
      .sort((a, b) => b.area - a.area)[0];
    if (!best) return ofDocument;
    best.el.scrollTo({ top: 0, behavior: 'instant' });
    const r = best.el.getBoundingClientRect();
    const top = px(r.top + best.el.clientTop + window.scrollY);
    return { kind: 'element', selector: pathOf(best.el), top, pageHeight: px(top + best.el.scrollHeight) };
  });
  const pageHeight = scroller.pageHeight;
  const sc = scroller.kind === 'element' ? { kind: 'element', selector: scroller.selector, top: scroller.top } : null;

  // each edge's component: found by its `locate` exactly once, else the edge is unlocated
  const unlocated = [];
  const components = [];
  for (const e of C.edges) {
    const by = e.locate && e.locate.role ? page.getByRole(e.locate.role, e.locate.name ? { name: e.locate.name, exact: true } : {}) : e.locate && e.locate.text ? page.getByText(e.locate.text, { exact: true }) : null;
    let matches = 0;
    if (by) {
      try {
        matches = await by.count();
      } catch (err) {
        matches = 0;
      }
    }
    const box =
      matches === 1
        ? await by.evaluate((el, s) => {
            const r = el.getBoundingClientRect();
            if (!(r.width > 0 && r.height > 0)) return null;
            const px = (v) => Math.round(v * 100) / 100;
            const holder = s ? document.querySelector(s) : null;
            const inside = !!holder && holder !== el && holder.contains(el);
            const shift = inside ? holder.scrollTop : 0;
            // the lowest line of it the first screen really shows. Nothing is told apart by what the thing in front is (a bar, a container's foot, a
            // popover): the browser is asked, over the box, what is on top of each point. A point is shown when that is the component itself, or
            // something inside it, or the label it sits in; anything else covers it, and so does a clip (the point past the edge of the container
            // that holds it hits whatever is behind the container). Points off the screen are not looked at: the rows under the screen are `bottom`'s business.
            const within = (node, root) => {
              for (let n = node; n; n = n.parentNode || n.host) if (n === root) return true;
              return false;
            };
            const shows = (x, y) => {
              if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) return true;
              const hit = document.elementFromPoint(x, y);
              if (!hit) return true;
              return within(hit, el) || (within(el, hit) && hit.tagName === 'LABEL');
            };
            // Only where the component is drawn is asked about: a line of a wrapped link is a box of its own (the corners of the box around all
            // the lines are other text), and the corners of a rounded box are the page behind it. So the points sit on the middle of each box's
            // top and bottom edges, and on three columns across its middle rows, set in from the sides by half the height (a pill's whole curve).
            const lines = [...el.getClientRects()].filter((q) => q.width > 0 && q.height > 0);
            const points = (lines.length ? lines : [r]).flatMap((q) => {
              const inset = Math.min(q.width, q.height) / 2;
              const mid = q.left + q.width / 2;
              return [
                { y: q.top + 1, xs: [mid] },
                ...[0.25, 0.5, 0.75].map((f) => ({ y: q.top + q.height * f, xs: [q.left + inset, mid, q.right - inset] })),
                { y: q.bottom - 1, xs: [mid] },
              ];
            }).sort((a, b) => a.y - b.y);
            let visibleBottom = window.innerHeight;
            for (let i = 0; i < points.length; i += 1) {
              if (!points[i].xs.every((x) => shows(x, points[i].y))) {
                visibleBottom = i === 0 ? r.top : points[i - 1].y;
                break;
              }
            }
            return { top: px(r.top + window.scrollY + shift), bottom: px(r.bottom + window.scrollY + shift), visibleBottom: px(visibleBottom + window.scrollY) };
          }, sc && sc.selector)
        : null;
    if (box) components.push({ id: e.id, ...box });
    else unlocated.push({ id: e.id, locate: e.locate, matches });
  }

  const plan = coverScreens({ state: C.state, components, viewportHeight: C.viewport.height, pageHeight });
  const targets = plan.screens.map((s) => ({ id: s.id, file: s.file, start: s.start, end: s.end, inScroller: !!(sc && s.start >= Math.round(sc.top)) }));
  const done = await shootPage(page, { targets, viewport: C.viewport, theme: C.theme, motion: C.motion, pageHeight, outDir: C.outDir, include: null, scroller: sc }, T, D);
  return { out: C.outDir, clock: done.clock, state: C.state, shot: plan.shot, shots: done.shots, inViewport: plan.inViewport, unlocated, exit: unlocated.length ? 1 : 0 };
}