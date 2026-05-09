---
group_name: <群名>
chat_id: oc_xxxxxxxxxxxxxxx
last_updated: YYYY-MM-DD
---

<!--
  本文件是 SCHEMA / 格式示例参考——**不是实际档案，不要被原样拷贝**。
  建档时 AI 按群的真实形态拼 section，按下面格式落到 ~/.anti-olden/memory/groups/<pinyin>.md。

  必读：${CLAUDE_PLUGIN_ROOT}/references/memory-index.md "Observation 三维度（section / type / KV）"

  Section 自由（"群氛围" / "关键人物" / "话题基线" / "近期简报" / "注意事项" 是起点；
  项目群可加 "## 里程碑时间线"，跨部门群可加 "## 各方立场"，八卦群可不要 "## 注意事项"）。

  Frontmatter 里只有 `chat_id` 是机器字段（用于路由）。拉取状态（last_fetched_*）归
  ~/.anti-olden/raw/chats/<chat_id>/_meta.json，**本文件不放 IO 状态**。

  Type 闭合 4 类（profile / event / behavior / strategy）+ KV 自由。详见 memory-index.md。

  **关键人物 section 特殊约定**：仅放群内有飞书账号的成员（除我以外），
  每人对应一个 ~/.anti-olden/memory/persons/<X>.md，本档案里只写他**在此群**的独特表现。
  口头提到但无飞书账号的外部人物 → 写到 "话题基线" 或 "近期简报"。
-->

## (示例 section — 群氛围)

- [profile | source:消息]
  正式偏严肃，老板在群但不常说话；周报周一早 9:30 准点发

- [profile | source:口述]
  跨部门立场对立，业务和工程时常掰头

## (示例 section — 关键人物)

- [profile | source:消息]
  张三（persons/zhang-san.md）在本群密度高 / 立场鲜明，跟 DM 安静形成反差

- [behavior | pattern:§4 | seen:3 | last:2026-05-08, 2026-04-22, 2026-04-15]
  李四常越权对工程实现给"建议"——每次都在周三周会后

## (示例 section — 话题基线)

- [profile | source:消息]
  常聊：里程碑追踪 / 客诉投诉 / 跨部门协作摩擦
  常被口头提及的外部人物：王老板（业务 lead）、赵 PM（友 team）

## (示例 section — 近期简报)

- [event | date:2026-05-09 | mode:增量]
  本周 X 项目立场分歧扩大，业务推进度，工程推质量门槛

- [event | date:2026-04-25 | mode:增量]
  Q2 OKR 对齐会后氛围明显紧绷

## (示例 section — 注意事项)

- [profile | severity:high]
  老板在群时不要 @ 全体；他敏感于"被吵"
