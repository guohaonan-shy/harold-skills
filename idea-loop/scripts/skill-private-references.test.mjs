/**
 * Tripwire for idea-loop/AGENTS.md「参考资料归谁」: a skill's `references/` are that skill's own
 * detail, read only by it and the agents it starts. Another skill that needs the same text means
 * the text is a capability of its own — promote it to a skill, or move it into the skill that really
 * uses it, and call it by name.
 *
 * Mechanical form: in a skill's SKILL.md or its own references, "`<plugin>:<other>` 的 `references/…`"
 * or a path through `skills/[<category>/]<other>/references/` is a read of that other skill's private
 * references. (A skill that says "read it, then its `references/x.md` for the long case" is routing
 * you through its own body and is not this pattern.)
 *
 * Agents: an agent definition may read a skill's `references/` by the full path under the plugin root
 * (`${CLAUDE_PLUGIN_ROOT}/skills/[<category>/]<slug>/references/…`), because an agent does not sit next
 * to the skill directory. Two things must hold for every such path: it exists (a moved directory
 * breaks it silently), and the skill in it is one that starts this agent — i.e. some text of that
 * skill (SKILL.md or its references) names `<plugin>:<agent>`. An agent reading a skill that never
 * starts it is the same foreign read as above.
 *
 * The rule covers the three plugins split out of idea-loop (idea-loop, design, seo): idea-loop keeps
 * category directories, design and seo put skills straight under `skills/`. A path in an agent
 * resolves against the agent's own plugin, so it can only reach a skill of that plugin.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PLUGINS = ['idea-loop', 'design', 'seo'];
const NAME = `(?:${PLUGINS.join('|')})`;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** Every skill directory of every plugin: `skills/[<category>/]<slug>/` holding a SKILL.md. */
function skillDirs() {
  const dirs = [];
  const look = (dir) => {
    for (const name of readdirSync(dir)) {
      const d = join(dir, name);
      if (!statSync(d).isDirectory()) continue;
      if (existsSync(join(d, 'SKILL.md'))) dirs.push({ slug: name, dir: d });
      else look(d);
    }
  };
  for (const plugin of PLUGINS) look(join(repoRoot, plugin, 'skills'));
  return dirs;
}

/** Other skills whose private `references/` this text reads, as `[otherSlug, excerpt]`. */
export function foreignReferenceReads(text, ownSlug) {
  const hits = [];
  // "`<plugin>:<other>` 的 `references/…`"
  const byName = new RegExp(`${NAME}:([a-z][a-z0-9-]*)\`?\\s*的\\s*\`?\\[?\`?references\\/[\\w./-]*`, 'g');
  for (const m of text.matchAll(byName)) {
    if (m[1] !== ownSlug) hits.push([m[1], m[0]]);
  }
  // a path through another skill's directory
  const byPath = /skills\/(?:[a-z]+\/)?([a-z][a-z0-9-]*)\/references\//g;
  for (const m of text.matchAll(byPath)) {
    if (m[1] !== ownSlug) hits.push([m[1], m[0]]);
  }
  return hits;
}

/** Skills whose own text (SKILL.md and its references) names `<plugin>:<agent>`, as a Set of slugs. */
export function startersOf(agent, skillTexts) {
  const named = new RegExp(`${NAME}:${agent}(?![a-z0-9-])`);
  return new Set(skillTexts.filter(({ text }) => named.test(text)).map(({ slug }) => slug));
}

/**
 * Problems with the skill-reference paths in one agent definition. `starters` is the set of skill
 * slugs that start this agent; `exists(relPath)` says whether a path under the agent's plugin root exists.
 */
export function agentReferenceProblems(agent, text, starters, exists) {
  const problems = [];
  const path = /skills\/(?:[a-z]+\/)?([a-z][a-z0-9-]*)\/references(?:\/[A-Za-z0-9_.-]*)*/g;
  for (const m of text.matchAll(path)) {
    const rel = m[0].replace(/\.+$/, '');
    const slug = m[1];
    if (!exists(rel)) {
      problems.push(`agents/${agent}.md reads ${rel}: no such path`);
    } else if (!starters.has(slug)) {
      const by = starters.size ? [...starters].join(', ') : 'no skill';
      problems.push(`agents/${agent}.md reads ${rel}: ${slug} does not start ${agent} (started by ${by})`);
    }
  }
  return problems;
}

/** Every skill's markdown, tagged with its slug. */
function skillTexts() {
  return skillDirs().flatMap(({ slug, dir }) =>
    walk(dir).filter((f) => f.endsWith('.md')).map((f) => ({ slug, text: readFileSync(f, 'utf8') })),
  );
}

test('foreignReferenceReads: names a skill reading another skill\'s references', () => {
  const text = '做法见 `design:uiux-refine` 的 `references/freeze.md` 的「冻结之后的设计变更」。';
  assert.deepEqual(foreignReferenceReads(text, 'implement').map(([slug]) => slug), ['uiux-refine']);
  assert.deepEqual(foreignReferenceReads(text, 'uiux-refine'), []);
});

test('foreignReferenceReads: a skill name in one sentence and references/ in the next is not a read', () => {
  const text = '用 Skill 工具调 `idea-loop:pr`。参考 `references/review-standards.md`。';
  assert.deepEqual(foreignReferenceReads(text, 'pr-review'), []);
});

test('foreignReferenceReads: a path into another skill\'s references', () => {
  const text = '${CLAUDE_PLUGIN_ROOT}/skills/uiux-refine/references/freeze.md';
  assert.deepEqual(foreignReferenceReads(text, 'implement').map(([slug]) => slug), ['uiux-refine']);
});

test('no skill reads another skill\'s private references', () => {
  const violations = [];
  for (const { slug, dir } of skillDirs()) {
    for (const file of walk(dir).filter((f) => f.endsWith('.md'))) {
      const text = readFileSync(file, 'utf8');
      for (const [other, excerpt] of foreignReferenceReads(text, slug)) {
        violations.push(`${relative(repoRoot, file)} reads ${other}'s references: ${excerpt}`);
      }
    }
  }
  assert.deepEqual(violations, []);
});

test('agentReferenceProblems: a path that does not exist is reported with the agent and the path', () => {
  const text = '开工先读 `${CLAUDE_PLUGIN_ROOT}/skills/seo-scan/references/gone.md`。';
  const problems = agentReferenceProblems('geo-analyst', text, new Set(['seo-scan']), () => false);
  assert.deepEqual(problems, ['agents/geo-analyst.md reads skills/seo-scan/references/gone.md: no such path']);
});

test('agentReferenceProblems: reading a skill that does not start the agent is reported', () => {
  const text = '读 `${CLAUDE_PLUGIN_ROOT}/skills/engineering/implement/references/ui-tickets.md`。';
  const problems = agentReferenceProblems('pr-reviewer', text, new Set(['pr-review']), () => true);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /agents\/pr-reviewer\.md reads skills\/engineering\/implement\/references\/ui-tickets\.md/);
  assert.match(problems[0], /implement does not start pr-reviewer \(started by pr-review\)/);
  assert.match(agentReferenceProblems('pr-reviewer', text, new Set(), () => true)[0], /started by no skill/);
});

test('agentReferenceProblems: an existing path in a skill that starts the agent is fine, a directory and trailing dot too', () => {
  const text = [
    '读 `${CLAUDE_PLUGIN_ROOT}/skills/seo-scan/references/findings.md`。',
    '在 `${CLAUDE_PLUGIN_ROOT}/skills/seo-scan/references/` 下。',
    '见 ${CLAUDE_PLUGIN_ROOT}/skills/seo-scan/references/findings.md.',
  ].join('\n');
  const seen = [];
  const exists = (p) => (seen.push(p), true);
  assert.deepEqual(agentReferenceProblems('geo-analyst', text, new Set(['seo-scan']), exists), []);
  assert.deepEqual(seen, [
    'skills/seo-scan/references/findings.md',
    'skills/seo-scan/references/',
    'skills/seo-scan/references/findings.md',
  ]);
});

test('startersOf: whole-name match, so one agent name that prefixes another does not count', () => {
  const texts = [
    { slug: 'a', text: '起 `design:designer`。' },
    { slug: 'b', text: '调 `design:design-archive`。' },
    { slug: 'c', text: '什么都没起' },
  ];
  assert.deepEqual([...startersOf('designer', texts)], ['a']);
  assert.deepEqual([...startersOf('design', texts)], []);
});

test('every skill reference an agent definition reads exists and belongs to a skill that starts it', () => {
  const texts = skillTexts();
  const problems = [];
  for (const plugin of PLUGINS) {
    const agentsDir = join(repoRoot, plugin, 'agents');
    for (const file of readdirSync(agentsDir).filter((f) => f.endsWith('.md'))) {
      const agent = file.replace(/\.md$/, '');
      const text = readFileSync(join(agentsDir, file), 'utf8');
      problems.push(...agentReferenceProblems(agent, text, startersOf(agent, texts), (p) => existsSync(join(repoRoot, plugin, p))));
    }
  }
  assert.deepEqual(problems, []);
});
