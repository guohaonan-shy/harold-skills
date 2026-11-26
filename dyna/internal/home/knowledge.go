package home

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
)

// The fifth item of `home config`: moving one project's idea-loop bootstrap files and docs/ out of its code
// repository into <home>/projects/<name>/. It is done only when --only names it (never in the default four),
// because it works on one project and needs a table a person has read first.
//
//	plan   reads the repository (git ls-files, a scan for hard-coded docs/ paths, `gh pr list`) and writes nothing
//	apply  takes the plan file (the plan's JSON, "去哪" filled in), copies, and commits the files to home
//
// Nothing in the code repository is ever changed.

// KnowledgeItem is the item's id. It is not in ConfigItems: `--only 1,2,3,4` and the default stay the four.
const KnowledgeItem = "knowledge"

// TrackerTemplateFile is the setup template whose 「分类 label」 section gives the wording ISSUE_TRACKER.md gets.
const TrackerTemplateFile = "skills/engineering/setup/references/issue-tracker.md"

// The two values 「去哪」 takes. Empty means nobody decided yet; apply refuses while a row is empty.
const (
	DestProject = "项目目录"
	DestStay    = "留在代码仓库"
)

// The kinds a row of the inventory can be.
const (
	ClassInstalled = "安装来的"
	ClassKnowledge = "仓库专属的知识"
	ClassTools     = "仓库专属的工具"
	ClassCode      = "仓库自己的文件（子目录）"
)

// InventoryRow is a tracked file, or a directory of them, with what it is and where it goes.
type InventoryRow struct {
	Path  string `json:"path"` // a directory ends with "/"
	Files int    `json:"files"`
	Class string `json:"class"`
	Dest  string `json:"dest"`
}

// HardLine is one place a file names docs/.
type HardLine struct {
	Line int    `json:"line"`
	Text string `json:"text"`
}

// HardRow is a tracked file outside docs/ that names the repository's docs/ by a relative path.
type HardRow struct {
	File  string     `json:"file"`
	Lines []HardLine `json:"lines"`
}

// PRRow is an open pull request that changes something under docs/.
type PRRow struct {
	Number int    `json:"number"`
	Title  string `json:"title"`
}

// KnowledgePlan is the three tables, and the item they belong to (only the item when the project is already moved). It is also the file `apply --plan` reads.
type KnowledgePlan struct {
	Project   string         `json:"project"`
	Item      ConfigItem     `json:"item"`
	Inventory []InventoryRow `json:"inventory"`
	Hardcoded []HardRow      `json:"hardcoded"`
	PRs       []PRRow        `json:"prs"`
	PRsError  string         `json:"prsError,omitempty"`
}

type knowledgeTarget struct {
	Name       string
	CloneDir   string
	ProjectDir string
	Moved      bool
}

// resolveKnowledge is the project the item works on: the one --project names, or the one the session's directory
// belongs to. It may be a project that has not moved yet (that is the point); it must be listed.
func resolveKnowledge(env Env, cwd, name string) (knowledgeTarget, error) {
	f := Locate(cwd, env, name)
	switch {
	case f.OK:
		return knowledgeTarget{Name: f.Project, CloneDir: f.CloneDir, ProjectDir: f.ProjectDir, Moved: true}, nil
	case f.Entry != nil:
		dir := expandHome(f.Entry.Path, env)
		if !isDir(dir) {
			return knowledgeTarget{}, nexterr.Plain("项目「%s」登记的本地路径 %s 不存在，没法读它的文件", f.Entry.Name, dir)
		}
		return knowledgeTarget{Name: f.Entry.Name, CloneDir: dir, ProjectDir: filepath.Join(Dir(env), "projects", f.Entry.Name)}, nil
	}
	return knowledgeTarget{}, f.Err()
}

func trackedFiles(dir string) ([]string, error) {
	r := git(dir, 0, "ls-files", "-z")
	if r.code != 0 {
		return nil, fmt.Errorf("%s 里 git ls-files 失败：%s", dir, r.text())
	}
	var out []string
	for _, p := range strings.Split(r.out, "\x00") {
		if p != "" {
			out = append(out, p)
		}
	}
	sort.Strings(out)
	return out, nil
}

func isBootstrap(name string) bool {
	for _, b := range BootstrapFiles {
		if b == name {
			return true
		}
	}
	return false
}

// groupOf is the row a tracked file belongs to, and what the row is by default: the first rule that holds wins.
func groupOf(path string) (group, class, dest string) {
	parts := strings.Split(path, "/")
	switch {
	case len(parts) == 1 && isBootstrap(path):
		return path, ClassInstalled, DestProject
	case parts[0] == "docs" && len(parts) > 1:
		if len(parts) >= 3 {
			return "docs/" + parts[1] + "/", ClassKnowledge, DestProject
		}
		return path, ClassKnowledge, DestProject
	// .gitattributes and .gitignore stay in the repository; apply copies their lines that point at docs/ into home's own
	case len(parts) == 1 && (path == "AGENTS.md" || path == "CLAUDE.md" || path == "EVAL.md" || path == ".gitattributes" || path == ".gitignore" || strings.HasPrefix(path, "README")):
		return path, ClassTools, DestStay
	case parts[0] == ".claude" && len(parts) > 1:
		return ".claude/", ClassTools, DestStay
	case len(parts) == 1:
		return path, "", ""
	}
	return parts[0] + "/", ClassCode, DestStay
}

func buildInventory(files []string) []InventoryRow {
	idx := map[string]*InventoryRow{}
	var order []string
	for _, f := range files {
		g, class, dest := groupOf(f)
		if r, ok := idx[g]; ok {
			r.Files++
			continue
		}
		idx[g] = &InventoryRow{Path: g, Files: 1, Class: class, Dest: dest}
		order = append(order, g)
	}
	sort.Strings(order)
	rows := []InventoryRow{}
	for _, g := range order {
		rows = append(rows, *idx[g])
	}
	return rows
}

// A relative path into the repository's own docs/: `docs/…`, `./docs/…`, `../docs/…`. A `/docs/` that follows a
// host or another directory (https://example.com/docs/registry, /abs/docs/x) is somebody else's.
var hardDocsRe = regexp.MustCompile(`(?:^|[^A-Za-z0-9_\-./~:])(?:\.\.?/)*docs/`)

func scanHardcoded(dir string, files []string) []HardRow {
	rows := []HardRow{}
	for _, f := range files {
		// docs/ itself, and the two files apply rewrites by itself, are not tools that break
		if f == "docs" || strings.HasPrefix(f, "docs/") || f == ".gitattributes" || f == ".gitignore" {
			continue
		}
		p := filepath.Join(dir, filepath.FromSlash(f))
		st, err := os.Lstat(p)
		if err != nil || !st.Mode().IsRegular() || st.Size() > 2<<20 {
			continue
		}
		b, err := os.ReadFile(p)
		if err != nil || bytes.IndexByte(b, 0) >= 0 {
			continue
		}
		var hits []HardLine
		for i, line := range strings.Split(string(b), "\n") {
			if hardDocsRe.MatchString(line) {
				text := strings.TrimSpace(line)
				if r := []rune(text); len(r) > 120 {
					text = string(r[:120]) + "…"
				}
				hits = append(hits, HardLine{Line: i + 1, Text: text})
			}
		}
		if len(hits) > 0 {
			rows = append(rows, HardRow{File: f, Lines: hits})
		}
	}
	return rows
}

// ghBin finds gh on the PATH the session has (env), else the process's.
func ghCommand(env Env, ctx context.Context, dir string, args ...string) *exec.Cmd {
	bin := "gh"
	pathEnv := env("PATH")
	if pathEnv != "" {
		for _, d := range filepath.SplitList(pathEnv) {
			cand := filepath.Join(d, "gh")
			if st, err := os.Stat(cand); err == nil && !st.IsDir() {
				bin = cand
				break
			}
		}
	}
	cmd := exec.CommandContext(ctx, bin, args...)
	cmd.Dir = dir
	cmd.Env = os.Environ()
	if pathEnv != "" {
		cmd.Env = append(cmd.Env, "PATH="+pathEnv)
	}
	return cmd
}

// docsPRs are the open PRs that change something under docs/; a reason instead when gh cannot say.
func docsPRs(env Env, dir string) ([]PRRow, string) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	cmd := ghCommand(env, ctx, dir, "pr", "list", "--state", "open", "--limit", "500", "--json", "number,title,files")
	var so, se bytes.Buffer
	cmd.Stdout, cmd.Stderr = &so, &se
	if err := cmd.Run(); err != nil {
		why := strings.TrimSpace(se.String())
		if why == "" {
			why = err.Error()
		}
		return nil, strings.SplitN(why, "\n", 2)[0]
	}
	var prs []struct {
		Number int    `json:"number"`
		Title  string `json:"title"`
		Files  []struct {
			Path string `json:"path"`
		} `json:"files"`
	}
	if err := json.Unmarshal(so.Bytes(), &prs); err != nil {
		return nil, "gh 的输出读不懂：" + err.Error()
	}
	out := []PRRow{}
	for _, p := range prs {
		for _, f := range p.Files {
			if f.Path == "docs" || strings.HasPrefix(f.Path, "docs/") {
				out = append(out, PRRow{Number: p.Number, Title: p.Title})
				break
			}
		}
	}
	return out, ""
}

// PlanKnowledge reads the project's repository and says what moving it would do. It writes nothing.
func PlanKnowledge(env Env, cwd, project string) (KnowledgePlan, error) {
	t, err := resolveKnowledge(env, cwd, project)
	if err != nil {
		return KnowledgePlan{}, err
	}
	if isDir(filepath.Join(t.ProjectDir, "docs")) {
		// Already moved: the total row is all there is to say, and the three tables are not read.
		return KnowledgePlan{
			Project: t.Name,
			Item: ConfigItem{
				ID:     KnowledgeItem,
				Label:  fmt.Sprintf("把 %s 的引导文件和 docs/ 搬进 %s", t.Name, t.ProjectDir),
				Status: "already",
				Before: "项目目录下已有 docs/，当作已搬",
				After:  "项目目录下有这些文件（相对位置不变），并提交到 home",
			},
		}, nil
	}
	files, err := trackedFiles(t.CloneDir)
	if err != nil {
		return KnowledgePlan{}, err
	}
	inv := buildInventory(files)
	boot, docs := 0, 0
	for _, f := range files {
		if isBootstrap(f) {
			boot++
		}
		if strings.HasPrefix(f, "docs/") {
			docs++
		}
	}
	item := ConfigItem{
		ID:     KnowledgeItem,
		Label:  fmt.Sprintf("把 %s 的引导文件和 docs/ 搬进 %s", t.Name, t.ProjectDir),
		Status: "todo",
		Before: fmt.Sprintf("在代码仓库 %s 里：%d 份引导文件、docs/ 下 %d 个跟踪的文件", t.CloneDir, boot, docs),
		After:  "项目目录下有这些文件（相对位置不变），并提交到 home",
	}
	prs, why := docsPRs(env, t.CloneDir)
	if prs == nil {
		prs = []PRRow{}
	}
	return KnowledgePlan{
		Project:   t.Name,
		Item:      item,
		Inventory: inv,
		Hardcoded: scanHardcoded(t.CloneDir, files),
		PRs:       prs,
		PRsError:  why,
	}, nil
}

// KnowledgeJSON is the plan as `plan --json --only knowledge` prints it: the config items that were asked for
// (the knowledge item among them) and the three tables.
type knowledgeJSON struct {
	Items     []ConfigItem   `json:"items"`
	Project   string         `json:"project"`
	Inventory []InventoryRow `json:"inventory"`
	Hardcoded []HardRow      `json:"hardcoded"`
	PRs       []PRRow        `json:"prs"`
	PRsError  string         `json:"prsError,omitempty"`
}

// KnowledgePlanJSON joins the other items' plan with the knowledge plan, the shape `apply --plan` reads back.
func KnowledgePlanJSON(items []ConfigItem, k KnowledgePlan) string {
	out := append(append([]ConfigItem{}, items...), k.Item)
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	if k.Item.Status == "already" {
		// Already moved: no tables, so the file says only the items and the project.
		_ = enc.Encode(struct {
			Items   []ConfigItem `json:"items"`
			Project string       `json:"project"`
		}{out, k.Project})
		return buf.String()
	}
	_ = enc.Encode(knowledgeJSON{Items: out, Project: k.Project, Inventory: k.Inventory, Hardcoded: k.Hardcoded, PRs: k.PRs, PRsError: k.PRsError})
	return buf.String()
}

// KnowledgeTables are the three tables as Markdown.
func KnowledgeTables(k KnowledgePlan) string {
	if k.Item.Status == "already" {
		return ""
	}
	esc := func(s string) string { return strings.ReplaceAll(s, "|", `\|`) }
	var b strings.Builder
	b.WriteString("\n### 盘点：" + k.Project + " 里 git 跟踪的文件\n\n")
	b.WriteString("| 文件 | 文件数 | 归类 | 去哪 |\n|---|---|---|---|\n")
	for _, r := range k.Inventory {
		fmt.Fprintf(&b, "| %s | %d | %s | %s |\n", esc(r.Path), r.Files, esc(r.Class), esc(r.Dest))
	}
	b.WriteString("\n### 写死 docs/ 的文件\n\n")
	if len(k.Hardcoded) == 0 {
		b.WriteString("（没有）\n")
	} else {
		b.WriteString("| 文件 | 行 |\n|---|---|\n")
		for _, h := range k.Hardcoded {
			var ls []string
			for i, l := range h.Lines {
				if i == 3 {
					ls = append(ls, fmt.Sprintf("…共 %d 行", len(h.Lines)))
					break
				}
				ls = append(ls, fmt.Sprintf("%d: %s", l.Line, l.Text))
			}
			fmt.Fprintf(&b, "| %s | %s |\n", esc(h.File), esc(strings.Join(ls, "；")))
		}
	}
	b.WriteString("\n### 开着且改了 docs/ 的 PR\n\n")
	switch {
	case k.PRsError != "":
		b.WriteString("| 号 | 标题 |\n|---|---|\n")
		fmt.Fprintf(&b, "| - | 查不到：%s |\n", esc(k.PRsError))
	case len(k.PRs) == 0:
		b.WriteString("（没有）\n")
	default:
		b.WriteString("| 号 | 标题 |\n|---|---|\n")
		for _, p := range k.PRs {
			fmt.Fprintf(&b, "| #%d | %s |\n", p.Number, esc(p.Title))
		}
	}
	return b.String()
}

// KnowledgeDone is what apply did, as the lines to tell the caller.
type KnowledgeDone struct {
	Lines   []string
	Already bool
}

// destOf is where a tracked file goes under the plan: the plan's row for it (its own, else the longest directory
// row above it), else what the file would be by default.
func destOf(rows []InventoryRow, file string) (row string, dest string, planned bool) {
	best := -1
	for i, r := range rows {
		if r.Path == file {
			return r.Path, r.Dest, true
		}
		if strings.HasSuffix(r.Path, "/") && strings.HasPrefix(file, r.Path) && (best < 0 || len(r.Path) > len(rows[best].Path)) {
			best = i
		}
	}
	if best >= 0 {
		return rows[best].Path, rows[best].Dest, true
	}
	g, _, d := groupOf(file)
	return g, d, false
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	st, err := in.Stat()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	out, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, st.Mode().Perm()|0o600)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

// replaceSection puts replacement where the `## name` section was (an empty one drops it); false when there is none.
func replaceSection(text, name, replacement string) (string, bool) {
	var b strings.Builder
	found := false
	for _, c := range chunks(text) {
		if c.name == name && !found {
			found = true
			b.WriteString(replacement)
			continue
		}
		b.WriteString(c.text)
	}
	return b.String(), found
}

var catBulletRe = regexp.MustCompile("^\\s*- `")

// typesFromAgents are the category bullets and the keep-list line of the repository AGENTS.md's 「issue 分类」
// section; nil when there is no such section or it holds neither.
func typesFromAgents(agents string) []string {
	for _, c := range chunks(agents) {
		if c.name != "issue 分类" {
			continue
		}
		var out []string
		for _, line := range strings.Split(c.text, "\n") {
			line = strings.TrimRight(line, " \t\r")
			if catBulletRe.MatchString(line) || strings.HasPrefix(strings.TrimSpace(line), "保留的 label") {
				out = append(out, line)
			}
		}
		return out
	}
	return nil
}

// trackerNote is the explanation the template's 「分类 label」 section gives: everything before its example bullets.
func trackerNote(template string) (string, error) {
	for _, c := range chunks(template) {
		if c.name != "分类 label" {
			continue
		}
		var keep []string
		for _, line := range strings.Split(c.text, "\n")[1:] {
			if catBulletRe.MatchString(line) {
				break
			}
			keep = append(keep, line)
		}
		note := strings.TrimSpace(strings.Join(keep, "\n"))
		if note == "" {
			break
		}
		return note, nil
	}
	return "", fmt.Errorf("setup 模板里没有「分类 label」一节的说明（%s）", TrackerTemplateFile)
}

// migrateTracker is home's ISSUE_TRACKER.md: the 「仓库」 section gone, and — when the repository's AGENTS.md has an
// 「issue 分类」 section — the 「分类 label」 section as the template's note followed by that section's entries.
func migrateTracker(tracker, agents, pluginRoot string) (string, error) {
	text, _ := replaceSection(tracker, "仓库", "")
	entries := typesFromAgents(agents)
	if len(entries) == 0 {
		return text, nil
	}
	if pluginRoot == "" {
		return "", nexterr.Plain("要换 ISSUE_TRACKER.md 的「分类 label」一节，得读 setup 模板，但不知道插件装在哪：%s 没设（经插件的 bin/dyna 调用会自己设）", EnvPluginRoot)
	}
	tb, err := os.ReadFile(filepath.Join(pluginRoot, filepath.FromSlash(TrackerTemplateFile)))
	if err != nil {
		return "", fmt.Errorf("读不到 setup 模板 %s：%v", filepath.Join(pluginRoot, TrackerTemplateFile), err)
	}
	note, err := trackerNote(string(tb))
	if err != nil {
		return "", err
	}
	section := "## 分类 label\n\n" + note + "\n\n" + strings.Join(entries, "\n") + "\n"
	if next, ok := replaceSection(text, "分类 label", section+"\n"); ok {
		return strings.TrimRight(next, "\n") + "\n", nil
	}
	return strings.TrimRight(text, "\n") + "\n\n" + section, nil
}

// prefixedLines are the lines of a repository's .gitattributes / .gitignore that point at docs/, each with
// projects/<name>/ in front of the path, left out when home's file already has the line.
func prefixedLines(repoText, homeText, name string, attributes bool) []string {
	have := map[string]bool{}
	for _, l := range strings.Split(homeText, "\n") {
		have[strings.TrimSpace(l)] = true
	}
	var out []string
	for _, line := range strings.Split(repoText, "\n") {
		t := strings.TrimSpace(line)
		if t == "" || strings.HasPrefix(t, "#") {
			continue
		}
		rest := t
		neg := ""
		if strings.HasPrefix(rest, "!") {
			neg, rest = "!", rest[1:]
		}
		pattern, tail := rest, ""
		if attributes {
			if i := strings.IndexAny(rest, " \t"); i >= 0 {
				pattern, tail = rest[:i], rest[i:]
			}
		}
		lead := ""
		if strings.HasPrefix(pattern, "/") {
			lead, pattern = "/", pattern[1:]
		}
		if pattern != "docs" && !strings.HasPrefix(pattern, "docs/") {
			continue
		}
		next := neg + lead + "projects/" + name + "/" + pattern + tail
		if !have[next] {
			have[next] = true
			out = append(out, next)
		}
	}
	return out
}

// appendLines adds lines to home's file; reports whether it changed.
func appendLines(path string, lines []string) (bool, error) {
	if len(lines) == 0 {
		return false, nil
	}
	cur, _ := os.ReadFile(path)
	text := string(cur)
	if text != "" && !strings.HasSuffix(text, "\n") {
		text += "\n"
	}
	return true, os.WriteFile(path, []byte(text+strings.Join(lines, "\n")+"\n"), 0o644)
}

func readPlan(path string) ([]InventoryRow, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("读不到出表的 JSON %s：%v；什么都没写", path, err)
	}
	var p struct {
		Inventory []InventoryRow `json:"inventory"`
	}
	if err := json.Unmarshal(b, &p); err != nil {
		return nil, fmt.Errorf("%s 不是出表的 JSON（%v）；什么都没写", path, err)
	}
	if len(p.Inventory) == 0 {
		return nil, fmt.Errorf("%s 里没有盘点表（inventory）：用 `plan --only knowledge --json` 的输出；什么都没写", path)
	}
	return p.Inventory, nil
}

// ApplyKnowledge moves the project's files as the plan file says, and commits them to home.
func ApplyKnowledge(env Env, cwd, project, planPath, pluginRoot string, now time.Time) (KnowledgeDone, error) {
	t, err := resolveKnowledge(env, cwd, project)
	if err != nil {
		return KnowledgeDone{}, err
	}
	h := Dir(env)
	docsDir := filepath.Join(t.ProjectDir, "docs")
	if isDir(docsDir) {
		return KnowledgeDone{Already: true, Lines: []string{fmt.Sprintf("%s 的知识库已搬（%s 已在），什么都没改", t.Name, docsDir)}}, nil
	}
	if !isDir(h) {
		return KnowledgeDone{}, fmt.Errorf("home 不存在：%s", h)
	}
	if planPath == "" {
		return KnowledgeDone{}, nexterr.Plain("knowledge 要带 --plan <文件>：先 `dyna home config plan --only knowledge --json` 存成文件，把「去哪」填完")
	}
	rows, err := readPlan(planPath)
	if err != nil {
		return KnowledgeDone{}, err
	}
	files, err := trackedFiles(t.CloneDir)
	if err != nil {
		return KnowledgeDone{}, err
	}

	// refuse before writing anything: an empty or unknown 「去哪」, in the table or for a file it does not list
	var open []string
	seen := map[string]bool{}
	note := func(row, why string) {
		if !seen[row] {
			seen[row] = true
			open = append(open, row+why)
		}
	}
	for _, r := range rows {
		if r.Dest != "" && !strings.HasPrefix(r.Dest, DestProject) && r.Dest != DestStay {
			note(r.Path, "（「去哪」写的是「"+r.Dest+"」，只认「"+DestProject+"」「"+DestStay+"」）")
		}
		if r.Dest == "" {
			note(r.Path, "")
		}
	}
	var moves []string
	for _, f := range files {
		row, dest, planned := destOf(rows, f)
		switch {
		case dest == "":
			if !planned {
				note(row, "（盘点表里没有这一行）")
			} else {
				note(row, "")
			}
		case strings.HasPrefix(dest, DestProject):
			moves = append(moves, f)
		}
	}
	if len(open) > 0 {
		return KnowledgeDone{}, nexterr.Plain("盘点表里这几行的「去哪」还没定，什么都没写：%s", strings.Join(open, "、"))
	}

	// what is written is worked out first, so a bad template or tracker stops before the first copy
	var tracker string
	trackerGoes := false
	for _, f := range moves {
		if f == "ISSUE_TRACKER.md" {
			trackerGoes = true
		}
	}
	if trackerGoes {
		tb, err := os.ReadFile(filepath.Join(t.CloneDir, "ISSUE_TRACKER.md"))
		if err != nil {
			return KnowledgeDone{}, err
		}
		agents, _ := os.ReadFile(filepath.Join(t.CloneDir, "AGENTS.md"))
		if tracker, err = migrateTracker(string(tb), string(agents), pluginRoot); err != nil {
			return KnowledgeDone{}, err
		}
	}

	backup, err := newBackupDir(h, now)
	if err != nil {
		return KnowledgeDone{}, err
	}
	pb, err := os.ReadFile(planPath)
	if err != nil {
		return KnowledgeDone{}, err
	}
	if err := os.WriteFile(filepath.Join(backup, filepath.Base(planPath)), pb, 0o644); err != nil {
		return KnowledgeDone{}, err
	}
	if err := ensureBackupIgnored(h); err != nil {
		return KnowledgeDone{}, err
	}

	// docs/ lands last: everything goes into a temporary directory first, and it becomes docs/ only when the
	// rest is in place, so a failure half-way leaves a project that still reads as not moved
	tmp := filepath.Join(t.ProjectDir, ".docs-moving")
	if err := os.RemoveAll(tmp); err != nil {
		return KnowledgeDone{}, err
	}
	fail := func(err error) (KnowledgeDone, error) {
		_ = os.RemoveAll(tmp)
		return KnowledgeDone{}, err
	}
	var others, docsFiles []string
	for _, f := range moves {
		if strings.HasPrefix(f, "docs/") {
			docsFiles = append(docsFiles, f)
		} else {
			others = append(others, f)
		}
	}
	if err := os.MkdirAll(t.ProjectDir, 0o755); err != nil {
		return fail(err)
	}
	for _, f := range docsFiles {
		if err := copyFile(filepath.Join(t.CloneDir, filepath.FromSlash(f)), filepath.Join(tmp, filepath.FromSlash(strings.TrimPrefix(f, "docs/")))); err != nil {
			return fail(fmt.Errorf("复制 %s 失败：%v；%s 里没有 docs/，去掉原因后重跑", f, err, t.ProjectDir))
		}
	}
	var written []string
	for _, f := range others {
		dst := filepath.Join(t.ProjectDir, filepath.FromSlash(f))
		if f == "ISSUE_TRACKER.md" {
			if err := os.WriteFile(dst, []byte(tracker), 0o644); err != nil {
				return fail(err)
			}
		} else if err := copyFile(filepath.Join(t.CloneDir, filepath.FromSlash(f)), dst); err != nil {
			return fail(fmt.Errorf("复制 %s 失败：%v；%s 里没有 docs/，去掉原因后重跑", f, err, t.ProjectDir))
		}
		written = append(written, dst)
	}
	var homeFiles []string
	for _, spec := range []struct {
		name string
		attr bool
	}{{".gitattributes", true}, {".gitignore", false}} {
		src, err := os.ReadFile(filepath.Join(t.CloneDir, spec.name))
		if err != nil {
			continue
		}
		dst := filepath.Join(h, spec.name)
		cur, _ := os.ReadFile(dst)
		changed, err := appendLines(dst, prefixedLines(string(src), string(cur), t.Name, spec.attr))
		if err != nil {
			return fail(err)
		}
		// .gitignore also holds the `.backup/` line the backup added, which belongs in the same commit
		if changed || spec.name == ".gitignore" {
			homeFiles = append(homeFiles, dst)
		}
	}
	if err := os.Rename(tmp, docsDir); err != nil {
		return fail(err)
	}

	done := KnowledgeDone{Lines: []string{fmt.Sprintf("已复制 %s 的 %d 个文件到 %s；plan 文件备份在 %s", t.Name, len(moves), t.ProjectDir, backup)}}
	res, err := Commit("chore: 搬入 "+t.Name+" 的知识库", append(append(written, docsDir), homeFiles...), cwd, env)
	done.Lines = append(done.Lines, res.Lines...)
	if err != nil {
		done.Lines = append(done.Lines, "提交被拒，已复制的文件留着，修好后跑 dyna home commit 提交")
		return done, err
	}
	return done, nil
}
