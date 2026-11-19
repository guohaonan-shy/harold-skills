function timeKit() {
  const T0 = Date.UTC(2026, 0, 1);
  const START = 1000;
  const BOOT = { steps: 4, ms: 250 };
  const kit = {
    startsAt: new Date(T0 + START).toISOString(),
    ready: (page) => !!page.__dsTime,
    // the clock and the animation timeline stopped at the fixed start; the page has to be reloaded for its own scripts to run on it
    install: async (page) => {
      const ctx = page.context();
      await ctx.clock.install({ time: T0 });
      await ctx.clock.pauseAt(T0 + START);
      let cdp = page.__dsTime && page.__dsTime.cdp;
      const stop = async (c) => {
        await c.send('Animation.enable');
        await c.send('Animation.setPlaybackRate', { playbackRate: 0 });
      };
      try {
        await stop(cdp);
      } catch (e) {
        cdp = await ctx.newCDPSession(page);
        await stop(cdp);
      }
      page.__dsTime = { cdp };
    },
    // move the page time on by `ms`; with no page time started, real time passes instead
    step: async (page, ms) => {
      if (!page.__dsTime) {
        await page.waitForTimeout(ms);
        return;
      }
      await page.clock.runFor(ms);
      for (const f of page.frames()) {
        await f.evaluate(async (n) => {
          for (const a of document.getAnimations()) if (a.playState === 'running') a.currentTime = (a.currentTime ?? 0) + n;
          // two real frames: the end events of what was just moved are sent, and what they start has started
          const b = globalThis.__pwClock && (globalThis.__pwClock.builtins || globalThis.__pwClock.builtin);
          if (b && b.requestAnimationFrame) await Promise.race([new Promise((r) => b.requestAnimationFrame(() => b.requestAnimationFrame(r))), new Promise((r) => b.setTimeout(r, 300))]);
        }, ms).catch(() => {});
      }
    },
    // let a page that has just loaded come up: wait for what real time brings (network, fonts), then a fixed run of steps
    boot: async (page) => {
      try {
        await page.waitForLoadState('networkidle', { timeout: 5000 });
      } catch (e) {
        // a page that never goes quiet is started as it stands
      }
      await page.evaluate(() => document.fonts.ready);
      for (let i = 0; i < BOOT.steps; i += 1) await kit.step(page, BOOT.ms);
    },
  };
  return kit;
}