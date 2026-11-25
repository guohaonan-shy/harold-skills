package pr

import (
	"bytes"
	"encoding/json"
	"io"
)

// kv is one key of an object whose keys keep the order they were written in (the old scripts printed
// `{"<name>": "<url>"}` in upload order, and that is what callers read).
type kv struct {
	Key   string
	Value any
}

type ordered []kv

func marshalPlain(v any) ([]byte, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return nil, err
	}
	return bytes.TrimRight(buf.Bytes(), "\n"), nil
}

func (o ordered) MarshalJSON() ([]byte, error) {
	var buf bytes.Buffer
	buf.WriteByte('{')
	for i, p := range o {
		if i > 0 {
			buf.WriteByte(',')
		}
		k, err := marshalPlain(p.Key)
		if err != nil {
			return nil, err
		}
		v, err := marshalPlain(p.Value)
		if err != nil {
			return nil, err
		}
		buf.Write(k)
		buf.WriteByte(':')
		buf.Write(v)
	}
	buf.WriteByte('}')
	return buf.Bytes(), nil
}

// writeJSON prints v indented by two spaces, the way the old scripts printed JSON.stringify(v, null, 2), then a newline.
func writeJSON(w io.Writer, v any) error {
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	return enc.Encode(v)
}
