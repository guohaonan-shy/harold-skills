package sections

// The browser side of the sections command, run for real: the code `measure`, `shoot`, `screen`, `cover`, `time`, `step`
// and `pinned` print, handed a Playwright page that shows small pages built to have the shapes the code has to cope
// with (islands that take no room, a fixed table of contents that fades in at the second section, a scroll container
// inside an app shell, a pin that holds a screen while the page scrolls, a carousel that ticks by itself, …).
//
// The assertions are the ones of design-archive-sections-browser.test.mjs, unchanged: the test file is copied, and the
// only thing replaced is where the code comes from — the build functions it imports and the command it runs now
// answer from this package (through testdata/sectionscli) instead of from the old script. Playwright and a Chromium are
// looked up where the machine has them (the project's own node_modules, the npx cache, the Playwright browser cache);
// with none found the tests inside it are skipped, and so is this one. It takes minutes: `go test -short` skips it.

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

const goBuilders = `import { execFileSync } from 'node:child_process';

const BIN = process.env.SECTIONS_BIN;
const gen = (name, input) => {
  try {
    return execFileSync(BIN, ['generate', name], { input: JSON.stringify(input) ?? 'null', encoding: 'utf8', maxBuffer: 1 << 28 });
  } catch (e) {
    throw new Error(String(e.stderr || '').trim() || e.message);
  }
};

export const buildTimeCode = (config) => gen('time', config);
export const buildStepCode = (ms) => gen('step', ms);
export const buildMeasureCode = (config) => gen('measure', config);
export const buildShootCode = (config) => gen('shoot', config);
export const buildPinnedCode = (config) => gen('pinned', config);
export const buildScreenCode = (config) => gen('screen', config);
export const buildCoverCode = (config) => gen('cover', config);
export const attribute = (measurement) => JSON.parse(gen('attribute', measurement));
export const shootTargets = (attribution, opts = {}) => JSON.parse(gen('shootTargets', { attribution, only: opts.only ?? null }));
`

func TestBrowserCodeRunsInARealBrowser(t *testing.T) {
	if testing.Short() {
		t.Skip("the browser test takes minutes: skipped with -short")
	}
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not on PATH")
	}
	scripts, err := filepath.Abs(filepath.Join("..", "..", "..", "..", "idea-loop", "scripts"))
	if err != nil {
		t.Fatal(err)
	}
	original, err := os.ReadFile(filepath.Join(scripts, "design-archive-sections-browser.test.mjs"))
	if err != nil {
		t.Skip("the old browser test is gone: nothing to run")
	}

	work := t.TempDir()
	bin := filepath.Join(work, "sectionscli")
	build := exec.Command("go", "build", "-o", bin, "./testdata/sectionscli")
	if out, err := build.CombinedOutput(); err != nil {
		t.Fatalf("building the helper: %v\n%s", err, out)
	}

	src := string(original)
	src = strings.Replace(src, "from './design-archive-sections.mjs'", "from './go-sections.mjs'", 1)
	src = strings.Replace(src, "const CLI = fileURLToPath(new URL('./design-archive-sections.mjs', import.meta.url));", "const CLI = null;", 1)
	src = strings.ReplaceAll(src, "spawnSync('node', [CLI, ", "spawnSync(process.env.SECTIONS_BIN, ['sections', ")
	if strings.Contains(src, "design-archive-sections.mjs") || strings.Contains(src, "[CLI") {
		t.Fatal("the old browser test still reaches for the old script: the replacements no longer fit it")
	}
	files := map[string]string{
		"go-sections.mjs":    goBuilders,
		"browser.test.mjs":   src,
		"ui-png-compare.mjs": "",
		"ui-compare.mjs":     "",
	}
	for _, name := range []string{"ui-png-compare.mjs", "ui-compare.mjs"} {
		b, err := os.ReadFile(filepath.Join(scripts, name))
		if err != nil {
			t.Fatal(err)
		}
		files[name] = string(b)
	}
	for name, content := range files {
		if err := os.WriteFile(filepath.Join(work, name), []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	cmd := exec.Command(node, "--test", filepath.Join(work, "browser.test.mjs"))
	cmd.Dir = filepath.Join(scripts, "..", "..") // the repository root, where the old test is run from
	cmd.Env = append(os.Environ(), "SECTIONS_BIN="+bin)
	var out bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &out
	err = cmd.Run()
	report := out.String()
	counts := map[string]string{}
	for _, k := range []string{"tests", "pass", "fail", "skipped"} {
		if m := regexp.MustCompile(`(?m)^# ` + k + ` (\d+)`).FindStringSubmatch(report); m != nil {
			counts[k] = m[1]
		}
	}
	t.Logf("browser tests: %s run, %s passed, %s failed, %s skipped", counts["tests"], counts["pass"], counts["fail"], counts["skipped"])
	if err != nil {
		t.Fatalf("the browser test failed: %v\n%s", err, tail(report, 6000))
	}
	if counts["tests"] != "" && counts["tests"] == counts["skipped"] {
		t.Skip("no Playwright with a Chromium found on this machine")
	}
}

func tail(s string, n int) string {
	if len(s) > n {
		return "…" + s[len(s)-n:]
	}
	return s
}
