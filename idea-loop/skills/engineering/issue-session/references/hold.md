# 先放着

人说先放着（会话的任何一步）时读这份。交付：知识库改动和代码都留在远端，issue 回 backlog，评论写着停在哪；完成后回会话的「收尾」。

1. 已写的知识库改动提交到 home。
2. 已有分支且有未推送的代码提交，用 `dyna git push` 推上去。
3. `dyna issues set <docs> backlog $ARGUMENTS --comment=<停在哪个阶段、有分支就写分支名>`。

下一个会话读这条评论接上。
