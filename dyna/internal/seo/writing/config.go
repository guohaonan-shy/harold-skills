// Package writing is `dyna seo writing lint`: the mechanical half of checking an article (markdown / mdx with
// frontmatter). It flags only what a pattern can verify: sentence and comma counts, filler phrases, caption and
// frontmatter gaps, markup slips, EN / ZH structure parity. Whether a hook is strong or a thesis holds is a judgment,
// left to a reader (a judge sub-agent), never to this command.
//
// Rules (name: what it flags; severity). Every rule can be switched off in the config.
//
//	para-sentences        a paragraph with more sentences than the limit; warn
//	visual-break          a run of prose longer than the limit with no list, table, image, quote or rule; warn
//	bullet-long           a list item wider than the limit (a CJK character counts 2); note
//	transition-density    more transition words than sentences in one paragraph (and more than one); note
//	dash-density          em-dashes per 100 words above the limit, counted over the whole article; note
//	comma-chain           one sentence with more commas than the limit, ignoring parentheses and short enumerations; warn
//	faq-thin              an FAQ answer shorter than the minimum, so it cannot stand alone when quoted; warn
//	ai-slop               a filler phrase from the word list; warn
//	colon-opener          a paragraph that opens with a label and a colon ("So:", "In other words:"); warn
//	stray-italic          `*italic*` outside the exempt places (the first blockquote, a whole-paragraph footnote, a link label); warn
//	image-caption         an image with no caption, a caption equal to its alt text, or a caption that is only a "Figure N" label; error
//	required-fields       a required frontmatter field is missing or empty; error
//	image-field           none of the image frontmatter fields is set; warn
//	faqs-field            the FAQ frontmatter field is missing; warn
//	locale-parity         the counts of H2, H3, tables, images, captions or blockquotes differ between the two language
//	                      versions of one article (`<slug>.en.md`, `<slug>.zh-CN.md`); warn. With
//	                      `localePair.requireBoth`, a missing version is an error too.
//	table-div-align       a table cell aligned with <div style="text-align...">; error
//	tilde-number          "~20" in prose; note
//	numeric-range-hyphen  "15-20" with a hyphen instead of an en-dash; note
//
// The config (`--config`, a JSON file) is merged over DefaultConfig: anything left out keeps its default, a list
// replaces the default list, and a key the command does not know is an error, so a typo cannot pass silently.
package writing

import (
	"encoding/json"
	"fmt"
	"math"

	"github.com/guohaonan-shy/harold-skills/dyna/internal/frontmatter"
)

// Rules is every rule, in the order the report lists them.
var Rules = []string{
	"para-sentences", "visual-break", "bullet-long", "transition-density", "dash-density", "comma-chain",
	"faq-thin", "ai-slop", "colon-opener", "stray-italic", "image-caption", "required-fields",
	"image-field", "faqs-field", "locale-parity", "table-div-align", "tilde-number", "numeric-range-hyphen",
}

// ByLang is one value per language.
type ByLang[T any] struct {
	En T `json:"en"`
	Zh T `json:"zh"`
}

// Of is the value for lang ("en" or "zh").
func (b ByLang[T]) Of(lang string) T {
	if lang == "zh" {
		return b.Zh
	}
	return b.En
}

// Config is the lint's knobs.
type Config struct {
	Thresholds struct {
		MaxSentencesPerParagraph  float64         `json:"maxSentencesPerParagraph"`
		VisualBreakWords          ByLang[float64] `json:"visualBreakWords"`
		MaxBulletWidth            float64         `json:"maxBulletWidth"`
		MaxTransitionsPerSentence float64         `json:"maxTransitionsPerSentence"`
		MaxDashPer100Words        float64         `json:"maxDashPer100Words"`
		MaxCommasPerSentence      float64         `json:"maxCommasPerSentence"`
		FaqMinWords               ByLang[float64] `json:"faqMinWords"`
	} `json:"thresholds"`
	Wordlists struct {
		AISlop       ByLang[[]string] `json:"aiSlop"`
		Transitions  ByLang[[]string] `json:"transitions"`
		ColonOpeners ByLang[[]string] `json:"colonOpeners"`
	} `json:"wordlists"`
	Fields struct {
		Required         []string `json:"required"`
		Image            []string `json:"image"`
		Faqs             string   `json:"faqs"`
		FaqAnswer        string   `json:"faqAnswer"`
		CaptionAttribute string   `json:"captionAttribute"`
	} `json:"fields"`
	LocalePair struct {
		En          string `json:"en"`
		Zh          string `json:"zh"`
		RequireBoth bool   `json:"requireBoth"`
	} `json:"localePair"`
	Italic struct {
		ExemptFirstBlockquote bool `json:"exemptFirstBlockquote"`
	} `json:"italic"`
	DisableRules []string `json:"disableRules"`
}

// defaultJSON is the default config, in the order its keys are documented (the order a merge walks them in).
const defaultJSON = `{
  "thresholds": {
    "maxSentencesPerParagraph": 4,
    "visualBreakWords": { "en": 250, "zh": 400 },
    "maxBulletWidth": 240,
    "maxTransitionsPerSentence": 1,
    "maxDashPer100Words": 1,
    "maxCommasPerSentence": 3,
    "faqMinWords": { "en": 25, "zh": 40 }
  },
  "wordlists": {
    "aiSlop": {
      "en": ["furthermore", "moreover", "in addition", "needless to say", "it's important to note", "it is important to note", "last but not least"],
      "zh": ["此外", "值得注意的是", "综上所述", "总而言之", "不言而喻", "众所周知"]
    },
    "transitions": {
      "en": ["however", "nevertheless", "additionally", "consequently", "therefore", "thus", "hence"],
      "zh": ["然而", "不过", "因此", "从而", "进而", "故而"]
    },
    "colonOpeners": {
      "en": ["so", "and so", "in other words", "put simply", "simply put", "the result", "the takeaway", "the point", "bottom line", "net net", "translation"],
      "zh": ["所以", "也就是说", "简单说", "简言之", "换句话说", "结论", "总之"]
    }
  },
  "fields": {
    "required": ["title", "excerpt"],
    "image": ["cover", "ogImage"],
    "faqs": "faqs",
    "faqAnswer": "a",
    "captionAttribute": "title"
  },
  "localePair": { "en": "en", "zh": "zh-CN", "requireBoth": false },
  "italic": { "exemptFirstBlockquote": true },
  "disableRules": []
}`

func defaultTree() *frontmatter.Map {
	v, err := parseJSON([]byte(defaultJSON))
	if err != nil {
		panic(err)
	}
	return v.(*frontmatter.Map)
}

// DefaultConfig is the config with nothing overridden.
func DefaultConfig() Config {
	c, err := toConfig(defaultTree())
	if err != nil {
		panic(err)
	}
	return c
}

func toConfig(tree *frontmatter.Map) (Config, error) {
	b, err := frontmatter.JSON(tree, 0)
	if err != nil {
		return Config{}, err
	}
	var c Config
	err = json.Unmarshal([]byte(b), &c)
	return c, err
}

func contains(xs []string, x string) bool {
	for _, y := range xs {
		if y == x {
			return true
		}
	}
	return false
}

// merge deep-merges a user value over base, rejecting unknown keys and wrong types.
func merge(user any, base *frontmatter.Map, path string) (*frontmatter.Map, error) {
	u, ok := frontmatter.AsMap(user)
	if !ok {
		return nil, fmt.Errorf("config%s: expected an object", path)
	}
	for _, key := range u.Keys() {
		if !base.Has(key) {
			return nil, fmt.Errorf("config: unknown key \"%s%s\"", path, key)
		}
	}
	out := frontmatter.NewMap()
	for _, key := range base.Keys() {
		def := base.Get(key)
		if !u.Has(key) {
			out.Set(key, def)
			continue
		}
		v := u.Get(key)
		where := path + key
		switch d := def.(type) {
		case *frontmatter.Map:
			m, err := merge(v, d, where+".")
			if err != nil {
				return nil, err
			}
			out.Set(key, m)
		case []any:
			list, ok := v.([]any)
			for _, x := range list {
				if _, isStr := x.(string); !isStr {
					ok = false
				}
			}
			if !ok {
				return nil, fmt.Errorf("config: \"%s\" must be a list of strings", where)
			}
			out.Set(key, list)
		case float64:
			n, ok := v.(float64)
			if !ok || math.IsInf(n, 0) || math.IsNaN(n) || n < 0 {
				return nil, fmt.Errorf("config: \"%s\" must be a non-negative number", where)
			}
			out.Set(key, n)
		case bool:
			if _, ok := v.(bool); !ok {
				return nil, fmt.Errorf("config: \"%s\" must be true or false", where)
			}
			out.Set(key, v)
		default:
			s, ok := v.(string)
			if !ok || s == "" {
				return nil, fmt.Errorf("config: \"%s\" must be a non-empty string", where)
			}
			out.Set(key, s)
		}
	}
	if list, ok := out.Get("disableRules").([]any); ok {
		for _, name := range list {
			if !contains(Rules, name.(string)) {
				return nil, fmt.Errorf("config: disableRules names unknown rule \"%s\"", name)
			}
		}
	}
	return out, nil
}

// MergeConfig merges a user config (parsed JSON) over the defaults.
func MergeConfig(user any) (Config, error) {
	tree, err := merge(user, defaultTree(), "")
	if err != nil {
		return Config{}, err
	}
	return toConfig(tree)
}
