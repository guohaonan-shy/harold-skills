package research_test

import (
	"fmt"
	"regexp"
	"strings"
)

// step is one flow step of a source. zoom: "" is the thumbnail's larger sibling (…-full.png); noZoom leaves the
// picture unwrapped (not clickable); noLabel leaves the line out.
type step struct {
	src, label, zoom string
	noZoom, noLabel  bool
}

func st(src, label string) step           { return step{src: src, label: label} }
func stZoom(src, label, zoom string) step { return step{src: src, label: label, zoom: zoom} }
func stNoZoom(src, label string) step     { return step{src: src, label: label, noZoom: true} }
func stNoLabel(src string) step           { return step{src: src, noLabel: true} }
func everything(string) bool              { return true }
func onlyExcept(missing ...string) func(string) bool {
	return func(p string) bool {
		for _, m := range missing {
			if p == m {
				return false
			}
		}
		return true
	}
}

// sourceCfg is one well-formed source section; every test starts from this and bends one thing.
type sourceCfg struct {
	title        string
	steps        []step
	scene, logic string
}

func defaultSource() sourceCfg {
	return sourceCfg{
		title: "Acme · 退出确认",
		steps: []step{st("shots/acme-1.png", "点右上角 X"), st("shots/acme-2.png", "弹出确认")},
		scene: "练习中途想退出",
		logic: "二次确认防误触",
	}
}

func (c sourceCfg) html() string {
	var steps []string
	for _, s := range c.steps {
		img := fmt.Sprintf(`<img src="%s" alt="">`, s.src)
		zoom := s.zoom
		if zoom == "" {
			zoom = strings.Replace(s.src, ".png", "-full.png", 1)
		}
		pic := fmt.Sprintf(`<a data-part="zoom" href="%s">%s</a>`, zoom, img)
		if s.noZoom {
			pic = img
		}
		label := ""
		if !s.noLabel {
			label = "<p>" + s.label + "</p>"
		}
		steps = append(steps, "    <li>"+pic+label+"</li>")
	}
	return fmt.Sprintf(`
<section data-source>
  <h2 data-part="source-title">%s</h2>
  <ol data-part="flow">
%s
  </ol>
  <div data-part="scene">%s</div>
  <div data-part="logic">%s</div>
</section>`, c.title, strings.Join(steps, "\n"), c.scene, c.logic)
}

func source() string { return defaultSource().html() }

func sourceWith(f func(*sourceCfg)) string {
	c := defaultSource()
	f(&c)
	return c.html()
}

type pageCfg struct {
	wordsHeading, humanWords, question, context, general, decisions string
	sources                                                         []string
}

func defaultPage() pageCfg {
	return pageCfg{
		wordsHeading: "研究问题",
		humanWords:   "练习做到一半点退出时要弹一个确认：入口用 X 还是返回箭头？",
		question:     "退出确认：入口用 X 还是箭头、弹窗怎么摆",
		context:      "Acme 的口语练习，移动端；DESIGN.md 在项目根。",
		general:      "<p>多数产品用二次确认，危险按钮在下。</p>",
		decisions:    "<ol><li>入口：X 还是返回箭头？Acme 用 X，Beta 用箭头。</li></ol>",
		sources:      []string{source()},
	}
}

func (c pageCfg) html() string {
	return fmt.Sprintf(`<!doctype html>
<html><head><meta charset="utf-8"><title>调研</title><style>.x{color:red}</style></head><body>
<h1 data-part="question">%s</h1>
<section data-part="brief"><div data-part="human-words"><h3>%s</h3>%s</div><div data-part="context">%s</div></section>
<section data-part="conclusion"><div data-part="general">%s</div></section>
%s
<section data-part="decisions-block"><div data-part="decisions">%s</div></section>
</body></html>`, c.question, c.wordsHeading, c.humanWords, c.context, c.general, strings.Join(c.sources, "\n"), c.decisions)
}

func page() string { return defaultPage().html() }

func pageWith(f func(*pageCfg)) string {
	c := defaultPage()
	f(&c)
	return c.html()
}

// replaceRe is html.replace(/re/, repl) for the first match only.
func replaceRe(html, pattern, repl string) string {
	re := regexp.MustCompile(pattern)
	loc := re.FindStringIndex(html)
	if loc == nil {
		return html
	}
	return html[:loc[0]] + repl + html[loc[1]:]
}

var decisionsBlock = `(?s)<section data-part="decisions-block">.*?</section>`

// blocksOf are the page's top-level blocks, in order: title, brief, conclusion, each source, decisions.
func blocksOf(html string) []string {
	body := strings.TrimSpace(html[strings.Index(html, "<body>")+6 : strings.Index(html, "</body>")])
	var blocks []string
	for _, line := range strings.Split(body, "\n") {
		if len(blocks) == 0 || strings.HasPrefix(line, "<h1") || strings.HasPrefix(line, "<section") {
			blocks = append(blocks, line)
			continue
		}
		blocks[len(blocks)-1] += "\n" + line
	}
	return blocks
}

func assemble(blocks ...string) string {
	return `<!doctype html><html><head><meta charset="utf-8"><title>调研</title></head><body>` + "\n" + strings.Join(blocks, "\n") + "\n</body></html>"
}
