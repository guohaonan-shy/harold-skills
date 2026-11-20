// Package fixture is a small, fictional design archive for tests: a recipe app with two pages.
//
// The same fixture backs the archive's parser and checker tests, the query tests, the writer, the sections
// tests and the MCP tests, and `dyna test fixture design-archive` writes it into a directory so a person (or a
// test of the plugin) can run `dyna design archive check` on it. The shape is spelled out here once:
//
//	cookbook   page   states: list (entry) → search-loading → search-results → recipe-saved
//	                          search-loading → search-failed   (system edge, blocked: no way to force it)
//	                          search-failed → search-loading   (retry)
//	pantry     page   states: overview → empty
//	cookbook--list ↔ pantry--overview are linked by NavBar edges (a cross-page jump both ways)
//	NavBar and RecipeCard are used by both pages; the other components by cookbook only
//	journeys: save-a-recipe (one page, a `via` because results → saved has two edges) and
//	          glance-at-pantry (list → pantry → list, spans two pages)
//
// Marketing is the same archive plus a long marketing page (`mkt-pricing`) whose entry state declares five
// sections — see its comment. Kept separate so the tests of pages without sections keep running on the
// unchanged fixture.
//
// Not a test: it has no assertions. A test takes Compliant() and bends one thing.
package fixture

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Files is a {relative path: content} map. A test removes a file with delete.
type Files map[string]string

// Clone is a copy a test can bend.
func (f Files) Clone() Files {
	out := Files{}
	for k, v := range f {
		out[k] = v
	}
	return out
}

func doc(fm, body string) string {
	return "---\n" + strings.TrimSpace(fm) + "\n---\n\n" + strings.TrimSpace(body) + "\n"
}

func decisionsAndCandidates(decisions, candidates string) string {
	return "## 决定\n\n" + decisions + "\n\n## 设计法候选\n\n" + candidates
}

func stateBody(screen, expect string) string {
	return "## 这一屏\n\n" + screen + "\n\n## 应看到什么\n\n" + expect
}

// SpecSlug and Base are the spec the fixture's decisions come from and the archive's directory.
const (
	SpecSlug = "demo-spec"
	Base     = "docs/design/prod"
)

// Compliant is the two-page archive; the checker finds nothing wrong with it.
func Compliant() Files {
	f := Files{}

	// ---------- docs around the archive ----------
	f["docs/index.md"] = "# 文档\n"
	f["docs/spec/"+SpecSlug+"/"+SpecSlug+".md"] = doc(
		"type: spec\nstatus: 在飞\ntags: [demo]\nsummary: 演示用 spec\nrelated: []",
		"# 演示 spec",
	)
	f["docs/spec/"+SpecSlug+"/tickets/01-first.md"] = "# 01 第一张\n"
	f["docs/spec/other-spec/tickets/01-first.md"] = "# 01 同名工单，豁免\n"

	f[Base+"/index.md"] = doc(
		"type: design-index\ntags: [design]\nsummary: 设计档案索引\nviewport: 1440x900\ntheme: light\nlocale: zh-CN",
		"# 设计档案\n",
	)

	// ---------- pages ----------
	f[Base+"/pages/cookbook/cookbook.md"] = doc(
		`type: design-page
tags: [cookbook]
summary: 菜谱主页：搜索、保存、进入食材库
code: [src/pages/cookbook.tsx]
regions:
  - { name: 顶部导航, component: "[[NavBar]]" }
  - { name: 搜索, component: "[[SearchBox]]" }
  - { name: 结果卡片, component: "[[RecipeCard]]" }`,
		"# 菜谱主页\n\n页面描述。\n\n"+decisionsAndCandidates(
			"### 决定 1：结果只显示一屏，不分页\n结果多于一屏时提示缩小关键词，不加载更多。\n- 为什么：用户搜索通常有明确目标，翻页带来的滚动位置丢失比多输一个词更贵。\n- 否掉过：无限滚动——返回时位置难以恢复。\n- 来源：[["+SpecSlug+"]]",
			"无",
		),
	)
	f[Base+"/pages/pantry/pantry.md"] = doc(
		`type: design-page
tags: [pantry]
summary: 食材库：现有食材一览
code: [src/pages/pantry.tsx]
regions:
  - { name: 顶部导航, component: "[[NavBar]]" }
  - { name: 食材卡片, component: "[[RecipeCard]]" }`,
		"# 食材库\n\n页面描述。\n\n"+decisionsAndCandidates("无", "无"),
	)

	// ---------- states: cookbook ----------
	f[Base+"/pages/cookbook/cookbook--list.md"] = doc(
		`type: design-state
tags: [cookbook]
summary: 菜谱主页的默认一屏
page: "[[cookbook]]"
entry:
  url: /cookbook
  preconditions: { account: 已登录的测试账号, data: 至少 3 份已保存菜谱 }
components: ["[[RecipeCard]]"]
edges:
  - id: search
    to: "[[cookbook--search-loading]]"
    kind: user
    component: "[[SearchBox]]"
    locate: { role: searchbox, name: 搜索菜谱 }
    action: 输入关键词并回车
  - id: open-pantry
    to: "[[pantry--overview]]"
    kind: user
    component: "[[NavBar]]"
    locate: { role: link, name: 食材库 }
    action: click
async:
  loading: "[[cookbook--search-loading]]"
  failure: "[[cookbook--search-failed]]"
  empty: 不适用`,
		"# cookbook--list\n\n"+stateBody("菜谱列表加上搜索框。", "- 列表里能看到已保存的菜谱卡片\n- 顶部有搜索框"),
	)
	f[Base+"/pages/cookbook/cookbook--search-loading.md"] = doc(
		`type: design-state
tags: [cookbook]
summary: 搜索请求进行中
page: "[[cookbook]]"
motions: ["[[spinner-ring]]"]
edges:
  - id: done
    to: "[[cookbook--search-results]]"
    kind: system
    trigger: 搜索请求完成
    how: 放行搜索请求
  - id: fail
    to: "[[cookbook--search-failed]]"
    kind: system
    trigger: 搜索请求失败
    how: 拦截搜索请求并返回 500
    blocked: { missing: 一个能让搜索接口稳定失败的开关, tried: [拦截搜索请求返回 500, 用空关键词搜索] }`,
		"# cookbook--search-loading\n\n"+stateBody("结果区域换成转圈。", "- 结果区域出现转圈"),
	)
	f[Base+"/pages/cookbook/cookbook--search-results.md"] = doc(
		`type: design-state
tags: [cookbook]
summary: 搜索结果
page: "[[cookbook]]"
components: ["[[RecipeCard]]"]
edges:
  - id: save
    to: "[[cookbook--recipe-saved]]"
    kind: user
    component: "[[SaveButton]]"
    locate: { role: button, name: 保存 }
    action: click
    motion: "[[save-pop]]"
  - id: save-key
    to: "[[cookbook--recipe-saved]]"
    kind: user
    component: "[[SaveButton]]"
    locate: { role: button, name: 保存 }
    action: 聚焦后按回车`,
		"# cookbook--search-results\n\n"+stateBody("结果卡片列表。", "- 每张卡片有保存按钮"),
	)
	f[Base+"/pages/cookbook/cookbook--search-failed.md"] = doc(
		`type: design-state
tags: [cookbook]
summary: 搜索失败
page: "[[cookbook]]"
edges:
  - id: retry
    to: "[[cookbook--search-loading]]"
    kind: user
    component: "[[RetryButton]]"
    locate: { role: button, name: 重试 }
    action: click`,
		"# cookbook--search-failed\n\n"+stateBody("结果区域换成失败提示。", "- 看到「搜索失败」和重试按钮"),
	)
	f[Base+"/pages/cookbook/cookbook--recipe-saved.md"] = doc(
		`type: design-state
tags: [cookbook]
summary: 菜谱已保存
page: "[[cookbook]]"
edges: []`,
		"# cookbook--recipe-saved\n\n"+stateBody("保存按钮变为已保存。", "- 按钮显示已保存"),
	)

	// ---------- states: pantry ----------
	f[Base+"/pages/pantry/pantry--overview.md"] = doc(
		`type: design-state
tags: [pantry]
summary: 食材库一览
page: "[[pantry]]"
components: ["[[RecipeCard]]"]
edges:
  - id: back
    to: "[[cookbook--list]]"
    kind: user
    component: "[[NavBar]]"
    locate: { role: link, name: 菜谱 }
    action: click
  - id: empty-shelf
    to: "[[pantry--empty]]"
    kind: system
    trigger: 食材全部用完
    how: 删除全部食材记录`,
		"# pantry--overview\n\n"+stateBody("食材卡片网格。", "- 看到食材卡片"),
	)
	f[Base+"/pages/pantry/pantry--empty.md"] = doc(
		`type: design-state
tags: [pantry]
summary: 食材库为空
page: "[[pantry]]"
edges: []`,
		"# pantry--empty\n\n"+stateBody("空状态插画。", "- 看到「还没有食材」"),
	)

	// ---------- components ----------
	component := func(name, summary string, usedBy []string, tokens, decisions string) string {
		quoted := make([]string, len(usedBy))
		for i, u := range usedBy {
			quoted[i] = `"[[` + u + `]]"`
		}
		return doc(
			"type: design-component\ntags: [component]\nsummary: "+summary+"\ncode: [src/components/"+name+".tsx]"+tokens+"\nusedBy: ["+strings.Join(quoted, ", ")+"]",
			"# "+name+"\n\n"+decisionsAndCandidates(decisions, "无"),
		)
	}
	f[Base+"/components/RecipeCard/RecipeCard.md"] = component("RecipeCard", "菜谱 / 食材卡片", []string{"cookbook", "pantry"},
		"\ntokens: [card-surface]",
		"### 决定 1：卡片标题最多两行\n第三行起截断。\n- 为什么：两行内能认出菜名，超出的是做法描述，不属于卡片。\n- 否掉过：无\n- 来源：[["+SpecSlug+"]]")
	f[Base+"/components/SearchBox/SearchBox.md"] = component("SearchBox", "搜索框", []string{"cookbook"}, "", "无")
	f[Base+"/components/SaveButton/SaveButton.md"] = component("SaveButton", "保存按钮", []string{"cookbook"}, "", "无")
	f[Base+"/components/RetryButton/RetryButton.md"] = component("RetryButton", "重试按钮", []string{"cookbook"}, "", "无")
	f[Base+"/components/NavBar/NavBar.md"] = component("NavBar", "顶部导航", []string{"cookbook", "pantry"}, "", "无")

	// ---------- motions ----------
	f[Base+"/motions/spinner-ring.md"] = doc(
		`type: design-motion
tags: [motion]
summary: 加载转圈
duration: "{motion.duration.base}"
easing: "{motion.easing.standard}"
properties: [transform]
iterations: infinite
reducedMotion: 改为静态圆环
usedBy: ["[[cookbook]]"]`,
		"# spinner-ring\n\n"+decisionsAndCandidates("无", "无"),
	)
	f[Base+"/motions/save-pop.md"] = doc(
		`type: design-motion
tags: [motion]
summary: 保存成功时图标弹一下
duration: 180ms
easing: cubic-bezier(0.34, 1.56, 0.64, 1)
deviates: 弹性曲线要有过冲，站内默认曲线没有过冲
properties: [transform]
iterations: 1
reducedMotion: 直接切换图标，不弹
usedBy: ["[[cookbook]]"]`,
		"# save-pop\n\n"+decisionsAndCandidates(
			"无",
			"- **成功反馈用一次过冲的缩放，不循环**\n  - 并进：Motion（新增一条原则）\n  - 为什么：循环的反馈读起来像还在进行中。\n  - 证据：[[save-pop]]",
		),
	)

	// ---------- journeys ----------
	f[Base+"/journeys/save-a-recipe.md"] = doc(
		`type: design-journey
tags: [journey]
summary: 搜到菜谱并保存
intent: 用户搜到一份菜谱并保存下来
path:
  - "[[cookbook--list]]"
  - "[[cookbook--search-loading]]"
  - { state: "[[cookbook--search-results]]", via: save }
  - "[[cookbook--recipe-saved]]"`,
		"# save-a-recipe\n\n"+decisionsAndCandidates("无", "无"),
	)
	f[Base+"/journeys/glance-at-pantry.md"] = doc(
		`type: design-journey
tags: [journey]
summary: 看一眼食材库再回来
intent: 用户在菜谱页中途看一眼食材库，再回到菜谱页
path:
  - "[[cookbook--list]]"
  - "[[pantry--overview]]"
  - "[[cookbook--list]]"`,
		"# glance-at-pantry\n\n"+decisionsAndCandidates("无", "无"),
	)

	return f
}

// The marketing page's names.
const (
	MKT          = "mkt-pricing"
	MKTEntry     = MKT + "--entry"
	MKTEntryFile = Base + "/pages/" + MKT + "/" + MKTEntry + ".md"
	// MKTSectionsYAML is the `sections` block of the marketing entry state.
	MKTSectionsYAML = `sections:
  - { id: header, locate: { role: banner } }
  - { id: hero, locate: { role: heading, name: 一个价格，没有隐藏项 } }
  - { id: feature-a, locate: { role: heading, name: 无限菜谱 } }
  - { id: feature-b, locate: { role: heading, name: 食材库同步 } }
  - { id: footer, locate: { role: contentinfo } }`
)

// Marketing is the compliant fixture plus a long marketing page.
//
//	mkt-pricing--entry (entry, 5 sections: header hero feature-a feature-b footer)
//	  header   → cookbook--list                       (user edge, `from` header)
//	  hero     → cookbook--list ; → itself, landing on feature-a (a same-page anchor: self-loop with `section`)
//	  feature-b→ mkt-pricing--feature-b-expanded      (user edge, `from` feature-b)
//	  footer   → cookbook--list
//	mkt-pricing--feature-b-expanded  a state inside the feature-b section (`section: mkt-pricing#feature-b`)
//	cookbook--list  gains an edge that jumps to mkt-pricing--entry and lands on feature-b (a cross-page `section`)
//	journey explore-pricing: cookbook--list → mkt-pricing--entry → mkt-pricing--feature-b-expanded
func Marketing() Files {
	f := Compliant()
	list := Base + "/pages/cookbook/cookbook--list.md"
	f[list] = strings.Replace(f[list], "async:", `  - id: see-pricing
    to: "[[`+MKTEntry+`]]"
    kind: user
    component: "[[NavBar]]"
    locate: { role: link, name: 价格 }
    action: click
    section: `+MKT+`#feature-b
async:`, 1)
	f[Base+"/pages/"+MKT+"/"+MKT+".md"] = doc(
		`type: design-page
tags: [marketing]
summary: 价格页：一个长的营销页
code: [src/pages/pricing.tsx]
regions:
  - { name: 顶栏, component: "[[SiteNav]]" }`,
		"# 价格页\n\n页面描述。\n\n"+decisionsAndCandidates("无", "无"),
	)
	f[MKTEntryFile] = doc(
		`type: design-state
tags: [marketing]
summary: 价格页的入口：整页分五段
page: "[[`+MKT+`]]"
entry:
  url: /pricing
  preconditions: { account: 未登录 }
`+MKTSectionsYAML+`
edges:
  - id: nav-home
    to: "[[cookbook--list]]"
    kind: user
    from: `+MKT+`#header
    component: "[[SiteNav]]"
    locate: { role: link, name: 菜谱 }
    action: click
  - id: start
    to: "[[cookbook--list]]"
    kind: user
    from: `+MKT+`#hero
    component: "[[CtaButton]]"
    locate: { role: button, name: 开始使用 }
    action: click
  - id: see-features
    to: "[[`+MKTEntry+`]]"
    kind: user
    from: `+MKT+`#hero
    section: `+MKT+`#feature-a
    component: "[[CtaButton]]"
    locate: { role: link, name: 看功能 }
    action: click（页内锚点，页面滚到「无限菜谱」）
  - id: expand
    to: "[[`+MKT+`--feature-b-expanded]]"
    kind: user
    from: `+MKT+`#feature-b
    component: "[[CtaButton]]"
    locate: { role: button, name: 展开细节 }
    action: click
  - id: footer-terms
    to: "[[cookbook--list]]"
    kind: user
    from: `+MKT+`#footer
    component: "[[SiteNav]]"
    locate: { role: link, name: 菜谱首页 }
    action: click`,
		"# "+MKTEntry+"\n\n"+stateBody("整页五段。", "- 顶栏、首屏标语、两个功能段、页脚都在"),
	)
	f[Base+"/pages/"+MKT+"/"+MKT+"--feature-b-expanded.md"] = doc(
		`type: design-state
tags: [marketing]
summary: 食材库同步一段展开了细节
page: "[[`+MKT+`]]"
section: `+MKT+`#feature-b
edges: []`,
		"# "+MKT+"--feature-b-expanded\n\n"+stateBody("「食材库同步」这一段展开了细节。", "- 看到展开后的细节"),
	)
	comp := func(name, summary string) string {
		return doc(
			"type: design-component\ntags: [component]\nsummary: "+summary+"\ncode: [src/components/"+name+".tsx]\nusedBy: [\"[["+MKT+"]]\"]",
			"# "+name+"\n\n"+decisionsAndCandidates("无", "无"),
		)
	}
	f[Base+"/components/SiteNav/SiteNav.md"] = comp("SiteNav", "营销页顶栏与页脚链接")
	f[Base+"/components/CtaButton/CtaButton.md"] = comp("CtaButton", "营销页按钮与锚点链接")
	f[Base+"/journeys/explore-pricing.md"] = doc(
		`type: design-journey
tags: [journey]
summary: 从菜谱页看价格页，展开一个功能的细节
intent: 用户从菜谱页去价格页，看一个功能的细节
path:
  - "[[cookbook--list]]"
  - "[[`+MKTEntry+`]]"
  - "[[`+MKT+`--feature-b-expanded]]"`,
		"# explore-pricing\n\n"+decisionsAndCandidates("无", "无"),
	)
	return f
}

// The state Shot gives edges with a `shot`.
const (
	ShotState     = "cookbook--search-results"
	ShotStateFile = Base + "/pages/cookbook/" + ShotState + ".md"
)

// Shot is the compliant fixture with a state whose `user` edges carry `shot` (the component is in a
// supplementary image rather than in the main viewport image): `cookbook--search-results` has three — `save` and
// `save-key` share `cookbook--search-results@save.png` (merged by screen), `save-all` has its own. The state does
// not declare `sections`. No image files are written; a test adds the ones it wants under the state's `assets/`.
func Shot() Files {
	f := Compliant()
	s := f[ShotStateFile]
	s = strings.Replace(s, "    action: click\n    motion: \"[[save-pop]]\"", "    action: click\n    shot: "+ShotState+"@save.png\n    motion: \"[[save-pop]]\"", 1)
	s = strings.Replace(s, "    action: 聚焦后按回车", `    action: 聚焦后按回车
    shot: `+ShotState+`@save.png
  - id: save-all
    to: "[[cookbook--recipe-saved]]"
    kind: user
    component: "[[SaveButton]]"
    locate: { role: button, name: 全部保存 }
    action: click
    shot: `+ShotState+`@save-all.png`, 1)
	f[ShotStateFile] = s
	return f
}

// WriteRepo writes the files under root (made when missing, a fresh temp directory when root is "") and returns it.
func WriteRepo(files Files, root string) (string, error) {
	if root == "" {
		var err error
		if root, err = os.MkdirTemp("", "design-archive-"); err != nil {
			return "", err
		}
	}
	rels := make([]string, 0, len(files))
	for rel := range files {
		rels = append(rels, rel)
	}
	sort.Strings(rels)
	for _, rel := range rels {
		abs := filepath.Join(root, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
			return "", fmt.Errorf("写不出 %s：%w", rel, err)
		}
		if err := os.WriteFile(abs, []byte(files[rel]), 0o644); err != nil {
			return "", fmt.Errorf("写不出 %s：%w", rel, err)
		}
	}
	return root, nil
}
