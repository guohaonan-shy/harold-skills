# 08 — ui 与 serve 模块

**Blocked by**：01 — dyna 入口、登记表、版本核对，issues 模块打通
**设计冻结**：不涉及 UI

## 要建什么

ui-measure、ui-png-compare、browser-lock 收成 `dyna ui …`；ui-compare、ui-measure-concurrency 是 `ui measure` 内部的包。新增 `dyna serve`：起、停静态服务器，自己挑空闲端口，打印地址。

通用要求（每个模块工单都一样）：命令照工单 01 的写法挂进命令树、标好调用方、进登记表；旧脚本的参数、输出、退出码不变（命令按动作起名，旧脚本名不再出现在命令里）；旧脚本先留着，不改 skill 文字（skill 迁移在工单 16–18，删旧实现在工单 19）。

## 验收标准

- [x] 对应旧脚本的行为测试断言全部搬成 `go test` 并通过（逐条对照，没搬的写理由）
- [x] `dyna serve start <目录>` 打印的地址能取到目录里的文件，`serve stop` 后端口释放
- [x] 两个进程同时取浏览器锁，第二个等待或按旧脚本的方式报错
- [x] `dyna registry --json` 里有这个模块的每条命令，调用方标注正确

## 选中的存量回归

- `ui-compare.test.mjs`、`ui-measure-concurrency.test.mjs`、`ui-png-compare.test.mjs`、`browser-lock.test.mjs`：行为基准

> 编排者补（2026-11-19，工单 10 交回时发现）：比较器对着旧脚本的差分测试间歇性失败，每次红在不同的随机用例（如 301、303），报「pixels 75 (<nil>), old 0x…」——失败信息把指针当值打印，比较的是浮点相等。

- [x] 补：比较器差分测试连跑 20 次都绿（`go test -count=20` 那一组）；失败信息打印的是值不是指针；若是新旧实现真的有浮点差，说出差在哪并按旧脚本的结果对齐

> 人的决定（2026-11-19）：D1 同意，用A（静态服务器空闲自动退出）

- [ ] 人的决定（2026-11-19）：`dyna serve start` 起的服务 30 分钟没有请求就自己退出（可用参数改时长，0 表示不退）；退出后端口释放，`serve stop` 对已退出的照旧不报错
