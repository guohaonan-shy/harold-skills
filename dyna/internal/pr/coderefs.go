package pr

import (
	"fmt"
	"regexp"
	"strings"
)

type codeRefKind struct {
	name string
	re   *regexp.Regexp
	keep func(string) bool
}

// The kinds of code-level reference a person cannot read, in the order they are looked for. A reference is
// reported once: a later hit that sits inside a wider one already reported is skipped.
var codeRefKinds = []codeRefKind{
	{name: "反引号", re: regexp.MustCompile("`[^`\\n]+`")},
	{name: "文件:行号", re: regexp.MustCompile(`[\w./-]+\.\w{1,5}:\d+`)},
	{name: "路径", re: regexp.MustCompile(`\b[\w-]+(?:/[\w-]+){2,}(?:\.\w+)?\b|\b[\w-]+/[\w-]+\.\w{1,5}\b`)},
	{name: "代码文件名", re: regexp.MustCompile(`\b[\w-]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rs|rb|java|kt|swift|sql|css|scss|html|vue|json|ya?ml|toml|sh)\b`)},
	{name: "章节编号", re: regexp.MustCompile(`§[` + spaceSet + `]*\d+(?:\.\d+)*`)},
	// a commit hash: 7 to 40 hex characters that mix digits and letters
	{name: "提交号", re: regexp.MustCompile(`\b[0-9a-f]{7,40}\b`), keep: func(s string) bool {
		return strings.IndexFunc(s, func(r rune) bool { return r >= '0' && r <= '9' }) >= 0 &&
			strings.IndexFunc(s, func(r rune) bool { return r >= 'a' && r <= 'f' }) >= 0
	}},
	{name: "下划线命名", re: regexp.MustCompile(`\b[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]+\b`)},
	{name: "函数调用", re: regexp.MustCompile(`\b[A-Za-z_][\w.]*\(\)`)},
}

// codeRefs lists the code-level references in text, each as `<kind>「<matched text>」`.
func codeRefs(text string) []string {
	var hits []string
	var seen []string
	for _, k := range codeRefKinds {
		for _, m := range k.re.FindAllString(text, -1) {
			if k.keep != nil && !k.keep(m) {
				continue
			}
			inside := false
			for _, s := range seen {
				if strings.Contains(s, m) {
					inside = true
					break
				}
			}
			if inside {
				continue
			}
			seen = append(seen, m)
			hits = append(hits, fmt.Sprintf("%s「%s」", k.name, m))
		}
	}
	return hits
}
