package sections

import (
	"fmt"
	"math"
	"sort"
	"strings"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/frontmatter"
)

func clone(m Obj) Obj {
	out := frontmatter.NewMap()
	for _, k := range m.Keys() {
		out.Set(k, m.Get(k))
	}
	return out
}

func roundPx(v float64) float64 { return jsRound(v) }

type rng struct {
	id, ref, role      any
	by                 string
	start, end, height float64
}

func (r *rng) obj() Obj {
	return O("id", r.id, "ref", r.ref, "by", r.by, "role", r.role, "start", r.start, "end", r.end, "height", r.height)
}

func objs(rs []*rng) []any {
	out := []any{}
	for _, r := range rs {
		out = append(out, r.obj())
	}
	return out
}

// Attribute turns a measurement into ranges, the section each clickable element belongs to, and what does not fit.
//
// Ranges: a section found by heading starts at the top of the top-level block that holds the heading — at the
// heading itself when that block holds another declared heading — and runs to where the next declared section starts
// (the last one: the top of the page's first contentinfo, declared or not, else the page bottom). A landmark or
// `position` section is that element's own box. Ownership: a clickable inside a banner / contentinfo belongs to the
// section that declares that landmark; any other one belongs to the section whose range holds its vertical centre —
// for a fixed element, the centre where it first showed while the page was scrolled through. A clickable that is
// see-through (opacity 0), or fixed and never shown, belongs to none and is listed in `hidden`, not as an orphan. Two
// sections whose ranges overlap fail like an orphan (a landmark that floats over the top of the content is not
// counted: its clickables are owned through the DOM).
//
// The result is a mapping: ok, state, entry, section, page, viewport, theme, motion, clock, pageHeight, pageWidth,
// scroller, ranges, clickables, orphans, hidden, roleUnresolved, headings, notFound, outOfOrder, overlaps,
// scrollDriven, undeclaredScrollDriven, declaredNotDetected, coverage.
func Attribute(m any) Obj {
	ref := func(id any) any {
		if truthy(get(m, "page")) {
			return text(get(m, "page")) + "#" + text(id)
		}
		return id
	}
	blocks := list(or(get(m, "blocks"), []any{}))
	pageHeightV := or(get(get(m, "pageSize"), "height"), float64(0))
	pageHeight := num(pageHeightV)
	secs := list(or(get(m, "sections"), []any{}))
	var found []any
	notFound := []any{}
	for _, s := range secs {
		if truthy(get(s, "found")) {
			found = append(found, s)
		} else {
			notFound = append(notFound, O("id", get(s, "id"), "ref", ref(get(s, "id")), "locate", get(s, "locate"), "reason", or(get(s, "reason"), "没有定位到")))
		}
	}

	kindOf := func(s any) string {
		loc := get(s, "locate")
		if !isUndef(get(loc, "position")) {
			return "position"
		}
		if strictEq(get(loc, "role"), "heading") {
			return "heading"
		}
		return "landmark"
	}
	headingsInBlock := func(block any) int {
		n := 0
		for _, x := range found {
			if kindOf(x) == "heading" && strictEq(get(x, "block"), block) {
				n++
			}
		}
		return n
	}
	startOf := func(s any) float64 {
		b := get(s, "block")
		if kindOf(s) == "heading" && num(b) >= 0 && headingsInBlock(b) == 1 && truthy(at(blocks, b)) {
			return num(get(at(blocks, b), "top"))
		}
		return num(get(s, "top"))
	}

	var ranges []*rng
	for i, s := range found {
		kind := kindOf(s)
		start := startOf(s)
		var end float64
		if kind == "heading" {
			if i+1 < len(found) {
				end = startOf(found[i+1])
			} else {
				end = num(or(get(get(m, "contentinfo"), "top"), pageHeightV))
			}
		} else {
			end = num(get(s, "bottom"))
		}
		ranges = append(ranges, &rng{
			id: get(s, "id"), ref: ref(get(s, "id")), by: kind, role: nul(get(get(s, "locate"), "role")),
			start: roundPx(start), end: roundPx(end), height: roundPx(end) - roundPx(start),
		})
	}

	outOfOrder := []any{}
	for i, r := range ranges {
		if r.end < r.start {
			outOfOrder = append(outOfOrder, O("id", r.id, "ref", r.ref, "reason", fmt.Sprintf("范围倒过来了（%s → %s）：它在页面上的位置比后一段还靠下", text(r.start), text(r.end))))
		} else if i > 0 && r.start < ranges[i-1].start {
			p := ranges[i-1]
			outOfOrder = append(outOfOrder, O("id", r.id, "ref", r.ref, "reason", fmt.Sprintf("起点 %s 比前一段（%s）的起点 %s 还靠上：sections 的顺序要和页面一致", text(r.start), text(p.id), text(p.start))))
		}
	}

	gaps := []any{}
	var sorted []*rng
	for _, r := range ranges {
		if r.height > 0 {
			sorted = append(sorted, r)
		}
	}
	sort.SliceStable(sorted, func(i, j int) bool { return sorted[i].start < sorted[j].start })
	cursor := float64(0)
	for _, r := range sorted {
		if r.start > cursor {
			gaps = append(gaps, O("from", cursor, "to", r.start))
		}
		cursor = math.Max(cursor, r.end)
	}
	if pageHeight > cursor {
		gaps = append(gaps, O("from", cursor, "to", pageHeightV))
	}
	overlaps := []any{}
	var reach *rng
	for _, r := range sorted {
		if r.by == "landmark" {
			continue
		}
		if reach != nil && r.start < reach.end {
			to := math.Min(r.end, reach.end)
			overlaps = append(overlaps, O("at", r.id, "with", reach.id, "from", r.start, "to", to,
				"reason", fmt.Sprintf("%s 与 %s 的范围重叠（%s–%s）：多半是 position 定位的分块里还有另一段的标题，改成用标题定位，或把两段并成一段", text(reach.id), text(r.id), text(r.start), text(to))))
		}
		if reach == nil || r.end > reach.end {
			reach = r
		}
	}

	landmarkOwner := func(role any) *rng {
		for _, r := range ranges {
			if r.by == "landmark" && strictEq(r.role, role) {
				return r
			}
		}
		return nil
	}
	findOwner := func(y float64) *rng {
		for _, r := range ranges {
			if y >= r.start && y < r.end {
				return r
			}
		}
		return nil
	}
	clickables := []any{}
	orphans := []any{}
	hidden := []any{}
	roleUnresolved := []any{}
	for _, c := range list(or(get(m, "clickables"), []any{})) {
		fixed := truthy(get(c, "fixed"))
		var invisible bool
		if fixed {
			invisible = !truthy(get(c, "appearance"))
		} else {
			invisible = num(or(get(c, "opacity"), float64(1))) < 0.01
		}
		if invisible {
			reason := "透明度为 0，看不见"
			if fixed {
				reason = "固定在屏幕上，整页滚一遍也没出现过"
			}
			hidden = append(hidden, O("role", get(c, "role"), "name", get(c, "name"), "reason", reason))
			continue
		}
		var y float64
		if fixed {
			ap := get(c, "appearance")
			y = roundPx(num(get(ap, "scrollY")) + (num(get(ap, "top"))+num(get(ap, "bottom")))/2)
		} else {
			y = roundPx((num(get(c, "top")) + num(get(c, "bottom"))) / 2)
		}
		var owner *rng
		why := ""
		if lm := get(c, "landmark"); truthy(lm) {
			owner = landmarkOwner(lm)
			if owner == nil {
				label := "页脚（contentinfo）"
				if strictEq(lm, "banner") {
					label = "顶栏（banner）"
				}
				why = fmt.Sprintf("在%s里，而 sections 里没有声明 %s 段", label, text(lm))
			}
		} else {
			owner = findOwner(y)
			if owner == nil {
				switch {
				case len(ranges) == 0:
					why = "没有任何定位到的段"
				case y < ranges[0].start:
					why = fmt.Sprintf("在第一段（%s）之前", text(ranges[0].id))
				case y >= ranges[len(ranges)-1].end:
					why = fmt.Sprintf("在最后一段（%s）之后", text(ranges[len(ranges)-1].id))
				default:
					why = "落在相邻两段之间的空隙里"
				}
			}
		}
		var section, secRef any
		if owner != nil {
			section, secRef = owner.id, owner.ref
		}
		item := O("role", get(c, "role"), "name", get(c, "name"), "y", y, "section", section, "ref", secRef)
		if fixed {
			item.Set("fixed", true)
		}
		clickables = append(clickables, item)
		if owner == nil {
			o := clone(item)
			o.Set("landmark", nul(get(c, "landmark")))
			o.Set("reason", why)
			orphans = append(orphans, o)
		}
		if strictEq(get(c, "byRole"), false) {
			roleUnresolved = append(roleUnresolved, O("role", get(c, "role"), "name", get(c, "name"), "section", section, "textMatches", or(get(c, "textMatches"), float64(0))))
		}
	}

	headings := []any{}
	for _, h := range list(or(get(m, "headings"), []any{})) {
		y := roundPx((num(get(h, "top")) + num(get(h, "bottom"))) / 2)
		var section any
		if o := findOwner(y); o != nil {
			section = o.id
		}
		headings = append(headings, O("level", get(h, "level"), "name", get(h, "name"), "byRole", nul(or(get(h, "byRole"), nil)), "matches", nul(get(h, "matches")), "y", y, "section", section))
	}

	scrollDriven, undeclared, declaredNotDetected := scrollDrivenOf(list(or(get(m, "pins"), []any{})), found, ranges)

	ok := len(orphans) == 0 && len(notFound) == 0 && len(outOfOrder) == 0 && len(overlaps) == 0 && len(undeclared) == 0
	return O(
		"ok", ok,
		"state", nul(get(m, "state")),
		"entry", or(get(m, "entry"), nul(get(m, "state"))),
		"section", nul(get(m, "section")),
		"page", nul(get(m, "page")),
		"viewport", nul(get(m, "viewport")),
		"theme", nul(get(m, "theme")),
		"motion", nul(get(m, "motion")),
		"clock", nul(get(m, "clock")),
		"pageHeight", pageHeightV,
		"pageWidth", nul(get(get(m, "pageSize"), "width")),
		"scroller", nul(get(m, "scroller")),
		"ranges", objs(ranges),
		"clickables", clickables,
		"orphans", orphans,
		"hidden", hidden,
		"roleUnresolved", roleUnresolved,
		"headings", headings,
		"notFound", notFound,
		"outOfOrder", outOfOrder,
		"overlaps", overlaps,
		"scrollDriven", scrollDriven,
		"undeclaredScrollDriven", undeclared,
		"declaredNotDetected", declaredNotDetected,
		"coverage", O("gaps", gaps, "overlaps", overlaps),
	)
}

// scrollDrivenOf says which sections are scroll-driven. The measurement lists the pins it saw while the page was
// scrolled through (a `position: sticky` element, or a fixed one a library pins, inside a container taller than itself,
// big enough to hold a screen: half the viewport's width and height); a pin belongs to the section whose range holds its container's vertical centre. A section is
// scroll-driven when a pin belongs to it. `declared` is the section's `scrollDriven: true`. Detected but not declared
// fails the run (the section would be shot as one tall picture with blank under the first step); declared but not
// detected is only a hint.
func scrollDrivenOf(pins []any, found []any, ranges []*rng) (scrollDriven, undeclared, declaredNotDetected []any) {
	evidenceOf := func(pin any) string {
		how := "固定定位钉住（容器里的 fixed 元素）"
		if strictEq(get(pin, "kind"), "sticky") {
			how = "position: sticky"
		}
		held := ""
		if stuck := get(pin, "stuck"); truthy(stuck) {
			held = fmt.Sprintf("，滚动 %s–%s 之间钉在视口里", text(get(stuck, "from")), text(get(stuck, "to")))
		}
		label := ""
		if l := get(pin, "label"); truthy(l) {
			label = "「" + text(l) + "」"
		}
		texts := list(or(get(pin, "texts"), []any{}))
		txt := ""
		if len(texts) > 1 {
			txt = fmt.Sprintf("；钉住时的可见文字随滚动变了（%d 种）", len(texts))
		}
		c := get(pin, "container")
		return fmt.Sprintf("%s 的 <%s>%s高 %spx，容器高 %spx%s%s", how, text(get(pin, "tag")), label, text(roundPx(num(get(pin, "height")))), text(roundPx(num(get(c, "bottom"))-num(get(c, "top")))), held, txt)
	}
	evidence := map[string][]any{}
	pinTop := map[string]float64{}
	for _, pin := range pins {
		c := get(pin, "container")
		y := (num(get(c, "top")) + num(get(c, "bottom"))) / 2
		var owner *rng
		for _, r := range ranges {
			if r.by != "landmark" && y >= r.start && y < r.end {
				owner = r
				break
			}
		}
		if owner != nil {
			k := text(owner.id)
			evidence[k] = append(evidence[k], evidenceOf(pin))
			cur, has := pinTop[k]
			if !has {
				cur = math.Inf(1)
			}
			pinTop[k] = math.Min(cur, roundPx(num(get(c, "top"))))
		}
	}
	declaredIDs := map[string]bool{}
	for _, s := range found {
		if strictEq(get(s, "declaredScrollDriven"), true) {
			declaredIDs[text(get(s, "id"))] = true
		}
	}
	type entry struct {
		r        *rng
		detected bool
		declared bool
		ev       []any
		hasTop   bool
		top      float64
	}
	var entries []entry
	scrollDriven = []any{}
	for _, r := range ranges {
		k := text(r.id)
		_, det := evidence[k]
		if !det && !declaredIDs[k] {
			continue
		}
		ev := evidence[k]
		if ev == nil {
			ev = []any{}
		}
		top, hasTop := pinTop[k]
		e := entry{r: r, detected: det, declared: declaredIDs[k], ev: ev, hasTop: hasTop, top: top}
		entries = append(entries, e)
		o := O("id", r.id, "ref", r.ref, "detected", e.detected, "declared", e.declared, "evidence", ev)
		if hasTop {
			o.Set("pinTop", top)
		}
		scrollDriven = append(scrollDriven, o)
	}
	undeclared = []any{}
	declaredNotDetected = []any{}
	for _, e := range entries {
		id := text(e.r.id)
		if e.detected && !e.declared {
			undeclared = append(undeclared, O("id", e.r.id, "ref", e.r.ref, "evidence", e.ev,
				"reason", fmt.Sprintf("%s 是滚动驱动的段（钉在视口里的内容随滚动变化），分段声明里没写：给它加 scrollDriven: true，并照 design-archive 的「拍档案截图」里的「滚动驱动的段」把每一步建成段内状态", id)))
		}
		if e.declared && !e.detected {
			declaredNotDetected = append(declaredNotDetected, O("id", e.r.id, "ref", e.r.ref,
				"reason", fmt.Sprintf("%s 声明了 scrollDriven，但测量没检出钉在视口里的元素：按声明拍（只截段顶起一个视口高），确认这一段真是滚动驱动的", id)))
		}
	}
	return scrollDriven, undeclared, declaredNotDetected
}

// joinTexts is `list.join(sep)` over strings.
func joinTexts(l []any, sep string) string {
	parts := make([]string, len(l))
	for i, e := range l {
		parts[i] = text(e)
	}
	return strings.Join(parts, sep)
}
