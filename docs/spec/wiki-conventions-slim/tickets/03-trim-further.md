# 03 — 知识库约定再精简：只留目录表、生命周期线条图、中间产物

**Blocked by**：02 — 知识库约定按「目录」「生命周期」两部分重组（已落地）
**设计冻结**：不涉及 UI

## 要建什么

人读完两部分版本后要求再精简（spec「实现决策」的「再精简一轮」）。改完，读知识库约定的人只看到：一张目录表（每个目录放什么）、一句 frontmatter 规则加字段模板、slug 的定义、一张生命周期线条图、「知识库落地」、「中间产物」。

- **目录表**：路径只写到目录层（`spec/`、`adr/`、`design/tmp/`…），不写 `<spec-slug>`、`NN-<slug>` 这类占位，「收什么」只说里面放的是什么。原 `design-layout.md` 里只在那里写过的句子并进表的对应行（先逐句确认其余句子在设计类 skill 里都有）。
- **frontmatter**：一句「除了工单和 `index.md`，每份 md 都带，是 dreaming 与召回的锚点」加字段模板；模板里没有 `status`，`status` 闭集表删掉。
- **ADR**：`adr.md` 的「按小节取代」连同 ADR 的两个 `status` 值（生效 / 已被取代（→ ADR-NNNN））挪进 dreaming 的参考；dreaming 对账参考里原来指回知识库约定的那行改成指自己。
- **slug 与链接**：只留 slug 是什么，和「全局唯一」「删除后查死链」各一行，注明由统一命令行（#339）包装成子命令。
- **删掉**：`index.md` 一节和 `index-md.md`（dreaming 手写 `raw/`、`adr/` 索引用的格式挪进 dreaming 的参考，#339 上线后由命令行生成）；「spec 和工单怎么写」；「文件在不在，就是状态」；「人机分工」；参考 `design-layout.md`。
- **生命周期**：只有线条图，图上注「删 spec 前先写 ADR，只有 dreaming 写」；下面保留「知识库落地」原文与「从平铺布局迁移」一行。
- **中间产物**：不动。

别处指过来的名字：「知识库落地」「目录」「中间产物」「frontmatter」「本地忽略」「slug 与链接」「从平铺布局迁移」仍是标题。指「文件在不在，就是状态」的（术语表 skill）改指「生命周期」；dreaming、adr-reconciler 开头说「目录、ADR、人机分工、link sweep 都按它」的，改成实际还按它的那几项。

## 验收标准

- [x] 正文二级标题仍恰好是「目录」「生命周期」「中间产物」；别处指的名字都还是标题（文档测试）
- [x] 正文和字段模板里没有 `status`；ADR 的两个 status 值与「按小节取代」在 dreaming 的参考里能找到
- [x] 目录表里没有 slug 占位；`design-layout.md`、`adr.md`、`index-md.md` 三份参考不在了，它们的每句在表、dreaming 或设计类 skill 里能找到，逐句列进交回
- [x] 「index.md」「spec 和工单怎么写」「文件在不在，就是状态」「人机分工」四节不在了；守它们原话的文档测试改去查规则现在的住处（dreaming 自己写的「按风险分两类」等），不是直接删断言
- [x] 主体 < 5000 字；全量测试全绿；插件版本不再升
- [x] review 第 4 轮 S1（2026-11-18）：「放弃的需求只丢画布，有价值的结论写回 spec 或 issue」并进目录表设计过程那一行

## 选中的存量回归

- `wiki-conventions-skill-doc`：节名与字数。
- `issue-model-tripwire`：读 `status` 闭集表，要改成查「spec 没有 status」的新住处。
- `dreaming-autonomous-doc`：读「人机分工」两句原话，要改去 dreaming。
- `knowledge-base-landing-doc`：「知识库落地」原文不能被误伤。
- `skill-private-references`：dreaming 的新参考只由 dreaming 和 adr-reconciler 读。
