/**
 * Tripwire — a need that spans several code repositories: one PR per repository, one for the knowledge base, and the
 * spec is not done until all of them are merged.
 *
 * Spec knowledge-base-repo, ticket 05 (「多仓库需求」「每份 spec 什么时候算全部合并」). The behaviour is skill text, so this
 * reads the text: to-ticket's template has a 仓库 line (left out with a single code repository); implement opens the other
 * repositories' integration worktrees with `knowledge-base.mjs worktree`, keeps the ledger per repository, opens one draft
 * PR per repository and one for the knowledge base, and lists all of them in each PR's `reference`; the implementer does not
 * commit the ticket file (it lives in the knowledge base) but writes the ticks back there; pr-review merges one PR at a
 * time and runs `issues advance` only when every PR the `reference` lists is merged; issue-session changes stage on the
 * same condition. It cannot see whether an executor follows the text.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(pluginRoot, ...p), 'utf8');

const toTicket = read('skills', 'engineering', 'to-ticket', 'SKILL.md');
const implement = read('skills', 'engineering', 'implement', 'SKILL.md');
const implementer = read('agents', 'implementer.md');
const prReview = read('skills', 'engineering', 'pr-review', 'SKILL.md');
const prReviewDir = ['merge.md', 'deliver.md', 'multi-repo.md'].map((f) => read('skills', 'engineering', 'pr-review', 'references', f));
const multiRepo = read('skills', 'engineering', 'pr-review', 'references', 'multi-repo.md');
const issueSession = read('skills', 'engineering', 'issue-session', 'SKILL.md');
const readme = read('README.md');

const line = (doc, needle) => doc.split('\n').find((l) => l.includes(needle));

test('to-ticket: the ticket template has a 仓库 line, written only when the business has two or more code repositories', () => {
  const template = toTicket.slice(toTicket.indexOf('```markdown'));
  assert.match(template, /^\*\*仓库\*\*：<仓库名>/m, '工单模板缺「**仓库**：<仓库名>」一行');
  const rule = line(toTicket, '**仓库**一行');
  assert.ok(rule, '缺「仓库」一行什么时候写的说明');
  assert.match(rule, /两个以上代码仓库/, '要写明：业务有两个以上代码仓库时才写');
  assert.match(rule, /只有一个代码仓库时整行不写/, '要写明：只有一个代码仓库时不写');
  assert.match(toTicket, /knowledge-base\.mjs" business[^\n]*`repos`/, '业务有几个仓库看 knowledge-base.mjs business 的 repos');
});

test('to-ticket: a ticket lands in one repository and the order between repositories is only Blocked by', () => {
  const cut = line(toTicket, '一张工单只落在一个仓库');
  assert.ok(cut, '缺：一张工单只落在一个仓库');
  assert.match(cut, /Blocked by/, '跨仓库的先后只看 Blocked by');
});

test('to-ticket: which repository a ticket lands in is judged from the knowledge base AGENTS.md "## 仓库" section; without it the slicing stops', () => {
  const rule = line(toTicket, '**仓库**一行');
  assert.match(rule, /`AGENTS\.md` 的「## 仓库」一节/, '仓库一行要按知识库 AGENTS.md 的「## 仓库」一节判');
  const probe = line(toTicket, '「## 仓库」一节');
  assert.ok(probe, '缺：探代码库时读「## 仓库」一节');
  const explore = toTicket.slice(toTicket.indexOf('## 探代码库'), toTicket.indexOf('## 切垂直切片'));
  assert.match(explore, /`<知识库>\/AGENTS\.md` 的「## 仓库」一节/, '探代码库：有两个以上仓库时读知识库根的 AGENTS.md 的「## 仓库」一节');
  assert.match(explore, /没有这一节[^\n]*停下[^\n]*\/idea-loop:setup/, '没有这一节而业务有几个仓库：停下让人跑 setup 补，不猜');
  assert.match(rule, /按仓库拆/, '一刀横跨几个仓库的照旧按仓库拆');
});

test('implement: the other repositories\' integration worktrees come from knowledge-base.mjs worktree, one integration branch per repository', () => {
  assert.match(implement, /knowledge-base\.mjs worktree <仓库名>/, '缺：别的仓库用 knowledge-base.mjs worktree <仓库名> 开');
  assert.match(implement, /\.tmp\/repos\/<仓库名>\//, '缺：它输出的 .tmp/repos/<仓库名>/');
  assert.match(implement, /每个仓库一条集成分支，名字都等于会话分支/, '缺：每个仓库一条集成分支，名字都等于会话分支');
});

test('implement: landed, reclaim and the ledger are per repository; ticks and docs(tickets) commits are in the knowledge base', () => {
  assert.match(implement, /账本按仓库各算/, '缺：账本按仓库各算');
  assert.match(implement, /ticket-ledger\.mjs landed` 在每个仓库的集成 worktree 里各跑一次/, '缺：ticket-ledger.mjs landed 每个仓库各跑一次');
  assert.match(implement, /工单勾格、`docs\(tickets\)` 提交、设计变更都在知识库里做/, '缺：工单勾格、docs(tickets) 提交、设计变更都在知识库里做');
  assert.match(implement, /`root --write`/, '知识库里做 = root --write 的 worktree');
  const dispatch = implement.slice(implement.indexOf('## 派工'), implement.indexOf('## 核对与落地'));
  assert.match(dispatch, /工单所在仓库的集成 worktree 的 `git rev-parse HEAD` 作起点 SHA/, '起点 SHA 取工单所在仓库的集成 worktree');
  const landed = implement.slice(implement.indexOf('**落地**'));
  assert.match(landed, /在它仓库的集成 worktree 里 `git merge --ff-only/, '落地在工单所在仓库的集成 worktree 里 ff');
  assert.match(landed, /docs\(tickets\): <NN> — 落地/, '落地后在知识库里提交勾好的工单');
  const reclaim = implement.slice(implement.indexOf('## 回收'));
  assert.match(reclaim, /在它那个仓库里做/, '回收在工单所在的仓库里做');
});

test('implement: every repository with landed commits gets its own draft PR, the knowledge base one more, and each reference lists them all', () => {
  const stop = implement.slice(implement.indexOf('## 没活了就停下'), implement.indexOf('## 设计变更'));
  assert.match(stop, /每个有落地提交的代码仓库各推送、各开一个 draft PR/, '缺：每个有落地提交的代码仓库各推送、各开一个 draft PR');
  assert.match(stop, /知识库有改动[^\n]*也推送、开一个/, '缺：知识库有改动也推送、开一个');
  assert.match(stop, /`reference` 区列出这份 spec 的全部 PR/, '缺：reference 区列出这份 spec 的全部 PR');
  assert.match(stop, /每个 PR 各 `gh pr ready`/, '每个 PR 各 gh pr ready');
});

test('implement: the ticket file is read from the knowledge base when checking a landing, not from the commit', () => {
  assert.doesNotMatch(implement, /git show <commit>:<工单>/, '工单不在代码 commit 里，核对不能再读 git show <commit>:<工单>');
  const row = implement.split('\n').find((l) => l.startsWith('| `landed`'));
  assert.ok(row, '核对表缺 landed 一行');
  assert.match(row, /写回知识库的那份工单/, '核对 landed：读执行方写回知识库的那份工单');
});

test('implementer: the ticks are written back to the ticket in the knowledge base and never go into the code commit', () => {
  assert.doesNotMatch(implementer, /加上勾好框的工单文件/, '代码 commit 不再带勾好框的工单文件');
  assert.match(implementer, /这张工单的全部代码改动，不含工单文件/, '提交的是全部代码改动，不含工单文件');
  const rule = line(implementer, '**工单文件不进 commit**');
  assert.ok(rule, '缺「工单文件不进 commit」一段');
  assert.match(rule, /写回 `<知识库>` 里的那份工单文件/, '要写：勾格写回知识库里的那份工单文件');
  assert.match(rule, /继承自 NN/, '继承格也在知识库里追加');
  assert.match(rule, /编排者落地时在知识库里提交/, '要写：编排者落地时在知识库里提交');
  assert.match(rule, /`blocked` \/ `failed` 不写工单文件/, 'blocked / failed 不写工单文件');
  assert.match(implementer, /acceptance: [^\n]*勾了：/, '交回的 acceptance 要说明勾了哪几格');
});

test('implementer: a ticket in another repository gets its own worktree from that repository\'s integration worktree', () => {
  const step = line(implementer, '**工单写了「仓库」，且不是派你时的 worktree 所在仓库**');
  assert.ok(step, '「开工前」缺：工单写了「仓库」且不是派你时的 worktree 所在仓库');
  assert.match(step, /worktree add/, '从那个仓库的集成 worktree 开自己的 worktree');
  assert.match(step, /DEVELOPMENT\.md[^。]*REVIEW\.md[^。]*写法规范[^。]*用这个仓库的/, '读这个仓库的 DEVELOPMENT / REVIEW / 写法规范');
  assert.match(implementer, /对照收到的提交列表，各仓库的都看/, 'blocker 跨仓库也认');
});

test('pr-review: with several PRs, each PR with code is reviewed, and the spec is done only when all are merged', () => {
  assert.match(prReview, /multi-repo\.md/, 'SKILL.md 要指向 references/multi-repo.md');
  assert.match(multiRepo, /每个有代码的 PR 各跑 review/, '缺：每个 PR 各跑 review');
  assert.match(multiRepo, /gh pr view <号> --repo <owner\/repo>/, '缺：gh pr view 逐个查其余的 PR');
  assert.match(multiRepo, /`reference` 区列出的这份 spec 的\*\*全部 PR\*\*/, '缺：读 reference 里列出的全部 PR');
  assert.match(multiRepo, /全部合并了\*\*，才[^\n]*`issues advance`/, '缺：全部合并了才 issues advance');
  assert.match(multiRepo, /不翻 issue，在汇报里写「还剩哪几个没合」/, '缺：否则汇报里写还剩哪几个没合、不翻 issue');
});

test('pr-review: deleting the tickets and archiving the design happen in the knowledge base PR, before the last PR merges', () => {
  assert.match(multiRepo, /都是\*\*知识库 PR\*\* 里的提交，要赶在这份 spec 最后合并的那个 PR 之前做完/, '缺：删工单与归档在知识库 PR 里，赶在最后合并的那个之前');
  const merge = read('skills', 'engineering', 'pr-review', 'references', 'merge.md');
  assert.match(merge, /全合了才 `issues advance`，否则汇报里写还剩哪几个没合/, 'merge.md 合并后要指向这条');
  const deliver = read('skills', 'engineering', 'pr-review', 'references', 'deliver.md');
  assert.match(deliver, /一份 spec 有几个 PR 时只做一次/, 'deliver.md 的第 2 步只做一次');
  assert.ok(prReviewDir.every((t) => t.length > 0));
});

test('pr-review: the first report deletes every ticket of the spec, and a later report is not skipped while tickets remain', () => {
  const deliver = read('skills', 'engineering', 'pr-review', 'references', 'deliver.md');
  const step2 = deliver.slice(deliver.indexOf('## 2.'), deliver.indexOf('## 3.'));
  assert.match(step2, /删掉这份 spec 的\*\*全部\*\*工单文件/, '第 2 步删的是这份 spec 的全部工单，不是这个 PR 落地的那几张');
  assert.match(step2, /所有仓库的工单/, '要写明：有几个 PR 时是所有仓库的工单');
  assert.doesNotMatch(step2, /删掉这个 PR 落地的工单文件/, '不再只删这个 PR 落地的工单');
  assert.match(step2, /「完成」、`tickets\/` 也已经删掉了才跳过/, '跳过要同时看 spec 是完成和 tickets/ 已删，不能只看 spec 状态');
  assert.match(step2, /工单还在，要补删/, '状态翻了而工单还在，要补删');
  const timing = multiRepo.slice(multiRepo.indexOf('## 删工单与归档的时机'));
  assert.match(timing, /删的是这份 spec 的全部工单\*\*，不只是这个 PR 所在仓库的那几张/, 'multi-repo 的时机一节：删全部工单');
  assert.match(timing, /spec 是「完成」且 `tickets\/` 已经没有了，才跳过/, 'multi-repo：跳过的条件含 tickets/ 已删');
  assert.match(timing, /工单还在就补删/, 'multi-repo：工单还在就补删');
});

test('pr-review: the knowledge base PR is merged by the session itself, squash, no review and no review-record archive', () => {
  const merge = read('skills', 'engineering', 'pr-review', 'references', 'merge.md');
  const section = merge.slice(merge.indexOf('## 知识库 PR'), merge.indexOf('## 合并前归档'));
  assert.ok(section.length > 0, 'merge.md 缺「## 知识库 PR」一节');
  assert.match(section, /由会话自己合，不 review/, '知识库 PR 由会话自己合，不 review');
  assert.match(section, /gh pr merge <PR 号> --repo <知识库 owner\/repo> --squash/, '用 --squash 合');
  assert.match(section, /不取 `DEVELOPMENT\.md` 的「分支」节/, '合并方式不从开发设置取');
  assert.match(section, /检查全过/, '检查全过才合');
  assert.match(section, /不查 review loop 文件，不归档 review 记录/, '不查、不归档 review 记录');
  assert.match(section, /一个代码仓库的业务[^\n]*同样适用/, '单仓库业务同样适用');
  assert.match(section, /`issues advance`/, '合完再 issues advance');
  assert.match(section.slice(0, section.indexOf('1. ')), /不 review/, '先说清不 review');
  assert.match(merge, /归档先走|第 2 步[^\n]*合并最后一个代码 PR 之前做完/, '设计归档在合并最后一个代码 PR 之前');
  assert.match(merge, /只剩知识库 PR 没合，就接着做下面的「知识库 PR」/, '代码 PR 合完只剩知识库 PR 时接着合它');
  assert.match(multiRepo, /只剩知识库 PR 没合[^\n]*会话自己合它[^\n]*`--squash`/, 'multi-repo：只剩知识库 PR 没合，会话自己合它');
  assert.match(multiRepo, /知识库 PR 不跑 review 轮，也不等人说合并/, 'multi-repo：知识库 PR 不 review、不等人');
  assert.match(prReview, /代码 PR 只由人决定合并/, 'SKILL.md：只有代码 PR 的合并由人决定（知识库 PR 在 merge.md 里由会话合）');
  assert.match(readme, /session merges it itself once the code PRs are merged/, 'README 同步');
});

test('issue-session: the implementation stage ends, and the stage changes, only when all the spec\'s PRs are merged', () => {
  const row = line(issueSession, '| 实现 | 实现中 | 实现中 |');
  assert.ok(row, '阶段表缺实现一行');
  assert.match(row, /PR 全部合并/, '实现这一段做完的标志：PR 全部合并');
  assert.match(issueSession, /这一段的 PR 全部合并之后去「换阶段」/, '「实现」缺：全部合并之后才去换阶段');
  assert.match(issueSession, /还剩哪几个没合/, '「实现」缺：还有没合的，不换阶段');
  const change = issueSession.slice(issueSession.indexOf('## 换阶段'));
  assert.match(change, /全部合并后做一遍/, '「换阶段」缺：全部合并后才做');
});

test('README says the same for to-ticket, implement, pr-review and issue-session', () => {
  for (const head of ['| `/idea-loop:to-ticket`', '| `/idea-loop:implement`', '| `/idea-loop:pr-review`', '| `idea-loop:issue-session`']) {
    const row = readme.split('\n').find((l) => l.startsWith(head));
    assert.ok(row, `README 缺 ${head} 那一行`);
    assert.match(row, /[Ss]everal (code repositories|PRs)|two or more `repos`/, `${head} 一行要说多仓库`);
  }
});
