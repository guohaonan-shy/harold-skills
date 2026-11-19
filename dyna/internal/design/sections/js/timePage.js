async function timePage(page, C, T) {
  await page.setViewportSize({ width: C.viewport.width, height: C.viewport.height });
  await page.emulateMedia({ colorScheme: C.theme, reducedMotion: C.motion === 'reduce' ? 'reduce' : 'no-preference' });
  await T.install(page);
  await page.reload();
  await T.boot(page);
  return { installed: true, startsAt: T.startsAt, viewport: C.viewport, theme: C.theme, motion: C.motion };
}