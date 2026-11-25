package sections

import "fmt"

// ParseJSON reads JSON the way JSON.parse does (objects keep the order their keys were written in).
func ParseJSON(s string) (any, error) { return parseJSON(s) }

// JSONString writes a value the way JSON.stringify(value, null, indent) does (indent 0: one line).
func JSONString(v any, indent int) string { return stringify(v, indent) }

// Generate runs one of the code builders or pure functions on a JSON-shaped input and returns what it printed: the
// code for time, step, measure, shoot, pinned, screen and cover (the input is the builder's config; for step it is the
// number of milliseconds), and JSON for attribute (the measurement) and shootTargets ({ attribution, only }). It lets
// a program that is not written in Go, such as the browser test, get the code this package would print.
func Generate(name string, input any) (string, error) {
	cfg, _ := input.(Obj)
	switch name {
	case "time":
		return BuildTimeCode(cfg), nil
	case "step":
		return BuildStepCode(input)
	case "measure":
		return BuildMeasureCode(cfg), nil
	case "shoot":
		return BuildShootCode(cfg), nil
	case "pinned":
		return BuildPinnedCode(cfg), nil
	case "screen":
		return BuildScreenCode(cfg)
	case "cover":
		return BuildCoverCode(cfg), nil
	case "attribute":
		return stringify(Attribute(input), 0), nil
	case "shootTargets":
		var only []string
		if l, isList := get(input, "only").([]any); isList {
			only = []string{}
			for _, o := range l {
				only = append(only, text(o))
			}
		}
		p, err := ShootTargets(get(input, "attribution"), only)
		if err != nil {
			return "", err
		}
		return stringify(O("targets", p.Targets, "skipped", p.Skipped, "scroller", p.Scroller), 0), nil
	}
	return "", fmt.Errorf("没有「%s」这个生成器", name)
}
