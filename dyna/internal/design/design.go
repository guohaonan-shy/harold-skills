// Package design is the `design` module: the design archive (`docs/design/prod/`) read, checked, queried,
// written and shot. The work is in the packages beside it: archive (the parsed archive every command shares),
// check, query, write and sections; this package only puts their commands under `dyna design archive`.
package design

import (
	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/check"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/query"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/sections"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/write"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
)

// Command is the `design` module.
func Command() *cobra.Command {
	root := registry.Group("design", "设计档案：校验、查询、归档、长页分段拍摄")
	archive := registry.Group("archive", "设计档案（docs/design/prod/）：check 校验、query 查询、write 归档、sections 长页分段拍摄")
	archive.AddCommand(check.Command(), query.Command(), write.Command(), sections.Command())
	root.AddCommand(archive)
	return root
}
