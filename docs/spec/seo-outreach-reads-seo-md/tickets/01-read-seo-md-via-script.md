# 01 — seo-outreach 与 seo-writing 用解析脚本读 SEO.md

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么

idea-loop 插件里有两个可被模型调用的 SEO skill：外联（seo-outreach）和站点文章写作（seo-writing）。它们读目标仓库根的 SEO.md 时，正文让 agent 去看 seo-setup 这个 skill 自己的参考文件（名叫 seo-md.md）里的格式说明。seo-setup 只能由人调用，agent 调不到；插件写法约定（writing-for-agents 的「引用另一个 skill」）也禁止一个 skill 读另一个 skill 的参考目录。

改完后：两个 skill 读 SEO.md 的那一步，跟 seo-audit、keyword-research 等其余 SEO skill 一样写成跑插件里的 SEO.md 解析脚本（`node "${CLAUDE_PLUGIN_ROOT}/scripts/seo-md.mjs" SEO.md`），从输出里取要的节；正文里不再出现指向 seo-setup 参考文件的文字。

- seo-outreach 的「输入」一节：读哪几节不变——「站点」、「竞品」、「写作」（文风文件与失败案例文件，脚本输出里在写作节的文风、失败案例两项）。没有 SEO.md 时停下让人跑 seo-setup 的处理不变。不碰它第 3 行的 description（另一个 issue 在改）。
- seo-writing 的「规则分两层」一节：去掉格式指针，开工读「写作」节那一步改成用这个脚本读出两个文件路径。没有 SEO.md 时只用通用规则的处理不变。
- 插件 README、seo-setup 自己、脚本注释里提到格式文档的地方不动（给人看或自己读自己，合规）。
- 插件版本升补丁档（规则在仓库 REVIEW.md「额外要求」），README 若有版本相关记录一并照规则处理。

## 验收标准

- [x] 加一条文档断言测试，放在守 seo-scan 同类问题（C1）的那个测试文件里，照它的写法：断言两份 SKILL.md 都不含 `seo-md.md`、不含指向 seo-setup 参考目录的文字，且都含 `seo-md.mjs`
- [x] 这条测试在改前的文本上是红的（用该测试文件支持的 `SEO_DOCS_ROOT` 指向改前副本，或先写测试后改文本），改后是绿的
- [x] 两份 SKILL.md 的读法与 seo-audit 的现存写法一致
- [x] 仓库 REVIEW.md 列的验证命令全过（含 no-project-leak 等插件测试）
- [x] idea-loop 的 `plugin.json` 版本升了补丁档

## 选中的存量回归

- `seo-params-doc.test.mjs` 全文件：新测试加在这里，原有 seo-scan 的 C1 断言不能被影响。
- `no-project-leak.test.mjs`：改了插件正文，要确认没带进项目信息。
