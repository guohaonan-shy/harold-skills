# issue 追踪的写法（GitHub 项目）

Linear 项目不走这份，照 [linear-setup.md](linear-setup.md)。按顺序：

1. **旧状态**：`dyna spec check` 报了还带 `status` 行的 spec，或仓库里还有旧中文 `status:*` label 的，先跑 `dyna issues migrate <docs>` 只列出会怎么改，给人看，人确认后加 `--apply`。
2. **label**：
   1. `dyna issues labels <docs>`：建出缺的 `status:*`、`kind:*`、`type:*` 和 `priority:*`（`priority:P0`、`priority:P1`、`priority:P2`），列出多余的 label 和各自在用的 open issue 数。
   2. 人选了要迁成分类的，对每个用着它的 issue 跑 `dyna issues type <docs> <号> <分类>`。
   3. 多余 label 的清单给人看，人确认后 `dyna issues labels <docs> --prune` 删掉，issue 上的也一起去掉。
3. **GitHub App**（人要用 bot 账号发评论时）：在 `~/.idea-loop/github-apps.json` 里加 `"<owner/repo>": { "appId": <id>, "privateKeyPath": "<路径>" }`。只写路径，私钥文件不打开。
