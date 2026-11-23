package pr

import (
	"fmt"
	"strings"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/skilldoc"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/spec"
)

// growth is one SKILL.md or agent definition whose body changed in length between the merge base and HEAD.
type growth struct {
	path          string
	before, after int
}

func (g growth) line() string {
	return fmt.Sprintf("%s %d → %d（%+d）", g.path, g.before, g.after, g.after-g.before)
}

// skillGrowth reports, for each SKILL.md and agent definition that <base>...HEAD changed, the body length before
// and after, as one line each. It states facts and never judges them. A file the range adds counts 0 before, a
// file it deletes counts 0 after; a file whose body kept its length is not listed. Which files count, and how the
// body is measured, is the skill-lint's own (spec.IsLintedFile, skilldoc.Chars).
func (d Deps) skillGrowth(base string) ([]string, error) {
	changed, err := d.git("diff", "--name-status", "--no-renames", "-z", base+"...HEAD")
	if err != nil {
		return nil, err
	}
	mergeBase, err := d.git("merge-base", base, "HEAD")
	if err != nil {
		return nil, err
	}
	mergeBase = strings.TrimSpace(mergeBase)
	fields := strings.Split(strings.TrimSuffix(changed, "\x00"), "\x00")
	var lines []string
	for i := 0; i+1 < len(fields); i += 2 {
		status, path := fields[i], fields[i+1]
		if !spec.IsLintedFile(path) {
			continue
		}
		g := growth{path: path}
		if !strings.HasPrefix(status, "A") {
			text, err := d.git("show", mergeBase+":"+path)
			if err != nil {
				return nil, err
			}
			g.before = skilldoc.Chars(text)
		}
		if !strings.HasPrefix(status, "D") {
			text, err := d.git("show", "HEAD:"+path)
			if err != nil {
				return nil, err
			}
			g.after = skilldoc.Chars(text)
		}
		if g.before != g.after {
			lines = append(lines, g.line())
		}
	}
	return lines, nil
}
