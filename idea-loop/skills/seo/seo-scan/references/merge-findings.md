# 合并各方向的发现

`seo-scan` 的「提 issue」第 1 步：把各方向文件里的发现拼成一个数组，去掉 `uncollected` 对象。`<运行目录>` 是本次扫描的运行目录，`<派出去的方向>` 是实际派了 agent 的方向。

```
node -e 'const fs=require("fs"),[d,...ds]=process.argv.slice(1);fs.writeFileSync(d+"/findings.json",JSON.stringify(ds.flatMap(x=>JSON.parse(fs.readFileSync(d+"/"+x+".json","utf8"))).filter(f=>!f.uncollected),null,2))' <运行目录> <派出去的方向>...
```
