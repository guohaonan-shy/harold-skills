// Package mcp is the design archive's MCP server: the query package's seven entries as seven read-only tools,
// over stdio.
//
// A thin forwarder: each tool calls query.Query with the same arguments the command line takes and returns the
// same JSON, so a tool call and the command line cannot drift apart. Nothing here writes — there is no tool that
// touches the archive; `prod/` is changed only by the archiving command after a human has approved.
//
// The three methods an MCP client needs (initialize, tools/list, tools/call) plus ping are spoken by hand as
// newline-delimited JSON-RPC 2.0. The archive is read from the project's directory in home (the home package's
// Locate): the project is the one the working directory's git repository is (a code worktree), or the one a tool
// call names in its optional `project` argument (a session opened in home itself). `design_affected` reads the
// code's git history, so it takes the code repository: the git top level of the working directory, or, with
// `project`, the project's clone in the list. A name that matches nothing, a project that is not recognized or has
// not moved into home, a missing argument: each is an MCP error *result* (`isError: true`) that says what is
// wrong, never a dead process.
package mcp

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/query"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/home"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/miniyaml"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
)

var supportedVersions = []string{"2025-06-18", "2025-03-26", "2024-11-05"}

const instructions = "设计档案的只读查询：七个工具对应页面、状态、用户路径、需求差异、反查、关键词、受影响的状态七种问法。"

const (
	deltaDescription   = "可选：某个需求（spec）的名字。给了就把它的 docs/design/tmp/<spec>/delta/ 叠在线上档案上，读「改完之后的样子」；不给就读线上现状。"
	projectDescription = "可选：项目名（home 项目清单里的名字）。会话开在代码仓库（或它的 worktree）里不用给，按当前目录认；会话开在 home 里时必须给。"
)

type prop struct{ name, description string }

type tool struct {
	name, entry, arg, description string
	properties                    []prop
}

func (t tool) argDescription() string {
	for _, p := range t.properties {
		if p.name == t.arg {
			return p.description
		}
	}
	return ""
}

func (t tool) inputSchema() *miniyaml.Map {
	props := miniyaml.NewMap()
	for _, p := range append(append([]prop{}, t.properties...), prop{"project", projectDescription}) {
		props.Set(p.name, strObj(p.description))
	}
	m := miniyaml.NewMap()
	m.Set("type", "object")
	m.Set("properties", props)
	m.Set("required", []any{t.arg})
	m.Set("additionalProperties", false)
	return m
}

func strObj(description string) *miniyaml.Map {
	m := miniyaml.NewMap()
	m.Set("type", "string")
	m.Set("description", description)
	return m
}

var deltaProp = prop{"delta", deltaDescription}

// tools are the seven lookups: MCP name → { entry, the input key that carries the entry's argument, … }.
var tools = []tool{
	{
		name: "design_page", entry: "page", arg: "name",
		description: "查一个页面的全部设计：区域与组件、它所有的状态及其进出的边、长页面的分段（每段的类型、定位、出发和落入的边、段内的状态、切图路径）、经过它的用户路径、用到的动效、所有决定与候选。" +
			"什么时候用：要改某个页面、给页面加一块、或要先弄清这个页面现在长什么样、有哪些状态时，先用它，不要自己翻 docs/design。",
		properties: []prop{{"name", "页面名（档案里页面对象的 id）"}, deltaProp},
	},
	{
		name: "design_state", entry: "state", arg: "name",
		description: "查一个状态：怎么进到这个状态（入口地址、前置条件、沿途每一步的操作，进不去时说清缺什么、试过什么）、进去之后应看到什么、截图路径。" +
			"什么时候用：要进某个状态复现问题、写测试、或核对实现的界面该是什么样时。",
		properties: []prop{{"name", "状态名（形如 页面--状态）"}, deltaProp},
	},
	{
		name: "design_journey", entry: "journey", arg: "name",
		description: "查一条用户路径：用户的意图加有序步骤，每一步怎么触发（边的定位与操作，或系统行为怎么让它发生）、到了应看到什么。" +
			"什么时候用：要走通一整段用户流程（端到端测试、验收、复现一串操作）时。",
		properties: []prop{{"name", "用户路径名"}, deltaProp},
	},
	{
		name: "design_diff", entry: "diff", arg: "spec",
		description: "查一个需求（spec）的设计差异：它的 delta/ 相对线上档案新增、改动（给出字段级与小节级差异）、删除了哪些对象。" +
			"什么时候用：要知道这个需求的设计到底改了什么、实现或审查要对着哪些变化时。本工具自己比较 delta/ 与线上，不接 delta 参数。",
		properties: []prop{{"spec", "需求（spec）的名字，即 docs/spec/ 下的目录名"}},
	},
	{
		name: "design_refs", entry: "refs", arg: "name",
		description: "反查：谁引用了这个组件（按名字或代码路径）、这个动效，或长页面的某一个分段——边、状态、用户路径、页面。" +
			"传 <页面>#<段>（如 mkt-pricing#faq）返回从这一段出发、落到这一段、发生在这一段里的边与状态；传 #<段类型>（如 #trust）返回所有页面里这一类的段。" +
			"什么时候用：要改一个组件、动效或页面的某一段、想知道它的影响面（哪些页面、哪些状态、哪些用户路径会跟着变）时；也可以拿代码文件路径反查它对应的组件。",
		properties: []prop{{"name", "组件名、组件的代码路径、动效名；或分段 <页面>#<段>（如 mkt-pricing#hero）；或一类分段 #<段类型>（如 #trust）"}, deltaProp},
	},
	{
		name: "design_keyword", entry: "keyword", arg: "text",
		description: "关键词搜索：名字、summary、正文里含有这些词的对象，按命中位置（名字 > summary > 正文）排序，每条带命中片段。" +
			"什么时候用：不知道对象叫什么、只记得一两个词或一个说法，想先找到相关的页面、状态、组件时；找到名字之后再用上面的精确查询。",
		properties: []prop{{"text", "一段文字；空格分开的每个词都会参与匹配"}, deltaProp},
	},
	{
		name: "design_affected", entry: "affected", arg: "commit",
		description: "给一个提交，交回自它以来改过的代码牵到的状态：改过的文件是某页面登记的代码，这页的全部状态都算；是某组件登记的代码，用到它的状态都算；被这些页面或组件的代码直接 import 的数据、样式、静态资源改了，也算它们改了。同时给出每个状态是被哪个页面或组件牵进来的（via），和档案一共多少个状态。" +
			"什么时候用：只想对「上次以来代码动过的界面」重新走一遍（增量截图对账），不想把整个档案都重跑时。",
		properties: []prop{{"commit", "起点提交：SHA、分支名或 HEAD~N；改动取从它到 HEAD"}, deltaProp},
	},
}

func toolNamed(name string) *tool {
	for i := range tools {
		if tools[i].name == name {
			return &tools[i]
		}
	}
	return nil
}

func listing() []any {
	out := make([]any, len(tools))
	for i, t := range tools {
		m := miniyaml.NewMap()
		m.Set("name", t.name)
		m.Set("description", t.description)
		m.Set("inputSchema", t.inputSchema())
		out[i] = m
	}
	return out
}

// Deps is what the server touches: the environment (where home is) and the working directory (which project the
// session is in).
type Deps struct {
	Env home.Env
	Cwd string
}

// ---------- running a tool ----------

func textResult(text string, isError bool) *miniyaml.Map {
	item := miniyaml.NewMap()
	item.Set("type", "text")
	item.Set("text", text)
	m := miniyaml.NewMap()
	m.Set("content", []any{item})
	if isError {
		m.Set("isError", true)
	}
	return m
}

// gitTop is the git top level of cwd, or "" when it is not in a git repository.
func gitTop(cwd string) string {
	cmd := exec.Command("git", "rev-parse", "--show-toplevel")
	cmd.Dir = cwd
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return ""
	}
	return strings.TrimSpace(out.String())
}

// roots is where the archive is and where the code is: root is the project's directory in home, codeRoot the code
// repository ("" when there is none to name). A failure is a *query.QueryError that says why not.
func roots(d Deps, project string) (root, codeRoot string, err error) {
	found := home.Locate(d.Cwd, d.Env, project)
	if !found.OK {
		return "", "", &query.QueryError{Msg: found.Message, Code: "no-repo"}
	}
	if project == "" {
		return found.ProjectDir, gitTop(d.Cwd), nil
	}
	return found.ProjectDir, found.CloneDir, nil
}

// blank says whether a decoded JSON value is not a string with something in it.
func notText(v any) bool {
	s, ok := v.(string)
	return !ok || strings.TrimSpace(s) == ""
}

// callTool is one tools/call. It returns an MCP result; every expected failure is an `isError` result.
func callTool(t tool, args any, d Deps) *miniyaml.Map {
	input, _ := args.(map[string]any)
	value := input[t.arg]
	if notText(value) {
		return textResult("缺少参数 "+t.arg+"（字符串）："+t.argDescription(), true)
	}
	if v, present := input["delta"]; present && notText(v) {
		return textResult("参数 delta 要是需求（spec）的名字，或者不给", true)
	}
	if v, present := input["project"]; present && notText(v) {
		return textResult("参数 project 要是项目名（home 项目清单里的名字），或者不给", true)
	}
	delta, _ := input["delta"].(string)
	project, _ := input["project"].(string)
	root, codeRoot, err := roots(d, project)
	var result any
	if err == nil {
		result, err = query.Query(root, t.entry, value.(string), query.Options{Delta: delta, CodeRoot: codeRoot})
	}
	if err != nil {
		var qe *query.QueryError
		if errors.As(err, &qe) {
			return textResult(qe.Msg, true)
		}
		return textResult("查询出错："+err.Error(), true)
	}
	// the command line treats "nothing matched" as a failure; so does the tool
	if t.entry == "keyword" {
		if m, ok := result.(*miniyaml.Map); ok {
			if matches, _ := m.Get("matches").([]any); len(matches) == 0 {
				return textResult(fmt.Sprintf("没有对象匹配「%s」", m.Get("query")), true)
			}
		}
	}
	text, err := miniyaml.JSON(result, 2)
	if err != nil {
		return textResult("查询出错："+err.Error(), true)
	}
	return textResult(text, false)
}

// ---------- JSON-RPC over stdio ----------

func ok(id any, result any) *miniyaml.Map {
	m := miniyaml.NewMap()
	m.Set("jsonrpc", "2.0")
	m.Set("id", id)
	m.Set("result", result)
	return m
}

func fail(id any, code int, message string) *miniyaml.Map {
	e := miniyaml.NewMap()
	e.Set("code", float64(code))
	e.Set("message", message)
	m := miniyaml.NewMap()
	m.Set("jsonrpc", "2.0")
	m.Set("id", id)
	m.Set("error", e)
	return m
}

// jsText is a decoded JSON value as JavaScript would write it into a message.
func jsText(v any) string {
	switch x := v.(type) {
	case nil:
		return "null"
	case string:
		return x
	case json.Number:
		return x.String()
	case bool:
		if x {
			return "true"
		}
		return "false"
	case []any:
		parts := make([]string, len(x))
		for i, e := range x {
			if e != nil {
				parts[i] = jsText(e)
			}
		}
		return strings.Join(parts, ",")
	}
	return "[object Object]"
}

// Handle answers one parsed message: the response to write, or nil (notifications get none).
func Handle(msg any, d Deps) *miniyaml.Map {
	obj, isObj := msg.(map[string]any)
	method, isStr := obj["method"].(string)
	if !isObj || !isStr {
		var id any
		if isObj {
			id = obj["id"]
		}
		return fail(id, -32600, "Invalid Request")
	}
	id, hasID := obj["id"]
	if !hasID {
		return nil // notifications/initialized, notifications/cancelled, …: nothing to answer
	}
	params, _ := obj["params"].(map[string]any)

	switch method {
	case "initialize":
		asked, _ := params["protocolVersion"].(string)
		version := supportedVersions[0]
		for _, v := range supportedVersions {
			if v == asked {
				version = asked
			}
		}
		caps := miniyaml.NewMap()
		caps.Set("tools", miniyaml.NewMap())
		info := miniyaml.NewMap()
		info.Set("name", "design-archive")
		info.Set("version", "1.0.0")
		r := miniyaml.NewMap()
		r.Set("protocolVersion", version)
		r.Set("capabilities", caps)
		r.Set("serverInfo", info)
		r.Set("instructions", instructions)
		return ok(id, r)
	case "ping":
		return ok(id, miniyaml.NewMap())
	case "tools/list":
		r := miniyaml.NewMap()
		r.Set("tools", listing())
		return ok(id, r)
	case "tools/call":
		var t *tool
		if name, isName := params["name"].(string); isName {
			t = toolNamed(name)
		}
		if t == nil {
			shown := "(未给名字)"
			if n := params["name"]; n != nil {
				shown = jsText(n)
			}
			names := make([]string, len(tools))
			for i, x := range tools {
				names[i] = x.name
			}
			return fail(id, -32602, "没有这个工具："+shown+"；可用："+strings.Join(names, "、"))
		}
		return ok(id, callTool(*t, params["arguments"], d))
	}
	return fail(id, -32601, "Method not found: "+method)
}

func decodeLine(line string) (any, error) {
	dec := json.NewDecoder(strings.NewReader(line))
	dec.UseNumber()
	var v any
	if err := dec.Decode(&v); err != nil {
		return nil, err
	}
	var rest any
	if err := dec.Decode(&rest); err != io.EOF {
		return nil, errors.New("trailing content")
	}
	return v, nil
}

func handleSafely(msg any, d Deps) (res *miniyaml.Map) {
	defer func() {
		if r := recover(); r != nil {
			var id any
			if m, isMap := msg.(map[string]any); isMap {
				id = m["id"]
			}
			res = fail(id, -32603, fmt.Sprintf("Internal error: %v", r))
		}
	}()
	return Handle(msg, d)
}

// Serve speaks MCP on in and out until in ends: one JSON message per line.
func Serve(in io.Reader, out io.Writer, d Deps) error {
	if d.Env == nil {
		d.Env = home.OSEnv
	}
	if d.Cwd == "" {
		d.Cwd, _ = os.Getwd()
	}
	write := func(m *miniyaml.Map) error {
		text, err := miniyaml.JSON(m, 0)
		if err != nil {
			return err
		}
		_, err = io.WriteString(out, text+"\n")
		return err
	}
	r := bufio.NewReader(in)
	for {
		line, readErr := r.ReadString('\n')
		if strings.TrimSpace(line) != "" {
			msg, err := decodeLine(line)
			var res *miniyaml.Map
			if err != nil {
				res = fail(nil, -32700, "Parse error")
			} else {
				res = handleSafely(msg, d)
			}
			if res != nil {
				if err := write(res); err != nil {
					return err
				}
			}
		}
		if readErr != nil {
			if readErr == io.EOF {
				return nil
			}
			return readErr
		}
	}
}

// Command is `design-archive`: serve the design archive's MCP on the process's stdin and stdout.
func Command() *cobra.Command {
	return CommandWith(Deps{Env: home.OSEnv})
}

// CommandWith is Command with its dependencies given (tests).
func CommandWith(d Deps) *cobra.Command {
	c := &cobra.Command{
		Use:           "design-archive",
		Short:         "设计档案的 MCP 服务（只读，七个查询工具），走标准输入输出",
		Args:          cobra.NoArgs,
		SilenceUsage:  true,
		SilenceErrors: true,
	}
	c.RunE = func(cmd *cobra.Command, args []string) error {
		return Serve(cmd.InOrStdin(), cmd.OutOrStdout(), d)
	}
	registry.Mark(c, registry.CallerSession, "")
	return c
}
