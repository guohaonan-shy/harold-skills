package research_test

// The light-use mode of `research submit --light`: the gate on the file `idea-loop:uiux-researcher` hands back each
// design round. These are the assertions of research-check-light.test.mjs, one for one.

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/jsx"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/research"
)

// J is a JSON value built from Go values; nil drops a key.
type J = map[string]any

func lstep(over J) J {
	return merge(J{"source": "Acme", "saw": "练习页右上角有一个 X", "did": "点 X", "then": "弹出确认，危险按钮在下", "images": []any{"shots/acme-1.jpg"}, "reading": "先确认再退出，防止误触丢进度"}, over)
}

func item(over J) J {
	return merge(J{
		"covers": []any{1},
		"path":   []any{lstep(nil), lstep(J{"saw": "确认弹窗", "did": "点「继续练习」", "then": "回到练习页", "images": []any{"shots/acme-2.jpg"}})},
		"intent": "退出入口留在右上角，点后先弹确认",
	}, over)
}

func okReturn(over J) J {
	return merge(J{"mode": "light", "mobbin": "connected", "items": []any{item(nil)}}, over)
}

// undefined is a key that is left out, as `{ key: undefined }` is in the old test.
const undefined = "\x00undefined"

func merge(base, over J) J {
	out := J{}
	for k, v := range base {
		out[k] = v
	}
	for k, v := range over {
		if v == undefined {
			delete(out, k)
			continue
		}
		out[k] = v
	}
	return out
}

// parsed is v as the command reads it: through JSON, objects ordered by key (encoding/json sorts map keys).
func parsed(t *testing.T, v any) any {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	p, err := jsx.ParseJSON(b)
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func lightCtx(opinions ...string) research.LightContext {
	if len(opinions) == 0 {
		opinions = []string{"1"}
	}
	return research.LightContext{FileExists: func(string) bool { return true }, Opinions: opinions}
}

func lightErrors(t *testing.T, data any, ctx ...research.LightContext) []string {
	t.Helper()
	c := lightCtx()
	if len(ctx) > 0 {
		c = ctx[0]
	}
	return research.CheckLight(parsed(t, data), c).Errors
}

func expect(t *testing.T, errs []string, parts ...string) {
	t.Helper()
	if !anyHas(errs, parts...) {
		t.Errorf("no error has %q:\n%s", parts, strings.Join(errs, "\n"))
	}
}

func TestLightACompleteItemCoveringTheOneOpinionIsValid(t *testing.T) {
	r := research.CheckLight(parsed(t, okReturn(nil)), lightCtx())
	if !r.Valid || len(r.Errors) != 0 || r.Items != 1 {
		t.Fatalf("%+v", r)
	}
}

func TestLightAnItemWithoutAPathOrWithAnEmptyOneFails(t *testing.T) {
	for _, path := range []any{undefined, []any{}} {
		expect(t, lightErrors(t, okReturn(J{"items": []any{item(J{"path": path})}})), "用户路径")
	}
}

func TestLightAStepWithoutAPictureOrWithMoreThanTwoFails(t *testing.T) {
	for _, images := range []any{undefined, []any{}, []any{"shots/a.jpg", "shots/b.jpg", "shots/c.jpg"}} {
		expect(t, lightErrors(t, okReturn(J{"items": []any{item(J{"path": []any{lstep(J{"images": images})}})}})), "第 1 步", "图")
	}
}

func TestLightAPictureThatIsNotARelativePathInsideTheDropDirectoryOrDoesNotExistFails(t *testing.T) {
	for _, bad := range []string{"https://mobbin.com/api/mcp/short/abcd1234", "/tmp/a.jpg", "../a.jpg", "data:image/jpeg;base64,AAAA"} {
		expect(t, lightErrors(t, okReturn(J{"items": []any{item(J{"path": []any{lstep(J{"images": []any{bad}})}})}})), bad)
	}
	c := lightCtx()
	c.FileExists = func(p string) bool { return p != "shots/acme-1.jpg" }
	expect(t, lightErrors(t, okReturn(nil), c), "shots/acme-1.jpg", "不存在")
}

func TestLightAStepWithoutItsReadingOrABlankOneFails(t *testing.T) {
	for _, reading := range []any{undefined, "", "  "} {
		expect(t, lightErrors(t, okReturn(J{"items": []any{item(J{"path": []any{lstep(J{"reading": reading})}})}})), "第 1 步", "解读")
	}
}

func TestLightAStepMustSayWhatWasSeenDoneAndCameNext(t *testing.T) {
	for _, field := range []string{"saw", "did", "then"} {
		expect(t, lightErrors(t, okReturn(J{"items": []any{item(J{"path": []any{lstep(J{field: ""})}})}})), "第 1 步", field)
	}
}

func TestLightAnItemWithoutTheNewDesignIntentFails(t *testing.T) {
	for _, intent := range []any{undefined, "", "  "} {
		expect(t, lightErrors(t, okReturn(J{"items": []any{item(J{"intent": intent})}})), "设计意图")
	}
}

func TestLightAnOverturnNeedsALedgerNumberAndAReason(t *testing.T) {
	withOverturn := func(o J) J { return okReturn(J{"items": []any{item(J{"overturns": []any{o}})}}) }
	withLedger := func(ids ...string) research.LightContext {
		c := lightCtx()
		c.Ledger = ids
		return c
	}
	if e := lightErrors(t, withOverturn(J{"ledger": "1.2", "why": "这条决定让退出入口藏在二级菜单，用户找不到"}), withLedger("1.1", "1.2")); len(e) != 0 {
		t.Error(e)
	}
	for _, why := range []any{undefined, "", "  "} {
		expect(t, lightErrors(t, withOverturn(merge(J{"ledger": "1.2"}, J{"why": why})), withLedger("1.2")), "推翻", "理由")
	}
	for _, ledger := range []any{undefined, "", "abc"} {
		expect(t, lightErrors(t, withOverturn(merge(J{"why": "理由"}, J{"ledger": ledger}))), "推翻", "编号")
	}
	expect(t, lightErrors(t, withOverturn(J{"ledger": "3.9", "why": "理由"}), withLedger("1.1")), "3.9", "ledger")
}

func TestLightAnOpinionNoItemCoversFailsUnlessTheReturnSaysWhy(t *testing.T) {
	two := lightCtx("1", "2")
	expect(t, lightErrors(t, okReturn(nil), two), "评委意见 2", "没有被覆盖")
	if e := lightErrors(t, okReturn(J{"uncovered": []any{J{"opinion": 2, "why": "Mobbin 搜不到能呈现这个状态的参考"}}}), two); len(e) != 0 {
		t.Error(e)
	}
	expect(t, lightErrors(t, okReturn(J{"uncovered": []any{J{"opinion": 2, "why": " "}}}), two), "评委意见 2", "没有被覆盖")
}

func TestLightOneItemMayMergeSeveralOpinionsButAnOpinionInTwoItemsOrOneNeverGivenFails(t *testing.T) {
	three := lightCtx("1", "2", "3")
	if e := lightErrors(t, okReturn(J{"items": []any{item(J{"covers": []any{1, 2}}), item(J{"covers": []any{3}})}}), three); len(e) != 0 {
		t.Error(e)
	}
	expect(t, lightErrors(t, okReturn(J{"items": []any{item(J{"covers": []any{1, 2}}), item(J{"covers": []any{2, 3}})}}), three), "评委意见 2", "两项")
	expect(t, lightErrors(t, okReturn(J{"items": []any{item(J{"covers": []any{1, 7}})}}), three), "7")
	expect(t, lightErrors(t, okReturn(J{"items": []any{item(J{"covers": []any{}})}})), "covers")
}

func TestLightMobbinNotConnectedIsAValidReturnWithTheStandardLineAReasonAndNoItems(t *testing.T) {
	down := J{"mode": "light", "mobbin": "unavailable", "message": "这一轮没有参考图：Mobbin 没连上", "reason": "search_screens 返回要先登录", "items": []any{}}
	r := research.CheckLight(parsed(t, down), lightCtx("1", "2"))
	if !r.Valid || len(r.Errors) != 0 {
		t.Fatalf("%+v", r)
	}
	expect(t, lightErrors(t, merge(down, J{"reason": ""})), "reason")
	expect(t, lightErrors(t, merge(down, J{"message": "没连上"})), "这一轮没有参考图：Mobbin 没连上")
	expect(t, lightErrors(t, merge(down, J{"items": []any{item(nil)}})), "items")
}

func TestLightAnUnknownModeAnUnknownFieldOrANonObjectReturnFails(t *testing.T) {
	expect(t, lightErrors(t, okReturn(J{"mode": "page"})), "mode")
	expect(t, lightErrors(t, okReturn(J{"extra": 1})), "extra")
	expect(t, lightErrors(t, okReturn(J{"items": []any{item(J{"extra": 1})}})), "extra")
	expect(t, lightErrors(t, okReturn(J{"items": []any{item(J{"path": []any{lstep(J{"extra": 1})}})}})), "extra")
	if research.CheckLight(parsed(t, []any{}), lightCtx()).Valid || research.CheckLight(nil, lightCtx()).Valid {
		t.Error("a non-object return is valid")
	}
}

func TestSubmitLightGreenExits0AGapExits2ABadOpinionsOrAnUnreadableFileExits1(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "shots"), 0o755)
	for _, f := range []string{"acme-1", "acme-2"} {
		os.WriteFile(filepath.Join(dir, "shots", f+".jpg"), []byte("x"), 0o644)
	}
	file := filepath.Join(dir, "research-light.json")
	b, _ := json.Marshal(okReturn(nil))
	os.WriteFile(file, b, 0o644)

	r := dyna("research", "submit", "--light", file, "--opinions=1")
	if r.code != 0 || !strings.Contains(r.stdout, "green") {
		t.Fatalf("%+v", r)
	}
	r = dyna("research", "submit", "--light", file, "--opinions=1,2")
	if r.code != 2 || !strings.Contains(r.stdout, "评委意见 2") {
		t.Fatalf("%+v", r)
	}
	r = dyna("research", "submit", "--light", file, "--opinions=1", "--ledger=1.1,1.2", "--json")
	var out struct {
		Valid bool
		Items int
	}
	if err := json.Unmarshal([]byte(r.stdout), &out); err != nil || !out.Valid || out.Items != 1 {
		t.Fatalf("%v %+v", err, r)
	}

	if r := dyna("research", "submit", "--light", file); r.code != 1 || !strings.Contains(r.stderr, "--opinions") {
		t.Errorf("no --opinions: %+v", r)
	}
	if r := dyna("research", "submit", "--light", filepath.Join(dir, "nope.json"), "--opinions=1"); r.code != 1 {
		t.Errorf("missing file: %+v", r)
	}
	os.WriteFile(file, []byte("{not json"), 0o644)
	if r := dyna("research", "submit", "--light", file, "--opinions=1"); r.code != 1 || !strings.Contains(r.stderr, "not valid JSON") {
		t.Errorf("bad JSON: %+v", r)
	}
}
