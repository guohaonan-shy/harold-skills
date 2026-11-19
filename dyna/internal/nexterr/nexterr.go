// Package nexterr is the error type every dyna command returns: what went wrong, and the next command to run.
package nexterr

import "fmt"

// Error carries the reason and, optionally, the next command the caller should run.
// A command's plain errors get that command's registered next command appended when printed;
// an Error (HasNext set, even with an empty Next) says exactly what to print instead.
type Error struct {
	Msg     string
	Next    string
	HasNext bool
}

func (e *Error) Error() string { return e.Msg }

// New is an error with its own next command.
func New(next, format string, a ...any) *Error {
	return &Error{Msg: fmt.Sprintf(format, a...), Next: next, HasNext: true}
}

// Plain is an error whose message already says what to do, so no next command is appended.
func Plain(format string, a ...any) *Error {
	return &Error{Msg: fmt.Sprintf(format, a...), HasNext: true}
}

// Exit ends the process with Code after printing Msg (when not empty) to stderr, with no next line.
type Exit struct {
	Code int
	Msg  string
}

func (e *Exit) Error() string { return e.Msg }
