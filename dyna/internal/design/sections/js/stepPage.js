async function stepPage(page, C, T) {
  if (!T.ready(page)) throw new Error('页面时间还没装：先跑「装时间」（dyna design archive sections time）再拨');
  await T.step(page, C.ms);
  return { stepped: C.ms };
}