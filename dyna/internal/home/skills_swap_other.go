//go:build !darwin && !linux

package home

import "errors"

// exchange is not available here; the caller falls back to two renames.
func exchange(a, b string) error { return errors.New("no atomic exchange on this system") }
