package flow

import (
	"encoding/base64"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/archive"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/jsx"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/miniyaml"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
)

const usage = "用法：dyna design flow compose <flow.json> <out.png> [--archive <repo-root> [--delta <spec-slug>]]"

var mimes = map[string]string{".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}

var (
	flowName = regexp.MustCompile(`^flow-(\d+)-`)
	pngEnd   = regexp.MustCompile(`(?i)\.png$`)
)

// shoot is the one place that needs a browser. The screenshot is taken with the TARGET PROJECT's playwright (this
// binary has none, and the plugin dir is read-only with no node_modules), so a small node script resolves it from
// the current directory. Exit 3 from the script means no playwright could be resolved.
const shoot = `
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const [html, out] = process.argv.slice(1);
const req = createRequire(pathToFileURL(join(process.cwd(), 'noop.js')));
const unwrap = (mod) => (mod.chromium ? mod : mod.default);
let pw = null;
for (const name of ['playwright', 'playwright-core']) {
  try { pw = unwrap(await import(pathToFileURL(req.resolve(name)).href)); break; } catch { /* try the next one */ }
}
if (!pw) process.exit(3);
const browser = await pw.chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1600, height: 900 } });
  await page.goto(pathToFileURL(resolve(html)).href);
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  await page.locator('#flow').screenshot({ path: out });
} finally {
  await browser.close();
}
`

func noPlaywright(htmlPath, out string) string {
	return fmt.Sprintf("flow-compose: 已写出 %s，但目标项目里解析不到 playwright，没法自己截图。\n"+
		"  Playwright MCP 不开 file: 地址：在它所在目录起一个静态服务器（python3 -m http.server <port>），\n"+
		"  用 MCP 打开 http://127.0.0.1:<port>/<文件名>，等 document.body.dataset.ready === \"1\"，对 #flow 截图存成 %s，\n"+
		"  截完关掉服务器。MCP 只能往工作区里写文件，先存到工作区再挪过去。", htmlPath, out)
}

// Command is `design flow compose`. Exit 0 = written, 1 = usage / io error, 2 = the flow is invalid (problems listed).
func Command() *cobra.Command {
	c := &cobra.Command{
		Use:           "compose <flow.json> <out.png>",
		Short:         "把截图、箭头、一句话拼成一张交互流程图（PNG）；--archive 核对步骤里的状态名在不在设计档案，--delta 叠上这个需求的 delta/",
		Args:          cobra.ArbitraryArgs,
		SilenceUsage:  true,
		SilenceErrors: true,
	}
	c.Flags().String("archive", "", "仓库根：核对步骤的 state 在设计档案里有没有")
	c.Flags().String("delta", "", "把这个 spec 的 tmp/<spec-slug>/delta/ 叠在档案上再核对（要和 --archive 一起）")
	c.SetFlagErrorFunc(func(_ *cobra.Command, err error) error { return &nexterr.Exit{Code: 1, Msg: usage} })
	registry.Mark(c, registry.CallerSession, "dyna design flow compose <flow.json> <out.png>")
	c.RunE = func(cmd *cobra.Command, args []string) error { return compose(cmd, args) }
	return c
}

func compose(cmd *cobra.Command, args []string) error {
	usageErr := &nexterr.Exit{Code: 1, Msg: usage}
	fl := cmd.Flags()
	archiveDir, _ := fl.GetString("archive")
	delta, _ := fl.GetString("delta")
	// a flag with no value, or whose "value" is the next flag
	if (fl.Changed("archive") && (archiveDir == "" || strings.HasPrefix(archiveDir, "--"))) ||
		(fl.Changed("delta") && (delta == "" || strings.HasPrefix(delta, "--"))) {
		return usageErr
	}
	if len(args) != 2 || args[0] == "" || args[1] == "" || (delta != "" && archiveDir == "") {
		return usageErr
	}
	file, out := args[0], args[1]
	abs, err := filepath.Abs(file)
	if err != nil {
		return usageErr
	}
	base := filepath.Dir(abs)
	raw, err := os.ReadFile(file)
	var value any
	if err == nil {
		value, err = jsx.ParseJSON(raw)
	}
	if err != nil {
		reason := err.Error()
		if pe, ok := err.(*os.PathError); ok {
			reason = pe.Err.Error()
		}
		return &nexterr.Exit{Code: 1, Msg: fmt.Sprintf("flow-compose: 读不了 %s：%s", file, reason)}
	}

	var hasState func(string) bool
	if archiveDir != "" {
		if st, err := os.Stat(filepath.Join(archiveDir, "docs")); err != nil || st == nil {
			return &nexterr.Exit{Code: 1, Msg: fmt.Sprintf("flow-compose: %s 不是仓库根（下面没有 docs/）", archiveDir)}
		}
		root, _ := filepath.Abs(archiveDir)
		a, err := archive.Load(root, archive.Options{Delta: delta})
		if err != nil {
			return &nexterr.Exit{Code: 1, Msg: "flow-compose: " + err.Error()}
		}
		hasState = func(id string) bool { o := a.Objects[id]; return o != nil && o.Kind == "state" }
	}
	exists := func(p string) bool { _, err := os.Stat(filepath.Join(base, p)); return err == nil }
	if errs := Check(value, exists, hasState); len(errs) > 0 {
		return &nexterr.Exit{Code: 2, Msg: Report(errs, file)}
	}
	f := From(value)

	// A figure filed as flow-<n>-… in a spec must say which archive state it starts at, in its name.
	if m := flowName.FindStringSubmatch(filepath.Base(out)); m != nil {
		n, _ := strconv.Atoi(m[1])
		if wanted := FileName(f, n); wanted != "" && filepath.Base(out) != wanted {
			return &nexterr.Exit{Code: 2, Msg: fmt.Sprintf("flow-compose: 这张图的步骤带了状态 id，文件名要写成 %s（flow-<序号>-<第一格的状态名>.png），现在是 %s", wanted, filepath.Base(out))}
		}
	}
	dataURI := func(p string) string {
		mime := mimes[strings.ToLower(filepath.Ext(p))]
		if mime == "" {
			mime = "image/png"
		}
		b, _ := os.ReadFile(filepath.Join(base, p))
		return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(b)
	}
	stem := pngEnd.ReplaceAllString(out, "")
	htmlPath := stem + ".html"
	if err := os.WriteFile(htmlPath, []byte(RenderHTML(f, dataURI)), 0o644); err != nil {
		return &nexterr.Exit{Code: 1, Msg: "flow-compose: " + err.Error()}
	}
	// The HTML is disposable; this map is what stays beside the PNG when cells name archive states.
	if states := StateMap(f); len(states) > 0 {
		if err := os.WriteFile(stem+".states.json", []byte(statesJSON(states)+"\n"), 0o644); err != nil {
			return &nexterr.Exit{Code: 1, Msg: "flow-compose: " + err.Error()}
		}
	}

	stdout := cmd.OutOrStdout()
	node, err := exec.LookPath("node")
	if err != nil {
		fmt.Fprintln(stdout, noPlaywright(htmlPath, out))
		return nil
	}
	run := exec.Command(node, "--input-type=module", "-e", shoot, htmlPath, out)
	var errb strings.Builder
	run.Stderr = &errb
	err = run.Run()
	if ee, ok := err.(*exec.ExitError); ok && ee.ExitCode() == 3 {
		fmt.Fprintln(stdout, noPlaywright(htmlPath, out))
		return nil
	}
	if err != nil {
		msg := strings.TrimSpace(errb.String())
		if msg == "" {
			msg = err.Error()
		}
		return &nexterr.Exit{Code: 1, Msg: "flow-compose: 截图失败：" + msg}
	}
	fmt.Fprintf(stdout, "flow-compose: %s（HTML 留在 %s，可以删）\n", out, htmlPath)
	return nil
}

func statesJSON(states []StateRef) string {
	list := make([]any, 0, len(states))
	for _, s := range states {
		m := miniyaml.NewMap()
		m.Set("row", float64(s.Row))
		m.Set("step", float64(s.Step))
		m.Set("state", s.State)
		m.Set("caption", s.Caption)
		list = append(list, m)
	}
	text, _ := miniyaml.JSON(list, 2)
	return text
}
