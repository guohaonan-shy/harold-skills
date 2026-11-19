package pr

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

// These are the assertions of the old review-check.test.mjs, one test each, over the same inputs.

const sampleCandDiff = `--- a/src/api/handler.ts
+++ b/src/api/handler.ts
@@ -1,0 +2,3 @@
+import { db } from '../db/client';
+export async function handler(req) {
+  return db.query('select 1');
`

var candFiles = map[string]string{
	"docs/spec/practice-retry/tickets/03-retry.md": "- [x] 失败后点「重试」，只重新分析这一题，  不消耗配额",
	"docs/reference/code-layering.md":              "路由层不直接访问数据库，\n统一经过 service 层。",
	"docs/reference/wording.md":                    "界面文案里的按钮名称统一用两个字的动词。",
	"src/api/legacy.ts":                            "export const quota = readQuota();\nexport function readQuota() {\n  return db.query('select quota');\n}\n",
}

var candIO = IO{
	Read: func(p string) (string, bool) {
		s, ok := candFiles[p]
		return s, ok
	},
	Exists: func(name string) bool { return name == "r1-retry-quota.png" },
	Added:  func(p string) []string { return AddedLines(sampleCandDiff, p) },
}

// cand builds a candidate from a map; nil values are fields that were not written.
func cand(m obj) Candidate {
	clean := obj{}
	for k, v := range m {
		if v != nil {
			clean[k] = v
		}
	}
	raw, _ := json.Marshal(clean)
	return NewCandidate(raw)
}

// with is m with the given fields replaced; a nil value removes the field.
func with(m obj, over obj) obj {
	out := obj{}
	for k, v := range m {
		out[k] = v
	}
	for k, v := range over {
		if v == nil {
			delete(out, k)
		} else {
			out[k] = v
		}
	}
	return out
}

func problemsText(r Rewrite) string { return strings.Join(r.Problems, "\n") }

func TestWhitespaceIsNormalizedNothingElseIsFuzzy(t *testing.T) {
	if !contains("路由层不直接访问数据库，\n统一经过 service 层。", "路由层不直接访问数据库， 统一经过 service 层。") {
		t.Fatal("whitespace")
	}
	if contains("路由层不直接访问数据库", "路由层不访问数据库") {
		t.Fatal("fuzzy")
	}
	if contains("anything", "  ") {
		t.Fatal("blank needle")
	}
	if !contains("a b　c", "a b c") {
		t.Fatal("a no-break space and an ideographic space are whitespace too")
	}
}

func TestASnippetCountsOnlyIfEveryNonBlankLineWasAddedInThisDiff(t *testing.T) {
	added := AddedLines(sampleCandDiff, "src/api/handler.ts")
	if !SnippetInDiff("import { db } from '../db/client';\n\n  return db.query('select 1');", added) {
		t.Fatal("in the diff")
	}
	if SnippetInDiff("import { db } from '../db/client';\nconst old = 1;", added) {
		t.Fatal("one line was not added")
	}
	if SnippetInDiff("", added) {
		t.Fatal("an empty snippet proves nothing")
	}
}

// Every 要你决定 item has the same shape on both axes: title, now (with where it is from), impact, evidence,
// options (each with its cost and whether it can be undone), recommendation.
var options = []any{
	obj{"do": "修：重试不扣次数", "cost": "重试路径要多一次判断", "rollback": "能，改回去即可，没有数据迁移"},
	obj{"do": "不修：改工单，承认重试要扣次数", "cost": "学生失败一次就少一次机会", "rollback": "能，工单可以再改回来"},
}

var specWords = obj{
	"now":    "工单要求重试不消耗次数，用来保证失败不变成学生的成本；现在分析失败后点重试，每次都扣一次当天的每日额度，main 上重试不扣。",
	"impact": "连续失败几次的学生会提前用完当天的每日额度，网络差的学生最容易碰到。",
	"decide": obj{"options": options, "recommend": "修，这是用户能感到的损失。"},
}

var standardsWords = obj{
	"now":    "后端的分层规则写明路由层不直接访问数据库；分析接口在处理请求时直接查了数据库，没有经过业务层。",
	"impact": "以后换存储或加缓存时，这一处会被漏掉。",
	"decide": obj{"options": []any{
		obj{"do": "修：把查询挪进业务层", "cost": "多一个函数和一处测试", "rollback": "能，纯代码改动"},
		obj{"do": "开 issue：这次不动", "cost": "分层规则在这一处继续不成立", "rollback": "能，随时可以再改"},
	}, "recommend": "修，改动很小。"},
}

func merge(base obj, more ...obj) obj {
	out := with(base, nil)
	for _, m := range more {
		for k, v := range m {
			out[k] = v
		}
	}
	return out
}

var S1 = merge(obj{
	"id": "S1", "title": "连续失败的学生会提前用完当天的每日额度", "behavior": true, "on_screen": true,
	"quote":  obj{"file": "docs/spec/practice-retry/tickets/03-retry.md", "text": "只重新分析这一题， 不消耗配额"},
	"figure": "r1-retry-quota.png",
}, specWords)

var C1 = merge(obj{
	"id": "C1", "title": "接口直接查数据库",
	"rule":      obj{"file": "docs/reference/code-layering.md", "text": "路由层不直接访问数据库"},
	"code":      obj{"path": "src/api/handler.ts", "snippet": "import { db } from '../db/client';"},
	"locations": []any{"src/api/handler.ts:2"},
}, standardsWords)

func admitOne(c obj, axis string) Result {
	if axis == "standards" {
		return Admit(Candidates{Standards: []Candidate{cand(c)}}, candIO, 1)
	}
	return Admit(Candidates{Spec: []Candidate{cand(c)}}, candIO, 1)
}

func counts(r Result) []int {
	return []int{len(r.Spec), len(r.Standards), len(r.Discarded), len(r.Rewrite)}
}

func TestGroundedCandidatesInShapeAreAdmittedOnBothAxesWithNothingToRewrite(t *testing.T) {
	r := Admit(Candidates{Spec: []Candidate{cand(S1)}, Standards: []Candidate{cand(C1)}}, candIO, 1)
	if !reflect.DeepEqual(counts(r), []int{1, 1, 0, 0}) {
		t.Fatal(counts(r), r.Rewrite, r.Discarded)
	}
}

func TestABehaviouralFindingThatDoesNotShowOnScreenMayCarryItsReproductionAsAnInlineExample(t *testing.T) {
	c := with(S1, obj{"on_screen": false, "figure": nil, "example": "| 第几次重试 | main 剩余次数 | 本分支剩余次数 |\n|---|---|---|\n| 1 | 5 | 4 |"})
	r := admitOne(c, "spec")
	if len(r.Spec) != 1 || len(r.Rewrite) != 0 {
		t.Fatal(counts(r), r.Rewrite)
	}
}

func TestAFindingThatShowsOnScreenNeedsAScreenshotATableAloneGoesToRewriteUnlessItSaysWhyNoneCouldBeShot(t *testing.T) {
	tableOnly := with(S1, obj{"figure": nil, "example": "| 第几步 | 麦克风 |\n|---|---|\n| 示范还在播 | 已打开 |"})
	r := admitOne(tableOnly, "spec")
	if len(r.Spec) != 1 || len(r.Discarded) != 0 {
		t.Fatal(counts(r))
	}
	mustMatch(t, "截图", problemsText(r.Rewrite[0]))
	if p := ShapeProblems(cand(with(tableOnly, obj{"no_screenshot": "只有戴蓝牙耳机的真机才复现得出来"})), "spec"); len(p) != 0 {
		t.Fatal(p)
	}
	mustMatch(t, "没标 on_screen", strings.Join(ShapeProblems(cand(with(S1, obj{"on_screen": nil})), "spec"), ","))
}

func TestANonBehaviouralSpecFindingNeedsNoFigureAndMustNotCarryOne(t *testing.T) {
	extraFile := with(S1, obj{"id": "S2", "title": "多了一个迁移文件", "behavior": false, "figure": nil})
	r := admitOne(extraFile, "spec")
	if len(r.Spec) != 1 || string(r.Spec[0].rawField("id")) != `"S2"` {
		t.Fatal(counts(r))
	}
	r = admitOne(with(extraFile, obj{"figure": "r1-retry-quota.png"}), "spec")
	mustMatch(t, "不配图", problemsText(r.Rewrite[0]))
}

func TestCodeLevelReferencesInReaderFacingTextAreFound(t *testing.T) {
	hits := codeRefs("提交 2daa0bae 在 routers/analysis/writing.py:42 调 `fail_text_analysis`，spec §4.1 说 submit_text_analysis() 不行")
	if len(hits) != 6 {
		t.Fatal(hits)
	}
	if hits := codeRefs("L&R 和 Interview 两种报告的计时规则不一样，A/B 两个选项，iPhone 上最多等 5 秒"); len(hits) != 0 {
		t.Fatal(hits)
	}
}

func TestAFindingMissingAPartADecisionOrWrittenInCodeTermsGoesToRewriteNotToDiscard(t *testing.T) {
	bad := with(S1, obj{"impact": "", "now": "spec §4.7 写的是…", "decide": obj{"options": []any{obj{"do": "修", "cost": "", "rollback": "能"}}}})
	problems := ShapeProblems(cand(bad), "spec")
	all := strings.Join(problems, "\n")
	for _, want := range []string{"缺「对用户的影响」", "章节编号「§4.7」", "两个选项", "没给建议", "缺代价"} {
		if !strings.Contains(all, want) {
			t.Errorf("no %q in\n%s", want, all)
		}
	}
	r := Admit(Candidates{
		Spec:      []Candidate{cand(bad)},
		Standards: []Candidate{cand(with(C1, obj{"now": "`handler` 里 import 了 db"}))},
	}, candIO, 1)
	if !reflect.DeepEqual(counts(r), []int{1, 1, 0, 2}) {
		t.Fatal(counts(r))
	}
	if string(r.Rewrite[0].ID) != `"S1"` || string(r.Rewrite[1].ID) != `"C1"` {
		t.Fatal(r.Rewrite)
	}
}

func TestEachUngroundedCandidateIsDiscardedWithItsReason(t *testing.T) {
	q := func(text string) obj {
		return obj{"file": "docs/spec/practice-retry/tickets/03-retry.md", "text": text}
	}
	r := Admit(Candidates{
		Spec: []Candidate{
			cand(obj{"id": "S1", "title": "编的原文", "behavior": true, "quote": q("重试最多三次"), "figure": "r1-retry-quota.png"}),
			cand(obj{"id": "S2", "title": "行为问题没有复现证据", "behavior": true, "quote": q("不消耗配额")}),
			cand(obj{"id": "S3", "title": "图名是上一轮的", "behavior": true, "quote": q("不消耗配额"), "figure": "r0-x.png"}),
			cand(obj{"id": "S4", "title": "图不存在", "behavior": true, "quote": q("不消耗配额"), "figure": "r1-missing.png"}),
		},
		Standards: []Candidate{
			cand(obj{"id": "C1", "title": "编的规则", "rule": obj{"file": "docs/reference/code-layering.md", "text": "禁止使用 any"}, "code": obj{"path": "src/api/handler.ts", "snippet": "export async function handler(req) {"}}),
			cand(obj{"id": "C2", "title": "存量代码", "rule": obj{"file": "docs/reference/code-layering.md", "text": "统一经过 service 层"}, "code": obj{"path": "src/api/handler.ts", "snippet": "legacyCall();"}}),
			cand(obj{"id": "C3", "title": "规则文件不存在", "rule": obj{"file": "CODING.md", "text": "x"}, "code": obj{"path": "src/api/handler.ts", "snippet": "x"}}),
		},
	}, candIO, 1)
	var ids []string
	for _, d := range r.Discarded {
		ids = append(ids, strings.Trim(string(d.ID), `"`))
		if d.Reason == "" {
			t.Errorf("%s has no reason", d.ID)
		}
	}
	if !reflect.DeepEqual(ids, []string{"S1", "S2", "S3", "S4", "C1", "C2", "C3"}) {
		t.Fatal(ids)
	}
	want := []string{
		"docs/spec/practice-retry/tickets/03-retry.md 里找不到引用的原文",
		"行为问题没有复现证据（图、表格或例子都没有）：没复现的不算问题",
		"配图 r0-x.png 不以 r1- 开头",
		"配图 r1-missing.png 不在证据目录里",
		"docs/reference/code-layering.md 里找不到引用的规则原文",
		"代码片段不在这次 diff 新增的行里（src/api/handler.ts）",
		"规则文件不存在：CODING.md",
	}
	for i, d := range r.Discarded {
		if d.Reason != want[i] {
			t.Errorf("%s: %q", ids[i], d.Reason)
		}
	}
}

// ---------- 处置：照规则 / 要你决定 ----------

var basisRule = obj{"kind": "规则原文", "file": "docs/reference/wording.md", "text": "按钮名称统一用两个字的动词", "summary": "仓库的文案规定写明按钮名称统一用两个字的动词。"}
var sRuled = with(S1, obj{"id": "S3", "disposition": "照规则", "basis": basisRule, "action": "同步改", "decide": nil})
var cRuled = with(C1, obj{"disposition": "照规则", "action": "修", "decide": nil})

func TestARuledSpecFindingWithABasisAndAnActionNeedsNoOptionsAndNoRecommendation(t *testing.T) {
	r := admitOne(sRuled, "spec")
	if !reflect.DeepEqual([]int{len(r.Spec), len(r.Discarded), len(r.Rewrite)}, []int{1, 0, 0}) {
		t.Fatal(counts(r), r.Rewrite)
	}
}

func TestARuledFindingMissingItsBasisOrItsActionGoesToRewrite(t *testing.T) {
	for _, c := range []struct {
		over obj
		want string
	}{
		{obj{"basis": nil}, "缺依据"},
		{obj{"action": nil}, "缺动作"},
		{obj{"action": "改一改"}, "动作只能是"},
		{obj{"basis": with(basisRule, obj{"kind": "我觉得"})}, "依据只认三种"},
		{obj{"basis": with(basisRule, obj{"summary": ""})}, "缺一句依据"},
		{obj{"basis": obj{"kind": "规则原文", "summary": "有规定。"}}, "缺出处或原文"},
	} {
		r := admitOne(with(sRuled, c.over), "spec")
		if len(r.Rewrite) != 1 {
			t.Errorf("%v: %v", c.over, counts(r))
			continue
		}
		mustMatch(t, c.want, problemsText(r.Rewrite[0]))
	}
}

func TestARuledFindingDoesNotCarryADecisionForTheHumanAndItsBasisSentenceSpeaksInWordsNotCode(t *testing.T) {
	withDecide := admitOne(with(sRuled, obj{"decide": specWords["decide"]}), "spec")
	mustMatch(t, "照规则.*不写「要你决定」", problemsText(withDecide.Rewrite[0]))
	codey := admitOne(with(sRuled, obj{"basis": with(basisRule, obj{"summary": "见 docs/reference/wording.md 的第三条"})}), "spec")
	mustMatch(t, "依据.*代码层面的指称", problemsText(codey.Rewrite[0]))
}

func TestARuledFindingWhoseBasisIsNotWhereItClaimsIsDiscardedWhicheverKindOfBasisItNames(t *testing.T) {
	r := admitOne(with(sRuled, obj{"basis": with(basisRule, obj{"text": "按钮名称一律写英文"})}), "spec")
	if len(r.Spec) != 0 || len(r.Discarded) != 1 {
		t.Fatal(counts(r))
	}
	mustMatch(t, "依据", r.Discarded[0].Reason)
	gone := admitOne(with(sRuled, obj{"basis": with(basisRule, obj{"file": "docs/reference/missing.md"})}), "spec")
	mustMatch(t, "依据", gone.Discarded[0].Reason)
	humanWords := obj{"kind": "人的决定", "file": "docs/spec/practice-retry/tickets/03-retry.md", "text": "重试最多三次", "summary": "人在工单里定过。"}
	mustMatch(t, "依据", admitOne(with(sRuled, obj{"basis": humanWords}), "spec").Discarded[0].Reason)
	real := with(humanWords, obj{"text": "不消耗配额", "summary": "人在工单里定过重试不消耗配额。"})
	good := admitOne(with(sRuled, obj{"basis": real}), "spec")
	if len(good.Spec) != 1 || len(good.Discarded) != 0 {
		t.Fatal(counts(good))
	}
}

func TestAnUnknownDispositionGoesToRewriteNoDispositionKeepsTheOld要你决定Shape(t *testing.T) {
	mustMatch(t, "处置只能是", problemsText(admitOne(with(S1, obj{"disposition": "随便"}), "spec").Rewrite[0]))
	if r := admitOne(with(S1, obj{"disposition": "要你决定"}), "spec"); len(r.Rewrite) != 0 {
		t.Fatal(r.Rewrite)
	}
	found := false
	for _, p := range admitOne(with(S1, obj{"decide": nil}), "spec").Rewrite[0].Problems {
		if strings.Contains(p, "要你决定") {
			found = true
		}
	}
	if !found {
		t.Fatal("a 要你决定 item without its decision is refused")
	}
}

func TestA要你决定ItemHasTheSameShapeOnBothAxesEachOptionNamesItsCostAndWhetherItCanBeUndone(t *testing.T) {
	for _, axis := range []string{"spec", "standards"} {
		c := S1
		if axis == "standards" {
			c = C1
		}
		decide := c["decide"].(obj)
		opts := decide["options"].([]any)
		if r := admitOne(c, axis); len(r.Rewrite) != 0 {
			t.Errorf("%s: the shared shape is admitted: %v", axis, r.Rewrite)
		}
		noRollback := with(c, obj{"decide": with(decide, obj{"options": []any{opts[0], with(opts[1].(obj), obj{"rollback": ""})}})})
		mustMatch(t, "缺能否回滚", problemsText(admitOne(noRollback, axis).Rewrite[0]))
		mustMatch(t, "要你决定", problemsText(admitOne(with(c, obj{"decide": nil}), axis).Rewrite[0]))
		mustMatch(t, "选项要写成", problemsText(admitOne(with(c, obj{"decide": with(decide, obj{"options": []any{"修", "不修"}})}), axis).Rewrite[0]))
		codey := with(c, obj{"decide": with(decide, obj{"options": []any{with(opts[0].(obj), obj{"cost": "要改 src/api/handler.ts"}), opts[1]}})})
		mustMatch(t, "代码层面的指称", problemsText(admitOne(codey, axis).Rewrite[0]))
	}
	// a Standards finding no longer carries a single "suggestion": the options are the suggestion
	if r := admitOne(with(C1, obj{"suggestion": nil}), "standards"); len(r.Rewrite) != 0 {
		t.Fatal(r.Rewrite)
	}
}

func TestARuledStandardsFindingStandsOnItsRuleAndStillNeedsAnAction(t *testing.T) {
	r := admitOne(cRuled, "standards")
	if !reflect.DeepEqual([]int{len(r.Standards), len(r.Discarded), len(r.Rewrite)}, []int{1, 0, 0}) {
		t.Fatal(counts(r))
	}
	mustMatch(t, "缺动作", problemsText(admitOne(with(cRuled, obj{"action": nil}), "standards").Rewrite[0]))
	if n := len(admitOne(with(cRuled, obj{"rule": obj{"file": "docs/reference/code-layering.md", "text": "禁止使用 any"}}), "standards").Discarded); n != 1 {
		t.Fatal(n)
	}
}

func TestAnExistingNotAddedStandardsProblemIsReportedOnlyAsARuledFixThatSaysHowItSpoilsThisChange(t *testing.T) {
	stock := with(cRuled, obj{"id": "C2", "code": obj{"path": "src/api/legacy.ts", "snippet": "export const quota = readQuota();"}, "existing": true, "pollutes": "这次的每日额度统计读的就是这个值，它错了，统计就跟着错。"})
	ok := admitOne(stock, "standards")
	if !reflect.DeepEqual([]int{len(ok.Standards), len(ok.Discarded), len(ok.Rewrite)}, []int{1, 0, 0}) {
		t.Fatal(counts(ok), ok.Rewrite, ok.Discarded)
	}
	mustMatch(t, "缺一句.*怎么影响这次", problemsText(admitOne(with(stock, obj{"pollutes": ""}), "standards").Rewrite[0]))
	mustMatch(t, "存量.*照规则", problemsText(admitOne(with(stock, obj{"disposition": nil}), "standards").Rewrite[0]))
	if n := len(admitOne(with(stock, obj{"code": obj{"path": "src/api/legacy.ts", "snippet": "not there();"}}), "standards").Discarded); n != 1 {
		t.Fatal(n)
	}
	// without the flag a snippet that is not an added line is still discarded
	if n := len(admitOne(with(stock, obj{"existing": nil}), "standards").Discarded); n != 1 {
		t.Fatal(n)
	}
}

// ---- reading what the reviewers wrote ----

func TestAnAdmittedCandidateComesBackAsItWasWrittenWithItsKeysInTheirOrder(t *testing.T) {
	raw := `{"title":"接口直接查数据库","id":"C1","rule":{"file":"docs/reference/code-layering.md","text":"路由层不直接访问数据库"},"code":{"path":"src/api/handler.ts","snippet":"import { db } from '../db/client';"},"now":"a <b> & c","impact":"x","decide":{"options":[{"do":"a","cost":"b","rollback":"c"},{"do":"a","cost":"b","rollback":"c"}],"recommend":"修，改动很小。"}}`
	c, err := ParseCandidates([]byte(`{"standards":[` + raw + `]}`))
	if err != nil {
		t.Fatal(err)
	}
	r := Admit(c, candIO, 1)
	var sb strings.Builder
	must(t, writeJSON(&sb, r))
	mustMatch(t, `"title": "接口直接查数据库",\n\s+"id": "C1"`, sb.String())
	mustMatch(t, `a <b> & c`, sb.String())
	if !strings.HasPrefix(sb.String(), "{\n  \"spec\": [],\n  \"standards\": [\n    {\n") {
		t.Fatal(sb.String())
	}
}

func TestAFileThatIsNotTheRightShapeIsAnErrorNotAnEmptyRound(t *testing.T) {
	for _, bad := range []string{`[]`, `not json`, `{"spec":{}}`} {
		if _, err := ParseCandidates([]byte(bad)); err == nil {
			t.Errorf("%s was accepted", bad)
		}
	}
	if c, err := ParseCandidates([]byte(`{}`)); err != nil || len(c.Spec)+len(c.Standards) != 0 {
		t.Fatal(c, err)
	}
}
