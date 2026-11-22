package home

import (
	"os"
	"path/filepath"
	"strings"
)

// ProjectRow is one line of home's project list, with where the project is. A project is in home when its project
// directory has a docs/; one that is not carries the code and the sentence `where` stops with for it.
type ProjectRow struct {
	Name       string `json:"name"`
	ProjectDir string `json:"projectDir"`
	Docs       string `json:"docs"`
	Repo       string `json:"repo"`
	Clone      string `json:"clone"`
	CloneDir   string `json:"cloneDir"`
	InHome     bool   `json:"inHome"`
	Code       string `json:"code,omitempty"`
	Reason     string `json:"reason,omitempty"`
}

// Projects is every line of the `## 项目` section of home's AGENTS.md, in the list's order; empty (not nil) when
// home has no AGENTS.md or the list has no lines. A line is judged the way `where --project` judges it.
func Projects(env Env) []ProjectRow {
	out := []ProjectRow{}
	b, err := os.ReadFile(filepath.Join(Dir(env), "AGENTS.md"))
	if err != nil {
		return out
	}
	for _, entry := range ParseProjects(string(b)) {
		row := ProjectRow{Name: entry.Name, Clone: entry.Path, CloneDir: expandHome(entry.Path, env)}
		norm := NormalizeRemote(entry.Remote)
		if unsafeName(entry.Name) || norm == "" {
			// the name would leave projects/, or the remote reads as no repository: `where --project` calls it unlisted
			row.Code = "unlisted"
			row.Reason = "项目清单里没有「" + entry.Name + "」：" + NotConnected
			out = append(out, row)
			continue
		}
		f := resolve(entry, row.CloneDir, env)
		row.ProjectDir = filepath.Join(Dir(env), "projects", entry.Name)
		row.Docs = filepath.Join(row.ProjectDir, "docs")
		row.Repo = norm[strings.Index(norm, "/")+1:]
		row.InHome = f.OK
		if !f.OK {
			row.Code, row.Reason = f.Code, f.Message
		}
		out = append(out, row)
	}
	return out
}
