package pr

// Delivery evidence store — one orphan branch per PR, deleted when the PR is merged.
//
// Delivery evidence (the human-verify flows and GIFs a ticket's implementer records, the figures a review round
// draws for its findings) only serves "is this delivery right?". It dies with the PR, so it never enters the code
// branch or docs/. It lives on its own orphan branch `idea-loop-evidence-pr-<N>`: never merged, no history shared
// with the code, deleted in one call. Rules and lifecycle: skills/engineering/pr/references/delivery-evidence.md of the plugin.
//
// Why a branch and not a release: a release asset URL is served as a download (`content-disposition:
// attachment`), so clicking an image in a PR comment downloads it instead of opening it full size. A file on a
// branch, linked as `blob/<branch>/<name>?raw=true`, redirects to raw.githubusercontent.com and comes back as
// `image/png` — the browser shows it, and it zooms. GitHub wraps every comment image in a link to its own src, so
// the embed alone is enough.
//
// The orphan tree holds no `.github/workflows`, so pushing to it starts no CI run. Files are a flat namespace, so
// the caller names them with their owner up front (`t03-flow-sentence-failed.png`, `r2-spec-1-quota-flow.png`,
// and `pr-` for the PR description's before/after shots). Uploading the same name again replaces it and the URL
// stays the same, so a re-recorded GIF does not touch the reports already posted.
//
// The writes go through the git data API, never touching the local checkout.

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/githubapp"
)

const (
	// MaxBytes is the biggest image a PR comment loads.
	MaxBytes = 10 * 1024 * 1024
)

// Extensions are the file types the evidence branch takes.
var Extensions = []string{".png", ".gif", ".jpg", ".jpeg", ".webp"}

var (
	assetNameRe   = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]*$`)
	assetPrefixRe = regexp.MustCompile(`^(t\d{2}|r\d+|pr)-`)
)

// EvidenceBranch is the branch of one PR's evidence.
func EvidenceBranch(pr string) string { return "idea-loop-evidence-pr-" + pr }

// ImageURL is the address to embed: it opens as an image in the browser, not as a download.
func ImageURL(repo, pr, name string) string {
	return fmt.Sprintf("https://github.com/%s/blob/%s/%s?raw=true", repo, EvidenceBranch(pr), name)
}

// File is one file of an upload; the size is passed in so the check stays pure.
type File struct {
	Path string
	Size int64
}

// jsExt is path.extname.
func jsExt(name string) string {
	i := strings.LastIndex(name, ".")
	if i <= 0 {
		return ""
	}
	return name[i:]
}

// CheckAssets validates the files of one upload; the errors say what to change.
func CheckAssets(files []File) []string {
	if len(files) == 0 {
		return []string{"没有要上传的文件"}
	}
	var errs []string
	seen := map[string]bool{}
	for _, f := range files {
		name := filepath.Base(f.Path)
		if !oneOf(Extensions, strings.ToLower(jsExt(name))) {
			errs = append(errs, fmt.Sprintf("%s：只收图片（%s）", name, strings.Join(Extensions, " / ")))
		}
		if !assetNameRe.MatchString(name) {
			errs = append(errs, fmt.Sprintf("%s：文件名只用小写字母、数字、点、横线、下划线（要直接放进图片地址里，别的字符会被转义，链接对不上）", name))
		}
		if !assetPrefixRe.MatchString(name) {
			errs = append(errs, fmt.Sprintf("%s：要以归属开头——工单素材 tNN-（如 t03-），review 第 N 轮的图 rN-（如 r2-），PR 描述的之前 / 之后对照 pr-；素材分支是平铺的，不带归属就会互相覆盖", name))
		}
		if seen[name] {
			errs = append(errs, fmt.Sprintf("%s：同一次上传里重名", name))
		}
		seen[name] = true
		if f.Size <= 0 {
			errs = append(errs, fmt.Sprintf("%s：空文件或不存在", name))
		} else if f.Size > MaxBytes {
			errs = append(errs, fmt.Sprintf("%s：%.1fMB，超过 10MB——裁短、降帧率或缩小尺寸再传，太大的图在 PR 里加载不出来", name, float64(f.Size)/1024/1024))
		}
	}
	return errs
}

// InvalidFilesError is an upload that CheckAssets refused; the command exits 2 on it.
type InvalidFilesError struct{ Problems []string }

func (e *InvalidFilesError) Error() string { return strings.Join(e.Problems, "\n") }

// store is one repository's evidence branches, written through the gh login.
type store struct {
	api  *githubapp.API
	run  githubapp.Runner
	repo string
}

func (s store) head(pr string) string {
	raw, err := s.api.Call("GET", fmt.Sprintf("repos/%s/git/ref/heads/%s", s.repo, EvidenceBranch(pr)), nil)
	if err != nil {
		return ""
	}
	var v struct {
		Object struct {
			SHA string `json:"sha"`
		} `json:"object"`
	}
	if json.Unmarshal(raw, &v) != nil {
		return ""
	}
	return v.Object.SHA
}

func (s store) names(pr string) ([]string, error) {
	sha := s.head(pr)
	if sha == "" {
		return nil, nil
	}
	raw, err := s.api.Call("GET", fmt.Sprintf("repos/%s/git/trees/%s", s.repo, sha), nil)
	if err != nil {
		return nil, err
	}
	var v struct {
		Tree []struct {
			Path string `json:"path"`
			Type string `json:"type"`
		} `json:"tree"`
	}
	if err := json.Unmarshal(raw, &v); err != nil {
		return nil, fmt.Errorf("gh 的回答读不懂：%v", err)
	}
	var out []string
	for _, e := range v.Tree {
		if e.Type == "blob" {
			out = append(out, e.Path)
		}
	}
	return out, nil
}

func (s store) sha(raw json.RawMessage, err error) (string, error) {
	if err != nil {
		return "", err
	}
	var v struct {
		SHA string `json:"sha"`
	}
	if err := json.Unmarshal(raw, &v); err != nil {
		return "", fmt.Errorf("gh 的回答读不懂：%v", err)
	}
	return v.SHA, nil
}

// Urls is a list of file names with their embed addresses, in order.
type Urls struct {
	Names []string
	URLs  map[string]string
}

func urlsOf(repo, pr string, names []string) Urls {
	u := Urls{Names: names, URLs: map[string]string{}}
	for _, n := range names {
		u.URLs[n] = ImageURL(repo, pr, n)
	}
	return u
}

// MarshalJSON writes the names in the order they were given.
func (u Urls) MarshalJSON() ([]byte, error) {
	pairs := make([]kv, 0, len(u.Names))
	for _, n := range u.Names {
		pairs = append(pairs, kv{n, u.URLs[n]})
	}
	return ordered(pairs).MarshalJSON()
}

// publish uploads files to the PR's evidence branch and returns their addresses.
func (s store) publish(pr string, paths []string) (Urls, error) {
	files := make([]File, len(paths))
	for i, p := range paths {
		files[i].Path = p
		if st, err := os.Stat(p); err == nil {
			files[i].Size = st.Size()
		}
	}
	if problems := CheckAssets(files); len(problems) > 0 {
		return Urls{}, &InvalidFilesError{Problems: problems}
	}
	parent := s.head(pr)
	type treeEntry struct {
		Path string `json:"path"`
		Mode string `json:"mode"`
		Type string `json:"type"`
		SHA  string `json:"sha"`
	}
	var tree []treeEntry
	for _, p := range paths {
		data, err := os.ReadFile(p)
		if err != nil {
			return Urls{}, err
		}
		sha, err := s.sha(s.api.Call("POST", fmt.Sprintf("repos/%s/git/blobs", s.repo), map[string]string{"content": base64.StdEncoding.EncodeToString(data), "encoding": "base64"}))
		if err != nil {
			return Urls{}, err
		}
		tree = append(tree, treeEntry{filepath.Base(p), "100644", "blob", sha})
	}
	treeBody := map[string]any{"tree": tree}
	if parent != "" {
		raw, err := s.api.Call("GET", fmt.Sprintf("repos/%s/git/commits/%s", s.repo, parent), nil)
		if err != nil {
			return Urls{}, err
		}
		var c struct {
			Tree struct {
				SHA string `json:"sha"`
			} `json:"tree"`
		}
		if err := json.Unmarshal(raw, &c); err != nil {
			return Urls{}, fmt.Errorf("gh 的回答读不懂：%v", err)
		}
		treeBody["base_tree"] = c.Tree.SHA
	}
	treeSha, err := s.sha(s.api.Call("POST", fmt.Sprintf("repos/%s/git/trees", s.repo), treeBody))
	if err != nil {
		return Urls{}, err
	}
	var names []string
	for _, t := range tree {
		names = append(names, t.Path)
	}
	parents := []string{}
	if parent != "" {
		parents = []string{parent}
	}
	commit, err := s.sha(s.api.Call("POST", fmt.Sprintf("repos/%s/git/commits", s.repo), map[string]any{
		"message": fmt.Sprintf("PR #%s 交付证据：%s\n\nidea-loop 素材分支，不合并，PR 合并或关闭后整个删除。", pr, strings.Join(names, ", ")),
		"tree":    treeSha,
		"parents": parents,
	}))
	if err != nil {
		return Urls{}, err
	}
	if parent != "" {
		_, err = s.api.Call("PATCH", fmt.Sprintf("repos/%s/git/refs/heads/%s", s.repo, EvidenceBranch(pr)), map[string]any{"sha": commit, "force": false})
	} else {
		_, err = s.api.Call("POST", fmt.Sprintf("repos/%s/git/refs", s.repo), map[string]any{"ref": "refs/heads/" + EvidenceBranch(pr), "sha": commit})
	}
	if err != nil {
		return Urls{}, err
	}
	return urlsOf(s.repo, pr, names), nil
}

// cleanup deletes the PR's evidence branch (no-op when absent) and says what it did, one line each.
func (s store) cleanup(pr string) ([]string, error) {
	var said []string
	files, err := s.names(pr)
	if err != nil {
		return nil, err
	}
	if s.head(pr) != "" {
		if _, err := s.api.Call("DELETE", fmt.Sprintf("repos/%s/git/refs/heads/%s", s.repo, EvidenceBranch(pr)), nil); err != nil {
			return nil, err
		}
		said = append(said, fmt.Sprintf("已删除 %s（%d 个文件）", EvidenceBranch(pr), len(files)))
	} else {
		said = append(said, fmt.Sprintf("%s 不存在，无需删除", EvidenceBranch(pr)))
	}
	// Before 0.0.16 evidence lived in a draft release under the same name; sweep one left over.
	out, err := s.run([]string{"release", "view", EvidenceBranch(pr), "--repo", s.repo, "--json", "isDraft"}, "", nil)
	if err == nil {
		var rel struct {
			IsDraft bool `json:"isDraft"`
		}
		if json.Unmarshal([]byte(out), &rel) == nil && rel.IsDraft {
			if _, err := s.run([]string{"release", "delete", EvidenceBranch(pr), "--repo", s.repo, "--yes"}, "", nil); err == nil {
				said = append(said, fmt.Sprintf("另删除了旧版留下的 draft release %s", EvidenceBranch(pr)))
			}
		}
	}
	return said, nil
}
