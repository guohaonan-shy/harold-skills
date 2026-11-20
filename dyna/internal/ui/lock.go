package ui

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// One lock for the session's MCP browser, so parallel implementers take turns on it.
//
// A session has one MCP browser process, and its "current tab" is shared by everyone who calls it: two
// implementers driving it at once click on each other's pages. `dyna ui measure` launches its own browser and
// does not need this — only the MCP browser does.
//
// The lock is a directory: mkdir is atomic, so whoever creates it holds it. owner.json inside records who and
// since when. A holder that died leaves the directory behind, so a lock older than the stale limit is taken over;
// the orchestrator also force-releases it whenever an implementer hands back.

const ownerFile = "owner.json"

// LockOwner is what owner.json records.
type LockOwner struct {
	Owner string `json:"owner"`
	Since string `json:"since"`
}

// ReadOwner is who holds the lock at dir; nil when there is no readable owner.json.
func ReadOwner(dir string) *LockOwner {
	raw, err := os.ReadFile(filepath.Join(dir, ownerFile))
	if err != nil {
		return nil
	}
	var o LockOwner
	if json.Unmarshal(raw, &o) != nil {
		return nil
	}
	return &o
}

// LockStatus is what `status` prints.
type LockStatus struct {
	Held  bool
	Owner *string // nil: held, but no owner.json
	Since *string
	Stale bool
}

// JSON is the status the way the old script printed it: {"held":false}, or held with owner, since and stale.
func (s LockStatus) JSON() string {
	if !s.Held {
		return `{"held":false}`
	}
	str := func(p *string) string {
		if p == nil {
			return "null"
		}
		var b bytes.Buffer
		enc := json.NewEncoder(&b)
		enc.SetEscapeHTML(false)
		_ = enc.Encode(*p)
		return string(bytes.TrimSpace(b.Bytes()))
	}
	return fmt.Sprintf(`{"held":true,"owner":%s,"since":%s,"stale":%t}`, str(s.Owner), str(s.Since), s.Stale)
}

// timestamp is how owner.json writes a time: ISO 8601 in UTC with milliseconds, as JavaScript's toISOString did.
func timestamp(t time.Time) string { return t.UTC().Format("2006-01-02T15:04:05.000Z") }

// Status says whether dir is held, by whom, and whether the hold is old enough to be taken over after staleMin
// minutes.
func Status(dir string, staleMin float64, now time.Time) LockStatus {
	st, err := os.Stat(dir)
	if err != nil {
		return LockStatus{}
	}
	info := ReadOwner(dir)
	if info == nil {
		// The directory is there but owner.json is not: either a holder between its mkdir and its write
		// (give it a few seconds), or one that died there.
		return LockStatus{Held: true, Stale: now.Sub(st.ModTime()) > 10*time.Second}
	}
	stale := false
	if since, err := time.Parse(time.RFC3339Nano, info.Since); err == nil {
		stale = float64(now.Sub(since).Milliseconds()) > staleMin*60_000
	}
	return LockStatus{Held: true, Owner: &info.Owner, Since: &info.Since, Stale: stale}
}

// TryAcquire is one attempt. It reports whether this call now holds the lock.
func TryAcquire(dir, owner string, staleMin float64, now time.Time) (bool, error) {
	// The parents (e.g. a dated .tmp/dreaming/<date>/) may not exist yet; only the lock itself must be a single
	// atomic mkdir.
	if err := os.MkdirAll(filepath.Dir(dir), 0o755); err != nil {
		return false, err
	}
	if err := os.Mkdir(dir, 0o755); err != nil {
		if !os.IsExist(err) {
			return false, err
		}
		s := Status(dir, staleMin, now)
		if s.Held && s.Owner != nil && *s.Owner == owner {
			return true, nil
		}
		if !s.Held || !s.Stale {
			return false, nil
		}
		_ = os.RemoveAll(dir)
		if err := os.Mkdir(dir, 0o755); err != nil {
			return false, nil
		}
	}
	var b bytes.Buffer
	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(LockOwner{Owner: owner, Since: timestamp(now)}); err != nil {
		return false, err
	}
	if err := os.WriteFile(filepath.Join(dir, ownerFile), b.Bytes(), 0o644); err != nil {
		return false, err
	}
	return true, nil
}

// Release frees the lock when owner holds it (or there is no owner.json to say who does), or whoever holds it
// when force is set. It reports whether the lock is free now.
func Release(dir, owner string, force bool) bool {
	if info := ReadOwner(dir); !force && info != nil && info.Owner != owner {
		return false
	}
	_ = os.RemoveAll(dir)
	return true
}
