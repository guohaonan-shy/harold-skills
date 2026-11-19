// Package seo is the `seo` module: the checks and plans the seo-scan flow, the post-build hook and the post-deploy
// check are made of. Every command reads files or a few gh and git answers and prints JSON (or a report) for the
// session to act on; none of them calls OpenSEO or the live site except `verify-live`, which fetches the pages it is
// given.
package seo

import (
	"fmt"
	"io"
	"math"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/home"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/issues"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/jsstr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
)

// Deps is what the commands reach outside the process through, so tests can stand in for gh, the clock, the live
// site and the environment.
type Deps struct {
	Env    home.Env
	Stdin  io.Reader
	Stdout io.Writer
	// GH makes a gh runner that runs in dir; nil means the real gh.
	GH func(dir string) issues.GH
	// Cwd is the directory `scope --base` runs git in; empty means the process's.
	Cwd string
	// Now is the clock; nil means time.Now.
	Now func() time.Time
	// Fetch gets a live page; nil means a real HTTP GET.
	Fetch Fetch
	// Sleep waits between two polls of `verify-live --wait`; nil means time.Sleep.
	Sleep func(ms float64)
}

func (d Deps) env() home.Env {
	if d.Env == nil {
		return home.OSEnv
	}
	return d.Env
}

func (d Deps) out() io.Writer {
	if d.Stdout == nil {
		return os.Stdout
	}
	return d.Stdout
}

func (d Deps) in() io.Reader {
	if d.Stdin == nil {
		return os.Stdin
	}
	return d.Stdin
}

func (d Deps) now() time.Time {
	if d.Now != nil {
		return d.Now()
	}
	return time.Now()
}

func (d Deps) runGH(dir string) issues.GH {
	if d.GH != nil {
		return d.GH(dir)
	}
	return issues.ExecRunner("gh", dir)
}

func (d Deps) fetch() Fetch {
	if d.Fetch != nil {
		return d.Fetch
	}
	return HTTPFetch()
}

func (d Deps) sleep(ms float64) {
	if d.Sleep != nil {
		d.Sleep(ms)
		return
	}
	time.Sleep(time.Duration(ms * float64(time.Millisecond)))
}

// ghFor is gh aimed at the repository of the project <docs> is the knowledge base of. <docs> is the docs/ of a
// project directory in home; a <docs> outside home stops with the project map's sentence.
func (d Deps) ghFor(docs string) (issues.GH, error) {
	found := home.LocateByDocs(docs, d.env())
	if !found.OK {
		return nil, found.Err()
	}
	return issues.InRepo(d.runGH(docs), found.Repo), nil
}

func (d Deps) printLine(s string) { fmt.Fprintln(d.out(), s) }

func leaf(use, short, next string, run func(cmd *cobra.Command, args []string) error) *cobra.Command {
	c := &cobra.Command{Use: use, Short: short, Args: cobra.ArbitraryArgs, SilenceUsage: true, SilenceErrors: true, RunE: run}
	registry.Mark(c, registry.CallerSession, next)
	return c
}

func arg(args []string, i int) string {
	if i < len(args) {
		return args[i]
	}
	return ""
}

func readJSONFile(file string) (any, error) {
	b, err := os.ReadFile(file)
	if err != nil {
		return nil, fmt.Errorf("读不到 %s：%s", file, strings.TrimPrefix(err.Error(), "open "+file+": "))
	}
	v, err := ParseJSON(b)
	if err != nil {
		return nil, fmt.Errorf("%s 不是 JSON：%v", file, err)
	}
	return v, nil
}

func usageErr(use string) error { return fmt.Errorf("usage: dyna seo %s", use) }

// Command is the `seo` module.
func Command(d Deps) *cobra.Command {
	root := registry.Group("seo", "SEO：SEO.md 的读取、扫描的预算与到期方向、产物检查与构建后钩子、发现开成 issue、上线自查与留档")
	root.AddCommand(
		d.parseCommand(), d.compareAuditsCommand(), d.allocateCommand(), d.checkCommand(), d.scopeCommand(),
		d.syncContextCommand(), d.dueCommand(), d.gapsCommand(), d.fileIssuesCommand(), d.verifyLiveCommand(),
		d.recordCommand(), d.provenanceCommand(),
	)
	return root
}

func (d Deps) parseCommand() *cobra.Command {
	const use = "parse <SEO.md>"
	return leaf(use, "读 SEO.md，打印九节内容的 JSON（站点、OpenSEO、竞品、重点页面、构建与检查、写作、品牌、内容原则、分析，和哪些项已确认）；读不了或写法不对退出 1", "", func(cmd *cobra.Command, args []string) error {
		if arg(args, 0) == "" {
			return usageErr("parse <SEO.md>")
		}
		seo, err := ReadSeoMd(args[0])
		if err != nil {
			return err
		}
		d.printLine(dump(seo))
		return nil
	})
}

func (d Deps) compareAuditsCommand() *cobra.Command {
	return leaf("compare-audits <SEO.md> <previous.json> <current.json>", "比对 OpenSEO 站点审计的上一次和这一次（get_audit_pages 的原始返回），打印重点页面回退的发现（方向 technical）：状态码、可索引、sitemap 是严重，title 和 description 变了是警告", "", func(cmd *cobra.Command, args []string) error {
		if len(args) < 3 || args[0] == "" || args[1] == "" || args[2] == "" {
			return usageErr("compare-audits <SEO.md> <上一次.json> <本次.json>")
		}
		seo, err := ReadSeoMd(args[0])
		if err != nil {
			return err
		}
		prev, err := readJSONFile(args[1])
		if err != nil {
			return err
		}
		cur, err := readJSONFile(args[2])
		if err != nil {
			return err
		}
		findings, err := Regressions(seo, prev, cur, d.now())
		if err != nil {
			return err
		}
		d.printLine(dump(findings))
		return nil
	})
}

func (d Deps) allocateCommand() *cobra.Command {
	c := leaf("allocate <SEO.md> <balance> [direction...]", "算这一轮扫描各方向本周能花多少 OpenSEO credits（按套餐额度、每周分配、已花的和余额下限）；不给方向只打印本周的账", "", func(cmd *cobra.Command, args []string) error {
		if len(args) < 2 || args[0] == "" {
			return usageErr("allocate <SEO.md> <余额> [<方向>...] [--spent <已花>] [--context <context.json>] [--today <YYYY-MM-DD>]")
		}
		spent := 0.0
		if v, _ := cmd.Flags().GetString("spent"); cmd.Flags().Changed("spent") {
			spent = jsNumber(v)
			if !isFinite(spent) || spent < 0 {
				return fmt.Errorf("--spent 要一个不小于 0 的数")
			}
		}
		contextFile, _ := cmd.Flags().GetString("context")
		today := d.now().UTC().Format("2006-01-02")
		if cmd.Flags().Changed("today") {
			today, _ = cmd.Flags().GetString("today")
		}
		balance := math.NaN()
		if args[1] != "null" && args[1] != "" {
			balance = jsNumber(args[1])
		}
		var log []any
		if contextFile != "" {
			ctx, err := readJSONFile(contextFile)
			if err != nil {
				return err
			}
			if log, err = arrayOf(get(ctx, "researchLog"), "researchLog"); err != nil {
				return err
			}
		}
		seo, err := ReadSeoMd(args[0])
		if err != nil {
			return err
		}
		directions := args[2:]
		plan, err := PlanBudget(seo.OpenSEO, balance, directions, BudgetOpts{Log: log, Today: today, Spent: spent, LogKnown: contextFile != ""})
		if err != nil {
			return err
		}
		d.printLine(dump(plan))
		return nil
	})
	c.Flags().String("spent", "", "这一轮已经花掉的 credits（竞品猜测那一步），算进本周「扫描」一份")
	c.Flags().String("context", "", "get_project_context 的原始返回（要有 researchLog）；不给就当账本未知")
	c.Flags().String("today", "", "今天的日期 YYYY-MM-DD（默认今天，UTC）")
	return c
}

func (d Deps) checkCommand() *cobra.Command {
	c := leaf("check [dist-dir]", "查构建产物里每个 index.html 的 SEO（Google 和 Bing 两个平台），按路由列出问题；有 error 退出 1，参数不对或目录不存在退出 2。--hook：读 PreToolUse、PostToolUse 事件，构建后跑检查，有 error 退出 2 并在 stderr 回话", "", func(cmd *cobra.Command, args []string) error {
		if hook, _ := cmd.Flags().GetBool("hook"); hook {
			return HookDeps{Env: d.env(), Stdin: d.in(), Now: d.Now}.Run()
		}
		argv := append([]string{}, args...)
		flags := cmd.Flags()
		if s, _ := flags.GetBool("strict"); s {
			argv = append(argv, "--strict")
		}
		if flags.Changed("filter") {
			v, _ := flags.GetString("filter")
			argv = append(argv, "--filter="+v)
		}
		for _, name := range []string{"title-min", "title-max", "desc-min", "desc-max"} {
			if flags.Changed(name) {
				v, _ := flags.GetString(name)
				argv = append(argv, "--"+name+"="+v)
			}
		}
		opts, err := ParseCheckArgs(argv)
		if err != nil {
			return &nexterr.Exit{Code: 2, Msg: err.Error()}
		}
		stdout, stderr, code := RunCheck(opts)
		if stdout != "" {
			d.printLine(stdout)
		}
		if code == 0 {
			return nil
		}
		return &nexterr.Exit{Code: code, Msg: stderr}
	})
	c.Flags().Bool("strict", false, "警告也算失败（退出 1）")
	c.Flags().String("filter", "", "只报告路由里含这段文字的页面（扫描仍是全站，hreflang 互指照全站查）")
	c.Flags().String("title-min", "", "title 宽度下限（默认 48，CJK 字符算 2）")
	c.Flags().String("title-max", "", "title 宽度上限（默认 70）")
	c.Flags().String("desc-min", "", "description 宽度下限（默认 145）")
	c.Flags().String("desc-max", "", "description 宽度上限（默认 160，超了是 error）")
	c.Flags().Bool("hook", false, "从 stdin 读 PreToolUse、PostToolUse 事件；有 error 退出码 2、理由写到 stderr")
	c.SetFlagErrorFunc(func(cmd *cobra.Command, err error) error {
		return &nexterr.Exit{Code: 2, Msg: fmt.Sprintf("不认识的参数「%s」", flagOf(err))}
	})
	return c
}

var unknownFlag = regexp.MustCompile(`^unknown flag: (--[\w-]+)`)
var needsValue = regexp.MustCompile(`^flag needs an argument: (--[\w-]+)`)

// flagOf names the argument a flag error is about.
func flagOf(err error) string {
	msg := err.Error()
	if m := unknownFlag.FindStringSubmatch(msg); m != nil {
		return m[1]
	}
	if m := needsValue.FindStringSubmatch(msg); m != nil {
		return m[1]
	}
	return msg
}

// changedFiles is the changed files from `--files=<file|->` or from the repo with `--base=<ref>`.
func (d Deps) changedFiles(cmd *cobra.Command) ([]string, error) {
	files, _ := cmd.Flags().GetString("files")
	base, _ := cmd.Flags().GetString("base")
	switch {
	case files != "":
		var b []byte
		var err error
		if files == "-" {
			b, err = io.ReadAll(d.in())
		} else {
			b, err = os.ReadFile(files)
		}
		if err != nil {
			return nil, fmt.Errorf("读不到 %s：%v", files, err)
		}
		return strings.Split(string(b), "\n"), nil
	case base != "":
		g := exec.Command("git", "diff", "--name-only", "--no-renames", base+"...HEAD")
		g.Dir = d.Cwd
		out, err := g.CombinedOutput()
		if err != nil {
			return nil, fmt.Errorf("Command failed: git diff --name-only --no-renames %s...HEAD\n%s", base, jsstr.Trim(string(out)))
		}
		return strings.Split(string(out), "\n"), nil
	}
	return nil, usageErr("scope <SEO.md> (--files=<file|-> | --base=<ref>)")
}

func (d Deps) scopeCommand() *cobra.Command {
	c := leaf("scope <SEO.md>", "判断一个 PR 是不是只改内容：改动的文件都落在 SEO.md「构建与检查」的「内容路径」里才算（可以不等人合并）；没有改动文件不算。退出 0 看 contentOnly", "", func(cmd *cobra.Command, args []string) error {
		if arg(args, 0) == "" {
			return usageErr("scope <SEO.md> (--files=<file|-> | --base=<ref>)")
		}
		seo, err := ReadSeoMd(args[0])
		if err != nil {
			return err
		}
		files, err := d.changedFiles(cmd)
		if err != nil {
			return err
		}
		d.printLine(stringify(JudgeScope(files, seo.Build.ContentPaths)))
		return nil
	})
	c.Flags().String("files", "", "改动文件清单，一行一个路径；- 是标准输入")
	c.Flags().String("base", "", "从仓库取：git diff --name-only --no-renames <ref>...HEAD（在当前目录跑）")
	return c
}

func (d Deps) syncContextCommand() *cobra.Command {
	return leaf("sync-context <SEO.md> <context.json>", "把 SEO.md 的竞品和重点页面单向同步到 OpenSEO 项目上下文：打印 update_project_context 要用的 updates 和一句说明（updates 为空就是已一致）", "", func(cmd *cobra.Command, args []string) error {
		if len(args) < 2 || args[0] == "" || args[1] == "" {
			return usageErr("sync-context <SEO.md> <context.json>")
		}
		seo, err := ReadSeoMd(args[0])
		if err != nil {
			return err
		}
		ctx, err := readJSONFile(args[1])
		if err != nil {
			return err
		}
		plan, err := Sync(seo, ctx)
		if err != nil {
			return err
		}
		d.printLine(dump(plan))
		return nil
	})
}

func (d Deps) dueCommand() *cobra.Command {
	return leaf("due <context.json> <YYYY-MM-DD>", "不带参数的扫描这次该跑哪些方向：results 每 3 天，其余五个每 7 天，按研究日志里最近一次采集算", "", func(cmd *cobra.Command, args []string) error {
		if len(args) < 2 || args[0] == "" || args[1] == "" {
			return usageErr("due <context.json> <YYYY-MM-DD>")
		}
		ctx, err := readJSONFile(args[0])
		if err != nil {
			return err
		}
		plan, err := Due(ctx, args[1])
		if err != nil {
			return err
		}
		d.printLine(dump(plan))
		return nil
	})
}

func (d Deps) gapsCommand() *cobra.Command {
	return leaf("gaps <SEO.md> <context.json|-> <direction>...", "这一轮的方向要用、却还没人写下的项目信息（竞品、品牌词、业务概述、当前目标、定位）；项目上下文给 - 或读不到就只查 SEO.md 的项", "", func(cmd *cobra.Command, args []string) error {
		if len(args) < 2 || args[0] == "" {
			return usageErr("gaps <SEO.md> <context.json | -> <方向>...")
		}
		seo, err := ReadSeoMd(args[0])
		if err != nil {
			return err
		}
		var ctx any
		if args[1] != "" && args[1] != "-" {
			if b, err := os.ReadFile(args[1]); err == nil {
				if v, err := ParseJSON(b); err == nil {
					ctx = v
				}
			}
		}
		directions := append([]string{}, args[2:]...)
		report, err := Gaps(seo, ctx, directions)
		if err != nil {
			return err
		}
		d.printLine(dump(report))
		return nil
	})
}

var dateFlagRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

func (d Deps) fileIssuesCommand() *cobra.Command {
	c := leaf("file-issues <docs> <findings.json>", "把一轮扫描的发现开成 issue：证据、复现、验收标准缺一样的拒收；同方向同类的合成一个 issue；已有同标记的 open issue 就留评论；新 issue 不带 status label（就是 backlog），打 type:seo/<方向>", "", func(cmd *cobra.Command, args []string) error {
		dryRun, _ := cmd.Flags().GetBool("dry-run")
		date, _ := cmd.Flags().GetString("date")
		if len(args) < 2 || args[0] == "" || args[1] == "" || (cmd.Flags().Changed("date") && !dateFlagRe.MatchString(date)) {
			return usageErr("file-issues <docs> <findings.json> [--dry-run] [--date=<YYYY-MM-DD>]")
		}
		docs := args[0]
		v, err := readJSONFile(args[1])
		if err != nil {
			return err
		}
		findings, isArr := v.([]any)
		if !isArr {
			return fmt.Errorf("%s 不是发现清单（要一个 JSON 数组）", args[1])
		}
		gh, err := d.ghFor(docs)
		if err != nil {
			return err
		}
		types, err := issues.ReadTypes(docs)
		if err != nil {
			return err
		}
		open, err := OpenIssues(gh)
		if err != nil {
			return err
		}
		if !cmd.Flags().Changed("date") {
			date = today(d.Now)
		}
		plan, err := Plan(findings, open, date)
		if err != nil {
			return err
		}
		if dryRun {
			d.printLine(dump(DryRun(types, plan)))
			return nil
		}
		res, err := Apply(gh, types, plan)
		if err != nil {
			return err
		}
		d.printLine(dump(res))
		return nil
	})
	c.Flags().Bool("dry-run", false, "只打印会做什么，不写 GitHub（number 为 null）")
	c.Flags().String("date", "", "这次扫描的日期 YYYY-MM-DD（默认今天，UTC）")
	return c
}

func (d Deps) verifyLiveCommand() *cobra.Command {
	c := leaf("verify-live <SEO.md> <build-dir>", "合并之后的上线自查：对 PR 描述里每个网址取线上页面，对照构建产物查四项（能打开、没有 noindex、title 与 description 同产物、在 sitemap 里）；退出 0 看 verdict（pass、fail、not-live）", "", func(cmd *cobra.Command, args []string) error {
		urlsFrom, _ := cmd.Flags().GetString("urls")
		if len(args) < 2 || args[0] == "" || args[1] == "" || urlsFrom == "" {
			return usageErr("verify-live <SEO.md> <产物目录> --urls=<file|-> [--wait] [--interval=<秒>] [--max-wait=<秒>]")
		}
		seo, err := ReadSeoMd(args[0])
		if err != nil {
			return err
		}
		var b []byte
		if urlsFrom == "-" {
			b, err = io.ReadAll(d.in())
		} else {
			b, err = os.ReadFile(urlsFrom)
		}
		if err != nil {
			return fmt.Errorf("读不到 %s：%v", urlsFrom, err)
		}
		entries := ParseURLs(string(b))
		if len(entries) == 0 {
			return fmt.Errorf("网址清单里一个网址也没读到（每行 `<网址> 目标词：<词>`）")
		}
		dist := args[1]
		for _, e := range entries {
			if _, err := DistFile(dist, e.URL); err != nil {
				return err
			}
		}
		fetch := d.fetch()
		out := LiveResult{}
		if wait, _ := cmd.Flags().GetBool("wait"); wait {
			interval, _ := cmd.Flags().GetFloat64("interval")
			maxWait := seo.Build.LiveWait * 60
			if cmd.Flags().Changed("max-wait") {
				maxWait, _ = cmd.Flags().GetFloat64("max-wait")
			}
			w, err := WaitLive(entries, dist, WaitOpts{
				Fetch: fetch, IntervalMs: interval * 1000, MaxMs: maxWait * 1000, Sleep: d.sleep,
				Now: func() float64 { return float64(time.Now().UnixNano()) / 1e6 },
			})
			if err != nil {
				return err
			}
			minutes := roundHalfUp(w.WaitedMs / 60_000)
			limit := seo.Build.LiveWait
			out.WaitedMinutes, out.LimitMinutes = &minutes, &limit
			if !w.Live {
				out.Verdict, out.Pending = "not-live", w.Pending
				out.Pages, out.Failed = []LivePage{}, []FailedItem{}
				d.printLine(dump(out))
				return nil
			}
		}
		r, err := CheckAll(entries, dist, fetch)
		if err != nil {
			return err
		}
		out.Verdict, out.Pages, out.Failed = r.Verdict(), r.Pages, r.Failed
		d.printLine(dump(out))
		return nil
	})
	c.Flags().String("urls", "", "网址清单：一行一个 `<网址> 目标词：<词>`；- 是标准输入")
	c.Flags().Bool("wait", false, "先等部署：每隔 --interval 秒取一遍，每页 title 和 description 都同产物才算上线；超过 SEO.md 的「上线等待」分钟还没上线就报 not-live，不算失败")
	c.Flags().Float64("interval", 60, "--wait 每隔几秒取一遍")
	c.Flags().Float64("max-wait", 0, "覆盖等多久（秒），给测试用；limitMinutes 仍是 SEO.md 的")
	return c
}

func (d Deps) recordCommand() *cobra.Command {
	root := registry.Group("record", "上线自查通过后留在 issue 上的记录，和从 issue 评论里读回它")
	body := leaf("body <result.json>", "把全过的上线自查结果写成 issue 评论正文（给人看的表加隐藏的标记）；不是全过退出 1。用 dyna issues note 贴出去", "", func(cmd *cobra.Command, args []string) error {
		if arg(args, 0) == "" {
			return usageErr("record body <result.json> --merged=<YYYY-MM-DD> [--pr=<n>]")
		}
		merged := "undefined"
		if cmd.Flags().Changed("merged") {
			merged, _ = cmd.Flags().GetString("merged")
		}
		pr, _ := cmd.Flags().GetString("pr")
		result, err := readJSONFile(args[0])
		if err != nil {
			return err
		}
		text, err := LiveComment(result, merged, pr)
		if err != nil {
			return err
		}
		d.printLine(text)
		return nil
	})
	body.Flags().String("merged", "", "PR 的合并日期 YYYY-MM-DD")
	body.Flags().String("pr", "", "合并的 PR 号")

	list := leaf("list <docs>", "读项目已关闭的 type:seo issue 评论里的上线记录，JSON：每个网址一行（issue、title、url、keyword、mergedOn、四项结果），按 issue 号从小到大", "", func(cmd *cobra.Command, args []string) error {
		if arg(args, 0) == "" {
			return usageErr("record list <docs> [--since=<YYYY-MM-DD>]")
		}
		since, _ := cmd.Flags().GetString("since")
		if cmd.Flags().Changed("since") && !dateRe.MatchString(since) {
			return fmt.Errorf("--since 要 YYYY-MM-DD")
		}
		gh, err := d.ghFor(args[0])
		if err != nil {
			return err
		}
		closed, err := ClosedSeoIssues(gh)
		if err != nil {
			return err
		}
		d.printLine(dump(LiveChanges(closed, since)))
		return nil
	})
	list.Flags().String("since", "", "只列这一天及以后合并的")

	rollback := leaf("from-rollback <docs> <issue>", "这个 issue 是不是上线自查回滚后开的（正文带「由上线自查回滚而来」）：是的话再失败就是第二次，交给人", "", func(cmd *cobra.Command, args []string) error {
		if len(args) < 2 || args[0] == "" || args[1] == "" {
			return usageErr("record from-rollback <docs> <issue>")
		}
		gh, err := d.ghFor(args[0])
		if err != nil {
			return err
		}
		came, err := FromRollback(gh, args[1])
		if err != nil {
			return err
		}
		n := jsNumber(args[1])
		d.printLine(stringify(struct {
			Issue        float64 `json:"issue"`
			FromRollback bool    `json:"fromRollback"`
		}{n, came}))
		return nil
	})
	root.AddCommand(body, list, rollback)
	return root
}

func (d Deps) provenanceCommand() *cobra.Command {
	c := leaf("provenance <repo> <previous.json> <current.json> <findings.json> <since> <until>", "哪些「title 或 description 变了」是已合并的 PR 有意改的：在仓库历史里找新字符串是哪个 commit 加的、哪个 PR 合进主线，合并时间落在两次审计之间就算有意，从发现里去掉", "", func(cmd *cobra.Command, args []string) error {
		if len(args) < 6 || slicesHasEmpty(args[:6]) {
			return usageErr("provenance <仓库> <上一次.json> <本次.json> <发现.json> <上一次审计完成时间> <本次审计完成时间> [--branch=<ref>]")
		}
		branch, _ := cmd.Flags().GetString("branch")
		v, err := readJSONFile(args[3])
		if err != nil {
			return err
		}
		findings, isArr := v.([]any)
		if !isArr {
			return fmt.Errorf("发现文件要是一个 JSON 数组")
		}
		prev, err := readJSONFile(args[1])
		if err != nil {
			return err
		}
		cur, err := readJSONFile(args[2])
		if err != nil {
			return err
		}
		res, err := Judge(ProvenanceInput{Repo: args[0], Branch: branch, Previous: prev, Current: cur, Findings: findings, Since: args[4], Until: args[5], Now: d.now()})
		if err != nil {
			return err
		}
		d.printLine(dump(res))
		return nil
	})
	c.Flags().String("branch", "", "主线是哪个 ref（默认远端的默认分支，仓库不知道就用 HEAD）")
	return c
}

func slicesHasEmpty(xs []string) bool {
	for _, x := range xs {
		if x == "" {
			return true
		}
	}
	return false
}
