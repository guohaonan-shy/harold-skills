# 多份矩阵一次跑

语言 × 深浅色这类多份矩阵，一次交给同一条命令：

```
dyna ui measure en-light.json zh-light.json en-dark.json zh-dark.json --json
```

- **一个浏览器，每份矩阵一个独立上下文**：不要每份矩阵各开一个进程，每个进程是另一个浏览器，内存按份数翻倍；也不用加 `--max-old-space-size`，截图在命令里直接解码比对，一格只占几 MB。
- **同时跑几份**由命令按本机此刻的可用内存（每份约 0.5 GiB，外加浏览器约 0.6 GiB）和空闲 CPU（每份约 1 核）自己定，最多 4 份，定下的份数和依据打在 stderr 第一行。机器忙时降到 1 份：CPU 不够时同时跑，测量层不受影响，但像素差会在 1% 阈值附近抖。`--concurrency N` 可以强行指定，同样不超过 4。
- **输出**：一份矩阵时 `--json` 是单份的形状；多份时是 `{ "matrices": [{ "matrix": <路径>, "findings", "瓶颈", "humanReviewCells" }, …] }`，有一份有发现退出码就是 `2`。
- **上一轮**：每份矩阵各记各的（`matrix.json` 记在同目录的 `.ui-measure-last.json`，别的文件名记在 `.ui-measure-last.<文件名>.json`），所以几份矩阵可以放在同一个目录。
