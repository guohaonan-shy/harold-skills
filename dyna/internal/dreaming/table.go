// Package dreaming is the `dreaming` module: the gate at the end of dreaming's proposal pass.
//
// A dreaming run writes every finding into one full proposal table, then splits its rows by risk: the rows that
// need a human's call are pulled out into a small table and put to the human, whose answer is executed as a
// follow-up; every other row is carried out as its own 建议处置 without asking. So the full table is the input to
// both, and a malformed one is dangerous in a specific way: a row whose disposition is not in the closed set is a
// row the execution pass cannot mechanically carry out, and an archive row without both pictures is a row the
// reader cannot judge at a glance.
//
// This package judges shape, never content: no model, no taste, no network. It checks that the row types (the
// `##` sections) are a closed set; that each row type has a closed set of dispositions; that archive rows carry two
// pictures, the second under tmp/; that a "product broken" row never carries a replace-the-archive disposition;
// that every candidate row carries a picture of the UI it is about; that a candidate headed for DESIGN.md and
// every DESIGN.md row carry the old and new text side by side; that every DESIGN.md row names the standard it rests
// on; and whether the table is empty. It also decides, from each row's own fields only, which rows go to the human.
package dreaming

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/jsstr"
)

// Columns are the five columns every section's table has.
var Columns = []string{"对象", "发现", "证据", "建议处置", "选项"}

// standardSections are design-modeling's section names: a DESIGN.md row's 「依据」 names one of them.
var standardSections = []string{"是什么", "结构", "五条写法规则", "维护原则", "Front matter", "各章写什么", "准入分层表", "明确不进 DESIGN.md 的内容", "一次写入怎么走", "新建", "蒸馏", "对账", "设计法候选的形态", "谁写、谁读"}

// RowType is one `##` section: its name and the closed set of 建议处置 a row of it may carry. The archive ones are
// fixed here so the archive tickets build on a settled shape.
type RowType struct {
	Name         string
	Dispositions []string
}

// RowTypes is the closed set of row types, in the order the error messages list them.
//
// retro 候选 is a rule candidate in the retro pool that has come up at least 3 times; dreaming reads the pool
// itself, and the row's 证据 carries the verbatim words of each occurrence, so it is checked only for being
// non-empty. 记忆 is one memory file or index line of the device's memory that dreaming's memory pass has something
// to do with; only a 问人 row (two rules that give opposite answers to the same case) goes to the human. 漏归档 is
// a merged need whose docs/design/tmp/<spec-slug>/ still holds design output on the base branch. 暂缓设计 is one
// shelved design in the project directory's docs/design/pending/ (local only, never in git), saying whether its spec is
// settled: 删除 for a settled one, 留着 for one still alive.
var RowTypes = []RowType{
	{"文档", []string{"写 ADR 删 spec", "写 ADR 未采纳删 spec", "报警", "订正", "标注被取代", "删漏网工单", "问人", "迁移布局", "删除"}},
	{"档案对象", []string{"改代码路径", "删对象", "补扫页面", "标进入方式过期"}},
	{"档案状态", []string{"替换档案", "改进入方式", "补进不去说明"}},
	{"初扫页面", []string{"新增页面"}},
	{"候选", []string{"改写已有规则", "追加新规则", "已覆盖不加", "留在原处", "起草通用原则 issue", "起草缺陷 issue", "驳回"}},
	{"漏归档", []string{"补归档", "丢弃"}},
	{"retro 候选", []string{"开 issue：机械检查", "开 issue：改 skill", "留在池里", "驳回"}},
	{"DESIGN.md 条目", []string{"改法", "移出", "删除", "改写为全局规则", "合并为一条", "新建 DESIGN.md", "处理 lint 警告", "交人裁决"}},
	{"记忆", []string{"挪进项目", "合并", "订正", "毕业", "删除", "缩短索引行", "问人"}},
	{"暂缓设计", []string{"删除", "留着"}},
	{"缺陷", []string{"开 issue", "已有 #N"}},
}

func RowTypeNamed(name string) (RowType, bool) {
	for _, t := range RowTypes {
		if t.Name == name {
			return t, true
		}
	}
	return RowType{}, false
}

func RowTypeNames() string {
	names := make([]string, len(RowTypes))
	for i, t := range RowTypes {
		names[i] = t.Name
	}
	return strings.Join(names, " / ")
}

var (
	fenceRe     = regexp.MustCompile("^" + jsstr.WS + "*(`{3,}|~{3,})")
	headingRe   = regexp.MustCompile("^(#{1,6})" + jsstr.WS + "+(.+?)" + jsstr.WS + "*#*" + jsstr.WS + "*$")
	tableRowRe  = regexp.MustCompile(`^` + jsstr.WS + `*\|`)
	separatorRe = regexp.MustCompile(`^:?-{2,}:?$`)
	parenRe     = regexp.MustCompile(jsstr.WS + `*[（(].*$`)
	verdictRe   = regexp.MustCompile("^(档案过期|进入方式过期|进不去|产品坏了|法对代码错)" + jsstr.WS + "*[：:]")
	alreadyRe   = regexp.MustCompile(`^已有 #\d+$`)
	imageRe     = regexp.MustCompile(`!\[[^\]]*\]\(` + jsstr.WS + `*([^)\s]+)[^)]*\)`)
	lintRe      = regexp.MustCompile(`(?i)lint|规范`)
	basisRe     = regexp.MustCompile(`(?s)依据` + jsstr.WS + `*[：:](.*)$`)
	tmpDirRe    = regexp.MustCompile("(^|[\\s/(`])tmp/")
	prodDirRe   = regexp.MustCompile(`(^|/)prod/`)
	tmpPicRe    = regexp.MustCompile(`(^|/)tmp/`)
	glossaryRe  = regexp.MustCompile("^`?GLOSSARY\\.md")
	titleRe     = regexp.MustCompile(`^#` + jsstr.WS + `+\S`)
	h2plusRe    = regexp.MustCompile(`^#{2,6}` + jsstr.WS)
)

func labelRe(label string) *regexp.Regexp {
	return regexp.MustCompile(label + jsstr.WS + `*[：:]`)
}

var (
	refsRe  = labelRe("引用")
	lackRe  = regexp.MustCompile(`缺`)
	triedRe = regexp.MustCompile(`试过`)
	noPicRe = labelRe("无图")
	landsRe = labelRe("并进")
	oldRe   = labelRe("旧")
	newRe   = labelRe("新")
	newOrRe = regexp.MustCompile(`新` + jsstr.WS + `*[：:]|→` + jsstr.WS + `*删`)
)

type row struct {
	line  int
	cells []string
}

type section struct {
	title  string
	line   int
	header *row
	rows   []row
}

// lines splits on \r?\n.
func lines(markdown string) []string {
	parts := strings.Split(markdown, "\n")
	for i, p := range parts {
		parts[i] = strings.TrimSuffix(p, "\r")
	}
	return parts
}

// sections parses ATX headings and pipe tables, skipping fenced code blocks.
func sections(markdown string) []*section {
	var out []*section
	var cur *section
	var fence byte
	for i, raw := range lines(markdown) {
		line := jsstr.TrimEnd(raw)
		if m := fenceRe.FindStringSubmatch(line); m != nil {
			switch {
			case fence == 0:
				fence = m[1][0]
			case m[1][0] == fence:
				fence = 0
			}
			continue
		}
		if fence != 0 {
			continue
		}
		if h := headingRe.FindStringSubmatch(line); h != nil {
			cur = nil
			if len(h[1]) >= 2 {
				cur = &section{title: jsstr.Trim(h[2]), line: i + 1}
				out = append(out, cur)
			}
			continue
		}
		if cur == nil || jsstr.Trim(line) == "" {
			continue
		}
		if tableRowRe.MatchString(line) {
			cells := splitRow(line)
			sep := true
			for _, c := range cells {
				if !separatorRe.MatchString(c) {
					sep = false
					break
				}
			}
			if sep {
				continue // the |---|---| separator
			}
			if cur.header == nil {
				cur.header = &row{i + 1, cells}
			} else {
				cur.rows = append(cur.rows, row{i + 1, cells})
			}
		}
	}
	return out
}

// splitRow splits one table line into trimmed cells; `\|` is a literal pipe inside a cell.
func splitRow(line string) []string {
	body := jsstr.Trim(line)
	body = strings.TrimPrefix(body, "|")
	body = strings.TrimSuffix(body, "|")
	var cells []string
	start := 0
	for i := 0; i < len(body); i++ {
		if body[i] == '|' && (i == 0 || body[i-1] != '\\') {
			cells = append(cells, body[start:i])
			start = i + 1
		}
	}
	cells = append(cells, body[start:])
	for i, c := range cells {
		cells[i] = jsstr.Trim(strings.ReplaceAll(c, `\|`, "|"))
	}
	return cells
}

// leadingDisposition is the leading disposition of a 建议处置 cell: everything before an optional trailing note in
// parentheses, so `订正（路径改名）` reads as `订正`.
func leadingDisposition(cell string) string {
	return jsstr.Trim(parenRe.ReplaceAllString(cell, ""))
}

// dispositionProblem is a problem string when cell is not a legal disposition for the type, otherwise "".
func dispositionProblem(t RowType, cell string) string {
	if cell == "" {
		return "" // already reported as an empty cell
	}
	lead := leadingDisposition(cell)
	for _, d := range t.Dispositions {
		if d == "已有 #N" {
			if alreadyRe.MatchString(lead) {
				return ""
			}
		} else if d == lead {
			return ""
		}
	}
	return fmt.Sprintf("的建议处置「%s」不在这一类的闭集里——只能是：%s", lead, strings.Join(t.Dispositions, " / "))
}

// verdictOf is the verdict a 发现 cell opens with (`档案过期：…`), or "".
func verdictOf(finding string) string {
	if m := verdictRe.FindStringSubmatch(finding); m != nil {
		return m[1]
	}
	return ""
}

// verdictDisposition is what each archive-state verdict is allowed to propose. 产品坏了 is deliberately absent.
var verdictDisposition = map[string]string{"档案过期": "替换档案", "进入方式过期": "改进入方式", "进不去": "补进不去说明"}

const verdictList = "档案过期 / 进入方式过期 / 进不去"

// productBrokenReplace: a product that is broken is not an archive that is out of date. Writing the broken picture
// over the archive would freeze a regression into the source of truth, so a 产品坏了 row proposing to replace the
// archive is refused by name, wherever it sits.
func productBrokenReplace(cells []string) string {
	if verdictOf(cells[1]) != "产品坏了" || leadingDisposition(cells[3]) != "替换档案" {
		return ""
	}
	return "是「产品坏了」却建议「替换档案」——不许：产品坏了不改档案，起草一条 issue 交人，别把坏掉的样子写进档案"
}

// verdictProblem holds the verdict-to-section rules. "" when the row's 发现 opens correctly for where it sits.
func verdictProblem(typ string, cells []string) string {
	verdict := verdictOf(cells[1])
	if typ == "档案状态" {
		switch verdict {
		case "":
			return fmt.Sprintf("的「发现」要以判定开头（%s），再加冒号", verdictList)
		case "产品坏了":
			return "的判定是「产品坏了」，不进「档案状态」——单列到「缺陷」一节，档案不改"
		case "法对代码错":
			return "的判定「法对代码错」不属于档案状态——它去「缺陷」一节"
		}
		want := verdictDisposition[verdict]
		if cells[3] != "" && leadingDisposition(cells[3]) != want {
			return fmt.Sprintf("的判定是「%s」，建议处置应为「%s」，不是「%s」", verdict, want, leadingDisposition(cells[3]))
		}
	}
	if typ == "缺陷" && verdict != "产品坏了" && verdict != "法对代码错" {
		return "的「发现」要以「产品坏了：」或「法对代码错：」开头，说明是哪一类缺陷"
	}
	return ""
}

// evidenceProblems: two rows whose evidence has to carry a specific answer, not just look plausible.
//   - 删对象: deleting an archive object while a node, edge or journey still points at it breaks the graph, so the
//     row names its referrers (`引用：…`, or `引用：无`; silence is not an answer);
//   - 进不去: a state nobody could enter is only useful if it says what was missing and what was tried (`缺…` and
//     `试过…`).
func evidenceProblems(typ string, cells []string) []string {
	evidence := cells[2]
	if typ == "档案对象" && leadingDisposition(cells[3]) == "删对象" && !refsRe.MatchString(evidence) {
		return []string{"的处置是「删对象」，证据里要写「引用：」列出还引用它的节点与边——没有就写「引用：无」"}
	}
	if typ == "档案状态" && verdictOf(cells[1]) == "进不去" && !(lackRe.MatchString(evidence) && triedRe.MatchString(evidence)) {
		return []string{"的判定是「进不去」，证据里要写清缺什么前置条件、试过哪些路线（「缺…」「试过…」）"}
	}
	return nil
}

// writesDesignMD are the candidate dispositions that end in DESIGN.md text, the ones whose wording a human approves.
var writesDesignMD = []string{"改写已有规则", "追加新规则"}

// designMdProblems: DESIGN.md rows are judged by reading the change itself, so the change has to be in the cell.
//   - a candidate row shows the UI the rule is about (`![…](…)`), or says why it has none (`无图：…`);
//   - a candidate headed for DESIGN.md says where it lands (`并进：<章>`) and shows 旧：… 新：…;
//   - every DESIGN.md row names what it rests on (`依据：` plus a section of design-modeling by name, the official
//     spec, or a lint rule);
//   - every DESIGN.md row except a new file shows 旧：…, and 新：… or `→ 删` (a 交人裁决 row's new texts live in
//     its 选项, one per choice).
func designMdProblems(typ string, cells []string) []string {
	evidence := cells[2]
	lead := leadingDisposition(cells[3])
	var problems []string
	if typ == "候选" {
		if len(imagePaths(evidence)) == 0 && !noPicRe.MatchString(evidence) {
			problems = append(problems, "的证据里没有图——放这条规则说的那块界面的截图（取自设计档案或实现），实在没有界面写「无图：原因」")
		}
		for _, w := range writesDesignMD {
			if lead != w {
				continue
			}
			if !landsRe.MatchString(evidence) {
				problems = append(problems, fmt.Sprintf("的处置是「%s」，证据里要写「并进：」进 DESIGN.md 的哪一章哪一条", lead))
			}
			if !(oldRe.MatchString(evidence) && newRe.MatchString(evidence)) {
				problems = append(problems, fmt.Sprintf("的处置是「%s」，证据里要放旧文与新文并排（「旧：…→ 新：…」，追加写「旧：无」）", lead))
			}
		}
	}
	if typ == "DESIGN.md 条目" {
		basis := basisRe.FindStringSubmatch(evidence)
		named := false
		if basis != nil {
			for _, name := range standardSections {
				if strings.Contains(basis[1], "「"+name+"」") {
					named = true
				}
			}
			named = named || lintRe.MatchString(basis[1])
		}
		if !named {
			problems = append(problems, "的证据里要写「依据：」并点名那条标准——design-modeling 的哪一节（如「五条写法规则」第 5 条、「明确不进 DESIGN.md 的内容」里的带日期的先例）、官方 design.md 规范的哪一条，或 lint 规则名")
		}
		if lead != "新建 DESIGN.md" {
			if !oldRe.MatchString(evidence) {
				problems = append(problems, "的证据里要有改前的原文（「旧：「…」」）")
			} else if lead != "交人裁决" && !newOrRe.MatchString(evidence) {
				problems = append(problems, "的证据里要有改后的样子（「→ 新：「…」」，删掉写「→ 删」）")
			}
		}
	}
	return problems
}

// imagePaths are the image paths in a cell, in order: markdown image syntax only.
func imagePaths(cell string) []string {
	var out []string
	for _, m := range imageRe.FindAllStringSubmatch(cell, -1) {
		out = append(out, m[1])
	}
	return out
}

// pictureProblems: archive rows are the ones a human judges by looking, the archive's picture next to the fresh
// one. So an archive-state row, and a defect row about a broken state, carry exactly the archive's own picture
// (under prod/) and then the new one (under tmp/, never a second prod/ picture, which would be the archive compared
// with itself). A state that could not be entered has nothing to photograph and is the one exception.
func pictureProblems(typ string, cells []string) []string {
	verdict := verdictOf(cells[1])
	needs := (typ == "档案状态" && verdict != "进不去") || (typ == "缺陷" && verdict == "产品坏了")
	if !needs {
		return nil
	}
	pics := imagePaths(cells[2])
	if len(pics) < 2 {
		return []string{fmt.Sprintf("的证据只有 %d 张图，档案行要两张图并排：先是 prod/ 里档案的样子，再是 tmp/ 里这次新拍的", len(pics))}
	}
	var problems []string
	if !prodDirRe.MatchString(pics[0]) {
		problems = append(problems, fmt.Sprintf("的第一张图「%s」不在 prod/ 下——第一张是档案里原本的样子", pics[0]))
	}
	if !tmpPicRe.MatchString(pics[1]) {
		problems = append(problems, fmt.Sprintf("的第二张图「%s」不在 tmp/ 下——第二张是这次新拍的，放在 dreaming 自己的 tmp/ 目录里", pics[1]))
	}
	return problems
}

// Counts maps each row type found to its row count, in the order the sections appear in the file.
type Counts struct {
	Names []string
	byKey map[string]int
}

// Get is the count of a row type; 0 when the type is not in the table.
func (c Counts) Get(name string) int { return c.byKey[name] }

func (c *Counts) set(name string, n int) {
	if c.byKey == nil {
		c.byKey = map[string]int{}
	}
	c.Names = append(c.Names, name)
	c.byKey[name] = n
}

func (c Counts) has(name string) bool { _, ok := c.byKey[name]; return ok }

// MarshalJSON writes the counts as an object in file order.
func (c Counts) MarshalJSON() ([]byte, error) {
	var b strings.Builder
	b.WriteByte('{')
	for i, name := range c.Names {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteString(strconv.Quote(name))
		b.WriteByte(':')
		b.WriteString(strconv.Itoa(c.byKey[name]))
	}
	b.WriteByte('}')
	return []byte(b.String()), nil
}

// Result is what the check found. Its JSON form is what `table submit --json` prints.
type Result struct {
	Valid  bool     `json:"valid"`
	Empty  bool     `json:"empty"`
	Errors []string `json:"errors"`
	Counts Counts   `json:"counts"`
}

// Check judges one proposal table's shape.
func Check(markdown string) Result {
	errs := []string{}
	var counts Counts
	counts.byKey = map[string]int{}
	secs := sections(markdown)

	if len(secs) == 0 {
		errs = append(errs, fmt.Sprintf("提议表一节都没有——空表也要写出跑过的那几节并标「无」，没有任何一节分不清是没事还是没跑成。行类型：%s", RowTypeNames()))
	}

	for _, s := range secs {
		typ, ok := RowTypeNamed(s.title)
		if !ok {
			errs = append(errs, fmt.Sprintf("第 %d 行「%s」不是行类型——行类型只有：%s", s.line, s.title, RowTypeNames()))
			continue
		}
		if counts.has(s.title) {
			errs = append(errs, fmt.Sprintf("第 %d 行「%s」重复出现——同一类的行放进同一节", s.line, s.title))
			continue
		}
		counts.set(s.title, len(s.rows))

		if s.header != nil && strings.Join(s.header.cells, "|") != strings.Join(Columns, "|") {
			errs = append(errs, fmt.Sprintf("「%s」第 %d 行表头不对：应为 %s", s.title, s.header.line, strings.Join(Columns, " / ")))
		}
		for _, r := range s.rows {
			where := fmt.Sprintf("「%s」第 %d 行", s.title, r.line)
			if len(r.cells) != len(Columns) {
				errs = append(errs, fmt.Sprintf("%s有 %d 列，应为 %d 列（%s）", where, len(r.cells), len(Columns), strings.Join(Columns, " / ")))
				continue
			}
			for i, name := range Columns {
				if r.cells[i] == "" {
					errs = append(errs, fmt.Sprintf("%s的「%s」是空的", where, name))
				}
			}
			bad := productBrokenReplace(r.cells)
			if bad == "" {
				bad = verdictProblem(s.title, r.cells)
			}
			if bad == "" {
				bad = dispositionProblem(typ, r.cells[3])
			}
			if bad != "" {
				errs = append(errs, where+bad)
			}
			for _, p := range pictureProblems(s.title, r.cells) {
				errs = append(errs, where+p)
			}
			for _, p := range evidenceProblems(s.title, r.cells) {
				errs = append(errs, where+p)
			}
			for _, p := range designMdProblems(s.title, r.cells) {
				errs = append(errs, where+p)
			}
			if s.title == "初扫页面" && !tmpDirRe.MatchString(r.cells[2]) {
				errs = append(errs, where+"的证据要指向 tmp/ 下这次建出来的页面草稿——初扫的产物先放 tmp/，只有归档命令写 prod/")
			}
		}
	}

	valid := len(errs) == 0
	// Empty means "nothing for a human to approve": a well-formed table with zero rows. Notes such as 「未扫：…」
	// are prose, not rows, so they do not make a table non-empty.
	empty := valid
	if valid {
		for _, n := range counts.byKey {
			if n != 0 {
				empty = false
			}
		}
	}
	return Result{Valid: valid, Empty: empty, Errors: errs, Counts: counts}
}

// isAskRow says whether a row of the type is put to the human rather than carried out on its own. The rule lives
// here and nowhere else; it reads only the row's type, disposition and object cell:
//   - every row of 候选 and of DESIGN.md 条目;
//   - a 文档 row whose disposition is 报警 or 问人 (a note in parentheses after it is ignored);
//   - a 记忆 row whose disposition is 问人 (two memory rules that contradict each other);
//   - a 暂缓设计 row proposing 删除: the design lives only on this machine, so deleting it cannot be undone from
//     git history; a 留着 row changes nothing and stays automatic;
//   - a 文档 row whose object starts with GLOSSARY.md: terms are decided by the human only, whatever the
//     disposition (a backtick around the file name is read through, so a quoted name is not mistaken for an
//     automatic row).
//
// Every other row type, and every other 文档 row, is carried out without asking.
func isAskRow(typ string, cells []string) bool {
	if typ == "候选" || typ == "DESIGN.md 条目" {
		return true
	}
	if typ == "记忆" {
		return leadingDisposition(cells[3]) == "问人"
	}
	if typ == "暂缓设计" {
		return leadingDisposition(cells[3]) == "删除"
	}
	if typ != "文档" {
		return false
	}
	lead := leadingDisposition(cells[3])
	return lead == "报警" || lead == "问人" || glossaryRe.MatchString(cells[0])
}

// openingOf is the `#` title line and the opening lines under it (scope of the pass, an unhandled earlier table).
func openingOf(markdown string) []string {
	all := lines(markdown)
	at := -1
	for i, l := range all {
		if titleRe.MatchString(l) {
			at = i
			break
		}
	}
	if at == -1 {
		return nil
	}
	opening := []string{jsstr.TrimEnd(all[at])}
	var fence byte
	for _, raw := range all[at+1:] {
		line := jsstr.TrimEnd(raw)
		mark := fenceRe.FindStringSubmatch(line)
		if mark != nil {
			switch {
			case fence == 0:
				fence = mark[1][0]
			case mark[1][0] == fence:
				fence = 0
			}
		}
		if fence == 0 && h2plusRe.MatchString(line) {
			break
		}
		if fence == 0 && mark == nil && jsstr.Trim(line) != "" {
			opening = append(opening, line)
		}
	}
	return opening
}

// renderRow is one table row back to markdown; a literal pipe in a cell is escaped again.
func renderRow(cells []string) string {
	escaped := make([]string, len(cells))
	for i, c := range cells {
		escaped[i] = strings.ReplaceAll(c, "|", `\|`)
	}
	return "| " + strings.Join(escaped, " | ") + " |"
}

// SplitAskRows pulls the rows that need a human out of a proposal table into a small table of the same shape: the
// same `#` title and opening lines, the same five columns, one `##` section per row type that has at least one such
// row. Notes at the end of a section are not copied. The input has to have passed Check. It returns "" and 0 when no
// row needs a human.
func SplitAskRows(markdown string) (string, int) {
	var blocks []string
	count := 0
	for _, s := range sections(markdown) {
		if _, ok := RowTypeNamed(s.title); !ok {
			continue
		}
		var rows []string
		for _, r := range s.rows {
			if len(r.cells) == len(Columns) && isAskRow(s.title, r.cells) {
				rows = append(rows, renderRow(r.cells))
			}
		}
		if len(rows) == 0 {
			continue
		}
		count += len(rows)
		block := []string{"## " + s.title, "", "| " + strings.Join(Columns, " | ") + " |", "|---|---|---|---|---|"}
		blocks = append(blocks, strings.Join(append(block, rows...), "\n"))
	}
	if count == 0 {
		return "", 0
	}
	return strings.Join(openingOf(markdown), "\n\n") + "\n\n" + strings.Join(blocks, "\n\n") + "\n", count
}

// Report is the human-readable form of a result.
func Report(r Result, file string) string {
	at := ""
	if file != "" {
		at = " (" + file + ")"
	}
	if !r.Valid {
		out := []string{"proposal-table: 校验失败" + at + " —— 先补齐再交给人："}
		for _, e := range r.Errors {
			out = append(out, "  - "+e)
		}
		return strings.Join(out, "\n")
	}
	if r.Empty {
		return "proposal-table: 空表 ✓" + at + " —— 本周无事：什么都不用做，也不推送"
	}
	total := 0
	var parts []string
	for _, name := range r.Counts.Names {
		n := r.Counts.byKey[name]
		total += n
		if n > 0 {
			parts = append(parts, fmt.Sprintf("%s %d", name, n))
		}
	}
	return fmt.Sprintf("proposal-table: green ✓%s —— %d 行：%s", at, total, strings.Join(parts, "、"))
}
