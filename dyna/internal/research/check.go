// Package research is the `research` module: the gate on what a research agent hands back.
//
// The researcher writes one self-contained index.html next to the screenshots it downloaded, and the calling
// session sends that file to the human without reading it. So the page has to be checkable without a model: this
// package judges its skeleton, never whether the reading of a reference is right and never what a chapter says.
//
// The page is a fixed sequence of chapters (human decision, review round 1: "the broad shape is fixed to this
// report; each chapter has a description, not a hard requirement"):
//
//  1. 研究问题: the page title (the named question handed to the researcher), the human's own words under the
//     heading 「研究问题」, and the product context handed with it;
//  2. 通用结论 (general): what these products agree on;
//  3. the sources: each with a title, a flow (ordered steps, each a screenshot AND a line saying what the step does,
//     the screenshot clickable to a larger picture), and two readings, 场景 / 设计逻辑;
//  4. 要我们决策的问题 (decisions): the last block of the page; nothing follows it.
//
// What the check enforces is exactly that skeleton: the chapters exist and are non-empty, they come in that order,
// nothing comes after the decisions, every flow step has its picture / line / zoom, and every picture on the page
// (the zoom dialog's own empty <img> excepted) has an address that is a relative path resolving inside the drop
// directory, so the page opens from a static server over its own directory and nothing points at a remote address
// that expires. What a chapter holds beyond that is the contract's prose and the human's reading, not a failing
// check. The two retired parts (cannot-answer, for-us) stay an error because a human annotation removed them by name.
//
// The page marks these parts with data-part attributes. A page with no source at all is legal only when a
// data-part="no-source" section says why.
package research

import (
	"fmt"
	"strings"
)

// Result is what the check found. Its JSON form is what `research submit --json` prints.
type Result struct {
	Valid   bool     `json:"valid"`
	Errors  []string `json:"errors"`
	Sources int      `json:"sources"`
}

var emptyHint = map[string]string{
	"human-words": "页面上要能看到人的原话，原样抄",
	"question":    "页面上要能看到交给调研 agent 的具名问题，原样抄",
	"context":     "页面上要能看到交给调研 agent 的产品上下文",
	"conclusion":  "结论要写",
}

// Check judges the page. fileExists says whether a path relative to the drop directory exists.
func Check(html string, fileExists func(rel string) bool) Result {
	root := parse(strip(html))
	errs := []string{}
	add := func(format string, a ...any) { errs = append(errs, fmt.Sprintf(format, a...)) }

	for _, part := range []string{"human-words", "question", "context", "conclusion"} {
		found := byPart(root, part)
		if len(found) == 0 {
			add(`缺少顶部的 %s（data-part="%s"）`, part, part)
		} else if textOf(found[0]) == "" {
			add("%s 是空的：%s", part, emptyHint[part])
		}
	}
	var words, conclusion *node
	if w := byPart(root, "human-words"); len(w) > 0 {
		words = w[0]
	}
	if words != nil {
		found := false
		for _, h := range headings(words) {
			if h == "研究问题" {
				found = true
			}
		}
		if !found {
			add("人的原话那一块的标题要写「研究问题」（<h3>研究问题</h3>，下面原样抄人的原话）")
		}
	}
	if c := byPart(root, "conclusion"); len(c) > 0 {
		conclusion = c[0]
	}
	if conclusion != nil {
		var general []*node
		for _, e := range walk(conclusion) {
			if e.attrs["data-part"] == "general" {
				general = append(general, e)
			}
		}
		if len(general) == 0 {
			add(`结论里缺 general（这些产品的通用结论；data-part="general"，放在 data-part="conclusion" 里面）`)
		} else if textOf(general[0]) == "" {
			add("结论的 general 是空的（这些产品的通用结论）：没有共同点也照实写一句")
		}
	}
	for _, gone := range []string{"cannot-answer", "for-us"} {
		if len(byPart(root, gone)) > 0 {
			add("%s 已取消：不再单列「不能回答什么」，也不在每个来源里写「对我们」；跟我们需求的结合只在页面最后的 decisions 里出现一次", gone)
		}
	}

	// decisions: one block, after every source (or the no-source note), outside the top conclusion, and the last
	// block of the page.
	all := walk(root)
	order := map[*node]int{}
	for i, e := range all {
		order[e] = i
	}
	var decisions, lastBody, firstBody *node
	if d := byPart(root, "decisions"); len(d) > 0 {
		decisions = d[0]
	}
	for _, e := range all {
		if has(e, "data-source") || e.attrs["data-part"] == "no-source" {
			lastBody = e
			if firstBody == nil {
				firstBody = e
			}
		}
	}
	if decisions == nil {
		add(`缺少 decisions（结合我们需求、要人决策的问题；data-part="decisions"，放在所有来源之后）`)
	} else {
		if textOf(decisions) == "" {
			add("decisions 是空的（结合我们需求、要人决策的问题）：没有分歧要人定，也照实写一句")
		}
		switch {
		case conclusion != nil && within(decisions, conclusion):
			add("decisions 不放在顶部的结论里：「结合我们需求、要人决策的问题」放在最后一个来源之后，作为页面的最后一块")
		case lastBody != nil && (within(decisions, lastBody) || order[decisions] < order[lastBody]):
			add("decisions 要放在最后一个来源之后：先让人看完各来源，再摆要人决策的问题")
		default:
			// placed correctly; now nothing may follow it: walk up, and at every level the later siblings must be
			// non-content (the zoom dialog and script are fine, a footer block is not).
			for n := decisions; n.parent != nil; n = n.parent {
				at := 0
				for i, c := range n.parent.children {
					if c == n {
						at = i
					}
				}
				var later []*node
				for _, c := range n.parent.children[at+1:] {
					if isContent(c) {
						later = append(later, c)
					}
				}
				if len(later) > 0 {
					part := ""
					if p := later[0].attrs["data-part"]; p != "" {
						part = fmt.Sprintf(` data-part="%s"`, p)
					}
					add("decisions 之后不能再有别的块（发现 <%s%s>）：「要我们决策的问题」是页面的最后一块，补充说明放进它前面的章节或删掉", later[0].tag, part)
					break
				}
			}
		}
	}

	// The head comes first: 研究问题 (title, the human's words, the context) -> 通用结论 -> the sources.
	if conclusion != nil {
		for _, part := range []string{"question", "human-words", "context"} {
			if el := byPart(root, part); len(el) > 0 && order[el[0]] > order[conclusion] {
				add("%s 要排在通用结论之前：页面的顺序是 研究问题与上下文 → 通用结论 → 各来源 → 要我们决策的问题", part)
			}
		}
		if firstBody != nil && order[firstBody] < order[conclusion] {
			add("通用结论要排在各来源之前：先说这些产品得出的共同点，再逐个摆来源")
		}
	}

	checked := map[*node]bool{}
	var sources []*node
	for _, e := range all {
		if has(e, "data-source") {
			sources = append(sources, e)
		}
	}
	if len(sources) == 0 {
		none := byPart(root, "no-source")
		if len(none) == 0 || textOf(none[0]) == "" {
			add(`没有任何来源：至少一个 data-source 小节，或者一个写明原因的 data-part="no-source"`)
		}
	}

	for i, src := range sources {
		var titleEl *node
		for _, e := range walk(src) {
			if e.attrs["data-part"] == "source-title" {
				titleEl = e
				break
			}
		}
		title := ""
		if titleEl != nil {
			title = textOf(titleEl)
		}
		name := fmt.Sprintf("第 %d 个来源", i+1)
		if title != "" {
			name = fmt.Sprintf("来源「%s」", title)
		} else {
			add(`%s没有标题（data-part="source-title"）`, name)
		}

		var flows []*node
		for _, e := range walk(src) {
			if e.attrs["data-part"] == "flow" {
				flows = append(flows, e)
			}
		}
		if len(flows) == 0 {
			add(`%s缺少 flow（data-part="flow"，按顺序排的截图）`, name)
		} else {
			var steps []*node
			for _, c := range flows[0].children {
				if c.tag == "li" {
					steps = append(steps, c)
				}
			}
			if len(steps) == 0 {
				add("%s的 flow 里没有任何一步（<li>）", name)
			}
			for n, li := range steps {
				var imgs []*node
				for _, e := range walk(li) {
					if e.tag == "img" {
						imgs = append(imgs, e)
					}
				}
				if len(imgs) == 0 {
					add("%s第 %d 步缺截图", name, n+1)
				}
				if textOf(li) == "" {
					add("%s第 %d 步缺说明：这一步在做什么", name, n+1)
				}
				for _, img := range imgs {
					checked[img] = true
					s := img.attrs["src"]
					shown := s
					if shown == "" {
						shown = "(无 src)"
					}
					switch {
					case !isRelative(s):
						add("%s第 %d 步的图 %s 不是落图目录内的相对路径", name, n+1, shown)
					case !fileExists(s):
						add("%s第 %d 步的图 %s 在落图目录里不存在", name, n+1, s)
					}
					zoom := img.parent
					for zoom != nil && zoom != li && !(zoom.tag == "a" && zoom.attrs["data-part"] == "zoom") {
						zoom = zoom.parent
					}
					if zoom == nil || zoom == li {
						add(`%s第 %d 步的图不能点开放大：用 <a data-part="zoom" href="…大图"> 包住 <img>`, name, n+1)
						continue
					}
					h := zoom.attrs["href"]
					hshown := h
					if hshown == "" {
						hshown = "(无 href)"
					}
					switch {
					case !isRelative(h):
						add("%s第 %d 步的放大地址 %s 不是落图目录内的相对路径", name, n+1, hshown)
					case !fileExists(h):
						add("%s第 %d 步的放大图 %s 在落图目录里不存在", name, n+1, h)
					}
				}
			}
		}

		for _, part := range []string{"scene", "logic"} {
			var found []*node
			for _, e := range walk(src) {
				if e.attrs["data-part"] == part {
					found = append(found, e)
				}
			}
			if len(found) == 0 || textOf(found[0]) == "" {
				add("%s缺 %s（场景 / 设计逻辑 两段都要有内容）", name, part)
			}
		}
	}

	// Every other picture on the page (in the conclusion, a source's readings, the decisions, ...) has the same
	// rule as a flow step's: a relative path that exists in the drop directory. The only picture exempt is the one
	// inside the zoom <dialog>: its src is set by the script at click time.
	for _, img := range all {
		if img.tag != "img" || checked[img] || hasAncestor(img, "dialog") {
			continue
		}
		s := img.attrs["src"]
		shown := s
		if shown == "" {
			shown = "(无 src)"
		}
		switch {
		case !isRelative(s):
			add("页面上的图 %s 不是落图目录内的相对路径：参考图都要下载到落图目录再引用，远程地址会过期", shown)
		case !fileExists(s):
			add("页面上的图 %s 在落图目录里不存在", s)
		}
	}

	return Result{Valid: len(errs) == 0, Errors: errs, Sources: len(sources)}
}

// Report is the human-readable form of a result.
func Report(r Result, file string) string {
	at := ""
	if file != "" {
		at = " (" + file + ")"
	}
	if r.Valid {
		return fmt.Sprintf("research-check: green ✓ %d 个来源%s", r.Sources, at)
	}
	lines := []string{"research-check: 调研页校验失败" + at + " —— 补齐后再交回："}
	for _, e := range r.Errors {
		lines = append(lines, "  - "+e)
	}
	return strings.Join(lines, "\n")
}
