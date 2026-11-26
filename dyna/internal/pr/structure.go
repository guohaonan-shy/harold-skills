package pr

// The structure of a PR description, checked at the moment a section is written.
//
// The reader decides the merge and knows the direction but not the code. A section that does not look the way
// that reader needs it is refused, with what is missing, before it reaches GitHub; the checks are mechanical, so
// a session that never read the skill meets them anyway (skills/engineering/pr/references/description.md of the
// plugin says what each section is for):
//
//	problem    至少一个视图（图片、代码块或表）；不写代码叫法
//	outline    最多两个视图；可以写代码叫法
//	evidence   至少一个视图；「之前」「之后」成对；问题有几件，证据就有几组，少的要在「没验成」一行里说；不写代码叫法
//	risk       「门：双向 / 单向」和「影响面」两行；「要特别注意的」最多 3 条；不写代码叫法
//	your-todo  只有复选框、代码块和末尾「说「合并」即可」；不写代码叫法（代码块和反引号里的命令除外）
//
// A missing view prints the view menu of the evidence skill (ViewMenu) next to the refusal. There is no length
// line anywhere.

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// StructureError is a section refused for its shape. NeedsMenu says the refusal is about a missing view, so the
// caller prints the evidence skill's view menu with it.
type StructureError struct {
	Section   string
	Problems  []string
	NeedsMenu bool
}

func (e *StructureError) Error() string {
	return fmt.Sprintf("section %s is refused:\n%s", e.Section, strings.Join(e.Problems, "\n"))
}

// MenuHeading is the heading of the view menu in the evidence skill's SKILL.md; dyna reads that section from the
// plugin at the moment it refuses, so there is no second copy of the menu.
const MenuHeading = "## 视图菜单"

// ViewMenu is the 视图菜单 section of the evidence skill under the plugin's directory.
func ViewMenu(pluginRoot string) (string, error) {
	if pluginRoot == "" {
		return "", fmt.Errorf("读不到视图菜单：环境变量 IDEA_LOOP_PLUGIN_ROOT 没设（经插件自带的 dyna 调用会自己设）")
	}
	matches, _ := filepath.Glob(filepath.Join(pluginRoot, "skills", "*", "evidence", "SKILL.md"))
	if len(matches) == 0 {
		return "", fmt.Errorf("读不到视图菜单：%s 下没有 skills/*/evidence/SKILL.md", pluginRoot)
	}
	raw, err := os.ReadFile(matches[0])
	if err != nil {
		return "", fmt.Errorf("读不到视图菜单：%v", err)
	}
	lines := strings.Split(string(raw), "\n")
	start, inFence := -1, false
	var menu []string
	for _, l := range lines {
		if strings.HasPrefix(strings.TrimSpace(l), "```") {
			inFence = !inFence
		}
		if start < 0 {
			if strings.TrimSpace(l) == MenuHeading {
				start = 0
				menu = append(menu, l)
			}
			continue
		}
		if !inFence && strings.HasPrefix(l, "## ") {
			break
		}
		menu = append(menu, l)
	}
	if start < 0 {
		return "", fmt.Errorf("读不到视图菜单：%s 里没有「%s」一节", matches[0], strings.TrimPrefix(MenuHeading, "## "))
	}
	return trim(strings.Join(menu, "\n")), nil
}

// ---- views ----

var (
	imageRe      = regexp.MustCompile(`!\[[^\]]*\]\([^)]*\)`)
	tableLineRe  = regexp.MustCompile(`^\s*\|.*\|\s*$`)
	listItemRe   = regexp.MustCompile(`^\s*(?:[-*+]|\d+[.、)])\s+\S`)
	bulletRe     = regexp.MustCompile(`^\s*[-*+]\s+\S`)
	checkboxRe   = regexp.MustCompile(`^[-*+]\s+\[[ xX]\]\s+\S`)
	closingRe    = regexp.MustCompile(`^说\s*[「『“"']?\s*合并\s*[」』”"']?\s*即可[。.]?$`)
	gateRe       = regexp.MustCompile(`(?m)^\s*\**\s*门\s*\**\s*[：:]\s*\**\s*(双向|单向)`)
	gateAnyRe    = regexp.MustCompile(`(?m)^\s*\**\s*门\s*\**\s*[：:]`)
	reachRe      = regexp.MustCompile(`(?m)^\s*\**\s*影响面\s*\**\s*[：:]\s*\**\s*\S`)
	unverifiedRe = regexp.MustCompile(`(?m)^\s*\**\s*没验成\s*\**\s*[：:]\s*\**\s*\S`)
	markerRe     = regexp.MustCompile(`^\s*(?:[-*+]\s+)?\**\s*(之前|之后)\s*\**\s*[：:]`)
)

func isFence(line string) bool { return strings.HasPrefix(strings.TrimSpace(line), "```") }

// proseLines are the lines of text outside code blocks, in order.
func proseLines(text string) []string {
	var out []string
	in := false
	for _, l := range strings.Split(text, "\n") {
		if isFence(l) {
			in = !in
			continue
		}
		if !in {
			out = append(out, l)
		}
	}
	return out
}

// countViews is the number of views in a section: each code block, each image and each table is one.
func countViews(text string) int {
	n, in, inTable := 0, false, false
	for _, l := range strings.Split(text, "\n") {
		if isFence(l) {
			if !in {
				n++
			}
			in, inTable = !in, false
			continue
		}
		if in {
			continue
		}
		if tableLineRe.MatchString(l) {
			if !inTable {
				n++
			}
			inTable = true
			continue
		}
		inTable = false
		n += len(imageRe.FindAllString(l, -1))
	}
	return n
}

// ---- code-level names ----

var (
	pathLikeRe   = regexp.MustCompile(`\b[\w-]+(?:/[\w-]+){2,}(?:\.\w+)?\b|\b[\w-]+/[\w-]+\.\w{1,5}\b`)
	fileLineRe   = regexp.MustCompile(`[\w./-]+\.\w{1,5}:\d+`)
	codeFileRe   = regexp.MustCompile(`\b[\w-]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rs|rb|java|kt|swift|sql|css|scss|html|vue|json|ya?ml|toml|sh)\b`)
	hashRe       = regexp.MustCompile(`\b[0-9a-f]{7,40}\b`)
	snakeRe      = regexp.MustCompile(`\b[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]+\b`)
	callRe       = regexp.MustCompile(`\b[A-Za-z_][\w.]*\(\)`)
	endpointRe   = regexp.MustCompile(`\b(?:GET|POST|PUT|PATCH|DELETE)\s+/[\w\-./{}:]*`)
	slashPathRe  = regexp.MustCompile("(?:^|[\\s(（`\"'])(/(?:[\\w\\-{}:]+/)+[\\w\\-{}:]+)")
	backtickRe   = regexp.MustCompile("`([^`\\n]+)`")
	identifierRe = regexp.MustCompile(`^[A-Za-z_][\w.]*$`)
	camelRe      = regexp.MustCompile(`[a-z0-9][A-Z]`)
)

// namingHits are the code-level names in text a person reads: commit hashes, function names, file paths and
// endpoint addresses. Skill names (idea-loop:x), slash commands, dyna command names and ordinary words are not
// among them; link and image addresses are not text.
func namingHits(text string) []string {
	text = commentRe.ReplaceAllString(text, "")
	text = linkRe.ReplaceAllString(text, "]")
	text = autoLinkRe.ReplaceAllString(text, "")
	text = urlRe.ReplaceAllString(text, "")
	var hits []string
	var seen []string
	add := func(kind, m string) {
		for _, s := range seen {
			if strings.Contains(s, m) {
				return
			}
		}
		seen = append(seen, m)
		hits = append(hits, fmt.Sprintf("%s「%s」", kind, m))
	}
	for _, m := range backtickRe.FindAllStringSubmatch(text, -1) {
		s := m[1]
		if identifierRe.MatchString(s) && (camelRe.MatchString(s) || strings.Contains(s, "_") || strings.Contains(s, ".")) {
			add("函数名", s)
		}
	}
	for _, m := range fileLineRe.FindAllString(text, -1) {
		add("文件:行号", m)
	}
	for _, m := range endpointRe.FindAllString(text, -1) {
		add("接口地址", strings.TrimSpace(m))
	}
	for _, m := range slashPathRe.FindAllStringSubmatch(text, -1) {
		add("接口地址", m[1])
	}
	for _, m := range pathLikeRe.FindAllString(text, -1) {
		add("路径", m)
	}
	for _, m := range codeFileRe.FindAllString(text, -1) {
		add("代码文件名", m)
	}
	for _, m := range hashRe.FindAllString(text, -1) {
		if strings.IndexFunc(m, func(r rune) bool { return r >= '0' && r <= '9' }) >= 0 &&
			strings.IndexFunc(m, func(r rune) bool { return r >= 'a' && r <= 'f' }) >= 0 {
			add("提交号", m)
		}
	}
	for _, loc := range snakeRe.FindAllStringIndex(text, -1) {
		// a name tied to others by hyphens (a baseline's name, a branch) is a label, not a function
		if loc[0] > 0 && text[loc[0]-1] == '-' || loc[1] < len(text) && text[loc[1]] == '-' {
			continue
		}
		add("函数名", text[loc[0]:loc[1]])
	}
	for _, m := range callRe.FindAllString(text, -1) {
		add("函数名", m)
	}
	return hits
}

// withoutCode is text with its code blocks and inline code removed: what the to-do lets a person's commands be.
func withoutCode(text string) string {
	var keep []string
	for _, l := range proseLines(text) {
		keep = append(keep, backtickRe.ReplaceAllString(l, ""))
	}
	return strings.Join(keep, "\n")
}

// ---- the checks ----

func missingView(name string) string {
	return fmt.Sprintf("%s节没有视图：要有至少一个图片、代码块或表，挑能讲清要点的最小一种（下面是 idea-loop:evidence 的视图菜单）", Titles[name])
}

// itemsOf is how many things the problem section names: its numbered or bulleted lines outside code blocks, and
// at least one.
func itemsOf(problem string) int {
	n := 0
	for _, l := range proseLines(problem) {
		if listItemRe.MatchString(l) {
			n++
		}
	}
	if n == 0 {
		return 1
	}
	return n
}

// groupsOf is the number of before-and-after groups in an evidence section, and whether they come in pairs.
func groupsOf(evidence string) (groups int, paired bool) {
	var seq []string
	for _, l := range proseLines(evidence) {
		if m := markerRe.FindStringSubmatch(l); m != nil {
			seq = append(seq, m[1])
		}
	}
	for i := 0; i < len(seq); i += 2 {
		if i+1 >= len(seq) || seq[i] != "之前" || seq[i+1] != "之后" {
			return len(seq) / 2, false
		}
		groups++
	}
	return groups, true
}

func toDoProblems(text string) []string {
	var problems []string
	afterBox, in := false, false
	var loose []string
	last := ""
	for _, l := range strings.Split(text, "\n") {
		if isFence(l) {
			in = !in
			continue
		}
		if in || trim(l) == "" {
			continue
		}
		switch {
		case checkboxRe.MatchString(l):
			afterBox = true
		case l[0] == ' ' || l[0] == '\t':
			if !afterBox {
				loose = append(loose, trim(l))
			}
		case closingRe.MatchString(trim(l)):
			afterBox = false
		default:
			loose = append(loose, trim(l))
			afterBox = false
		}
		last = trim(l)
	}
	if len(loose) > 0 {
		problems = append(problems, fmt.Sprintf("要你做的事只放复选框（- [ ] …）、代码块和末尾那句，不放别的文字：「%s」", loose[0]))
	}
	if !closingRe.MatchString(last) {
		problems = append(problems, "要你做的事的末尾要有「说「合并」即可」这一句")
	}
	return problems
}

func riskProblems(text string) []string {
	var problems []string
	if !gateRe.MatchString(text) {
		if gateAnyRe.MatchString(text) {
			problems = append(problems, "合并风险的「门」写「双向」或「单向」：门：双向 / 单向。单向的写清退不回的是哪部分")
		} else {
			problems = append(problems, "合并风险缺「门」一行：门：双向 / 单向。单向的写清退不回的是哪部分")
		}
	}
	if !reachRe.MatchString(text) {
		problems = append(problems, "合并风险缺「影响面」一行：影响面：一个词，可以再加一句合并后可能的连带后果")
	}
	bullets := 0
	for _, l := range proseLines(text) {
		if bulletRe.MatchString(l) {
			bullets++
		}
	}
	if bullets > 3 {
		problems = append(problems, fmt.Sprintf("合并风险的「要特别注意的」最多 3 条，现在 %d 条：留迁移、兼容约束、刻意没做的，其余删掉", bullets))
	}
	return problems
}

// StructureProblems is what is wrong with the shape of a section about to be written; empty when it can be. The
// problem section as it is now is what the evidence's groups are counted against ("" when there is none yet).
// needsMenu is true when a view is missing.
func StructureProblems(name, content, problem string) (problems []string, needsMenu bool) {
	switch name {
	case "problem", "evidence":
		if countViews(content) == 0 {
			problems = append(problems, missingView(name))
			needsMenu = true
		}
	case "outline":
		if n := countViews(content); n > 2 {
			problems = append(problems, fmt.Sprintf("概要最多两个视图，现在 %d 个：按最容易看懂的顺序讲，要点在两处才加第二个", n))
		}
	case "risk":
		problems = append(problems, riskProblems(content)...)
	case "your-todo":
		problems = append(problems, toDoProblems(content)...)
	}
	if name == "evidence" {
		groups, paired := groupsOf(content)
		items := itemsOf(problem)
		switch {
		case !paired:
			problems = append(problems, "证据里的「之前」「之后」要成对：每组先「**之前**：…」再「**之后**：…」，同一个操作在基准分支和本分支各做一遍")
		case groups < items && !unverifiedRe.MatchString(content):
			problems = append(problems, fmt.Sprintf("问题有 %d 件，证据只有 %d 组之前 / 之后：没做的那几件在末尾写一行「没验成：<哪件>的之前或之后，为什么，谁补」", items, groups))
		}
	}
	var text string
	switch name {
	case "problem", "evidence", "risk":
		text = content
	case "your-todo":
		text = withoutCode(content)
	case "live-check":
		text = content
	}
	if text != "" {
		if hits := namingHits(text); len(hits) > 0 {
			problems = append(problems, "section "+name+" is read by a person; say it in words (提交号、函数名、文件路径、接口地址只在概要里写；人自己会敲的 skill 名、斜杠命令、dyna 命令名可以写):\n"+strings.Join(hits, "\n"))
		}
	}
	return problems, needsMenu
}
