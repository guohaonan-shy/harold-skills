// Package miniyaml reads the small YAML subset the design archive's frontmatter uses.
//
// The archive's object files carry their structure in YAML frontmatter, and the command line ships no YAML
// dependency for it, so this reads the subset those files actually use:
//
//   - block mappings and block sequences, nested by indentation (a sequence may sit at the same indent as its
//     key); `- key: value` list items continue as a mapping
//   - flow sequences `[a, b]` and flow mappings `{ k: v }`, nested, possibly spread over lines
//   - single- and double-quoted strings, plain scalars, `# comments`
//   - `|` and `>` block scalars
//   - null / true / false / numbers
//
// Two leniencies, both because the archive writes references by hand:
//
//   - `[[basename]]` without quotes is read as the string "[[basename]]", not a nested list
//   - `{token}` (a flow mapping with no `key: value` inside) is read as the string "{token}"
//
// Anything outside the subset is an error with a line number. A value is one of: nil, bool, float64, string,
// []any, *Map (a mapping that remembers the order its keys were written in).
package miniyaml

import (
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
)

// Map is a YAML mapping that keeps its keys in the order they were written.
type Map struct {
	keys []string
	m    map[string]any
}

// NewMap is an empty mapping.
func NewMap() *Map { return &Map{m: map[string]any{}} }

// Set sets a key; a key already there keeps its place.
func (m *Map) Set(k string, v any) {
	if _, ok := m.m[k]; !ok {
		m.keys = append(m.keys, k)
	}
	m.m[k] = v
}

// Get is the value under k (nil when missing; use Has to tell a missing key from a null).
func (m *Map) Get(k string) any {
	if m == nil {
		return nil
	}
	return m.m[k]
}

// Has says whether the key is there, even with a null value.
func (m *Map) Has(k string) bool {
	if m == nil {
		return false
	}
	_, ok := m.m[k]
	return ok
}

// Keys are the keys in the order they were written.
func (m *Map) Keys() []string {
	if m == nil {
		return nil
	}
	return append([]string(nil), m.keys...)
}

// Len is the number of keys.
func (m *Map) Len() int {
	if m == nil {
		return 0
	}
	return len(m.keys)
}

// Split is the result of splitting a markdown file into frontmatter and body.
type Split struct {
	FM    *Map // nil when there is no frontmatter or it could not be read
	Body  string
	Error string // "" when fine
}

var frontmatterRe = regexp.MustCompile(`^---\n((?s:.*?))\n---[ \t]*(?:\n|$)`)

// SplitFrontmatter splits `---\n<yaml>\n---\n<body>`.
func SplitFrontmatter(md string) Split {
	text := strings.ReplaceAll(md, "\r\n", "\n")
	loc := frontmatterRe.FindStringSubmatchIndex(text)
	if loc == nil {
		return Split{Body: text}
	}
	body := text[loc[1]:]
	v, err := Parse(text[loc[2]:loc[3]])
	if err != nil {
		return Split{Body: body, Error: err.Error()}
	}
	if v == nil {
		return Split{FM: NewMap(), Body: body}
	}
	m, ok := v.(*Map)
	if !ok {
		return Split{Body: body, Error: "frontmatter 不是键值映射"}
	}
	return Split{FM: m, Body: body}
}

type failure struct{ msg string }

func fail(format string, a ...any) { panic(failure{fmt.Sprintf(format, a...)}) }

func isSpace(c byte) bool {
	return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f' || c == '\v'
}

func opensToken(prev byte) bool {
	return isSpace(prev) || prev == '[' || prev == '{' || prev == ',' || prev == ':'
}

// stripComment removes a trailing ` # comment` that sits outside quotes.
func stripComment(s string) string {
	var q byte
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case q != 0:
			if q == '"' && c == '\\' {
				i++
			} else if c == q {
				q = 0
			}
		case c == '"' || c == '\'':
			if i == 0 || opensToken(s[i-1]) {
				q = c
			}
		case c == '#' && (i == 0 || isSpace(s[i-1])):
			return strings.TrimRight(s[:i], " \t\r\n\f\v")
		}
	}
	return strings.TrimRight(s, " \t\r\n\f\v")
}

// depthOf is the net bracket depth of a string, ignoring quoted parts.
func depthOf(s string) int {
	d := 0
	var q byte
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case q != 0:
			if q == '"' && c == '\\' {
				i++
			} else if c == q {
				q = 0
			}
		case c == '"' || c == '\'':
			if i == 0 || opensToken(s[i-1]) {
				q = c
			}
		case c == '[' || c == '{':
			d++
		case c == ']' || c == '}':
			d--
		}
	}
	return d
}

var keyRe = regexp.MustCompile(`^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^\s:#\[\]{}"'\-][^:]*?|-[^\s:][^:]*?)\s*:(?:\s+(.*)|$)`)

func unquoteKey(k string) string {
	if strings.HasPrefix(k, `"`) {
		var s string
		if err := json.Unmarshal([]byte(k), &s); err != nil {
			fail("%s", err.Error())
		}
		return s
	}
	if strings.HasPrefix(k, "'") {
		return strings.ReplaceAll(k[1:len(k)-1], "''", "'")
	}
	return k
}

var (
	intRe   = regexp.MustCompile(`^-?\d+$`)
	floatRe = regexp.MustCompile(`^-?\d*\.\d+$`)
)

func scalar(raw string) any {
	s := strings.TrimSpace(raw)
	switch s {
	case "", "~", "null":
		return nil
	case "true":
		return true
	case "false":
		return false
	}
	if intRe.MatchString(s) || floatRe.MatchString(s) {
		if f, err := strconv.ParseFloat(s, 64); err == nil {
			return f
		}
	}
	return s
}

// flow is a recursive-descent reader for flow collections and quoted/plain scalars.
type flow struct {
	s     string
	i     int
	where string
}

func (f *flow) fail(msg string) { fail("%s：%s", f.where, msg) }

func (f *flow) ws() {
	for f.i < len(f.s) && isSpace(f.s[f.i]) {
		f.i++
	}
}

var wikiLiteral = regexp.MustCompile(`^\[\[([^\[\]]+)\]\]`)

func (f *flow) value(inFlow bool) any {
	f.ws()
	if f.i >= len(f.s) {
		return nil
	}
	c := f.s[f.i]
	switch c {
	case '[':
		if lit := wikiLiteral.FindString(f.s[f.i:]); lit != "" {
			f.i += len(lit)
			return lit
		}
		return f.seq()
	case '{':
		return f.mapping()
	case '"', '\'':
		return f.quoted()
	}
	return f.plain(inFlow)
}

func (f *flow) seq() any {
	f.i++ // [
	out := []any{}
	for {
		f.ws()
		if f.i < len(f.s) && f.s[f.i] == ']' {
			f.i++
			return out
		}
		if f.i >= len(f.s) {
			f.fail("flow 列表没有闭合")
		}
		out = append(out, f.value(true))
		f.ws()
		switch {
		case f.i < len(f.s) && f.s[f.i] == ',':
			f.i++
		case f.i >= len(f.s) || f.s[f.i] != ']':
			f.fail("flow 列表里缺逗号")
		}
	}
}

func (f *flow) mapping() any {
	start := f.i
	// find the matching brace to decide between a mapping and a {token}
	d := 0
	var q byte
	end := -1
scan:
	for j := f.i; j < len(f.s); j++ {
		c := f.s[j]
		switch {
		case q != 0:
			if q == '"' && c == '\\' {
				j++
			} else if c == q {
				q = 0
			}
		case c == '"' || c == '\'':
			if j == f.i || opensToken(f.s[j-1]) {
				q = c
			}
		case c == '{' || c == '[':
			d++
		case c == '}' || c == ']':
			d--
			if d == 0 {
				end = j
				break scan
			}
		}
	}
	if end < 0 {
		f.fail("flow 映射没有闭合")
	}
	inner := f.s[start+1 : end]
	if !hasMappingColon(inner) {
		f.i = end + 1
		return f.s[start : end+1]
	}
	f.i++ // {
	out := NewMap()
	for {
		f.ws()
		if f.i < len(f.s) && f.s[f.i] == '}' {
			f.i++
			return out
		}
		if f.i >= len(f.s) {
			f.fail("flow 映射没有闭合")
		}
		key := f.key()
		f.ws()
		if f.i < len(f.s) && (f.s[f.i] == ',' || f.s[f.i] == '}') {
			out.Set(key, nil)
		} else {
			out.Set(key, f.value(true))
		}
		f.ws()
		switch {
		case f.i < len(f.s) && f.s[f.i] == ',':
			f.i++
		case f.i >= len(f.s) || f.s[f.i] != '}':
			f.fail("flow 映射里缺逗号")
		}
	}
}

func (f *flow) key() string {
	f.ws()
	var k string
	if f.i < len(f.s) && (f.s[f.i] == '"' || f.s[f.i] == '\'') {
		k = f.quoted()
	} else {
		// ^[^:,{}\[\]]*?(?=:(\s|$|,|\}))
		found := -1
		for j := f.i; j < len(f.s); j++ {
			c := f.s[j]
			if c == ':' {
				if j+1 >= len(f.s) || isSpace(f.s[j+1]) || f.s[j+1] == ',' || f.s[j+1] == '}' {
					found = j
				}
				break
			}
			if c == ',' || c == '{' || c == '}' || c == '[' || c == ']' {
				break
			}
		}
		if found < 0 {
			f.fail("flow 映射的键后面缺冒号")
		}
		k = strings.TrimSpace(f.s[f.i:found])
		f.i = found
	}
	f.ws()
	if f.i >= len(f.s) || f.s[f.i] != ':' {
		f.fail("flow 映射的键后面缺冒号")
	}
	f.i++
	return k
}

func (f *flow) quoted() string {
	q := f.s[f.i]
	f.i++
	var out strings.Builder
	for {
		if f.i >= len(f.s) {
			f.fail("引号没有闭合")
		}
		c := f.s[f.i]
		f.i++
		switch {
		case q == '"' && c == '\\':
			if f.i >= len(f.s) {
				out.WriteString("undefined") // the reader this one replaces wrote this for a trailing backslash
				continue
			}
			r, size := utf8.DecodeRuneInString(f.s[f.i:])
			f.i += size
			switch r {
			case 'n':
				out.WriteByte('\n')
			case 't':
				out.WriteByte('\t')
			default:
				out.WriteRune(r)
			}
		case c == q:
			if q == '\'' && f.i < len(f.s) && f.s[f.i] == '\'' {
				out.WriteByte('\'')
				f.i++
			} else {
				return out.String()
			}
		default:
			out.WriteByte(c)
		}
	}
}

func (f *flow) plain(inFlow bool) any {
	start := f.i
	for f.i < len(f.s) {
		c := f.s[f.i]
		if inFlow && (c == ',' || c == ']' || c == '}') {
			break
		}
		f.i++
	}
	return scalar(f.s[start:f.i])
}

func hasMappingColon(inner string) bool {
	var q byte
	d := 0
	for i := 0; i < len(inner); i++ {
		c := inner[i]
		switch {
		case q != 0:
			if q == '"' && c == '\\' {
				i++
			} else if c == q {
				q = 0
			}
		case c == '"' || c == '\'':
			if i == 0 || opensToken(inner[i-1]) {
				q = c
			}
		case c == '[' || c == '{':
			d++
		case c == ']' || c == '}':
			d--
		case c == ':' && d == 0 && (i == len(inner)-1 || isSpace(inner[i+1]) || inner[i+1] == ','):
			return true
		}
	}
	return false
}

func inline(text, where string) any {
	t := strings.TrimSpace(text)
	if t == "" {
		return nil
	}
	f := &flow{s: t, where: where}
	v := f.value(false)
	f.ws()
	if f.i < len(t) {
		f.fail(fmt.Sprintf("多余内容「%s」", truncate(t[f.i:], 20)))
	}
	return v
}

// truncate keeps the first n characters (the reader this one replaces counted UTF-16 units; for the
// characters the archive uses this is the same).
func truncate(s string, n int) string {
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	r := []rune(s)
	return string(r[:n])
}

type line struct {
	indent int
	text   string
	n      int
}

var (
	blankLine   = regexp.MustCompile(`^\s*(#.*)?$`)
	seqItem     = regexp.MustCompile(`^-(\s|$)`)
	blockMarker = regexp.MustCompile(`^[|>][+-]?$`)
	dashSpaces  = regexp.MustCompile(`^-\s*`)
	wsRuns      = regexp.MustCompile(`\s+`)
)

func leadingSpaces(s string) int {
	n := 0
	for n < len(s) && s[n] == ' ' {
		n++
	}
	return n
}

type parser struct {
	raw   []string
	lines []line
	pos   int
}

func (p *parser) where(l line) string { return fmt.Sprintf("第 %d 行", l.n) }

// takeFlow joins following lines while a flow collection started on a line is still open.
func (p *parser) takeFlow(text string) string {
	joined := text
	d := depthOf(joined)
	for d > 0 && p.pos < len(p.lines) {
		nx := p.lines[p.pos]
		p.pos++
		joined += " " + nx.text
		d = depthOf(joined)
	}
	return joined
}

func (p *parser) blockScalar(l line, style string, parentIndent int) any {
	var out []string
	// block scalar lines are the raw lines after l.n whose indent exceeds parentIndent (blank lines kept)
	k := l.n
	base := -1
	for k < len(p.raw) {
		ln := p.raw[k]
		if strings.TrimSpace(ln) == "" {
			out = append(out, "")
			k++
			continue
		}
		ind := leadingSpaces(ln)
		if ind <= parentIndent {
			break
		}
		if base < 0 {
			base = ind
		}
		out = append(out, ln[base:])
		k++
	}
	for len(out) > 0 && out[len(out)-1] == "" {
		out = out[:len(out)-1]
	}
	// skip lines consumed by the scalar
	for p.pos < len(p.lines) && p.lines[p.pos].n <= k {
		p.pos++
	}
	if strings.HasPrefix(style, "|") {
		return strings.Join(out, "\n")
	}
	return strings.TrimSpace(wsRuns.ReplaceAllString(strings.Join(out, " "), " "))
}

func (p *parser) valueAfterKey(l line, rest string, indent int) any {
	if rest == "" {
		if p.pos < len(p.lines) {
			nx := p.lines[p.pos]
			if nx.indent > indent {
				return p.block(nx.indent)
			}
			if nx.indent == indent && seqItem.MatchString(nx.text) {
				return p.sequence(indent)
			}
		}
		return nil
	}
	if blockMarker.MatchString(rest) {
		return p.blockScalar(l, rest, indent)
	}
	return inline(p.takeFlow(rest), p.where(l))
}

func (p *parser) mapping(indent int) any {
	out := NewMap()
	for p.pos < len(p.lines) && p.lines[p.pos].indent == indent && !seqItem.MatchString(p.lines[p.pos].text) {
		l := p.lines[p.pos]
		p.pos++
		m := keyRe.FindStringSubmatch(l.text)
		if m == nil {
			fail("%s：读不出「键: 值」：%s", p.where(l), truncate(l.text, 40))
		}
		out.Set(unquoteKey(m[1]), p.valueAfterKey(l, m[2], indent))
	}
	if p.pos < len(p.lines) && p.lines[p.pos].indent > indent {
		fail("%s：缩进对不上", p.where(p.lines[p.pos]))
	}
	return out
}

func (p *parser) sequence(indent int) any {
	out := []any{}
	for p.pos < len(p.lines) && p.lines[p.pos].indent == indent && seqItem.MatchString(p.lines[p.pos].text) {
		l := p.lines[p.pos]
		after := dashSpaces.ReplaceAllString(l.text, "")
		off := len(l.text) - len(after)
		if after == "" {
			p.pos++
			if p.pos < len(p.lines) && p.lines[p.pos].indent > indent {
				out = append(out, p.block(p.lines[p.pos].indent))
			} else {
				out = append(out, nil)
			}
			continue
		}
		if keyRe.MatchString(after) {
			// `- key: value` — the item is a mapping whose first key sits on this line
			l.indent = indent + off
			l.text = after
			p.lines[p.pos] = l
			out = append(out, p.mapping(indent+off))
			continue
		}
		p.pos++
		if blockMarker.MatchString(after) {
			out = append(out, p.blockScalar(l, after, indent))
		} else {
			out = append(out, inline(p.takeFlow(after), p.where(l)))
		}
	}
	return out
}

func (p *parser) block(indent int) any {
	l := p.lines[p.pos]
	if seqItem.MatchString(l.text) {
		return p.sequence(indent)
	}
	if keyRe.MatchString(l.text) {
		return p.mapping(indent)
	}
	p.pos++
	return inline(p.takeFlow(l.text), p.where(l))
}

// Parse reads a YAML document (nil for an empty one).
func Parse(src string) (result any, err error) {
	defer func() {
		if r := recover(); r != nil {
			if f, ok := r.(failure); ok {
				result, err = nil, errors.New(f.msg)
				return
			}
			panic(r)
		}
	}()
	raw := strings.Split(strings.ReplaceAll(src, "\r\n", "\n"), "\n")
	p := &parser{raw: raw}
	for i, ln := range raw {
		if blankLine.MatchString(ln) {
			continue
		}
		indent := leadingSpaces(ln)
		if indent < len(ln) && ln[indent] == '\t' {
			fail("第 %d 行：不支持制表符缩进", i+1)
		}
		p.lines = append(p.lines, line{indent: indent, text: stripComment(ln[indent:]), n: i + 1})
	}
	if len(p.lines) == 0 {
		return nil, nil
	}
	result = p.block(p.lines[0].indent)
	if p.pos < len(p.lines) {
		fail("%s：多余内容", p.where(p.lines[p.pos]))
	}
	return result, nil
}
