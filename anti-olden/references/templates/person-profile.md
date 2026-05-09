---
name: <中文姓名>
lark_user_id: ou_xxxxxxxxxxxxxxx
aliases: []                                    # 可选：群里别名 / 代号 / 英文名
department: <部门>
role: <角色 / 职级>
last_updated: YYYY-MM-DD
interaction_count: 0
---

<!--
  本文件是 SCHEMA / 格式示例参考——**不是实际档案，不要被原样拷贝**。
  建档时 AI 根据用户真实信号拼合适 section + entry，按下面格式落到 ~/.anti-olden/memory/persons/<pinyin>.md。

  必读：${CLAUDE_PLUGIN_ROOT}/references/memory-index.md "Observation 三维度（section / type / KV）"

  ## Section 名 = 自由
  Section 是给人读的主题分组，名字按这个人的真实维度起：
    "沟通风格" / "雷区" / "互动模式" / "有效策略" / "关系背景" 是常见起点（不是必填）。
    特殊维度自由开（"权力逻辑" / "兴趣点" / "家庭决定加班态度" / "承诺记录" / ...）。

  ## Type = 闭合 4 类
  每条 entry 一行 `-` 起头 + `[type | kv...]` 元数据 + 自然语言描述。type 严管：
    - [profile]   稳定特征 / 关系 / 雷区 / 风格（持久，不带日期；变化时改原条目而非新增）
    - [event]     一次性事件（必带 date）
    - [behavior]  模式命中（必带 pattern:§N + seen:N + last:dates）
    - [strategy]  策略验证（必带 outcome:✓/✗ + scenario + when）

  ## KV 元数据 = 自由
  按需加：source:口述/消息/会议 / severity:high/medium/low / revised:date / 任何模型觉得有用的字段。

  ## 修订
  Break-change 修订（旧记录有偏差 / 出入）→ **直接改原条目**，加 revised:YYYY-MM-DD KV + 一行
  括号备注说明改的原因。不保留旧条目作冗余。审计追踪靠 git diff + revised KV。
-->

## (示例 section — 沟通风格)

- [profile | source:消息]
  直接 / 看数据 / 不接情绪铺垫

- [profile | source:口述]
  群里发言密度高，DM 几乎不主动

## (示例 section — 雷区)

- [profile | severity:high]
  禁忌：在公开群当众反驳他的方案

## (示例 section — 互动模式)

- [behavior | pattern:§1 | seen:7 | last:2026-05-08, 2026-04-22, 2026-04-15]
  习惯性否定 —— 跟下属反复说"想得太简单"

- [event | date:2026-04-22 | severity:medium]
  产品周会上当众反问"这数据哪来的"，我没接他自己圆回去

## (示例 section — 有效策略)

- [strategy | outcome:✓ | scenario:跨部门冲突 | when:2026-04-21]
  就事论事 + 拉 PM 第三方 —— 复盘有效，没激化

- [strategy | outcome:✗ | scenario:公开施压 | when:2026-03-15 | revised:2026-05-09]
  柔和推进 —— 当时被解读成认怂，他变本加厉
  （revised:2026-05-09 —— 回看那段消息发现当时其实变本加厉，原 outcome:✓ 不准）

## (示例 section — 关系背景)

- [profile | source:口述]
  老婆在产品基础架构组 staff —— X 项目无形中代言那条线
