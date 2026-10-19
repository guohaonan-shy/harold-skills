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
import { dirname, join, relative, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { checkDirectionNote, checkComposition, COMPOSITION } from '../scripts/direction-note-check.mjs';

// ── 小工具 ──────────────────────────────────────────────────────────────────

/**
 * 递归列出目录下全部文件，返回相对 root 的路径（POSIX 分隔符）。
 *
 * `.playwright-mcp/` 是浏览器 MCP 自己往 cwd 里扔的抓取缓存（页面快照、console log），
 * 不是这条环的产物——它跟 `.git` 一样属于工具的痕迹，不进任何一条断言的视野。
 * `.tmp/` 是 skill 自己的中间产物（wiki-conventions §2.1），不算进仓库的产物；
 * 要看它的断言直接按路径去读。
 */
export function walk(root, dir = root, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules' || name === '.playwright-mcp' || name === '.tmp') continue;
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
 * 冻结记录的五节（意图 · 冻结了什么 · 打磨轨迹 · 设计法候选 · 签字）是 skill 定死的闭集，
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

/** spec：docs/spec/<slug>/<slug>.md，一份 spec 一个目录、文件与目录同名（wiki-conventions §2）。 */
const specFiles = (p) =>
  walk(p).filter((f) => {
    const m = f.match(/^docs\/spec\/([^/]+)\/([^/]+)\.md$/);
    return m && m[1] === m[2];
  });
/** 工单：docs/spec/<slug>/tickets/NN-<slug>.md。 */
const ticketFiles = (p) => walk(p).filter((f) => /^docs\/spec\/[^/]+\/tickets\/[^/]+\.md$/.test(f));
/** 画布：docs/design/tmp/<spec-slug>/canvas/ 下直接放的 HTML（assets/ 里的不算）。 */
const designCanvases = (p) => walk(p).filter((f) => /^docs\/design\/tmp\/[^/]+\/canvas\/[^/]+\.html$/.test(f));
/** 冻结记录：docs/design/tmp/<slug>/canvas/<slug>-design.md，frontmatter type: design。 */
const designRecord = (p) =>
  walk(p).find((f) => {
    const m = f.match(/^docs\/design\/tmp\/([^/]+)\/canvas\/([^/]+)-design\.md$/);
    return m && m[1] === m[2] && frontmatter(read(join(p, f))).type === 'design';
  });

const rawRecords = (p) =>
  walk(p).filter((f) => f.startsWith('docs/raw/') && f.endsWith('.md') && !f.endsWith('index.md') && !f.includes('/assets/'));

/** 找到唯一那份 spec；没有或多于一份都让断言自己报。 */
function theSpec(project) {
  const files = specFiles(project);
  if (files.length !== 1) return { file: null, md: null, files };
  return { file: files[0], md: read(join(project, files[0])), files };
}

/** spec 的 slug = 文件名。 */
const slugOf = (specFile) => specFile.split('/').pop().replace(/\.md$/, '');

/** 方向说明住在 docs/design/tmp/<spec-slug>/imagine/（发散交给收敛的中间产物，本地、不进 git、不进 spec）。 */
function theNote(project) {
  const { file } = theSpec(project);
  if (!file) return { path: null, md: null };
  const path = `docs/design/tmp/${slugOf(file)}/imagine/direction-note.md`;
  const full = join(project, path);
  return { path, md: existsSync(full) ? readFileSync(full, 'utf8') : null };
}

const ok = (evidence) => ({ passed: true, evidence });
const no = (evidence) => ({ passed: false, evidence });

// ── 会话摘要的小工具（session.mjs 压出来的那份；没有会话记录时断言明说，不猜）──────────

const NO_SESSION = '没有会话记录（run.stream.jsonl / session.json）——这一跑是旧版 runner 跑的，只留了最终文字；重跑这一格才有';
const sessionEvents = (session) => session?.events ?? [];
const toolUses = (session) => sessionEvents(session).filter((e) => e.kind === 'tool_use');
const isAgentCall = (e) => /^(Agent|Task)$/.test(e.name);
const startsImaginer = (e) => isAgentCall(e) && /uiux-imaginer/.test(String(e.input?.subagent_type ?? ''));

/** 子代理交回会话的那段文字：Agent / SendMessage 的 tool_result，且是会话自己收到的（不是子代理之间的）。 */
function handbacks(session) {
  const nameById = new Map(toolUses(session).map((e) => [e.id, e.name]));
  return sessionEvents(session).filter(
    (e) => e.kind === 'tool_result' && !e.sub && /^(Agent|Task|SendMessage)$/.test(nameById.get(e.toolUseId) ?? ''),
  );
}

/** 编排者不该亲手做的事：写变种板与渲染物、截图、调 Refero。返回原因，没有就是 null。 */
function orchestratorForbidden(c) {
  const input = c.input ?? {};
  const path = String(input.file_path ?? input.notebook_path ?? input.path ?? '');
  const cmd = String(input.command ?? '');
  if (/refero/i.test(c.name)) return 'Refero 调用';
  if (/screenshot/i.test(c.name)) return '截图';
  if (c.name === 'computer' && /screenshot/i.test(JSON.stringify(input))) return '截图';
  if (c.name === 'Bash' && /screenshot|screencapture/i.test(cmd)) return '截图';
  if (/^(Write|Edit|MultiEdit|NotebookEdit)$/.test(c.name) && /(^|\/)board\.html$|docs\/design\/tmp\/[^/]+\/imagine\/(assets|research|handoff)\//.test(path)) return `写变种板或渲染物（${path}）`;
  if (c.name === 'Bash' && (/(>>?|\btee\b(\s+-a)?)\s*\S*board\.html/.test(cmd) || /\b(cp|mv|install)\b[^|;&\n]*\bboard\.html\b/.test(cmd) || /\bsed\s+-i[^|;&\n]*board\.html/.test(cmd))) return '写变种板';
  return null;
}

// ── 每轮记录 rounds.md ────────────────────────────────────────────────────────

/** 一份 rounds.md 的正文 → Map<轮号, 该轮正文>。同一轮出现两次（整份重写）以后写的为准。 */
function parseRounds(text) {
  const out = new Map();
  if (!text) return out;
  const marks = [...text.matchAll(/^#{2,3}\s*第\s*(\d+)\s*轮[^\n]*$/gm)];
  marks.forEach((m, i) => out.set(Number(m[1]), text.slice(m.index + m[0].length, i + 1 < marks.length ? marks[i + 1].index : text.length).trim()));
  return out;
}

/** 一轮正文拆成「人说了什么」与「交回原文」两半。 */
function splitRound(body) {
  const i = body.indexOf('**交回原文**');
  return i < 0 ? { said: body, handback: '' } : { said: body.slice(0, i), handback: body.slice(i) };
}

/**
 * 取每轮记录。文件在就读文件；imagine 收工会把它连同渲染物一起删（所以整条 skill 的那一格读不到文件），
 * 这时从事件流里重建——uiux-imaginer 每一轮追加它的那几次写入，入参里就是那一节的全文。
 */
function roundsRecord({ project, session }) {
  const { file } = theSpec(project);
  if (!file) return { source: null, text: null, why: '没有唯一的 spec' };
  const path = join(project, `docs/design/tmp/${slugOf(file)}/imagine/rounds.md`);
  if (existsSync(path)) return { source: 'rounds.md', text: readFileSync(path, 'utf8') };
  if (!session) return { source: null, text: null, why: `rounds.md 已被收工清掉，而且${NO_SESSION}` };
  const pieces = toolUses(session)
    .filter((e) => e.sub && JSON.stringify(e.input ?? {}).includes('rounds.md'))
    .map((e) => String(e.input.content ?? e.input.new_string ?? e.input.command ?? ''));
  if (!pieces.length) return { source: null, text: null, why: 'rounds.md 已被收工清掉，事件流里也没有子代理写它的调用' };
  return { source: '事件流（rounds.md 已被收工清掉）', text: pieces.join('\n') };
}

// ── 交接画布 ──────────────────────────────────────────────────────────────────

const isLocalRef = (u) => u && !/^(https?:|data:|mailto:|tel:|javascript:|#|\?|\/\/)/i.test(u);

/** 一份 HTML 或 CSS 里会去取别的文件的引用：src / poster / <link href> / url() / @import。 */
function assetRefs(text, isCss) {
  const out = [];
  if (!isCss) {
    for (const m of text.matchAll(/\b(?:src|poster)\s*=\s*["']([^"']+)["']/gi)) out.push(m[1]);
    for (const m of text.matchAll(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)) out.push(m[1]);
  }
  for (const m of text.matchAll(/url\(\s*["']?([^"')]+?)["']?\s*\)/gi)) out.push(m[1]);
  for (const m of text.matchAll(/@import\s+["']([^"']+)["']/gi)) out.push(m[1]);
  return out;
}

/**
 * 交接画布「自包含、能打开、能切状态」的静态检查。不开浏览器——断言只判形状：
 * 入口在、引用的素材都在且是相对路径、没有对比页的残留（board.html / ?variant= 切换）、
 * 读 ?state=、有真的 prefers-reduced-motion 媒体查询。
 */
function checkHandoff(project) {
  const { file } = theSpec(project);
  if (!file) return { problems: ['没有唯一的 spec'], info: '' };
  const rel = `docs/design/tmp/${slugOf(file)}/imagine/handoff`;
  const dir = join(project, rel);
  const index = join(dir, 'index.html');
  if (!existsSync(index)) return { problems: [`${rel}/index.html 不存在`], info: '' };

  const problems = [];
  const seen = new Set();
  const queue = [{ path: index, css: false }];
  let checked = 0;
  let allText = '';
  while (queue.length) {
    const { path, css } = queue.shift();
    if (seen.has(path)) continue;
    seen.add(path);
    const text = readFileSync(path, 'utf8');
    allText += `\n${text}`;
    for (const raw of assetRefs(text, css)) {
      if (/^https?:/i.test(raw)) {
        problems.push(`${relative(dir, path)} 引用了外部地址 ${raw.slice(0, 60)}——交接画布要自包含`);
        continue;
      }
      if (!isLocalRef(raw)) continue;
      const clean = raw.split(/[?#]/)[0];
      if (!clean) continue;
      if (clean.startsWith('/')) {
        problems.push(`${relative(dir, path)} 用了绝对路径 ${clean}`);
        continue;
      }
      const target = join(dirname(path), clean);
      checked += 1;
      if (!existsSync(target)) problems.push(`${relative(dir, path)} 引用的 ${clean} 不存在（会 404）`);
      else if (/\.css$/i.test(clean)) queue.push({ path: target, css: true });
    }
  }
  if (/board\.html/.test(allText)) problems.push('页面里还有 board.html 的引用——对比页外壳没去干净');
  if (/get\(\s*['"]variant['"]\s*\)|[?&]variant=/.test(allText)) problems.push('页面里还有 ?variant= 的切换——别的变种没去干净');
  if (/127\.0\.0\.1|localhost/.test(allText)) problems.push('页面里写死了本地服务地址');
  if (!/['"]state['"]|[?&]state=/.test(allText)) problems.push('页面不读 ?state=，状态切不了');
  if (!/@media[^{]*prefers-reduced-motion/.test(allText)) problems.push('没有真的 prefers-reduced-motion 媒体查询（顶部「预览减弱动效」开关应换成它）');
  const files = walk(dir).length;
  return { problems, info: `${rel}/ 共 ${files} 个文件，${checked} 个相对引用都在；读 ?state=；有 prefers-reduced-motion；无 board.html / ?variant= 残留` };
}

/** 构成清单每项：{ item, mark }，只扫「变种裁决」那一节。 */
function compositionLines(note) {
  const verdict = section(note, '变种裁决') ?? '';
  const out = [];
  for (const item of COMPOSITION) {
    for (const l of verdict.split(/\r?\n/)) {
      if (!new RegExp(`^\\s*(?:[-*]\\s+)?${item}\\s*[:：]\\s*\\S`).test(l)) continue;
      out.push({ item, line: l.trim(), mark: l.trimEnd().match(/（([^（）]*)）$/)?.[1] ?? null });
    }
  }
  return { verdict, items: out };
}

/** 种子画布里的 data-anchor 名字（refine 的起始画布从它来，名字是契约，不随构图调整改）。 */
const anchorsOf = (html) => new Set([...String(html ?? '').matchAll(/data-anchor\s*=\s*["']([^"']+)["']/g)].map((m) => m[1]));

/** 脚本化的人在整条 imagine 那一格里说的话，各取一个别处不会出现的片段。 */
const IMAGINE_SCRIPTED = [
  ['这几个方向'], ['趋势那个不行'], ['收在一起那个对'], ['间距看着有点散'], ['pill 别做得'], ['一行放不下'], ['重试按钮不要用主色'],
];

/** 方向定下之前的四条执行层话：（待打磨清单里的关键词，那句话的片段）。 */
const EXEC_REMARKS = [
  { key: '间距', said: '间距看着有点散' },
  { key: 'pill', said: 'pill 别做得' },
  { key: '折叠', said: '一行放不下' },
  { key: '重试', said: '重试按钮不要用主色' },
];

/** designer 写的每轮评分 JSON：Write 的入参，或 Bash 里 heredoc 出来的那一份。 */
function roundJsons(session) {
  const out = [];
  for (const e of toolUses(session)) {
    if (!e.sub) continue;
    const input = e.input ?? {};
    let name = null;
    let body = null;
    if (e.name === 'Write' && /round-\d+\.json$/.test(String(input.file_path ?? ''))) {
      name = String(input.file_path).split('/').pop();
      body = String(input.content ?? '');
    } else if (e.name === 'Bash' && /round-\d+\.json/.test(String(input.command ?? ''))) {
      const cmd = String(input.command);
      name = cmd.match(/round-\d+\.json/)[0];
      body = cmd.slice(cmd.indexOf('{'), cmd.lastIndexOf('}') + 1);
    }
    if (!name) continue;
    try {
      out.push({ name, json: JSON.parse(body) });
    } catch {
      /* 不是整份 JSON（比如只改了一行的 Edit）就不当证据 */
    }
  }
  return out;
}

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

  'spec-has-technical-overview': {
    text: 'spec 有「技术方案总览」，后端 / 前端内部 / 前端交互三小节都在且有正文（不涉及写「不涉及」）；碰 UI 的前端交互标着待补图',
    run: ({ project }) => {
      const { file, md } = theSpec(project);
      if (!file) return no('没有唯一的 spec');
      const overview = section(md, '技术方案总览');
      if (overview === null) return no(`${file} 没有「技术方案总览」`);
      const empty = ['后端', '前端内部', '前端交互'].filter((t) => !(section(overview, t) ?? '').trim());
      if (empty.length) return no(`缺或空：${empty.join(' / ')}`);
      const ui = section(overview, '前端交互');
      return /待补图/.test(ui) ? ok('三小节齐，前端交互标了待补图') : no('前端交互没标「待补图」——设计还没冻结，图要等 refine 补');
    },
  },

  'grill-spec-lands-in-review': {
    text: 'grill 来的 spec 落进自己的目录，status: 审核中（不是「在飞」，也不直接翻「设计中」——要先人审）',
    run: ({ project }) => {
      const { file, md, files } = theSpec(project);
      if (!file) return no(`docs/spec/<slug>/<slug>.md 不是恰好一份：${files.join(', ') || '（空）'}`);
      const status = frontmatter(md).status;
      return status === '审核中' ? ok(`${file}: ${status}`) : no(`${file} 的 status 是「${status ?? '没写'}」`);
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

  'unfrozen-spec-cuts-no-tickets': {
    text: '设计还没冻结的「设计中」spec，人说了同意也一张票都不切',
    run: ({ project }) => {
      const tickets = ticketFiles(project);
      return tickets.length ? no(`切出了 ${tickets.length} 张：${tickets.join(', ')}`) : ok('一张票都没切');
    },
  },

  'unfrozen-spec-status-untouched': {
    text: '没切票就不翻状态——spec 仍是「设计中」',
    run: ({ project }) => {
      const { file, md } = theSpec(project);
      if (!file) return no('没有唯一的 spec');
      const status = frontmatter(md).status;
      return status === '设计中' ? ok(`${file}: ${status}`) : no(`${file} 的 status 变成了「${status ?? '没写'}」`);
    },
  },

  // —— uiux-imagine ————————————————————————————————————————————————

  'direction-note-passes-shape-check': {
    text: 'docs/design/tmp/<spec-slug>/imagine/ 下的方向说明过 direction-note-check（七节齐全、同级、有序、有正文，选中变种带完整构成清单）',
    run: ({ project }) => {
      const { path, md } = theNote(project);
      if (!path) return no('没有唯一的 spec');
      if (md === null) return no(`${path} 不存在`);
      const r = checkDirectionNote(md);
      return r.valid ? ok(`${path}：七节在 ${'#'.repeat(r.level)} 这一级，构成清单齐`) : no(r.errors.join('；'));
    },
  },

  'imagine-leaves-spec-untouched': {
    text: '发散不改 spec——方向说明是交给收敛的中间产物，不写进 spec（也就不会出现 spec 里留着旧一轮的情况）',
    run: ({ project }) => {
      const { file, md } = theSpec(project);
      if (!file) return no('没有唯一的 spec');
      return section(md, '设计方向') === null ? ok(`${file} 里没有「设计方向」小节`) : no(`${file} 里多了「设计方向」小节`);
    },
  },

  'imagine-leaves-status-untouched': {
    text: '发散不翻状态——spec 仍是「设计中」（翻成在飞是 to-ticket 切完工单时的事）',
    run: ({ project }) => {
      const { file, md } = theSpec(project);
      if (!file) return no('没有唯一的 spec');
      const status = frontmatter(md).status;
      return status === '设计中' ? ok(`${file}: ${status}`) : no(`${file} 的 status 变成了「${status ?? '没写'}」`);
    },
  },

  'imagine-ships-note-and-handoff': {
    text: '准出物只有方向说明与交接画布——仓库里除了 docs/design/tmp/<spec-slug>/imagine/ 下的 direction-note.md 与 handoff/ 没多出文件，imagine/ 里对比页、落选变种与抓取物清掉了，只剩 direction-note.md 与 handoff/',
    run: ({ project, before }) => {
      const { file } = theSpec(project);
      if (!file) return no('没有唯一的 spec');
      const work = `docs/design/tmp/${slugOf(file)}/imagine`;
      const added = walk(project).filter((f) => !before.includes(f));
      const shipped = (f) => f === `${work}/direction-note.md` || f.startsWith(`${work}/handoff/`);
      const stray = added.filter((f) => !specFiles(project).includes(f) && !shipped(f));
      if (stray.length) return no(`多出来的文件：${stray.join(', ')}`);
      const all = walk(join(project, work));
      if (!all.includes('direction-note.md')) return no(`${work}/ 里没有 direction-note.md`);
      if (!all.includes('handoff/index.html')) return no(`${work}/handoff/index.html 不在——交接画布是 refine 的起点，没有它 refine 只能从文字重建`);
      const left = all.filter((f) => f !== 'direction-note.md' && !f.startsWith('handoff/'));
      return left.length ? no(`${work}/ 里渲染物没清：${left.join(', ')}`) : ok(`仓库没多文件；${work}/ 只剩方向说明与 handoff/（${all.filter((f) => f.startsWith('handoff/')).length} 个文件）`);
    },
  },

  'imagine-keeps-the-language-altitude-shut': {
    text: '语言高度没打开——项目有 DESIGN.md，而这一跑里没有人说过「重探语言」',
    run: ({ project }) => {
      const { md: note } = theNote(project);
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

  'session-only-orchestrates': {
    text: '调用会话只编排——它自己的工具调用里没有写变种板、截图、Refero 调用（子代理的不计），而且起过 uiux-imaginer',
    run: ({ session }) => {
      if (!session) return no(NO_SESSION);
      const all = toolUses(session);
      const own = all.filter((e) => !e.sub);
      const bad = own.map((c) => [c, orchestratorForbidden(c)]).filter(([, why]) => why);
      const starts = own.filter(startsImaginer);
      const sends = own.filter((c) => c.name === 'SendMessage');
      const problems = [];
      if (!starts.length) problems.push('会话没有起过 idea-loop:uiux-imaginer（自己的 Agent 调用里 subagent_type 没有它）');
      if (bad.length) problems.push(`会话自己做了不该做的：${bad.slice(0, 5).map(([c, why]) => `${c.name}→${why}`).join('；')}${bad.length > 5 ? `…共 ${bad.length} 条` : ''}`);
      return problems.length
        ? no(problems.join('；'))
        : ok(`会话自己 ${own.length} 次工具调用（子代理的 ${all.length - own.length} 次不计）：起 uiux-imaginer ${starts.length} 次、SendMessage ${sends.length} 次；零次写变种板、截图、Refero`);
    },
  },

  'imagine-rounds-recorded': {
    text: '每轮交回都追加进了每轮记录：轮号 1..K 连续、至少四轮，脚本化的人的七条反应都逐字落在记录里',
    run: (ctx) => {
      const rec = roundsRecord(ctx);
      if (rec.text === null) return no(rec.why);
      const rounds = parseRounds(rec.text);
      const nums = [...rounds.keys()].sort((a, b) => a - b);
      if (!nums.length) return no(`${rec.source} 里一个「## 第 N 轮」都没有`);
      const problems = [];
      if (nums.some((n, i) => n !== i + 1)) problems.push(`轮号不是从 1 连续到 ${nums.length}：${nums.join(',')}`);
      if (nums.length < 4) problems.push(`只有 ${nums.length} 轮；一次调用加三条方向性反应至少四轮`);
      const all = [...rounds.values()].join('\n');
      const lost = IMAGINE_SCRIPTED.filter(([frag]) => !all.includes(frag)).map(([f]) => `「${f}」`);
      if (lost.length) problems.push(`人的话没落进记录：${lost.join(' ')}`);
      return problems.length ? no(`${rec.source}：${problems.join('；')}`) : ok(`${rec.source}：${nums.length} 轮（1..${nums.length}），七条反应都在`);
    },
  },

  'composition-items-carry-provenance': {
    text: '选中变种的构成清单每项行末都带来源标记（人选定 / 模型代填），且不是全标一种——至少有一项是人选定的',
    run: ({ project }) => {
      const { path, md } = theNote(project);
      if (!path) return no('没有唯一的 spec');
      if (md === null) return no(`${path} 不存在`);
      const { verdict, items } = compositionLines(md);
      const errors = checkComposition(verdict);
      if (errors.length) return no(errors.join('；'));
      const human = items.filter((x) => x.mark === '人选定');
      const model = items.filter((x) => x.mark === '模型代填');
      if (!human.length) return no(`${items.length} 项都标了来源，但没有一项是人选定的——人在变种之间选过，至少「容器形状」这类应是人选定`);
      return ok(`${items.length} 项：${human.length} 人选定（${human.map((x) => x.item).join('/')}）/ ${model.length} 模型代填`);
    },
  },

  'imagine-parks-execution-remarks': {
    text: '方向没定前脚本化的人的第 4–7 条（间距、pill、折叠截断、重试按钮）进了方向说明的待打磨清单，对应那几轮的交回说的是「记进待打磨」而不是「已改在」',
    run: (ctx) => {
      const { path, md } = theNote(ctx.project);
      if (!path) return no('没有唯一的 spec');
      if (md === null) return no(`${path} 不存在`);
      const list = section(md, '待打磨清单') ?? '';
      const missing = EXEC_REMARKS.filter((r) => !new RegExp(r.key, 'i').test(list)).map((r) => r.key);
      if (missing.length) return no(`待打磨清单里找不到：${missing.join(' / ')}`);
      const rec = roundsRecord(ctx);
      if (rec.text === null) return no(`清单里四条都在，但读不到记录来核对「变种板没改」：${rec.why}`);
      const rounds = [...parseRounds(rec.text).entries()].map(([n, body]) => ({ n, ...splitRound(body) }));
      const bad = [];
      for (const r of EXEC_REMARKS) {
        const hit = rounds.find((x) => x.said.includes(r.said));
        if (!hit) bad.push(`${r.key}：记录里找不到这句话的那一轮`);
        else if (/已改在/.test(hit.handback)) bad.push(`${r.key}：第 ${hit.n} 轮交回说「已改在」——方向没定，不该当场改`);
        else if (!/待打磨/.test(hit.handback)) bad.push(`${r.key}：第 ${hit.n} 轮交回没说记进待打磨`);
      }
      return bad.length ? no(bad.join('；')) : ok('待打磨清单里四条都在；四句话所在的轮次，交回都说记进待打磨、没有「已改在」');
    },
  },

  'imagine-orchestrator-verified-before-clear': {
    text: '收工：编排者自己核对（跑方向说明校验）之后才放 uiux-imaginer 结束——会话里最后一次校验在最后一次 SendMessage 之前',
    run: ({ session }) => {
      if (!session) return no(NO_SESSION);
      const own = toolUses(session).filter((e) => !e.sub);
      const checks = own.filter((c) => c.name === 'Bash' && /direction-note-check/.test(String(c.input?.command ?? '')));
      const sends = own.filter((c) => c.name === 'SendMessage');
      if (!checks.length) return no('会话自己一次都没跑过 direction-note-check——收工的核对是编排者的活，不能只信 uiux-imaginer 说它过了');
      if (!sends.length) return no('会话一次 SendMessage 都没发过，转不了人的意见，也放不了 uiux-imaginer 结束');
      const lastCheck = Math.max(...checks.map((c) => c.seq));
      const lastSend = Math.max(...sends.map((c) => c.seq));
      return lastCheck < lastSend
        ? ok(`会话自己跑了 ${checks.length} 次校验（最后一次 #${lastCheck}），之后才发出最后一条 SendMessage（#${lastSend}）`)
        : no(`最后一次校验（#${lastCheck}）在最后一条 SendMessage（#${lastSend}）之后——核对放在了放它结束之后`);
    },
  },

  'handoff-canvas-is-standalone': {
    text: '交接画布能单独打开：入口在、素材都是相对路径且都在、读 ?state=、有真的 prefers-reduced-motion，没有 board.html 与 ?variant= 的残留',
    run: ({ project }) => {
      const r = checkHandoff(project);
      return r.problems.length ? no(r.problems.join('；')) : ok(r.info);
    },
  },

  // —— uiux-imaginer 直跑 ——————————————————————————————————————————————

  'imaginer-run-bypasses-the-skill': {
    text: '这一格不经过 uiux-imagine skill——会话没有调过它',
    run: ({ session }) => {
      if (!session) return no(NO_SESSION);
      const hit = toolUses(session).filter((e) => !e.sub && e.name === 'Skill' && /uiux-imagine/.test(JSON.stringify(e.input ?? {})));
      return hit.length ? no(`会话调了 ${hit.length} 次 uiux-imagine skill`) : ok('会话没调 skill，直接起的 agent');
    },
  },

  'imaginer-continues-from-records': {
    text: '它接着做第三轮，不重做第一、二轮——每轮记录里前两轮原样没动、第 1 轮只出现一次、新增了第 3 轮；变种板还在且保留着选中的 B',
    run: ({ project, pluginRoot }) => {
      const { file } = theSpec(project);
      if (!file) return no('没有唯一的 spec');
      const dir = `docs/design/tmp/${slugOf(file)}/imagine`;
      const text = read(join(project, dir, 'rounds.md'));
      if (text === null) return no(`${dir}/rounds.md 不在`);
      const seedRounds = parseRounds(read(join(pluginRoot, 'evals/case/stages/imaginer-resume/rounds.md')));
      const now = parseRounds(text);
      const problems = [];
      for (const [n, body] of seedRounds) {
        if (!now.has(n)) problems.push(`第 ${n} 轮的记录没了`);
        else if (now.get(n) !== body) problems.push(`第 ${n} 轮的记录被改动了——这是上一个 agent 留下的恢复点，只追加不重写`);
      }
      const ones = (text.match(/^#{2,3}\s*第\s*1\s*轮/gm) ?? []).length;
      if (ones > 1) problems.push(`「第 1 轮」出现了 ${ones} 次——重来了一遍`);
      const added = [...now.keys()].filter((n) => !seedRounds.has(n)).sort((a, b) => a - b);
      if (!added.includes(3)) problems.push(`没有新增第 3 轮；新增的轮号：${added.join(',') || '（无）'}`);
      const board = read(join(project, dir, 'board.html'));
      if (board === null) problems.push('变种板 board.html 不在（收工之前不该清）');
      else if (!board.includes('最近一次展开')) problems.push('变种板里找不到选中的 B（「最近一次展开」）');
      return problems.length ? no(problems.join('；')) : ok(`第 ${[...seedRounds.keys()].join('、')} 轮逐字未动，新增第 ${added.join('、')} 轮；变种板还在、B 还在`);
    },
  },

  'imaginer-handback-carries-agreed-items': {
    text: '它交回的一轮带齐约定的几项：板地址与 ?variant= 参数、每个变种赌什么、本轮改动、七节进度、要人回的那句话、要人判的取舍（或明写没有）',
    run: ({ project, pluginRoot }) => {
      const { file } = theSpec(project);
      if (!file) return no('没有唯一的 spec');
      const text = read(join(project, `docs/design/tmp/${slugOf(file)}/imagine/rounds.md`));
      if (text === null) return no('rounds.md 不在');
      const seed = parseRounds(read(join(pluginRoot, 'evals/case/stages/imaginer-resume/rounds.md')));
      const rounds = parseRounds(text);
      const first = [...rounds.keys()].filter((n) => !seed.has(n)).sort((a, b) => a - b)[0];
      if (first === undefined) return no('没有新增的一轮');
      const hb = splitRound(rounds.get(first)).handback;
      if (!hb) return no(`第 ${first} 轮没有「交回原文」`);
      const want = [
        ['板地址与 ?variant=', /board\.html/.test(hb) && /variant=/.test(hb)],
        ['每个变种赌什么', /赌/.test(hb)],
        ['本轮改动', /本轮改动/.test(hb)],
        ['七节进度', /七节/.test(hb)],
        ['要人回的那句话', /要人回/.test(hb)],
        ['要人判的取舍', /取舍|没有要人判的/.test(hb)],
      ];
      const missing = want.filter(([, hit]) => !hit).map(([n]) => n);
      return missing.length ? no(`第 ${first} 轮的交回缺：${missing.join(' / ')}`) : ok(`第 ${first} 轮的交回六项都在（${hb.length} 字）`);
    },
  },

  'imaginer-applies-in-place-after-pick': {
    text: '人点名留下 B 之后说「这个直接改在 B 上给我看」：改在选中的那一版上、交回说「已改在 B」，构成清单里「颜色」一项记成人选定，也没有再塞进待打磨清单',
    run: ({ project, pluginRoot }) => {
      const { file } = theSpec(project);
      if (!file) return no('没有唯一的 spec');
      const dir = `docs/design/tmp/${slugOf(file)}/imagine`;
      const problems = [];
      const text = read(join(project, dir, 'rounds.md'));
      const seed = parseRounds(read(join(pluginRoot, 'evals/case/stages/imaginer-resume/rounds.md')));
      const round3 = text === null ? null : [...parseRounds(text).entries()].filter(([n]) => !seed.has(n)).sort((a, b) => a[0] - b[0])[0];
      if (!round3) problems.push('每轮记录里没有新增的一轮');
      else if (!/已改在[^\n]*B/.test(splitRound(round3[1]).handback)) problems.push(`第 ${round3[0]} 轮的交回里没有「已改在 B 上：…」那一行`);
      const { path, md } = theNote(project);
      let colorLine = '';
      if (md === null) problems.push(`${path ?? '方向说明'} 不存在`);
      else {
        const color = compositionLines(md).items.find((x) => x.item === '颜色');
        if (!color) problems.push('构成清单里没有「颜色」一项');
        else {
          colorLine = color.line;
          if (!/重试/.test(color.line)) problems.push(`「颜色」一项没提重试按钮：${color.line.slice(0, 60)}`);
          else if (color.mark !== '人选定') problems.push(`「颜色」一项记成了（${color.mark ?? '无标记'}），应是（人选定）`);
        }
        if (/重试按钮/.test(section(md, '待打磨清单') ?? '')) problems.push('重试按钮又被塞进了待打磨清单——人明说要看，已经改了，不该再停进清单');
      }
      return problems.length ? no(problems.join('；')) : ok(`第 ${round3[0]} 轮交回说已改在 B 上；构成清单「颜色」：${colorLine.slice(0, 70)}`);
    },
  },

  // —— uiux-refine ————————————————————————————————————————————————

  'canvas-lands-in-docs-design': {
    text: '画布落在 docs/design/tmp/<spec-slug>/canvas/ 下（落在别处等于把 lint hook 悄悄关掉，冻结后也找不到真值）',
    run: ({ project }) => {
      const hits = designCanvases(project);
      return hits.length ? ok(hits.join(', ')) : no(`docs/design/tmp/<spec-slug>/canvas/ 下没有 HTML；项目里的 HTML：${walk(project).filter((f) => f.endsWith('.html')).join(', ') || '（无）'}`);
    },
  },

  'canvas-lint-p0-clean': {
    text: '画布过确定性 lint，P0 清零',
    run: ({ project, pluginRoot }) => {
      const hits = designCanvases(project);
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

  'freeze-lands-canvas-and-ledger-in-docs-design': {
    text: '冻结在 docs/design/tmp/<spec-slug>/canvas/ 原地落齐：画布 HTML 与 <spec-slug>-design.md（ledger 全文）同目录，ledger 不留在 work/ 里',
    run: ({ project }) => {
      const rec = designRecord(project);
      if (!rec) return no(`没有 docs/design/tmp/<spec-slug>/canvas/<spec-slug>-design.md（type: design）；docs/design 下现有：${walk(project).filter((f) => f.startsWith('docs/design/')).join(', ') || '（空）'}`);
      const bucket = dirname(rec);
      const canvas = designCanvases(project).filter((f) => f.startsWith(`${bucket}/`));
      const ledger = sectionUntil(read(join(project, rec)), '打磨轨迹', ['设计法候选', '签字']);
      const problems = [];
      if (!canvas.length) return no(`${bucket}/ 下没有画布 HTML`);
      if (ledger === null) problems.push('没有「打磨轨迹」那一节');
      else if (!ledger.trim()) problems.push('「打磨轨迹」是空的——ledger 全文要搬进来');
      return problems.length ? no(problems.join('；')) : ok(`${rec} + ${canvas.join(', ')}，ledger ${ledger.trim().split('\n').filter(Boolean).length} 行`);
    },
  },

  'freeze-lands-matrix-screenshots': {
    text: '验收矩阵每格的截图跟画布同目录的 assets/（按格名）',
    run: ({ project }) => {
      const rec = designRecord(project);
      if (!rec) return no('没有 docs/design 冻结记录');
      const bucket = dirname(rec);
      const shots = walk(project).filter((f) => f.startsWith(`${bucket}/assets/`) && /\.(png|jpe?g|webp)$/.test(f));
      return shots.length ? ok(`${shots.length} 张：${shots.map((f) => f.split('/').pop()).join(', ')}`) : no(`${bucket}/assets/ 下一张截图都没有`);
    },
  },

  'freeze-summary-lands-in-spec': {
    text: '冻结摘要写进 spec §4，且 spec 里没有「设计方向」与它并排（并排下游会看到两份真值）',
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

  'freeze-writes-interaction-flows': {
    text: 'spec §5 的前端交互换成了交互图：图在 docs/design/tmp/<spec-slug>/canvas/flows/（文件名 flow-<n>-<page>--<state>.png），「待补图」标记已去掉',
    run: ({ project }) => {
      const { file, md } = theSpec(project);
      if (!file) return no('没有唯一的 spec');
      const ui = section(md, '前端交互');
      if (ui === null) return no(`${file} 没有「前端交互」小节`);
      if (/待补图/.test(ui)) return no(`${file} 前端交互还标着「待补图」`);
      const imgs = [...ui.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]);
      const flows = imgs.filter((i) => /docs\/design\/tmp\/[^/]+\/canvas\/flows\/flow-\d+-[^/]+--[^/]+\.png$/.test(join(dirname(file), i).split(sep).join('/')));
      if (!flows.length) return no(`前端交互里没有指向 docs/design/tmp/<slug>/canvas/flows/flow-<n>-<page>--<state>.png 的图：${imgs.join(', ') || '（一张图都没有）'}`);
      const missing = flows.filter((i) => !existsSync(join(project, dirname(file), i)));
      return missing.length ? no(`图链接指向不存在的文件：${missing.join(', ')}`) : ok(`${flows.length} 张：${flows.map((f) => f.split('/').pop()).join(', ')}`);
    },
  },

  'freeze-clears-tmp': {
    text: '冻结后 docs/design/tmp/<spec-slug>/imagine/ 与 canvas/work/ 都清掉了（方向说明与打磨临时件随冻结结束；canvas/ 其余保留到归档）',
    run: ({ project }) => {
      const { file } = theSpec(project);
      if (!file) return no('没有唯一的 spec');
      const slug = slugOf(file);
      const left = [`docs/design/tmp/${slug}/imagine`, `docs/design/tmp/${slug}/canvas/work`].filter((d) => existsSync(join(project, d)));
      return left.length ? no(`还在：${left.join(', ')}`) : ok('两个都清了');
    },
  },

  'freeze-writes-delta': {
    text: '冻结同时写了 docs/design/tmp/<spec-slug>/delta/：至少一个状态文件，且叠到档案上过 design-archive-check（不查 usedBy）；冻结记录里有「设计法候选」一节',
    run: ({ project, pluginRoot }) => {
      const { file } = theSpec(project);
      if (!file) return no('没有唯一的 spec');
      const slug = slugOf(file);
      const states = walk(project).filter((f) => f.startsWith(`docs/design/tmp/${slug}/delta/`) && f.endsWith('.md') && frontmatter(read(join(project, f))).type === 'design-state');
      if (!states.length) return no(`docs/design/tmp/${slug}/delta/ 下没有 type: design-state 的文件`);
      const rec = designRecord(project);
      if (!rec) return no('没有冻结记录');
      if (section(read(join(project, rec)), '设计法候选') === null) return no(`${rec} 里没有「设计法候选」一节`);
      let out = '';
      let status = 0;
      try {
        out = execFileSync('node', [join(pluginRoot, 'scripts/design-archive-check.mjs'), project, '--delta', slug, '--no-used-by', '--json'], { encoding: 'utf8' });
      } catch (e) {
        out = e.stdout ?? '';
        status = e.status ?? 1;
      }
      let report;
      try {
        report = JSON.parse(out);
      } catch {
        return no(`design-archive-check 没吐出可解析的 JSON（退出码 ${status}）：${out.slice(0, 200)}`);
      }
      return report.ok ? ok(`${states.length} 个状态文件；${report.objects} 个对象过校验`) : no(`${report.violations.length} 条违规：${report.violations.slice(0, 3).map((v) => `${v.file} ${v.message}`).join('；')}`);
    },
  },

  'freeze-leaves-spec-in-design': {
    text: '冻结不翻状态——spec 留在「设计中」，翻在飞是 to-ticket 切完工单时的事',
    run: ({ project }) => {
      const { file, md } = theSpec(project);
      if (!file) return no('没有唯一的 spec');
      const status = frontmatter(md).status;
      return status === '设计中' ? ok(`${file}: ${status}`) : no(`${file} 的 status 变成了「${status ?? '没写'}」`);
    },
  },

  'refine-starts-from-handoff': {
    text: 'refine：designer 第一版画布来自交接画布——ledger 第一行有「起手：交接画布；……没有重抓线上组件」，画布保留着交接画布的锚点，过程里 designer 没有重抓线上组件',
    run: ({ project, pluginRoot, session }) => {
      const rec = designRecord(project);
      if (!rec) return no('没有冻结记录——这一跑没冻结到，ledger 的起手那一行读不到（冻结时 canvas/work/ 已清，ledger 全文只在冻结记录的「打磨轨迹」里）');
      const ledger = sectionUntil(read(join(project, rec)), '打磨轨迹', ['签字']) ?? '';
      const problems = [];
      if (!/起手[:：]\s*交接画布/.test(ledger)) problems.push('ledger 里没有「起手：交接画布…」那一行');
      else if (!/没有重抓线上组件/.test(ledger)) problems.push('起手那一行没写「没有重抓线上组件」');

      const seed = anchorsOf(read(join(pluginRoot, 'evals/case/stages/handoff/index.html')));
      const canvas = designCanvases(project)[0];
      const final = anchorsOf(canvas ? read(join(project, canvas)) : '');
      const kept = [...seed].filter((a) => final.has(a));
      if (kept.length < Math.ceil(seed.size * 0.6)) problems.push(`画布只保留了种子的 ${kept.length}/${seed.size} 个锚点（缺 ${[...seed].filter((a) => !final.has(a)).join(',')}）——不像是从交接画布接着做的`);

      let recapture = '（无会话记录，没核）';
      if (!session) problems.push(NO_SESSION);
      else {
        const hits = toolUses(session).filter((e) => {
          if (!e.sub) return false;
          const input = JSON.stringify(e.input ?? {});
          if (/browser_(evaluate|run_code)/.test(e.name) && /outerHTML|document\.styleSheets/.test(input)) return true;
          if (e.name === 'Bash' && /\b(npm|pnpm|yarn|bun)\s+(run\s+)?(dev|start)\b/.test(String(e.input?.command ?? ''))) return true;
          if (/browser_navigate$/.test(e.name) && !/^(https?:\/\/(127\.0\.0\.1|localhost)|file:)/.test(String(e.input?.url ?? ''))) return true;
          return false;
        });
        if (hits.length) problems.push(`designer 有 ${hits.length} 次像在重抓线上组件：${hits.slice(0, 3).map((h) => h.name).join('、')}`);
        recapture = `designer ${toolUses(session).filter((e) => e.sub).length} 次工具调用里零次重抓线上组件`;
      }
      return problems.length ? no(problems.join('；')) : ok(`起手一行在；保留 ${kept.length}/${seed.size} 个种子锚点；${recapture}`);
    },
  },

  'refine-conflict-held-by-human': {
    text: 'refine：评委动到人选定的项时 designer 不改、交回里出现「与人选定冲突」；人说保留之后，那一项被写进 excluded 不计分，ledger 记下「人保留（日期）」',
    run: ({ project, session }) => {
      if (!session) return no(NO_SESSION);
      const conflicts = handbacks(session).filter((h) => {
        for (const m of h.text.matchAll(/与人选定冲突/g)) {
          const before = h.text.slice(Math.max(0, m.index - 8), m.index);
          if (!/没有|无|不存在|未|零/.test(before)) return true;
        }
        return false;
      });
      if (!conflicts.length) return no('designer 的交回里一次都没出现「与人选定冲突」——这一跑评委没碰到种子里那条人选定的项（组头标签、标题、pill 紧挨着排），拿不到证据；换一条更招眼的种子，或看 round-*.json 里评委提了什么');
      const excl = roundJsons(session).filter((r) => Array.isArray(r.json.excluded) && r.json.excluded.some((x) => /人保留/.test(String(x.reason ?? ''))));
      const rec = designRecord(project);
      const ledger = rec ? sectionUntil(read(join(project, rec)), '打磨轨迹', ['签字']) ?? '' : '';
      const problems = [];
      if (!excl.length) problems.push('没有任何一份 round-*.json 的 excluded 带「人保留」——保留之后那一项还在计分');
      if (!rec) problems.push('没有冻结记录，ledger 里「人保留（日期）」读不到');
      else if (!/人保留（/.test(ledger)) problems.push('打磨轨迹里没有「人保留（日期）」');
      return problems.length
        ? no(`${problems.join('；')}（冲突交回 ${conflicts.length} 次）`)
        : ok(`冲突交回 ${conflicts.length} 次；${excl[0].name} 的 excluded 有 ${excl[0].json.excluded.length} 条带「人保留」；打磨轨迹里有「人保留（…）」`);
    },
  },

  // —— uiux-refine · 没有交接画布的退路 ————————————————————————————

  'refine-fallback-says-so': {
    text: '没有交接画布、只有方向说明：起 designer 之前会话告诉了人，designer 第一次交回里明说走了从文字重建的退路，也没有凭空造出 handoff/',
    run: ({ project, session }) => {
      if (!session) return no(NO_SESSION);
      const { file } = theSpec(project);
      if (!file) return no('没有唯一的 spec');
      const problems = [];
      const back = handbacks(session)[0];
      if (!back) problems.push('会话没收到 designer 的交回');
      else if (!/没有交接画布/.test(back.text) || !/退路/.test(back.text)) problems.push('designer 第一次交回里没有同时说「没有交接画布」和「退路」');
      const firstAgent = sessionEvents(session).find((e) => !e.sub && e.kind === 'tool_use' && isAgentCall(e));
      const told = sessionEvents(session).some((e) => !e.sub && e.kind === 'text' && /没有交接画布/.test(e.text) && (!firstAgent || e.seq < firstAgent.seq));
      if (!told) problems.push('起 designer 之前，会话没有对人说「这份 spec 没有交接画布，会从方向说明重建」');
      if (existsSync(join(project, `docs/design/tmp/${slugOf(file)}/imagine/handoff`))) problems.push('handoff/ 凭空出现了');
      return problems.length ? no(problems.join('；')) : ok('会话先告诉了人；designer 第一次交回里有「没有交接画布」与「退路」；没有 handoff/');
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
