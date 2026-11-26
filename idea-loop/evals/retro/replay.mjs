/**
 * Replay decisions, as pure functions. The runner (retro-replay.mjs) starts the `claude -p` sessions;
 * everything it has to decide from what those sessions produced is here, so it can be tested without them.
 */

import { normalize } from 'node:path';
import { BOOTSTRAP_FILES, normalizeRemote, parseProjects } from './home-projects.mjs';

const ANSWERS ={ 是: 'yes', yes: 'yes', y: 'yes', 否: 'no', no: 'no', n: 'no' };
const normalizeAnswer = (a) => ANSWERS[String(a ?? '').trim().toLowerCase()];

/**
 * Pre-change answer "no" (the problem shows) and post-change answer "yes" (it is gone) is the only pass.
 * A pre-change "yes" means the case never showed the problem, so it proves nothing: that is checked first.
 * For a goal case (`goal`, case.json `goal_from`) that same pre-change "yes" is not a broken case but a rule that was not needed:
 * the outcome is `already-done` ("不过：改前就做得到"), and the human decides whether to change the case or drop the rule.
 */
export function decideOutcome({ before, after, guard = false, goal = false }) {
  const b = normalizeAnswer(before);
  const a = normalizeAnswer(after);
  if (!b || !a) return { outcome: 'inconclusive', reason: '判定会话没有对两份产物都给出「是」或「否」' };
  // a guard case (case.json `guard: true`) watches that a rule does not reach too far: the old behaviour already gave "yes", and what it
  // has to show is that the new one still does. So the pre-change answer is not asked to be "no"; only the post-change one counts.
  if (guard) {
    return a === 'yes'
      ? { outcome: 'pass', reason: `过（守边界的用例）：改后答「是」，边界没有被新规则放宽${b === 'yes' ? '（改前也答「是」，这类用例本来如此）' : ''}` }
      : { outcome: 'fail', reason: '不过：守边界的用例，改后答「否」，新规则把不该自己定的事也自己定了' };
  }
  if (b === 'yes' && goal) return { outcome: 'already-done', reason: '不过：改前就做得到：改前的插件跑出来就已经答「是」，这段规则加了跟没加一样。由人判断：换一个改前做不到的用例，还是这段规则本来不用加' };
  if (b === 'yes') return { outcome: 'case-missed', reason: '用例没抓住问题：改前的插件跑出来就已经答「是」，先修用例' };
  if (a === 'no') return { outcome: 'fail', reason: '不过：改后的插件跑出来仍然答「否」，规则改动没有让问题消失' };
  return { outcome: 'pass', reason: '过：改前答「否」（问题复现），改后答「是」' };
}

/** The variables `gh` takes a login from, other than its config dir: github.com and enterprise tokens. */
const GH_TOKEN_VARS = ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN'];

/**
 * The environment every process the runner starts (the two workers, the Claude judge, the Codex judge) gets: the runner's own
 * environment without a `gh` login. The project copy stands at the case's commit, but a `gh` read still answers from the machine's
 * login, with what happened after that commit; no token and an empty config dir make every `gh` read fail as not logged in.
 * `ghConfigDir` is an existing empty directory. `env` is not changed; everything but the above passes through.
 */
export function replayChildEnv(env, ghConfigDir) {
  const child = { ...env, GH_CONFIG_DIR: ghConfigDir };
  for (const k of GH_TOKEN_VARS) delete child[k];
  return child;
}

/**
 * The files the plugin's SessionStart hook puts in a main session at the start (hooks/hooks.json runs `dyna runtime inject <section>`):
 * the capability list (`runtime/capabilities.md`) and the data of the current runtime only (`runtime/<name>.md`). The
 * runner starts the session with `--plugin-dir`, so the hook runs every time; a run is not expected to read or call them.
 * `runtime` is the runtime the replayed session ran in (what `dyna runtime name` gives for the runner's environment, which the
 * session inherits), or null when that environment names no known runtime: then nothing is injected.
 * The other runtime's data is not injected, so a change to it still has to be read or called to count.
 * Not checked: that the hook really ran (a hook that errors would still count as used); `dyna runtime inject` has its own tests.
 */
export function injectedFiles(runtime) {
  return runtime ? ['runtime/capabilities.md', `runtime/${runtime}.md`] : [];
}

/** Does a shell command name `path` as a path relative to the working dir: at the start, or after a space, quote, `./` or a shell operator, not as the tail of a longer path. */
function namesRelativePath(command, path) {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[\\s'"=(;|&<>]|\\./)${escaped}`).test(command);
}

/**
 * Did the post-change run use what the change touched? `events` is the post-change run's event stream (parsed events, main
 * session and sub-agents alike); `change` is `{files, skills, agents}` (see `changeSetOf` in the runner): the files added or
 * modified under the plugin's `skills/`, `agents/` and `runtime/`, relative to the plugin dir, the skills those files belong to
 * (`<plugin>:<skill dir>`) and the agents among them (`<plugin>:<file name without .md>`). `roots` are the spellings of the
 * dir the post-change plugin was loaded from, as a path in the stream would show it, and (when the runner swapped the changed files
 * into the project's own copy of the plugin) the spellings of that copy in the project; `projectRelDirs` are where that copy is,
 * relative to the project dir (`['idea-loop']`; `''` for a plugin at the project root), so a Bash command that reads a changed file
 * by a path relative to the project counts too. `prompt` is what the run was given.
 *
 * Used = any one of: a Read of a changed file (or a Bash command naming its full path), a Skill call for a skill that owns a
 * changed file, an Agent call for a changed agent definition, or a prompt that starts with such a skill's slash command (the
 * harness loads that skill itself, no tool call shows it), or a changed file the SessionStart hook injects (see `injectedFiles`;
 * `runtime` says which runtime's data that is, without it nothing counts): the session has it from the
 * start, so no tool call shows it either, and a read or call in the stream is reported in its place. `injected` lists more such files
 * (relative to the plugin dir): the runner passes the fixed text (RULES_FILE) when the post-change home has it, since the session
 * has it in its memory from the start.
 * Returns `{status: 'hit', via: 'read'|'skill'|'agent'|'injected', name, changed}`, `{status: 'miss', changed}`, or
 * `{status: 'na', changed: 0}` when the change set is empty (only scripts changed).
 */
export function exercisedBy(events, change, { roots = [], projectRelDirs = [], prompt = '', runtime = null, injected: alsoInjected = [] } = {}) {
  const files = new Set(change?.files ?? []);
  if (!files.size) return { status: 'na', changed: 0 };
  const skills = new Set(change.skills ?? []);
  const agents = new Set(change.agents ?? []);
  const changed = files.size;
  const hit = (via, name) => ({ status: 'hit', via, name, changed });
  const slash = /^\s*\/(\S+)/.exec(String(prompt))?.[1];
  if (slash && skills.has(slash)) return hit('skill', slash);
  const changedFileAt = (path) => {
    for (const root of roots) {
      if (!path.startsWith(`${root}/`)) continue;
      const rel = path.slice(root.length + 1);
      if (files.has(rel)) return rel;
    }
    return null;
  };
  for (const ev of events) {
    if (ev?.type !== 'assistant') continue;
    for (const block of ev.message?.content ?? []) {
      if (block?.type !== 'tool_use') continue;
      const input = block.input ?? {};
      if (block.name === 'Read' && typeof input.file_path === 'string') {
        const rel = changedFileAt(normalize(input.file_path));
        if (rel) return hit('read', rel);
      } else if (block.name === 'Skill') {
        if (skills.has(input.skill)) return hit('skill', input.skill);
      } else if (block.name === 'Agent' || block.name === 'Task') {
        if (agents.has(input.subagent_type)) return hit('agent', input.subagent_type);
      } else if (block.name === 'Bash' && typeof input.command === 'string') {
        for (const root of roots) {
          const rel = [...files].find((f) => input.command.includes(`${root}/${f}`));
          if (rel) return hit('read', rel);
        }
        for (const dir of projectRelDirs) {
          const rel = [...files].find((f) => namesRelativePath(input.command, dir ? `${dir}/${f}` : f));
          if (rel) return hit('read', rel);
        }
      }
    }
  }
  const injectedSet = [...injectedFiles(runtime), ...alsoInjected];
  const injected = [...files].find((f) => injectedSet.includes(f));
  if (injected) return hit('injected', injected);
  return { status: 'miss', changed };
}

/**
 * The outcome once the exercised check is in: a run that did not use the change cannot show the rule works, so whatever the
 * judge said, the outcome is `not-exercised`. What the judge said is kept (`judgedOutcome`, and its reason in the text).
 */
export function applyExercised(decision, exercised) {
  if (exercised?.status !== 'miss') return decision;
  return {
    outcome: 'not-exercised',
    reason: `用例没测到改动：改后那一遍没有读过、调过、起过这次改动涉及的任何 skill、agent 定义或参考文件（改动了 ${exercised.changed} 个文件），说明不了规则生效。评委那边的结论：${decision.reason}`,
    judgedOutcome: decision.outcome,
  };
}

/**
 * The judging session answers with one JSON object keyed by the two anonymous products:
 * {"A": {"answer": "是|否", "cite": "出处"}, "B": {...}}. Takes the last such object in the text.
 */
export function parseVerdict(text) {
  const s = String(text ?? '');
  const candidates = [];
  for (let i = s.indexOf('{'); i >= 0; i = s.indexOf('{', i + 1)) {
    for (let j = s.lastIndexOf('}'); j > i; j = s.lastIndexOf('}', j - 1)) {
      try {
        candidates.push(JSON.parse(s.slice(i, j + 1)));
        break;
      } catch {
        /* try a shorter slice */
      }
    }
  }
  for (const obj of candidates.reverse()) {
    const out = {};
    for (const k of ['A', 'B']) {
      const answer = normalizeAnswer(obj?.[k]?.answer);
      if (!answer) break;
      out[k] = { answer, cite: String(obj[k].cite ?? '') };
    }
    if (out.A && out.B) return out;
  }
  return null;
}

/** The case as it should be written back after a "small" run started an agent or opened a browser. */
export function relabelLarge(c, escalation) {
  const what = escalation.kind === 'agent' ? '起了 agent' : '开了浏览器';
  const { name, ...rest } = c;
  return {
    ...rest,
    size: 'large',
    size_basis: `跑的时候从事件流里看到${what}（工具 ${escalation.tool}），按「碰到任何一样是大」改标成大；原依据：${c.size_basis}`,
  };
}

/**
 * What a run is given: the human's words, exactly. Nothing is added, so the run cannot tell it is being tested or where it is
 * meant to stop; an agent that hands its work to the human ends its turn, and the session timeout is the backstop.
 */
export function buildWorkerPrompt(c) {
  return c.prompt;
}

/**
 * Which anonymous letter each product gets. `afterIs` is the letter of the post-change product ("A" or "B"), chosen at random for
 * every replay so the judge cannot learn a fixed order; the runner records it in the result.
 */
export function productsInOrder({ before, after }, afterIs) {
  return afterIs === 'A' ? { A: after, B: before } : { A: before, B: after };
}

/** The judge's verdict, keyed by letter, turned back into one answer per side: `[{side: 'before', ...}, {side: 'after', ...}]`. */
export function verdictsBySide(verdict, afterIs) {
  if (!verdict) return null;
  const [before, after] = afterIs === 'A' ? [verdict.B, verdict.A] : [verdict.A, verdict.B];
  return [{ side: 'before', ...before }, { side: 'after', ...after }];
}

/** The two products are anonymous (A, B): the judge is not told which one the changed plugin made. */
export function buildJudgePrompt(c, productA, productB) {
  return [
    '你是一个判定员。下面有同一件事跑出来的两份产物（A、B），请只回答一道是/否题。',
    '',
    '规则：只依据产物里写了的东西作答，不要脑补；答「是」要能指出产物里的原文作为出处，找不到出处就答「否」。不要使用任何工具。',
    '',
    `题：${c.question}`,
    c.goal_from ? `（这道题是从 spec 里这条期望写出来的：${c.goal_from}）` : `（这道题是从人当时的这句话写出来的：${c.quote}）`,
    `（两份产物都是同一件事做到交给人的那一刻留下的，看产物里交给人的那一刻：${c.stop_at}）`,
    '',
    '最后一行只输出一个 JSON 对象，形如：{"A":{"answer":"是或否","cite":"出处，引原文"},"B":{"answer":"是或否","cite":"出处，引原文"}}',
    '',
    '===== 产物 A =====',
    productA,
    '',
    '===== 产物 B =====',
    productB,
  ].join('\n');
}

/**
 * What a run left behind, as one text the judge can read: its closing words plus each file it wrote.
 * `perFile` caps one file, `total` caps the whole text.
 */
/** What the judge sees of a file the run left behind: its text, or a one-line note for a binary file (a NUL byte means binary; raw bytes in the judge prompt make spawn throw). */
export function fileBody(buf) {
  return buf.includes(0) ? `（二进制文件，${buf.length} 字节，内容略）` : buf.toString('utf8');
}

export function buildArtifact({ resultText, files, homeFiles, homePath }, { perFile = 12_000, total = 60_000 } = {}) {
  const parts = ['## 最后一段回复', '', resultText || '（没有最后回复）', '', '## 工作区里写下或改动的文件', ''];
  const addFiles = (list) => {
    if (!list.length) parts.push('（没有写下或改动的文件）');
    for (const f of list) {
      const body = f.content.length > perFile ? `${f.content.slice(0, perFile)}\n…（已截断，原长 ${f.content.length} 字）` : f.content;
      parts.push(`### ${f.path}`, '', body, '');
    }
  };
  addFiles(files);
  // a run given a home (idea-loop's knowledge-base directory) may write there instead of in the workspace: say where it is and what is in it
  if (homeFiles) {
    parts.push(`## home（${homePath}）里写下或改动的文件`, '', '（home 里 `projects/<项目名>/` 是这个项目的目录：它的 `docs/` 是知识库，引导文件也在那里；下面的路径从 home 起算）', '');
    addFiles(homeFiles);
  }
  const text = parts.join('\n');
  return text.length > total ? `${text.slice(0, total)}\n…（已截断）` : text;
}

// ---------- the temporary home (idea-loop 0.2.0: the knowledge base lives in home, not in the code repository) ----------
//
// Cases recorded before the knowledge base moved into home have it in the code repository at their commit; the post-change plugin only
// reads home. The runner builds a home out of the commit (this is the only place that conversion exists: no skill and no script has it).
// What is decided here, without touching disk or git: what is copied, what the project list line says, who gets IDEA_LOOP_HOME.

/** The variable that points idea-loop at its home. */
export const HOME_ENV = 'IDEA_LOOP_HOME';

/**
 * Where one side's home comes from. A case with `home_commit` gives both sides a copy cut from that commit of the home repository
 * ('home-commit'). Without it, the post-change side gets a home built from the case commit's own `docs/` and bootstrap files
 * ('project-docs'); the pre-change plugin reads those same files from the code repository, so its home is an empty one ('empty'):
 * the variable is still set, so no home of this machine is reachable through it. A pre-change plugin that already reads the knowledge
 * base from home (`readsHome`, see `pluginReadsHome` in the runner: the plugin of 0.2.0's line, which a change on that line is compared
 * with) cannot find it in the code repository either, so it is given the same built home as the post-change side.
 */
export function homeSourceOf(c, side, { readsHome = false } = {}) {
  if (c.home_commit) return 'home-commit';
  return side === 'after' || readsHome ? 'project-docs' : 'empty';
}

/**
 * The plugin's copy of the fixed text that `dyna home config apply --only rules` writes into home's AGENTS.md (relative to the plugin
 * dir), and the three sections it holds. A plugin without that file (one from before the fixed text existed) gets a home without them.
 * The tests pin RULE_SECTIONS against the headings of the plugin's copy.
 */
export const RULES_FILE = 'skills/engineering/setup/references/home-rules.md';
export const RULE_SECTIONS = ['思考与决策', '沟通', '证据'];

/** The `## <name>` sections of an AGENTS.md (each from its heading to the line before the next `## `; a `## ` in a fenced block is no heading), joined by a blank line, in the file's order. '' when it has none of them. */
export function sectionsOf(agentsMd, names = RULE_SECTIONS) {
  const out = [];
  let keep = false;
  let fenced = false;
  let cur = [];
  const flush = () => {
    if (keep && cur.length) out.push(cur.join('\n').trim());
    cur = [];
  };
  for (const line of String(agentsMd ?? '').split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const heading = !fenced && line.match(/^##\s+(.*?)\s*$/);
    if (heading) {
      flush();
      keep = names.includes(heading[1]);
    }
    cur.push(line);
  }
  flush();
  return out.join('\n\n');
}

/**
 * Where a session reads the fixed text from. On a real machine `~/.claude/CLAUDE.md` is a link to home's AGENTS.md, so every session
 * has the sections; a replayed session cannot be given another `~/.claude`, so the sections of its temporary home are put in the
 * project copy's own `.claude/CLAUDE.md`, which Claude Code loads for the project. `existing` is what the case's commit already has in
 * that file (kept; the sections come after it).
 */
export const RULES_MEMORY_FILE = '.claude/CLAUDE.md';
export function rulesMemoryMd(sections, existing = '') {
  const head = String(existing ?? '').replace(/\s*$/, '');
  return `${head ? `${head}\n\n` : ''}${String(sections).replace(/\s*$/, '')}\n`;
}

/** The session environment with the `dyna` that the plugin's hooks and skills call set to `bin` (a side's own build: the pre-change plugin needs the command line it was written against). `bin` null: `env` as it is. */
export const withDyna = (env, bin) => (bin ? { ...env, IDEA_LOOP_DYNA_BIN: bin } : env);

/** The session environment with IDEA_LOOP_HOME pointing at `home`. `env` is not changed. */
export const withHome = (env, home) => ({ ...env, [HOME_ENV]: home });

/** What goes from the code repository's top level (`topLevel`: its entry names at the commit) into the project directory in home: `docs/` and the bootstrap files, those that exist. */
export function homeCopyEntries(topLevel) {
  const names = new Set(topLevel);
  return ['docs', ...BOOTSTRAP_FILES].filter((n) => names.has(n));
}

/** The name home files a project under: the repository's name, lower case (what setup registers). */
export const homeProjectName = (name) => String(name).toLowerCase();

/** The remote the project is registered with: the case repository's own `origin`, or a made-up one that matches nothing real when it has none. */
export function homeRemote(origin, name) {
  return normalizeRemote(origin) ? String(origin).trim() : `https://example.invalid/${name}/${name}.git`;
}

/** One line of the `## 项目` list, in the format home's AGENTS.md and `dyna home` use. */
export const projectListLine = ({ name, path, remote }) => `${name}（项目）: ${path}. Clone from ${remote} if missing.`;

/** A home's AGENTS.md with just this project in its list. */
export function homeAgentsMd(entry) {
  return ['# home', '', '## 设备地图', '', '回答关于项目的问题前，先在「项目」一节里找到项目，读它的项目地图，再去地图指的那几层。', '', '## 项目', '', projectListLine(entry), ''].join('\n');
}

/**
 * `agentsMd` with this project in its list: a line for the same repository (same remote) is replaced, keeping its name and remote, so its path
 * points at the checkout the run works in and not at the one of the machine the home was cut on; otherwise the line is added to the end of the section.
 */
export function registerProject(agentsMd, entry) {
  const line = projectListLine(entry);
  const want = normalizeRemote(entry.remote);
  const lines = String(agentsMd ?? '').split('\n');
  let inSection = false;
  let lastInSection = -1;
  for (let i = 0; i < lines.length; i++) {
    const heading = lines[i].match(/^##\s+(.*?)\s*$/);
    if (heading) {
      inSection = heading[1] === '项目';
      if (inSection) lastInSection = i;
      continue;
    }
    if (!inSection) continue;
    if (lines[i].trim()) lastInSection = i;
    const [found] = parseProjects(`## 项目\n${lines[i]}`);
    if (found && normalizeRemote(found.remote) === want) {
      lines[i] = projectListLine({ ...entry, name: found.name, remote: found.remote }); // name and remote stay (the name is the directory's under projects/); only the path moves
      return lines.join('\n');
    }
  }
  if (lastInSection < 0) return `${lines.join('\n').replace(/\n*$/, '\n')}\n## 项目\n\n${line}\n`;
  lines.splice(lastInSection + 1, 0, line);
  return lines.join('\n');
}

/** The project map (`projects/<名字>/AGENTS.md`) for a project directory built out of `copied` entries. */
export function projectMapMd({ name, path, copied }) {
  const layers = [];
  if (copied.includes('docs')) layers.push('- `docs/`：知识库（spec、工单、设计档案、决策记录）。');
  const boot = copied.filter((n) => n !== 'docs');
  if (boot.length) layers.push(`- 引导文件：${boot.map((n) => `\`${n}\``).join('、')}。`);
  return [`# ${name} 项目地图`, '', `项目。代码仓库：${path}。`, '', '## 几层', '', ...(layers.length ? layers : ['- （还没有内容）']), ''].join('\n');
}

/** Rough spend per case in dollars: two worker sessions plus one judge. Reference: an empty `claude -p` is about $0.3–0.5; one full skill run about $1.5. */
export function estimateCostUsd(nCases) {
  return { low: 3 * 0.35 * nCases, high: (2 * 1.5 + 0.5) * nCases };
}

/**
 * Human overrides live in the case's annotations.md, one line per side per run:
 *   - 推翻 <run-id> 改前=是|否 ｜ 理由
 * @returns {Record<string, {before?: 'yes'|'no', after?: 'yes'|'no'}>}
 */
export function parseOverrides(text) {
  const out = {};
  const re = /^\s*[-*]\s*推翻\s+(\S+)\s+(改前|改后)\s*[=：:]\s*(是|否)/;
  for (const line of String(text ?? '').split('\n')) {
    const m = re.exec(line);
    if (!m) continue;
    (out[m[1]] ??= {})[m[2] === '改前' ? 'before' : 'after'] = normalizeAnswer(m[3]);
  }
  return out;
}

/** The answers after the human's override for this run (and only this run) is applied. */
export function settleVerdicts(judged, overrides, runId) {
  return { ...judged, ...(overrides[runId] ?? {}) };
}
