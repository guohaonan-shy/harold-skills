#!/usr/bin/env node
/**
 * One-way sync of competitors and key pages from SEO.md into the OpenSEO project context. SEO.md is
 * the source of truth: when the two disagree there is no other way to tell which side is right, so
 * OpenSEO is never read back into SEO.md. The output's `updates` is exactly the `updates` argument
 * of OpenSEO's `update_project_context` (adds upsert by domain / url; removes take domains / urls).
 *
 * Input: SEO.md and a file holding the raw JSON `get_project_context` returned.
 *
 * Usage: node seo-context.mjs <SEO.md> <context.json>
 *   → { "updates": [...], "summary": "<who was added / changed / removed>" }   (updates [] = in sync)
 * Exit: 0 = planned, 1 = unreadable input (reason on stderr).
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { readSeoMd } from './seo-md.mjs';

const domainKey = (d) => String(d ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
const urlKey = (u) => String(u ?? '').trim().replace(/\/+$/, '');
const same = (a, b) => String(a ?? '').trim() === String(b ?? '').trim();

export function syncPlan(seo, context) {
  const updates = [];
  const lines = [];

  const theirs = new Map((context?.competitors ?? []).map((c) => [domainKey(c.domain), c]));
  const ours = new Map(seo.competitors.map((c) => [domainKey(c.domain), c]));
  const addCompetitors = [];
  for (const [key, c] of ours) {
    const t = theirs.get(key);
    if (t && same(t.name, c.name) && same(t.notes, c.notes)) continue;
    addCompetitors.push({ domain: key, ...(c.name ? { name: c.name } : {}), ...(c.notes ? { notes: c.notes } : {}) });
    lines.push(`${t ? '改' : '加'}竞品 ${key}`);
  }
  const removeCompetitors = [...theirs.keys()].filter((k) => !ours.has(k));
  removeCompetitors.forEach((k) => lines.push(`删竞品 ${k}`));

  const theirPages = new Map((context?.keyPages ?? []).map((p) => [urlKey(p.url), p]));
  const ourPages = new Map(seo.keyPages.map((p) => [urlKey(p.url), p]));
  const addKeyPages = [];
  for (const [key, p] of ourPages) {
    const t = theirPages.get(key);
    if (t && (p.keyword == null || same(t.topic, p.keyword))) continue;
    addKeyPages.push({ url: key, ...(p.keyword ? { topic: p.keyword } : {}) });
    lines.push(`${t ? '改' : '加'}重点页面 ${key}`);
  }
  const removeKeyPages = [...theirPages.keys()].filter((k) => !ourPages.has(k));
  removeKeyPages.forEach((k) => lines.push(`删重点页面 ${k}`));

  if (addCompetitors.length) updates.push({ addCompetitors });
  if (removeCompetitors.length) updates.push({ removeCompetitors });
  if (addKeyPages.length) updates.push({ addKeyPages });
  if (removeKeyPages.length) updates.push({ removeKeyPages });
  return { updates, summary: lines.length ? lines.join('；') : '竞品和重点页面与 SEO.md 一致' };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const [file, ctx] = process.argv.slice(2);
    if (!file || !ctx) throw new Error('usage: seo-context.mjs <SEO.md> <context.json>');
    console.log(JSON.stringify(syncPlan(readSeoMd(file), JSON.parse(readFileSync(ctx, 'utf8'))), null, 2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
