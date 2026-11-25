// Package registry is the one list of dyna's commands: `--help`, `dyna registry --json` and the plugin's scan
// test all read the cobra command tree, so there is no second copy to drift. Each leaf command is marked with
// who may call it and which command to run next when it fails.
package registry

import (
	"bytes"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/spf13/cobra"
	"github.com/spf13/pflag"
)

// Who may call a command.
const (
	CallerSession = "session" // a session (the main one or a subagent) following a skill
	CallerHook    = "hook"    // only a hook in hooks.json
	CallerTest    = "test"    // only tests, REVIEW.md and DEVELOPMENT.md
)

const (
	annCaller = "dyna.caller"
	annNext   = "dyna.next"
)

// Mark says who may call cmd, and the next command to run when it fails (may be empty).
func Mark(cmd *cobra.Command, caller, next string) {
	if cmd.Annotations == nil {
		cmd.Annotations = map[string]string{}
	}
	cmd.Annotations[annCaller] = caller
	if next != "" {
		cmd.Annotations[annNext] = next
	}
}

// CallerOf is who may call cmd ("" for a group).
func CallerOf(cmd *cobra.Command) string { return cmd.Annotations[annCaller] }

// NextOf is the next command to run when cmd fails ("" when none).
func NextOf(cmd *cobra.Command) string { return cmd.Annotations[annNext] }

// Group makes a module (or a sub-group): a command that only holds commands. Run bare it prints its command
// table; given a word that is not one of its commands it says so and lists them.
func Group(use, short string) *cobra.Command {
	g := &cobra.Command{Use: use, Short: short, SilenceUsage: true, SilenceErrors: true}
	g.RunE = func(cmd *cobra.Command, args []string) error {
		if len(args) == 0 {
			return cmd.Help()
		}
		var names []string
		for _, c := range cmd.Commands() {
			if c.Name() != "help" {
				names = append(names, c.Name())
			}
		}
		sort.Strings(names)
		return fmt.Errorf("不认识的命令「%s」（%s）", args[0], strings.Join(names, " / "))
	}
	return g
}

// Arg is one thing a command takes: a positional word or a flag.
type Arg struct {
	Name        string `json:"name"`
	Kind        string `json:"kind"` // positional | flag
	Required    bool   `json:"required"`
	Variadic    bool   `json:"variadic,omitempty"`   // positional: takes several
	Value       string `json:"value,omitempty"`      // flag: bool | string | stringArray
	Repeatable  bool   `json:"repeatable,omitempty"` // flag: may be given again
	Description string `json:"description,omitempty"`
}

// Command is one callable command.
type Command struct {
	Command string `json:"command"` // "issues show"
	Module  string `json:"module"`
	Use     string `json:"use"`
	Summary string `json:"summary"`
	Caller  string `json:"caller"`
	Next    string `json:"next"`
	Args    []Arg  `json:"args"`
}

// Registry is every command of one dyna version.
type Registry struct {
	Version  string    `json:"version"`
	Commands []Command `json:"commands"`
}

// Export walks the command tree under root and lists every leaf command, sorted by name.
func Export(root *cobra.Command, version string) Registry {
	r := Registry{Version: version, Commands: []Command{}}
	var walk func(c *cobra.Command, path []string)
	walk = func(c *cobra.Command, path []string) {
		for _, sub := range c.Commands() {
			if sub.Name() == "help" || sub.Hidden {
				continue
			}
			p := append(append([]string{}, path...), sub.Name())
			if len(sub.Commands()) > 0 {
				walk(sub, p)
				continue
			}
			r.Commands = append(r.Commands, Command{
				Command: strings.Join(p, " "),
				Module:  p[0],
				Use:     sub.Use,
				Summary: sub.Short,
				Caller:  CallerOf(sub),
				Next:    NextOf(sub),
				Args:    argsOf(sub),
			})
		}
	}
	walk(root, nil)
	sort.Slice(r.Commands, func(i, j int) bool { return r.Commands[i].Command < r.Commands[j].Command })
	return r
}

func argsOf(c *cobra.Command) []Arg {
	out := []Arg{}
	fields := strings.Fields(c.Use)
	if len(fields) > 1 {
		for _, f := range fields[1:] {
			variadic := strings.HasSuffix(f, "...")
			f = strings.TrimSuffix(f, "...")
			switch {
			case strings.HasPrefix(f, "<") && strings.HasSuffix(f, ">"):
				out = append(out, Arg{Name: f[1 : len(f)-1], Kind: "positional", Required: true, Variadic: variadic})
			case strings.HasPrefix(f, "[") && strings.HasSuffix(f, "]"):
				out = append(out, Arg{Name: f[1 : len(f)-1], Kind: "positional", Variadic: variadic})
			}
		}
	}
	var flags []Arg
	c.Flags().VisitAll(func(f *pflag.Flag) {
		if f.Name == "help" {
			return
		}
		flags = append(flags, Arg{Name: f.Name, Kind: "flag", Value: f.Value.Type(), Repeatable: f.Value.Type() == "stringArray", Description: f.Usage})
	})
	sort.Slice(flags, func(i, j int) bool { return flags[i].Name < flags[j].Name })
	return append(out, flags...)
}

// JSON is the registry as the stored file and `dyna registry --json` print it.
func (r Registry) JSON() []byte {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	_ = enc.Encode(r)
	return buf.Bytes()
}

// Find is the command whose full name is name ("issues show"); false when there is none.
func (r Registry) Find(name string) (Command, bool) {
	for _, c := range r.Commands {
		if c.Command == name {
			return c, true
		}
	}
	return Command{}, false
}
