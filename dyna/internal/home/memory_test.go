package home_test

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Ported from idea-loop/scripts/memory-check.test.mjs (`home memory check`). All names are invented (a fictional
// "acme-shop" project); every directory is a fresh temporary one.

type memHome struct {
	world
	memory string
}

func newMemHome(t *testing.T) memHome {
	root := realDir(t)
	m := memHome{world: world{root: root, home: filepath.Join(root, "home"), code: root}, memory: filepath.Join(root, "home", "memory")}
	if err := os.MkdirAll(m.memory, 0o755); err != nil {
		t.Fatal(err)
	}
	return m
}

func put(t *testing.T, base string, files map[string]string) {
	t.Helper()
	for rel, text := range files {
		write(t, base, rel, text)
	}
}

func (m memHome) check(args ...string) result {
	return m.run(m.root, append([]string{"home", "memory", "check"}, args...)...)
}

func (r result) all() string { return r.out + r.err }

// indexOf is an index of `lines` lines in all, each (after the first) a link to a fresh entry file.
func indexOf(lines, hookLength int) (string, map[string]string) {
	entries := map[string]string{}
	out := []string{"# Memory"}
	for i := 1; i < lines; i++ {
		entries[fmt.Sprintf("note-%d.md", i)] = fmt.Sprintf("---\nname: note %d\n---\nbody\n", i)
		out = append(out, fmt.Sprintf("- [note %d](note-%d.md) — %s", i, i, strings.Repeat("x", hookLength)))
	}
	return strings.Join(out, "\n") + "\n", entries
}

func TestMemoryOverBothLimitsExitsTwoAndNamesBoth(t *testing.T) { // "an index over both limits (150 lines, 26,000 bytes)…"
	m := newMemHome(t)
	text, entries := indexOf(150, 160)
	if len(text) < 26000-200 {
		t.Fatalf("fixture is %d bytes", len(text))
	}
	put(t, m.memory, entries)
	write(t, m.memory, "MEMORY.md", text)
	r := m.check(m.memory)
	if r.code != 2 || !strings.Contains(r.out, "150 行，超 140 行") || !strings.Contains(r.out, "字节，超 25,000 字节") {
		t.Fatalf("%+v", r)
	}
}

func TestMemoryExactly140LinesAnd25000BytesIsWithinTheLimits(t *testing.T) { // "exactly 140 lines and 25,000 bytes is within the limits"
	m := newMemHome(t)
	text, entries := indexOf(140, 10)
	put(t, m.memory, entries)
	text = strings.TrimSuffix(text, "\n")
	padded := text + strings.Repeat("x", 25000-len(text))
	if len(padded) != 25000 || len(strings.Split(padded, "\n")) != 140 {
		t.Fatal("fixture")
	}
	write(t, m.memory, "MEMORY.md", padded)
	if r := m.check(m.memory); r.code != 0 {
		t.Fatalf("%+v", r)
	}
	write(t, m.memory, "MEMORY.md", padded+"x")
	if r := m.check(m.memory); r.code != 2 || !strings.Contains(r.out, "字节") {
		t.Fatalf("%+v", r)
	}
}

func TestMemoryByteCountIsBytesNotCharacters(t *testing.T) { // "the byte count is bytes, not characters…"
	m := newMemHome(t)
	write(t, m.memory, "MEMORY.md", "# Memory\n"+strings.Repeat("记", 8400)+"\n")
	r := m.check(m.memory)
	if r.code != 2 || !strings.Contains(r.out, "字节") || strings.Contains(r.out, "超 140 行") {
		t.Fatalf("%+v", r)
	}
}

func TestMemoryNamesAMissingLinkAMissingProjectIndexAndAnUnlistedEntry(t *testing.T) { // "a link to a missing file, a project line pointing at a missing project index…"
	m := newMemHome(t)
	put(t, m.memory, map[string]string{
		"MEMORY.md": strings.Join([]string{
			"# Memory",
			"- [reply language](reply-language.md) — Chinese only",
			"- [gone](gone.md) — the file was deleted",
			"",
			"## 项目",
			"- [acme-shop 的项目记忆](../projects/acme-shop/memory/MEMORY.md) — 3 条：结账、埋点",
			"",
		}, "\n"),
		"reply-language.md": "---\nname: reply language\n---\nChinese only\n",
		"orphan.md":         "---\nname: orphan\n---\nnobody links me\n",
	})
	r := m.check(m.memory)
	if r.code != 2 || !strings.Contains(r.out, "gone.md") || !strings.Contains(r.out, "acme-shop/memory/MEMORY.md") || !strings.Contains(r.out, "orphan.md") || strings.Contains(r.out, "reply-language.md") {
		t.Fatalf("%+v", r)
	}
}

func TestMemoryWithinLimitsAndAllLinksValidIsGreenAndAProjectIndexOver140LinesIsNotReported(t *testing.T) { // "within the limits, every link and project pointer valid…"
	m := newMemHome(t)
	text, entries := indexOf(200, 10)
	put(t, filepath.Join(m.home, "projects", "acme-shop", "memory"), entries)
	write(t, m.home, "projects/acme-shop/memory/MEMORY.md", text)
	put(t, m.memory, map[string]string{
		"MEMORY.md":         "# Memory\n- [reply language](reply-language.md) — Chinese only\n\n## 项目\n- [acme-shop 的项目记忆](../projects/acme-shop/memory/MEMORY.md) — 199 条\n",
		"reply-language.md": "---\nname: reply language\n---\nChinese only\n",
	})
	r := m.check(m.memory)
	if r.code != 0 || !strings.Contains(r.out, "memory-check: green ✓") {
		t.Fatalf("%+v", r)
	}
}

func TestMemoryProjectPointerThatSkipsTheMemoryLayerIsNamed(t *testing.T) { // "a project pointer that skips the memory/ layer…"
	m := newMemHome(t)
	write(t, m.home, "projects/acme-shop/MEMORY.md", "# acme-shop\n")
	write(t, m.memory, "MEMORY.md", "# Memory\n\n## 项目\n- [acme-shop 的项目记忆](../projects/acme-shop/MEMORY.md) — 1 条\n")
	r := m.check(m.memory)
	if r.code != 2 || !strings.Contains(r.out, "acme-shop/MEMORY.md") || !strings.Contains(r.out, "projects/<名字>/memory/MEMORY.md") {
		t.Fatalf("%+v", r)
	}
}

func TestMemoryProjectPointerBackAtTheRootIndexIsNamed(t *testing.T) { // "a project pointer that points back at the root index itself…"
	m := newMemHome(t)
	write(t, m.memory, "MEMORY.md", "# Memory\n\n## 项目\n- [acme-shop 的项目记忆](MEMORY.md) — 1 条\n")
	r := m.check(m.memory)
	if r.code != 2 || !strings.Contains(r.out, "MEMORY.md") || !strings.Contains(r.out, "projects/<名字>/memory/MEMORY.md") {
		t.Fatalf("%+v", r)
	}
}

func TestMemoryBrokenLinkInAProjectIndexIsNamedWithTheIndex(t *testing.T) { // "a broken link inside a project index is named…"
	m := newMemHome(t)
	write(t, m.home, "projects/acme-shop/memory/MEMORY.md", "# acme-shop\n- [lost](lost.md) — x\n")
	write(t, m.memory, "MEMORY.md", "# Memory\n\n## 项目\n- [acme-shop 的项目记忆](../projects/acme-shop/memory/MEMORY.md) — 1 条\n")
	r := m.check(m.memory)
	if r.code != 2 || !strings.Contains(r.out, "acme-shop") || !strings.Contains(r.out, "lost.md") {
		t.Fatalf("%+v", r)
	}
}

func TestMemoryProjectLineWithNoLinkIsAProblem(t *testing.T) { // "a 项目 line with no link at all is a problem"
	m := newMemHome(t)
	write(t, m.memory, "MEMORY.md", "# Memory\n\n## 项目\n- acme-shop：结账、埋点\n")
	if r := m.check(m.memory); r.code != 2 || !strings.Contains(r.out, "acme-shop") {
		t.Fatalf("%+v", r)
	}
}

func TestMemoryExternalLinksAndAnchorsAreNotLookedUpOnDisk(t *testing.T) { // "external links and in-page anchors are not looked up on disk"
	m := newMemHome(t)
	put(t, m.memory, map[string]string{
		"MEMORY.md": "# Memory\n- [docs](https://example.com/memory) — x\n- [top](#memory) — y\n- [note](note.md#part) — z\n",
		"note.md":   "n\n",
	})
	if r := m.check(m.memory); r.code != 0 {
		t.Fatalf("%+v", r)
	}
}

func TestMemoryWithNoArgumentChecksMemoryUnderIdeaLoopHome(t *testing.T) { // "no argument: the default is memory/ under IDEA_LOOP_HOME"
	m := newMemHome(t)
	write(t, m.memory, "MEMORY.md", "# Memory\n"+strings.Repeat("x\n", 150))
	r := m.check()
	if r.code != 2 || !strings.Contains(r.out, m.memory) {
		t.Fatalf("%+v", r)
	}
}

func TestMemoryDirectoryWithoutMemoryMdExitsTwoAndAMissingDirectoryExitsOne(t *testing.T) { // "a directory without MEMORY.md exits 2…"
	m := newMemHome(t)
	if r := m.check(m.memory); r.code != 2 || !strings.Contains(r.out, "MEMORY.md") {
		t.Fatalf("%+v", r)
	}
	if r := m.check(filepath.Join(m.memory, "nope")); r.code != 1 {
		t.Fatalf("%+v", r)
	}
}
