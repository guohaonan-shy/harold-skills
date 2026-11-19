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
	root := registry.Group("home", "home（你的知识库与项目目录）：项目在哪、知识库怎么提交、各层索引、ADR 编号、setup 的三处用户级配置、记忆与术语表检查")
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
		return nil
	})

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

	config := registry.Group("config", "setup 的三处用户级配置：启用插件、记忆目录、CLAUDE.md 软链到 home 的 AGENTS.md")
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
	plan := leaf("plan", "列出三处用户级改动各自的改前、改后、是否已做；什么都不写", sess, "", func(cmd *cobra.Command, args []string) error {
		items, err := only(cmd)
		if err != nil {
			return err
		}
		root, err := pluginRoot()
		if err != nil {
			return err
		}
		plan, err := PlanConfig(d.env(), root, items)
		if err != nil {
			return err
		}
		if asJSON, _ := cmd.Flags().GetBool("json"); asJSON {
			fmt.Fprint(d.out(), ConfigJSON(plan))
			return nil
		}
		fmt.Fprint(d.out(), ConfigTable(plan))
		return nil
	})
	plan.Flags().String("only", "", "只看这几项：1,2,3 或 plugin,memory,claude-md")
	plan.Flags().Bool("json", false, "输出 JSON")
	apply := leaf("apply", "先备份 settings.json 和 CLAUDE.md，再做还没做的改动；都已做就什么都不写", sess, "", func(cmd *cobra.Command, args []string) error {
		items, err := only(cmd)
		if err != nil {
			return err
		}
		root, err := pluginRoot()
		if err != nil {
			return err
		}
		done, err := ApplyConfig(d.env(), root, items, d.now())
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
		return nil
	})
	apply.Flags().String("only", "", "只做这几项：1,2,3 或 plugin,memory,claude-md")
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

	root.AddCommand(where, commit, mapCmd, index, adr, config, memory, glossary)
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
