# 17 — dyna 跟着 skill 的合并与挪位适配

**Blocked by**：无——可立即开工（01–16 已落地）
**设计冻结**：不涉及 UI

## 要建什么

> 人的决定（2026-11-20）：「D1 我倾向于在这个PR里面解决，修改完skills，需要对dyna做适配」

01–16 号合并、删除、挪动了 skill 和它们的参考文件，dyna 命令行里给人和 agent 看的文字还指着旧位置。这张让 dyna 输出的每一处 skill 指称都指得到现在的东西：

- 已知的几处：写 `GLOSSARY.md` 不合格式时的提示指向已删的 glossary skill（规则现在在 wiki-conventions 的术语表参考里，节名以现在的为准）；SEO 额度缺项、旧「单次额度」的两条报错让人跑 `/idea-loop:seo-setup`（现在是 `/idea-loop:setup` 的 SEO 模块）；`--image-dir` 参数说明写着 seo-setup；扫描开的 SEO issue 正文让 triage 用 `idea-loop:seo-brief`（现在是 seo-writing 的 brief 分支）。
- 其余：dyna 源码（不含测试）里每一处 skill 名、skill 或参考文件路径、节名，逐个对着这条分支上的插件核一遍，指不到的改成现在的位置。代码注释里的也一起改。
- 对应的 Go 测试照新文字改。
- 命令说明文字有变的，重新生成这条分支上 dyna 当前版本的登记表。dyna 的版本号在这个 PR 里已经从 0.0.4 升到 0.0.5、还没发布：沿用 0.0.5，`dyna-version` 测试另有要求就照测试。插件要的最低版本不动。不发布。

## 验收标准

- [ ] dyna 源码（不含 `_test.go`）里的 skill 名、路径、节名逐个核过，交回里列一张表：位置 | 原来指向 | 现在指向 | 核对结果（指得到）。
- [ ] 上面四处已知的文字改完；对应 Go 测试改完。
- [ ] 全仓库搜不到 dyna 输出里指向 `idea-loop:evidence`、`idea-loop:glossary`、`idea-loop:seo-brief`、`idea-loop:seo-setup`、`/idea-loop:seo-setup`、`idea-loop:link-prospecting` 和已删目录路径的文字（登记表的历史版本 0.0.1–0.0.4 照原样，不改）。
- [ ] `cd dyna && go vet ./... && gofmt -l . && go test ./...` 全绿；node 全量测试除 plugin-version（预期红）外全绿；`dyna-scan`、`dyna-version` 绿。
- [ ] 不改任何命令的行为，只改文字。

## 选中的存量回归

- `dyna/internal/home` 的 glossary 测试、`dyna/internal/seo` 的 seomd、budget、issues、plans 测试：钉着要改的文字。
- `dyna-version`、`dyna-scan`、`session-start-inject` 测试：登记表与注入。
