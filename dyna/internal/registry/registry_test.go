package registry

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/spf13/cobra"
)

func tree() *cobra.Command {
	root := &cobra.Command{Use: "dyna"}
	mod := Group("mod", "a module")
	show := &cobra.Command{Use: "show <docs> [limit] <n>...", Short: "shows", RunE: func(*cobra.Command, []string) error { return nil }}
	show.Flags().Bool("apply", false, "really do it")
	show.Flags().StringArray("type", nil, "a category")
	show.Flags().String("state", "todo", "which state")
	Mark(show, CallerSession, "dyna mod other")
	guard := &cobra.Command{Use: "guard", Short: "guards", RunE: func(*cobra.Command, []string) error { return nil }}
	Mark(guard, CallerHook, "")
	sub := Group("sub", "a sub-group")
	deep := &cobra.Command{Use: "deep <x>", Short: "deep", RunE: func(*cobra.Command, []string) error { return nil }}
	Mark(deep, CallerTest, "")
	sub.AddCommand(deep)
	mod.AddCommand(show, guard, sub)
	root.AddCommand(mod)
	return root
}

func TestExportListsEveryLeafWithCallerNextAndArgs(t *testing.T) {
	r := Export(tree(), "9.9.9")
	if r.Version != "9.9.9" {
		t.Fatal(r.Version)
	}
	var names []string
	for _, c := range r.Commands {
		names = append(names, c.Command)
	}
	if !reflect.DeepEqual(names, []string{"mod guard", "mod show", "mod sub deep"}) {
		t.Fatal(names)
	}
	show, _ := r.Find("mod show")
	if show.Caller != CallerSession || show.Next != "dyna mod other" || show.Module != "mod" || show.Summary != "shows" {
		t.Fatalf("%+v", show)
	}
	want := []Arg{
		{Name: "docs", Kind: "positional", Required: true},
		{Name: "limit", Kind: "positional"},
		{Name: "n", Kind: "positional", Required: true, Variadic: true},
		{Name: "apply", Kind: "flag", Value: "bool", Description: "really do it"},
		{Name: "state", Kind: "flag", Value: "string", Description: "which state"},
		{Name: "type", Kind: "flag", Value: "stringArray", Repeatable: true, Description: "a category"},
	}
	if !reflect.DeepEqual(show.Args, want) {
		t.Fatalf("%+v", show.Args)
	}
	if g, _ := r.Find("mod guard"); g.Caller != CallerHook {
		t.Fatal(g)
	}
	if d, _ := r.Find("mod sub deep"); d.Caller != CallerTest || d.Module != "mod" {
		t.Fatal(d)
	}
}

func TestTheJSONIsStableAndHasNoHTMLEscapes(t *testing.T) {
	a, b := Export(tree(), "1.0.0").JSON(), Export(tree(), "1.0.0").JSON()
	if string(a) != string(b) {
		t.Fatal("not stable")
	}
	var back Registry
	if err := json.Unmarshal(a, &back); err != nil || len(back.Commands) != 3 {
		t.Fatal(err)
	}
}

func TestAGroupRefusesAWordThatIsNotItsCommand(t *testing.T) {
	root := tree()
	root.SetArgs([]string{"mod", "frobnicate"})
	root.SilenceErrors, root.SilenceUsage = true, true
	err := root.Execute()
	if err == nil || err.Error() != "不认识的命令「frobnicate」（guard / show / sub）" {
		t.Fatal(err)
	}
}
