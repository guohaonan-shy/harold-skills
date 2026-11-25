package writing

// The assertions of writing-lint.test.mjs (main, #403), through the command: a clean base article per language, one
// change per rule with the line it must point at, the config, EN / ZH parity and the command-line contract.

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
)

type result struct {
	code   int
	stdout string
	stderr string
	report *reportJSON
}

type reportJSON struct {
	Clean      bool                 `json:"clean"`
	Total      int                  `json:"total"`
	BySeverity map[string]int       `json:"bySeverity"`
	Files      []string             `json:"files"`
	Rules      map[string][]Finding `json:"rules"`
}

func lint(args ...string) result {
	var out bytes.Buffer
	c := Command(Deps{Stdout: &out})
	c.SetArgs(append([]string{"lint"}, args...))
	c.SetOut(&out)
	c.SetErr(&out)
	r := result{}
	if err := c.Execute(); err != nil {
		var ex *nexterr.Exit
		if errors.As(err, &ex) {
			r.code, r.stderr = ex.Code, ex.Msg
		} else {
			r.code, r.stderr = 1, err.Error()
		}
	}
	r.stdout = out.String()
	var rep reportJSON
	if json.Unmarshal(out.Bytes(), &rep) == nil {
		r.report = &rep
	}
	return r
}

func put(t *testing.T, dir, name, text string) string {
	t.Helper()
	p := filepath.Join(dir, name)
	if err := os.WriteFile(p, []byte(text), 0o644); err != nil {
		t.Fatal(err)
	}
	return p
}

const defaultFaqEn = "Most of the recipes here take about twenty minutes from start to table, including the time you spend chopping, washing the vegetables and cleaning up the stove afterwards."
const defaultFaqZh = "这里大多数菜谱从开火到上桌大约二十分钟，包括你切菜、洗菜和收拾灶台所花的时间，所以下班回家之后也完全来得及动手做一顿热饭。"

func front(lang, faq string) string {
	if lang == "zh" {
		if faq == "" {
			faq = defaultFaqZh
		}
		return "---\ntitle: 工作日晚餐\nexcerpt: 忙碌的晚上也能吃好。\ncover: /img/cover.png\nfaqs:\n  - q: 要花多久？\n    a: \"" + faq + "\"\n---\n"
	}
	if faq == "" {
		faq = defaultFaqEn
	}
	return "---\ntitle: Weeknight dinners\nexcerpt: Quick meals for busy evenings.\ncover: /img/cover.png\nfaqs:\n  - q: How long does it take?\n    a: \"" + faq + "\"\n---\n"
}

var body = map[string]string{
	"en": "\n## Planning\n\nPick three recipes on Sunday. Shop once.\n\n## Cooking\n\nStart the rice first. The rest fits in the same time.\n",
	"zh": "\n## 计划\n\n周日挑三道菜。一次买齐。\n\n## 烹饪\n\n先煮饭。其余的菜刚好同时做完。\n",
}

var names = map[string]string{"en": "post.en.md", "zh": "post.zh-CN.md"}

func article(lang, add string) string {
	s := front(lang, "") + body[lang]
	if add != "" {
		s += "\n" + add + "\n"
	}
	return s
}

func lineOf(t *testing.T, text, needle string) int {
	t.Helper()
	for i, l := range strings.Split(text, "\n") {
		if strings.Contains(l, needle) {
			return i + 1
		}
	}
	t.Fatalf("fixture has no line with %q", needle)
	return 0
}

// findings lints one article and returns one rule's findings.
func findings(t *testing.T, rule, text, lang string, config any) []Finding {
	t.Helper()
	d := t.TempDir()
	file := put(t, d, names[lang], text)
	args := []string{file}
	if config != nil {
		b, _ := json.Marshal(config)
		args = append([]string{"--config=" + put(t, d, "lint.json", string(b))}, args...)
	}
	r := lint(args...)
	if r.report == nil {
		t.Fatalf("no report: %+v", r)
	}
	return r.report.Rules[rule]
}

func longProse(lang string) string {
	var paras []string
	for i := 0; i < 8; i++ {
		n := string(rune('0' + i))
		if lang == "zh" {
			paras = append(paras, "第"+n+"道菜要在炉子上煮一会儿再放在锅里静置一会儿。装盘的时候撒上一点新鲜的香草。再配上一碗热汤端上桌。")
		} else {
			paras = append(paras, "Cook the dish number "+n+" on the stove for a while. Then let it rest in the pan for a while. Serve it on a warm plate with some fresh herbs.")
		}
	}
	return strings.Join(paras, "\n\n")
}

func withBreak(prose string) string {
	p := strings.Split(prose, "\n\n")
	return strings.Join(append(append(append([]string{}, p[:4]...), "- a list item"), p[4:]...), "\n\n")
}

type fmSpec struct {
	faq, drop string
	dropFaqs  bool
}

type rcase struct {
	bad, good     string
	badFm, goodFm *fmSpec
	needle        string
}

func frontWith(lang string, s fmSpec) string {
	t := front(lang, s.faq)
	if s.drop != "" {
		t = regexp.MustCompile(`(?m)^`+s.drop+`:.*\n`).ReplaceAllString(t, "")
	}
	if s.dropFaqs {
		t = regexp.MustCompile(`(?m)^faqs:\n(?:\s+.*\n)+`).ReplaceAllString(t, "")
	}
	return t
}

func (c rcase) build(lang string, bad bool) string {
	if c.badFm != nil {
		if bad {
			return frontWith(lang, *c.badFm) + body[lang]
		}
		return frontWith(lang, *c.goodFm) + body[lang]
	}
	if bad {
		return article(lang, c.bad)
	}
	return article(lang, c.good)
}

var cases = map[string]map[string]rcase{
	"para-sentences": {
		"en": {bad: "Chop the onions. Heat the pan. Add the oil. Stir the rice. Serve it warm.", good: "Chop the onions. Heat the pan. Add the oil. Stir the rice.", needle: "Chop the onions"},
		"zh": {bad: "先切洋葱。再热锅。然后倒油。接着翻炒米饭。最后装盘端上桌。", good: "先切洋葱。再热锅。然后倒油。接着翻炒米饭。", needle: "先切洋葱"},
	},
	"visual-break": {
		"en": {bad: longProse("en"), good: withBreak(longProse("en")), needle: "dish number 7"},
		"zh": {bad: longProse("zh"), good: withBreak(longProse("zh")), needle: "第7道菜"},
	},
	"bullet-long": {
		"en": {bad: "- " + strings.Repeat("A very long list item that keeps going ", 7), good: "- A short list item", needle: "A very long list item"},
		"zh": {bad: "- " + strings.Repeat("这是一条一直写下去而且没有尽头的很长的列表项", 6), good: "- 一条很短的列表项", needle: "这是一条一直写下去"},
	},
	"transition-density": {
		"en": {bad: "However, the pan is hot. Therefore the oil burns, thus we stop.", good: "However, the pan is hot. We stop.", needle: "However, the pan"},
		"zh": {bad: "然而锅很烫。因此油烧焦了，从而我们停火。", good: "然而锅很烫。我们停火。", needle: "然而锅很烫"},
	},
	"dash-density": {
		"en": {bad: "The pan — still hot — waits on the stove — ready.", good: "The pan, still hot, waits on the stove, ready.", needle: "The pan —"},
		"zh": {bad: "锅——还烫着——放在灶上——准备好了。", good: "锅还烫着，放在灶上，准备好了。", needle: "锅——"},
	},
	"comma-chain": {
		"en": {bad: "She chopped the onions, then heated the pan, then added the oil, then stirred the rice, then served it.", good: "She chopped the onions, then heated the pan. She added the oil, then stirred the rice, then served it.", needle: "She chopped"},
		"zh": {bad: "她把洋葱切成了细细的小丁，然后把平底锅放在火上烧热，然后往锅里倒入了一勺橄榄油，然后把煮好的米饭倒进去翻炒，最后装盘端上了桌。", good: "她把洋葱切成了细细的小丁，然后把平底锅放在火上烧热。她往锅里倒入了一勺橄榄油，然后把煮好的米饭倒进去翻炒。", needle: "她把洋葱"},
	},
	"faq-thin": {
		"en": {badFm: &fmSpec{faq: "About twenty minutes."}, goodFm: &fmSpec{}, needle: "About twenty minutes."},
		"zh": {badFm: &fmSpec{faq: "大约二十分钟。"}, goodFm: &fmSpec{}, needle: "大约二十分钟。"},
	},
	"ai-slop": {
		"en": {bad: "Furthermore, the rice is ready.", good: "The rice is ready.", needle: "Furthermore"},
		"zh": {bad: "此外，饭已经好了。", good: "饭已经好了。", needle: "此外"},
	},
	"colon-opener": {
		"en": {bad: "So: the rice is ready.", good: "The rice is ready.", needle: "So: the rice"},
		"zh": {bad: "所以：饭好了。", good: "饭好了。", needle: "所以："},
	},
	"stray-italic": {
		"en": {bad: "Wash the *rice* twice.", good: "Wash the **rice** twice.", needle: "Wash the *rice*"},
		"zh": {bad: "把*米饭*洗两遍。", good: "把**米饭**洗两遍。", needle: "把*米饭*"},
	},
	"image-caption": {
		"en": {bad: "![A bowl of rice](/img/rice.png)", good: `![A bowl of rice](/img/rice.png "Steamed rice, ready in twenty minutes")`, needle: "![A bowl of rice]"},
		"zh": {bad: "![一碗米饭](/img/rice.png)", good: `![一碗米饭](/img/rice.png "二十分钟煮好的米饭")`, needle: "![一碗米饭]"},
	},
	"required-fields": {
		"en": {badFm: &fmSpec{drop: "excerpt"}, goodFm: &fmSpec{}, needle: "---"},
		"zh": {badFm: &fmSpec{drop: "excerpt"}, goodFm: &fmSpec{}, needle: "---"},
	},
	"image-field": {
		"en": {badFm: &fmSpec{drop: "cover"}, goodFm: &fmSpec{}, needle: "---"},
		"zh": {badFm: &fmSpec{drop: "cover"}, goodFm: &fmSpec{}, needle: "---"},
	},
	"faqs-field": {
		"en": {badFm: &fmSpec{dropFaqs: true}, goodFm: &fmSpec{}, needle: "---"},
		"zh": {badFm: &fmSpec{dropFaqs: true}, goodFm: &fmSpec{}, needle: "---"},
	},
	"table-div-align": {
		"en": {bad: "| Meal | Time |\n| :--- | :--- |\n| <div style=\"text-align:center\">Stew</div> | 40 |", good: "| Meal | Time |\n| :--- | :---: |\n| Stew | 40 |", needle: "<div style"},
		"zh": {bad: "| 菜 | 时间 |\n| :--- | :--- |\n| <div style=\"text-align:center\">炖菜</div> | 40 |", good: "| 菜 | 时间 |\n| :--- | :---: |\n| 炖菜 | 40 |", needle: "<div style"},
	},
	"tilde-number": {
		"en": {bad: "It takes ~20 minutes.", good: "It takes about 20 minutes.", needle: "~20"},
		"zh": {bad: "大约要 ~20 分钟。", good: "大约要 20 分钟。", needle: "~20"},
	},
	"numeric-range-hyphen": {
		"en": {bad: "Cook it for 15-20 minutes.", good: "Cook it for 15–20 minutes.", needle: "15-20"},
		"zh": {bad: "煮 15-20 分钟。", good: "煮 15–20 分钟。", needle: "15-20"},
	},
}

func TestTheCleanBaseArticleOfEachLanguageReportsNothing(t *testing.T) {
	for _, lang := range []string{"en", "zh"} {
		r := lint(put(t, t.TempDir(), names[lang], article(lang, "")))
		if r.code != 0 || !r.report.Clean || len(r.report.Rules) != 0 {
			t.Fatalf("%s: %+v", lang, r)
		}
	}
}

func TestEveryRuleHasAFixtureCase(t *testing.T) {
	var got []string
	for k := range cases {
		got = append(got, k)
	}
	got = append(got, "locale-parity")
	sort.Strings(got)
	want := append([]string{}, Rules...)
	sort.Strings(want)
	if strings.Join(got, ",") != strings.Join(want, ",") || len(Rules) != 18 {
		t.Fatal(got)
	}
}

func TestEachRuleReportsTheViolatingArticleOnTheRightLineAndNotTheFixedOneAndCanBeSwitchedOff(t *testing.T) {
	for rule, byLang := range cases {
		for _, lang := range []string{"en", "zh"} {
			c := byLang[lang]
			bad := c.build(lang, true)
			hits := findings(t, rule, bad, lang, nil)
			want := lineOf(t, bad, c.needle)
			found := false
			for _, h := range hits {
				found = found || h.Line == want
			}
			if !found {
				t.Errorf("%s (%s): lines %v do not include %d", rule, lang, hits, want)
			}
			if got := findings(t, rule, c.build(lang, false), lang, nil); len(got) != 0 {
				t.Errorf("%s (%s): the fixed article still reports %v", rule, lang, got)
			}
			if got := findings(t, rule, bad, lang, map[string]any{"disableRules": []string{rule}}); len(got) != 0 {
				t.Errorf("%s (%s): switched off, still %v", rule, lang, got)
			}
		}
	}
}

func TestImageCaptionAlsoCatchesACaptionThatRepeatsTheAltOrIsOnlyALabel(t *testing.T) {
	for _, c := range [][3]string{{"en", "A bowl of rice", "Figure 2:"}, {"zh", "一碗米饭", "图 2："}} {
		lang, alt, label := c[0], c[1], c[2]
		same := article(lang, "!["+alt+"](/img/rice.png \""+alt+"\")")
		hit := findings(t, "image-caption", same, lang, nil)
		if len(hit) != 1 || hit[0].Line != lineOf(t, same, "!["+alt+"]") {
			t.Errorf("%s: %v", lang, hit)
		}
		if n := len(findings(t, "image-caption", article(lang, "!["+alt+"](/img/rice.png \""+label+"\")"), lang, nil)); n != 1 {
			t.Errorf("%s label: %d", lang, n)
		}
	}
}

func TestAHandWrittenImgIsCheckedThroughTheConfiguredCaptionAttribute(t *testing.T) {
	html := func(attr string) string {
		return article("en", `<img src="/img/rice.png" alt="A bowl of rice" `+attr+`="Steamed rice, ready in twenty minutes" />`)
	}
	if len(findings(t, "image-caption", html("title"), "en", nil)) != 0 || len(findings(t, "image-caption", html("data-caption"), "en", nil)) != 1 ||
		len(findings(t, "image-caption", html("data-caption"), "en", map[string]any{"fields": map[string]any{"captionAttribute": "data-caption"}})) != 0 {
		t.Fatal()
	}
}

func TestStrayItalicLeavesTheFirstBlockquoteAWholeParagraphFootnoteAndALinkLabelAlone(t *testing.T) {
	quote := article("en", "> *In short:* twenty minutes.")
	if n := len(findings(t, "stray-italic", quote, "en", nil)); n != 0 {
		t.Error("first quote", n)
	}
	if n := len(findings(t, "stray-italic", article("en", "> *In short:* twenty minutes.\n\n> *Another:* note."), "en", nil)); n != 1 {
		t.Error("second quote", n)
	}
	if n := len(findings(t, "stray-italic", quote, "en", map[string]any{"italic": map[string]any{"exemptFirstBlockquote": false}})); n != 1 {
		t.Error("not exempt", n)
	}
	if n := len(findings(t, "stray-italic", article("en", "*All figures are rounded to the nearest minute.*"), "en", nil)); n != 0 {
		t.Error("footnote", n)
	}
	if n := len(findings(t, "stray-italic", article("en", "See [the *Cookbook* index](/index)."), "en", nil)); n != 0 {
		t.Error("link label", n)
	}
}

func TestCommaChainIgnoresParenthesesAndShortEnumerations(t *testing.T) {
	d := "Pack the bag (pans, plates, forks, knives, spoons) and go. Bring salt, pepper, oil, garlic, onions and rice."
	if n := len(findings(t, "comma-chain", article("en", d), "en", nil)); n != 0 {
		t.Fatal(n)
	}
}

const specArticle = `---
title: Weeknight dinners
excerpt: Quick meals for busy evenings.
cover: /img/cover.png
faqs:
  - q: How long does it take?
    a: "Most of the recipes here take about twenty minutes from start to table, including the time you spend chopping, washing the vegetables and cleaning up the stove afterwards."
---

## Planning

Pick three recipes on Sunday. Shop once.

## Cooking

Chop the onions. Heat the pan. Add the oil. Stir the rice. Serve it warm.

She chopped the onions, then heated the pan, then added the oil, then stirred the rice, then served it.

![A bowl of rice](/img/rice.png)
`

func ruleNames(r *reportJSON) []string {
	var out []string
	for k := range r.Rules {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func TestTheSpecArticleReportsThreeRulesOnceEachOnTheRightLines(t *testing.T) {
	d := t.TempDir()
	file := put(t, d, "post.en.md", specArticle)
	r := lint(file)
	if r.code != 1 || strings.Join(ruleNames(r.report), ",") != "comma-chain,image-caption,para-sentences" || r.report.Total != 3 {
		t.Fatalf("%+v", r)
	}
	for rule, needle := range map[string]string{"para-sentences": "Chop the onions.", "comma-chain": "She chopped", "image-caption": "![A bowl of rice]"} {
		list := r.report.Rules[rule]
		if len(list) != 1 || list[0].Line != lineOf(t, specArticle, needle) || list[0].File != file {
			t.Errorf("%s: %v", rule, list)
		}
	}
	cfg := put(t, d, "lint.json", `{"thresholds":{"maxSentencesPerParagraph":5}}`)
	if got := ruleNames(lint("--config="+cfg, file).report); strings.Join(got, ",") != "comma-chain,image-caption" {
		t.Fatal(got)
	}
}

func TestConfigAThresholdTakesEffectAndTheRestKeepTheirDefaults(t *testing.T) {
	text := article("en", "Chop the onions. Heat the pan. Add the oil. Stir the rice. Serve it warm.\n\nIt takes ~20 minutes.")
	cfg := map[string]any{"thresholds": map[string]any{"maxSentencesPerParagraph": 5}}
	if len(findings(t, "para-sentences", text, "en", nil)) != 1 || len(findings(t, "para-sentences", text, "en", cfg)) != 0 || len(findings(t, "tilde-number", text, "en", cfg)) != 1 {
		t.Fatal()
	}
	if n := len(findings(t, "para-sentences", article("en", ""), "en", map[string]any{"thresholds": map[string]any{"maxSentencesPerParagraph": 1}})); n != 2 {
		t.Fatal(n)
	}
}

func TestConfigANestedThresholdOverridesOneLanguageAndKeepsTheOther(t *testing.T) {
	v, _ := parseJSON([]byte(`{"thresholds":{"faqMinWords":{"en":5}}}`))
	m, err := MergeConfig(v)
	if err != nil || m.Thresholds.FaqMinWords.En != 5 || m.Thresholds.FaqMinWords.Zh != 40 {
		t.Fatal(m.Thresholds.FaqMinWords, err)
	}
	if n := len(findings(t, "faq-thin", front("zh", "大约二十分钟。")+body["zh"], "zh", map[string]any{"thresholds": map[string]any{"faqMinWords": map[string]any{"en": 5}}})); n != 1 {
		t.Fatal(n)
	}
}

func TestConfigAWordListReplacesTheDefaultForThatLanguageOnly(t *testing.T) {
	cfg := map[string]any{"wordlists": map[string]any{"aiSlop": map[string]any{"en": []string{"lorem ipsum"}}}}
	check := func(rule, lang, add string, config any, want int) {
		t.Helper()
		if n := len(findings(t, rule, article(lang, add), lang, config)); n != want {
			t.Errorf("%s %q: %d, want %d", rule, add, n, want)
		}
	}
	check("ai-slop", "en", "Furthermore, the rice is ready.", cfg, 0)
	check("ai-slop", "en", "Lorem  ipsum, the rice is ready.", cfg, 1)
	check("ai-slop", "zh", "此外，饭已经好了。", cfg, 1)
	check("ai-slop", "en", "Furthermore, the rice is ready.", map[string]any{"wordlists": map[string]any{"aiSlop": map[string]any{"en": []string{}}}}, 0)
	colon := map[string]any{"wordlists": map[string]any{"colonOpeners": map[string]any{"en": []string{"verdict"}}}}
	check("colon-opener", "en", "Verdict: the rice is ready.", colon, 1)
	check("colon-opener", "en", "So: the rice is ready.", colon, 0)
}

func TestConfigFrontmatterFieldNamesAreTheConfiguredOnes(t *testing.T) {
	custom := "---\ntitle: Weeknight dinners\nsummary: Quick meals for busy evenings.\nheroImage: /img/cover.png\nquestions:\n  - q: How long does it take?\n    reply: \"About twenty minutes.\"\n---\n" + body["en"]
	cfg := map[string]any{"fields": map[string]any{"required": []string{"title", "summary"}, "image": []string{"heroImage"}, "faqs": "questions", "faqAnswer": "reply"}}
	for _, rule := range []string{"required-fields", "image-field", "faqs-field"} {
		if len(findings(t, rule, custom, "en", nil)) != 1 || len(findings(t, rule, custom, "en", cfg)) != 0 {
			t.Error(rule)
		}
	}
	if len(findings(t, "faq-thin", custom, "en", nil)) != 0 || len(findings(t, "faq-thin", custom, "en", cfg)) != 1 {
		t.Error("faq-thin")
	}
}

func TestConfigAnUnknownKeyAWrongTypeOrAnUnknownRuleIsExit2(t *testing.T) {
	d := t.TempDir()
	file := put(t, d, names["en"], article("en", ""))
	for _, bad := range []string{
		`{"thresholds":{"maxSentencesPerParagrah":5}}`, `{"thresholds":{"maxBulletWidth":"wide"}}`, `{"disableRules":["no-such-rule"]}`,
		`{"extra":1}`, `{"wordlists":{"aiSlop":{"en":"furthermore"}}}`,
	} {
		r := lint("--config="+put(t, d, "bad.json", bad), file)
		if r.code != 2 || !strings.Contains(r.stderr, "config") || r.stdout != "" {
			t.Errorf("%s: %+v", bad, r)
		}
	}
	if r := lint("--config="+put(t, d, "broken.json", "{ nope"), file); r.code != 2 {
		t.Error("broken", r)
	}
	if r := lint("--config="+filepath.Join(d, "missing.json"), file); r.code != 2 {
		t.Error("missing", r)
	}
}

func TestTheDefaultsAreTheDocumentedOnes(t *testing.T) {
	c := DefaultConfig()
	if c.Thresholds.MaxSentencesPerParagraph != 4 || c.Thresholds.MaxTransitionsPerSentence != 1 || c.Thresholds.MaxCommasPerSentence != 3 ||
		c.Thresholds.MaxDashPer100Words != 1 || len(c.Wordlists.AISlop.En) == 0 || len(c.Wordlists.AISlop.Zh) == 0 {
		t.Fatalf("%+v", c)
	}
}

const storing = "\n## Storing\n\nKeep leftovers in a jar.\n"

func TestLocaleParityAPairWhoseH2CountsDifferIsReportedAMatchingPairIsNot(t *testing.T) {
	d := t.TempDir()
	en := put(t, d, "post.en.md", article("en", "")+storing)
	zh := put(t, d, "post.zh-CN.md", article("zh", ""))
	r := lint(en, zh)
	list := r.report.Rules["locale-parity"]
	if r.code != 1 || strings.Join(ruleNames(r.report), ",") != "locale-parity" || len(list) != 1 || !strings.Contains(list[0].Message, "h2: en=3 zh-CN=2") || list[0].File != en {
		t.Fatalf("%+v", r)
	}
	e := t.TempDir()
	if r := lint(put(t, e, "post.en.md", article("en", "")), put(t, e, "post.zh-CN.md", article("zh", ""))); len(r.report.Rules) != 0 {
		t.Fatal(r.report.Rules)
	}
	// linting only one file still compares it with its sibling on disk
	if n := len(lint(zh).report.Rules["locale-parity"]); n != 1 {
		t.Fatal(n)
	}
}

func TestLocaleParityAMissingVersionIsIgnoredByDefaultAndAnErrorWithRequireBoth(t *testing.T) {
	e := t.TempDir()
	only := put(t, e, "solo.en.md", article("en", ""))
	if len(lint(only).report.Rules) != 0 {
		t.Fatal("ignored by default")
	}
	cfg := put(t, e, "lint.json", `{"localePair":{"requireBoth":true}}`)
	lone := lint("--config="+cfg, only).report.Rules["locale-parity"]
	if len(lone) != 1 || lone[0].Severity != "error" || !strings.Contains(lone[0].Message, "missing") {
		t.Fatal(lone)
	}
	p := t.TempDir()
	if r := lint("--config="+cfg, put(t, p, "post.en.md", article("en", "")), put(t, p, "post.zh-CN.md", article("zh", ""))); r.code != 0 {
		t.Fatal(r)
	}
}

func TestLocaleParityThePairIsTheConfiguredOneAndMdxCounts(t *testing.T) {
	d := t.TempDir()
	put(t, d, "post.en-US.md", article("en", "")+storing)
	put(t, d, "post.zh-TW.mdx", article("zh", ""))
	cfg := put(t, d, "lint.json", `{"localePair":{"en":"en-US","zh":"zh-TW"}}`)
	list := lint("--config="+cfg, filepath.Join(d, "post.en-US.md"), filepath.Join(d, "post.zh-TW.mdx")).report.Rules["locale-parity"]
	if len(list) != 1 || !strings.Contains(list[0].Message, "en-US=3 zh-TW=2") {
		t.Fatal(list)
	}
}

func TestTheCommandOutputShapeExitCodesADirectoryLangAndText(t *testing.T) {
	d := t.TempDir()
	put(t, d, "a.en.md", article("en", "It takes ~20 minutes."))
	put(t, d, "b.en.md", article("en", ""))
	put(t, d, "notes.txt", "not an article")
	r := lint(d)
	if r.code != 1 || r.report.Clean || r.report.Total != 1 {
		t.Fatalf("%+v", r)
	}
	var files []string
	for _, f := range r.report.Files {
		files = append(files, strings.TrimPrefix(f, d+"/"))
	}
	if strings.Join(files, ",") != "a.en.md,b.en.md" || r.report.BySeverity["note"] != 1 || r.report.BySeverity["error"] != 0 || r.report.BySeverity["warn"] != 0 {
		t.Fatalf("%+v", r.report)
	}
	if !strings.Contains(r.stdout, "{\n  \"clean\": false,\n  \"total\": 1,\n  \"bySeverity\": {\n    \"error\": 0,\n    \"warn\": 0,\n    \"note\": 1\n  },") {
		t.Fatal(r.stdout)
	}
	var raw map[string]map[string][]map[string]any
	json.Unmarshal([]byte(r.stdout), &raw)
	var keys []string
	for k := range raw["rules"]["tilde-number"][0] {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	if strings.Join(keys, ",") != "file,line,message,severity" {
		t.Fatal(keys)
	}

	text := lint("--format=text", filepath.Join(d, "a.en.md"))
	if text.code != 1 || !regexp.MustCompile(`^tilde-number \(1\)\n {2}.*a\.en\.md:\d+ \[note\] `).MatchString(text.stdout) {
		t.Fatalf("%+v", text)
	}

	named := put(t, d, "plain.md", article("zh", "大约要 ~20 分钟。"))
	if n := len(lint(named).report.Rules["tilde-number"]); n != 1 {
		t.Error("detected from the text", n)
	}
	forced := put(t, d, "forced.en.md", article("zh", "此外，饭好了。"))
	if lint(forced).report.Rules["ai-slop"] != nil || len(lint("--lang=zh", forced).report.Rules["ai-slop"]) != 1 {
		t.Error("--lang overrides the name")
	}
	for _, args := range [][]string{{}, {filepath.Join(d, "nope.md")}, {"--lang=fr", named}, {"--format=xml", named}} {
		if r := lint(args...); r.code != 2 {
			t.Errorf("%v: %+v", args, r)
		}
	}
}

func TestACleanReportPrintsEmptyRules(t *testing.T) {
	r := lint(put(t, t.TempDir(), "post.en.md", article("en", "")))
	if !strings.HasSuffix(r.stdout, "  \"rules\": {}\n}\n") {
		t.Fatalf("%q", r.stdout)
	}
}
