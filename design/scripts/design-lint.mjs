#!/usr/bin/env node
/**
 * Design lint — the mechanical gate of the design workflow.
 *
 * NOTE: this file only carries rules that are generically true across projects (the
 * AI-slop tells in design-core.md §5). Project-specific brand floors — a banned hex,
 * a retired warm tint, a retired display font — are NOT encoded here: they live in
 * the target project's own DESIGN.md as free text, and the skill that builds static
 * UI reads that file and holds the agent + human sign-off to it. No regex engine for
 * that half; it stays judgment + manual reconciliation.
 *
 * Deterministic, grep-style checks over a design-preview HTML file, modeled on
 * open-design's `lint-artifact.ts`. Encodes the mechanically-checkable subset of
 * references/design-core.md §5 anti-slop law. The model-judged rules (hierarchy,
 * concept, restraint judgment) stay with critique — this file only carries what a
 * regex can decide.
 *
 * Usage:  node design-lint.mjs <file.html> [more.html...] [--json]
 * Exit:   0 = clean (or P2-only), 2 = P0/P1 findings.
 *
 * Every rule has a stable id; severities follow open-design's contract:
 * P0 = regression (brand floor / hard ban), P1 = should fix, P2 = advisory.
 */

import { readFileSync } from 'node:fs';

// ---------- helpers ----------

/** Strip script/style/comments, then tags → the user-visible text. */
function visibleText(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–');
}

/** CSS + inline-style content (style blocks + style="" attrs). */
function cssText(html) {
  const blocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  const inline = [...html.matchAll(/style\s*=\s*"([^"]*)"/gi)].map((m) => m[1]);
  return blocks.concat(inline).join('\n');
}

function lineOf(html, index) {
  return html.slice(0, index).split('\n').length;
}

function findAll(haystack, re) {
  return [...haystack.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))];
}

// ---------- rules ----------

/** Each rule: { id, severity, why, check(html, ctx) → [{detail, line?}] } */
const RULES = [
  // — P0: hard bans, cross-project generic —
  {
    id: 'hard-offset-shadow',
    severity: 'P0',
    why: 'Hard offset shadows are retired (Soft-Elevation Rule): every shadow is blurred and near-neutral.',
    check: (html, { css }) => {
      const hits = [];
      for (const m of findAll(css, /box-shadow\s*:\s*([^;{}]+)/gi)) {
        for (const seg of m[1].split(',')) {
          // hard-offset signature: non-zero x AND y with 0 blur (e.g. "2px 2px 0 #0a0a0a")
          const nums = seg.trim().replace(/^inset\s+/i, '').match(/^(-?\d+(?:\.\d+)?)(?:px)?\s+(-?\d+(?:\.\d+)?)(?:px)?\s+(\d+(?:\.\d+)?)(?:px)?/);
          if (nums && Math.abs(+nums[1]) > 0 && Math.abs(+nums[2]) > 0 && +nums[3] === 0) {
            hits.push({ detail: seg.trim().slice(0, 60) });
          }
        }
      }
      return hits;
    },
  },
  {
    id: 'ai-purple-indigo',
    severity: 'P0',
    why: 'AI-default purple/indigo accent family (design-core §5.1); the project brand accent is the only structural loud color.',
    check: (html) => {
      const hex = findAll(html, /#(?:6366f1|4f46e5|4338ca|7c3aed|8b5cf6|a855f7|6d28d9|9333ea|c084fc|d946ef)\b/gi);
      const tw = findAll(html, /\b(?:bg|text|from|to|via|border|ring)-(?:indigo|violet|purple|fuchsia)-\d{2,3}\b/g);
      return hex.concat(tw).map((m) => ({ detail: m[0], line: lineOf(html, m.index) }));
    },
  },
  {
    id: 'gradient-text',
    severity: 'P0',
    why: 'Gradient text on headers is a banned AI tell (DESIGN.md Don\'ts, design-core §5.1).',
    check: (html, { css }) => findAll(css, /background-clip\s*:\s*text/gi).map((m) => ({ detail: m[0] })),
  },
  {
    id: 'em-dash-copy',
    severity: 'P0',
    why: 'Em/en-dash in user-visible EN copy is the #1 AI tell (design-core §5.4, binary ban). CJK 破折号 is exempt.',
    check: (html, { text }) =>
      findAll(text, /(?:\S+[ \t]+){0,3}\S*[—–]\S*(?:[ \t]+\S+){0,3}/g)
        .filter((m) => !/[一-鿿　-〿＀-￯]/.test(m[0])) // skip CJK context
        .map((m) => ({ detail: `…${m[0].trim().replace(/\s+/g, ' ').slice(0, 60)}…` })),
  },

  // — P1: anti-slop tells —
  {
    id: 'emoji-icon',
    severity: 'P1',
    why: 'Emoji as feature icons is an AI tell (design-core §5.1).',
    check: (html, { text }) =>
      findAll(text, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu).map((m) => ({ detail: m[0] })),
  },
  {
    id: 'external-stock-image',
    severity: 'P1',
    why: 'Hot-linked stock/placeholder CDNs break offline previews; use local assets (design-core §5.5).',
    check: (html) =>
      findAll(html, /(?:images\.unsplash\.com|placehold\.(?:it|co)|via\.placeholder\.com|picsum\.photos)/gi).map(
        (m) => ({ detail: m[0], line: lineOf(html, m.index) }),
      ),
  },
  {
    id: 'pure-black',
    severity: 'P1',
    why: 'Pure #000 is an AI tell; our ink is Slate 900 #0f172a (taste-skill §9.A).',
    check: (html, { css }) => findAll(css, /(?:color|background|border)[^;{}]*#000(?:000)?\b/gi).map((m) => ({ detail: m[0].slice(0, 50) })),
  },
  {
    id: 'bounce-easing',
    severity: 'P1',
    why: 'No bounce/elastic easing in-app (DESIGN.md Don\'ts; motion-spec easing tokens).',
    check: (html, { css }) => {
      const kw = findAll(css, /\b(?:bounce|elastic)\b/gi);
      const overshoot = findAll(css, /cubic-bezier\(\s*[\d.]+\s*,\s*(?:1\.[1-9]\d*|[2-9][\d.]*)/g);
      return kw.concat(overshoot).map((m) => ({ detail: m[0] }));
    },
  },
  {
    id: 'left-accent-card',
    severity: 'P1',
    why: 'Rounded card with a left colored border accent = the "AI dashboard tile" (design-core §5.1).',
    check: (html, { css }) =>
      findAll(css, /border-left\s*:\s*[3-9]px\s+solid\s+(?!#e2e8f0|transparent)/gi).map((m) => ({ detail: m[0].slice(0, 50) })),
  },
  {
    id: 'eyebrow-overuse',
    severity: 'P1',
    why: 'Max 1 uppercase-tracked eyebrow per 3 sections (design-core §5.2, mechanical quota).',
    check: (html, { css }) => {
      const sections = Math.max(findAll(html, /<section\b/gi).length, 1);
      const twEyebrows = findAll(html, /class\s*=\s*"[^"]*\buppercase\b[^"]*\btracking-|class\s*=\s*"[^"]*\btracking-\[?[^"]*\buppercase\b/g).length;
      const cssRules = findAll(css, /text-transform\s*:\s*uppercase/gi);
      let cssEyebrows = 0;
      for (const m of cssRules) {
        const around = css.slice(Math.max(0, m.index - 300), m.index + 300);
        if (/letter-spacing\s*:\s*(?:0\.0[6-9]|0\.[1-9]|[1-9](?:\.\d+)?px|0\.\d+em)/i.test(around)) {
          // count class usages of that rule's selector, approximated as 1 each
          cssEyebrows += 1;
        }
      }
      const count = twEyebrows + cssEyebrows;
      const quota = Math.ceil(sections / 3);
      return count > quota
        ? [{ detail: `~${count} uppercase-tracked labels across ${sections} sections (quota ${quota}) — verify eyebrow usage` }]
        : [];
    },
  },
  {
    id: 'scroll-cue',
    severity: 'P1',
    why: 'Scroll cues are banned (taste-skill §9.F): the viewport bottom does not need a label.',
    check: (html, { text }) => findAll(text, /scroll (?:to (?:explore|discover|walk)|down)/gi).map((m) => ({ detail: m[0] })),
  },
  {
    id: 'filler-verbs',
    severity: 'P1',
    why: 'Filler marketing verbs/adjectives are AI tells (design-core §5.3, extended from great-web-copy): concrete language only.',
    check: (html, { text }) =>
      findAll(
        text,
        /\b(?:elevate your|seamless(?:ly)?|unleash|next-gen|revolutioniz\w+|supercharge|innovative|cutting-edge|leverag\w*|synerg\w*|best-in-class|state-of-the-art|world-class|holistic|robust)\b/gi,
      ).map((m) => ({ detail: m[0] })),
  },
  {
    id: 'weak-cta-label',
    severity: 'P1',
    why: 'Button/CTA text must be a specific verb + object (design-core §5.6): "OK"/"Submit"/"Yes"/"No"/"Click here" are banned as the sole label.',
    check: (html) => {
      const banned = /^(?:ok|submit|yes|no|click here)$/i;
      const hits = [];
      const tagRe = /<button\b[^>]*>([\s\S]*?)<\/button>|<a\b[^>]*class\s*=\s*"[^"]*\b(?:btn|cta)\b[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
      for (const m of findAll(html, tagRe)) {
        const inner = (m[1] ?? m[2] ?? '').replace(/<[^>]+>/g, '').trim();
        if (banned.test(inner)) hits.push({ detail: `"${inner}"`, line: lineOf(html, m.index) });
      }
      return hits;
    },
  },
  {
    id: 'placeholder-only-label',
    severity: 'P1',
    why: 'Placeholder text disappears once the user types — it is not a label (design-core §5.6, impeccable clarify NEVER list).',
    check: (html) => {
      const hits = [];
      for (const m of findAll(html, /<input\b[^>]*placeholder\s*=\s*"[^"]*"[^>]*>/gi)) {
        const tag = m[0];
        if (/aria-label(?:ledby)?\s*=/i.test(tag)) continue;
        const idMatch = tag.match(/\bid\s*=\s*"([^"]+)"/i);
        if (idMatch && new RegExp(`<label\\b[^>]*\\bfor\\s*=\\s*"${idMatch[1]}"`, 'i').test(html)) continue;
        hits.push({ detail: tag.slice(0, 70), line: lineOf(html, m.index) });
      }
      return hits;
    },
  },
  {
    id: 'middle-dot-chain',
    severity: 'P1',
    why: 'Middle-dot is rationed: max 1 per metadata line, not the default separator (design-core §5.3).',
    check: (html, { text }) =>
      text
        .split('\n')
        .filter((l) => (l.match(/·/g) || []).length >= 3)
        .slice(0, 5)
        .map((l) => ({ detail: l.trim().slice(0, 60) })),
  },

  // — P2: advisory —
  {
    id: 'lorem-ipsum',
    severity: 'P2',
    why: 'Filler copy left in the preview.',
    check: (html, { text }) => (/(lorem ipsum)/i.test(text) ? [{ detail: 'lorem ipsum' }] : []),
  },
  {
    id: 'you-we-ratio',
    severity: 'P2',
    why: '"You" should outnumber "we" on persuasive marketing copy (design-core §5.6, great-web-copy). Advisory only — in-app copy legitimately says "we couldn\'t reach the server," so a mixed-register file can trip this without being wrong.',
    check: (html, { text }) => {
      const you = (text.match(/\byou(?:r|rs)?\b/gi) || []).length;
      const we = (text.match(/\bwe(?:'re|'ll|'ve)?\b|\bour\b|\bus\b/gi) || []).length;
      return we > you && we >= 3 ? [{ detail: `"we"-family ${we} vs "you"-family ${you}` }] : [];
    },
  },
  {
    id: 'reduced-motion-missing',
    severity: 'P2',
    why: 'File animates but has no prefers-reduced-motion fallback (DESIGN.md hard floor at port time).',
    check: (html, { css }) => {
      const animates = /@keyframes|animation\s*:|transition\s*:/i.test(css);
      const hasFallback = /prefers-reduced-motion/i.test(css) || /prefers-reduced-motion/i.test(html);
      return animates && !hasFallback ? [{ detail: 'animation present, no prefers-reduced-motion block' }] : [];
    },
  },
];

// ---------- runner ----------

export function lintHtml(html, file = '<input>') {
  const ctx = { css: cssText(html), text: visibleText(html) };
  const findings = [];
  for (const rule of RULES) {
    let hits = [];
    try {
      hits = rule.check(html, ctx) || [];
    } catch {
      continue; // a broken rule must never block the workflow
    }
    // cap noise per rule
    for (const h of hits.slice(0, 8)) {
      findings.push({ file, id: rule.id, severity: rule.severity, why: rule.why, ...h });
    }
    if (hits.length > 8) {
      findings.push({ file, id: rule.id, severity: rule.severity, why: rule.why, detail: `…and ${hits.length - 8} more` });
    }
  }
  return findings;
}

export function renderFindings(findings) {
  if (findings.length === 0) return 'design-lint: clean ✓';
  const bySev = { P0: [], P1: [], P2: [] };
  for (const f of findings) bySev[f.severity].push(f);
  const lines = [];
  for (const sev of ['P0', 'P1', 'P2']) {
    if (!bySev[sev].length) continue;
    lines.push(`${sev} (${sev === 'P0' ? 'must fix' : sev === 'P1' ? 'should fix' : 'advisory'}):`);
    for (const f of bySev[sev]) {
      lines.push(`  [${f.id}] ${f.detail ? `${f.detail}${f.line ? ` (line ${f.line})` : ''} — ` : ''}${f.why}`);
    }
  }
  return lines.join('\n');
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const files = args.filter((a) => !a.startsWith('--'));
  if (files.length === 0) {
    console.error('usage: design-lint.mjs <file.html> [...] [--json]');
    process.exit(1);
  }
  let all = [];
  for (const f of files) {
    let html;
    try {
      html = readFileSync(f, 'utf8');
    } catch (e) {
      console.error(`design-lint: cannot read ${f}: ${e.message}`);
      process.exit(1);
    }
    all = all.concat(lintHtml(html, f));
  }
  if (json) console.log(JSON.stringify(all, null, 2));
  else console.log(renderFindings(all));
  process.exit(all.some((f) => f.severity === 'P0' || f.severity === 'P1') ? 2 : 0);
}
