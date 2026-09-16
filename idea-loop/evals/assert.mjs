/**
 * Baseline assertions —— 这条环的接通检查，写成会红的断言。
 *
 * 为什么它们住在这里而不是在某次跑完之后由人看一眼：**干跑的结论会随会话消失，断言不会。**
 * 每次改 rubric、prompt 或 SKILL.md，重跑 `run-baseline.mjs`，这一组断言是「环还接着吗」
 * 这个问题唯一不靠记忆的答案。
 *
 * 每条断言是一个纯函数：拿一份跑完的项目目录（外加跑之前的文件清单、仓库根），
 * 回一个 `{ passed, evidence }`。没有模型、没有品味、没有打分——**这里只判形状**。
 * 内容好不好由人看 `run-baseline.mjs` 存下来的产物，那是这一层不该替他做的判断。
 *
 * 字段名 `text` / `passed` / `evidence` 是 skill-creator 的 grading.json 契约，不要改名。
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { checkDirectionNote } from '../scripts/direction-note-check.mjs';

// ── 小工具 ──────────────────────────────────────────────────────────────────

/**
 * 递归列出目录下全部文件，返回相对 root 的路径（POSIX 分隔符）。
 *
 * `.playwright-mcp/` 是浏览器 MCP 自己往 cwd 里扔的抓取缓存（页面快照、console log），
 * 不是这条环的产物——它跟 `.git` 一样属于工具的痕迹，不进任何一条断言的视野。
 */
export function walk(root, dir = root, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules' || name === '.playwright-mcp') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(root, full, out);
    else out.push(relative(root, full).split(sep).join('/'));
  }
  return out;
}

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);

/** 极简 frontmatter 取值——只取顶层 `key: value`，够这些断言用。 */
export function frontmatter(md) {
  if (!md?.startsWith('---')) return {};
  const end = md.indexOf('\n---', 3);
  if (end < 0) return {};
  const out = {};
  for (const line of md.slice(4, end).split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

/** 取一个 ATX 标题下的正文，直到下一个同级或更浅的标题。标题按「包含」匹配。 */
export function section(md, titleFragment) {
  const lines = String(md ?? '').split(/\r?\n/);
  let level = null;
  const body = [];
  for (const line of lines) {
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      if (level === null) {
        if (h[2].includes(titleFragment)) level = h[1].length;
        continue;
      }
      if (h[1].length <= level) break;
    }
    if (level !== null) body.push(line);
  }
  return level === null ? null : body.join('\n');
}

/**
 * 取一节，但只在**指定的兄弟标题**处停——给那些正文里粘了别处内容的节用。
 *
 * 冻结记录的「打磨轨迹」就是这种：ledger 全文原样搬进来，它自带一个 `#` 级标题，
 * 比容纳它的 `##` 还浅。按「同级或更浅就停」去切，会在 ledger 的第一行就切断，
 * 然后报出一个「ledger 1 行」这种看起来像证据、其实是量具坏了的数字。
 *
 * 冻结记录的四节（意图 · 冻结了什么 · 打磨轨迹 · 签字）是 skill 定死的闭集，
 * 所以「下一个兄弟是谁」这件事是契约，不是猜。
 */
export function sectionUntil(md, titleFragment, siblingFragments) {
  const lines = String(md ?? '').split(/\r?\n/);
  const start = lines.findIndex((l) => /^#{1,6}\s+/.test(l) && l.includes(titleFragment));
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^#{1,6}\s+/.test(l) && siblingFragments.some((f) => l.includes(f)));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n');
}

const specFiles = (p) =>
  walk(p).filter((f) => f.startsWith('docs/spec/') && f.endsWith('.md') && !f.includes('/tickets/') && !f.endsWith('index.md'));
const ticketFiles = (p) => walk(p).filter((f) => f.startsWith('docs/spec/tickets/') && f.endsWith('.md'));
const rawRecords = (p) =>
  walk(p).filter((f) => f.startsWith('docs/raw/') && f.endsWith('.md') && !f.endsWith('index.md') && !f.includes('/assets/'));

/** 找到唯一那份 spec；没有或多于一份都让断言自己报。 */
function theSpec(project) {
  const files = specFiles(project);
  if (files.length !== 1) return { file: null, md: null, files };
  return { file: files[0], md: read(join(project, files[0])), files };
}

const ok = (evidence) => ({ passed: true, evidence });
const no = (evidence) => ({ passed: false, evidence });

// ── 断言 ────────────────────────────────────────────────────────────────────

/**
 * @type {Record<string, { text: string, run: (ctx: {project: string, repoRoot: string, before: string[]}) => {passed: boolean, evidence: string} }>}
 */
export const ASSERTIONS = {
  // —— prototype ——————————————————————————————————————————————————

  'prototype-html-in-raw-assets': {
    text: '原型 HTML 落进 raw 桶的 assets/（不是 /tmp，也不是项目根）',
    run: ({ project }) => {
      const hits = walk(project).filter((f) => /^docs\/raw\/[^/]+\/assets\/.+\.html$/.test(f));
      return hits.length ? ok(hits.join(', ')) : no(`docs/raw/*/assets/ 下没有 .html；现有 raw 文件：${walk(project).filter((f) => f.startsWith('docs/raw/')).join(', ') || '（空）'}`);
    },
  },

  'prototype-record-in-raw': {
    text: 'raw 桶里有一份 source_type: prototype 的记录，与 HTML 同桶',
    run: ({ project }) => {
      const recs = rawRecords(project).map((f) => ({ f, fm: frontmatter(read(join(project, f))) }));
      const hit = recs.find((r) => r.fm.source_type === 'prototype');
      if (!hit) return no(`没有 source_type: prototype 的 raw；现有：${recs.map((r) => `${r.f}(${r.fm.source_type ?? '无'})`).join(', ') || '（空）'}`);
      const bucket = hit.f.split('/').slice(0, 3).join('/');
      const html = walk(project).filter((f) => f.startsWith(`${bucket}/assets/`) && f.endsWith('.html'));
      return html.length ? ok(`${hit.f} ↔ ${html.join(', ')}`) : no(`${hit.f} 有，但同桶 assets/ 下没有 HTML`);
    },
  },

  'prototype-question-verbatim': {
    text: '人在页面上看到的那句问题，与裁决记录里写的是同一句（逐字），且在第一个控件之前就读到',
    run: ({ project }) => {
      const html = walk(project).find((f) => /^docs\/raw\/[^/]+\/assets\/.+\.html$/.test(f));
      if (!html) return no('没有原型 HTML');
      const rec = rawRecords(project).find((f) => frontmatter(read(join(project, f))).source_type === 'prototype');
      if (!rec) return no('没有 prototype raw 记录可比');

      // 「顶部」判成「在第一个可操作控件之前」——用什么标签装这句话是执行细节，契约只要求人先读到它。
      const body = read(join(project, html)).replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '');
      const head = body.split(/<(?:button|input|select|textarea)\b/i)[0];
      const lines = head
        .replace(/<[^>]+>/g, '\n')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length >= 10);

      const record = read(join(project, rec));
      const shared = lines.find((l) => record.includes(l));
      if (shared) return ok(`「${shared}」`);
      return no(`第一个控件之前的文字都不在 ${rec} 里：${lines.slice(0, 4).map((l) => `「${l.slice(0, 40)}」`).join(' ') || '（一句都没有）'}`);
    },
  },

  'prototype-verdict-recorded': {
    text: '裁决记下来了，且不是空标题',
    run: ({ project }) => {
      const rec = rawRecords(project).find((f) => frontmatter(read(join(project, f))).source_type === 'prototype');
      if (!rec) return no('没有 prototype raw 记录');
      const body = section(read(join(project, rec)), '裁决');
      if (body === null) return no(`${rec} 里没有「裁决」那一节`);
      return body.trim() ? ok(`${rec}：${body.trim().split('\n')[0].slice(0, 60)}…`) : no(`${rec} 的「裁决」是空的`);
    },
  },

  // —— to-spec ————————————————————————————————————————————————————

  'ui-spec-awaits-freeze': {
    text: '碰 UI 的 spec 落成 status: 等设计冻结（不是「在飞」）',
    run: ({ project }) => {
      const { file, md, files } = theSpec(project);
      if (!file) return no(`docs/spec/ 下不是恰好一份 spec：${files.join(', ') || '（空）'}`);
      const status = frontmatter(md).status;
      return status === '等设计冻结' ? ok(`${file}: ${status}`) : no(`${file} 的 status 是「${status ?? '没写'}」`);
    },
  },

  'spec-points-at-prototype': {
    text: 'spec §4 把结构决策挂在原型证据上（一条指向 raw 的 wikilink）',
    run: ({ project }) => {
      const { file, md } = theSpec(project);
      if (!file) return no('没有唯一的 spec');
      const impl = section(md, '实现决策');
      if (impl === null) return no(`${file} 没有「实现决策」那一节`);
      const links = [...impl.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]);
      const raws = rawRecords(project).map((f) => f.split('/').pop().replace(/\.md$/, ''));
      const hit = links.find((l) => raws.includes(l));
      return hit ? ok(`[[${hit}]]`) : no(`§4 里的 wikilink：${links.join(', ') || '（一条都没有）'}；raw 桶里有：${raws.join(', ') || '（空）'}`);
    },
  },

  'raw-transcript-landed': {
    text: '访谈逐字转录落进了同一个 topic 桶',
    run: ({ project }) => {
      const recs = rawRecords(project).map((f) => ({ f, fm: frontmatter(read(join(project, f))) }));
      const hit = recs.find((r) => r.fm.type === 'raw' && r.fm.source_type && r.fm.source_type !== 'prototype' && r.fm.source_type !== 'design-freeze');
      return hit ? ok(`${hit.f}（source_type: ${hit.fm.source_type}）`) : no(`raw 桶里只有：${recs.map((r) => `${r.f}(${r.fm.source_type ?? '无'})`).join(', ') || '（空）'}`);
    },
  },

  'indexes-refreshed': {
    text: '新落的文件在它那一层的 index.md 里出现了',
    run: ({ project }) => {
      const misses = [];
      for (const [indexPath, files] of [
        ['docs/raw/index.md', rawRecords(project)],
        ['docs/spec/index.md', specFiles(project)],
      ]) {
        const idx = read(join(project, indexPath)) ?? '';
        for (const f of files) {
          const slug = f.split('/').pop().replace(/\.md$/, '');
          if (!idx.includes(slug)) misses.push(`${indexPath} 里没有 ${slug}`);
        }
      }
      return misses.length ? no(misses.join('；')) : ok('raw / spec 两层索引都对得上');
    },
  },

  // —— to-ticket ——————————————————————————————————————————————————

  'unfrozen-ui-ticket-marked-blocked': {
    text: '仍未冻结的 UI ticket，「设计冻结」字段落 ⛔ 未冻结',
    run: ({ project }) => {
      const tickets = ticketFiles(project);
      if (!tickets.length) return no('docs/spec/tickets/ 下一张票都没有');
      const blocked = tickets.filter((f) => read(join(project, f)).includes('⛔'));
      return blocked.length ? ok(`${blocked.length}/${tickets.length} 张落了 ⛔：${blocked.join(', ')}`) : no(`${tickets.length} 张票没有一张带 ⛔`);
    },
  },

  'non-ui-ticket-not-blocked': {
    text: '非 UI 的 ticket 不被这道闸门按住（字段写「不涉及 UI」）',
    run: ({ project }) => {
      const tickets = ticketFiles(project);
      const free = tickets.filter((f) => read(join(project, f)).includes('不涉及 UI'));
      return free.length ? ok(`${free.length} 张写了「不涉及 UI」：${free.join(', ')}`) : no(`${tickets.length} 张票里没有一张是「不涉及 UI」——一份碰 UI 的 spec 切出来的票通常是混的`);
    },
  },

  'tickets-carry-no-frontmatter': {
    text: 'ticket 不带 frontmatter（它是临时凭据，dreaming 按目录扫）',
    run: ({ project }) => {
      const bad = ticketFiles(project).filter((f) => read(join(project, f)).startsWith('---'));
      return bad.length ? no(`带了 frontmatter：${bad.join(', ')}`) : ok(`${ticketFiles(project).length} 张票都没带`);
    },
  },

  // —— uiux-imagine ————————————————————————————————————————————————

  'direction-note-passes-shape-check': {
    text: '写回 spec 的方向说明过 direction-note-check（七节齐全、同级、有序、有正文）',
    run: ({ project }) => {
      const { file, md } = theSpec(project);
      if (!file) return no('没有唯一的 spec');
      const note = section(md, '设计方向');
      if (note === null) return no(`${file} 的 §4 下没有「设计方向」小节`);
      const r = checkDirectionNote(note);
      return r.valid ? ok(`${file} §4 设计方向：七节在 ${'#'.repeat(r.level)} 这一级`) : no(r.errors.join('；'));
    },
  },

  'imagine-leaves-status-untouched': {
    text: '发散不翻状态——spec 仍是「等设计冻结」（翻成在飞是收敛那一段的事）',
    run: ({ project }) => {
      const { file, md } = theSpec(project);
      if (!file) return no('没有唯一的 spec');
      const status = frontmatter(md).status;
      return status === '等设计冻结' ? ok(`${file}: ${status}`) : no(`${file} 的 status 变成了「${status ?? '没写'}」`);
    },
  },

  'imagine-ships-only-the-note': {
    text: '准出物只有那一份方向说明——渲染物、style tile、contact sheet 一个都没留在仓库里',
    run: ({ project, before }) => {
      const added = walk(project).filter((f) => !before.includes(f));
      const stray = added.filter((f) => !specFiles(project).includes(f));
      return stray.length ? no(`多出来的文件：${stray.join(', ')}`) : ok(added.length ? `只动了 ${added.join(', ')}` : '只改了既有的 spec');
    },
  },

  'imagine-keeps-the-language-altitude-shut': {
    text: '语言高度没打开——项目有 DESIGN.md，而这一跑里没有人说过「重探语言」',
    run: ({ project }) => {
      const { md } = theSpec(project);
      const note = section(md, '设计方向');
      const alt = note === null ? null : section(note, '高度记录');
      if (!alt) return no('没有「高度记录」那一节');

      // 只判语言这一档，因为只有它有一条不含判断的法：有 DESIGN.md 就默认关闭，要人**显式**说才开。
      // 结构 / 布局哪一档才是「还没定的最高高度」是这一跑要做的判断本身——那要人对着存档看，
      // 不该由一条正则替他判。「为什么是这几档」的说理留在产物里，这里只守那条法。
      const closed = /不(开|打开)|没(开|打开)|未打开|不重开|保持关闭|默认关闭/;
      const lines = alt.split(/\n/).map((l) => l.trim()).filter(Boolean);
      const mentions = lines.filter((l) => l.includes('语言'));
      if (!mentions.length) return no('「高度记录」里一句都没交代语言高度——这一节欠的正是「语言高度是自动打开还是人显式要求的」');
      const shut = mentions.find((l) => closed.test(l));
      return shut ? ok(`「${shut.slice(0, 90)}」`) : no(`提到语言的行里没有一行说它没打开：${mentions.map((l) => `「${l.slice(0, 50)}」`).join(' ')}`);
    },
  },

  // —— uiux-refine ————————————————————————————————————————————————

  'canvas-lands-in-design-preview': {
    text: '画布落在 design-preview/ 下（落在别处等于把 lint hook 悄悄关掉）',
    run: ({ project }) => {
      const hits = walk(project).filter((f) => /^design-preview\/.*\.html$/.test(f));
      return hits.length ? ok(hits.join(', ')) : no(`design-preview/ 下没有 HTML；项目里的 HTML：${walk(project).filter((f) => f.endsWith('.html')).join(', ') || '（无）'}`);
    },
  },

  'canvas-lint-p0-clean': {
    text: '画布过确定性 lint，P0 清零',
    run: ({ project, pluginRoot }) => {
      const hits = walk(project).filter((f) => /^design-preview\/.*\.html$/.test(f));
      if (!hits.length) return no('没有画布可 lint');
      const out = [];
      for (const f of hits) {
        // design-lint 的 CLI 在有 P0 或 P1 时退出码 2，JSON 仍然从 stdout 出来。
        let stdout;
        try {
          stdout = execFileSync('node', [join(pluginRoot, 'scripts/design-lint.mjs'), join(project, f), '--json'], { encoding: 'utf8' });
        } catch (e) {
          stdout = e.stdout ?? '';
        }
        let findings;
        try {
          findings = JSON.parse(stdout);
        } catch {
          return no(`${f}: design-lint 没吐出可解析的 JSON：${stdout.slice(0, 200)}`);
        }
        const p0 = findings.filter((x) => x.severity === 'P0');
        if (p0.length) return no(`${f} 有 ${p0.length} 条 P0：${[...new Set(p0.map((x) => x.id))].join(', ')}`);
        out.push(`${f}: 0 条 P0（P1 ${findings.filter((x) => x.severity === 'P1').length} / P2 ${findings.filter((x) => x.severity === 'P2').length}）`);
      }
      return ok(out.join('；'));
    },
  },

  'freeze-lands-canvas-and-ledger-in-raw': {
    text: '冻结进 raw 桶：画布 HTML 与 ledger 全文都在，ledger 不留在 /tmp',
    run: ({ project }) => {
      const rec = rawRecords(project).find((f) => frontmatter(read(join(project, f))).source_type === 'design-freeze');
      if (!rec) return no(`没有 source_type: design-freeze 的 raw；现有：${rawRecords(project).join(', ') || '（空）'}`);
      const bucket = rec.split('/').slice(0, 3).join('/');
      const canvas = walk(project).filter((f) => f.startsWith(`${bucket}/assets/`) && f.endsWith('.html'));
      const ledger = sectionUntil(read(join(project, rec)), '打磨轨迹', ['签字']);
      const problems = [];
      if (!canvas.length) return no(`${bucket}/assets/ 下没有画布 HTML`);
      if (ledger === null) problems.push('没有「打磨轨迹」那一节');
      else if (!ledger.trim()) problems.push('「打磨轨迹」是空的——ledger 全文要搬进来');
      return problems.length ? no(problems.join('；')) : ok(`${rec} + ${canvas.join(', ')}，ledger ${ledger.trim().split('\n').filter(Boolean).length} 行`);
    },
  },

  'freeze-lands-matrix-screenshots': {
    text: '验收矩阵每格的截图跟画布同桶（按格名）',
    run: ({ project }) => {
      const rec = rawRecords(project).find((f) => frontmatter(read(join(project, f))).source_type === 'design-freeze');
      if (!rec) return no('没有 design-freeze 记录');
      const bucket = rec.split('/').slice(0, 3).join('/');
      const shots = walk(project).filter((f) => f.startsWith(`${bucket}/assets/`) && /\.(png|jpe?g|webp)$/.test(f));
      return shots.length ? ok(`${shots.length} 张：${shots.map((f) => f.split('/').pop()).join(', ')}`) : no(`${bucket}/assets/ 下一张截图都没有`);
    },
  },

  'freeze-summary-replaces-direction-note': {
    text: '「冻结摘要」取代「设计方向」——不是并排（留着它下游会看到两份真值）',
    run: ({ project }) => {
      const { file, md } = theSpec(project);
      if (!file) return no('没有唯一的 spec');
      const impl = section(md, '实现决策') ?? '';
      const hasFreeze = /冻结摘要/.test(impl);
      const hasNote = section(impl, '设计方向') !== null;
      if (!hasFreeze) return no(`${file} §4 里没有「冻结摘要」`);
      return hasNote ? no(`${file} §4 里「设计方向」和「冻结摘要」并排还在`) : ok(`${file} §4 只剩冻结摘要`);
    },
  },

  'freeze-summary-carries-five-items': {
    text: '冻结摘要固定五样都在（画布指针 / 矩阵 / mismatch 阈值 / ledger 摘要 / 状态矩阵与数据契约变更）',
    run: ({ project }) => {
      const { file, md } = theSpec(project);
      if (!file) return no('没有唯一的 spec');
      const s = section(section(md, '实现决策') ?? '', '冻结摘要');
      if (s === null) return no(`${file} §4 里没有「冻结摘要」小节`);
      const want = [['画布指针', /画布指针|\[\[/], ['矩阵', /矩阵/], ['mismatch 阈值', /mismatch/i], ['ledger 摘要', /ledger/i], ['状态矩阵与数据契约变更', /数据契约/]];
      const missing = want.filter(([, re]) => !re.test(s)).map(([n]) => n);
      return missing.length ? no(`缺：${missing.join(' / ')}`) : ok('五样齐');
    },
  },

  'freeze-flips-spec-to-in-flight': {
    text: '冻结那一刻 spec 翻成「在飞」——这一翻就是闸门本身',
    run: ({ project }) => {
      const { file, md } = theSpec(project);
      if (!file) return no('没有唯一的 spec');
      const status = frontmatter(md).status;
      return status === '在飞' ? ok(`${file}: ${status}`) : no(`${file} 的 status 还是「${status ?? '没写'}」`);
    },
  },

  // —— 仓库静态 ————————————————————————————————————————————————————

  'no-cross-plugin-invocation': {
    text: '全仓无跨 plugin 的 skill 调用——设计侧整个住在 idea-loop 里',
    run: ({ repoRoot }) => {
      const marketplace = JSON.parse(readFileSync(join(repoRoot, '.claude-plugin/marketplace.json'), 'utf8'));
      const RETIRED = ['design', 'design-workflow', 'design-loop'];
      const plugins = [...new Set([...marketplace.plugins.map((p) => p.name), ...RETIRED])];
      const tracked = execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' }).split('\n').filter(Boolean);
      const hits = [];
      for (const file of tracked) {
        const owner = file.split('/')[0];
        // docs/ 是知识库，不是 plugin：raw 与被取代的 spec 里那些历史提法是事实，不许改。
        if (!plugins.includes(owner)) continue;
        // submodule 在 ls-files 里是一个 gitlink 条目，路径指向目录——它的内容是别的仓库的事。
        if (!statSync(join(repoRoot, file)).isFile()) continue;
        const text = readFileSync(join(repoRoot, file), 'utf8');
        for (const other of plugins) {
          if (other === owner) continue;
          const re = new RegExp(`(^|[^\\w/-])${other}:[a-z][a-z0-9-]*`, 'g');
          for (const m of text.matchAll(re)) hits.push(`${file}: ${m[0].trim()}`);
        }
      }
      const scanned = tracked.filter((f) => plugins.includes(f.split('/')[0]) && statSync(join(repoRoot, f)).isFile()).length;
      return hits.length ? no(hits.slice(0, 10).join('；')) : ok(`扫了 ${scanned} 个 plugin 内的文件，零命中`);
    },
  },
};

export const ASSERTION_IDS = Object.keys(ASSERTIONS);

/** 跑一组断言，回 skill-creator grading.json 的 expectations 形状。 */
export function grade(ids, ctx) {
  return ids.map((id) => {
    const a = ASSERTIONS[id];
    if (!a) return { text: `未知断言 ${id}`, passed: false, evidence: 'assert.mjs 里没有这一条' };
    try {
      const r = a.run(ctx);
      return { text: a.text, passed: r.passed, evidence: r.evidence };
    } catch (e) {
      return { text: a.text, passed: false, evidence: `断言自己炸了：${e.message}` };
    }
  });
}
