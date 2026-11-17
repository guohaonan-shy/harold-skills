/**
 * Shared checks for a skill whose body is kept short and whose sections other skills point at by name
 * (`idea-loop:<skill>` 的「X」). Used by the per-skill doc tests (design-archive, wiki-conventions).
 *
 * - bodyChars: the SKILL.md body (frontmatter stripped) in UTF-8 characters — the repo rule is
 *   "SKILL.md 主体 < 5000 字" (AGENTS.md); long material lives in the skill's own `references/`.
 * - danglingSectionPointers: every title quoted right after a `idea-loop:<skill>` mention, anywhere in the
 *   plugin's skills and agents, must be a heading of the skill's SKILL.md or of one of its `references/` files.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

export const MAX_BODY_CHARS = 5000;

export function mdFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return mdFiles(p);
    return name.endsWith('.md') ? [p] : [];
  });
}

/** Everything after the closing `---` of the frontmatter. */
export function body(text) {
  const m = text.match(/^---\n[\s\S]*?\n---\n/);
  return m ? text.slice(m[0].length) : text;
}

export function bodyChars(skillDir) {
  return [...body(readFileSync(join(skillDir, 'SKILL.md'), 'utf8'))].length;
}

export function headings(text) {
  let fenced = false;
  const out = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('```')) fenced = !fenced;
    const m = !fenced && line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (m) out.push(m[1]);
  }
  return out;
}

/** @returns {{ seen: number, bad: string[] }} */
export function danglingSectionPointers({ pluginRoot, skillDir, skillName }) {
  const known = [join(skillDir, 'SKILL.md'), ...mdFiles(join(skillDir, 'references'))].flatMap((f) => headings(readFileSync(f, 'utf8')));
  const exists = (title) => known.some((h) => h === title || h.startsWith(`${title}：`) || h.startsWith(`${title}（`));

  // `idea-loop:<skill>` 的「A」「B」 / ，看它的「A」到「B」 / （看它的「A」 / 的 `references/x.md`「A」 / 的「A」里的「B」
  const name = `idea-loop:${skillName}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const POINTER = new RegExp(`\`${name}\`(?:，看它的|（看它的|\\s*的\\s*(?:\`references\\/[\\w.-]+\\.md\`)?)((?:「[^」]+」(?:里的|的|、|到|和)?)+)`, 'g');

  const bad = [];
  let seen = 0;
  for (const dir of ['skills', 'agents']) {
    for (const file of mdFiles(join(pluginRoot, dir))) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        for (const m of line.matchAll(POINTER)) {
          for (const [, title] of m[1].matchAll(/「([^」]+)」/g)) {
            seen += 1;
            if (!exists(title)) bad.push(`${relative(pluginRoot, file)}:${i + 1}  「${title}」`);
          }
        }
      });
    }
  }
  return { seen, bad };
}
