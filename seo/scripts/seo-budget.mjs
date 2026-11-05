#!/usr/bin/env node
/**
 * How many OpenSEO credits each direction of one seo-scan run may spend. A routine runs with nobody
 * to ask, and OpenSEO wants a human's yes before a batch over 2,000 credits, so a run never plans more
 * than that in total. Below SEO.md's balance floor nothing paid runs; free calls (project context,
 * stored audits, Search Console) always do, so a skipped direction still collects what is free.
 *
 * Directions are granted in the order given (the routine's argument order); the one that would cross
 * the cap gets what is left, the rest get 0 with the reason.
 *
 * Credits the run already spent before this plan (seo-scan's gap gate guessing competitors) count
 * against the single-run cap; `balance` is the one read after that spend, so the floor holds too.
 *
 * Usage: node seo-budget.mjs <SEO.md> <balance> <direction>... [--spent <credits>]
 *   → { "allow": { "<direction>": <credits> }, "skipped": [{ "direction", "reason" }] }
 * Exit: 0 = planned, 1 = bad arguments (reason on stderr).
 */

import { pathToFileURL } from 'node:url';
import { DIRECTIONS, readSeoMd } from './seo-md.mjs';

export const RUN_CAP = 2000;

export function plan({ floor, budgets }, balance, directions, spent = 0) {
  const allow = {};
  const skipped = [];
  for (const d of directions) if (!DIRECTIONS.includes(d)) throw new Error(`不认识的方向「${d}」（只认 ${DIRECTIONS.join(' / ')}）`);
  if (!Number.isFinite(balance)) {
    for (const d of directions) {
      allow[d] = 0;
      skipped.push({ direction: d, reason: '读不到余额，只做免费调用' });
    }
    return { allow, skipped };
  }
  if (floor == null) throw new Error('SEO.md「OpenSEO」没写余额下限');
  if (balance < floor) {
    for (const d of directions) {
      allow[d] = 0;
      skipped.push({ direction: d, reason: `余额 ${balance} 低于下限 ${floor}，只做免费调用` });
    }
    return { allow, skipped };
  }
  let left = Math.max(0, Math.min(RUN_CAP - spent, balance - floor));
  for (const d of directions) {
    const want = budgets[d] ?? 0;
    const got = Math.min(want, left);
    allow[d] = got;
    left -= got;
    if (want === 0) continue;
    if (got < want) skipped.push({ direction: d, reason: got === 0 ? `本次额度已用完（单次合计上限 ${RUN_CAP}，余额下限 ${floor}），只做免费调用` : `只放行 ${got}/${want}（单次合计上限 ${RUN_CAP}，余额下限 ${floor}）` });
  }
  return { allow, skipped };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const args = process.argv.slice(2);
    let spent = 0;
    const at = args.indexOf('--spent');
    if (at >= 0) {
      spent = Number(args[at + 1]);
      if (!Number.isFinite(spent) || spent < 0) throw new Error('--spent 要一个不小于 0 的数');
      args.splice(at, 2);
    }
    const [file, balanceArg, ...directions] = args;
    if (!file || balanceArg === undefined || !directions.length) throw new Error('usage: seo-budget.mjs <SEO.md> <余额> <方向>... [--spent <已花>]');
    const balance = balanceArg === 'null' || balanceArg === '' ? NaN : Number(balanceArg);
    console.log(JSON.stringify(plan(readSeoMd(file).openseo, balance, directions, spent), null, 2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
