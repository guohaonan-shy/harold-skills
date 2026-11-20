// Command sectionscli is what the browser test drives: it runs the `sections` command (sectionscli sections <args>),
// or one code builder on a JSON config read from stdin (sectionscli generate <name>), or dyna's PNG decoder and
// comparison (sectionscli png decode < file.png, sectionscli png compare <a.png> <b.png>). It is not part of dyna.
package main

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"

	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/sections"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/ui"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/uicompare"
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
	case "png":
		pngCommand(os.Args[2:])
	default:
		os.Exit(2)
	}
}

// pngCommand is `png decode` (stdin → { width, height, data: base64 RGBA }) and `png compare <a> <b>` (the result of
// `dyna ui compare` with its default tolerances, as JSON).
func pngCommand(args []string) {
	fail := func(err error) {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	switch {
	case len(args) == 1 && args[0] == "decode":
		in, _ := io.ReadAll(os.Stdin)
		img, err := ui.DecodePNG(in, "PNG")
		if err != nil {
			fail(err)
		}
		out, _ := json.Marshal(map[string]any{"width": img.Width, "height": img.Height, "data": base64.StdEncoding.EncodeToString(img.Data)})
		os.Stdout.Write(out)
	case len(args) == 3 && args[0] == "compare":
		a, err := os.ReadFile(args[1])
		if err != nil {
			fail(err)
		}
		b, err := os.ReadFile(args[2])
		if err != nil {
			fail(err)
		}
		r, err := ui.ComparePNGs(a, b, uicompare.DefaultAntialiasTolerance, uicompare.DefaultPixelThreshold)
		if err != nil {
			fail(err)
		}
		out, _ := json.Marshal(r)
		os.Stdout.Write(out)
	default:
		os.Exit(2)
	}
}
