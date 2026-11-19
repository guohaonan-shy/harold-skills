async function shootPage(page, C, T, D) {
  await page.setViewportSize({ width: C.viewport.width, height: C.viewport.height });
  await page.emulateMedia({ colorScheme: C.theme, reducedMotion: C.motion === 'reduce' ? 'reduce' : 'no-preference' });
  const clock = T.ready(page) ? 'present: the page time is stopped, nothing here moves it' : '装晚了: the page time was never started on this tab (run `time` first), so what the page runs on its own moves while it is shot';
  await page.evaluate(() => document.fonts.ready);
  const vh = C.viewport.height;
  const sc = C.scroller && C.scroller.kind === 'element' ? C.scroller : null;
  const contentTop = sc ? Math.round(sc.top) : 0;
  const maxScroll = Math.max(0, C.pageHeight - vh);
  const scrollTo = (y) => page.evaluate((v) => window.scrollTo({ top: v, behavior: 'instant' }), Math.max(0, Math.min(y, maxScroll)));

  // the scroll container (an app shell's <main>): scrolled by selector, looked at through its own box
  const must = () =>
    page.evaluate((s) => !!document.querySelector(s), sc && sc.selector).then((found) => {
      if (!found) throw new Error('scroll container ' + sc.selector + ' is not on the page: measure and shoot have to look at the same page');
    });
  const scrollIn = (v) =>
    page.evaluate(({ s, v }) => {
      const el = document.querySelector(s);
      el.scrollTo({ top: v, behavior: 'instant' });
      return el.scrollTop;
    }, { s: sc && sc.selector, v: Math.max(0, v) });
  const boxIn = () =>
    page.evaluate((s) => {
      const el = document.querySelector(s);
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left + el.clientLeft), y: Math.round(r.top + el.clientTop), width: el.clientWidth, height: el.clientHeight, content: el.scrollHeight };
    }, sc && sc.selector);
  // a bar pinned to the top of the container: its height, so the part of a band under it is not taken from there
  const pinnedIn = () =>
    page.evaluate((s) => {
      const box = document.querySelector(s);
      const b = box.getBoundingClientRect();
      const top = b.top + box.clientTop;
      let bottom = top;
      for (const el of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(el);
        if ((cs.position !== 'fixed' && cs.position !== 'sticky') || el === box || el.contains(box)) continue;
        const r = el.getBoundingClientRect();
        if (r.top <= top + 2 && r.bottom > top && r.bottom < top + box.clientHeight * 0.4 && r.width >= box.clientWidth * 0.5 && parseFloat(cs.opacity) >= 0.01 && cs.visibility !== 'hidden') bottom = Math.max(bottom, r.bottom);
      }
      return Math.ceil(bottom - top);
    }, sc && sc.selector);
  // the screens of a band [c0, c1) (offsets in the container's content): scroll a screen at a time, shoot what the container shows below a pinned bar
  const screens = async (c0, c1) => {
    const strips = [];
    let at = c0;
    while (at < c1) {
      await scrollIn(at);
      await page.waitForTimeout(120);
      const pinned = at > 0 ? await pinnedIn() : 0;
      const top = await scrollIn(at - pinned);
      await page.waitForTimeout(120);
      const g = await boxIn();
      const skip = Math.round(at - top);
      const rows = Math.min(g.height - skip, c1 - at, vh - (g.y + skip));
      if (rows <= 0) break;
      const buf = await page.screenshot({ clip: { x: g.x, y: g.y + skip, width: g.width, height: rows } });
      strips.push({ buf, rows, width: g.width });
      at += rows;
    }
    return strips;
  };
  // the screens are put one under the other in a tab of their own and shot from there: no image library needed
  const stitch = async (strips, file) => {
    const width = strips[0].width;
    const height = strips.reduce((n, x) => n + x.rows, 0);
    let y = 0;
    const imgs = strips.map((x) => {
      const html = '<img style="position:absolute;left:0;top:' + y + 'px;width:' + width + 'px;height:' + x.rows + 'px" src="data:image/png;base64,' + x.buf.toString('base64') + '">';
      y += x.rows;
      return html;
    });
    const tab = await page.context().newPage();
    try {
      await tab.setViewportSize({ width, height: Math.min(height, 8000) });
      await tab.setContent('<body style="margin:0"><div id="s" style="position:relative;overflow:hidden;width:' + width + 'px;height:' + height + 'px">' + imgs.join('') + '</div></body>');
      await tab.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
      await tab.locator('#s').screenshot({ path: file });
    } finally {
      await tab.close();
    }
  };
  const sameScreens = (a, b) => a.length === b.length && a.every((x, i) => x.buf.equals(b[i].buf));
  if (sc) {
    await must();
    await scrollIn(0);
  }
  const byIndex = [];
  const heightOf = async () => {
    if (!sc) return page.evaluate(() => document.documentElement.scrollHeight);
    const g = await boxIn();
    return contentTop + g.content;
  };
  // the sections that hold a screen while the page scrolls under them are shot last: each one puts the page time back at its fixed start and reloads
  const order = [...C.targets.filter((t) => !t.scrollDriven), ...C.targets.filter((t) => t.scrollDriven)];
  for (const t of order) {
    if (t.scrollDriven) {
      await T.install(page);
      // a reload gives the page back the scroll position it had, and a section that counts the scrolling it has seen would count it again
      await page.evaluate(() => {
        history.scrollRestoration = 'manual';
        window.scrollTo(0, 0);
      });
      await page.reload();
      await T.boot(page);
      if (sc) {
        await must();
        await scrollIn(Math.max(0, t.start - contentTop));
      } else {
        await scrollTo(t.start);
      }
      for (let i = 0; i < 8; i += 1) await T.step(page, 250);
      await page.waitForTimeout(100);
      await page.evaluate(() => document.getAnimations().forEach((a) => { if (a instanceof CSSTransition) a.finish(); }));
      try {
        await page.waitForLoadState('networkidle', { timeout: 3000 });
      } catch (e) {
        // keep going: the stability check below is the one that decides
      }
      const view = { x: 0, y: 0, width: C.viewport.width, height: C.viewport.height };
      const snap = (path) => page.screenshot({ path, clip: view });
      let previous = await snap();
      let settled = false;
      for (let i = 0; i < 8 && !settled; i += 1) {
        await page.waitForTimeout(300);
        const current = await snap();
        settled = current.equals(previous);
        previous = current;
      }
      const kept = await snap(`${C.outDir}/${t.file}`);
      await page.waitForTimeout(500);
      const again = await snap();
      let uncontrolled = !kept.equals(again);
      let diffBox = null;
      if (uncontrolled) {
        diffBox = await D.boxOf(page, [{ a: kept, b: again, y: 0 }]);
        if (diffBox === 'same') uncontrolled = false;
      }
      byIndex[C.targets.indexOf(t)] = { id: t.id, file: t.file, y0: t.start, y1: t.end, width: view.width, height: view.height, settled, uncontrolled, ...(uncontrolled ? { diffBox: diffBox || { x: 0, y: 0, width: view.width, height: view.height } } : {}), scrollDriven: true, heightDrift: (await heightOf()) - C.pageHeight };
      continue;
    }
    const inside = !!(sc && t.inScroller);
    let c0 = t.start - contentTop;
    let c1 = t.end - contentTop;
    if (inside) {
      for (let y = c0; y < c1; y += Math.floor(vh * 0.6)) {
        await scrollIn(y);
        await page.waitForTimeout(250);
      }
      await scrollIn(c0);
    } else if (!sc) {
      for (let y = t.start; y < t.end; y += Math.floor(vh * 0.6)) {
        await scrollTo(y);
        await page.waitForTimeout(250);
      }
      await scrollTo(t.start);
    } else {
      await scrollIn(0);
    }
    await page.waitForTimeout(300);
    // a bar pinned to the top of the screen would cover the first rows of the section: stand the section just below it
    const inset = sc
      ? 0
      : await page.evaluate(() => {
          let bottom = 0;
          for (const el of document.querySelectorAll('body *')) {
            const cs = getComputedStyle(el);
            if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
            const r = el.getBoundingClientRect();
            if (r.top <= 2 && r.bottom > 0 && r.bottom < window.innerHeight * 0.4 && r.width >= window.innerWidth * 0.5 && parseFloat(cs.opacity) >= 0.01 && cs.visibility !== 'hidden') bottom = Math.max(bottom, r.bottom);
          }
          return Math.ceil(bottom);
        });
    if (inset > 0 && t.start > 0) {
      await scrollTo(t.start - inset);
      await page.waitForTimeout(300);
    }
    // a CSS transition that scrolling started (a bar that changes once the page has moved) is taken to its end: the animation timeline does not run
    await page.evaluate(() => document.getAnimations().forEach((a) => { if (a instanceof CSSTransition) a.finish(); }));
    try {
      await page.waitForLoadState('networkidle', { timeout: 3000 });
    } catch (e) {
      // keep going: the stability check below is the one that decides
    }
    let top = t.start;
    let bottom = t.end;
    if (C.include) {
      const i = C.include;
      const where = i.role ? page.getByRole(i.role, i.name ? { name: i.name, exact: true } : {}) : i.text ? page.getByText(i.text, { exact: true }) : page.locator(i.selector);
      const box = await where.first().boundingBox();
      if (box) {
        const sy = await page.evaluate((s) => (s ? document.querySelector(s).scrollTop : window.scrollY), sc && sc.selector);
        top = Math.max(0, Math.min(top, Math.floor(box.y + sy)));
        bottom = Math.min(C.pageHeight, Math.max(bottom, Math.ceil(box.y + sy + box.height)));
        if (inside) {
          c0 = Math.max(0, top - contentTop);
          c1 = bottom - contentTop;
        }
      }
    }
    const heightNow = await heightOf();
    // a shot of a section outside the container is a page shot, which cannot reach below the one screen the document is
    let clipNote = null;
    if (sc && !inside) {
      const docHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      if (bottom > docHeight) {
        clipNote = 'the section reaches into the scroll container: only what the first screen shows of it is in the shot';
        bottom = docHeight;
      }
    }
    const clip = { x: 0, y: top, width: C.viewport.width, height: bottom - top };
    const snap = (path) => page.screenshot({ path, fullPage: true, clip });
    const take = (path) => (inside ? screens(c0, c1) : snap(path));
    const same = (a, b) => (inside ? sameScreens(a, b) : a.equals(b));
    let previous = await take();
    let settled = false;
    for (let i = 0; i < 8 && !settled; i += 1) {
      await page.waitForTimeout(300);
      const current = await take();
      settled = same(current, previous);
      previous = current;
    }
    // the shot that is kept, then — the page time not moved — the same shot again 500 ms of real time later: they differ only if something the page time cannot hold is moving
    const kept = await take(`${C.outDir}/${t.file}`);
    await page.waitForTimeout(500);
    const again = await take();
    let uncontrolled = !same(kept, again);
    let diffBox = null;
    if (uncontrolled) {
      const pairs = inside
        ? kept.map((x, k) => ({ a: x.buf, b: again[k] && again[k].buf, y: kept.slice(0, k).reduce((n, z) => n + z.rows, 0) })).filter((x) => x.b)
        : [{ a: kept, b: again, y: 0 }];
      diffBox = await D.boxOf(page, pairs);
      if (diffBox === 'same') uncontrolled = false;
    }
    if (inside) {
      if (!kept.length) throw new Error(t.id + ': the scroll container showed nothing to shoot');
      await stitch(kept, `${C.outDir}/${t.file}`);
    }
    const width = inside ? kept[0].width : C.viewport.width;
    const height = inside ? kept.reduce((n, x) => n + x.rows, 0) : bottom - top;
    byIndex[C.targets.indexOf(t)] = { id: t.id, file: t.file, y0: top, y1: bottom, width, height, ...(inside ? { screens: kept.length } : {}), settled, uncontrolled, ...(uncontrolled ? { diffBox: diffBox || { x: 0, y: 0, width, height } } : {}), ...(clipNote ? { note: clipNote } : {}), heightDrift: heightNow - C.pageHeight };
  }
  if (sc) await scrollIn(0);
  else await scrollTo(0);
  return { out: C.outDir, clock, shots: C.targets.map((t, i) => byIndex[i]) };
}