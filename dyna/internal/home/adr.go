package home

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

var adrNumber = regexp.MustCompile(`^(\d{4})-`)

// NextADRName is the file name the next ADR of the project directory docs gets: a four-digit number one above the
// highest one there, then the name. Numbers only go up and are never reused, so a gap left by a deleted ADR stays.
func NextADRName(docs, name string) (string, error) {
	name = strings.TrimSuffix(strings.TrimSpace(name), ".md")
	if name == "" || strings.ContainsAny(name, "/\\ \t\n") || strings.HasPrefix(name, ".") {
		return "", fmt.Errorf("ADR 的名字「%s」不能为空，也不能带斜杠、空白或以点开头；写成 kebab-case，不带编号", name)
	}
	if adrNumber.MatchString(name) {
		return "", fmt.Errorf("ADR 的名字「%s」自己带了编号；只给名字，编号由命令给", name)
	}
	top := 0
	entries, err := os.ReadDir(filepath.Join(docs, "adr"))
	if err != nil && !os.IsNotExist(err) {
		return "", err
	}
	for _, e := range entries {
		if m := adrNumber.FindStringSubmatch(e.Name()); m != nil {
			n, _ := strconv.Atoi(m[1])
			top = max(top, n)
		}
	}
	if top >= 9999 {
		return "", fmt.Errorf("ADR 编号已经到 9999，放不下四位")
	}
	return fmt.Sprintf("%04d-%s.md", top+1, name), nil
}
