package ui

import (
	"bytes"
	"compress/zlib"
	"encoding/binary"
	"errors"
	"hash/crc32"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
)

// result is what one run of the module's command line did.
type result struct {
	out, err string
	code     int
}

// run runs `dyna ui <args>` in memory the way app.Run would: stdout, stderr and the exit code.
func run(d Deps, args ...string) result {
	var out, errb bytes.Buffer
	d.Stdout, d.Stderr = &out, &errb
	c := Command(d)
	c.SetArgs(args)
	c.SetOut(&out)
	c.SetErr(&errb)
	err := c.Execute()
	code := 0
	if err != nil {
		var ex *nexterr.Exit
		if errors.As(err, &ex) {
			code = ex.Code
			if ex.Msg != "" {
				errb.WriteString(ex.Msg + "\n")
			}
		} else {
			code = 1
			errb.WriteString(err.Error() + "\n")
		}
	}
	return result{out.String(), errb.String(), code}
}

func (r result) all() string { return r.out + r.err }

func write(t *testing.T, path, text string) string {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(text), 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

func contains(t *testing.T, text string, wants ...string) {
	t.Helper()
	for _, w := range wants {
		if !strings.Contains(text, w) {
			t.Errorf("no %q in:\n%s", w, text)
		}
	}
}

// ---------- a PNG encoder that applies every scanline filter, so the decoder meets the filters real screenshots use

type pixelFn func(x, y int) [4]byte

type pngSpec struct {
	width, height int
	pixel         pixelFn
	colorType     byte   // 6 RGBA (default), 2 RGB
	filters       []byte // one filter type per row, cycled
}

func paeth(a, b, c int) int {
	p := a + b - c
	abs := func(n int) int {
		if n < 0 {
			return -n
		}
		return n
	}
	pa, pb, pc := abs(p-a), abs(p-b), abs(p-c)
	switch {
	case pa <= pb && pa <= pc:
		return a
	case pb <= pc:
		return b
	}
	return c
}

func chunk(typ string, data []byte) []byte {
	var b bytes.Buffer
	_ = binary.Write(&b, binary.BigEndian, uint32(len(data)))
	body := append([]byte(typ), data...)
	b.Write(body)
	_ = binary.Write(&b, binary.BigEndian, crc32.ChecksumIEEE(body))
	return b.Bytes()
}

func encodePNG(s pngSpec) []byte {
	if s.colorType == 0 {
		s.colorType = 6
	}
	if len(s.filters) == 0 {
		s.filters = []byte{0}
	}
	bpp := 4
	if s.colorType == 2 {
		bpp = 3
	}
	rows := make([][]byte, s.height)
	for y := range rows {
		raw := make([]byte, s.width*bpp)
		for x := 0; x < s.width; x++ {
			p := s.pixel(x, y)
			copy(raw[x*bpp:], p[:bpp])
		}
		rows[y] = raw
	}
	var scan bytes.Buffer
	for y, raw := range rows {
		f := s.filters[y%len(s.filters)]
		prev := make([]byte, len(raw))
		if y > 0 {
			prev = rows[y-1]
		}
		line := make([]byte, len(raw)+1)
		line[0] = f
		for i := range raw {
			a, c := 0, 0
			if i >= bpp {
				a, c = int(raw[i-bpp]), int(prev[i-bpp])
			}
			b := int(prev[i])
			pred := 0
			switch f {
			case 1:
				pred = a
			case 2:
				pred = b
			case 3:
				pred = (a + b) >> 1
			case 4:
				pred = paeth(a, b, c)
			}
			line[i+1] = byte(int(raw[i]) - pred)
		}
		scan.Write(line)
	}
	var z bytes.Buffer
	zw := zlib.NewWriter(&z)
	_, _ = zw.Write(scan.Bytes())
	_ = zw.Close()
	ihdr := make([]byte, 13)
	binary.BigEndian.PutUint32(ihdr[0:], uint32(s.width))
	binary.BigEndian.PutUint32(ihdr[4:], uint32(s.height))
	ihdr[8], ihdr[9] = 8, s.colorType
	var out bytes.Buffer
	out.Write(pngSignature)
	out.Write(chunk("IHDR", ihdr))
	out.Write(chunk("IDAT", z.Bytes()))
	out.Write(chunk("IEND", nil))
	return out.Bytes()
}
