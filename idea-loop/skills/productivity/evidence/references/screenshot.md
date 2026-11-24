# 截图标注

一张图讲一个画面上某处对不对：组件的截图，红色光圈圈出要看的地方，下面一两句说明。单张和 UI 流程图长得一样，同一条命令出图，不手画。

1. **截**：用『浏览器』里无头的那个（`dyna runtime show 浏览器`）。
   - 只截那个组件，必要时连同它弹出的浮层，不截整页。
   - 2 倍像素密度；用产物的主语言；手机宽度默认 390。
   - 截之前把页面带到要看的数据状态，组件处在静止态。
2. **标**：写一份 `dyna design flow compose` 的 JSON，一行一格：第一格没有箭头，`circles` 画光圈（坐标是截图的原始像素，圆心 x、y，半径 r），`caption` 写一两句说明。2 倍像素密度的截图 `scale` 填 0.5：

   ```json
   {
     "title": "提交中的登录按钮",
     "scale": 0.5,
     "rows": [
       { "steps": [
         { "image": "shots/login-submitting.png", "caption": "提交中：按钮变灰，文字换成转圈",
           "circles": [{ "x": 390, "y": 520, "r": 70 }] }
       ] }
     ]
   }
   ```

3. **出图**：`dyna design flow compose shot.json out.png`。JSON 的全部字段、命令的校验和解析不到 playwright 时的截图办法读 `${CLAUDE_PLUGIN_ROOT}/skills/productivity/evidence/references/ui-flow.md`。

完成条件：out.png 里光圈落在要看的那一处，说明写得出「对的样子」是什么。
