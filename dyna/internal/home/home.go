// Package home answers: which project is this, and where is its project directory in home?
//
// home is the personal repository (default ~/home, IDEA_LOOP_HOME overrides) whose AGENTS.md lists the
// projects (`## 项目`, one line each: `<名字>（<是什么>）: <本地路径>. Clone from <远端> if missing.`) and whose
// projects/<名字>/ directories hold each project's knowledge base. This is the lookup the other modules start from.
package home

import (
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
)

// Sentences the lookup stops with. They already say what to do.
const (
	NotMoved     = "这个项目还没搬进 home，先跑 `/idea-loop:setup` 迁移"
	NotConnected = "这个仓库没接上 idea-loop，先跑 `/idea-loop:setup`"
	InHome       = "当前目录是 home 本身，要带 --project <名字>"
)

// BootstrapFiles are idea-loop's generated files; one of them at the top of a code repository (or a docs/
// with a spec/ or adr/ in it) means the project has not moved into home yet.
var BootstrapFiles = []string{"DEVELOPMENT.md", "REVIEW.md", "CODING_STANDARDS.md", "PRODUCT.md", "ISSUE_TRACKER.md", "GLOSSARY.md", "DESIGN.md", "SEO.md"}

// Env reads an environment variable.
type Env func(string) string

// OSEnv reads the real environment.
func OSEnv(k string) string { return os.Getenv(k) }

// Entry is one line of the project list.
type Entry struct {
	Name   string
	Path   string
	Remote string
}

// Found is the answer of Locate: OK with the project's places, or not OK with a Code and the sentence to say.
type Found struct {
	OK         bool
	Code       string // in-home, not-moved, not-connected, unlisted
	Message    string
	Project    string
	ProjectDir string
	Docs       string
	Repo       string // owner/repo
	Clone      string // the path as registered
	CloneDir   string // with ~ spelled out
	Entry      *Entry // the list entry when the repository is listed but its directory in home has no docs/
}

// Err turns a not-OK answer into the error a command stops with.
func (f Found) Err() error { return nexterr.Plain("%s", f.Message) }

// Dir is home itself.
func Dir(env Env) string {
	if d := env("IDEA_LOOP_HOME"); d != "" {
		return d
	}
	return filepath.Join(userHome(env), "home")
}

// UserHome is the user's own home directory (HOME, else what the system says).
func UserHome(env Env) string { return userHome(env) }

func userHome(env Env) string {
	if h := env("HOME"); h != "" {
		return h
	}
	h, _ := os.UserHomeDir()
	return h
}

var (
	urlRe = regexp.MustCompile(`(?i)^[a-z][a-z0-9+.-]*://(?:[^@/]*@)?([^/:]+)(?::\d+)?/(.*)$`)
	scpRe = regexp.MustCompile(`^(?:[^@/\s]+@)?([^:/\s]+):(.+)$`)
)

// NormalizeRemote is `host/owner/repo` for any spelling of a git remote, or "" when there is nothing to compare.
func NormalizeRemote(remote string) string {
	rest := strings.TrimSpace(remote)
	var host, path string
	if m := urlRe.FindStringSubmatch(rest); m != nil {
		host, path = m[1], m[2]
	} else if m := scpRe.FindStringSubmatch(rest); m != nil && !strings.HasPrefix(m[2], "//") {
		host, path = m[1], m[2]
	} else {
		return ""
	}
	path = strings.TrimLeft(path, "/")
	path = strings.TrimRight(path, "/")
	path = strings.TrimSuffix(path, ".git")
	path = strings.TrimRight(path, "/")
	if host == "" || path == "" {
		return ""
	}
	return strings.ToLower(host) + "/" + path
}

var (
	headingRe = regexp.MustCompile(`^##\s+(.*?)\s*$`)
	projectRe = regexp.MustCompile(`^\s*(?:[-*]\s+)?([^\s（]+)（[^）]*）[:：]\s*(.+?)\.\s+Clone from\s+(\S+)\s+if missing\.\s*$`)
)

// ParseProjects reads the lines of the `## 项目` section; lines in any other shape are skipped.
func ParseProjects(agentsMd string) []Entry {
	var out []Entry
	in := false
	for _, line := range strings.Split(agentsMd, "\n") {
		if m := headingRe.FindStringSubmatch(line); m != nil {
			in = m[1] == "项目"
			continue
		}
		if !in {
			continue
		}
		if m := projectRe.FindStringSubmatch(line); m != nil {
			out = append(out, Entry{Name: m[1], Path: m[2], Remote: m[3]})
		}
	}
	return out
}

var unsafeRe = regexp.MustCompile(`[/\\]|^\.\.?$`)

func unsafeName(name string) bool { return unsafeRe.MatchString(name) }

// FindProject is the entry whose registered remote is the same repository as origin; nil when none is.
func FindProject(list []Entry, origin string) *Entry {
	want := NormalizeRemote(origin)
	if want == "" {
		return nil
	}
	for i := range list {
		if !unsafeName(list[i].Name) && NormalizeRemote(list[i].Remote) == want {
			return &list[i]
		}
	}
	return nil
}

func isDir(p string) bool {
	st, err := os.Stat(p)
	return err == nil && st.IsDir()
}

func exists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}

func hasBootstrap(root string) bool {
	for _, f := range BootstrapFiles {
		if exists(filepath.Join(root, f)) {
			return true
		}
	}
	return isDir(filepath.Join(root, "docs", "spec")) || isDir(filepath.Join(root, "docs", "adr"))
}

func expandHome(path string, env Env) string {
	if path == "~" {
		return userHome(env)
	}
	if strings.HasPrefix(path, "~/") {
		return filepath.Join(userHome(env), path[2:])
	}
	return path
}

// realish is the deepest existing ancestor made real (macOS /var → /private/var), the missing rest appended.
func realish(path string) string {
	abs, _ := filepath.Abs(path)
	var rest []string
	cur := abs
	for !exists(cur) && filepath.Dir(cur) != cur {
		rest = append([]string{filepath.Base(cur)}, rest...)
		cur = filepath.Dir(cur)
	}
	real, err := filepath.EvalSymlinks(cur)
	if err != nil {
		real = cur
	}
	return filepath.Join(append([]string{real}, rest...)...)
}

func fail(code, msg string, entry *Entry) Found {
	return Found{Code: code, Message: msg, Entry: entry}
}

func resolve(entry Entry, codeRoot string, env Env) Found {
	h := Dir(env)
	projectDir := filepath.Join(h, "projects", entry.Name)
	docs := filepath.Join(projectDir, "docs")
	if !isDir(docs) {
		if hasBootstrap(codeRoot) {
			return fail("not-moved", NotMoved, &entry)
		}
		return fail("not-connected", NotConnected, &entry)
	}
	norm := NormalizeRemote(entry.Remote)
	return Found{
		OK:         true,
		Project:    entry.Name,
		ProjectDir: projectDir,
		Docs:       docs,
		Repo:       norm[strings.Index(norm, "/")+1:],
		Clone:      entry.Path,
		CloneDir:   expandHome(entry.Path, env),
	}
}

func gitOut(cwd string, args ...string) (string, bool) {
	cmd := exec.Command("git", args...)
	cmd.Dir = cwd
	out, err := cmd.Output()
	if err != nil {
		return "", false
	}
	return strings.TrimSpace(string(out)), true
}

// Locate finds the project for a session in cwd, or the project called name when it is not empty.
func Locate(cwd string, env Env, name string) Found {
	h := Dir(env)
	var list []Entry
	if b, err := os.ReadFile(filepath.Join(h, "AGENTS.md")); err == nil {
		list = ParseProjects(string(b))
	}
	if name != "" {
		var entry *Entry
		if !unsafeName(name) {
			for i := range list {
				if list[i].Name == name && NormalizeRemote(list[i].Remote) != "" {
					entry = &list[i]
					break
				}
			}
		}
		if entry == nil {
			return fail("unlisted", "项目清单里没有「"+name+"」："+NotConnected, nil)
		}
		return resolve(*entry, expandHome(entry.Path, env), env)
	}
	top, ok := gitOut(cwd, "rev-parse", "--show-toplevel")
	if !ok || top == "" {
		return fail("not-connected", NotConnected, nil)
	}
	if exists(h) && realish(top) == realish(h) {
		return fail("in-home", InHome, nil)
	}
	origin, _ := gitOut(cwd, "remote", "get-url", "origin")
	var entry *Entry
	if origin != "" {
		entry = FindProject(list, origin)
	}
	if entry == nil {
		if hasBootstrap(top) {
			return fail("not-moved", NotMoved, nil)
		}
		return fail("unlisted", NotConnected, nil)
	}
	return resolve(*entry, top, env)
}

// LocateByDocs finds the project the directory docs is the knowledge base of: <home>/projects/<名字>/docs is that
// project. Any other directory is not in home: not-moved when the directory it sits in has idea-loop's bootstrap
// files or a docs/ with a spec/ or adr/, not-connected otherwise.
func LocateByDocs(docs string, env Env) Found {
	dir := realish(docs)
	projectDir := filepath.Dir(dir)
	if filepath.Base(dir) == "docs" && filepath.Dir(projectDir) == realish(filepath.Join(Dir(env), "projects")) {
		return Locate("", env, filepath.Base(projectDir))
	}
	if hasBootstrap(projectDir) {
		return fail("not-moved", NotMoved, nil)
	}
	return fail("not-connected", NotConnected, nil)
}
