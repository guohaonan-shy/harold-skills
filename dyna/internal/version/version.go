// Package version holds the one place dyna's own version is written.
// Changing any dyna code must raise it (scripts/dyna-version.test.mjs guards that).
package version

// Version is the semantic version of this dyna build. It is a variable, not a constant, only so that the plugin's
// launcher test can build binaries that report other versions (`-ldflags "-X .../version.Version=0.3.2"`); a
// release is built from this value as written.
var Version = "0.0.8"
