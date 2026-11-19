// Package frontmatter reads the YAML frontmatter of the design archive's object files (and the retro candidate
// pool's) into plain values, and holds the ordered mapping the commands build their JSON output from.
//
// The YAML itself is read by go.yaml.in/yaml/v3; this package only turns its nodes into the value shapes the rest
// of dyna tests: nil, bool, float64, string, []any, *Map (a mapping that remembers the order its keys were
// written in). The reading rules the archive's checks were written against stay as they were:
//
//   - a quoted scalar, and a `|` or `>` block scalar (without its trailing newline), is a string;
//   - a plain scalar is null (`null`, `~`, nothing), `true` / `false`, a decimal number, or else the text as
//     written, so a date such as 2026-11-19 stays "2026-11-19" and `0x10` stays "0x10".
//
// Two shapes the archive's hand-written files used to get away with are errors now, because they are valid YAML
// that means something else: `[[basename]]` without quotes is a list inside a list, and `{token}` is a mapping
// with an empty value. Both fail with the line and "引用要加引号".
package frontmatter

import (
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"go.yaml.in/yaml/v3"
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

// Parts is the result of splitting a markdown file into frontmatter and body.
type Parts struct {
	FM    *Map // nil when there is no frontmatter or it could not be read
	Body  string
	Error string // "" when fine; says the file line (第 N 行) when the YAML itself is wrong
}

var frontmatterRe = regexp.MustCompile(`^---\n((?s:.*?))\n---[ \t]*(?:\n|$)`)

// Split splits `---\n<yaml>\n---\n<body>`. Line numbers in Error count from the first line of the file.
func Split(md string) Parts {
	text := strings.ReplaceAll(md, "\r\n", "\n")
	loc := frontmatterRe.FindStringSubmatchIndex(text)
	if loc == nil {
		return Parts{Body: text}
	}
	body := text[loc[1]:]
	v, err := parse(text[loc[2]:loc[3]], 1) // the YAML starts on the line after the opening `---`
	if err != nil {
		return Parts{Body: body, Error: err.Error()}
	}
	if v == nil {
		return Parts{FM: NewMap(), Body: body}
	}
	m, ok := v.(*Map)
	if !ok {
		return Parts{Body: body, Error: "frontmatter 不是键值映射"}
	}
	return Parts{FM: m, Body: body}
}

// Parse reads a YAML document (nil for an empty one). Line numbers in an error count from the first line of src.
func Parse(src string) (any, error) { return parse(src, 0) }

func parse(src string, lineOffset int) (any, error) {
	var doc yaml.Node
	if err := yaml.Unmarshal([]byte(src), &doc); err != nil {
		return nil, libraryError(err, lineOffset)
	}
	if doc.Kind != yaml.DocumentNode || len(doc.Content) == 0 {
		return nil, nil
	}
	return (&reader{offset: lineOffset}).value(doc.Content[0])
}

var libraryErrRe = regexp.MustCompile(`(?s)^yaml: (?:line (\d+): )?(.*)$`)

// A parse error the library raises after the scanner, "did not find expected ',' or ']'" and the like, names the
// 0-based line where the unfinished construct began, one less than the line a person counts; the scanner's own
// errors (a tab, a stray character, an unclosed quote) already name the line a person counts.
var parserErrRe = regexp.MustCompile(`^did not find expected (<|'|node|key|-)`)

// The syntax errors a hand-written value hits when it holds a colon, a question mark or a brace without quotes
// ("title: a: b", "to: {token}"): the library words them for a YAML author, not for the person who wrote the file.
var quoteHintErrRe = regexp.MustCompile(`^(mapping values are not allowed in this context|did not find expected ',' or '[}\]]')`)

const quoteHint = "。值里有冒号、问号或花括号时要加引号"

// libraryError says where the YAML is wrong in the words the archive's checks use: 第 N 行：<what the library said>.
// A parse error on the first line comes from the library without a line, so it is passed on without one. The errors
// an unquoted value causes get a sentence after the library's words saying so.
func libraryError(err error, offset int) error {
	m := libraryErrRe.FindStringSubmatch(err.Error())
	if m == nil {
		return err
	}
	msg := strings.TrimSpace(m[2])
	if quoteHintErrRe.MatchString(msg) {
		msg += quoteHint
	}
	if m[1] == "" {
		return errors.New(msg)
	}
	n, _ := strconv.Atoi(m[1])
	if parserErrRe.MatchString(msg) {
		n++
	}
	return fmt.Errorf("第 %d 行：%s", n+offset, msg)
}

type reader struct{ offset int }

func (r *reader) errorf(n *yaml.Node, format string, a ...any) error {
	return fmt.Errorf("第 %d 行：%s", n.Line+r.offset, fmt.Sprintf(format, a...))
}

func (r *reader) value(n *yaml.Node) (any, error) {
	switch n.Kind {
	case yaml.AliasNode:
		return r.value(n.Alias)
	case yaml.ScalarNode:
		return scalar(n), nil
	case yaml.SequenceNode:
		if link, ok := unquotedLink(n); ok {
			return nil, r.errorf(n, "「[[%s]]」没有加引号，会被读成列表里的列表；引用要加引号：\"[[%s]]\"", link, link)
		}
		out := make([]any, 0, len(n.Content))
		for _, c := range n.Content {
			v, err := r.value(c)
			if err != nil {
				return nil, err
			}
			out = append(out, v)
		}
		return out, nil
	case yaml.MappingNode:
		out := NewMap()
		for i := 0; i+1 < len(n.Content); i += 2 {
			k, v := n.Content[i], n.Content[i+1]
			if k.Kind == yaml.AliasNode {
				k = k.Alias
			}
			if k.Kind != yaml.ScalarNode {
				return nil, r.errorf(k, "键必须是文本")
			}
			if n.Style&yaml.FlowStyle != 0 && v.Kind == yaml.ScalarNode && v.Style == 0 && v.Value == "" {
				return nil, r.errorf(k, "「{%s}」没有加引号，会被读成只有键、值为空的映射；引用要加引号：\"{%s}\"", k.Value, k.Value)
			}
			val, err := r.value(v)
			if err != nil {
				return nil, err
			}
			out.Set(k.Value, val)
		}
		return out, nil
	}
	return nil, nil
}

// unquotedLink recognises `[[basename]]` written without quotes: a flow list holding one flow list of bare words.
func unquotedLink(n *yaml.Node) (string, bool) {
	if n.Style&yaml.FlowStyle == 0 || len(n.Content) != 1 {
		return "", false
	}
	inner := n.Content[0]
	if inner.Kind != yaml.SequenceNode || inner.Style&yaml.FlowStyle == 0 || len(inner.Content) == 0 {
		return "", false
	}
	words := make([]string, len(inner.Content))
	for i, w := range inner.Content {
		if w.Kind != yaml.ScalarNode || w.Style != 0 {
			return "", false
		}
		words[i] = w.Value
	}
	return strings.Join(words, ", "), true
}

var (
	intRe   = regexp.MustCompile(`^-?\d+$`)
	floatRe = regexp.MustCompile(`^-?\d*\.\d+$`)
)

const quotedStyles = yaml.DoubleQuotedStyle | yaml.SingleQuotedStyle

func scalar(n *yaml.Node) any {
	switch {
	case n.Style&(yaml.LiteralStyle|yaml.FoldedStyle) != 0:
		return strings.TrimRight(n.Value, "\n")
	case n.Style&quotedStyles != 0:
		return n.Value
	case n.Style&yaml.TaggedStyle != 0 && n.Tag == "!!str":
		return n.Value
	}
	switch s := strings.TrimSpace(n.Value); s {
	case "", "~", "null":
		return nil
	case "true":
		return true
	case "false":
		return false
	default:
		if intRe.MatchString(s) || floatRe.MatchString(s) {
			if f, err := strconv.ParseFloat(s, 64); err == nil {
				return f
			}
		}
		return s
	}
}
