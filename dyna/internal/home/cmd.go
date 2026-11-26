package home

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
)

// EnvPluginRoot is the plugin's directory, set by the plugin's launcher; `config` reads the plugin's own name and
// marketplace from it.
const EnvPluginRoot = "IDEA_LOOP_PLUGIN_ROOT"

// Deps is what the commands reach outside the process through, so tests can stand in for it.
type Deps struct {
	Env    Env
	Stdin  io.Reader
	Stdout io.Writer
	// Cwd is the directory the session runs in; empty means the process's.
	Cwd string
	// Now is the clock; nil means time.Now.
	Now func() time.Time
}

func (d Deps) env() Env {
	if d.Env == nil {
		return OSEnv
	}
	return d.Env
}

func (d Deps) out() io.Writer {
	if d.Stdout == nil {
		return os.Stdout
	}
	return d.Stdout
}

func (d Deps) cwd() string {
	if d.Cwd != "" {
		return d.Cwd
	}
	wd, _ := os.Getwd()
	return wd
}

func (d Deps) now() time.Time {
	if d.Now != nil {
		return d.Now()
	}
	return time.Now()
}

func (d Deps) println(lines ...string) {
	for _, l := range lines {
		fmt.Fprintln(d.out(), l)
	}
}

func leaf(use, short, caller, next string, run func(cmd *cobra.Command, args []string) error) *cobra.Command {
	c := &cobra.Command{Use: use, Short: short, Args: cobra.ArbitraryArgs, SilenceUsage: true, SilenceErrors: true, RunE: run}
	registry.Mark(c, caller, next)
	return c
}

func arg(args []string, i int) string {
	if i < len(args) {
		return args[i]
	}
	return ""
}

func dump(v any) string {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	_ = enc.Encode(v)
	return buf.String()
}

// project is the project the command works on: the one named by --project, or the one of the session's directory.
func (d Deps) project(cmd *cobra.Command) (Found, error) {
	name, _ := cmd.Flags().GetString("project")
	found := Locate(d.cwd(), d.env(), name)
	if !found.OK {
		return found, found.Err()
	}
	return found, nil
}

// Command is the `home` module.
func Command(d Deps) *cobra.Command {
	root := registry.Group("home", "home（你的知识库与项目目录）：项目在哪、设备上登记了哪些项目、调度表、知识库怎么提交、各层索引、ADR 编号、setup 的四处用户级配置、记忆与术语表检查")
	const sess = registry.CallerSession

	where := leaf("where", "打印当前项目在 home 里的目录（JSON）；在 home 本身里要带 --project", sess,
		"", func(cmd *cobra.Command, args []string) error {
			found, err := d.project(cmd)
			if err != nil {
				return err
			}
			d.println(strings.TrimRight(dump(struct {
				Project    string `json:"project"`
				ProjectDir string `json:"projectDir"`
				Docs       string `json:"docs"`
				Repo       string `json:"repo"`
				Clone      string `json:"clone"`
				CloneDir   string `json:"cloneDir"`
				InHome     bool   `json:"inHome"`
			}{found.Project, found.ProjectDir, found.Docs, found.Repo, found.Clone, found.CloneDir, true}), "\n"))
			return nil
		})
	where.Flags().String("project", "", "项目名（在 home 目录里，或不在项目的仓库里时要带）")

	projects := leaf("projects", "打印这台设备登记的全部项目（JSON 数组，顺序同项目清单）：名字、项目目录、知识库目录、owner/repo、本地 clone、搬进 home 没有（没搬进的带原因码和原因）", sess,
		"", func(cmd *cobra.Command, args []string) error {
			d.println(strings.TrimRight(dump(Projects(d.env())), "\n"))
			return nil
		})

	dispatch := leaf("dispatch", "打印这台设备的调度表（JSON）：此刻所在时段、该派什么、每轮最多新开几个、各状态同时开着最多几个、不调度的项目、整张时段表和调度按状态数会话的三个状态；读 home 的 DISPATCH.md，没有就用默认", sess,
		"", func(cmd *cobra.Command, args []string) error {
			var at *string
			if cmd.Flags().Changed("at") {
				v, _ := cmd.Flags().GetString("at")
				at = &v
			}
			md, err := ReadDispatchFile(d.env())
			if err != nil {
				return err
			}
			res, err := ReadDispatch(md, at, d.now())
			if err != nil {
				return err
			}
			d.println(strings.TrimRight(dump(res), "\n"))
			return nil
		})
	dispatch.Flags().String("at", "", "按这一刻（HH:MM）算，不给就用本机的钟")

	commit := leaf("commit <message> <file>...", "只提交列出的文件到 home 的主分支再推送；docs 里有重名 slug 或死链就拒绝", sess,
		"", func(cmd *cobra.Command, args []string) error {
			res, err := Commit(arg(args, 0), nonEmpty(args, 1), d.cwd(), d.env())
			if err != nil {
				return err
			}
			d.println(strings.Join(res.Lines, "\n"))
			return nil
		})

	mapCmd := leaf("map", "开场注入当前项目的项目目录和项目地图（出任何岔子都什么也不打印）", registry.CallerHook, "", func(cmd *cobra.Command, args []string) error {
		defer func() { _ = recover() }()
		fmt.Fprint(d.out(), ProjectMap(d.cwd(), d.env()))
		fmt.Fprint(d.out(), RulesLagLine(d.env()))
		return nil
	})
	mapCmd.Flags().Bool("hook", false, "由 SessionStart hook 调：命令行版本不对或没装时只在 stderr 留一行、退出 0，不拦会话")

	index := leaf("index", "按各份 frontmatter 重新生成 spec、adr、raw 三层的 index.md", sess, "", func(cmd *cobra.Command, args []string) error {
		found, err := d.project(cmd)
		if err != nil {
			return err
		}
		layer, _ := cmd.Flags().GetString("layer")
		var layers []string
		if layer != "" {
			layers = []string{layer}
		}
		lines, err := WriteIndexes(found.Docs, layers)
		d.println(lines...)
		return err
	})
	index.Flags().String("project", "", "项目名（不带就取当前目录所在的项目）")
	index.Flags().String("layer", "", "只生成一层：spec | adr | raw")

	adr := registry.Group("adr", "ADR 文件名")
	adrNew := leaf("new <name>", "打印下一份 ADR 的文件名：比现有最大编号大 1 的四位编号加名字，编号不复用", sess,
		"", func(cmd *cobra.Command, args []string) error {
			found, err := d.project(cmd)
			if err != nil {
				return err
			}
			name, err := NextADRName(found.Docs, arg(args, 0))
			if err != nil {
				return err
			}
			d.println(name)
			return nil
		})
	adrNew.Flags().String("project", "", "项目名（不带就取当前目录所在的项目）")
	adr.AddCommand(adrNew)

	config := registry.Group("config", "setup 的四处用户级配置：启用插件、记忆目录、CLAUDE.md 软链到 home 的 AGENTS.md、home 的 AGENTS.md 里的固定文案三节；另有第五项 knowledge、skills、memories（只在 --only 点名时做）：knowledge 把一个项目的引导文件和 docs/ 搬进 home；skills 把 ~/.claude/skills/ 逐个定去留、留的搬进 home 的 skills/ 并换成软链；memories 把各项目的记忆合并进 home 的 memory/")
	pluginRoot := func() (string, error) {
		root := d.env()(EnvPluginRoot)
		if root == "" {
			return "", nexterr.Plain("不知道插件装在哪：%s 没设（经插件的 bin/dyna 调用会自己设）", EnvPluginRoot)
		}
		return root, nil
	}
	only := func(cmd *cobra.Command) ([]string, error) {
		v, _ := cmd.Flags().GetString("only")
		return ParseOnly(v, cmd.Flags().Changed("only"))
	}
	// the knowledge item works on one project and is only done when named; the four others are the machine's
	split := func(ids []string) (base []string, knowledge bool) {
		for _, id := range ids {
			if id == KnowledgeItem {
				knowledge = true
			} else if id != MemoriesItem {
				base = append(base, id)
			}
		}
		return
	}
	// the memories item works on the machine's memory directories and is likewise only done when named
	wantsMemories := func(ids []string) bool {
		for _, id := range ids {
			if id == MemoriesItem {
				return true
			}
		}
		return false
	}
	project := func(cmd *cobra.Command) string {
		v, _ := cmd.Flags().GetString("project")
		return v
	}
	plan := leaf("plan", "列出用户级改动各自的改前、改后、是否已做；--only knowledge 再出这个项目的盘点表、写死 docs/ 的文件、开着且改了 docs/ 的 PR；--only skills 出 ~/.claude/skills/ 每个 skill 的表（软链指向、近 30 天调用次数、去留留空）；什么都不写", sess, "", func(cmd *cobra.Command, args []string) error {
		ids, err := only(cmd)
		if err != nil {
			return err
		}
		ids, withSkills := splitSkills(ids)
		base, knowledge := split(ids)
		memories := wantsMemories(ids)
		if memories && (withSkills || knowledge) {
			return errMemoriesAlone
		}
		var items []ConfigItem
		if len(base) > 0 {
			root, err := pluginRoot()
			if err != nil {
				return err
			}
			if items, err = PlanConfig(d.env(), root, base); err != nil {
				return err
			}
		}
		if withSkills {
			return d.planSkills(cmd, items, knowledge)
		}
		asJSON, _ := cmd.Flags().GetBool("json")
		var m MemoriesPlan
		if memories {
			var err error
			if m, err = PlanMemories(d.env()); err != nil {
				return err
			}
		}
		if !knowledge {
			if memories {
				if asJSON {
					fmt.Fprint(d.out(), MemoriesPlanJSON(items, m))
					return nil
				}
				fmt.Fprint(d.out(), ConfigTable(append(items, m.Item)))
				fmt.Fprint(d.out(), MemoriesTable(m))
				return nil
			}
			if asJSON {
				fmt.Fprint(d.out(), ConfigJSON(items))
				return nil
			}
			fmt.Fprint(d.out(), ConfigTable(items))
			return nil
		}
		k, err := PlanKnowledge(d.env(), d.cwd(), project(cmd))
		if err != nil {
			return err
		}
		if asJSON {
			fmt.Fprint(d.out(), KnowledgePlanJSON(items, k))
			return nil
		}
		fmt.Fprint(d.out(), ConfigTable(append(items, k.Item)))
		fmt.Fprint(d.out(), KnowledgeTables(k))
		return nil
	})
	plan.Flags().String("only", "", "只看这几项：1,2,3,4 或 plugin,memory,claude-md,rules；knowledge（只能按名字点，带 --project）、skills、memories（只能按名字点）是另外的项，默认不含；三者不能同时点")
	plan.Flags().String("project", "", "knowledge 项用：项目名（不带就取当前目录所在的项目）")
	plan.Flags().Bool("json", false, "输出 JSON；带 knowledge 时是 {items, project, inventory, hardcoded, prs}，存成文件填完「去哪」就是 apply --plan 要的")
	apply := leaf("apply", "先备份，再做还没做的改动；都已做就什么都不写；--only knowledge --plan <文件> 把这个项目的引导文件和 docs/ 复制进 home 并提交；--only skills --plan <文件> 备份后按每行去留搬或删，全定了就换成软链并提交", sess, "", func(cmd *cobra.Command, args []string) error {
		ids, err := only(cmd)
		if err != nil {
			return err
		}
		ids, withSkills := splitSkills(ids)
		base, knowledge := split(ids)
		if withSkills && knowledge {
			return errSkillsAlone
		}
		if wantsMemories(ids) && (withSkills || knowledge) {
			return errMemoriesAlone
		}
		if len(base) > 0 {
			root, err := pluginRoot()
			if err != nil {
				return err
			}
			done, err := ApplyConfig(d.env(), root, base, d.now())
			if err != nil {
				return err
			}
			if len(done.Changed) > 0 {
				d.println(fmt.Sprintf("已改：%s；备份在 %s", strings.Join(done.Changed, "、"), done.Backup))
			} else {
				d.println("没有要改的项，什么都没写")
			}
			if len(done.Manual) > 0 {
				d.println(fmt.Sprintf("没动：%s（别处的软链，要人处理）", strings.Join(done.Manual, "、")))
			}
		}
		if withSkills {
			planFile, _ := cmd.Flags().GetString("plan")
			done, err := ApplySkills(d.env(), d.cwd(), planFile, d.now())
			d.println(done.Lines...)
			return err
		}
		if knowledge {
			planFile, _ := cmd.Flags().GetString("plan")
			done, err := ApplyKnowledge(d.env(), d.cwd(), project(cmd), planFile, d.env()(EnvPluginRoot), d.now())
			d.println(done.Lines...)
			if err != nil {
				return err
			}
		}
		if wantsMemories(ids) {
			done, err := ApplyMemories(d.env(), d.cwd(), d.now())
			d.println(done.Lines...)
			return err
		}
		return nil
	})
	apply.Flags().String("only", "", "只做这几项：1,2,3,4 或 plugin,memory,claude-md,rules；knowledge（只能按名字点，带 --project 和 --plan）、skills（只能按名字点，带 --plan）、memories（只能按名字点，不要 plan 文件）是另外的项，默认不含；三者不能同时点")
	apply.Flags().String("project", "", "knowledge 项用：项目名（不带就取当前目录所在的项目）")
	apply.Flags().String("plan", "", "knowledge 项用 plan --only knowledge --json 的输出，「去哪」填完；skills 项用 plan --only skills --json 的输出，每行 decision 填「留」或「删」")
	config.AddCommand(plan, apply)

	memory := registry.Group("memory", "设备记忆的检查")
	memCheck := leaf("check [dir]", "量记忆根索引：不超 140 行和 25,000 字节，链接都在，条目都进了索引；有问题退出 2", sess,
		"", func(cmd *cobra.Command, args []string) error {
			dir := filepath.Join(Dir(d.env()), "memory")
			if a := arg(args, 0); a != "" {
				dir, _ = filepath.Abs(a)
			}
			if !isDir(dir) {
				return nexterr.Plain("memory-check: %s 不是一个目录", dir)
			}
			rep, err := CheckMemory(dir)
			if err != nil {
				return err
			}
			if rep.OK() {
				d.println(fmt.Sprintf("memory-check: green ✓ (%s) —— 根索引 %d 行 / %d 字节，在 %d 行、25,000 字节以内", dir, rep.Lines, rep.Bytes, MemoryMaxLines))
				return nil
			}
			out := []string{fmt.Sprintf("memory-check: 有问题 (%s) ——", dir)}
			for _, p := range rep.Problems {
				out = append(out, "  - "+p)
			}
			d.println(strings.Join(out, "\n"))
			return &nexterr.Exit{Code: 2}
		})
	memory.AddCommand(memCheck)

	glossary := registry.Group("glossary", "GLOSSARY.md 的格式检查")
	glossaryCheck := leaf("check [file]", "查 GLOSSARY.md 的格式；有问题退出 2。--hook：读 PostToolUse 事件，写到 GLOSSARY.md 才查，有问题退出 2 并在 stderr 回话", registry.CallerHook,
		"", func(cmd *cobra.Command, args []string) error {
			if hook, _ := cmd.Flags().GetBool("hook"); hook {
				return d.glossaryHook()
			}
			file := arg(args, 0)
			if file == "" {
				return nexterr.Plain("usage: dyna home glossary check <GLOSSARY.md> [--json]")
			}
			b, err := os.ReadFile(file)
			if err != nil {
				return nexterr.Plain("glossary-check: cannot read %s: %s", file, strings.TrimPrefix(err.Error(), "open "+file+": "))
			}
			res := CheckGlossary(string(b))
			if asJSON, _ := cmd.Flags().GetBool("json"); asJSON {
				fmt.Fprint(d.out(), dump(res))
			} else {
				d.println(RenderGlossaryReport(res, file))
			}
			if !res.Valid {
				return &nexterr.Exit{Code: 2}
			}
			return nil
		})
	glossaryCheck.Flags().Bool("json", false, "输出 JSON")
	glossaryCheck.Flags().Bool("hook", false, "从 stdin 读 PostToolUse 事件；有问题退出码 2、理由写到 stderr")
	glossary.AddCommand(glossaryCheck)

	root.AddCommand(where, projects, dispatch, commit, mapCmd, index, adr, config, memory, glossary)
	return root
}

func nonEmpty(args []string, from int) []string {
	if from >= len(args) {
		return nil
	}
	return args[from:]
}

// glossaryHook is the PostToolUse hook: every Write or Edit that lands on a file named GLOSSARY.md is linted, and
// violations are fed back to the model (stderr, exit 2) so it fixes them in the same turn. Silent for every other
// file: this must never slow down normal work.
func (d Deps) glossaryHook() error {
	if d.Stdin == nil {
		return nil
	}
	raw, _ := io.ReadAll(d.Stdin)
	var ev struct {
		ToolInput struct {
			FilePath string `json:"file_path"`
		} `json:"tool_input"`
	}
	if json.Unmarshal(raw, &ev) != nil {
		return nil
	}
	path := ev.ToolInput.FilePath
	if filepath.Base(path) != "GLOSSARY.md" {
		return nil
	}
	b, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	res := CheckGlossary(string(b))
	if res.Valid {
		return nil
	}
	return &nexterr.Exit{Code: 2, Msg: GlossaryHookReply(res, path)}
}
