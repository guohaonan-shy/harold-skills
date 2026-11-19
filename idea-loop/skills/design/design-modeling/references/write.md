# 一次写入怎么走

新建、蒸馏、对账都走这一条。**模型起草，人批了才落笔。**

0. **找文件**：`git ls-files | grep -i 'DESIGN.md$'`。只有一份就地维护；有好几份（monorepo 的多个 app）问人这次动哪一份；没有就在仓库根新建，除非人指定了某个 app 目录。
1. **备份**当前版本到 `/tmp/design-md/before.md`。新建时没有这一步。
2. **起草**：在会话里摆出要加、要改、要删的每一处，旧文与新文并排，每处一句它为什么落在这一层。按「维护原则」先找受影响的已有内容，能整改的整改，缺口才追加。
3. **停下等人确认。** 人改过措辞以人的为准。人拒绝写文件，就把内容以文字交回。
4. **落笔**：只改人批过的几处。插件的 hook 会在每次写 `DESIGN.md` 时自动跑官方 lint。
5. **收尾校验**：

   ```
   npx -y @google/design.md@latest lint <DESIGN.md 路径>
   npx -y @google/design.md@latest diff /tmp/design-md/before.md <DESIGN.md 路径>
   ```

   `lint` 修到没有 error。`diff` 判为退化（新增了 error 或 warning）就修，或把这条 warning 摆给人并说明为什么可以接受。新版本 CLI 对老内容多报出来的 warning 不算这一次的退化，列进报告留给下一次对账。
6. **报告**：模式与依据；写进 `DESIGN.md` 的每一处（新增 / 修改 / 删除）；分到别处的各几条；校验结果；前后行数。
