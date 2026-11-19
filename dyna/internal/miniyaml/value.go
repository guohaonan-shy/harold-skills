package miniyaml

import (
	"bytes"
	"encoding/json"
	"math"
	"strconv"
	"strings"
)

// The frontmatter is untyped, so the commands that read it test values the way the archive's rules were
// written: "is this a list", "is this text", "is this empty". These helpers say that once.

// AsMap is v as a mapping (false for anything else, a list included).
func AsMap(v any) (*Map, bool) {
	m, ok := v.(*Map)
	return m, ok && m != nil
}

// AsList is v as a list.
func AsList(v any) ([]any, bool) {
	l, ok := v.([]any)
	return l, ok
}

// AsString is v as text.
func AsString(v any) (string, bool) {
	s, ok := v.(string)
	return s, ok
}

// IsInteger says whether v is a whole number.
func IsInteger(v any) bool {
	f, ok := v.(float64)
	return ok && !math.IsInf(f, 0) && f == math.Trunc(f)
}

// Truthy is the "does this hold something" test: null, false, 0 and the empty string do not.
func Truthy(v any) bool {
	switch x := v.(type) {
	case nil:
		return false
	case bool:
		return x
	case float64:
		return x != 0 && !math.IsNaN(x)
	case string:
		return x != ""
	}
	return true
}

// Text is v written as text the way the archive's messages always have: whole numbers without a decimal point,
// null as "null", a list as its items joined with commas, a mapping as "[object Object]".
func Text(v any) string {
	switch x := v.(type) {
	case nil:
		return "null"
	case bool:
		if x {
			return "true"
		}
		return "false"
	case float64:
		return strconv.FormatFloat(x, 'f', -1, 64)
	case string:
		return x
	case []any:
		parts := make([]string, len(x))
		for i, e := range x {
			if e != nil {
				parts[i] = Text(e)
			}
		}
		return strings.Join(parts, ",")
	case *Map:
		return "[object Object]"
	}
	return ""
}

// MarshalJSON writes the mapping with its keys in the order they were written.
func (m *Map) MarshalJSON() ([]byte, error) {
	if m == nil {
		return []byte("null"), nil
	}
	var b bytes.Buffer
	b.WriteByte('{')
	for i, k := range m.keys {
		if i > 0 {
			b.WriteByte(',')
		}
		kb, err := encode(k)
		if err != nil {
			return nil, err
		}
		b.Write(kb)
		b.WriteByte(':')
		vb, err := encode(m.m[k])
		if err != nil {
			return nil, err
		}
		b.Write(vb)
	}
	b.WriteByte('}')
	return b.Bytes(), nil
}

// encode is json.Marshal without escaping <, > and & (the archive's output is read by people).
func encode(v any) ([]byte, error) {
	var b bytes.Buffer
	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return nil, err
	}
	return bytes.TrimRight(b.Bytes(), "\n"), nil
}

// JSON writes any value (a *Map keeps its key order) as JSON; indent > 0 pretty-prints with that many spaces,
// the way `JSON.stringify(value, null, indent)` does. Text is not HTML-escaped.
func JSON(v any, indent int) (string, error) {
	var b bytes.Buffer
	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	if indent > 0 {
		enc.SetIndent("", strings.Repeat(" ", indent))
	}
	if err := enc.Encode(v); err != nil {
		return "", err
	}
	return strings.TrimRight(b.String(), "\n"), nil
}
