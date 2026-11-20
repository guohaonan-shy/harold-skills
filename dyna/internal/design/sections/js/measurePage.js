async function measurePage(page, C, T) {
  await page.setViewportSize({ width: C.viewport.width, height: C.viewport.height });
  await page.emulateMedia({ colorScheme: C.theme, reducedMotion: C.motion === 'reduce' ? 'reduce' : 'no-preference' });

  // 1 the page time: started by `time` (kept), else started here — an entry state is reloaded under it, a state reached by interacting cannot be
  let clock;
  if (T.ready(page)) {
    clock = 'present: the page time was started by `time` and is stepped, not run';
  } else if (C.reload) {
    await T.install(page);
    await page.reload();
    await T.boot(page);
    clock = 'installed, page reloaded';
  } else {
    clock = '装晚了: the page time was not started before this state was reached, so timers and CSS animations the page started keep running and the picture of it is whatever moment it is shot at';
  }
  // a fixed step of page time; in a state reached by interacting no time moves (one small step above), but a CSS transition the scrolling starts is let finish
  const tick = async (ms) => {
    if (C.reload) await T.step(page, ms);
    else await page.evaluate(() => document.getAnimations().forEach((a) => { if (a instanceof CSSTransition) a.finish(); }));
    await page.waitForTimeout(100);
  };
  if (!C.reload) await T.step(page, 100);

  // 2 helpers inside the page, reused by the evaluations below
  await page.evaluate((clickSelector) => {
    const px = (v) => Math.round(v * 100) / 100;
    const ds = {
      clickSelector,
      px,
      scrollerSel: null,
      get scroller() {
        return ds.scrollerSel ? document.querySelector(ds.scrollerSel) : null;
      },
      scrollTop: () => (ds.scroller ? ds.scroller.scrollTop : window.scrollY),
      scrollHeight: () => (ds.scroller ? ds.scroller.scrollHeight : document.documentElement.scrollHeight),
      visibleHeight: () => (ds.scroller ? ds.scroller.clientHeight : window.innerHeight),
      scrollTo: (v) => {
        if (ds.scroller) ds.scroller.scrollTo({ top: v, behavior: 'instant' });
        else window.scrollTo({ top: v, behavior: 'instant' });
      },
      pathOf: (el) => {
        if (el === document.body) return 'body';
        if (el.id && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) return '#' + CSS.escape(el.id);
        const parts = [];
        for (let p = el; p && p !== document.body; p = p.parentElement) parts.unshift(p.tagName.toLowerCase() + ':nth-child(' + ([...p.parentElement.children].indexOf(p) + 1) + ')');
        return 'body > ' + parts.join(' > ');
      },
      // the page body counts too: a shell that locks <html> and lets <body> scroll has no element inside it that does
      candidates: () => [document.body, ...document.querySelectorAll('body *')]
        .flatMap((el) => {
          if (/^(TEXTAREA|SELECT|INPUT)$/.test(el.tagName) || el.clientHeight === 0 || el.scrollHeight <= el.clientHeight) return [];
          if (!/^(auto|scroll)$/.test(getComputedStyle(el).overflowY) || !ds.shown(el)) return [];
          const r = el.getBoundingClientRect();
          const area = Math.max(0, Math.min(r.right, window.innerWidth) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
          return area > 0 ? [{ el, area }] : [];
        })
        .sort((a, b) => b.area - a.area),
      box: (el) => {
        const r = el.getBoundingClientRect();
        const sc = ds.scroller;
        const shift = sc && sc !== el && sc.contains(el) ? sc.scrollTop : 0;
        return { top: px(r.top + window.scrollY + shift), bottom: px(r.bottom + window.scrollY + shift) };
      },
      shown: (el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
      },
      opacity: (el) => {
        let o = 1;
        for (let p = el; p && p.nodeType === 1; p = p.parentElement) o *= parseFloat(getComputedStyle(p).opacity);
        return px(o);
      },
      fixed: (el) => {
        const sc = ds.scroller;
        if (sc && !sc.contains(el)) return false;
        for (let p = el; p && p.nodeType === 1 && p !== sc; p = p.parentElement) if (getComputedStyle(p).position === 'fixed') return true;
        return false;
      },
      pins: new Map(),
      seenText: (root) => {
        const box = root.getBoundingClientRect();
        const walk = (node) => {
          if (node.nodeType === 3) return node.nodeValue;
          if (node.nodeType !== 1 || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(node.tagName)) return '';
          const cs = getComputedStyle(node);
          if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return '';
          const r = node.getBoundingClientRect();
          if (r.width > 0 && r.height > 0 && (r.right <= box.left || r.left >= box.right || r.bottom <= box.top || r.top >= box.bottom)) return '';
          return [...node.childNodes].map(walk).join(' ');
        };
        return ds.norm(walk(root));
      },
      samplePins: () => {
        const vh = ds.visibleHeight();
        const vw = window.innerWidth;
        const y = ds.scrollTop();
        for (const el of document.querySelectorAll('body *')) {
          if (ds.pins.has(el)) continue;
          const pos = getComputedStyle(el).position;
          const parent = el.parentElement;
          if (!parent || /^(BODY|HTML)$/.test(parent.tagName)) continue;
          if (pos !== 'sticky' && pos !== 'fixed' && !/pin-spacer/.test(String(parent.className))) continue;
          const r = el.getBoundingClientRect();
          if (parent.getBoundingClientRect().height < r.height + vh * 0.5) continue;
          // only a pin that holds a screen is one — a narrower one (a table of contents, a sidebar beside the text that scrolls past) is not, whatever its text says
          if (r.width < vw * 0.5 || r.height < vh * 0.5) continue;
          ds.pins.set(el, { samples: [] });
        }
        for (const [el, pin] of ds.pins) {
          if (!el.isConnected) continue;
          const r = el.getBoundingClientRect();
          pin.tag = el.tagName.toLowerCase();
          pin.height = ds.px(r.height);
          pin.container = ds.box(el.parentElement);
          pin.samples.push({ y, pos: getComputedStyle(el).position, top: Math.round(r.top), text: ds.seenText(el) });
        }
      },
      pinList: () => [...ds.pins.values()].flatMap((pin) => {
        const byTop = new Map();
        for (const s of pin.samples) if (s.pos === 'sticky' || s.pos === 'fixed') byTop.set(s.top, [...(byTop.get(s.top) || []), s]);
        const stuck = [...byTop.values()].sort((a, b) => b.length - a.length)[0] || [];
        const ys = [...new Set(stuck.map((s) => s.y))].sort((a, b) => a - b);
        const sticky = stuck.some((s) => s.pos === 'sticky');
        if (ys.length < 2 || (!sticky && !pin.samples.some((s) => s.pos !== 'fixed'))) return [];
        const texts = [...new Set(stuck.map((s) => s.text))];
        return [{
          kind: sticky ? 'sticky' : 'fixed',
          tag: pin.tag,
          label: (texts[0] || '').slice(0, 40),
          height: pin.height,
          container: pin.container,
          stuck: { from: ys[0], to: ys[ys.length - 1], count: ys.length },
          texts: texts.slice(0, 6).map((t) => t.slice(0, 60)),
        }];
      }),
      fixedList: () => {
        const count = {};
        return [...document.querySelectorAll(ds.clickSelector)].filter(ds.fixed).map((el) => {
          const k = `${ds.role(el)}|${ds.names(el)[0] || ''}`;
          count[k] = (count[k] || 0) + 1;
          return { el, key: `${k}#${count[k]}` };
        });
      },
      role: (el) => {
        const explicit = el.getAttribute('role');
        if (explicit) return explicit;
        const tag = el.tagName;
        if (/^H[1-6]$/.test(tag)) return 'heading';
        if (tag === 'A') return 'link';
        if (tag === 'BUTTON' || tag === 'SUMMARY') return 'button';
        if (tag === 'SELECT') return 'combobox';
        if (tag === 'TEXTAREA') return 'textbox';
        if (tag === 'INPUT') {
          const t = (el.getAttribute('type') || 'text').toLowerCase();
          return t === 'checkbox' || t === 'radio' ? t : /^(button|submit|reset|image)$/.test(t) ? 'button' : 'textbox';
        }
        return 'generic';
      },
      norm: (s) => String(s || '').replace(/\s+/g, ' ').trim(),
      content: (node) => {
        if (node.nodeType === 3) return node.nodeValue;
        if (node.nodeType !== 1 || node.getAttribute('aria-hidden') === 'true') return '';
        const cs = getComputedStyle(node);
        if (cs.display === 'none' || cs.visibility === 'hidden') return '';
        if (node.tagName === 'IMG') return node.getAttribute('alt') || '';
        if (node.tagName === 'BR') return ' ';
        const gap = cs.display === 'inline' ? '' : ' ';
        return gap + [...node.childNodes].map(ds.content).join('') + gap;
      },
      names: (el) => {
        const labelled = el.getAttribute('aria-labelledby');
        const own = [
          el.getAttribute('aria-label'),
          labelled && labelled.split(/\s+/).map((id) => ds.content(document.getElementById(id) || document.createTextNode(''))).join(' '),
          el.labels && el.labels[0] && ds.content(el.labels[0]),
        ].map(ds.norm).find(Boolean);
        const list = [own, ds.norm(ds.content(el)), ds.norm(el.innerText), ds.norm(el.textContent),
          ds.norm(el.getAttribute('alt') || el.querySelector('img[alt]')?.getAttribute('alt')), ds.norm(el.getAttribute('title')),
          ds.norm(el.getAttribute('placeholder')), ds.norm(el.value)];
        return [...new Set(list.filter(Boolean))];
      },
    };
    window.__ds = ds;
  }, C.clickSelector);

  // 3 scroll the page through once, in half-viewport steps (each followed by a fixed step of page time): lazy islands hydrate,
  //   scroll-triggered entrances finish, and a fixed element that only shows in one place is seen there. Islands hydrate after
  //   the load event and may swap their nodes, so wait for the page to go quiet first and identify a fixed element by
  //   its role, name and place among the same ones, not by a mark on the node.
  try {
    await page.waitForLoadState('networkidle', { timeout: 5000 });
  } catch (e) {
    // a page that never goes quiet is measured as it stands
  }
  await tick(500);
  // what scrolls: the document when it is taller than the screen, else the biggest visible element with its own scroll, <body> among them (an app shell with a <main> that scrolls, or a <body> inside a locked <html>)
  await page.evaluate(() => {
    const ds = window.__ds;
    const pick = document.documentElement.scrollHeight > window.innerHeight ? null : ds.candidates()[0];
    ds.scrollerSel = pick ? ds.pathOf(pick.el) : null;
  });
  const appeared = {};
  const step = Math.max(150, Math.floor((await page.evaluate(() => window.__ds.visibleHeight())) * 0.5));
  for (let y = 0; y < (await page.evaluate(() => window.__ds.scrollHeight())); y += step) {
    await page.evaluate((v) => window.__ds.scrollTo(v), y);
    await tick(200);
    const seen = await page.evaluate(() => {
      const ds = window.__ds;
      return ds.fixedList().flatMap(({ el, key }) => {
        const r = el.getBoundingClientRect();
        const on = ds.opacity(el) >= 0.01 && ds.shown(el) && r.bottom > 0 && r.top < window.innerHeight;
        return on ? [{ key, scrollY: ds.scrollTop(), top: ds.px(r.top), bottom: ds.px(r.bottom) }] : [];
      });
    });
    for (const f of seen) if (!appeared[f.key]) appeared[f.key] = { scrollY: f.scrollY, top: f.top, bottom: f.bottom };
    await page.evaluate(() => window.__ds.samplePins());
  }
  await page.evaluate(() => window.__ds.scrollTo(window.__ds.scrollHeight()));
  await tick(300);
  await page.evaluate(() => window.__ds.samplePins());
  try {
    await page.waitForLoadState('networkidle', { timeout: 5000 });
  } catch (e) {
    // a page that never goes quiet is measured as it stands
  }
  // late content (a block that grows once its data or a timer arrives) moves everything below it: wait until the height holds still
  let height = -1;
  for (let i = 0; i < 6; i += 1) {
    const h = await page.evaluate(() => window.__ds.scrollHeight());
    if (h === height) break;
    height = h;
    await tick(500);
  }
  await page.evaluate(() => window.__ds.scrollTo(0));
  await page.evaluate(() => document.fonts.ready);
  await tick(300);

  // 4 mark what the accessibility tree calls banner / contentinfo, then box the top-level blocks, headings and clickables
  for (const role of ['banner', 'contentinfo']) {
    await page.getByRole(role).evaluateAll((els, r) => els.forEach((el) => el.setAttribute('data-ds-lm', r)), role);
  }
  const base = await page.evaluate(() => {
    const ds = window.__ds;
    const main = document.querySelector('main, [role="main"]');
    const roots = main
      ? [...main.children]
      : [...document.body.children].filter((el) => !el.hasAttribute('data-ds-lm') && !/^(SCRIPT|STYLE|LINK|TEMPLATE|NOSCRIPT)$/.test(el.tagName));
    // a wrapper that takes no room of its own (`display: contents`, e.g. an island) is looked through to its children
    const through = (els) => els.flatMap((el) => (getComputedStyle(el).display === 'contents' ? through([...el.children]) : [el]));
    const blocks = through(roots).filter(ds.shown);
    blocks.forEach((el, i) => el.setAttribute('data-ds-block', String(i)));

    const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')].filter(ds.shown)
      .map((el) => ({ level: Number(el.getAttribute('aria-level')) || (/^H([1-6])$/.test(el.tagName) ? Number(el.tagName[1]) : 2), cands: ds.names(el), ...ds.box(el) }));
    const fixedKeys = new Map(ds.fixedList().map(({ el, key }) => [el, key]));
    const clickables = [...document.querySelectorAll(ds.clickSelector)].filter(ds.shown)
      .map((el) => ({
        role: ds.role(el),
        cands: ds.names(el),
        ...ds.box(el),
        landmark: el.closest('[data-ds-lm]')?.getAttribute('data-ds-lm') || null,
        opacity: ds.opacity(el),
        fixed: fixedKeys.get(el) ?? null,
      }));

    const info = document.querySelector('[data-ds-lm="contentinfo"]');
    const sc = ds.scroller;
    const rect = sc && sc.getBoundingClientRect();
    const scroller = sc
      ? { kind: 'element', selector: ds.scrollerSel, tag: sc.tagName.toLowerCase(), top: ds.px(rect.top + sc.clientTop + window.scrollY), left: ds.px(rect.left + sc.clientLeft), width: sc.clientWidth, contentHeight: sc.scrollHeight, visibleHeight: sc.clientHeight }
      : { kind: 'document', selector: null, tag: 'html', top: 0, left: 0, width: document.documentElement.clientWidth, contentHeight: document.documentElement.scrollHeight, visibleHeight: window.innerHeight };
    scroller.others = ds.candidates().filter((c) => c.el !== sc)
      .map((c) => ({ selector: ds.pathOf(c.el), tag: c.el.tagName.toLowerCase(), contentHeight: c.el.scrollHeight, visibleHeight: c.el.clientHeight, visibleArea: Math.round(c.area) }));
    return {
      scroller,
      pageSize: { width: document.documentElement.scrollWidth, height: sc ? ds.px(scroller.top + scroller.contentHeight) : document.documentElement.scrollHeight },
      blocks: blocks.map(ds.box),
      contentinfo: info ? ds.box(info) : null,
      headings,
      clickables,
      env: { language: navigator.language, dark: matchMedia('(prefers-color-scheme: dark)').matches, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, dpr: window.devicePixelRatio },
    };
  });

  // 5 the full accessible name of each heading and clickable, and whether role + name finds it (else: by its text)
  const memo = new Map();
  const resolve = async (role, cands) => {
    const key = `${role}|${cands.join('|')}`;
    if (memo.has(key)) return memo.get(key);
    let found = null;
    for (const name of cands) {
      let n = 0;
      try {
        n = await page.getByRole(role, { name, exact: true }).count();
      } catch (e) {
        n = 0;
      }
      if (n > 0) {
        found = { name, matches: n, byRole: true };
        break;
      }
    }
    if (!found) {
      const name = cands[0] || '';
      found = { name, matches: 0, byRole: false, textMatches: name ? await page.getByText(name, { exact: true }).count() : 0 };
    }
    memo.set(key, found);
    return found;
  };
  const headings = [];
  for (const { cands, ...h } of base.headings) headings.push({ ...h, ...(await resolve('heading', cands)) });
  const clickables = [];
  for (const { cands, fixed, ...c } of base.clickables) {
    clickables.push({ ...c, ...(await resolve(c.role, cands)), fixed: fixed !== null, appearance: fixed !== null ? appeared[fixed] || null : null });
  }

  // 6 locate each declared section through the accessibility tree
  const sections = [];
  for (const sec of C.sections) {
    const entry = { id: sec.id, locate: sec.locate, ...(sec.scrollDriven === true ? { declaredScrollDriven: true } : {}) };
    if (sec.locate.position !== undefined) {
      const b = base.blocks[sec.locate.position - 1];
      sections.push(b
        ? { ...entry, found: true, top: b.top, bottom: b.bottom, block: sec.locate.position - 1 }
        : { ...entry, found: false, reason: `第 ${sec.locate.position} 个顶层分块不存在（页面共 ${base.blocks.length} 个）` });
      continue;
    }
    const where = sec.locate.role === 'heading' ? page.getByRole('heading', { name: sec.locate.name, exact: true }) : page.getByRole(sec.locate.role);
    const n = await where.count();
    if (n !== 1) {
      sections.push({ ...entry, found: false, reason: n === 0 ? '页面上没有这个定位对应的元素（标题改名了？）' : `这个定位匹配到 ${n} 个元素，不唯一` });
      continue;
    }
    const r = await where.evaluate((el) => {
      const block = el.closest('[data-ds-block]');
      return { ...window.__ds.box(el), block: block ? Number(block.getAttribute('data-ds-block')) : -1 };
    });
    sections.push({ ...entry, found: true, ...r });
  }

  // 7 the pins the scroll-through saw, then clean the marks off
  const pins = await page.evaluate(() => window.__ds.pinList());
  await page.evaluate(() => {
    document.querySelectorAll('[data-ds-block],[data-ds-lm]').forEach((el) => {
      el.removeAttribute('data-ds-block');
      el.removeAttribute('data-ds-lm');
    });
    delete window.__ds;
  });
  const result = {
    state: C.state, entry: C.entry, section: C.section, page: C.page, viewport: C.viewport, theme: C.theme, motion: C.motion, clock,
    scroller: base.scroller, pageSize: base.pageSize, blocks: base.blocks, contentinfo: base.contentinfo,
    sections, pins, headings, clickables, env: base.env,
  };
  await page.evaluate((r) => { window.__dsMeasure = r; }, result);
  return result;
}