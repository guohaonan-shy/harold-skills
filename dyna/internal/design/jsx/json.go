package jsx

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/miniyaml"
)

// ParseJSON reads one JSON document the way JSON.parse does, with objects as *miniyaml.Map (keys in the order
// written), arrays as []any, numbers as float64, and null as nil.
func ParseJSON(data []byte) (any, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	v, err := value(dec)
	if err != nil {
		return nil, err
	}
	if _, err := dec.Token(); err != io.EOF {
		if err == nil {
			err = fmt.Errorf("unexpected data after the JSON value")
		}
		return nil, err
	}
	return v, nil
}

func value(dec *json.Decoder) (any, error) {
	tok, err := dec.Token()
	if err != nil {
		if err == io.EOF {
			return nil, fmt.Errorf("Unexpected end of JSON input")
		}
		return nil, err
	}
	d, ok := tok.(json.Delim)
	if !ok {
		return tok, nil
	}
	switch d {
	case '{':
		m := miniyaml.NewMap()
		for dec.More() {
			kt, err := dec.Token()
			if err != nil {
				return nil, err
			}
			k, _ := kt.(string)
			v, err := value(dec)
			if err != nil {
				return nil, err
			}
			m.Set(k, v)
		}
		if _, err := dec.Token(); err != nil {
			return nil, err
		}
		return m, nil
	case '[':
		list := []any{}
		for dec.More() {
			v, err := value(dec)
			if err != nil {
				return nil, err
			}
			list = append(list, v)
		}
		if _, err := dec.Token(); err != nil {
			return nil, err
		}
		return list, nil
	}
	return nil, fmt.Errorf("unexpected %v", d)
}

// Stringify is JSON.stringify(v) for a value ParseJSON made, compact.
func Stringify(v any) string {
	s, err := miniyaml.JSON(v, 0)
	if err != nil {
		return "null"
	}
	return s
}
