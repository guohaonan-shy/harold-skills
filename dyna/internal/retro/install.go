// Package retro is the `retro` module: what the retro skill and the dreaming pass use around the candidate pool
// and the session transcripts, and the fixed-path install of the replay runner.
package retro

import (
	"os"
	"path/filepath"
	"strings"
)

// EntryName is the file the permission rule points at.
const EntryName = "retro-replay.mjs"

// runtimeFiles are what the replay runner imports, copied in the plugin's own layout so no import needs rewriting.
var runtimeFiles = []struct {
	dir   string
	files []string
}{
	{"evals/retro", []string{"retro-replay.mjs", "queue.mjs", "replay.mjs", "cases.mjs"}},
	{"scripts", []string{"project-map.mjs", "runtime-detect.mjs"}},
}

const entryText = `#!/usr/bin/env node
// Installed by idea-loop (scripts/retro-install.mjs, run by /idea-loop:setup). Do not edit: running setup replaces it.
import { main } from './runtime/evals/retro/retro-replay.mjs';

process.exitCode = await main(process.argv.slice(2));
`

// DisplayPath is a path as it is written in the permission rule: `~/…` when it is under the home directory.
func DisplayPath(path, home string) string {
	if path == home || strings.HasPrefix(path, home+"/") {
		return "~" + path[len(home):]
	}
	return path
}

// AllowRule is the permission rule that lets every call of the installed runner run unattended.
func AllowRule(dest, home string) string {
	return "Bash(node " + DisplayPath(filepath.Join(dest, EntryName), home) + ":*)"
}

// Install replaces dest's copy of the runner with the plugin's current one and returns the entry's path.
func Install(dest, pluginRoot string) (string, error) {
	if err := os.RemoveAll(filepath.Join(dest, "runtime")); err != nil {
		return "", err
	}
	for _, group := range runtimeFiles {
		to := filepath.Join(dest, "runtime", group.dir)
		if err := os.MkdirAll(to, 0o755); err != nil {
			return "", err
		}
		for _, f := range group.files {
			from := filepath.Join(pluginRoot, group.dir, f)
			data, err := os.ReadFile(from)
			if err != nil {
				return "", err
			}
			info, err := os.Stat(from)
			if err != nil {
				return "", err
			}
			if err := os.WriteFile(filepath.Join(to, f), data, info.Mode().Perm()); err != nil {
				return "", err
			}
		}
	}
	if err := os.MkdirAll(dest, 0o755); err != nil {
		return "", err
	}
	entry := filepath.Join(dest, EntryName)
	if err := os.WriteFile(entry, []byte(entryText), 0o755); err != nil {
		return "", err
	}
	return entry, nil
}
