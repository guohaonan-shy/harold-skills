package seo

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"regexp"
	"strconv"
	"strings"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/jsstr"
)

// The seo commands read JSON the way the old scripts did: files that OpenSEO and other commands wrote, whose
// fields may be missing, null or of another type, and whose keys keep the order they were written in. A value
// read from such a file is one of: nil (null), bool, float64, string, []any, *Obj; undef marks "no such key".

type undefT struct{}

// undef is what a key that is not there reads as (JavaScript's undefined).
var undef = undefT{}

// Obj is a JSON object that remembers the order its keys were written in.
type Obj struct {
	Keys []string
	Vals map[string]any
}

// NewObj is an empty object.
func NewObj() *Obj { return &Obj{Vals: map[string]any{}} }

// Get is the value under key, or undef.
func (o *Obj) Get(key string) any {
	if o == nil {
		return undef
	}
	if v, ok := o.Vals[key]; ok {
		return v
	}
	return undef
}

// Set puts v under key, where the key already stands or at the end.
func (o *Obj) Set(key string, v any) {
	if _, ok := o.Vals[key]; !ok {
		o.Keys = append(o.Keys, key)
	}
	o.Vals[key] = v
}

// MarshalJSON writes the keys in order; a value that is undef is left out, as JSON.stringify leaves it out.
func (o *Obj) MarshalJSON() ([]byte, error) {
	var b bytes.Buffer
	b.WriteByte('{')
	first := true
	for _, k := range o.Keys {
		v := o.Vals[k]
		if v == undef {
			continue
		}
		if !first {
			b.WriteByte(',')
		}
		first = false
		kb, _ := marshalPlain(k)
		vb, err := marshalPlain(v)
		if err != nil {
			return nil, err
		}
		b.Write(kb)
		b.WriteByte(':')
		b.Write(vb)
	}
	b.WriteByte('}')
	return b.Bytes(), nil
}

// marshalPlain is json.Marshal without the HTML escaping, the way JSON.stringify writes.
func marshalPlain(v any) ([]byte, error) {
	var b bytes.Buffer
	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return nil, err
	}
	return bytes.TrimRight(b.Bytes(), "\n"), nil
}

// stringify is JSON.stringify(v).
func stringify(v any) string {
	b, err := marshalPlain(v)
	if err != nil {
		return ""
	}
	return string(b)
}

// dump is JSON.stringify(v, null, 2).
func dump(v any) string {
	var b bytes.Buffer
	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	_ = enc.Encode(v)
	return strings.TrimRight(b.String(), "\n")
}

// ParseJSON is JSON.parse: one value, nothing after it, objects that keep their key order.
func ParseJSON(data []byte) (any, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	v, err := parseValue(dec)
	if err != nil {
		return nil, err
	}
	if _, err := dec.Token(); err != io.EOF {
		return nil, fmt.Errorf("unexpected data after the top-level value")
	}
	return v, nil
}

func parseValue(dec *json.Decoder) (any, error) {
	tok, err := dec.Token()
	if err != nil {
		return nil, err
	}
	switch t := tok.(type) {
	case json.Delim:
		if t == '{' {
			o := NewObj()
			for dec.More() {
				kt, err := dec.Token()
				if err != nil {
					return nil, err
				}
				v, err := parseValue(dec)
				if err != nil {
					return nil, err
				}
				o.Set(kt.(string), v)
			}
			if _, err := dec.Token(); err != nil {
				return nil, err
			}
			return o, nil
		}
		arr := []any{}
		for dec.More() {
			v, err := parseValue(dec)
			if err != nil {
				return nil, err
			}
			arr = append(arr, v)
		}
		if _, err := dec.Token(); err != nil {
			return nil, err
		}
		return arr, nil
	case json.Number:
		f, err := strconv.ParseFloat(string(t), 64)
		if err != nil && !math.IsInf(f, 0) {
			return nil, err
		}
		return f, nil
	case string, bool, nil:
		return t, nil
	}
	return nil, fmt.Errorf("unexpected token %v", tok)
}

// get is v[key] for an object, undef for anything else.
func get(v any, key string) any {
	if o, ok := v.(*Obj); ok {
		return o.Get(key)
	}
	return undef
}

// nullish is `v == null`: null or missing.
func nullish(v any) bool { return v == nil || v == undef }

// orNil is `v ?? null`.
func orNil(v any) any {
	if v == undef {
		return nil
	}
	return v
}

// truthy is JavaScript's truthiness.
func truthy(v any) bool {
	switch t := v.(type) {
	case nil, undefT:
		return false
	case bool:
		return t
	case float64:
		return t != 0 && !math.IsNaN(t)
	case string:
		return t != ""
	}
	return true
}

// numText is a number as JavaScript writes it.
func numText(f float64) string {
	switch {
	case math.IsNaN(f):
		return "NaN"
	case math.IsInf(f, 1):
		return "Infinity"
	case math.IsInf(f, -1):
		return "-Infinity"
	case f == 0:
		return "0"
	}
	abs := math.Abs(f)
	if abs >= 1e-6 && abs < 1e21 {
		return strconv.FormatFloat(f, 'f', -1, 64)
	}
	s := strconv.FormatFloat(f, 'e', -1, 64)
	// Go writes e+21 / e-07; JavaScript writes e+21 / e-7
	mant, exp, _ := strings.Cut(s, "e")
	sign := exp[:1]
	digits := strings.TrimLeft(exp[1:], "0")
	if digits == "" {
		digits = "0"
	}
	return mant + "e" + sign + digits
}

// toString is JavaScript's String(v) for what JSON can hold; undefined and null read as "undefined" and "null".
func toString(v any) string {
	switch t := v.(type) {
	case undefT:
		return "undefined"
	case nil:
		return "null"
	case bool:
		return strconv.FormatBool(t)
	case float64:
		return numText(t)
	case string:
		return t
	case []any:
		parts := make([]string, len(t))
		for i, e := range t {
			if nullish(e) {
				continue
			}
			parts[i] = toString(e)
		}
		return strings.Join(parts, ",")
	case *Obj:
		return "[object Object]"
	}
	return fmt.Sprint(v)
}

// orEmpty is String(v ?? ”).
func orEmpty(v any) string {
	if nullish(v) {
		return ""
	}
	return toString(v)
}

// text is the `text` of the old seo-issues: a string as it is, null as ”, anything else as JSON.
func text(v any) string {
	switch t := v.(type) {
	case nil, undefT:
		return ""
	case string:
		return t
	}
	return stringify(v)
}

// filled is `text(v).trim().length > 0`.
func filled(v any) bool { return jsstr.Trim(text(v)) != "" }

// jsNumber is Number(s) for a string: the empty string is 0, a number may be written the ways JavaScript reads one,
// anything else is NaN.
func jsNumber(s string) float64 {
	s = jsstr.Trim(s)
	if s == "" {
		return 0
	}
	switch s {
	case "Infinity", "+Infinity":
		return math.Inf(1)
	case "-Infinity":
		return math.Inf(-1)
	}
	if decimalRe.MatchString(s) {
		f, err := strconv.ParseFloat(s, 64)
		if err != nil && !math.IsInf(f, 0) {
			return math.NaN()
		}
		return f
	}
	if len(s) > 2 && s[0] == '0' {
		base := 0
		switch s[1] {
		case 'x', 'X':
			base = 16
		case 'o', 'O':
			base = 8
		case 'b', 'B':
			base = 2
		}
		if base != 0 {
			if n, err := strconv.ParseUint(s[2:], base, 64); err == nil {
				return float64(n)
			}
		}
	}
	return math.NaN()
}

var decimalRe = regexp.MustCompile(`^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$`)

func isFinite(f float64) bool { return !math.IsNaN(f) && !math.IsInf(f, 0) }

// number is `Number(s.replace(/,/g, ”))` for a run of digits and commas.
func number(s string) float64 { return jsNumber(strings.ReplaceAll(s, ",", "")) }

// uniqueStrings keeps the first of each string.
func uniqueStrings(in []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, s := range in {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	return out
}

// arrayOf is v as an array: null and missing read as empty, anything that is not an array is the error JavaScript
// would raise when it iterates it.
func arrayOf(v any, what string) ([]any, error) {
	switch t := v.(type) {
	case nil, undefT:
		return []any{}, nil
	case []any:
		return t, nil
	}
	return nil, fmt.Errorf("%s 不是数组", what)
}
