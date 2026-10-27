# 01 — design-archive 的主体只讲图的实体，写法与命令走 references，主体降到 5000 字以内

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

**先读写法**：这张工单改的全是给 agent 读的文档（skill、references、agent 定义）。开工前用 Skill 工具调 `idea-loop:writing-for-agents`，SKILL.md 和它指向的 `SKILL-MECHANICS.md` 都读；重排、改写、删句都照它做：信息层级与渐进披露、就近归置、引导词、单一事实来源、剪枝（环境缓存、空操作）。仓库 `CODING_STANDARDS.md` 的「链接」把它列为 skill 与 agent 定义的写法规范，review 的 Standards 轴按它审。

## 要建什么

`idea-loop:design-archive` 是设计档案（目标项目 `docs/design/prod/`）的结构、校验、查询与归档的唯一说明，implementer、ui-reviewer、dreaming、design-steward、uiux-refine 等按名字调它。现在它 SKILL.md 去掉 frontmatter 后有 11386 个字符（UTF-8 计），仓库根 `AGENTS.md` 要求主体 < 5000 字、长篇参考放进 skill 自己的 `references/`。

做完之后：调用方读完主体，就知道设计档案这张图里有哪些实体、彼此怎么关联、各挂哪些字段；读档案和写档案面对的是同一组对象，这部分只写一处。校验、查询、归档都是命令行，写一个对象文件的格式细节只在写的时候要，它们各走对应的 `references/`，主体里各一行指针。规则本身一条不改。

具体（spec `design-archive-skill-length` 的「方案」「实现决策」）：

- 主体：
  - 开头说清档案是什么，定义引导词「派生」：档案只写源头（页面、状态、边、组件、动效、用户路径），进入方式、`usedBy`、`prod/index.md` 的清单、截图是派生物，由脚本或查询算。
  - 「图的实体」（分段小节收 `references/sections.md` 前半「写分段的规范」里的定义：分段是什么、只写在入口状态、`scrollDriven` 只写 `true`、引用写普通字符串的全称及理由）：每种实体一小节——页面、状态（节点、入口节点）、边（`user` / `system`、`when`、`blocked`、跨页跳转）、分段（不是节点，一句加指针到 `references/sections.md`）、组件、动效、用户路径，以及档案组件与 `DESIGN.md` 基础件是两层。每节写它是什么、跟谁关联、挂哪些字段（字段名点到为止）；一个概念的定义只在它自己的实体下写一次（现在 `blocked` 散在 8 处、`usedBy` 散在 4 处）。
  - 「目录与命名」：`prod/` 目录树、页面前缀与工作区前缀、basename 全局唯一、`delta/` 与 `prod/` 同构（`removed.md`）、`prod/` 只由归档脚本写（只说一次）；`tmp/<spec-slug>/` 的生命周期一句指向 `idea-loop:wiki-conventions` 的「目录」；只属于 `delta/` 的两条（冻结后 `canvas/` 是设计真相、没有设计稿时 `delta/` 的最小差异是唯一的设计真相）留下。
  - 「进入方式从图上推导」：原样。
  - 「按需读」：一张表，每行一个分支——写一个对象文件 → 新的写法参考；拍档案截图 → `references/sections.md` 的拍图一半（工单 02 会把它改写成新的拍图参考，这张只保证指针指得到）；查档案 → MCP 工具 `design_*`（用法以工具的 description 为准），命令行退出码与返回字段在 `references/query.md`；校验 → 新的 `references/check.md`；归档 → `references/archive-script.md`。
- references：
  - 新的写法参考：分段的 `id` 写法、类型闭集表、`locate` 三种形状与范围、正文按段排、页内锚点与段内交互（都从 `references/sections.md` 前半挪来）；完整的 frontmatter 示例、字段的必填规则、正文的固定小节、决定的写法、建模的取舍、截图矩阵与 `prod/index.md` 的设置键，按实体编排。
  - 新的 `check.md`：校验命令、选项、退出码、「写完 `delta/` 的标志」（`--delta <spec-slug> --no-used-by` 退出码 0）、规则表；规则 0 那格不再重抄必填字段，指向写法参考里字段所在处；规则 7 的逐条违规与提示从 `references/sections.md` 挪来。
  - `query.md`：补上命令行与退出码；主体里那张七个入口的表删掉（MCP 的 description 与 `--help` 已有）。
  - `archive-script.md`：补上命令、退出码、谁在什么时候跑（合并前、人批过归档草稿之后；写 `delta/` 的 agent 自检只跑 `--dry-run`）。
  - `sections.md`：前半「写分段的规范」挪走后只剩拍图一半；标题「长页面的分段」「拍图：分段脚本」这张不动（有测试钉着，工单 02 改）。
- 字段名、规则编号、命令、选项、退出码一个不改。删掉的句子只有两类，PR 描述里逐条写：在别处已有单一事实来源的（写明在哪），照 `idea-loop:writing-for-agents`「剪枝」判为空操作的（写明理由）。归档一节末尾「网页上点合并会绕过归档」的已知缺口挪进 `idea-loop:pr-review` 的合并参考，那里已有就删。
- 按节名指到这份 skill 的外部入口同一个提交里改成新节名：implementer 定义的写档案那段、ui-reviewer 定义「开工」、dreaming 的初扫参考（顺手把它重抄的「入口是加载中」改成指针）、dreaming 的对账参考、`idea-loop:wiki-conventions` 的「frontmatter」一节、uiux-refine 动效协议参考里写 frontmatter / 正文的地方。拍图相关的入口（ui-reviewer 归档模式与对账模式的拍图、ui-measure、dreaming 初扫的拍图步骤）归工单 02；design-steward、design-modeling 不用改，核一眼。

## 验收标准

- [ ] 开工前读过 `idea-loop:writing-for-agents`；PR 描述里每条删句的理由引它的条目名（「单一事实来源」「环境缓存」「空操作」），每处重排说明依据（「信息层级」「就近归置」）
- [ ] 新文档测试：design-archive 的 SKILL.md 去掉 frontmatter 后按 UTF-8 字符数 < 5000；在改之前的主分支内容上它是红的（11386），改完是绿的
- [ ] 新文档测试：插件 skills 与 agents 下每一处「`idea-loop:design-archive` 的「X」」，X 都是这份 SKILL.md 的一个标题或它 `references/` 下某份文件的一个标题；在只改了节名、没改外部入口时它是红的
- [ ] 旧主体的每一节都能在新主体或某份 references 里找到；删掉的每一句在 PR 描述里有去处或删的理由
- [ ] 字段名、规则编号、命令行、选项、退出码跟改前逐一对得上（对着旧文 diff 核）
- [ ] 外部入口照「要建什么」最后一条改完
- [ ] 插件 `scripts/` 下全部测试照旧通过
- [ ] 改了 skill 内容，`idea-loop/README.md` 里要是提到这份 skill 的结构，同步改

## 选中的存量回归

- `ui-reviewer-archive-doc.test.mjs`：钉着 ui-reviewer 归档模式按名字加「长页面的分段」「拍图：分段脚本」指 design-archive，改外部入口时最容易碰坏
- `design-archive-sections-doc.test.mjs`：扫 skills 与 agents 里分段脚本的命令行、钉着几处拍图的写法，挪文字时命令行可能被改坏
- `skill-private-references.test.mjs`：别的 skill 不能按路径读 design-archive 的 references；改 wiki-conventions、uiux-refine 的指针时要守住
