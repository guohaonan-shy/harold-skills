#!/usr/bin/env node
/**
 * How many OpenSEO credits each direction of one seo-scan run may spend, out of a plan that resets
 * every month and does not carry over: what is not spent in a billing period is lost, so the plan is
 * spent in weeks instead of in single runs.
 *
 * The billing period starts on SEO.md's reset day (`套餐额度：每月 <n>，每月 <日> 日重置`) and is cut
 * into 7-day weeks from its first day (the last one may be shorter). This week's budget is what the
 * plan has left at the start of the week, spread over the weeks left including this one (rounded up):
 *
 *   budget = ceil((plan − spent in the period before this week) ÷ weeks left)
 *
 * It is split into three shares by SEO.md's `每周分配` ratio — 排名追踪 (rank tracking), 扫描 (the
 * directions of one scan), 起草与验证 (an issue session's research) — and a direction's ask is its own
 * allocation scaled the same way. A direction whose ask is more than what its share has left this week
 * does not run (allow 0, an entry in `skipped`); the rest run. Credits bought on top of the plan are
 * not in the plan and are not asked to be used up. Below SEO.md's balance floor nothing paid runs;
 * free calls (project context, stored audits, Search Console) always do.
 *
 * What was spent comes from the research log (the project context's `researchLog`): its `花费：<n>
 * credits` lines, each dated by its entry and counted in the share named by its `份：<份>` field
 * (no field = 扫描, so old logs read). The log is the only book: it holds the recent entries, so
 * `week.logSince` (the oldest entry's date) tells whether it reaches back to the period's start.
 *
 * Credits the run already spent before this plan (seo-scan's gap gate guessing competitors) are not in
 * the log yet: `--spent` adds them to this week's 扫描 share; `balance` is the one read after that
 * spend, so the floor holds too.
 *
 * Usage: node seo-budget.mjs <SEO.md> <balance> [<direction>...] [--spent <credits>] [--context <context.json>] [--today <YYYY-MM-DD>]
 *   → { "allow": { "<direction>": <credits> }, "skipped": [{ "direction", "reason" }], "week": { ... } }
 *   No directions: only `week` (an issue session reads 起草与验证's `left` from it). No `--context`:
 *   nothing counts as spent and `week.logKnown` is false.
 * Exit: 0 = planned, 1 = bad arguments or a SEO.md without the plan (reason on stderr).
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { DIRECTIONS, readSeoMd } from './seo-md.mjs';

export const SHARES = ['排名追踪', '扫描', '起草与验证'];

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const toMs = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s)) || !Number.isFinite(Date.parse(`${s}T00:00:00Z`))) throw new Error(`「${s}」不是 YYYY-MM-DD`);
  return Date.parse(`${s}T00:00:00Z`);
};
const toDay = (ms) => new Date(ms).toISOString().slice(0, 10);
/** The reset day of a month (month may run past 11 or below 0); a day past the month's end is its last day. */
const resetOn = (year, month, day) => Math.min(Date.UTC(year, month, day), Date.UTC(year, month + 1, 0));

/** The billing period holding `today`: starts on a reset day, ends (exclusive) on the next one. */
export function billingPeriod(resetDay, today) {
  const t = new Date(toMs(today));
  let start = resetOn(t.getUTCFullYear(), t.getUTCMonth(), resetDay);
  if (start > t.getTime()) start = resetOn(t.getUTCFullYear(), t.getUTCMonth() - 1, resetDay);
  const s = new Date(start);
  return { start: toDay(start), end: toDay(resetOn(s.getUTCFullYear(), s.getUTCMonth() + 1, resetDay)) };
}

/** Every `花费` line of the research log: { date, share, credits }. `未知` and entries with no date count as nothing. */
export function spendings(log) {
  const out = [];
  for (const entry of log ?? []) {
    const text = String(entry?.summary ?? '');
    const date = /^\d{4}-\d{2}-\d{2}/.test(String(entry?.entryDate ?? '')) ? String(entry.entryDate).slice(0, 10) : text.split('\n')[0].match(/\d{4}-\d{2}-\d{2}/)?.[0];
    if (!date) continue;
    for (const line of text.split('\n')) {
      const m = line.match(/^花费：(\d[\d,]*)\s*credits/);
      if (!m) continue;
      out.push({ date, share: line.match(/份：(排名追踪|扫描|起草与验证)/)?.[1] ?? '扫描', credits: Number(m[1].replace(/,/g, '')) });
    }
  }
  return out;
}

const loggedSince = (log) => {
  const dates = (log ?? []).map((e) => String(e?.entryDate ?? '').slice(0, 10) || String(e?.summary ?? '').split('\n')[0].match(/\d{4}-\d{2}-\d{2}/)?.[0]).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d ?? ''));
  return dates.length ? dates.sort()[0] : null;
};

/** This week's books: the budget, its three shares (quota, spent, left) and what the period has spent. */
export function week({ monthly, resetDay, weekly }, log, today, { gateSpent = 0, logKnown = true } = {}) {
  if (monthly == null || resetDay == null || !weekly) {
    throw new Error('SEO.md「OpenSEO」没写「套餐额度」和「每周分配」：跑 `/idea-loop:seo-setup` 补上');
  }
  const period = billingPeriod(resetDay, today);
  const weekStart = toMs(period.start) + Math.floor((toMs(today) - toMs(period.start)) / WEEK) * WEEK;
  const weeksLeft = Math.ceil((toMs(period.end) - weekStart) / WEEK);
  const spent = spendings(log).filter((s) => s.date >= period.start && s.date < period.end);
  const before = spent.filter((s) => s.date < toDay(weekStart)).reduce((a, s) => a + s.credits, 0);
  const budget = Math.max(0, Math.ceil((monthly - before) / weeksLeft));
  const alloc = { 排名追踪: weekly.tracking, 扫描: Object.values(weekly.scan).reduce((a, n) => a + n, 0), 起草与验证: weekly.drafting };
  const total = alloc.排名追踪 + alloc.扫描 + alloc.起草与验证;
  const shares = {};
  for (const share of SHARES) {
    const quota = total ? Math.floor((budget * alloc[share]) / total) : 0;
    const used = spent.filter((s) => s.share === share && s.date >= toDay(weekStart)).reduce((a, s) => a + s.credits, 0) + (share === '扫描' ? gateSpent : 0);
    shares[share] = { quota, spent: used, left: Math.max(0, quota - used) };
  }
  return {
    period,
    weekStart: toDay(weekStart),
    weeksLeft,
    periodSpent: spent.reduce((a, s) => a + s.credits, 0),
    budget,
    shares,
    ask: (direction) => (total ? Math.floor((budget * (weekly.scan[direction] ?? 0)) / total) : 0),
    logKnown,
    logSince: loggedSince(log),
  };
}

export function plan(openseo, balance, directions, { log = [], today, spent = 0, logKnown = true } = {}) {
  const { floor } = openseo;
  for (const d of directions) if (!DIRECTIONS.includes(d)) throw new Error(`不认识的方向「${d}」（只认 ${DIRECTIONS.join(' / ')}）`);
  const { ask, ...books } = week(openseo, log, today, { gateSpent: spent, logKnown });
  const floorRoom = Number.isFinite(balance) && floor != null ? Math.max(0, balance - floor) : 0;
  const out = { allow: {}, skipped: [], week: { ...books, floorRoom } };
  const { allow, skipped } = out;
  if (!Number.isFinite(balance)) {
    for (const d of directions) {
      allow[d] = 0;
      skipped.push({ direction: d, reason: '读不到余额，只做免费调用' });
    }
    return out;
  }
  if (floor == null) throw new Error('SEO.md「OpenSEO」没写余额下限');
  if (balance < floor) {
    for (const d of directions) {
      allow[d] = 0;
      skipped.push({ direction: d, reason: `余额 ${balance} 低于下限 ${floor}，只做免费调用` });
    }
    return out;
  }
  let scanLeft = books.shares['扫描'].left;
  let roomLeft = floorRoom;
  for (const d of directions) {
    const want = ask(d);
    allow[d] = 0;
    if (!openseo.weekly.scan[d]) continue;
    if (want === 0) {
      skipped.push({ direction: d, reason: `本周预算 ${books.budget} 已没有（套餐额度 ${openseo.monthly}，本账期已花 ${books.periodSpent}），本周不跑，只做免费调用` });
      continue;
    }
    if (want > scanLeft) {
      skipped.push({ direction: d, reason: `预估 ${want} 超过扫描这一份本周剩余 ${scanLeft}（本周预算 ${books.budget}，扫描份 ${books.shares['扫描'].quota}），本周不跑，只做免费调用` });
      continue;
    }
    const got = Math.min(want, roomLeft);
    allow[d] = got;
    scanLeft -= got;
    roomLeft -= got;
    if (got < want) skipped.push({ direction: d, reason: `只放行 ${got}/${want}（余额下限 ${floor}）` });
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const args = process.argv.slice(2);
    const option = (name) => {
      const at = args.indexOf(name);
      if (at < 0) return undefined;
      const value = args[at + 1];
      args.splice(at, 2);
      return value;
    };
    const spentArg = option('--spent');
    const spent = spentArg === undefined ? 0 : Number(spentArg);
    if (!Number.isFinite(spent) || spent < 0) throw new Error('--spent 要一个不小于 0 的数');
    const contextFile = option('--context');
    const today = option('--today') ?? toDay(Date.now());
    const [file, balanceArg, ...directions] = args;
    if (!file || balanceArg === undefined) throw new Error('usage: seo-budget.mjs <SEO.md> <余额> [<方向>...] [--spent <已花>] [--context <context.json>] [--today <YYYY-MM-DD>]');
    const balance = balanceArg === 'null' || balanceArg === '' ? NaN : Number(balanceArg);
    const log = contextFile ? (JSON.parse(readFileSync(contextFile, 'utf8')).researchLog ?? []) : [];
    console.log(JSON.stringify(plan(readSeoMd(file).openseo, balance, directions, { log, today, spent, logKnown: Boolean(contextFile) }), null, 2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
