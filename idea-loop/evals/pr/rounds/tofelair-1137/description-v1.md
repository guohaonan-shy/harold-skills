## 问题

营销站 Interview 介绍页（`/interview`、`/zh/interview`）首屏下面是一段「免登录试一题」的样题区，占约 5 屏，几乎没人用；后端还为它开着两个不用登录就能调的打分接口，每调一次付一次打分费。

| 查的是什么 | 结果 | 出处 |
|---|---|---|
| 样题区在页面上占多少 | 从 800px 排到 4800px，滚过 5 屏才到功能介绍；点开要先授权麦克风 | 线上 1280 宽，2026-11-24 量 |
| 有多少人用 | 近 90 天两页共 59 个访客，样题开始事件 3 次，全是同一个人，最后一次 2026-10-11 | PostHog，截至 2026-11-24，没过滤测试账号（只会偏多） |
| L&R 的免登录打分接口 | 没有调用方：L&R 页的样题在 #797（2026-11-02）已删 | 前端代码搜调用，2026-11-24 |
| Interview 的免登录打分接口 | 走 Vertex 时打分请求被拒、报 400，试做的访客只看到报错 | #962 |

## 概要

整条样题链路全删，不加新东西：页面上的样题区、两个免登录打分接口（`POST /sample-analysis/interview`、`POST /sample-analysis/listen-repeat`）、只给样题用的提示词、限流、错误码、埋点事件（`sample_started` / `sample_completed` / `sample_gate`）、本地种子数据里两套样题练习。下图红色的每一步都没了：

![被删掉的整条样题链路，全部红色](img/sequence-interview-sample-removal.png)

样题删掉后，共享音频包 `@toeflair/audio`（app 和营销站共用的录音、听题代码）在营销站一处不用了，按「共享包只放两边都用的代码」整包搬进 app，文件原样挪、只改导入：

```diff
 frontend/
-  packages/audio/src/                 # 共享音频包，整包删
-    useAudioRecorder.ts, useQuestionAudio.ts
-    audioCache.ts, questionAudioUrl.ts, microphone.ts, containerHeader.ts
   app/src/
+    hooks/useAudioRecorder.ts, useQuestionAudio.ts       # 录音、听题 hook
+    services/audioCache.ts, questionAudioUrl.ts, microphone.ts, containerHeader.ts
   marketing/                          # 不再依赖音频包和 three 一族（只给样题的考官点阵头像用）
```

## 证据

- **之前**：线上 `/interview` 首屏下面是样题区（开头一屏加四张 AI 考官卡片），约 5 屏后才到功能介绍；不登录调两个打分地址，接口还在（测试输入被题号名单拒，返回 403）。
  **之后**：本分支首屏往下第一块就是功能介绍「Built for the spoken interview」，英文页总高从约 1 万像素降到约 6700，中文页同样；两个地址都返回 404。

![Interview 介绍页首屏之后：之前 / 之后](img/flow-before-after.png)

之前是线上截图（2026-11-25），之后是本分支本地营销站截图，红圈是首屏后的第一块。

```text
for 页面 in [/interview, /zh/interview]       # 读营销站生产构建出的 HTML
  断言 没有样题文案（Read one, / answer it. / Try it free / 读一题）
  断言 页面上没有样题区组件
  断言 首屏后的组件依次是：功能介绍 → 背题陷阱 → 怎么做到的 → 为什么分数可信

for 地址 in [/sample-analysis/interview, /sample-analysis/listen-repeat]
  不登录 POST 地址 → 404                     # 删前见红（403），删后见绿
```

- 学生 app 的听题、录音：音频包原有的 33 个单元测试原样搬进 app 并通过；本地用 QA 账号走完一整套 L&R（听题、录音、交卷、开始分析），控制台无报错。
- L&R 线上分析请求：发给模型的请求快照，除删掉的样题预览那一条，其余逐字节一致。
- 全量：后端、前端、营销站、文档四套 CI 全绿；类型检查、lint、死代码检查在改动行上 0 条。

没验成：真麦克风录音，无头浏览器没有麦克风，本地走查用的是开发模式的固定录音；靠录音相关的存量单元测试兜着，见「要你做的事」第一条。

## 合并风险

**门**：双向。撤销合并，样题区、两个免登录接口、共享音频包原样回来；生产库和存储没动，本地种子少的两套样题练习，撤销后重建本地库就回来。
**影响面**：营销站 Interview 介绍页（中英文）。合并后这页的搜索描述还写着「免费试一题，无需注册」，但试做入口已经没了，直到文案另改。
- 本地种子删了两套样题练习，其中 Study Habits Sampler 在本地是学生可练的上架状态，本地题库少一套（人 2026-11-24 定「种子也删除吧」）。
- 刻意没做：不重做 Interview 介绍页，其余各块的样式、文案、顺序都没动（人 2026-11-24 定只删样题）。
- 出人意料的一处：L&R 分析里只给样题用的「预览」提示词也删了（review 第 1 轮报出，夜里按推荐删），它挂在线上从不打开的开关上，线上会走的请求不变。

## 要你做的事

- [ ] 合并前：在真浏览器里用真麦克风走一题 L&R（听题 → 录音 → 交卷），录音能交上去、能出分析。

说「合并」即可。
