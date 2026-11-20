package seo

// SEO.md's writing-check keys (写作: lint 配置 / 补充 lint / 第二评委) and the 配图 section, and the check seo-setup runs
// before writing an image directory: the assertions of seo-md-writing-images.test.mjs, one for one.

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
	"testing"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/nexterr"
)

const writtenMd = "# SEO\n\n## 写作\n- 文风：`docs/reference/voice.md`\n- lint 配置：`docs/reference/writing-lint.json`\n- 补充 lint：`node scripts/voice-lint.mjs`\n- 第二评委：`node scripts/second-judge.mjs`\n\n" +
	"## 配图\n- 图片目录：`apps/site/public/images/blog/`\n- 生图工具：`mcp__imagegen__generate_image`\n- 封面字段：`cover`\n- OG 字段：`ogImage`\n- DESIGN.md 路径：`apps/site/DESIGN.md`\n"

const noneMd = "# SEO\n\n## 写作\n- lint 配置：无\n- 补充 lint：无\n- 第二评委：无\n\n## 配图\n- 图片目录：无\n- 生图工具：无\n- 封面字段：无\n- OG 字段：无\n- DESIGN.md 路径：无\n"

const unwrittenMd = "# SEO\n\n## 写作\n- 文风：`docs/reference/voice.md`\n\n## 配图\n- 说明：随便写点什么\n"

func newConfirmed(c Confirmed) []bool {
	return []bool{c.LintConfig, c.ExtraLint, c.SecondJudge, c.ImageDir, c.ImageTool, c.CoverField, c.OgField, c.DesignMd}
}

func ptrs(ps ...*string) []string {
	out := make([]string, len(ps))
	for i, p := range ps {
		out[i] = str1(p)
	}
	return out
}

func TestWritingLintConfigExtraLintAndSecondJudgeReadAsTheirValues(t *testing.T) {
	w := mustParse(t, writtenMd).Writing
	if got := ptrs(w.LintConfig, w.ExtraLint, w.SecondJudge, w.Voice); !reflect.DeepEqual(got, []string{"docs/reference/writing-lint.json", "node scripts/voice-lint.mjs", "node scripts/second-judge.mjs", "docs/reference/voice.md"}) {
		t.Fatal(got)
	}
}

func TestImagesEveryKeyReadsAsItsValue(t *testing.T) {
	i := mustParse(t, writtenMd).Images
	if got := ptrs(i.Dir, i.Tool, i.CoverField, i.OgField, i.DesignMd); !reflect.DeepEqual(got, []string{"apps/site/public/images/blog/", "mcp__imagegen__generate_image", "cover", "ogImage", "apps/site/DESIGN.md"}) {
		t.Fatal(got)
	}
}

func TestNoneOnANewKeyReadsAsEmptyAndConfirmed(t *testing.T) {
	s := mustParse(t, noneMd)
	if s.Writing.LintConfig != nil || s.Writing.ExtraLint != nil || s.Writing.SecondJudge != nil || s.Images != (Images{}) {
		t.Fatalf("%+v %+v", s.Writing, s.Images)
	}
	for i, c := range newConfirmed(s.Confirmed) {
		if !c {
			t.Errorf("key %d 写了无，是已确认", i)
		}
	}
}

func TestANewKeyNeverWrittenReadsAsEmptyAndUnconfirmedSoDoesAMissingImagesSection(t *testing.T) {
	for _, md := range []string{unwrittenMd, "# SEO\n"} {
		s := mustParse(t, md)
		if s.Writing.LintConfig != nil || s.Writing.ExtraLint != nil || s.Writing.SecondJudge != nil || s.Images != (Images{}) {
			t.Fatalf("%+v %+v", s.Writing, s.Images)
		}
		for i, c := range newConfirmed(s.Confirmed) {
			if c {
				t.Errorf("key %d 没写，是未确认", i)
			}
		}
	}
}

func TestAKeyWithAnEmptyValueIsNotWrittenAndKeysDoNotLeakIntoEachOther(t *testing.T) {
	s := mustParse(t, "## 写作\n- 补充 lint：\n- 第二评委：`./judge.sh --strict`\n\n## 配图\n- 封面字段：`cover`\n")
	if s.Writing.ExtraLint != nil || s.Confirmed.ExtraLint || str1(s.Writing.SecondJudge) != "./judge.sh --strict" ||
		str1(s.Images.CoverField) != "cover" || s.Images.OgField != nil || !s.Confirmed.CoverField || s.Confirmed.OgField {
		t.Fatalf("%+v %+v %+v", s.Writing, s.Images, s.Confirmed)
	}
}

func TestTheExistingConfirmedKeysKeepTheirMeaning(t *testing.T) {
	if c := mustParse(t, writtenMd).Confirmed; c.Competitors || c.BrandTerms {
		t.Fatal(c)
	}
}

var imageContent = []string{"apps/site/src/content/blog/", "apps/site/public/images/**"}

func TestAnImageDirectoryInsideTheContentPathsPasses(t *testing.T) {
	for dir, paths := range map[string][]string{
		"apps/site/public/images/blog/":    imageContent, // under a ** glob
		"apps/site/public/images":          imageContent, // the directory the glob names
		"./apps/site/src/content/blog/img": imageContent, // under a listed directory, ./ is spelling
	} {
		if r := ImageDirInScope(dir, paths); !r.InScope {
			t.Errorf("%s: %+v", dir, r)
		}
	}
}

func TestAnImageDirectoryOutsideTheContentPathsIsReportedWithTheDirectoryAndWhy(t *testing.T) {
	r := ImageDirInScope("apps/site/src/assets/blog", imageContent)
	if r.InScope || r.Dir != "apps/site/src/assets/blog" || !regexp.MustCompile(`内容路径`).MatchString(r.Reason) {
		t.Fatalf("%+v", r)
	}
	for dir, paths := range map[string][]string{
		"apps/site/public":              imageContent, // wider than the scope
		"apps/site/public/images/blog/": {},           // no 内容路径 written: nothing counts
		"docs/assets":                   {},           // docs/ is in the project directory, not the code repository
		"../elsewhere":                  imageContent, // climbing out
		"":                              imageContent, // no directory
	} {
		if ImageDirInScope(dir, paths).InScope {
			t.Errorf("%q is not inside", dir)
		}
	}
}

func TestScopeImageDirAgainstTheSeoMdInHandPrintsTheVerdictAsJSON(t *testing.T) {
	md := filepath.Join(t.TempDir(), "SEO.md")
	var quoted []string
	for _, c := range imageContent {
		quoted = append(quoted, "`"+c+"`")
	}
	os.WriteFile(md, []byte("# SEO\n\n## 构建与检查\n- 内容路径："+strings.Join(quoted, "；")+"\n"), 0o644)
	var got struct {
		InScope      bool
		ContentPaths []string
	}
	out, _, code := runCLI(t, "scope", md, "--image-dir=apps/site/public/images/blog/")
	if code != 0 || json.Unmarshal([]byte(out), &got) != nil || !got.InScope {
		t.Fatal(code, out)
	}
	out, _, code = runCLI(t, "scope", md, "--image-dir=apps/site/src/assets/blog")
	if code != 0 || json.Unmarshal([]byte(out), &got) != nil || got.InScope || !reflect.DeepEqual(got.ContentPaths, imageContent) {
		t.Fatal(code, out)
	}
}

// runCLI runs `dyna seo <args>` in process: stdout, the error text, and the exit code (1 for a plain error, as dyna
// prints it).
func runCLI(t *testing.T, args ...string) (stdout, errText string, code int) {
	t.Helper()
	var out bytes.Buffer
	c := Command(Deps{Stdout: &out, Stdin: strings.NewReader("")})
	c.SetArgs(args)
	c.SetOut(&out)
	c.SetErr(&out)
	if err := c.Execute(); err != nil {
		var ex *nexterr.Exit
		if errors.As(err, &ex) {
			return out.String(), ex.Msg, ex.Code
		}
		return out.String(), err.Error(), 1
	}
	return out.String(), "", 0
}
