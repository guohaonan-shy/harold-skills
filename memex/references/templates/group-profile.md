---
group_name: <群名>
connector: lark                                # 群是平台独立的：飞书群 ≠ 微信群
chat_id: oc_xxxxxxxxxxxxxxx
last_updated: YYYY-MM-DD
---

<!--
  本文件是 SCHEMA / 格式示例参考——**不是实际档案，不要被原样拷贝**。
  建档时 AI 按群的真实形态拼 section，按下面 obsidian 原生格式落到
  ~/.memex/memory/groups/<pinyin>.md。

  必读：${CLAUDE_PLUGIN_ROOT}/references/memory-index.md "Observation 格式（obsidian 原生）"

  ## Frontmatter：connector + chat_id 是路由键
  群平台独立——同名飞书群和微信群是两份档案，各自 connector + chat_id。运行时按
  <connector> + <chat_id> glob groups/*.md 匹配。拉取状态（last_fetched_*）归
  ~/.memex/raw/<connector>/chats/<chat_id>/_meta.json，**本文件不放 IO 状态**。

  ## Section 自由
  "群氛围" / "关键人物" / "话题基线" / "近期简报" / "注意事项" 是起点；项目群可加
  "## 里程碑时间线"，跨部门群可加 "## 各方立场"，八卦群可不要 "## 注意事项"。

  ## Observation = obsidian 原生（详见 memory-index.md）
    - <描述> #<type> (key:: val) → [[provenance]]
  type 闭合 4 类（#profile / #event / #behavior / #strategy）+ inline field 自由 + [[link]]。

  **关键人物 section 特殊约定**：仅放群内有该平台账号的成员（除我以外），每人对应一个
  persons/<X>.md（用 [[persons/X]] link 过去），本档案里只写他**在此群**的独特表现。
  口头提到但无账号的外部人物 → 写到 "话题基线" 或 "近期简报"。
-->

## (示例 section — 群氛围)

- 正式偏严肃，老板在群但不常说话；周报周一早 9:30 准点发 #profile (source:: 消息)
- 跨部门立场对立，业务和工程时常掰头 #profile (source:: 口述)

## (示例 section — 关键人物)

- [[persons/zhang-san]] 在本群密度高 / 立场鲜明，跟 DM 安静形成反差 #profile (source:: 消息)
- [[persons/li-si]] 常越权对工程实现给"建议"——每次都在周三周会后 #behavior (pattern:: §4) (seen:: 3) (last:: 2026-05-08, 2026-04-22, 2026-04-15) → [[lark/chats/kuabumen-zhouhui/2026-05#^omxyz]]

## (示例 section — 话题基线)

- 常聊：里程碑追踪 / 客诉投诉 / 跨部门协作摩擦 #profile (source:: 消息)
- 常被口头提及的外部人物：王老板（业务 lead）、赵 PM（友 team） #profile (source:: 消息)

## (示例 section — 近期简报)

- 本周 [[topics/x-xiangmu]] 立场分歧扩大，业务推进度，工程推质量门槛 #event (date:: 2026-05-09)
- Q2 OKR 对齐会后氛围明显紧绷 #event (date:: 2026-04-25)

## (示例 section — 注意事项)

- 老板在群时不要 @ 全体；他敏感于"被吵" #profile (severity:: high)
