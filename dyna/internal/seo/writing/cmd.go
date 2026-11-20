package writing

import (
	"fmt"
	"io"
	"os"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
)

const usage = "usage: dyna seo writing lint [--config=<file.json>] [--lang=en|zh] [--format=json|text] <file|dir>..."

const long = `文章（带 frontmatter 的 markdown / mdx）的机械检查：句数、逗号、套话、图注和 frontmatter 的缺漏、标记写错、中英两版结构对不上。只查规则能判定的；钩子强不强、论点站不站得住交给评委。

目录 = 它下面直接的每个 .md / .mdx。文件的语言：--lang，否则看文件名（<slug>.<locale>.md：locale 以 zh 开头或等于配置里的 localePair.zh 是中文，其余英文），否则看正文。

输出（标准输出，默认 JSON；--format=text 打印同一份清单）：{ clean, total, bySeverity: { error, warn, note }, files, rules: { <规则名>: [ { file, line, severity, message } ] } }，rules 只列查到东西的规则，同一规则内按文件、行排。
退出码：0 一条都没有，1 至少一条，2 用法不对、文件读不了或配置不合法（原因在标准错误）。

规则：para-sentences、visual-break、bullet-long、transition-density、dash-density、comma-chain、faq-thin、ai-slop、colon-opener、stray-italic、image-caption、required-fields、image-field、faqs-field、locale-parity、table-div-align、tilde-number、numeric-range-hyphen；每条都能在配置里关掉。

配置（--config，一个 JSON 文件，通常是 SEO.md「写作」的「lint 配置」）：没写的保持默认，写了的列表替换默认列表；不认识的键报错（退出 2）。
  "thresholds": maxSentencesPerParagraph 4、visualBreakWords { en 250, zh 400 }、maxBulletWidth 240、maxTransitionsPerSentence 1、maxDashPer100Words 1、maxCommasPerSentence 3、faqMinWords { en 25, zh 40 }
  "wordlists": aiSlop / transitions / colonOpeners，各有 { en: [...], zh: [...] }
  "fields": required ["title","excerpt"]、image ["cover","ogImage"]、faqs "faqs"、faqAnswer "a"、captionAttribute "title"
  "localePair": { en "en", zh "zh-CN", requireBoth false }
  "italic": { exemptFirstBlockquote true }
  "disableRules": []`

// Deps is what the command reaches outside the process through.
type Deps struct {
	Stdout io.Writer
}

func (d Deps) out() io.Writer {
	if d.Stdout == nil {
		return os.Stdout
	}
	return d.Stdout
}

func bad(msg string) error { return &nexterr.Exit{Code: 2, Msg: msg} }

// Command is the `writing` group of the seo module.
func Command(d Deps) *cobra.Command {
	root := registry.Group("writing", "站点文章的写作检查")
	lint := &cobra.Command{
		Use:           "lint [--config=<file.json>] <file|dir>...",
		Short:         "文章的机械检查（句数、逗号、套话、图注、frontmatter、中英结构）：一条都没有退出 0，有发现退出 1，用法或配置不对退出 2",
		Long:          long,
		Args:          cobra.ArbitraryArgs,
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			if len(args) == 0 {
				return bad(usage)
			}
			lang, _ := cmd.Flags().GetString("lang")
			if lang != "" && lang != "en" && lang != "zh" {
				return bad("--lang must be en or zh\n" + usage)
			}
			format, _ := cmd.Flags().GetString("format")
			if format != "json" && format != "text" {
				return bad("--format must be json or text\n" + usage)
			}
			cfg := DefaultConfig()
			if path, _ := cmd.Flags().GetString("config"); path != "" {
				raw, err := os.ReadFile(path)
				var user any
				if err == nil {
					user, err = parseJSON(raw)
				}
				if err != nil {
					return bad(fmt.Sprintf("cannot read config %s: %v", path, err))
				}
				if cfg, err = MergeConfig(user); err != nil {
					return bad(err.Error())
				}
			}
			report, err := LintPaths(args, cfg, lang)
			if err != nil {
				return bad(err.Error())
			}
			if format == "text" {
				fmt.Fprintln(d.out(), report.Text())
			} else {
				fmt.Fprintln(d.out(), report.JSON())
			}
			if !report.Clean {
				return &nexterr.Exit{Code: 1}
			}
			return nil
		},
	}
	lint.Flags().String("config", "", "覆盖默认值的 JSON 配置文件（SEO.md「写作」的「lint 配置」）")
	lint.Flags().String("lang", "", "强制语言：en 或 zh；不给就看文件名，再看正文")
	lint.Flags().String("format", "json", "json 或 text")
	lint.SetFlagErrorFunc(func(*cobra.Command, error) error { return bad(usage) })
	registry.Mark(lint, registry.CallerSession, "")
	root.AddCommand(lint)
	return root
}
