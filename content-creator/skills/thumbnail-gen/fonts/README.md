# 自定义字体

将 `.ttf` 或 `.woff2` 字体文件放到此目录，HTML 模板会通过 `@font-face` 自动加载。

如果此目录为空，默认使用 Google Fonts CDN 的 **Noto Sans SC Black**。

## 推荐免费商用中文标题字体

| 字体 | 风格 | 下载 |
|------|------|------|
| 庞门正道标题体 | 粗黑、有力，封面标题首选 | [GitHub](https://github.com/nicechinesefont/PMZDTitle) |
| 优设标题黑 | 现代粗黑，适合科技主题 | [优设网](https://www.uisdc.com/uisdc-first-free-font) |
| 站酷高端黑 | 简洁大气 | [站酷](https://www.zcool.com.cn/special/zcoolfonts/) |
| 站酷快乐体 | 圆润活泼，适合生活类 | [站酷](https://www.zcool.com.cn/special/zcoolfonts/) |
| 思源黑体 Heavy | Google/Adobe 出品，字重丰富 | [Google Fonts](https://fonts.google.com/noto/specimen/Noto+Sans+SC) |

## 使用方式

下载字体文件后放入此目录，例如：

```
fonts/
├── PangMenZhengDao.ttf
├── YouSheTitleBlack.ttf
└── README.md
```

SKILL.md 生成 HTML 时会自动检测并用 `@font-face` 引入。
