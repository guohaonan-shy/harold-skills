#!/usr/bin/env node
/**
 * Which directions a seo-scan run without arguments should take this time. One weekly schedule calls
 * seo-scan; the cheap directions run every time, the paid-heavy ones once in four weeks. The cadence is
 * the plugin's, not the project's: SEO.md has no schedule in it.
 *
 * When a direction last ran is read from OpenSEO's research log, where every seo-scan run leaves one
 * entry (see seo-scan's「研究日志」): its first line is `seo-scan <YYYY-MM-DD HH:MM>，方向：…`, its
 * second `采集：<direction> <N> 条；<direction> 未采集（…）`. A direction counts as run only when it was
 * collected — one skipped for budget or with its data source down is due again next week. So the
 * run state stays in OpenSEO and nothing is committed to the repo.
 *
 * The context only holds the recent log. A direction whose last entry fell off it reads as never run,
 * which at worst runs it a little early.
 *
 * Usage: node seo-due.mjs <context.json> <YYYY-MM-DD>
 *   → { "due": [<direction>...], "last": { "<direction>": "<YYYY-MM-DD>" | null } }
 * Exit: 0 = planned, 1 = unreadable input (reason on stderr).
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { DIRECTIONS } from './seo-md.mjs';

/** Days between runs. A weekly schedule drifts by minutes, so a direction is due one day early. */
export const CADENCE = { technical: 7, pages: 7, keywords: 28, backlinks: 28, geo: 28 };

const DAY = 86_400_000;
const dayOf = (s) => Date.parse(`${s}T00:00:00Z`);

/** The date of each direction's last collected run, from the research log entries. */
export function lastRuns(log) {
  const last = Object.fromEntries(DIRECTIONS.map((d) => [d, null]));
  for (const entry of log ?? []) {
    const text = String(entry?.summary ?? '');
    const head = text.match(/^seo-scan (\d{4}-\d{2}-\d{2})/);
    if (!head) continue;
    const collected = text.split('\n').find((l) => l.startsWith('采集：')) ?? '';
    for (const [, d] of collected.matchAll(/([a-z]+) \d+ 条/g)) {
      if (d in last && (last[d] === null || head[1] > last[d])) last[d] = head[1];
    }
  }
  return last;
}

export function due(context, today) {
  if (!Number.isFinite(dayOf(today))) throw new Error(`「${today}」不是 YYYY-MM-DD`);
  const last = lastRuns(context?.researchLog);
  const out = DIRECTIONS.filter((d) => last[d] === null || (dayOf(today) - dayOf(last[d])) / DAY >= CADENCE[d] - 1);
  return { due: out, last };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const [file, today] = process.argv.slice(2);
    if (!file || !today) throw new Error('usage: seo-due.mjs <context.json> <YYYY-MM-DD>');
    console.log(JSON.stringify(due(JSON.parse(readFileSync(file, 'utf8')), today), null, 2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
