package research

import (
	"regexp"
	"strings"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/jsstr"
)

// The research page is read with the same small parser the old script used, not with a full HTML parser: a full
// parser repairs the markup (closes a <p> that was never closed, adds a <tbody>), and the check is about what the
// researcher wrote. Elements, their attributes, their text and their children are all it needs.

// node is one element of the page. text is everything inside it, children's text included.
type node struct {
	tag      string
	attrs    map[string]string
	children []*node
	text     string
	parent   *node
}

var voidTags = map[string]bool{"img": true, "br": true, "hr": true, "meta": true, "link": true, "input": true, "source": true, "col": true, "area": true, "base": true, "wbr": true}

var (
	commentRe  = regexp.MustCompile(`(?s)<!--.*?-->`)
	scriptOpen = regexp.MustCompile(`(?is)<(script|style)\b[^>]*>`)
	tokenRe    = regexp.MustCompile(`<(/?)([a-zA-Z][\w-]*)([^>]*?)(/?)>|([^<]+)`)
	attrRe     = regexp.MustCompile(`([a-zA-Z_:][\w:.-]*)(?:` + jsstr.WS + `*=` + jsstr.WS + `*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?`)
	schemeRe   = regexp.MustCompile(`(?i)^[a-z][a-z0-9+.-]*:`)
)

// strip drops comments and the bodies of script and style so their text is never read as page content.
func strip(html string) string {
	html = commentRe.ReplaceAllString(html, "")
	var b strings.Builder
	for {
		open := scriptOpen.FindStringSubmatchIndex(html)
		if open == nil {
			b.WriteString(html)
			return b.String()
		}
		name := strings.ToLower(html[open[2]:open[3]])
		closeRe := regexp.MustCompile(`(?i)</` + name + jsstr.WS + `*>`)
		end := closeRe.FindStringIndex(html[open[1]:])
		if end == nil {
			// no closing tag: this opener is not a block; keep its first character and look further on
			b.WriteString(html[:open[0]+1])
			html = html[open[0]+1:]
			continue
		}
		b.WriteString(html[:open[0]])
		html = html[open[1]+end[1]:]
	}
}

// parse reads just enough HTML to get elements with their attributes, text and children.
func parse(html string) *node {
	root := &node{tag: "#root", attrs: map[string]string{}}
	cur := root
	for _, m := range tokenRe.FindAllStringSubmatchIndex(html, -1) {
		if m[10] >= 0 {
			for n := cur; n != nil; n = n.parent {
				n.text += html[m[10]:m[11]]
			}
			continue
		}
		closing := html[m[2]:m[3]] != ""
		tag := strings.ToLower(html[m[4]:m[5]])
		rawAttrs := html[m[6]:m[7]]
		selfClose := html[m[8]:m[9]] != ""
		if closing {
			n := cur
			for n != nil && n.tag != tag {
				n = n.parent
			}
			if n != nil && n.parent != nil {
				cur = n.parent
			}
			continue
		}
		attrs := map[string]string{}
		for _, a := range attrRe.FindAllStringSubmatchIndex(rawAttrs, -1) {
			val := ""
			for g := 2; g <= 4; g++ {
				if a[2*g] >= 0 {
					val = rawAttrs[a[2*g]:a[2*g+1]]
					break
				}
			}
			attrs[strings.ToLower(rawAttrs[a[2]:a[3]])] = val
		}
		el := &node{tag: tag, attrs: attrs, parent: cur}
		cur.children = append(cur.children, el)
		if !voidTags[tag] && !selfClose {
			cur = el
		}
	}
	return root
}

// walk lists every descendant of el, depth first, in document order (el itself is not in it).
func walk(el *node) []*node {
	var out []*node
	var visit func(n *node)
	visit = func(n *node) {
		for _, c := range n.children {
			out = append(out, c)
			visit(c)
		}
	}
	visit(el)
	return out
}

func textOf(el *node) string { return jsstr.Trim(jsstr.Collapse(el.text)) }

var headingTag = regexp.MustCompile(`^h[1-6]$`)

func headings(el *node) []string {
	var out []string
	for _, e := range walk(el) {
		if headingTag.MatchString(e.tag) {
			out = append(out, textOf(e))
		}
	}
	return out
}

// within reports whether el is inside ancestor (or is it).
func within(el, ancestor *node) bool {
	for n := el; n != nil; n = n.parent {
		if n == ancestor {
			return true
		}
	}
	return false
}

// hasAncestor reports whether el sits inside an element with this tag.
func hasAncestor(el *node, tag string) bool {
	for n := el.parent; n != nil; n = n.parent {
		if n.tag == tag {
			return true
		}
	}
	return false
}

func has(el *node, attr string) bool {
	_, ok := el.attrs[attr]
	return ok
}

// notContent are the tags that can follow the last chapter without being a chapter (the zoom dialog and its script).
var notContent = map[string]bool{"script": true, "style": true, "dialog": true, "template": true, "noscript": true}

func isContent(el *node) bool {
	return !notContent[el.tag] && (has(el, "data-part") || has(el, "data-source") || textOf(el) != "")
}

func byPart(root *node, part string) []*node {
	var out []*node
	for _, e := range walk(root) {
		if v, ok := e.attrs["data-part"]; ok && v == part {
			out = append(out, e)
		}
	}
	return out
}

// isRelative: a screenshot address must stay inside the drop directory: relative, no scheme, no `..`.
func isRelative(src string) bool {
	if src == "" || schemeRe.MatchString(src) || strings.HasPrefix(src, "/") {
		return false
	}
	for _, part := range strings.FieldsFunc(src, func(r rune) bool { return r == '/' || r == '\\' }) {
		if part == ".." {
			return false
		}
	}
	return true
}
