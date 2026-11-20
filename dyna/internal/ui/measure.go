package ui

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
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

// Matrix is the acceptance matrix file `ui measure` walks. Two kinds, picked by the matrix itself (several of either
// kind can go to one invocation):
//   - default: `canvas` vs `local`, cell by cell, findings with severities. Either side may be an implementation route
//     or a canvas address (a version of a canvas), so two canvases compare the same way. A cell may carry
//     `shotAnchor` to compare only that anchor's area instead of the viewport.
//   - `"mode": "canvas-diff"`: `before` vs `after` (two versions of one canvas), the list of anchors that changed,
//     each with the two area screenshots, and — if the matrix has a `changeSet` — split into declared / undeclared.
//     The decisions live in canvasdiff.go.
type Matrix struct {
	Mode      string     `json:"mode"`
	Canvas    string     `json:"canvas"`
	Local     string     `json:"local"`
	DPR       *float64   `json:"dpr"`
	Tolerance *Tolerance `json:"tolerance"`
	Cells     []Cell     `json:"cells"`

	// canvas-diff only
	Before    string          `json:"before"`
	After     string          `json:"after"`
	ChangeSet json.RawMessage `json:"changeSet"`
	ShotsDir  *string         `json:"shotsDir"`
}

// Tolerance holds the knobs of a matrix or of one cell; what a cell does not set it takes from the matrix.
type Tolerance struct {
	Position  *float64 `json:"position"`
	Antialias *float64 `json:"antialias"`
	Pixel     *float64 `json:"pixel"`
}

// Cell is one state to put both tabs in and compare.
type Cell struct {
	Name        string   `json:"name"`
	Viewport    Viewport `json:"viewport"`
	ColorScheme string   `json:"colorScheme"`
	State       string   `json:"state"`
	Review      string   `json:"review"`
	ShotAnchor  string   `json:"shotAnchor"`
	// ReducedMotion puts both tabs under this prefers-reduced-motion ("reduce" or "no-preference"), written like
	// colorScheme; not written, there is no emulation.
	ReducedMotion json.RawMessage `json:"reducedMotion"`
	Tolerance     *Tolerance      `json:"tolerance"`
	ByAnchor      map[string]struct {
		Position *float64 `json:"position"`
	} `json:"byAnchor"`
}

// Viewport is a size in CSS pixels.
type Viewport struct {
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

// DiffRun is what comparing two versions of a canvas found: the changed anchors (with their area screenshots written
// to the shots directory), the states some cell compared, and the cells left to a human.
type DiffRun struct {
	Changed    []Change
	States     []string
	HumanCells []string
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
	// Diff compares the two versions of a canvas-diff matrix cell by cell, writing each changed anchor's two area
	// screenshots into shotsDir.
	Diff(ctx context.Context, m Matrix, shotsDir string) (DiffRun, error)
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

// resolveDiff is what a canvas-diff cell compares with: like resolve, except that any pixel that visibly differs is a
// change (two versions of a canvas have no rendering differences) unless the matrix or the cell says otherwise.
func (m Matrix) resolveDiff(c Cell) (position, antialias, pixel float64) {
	position, antialias, pixel = uicompare.DefaultPositionTolerance, uicompare.DefaultAntialiasTolerance, 0
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

func (m Matrix) isDiff() bool { return m.Mode == ModeCanvasDiff }

// checkCanvasDiff finds a canvas-diff matrix's input errors before any browser starts, and returns its change set
// (nil when the matrix has none: the changes are then not classified).
func (m Matrix) checkCanvasDiff() ([]ChangeEntry, bool, error) {
	if m.Before == "" || m.After == "" {
		return nil, false, errors.New(`a canvas-diff matrix needs "before" and "after" (the two canvas addresses)`)
	}
	if m.ChangeSet == nil {
		return nil, false, nil
	}
	set, err := ParseChangeSet(m.ChangeSet)
	return set, err == nil, err
}

// DPR is the device pixel ratio of the matrix: 1 unless it says otherwise.
func (m Matrix) dpr() float64 {
	if m.DPR != nil {
		return *m.DPR
	}
	return 1
}

// scheme is the color scheme of a cell: light unless it says otherwise.
// reducedMotion is the cell's prefers-reduced-motion, "" when it has none (no emulation). Call checkReducedMotion first.
func (c Cell) reducedMotion() string {
	var v string
	_ = json.Unmarshal(c.ReducedMotion, &v)
	return v
}

// checkReducedMotion refuses a reducedMotion that is not "reduce" or "no-preference".
func (c Cell) checkReducedMotion() error {
	if len(c.ReducedMotion) == 0 {
		return nil
	}
	var v string
	if json.Unmarshal(c.ReducedMotion, &v) == nil && (v == "reduce" || v == "no-preference") {
		return nil
	}
	var compact bytes.Buffer
	if json.Compact(&compact, c.ReducedMotion) != nil {
		compact.Reset()
		compact.Write(c.ReducedMotion)
	}
	return fmt.Errorf("cell \"%s\": reducedMotion must be \"reduce\" or \"no-preference\", got %s", c.Name, compact.String())
}

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

// diffBody is a canvas-diff matrix's report, in the order the JSON keys are written.
type diffBody struct {
	Mode       string `json:"mode"`
	Classified bool   `json:"classified"`
	DiffReport
	HumanReviewCells []string `json:"humanReviewCells"`
}

type diffMatrixReport struct {
	Matrix string `json:"matrix"`
	diffBody
}

// report is one matrix's report, of either kind.
type report struct {
	path      string
	diff      *diffBody
	plain     *reportBody
	shotsDir  string
	attention bool
}

func (r report) json(withMatrix bool) any {
	switch {
	case r.diff != nil && withMatrix:
		return diffMatrixReport{Matrix: r.path, diffBody: *r.diff}
	case r.diff != nil:
		return *r.diff
	case withMatrix:
		return matrixReport{Matrix: r.path, reportBody: *r.plain}
	}
	return *r.plain
}

// matrixRun is one matrix walked: the result of whichever kind it is.
type matrixRun struct {
	walk MatrixResult
	diff DiffRun
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

	changeSets := make([][]ChangeEntry, len(matrices))
	classified := make([]bool, len(matrices))
	for i, m := range matrices {
		if !m.isDiff() {
			continue
		}
		set, ok, err := m.checkCanvasDiff()
		if err != nil {
			return &nexterr.Exit{Code: 1, Msg: "ui-measure: " + err.Error()}
		}
		changeSets[i], classified[i] = set, ok
	}

	concurrency, reason := d.concurrency(len(matrices), o.Requested)
	fmt.Fprintf(d.errOut(), "ui-measure: 同时跑 %d 份矩阵（%s）\n", concurrency, reason)

	browser, err := d.browser(ctx)
	if err != nil {
		return &nexterr.Exit{Code: 1, Msg: "ui-measure: " + err.Error()}
	}
	indexes := make([]int, len(matrices))
	for i := range indexes {
		indexes[i] = i
	}
	runs, err := mapLimit(ctx, indexes, concurrency, func(ctx context.Context, i int) (matrixRun, error) {
		m := matrices[i]
		if !m.isDiff() {
			w, err := browser.Walk(ctx, m)
			return matrixRun{walk: w}, err
		}
		dr, err := browser.Diff(ctx, m, shotsDirOf(o.Paths[i], m))
		return matrixRun{diff: dr}, err
	})
	browser.Close()
	if err != nil {
		return &nexterr.Exit{Code: 1, Msg: "ui-measure: " + err.Error()}
	}

	reports := make([]report, len(runs))
	for i, r := range runs {
		human := r.walk.HumanCells
		if matrices[i].isDiff() {
			// No 瓶颈 here: two canvas versions are compared once per change, not iterated to green.
			human = r.diff.HumanCells
			if human == nil {
				human = []string{}
			}
			changed := r.diff.Changed
			if changed == nil {
				changed = []Change{}
			}
			cls := Classified{Declared: []Change{}, Undeclared: []Change{}, DeclaredUnchanged: []Declaration{}, Unchecked: []Declaration{}}
			if classified[i] {
				cls = ClassifyChanges(changed, changeSets[i], r.diff.States)
			}
			body := diffBody{Mode: ModeCanvasDiff, Classified: classified[i], DiffReport: DiffReport{Changed: changed, Classified: cls}, HumanReviewCells: human}
			reports[i] = report{path: o.Paths[i], diff: &body, shotsDir: shotsDirOf(o.Paths[i], matrices[i]), attention: HasAttention(body.DiffReport, classified[i])}
			continue
		}
		// Plateau is mechanical: the same defects, cell for cell, two runs running.
		current := make([]string, len(r.walk.Findings))
		for j, f := range r.walk.Findings {
			current[j] = fingerprint(f)
		}
		var previous []string
		havePrevious := false
		if raw, err := os.ReadFile(memos[i]); err == nil {
			havePrevious = json.Unmarshal(raw, &previous) == nil
		}
		bottleneck := havePrevious && len(r.walk.Findings) > 0 && equalStrings(previous, current)
		var memo bytes.Buffer
		if err := writeJSON(&memo, current); err != nil {
			return err
		}
		if err := os.WriteFile(memos[i], bytes.TrimRight(memo.Bytes(), "\n"), 0o644); err != nil {
			return err
		}
		findings := r.walk.Findings
		if findings == nil {
			findings = []uicompare.Finding{}
		}
		if human == nil {
			human = []string{}
		}
		reports[i] = report{path: o.Paths[i], plain: &reportBody{Findings: findings, Bottleneck: bottleneck, HumanReviewCells: human}, attention: len(findings) > 0}
	}

	single := len(reports) == 1
	out := d.out()
	if o.JSON {
		// One matrix keeps the historical shape; several are wrapped, one entry per matrix.
		if single {
			if err := writeJSON(out, reports[0].json(false)); err != nil {
				return err
			}
		} else {
			all := make([]any, len(reports))
			for i, r := range reports {
				all[i] = r.json(true)
			}
			if err := writeJSON(out, map[string]any{"matrices": all}); err != nil {
				return err
			}
		}
	} else {
		for _, r := range reports {
			if !single {
				fmt.Fprintf(out, "\n== %s\n", r.path)
			}
			if r.diff != nil {
				fmt.Fprintln(out, RenderCanvasDiff(r.diff.DiffReport, r.diff.Classified))
				for _, c := range r.diff.Changed {
					if c.Shots != nil {
						fmt.Fprintf(out, "\n区域截图（两版各一张）在 %s\n", r.shotsDir)
						break
					}
				}
				if len(r.diff.HumanReviewCells) > 0 {
					fmt.Fprintf(out, "\nHUMAN REVIEW (not green, not checked): %s\n", strings.Join(r.diff.HumanReviewCells, ", "))
				}
				continue
			}
			fmt.Fprintln(out, uicompare.RenderFindings(r.plain.Findings))
			if r.plain.Bottleneck {
				fmt.Fprintln(out, "\n瓶颈：同一批 finding 连续两轮不变。停下，交给人。")
			}
			if len(r.plain.HumanReviewCells) > 0 {
				fmt.Fprintf(out, "\nHUMAN REVIEW (not green, not checked): %s\n", strings.Join(r.plain.HumanReviewCells, ", "))
			}
		}
	}
	for _, r := range reports {
		if r.attention {
			return &nexterr.Exit{Code: 2}
		}
	}
	return nil
}

// shotsDirOf is where a canvas-diff matrix's area screenshots go: its `shotsDir` (default ui-measure-shots/), next to
// the matrix file.
func shotsDirOf(matrixPath string, m Matrix) string {
	dir := "ui-measure-shots"
	if m.ShotsDir != nil {
		dir = *m.ShotsDir
	}
	if !filepath.IsAbs(dir) {
		abs, err := filepath.Abs(filepath.Dir(matrixPath))
		if err == nil {
			dir = filepath.Join(abs, dir)
		}
	}
	return filepath.Clean(dir)
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
