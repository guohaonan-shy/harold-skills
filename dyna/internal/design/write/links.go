package write

import (
	"net/url"
	"path"
	"regexp"
	"strings"
)

// linkRe is a markdown link or image: `![alt](target "title")`, the target optionally in <>.
var linkRe = regexp.MustCompile(`(!?\[[^\]]*\]\()(<?)([^)\s>]+)(>?)((?:\s+"[^"]*")?\))`)

var fenceRe = regexp.MustCompile("^\\s*(`{3,}|~{3,})")

// LinkTarget is the target of a markdown link or image and the line it is on.
type LinkTarget struct {
	Line   int
	Target string
}

// linkTargets lists the targets of markdown links / images, outside fenced code.
func linkTargets(text string) []LinkTarget {
	var out []LinkTarget
	var fence byte
	for i, line := range strings.Split(text, "\n") {
		if m := fenceRe.FindStringSubmatch(line); m != nil {
			if fence == 0 {
				fence = m[1][0]
			} else if m[1][0] == fence {
				fence = 0
			}
			continue
		}
		if fence != 0 {
			continue
		}
		for _, m := range linkRe.FindAllStringSubmatch(line, -1) {
			out = append(out, LinkTarget{Line: i + 1, Target: m[3]})
		}
	}
	return out
}

type candidate struct {
	path  string
	style string // relative / root / absolute
}

var (
	schemeRe = regexp.MustCompile(`(?i)^[a-z][a-z0-9+.-]*:`)
	suffixRe = regexp.MustCompile(`[#?]`)
)

// posixNormalize is node's posix.normalize: collapse `.`, `..` and repeated slashes, keep a trailing slash.
func posixNormalize(p string) string {
	res := path.Clean(p)
	if strings.HasSuffix(p, "/") && res != "/" && res != "." {
		res += "/"
	}
	return res
}

// decodeURI is JavaScript's decodeURI: percent escapes are decoded except those of reserved characters.
func decodeURI(s string) string {
	if !strings.Contains(s, "%") {
		return s
	}
	var out []byte
	for i := 0; i < len(s); i++ {
		if s[i] == '%' && i+2 < len(s) && isHex(s[i+1]) && isHex(s[i+2]) {
			b := unhex(s[i+1])<<4 | unhex(s[i+2])
			if b < 0x80 && strings.IndexByte(";/?:@&=+$,#", b) >= 0 {
				out = append(out, s[i:i+3]...)
			} else {
				out = append(out, b)
			}
			i += 2
			continue
		}
		out = append(out, s[i])
	}
	if !isValidUTF8(out) {
		if u, err := url.PathUnescape(s); err == nil {
			return u
		}
		return s
	}
	return string(out)
}

func isValidUTF8(b []byte) bool { return strings.ToValidUTF8(string(b), "\x00") == string(b) }

func isHex(c byte) bool {
	return c >= '0' && c <= '9' || c >= 'a' && c <= 'f' || c >= 'A' && c <= 'F'
}

func unhex(c byte) byte {
	switch {
	case c >= '0' && c <= '9':
		return c - '0'
	case c >= 'a' && c <= 'f':
		return c - 'a' + 10
	}
	return c - 'A' + 10
}

// candidates are the repo-relative paths a link target may mean: relative to the file's folder, or from the repo root.
func candidates(specDir, target string) []candidate {
	p := decodeURI(suffixRe.Split(target, 2)[0])
	if p == "" || schemeRe.MatchString(p) || strings.HasPrefix(p, "#") {
		return nil
	}
	if strings.HasPrefix(p, "/") {
		return []candidate{{path: posixNormalize(p[1:]), style: "absolute"}}
	}
	return []candidate{
		{path: posixNormalize(path.Join(specDir, p)), style: "relative"},
		{path: posixNormalize(p), style: "root"},
	}
}

// posixRelative is node's posix.relative for two relative paths.
func posixRelative(from, to string) string {
	split := func(p string) []string {
		p = path.Clean(p)
		if p == "." || p == "" {
			return nil
		}
		return strings.Split(p, "/")
	}
	a, b := split(from), split(to)
	i := 0
	for i < len(a) && i < len(b) && a[i] == b[i] {
		i++
	}
	var parts []string
	for range a[i:] {
		parts = append(parts, "..")
	}
	parts = append(parts, b[i:]...)
	return strings.Join(parts, "/")
}

// LinkChange is one rewritten link.
type LinkChange struct{ From, To string }

// RewriteLinks points every link in text that resolves to a key of moved (old repo path → new repo path) at the
// new place, keeping the link's own style (relative, from the repo root, or with a leading slash).
func RewriteLinks(text, specDir string, moved map[string]string) (string, []LinkChange) {
	var changes []LinkChange
	var fence byte
	lines := strings.Split(text, "\n")
	for li, line := range lines {
		if m := fenceRe.FindStringSubmatch(line); m != nil {
			if fence == 0 {
				fence = m[1][0]
			} else if m[1][0] == fence {
				fence = 0
			}
			continue
		}
		if fence != 0 {
			continue
		}
		var b strings.Builder
		last := 0
		for _, idx := range linkRe.FindAllStringSubmatchIndex(line, -1) {
			whole := line[idx[0]:idx[1]]
			open, lt, target, gt, closing := line[idx[2]:idx[3]], line[idx[4]:idx[5]], line[idx[6]:idx[7]], line[idx[8]:idx[9]], line[idx[10]:idx[11]]
			b.WriteString(line[last:idx[0]])
			last = idx[1]
			replaced := whole
			for _, c := range candidates(specDir, target) {
				to, ok := moved[c.path]
				if !ok || to == "" {
					continue
				}
				rest := ""
				if at := suffixRe.FindStringIndex(target); at != nil {
					rest = target[at[0]:]
				}
				var written string
				switch c.style {
				case "relative":
					written = posixRelative(specDir, to)
				case "absolute":
					written = "/" + to
				default:
					written = to
				}
				changes = append(changes, LinkChange{From: target, To: written + rest})
				replaced = open + lt + written + rest + gt + closing
				break
			}
			b.WriteString(replaced)
		}
		b.WriteString(line[last:])
		lines[li] = b.String()
	}
	return strings.Join(lines, "\n"), changes
}
