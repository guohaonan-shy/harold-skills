package research_test

import (
	"fmt"
	"regexp"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/research"
)

// These are the assertions of the old research-check.test.mjs, one for one.

func errorsOf(html string) []string { return research.Check(html, everything).Errors }

func anyHas(errs []string, parts ...string) bool {
	for _, e := range errs {
		ok := true
		for _, p := range parts {
			if !strings.Contains(e, p) {
				ok = false
			}
		}
		if ok {
			return true
		}
	}
	return false
}

func mustBeClean(t *testing.T, html string) {
	t.Helper()
	if errs := errorsOf(html); len(errs) != 0 {
		t.Fatalf("want no errors, got:\n%s", strings.Join(errs, "\n"))
	}
}

func mustHave(t *testing.T, errs []string, parts ...string) {
	t.Helper()
	if !anyHas(errs, parts...) {
		t.Fatalf("no error with %q in:\n%s", parts, strings.Join(errs, "\n"))
	}
}

func TestAPageWithTheQuestionBlockTheGeneralConclusionOneCompleteSourceAndTheDecisionsAfterItIsValid(t *testing.T) {
	r := research.Check(page(), everything)
	if len(r.Errors) != 0 || !r.Valid || r.Sources != 1 {
		t.Fatalf("%+v", r)
	}
}

func TestAnEmptyOrMissingTopPartFailsAndNamesIt(t *testing.T) {
	tags := map[string]string{"human-words": "div", "question": "h1", "context": "div"}
	for _, part := range []string{"human-words", "question", "context"} {
		tag := tags[part]
		re := fmt.Sprintf(`(?s)<%s data-part="%s">.*?</%s>`, tag, part, tag)
		missing := replaceRe(page(), re, "")
		mustHave(t, errorsOf(missing), part)
		blank := replaceRe(page(), re, fmt.Sprintf(`<%s data-part="%s">  </%s>`, tag, part, tag))
		mustHave(t, errorsOf(blank), part)
	}
}

func TestAPageWithoutGeneralOrDecisionsOrWithThemEmptyFailsAndNamesThem(t *testing.T) {
	for _, part := range []string{"general", "decisions"} {
		missing := replaceRe(page(), fmt.Sprintf(`(?s)<div data-part="%s">.*?</div>`, part), "")
		mustHave(t, errorsOf(missing), part)
		blank := pageWith(func(c *pageCfg) {
			if part == "general" {
				c.general = "  "
			} else {
				c.decisions = "  "
			}
		})
		mustHave(t, errorsOf(blank), part)
	}
}

func TestGeneralCountsOnlyInsideTheConclusion(t *testing.T) {
	outside := replaceRe(page(), `(?s)<section data-part="conclusion">.*?</section>`, `<section data-part="conclusion"><p>结论</p></section><div data-part="general">x</div>`)
	mustHave(t, errorsOf(outside), "general")
}

func TestTheHumanWordsBlockMustBeHeadedResearchQuestion(t *testing.T) {
	e := errorsOf(pageWith(func(c *pageCfg) { c.wordsHeading = "人的原话" }))
	mustHave(t, e, "研究问题")
	mustBeClean(t, pageWith(func(c *pageCfg) { c.wordsHeading = "研究问题" }))
}

func TestDecisionsInsideTheTopConclusionOrBeforeTheLastSourceFails(t *testing.T) {
	inConclusion := replaceRe(page(), `<div data-part="general">`, `<div data-part="decisions"><ol><li>x</li></ol></div><div data-part="general">`)
	inConclusion = replaceRe(inConclusion, decisionsBlock, "")
	mustHave(t, errorsOf(inConclusion), "decisions", "结论里")

	two := pageWith(func(c *pageCfg) {
		c.sources = []string{source(), sourceWith(func(s *sourceCfg) { s.title = "Beta · 退出" })}
	})
	before := replaceRe(two, decisionsBlock, "")
	before = replaceRe(before, `<section data-source>`, `<section data-part="decisions"><ol><li>x</li></ol></section><section data-source>`)
	mustHave(t, errorsOf(before), "decisions", "最后一个来源之后")

	insideSource := replaceRe(page(), decisionsBlock, "")
	insideSource = replaceRe(insideSource, `(?s)</section>\s*</body>`, `<div data-part="decisions"><ol><li>x</li></ol></div></section></body>`)
	mustHave(t, errorsOf(insideSource), "decisions", "最后一个来源之后")
}

func TestTheSourcesBeforeTheGeneralConclusionOrBeforeTheResearchQuestionFail(t *testing.T) {
	b := blocksOf(page())
	h1, brief, conclusion, src, decisions := b[0], b[1], b[2], b[3], b[4]
	mustBeClean(t, assemble(h1, brief, conclusion, src, decisions)) // control

	e := errorsOf(assemble(h1, brief, src, conclusion, decisions))
	mustHave(t, e, "通用结论要排在各来源之前")

	e = errorsOf(assemble(src, h1, brief, conclusion, decisions))
	mustHave(t, e, "通用结论要排在各来源之前")
}

func TestTheQuestionBlockTheContextOrTheTitleAfterTheGeneralConclusionFails(t *testing.T) {
	b := blocksOf(page())
	h1, brief, conclusion, src, decisions := b[0], b[1], b[2], b[3], b[4]
	e := errorsOf(assemble(h1, conclusion, brief, src, decisions))
	mustHave(t, e, "human-words", "通用结论之前")
	mustHave(t, e, "context", "通用结论之前")

	e2 := errorsOf(assemble(brief, conclusion, h1, src, decisions))
	mustHave(t, e2, "question", "通用结论之前")
}

func TestAnotherBlockAfterTheDecisionsFailsAtAnyNestingButTheZoomDialogAndItsScriptAreFine(t *testing.T) {
	footer := `<section data-part="footer"><p>附：本次搜索过程说明</p></section>`
	e := errorsOf(strings.Replace(page(), "</body>", footer+"</body>", 1))
	mustHave(t, e, "decisions 之后不能再有别的块", "footer")

	// a plain trailing paragraph / heading with no data-part is a block too
	e = errorsOf(strings.Replace(page(), "</body>", "<p>谢谢阅读</p></body>", 1))
	mustHave(t, e, "decisions 之后不能再有别的块")

	// inside the same wrapper as the decisions
	e = errorsOf(strings.Replace(page(), "</div></section>\n</body>", `</div><div data-part="notes">备注</div></section>`+"\n</body>", 1))
	mustHave(t, e, "decisions 之后不能再有别的块")

	// the page wrapped in <main>
	wrapped := strings.Replace(page(), "<h1", "<main><h1", 1)
	wrapped = strings.Replace(wrapped, "</body>", footer+"</main></body>", 1)
	mustHave(t, errorsOf(wrapped), "decisions 之后不能再有别的块")

	tail := `<dialog id="zoom"><img alt=""></dialog><script>const dlg = document.getElementById("zoom");</script>`
	mustBeClean(t, strings.Replace(page(), "</body>", tail+"</body>", 1))
}

func TestWhatAChapterHoldsIsNotEnforced(t *testing.T) {
	extraConclusion := strings.Replace(page(), "</div></section>\n<section data-source>", `</div><div data-part="process"><p>哪些来源没放进来</p></div></section>`+"\n<section data-source>", 1)
	mustBeClean(t, extraConclusion)
	third := pageWith(func(c *pageCfg) {
		c.sources = []string{strings.Replace(source(), "</section>", `<div data-part="takeaway"><h3>补充</h3><p>可以借鉴</p></div></section>`, 1)}
	})
	mustBeClean(t, third)
	mustBeClean(t, pageWith(func(c *pageCfg) {
		c.sources = []string{sourceWith(func(s *sourceCfg) { s.steps = []step{stZoom("elsewhere/a.png", "点 X", "elsewhere/a-full.png")} })}
	}))
}

func TestASourceWhoseSceneOrLogicIsEmptyFailsAndSaysWhichSource(t *testing.T) {
	for _, part := range []string{"scene", "logic"} {
		r := research.Check(pageWith(func(c *pageCfg) {
			c.sources = []string{source(), sourceWith(func(s *sourceCfg) {
				s.title = "Beta · 退出"
				if part == "scene" {
					s.scene = ""
				} else {
					s.logic = ""
				}
			})}
		}), everything)
		if r.Valid {
			t.Fatal(part, "valid")
		}
		mustHave(t, r.Errors, "Beta · 退出", part)
	}
}

func TestTheRetiredPartsFail(t *testing.T) {
	withCannot := strings.Replace(page(), "</body>", `<section data-part="cannot-answer"><p>…</p></section></body>`, 1)
	mustHave(t, errorsOf(withCannot), "cannot-answer", "取消")
	withForUs := pageWith(func(c *pageCfg) {
		c.sources = []string{strings.Replace(source(), "</section>", `<div data-part="for-us">保留二次确认</div></section>`, 1)}
	})
	mustHave(t, errorsOf(withForUs), "for-us", "取消")
}

func TestASourceWithNoFlowOrAFlowStepWithNoLabelFails(t *testing.T) {
	noFlow := replaceRe(source(), `(?s)<ol data-part="flow">.*?</ol>`, "")
	r := research.Check(pageWith(func(c *pageCfg) { c.sources = []string{noFlow} }), everything)
	if r.Valid {
		t.Fatal("valid")
	}
	mustHave(t, r.Errors, "flow")

	r = research.Check(pageWith(func(c *pageCfg) {
		c.sources = []string{sourceWith(func(s *sourceCfg) { s.steps = []step{st("shots/a.png", "点 X"), stNoLabel("shots/b.png")} })}
	}), everything)
	if r.Valid {
		t.Fatal("valid")
	}
	mustHave(t, r.Errors, "第 2 步", "说明")
}

func TestAFlowStepWithoutAScreenshotFails(t *testing.T) {
	md := strings.Replace(source(), `<img src="shots/acme-2.png" alt="">`, "", 1)
	r := research.Check(pageWith(func(c *pageCfg) { c.sources = []string{md} }), everything)
	if r.Valid {
		t.Fatal("valid")
	}
	mustHave(t, r.Errors, "第 2 步", "截图")
}

func TestAScreenshotThatCannotBeClickedToEnlargeFails(t *testing.T) {
	e := errorsOf(pageWith(func(c *pageCfg) {
		c.sources = []string{sourceWith(func(s *sourceCfg) { s.steps = []step{stNoZoom("shots/a.png", "点 X")} })}
	}))
	mustHave(t, e, "第 1 步", "放大")
	// a link without data-part="zoom" is not the contract
	plain := regexp.MustCompile(`<a data-part="zoom" href="[^"]*">(<img[^>]*>)</a>`).ReplaceAllString(source(), `<a href="shots/x.png">$1</a>`)
	mustHave(t, errorsOf(pageWith(func(c *pageCfg) { c.sources = []string{plain} })), "放大")
}

func TestEveryReferencedImageAndZoomTargetMustExistNextToThePage(t *testing.T) {
	seen := map[string]bool{}
	r := research.Check(page(), func(p string) bool {
		seen[p] = true
		return p != "shots/acme-2.png" && p != "shots/acme-1-full.png"
	})
	if r.Valid {
		t.Fatal("valid")
	}
	mustHave(t, r.Errors, "shots/acme-2.png", "不存在")
	mustHave(t, r.Errors, "shots/acme-1-full.png", "不存在")
	var got []string
	for p := range seen {
		got = append(got, p)
	}
	want := map[string]bool{"shots/acme-1-full.png": true, "shots/acme-1.png": true, "shots/acme-2-full.png": true, "shots/acme-2.png": true}
	if len(got) != len(want) {
		t.Fatal(got)
	}
	for _, p := range got {
		if !want[p] {
			t.Fatal(got)
		}
	}
}

var badAddresses = []string{"https://images.refero.design/a.png", "http://x/a.png", "//cdn/a.png", "/abs/a.png", "file:///tmp/a.png", "../outside.png", "data:image/png;base64,AAAA"}

func TestAnImageOrZoomAddressThatIsNotARelativePathInsideTheDropDirectoryFails(t *testing.T) {
	for _, bad := range badAddresses {
		r := research.Check(pageWith(func(c *pageCfg) {
			c.sources = []string{sourceWith(func(s *sourceCfg) { s.steps = []step{st(bad, "点 X")} })}
		}), everything)
		if r.Valid || !anyHas(r.Errors, bad, "相对") {
			t.Fatalf("image %s: %v", bad, r.Errors)
		}
		r = research.Check(pageWith(func(c *pageCfg) {
			c.sources = []string{sourceWith(func(s *sourceCfg) { s.steps = []step{stZoom("shots/a.png", "点 X", bad)} })}
		}), everything)
		if r.Valid || !anyHas(r.Errors, bad, "相对") {
			t.Fatalf("zoom %s: %v", bad, r.Errors)
		}
	}
}

func TestAPictureOutsideTheFlowStepsIsHeldToTheSameAddressRule(t *testing.T) {
	makers := map[string]func(src string) string{
		"conclusion": func(src string) string {
			return pageWith(func(c *pageCfg) { c.general = fmt.Sprintf(`<p>多数用二次确认。</p><img src="%s" alt="">`, src) })
		},
		"decisions": func(src string) string {
			return pageWith(func(c *pageCfg) {
				c.decisions = fmt.Sprintf(`<ol><li>入口：X 还是箭头？<img src="%s" alt=""></li></ol>`, src)
			})
		},
		"scene": func(src string) string {
			return pageWith(func(c *pageCfg) {
				c.sources = []string{sourceWith(func(s *sourceCfg) { s.scene = fmt.Sprintf(`练习中途想退出 <img src="%s" alt="">`, src) })}
			})
		},
	}
	for name, make := range makers {
		for _, bad := range []string{"https://images.refero.design/x.jpg", "//cdn/x.jpg", "/abs/x.jpg", "../outside.jpg", "data:image/png;base64,AAAA"} {
			e := errorsOf(make(bad))
			if !anyHas(e, bad, "相对") {
				t.Fatalf("%s %s: %v", name, bad, e)
			}
		}
		missing := research.Check(make("shots/gone.png"), onlyExcept("shots/gone.png")).Errors
		if !anyHas(missing, "shots/gone.png", "不存在") {
			t.Fatalf("%s: %v", name, missing)
		}
		mustBeClean(t, make("shots/extra.png")) // control: local and exists
	}

	// an <img> with no src at all, outside the flow
	noSrc := errorsOf(pageWith(func(c *pageCfg) { c.general = `<p>x</p><img alt="">` }))
	mustHave(t, noSrc, "无 src")

	// a flow step's bad picture is reported once, not twice
	once := 0
	for _, e := range errorsOf(pageWith(func(c *pageCfg) {
		c.sources = []string{sourceWith(func(s *sourceCfg) { s.steps = []step{st("https://x/a.png", "点 X")} })}
	})) {
		if strings.Contains(e, "https://x/a.png") && strings.Contains(e, "相对") {
			once++
		}
	}
	if once != 1 {
		t.Fatal(once)
	}

	// the template's zoom dialog (an empty <img alt="">) stays legal
	tail := `<dialog id="zoom"><img alt=""></dialog><script>const dlg = document.getElementById("zoom");</script>`
	mustBeClean(t, strings.Replace(page(), "</body>", tail+"</body>", 1))
}

func TestAPageWithNoSourceAndNoNoSourceReasonFailsAndWithAReasonPasses(t *testing.T) {
	r := research.Check(pageWith(func(c *pageCfg) { c.sources = nil }), everything)
	if r.Valid {
		t.Fatal("valid")
	}
	mustHave(t, r.Errors, "来源")

	r = research.Check(pageWith(func(c *pageCfg) {
		c.sources = []string{`<section data-part="no-source">搜了 screens 与 flows 三页，没有一个能呈现目标状态。</section>`}
	}), everything)
	if !r.Valid || r.Sources != 0 {
		t.Fatalf("%+v", r)
	}
}

func TestMarkupInsideCommentsScriptsAndStylesIsNotReadAsPageContent(t *testing.T) {
	md := pageWith(func(c *pageCfg) { c.general = "" })
	md = strings.Replace(md, "<body>", `<body><!-- <div data-part="general">hidden</div> --><script>var s = '<div data-part="general">x</div>'</script>`, 1)
	mustHave(t, errorsOf(md), "general")
}

// Cases the old tests did not spell out but the parser has to get right the way the old one did.

func TestAScriptWithoutAClosingTagDoesNotSwallowTheRestOfThePage(t *testing.T) {
	md := strings.Replace(page(), "<body>", "<body><script>var a = 1;", 1)
	// the old reader only drops a script that closes; an unclosed one stays as it is, and the page is judged whole
	if errs := errorsOf(md); len(errs) != 0 {
		t.Fatal(errs)
	}
}

func TestStyleAndScriptAreMatchedCaseInsensitively(t *testing.T) {
	md := strings.Replace(page(), "<body>", `<body><SCRIPT>var s = '<div data-part="cannot-answer">x</div>'</SCRIPT>`, 1)
	mustBeClean(t, md)
}
