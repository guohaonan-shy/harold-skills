async function pinnedPage(page, C, T, D) {
  await page.setViewportSize({ width: C.viewport.width, height: C.viewport.height });
  await page.emulateMedia({ colorScheme: C.theme, reducedMotion: C.motion === 'reduce' ? 'reduce' : 'no-preference' });
  const clock = T.ready(page) ? 'present: the page time is stopped, nothing here moves it' : '装晚了: the page time was never started on this tab (run `time` first), so what the page runs on its own moves while it is shot';
  await page.evaluate(() => document.fonts.ready);
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
  const file = C.file;
  const kept = await snap(`${C.outDir}/${file}`);
  await page.waitForTimeout(500);
  const again = await snap();
  let uncontrolled = !kept.equals(again);
  let diffBox = null;
  if (uncontrolled) {
    diffBox = await D.boxOf(page, [{ a: kept, b: again, y: 0 }]);
    if (diffBox === 'same') uncontrolled = false;
  }
  const scrolledTo = await page.evaluate(() => Math.round(window.scrollY));
  return { out: C.outDir, clock, shots: [{ id: C.state, file, scrollY: scrolledTo, width: view.width, height: view.height, settled, uncontrolled, ...(uncontrolled ? { diffBox: diffBox || { x: 0, y: 0, width: view.width, height: view.height } } : {}) }] };
}