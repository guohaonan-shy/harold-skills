package dreaming_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/app"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/dreaming"
)

// These are the assertions of the old proposal-table-check.test.mjs, one for one. The seam is the command line:
// feed `dreaming table submit` (or `split`) a proposal table, read back the exit code and what it prints.
// All objects below are invented (a fictional "checkout" product).

type outcome struct {
	stdout, stderr string
	code           int
}

func (o outcome) out() string { return o.stdout + o.stderr }

func dyna(args ...string) outcome {
	var out, errb bytes.Buffer
	code := app.Run(args, app.IO{Stdin: strings.NewReader(""), Stdout: &out, Stderr: &errb, Env: func(string) string { return "" }})
	return outcome{out.String(), errb.String(), code}
}

func write(t *testing.T, md string) string {
	t.Helper()
	file := filepath.Join(t.TempDir(), "proposal.md")
	if err := os.WriteFile(file, []byte(md), 0o644); err != nil {
		t.Fatal(err)
	}
	return file
}

// run checks md as `table submit` does.
func run(t *testing.T, md string, flags ...string) outcome {
	t.Helper()
	return dyna(append([]string{"dreaming", "table", "submit", write(t, md)}, flags...)...)
}

// split runs `table split`; out is the --out file ("" prints).
func split(t *testing.T, md string, flags ...string) outcome {
	t.Helper()
	return dyna(append([]string{"dreaming", "table", "split", write(t, md)}, flags...)...)
}

const (
	head    = "| 对象 | 发现 | 证据 | 建议处置 | 选项 |\n|---|---|---|---|---|"
	imgProd = "![档案里的](docs/design/prod/pages/cart/assets/cart--empty.png)"
	imgTmp  = "![现在的](docs/design/tmp/dreaming-2026-10-19/delta/pages/cart/assets/cart--empty.png)"
	opts    = "批 / 不批 / 改成…"
	imgCard = "![促销卡](docs/design/prod/components/PromoCard/assets/promo-card.png)"
)

type rowT []string

// section is `## <row type>` then the shared header and the given rows (each of 5 cells).
func section(typ string, rows ...rowT) string {
	var lines []string
	for _, r := range rows {
		lines = append(lines, "| "+strings.Join(r, " | ")+" |")
	}
	return fmt.Sprintf("## %s\n\n%s\n%s\n", typ, head, strings.Join(lines, "\n"))
}

// rows holds one valid row per row type; tests bend a single cell of a single section.
var rows = map[string]rowT{
	"文档":           {"docs/spec/cart-promo/cart-promo.md", "自称 在飞；代码物已在树上", "src/cart/promo.ts", "写 ADR 删 spec", opts},
	"档案对象":         {"components/PromoBadge", "挂的代码路径 src/ui/PromoBadge.tsx 已不存在", "仓库里无此路径；引用：pages/cart--empty 的区域「促销」、边 pages/cart--list#open-promo", "删对象", opts},
	"档案状态":         {"pages/cart--empty", "档案过期：空购物车文案改了，引用的代码自上次改动有提交 3 次", imgProd + " " + imgTmp, "替换档案", opts},
	"初扫页面":         {"pages/wishlist", "档案里没有这一页；路由 /wishlist 可进", "docs/design/tmp/dreaming-2026-10-19/delta/pages/wishlist/wishlist.md", "新增页面", opts},
	"候选":           {"候选：卡片内边距统一 16px（组件 PromoCard、OrderCard 重复，共 2 次）", "与已有规则「卡片内边距 12px」矛盾", imgCard + " 并进：Components · 卡片；旧：「卡片内边距 12px」→ 新：「卡片内边距 16px」", "改写已有规则", opts},
	"DESIGN.md 条目": {"Motion 章第 3 条", "带日期的先例：不该在文件里", "DESIGN.md 第 88 行；旧：「结账页弹层淡入 0.2s（2026-07-16 定）」→ 删；依据：design-modeling「明确不进 DESIGN.md 的内容」里的带日期的先例", "删除", opts},
	"漏归档":          {"docs/design/tmp/cart-promo/", "spec 已是「完成」，origin/main 上 tmp/cart-promo/ 里还留着画布与 delta（绕过合并步骤合进去的）", "git ls-tree origin/main docs/design/tmp/cart-promo/；spec 状态：完成", "补归档", opts},
	"retro 候选":     {"候选：下单前先核对自动填好的字段（落点 `idea-loop:seo-outreach`）", "出现 3 次（harold-skills#108、#112、#115）；无已推翻；无反例", "#108：「留在候选吧。」；决定记录：[[108]]", "开 issue：改 skill", opts},
	"记忆":           {"memory/acme-shop-launch-batch.md", "只讲 acme-shop 的上线批次，别的项目用不到", "正文第一句「On acme-shop」；frontmatter originSessionId 的工作目录是 acme-shop", "挪进项目", opts},
	"缺陷":           {"pages/cart--checkout", "产品坏了：结算按钮点了没反应（也可能是档案没跟上）；控制台 TypeError", imgProd + " " + imgTmp, "开 issue", opts},
}

var types = []string{"文档", "档案对象", "档案状态", "初扫页面", "候选", "DESIGN.md 条目", "漏归档", "retro 候选", "记忆", "缺陷"}

// sample is a table with every row type; over replaces the rows of a type (an empty slice drops them).
func sample(over map[string][]rowT) string {
	var secs []string
	for _, typ := range types {
		r, ok := over[typ]
		if !ok {
			r = []rowT{rows[typ]}
		}
		secs = append(secs, section(typ, r...))
	}
	return "# 提议表 2026-10-19\n\n" + strings.Join(secs, "\n")
}

func with(typ string, i int, cell string) []rowT {
	r := append(rowT(nil), rows[typ]...)
	r[i] = cell
	return []rowT{r}
}

func withDisposition(typ, d string) []rowT { return with(typ, 3, d) }
func withEvidence(typ, e string) []rowT    { return with(typ, 2, e) }
func withFinding(typ, finding string, disposition ...string) []rowT {
	r := with(typ, 1, finding)
	if len(disposition) > 0 {
		r[0][3] = disposition[0]
	}
	return r
}

func over(typ string, r []rowT) map[string][]rowT { return map[string][]rowT{typ: r} }

func mustMatch(t *testing.T, re, s string) {
	t.Helper()
	if !regexp.MustCompile(re).MatchString(s) {
		t.Fatalf("%q does not match %q", s, re)
	}
}

func mustNotMatch(t *testing.T, re, s string) {
	t.Helper()
	if regexp.MustCompile(re).MatchString(s) {
		t.Fatalf("%q matches %q", s, re)
	}
}

func code(t *testing.T, want int, o outcome) {
	t.Helper()
	if o.code != want {
		t.Fatalf("exit %d, want %d:\n%s", o.code, want, o.out())
	}
}

func TestAWellFormedProposalTableEveryRowTypePresentExitsZero(t *testing.T) {
	code(t, 0, run(t, sample(nil)))
}

func TestAMissedArchiveRowWithFillOrDiscardPasses(t *testing.T) {
	for _, d := range []string{"补归档", "丢弃", "丢弃（画布已作废）"} {
		code(t, 0, run(t, sample(over("漏归档", withDisposition("漏归档", d)))))
	}
}

func TestAMissedArchiveRowOutsideTheClosedSetFailsAndNamesIt(t *testing.T) {
	r := run(t, sample(over("漏归档", withDisposition("漏归档", "归档"))))
	code(t, 2, r)
	mustMatch(t, `漏归档`, r.out())
	mustMatch(t, `「归档」`, r.out())
	mustMatch(t, `补归档 / 丢弃`, r.out())
}

func TestASectionThatIsNotAKnownRowTypeFailsAndIsNamed(t *testing.T) {
	r := run(t, sample(nil)+"\n"+section("随便写点什么", rowT{"x", "y", "z", "驳回", opts}))
	code(t, 2, r)
	mustMatch(t, `随便写点什么`, r.out())
	mustMatch(t, `行类型`, r.out())
}

func TestADispositionOutsideTheRowTypesClosedSetFailsAndNamesTheSectionTheCellAndTheLegalSet(t *testing.T) {
	r := run(t, sample(over("档案对象", withDisposition("档案对象", "顺手重构一下"))))
	code(t, 2, r)
	mustMatch(t, `档案对象`, r.out())
	mustMatch(t, `顺手重构一下`, r.out())
	mustMatch(t, `改代码路径`, r.out()) // the legal set is listed, so the human can fix the cell
}

func TestADispositionThatIsLegalForAnotherRowTypeIsStillWrongHere(t *testing.T) {
	// 「删除」 is a legal DESIGN.md disposition, not a legal archive-object one.
	code(t, 2, run(t, sample(over("档案对象", withDisposition("档案对象", "删除")))))
}

func TestANoteInParenthesesAfterALegalDispositionIsAllowedAlreadyHasNeedsARealNumber(t *testing.T) {
	code(t, 0, run(t, sample(over("文档", withDisposition("文档", "订正（路径改名）")))))
	code(t, 0, run(t, sample(over("缺陷", withDisposition("缺陷", "已有 #57")))))
	code(t, 2, run(t, sample(over("缺陷", withDisposition("缺陷", "已有 #N")))))
}

func TestAnArchiveStateRowWithOnlyOnePictureFailsAndSaysTwoAreNeeded(t *testing.T) {
	r := run(t, sample(over("档案状态", withEvidence("档案状态", imgTmp))))
	code(t, 2, r)
	mustMatch(t, `档案状态`, r.out())
	mustMatch(t, `两张图`, r.out())
}

func TestAnArchiveStateRowWhoseSecondPictureIsNotUnderTmpFails(t *testing.T) {
	both := imgProd + " ![现在的](docs/design/prod/pages/cart/assets/other.png)"
	r := run(t, sample(over("档案状态", withEvidence("档案状态", both))))
	code(t, 2, r)
	mustMatch(t, `tmp/`, r.out())
}

func TestAnArchiveStateRowWhoseFirstPictureIsNotTheArchivesOwnFails(t *testing.T) {
	r := run(t, sample(over("档案状态", withEvidence("档案状态", imgTmp+" "+imgTmp))))
	code(t, 2, r)
	mustMatch(t, `prod/`, r.out())
}

func TestAStateTheProductCannotReachIsTheOneArchiveRowThatCarriesNoPictures(t *testing.T) {
	unreachable := []rowT{{"pages/cart--gift", "进不去：礼品卡状态需要一个未发放的礼品账号", "缺：一个未发放的礼品账号；试过：直接输入礼品码、从订单页进入", "补进不去说明", opts}}
	code(t, 0, run(t, sample(over("档案状态", unreachable))))
}

func TestADeleteObjectRowHasToNameWhoRefersToTheObject(t *testing.T) {
	noRefs := []rowT{{"components/PromoBadge", "挂的代码路径 src/ui/PromoBadge.tsx 已不存在", "仓库里无此路径", "删对象", opts}}
	r := run(t, sample(over("档案对象", noRefs)))
	code(t, 2, r)
	mustMatch(t, `档案对象`, r.out())
	mustMatch(t, `引用`, r.out())
	none := []rowT{{"components/PromoBadge", "没有任何节点、边、用户路径引用它", "引用：无", "删对象", opts}}
	code(t, 0, run(t, sample(over("档案对象", none)))) // "引用：无" is an answer; silence is not
	other := []rowT{{"components/PromoBadge", "挂的代码路径改名了", "重命名记录指向 src/ui/Badge.tsx", "改代码路径", opts}}
	code(t, 0, run(t, sample(over("档案对象", other)))) // only 删对象 needs the referrers
}

func TestACannotEnterStateRowSaysWhatWasMissingAndWhatWasTried(t *testing.T) {
	vague := []rowT{{"pages/cart--gift", "进不去：礼品卡状态进不去", "走不通", "补进不去说明", opts}}
	r := run(t, sample(over("档案状态", vague)))
	code(t, 2, r)
	mustMatch(t, `缺`, r.out())
	mustMatch(t, `试过`, r.out())
}

func TestADefectRowAboutABrokenStateNeedsTheSameTwoPicturesARuleVersusCodeDefectDoesNot(t *testing.T) {
	noPics := []rowT{{"pages/cart--checkout", "产品坏了：结算按钮点了没反应", "控制台 TypeError", "开 issue", opts}}
	r := run(t, sample(over("缺陷", noPics)))
	code(t, 2, r)
	mustMatch(t, `两张图`, r.out())
	ruleVsCode := []rowT{{"DESIGN.md 的 Motion 章第 1 条", "法对代码错：规则要求全站 0.2s，结算页写死 0.5s", "src/checkout/Button.css 第 12 行", "开 issue", opts}}
	code(t, 0, run(t, sample(over("缺陷", ruleVsCode))))
}

func TestACandidateRowShowsTheUIItIsAboutOrSaysWhyThereIsNone(t *testing.T) {
	r := run(t, sample(over("候选", withEvidence("候选", "并进：Components · 卡片；旧：「12px」→ 新：「16px」"))))
	code(t, 2, r)
	mustMatch(t, `候选`, r.out())
	mustMatch(t, `截图|图`, r.out())
	noUI := []rowT{{"候选：通用原则：只有会丢东西时才确认", "换个产品也成立", "无图：说的是确认的时机，没有单独一块界面", "起草通用原则 issue", opts}}
	code(t, 0, run(t, sample(over("候选", noUI)))) // "无图：" with a reason is an answer
}

func TestACandidateHeadedForDesignMdSaysWhereItLandsAndShowsTheOldAndNewText(t *testing.T) {
	noPlace := run(t, sample(over("候选", withEvidence("候选", imgCard+" 旧：「12px」→ 新：「16px」"))))
	code(t, 2, noPlace)
	mustMatch(t, `并进`, noPlace.out())
	noText := run(t, sample(over("候选", withEvidence("候选", imgCard+" 并进：Components · 卡片"))))
	code(t, 2, noText)
	mustMatch(t, `旧文与新文`, noText.out())
	stays := []rowT{{"候选：结算弹层的版式", "只对这个组件成立", imgCard, "留在原处", opts}}
	code(t, 0, run(t, sample(over("候选", stays)))) // only the dispositions that write DESIGN.md need the text
}

func TestADesignMdRowNamesTheStandardItRestsOn(t *testing.T) {
	none := run(t, sample(over("DESIGN.md 条目", withEvidence("DESIGN.md 条目", "旧：「弹层淡入 0.2s（2026-07-16 定）」→ 删"))))
	code(t, 2, none)
	mustMatch(t, `依据`, none.out())
	vague := run(t, sample(over("DESIGN.md 条目", withEvidence("DESIGN.md 条目", "旧：「…」→ 删；依据：不太好"))))
	code(t, 2, vague)
	lint := []rowT{{"front matter colors.border", "lint 报定义了没被引用", "旧：「border: '#e2e8f0'」→ 新：同值，omitted 里补一句说明；依据：官方 lint orphaned-tokens", "处理 lint 警告", opts}}
	code(t, 0, run(t, sample(over("DESIGN.md 条目", lint)))) // a lint rule name is a named standard
}

func TestADesignMdRowShowsTheTextBeforeAndAfterARulingRowKeepsItsNewTextsInTheOptions(t *testing.T) {
	noOld := run(t, sample(over("DESIGN.md 条目", withEvidence("DESIGN.md 条目", "依据：「明确不进 DESIGN.md 的内容」里的带日期的先例"))))
	code(t, 2, noOld)
	mustMatch(t, `改前`, noOld.out())
	noNew := []rowT{{"Shapes 章", "规则写 8px，代码是 10px", "旧：「圆角 8px」；依据：「对账」法和代码对不上", "合并为一条", opts}}
	r := run(t, sample(over("DESIGN.md 条目", noNew)))
	code(t, 2, r)
	mustMatch(t, `改后`, r.out())
	ruling := []rowT{{"Shapes 章", "规则写 8px，代码是 10px", "旧：「圆角 8px」；依据：「对账」法和代码对不上", "交人裁决", "A 改法 → 新：「圆角 10px」/ B 代码错：开 issue"}}
	code(t, 0, run(t, sample(over("DESIGN.md 条目", ruling))))
}

const broken = "产品坏了：结算按钮点了没反应（也可能是档案没跟上）；控制台 TypeError"

func TestABrokenProductRowNeverCarriesTheReplaceTheArchiveDispositionInTheDefectSection(t *testing.T) {
	r := run(t, sample(over("缺陷", withFinding("缺陷", broken, "替换档案"))))
	code(t, 2, r)
	mustMatch(t, `产品坏了`, r.out())
	mustMatch(t, `替换档案`, r.out())
	mustMatch(t, `不许|不能`, r.out())
}

func TestABrokenProductRowNeverCarriesTheReplaceTheArchiveDispositionInTheArchiveStateSectionEither(t *testing.T) {
	r := run(t, sample(over("档案状态", withFinding("档案状态", broken, "替换档案"))))
	code(t, 2, r)
	mustMatch(t, `(?s)产品坏了.*替换档案|替换档案.*产品坏了`, r.out())
}

func TestABrokenProductRowInTheArchiveStateSectionIsMisfiled(t *testing.T) {
	r := run(t, sample(over("档案状态", withFinding("档案状态", broken, "改进入方式"))))
	code(t, 2, r)
	mustMatch(t, `缺陷`, r.out())
}

func TestAnArchiveStateRowsVerdictMustMatchWhatItProposesToDo(t *testing.T) {
	r := run(t, sample(over("档案状态", withFinding("档案状态", "档案过期：文案改了", "改进入方式"))))
	code(t, 2, r)
	mustMatch(t, `档案过期`, r.out())
	noVerdict := run(t, sample(over("档案状态", withFinding("档案状态", "文案改了"))))
	code(t, 2, noVerdict)
	mustMatch(t, `判定`, noVerdict.out())
}

func TestADefectRowOpensWithBrokenProductOrRuleRight(t *testing.T) {
	r := run(t, sample(over("缺陷", withFinding("缺陷", "按钮有点怪"))))
	code(t, 2, r)
	mustMatch(t, `(?s)产品坏了.*法对代码错|法对代码错.*产品坏了`, r.out())
}

func TestAnInitialScanPageRowMustPointAtWhatItBuiltUnderTmp(t *testing.T) {
	r := run(t, sample(over("初扫页面", withEvidence("初扫页面", "docs/design/prod/pages/wishlist/wishlist.md"))))
	code(t, 2, r)
	mustMatch(t, `初扫页面`, r.out())
	mustMatch(t, `tmp/`, r.out())
}

// referenceFile is the dreaming reference that prints the table's sample and lists its row types. The two tests
// that hold the document and the check together are skipped once the reference has moved or gone.
func referenceFile(t *testing.T) string {
	t.Helper()
	p := filepath.Join("..", "..", "..", "idea-loop", "skills", "productivity", "dreaming", "references", "proposal-table.md")
	b, err := os.ReadFile(p)
	if err != nil {
		t.Skip("the reference is not there: " + err.Error())
	}
	return string(b)
}

func refSample(t *testing.T) string {
	m := regexp.MustCompile("(?s)```markdown\n(# 提议表.*?)\n```").FindStringSubmatch(referenceFile(t))
	if m == nil {
		t.Fatal("the reference carries no ```markdown sample table")
	}
	return m[1]
}

func TestTheSampleTablePrintedInTheDreamingReferenceIsItselfValid(t *testing.T) {
	code(t, 0, run(t, refSample(t)))
}

func TestEveryRowTypeAndDispositionTheReferenceListsIsOneTheCheckAcceptsAndNothingMore(t *testing.T) {
	ref := referenceFile(t)
	trail := regexp.MustCompile(`（.*$`)
	for _, typ := range dreaming.RowTypes {
		var line string
		for _, l := range strings.Split(ref, "\n") {
			if strings.HasPrefix(l, "| `"+typ.Name+"`") {
				line = l
				break
			}
		}
		if line == "" {
			t.Fatalf("the reference has no row for the %s row type", typ.Name)
		}
		var listed []string
		for _, d := range strings.Split(strings.Split(line, "|")[3], "·") {
			listed = append(listed, trail.ReplaceAllString(strings.TrimSpace(d), ""))
		}
		var want []string
		for _, d := range typ.Dispositions {
			want = append(want, trail.ReplaceAllString(d, ""))
		}
		if strings.Join(listed, "\x00") != strings.Join(want, "\x00") {
			t.Errorf("%s dispositions drifted: %v vs %v", typ.Name, listed, want)
		}
	}
}

func TestARetroCandidateRowWithALegalDispositionPassesAllFourOfThem(t *testing.T) {
	for _, d := range []string{"开 issue：机械检查", "开 issue：改 skill", "留在池里", "驳回", "驳回（理由已写在候选文件里）"} {
		code(t, 0, run(t, sample(over("retro 候选", withDisposition("retro 候选", d)))))
	}
}

func TestARetroCandidateRowProposingImproveSkillIsOutsideTheClosedSet(t *testing.T) {
	r := run(t, sample(over("retro 候选", withDisposition("retro 候选", "改进 skill"))))
	code(t, 2, r)
	mustMatch(t, `retro 候选`, r.out())
	mustMatch(t, `「改进 skill」`, r.out())
	mustMatch(t, `开 issue：机械检查 / 开 issue：改 skill / 留在池里 / 驳回`, r.out())
}

func TestARetroCandidateRowWithAnEmptyEvidenceCellFails(t *testing.T) {
	r := run(t, sample(over("retro 候选", withEvidence("retro 候选", ""))))
	code(t, 2, r)
	mustMatch(t, `retro 候选`, r.out())
	mustMatch(t, `证据`, r.out())
}

func TestADispositionOfTheOtherCandidateSectionDoesNotCarryOverToRetroCandidates(t *testing.T) {
	code(t, 2, run(t, sample(over("retro 候选", withDisposition("retro 候选", "起草通用原则 issue")))))
}

func emptySections(placeholder string) string {
	var secs []string
	for _, typ := range types {
		secs = append(secs, fmt.Sprintf("## %s\n\n%s\n", typ, placeholder))
	}
	return strings.Join(secs, "\n")
}

func parsed(t *testing.T, o outcome) (res struct {
	Valid  bool
	Empty  bool
	Errors []string
	Counts map[string]int
}) {
	t.Helper()
	if err := json.Unmarshal([]byte(o.stdout), &res); err != nil {
		t.Fatalf("%v: %s", err, o.out())
	}
	return res
}

func TestATableWithNoRowsAnywhereIsEmptyValidAndReportedAsEmpty(t *testing.T) {
	for _, body := range []string{head, "无"} {
		r := run(t, "# 提议表 2026-10-19\n\n"+emptySections(body), "--json")
		code(t, 0, r)
		if !parsed(t, r).Empty {
			t.Fatal(r.out())
		}
	}
	text := run(t, "# 提议表 2026-10-19\n\n"+emptySections("无"))
	mustMatch(t, `空表`, text.out())
}

func TestATableWithEvenOneRowIsNotEmpty(t *testing.T) {
	r := run(t, sample(map[string][]rowT{"候选": nil, "缺陷": nil, "档案状态": nil, "初扫页面": nil, "档案对象": nil, "DESIGN.md 条目": nil, "retro 候选": nil, "记忆": nil}), "--json")
	code(t, 0, r)
	p := parsed(t, r)
	if p.Empty || p.Counts["文档"] != 1 {
		t.Fatal(r.out())
	}
}

func TestANoteThatSomethingWasLeftUnscannedDoesNotMakeAnEmptyTableNonEmpty(t *testing.T) {
	md := "# 提议表\n\n" + emptySections("无") + "\n## 初扫页面\n\n未扫：/wishlist、/settings（本次时间用完）\n"
	// a second 初扫页面 section is a duplicate: the note belongs inside the first one
	code(t, 2, run(t, md))
	inside := "# 提议表\n\n" + strings.Replace(emptySections("无"), "## 初扫页面\n\n无", "## 初扫页面\n\n无\n未扫：/wishlist、/settings（本次时间用完）", 1)
	r := run(t, inside, "--json")
	code(t, 0, r)
	if !parsed(t, r).Empty {
		t.Fatal(r.out())
	}
}

func TestAFileWithNoSectionsAtAllIsNotAnEmptyTable(t *testing.T) {
	r := run(t, "# 提议表 2026-10-19\n\n本周没什么事。\n")
	code(t, 2, r)
	mustMatch(t, `一节都没有|没有任何`, r.out())
}

func TestTheSameSectionTwiceIsAnErrorNotASecondChance(t *testing.T) {
	r := run(t, sample(nil)+"\n"+section("文档", rows["文档"]))
	code(t, 2, r)
	mustMatch(t, `重复`, r.out())
}

func TestARowWithAnEmptyCellOrTheWrongNumberOfCellsFails(t *testing.T) {
	blank := with("文档", 2, "")
	code(t, 2, run(t, sample(over("文档", blank))))
	code(t, 2, run(t, sample(over("文档", []rowT{rows["文档"][:4]}))))
}

// ---------- 开头的说明行：全量还是增量，上一张还没处理 ----------

const (
	scopeLine    = "对账范围：增量——自 2026-10-12 的提交 a1b2c3d 起，改过的代码牵到 3 个状态（档案共 42 个）"
	previousLine = "上一次（2026-10-12）的提议表还没处理"
)

func withOpening(md string, lines ...string) string {
	i := strings.Index(md, "\n")
	return md[:i+1] + "\n" + strings.Join(lines, "\n\n") + "\n" + md[i+1:]
}

func TestOpeningLinesUnderTheTitleDoNotMakeTheTableInvalid(t *testing.T) {
	r := run(t, withOpening(sample(nil), scopeLine, previousLine), "--json")
	code(t, 0, r)
	base := parsed(t, run(t, sample(nil), "--json"))
	got := parsed(t, r)
	if fmt.Sprint(got.Counts) != fmt.Sprint(base.Counts) {
		t.Fatal(got.Counts, base.Counts)
	}
}

func TestOpeningLinesAreNotRowsAnOtherwiseEmptyTableStaysEmpty(t *testing.T) {
	r := run(t, withOpening("# 提议表 2026-10-19\n\n"+emptySections("无"), scopeLine, previousLine), "--json")
	code(t, 0, r)
	if !parsed(t, r).Empty {
		t.Fatal(r.out())
	}
}

func TestABatchThatDidNotRunNotedAtTheEndIsANoteAndNotARow(t *testing.T) {
	note := "没跑成的批：pantry 页的 2 个状态（开发服务没起来）。下次可说全量补上。"
	r := run(t, sample(nil)+"\n"+note+"\n", "--json")
	code(t, 0, r)
	if parsed(t, r).Counts["缺陷"] != 1 {
		t.Fatal(r.out())
	}
	empty := run(t, "# 提议表 2026-10-19\n\n"+emptySections("无")+"\n"+note+"\n", "--json")
	if !parsed(t, empty).Empty {
		t.Fatal(empty.out())
	}
}

// ---------- 拆表：把要问人的行抽成一张小表 ----------

func docRow(object, disposition string, more ...string) string {
	finding, evidence := "对不上", "docs/guide/checkout.md 第 3 行"
	if len(more) > 0 {
		finding = more[0]
	}
	if len(more) > 1 {
		evidence = more[1]
	}
	return fmt.Sprintf("| %s | %s | %s | %s | %s |", object, finding, evidence, disposition, opts)
}

// withDocRows appends rows right under the one 文档 row the reference sample carries.
func withDocRows(md string, extra ...string) string {
	re := regexp.MustCompile(`(?m)^(\| docs/spec/cart-promo/cart-promo\.md .*)$`)
	return re.ReplaceAllString(md, "${1}\n"+strings.Join(extra, "\n"))
}

func sectionTitles(md string) []string {
	var out []string
	for _, m := range regexp.MustCompile(`(?m)^## (.+)$`).FindAllStringSubmatch(md, -1) {
		out = append(out, m[1])
	}
	return out
}

func sameTitles(t *testing.T, got string, want ...string) {
	t.Helper()
	if fmt.Sprint(sectionTitles(got)) != fmt.Sprint(want) {
		t.Fatalf("sections %v, want %v\n%s", sectionTitles(got), want, got)
	}
}

func TestSplittingTheReferenceSamplePlusAGlossaryAndAnAlarmRowLeavesTheRightSections(t *testing.T) {
	md := withDocRows(refSample(t), docRow("GLOSSARY.md", "订正", "「结算」条目写的是旧流程"), docRow("docs/guide/checkout.md", "报警", "链接指向的页面不存在"))
	r := split(t, md)
	code(t, 0, r)
	sameTitles(t, r.stdout, "文档", "候选", "DESIGN.md 条目")
	mustMatch(t, `\| GLOSSARY\.md \|`, r.stdout)
	mustMatch(t, `\| docs/guide/checkout\.md \|`, r.stdout)
	mustNotMatch(t, `写 ADR 删 spec`, r.stdout)
	mustNotMatch(t, `pages/cart--empty|pages/cart--checkout|retro|漏归档`, r.stdout)
	mustMatch(t, `卡片内边距统一 16px`, r.stdout)  // the 候选 row, whole section
	mustMatch(t, `Motion 章第 3 条`, r.stdout) // the DESIGN.md row, whole section
}

func TestTheSmallTableKeepsTheTitleTheOpeningLinesAndTheFiveColumnsAndIsItselfValid(t *testing.T) {
	md := withDocRows(refSample(t), docRow("GLOSSARY.md", "订正"))
	out := filepath.Join(t.TempDir(), "ask.md")
	r := split(t, md, "--out", out)
	code(t, 0, r)
	b, err := os.ReadFile(out)
	if err != nil {
		t.Fatal(err)
	}
	small := string(b)
	mustMatch(t, `^# 提议表 2026-10-19\n`, small)
	mustMatch(t, `对账范围：增量——`, small)
	mustMatch(t, `上一次（2026-10-12）的提议表还没处理`, small)
	mustMatch(t, `\| 对象 \| 发现 \| 证据 \| 建议处置 \| 选项 \|`, small)
	code(t, 0, run(t, small))     // the small table passes the same check as the full one
	mustMatch(t, `3 行`, r.stdout) // the terminal says how many rows went to the file
}

func TestATableWithOnlyAutomaticRowsSplitsToNothingAndTheOutputSaysThereIsNoRowToAsk(t *testing.T) {
	md := "# 提议表 2026-10-19\n\n" + strings.Join([]string{
		section("文档", rowT{"docs/guide/checkout.md", "路径改名", "src/cart/promo.ts", "订正", opts}),
		section("档案状态", rows["档案状态"]),
		section("缺陷", rows["缺陷"]),
		section("retro 候选", rows["retro 候选"]),
	}, "\n")
	r := split(t, md)
	code(t, 0, r)
	mustMatch(t, `无问人的行`, r.out())
	mustNotMatch(t, `(?m)^## `, r.out())
}

func TestWithAFileGivenAndNothingToAskNoFileIsWritten(t *testing.T) {
	out := filepath.Join(t.TempDir(), "ask.md")
	r := split(t, "# 提议表 2026-10-19\n\n"+emptySections("无"), "--out", out)
	code(t, 0, r)
	mustMatch(t, `无问人的行`, r.out())
	if _, err := os.Stat(out); !os.IsNotExist(err) {
		t.Fatal("a file was written", err)
	}
}

func TestAnAlarmOrAskDispositionWithAParentheticalNoteStillGoesToTheHumanOtherDocRowsDoNot(t *testing.T) {
	md := func(d string) string {
		return "# 提议表 2026-10-19\n\n" + section("文档", rowT{"docs/guide/checkout.md", "链接失效", "x", d, opts})
	}
	for _, d := range []string{"报警（链接失效）", "报警 (link dead)", "问人（两份文档说法相反）", "问人"} {
		r := split(t, md(d))
		code(t, 0, r)
		sameTitles(t, r.stdout, "文档")
	}
	for _, d := range []string{"订正", "写 ADR 删 spec", "写 ADR 未采纳删 spec", "标注被取代", "删漏网工单", "迁移布局", "删除", "订正（路径改名）"} {
		mustMatch(t, `无问人的行`, split(t, md(d)).out())
	}
}

func TestGlossaryAsTheObjectGoesToTheHumanWhateverTheDispositionAPathThatMerelyContainsItDoesNot(t *testing.T) {
	md := func(object, d string) string {
		return "# 提议表 2026-10-19\n\n" + section("文档", rowT{object, "对不上", "x", d, opts})
	}
	for _, d := range []string{"订正", "删除", "标注被取代"} {
		sameTitles(t, split(t, md("GLOSSARY.md", d)).stdout, "文档")
	}
	sameTitles(t, split(t, md("GLOSSARY.md 第 12 行「结算」条目", "订正")).stdout, "文档")
	sameTitles(t, split(t, md("`GLOSSARY.md`", "订正")).stdout, "文档")
	mustMatch(t, `无问人的行`, split(t, md("docs/old/GLOSSARY.md.bak", "删除")).out())
}

func TestEveryRowInCandidatesAndDesignMdGoesToTheHumanWhateverItsDisposition(t *testing.T) {
	rejected := rowT{"候选：通用原则：只有会丢东西时才确认", "换个产品也成立", "无图：说的是确认的时机", "驳回", opts}
	r := split(t, "# 提议表 2026-10-19\n\n"+section("候选", rejected)+"\n"+section("DESIGN.md 条目", rows["DESIGN.md 条目"]))
	code(t, 0, r)
	sameTitles(t, r.stdout, "候选", "DESIGN.md 条目")
}

func TestACellWithAnEscapedPipeSurvivesTheSplit(t *testing.T) {
	row := rowT{"GLOSSARY.md", `写成了 a \| b`, "x", "订正", opts}
	r := split(t, "# 提议表 2026-10-19\n\n"+section("文档", row))
	mustMatch(t, `a \\\| b`, r.stdout)
	code(t, 0, run(t, r.stdout))
}

func TestATableThatIsNotValidIsReportedAsBeforeWithTheSameExitCodeAndIsNotSplit(t *testing.T) {
	bad := sample(over("文档", withDisposition("文档", "顺手重构一下")))
	file := write(t, bad)
	plain := dyna("dreaming", "table", "submit", file)
	withSplit := dyna("dreaming", "table", "split", file)
	if plain.code != 2 || withSplit.code != 2 {
		t.Fatal(plain, withSplit)
	}
	mustMatch(t, `顺手重构一下`, withSplit.out())
	mustNotMatch(t, `(?m)^# 提议表`, withSplit.out())
	if plain.stdout != withSplit.stdout {
		t.Fatalf("not the same report:\n%s\n%s", plain.stdout, withSplit.stdout)
	}
}

// ---------- 记忆：设备上那一份记忆的整理行 ----------

var memoryDispositions = []string{"挪进项目", "合并", "订正", "毕业", "删除", "缩短索引行", "问人"}

func memoryRow(object, disposition string) rowT {
	return rowT{object, "两条规矩对同一情形给出相反的做法", "feedback-a.md 第 3 行；feedback-b.md 第 5 行", disposition, opts}
}

func memoryTable(rs ...rowT) string { return "# 提议表 2026-10-19\n\n" + section("记忆", rs...) }

func TestEveryLegalMemoryDispositionPassesANoteAfterItIsFine(t *testing.T) {
	for _, d := range append(append([]string{}, memoryDispositions...), "挪进项目（acme-shop）") {
		code(t, 0, run(t, memoryTable(memoryRow("memory/a.md", d))))
	}
}

func TestAMemoryRowProposingArchiveIsOutsideTheClosedSet(t *testing.T) {
	r := run(t, memoryTable(memoryRow("memory/a.md", "归档")))
	code(t, 2, r)
	mustMatch(t, `记忆`, r.out())
	mustMatch(t, `「归档」`, r.out())
	mustMatch(t, `挪进项目 / 合并 / 订正 / 毕业 / 删除 / 缩短索引行 / 问人`, r.out())
}

func TestADispositionOfAnotherRowTypeDoesNotCarryOverToMemory(t *testing.T) {
	for _, d := range []string{"补归档", "驳回", "写 ADR 删 spec"} {
		code(t, 2, run(t, memoryTable(memoryRow("memory/a.md", d))))
	}
}

func TestSplitPullsOnlyTheAskRowOutOfAMemorySection(t *testing.T) {
	md := memoryTable(memoryRow("memory/feedback-a.md", "问人"), memoryRow("memory/acme-shop-launch-batch.md", "挪进项目"))
	r := split(t, md)
	code(t, 0, r)
	sameTitles(t, r.stdout, "记忆")
	mustMatch(t, `memory/feedback-a\.md`, r.stdout)
	mustNotMatch(t, `acme-shop-launch-batch`, r.stdout)
	mustMatch(t, `memory/feedback-a\.md`, split(t, strings.Replace(md, "| 问人 |", "| 问人（相反） |", 1)).out())
}

func TestAMemorySectionWithNoAskRowSplitsToNothing(t *testing.T) {
	r := split(t, memoryTable(memoryRow("memory/a.md", "合并"), memoryRow("memory/b.md", "毕业")))
	mustMatch(t, `无问人的行`, r.out())
	mustNotMatch(t, `(?m)^## `, r.out())
}

// ---------- the new command's own seams ----------

func TestSplitWithAnEmptyOutNameOrNoFileIsAUsageError(t *testing.T) {
	file := write(t, sample(nil))
	code(t, 1, dyna("dreaming", "table", "split", file, "--out="))
	code(t, 1, dyna("dreaming", "table", "split"))
	code(t, 1, dyna("dreaming", "table", "submit"))
	code(t, 1, dyna("dreaming", "table", "submit", filepath.Join(t.TempDir(), "nope.md")))
}

func TestSplitPrintsTheSmallTableWhenNoOutIsGiven(t *testing.T) {
	r := split(t, withDocRows(refSample(t), docRow("GLOSSARY.md", "订正")))
	code(t, 0, r)
	if !strings.HasPrefix(r.stdout, "# 提议表 2026-10-19\n") {
		t.Fatal(r.stdout)
	}
}

// ---------- the old script answers the same ----------

// The old script and dyna are asked the same question over the same tables and must answer the same, byte for
// byte, with the same exit code. The old script stays in the repository until the last ticket removes it; node
// runs it, and without node (or once it is gone) this test is skipped.
func TestTheOldScriptAnswersTheSame(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not installed")
	}
	script, _ := filepath.Abs(filepath.Join("..", "..", "..", "idea-loop", "scripts", "proposal-table-check.mjs"))
	if _, err := os.Stat(script); err != nil {
		t.Skip("the old script is gone")
	}
	tables := map[string]string{
		"sample":    sample(nil),
		"bad-disp":  sample(over("文档", withDisposition("文档", "顺手重构一下"))),
		"one-pic":   sample(over("档案状态", withEvidence("档案状态", imgTmp))),
		"broken":    sample(over("缺陷", withFinding("缺陷", broken, "替换档案"))),
		"empty":     "# 提议表 2026-10-19\n\n" + emptySections("无"),
		"no-sec":    "# 提议表 2026-10-19\n\n本周没什么事。\n",
		"dup":       sample(nil) + "\n" + section("文档", rows["文档"]),
		"unknown":   sample(nil) + "\n" + section("随便写点什么", rowT{"x", "y", "z", "驳回", opts}),
		"opening":   withOpening(sample(nil), scopeLine, previousLine),
		"memory":    memoryTable(memoryRow("memory/feedback-a.md", "问人"), memoryRow("memory/b.md", "合并")),
		"glossary":  "# 提议表 2026-10-19\n\n" + section("文档", rowT{"`GLOSSARY.md`", "对不上", "x", "订正", opts}, rowT{"docs/old/GLOSSARY.md.bak", "对不上", "x", "删除", opts}),
		"pipe":      "# 提议表 2026-10-19\n\n" + section("文档", rowT{"GLOSSARY.md", `写成了 a \| b`, "x", "订正", opts}),
		"fullwidth": "# 提议表 2026-10-19\n\n" + section("文档", rowT{"GLOSSARY.md", "全角　空格", "x", "订正　（路径改名）", opts}),
		"crlf":      strings.ReplaceAll(sample(nil), "\n", "\r\n"),
		"fenced":    "# 提议表 2026-10-19\n\n```\n## 文档\n```\n" + emptySections("无"),
		"bad-head":  "# 提议表\n\n## 文档\n\n| 对象 | 发现 |\n|---|---|\n| a | b |\n",
		"cols":      sample(over("文档", []rowT{rows["文档"][:4]})),
	}
	runOld := func(args ...string) (string, int) {
		cmd := exec.Command(node, append([]string{script}, args...)...)
		var out bytes.Buffer
		cmd.Stdout = &out
		c := 0
		if err := cmd.Run(); err != nil {
			ee, ok := err.(*exec.ExitError)
			if !ok {
				t.Fatal(err)
			}
			c = ee.ExitCode()
		}
		return out.String(), c
	}
	for name, md := range tables {
		file := write(t, md)
		for _, c := range []struct {
			old, new []string
		}{
			{nil, []string{"submit"}},
			{[]string{"--json"}, []string{"submit", "--json"}},
			{[]string{"--split-ask"}, []string{"split"}},
		} {
			wantOut, wantCode := runOld(append([]string{file}, c.old...)...)
			got := dyna(append(append([]string{"dreaming", "table"}, c.new[0], file), c.new[1:]...)...)
			if got.stdout != wantOut || got.code != wantCode {
				t.Errorf("%s %v: old (%d)\n%s\nnew (%d)\n%s", name, c.old, wantCode, wantOut, got.code, got.stdout)
			}
		}
		// --split-ask=<file> writes the same small table and says the same thing
		oldOut := filepath.Join(t.TempDir(), "old.md")
		newOut := filepath.Join(t.TempDir(), "new.md")
		oldSay, oldCode := runOld(file, "--split-ask="+oldOut)
		got := dyna("dreaming", "table", "split", file, "--out", newOut)
		oldFile, _ := os.ReadFile(oldOut)
		newFile, _ := os.ReadFile(newOut)
		if string(oldFile) != string(newFile) || oldCode != got.code || strings.ReplaceAll(oldSay, oldOut, "OUT") != strings.ReplaceAll(got.stdout, newOut, "OUT") {
			t.Errorf("%s --out: old (%d) %q %q; new (%d) %q %q", name, oldCode, oldSay, oldFile, got.code, got.stdout, newFile)
		}
	}
}
