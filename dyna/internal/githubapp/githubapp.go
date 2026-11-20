// Package githubapp is the GitHub identity of idea-loop's own posts: the GitHub App configured for a repository
// speaks (when the review loop is archived to a PR, say), otherwise the account `gh` is logged in with, with no
// signature line either way. The installation token lives only in this process and is never printed or written;
// every write sends its JSON on stdin, so PR text is never part of a command line. Configuration and permissions are described in
// skills/engineering/pr/references/review-loop.md of the plugin.
package githubapp

import (
	"bytes"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// Identities the API can speak as.
const (
	IdentityApp     = "app"
	IdentityGHLogin = "gh-login"
)

// Runner runs `gh <args>` with stdin and extra environment (KEY=value) and returns what it printed. Commands take
// it as a value so tests can answer the reads and record the writes; the real one starts the gh program.
type Runner func(args []string, stdin string, env []string) (string, error)

// GHError is a failed gh call. Its message is what gh said on stderr.
type GHError struct {
	Stderr string
	Err    error
}

func (e *GHError) Error() string {
	if s := strings.TrimSpace(e.Stderr); s != "" {
		return s
	}
	if e.Err != nil {
		return e.Err.Error()
	}
	return "gh failed"
}

func (e *GHError) Unwrap() error { return e.Err }

// ExecGH is the real gh, started in dir ("" is the current directory).
func ExecGH(dir string) Runner {
	return func(args []string, stdin string, env []string) (string, error) {
		cmd := exec.Command("gh", args...)
		cmd.Dir = dir
		if len(env) > 0 {
			cmd.Env = append(os.Environ(), env...)
		}
		cmd.Stdin = strings.NewReader(stdin)
		var out, errb bytes.Buffer
		cmd.Stdout, cmd.Stderr = &out, &errb
		if err := cmd.Run(); err != nil {
			return out.String(), &GHError{Stderr: errb.String(), Err: err}
		}
		return out.String(), nil
	}
}

func homeOf(env func(string) string) string {
	home := ""
	if env != nil {
		home = env("HOME")
	}
	if home == "" {
		home, _ = os.UserHomeDir()
	}
	return home
}

// ConfigFile is where the repositories' GitHub Apps are written down: a JSON object keyed by owner/repo, each
// with the App's id and the path of its private key.
func ConfigFile(env func(string) string) string {
	return filepath.Join(homeOf(env), ".idea-loop", "github-apps.json")
}

// Config is one repository's App.
type Config struct {
	AppID          int64
	PrivateKeyPath string
}

func expandHome(path string, env func(string) string) string {
	if strings.HasPrefix(path, "~/") {
		return homeOf(env) + path[1:]
	}
	return path
}

// LoadConfig reads repo's entry of the config file; nil with no error when there is no file or no entry (the gh
// login speaks then). An entry without a usable App id or key path is an error.
func LoadConfig(repo, path string, env func(string) string) (*Config, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, nil
	}
	var all map[string]json.RawMessage
	if err := json.Unmarshal(raw, &all); err != nil {
		return nil, fmt.Errorf("%s 读不懂：%v", path, err)
	}
	entryRaw, ok := all[repo]
	if !ok || string(entryRaw) == "null" || string(entryRaw) == "false" {
		return nil, nil
	}
	var entry struct {
		AppID          any    `json:"appId"`
		PrivateKeyPath string `json:"privateKeyPath"`
	}
	bad := fmt.Errorf("Invalid GitHub App config for %s", repo)
	if err := json.Unmarshal(entryRaw, &entry); err != nil {
		return nil, bad
	}
	id, isNum := entry.AppID.(float64)
	if !isNum || id != float64(int64(id)) || id > 9007199254740991 || id < -9007199254740991 || entry.PrivateKeyPath == "" {
		return nil, bad
	}
	return &Config{AppID: int64(id), PrivateKeyPath: expandHome(entry.PrivateKeyPath, env)}, nil
}

func b64(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }

// JWT is the short-lived token that proves to GitHub that we are the App: RS256, issued a minute ago, valid for
// nine more.
func JWT(appID int64, privateKeyPEM []byte, nowSeconds int64) (string, error) {
	block, _ := pem.Decode(privateKeyPEM)
	if block == nil {
		return "", fmt.Errorf("the App's private key is not a PEM file")
	}
	var key *rsa.PrivateKey
	if k, err := x509.ParsePKCS8PrivateKey(block.Bytes); err == nil {
		rk, ok := k.(*rsa.PrivateKey)
		if !ok {
			return "", fmt.Errorf("the App's private key is not an RSA key")
		}
		key = rk
	} else if k, err2 := x509.ParsePKCS1PrivateKey(block.Bytes); err2 == nil {
		key = k
	} else {
		return "", fmt.Errorf("the App's private key cannot be read: %v", err)
	}
	header := b64([]byte(`{"alg":"RS256","typ":"JWT"}`))
	payload := b64([]byte(fmt.Sprintf(`{"iat":%d,"exp":%d,"iss":"%d"}`, nowSeconds-60, nowSeconds+540, appID)))
	sum := sha256.Sum256([]byte(header + "." + payload))
	sig, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, sum[:])
	if err != nil {
		return "", err
	}
	return header + "." + payload + "." + b64(sig), nil
}

// Options is what an API reaches outside the process through; every field has a real default.
type Options struct {
	Env        func(string) string
	ConfigPath string // default: ConfigFile(Env)
	HTTP       *http.Client
	BaseURL    string // default https://api.github.com
	Now        func() time.Time
	Run        Runner // default: the real gh
}

func (o Options) base() string {
	if o.BaseURL != "" {
		return strings.TrimRight(o.BaseURL, "/")
	}
	return "https://api.github.com"
}

func (o Options) client() *http.Client {
	if o.HTTP != nil {
		return o.HTTP
	}
	return &http.Client{Timeout: 30 * time.Second}
}

func (o Options) now() time.Time {
	if o.Now != nil {
		return o.Now()
	}
	return time.Now()
}

func (o Options) run() Runner {
	if o.Run != nil {
		return o.Run
	}
	return ExecGH("")
}

// Token mints an installation token for repo from its App; "" with no error when the repository has no App.
func Token(repo string, cfg *Config, o Options) (string, error) {
	if cfg == nil {
		return "", nil
	}
	pemBytes, err := os.ReadFile(cfg.PrivateKeyPath)
	if err != nil {
		return "", fmt.Errorf("读不到 GitHub App 的私钥「%s」：%v", cfg.PrivateKeyPath, err)
	}
	jwt, err := JWT(cfg.AppID, pemBytes, o.now().Unix())
	if err != nil {
		return "", err
	}
	do := func(method, url string) (int, []byte, error) {
		req, err := http.NewRequest(method, url, nil)
		if err != nil {
			return 0, nil, err
		}
		req.Header.Set("Authorization", "Bearer "+jwt)
		req.Header.Set("Accept", "application/vnd.github+json")
		req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
		resp, err := o.client().Do(req)
		if err != nil {
			return 0, nil, err
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		return resp.StatusCode, body, nil
	}
	status, body, err := do("GET", fmt.Sprintf("%s/repos/%s/installation", o.base(), repo))
	if err != nil {
		return "", err
	}
	if status < 200 || status > 299 {
		return "", fmt.Errorf("GitHub App %d is not installed on %s (%d)", cfg.AppID, repo, status)
	}
	var inst struct {
		ID int64 `json:"id"`
	}
	if err := json.Unmarshal(body, &inst); err != nil {
		return "", fmt.Errorf("GitHub 对 installation 的回答读不懂：%v", err)
	}
	status, body, err = do("POST", fmt.Sprintf("%s/app/installations/%d/access_tokens", o.base(), inst.ID))
	if err != nil {
		return "", err
	}
	if status < 200 || status > 299 {
		return "", fmt.Errorf("Could not mint an installation token for %s (%d)", repo, status)
	}
	var tok struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(body, &tok); err != nil {
		return "", fmt.Errorf("GitHub 对 access_tokens 的回答读不懂：%v", err)
	}
	return tok.Token, nil
}

// API calls GitHub's REST API through gh as one identity.
type API struct {
	// Identity is IdentityApp when the repository's App speaks, IdentityGHLogin when the gh login does.
	Identity string
	token    string
	run      Runner
}

// ForRepo picks the identity for repo: its App when one is configured, else the gh login.
func ForRepo(repo string, o Options) (*API, error) {
	path := o.ConfigPath
	if path == "" {
		path = ConfigFile(o.Env)
	}
	cfg, err := LoadConfig(repo, path, o.Env)
	if err != nil {
		return nil, err
	}
	token, err := Token(repo, cfg, o)
	if err != nil {
		return nil, err
	}
	a := &API{Identity: IdentityGHLogin, run: o.run(), token: token}
	if token != "" {
		a.Identity = IdentityApp
	}
	return a, nil
}

// AsGHLogin is an API that always speaks as the gh login, for what is not the App's to say (the evidence branch).
func AsGHLogin(run Runner) *API {
	if run == nil {
		run = ExecGH("")
	}
	return &API{Identity: IdentityGHLogin, run: run}
}

func (a *API) call(method, endpoint string, data any, paginate bool) (json.RawMessage, error) {
	args := []string{"api", endpoint, "--method", method}
	if paginate {
		args = append(args, "--paginate", "--slurp")
	}
	stdin := ""
	if data != nil {
		var buf bytes.Buffer
		enc := json.NewEncoder(&buf)
		enc.SetEscapeHTML(false)
		if err := enc.Encode(data); err != nil {
			return nil, err
		}
		args = append(args, "--input", "-")
		stdin = buf.String()
	}
	var env []string
	if a.token != "" {
		env = []string{"GH_TOKEN=" + a.token}
	}
	out, err := a.run(args, stdin, env)
	if err != nil {
		return nil, err
	}
	raw := json.RawMessage(strings.TrimSpace(out))
	if len(raw) == 0 {
		return json.RawMessage("null"), nil // a 204 answers with nothing
	}
	var probe map[string]json.RawMessage
	if json.Unmarshal(raw, &probe) == nil {
		if e, ok := probe["errors"]; ok && string(e) != "null" && string(e) != "false" {
			return nil, fmt.Errorf("%s", string(e))
		}
	}
	return raw, nil
}

// Call is one request with an optional JSON body.
func (a *API) Call(method, endpoint string, data any) (json.RawMessage, error) {
	return a.call(method, endpoint, data, false)
}

// GetAll reads every page of a list endpoint and returns the items in order.
func (a *API) GetAll(endpoint string) ([]json.RawMessage, error) {
	raw, err := a.call("GET", endpoint, nil, true)
	if err != nil {
		return nil, err
	}
	var pages []json.RawMessage
	if err := json.Unmarshal(raw, &pages); err != nil {
		return nil, fmt.Errorf("gh 的回答读不懂：%v", err)
	}
	var items []json.RawMessage
	for _, p := range pages {
		var page []json.RawMessage
		if json.Unmarshal(p, &page) == nil {
			items = append(items, page...)
		} else {
			items = append(items, p)
		}
	}
	return items, nil
}
