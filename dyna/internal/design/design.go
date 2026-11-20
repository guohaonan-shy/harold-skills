// Package design is the `design` module: the design archive (`docs/design/prod/`) read, checked, queried, written
// and shot, and the checks around a design run: the canvas lint, the direction note, the critic's round, the round's
// review report, the flow figure and the project's DESIGN.md. The work is in the packages beside it; this package
// only puts their commands in one tree: `dyna design archive …`, `lint`, `note submit`, `critic round`, `report`,
// `flow compose`, `md lint|diff`.
package design

import (
	"github.com/spf13/cobra"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/check"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/critic"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/designmd"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/flow"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/lint"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/note"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/query"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/report"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/sections"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/design/write"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/home"
	"github.com/guohaonan-shy/harold-skills/dyna/internal/registry"
)

// Deps is what the module reaches outside the process for.
type Deps struct {
	// Env reads environment variables; nil means the process's.
	Env home.Env
	// DesignMD is the official DESIGN.md tool; nil means the real one.
	DesignMD designmd.CLI
}

// Command is the `design` module with the process's own environment.
func Command() *cobra.Command { return CommandWith(Deps{}) }

// CommandWith is the `design` module.
func CommandWith(d Deps) *cobra.Command {
	root := registry.Group("design", "设计档案与设计流程的检查：档案校验、查询、归档、长页分段拍摄；画布 lint、方向说明、评委一轮、设计评审报告、流程图、DESIGN.md")
	archive := registry.Group("archive", "设计档案（docs/design/prod/）：check 校验、query 查询、write 归档、sections 长页分段拍摄")
	archive.AddCommand(check.Command(), query.Command(), write.Command(), sections.Command())

	notes := registry.Group("note", "方向说明：submit 交回时校验格式")
	notes.AddCommand(note.Command())
	critics := registry.Group("critic", "设计评委：round 校验评委一轮交回的形状，点出方向性意见")
	critics.AddCommand(critic.Command())
	flows := registry.Group("flow", "交互流程图：compose 把截图、箭头、文字拼成一张 PNG")
	flows.AddCommand(flow.Command())

	root.AddCommand(archive, lint.Command(), notes, critics, report.Command(), flows, designmd.Command(designmd.Deps{Env: d.Env, CLI: d.DesignMD}))
	return root
}
