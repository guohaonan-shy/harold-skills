package ui

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"image"
	"image/png"
	"strings"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/jsnum"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/uicompare"
)

var pngSignature = []byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a}

// pngError is a picture that cannot be compared: not a PNG, a format this does not read, a Git LFS pointer. The
// command ends with exit code 2 and the reason.
type pngError struct{ msg string }

func (e *pngError) Error() string { return e.msg }

func pngErr(format string, a ...any) error { return &pngError{fmt.Sprintf(format, a...)} }

// DecodePNG reads the bytes of a PNG screenshot: 8-bit RGB or RGBA, not interlaced, which is what screenshots
// are. name says which picture it is when the reason is printed.
func DecodePNG(data []byte, name string) (uicompare.Image, error) {
	head := data
	if len(head) > 40 {
		head = head[:40]
	}
	if strings.HasPrefix(string(head), "version https://git-lfs") {
		return uicompare.Image{}, pngErr("%s 是 Git LFS 指针，不是图：先 git lfs pull 把档案里的素材取下来", name)
	}
	if len(data) < 8 || !bytes.Equal(data[:8], pngSignature) {
		return uicompare.Image{}, pngErr("%s 不是 PNG", name)
	}
	// the header chunk, read by hand: image/png also reads palettes, 16 bits and interlacing, and those are not
	// something the loop's screenshots are, so they are refused rather than compared
	var width, height, depth, colorType, interlace int
	found := false
	for pos := 8; pos+8 <= len(data); {
		n := int(binary.BigEndian.Uint32(data[pos:]))
		typ := string(data[pos+4 : pos+8])
		if typ == "IHDR" && pos+8+13 <= len(data) {
			b := data[pos+8:]
			width, height = int(binary.BigEndian.Uint32(b)), int(binary.BigEndian.Uint32(b[4:]))
			depth, colorType, interlace = int(b[8]), int(b[9]), int(b[12])
			found = true
			break
		}
		if typ == "IEND" {
			break
		}
		pos += 12 + n
	}
	if !found {
		return uicompare.Image{}, pngErr("%s 没有 IHDR", name)
	}
	if depth != 8 || interlace != 0 || (colorType != 2 && colorType != 6) {
		return uicompare.Image{}, pngErr("%s 的格式不支持（只支持 8 位 RGB / RGBA、不隔行）：位深 %d、颜色类型 %d、隔行 %d", name, depth, colorType, interlace)
	}
	img, err := png.Decode(bytes.NewReader(data))
	if err != nil {
		return uicompare.Image{}, pngErr("%s 的像素数据读不出来：%v", name, err)
	}
	out := uicompare.Image{Width: width, Height: height, Data: make([]byte, width*height*4)}
	switch im := img.(type) {
	case *image.NRGBA: // RGBA with straight (not premultiplied) alpha, which is what the comparators read
		for y := 0; y < height; y++ {
			copy(out.Data[y*width*4:(y+1)*width*4], im.Pix[y*im.Stride:y*im.Stride+width*4])
		}
	case *image.RGBA: // RGB: opaque, so premultiplied and straight are the same
		for y := 0; y < height; y++ {
			copy(out.Data[y*width*4:(y+1)*width*4], im.Pix[y*im.Stride:y*im.Stride+width*4])
		}
	default:
		return uicompare.Image{}, pngErr("%s 的格式不支持（只支持 8 位 RGB / RGBA、不隔行）", name)
	}
	return out, nil
}

// PNGResult is the verdict of comparing two screenshots of the same state.
type PNGResult struct {
	Within    bool     `json:"within"`
	Percent   *float64 `json:"percent"`
	Threshold float64  `json:"threshold"`
	Antialias float64  `json:"antialias"`
	Reason    string   `json:"reason"`
}

// ComparePNGs compares the picture the archive holds with a fresh one under the UI loop's own tolerances.
// Within tolerance means "same state, do not re-shoot" — the main way the archive's Git LFS growth is kept down.
// A different size is out of tolerance (the viewport changed or the page got taller), never an error.
func ComparePNGs(archive, fresh []byte, antialias, pixel float64) (PNGResult, error) {
	a, err := DecodePNG(archive, "档案里的图")
	if err != nil {
		return PNGResult{}, err
	}
	b, err := DecodePNG(fresh, "新拍的图")
	if err != nil {
		return PNGResult{}, err
	}
	if a.Width != b.Width || a.Height != b.Height {
		return PNGResult{
			Threshold: pixel, Antialias: antialias,
			Reason: fmt.Sprintf("尺寸不同：档案里 %d×%d，新拍的 %d×%d（视口或页面高度变了）", a.Width, a.Height, b.Width, b.Height),
		}, nil
	}
	percent, err := uicompare.ComparePixels(a, b, antialias)
	if err != nil {
		return PNGResult{}, err
	}
	within := percent <= pixel
	reason := fmt.Sprintf("超出容差：像素差 %s%%，上限 %s%%", jsnum.ToFixed(percent, 2), jsnum.Format(pixel))
	if within {
		reason = fmt.Sprintf("一致：像素差 %s%%，在 %s%% 以内", jsnum.ToFixed(percent, 2), jsnum.Format(pixel))
	}
	return PNGResult{Within: within, Percent: &percent, Threshold: pixel, Antialias: antialias, Reason: reason}, nil
}
