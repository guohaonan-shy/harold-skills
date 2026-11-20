package og

import (
	"bytes"
	"context"
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/jsx"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/ui"
)

// EnvPluginRoot is the plugin's directory, set by the plugin's launcher (bin/dyna); the layouts are read from its
// skills/seo/og/assets/ unless --assets names another directory.
const EnvPluginRoot = "IDEA_LOOP_PLUGIN_ROOT"

// Width and Height are the size of an OG card.
const (
	Width  = 1200
	Height = 630
)

// Verdict is what the page wrote on <html> once it fit its text.
type Verdict struct {
	Fit      string          `json:"fit"`
	Overflow string          `json:"overflow"`
	Sizes    json.RawMessage `json:"sizes"`
}

// Deps is what the commands reach outside the process through.
type Deps struct {
	Env    func(string) string
	Stdout io.Writer
	Stderr io.Writer
	// Shoot opens a filled card and returns the page's verdict and, when png is set, the screenshot; nil means
	// package ui's Chrome. An error wrapping ui.ErrNoBrowser means there was no browser.
	Shoot func(ctx context.Context, html string, png bool) (Verdict, []byte, error)
	// Get fetches a URL's bytes for `md5 --url`; nil means a real HTTP GET.
	Get func(url string) ([]byte, error)
}

func (d Deps) env(k string) string {
	if d.Env == nil {
		return os.Getenv(k)
	}
	return d.Env(k)
}

func (d Deps) out() io.Writer {
	if d.Stdout == nil {
		return os.Stdout
	}
	return d.Stdout
}

// verdictExpr reads the verdict the page's fit script wrote on <html>.
const verdictExpr = `({ fit: document.documentElement.getAttribute('data-fit'), overflow: document.documentElement.getAttribute('data-overflow'), sizes: JSON.parse(document.documentElement.getAttribute('data-sizes') || '{}') })`

func (d Deps) shoot(ctx context.Context, html string, png bool) (Verdict, []byte, error) {
	if d.Shoot != nil {
		return d.Shoot(ctx, html, png)
	}
	s, err := ui.ShootHTML(ctx, d.env, html, Width, Height, `document.documentElement.getAttribute('data-fit')`, verdictExpr, 15*time.Second, png)
	if err != nil {
		return Verdict{}, nil, err
	}
	var v Verdict
	if err := json.Unmarshal(s.Verdict, &v); err != nil {
		return Verdict{}, nil, err
	}
	return v, s.PNG, nil
}

func (d Deps) get(url string) ([]byte, error) {
	if d.Get != nil {
		return d.Get(url)
	}
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Cache-Control", "no-store")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	return io.ReadAll(res.Body)
}

func fail(code int, format string, a ...any) error {
	return &nexterr.Exit{Code: code, Msg: "og-render: " + fmt.Sprintf(format, a...)}
}

const usage = "用法：dyna seo og layouts | html <params.json> <out.html> | render <params.json> <out.png> [--html <out.html>] | md5 <file> [--url <url>]（layouts / html / render 可加 --assets <版式目录>）"

// assets is the layouts' directory: --assets, else the plugin's skills/seo/og/assets.
func (d Deps) assets(cmd *cobra.Command) (string, error) {
	if a, _ := cmd.Flags().GetString("assets"); a != "" {
		return a, nil
	}
	root := d.env(EnvPluginRoot)
	if root == "" {
		return "", fail(1, "不知道版式模板在哪：%s 没设（经插件的 bin/dyna 调用会自己设），也没给 --assets <目录>", EnvPluginRoot)
	}
	return filepath.Join(root, "skills", "seo", "og", "assets"), nil
}

func (d Deps) layouts(cmd *cobra.Command) (string, []string, error) {
	dir, err := d.assets(cmd)
	if err != nil {
		return "", nil, err
	}
	ls, err := Layouts(dir)
	if err != nil {
		return "", nil, fail(1, "读不了版式目录 %s：%v", dir, reason(err))
	}
	return dir, ls, nil
}

func reason(err error) string {
	var pe *os.PathError
	if errors.As(err, &pe) {
		return pe.Err.Error()
	}
	return err.Error()
}

// build reads and checks the params file and fills its layout: exit 1 for a missing or broken file, 2 for params
// that do not make a card.
func (d Deps) build(cmd *cobra.Command, paramsFile string) (Card, error) {
	dir, layouts, err := d.layouts(cmd)
	if err != nil {
		return Card{}, err
	}
	raw, err := os.ReadFile(paramsFile)
	if err != nil {
		return Card{}, fail(1, "找不到 %s", paramsFile)
	}
	params, err := jsx.ParseJSON(raw)
	if err != nil {
		return Card{}, fail(1, "%s 不是合法 JSON：%v", paramsFile, err)
	}
	if _, errs := Normalize(params, layouts); len(errs) > 0 {
		return Card{}, fail(2, "params 有问题：\n- %s", strings.Join(errs, "\n- "))
	}
	abs, err := filepath.Abs(paramsFile)
	if err != nil {
		return Card{}, fail(1, "%v", err)
	}
	card, err := RenderHTML(params, filepath.Dir(abs), dir)
	if err != nil {
		return Card{}, fail(2, "%s", err.Error())
	}
	return card, nil
}

func (d Deps) printJSON(v any) error {
	var b bytes.Buffer
	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return err
	}
	_, err := d.out().Write(b.Bytes())
	return err
}

func md5Hex(b []byte) string {
	s := md5.Sum(b)
	return hex.EncodeToString(s[:])
}

const paramsDoc = `params.json（路径相对 params 文件）：
  layout     版式，dyna seo og layouts 列出的之一（必填）
  title      大标题（必填）
  brand      没有 logo 时显示的名字（必填）
  kicker     小标签（可选）
  sub        一两行副标题（可选）
  site       域名或标语（可选）
  logo       logo 图片文件（可选）
  image      split 版式的主体图片（可选）
  stat       split 版式的数字面板 { value, label }（可选）
  colors     { bg, surface, ink, muted, accent, accentInk } 的任意子集；没给的用中性默认值
  font       { family, link }：family 是 CSS font-family 列表，link 是加载它的 https 样式表地址（可选）
  titleSize  { max, min }：标题最大、最小字号（px）；不给就用各版式自己的范围
  lang       html 的 lang；不给就从标题判断
退出码：0 写出了；1 用法、读写或没有可用的浏览器；2 params 不合法；3（md5 --url）服务器给的字节和磁盘上的不一样；4（render）文字缩到最小字号还放不下（PNG 照写出，但不能用）`

func leaf(use, short string, run func(cmd *cobra.Command, args []string) error) *cobra.Command {
	c := &cobra.Command{Use: use, Short: short, Long: short + "\n\n" + paramsDoc, Args: cobra.ArbitraryArgs, SilenceUsage: true, SilenceErrors: true, RunE: run}
	c.SetFlagErrorFunc(func(*cobra.Command, error) error { return &nexterr.Exit{Code: 1, Msg: usage} })
	registry.Mark(c, registry.CallerSession, "")
	return c
}

// Command is the `og` group of the seo module.
func Command(d Deps) *cobra.Command {
	root := registry.Group("og", "OG 分享卡：用插件自带的版式，把文章的字和项目的品牌值渲染成 1200×630 的 PNG")

	layouts := leaf("layouts", "列出版式，一行一个", func(cmd *cobra.Command, args []string) error {
		_, ls, err := d.layouts(cmd)
		if err != nil {
			return err
		}
		fmt.Fprintln(d.out(), strings.Join(ls, "\n"))
		return nil
	})

	html := leaf("html <params.json> <out.html>", "只填版式、不开浏览器：写出 HTML，打印 {html, layout, defaults}", func(cmd *cobra.Command, args []string) error {
		if len(args) < 2 {
			return &nexterr.Exit{Code: 1, Msg: usage}
		}
		card, err := d.build(cmd, args[0])
		if err != nil {
			return err
		}
		if err := os.WriteFile(args[1], []byte(card.HTML), 0o644); err != nil {
			return fail(1, "%v", err)
		}
		return d.printJSON(struct {
			HTML     string   `json:"html"`
			Layout   string   `json:"layout"`
			Defaults []string `json:"defaults"`
		}{args[1], card.Layout, card.Defaults})
	})

	render := leaf("render <params.json> <out.png>", "填版式、在浏览器里让字自己缩到放得下、截 1200×630：打印 {png, layout, defaults, md5, fit, overflow, sizes}；放不下退出 4，没有浏览器退出 1 并写出 HTML 供手动截图", func(cmd *cobra.Command, args []string) error {
		if len(args) < 2 {
			return &nexterr.Exit{Code: 1, Msg: usage}
		}
		card, err := d.build(cmd, args[0])
		if err != nil {
			return err
		}
		htmlOut, _ := cmd.Flags().GetString("html")
		if htmlOut != "" {
			if err := os.WriteFile(htmlOut, []byte(card.HTML), 0o644); err != nil {
				return fail(1, "%v", err)
			}
		}
		v, png, err := d.shoot(cmd.Context(), card.HTML, true)
		if err != nil {
			if !errors.Is(err, ui.ErrNoBrowser) {
				return fail(1, "%v", err)
			}
			keep := htmlOut
			if keep == "" {
				keep = regexp.MustCompile(`(?i)\.png$`).ReplaceAllString(args[1], "") + ".html"
			}
			if err := os.WriteFile(keep, []byte(card.HTML), 0o644); err != nil {
				return fail(1, "%v", err)
			}
			return fail(1, "找不到可用的 Chrome 或 Chromium，没法自己截图。\n已写出 %s：照 `dyna runtime show 浏览器` 的「无头」打开它，等 <html data-fit=\"ok\">，再截 1200x630。", keep)
		}
		if err := os.WriteFile(args[1], png, 0o644); err != nil {
			return fail(1, "%v", err)
		}
		sizes := v.Sizes
		if len(sizes) == 0 {
			sizes = json.RawMessage("{}")
		}
		if err := d.printJSON(struct {
			PNG      string          `json:"png"`
			Layout   string          `json:"layout"`
			Defaults []string        `json:"defaults"`
			MD5      string          `json:"md5"`
			Fit      string          `json:"fit"`
			Overflow string          `json:"overflow"`
			Sizes    json.RawMessage `json:"sizes"`
		}{args[1], card.Layout, card.Defaults, md5Hex(png), v.Fit, v.Overflow, sizes}); err != nil {
			return err
		}
		if v.Fit != "ok" {
			return fail(4, "放不下：%s（已经缩到最小字号）。缩短这几段文字，或换一个版式。", v.Overflow)
		}
		return nil
	})
	render.Flags().String("html", "", "同时把填好的 HTML 写到这个文件")

	md5c := leaf("md5 <file>", "打印文件的 md5；带 --url 再取服务器上的这张图比一比：字节不一样（缓存或旧服务）退出 3", func(cmd *cobra.Command, args []string) error {
		if len(args) < 1 {
			return &nexterr.Exit{Code: 1, Msg: usage}
		}
		b, err := os.ReadFile(args[0])
		if err != nil {
			return fail(1, "找不到 %s", args[0])
		}
		disk := md5Hex(b)
		url, _ := cmd.Flags().GetString("url")
		if url == "" {
			return d.printJSON(map[string]any{"file": args[0], "md5": disk})
		}
		body, err := d.get(url)
		if err != nil {
			return fail(1, "取不到 url %s：%v", url, err)
		}
		served := md5Hex(body)
		if err := d.printJSON(struct {
			File   string `json:"file"`
			MD5    string `json:"md5"`
			URL    string `json:"url"`
			Served string `json:"served"`
		}{args[0], disk, url, served}); err != nil {
			return err
		}
		if served != disk {
			return fail(3, "服务器返回的字节和磁盘上的不一致（缓存或旧服务）。重启服务或换一个文件名再比。")
		}
		return nil
	})
	md5c.Flags().String("url", "", "预览服务里这张图的地址")

	for _, c := range []*cobra.Command{layouts, html, render} {
		c.Flags().String("assets", "", "版式目录；不给就用插件的 skills/seo/og/assets（"+EnvPluginRoot+" 由插件的 bin/dyna 设）")
	}
	root.AddCommand(layouts, html, render, md5c)
	return root
}
