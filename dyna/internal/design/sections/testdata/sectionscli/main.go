// Command sectionscli is what the browser test drives: it runs the `sections` command (sectionscli sections <args>),
// or one code builder on a JSON config read from stdin (sectionscli generate <name>). It is not part of dyna.
package main

import (
	"errors"
	"fmt"
	"io"
	"os"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/sections"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: sectionscli sections <args> | generate <name>")
		os.Exit(2)
	}
	switch os.Args[1] {
	case "generate":
		in, _ := io.ReadAll(os.Stdin)
		input, err := sections.ParseJSON(string(in))
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(2)
		}
		out, err := sections.Generate(os.Args[2], input)
		if err != nil {
			fmt.Fprintln(os.Stderr, err.Error())
			os.Exit(1)
		}
		fmt.Print(out)
	case "sections":
		root := &cobra.Command{Use: "dyna", SilenceUsage: true, SilenceErrors: true}
		root.AddCommand(sections.Command())
		root.SetArgs(os.Args[1:])
		if err := root.Execute(); err != nil {
			var exit *nexterr.Exit
			if errors.As(err, &exit) {
				if exit.Msg != "" {
					fmt.Fprintln(os.Stderr, exit.Msg)
				}
				os.Exit(exit.Code)
			}
			fmt.Fprintln(os.Stderr, err.Error())
			os.Exit(1)
		}
	default:
		os.Exit(2)
	}
}
