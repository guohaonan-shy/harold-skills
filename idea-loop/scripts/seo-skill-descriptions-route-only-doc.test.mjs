/**
 * Tripwire — six seo skills' descriptions route only.
 *
 * Spec seo-skill-descriptions-route-only (#234). Convention (AGENTS.md 「SKILL.md 编写约定」 §1): a model-invocable
 * skill's description says what it is plus a trigger per branch; no flow, no artifact shape or destination. These six
 * used to spell out what each of the two invocations hands back, or where the drafts go.
 *
 * SEO_SKILLS_DIR points the test at another copy of skills/seo (used to watch it fail on the pre-change text).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const seoDir = process.env.SEO_SKILLS_DIR ?? join(pluginRoot, 'skills', 'seo');
const description = (slug) =>
  readFileSync(join(seoDir, slug, 'SKILL.md'), 'utf8').match(/^description: (.*)$/m)[1];

const SKILLS = ['seo-outreach', 'seo-writing', 'seo-coach', 'competitor-analysis', 'keyword-research', 'keyword-clustering', 'seo-audit'];
const ARTIFACT_WORDS = ['人在场时', '发现清单', '草稿箱', '表单', '报告', '打标'];

for (const slug of SKILLS) {
  test(`${slug}: description has no flow or artifact, and keeps a trigger`, () => {
    const d = description(slug);
    for (const w of ARTIFACT_WORDS) assert.ok(!d.includes(w), `${slug} description mentions 「${w}」: ${d}`);
    assert.match(d, /时用/, `${slug} description has no trigger: ${d}`);
  });
}
