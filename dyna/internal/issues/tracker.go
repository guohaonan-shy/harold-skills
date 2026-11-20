package issues

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// ---------- project document (ISSUE_TRACKER.md) ----------

// ReadTracker is the project's issue tracker document: ISSUE_TRACKER.md next to docs/. Empty when there is none.
func ReadTracker(docs string) string {
	abs, _ := filepath.Abs(docs)
	b, err := os.ReadFile(filepath.Join(filepath.Dir(abs), "ISSUE_TRACKER.md"))
	if err != nil {
		return ""
	}
	return string(b)
}

var h1Re = regexp.MustCompile(`(?m)^# (.+)$`)
var linearRe = regexp.MustCompile(`(?i)linear`)

// PlatformOf is where the project's issues live: "linear" when the first level-1 heading of its
// ISSUE_TRACKER.md names Linear (`# Issue tracker：Linear`), otherwise "github" (a missing file counts).
func PlatformOf(md string) string {
	title := ""
	if m := h1Re.FindStringSubmatch(md); m != nil {
		title = m[1]
	}
	if linearRe.MatchString(title) {
		return "linear"
	}
	return "github"
}

// LinearRefusal is the refusal for a command that writes GitHub, run in a project whose issues are on Linear.
func LinearRefusal(cmd string) string {
	return fmt.Sprintf("「%s」写的是 GitHub 上的 issue，而这个项目的 issue 在 Linear 上（ISSUE_TRACKER.md 第一个标题写了 Linear）：改用 Linear MCP，做法见 idea-loop:issues 的 references/linear.md", cmd)
}

// GithubOnly are the commands that only make sense on GitHub.
var GithubOnly = map[string]bool{"labels": true, "type": true, "set": true, "candidates": true, "reconcile": true, "migrate": true, "new": true, "priority": true, "backlog": true, "note": true}

var skipRe = regexp.MustCompile(`(?im)^\s*(?:[-*]\s*)?(?:\|\s*)?(?:\*\*)?triage(?:\*\*)?\s*(?:[：:]|\|)\s*(?:\*\*)?跳过`)

// SkipsTriage: whether the project does without the triage state: a line `triage：跳过` (a list item, a bold
// label or a table row also do). The template's own `triage：用 / 跳过` is not a choice yet.
func SkipsTriage(md string) bool { return skipRe.MatchString(md) }

// ---------- categories ----------

// Type labels.
const (
	TypePrefix   = "type:"
	TypesHeading = "分类 label"
)

var queueNote = regexp.MustCompile(`\s*[（(]独立队列[，,]\s*上限\s*\d+\s*[)）]`)

var typeColors = map[string]string{"parent": "0052cc", "child": "c5def5"}

// Category is one name with its one-line meaning.
type Category struct{ Name, About string }

// Parent is a parent category and its children.
type Parent struct {
	Category
	Children []Category
}

// Types are the project's categories and the keep-list of its other labels.
type Types struct {
	Parents []Parent
	Keep    []string
}

var (
	itemRe = regexp.MustCompile("^(\\s*)- `([^`]+)`(?:[：:]\\s*(.*))?$")
	tickRe = regexp.MustCompile("`([^`]+)`")
	hdrRe  = regexp.MustCompile(`^#{1,2} `)
)

// ParseTypes reads the project's 「分类 label」 section: a bullet per parent (“ - `seo`：搜索流量 “), indented
// bullets for its children, and a line starting 「保留的 label」 that names, in backticks, the other labels to
// keep. Nil when the section is missing, or has no category and no keep-list.
func ParseTypes(md string) (*Types, error) {
	lines := strings.Split(md, "\n")
	start := -1
	for i, l := range lines {
		if strings.TrimSpace(l) == "## "+TypesHeading {
			start = i
			break
		}
	}
	if start < 0 {
		return nil, nil
	}
	t := &Types{}
	for _, line := range lines[start+1:] {
		if hdrRe.MatchString(line) {
			break
		}
		if m := itemRe.FindStringSubmatch(line); m != nil {
			indent, name, about := m[1], m[2], m[3]
			if strings.Contains(name, "/") {
				return nil, fmt.Errorf("分类「%s」里有「/」：它留给子类分隔，换个名字", name)
			}
			if indent == "" {
				t.Parents = append(t.Parents, Parent{Category: Category{name, strings.TrimSpace(queueNote.ReplaceAllString(about, ""))}})
			} else if len(t.Parents) > 0 {
				p := &t.Parents[len(t.Parents)-1]
				p.Children = append(p.Children, Category{name, about})
			}
			continue
		}
		if strings.HasPrefix(strings.TrimSpace(line), "保留的 label") {
			for _, m := range tickRe.FindAllStringSubmatch(line, -1) {
				t.Keep = append(t.Keep, m[1])
			}
		}
	}
	if len(t.Parents) == 0 && len(t.Keep) == 0 {
		return nil, nil
	}
	return t, nil
}

// ReadTypes are the categories of the project <docs> belongs to.
func ReadTypes(docs string) (*Types, error) { return ParseTypes(ReadTracker(docs)) }

// LabelSpec is a label to create.
type LabelSpec struct{ Name, Color, About string }

// TypeLabels is every type:* label the categories define, with its color and description.
func TypeLabels(t *Types) []LabelSpec {
	if t == nil {
		return nil
	}
	var out []LabelSpec
	for _, p := range t.Parents {
		out = append(out, LabelSpec{TypePrefix + p.Name, typeColors["parent"], p.About})
		for _, c := range p.Children {
			out = append(out, LabelSpec{TypePrefix + p.Name + "/" + c.Name, typeColors["child"], c.About})
		}
	}
	return out
}

// KeptLabels are the labels a project keeps: the status labels, the priorities, the kinds, its categories,
// and its keep-list.
func KeptLabels(t *Types) map[string]bool {
	out := map[string]bool{}
	for _, s := range Labeled {
		out[Label(s)] = true
	}
	for _, p := range Priorities {
		out[PriorityPrefix+p] = true
	}
	for _, k := range Kinds {
		out[KindPrefix+k] = true
	}
	for _, l := range TypeLabels(t) {
		out[l.Name] = true
	}
	if t != nil {
		for _, k := range t.Keep {
			out[k] = true
		}
	}
	return out
}

// TypeSet is the type:* labels an issue should carry for the given values (`seo`, `seo/blog`); a child brings
// its parent.
func TypeSet(t *Types, values []string) ([]string, error) {
	var out []string
	seen := map[string]bool{}
	add := func(l string) {
		if !seen[l] {
			seen[l] = true
			out = append(out, l)
		}
	}
	for _, v := range values {
		parts := strings.Split(v, "/")
		var parent *Parent
		if t != nil {
			for i := range t.Parents {
				if t.Parents[i].Name == parts[0] {
					parent = &t.Parents[i]
				}
			}
		}
		if parent == nil || len(parts) > 2 {
			var names []string
			for _, l := range TypeLabels(t) {
				names = append(names, strings.TrimPrefix(l.Name, TypePrefix))
			}
			list := strings.Join(names, " / ")
			if list == "" {
				list = "没有定义分类"
			}
			return nil, fmt.Errorf("「%s」不是这个项目的分类（%s）", v, list)
		}
		add(TypePrefix + parts[0])
		if len(parts) == 1 {
			continue
		}
		found := false
		for _, c := range parent.Children {
			if c.Name == parts[1] {
				found = true
			}
		}
		if !found {
			var names []string
			for _, c := range parent.Children {
				names = append(names, c.Name)
			}
			list := strings.Join(names, " / ")
			if list == "" {
				list = "没有子类"
			}
			return nil, fmt.Errorf("「%s」下没有子类「%s」（%s）", parts[0], parts[1], list)
		}
		add(TypePrefix + parts[0] + "/" + parts[1])
	}
	return out, nil
}

// ---------- issue body ----------

// RequiredSections every issue body must have, filled.
var RequiredSections = []string{"背景", "问题", "证据", "影响范围", "从哪发现"}

var sectionRe = regexp.MustCompile(`^## +(.+?)\s*$`)

// BodyErrors is what is wrong with an issue body: one line per required section (`## 问题` …) that is missing or
// holds only whitespace. Empty when the body is fine.
func BodyErrors(md string) []string {
	sections := map[string][]string{}
	current := ""
	has := false
	for _, line := range strings.Split(md, "\n") {
		if m := sectionRe.FindStringSubmatch(line); m != nil {
			current = m[1]
			has = true
			if _, ok := sections[current]; !ok {
				sections[current] = []string{}
			}
		} else if has {
			sections[current] = append(sections[current], line)
		}
	}
	var errs []string
	for _, name := range RequiredSections {
		body, ok := sections[name]
		if !ok {
			errs = append(errs, fmt.Sprintf("缺「%s」一节（## %s）", name, name))
		} else if strings.TrimSpace(strings.Join(body, "\n")) == "" {
			errs = append(errs, fmt.Sprintf("「%s」一节是空的", name))
		}
	}
	return errs
}
