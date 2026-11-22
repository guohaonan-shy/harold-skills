package pr

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/githubapp"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/gitrun"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/home"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
)

// Deps is what the commands reach outside the process through, so tests can stand in for gh, git, GitHub's token
// endpoint and the environment. A nil field is the real thing.
type Deps struct {
	Env    home.Env
	Stdin  io.Reader
	Stdout io.Writer
	// GH runs gh; the evidence branch and the PR description go through it as the gh login, the review loop's
	// archive as the repository's GitHub App when it has one.
	GH githubapp.Runner
	// Git runs `git <args>` in the working directory and returns what it printed.
	Git func(args []string) (string, error)
	// HTTP and BaseURL reach GitHub for an App's installation token.
	HTTP    *http.Client
	BaseURL string
	Now     func() time.Time
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

func (d Deps) gh() githubapp.Runner {
	if d.GH != nil {
		return d.GH
	}
	return githubapp.ExecGH("")
}

func (d Deps) git(args ...string) (string, error) {
	if d.Git != nil {
		return d.Git(args)
	}
	out, err := gitrun.Run("", args...)
	if err != nil {
		return "", err
	}
	return out, nil
}

// asLogin is the API as the gh login.
func (d Deps) asLogin() *githubapp.API { return githubapp.AsGHLogin(d.gh()) }

func (d Deps) options() githubapp.Options {
	return githubapp.Options{Env: d.env(), HTTP: d.HTTP, BaseURL: d.BaseURL, Now: d.Now, Run: d.gh()}
}

func (d Deps) println(lines ...string) {
	for _, l := range lines {
		fmt.Fprintln(d.out(), l)
	}
}

var (
	repoRe = regexp.MustCompile(`^[\w.-]+/[\w.-]+$`)
	numRe  = regexp.MustCompile(`^\d+$`)
)

func arg(args []string, i int) string {
	if i < len(args) {
		return args[i]
	}
	return ""
}

func usage(use string) error { return fmt.Errorf("usage: dyna pr %s", use) }

func repoAndPR(use string, args []string) (repo, pr string, err error) {
	repo, pr = arg(args, 0), arg(args, 1)
	if !repoRe.MatchString(repo) || !numRe.MatchString(pr) {
		return "", "", usage(use)
	}
	return repo, pr, nil
}

// leaf makes a command of the module and marks who may call it.
func leaf(use, short, next string, run func(cmd *cobra.Command, args []string) error) *cobra.Command {
	c := &cobra.Command{Use: use, Short: short, Args: cobra.ArbitraryArgs, SilenceUsage: true, SilenceErrors: true, RunE: run}
	registry.Mark(c, registry.CallerSession, next)
	return c
}

func sectionList() string { return strings.Join(Sections, "|") }

// Command is the `pr` module: a PR's description, its review loop and evidence, and what pr-review checks before it
// reports.
func Command(d Deps) *cobra.Command {
	root := registry.Group("pr", "PR：描述的小节、review loop 文件、交付证据、审核候选的校验，以及开、转 ready、看、合并")

	body := registry.Group("body", "PR 描述：按小节读、写（别的小节和标记以外的文字不动）")
	body.AddCommand(
		leaf("get <owner/repo> <pr> <section>", "打印 PR 描述的一个小节（"+sectionList()+"）；没有这一节就打印空行", "",
			func(cmd *cobra.Command, args []string) error {
				use := "body get <owner/repo> <pr> <" + sectionList() + ">"
				repo, pr, err := repoAndPR(use, args)
				if err != nil {
					return err
				}
				if !validSection(arg(args, 2)) {
					return usage(use)
				}
				current, err := d.prBody(repo, pr)
				if err != nil {
					return err
				}
				text, _, err := GetSection(current, arg(args, 2))
				if err != nil {
					return err
				}
				d.println(text)
				return nil
			}),
		leaf("set <owner/repo> <pr> <section> <content.md>", "把文件的内容写成 PR 描述的这一节（空内容删掉这一节）；「参考」以外有代码层面的指称就拒写", "",
			func(cmd *cobra.Command, args []string) error {
				use := "body set <owner/repo> <pr> <" + sectionList() + "> <content.md>"
				repo, pr, err := repoAndPR(use, args)
				if err != nil {
					return err
				}
				name, file := arg(args, 2), arg(args, 3)
				if !validSection(name) {
					return usage(use)
				}
				if file == "" {
					return fmt.Errorf("usage: dyna pr body set needs a content file")
				}
				content, err := os.ReadFile(file)
				if err != nil {
					return fmt.Errorf("读不到内容文件「%s」：%v", file, err)
				}
				current, err := d.prBody(repo, pr)
				if err != nil {
					return err
				}
				next, err := SetSection(current, name, string(content))
				if err != nil {
					return err
				}
				if _, err := d.asLogin().Call("PATCH", fmt.Sprintf("repos/%s/pulls/%s", repo, pr), map[string]string{"body": next}); err != nil {
					return err
				}
				d.println(fmt.Sprintf("section %s written (%d characters)", name, jsLen(next)))
				return nil
			}),
	)

	loop := registry.Group("loop", "一个 PR 的 review loop 文件（.tmp/review-loop/<PR>.md）：下一轮号、哪些没处理、合并时存档到 PR")
	loop.AddCommand(
		leaf("next <file> <kind> [impl]", "打印下一个轮次号：kind 是 review（review 轮；带 impl 数实现阶段的汇报）、pause（旧）或 replay", "",
			func(cmd *cobra.Command, args []string) error {
				file, kind, from := arg(args, 0), arg(args, 1), arg(args, 2)
				if file == "" || !oneOf(Kinds, kind) || (len(args) > 2 && from != "impl") || len(args) > 3 {
					return usage("loop next <file> <review [impl]|replay>")
				}
				entries, err := ParseLoop(readFile(file))
				if err != nil {
					return err
				}
				d.println(fmt.Sprint(NextRound(entries, kind, from)))
				return nil
			}),
		leaf("check <file>", "JSON：文件里每条汇报和它有没有处理完；unsettled 列出没处理完的", "",
			func(cmd *cobra.Command, args []string) error {
				if arg(args, 0) == "" {
					return usage("loop check <file>")
				}
				entries, err := ParseLoop(readFile(args[0]))
				if err != nil {
					return err
				}
				type row struct {
					Kind    string `json:"kind"`
					Round   int    `json:"round"`
					Source  string `json:"source"`
					Rulings int    `json:"rulings"`
					Settled bool   `json:"settled"`
				}
				rows := make([]row, 0, len(entries))
				for _, e := range entries {
					rows = append(rows, row{e.Kind, e.Round, e.Source, e.Rulings, e.Settled})
				}
				return writeJSON(d.out(), struct {
					Entries   []row `json:"entries"`
					Unsettled []Ref `json:"unsettled"`
				}{rows, Unsettled(entries)})
			}),
		leaf("archive <file> <owner/repo> <pr>", "把文件里还没在 PR 上的汇报各发成一条评论（有 GitHub App 就用它的身份），本地图先传到证据分支；已发过的不重发", "",
			func(cmd *cobra.Command, args []string) error {
				file, repo, pr := arg(args, 0), arg(args, 1), arg(args, 2)
				if file == "" || !repoRe.MatchString(repo) || !numRe.MatchString(pr) {
					return usage("loop archive <file> <owner/repo> <pr>")
				}
				return d.archive(file, repo, pr)
			}),
	)

	evidence := registry.Group("evidence", "PR 的交付证据：每个 PR 一条孤儿分支 idea-loop-evidence-pr-<号>，合并后删")
	evidence.AddCommand(
		leaf("publish <owner/repo> <pr> <file>...", "把图片传到证据分支，打印 {文件名: 地址} 的 JSON；文件名要以 tNN- / rN- / pr- 开头", "",
			func(cmd *cobra.Command, args []string) error {
				repo, pr, err := repoAndPR("evidence publish <owner/repo> <pr> <file>...", args)
				if err != nil {
					return err
				}
				urls, err := d.store(repo).publish(pr, args[2:])
				if err != nil {
					return evidenceFailure(err)
				}
				return writeJSON(d.out(), urls)
			}),
		leaf("list <owner/repo> <pr>", "打印证据分支上每个文件的地址（JSON）", "",
			func(cmd *cobra.Command, args []string) error {
				repo, pr, err := repoAndPR("evidence list <owner/repo> <pr>", args)
				if err != nil {
					return err
				}
				names, err := d.store(repo).names(pr)
				if err != nil {
					return evidenceFailure(err)
				}
				return writeJSON(d.out(), urlsOf(repo, pr, names))
			}),
		leaf("cleanup <owner/repo> <pr>", "删掉证据分支（没有就什么也不做）和旧版留下的 draft release", "",
			func(cmd *cobra.Command, args []string) error {
				repo, pr, err := repoAndPR("evidence cleanup <owner/repo> <pr>", args)
				if err != nil {
					return err
				}
				said, err := d.store(repo).cleanup(pr)
				if err != nil {
					return evidenceFailure(err)
				}
				d.println(said...)
				return nil
			}),
	)

	candidates := registry.Group("candidates", "pr-review 一轮的审核候选：交回前的校验")
	candidates.AddCommand(
		leaf("submit <candidates.json> <base-ref> <evidence-dir> <round>", "校验候选：引用的原文要在文件里、代码要在 diff 里（不成立的丢弃并写原因）；措辞不合格的退回并说出哪一条（退出 2），校验过了才算交回", "",
			func(cmd *cobra.Command, args []string) error {
				file, base, evidenceDir, round := arg(args, 0), arg(args, 1), arg(args, 2), arg(args, 3)
				if file == "" || base == "" || evidenceDir == "" || !numRe.MatchString(round) {
					return usage("candidates submit <candidates.json> <base-ref> <evidence-dir> <round>")
				}
				return d.submit(file, base, evidenceDir, round)
			}),
	)

	diagnostics := registry.Group("diagnostics", "检查工具（lint、typecheck…）的输出")
	diagnostics.AddCommand(
		leaf("filter <base-ref>", "从标准输入读检查输出，只留下落在 <base-ref>...HEAD 改动行上的那几条（JSON：onChanged、elsewhere、unlocated）", "",
			func(cmd *cobra.Command, args []string) error {
				if arg(args, 0) == "" {
					return fmt.Errorf("usage: <tool> 2>&1 | dyna pr diagnostics filter <base-ref>")
				}
				diff, err := d.git("diff", "-U0", "--no-color", args[0]+"...HEAD")
				if err != nil {
					return err
				}
				in, err := io.ReadAll(d.in())
				if err != nil {
					return err
				}
				return writeJSON(d.out(), FilterDiagnostics(string(in), ParseChangedLines(diff)))
			}),
	)

	skillGrowth := leaf("skill-growth <base-ref>", "列出 <base-ref>...HEAD 里主体字数变了的 SKILL.md 和 agent 定义：路径、改前 → 改后（差值）；只报事实，退出 0", "",
		func(cmd *cobra.Command, args []string) error {
			if len(args) != 1 || args[0] == "" {
				return usage("skill-growth <base-ref>")
			}
			lines, err := d.skillGrowth(args[0])
			if err != nil {
				return err
			}
			if len(lines) == 0 {
				d.println("没有 SKILL.md 或 agent 定义的主体字数变了")
				return nil
			}
			d.println(lines...)
			return nil
		})

	fullSuite := registry.Group("full-suite", "本机全量测试的结果：同一个 head 跑过一遍就记下，别处复用")
	fullSuite.AddCommand(
		leaf("record <head> <exit-code> <log-file>", "记下这次本机全量测试的结果（head、退出码、日志文件、时间）到当前 worktree 的 .tmp/full-suite/<head>.json；同一个 head 再记会覆盖", "dyna pr full-suite show <head>",
			func(cmd *cobra.Command, args []string) error {
				code, ok := parseExitCode(arg(args, 1))
				if len(args) != 3 || !headRe.MatchString(args[0]) || !ok || args[2] == "" {
					return usage("full-suite record <head> <exit-code> <log-file>")
				}
				return d.recordFullSuite(args[0], code, args[2])
			}),
		leaf("show <head>", "打印这个 head 的本机全量记录（JSON：head、exitCode、log、at）；没有记录退出 2。退出码 0 的可以复用，非 0 的重跑", "",
			func(cmd *cobra.Command, args []string) error {
				if len(args) != 1 || !headRe.MatchString(args[0]) {
					return usage("full-suite show <head>")
				}
				return d.showFullSuite(args[0])
			}),
	)

	open := leaf("open <owner/repo>", "在当前分支上开 PR，默认 draft（--ready 直接开成 ready）；打印 PR 的地址", "",
		func(cmd *cobra.Command, args []string) error {
			repo := arg(args, 0)
			base, _ := cmd.Flags().GetString("base")
			title, _ := cmd.Flags().GetString("title")
			bodyFile, _ := cmd.Flags().GetString("body-file")
			head, _ := cmd.Flags().GetString("head")
			ready, _ := cmd.Flags().GetBool("ready")
			if !repoRe.MatchString(repo) || len(args) != 1 || base == "" || title == "" || bodyFile == "" {
				return usage("open <owner/repo> --base <基准分支> --title <标题> --body-file <正文文件> [--head <分支>] [--ready]")
			}
			if _, err := os.Stat(bodyFile); err != nil {
				return fmt.Errorf("读不到正文文件「%s」", bodyFile)
			}
			a := []string{"pr", "create", "--repo", repo, "--base", base, "--title", title, "--body-file", bodyFile}
			if !ready {
				a = append(a, "--draft")
			}
			if head != "" {
				a = append(a, "--head", head)
			}
			out, err := d.gh()(a, "", nil)
			if err != nil {
				return err
			}
			d.println(strings.TrimSpace(out))
			return nil
		})
	open.Flags().String("base", "", "基准分支（必填）")
	open.Flags().String("title", "", "标题（必填）")
	open.Flags().String("body-file", "", "正文文件（必填）")
	open.Flags().String("head", "", "要开 PR 的分支；不给就用当前分支")
	open.Flags().Bool("ready", false, "直接开成 ready（默认 draft）")

	ready := leaf("ready <owner/repo> <pr>", "把 draft PR 转成 ready", "dyna pr view <owner/repo> <pr>",
		func(cmd *cobra.Command, args []string) error {
			repo, pr, err := repoAndPR("ready <owner/repo> <pr>", args)
			if err != nil {
				return err
			}
			if _, err := d.gh()([]string{"pr", "ready", pr, "--repo", repo}, "", nil); err != nil {
				return err
			}
			d.println(fmt.Sprintf("PR #%s 已转 ready", pr))
			return nil
		})

	view := leaf("view <owner/repo> <pr>", "JSON：PR 的状态、是否 draft、分支、合并提交（--fields 换字段）", "",
		func(cmd *cobra.Command, args []string) error {
			repo, pr, err := repoAndPR("view <owner/repo> <pr> [--fields <字段,字段>]", args)
			if err != nil {
				return err
			}
			fields, _ := cmd.Flags().GetString("fields")
			out, err := d.gh()([]string{"pr", "view", pr, "--repo", repo, "--json", fields}, "", nil)
			if err != nil {
				return err
			}
			d.println(strings.TrimRight(out, "\n"))
			return nil
		})
	view.Flags().String("fields", "number,title,state,isDraft,baseRefName,headRefName,url,mergeable,mergeCommit,mergedAt", "要读的字段，逗号分开（gh pr view --json 认的）")

	merge := leaf("merge <owner/repo> <pr>", "合并 PR（--method 取 DEVELOPMENT.md「分支」节写的合并方式）", "dyna pr view <owner/repo> <pr>",
		func(cmd *cobra.Command, args []string) error {
			repo, pr, err := repoAndPR("merge <owner/repo> <pr> --method <merge|squash|rebase>", args)
			if err != nil {
				return err
			}
			method, _ := cmd.Flags().GetString("method")
			if !oneOf([]string{"merge", "squash", "rebase"}, method) {
				return usage("merge <owner/repo> <pr> --method <merge|squash|rebase>（没给或不认识的合并方式「" + method + "」）")
			}
			if _, err := d.gh()([]string{"pr", "merge", pr, "--repo", repo, "--" + method}, "", nil); err != nil {
				return err
			}
			d.println(fmt.Sprintf("PR #%s 已合并（%s）", pr, method))
			return nil
		})
	merge.Flags().String("method", "", "合并方式：merge、squash 或 rebase（必填）")

	root.AddCommand(body, loop, evidence, candidates, diagnostics, skillGrowth, fullSuite, open, ready, view, merge)
	return root
}

func readFile(path string) string {
	b, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return string(b)
}

// evidenceFailure turns an upload that was refused into exit 2 with the problems on stderr, the way the old
// script ended; any other failure is a plain error.
func evidenceFailure(err error) error {
	if inv, ok := err.(*InvalidFilesError); ok {
		return &nexterr.Exit{Code: 2, Msg: inv.Error()}
	}
	return err
}

func (d Deps) store(repo string) store {
	return store{api: d.asLogin(), run: d.gh(), repo: repo}
}

// prBody is the description of a PR as it is now.
func (d Deps) prBody(repo, pr string) (string, error) {
	raw, err := d.asLogin().Call("GET", fmt.Sprintf("repos/%s/pulls/%s", repo, pr), nil)
	if err != nil {
		return "", err
	}
	var v struct {
		Body *string `json:"body"`
	}
	if err := json.Unmarshal(raw, &v); err != nil {
		return "", fmt.Errorf("gh 的回答读不懂：%v", err)
	}
	if v.Body == nil {
		return "", nil
	}
	return *v.Body, nil
}

func (d Deps) archive(file, repo, pr string) error {
	if _, err := os.Stat(file); err != nil {
		return fmt.Errorf("no review-loop file at %s", file)
	}
	entries, err := ParseLoop(readFile(file))
	if err != nil {
		return err
	}
	api, err := githubapp.ForRepo(repo, d.options())
	if err != nil {
		return err
	}
	raw, err := api.GetAll(fmt.Sprintf("repos/%s/issues/%s/comments?per_page=100", repo, pr))
	if err != nil {
		return err
	}
	existing := make([]string, 0, len(raw))
	for _, r := range raw {
		var c struct {
			Body *string `json:"body"`
		}
		if json.Unmarshal(r, &c) == nil && c.Body != nil {
			existing = append(existing, *c.Body)
		}
	}
	type posted struct {
		Kind  string `json:"kind"`
		Round int    `json:"round"`
		URL   string `json:"url,omitempty"`
	}
	done := []posted{}
	for _, e := range ToArchive(entries, existing) {
		var figures []string
		for _, p := range LocalFigures(e.Body) {
			if !filepath.IsAbs(p) {
				p = filepath.Join(filepath.Dir(file), p)
			}
			figures = append(figures, p)
		}
		urls := map[string]string{}
		if len(figures) > 0 {
			u, err := d.store(repo).publish(pr, figures)
			if err != nil {
				return err
			}
			urls = u.URLs
		}
		e.Body = WithFigureUrls(e.Body, urls)
		text, err := ArchiveBody(e)
		if err != nil {
			return err
		}
		out, err := api.Call("POST", fmt.Sprintf("repos/%s/issues/%s/comments", repo, pr), map[string]string{"body": text})
		if err != nil {
			return err
		}
		var c struct {
			HTMLURL string `json:"html_url"`
		}
		_ = json.Unmarshal(out, &c)
		done = append(done, posted{e.Kind, e.Round, c.HTMLURL})
	}
	return writeJSON(d.out(), struct {
		Posted   []posted `json:"posted"`
		Identity string   `json:"identity"`
	}{done, api.Identity})
}

func (d Deps) submit(file, base, evidenceDir, round string) error {
	diff, err := d.git("diff", "--no-color", base+"...HEAD")
	if err != nil {
		return err
	}
	data, err := os.ReadFile(file)
	if err != nil {
		return fmt.Errorf("读不到候选文件「%s」：%v", file, err)
	}
	cands, err := ParseCandidates(data)
	if err != nil {
		return fmt.Errorf("候选文件「%s」读不懂：%v", file, err)
	}
	n := 0
	fmt.Sscan(round, &n)
	res := Admit(cands, IO{
		Read: func(p string) (string, bool) {
			b, err := os.ReadFile(p)
			if err != nil {
				return "", false
			}
			return string(b), true
		},
		Exists: func(name string) bool { _, err := os.Stat(filepath.Join(evidenceDir, name)); return err == nil },
		Added:  func(p string) []string { return AddedLines(diff, p) },
	}, n)
	if err := writeJSON(d.out(), res); err != nil {
		return err
	}
	if len(res.Rewrite) == 0 {
		return nil
	}
	var b strings.Builder
	fmt.Fprintf(&b, "有 %d 条候选的措辞不合格，改好后再跑一次 dyna pr candidates submit：", len(res.Rewrite))
	for _, r := range res.Rewrite {
		id := strings.Trim(string(r.ID), `"`)
		if id == "" {
			id = "（没给 id）"
		}
		for _, p := range r.Problems {
			fmt.Fprintf(&b, "\n  %s：%s", id, p)
		}
	}
	return &nexterr.Exit{Code: 2, Msg: b.String()}
}
