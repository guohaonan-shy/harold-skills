package ui

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/uicompare"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/uiconcurrency"
)

// The UI implementation loop's measurement.
//
// The judge of the loop is this command, not an agent. It opens ONE browser and, per matrix, ONE context with TWO
// tabs (the design canvas, the ported local route), walks the acceptance matrix cell by cell, puts both tabs in
// the same viewport / DPR / color scheme / state, and feeds the two comparators in package uicompare. Everything
// it prints is derived from numbers it measured; nothing here is an opinion.
//
// Several matrices (e.g. language × color scheme) go to ONE invocation: they share the browser, each in its own
// context. How many run at once is picked from the machine's free memory and idle cores, at most 4 (package
// uiconcurrency); --concurrency N overrides it, still capped at 4. Do not start one process per matrix — every
// process is another browser.
//
// Screenshots are decoded here and compared by the unit-tested ComparePixels; they never travel back into a page.

// Matrix is the acceptance matrix file `ui measure` walks.
type Matrix struct {
	Canvas    string     `json:"canvas"`
	Local     string     `json:"local"`
	DPR       *float64   `json:"dpr"`
	Tolerance *Tolerance `json:"tolerance"`
	Cells     []Cell     `json:"cells"`
}

// Tolerance holds the knobs of a matrix or of one cell; what a cell does not set it takes from the matrix.
type Tolerance struct {
	Position  *float64 `json:"position"`
	Antialias *float64 `json:"antialias"`
	Pixel     *float64 `json:"pixel"`
}

// Cell is one state to put both tabs in and compare.
type Cell struct {
	Name        string     `json:"name"`
	Viewport    Viewport   `json:"viewport"`
	ColorScheme string     `json:"colorScheme"`
	State       string     `json:"state"`
	Review      string     `json:"review"`
	Tolerance   *Tolerance `json:"tolerance"`
	ByAnchor    map[string]struct {
		Position *float64 `json:"position"`
	} `json:"byAnchor"`
}

// Viewport is a size in CSS pixels.
type Viewport struct {
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

// MatrixResult is what walking one matrix found.
type MatrixResult struct {
	Findings   []uicompare.Finding
	HumanCells []string
}

// Browser walks matrices. The real one drives Chrome; tests put a stand-in here.
type Browser interface {
	// Walk goes through every cell of the matrix in a context of its own and returns the findings, most severe
	// first.
	Walk(ctx context.Context, m Matrix) (MatrixResult, error)
	Close()
}

// resolve is what a cell compares with: the defaults, then the matrix's knobs, then the cell's own.
func (m Matrix) resolve(c Cell) (position, antialias, pixel float64) {
	position, antialias, pixel = uicompare.DefaultPositionTolerance, uicompare.DefaultAntialiasTolerance, uicompare.DefaultPixelThreshold
	for _, t := range []*Tolerance{m.Tolerance, c.Tolerance} {
		if t == nil {
			continue
		}
		if t.Position != nil {
			position = *t.Position
		}
		if t.Antialias != nil {
			antialias = *t.Antialias
		}
		if t.Pixel != nil {
			pixel = *t.Pixel
		}
	}
	return
}

// DPR is the device pixel ratio of the matrix: 1 unless it says otherwise.
func (m Matrix) dpr() float64 {
	if m.DPR != nil {
		return *m.DPR
	}
	return 1
}

// scheme is the color scheme of a cell: light unless it says otherwise.
func (c Cell) scheme() string {
	if c.ColorScheme == "" {
		return "light"
	}
	return c.ColorScheme
}

// withState puts the cell's state into the URL as ?state=…, keeping the other parameters in their order.
func withState(raw, state string) (string, error) {
	if state == "" {
		return raw, nil
	}
	u, err := url.Parse(raw)
	if err != nil {
		return "", fmt.Errorf("不是网址：%s", raw)
	}
	var pairs []string
	replaced := false
	for _, p := range strings.Split(u.RawQuery, "&") {
		if p == "" {
			continue
		}
		name, value, _ := strings.Cut(p, "=")
		n, _ := url.QueryUnescape(name)
		if n == "state" {
			if !replaced {
				pairs = append(pairs, "state="+formEscape(state))
				replaced = true
			}
			continue
		}
		v, _ := url.QueryUnescape(value)
		pairs = append(pairs, formEscape(n)+"="+formEscape(v))
	}
	if !replaced {
		pairs = append(pairs, "state="+formEscape(state))
	}
	u.RawQuery = strings.Join(pairs, "&")
	if u.Path == "" && u.Opaque == "" && u.Host != "" {
		u.Path = "/"
	}
	return u.String(), nil
}

// formEscape is the application/x-www-form-urlencoded serialization URLSearchParams uses: letters, digits and
// *-._ stay, a space is +, everything else is %XX.
func formEscape(s string) string {
	var b strings.Builder
	for _, c := range []byte(s) {
		switch {
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9', c == '*', c == '-', c == '.', c == '_':
			b.WriteByte(c)
		case c == ' ':
			b.WriteByte('+')
		default:
			fmt.Fprintf(&b, "%%%02X", c)
		}
	}
	return b.String()
}

// fingerprint is the identity of a finding for 瓶颈 (bottleneck) detection — the defect, not its numbers.
func fingerprint(f uicompare.Finding) string {
	s := func(p *string) string {
		if p == nil {
			return "null"
		}
		return *p
	}
	return fmt.Sprintf("%s|%s|%s|%s", s(f.Cell), f.ID, s(f.Anchor), s(f.Property))
}

// memoPath is where a matrix remembers last round's fingerprints. `matrix.json` keeps the historical
// `.ui-measure-last.json`; any other name gets its own file so two matrices in one directory never read each
// other's round.
func memoPath(matrix string) (string, error) {
	abs, err := filepath.Abs(matrix)
	if err != nil {
		return "", err
	}
	name := filepath.Base(abs)
	stem := regexp.MustCompile(`(?i)\.json$`).ReplaceAllString(name, "")
	memo := ".ui-measure-last." + stem + ".json"
	if name == "matrix.json" {
		memo = ".ui-measure-last.json"
	}
	return filepath.Join(filepath.Dir(abs), memo), nil
}

type reportBody struct {
	Findings         []uicompare.Finding `json:"findings"`
	Bottleneck       bool                `json:"瓶颈"`
	HumanReviewCells []string            `json:"humanReviewCells"`
}

type matrixReport struct {
	Matrix string `json:"matrix"`
	reportBody
}

func writeJSON(w io.Writer, v any) error {
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	return enc.Encode(v)
}

// measureOptions is what the command line says.
type measureOptions struct {
	Paths     []string
	JSON      bool
	Requested *int
}

// Measure walks every matrix and prints the findings: exit 0 when green (or only human-review cells are left),
// exit 2 when there are findings.
func (d Deps) measure(ctx context.Context, o measureOptions) error {
	memos := make([]string, len(o.Paths))
	seen := map[string]bool{}
	for i, p := range o.Paths {
		m, err := memoPath(p)
		if err != nil {
			return err
		}
		memos[i] = m
		if seen[m] {
			return &nexterr.Exit{Code: 1, Msg: "ui-measure: the same matrix was given twice"}
		}
		seen[m] = true
	}
	matrices := make([]Matrix, len(o.Paths))
	for i, p := range o.Paths {
		raw, err := os.ReadFile(p)
		if err != nil {
			return &nexterr.Exit{Code: 1, Msg: fmt.Sprintf("ui-measure: 读不了矩阵文件 %s：%v", p, err)}
		}
		if err := json.Unmarshal(raw, &matrices[i]); err != nil {
			return &nexterr.Exit{Code: 1, Msg: fmt.Sprintf("ui-measure: %s 不是矩阵：%v", p, err)}
		}
	}

	concurrency, reason := d.concurrency(len(matrices), o.Requested)
	fmt.Fprintf(d.errOut(), "ui-measure: 同时跑 %d 份矩阵（%s）\n", concurrency, reason)

	browser, err := d.browser(ctx)
	if err != nil {
		return &nexterr.Exit{Code: 1, Msg: "ui-measure: " + err.Error()}
	}
	runs, err := mapLimit(ctx, matrices, concurrency, browser.Walk)
	browser.Close()
	if err != nil {
		return &nexterr.Exit{Code: 1, Msg: "ui-measure: " + err.Error()}
	}

	reports := make([]matrixReport, len(runs))
	for i, run := range runs {
		// Plateau is mechanical: the same defects, cell for cell, two runs running.
		current := make([]string, len(run.Findings))
		for j, f := range run.Findings {
			current[j] = fingerprint(f)
		}
		var previous []string
		havePrevious := false
		if raw, err := os.ReadFile(memos[i]); err == nil {
			havePrevious = json.Unmarshal(raw, &previous) == nil
		}
		bottleneck := havePrevious && len(run.Findings) > 0 && equalStrings(previous, current)
		var memo bytes.Buffer
		if err := writeJSON(&memo, current); err != nil {
			return err
		}
		if err := os.WriteFile(memos[i], bytes.TrimRight(memo.Bytes(), "\n"), 0o644); err != nil {
			return err
		}
		findings, human := run.Findings, run.HumanCells
		if findings == nil {
			findings = []uicompare.Finding{}
		}
		if human == nil {
			human = []string{}
		}
		reports[i] = matrixReport{Matrix: o.Paths[i], reportBody: reportBody{Findings: findings, Bottleneck: bottleneck, HumanReviewCells: human}}
	}

	single := len(reports) == 1
	out := d.out()
	if o.JSON {
		// One matrix keeps the historical shape; several are wrapped, one entry per matrix.
		if single {
			if err := writeJSON(out, reports[0].reportBody); err != nil {
				return err
			}
		} else if err := writeJSON(out, map[string]any{"matrices": reports}); err != nil {
			return err
		}
	} else {
		for _, r := range reports {
			if !single {
				fmt.Fprintf(out, "\n== %s\n", r.Matrix)
			}
			fmt.Fprintln(out, uicompare.RenderFindings(r.Findings))
			if r.Bottleneck {
				fmt.Fprintln(out, "\n瓶颈：同一批 finding 连续两轮不变。停下，交给人。")
			}
			if len(r.HumanReviewCells) > 0 {
				fmt.Fprintf(out, "\nHUMAN REVIEW (not green, not checked): %s\n", strings.Join(r.HumanReviewCells, ", "))
			}
		}
	}
	for _, r := range reports {
		if len(r.Findings) > 0 {
			return &nexterr.Exit{Code: 2}
		}
	}
	return nil
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// concurrency is how many matrices to walk at once, and why. A single matrix is one at a time whatever the
// machine says, so the machine is not sampled for it.
func (d Deps) concurrency(matrices int, requested *int) (int, string) {
	if requested == nil && matrices <= 1 {
		return 1, "只有 1 份矩阵"
	}
	in := uiconcurrency.Input{Matrices: matrices, Requested: requested}
	if requested == nil {
		in.CPUs, in.IdleCores, in.AvailableBytes = d.machine()
	}
	return uiconcurrency.Pick(in)
}

// mapLimit runs task over items, at most limit at a time, results in input order. The first error stops the rest.
func mapLimit[T, R any](ctx context.Context, items []T, limit int, task func(context.Context, T) (R, error)) ([]R, error) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	results := make([]R, len(items))
	var (
		mu       sync.Mutex
		next     int
		firstErr error
		wg       sync.WaitGroup
	)
	for w := 0; w < min(limit, len(items)); w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				mu.Lock()
				i := next
				next++
				mu.Unlock()
				if i >= len(items) || ctx.Err() != nil {
					return
				}
				r, err := task(ctx, items[i])
				if err != nil {
					mu.Lock()
					if firstErr == nil {
						firstErr = err
					}
					mu.Unlock()
					cancel()
					return
				}
				results[i] = r
			}
		}()
	}
	wg.Wait()
	if firstErr != nil {
		return nil, firstErr
	}
	if err := ctx.Err(); err != nil { // the caller gave up (Ctrl-C): the results are not whole
		return nil, err
	}
	return results, nil
}
