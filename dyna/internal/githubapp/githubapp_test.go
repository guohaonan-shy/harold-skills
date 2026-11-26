package githubapp

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func writeKey(t *testing.T, dir string, pkcs1 bool) (*rsa.PrivateKey, string) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	var block *pem.Block
	if pkcs1 {
		block = &pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)}
	} else {
		der, err := x509.MarshalPKCS8PrivateKey(key)
		if err != nil {
			t.Fatal(err)
		}
		block = &pem.Block{Type: "PRIVATE KEY", Bytes: der}
	}
	path := filepath.Join(dir, "app.pem")
	if err := os.WriteFile(path, pem.EncodeToMemory(block), 0o600); err != nil {
		t.Fatal(err)
	}
	return key, path
}

// GitHub App identity: config lookup, signed JWT, installation token, no config means the gh login.
func TestConfigLookupJWTAndInstallationToken(t *testing.T) {
	for _, pkcs1 := range []bool{false, true} { // a key GitHub hands out is PKCS#1; a converted one is PKCS#8
		dir := t.TempDir()
		key, pemPath := writeKey(t, dir, pkcs1)
		cfgPath := filepath.Join(dir, "github-apps.json")
		must(t, os.WriteFile(cfgPath, []byte(`{"owner/repo":{"appId":4948428,"privateKeyPath":"`+pemPath+`"}}`), 0o600))
		env := func(k string) string { return map[string]string{"HOME": dir}[k] }

		if c, err := LoadConfig("other/repo", cfgPath, env); c != nil || err != nil {
			t.Fatal(c, err)
		}
		if c, err := LoadConfig("owner/repo", filepath.Join(dir, "missing.json"), env); c != nil || err != nil {
			t.Fatal(c, err)
		}
		cfg, err := LoadConfig("owner/repo", cfgPath, env)
		if err != nil || cfg == nil || cfg.AppID != 4948428 || cfg.PrivateKeyPath != pemPath {
			t.Fatal(cfg, err)
		}

		pemBytes, _ := os.ReadFile(pemPath)
		jwt, err := JWT(cfg.AppID, pemBytes, 1_000_000)
		if err != nil {
			t.Fatal(err)
		}
		parts := strings.Split(jwt, ".")
		sig, _ := base64.RawURLEncoding.DecodeString(parts[2])
		sum := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
		if err := rsa.VerifyPKCS1v15(&key.PublicKey, crypto.SHA256, sum[:], sig); err != nil {
			t.Fatalf("the signature does not verify: %v", err)
		}
		head, _ := base64.RawURLEncoding.DecodeString(parts[0])
		if string(head) != `{"alg":"RS256","typ":"JWT"}` {
			t.Fatal(string(head))
		}
		payload, _ := base64.RawURLEncoding.DecodeString(parts[1])
		var got map[string]any
		must(t, json.Unmarshal(payload, &got))
		if got["iat"] != float64(999_940) || got["exp"] != float64(1_000_540) || got["iss"] != "4948428" || len(got) != 3 {
			t.Fatal(got)
		}

		type req struct{ method, path, auth string }
		var reqs []req
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			reqs = append(reqs, req{r.Method, r.URL.Path, r.Header.Get("Authorization")})
			switch r.URL.Path {
			case "/repos/owner/repo/installation":
				w.Write([]byte(`{"id":55}`))
			case "/app/installations/55/access_tokens":
				w.WriteHeader(201)
				w.Write([]byte(`{"token":"ghs_test"}`))
			default:
				w.WriteHeader(404)
			}
		}))
		defer srv.Close()
		o := Options{BaseURL: srv.URL, Now: func() time.Time { return time.Unix(1_000_000, 0) }}
		tok, err := Token("owner/repo", cfg, o)
		if err != nil || tok != "ghs_test" {
			t.Fatal(tok, err)
		}
		if len(reqs) != 2 || reqs[0].method != "GET" || reqs[1].method != "POST" {
			t.Fatal(reqs)
		}
		for _, r := range reqs {
			if !strings.HasPrefix(r.auth, "Bearer ") {
				t.Fatal(r)
			}
		}
		if tok, err := Token("owner/repo", nil, o); tok != "" || err != nil {
			t.Fatal("no config, no token:", tok, err)
		}
		// an App that is not installed on the repository
		gone := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(404) }))
		defer gone.Close()
		if _, err := Token("owner/repo", cfg, Options{BaseURL: gone.URL}); err == nil || !strings.Contains(err.Error(), "not installed") {
			t.Fatal(err)
		}
	}
}

func TestAConfigEntryWithoutAnAppIdOrKeyIsAnError(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "github-apps.json")
	for _, entry := range []string{`{"appId":"12","privateKeyPath":"/k"}`, `{"appId":12}`, `{"appId":1.5,"privateKeyPath":"/k"}`, `"x"`} {
		must(t, os.WriteFile(cfgPath, []byte(`{"o/r":`+entry+`}`), 0o600))
		if _, err := LoadConfig("o/r", cfgPath, nil); err == nil || !strings.Contains(err.Error(), "Invalid GitHub App config for o/r") {
			t.Errorf("%s: %v", entry, err)
		}
	}
	must(t, os.WriteFile(cfgPath, []byte(`{"o/r":{"appId":7,"privateKeyPath":"~/keys/app.pem"}}`), 0o600))
	cfg, err := LoadConfig("o/r", cfgPath, func(k string) string { return map[string]string{"HOME": "/home/x"}[k] })
	if err != nil || cfg.PrivateKeyPath != "/home/x/keys/app.pem" {
		t.Fatal(cfg, err)
	}
}

func TestTheConfigFileIsInTheHomeOfTheEnvironment(t *testing.T) {
	if got := ConfigFile(func(k string) string { return map[string]string{"HOME": "/h"}[k] }); got != "/h/.idea-loop/github-apps.json" {
		t.Fatal(got)
	}
}

// The API speaks as the App when the repository has one: the token goes to gh as its environment, never as an
// argument, and the JSON of a write goes on stdin.
func TestTheAppSpeaksThroughGhWithItsTokenInTheEnvironmentAndTheBodyOnStdin(t *testing.T) {
	dir := t.TempDir()
	_, pemPath := writeKey(t, dir, false)
	must(t, os.WriteFile(filepath.Join(dir, "github-apps.json"), []byte(`{"o/r":{"appId":9,"privateKeyPath":"`+pemPath+`"}}`), 0o600))
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/repos/o/r/installation" {
			w.Write([]byte(`{"id":1}`))
			return
		}
		w.Write([]byte(`{"token":"ghs_secret"}`))
	}))
	defer srv.Close()
	var seen []struct {
		args  []string
		stdin string
		env   []string
	}
	run := func(args []string, stdin string, env []string) (string, error) {
		seen = append(seen, struct {
			args  []string
			stdin string
			env   []string
		}{args, stdin, env})
		return `{"html_url":"https://x/1"}`, nil
	}
	api, err := ForRepo("o/r", Options{ConfigPath: filepath.Join(dir, "github-apps.json"), BaseURL: srv.URL, Run: run})
	if err != nil || api.Identity != IdentityApp {
		t.Fatal(api, err)
	}
	if _, err := api.Call("POST", "repos/o/r/issues/3/comments", map[string]string{"body": "a <b> & c"}); err != nil {
		t.Fatal(err)
	}
	got := seen[0]
	if strings.Join(got.args, " ") != "api repos/o/r/issues/3/comments --method POST --input -" {
		t.Fatal(got.args)
	}
	if got.stdin != "{\"body\":\"a <b> & c\"}\n" {
		t.Fatalf("%q", got.stdin)
	}
	if len(got.env) != 1 || got.env[0] != "GH_TOKEN=ghs_secret" {
		t.Fatal(got.env)
	}
	for _, a := range got.args {
		if strings.Contains(a, "ghs_secret") {
			t.Fatal("the token must not be on the command line")
		}
	}
}

func TestWithoutAnAppTheGhLoginSpeaksAndPagesAreFlattened(t *testing.T) {
	dir := t.TempDir()
	var args []string
	run := func(a []string, stdin string, env []string) (string, error) {
		args = a
		if len(env) != 0 {
			t.Fatal("the gh login needs no token", env)
		}
		return `[[{"id":1},{"id":2}],[{"id":3}]]`, nil
	}
	api, err := ForRepo("o/r", Options{ConfigPath: filepath.Join(dir, "nothing.json"), Run: run})
	if err != nil || api.Identity != IdentityGHLogin {
		t.Fatal(api, err)
	}
	items, err := api.GetAll("repos/o/r/issues/3/comments?per_page=100")
	if err != nil || len(items) != 3 || string(items[2]) != `{"id":3}` {
		t.Fatal(items, err)
	}
	if strings.Join(args, " ") != "api repos/o/r/issues/3/comments?per_page=100 --method GET --paginate --slurp" {
		t.Fatal(args)
	}
}

func TestAnErrorsFieldInTheAnswerIsAnError(t *testing.T) {
	api := AsGHLogin(func([]string, string, []string) (string, error) { return `{"errors":[{"message":"nope"}]}`, nil })
	if _, err := api.Call("POST", "repos/o/r/issues/3/comments", map[string]string{"body": "x"}); err == nil || !strings.Contains(err.Error(), "nope") {
		t.Fatal(err)
	}
	empty := AsGHLogin(func([]string, string, []string) (string, error) { return "", nil })
	if raw, err := empty.Call("DELETE", "repos/o/r/git/refs/heads/b", nil); err != nil || string(raw) != "null" {
		t.Fatal(string(raw), err)
	}
}

func must(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}
