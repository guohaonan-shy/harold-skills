package home

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"strings"
)

// A JSON document that keeps its keys in the order they were written, so rewriting a person's settings.json
// changes only what was asked for (Go's map would sort every key).

type jkind int

const (
	jScalar jkind = iota
	jObject
	jArray
)

type jnode struct {
	kind   jkind
	scalar string // the JSON text of a scalar
	keys   []string
	vals   []*jnode // object values, parallel to keys
	arr    []*jnode
}

func (n *jnode) isObject() bool { return n != nil && n.kind == jObject }

// get is the value under key, or nil.
func (n *jnode) get(key string) *jnode {
	for i, k := range n.keys {
		if k == key {
			return n.vals[i]
		}
	}
	return nil
}

// set replaces the value under key where it stands, or appends the key.
func (n *jnode) set(key string, v *jnode) {
	for i, k := range n.keys {
		if k == key {
			n.vals[i] = v
			return
		}
	}
	n.keys = append(n.keys, key)
	n.vals = append(n.vals, v)
}

func jstring(s string) *jnode { return &jnode{kind: jScalar, scalar: marshalString(s)} }

var jtrue = &jnode{kind: jScalar, scalar: "true"}

func newObject() *jnode { return &jnode{kind: jObject} }

func marshalString(s string) string {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(s)
	return strings.TrimRight(buf.String(), "\n")
}

func parseJSON(data []byte) (*jnode, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	n, err := parseValue(dec)
	if err != nil {
		return nil, err
	}
	if _, err := dec.Token(); err != io.EOF {
		return nil, fmt.Errorf("unexpected data after the top-level value")
	}
	return n, nil
}

func parseValue(dec *json.Decoder) (*jnode, error) {
	tok, err := dec.Token()
	if err != nil {
		return nil, err
	}
	switch t := tok.(type) {
	case json.Delim:
		if t == '{' {
			obj := newObject()
			for dec.More() {
				kt, err := dec.Token()
				if err != nil {
					return nil, err
				}
				v, err := parseValue(dec)
				if err != nil {
					return nil, err
				}
				obj.set(kt.(string), v)
			}
			if _, err := dec.Token(); err != nil {
				return nil, err
			}
			return obj, nil
		}
		arr := &jnode{kind: jArray}
		for dec.More() {
			v, err := parseValue(dec)
			if err != nil {
				return nil, err
			}
			arr.arr = append(arr.arr, v)
		}
		if _, err := dec.Token(); err != nil {
			return nil, err
		}
		return arr, nil
	case string:
		return jstring(t), nil
	case json.Number:
		return &jnode{kind: jScalar, scalar: t.String()}, nil
	case bool:
		if t {
			return &jnode{kind: jScalar, scalar: "true"}, nil
		}
		return &jnode{kind: jScalar, scalar: "false"}, nil
	case nil:
		return &jnode{kind: jScalar, scalar: "null"}, nil
	}
	return nil, fmt.Errorf("unexpected token %v", tok)
}

// encode writes the value as JS `JSON.stringify(value, null, indent)` does; an empty indent is the compact form.
func (n *jnode) encode(sb *strings.Builder, indent string, level int) {
	nl := func(l int) {
		if indent != "" {
			sb.WriteString("\n")
			sb.WriteString(strings.Repeat(indent, l))
		}
	}
	switch n.kind {
	case jScalar:
		sb.WriteString(n.scalar)
	case jObject:
		if len(n.keys) == 0 {
			sb.WriteString("{}")
			return
		}
		sb.WriteString("{")
		for i, k := range n.keys {
			if i > 0 {
				sb.WriteString(",")
			}
			nl(level + 1)
			sb.WriteString(marshalString(k))
			sb.WriteString(":")
			if indent != "" {
				sb.WriteString(" ")
			}
			n.vals[i].encode(sb, indent, level+1)
		}
		nl(level)
		sb.WriteString("}")
	case jArray:
		if len(n.arr) == 0 {
			sb.WriteString("[]")
			return
		}
		sb.WriteString("[")
		for i, v := range n.arr {
			if i > 0 {
				sb.WriteString(",")
			}
			nl(level + 1)
			v.encode(sb, indent, level+1)
		}
		nl(level)
		sb.WriteString("]")
	}
}

func (n *jnode) String(indent string) string {
	var sb strings.Builder
	n.encode(&sb, indent, 0)
	return sb.String()
}
