// The human's own words are called 原话 everywhere a design flow records them (ledger column, research-question block,
// quote fields, retro candidates), so the person sees one word across the reports. 原文 names something else (a quoted
// text, a rule's original wording), never the human's words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.md')) out.push(p);
  }
  return out;
}

test('no agent or skill file calls the human\'s words 原文', () => {
  const bad = [];
  for (const f of [...walk(join(root, 'agents')), ...walk(join(root, 'skills'))]) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/人的原文|人原文|批示原文|人对草稿的批示原文/g)) bad.push(`${relative(root, f)}: ${m[0]}`);
  }
  assert.deepEqual(bad, []);
});

test('the imagine flow names the human\'s words 原话, not 人的话', () => {
  for (const p of [
    'agents/uiux-imaginer.md',
    'skills/design/uiux-imagine/SKILL.md',
    'skills/design/uiux-imagine/references/direction-note.md',
    'skills/design/uiux-imagine/references/imagine-canvas.md',
  ]) {
    const text = read(p);
    assert.doesNotMatch(text, /人的话|附的话（逐字）/, p);
    assert.match(text, /原话/, p);
  }
});

test('the field names that hold the human\'s words say 原话', () => {
  assert.match(read('agents/uiux-researcher.md'), /\*\*人的原话\*\*：人敲下的那句话/);
  assert.match(read('agents/uiux-imaginer.md'), /\*\*人的原话\*\*：<逐字/);
  assert.match(read('skills/design/design-change-sync/SKILL.md'), /\| 日期 \| 画布版本 \| 改了哪几格 \| 人的原话 \| 评委分 \|/);
  assert.match(read('skills/design/uiux-refine/references/ledger-and-report.md'), /`<编号> \\\| <人的原话>`/);
  assert.match(read('skills/design/uiux-refine/references/ledger-and-report.md'), /"quote": "<人的原话>"/);
  assert.match(read('skills/design/uiux-research/references/research-backend.md'), /<p>…人的原话，原样…<\/p>/);
  assert.match(read('skills/design/uiux-research/SKILL.md'), /\*\*同时留住人的原话\*\*/);
  assert.match(read('skills/design/uiux-research/references/light-return.md'), /\*\*人这一轮的意图与思路\*\*：原话。/);
  assert.match(read('skills/design/design-archive/references/review-archive.md'), /「你的批示」，原话/);
  assert.match(read('skills/design/design-archive/references/review-walkthrough.md'), /「冻结后的变更」里人的原话/);
});

test('原文 stays where it means a quoted text, not the human\'s words', () => {
  assert.match(read('skills/design/design-archive/references/review-walkthrough.md'), /\*\*冻结下来的原文\*\*/);
  assert.match(read('skills/design/uiux-refine/references/ledger-and-report.md'), /调用时附上这条意见的原文/);
  assert.match(read('skills/design/design-change-sync/SKILL.md'), /把这几条原文用 SendMessage 交回同一个 designer/);
  assert.match(read('agents/uiux-imaginer.md'), /\*\*交付原文\*\*/);
});
