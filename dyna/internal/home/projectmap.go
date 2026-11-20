package home

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"unicode"
)

// MapLimit is how many characters of a project map the session starts with.
const MapLimit = 2000

// TruncatedNotice is the line that follows a cut map.
var TruncatedNotice = fmt.Sprintf("项目地图超过 %d 字，已截断", MapLimit)

// MapText is the text to inject for a map: all of it, or its first MapLimit characters and a notice line.
// Characters are Unicode characters, not bytes.
func MapText(text string) string {
	r := []rune(strings.TrimRightFunc(text, unicode.IsSpace))
	if len(r) <= MapLimit {
		return string(r) + "\n"
	}
	return string(r[:MapLimit]) + "\n" + TruncatedNotice + "\n"
}

func mapOf(dir, name string) string {
	b, err := os.ReadFile(filepath.Join(dir, "AGENTS.md"))
	if err != nil {
		return fmt.Sprintf("项目「%s」在 home 里的目录是 %s/，项目地图（AGENTS.md）还没写。\n", name, dir)
	}
	return MapText(string(b))
}

// ProjectMap is what a session opened in cwd starts with: "" or the text to inject. Anything unexpected (an
// unreadable home, say) is "", never an error: a session must not fail to start because of this.
func ProjectMap(cwd string, env Env) string {
	h := Dir(env)
	if !exists(h) {
		return ""
	}
	if _, err := os.ReadFile(filepath.Join(h, "AGENTS.md")); err != nil && !os.IsNotExist(err) {
		return ""
	}
	found := Locate(cwd, env, "")
	if !found.OK {
		if found.Code == "not-moved" {
			return found.Message + "\n"
		}
		// in the list, but nothing in home yet and nothing to migrate: the map alone
		if found.Entry != nil {
			return mapOf(filepath.Join(h, "projects", found.Entry.Name), found.Entry.Name)
		}
		return ""
	}
	return "项目目录：" + found.ProjectDir + "\n" + mapOf(found.ProjectDir, found.Project)
}
