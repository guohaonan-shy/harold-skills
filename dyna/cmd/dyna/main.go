// Command dyna is idea-loop's command line. This file only starts the command tree; the modules live in internal/.
package main

import (
	"os"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/app"
)

func main() {
	os.Exit(app.Run(os.Args[1:], app.OSIO()))
}
