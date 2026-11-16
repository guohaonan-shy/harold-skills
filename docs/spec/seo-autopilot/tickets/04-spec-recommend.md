# 04 — SEO issue 的 spec 照推荐定，原则写进 SEO.md

**Blocked by**：无——可立即开工
**设计冻结**：不涉及 UI

## 要建什么
现在起草 spec 时还有「待定」就推送、停下等人；SEO 的 7 场决定记录里 6 场人的原话是「照推荐」。人说过的原则（如「数据只当佐证，不罗列」）没有地方存，每次要重说。

这一刀之后：
- issue-session 起草 spec 的参考（draft-spec）的「跟人定要 grill 的」开头加 SEO 分支：issue 带 `type:seo/*` 且 spec 没有「前端交互」小节时，「待定」逐条照推荐改写成决定，依据写「AI 照推荐定：<推荐的理由>」；「需要 grill」照 spec 已有的结论和 `SEO.md`「内容原则」自己答完、删掉标记；然后提交，不推送、不停下。有「前端交互」小节的，照 todo 会话现有的「起草中冒出了要人定的」翻回 triage。
- 同一参考的「输入」加一项：SEO issue 读 `SEO.md`「内容原则」，与已有的「先读方向 SEO skill 的原则文件」并列。
- `SEO.md` 新增「内容原则」节：每行一条原则加出处（人的原话、哪个 issue）。seo-setup 建 `SEO.md` 时建这一节（内容由项目自己填，插件只定节名和格式，不写任何项目的原则）；人以后说的新原则由当时的会话追加，跟着当时那个 issue 的 PR 走。seo-setup 的 `SEO.md` 格式参考同步加这一节；`seo-md.mjs` 能读出这一节（缺省为空，不报错）。
- 插件里举例用通用例子，不出现任何真实项目的名字（`no-project-leak.test.mjs` 守着）。

## 验收标准
- [x] draft-spec 有 SEO 分支，写明两个条件（`type:seo/*`、没有「前端交互」）、「AI 照推荐定：」的依据写法、不推送不停下、有「前端交互」的翻回 triage；`*-doc.test.mjs` 钉住（先对改前原文看它红）
- [x] draft-spec「输入」有读「内容原则」这一项
- [x] `SEO.md` 格式参考有「内容原则」节的格式；`seo-md.mjs` 读得出这一节，没有这一节时返回空、不报错（单元测试）
- [x] `no-project-leak.test.mjs` 通过
- [ ] idea-loop 全量测试通过 ⏭ 延后 → PR 交付验收：全量套件不在本机跑，PR 转 ready 后由 CI 在这个 head 上跑；本机跑了 SEO、文字钉子、runtime、issue 相关的 389 条，全绿

## 选中的存量回归
- `seo-scripts.test.mjs`：`seo-md.mjs` 的节名表加「内容原则」会碰到它的解析用例
- `no-project-leak.test.mjs`：新加的例子不能带项目名
