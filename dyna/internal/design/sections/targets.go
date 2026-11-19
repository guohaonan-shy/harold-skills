package sections

import (
	"fmt"
	"math"
	"sort"
	"strings"
)

// Picked is what ShootTargets decided to shoot.
type Picked struct {
	Targets []any // { id, ref, file, start, end, inScroller, scrollDriven? } each
	Skipped []any // { id, reason } each
	// Scroller is the scroll container the page was measured with (null when there was none).
	Scroller any
}

// ShootTargets reads the shots an attribution asks for: { id, ref, file, start, end, inScroller } per section, clipped to
// the page, and the `scroller` the page was measured with. `inScroller` is true for a section that starts inside a
// scroll container (not the document): that one is shot from the container, screen by screen. A section declared
// `scrollDriven` is the one screen its pin holds: from the top of the pin's container (the section's top when the pin
// starts there) for the viewport's height, `scrollDriven: true`. For an entry state, one per section (or only those in
// `only`, when it is not nil), `<entry>@<section>.png`. For a state inside a section (the measurement was made `--for`
// it), the one section it sits in, named after the state: `<state>.png`. A section with no height is skipped and named
// in Skipped.
func ShootTargets(attribution any, only []string) (Picked, error) {
	entry := or(get(attribution, "entry"), get(attribution, "state"))
	state := get(attribution, "state")
	inSection := truthy(state) && truthy(get(attribution, "entry")) && !strictEq(state, get(attribution, "entry"))
	if !truthy(entry) {
		return Picked{}, fmt.Errorf("不知道入口状态 id：归属结果里没有 state / entry")
	}
	wanted := list(get(attribution, "ranges"))
	ids := func(rs []any) string {
		parts := make([]string, len(rs))
		for i, r := range rs {
			parts[i] = text(get(r, "id"))
		}
		return strings.Join(parts, "、")
	}
	if inSection {
		section := get(attribution, "section")
		if !truthy(section) {
			return Picked{}, fmt.Errorf("%s 不是入口状态：要知道它在哪一段（测量时带 --section <段 id>，或档案里该状态的 section 已写）", text(state))
		}
		var keep []any
		for _, r := range wanted {
			if strictEq(get(r, "id"), section) {
				keep = append(keep, r)
			}
		}
		wanted = keep
		if len(wanted) == 0 {
			return Picked{}, fmt.Errorf("归属结果里没有段「%s」（没定位到？先让 attribute 通过）", text(section))
		}
	} else if only != nil {
		var unknown []string
		for _, id := range only {
			known := false
			for _, r := range wanted {
				if strictEq(get(r, "id"), id) {
					known = true
					break
				}
			}
			if !known {
				unknown = append(unknown, id)
			}
		}
		if len(unknown) > 0 {
			return Picked{}, fmt.Errorf("没有段 %s；现有：%s", strings.Join(unknown, "、"), ids(wanted))
		}
		var keep []any
		for _, r := range wanted {
			for _, id := range only {
				if strictEq(get(r, "id"), id) {
					keep = append(keep, r)
					break
				}
			}
		}
		wanted = keep
	}
	scroller := nul(get(attribution, "scroller"))
	// a scroll-driven section of an entry state is shot as the one screen it holds at its top; a state inside it is shot as any section
	pinned := map[string]any{}
	if !inSection {
		for _, x := range list(or(get(attribution, "scrollDriven"), []any{})) {
			if truthy(get(x, "declared")) {
				pinned[text(get(x, "id"))] = get(x, "pinTop")
			}
		}
	}
	screenHeight := num(get(get(attribution, "viewport"), "height"))
	pageHeightV := get(attribution, "pageHeight")
	targets := []any{}
	skipped := []any{}
	for _, r := range wanted {
		start := math.Max(0, num(get(r, "start")))
		end := num(get(r, "end"))
		if truthy(pageHeightV) {
			end = math.Min(num(pageHeightV), end)
		}
		if end <= start {
			skipped = append(skipped, O("id", get(r, "id"), "reason", fmt.Sprintf("范围 %s–%s 没有高度，或在页面（高 %s）之外", text(get(r, "start")), text(get(r, "end")), text(pageHeightV))))
			continue
		}
		pin, isPinned := pinned[text(get(r, "id"))]
		scrollDriven := isPinned && screenHeight > 0
		if scrollDriven {
			// the screen it holds starts where the pin does: the section's top, or — when something comes before the pin in the section — the top of the pin's container
			if at, isNum := pin.(float64); isNum && !math.IsInf(at, 0) && !math.IsNaN(at) && at > start && at < end {
				start = at
			}
			end = start + screenHeight
		}
		inScroller := strictEq(get(scroller, "kind"), "element") && start >= jsRound(num(get(scroller, "top")))
		file := text(entry) + "@" + text(get(r, "id")) + ".png"
		if inSection {
			file = text(state) + ".png"
		}
		t := O("id", get(r, "id"), "ref", get(r, "ref"), "file", file, "start", start, "end", end, "inScroller", inScroller)
		if scrollDriven {
			t.Set("scrollDriven", true)
		}
		targets = append(targets, t)
	}
	return Picked{Targets: targets, Skipped: skipped, Scroller: scroller}, nil
}

// CoverScreens plans the screens `cover` shoots: the components below the first screen of a state with no sections,
// grouped from the top down. config is { state, components, viewportHeight, pageHeight }.
//
// components are { id, top, bottom, visibleBottom? } (an edge's id and its component's box in page coordinates at scroll
// 0). A component whole inside what the first picture really shows is in it already: `inViewport`. That is above the
// main viewport's height and, when given, above the component's own `visibleBottom` — the lowest line the first screen
// shows of it, which the page works out by asking the browser what is on top at points over the component's box (a bar, a
// popover or the foot of the container that holds it, whatever the way the page is written). One half in it, or one
// something hides or clips, is not. The rest are taken in order of `top`; a screen is `viewportHeight` tall, starts a
// quarter of it above its first component (not above the top of the page, not below the last whole screen of the page,
// `pageHeight - viewportHeight`), and takes in the following components that fit in it entire; the first one is always
// taken, whatever its height. The next component that does not fit starts the next screen. `shot` is what each edge
// writes: { edge id: '<state>@<first edge of its screen>.png' }.
//
// The browser runs the same function (js/coverScreens.js); this one is what the tests run.
func CoverScreens(config Obj) (Obj, error) {
	state := get(config, "state")
	s, isStr := state.(string)
	if !isStr || s == "" || strings.ContainsAny(s, `\/`) || strings.HasPrefix(s, ".") {
		return nil, fmt.Errorf("状态 id 不对（它会成为图的文件名）：%s", stringify(nul(state), 0))
	}
	viewportHeight := num(get(config, "viewportHeight"))
	if !(viewportHeight > 0) {
		return nil, fmt.Errorf("没有主视口高：补拍的一屏跟主视口一样高")
	}
	components, isList := get(config, "components").([]any)
	if !isList {
		return nil, fmt.Errorf("组件位置要是一个列表：[{ id, top, bottom }, …]")
	}
	pageHeight := num(get(config, "pageHeight"))
	if !(pageHeight > 0) {
		return nil, fmt.Errorf("没有页面总高：最后一屏要往上收到整屏高")
	}
	inViewport := []any{}
	type item struct {
		c           any
		i           int
		top, bottom float64
	}
	var rest []item
	for i, c := range components {
		limit := viewportHeight
		if vb, ok := get(c, "visibleBottom").(float64); ok && !math.IsInf(vb, 0) && !math.IsNaN(vb) {
			limit = vb
		}
		if num(get(c, "bottom")) <= math.Min(viewportHeight, limit) {
			inViewport = append(inViewport, get(c, "id"))
		} else {
			rest = append(rest, item{c: c, i: i, top: num(get(c, "top")), bottom: num(get(c, "bottom"))})
		}
	}
	sort.SliceStable(rest, func(a, b int) bool {
		if rest[a].top != rest[b].top {
			return rest[a].top < rest[b].top
		}
		return rest[a].i < rest[b].i
	})
	margin := jsRound(viewportHeight / 4)
	lastStart := math.Max(0, pageHeight-viewportHeight)
	screens := []any{}
	shot := O()
	for k := 0; k < len(rest); {
		first := rest[k]
		start := math.Max(0, math.Min(first.top-margin, lastStart))
		end := start + viewportHeight
		edges := []any{get(first.c, "id")}
		k++
		for k < len(rest) && rest[k].top >= start && rest[k].bottom <= end {
			edges = append(edges, get(rest[k].c, "id"))
			k++
		}
		file := s + "@" + text(get(first.c, "id")) + ".png"
		screens = append(screens, O("id", get(first.c, "id"), "file", file, "start", start, "end", end, "edges", edges))
		for _, id := range edges {
			shot.Set(text(id), file)
		}
	}
	return O("screens", screens, "shot", shot, "inViewport", inViewport), nil
}
