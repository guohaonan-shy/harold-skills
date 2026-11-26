package home

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
)

// The skills item of `home config`: ~/.claude/skills/ becomes a symlink to <home>/skills/. It is done only when
// --only names it (never in the default four), because which skills stay is a person's call, row by row.
//
//	plan   one row per entry of ~/.claude/skills/: name, link or not, where it points, how often a session of the
//	       last 30 days called it, and the 「去留」 column (empty: the person fills it)
//	apply  takes the plan file (the plan's JSON, "decision" filled in with 留 or 删), backs up the whole directory,
//	       copies the kept ones into <home>/skills/ as real files, removes the dropped ones, and once no row is
//	       left undecided swaps ~/.claude/skills for a symlink to <home>/skills/ and commits
//
// Whatever a dropped symlink points to is never touched.

// SkillsItem is the item's id. It is not in ConfigItems: `--only 1,2,3,4` and the default stay the four.
const SkillsItem = "skills"

// The two values 「去留」 takes. Empty means nobody decided yet; the row is left alone.
const (
	SkillKeep = "留"
	SkillDrop = "删"
)

// SkillsCommitMessage is the home commit apply makes when the swap is done.
const SkillsCommitMessage = "chore: 用户级 skill 搬进 home"

// SkillsWindowDays is how far back the call count looks.
const SkillsWindowDays = 30

// SkillRow is one entry of ~/.claude/skills/.
type SkillRow struct {
	Name     string `json:"name"`
	Link     bool   `json:"link"`
	Target   string `json:"target"` // absolute; empty when the entry is not a symlink
	Calls    int    `json:"calls"`
	Decision string `json:"decision"`
}

// SkillsPlan is the item and its table. The JSON of `plan --only skills --json` is {items, skills}, and that file
// with the decisions filled in is what `apply --plan` reads.
type SkillsPlan struct {
	Item   ConfigItem
	Skills []SkillRow
}

type skillsJSON struct {
	Items  []ConfigItem `json:"items"`
	Skills []SkillRow   `json:"skills"`
}

func skillsDir(env Env) string  { return filepath.Join(claudeDir(env), "skills") }
func homeSkills(env Env) string { return filepath.Join(Dir(env), "skills") }

// skillsState is "missing", "dir", "link" (to <home>/skills/), or "elsewhere" (a symlink to another place).
func skillsState(env Env) (state, target string, err error) {
	dir := skillsDir(env)
	st, err := os.Lstat(dir)
	if err != nil {
		return "missing", "", nil
	}
	if st.Mode()&os.ModeSymlink != 0 {
		_, target = claudeMdState(dir)
		if realish(target) == realish(homeSkills(env)) {
			return "link", target, nil
		}
		return "elsewhere", target, nil
	}
	if !st.IsDir() {
		return "", "", fmt.Errorf("%s 不是目录", dir)
	}
	return "dir", "", nil
}

// skillEntries are the names under dir that a person decides on (the Finder's .DS_Store is not one).
func skillEntries(dir string) ([]string, error) {
	des, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	var names []string
	for _, de := range des {
		if de.Name() != ".DS_Store" {
			names = append(names, de.Name())
		}
	}
	sort.Strings(names)
	return names, nil
}

type skillCall struct {
	Timestamp string `json:"timestamp"`
	Message   struct {
		Content json.RawMessage `json:"content"`
	} `json:"message"`
}

type skillBlock struct {
	Type  string `json:"type"`
	Name  string `json:"name"`
	Input struct {
		Skill string `json:"skill"`
	} `json:"input"`
}

// countSkillCalls counts, per skill name, the Skill tool calls in ~/.claude/projects/*/*.jsonl whose record is
// stamped within the last 30 days.
func countSkillCalls(env Env, now time.Time) map[string]int {
	counts := map[string]int{}
	files, _ := filepath.Glob(filepath.Join(claudeDir(env), "projects", "*", "*.jsonl"))
	since := now.AddDate(0, 0, -SkillsWindowDays)
	needle := []byte(`"Skill"`)
	for _, f := range files {
		fh, err := os.Open(f)
		if err != nil {
			continue
		}
		r := bufio.NewReaderSize(fh, 1<<20)
		for {
			line, err := r.ReadBytes('\n')
			if len(line) > 0 && bytes.Contains(line, needle) {
				countSkillLine(line, since, counts)
			}
			if err != nil {
				break
			}
		}
		fh.Close()
	}
	return counts
}

func countSkillLine(line []byte, since time.Time, counts map[string]int) {
	var rec skillCall
	if json.Unmarshal(line, &rec) != nil {
		return
	}
	at, err := time.Parse(time.RFC3339Nano, rec.Timestamp)
	if err != nil || at.Before(since) {
		return
	}
	var blocks []skillBlock
	if json.Unmarshal(rec.Message.Content, &blocks) != nil {
		return
	}
	for _, b := range blocks {
		if b.Type == "tool_use" && b.Name == "Skill" && b.Input.Skill != "" {
			counts[b.Input.Skill]++
		}
	}
}

// PlanSkills reads ~/.claude/skills/ and the session records. It writes nothing.
func PlanSkills(env Env, now time.Time) (SkillsPlan, error) {
	dir, target := skillsDir(env), homeSkills(env)
	state, link, err := skillsState(env)
	if err != nil {
		return SkillsPlan{}, err
	}
	item := ConfigItem{
		ID:     SkillsItem,
		Label:  dir + " 换成指向 home 的 skills/ 的软链",
		Status: "todo",
		After:  "软链 → " + target + "；留的复制进去（软链复制它指向的内容），删的去掉",
	}
	plan := SkillsPlan{Item: item, Skills: []SkillRow{}}
	switch state {
	case "link":
		plan.Item.Status, plan.Item.Before = "already", "软链 → "+link
		return plan, nil
	case "elsewhere":
		plan.Item.Status, plan.Item.Before = "manual", "软链 → "+link
		return plan, nil
	case "missing":
		plan.Item.Before = "不存在"
		return plan, nil
	}
	names, err := skillEntries(dir)
	if err != nil {
		return SkillsPlan{}, err
	}
	counts := countSkillCalls(env, now)
	links := 0
	for _, n := range names {
		row := SkillRow{Name: n, Calls: counts[n]}
		if s, t := claudeMdState(filepath.Join(dir, n)); s == "link" {
			row.Link, row.Target = true, t
			links++
		}
		plan.Skills = append(plan.Skills, row)
	}
	plan.Item.Before = fmt.Sprintf("真实目录，里面 %d 项（其中 %d 个软链）", len(names), links)
	return plan, nil
}

// SkillsPlanJSON joins the other items' plan with the skills plan, the shape `apply --plan` reads back.
func SkillsPlanJSON(items []ConfigItem, p SkillsPlan) string {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	_ = enc.Encode(skillsJSON{Items: append(append([]ConfigItem{}, items...), p.Item), Skills: p.Skills})
	return buf.String()
}

// SkillsTable is the skills of the plan as a Markdown table; "" when there are none.
func SkillsTable(p SkillsPlan) string {
	if len(p.Skills) == 0 {
		return ""
	}
	esc := func(s string) string { return strings.ReplaceAll(s, "|", `\|`) }
	var b strings.Builder
	b.WriteString("\n### ~/.claude/skills/ 下的 skill\n\n")
	fmt.Fprintf(&b, "| skill | 软链 | 指向 | 近 %d 天调用 | 去留 |\n|---|---|---|---|---|\n", SkillsWindowDays)
	for _, r := range p.Skills {
		link := "否"
		if r.Link {
			link = "是"
		}
		fmt.Fprintf(&b, "| %s | %s | %s | %d | %s |\n", esc(r.Name), link, esc(r.Target), r.Calls, esc(r.Decision))
	}
	return b.String()
}

func readSkillsPlan(path string) (map[string]string, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("读不到出表的 JSON %s：%v；什么都没写", path, err)
	}
	var p skillsJSON
	if err := json.Unmarshal(b, &p); err != nil {
		return nil, fmt.Errorf("%s 不是出表的 JSON（%v）；什么都没写", path, err)
	}
	if p.Skills == nil {
		return nil, fmt.Errorf("%s 里没有 skills 表：用 `plan --only skills --json` 的输出；什么都没写", path)
	}
	decisions := map[string]string{}
	for _, r := range p.Skills {
		if r.Decision != "" && r.Decision != SkillKeep && r.Decision != SkillDrop {
			return nil, nexterr.Plain("skills 表里「%s」的去留写的是「%s」，只认「%s」「%s」（或留空）；什么都没写", r.Name, r.Decision, SkillKeep, SkillDrop)
		}
		decisions[r.Name] = r.Decision
	}
	return decisions, nil
}

// copyEntry copies src to dst. A symlink is copied as a symlink, except at the top when followTop: then what it
// points to is copied, so the copy is a real file or directory.
func copyEntry(src, dst string, followTop bool) error {
	st, err := os.Lstat(src)
	if err != nil {
		return err
	}
	if st.Mode()&os.ModeSymlink != 0 {
		if !followTop {
			t, err := os.Readlink(src)
			if err != nil {
				return err
			}
			return os.Symlink(t, dst)
		}
		if st, err = os.Stat(src); err != nil {
			return err
		}
	}
	if !st.IsDir() {
		return copyFile(src, dst)
	}
	if err := os.MkdirAll(dst, st.Mode().Perm()|0o700); err != nil {
		return err
	}
	des, err := os.ReadDir(src)
	if err != nil {
		return err
	}
	for _, de := range des {
		if err := copyEntry(filepath.Join(src, de.Name()), filepath.Join(dst, de.Name()), false); err != nil {
			return err
		}
	}
	return nil
}

// swapInLink makes dir (a real directory) a symlink to target. The link is built beside it first and the two
// trade places in one step, so there is no moment without dir; the old directory is removed afterwards. Where the
// system cannot trade, the directory is moved aside and the link renamed in (a gap of two renames).
func swapInLink(dir, target string) error {
	tmp := dir + ".tmp-" + strconv.Itoa(os.Getpid())
	_ = os.Remove(tmp)
	if err := os.Symlink(target, tmp); err != nil {
		return err
	}
	if err := exchange(tmp, dir); err == nil {
		return os.RemoveAll(tmp)
	}
	old := dir + ".old-" + strconv.Itoa(os.Getpid())
	if err := os.Rename(dir, old); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	if err := os.Rename(tmp, dir); err != nil {
		_ = os.Rename(old, dir)
		_ = os.Remove(tmp)
		return err
	}
	return os.RemoveAll(old)
}

// SkillsDone is what apply did, as lines to print.
type SkillsDone struct {
	Lines []string
}

// ApplySkills does what the plan file says, and swaps the directory for the link when every row is decided.
func ApplySkills(env Env, cwd, planPath string, now time.Time) (SkillsDone, error) {
	dir, target, h := skillsDir(env), homeSkills(env), Dir(env)
	state, link, err := skillsState(env)
	if err != nil {
		return SkillsDone{}, err
	}
	switch state {
	case "link":
		return SkillsDone{Lines: []string{fmt.Sprintf("%s 已是指向 %s 的软链，什么都没改", dir, target)}}, nil
	case "elsewhere":
		return SkillsDone{Lines: []string{fmt.Sprintf("没动：%s 是指向 %s 的软链（别处），要人处理", dir, link)}}, nil
	}
	if !isDir(h) {
		return SkillsDone{}, fmt.Errorf("home 不存在：%s", h)
	}
	var names []string
	decisions := map[string]string{}
	if state == "dir" {
		if planPath == "" {
			return SkillsDone{}, nexterr.Plain("skills 要带 --plan <文件>：先 `dyna home config plan --only skills --json` 存成文件，把每行的 decision 填成「%s」或「%s」", SkillKeep, SkillDrop)
		}
		if decisions, err = readSkillsPlan(planPath); err != nil {
			return SkillsDone{}, err
		}
		if names, err = skillEntries(dir); err != nil {
			return SkillsDone{}, err
		}
	}
	var keeps, drops, open []string
	for _, n := range names {
		switch decisions[n] {
		case SkillKeep:
			if _, err := os.Stat(filepath.Join(dir, n)); err != nil {
				return SkillsDone{}, nexterr.Plain("「%s」是软链，指向的内容不存在，没法留；先改成「%s」或修好软链，什么都没写", n, SkillDrop)
			}
			keeps = append(keeps, n)
		case SkillDrop:
			drops = append(drops, n)
		default:
			open = append(open, n)
		}
	}
	if len(keeps)+len(drops) == 0 && len(names) > 0 {
		return SkillsDone{Lines: []string{"还有没定的行：" + strings.Join(open, "、") + "；一行都没填去留，什么都没改"}}, nil
	}

	var lines []string
	if state == "dir" {
		backup, err := newBackupDir(h, now)
		if err != nil {
			return SkillsDone{}, err
		}
		pb, err := os.ReadFile(planPath)
		if err != nil {
			return SkillsDone{}, err
		}
		if err := os.WriteFile(filepath.Join(backup, filepath.Base(planPath)), pb, 0o644); err != nil {
			return SkillsDone{}, err
		}
		if err := copyEntry(dir, filepath.Join(backup, "skills"), false); err != nil {
			return SkillsDone{}, fmt.Errorf("备份 %s 失败：%v；什么都没改", dir, err)
		}
		if err := ensureBackupIgnored(h); err != nil {
			return SkillsDone{}, err
		}
		lines = append(lines, fmt.Sprintf("已备份 %s 到 %s", dir, filepath.Join(backup, "skills")))
	}

	// every copy is in place before the first removal, so a failed copy loses nothing
	if err := os.MkdirAll(target, 0o755); err != nil {
		return SkillsDone{}, err
	}
	for _, n := range keeps {
		tmp := filepath.Join(target, ".moving-"+n)
		_ = os.RemoveAll(tmp)
		if err := copyEntry(filepath.Join(dir, n), tmp, true); err != nil {
			_ = os.RemoveAll(tmp)
			return SkillsDone{Lines: lines}, fmt.Errorf("复制 %s 失败：%v；原来的 skill 都还在", n, err)
		}
		if err := os.RemoveAll(filepath.Join(target, n)); err != nil {
			return SkillsDone{Lines: lines}, err
		}
		if err := os.Rename(tmp, filepath.Join(target, n)); err != nil {
			return SkillsDone{Lines: lines}, err
		}
	}
	for _, n := range drops {
		p := filepath.Join(dir, n)
		remove := os.RemoveAll // a symlink is removed itself, never what it points to
		if st, err := os.Lstat(p); err == nil && st.Mode()&os.ModeSymlink != 0 {
			remove = os.Remove
		}
		if err := remove(p); err != nil {
			return SkillsDone{Lines: lines}, err
		}
	}
	if len(keeps)+len(drops) > 0 {
		lines = append(lines, fmt.Sprintf("留 %d 个复制进 %s，删 %d 个", len(keeps), target, len(drops)))
	}
	if len(open) > 0 {
		lines = append(lines, fmt.Sprintf("还有没定的行：%s；%s 还没换成软链，填完去留再跑一次", strings.Join(open, "、"), dir))
		return SkillsDone{Lines: lines}, nil
	}

	if state == "dir" {
		if err := swapInLink(dir, target); err != nil {
			return SkillsDone{Lines: lines}, fmt.Errorf("把 %s 换成软链失败：%v；留的已复制进 home，原目录还在", dir, err)
		}
	} else if err := os.MkdirAll(claudeDir(env), 0o755); err != nil {
		return SkillsDone{Lines: lines}, err
	} else if err := os.Symlink(target, dir); err != nil {
		return SkillsDone{Lines: lines}, err
	}
	lines = append(lines, fmt.Sprintf("%s 现在是指向 %s 的软链", dir, target))

	// an empty directory is nothing for git to commit
	var files []string
	if entries, _ := os.ReadDir(target); len(entries) > 0 {
		files = append(files, target)
	}
	if exists(filepath.Join(h, ".gitignore")) {
		files = append(files, filepath.Join(h, ".gitignore"))
	}
	if len(files) == 0 {
		return SkillsDone{Lines: append(lines, "home 的 skills/ 是空的，没有要提交的")}, nil
	}
	res, err := Commit(SkillsCommitMessage, files, cwd, env)
	lines = append(lines, res.Lines...)
	if err != nil {
		lines = append(lines, "提交被拒，已复制的文件留着，修好后跑 dyna home commit 提交")
		return SkillsDone{Lines: lines}, err
	}
	return SkillsDone{Lines: lines}, nil
}

var errSkillsAlone = nexterr.Plain("skills 和 knowledge 各自要一份 plan 文件，分开跑：--only skills 与 --only knowledge 不能点在同一次里")

// splitSkills takes the skills item out of the ids.
func splitSkills(ids []string) (rest []string, skills bool) {
	for _, id := range ids {
		if id == SkillsItem {
			skills = true
		} else {
			rest = append(rest, id)
		}
	}
	return
}

// planSkills prints the plan of the skills item after the other items asked for in the same run.
func (d Deps) planSkills(cmd *cobra.Command, items []ConfigItem, knowledge bool) error {
	if knowledge {
		return errSkillsAlone
	}
	p, err := PlanSkills(d.env(), d.now())
	if err != nil {
		return err
	}
	if asJSON, _ := cmd.Flags().GetBool("json"); asJSON {
		fmt.Fprint(d.out(), SkillsPlanJSON(items, p))
		return nil
	}
	fmt.Fprint(d.out(), ConfigTable(append(items, p.Item)))
	fmt.Fprint(d.out(), SkillsTable(p))
	return nil
}
