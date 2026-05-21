---
last_updated: YYYY-MM-DD
---

<!--
  本文件是 SCHEMA / 格式示例参考——**不是实际档案，不要被原样拷贝**。
  comm-memory 引导问答后落到 ~/.memex/memory/user-profile.md。

  必读：${CLAUDE_PLUGIN_ROOT}/references/memory-index.md "Observation 格式（obsidian 原生）"

  Section 自由（"我的角色" / "我的沟通风格" / "禁忌" / "默认策略偏好" 是起点；
  你可以加 "## 情绪触发" / "## 体能节奏" / "## 不容妥协的边界" 等）。

  Observation = obsidian 原生：- <描述> #<type> (key:: val)
    - 用户画像里 #profile 是主力（角色 / 风格 / 禁忌 / 偏好）
    - #strategy 记"我哪种应对模式有效"——给 reply-coach 当默认策略推断依据
    - #behavior / #event 用户画像里少见，但允许（例：跟某类人系统性失效的模式）

  **当前用户的身份（飞书 ou_id 等）不写在这里**——运行时查 connector 的 identity 命令
  （lark：lark-cli auth status --format json | jq -r '.userOpenId'），可缓存进
  ~/.memex/config.json 的 connectors.<name>.self，但不进画像正文。
-->

## (示例 section — 我的角色)

- X 公司业务 PM，跟工程协作密集；汇报线给 Y leader，跨部门跟 Z VP 有强协作 #profile (source:: 口述)

## (示例 section — 我的沟通风格)

- 简洁直接、看数据、不爱铺垫；公开场合偏冷静，私下会更直白 #profile (source:: 口述)

## (示例 section — 禁忌)

- 不用"您"、不用感叹号、不用 emoji；不写 3 行以上的长段 #profile (severity:: high)
- 不在公开群说"非常感谢" / "烦请" / "如有任何问题" #profile (severity:: medium)

## (示例 section — 默认策略偏好)

- 没特别判断时默认就事论事；高 ego 对方时切柔和推进；推卸责任 / 越权时切强势推回 #profile (source:: 口述)

## (示例 section — 哪种应对对我历史有效)

- 就事论事 + 拉第三方 —— 反复验证有效 #strategy (outcome:: ✓) (scenario:: 跨部门高 ego 同事) (when:: long-term)
- 独自承担+硬扛 —— 反复证明只会被继续甩锅；要切"装傻+反向倒拉会议"模式 #strategy (outcome:: ✗) (scenario:: 模糊推责老板型) (when:: long-term)
