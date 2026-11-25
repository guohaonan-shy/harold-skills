package home

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
)

// An item of `home config` beside the four: merging the memories Claude Code keeps per project
// (~/.claude/projects/<目录>/memory/) into the one device memory, <home>/memory/. Like knowledge it is done only
// when --only names it. It copies and never moves: the old directories are not touched.
//
//	plan   lists every directory that holds at least one memory file besides MEMORY.md, with the prefix its files get
//	apply  copies them as <prefix>--<name>, merges the indexes into <home>/memory/MEMORY.md, commits to home
//
// This is not the `memory` item (autoMemoryDirectory) and does not compress the index.

// MemoriesItem is the item's id. It is not in ConfigItems: the default and `--only 1,2,3,4` stay the four.
const MemoriesItem = "memories"

const memoriesCommitMessage = "chore: 合并各项目的记忆"

// MemoryDir is one directory of memories: where it is, which project it belongs to, and whether it is copied.
type MemoryDir struct {
	Dir         string `json:"dir"`         // its name under ~/.claude/projects/
	ProjectPath string `json:"projectPath"` // the project's path, read from a session record; "" when unreadable
	Prefix      string `json:"prefix"`
	Files       int    `json:"files"`      // memory files, not counting MEMORY.md
	IndexLines  int    `json:"indexLines"` // lines of its MEMORY.md
	Status      string `json:"status"`     // todo | already
	Note        string `json:"note,omitempty"`

	memDir    string
	names     []string
	conflicts []string
}

// MemoriesPlan is the item and its directories, in the order of their names.
type MemoriesPlan struct {
	Item ConfigItem
	Dirs []MemoryDir
}

// sessionCwd is the working directory a session record (*.jsonl) of the directory names, "" when none does. Only
// the first lines of a few records are read: the field is written on the first turns.
func sessionCwd(dir string) string {
	files, _ := filepath.Glob(filepath.Join(dir, "*.jsonl"))
	sort.Strings(files)
	if len(files) > 10 {
		files = files[:10]
	}
	for _, f := range files {
		in, err := os.Open(f)
		if err != nil {
			continue
		}
		r := bufio.NewReaderSize(in, 64*1024)
		for i := 0; i < 300; i++ {
			line, err := r.ReadBytes('\n')
			if bytes.Contains(line, []byte(`"cwd"`)) {
				var ev struct {
					Cwd string `json:"cwd"`
				}
				if json.Unmarshal(line, &ev) == nil && ev.Cwd != "" {
					in.Close()
					return ev.Cwd
				}
			}
			if err != nil {
				break
			}
		}
		in.Close()
	}
	return ""
}

// memoryNames are the files of a memory directory besides MEMORY.md, sorted.
func memoryNames(memDir string) []string {
	entries, err := os.ReadDir(memDir)
	if err != nil {
		return nil
	}
	var out []string
	for _, e := range entries {
		if e.Name() == "MEMORY.md" || !isFile(filepath.Join(memDir, e.Name())) {
			continue
		}
		out = append(out, e.Name())
	}
	sort.Strings(out)
	return out
}

func sameFile(a, b string) bool {
	x, err := os.ReadFile(a)
	if err != nil {
		return false
	}
	y, err := os.ReadFile(b)
	return err == nil && bytes.Equal(x, y)
}

// PlanMemories reads ~/.claude/projects/*/memory/ and says what copying them would do. It writes nothing.
func PlanMemories(env Env) (MemoriesPlan, error) {
	h := Dir(env)
	target := filepath.Join(h, "memory")
	var list []Entry
	if b, err := os.ReadFile(filepath.Join(h, "AGENTS.md")); err == nil {
		list = ParseProjects(string(b))
	}
	root := filepath.Join(claudeDir(env), "projects")
	entries, err := os.ReadDir(root)
	if err != nil && !os.IsNotExist(err) {
		return MemoriesPlan{}, err
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })

	used := map[string]int{}
	var dirs []MemoryDir
	for _, e := range entries {
		dir := filepath.Join(root, e.Name())
		memDir := filepath.Join(dir, "memory")
		if !isDir(dir) || !isDir(memDir) || realish(memDir) == realish(target) {
			continue
		}
		names := memoryNames(memDir)
		if len(names) == 0 {
			continue
		}
		d := MemoryDir{Dir: e.Name(), Files: len(names), memDir: memDir, names: names}
		if b, err := os.ReadFile(filepath.Join(memDir, "MEMORY.md")); err == nil {
			d.IndexLines, _ = MeasureIndex(string(b))
		}

		cwd := sessionCwd(dir)
		var base string
		if cwd == "" {
			// no session record says where the project is: read it back off the directory's name
			name, path := nameFromDir(userHome(env), e.Name())
			switch {
			case path != "":
				cwd = path
				d.Note = "读不到会话记录，路径由目录名还原"
			case name != "":
				base = strings.ToLower(name)
				d.Note = "读不到会话记录，前缀取自目录名里主目录之后的部分"
			default:
				base = strings.ToLower(strings.TrimLeft(e.Name(), "-"))
				d.Note = "读不到会话记录，也还原不出路径，前缀取自整个目录名"
			}
		}
		if cwd != "" {
			d.ProjectPath = cwd
			if origin, ok := gitOut(cwd, "remote", "get-url", "origin"); ok && origin != "" {
				if p := FindProject(list, origin); p != nil {
					base = p.Name
				}
			}
			if base == "" {
				base = strings.ToLower(filepath.Base(filepath.ToSlash(cwd)))
			}
		}
		if base == "" || base == "." || unsafeName(base) {
			base = strings.ToLower(strings.TrimLeft(e.Name(), "-"))
		}
		used[base]++
		d.Prefix = base
		if n := used[base]; n > 1 {
			d.Prefix = base + "-" + strconv.Itoa(n)
			d.Note = strings.TrimPrefix(d.Note+"；与前面的目录同名，前缀加 -"+strconv.Itoa(n), "；")
		}

		d.Status = "already"
		for _, name := range names {
			dst := filepath.Join(target, d.Prefix+"--"+name)
			switch {
			case !exists(dst):
				d.Status = "todo"
			case !sameFile(filepath.Join(memDir, name), dst):
				d.Status = "todo"
				d.conflicts = append(d.conflicts, d.Prefix+"--"+name)
			}
		}
		if len(d.conflicts) > 0 {
			d.Note = strings.TrimPrefix(d.Note+"；冲突：home 的 memory/ 里已有内容不同的 "+strings.Join(d.conflicts, "、"), "；")
		}
		dirs = append(dirs, d)
	}

	todo := 0
	for _, d := range dirs {
		if d.Status == "todo" {
			todo++
		}
	}
	item := ConfigItem{
		ID:     MemoriesItem,
		Label:  fmt.Sprintf("把各项目的记忆复制进 %s，合成一份 MEMORY.md", target),
		Status: "todo",
		Before: fmt.Sprintf("%d 个目录有记忆，其中 %d 个还没复制进来", len(dirs), todo),
		After:  "文件名带项目前缀（<前缀>--<原名>），MEMORY.md 每个项目一节；旧目录不动；提交到 home",
	}
	if todo == 0 {
		item.Status = "already"
		item.Before = fmt.Sprintf("%d 个目录有记忆，都已复制", len(dirs))
	}
	return MemoriesPlan{Item: item, Dirs: dirs}, nil
}

// MemoriesTable is the directories as a Markdown table.
func MemoriesTable(m MemoriesPlan) string {
	esc := func(s string) string { return strings.ReplaceAll(s, "|", `\|`) }
	var b strings.Builder
	b.WriteString("\n### 记忆：有记忆的项目目录（~/.claude/projects/<目录>/memory/）\n\n")
	b.WriteString("| 目录 | 项目路径 | 前缀 | 记忆文件数（不含 MEMORY.md） | 索引行数 | 状态 | 备注 |\n|---|---|---|---|---|---|---|\n")
	for _, d := range m.Dirs {
		path := d.ProjectPath
		if path == "" {
			path = "（读不到）"
		}
		b.WriteString(fmt.Sprintf("| %s | %s | %s | %d | %d | %s | %s |\n", esc(d.Dir), esc(path), esc(d.Prefix), d.Files, d.IndexLines, statusText[d.Status], esc(d.Note)))
	}
	return b.String()
}

var errMemoriesAlone = nexterr.Plain("memories 不跟 knowledge、skills 点在同一次里：各自分开跑（可以跟 1,2,3,4 一起）")

type memoriesJSON struct {
	Items    []ConfigItem `json:"items"`
	Memories []MemoryDir  `json:"memories"`
}

// MemoriesPlanJSON is `plan --json` when memories is among the items: the other items' plan, the memories item,
// and the directories as `memories`.
func MemoriesPlanJSON(items []ConfigItem, m MemoriesPlan) string {
	out := memoriesJSON{Memories: m.Dirs}
	if out.Memories == nil {
		out.Memories = []MemoryDir{}
	}
	out.Items = append(append([]ConfigItem{}, items...), m.Item)
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	_ = enc.Encode(out)
	return buf.String()
}

// rewriteLinks points the links of an index at the files' new names: a local link whose target is one of names
// becomes <prefix>--<name>. Everything else in the line stays as written.
func rewriteLinks(text, prefix string, names map[string]bool) string {
	var b strings.Builder
	last := 0
	for _, loc := range mdLink.FindAllStringSubmatchIndex(text, -1) {
		s, e := loc[2], loc[3]
		target := text[s:e]
		core := strings.SplitN(strings.SplitN(target, "#", 2)[0], "?", 2)[0]
		tail := target[len(core):]
		name := strings.TrimPrefix(core, "./")
		if u, err := url.PathUnescape(name); err == nil {
			name = u
		}
		if schemeRe.MatchString(target) || !names[name] {
			continue
		}
		next := prefix + "--" + name
		if strings.Contains(core, "%") {
			next = url.PathEscape(next)
		}
		b.WriteString(text[last:s])
		b.WriteString(next + tail)
		last = e
	}
	b.WriteString(text[last:])
	return b.String()
}

// indexSection is one project's section of the merged index: the old lines, in order, with their links renamed.
func indexSection(d MemoryDir) string {
	var body string
	if b, err := os.ReadFile(filepath.Join(d.memDir, "MEMORY.md")); err == nil {
		names := map[string]bool{}
		for _, n := range d.names {
			names[n] = true
		}
		body = strings.TrimRight(strings.TrimLeft(rewriteLinks(string(b), d.Prefix, names), "\r\n"), " \t\r\n")
	}
	if body == "" {
		return "## " + d.Prefix + "\n"
	}
	return "## " + d.Prefix + "\n" + body + "\n"
}

func hasHeading(text, title string) bool {
	for _, l := range strings.Split(text, "\n") {
		if strings.TrimRight(l, " \t\r") == "## "+title {
			return true
		}
	}
	return false
}

// MemoriesDone is what apply did, as the lines to tell the caller.
type MemoriesDone struct {
	Lines []string
}

// ApplyMemories copies the memories not yet in home and merges their indexes, then commits. It refuses before
// writing anything when a file it would write is already in home with other content.
func ApplyMemories(env Env, cwd string, now time.Time) (MemoriesDone, error) {
	h := Dir(env)
	if !isDir(h) {
		return MemoriesDone{}, fmt.Errorf("home 不存在：%s", h)
	}
	plan, err := PlanMemories(env)
	if err != nil {
		return MemoriesDone{}, err
	}
	var todo []MemoryDir
	var conflicts []string
	for _, d := range plan.Dirs {
		if d.Status == "todo" {
			todo = append(todo, d)
		}
		conflicts = append(conflicts, d.conflicts...)
	}
	if len(conflicts) > 0 {
		return MemoriesDone{}, nexterr.Plain("%s 里已有这些同名文件、内容不同，什么都没写：%s", filepath.Join(h, "memory"), strings.Join(conflicts, "、"))
	}
	if len(todo) == 0 {
		return MemoriesDone{Lines: []string{"记忆都已复制，什么都没写"}}, nil
	}

	target := filepath.Join(h, "memory")
	indexPath := filepath.Join(target, "MEMORY.md")
	old, oldErr := os.ReadFile(indexPath)
	index := string(old)
	// a section that is already there (a run that stopped half-way) is not added twice
	var sections []string
	for _, d := range todo {
		if !hasHeading(index, d.Prefix) {
			sections = append(sections, indexSection(d))
		}
	}

	var homeFiles []string
	var lines []string
	if oldErr == nil {
		backup, err := newBackupDir(h, now)
		if err != nil {
			return MemoriesDone{}, err
		}
		if err := os.WriteFile(filepath.Join(backup, "MEMORY.md"), old, 0o644); err != nil {
			return MemoriesDone{}, err
		}
		if err := ensureBackupIgnored(h); err != nil {
			return MemoriesDone{}, err
		}
		homeFiles = append(homeFiles, filepath.Join(h, ".gitignore"))
		lines = append(lines, "原 MEMORY.md 备份在 "+backup)
	}
	if err := os.MkdirAll(target, 0o755); err != nil {
		return MemoriesDone{}, err
	}

	// the index goes first: a run that stops before the files are in sees them as still to copy, and its sections
	// as already there
	if len(sections) > 0 {
		next := index
		if next != "" && !strings.HasSuffix(next, "\n") {
			next += "\n"
		}
		for _, s := range sections {
			if next != "" {
				next += "\n"
			}
			next += s
		}
		tmp := indexPath + ".tmp-" + strconv.Itoa(os.Getpid())
		if err := os.WriteFile(tmp, []byte(next), 0o644); err != nil {
			return MemoriesDone{}, err
		}
		if err := os.Rename(tmp, indexPath); err != nil {
			_ = os.Remove(tmp)
			return MemoriesDone{}, err
		}
		homeFiles = append(homeFiles, indexPath)
	}
	copied := 0
	for _, d := range todo {
		for _, name := range d.names {
			dst := filepath.Join(target, d.Prefix+"--"+name)
			if exists(dst) {
				continue
			}
			if err := copyFile(filepath.Join(d.memDir, name), dst); err != nil {
				return MemoriesDone{Lines: lines}, fmt.Errorf("复制 %s 失败：%v；重跑会接着复制剩下的", filepath.Join(d.memDir, name), err)
			}
			homeFiles = append(homeFiles, dst)
			copied++
		}
	}
	lines = append(lines, fmt.Sprintf("已复制 %d 个项目目录的记忆（%d 个文件）到 %s，索引合进 %s", len(todo), copied, target, indexPath))
	res, err := Commit(memoriesCommitMessage, homeFiles, cwd, env)
	lines = append(lines, res.Lines...)
	if err != nil {
		lines = append(lines, "提交被拒，已复制的文件留着，修好后跑 dyna home commit 提交")
		return MemoriesDone{Lines: lines}, err
	}
	return MemoriesDone{Lines: lines}, nil
}

var nonAlnum = regexp.MustCompile(`[^A-Za-z0-9]`)

// encodeDirName is how Claude Code spells a path as a directory name under ~/.claude/projects/: every character
// that is not a letter or digit becomes a dash.
func encodeDirName(path string) string { return nonAlnum.ReplaceAllString(path, "-") }

// nameFromDir reads a project's name back off an encoded directory name when no session record says where it is.
// The user's home directory is taken off the front, then the rest is matched against the directories that really
// exist, one level at a time (`projects-design-lib` becomes projects/, then design-lib). A rest that matches a
// directory in full gives that directory's path and name; a rest the disk stops matching gives what is left of it
// as the name and no path. A name that does not start with the encoded home gives neither.
func nameFromDir(userHomeDir, dirName string) (name, path string) {
	head := encodeDirName(userHomeDir) + "-"
	if userHomeDir == "" || !strings.HasPrefix(dirName, head) || len(dirName) == len(head) {
		return "", ""
	}
	rest := dirName[len(head):]
	if n, p, ok := matchDirs(userHomeDir, rest); ok {
		return n, p
	}
	return rest, ""
}

// matchDirs walks down from cur: a directory whose encoded name is all of rest ends it; one whose encoded name
// is the start of rest (followed by a dash) is entered, longest first. When what was entered has nothing more
// that matches, what is left of rest after the entered directory comes back as the name, with no path.
func matchDirs(cur, rest string) (name, path string, ok bool) {
	entries, err := os.ReadDir(cur)
	if err != nil {
		return "", "", false
	}
	type cand struct{ name, enc string }
	var cands []cand
	for _, e := range entries {
		if isDir(filepath.Join(cur, e.Name())) {
			cands = append(cands, cand{e.Name(), encodeDirName(e.Name())})
		}
	}
	for _, c := range cands {
		if c.enc == rest {
			return c.name, filepath.Join(cur, c.name), true
		}
	}
	sort.Slice(cands, func(i, j int) bool { return len(cands[i].enc) > len(cands[j].enc) })
	left := ""
	for _, c := range cands {
		if c.enc == "" || !strings.HasPrefix(rest, c.enc+"-") {
			continue
		}
		after := rest[len(c.enc)+1:]
		if n, p, ok := matchDirs(filepath.Join(cur, c.name), after); ok {
			return n, p, true
		}
		if left == "" {
			left = after
		}
	}
	if left != "" {
		return left, "", true
	}
	return "", "", false
}
