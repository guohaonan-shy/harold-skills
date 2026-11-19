package sections

import (
	"fmt"
	"math"
	"strconv"
	"strings"
	"unicode/utf16"
	"unicode/utf8"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/miniyaml"
)

// The measurement, the attribution and the configs are loosely shaped data that flows straight through to the
// output, so this package keeps them as the values they were read as (nil, bool, float64, string, []any, *Map)
// and says "absent" with Undefined, which is what leaves a key out of the printed JSON.

// Obj is an ordered mapping.
type Obj = *miniyaml.Map

type undefinedT struct{}

// Undefined is a value that is not there: reading a key that is missing gives it, and printing skips it.
var Undefined any = undefinedT{}

func isUndef(v any) bool { _, ok := v.(undefinedT); return ok }

// O builds an ordered mapping from key, value pairs.
func O(kv ...any) Obj {
	m := miniyaml.NewMap()
	for i := 0; i+1 < len(kv); i += 2 {
		m.Set(kv[i].(string), kv[i+1])
	}
	return m
}

// get reads a key; anything that is not a mapping, or a missing key, is Undefined (so a chain of reads never panics).
func get(v any, key string) any {
	m, ok := v.(*miniyaml.Map)
	if !ok || m == nil || !m.Has(key) {
		return Undefined
	}
	return m.Get(key)
}

// nullish is `v == null` (null or absent).
func nullish(v any) bool { return v == nil || isUndef(v) }

// or is `v ?? def`.
func or(v, def any) any {
	if nullish(v) {
		return def
	}
	return v
}

// nul is `v ?? null`.
func nul(v any) any { return or(v, nil) }

// truthy is JS truthiness.
func truthy(v any) bool {
	if isUndef(v) {
		return false
	}
	return miniyaml.Truthy(v)
}

// num is the number a value stands for in a comparison (NaN for what is not one).
func num(v any) float64 {
	switch x := v.(type) {
	case float64:
		return x
	case int:
		return float64(x)
	case bool:
		if x {
			return 1
		}
		return 0
	case nil:
		return 0
	case string:
		s := strings.TrimSpace(x)
		if s == "" {
			return 0
		}
		if f, err := strconv.ParseFloat(s, 64); err == nil {
			return f
		}
	}
	return math.NaN()
}

// jsRound is Math.round: halves go up.
func jsRound(x float64) float64 {
	if math.IsNaN(x) || math.IsInf(x, 0) {
		return x
	}
	return math.Floor(x + 0.5)
}

// text is String(v) / the value inside a template string.
func text(v any) string {
	if isUndef(v) {
		return "undefined"
	}
	return miniyaml.Text(v)
}

// strictEq is `a === b` for the values this package holds.
func strictEq(a, b any) bool {
	if isUndef(a) || isUndef(b) {
		return isUndef(a) && isUndef(b)
	}
	switch x := a.(type) {
	case float64:
		y, ok := b.(float64)
		return ok && x == y
	case string:
		y, ok := b.(string)
		return ok && x == y
	case bool:
		y, ok := b.(bool)
		return ok && x == y
	case nil:
		return b == nil
	}
	return false
}

// list is the elements of an array value (nil for anything else).
func list(v any) []any {
	l, _ := v.([]any)
	return l
}

// at is `arr[i]` for an array value and a number index (Undefined when there is no such element).
func at(arr any, i any) any {
	l, ok := arr.([]any)
	f, isNum := i.(float64)
	if !ok || !isNum || f < 0 || f != math.Floor(f) || int(f) >= len(l) {
		return Undefined
	}
	return l[int(f)]
}

// ---------- JSON.stringify ----------

func quote(s string) string {
	var b strings.Builder
	b.WriteByte('"')
	for _, r := range s {
		switch r {
		case '"':
			b.WriteString(`\"`)
		case '\\':
			b.WriteString(`\\`)
		case '\b':
			b.WriteString(`\b`)
		case '\f':
			b.WriteString(`\f`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		default:
			if r < 0x20 {
				fmt.Fprintf(&b, `\u%04x`, r)
			} else {
				b.WriteRune(r)
			}
		}
	}
	b.WriteByte('"')
	return b.String()
}

func number(f float64) string {
	if math.IsNaN(f) || math.IsInf(f, 0) {
		return "null"
	}
	if f == 0 {
		return "0"
	}
	a := math.Abs(f)
	if a >= 1e-6 && a < 1e21 {
		return strconv.FormatFloat(f, 'f', -1, 64)
	}
	s := strconv.FormatFloat(f, 'e', -1, 64)
	mant, exp, _ := strings.Cut(s, "e")
	sign := exp[:1]
	digits := strings.TrimLeft(exp[1:], "0")
	if digits == "" {
		digits = "0"
	}
	return mant + "e" + sign + digits
}

// stringify is JSON.stringify(v) (indent 0) or JSON.stringify(v, null, indent): keys in the order they were set,
// undefined entries left out.
func stringify(v any, indent int) string {
	var b strings.Builder
	writeJSON(&b, v, indent, 0)
	return b.String()
}

func writeJSON(b *strings.Builder, v any, indent, depth int) {
	nl := func(d int) {
		if indent > 0 {
			b.WriteByte('\n')
			b.WriteString(strings.Repeat(" ", indent*d))
		}
	}
	switch x := v.(type) {
	case nil:
		b.WriteString("null")
	case undefinedT:
		b.WriteString("null")
	case bool:
		b.WriteString(strconv.FormatBool(x))
	case float64:
		b.WriteString(number(x))
	case int:
		b.WriteString(strconv.Itoa(x))
	case string:
		b.WriteString(quote(x))
	case []any:
		if len(x) == 0 {
			b.WriteString("[]")
			return
		}
		b.WriteByte('[')
		for i, e := range x {
			if i > 0 {
				b.WriteByte(',')
			}
			nl(depth + 1)
			writeJSON(b, e, indent, depth+1)
		}
		nl(depth)
		b.WriteByte(']')
	case *miniyaml.Map:
		var keys []string
		for _, k := range x.Keys() {
			if !isUndef(x.Get(k)) {
				keys = append(keys, k)
			}
		}
		if len(keys) == 0 {
			b.WriteString("{}")
			return
		}
		b.WriteByte('{')
		for i, k := range keys {
			if i > 0 {
				b.WriteByte(',')
			}
			nl(depth + 1)
			b.WriteString(quote(k))
			b.WriteByte(':')
			if indent > 0 {
				b.WriteByte(' ')
			}
			writeJSON(b, x.Get(k), indent, depth+1)
		}
		nl(depth)
		b.WriteByte('}')
	default:
		b.WriteString("null")
	}
}

// stringifyElem is JSON.stringify of a value that may be undefined (then "undefined", as an interpolated value shows it).
func stringifyOrUndefined(v any) string {
	if isUndef(v) {
		return "undefined"
	}
	return stringify(v, 0)
}

// ---------- JSON.parse ----------

type jsonParser struct {
	s string
	i int
}

type jsonError struct{ msg string }

func (e *jsonError) Error() string { return e.msg }

// parseJSON is JSON.parse: objects keep their key order.
func parseJSON(s string) (v any, err error) {
	p := &jsonParser{s: s}
	defer func() {
		if r := recover(); r != nil {
			if je, ok := r.(*jsonError); ok {
				v, err = nil, je
				return
			}
			panic(r)
		}
	}()
	p.ws()
	v = p.value()
	p.ws()
	if p.i < len(p.s) {
		p.fail()
	}
	return v, nil
}

func (p *jsonParser) fail() {
	if p.i >= len(p.s) {
		panic(&jsonError{"Unexpected end of JSON input"})
	}
	r, _ := utf8.DecodeRuneInString(p.s[p.i:])
	panic(&jsonError{fmt.Sprintf("Unexpected token %c in JSON at position %d", r, p.i)})
}

func (p *jsonParser) ws() {
	for p.i < len(p.s) && (p.s[p.i] == ' ' || p.s[p.i] == '\t' || p.s[p.i] == '\n' || p.s[p.i] == '\r') {
		p.i++
	}
}

func (p *jsonParser) value() any {
	if p.i >= len(p.s) {
		p.fail()
	}
	switch c := p.s[p.i]; {
	case c == '{':
		return p.object()
	case c == '[':
		return p.array()
	case c == '"':
		return p.str()
	case c == 't':
		return p.lit("true", true)
	case c == 'f':
		return p.lit("false", false)
	case c == 'n':
		return p.lit("null", nil)
	case c == '-' || (c >= '0' && c <= '9'):
		return p.number()
	}
	p.fail()
	return nil
}

func (p *jsonParser) lit(word string, v any) any {
	if !strings.HasPrefix(p.s[p.i:], word) {
		p.fail()
	}
	p.i += len(word)
	return v
}

func (p *jsonParser) number() any {
	start := p.i
	if p.s[p.i] == '-' {
		p.i++
	}
	digits := func() int {
		n := 0
		for p.i < len(p.s) && p.s[p.i] >= '0' && p.s[p.i] <= '9' {
			p.i++
			n++
		}
		return n
	}
	if p.i < len(p.s) && p.s[p.i] == '0' {
		p.i++
	} else if digits() == 0 {
		p.fail()
	}
	if p.i < len(p.s) && p.s[p.i] == '.' {
		p.i++
		if digits() == 0 {
			p.fail()
		}
	}
	if p.i < len(p.s) && (p.s[p.i] == 'e' || p.s[p.i] == 'E') {
		p.i++
		if p.i < len(p.s) && (p.s[p.i] == '+' || p.s[p.i] == '-') {
			p.i++
		}
		if digits() == 0 {
			p.fail()
		}
	}
	f, err := strconv.ParseFloat(p.s[start:p.i], 64)
	if err != nil && !math.IsInf(f, 0) {
		p.fail()
	}
	return f
}

func (p *jsonParser) str() string {
	p.i++ // opening quote
	var b strings.Builder
	for {
		if p.i >= len(p.s) {
			panic(&jsonError{"Unterminated string in JSON at position " + strconv.Itoa(p.i)})
		}
		c := p.s[p.i]
		switch {
		case c == '"':
			p.i++
			return b.String()
		case c == '\\':
			p.i++
			if p.i >= len(p.s) {
				p.fail()
			}
			e := p.s[p.i]
			p.i++
			switch e {
			case '"', '\\', '/':
				b.WriteByte(e)
			case 'b':
				b.WriteByte('\b')
			case 'f':
				b.WriteByte('\f')
			case 'n':
				b.WriteByte('\n')
			case 'r':
				b.WriteByte('\r')
			case 't':
				b.WriteByte('\t')
			case 'u':
				r := p.hex4()
				if utf16.IsSurrogate(r) && strings.HasPrefix(p.s[p.i:], `\u`) {
					save := p.i
					p.i += 2
					r2 := p.hex4()
					if d := utf16.DecodeRune(r, r2); d != utf8.RuneError {
						b.WriteRune(d)
						continue
					}
					p.i = save
				}
				b.WriteRune(r)
			default:
				p.i--
				p.fail()
			}
		case c < 0x20:
			p.fail()
		default:
			b.WriteByte(c)
			p.i++
		}
	}
}

func (p *jsonParser) hex4() rune {
	if p.i+4 > len(p.s) {
		p.fail()
	}
	n, err := strconv.ParseUint(p.s[p.i:p.i+4], 16, 32)
	if err != nil {
		p.fail()
	}
	p.i += 4
	return rune(n)
}

func (p *jsonParser) array() any {
	p.i++
	out := []any{}
	p.ws()
	if p.i < len(p.s) && p.s[p.i] == ']' {
		p.i++
		return out
	}
	for {
		p.ws()
		out = append(out, p.value())
		p.ws()
		if p.i >= len(p.s) {
			p.fail()
		}
		if p.s[p.i] == ',' {
			p.i++
			continue
		}
		if p.s[p.i] == ']' {
			p.i++
			return out
		}
		p.fail()
	}
}

func (p *jsonParser) object() any {
	p.i++
	out := miniyaml.NewMap()
	p.ws()
	if p.i < len(p.s) && p.s[p.i] == '}' {
		p.i++
		return out
	}
	for {
		p.ws()
		if p.i >= len(p.s) || p.s[p.i] != '"' {
			p.fail()
		}
		k := p.str()
		p.ws()
		if p.i >= len(p.s) || p.s[p.i] != ':' {
			p.fail()
		}
		p.i++
		p.ws()
		out.Set(k, p.value())
		p.ws()
		if p.i >= len(p.s) {
			p.fail()
		}
		if p.s[p.i] == ',' {
			p.i++
			continue
		}
		if p.s[p.i] == '}' {
			p.i++
			return out
		}
		p.fail()
	}
}

var nanValue = math.NaN()
