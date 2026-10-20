/**
 * A small YAML reader for the design archive's frontmatter.
 *
 * The archive's object files carry their structure in YAML frontmatter (references/design-archive.md),
 * and the plugin ships no dependencies, so this reads the subset those files actually use:
 *
 *   - block mappings and block sequences, nested by indentation (a sequence may sit at the same
 *     indent as its key); `- key: value` list items continue as a mapping
 *   - flow sequences `[a, b]` and flow mappings `{ k: v }`, nested, possibly spread over lines
 *   - single- and double-quoted strings, plain scalars, `# comments`
 *   - `|` and `>` block scalars
 *   - null / true / false / numbers
 *
 * Two leniencies, both because the archive writes references by hand:
 *   - `[[basename]]` without quotes is read as the string "[[basename]]", not a nested list
 *   - `{token}` (a flow mapping with no `key: value` inside) is read as the string "{token}"
 *
 * Anything outside the subset throws with a line number. Pure: no I/O.
 */

/** Split `---\n<yaml>\n---\n<body>`. Returns { fm: object|null, body, error }. */
export function splitFrontmatter(md = '') {
  const text = String(md).replace(/\r\n/g, '\n');
  const m = text.match(/^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
  if (!m) return { fm: null, body: text, error: null };
  const body = text.slice(m[0].length);
  try {
    const fm = parseYaml(m[1]);
    if (fm !== null && (typeof fm !== 'object' || Array.isArray(fm))) {
      return { fm: null, body, error: 'frontmatter 不是键值映射' };
    }
    return { fm: fm ?? {}, body, error: null };
  } catch (e) {
    return { fm: null, body, error: e.message };
  }
}

/** Remove a trailing ` # comment` that sits outside quotes. */
function stripComment(s) {
  let q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (q === '"' && c === '\\') i++;
      else if (c === q) q = null;
    } else if (c === '"' || c === "'") {
      // a quote only opens a string at the start of a token
      if (i === 0 || /[\s\[{,:]/.test(s[i - 1])) q = c;
    } else if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) {
      return s.slice(0, i).trimEnd();
    }
  }
  return s.trimEnd();
}

/** Net bracket depth of a string, ignoring quoted parts. */
function depthOf(s) {
  let d = 0;
  let q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (q === '"' && c === '\\') i++;
      else if (c === q) q = null;
    } else if (c === '"' || c === "'") {
      if (i === 0 || /[\s\[{,:]/.test(s[i - 1])) q = c;
    } else if (c === '[' || c === '{') d++;
    else if (c === ']' || c === '}') d--;
  }
  return d;
}

const KEY = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^\s:#\[\]{}"'\-][^:]*?|-[^\s:][^:]*?)\s*:(?:\s+(.*)|$)/;

function unquoteKey(k) {
  if (k.startsWith('"')) return JSON.parse(k);
  if (k.startsWith("'")) return k.slice(1, -1).replace(/''/g, "'");
  return k;
}

function scalar(raw) {
  const s = raw.trim();
  if (s === '' || s === '~' || s === 'null') return null;
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+$/.test(s)) return Number(s);
  if (/^-?\d*\.\d+$/.test(s)) return Number(s);
  return s;
}

/** Recursive-descent reader for flow collections and quoted/plain scalars. */
class Flow {
  constructor(src, where) {
    this.s = src;
    this.i = 0;
    this.where = where;
  }
  fail(msg) {
    throw new Error(`${this.where}：${msg}`);
  }
  ws() {
    while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++;
  }
  value(inFlow) {
    this.ws();
    const c = this.s[this.i];
    if (c === undefined) return null;
    if (c === '[') {
      const lit = this.s.slice(this.i).match(/^\[\[([^\[\]]+)\]\]/);
      if (lit) {
        this.i += lit[0].length;
        return lit[0];
      }
      return this.seq();
    }
    if (c === '{') return this.map();
    if (c === '"' || c === "'") return this.quoted();
    return this.plain(inFlow);
  }
  seq() {
    this.i++; // [
    const out = [];
    for (;;) {
      this.ws();
      if (this.s[this.i] === ']') {
        this.i++;
        return out;
      }
      if (this.i >= this.s.length) this.fail('flow 列表没有闭合');
      out.push(this.value(true));
      this.ws();
      if (this.s[this.i] === ',') this.i++;
      else if (this.s[this.i] !== ']') this.fail('flow 列表里缺逗号');
    }
  }
  map() {
    const start = this.i;
    // find the matching brace to decide between a mapping and a {token}
    let d = 0;
    let q = null;
    let end = -1;
    for (let j = this.i; j < this.s.length; j++) {
      const c = this.s[j];
      if (q) {
        if (q === '"' && c === '\\') j++;
        else if (c === q) q = null;
      } else if (c === '"' || c === "'") {
        if (j === this.i || /[\s\[{,:]/.test(this.s[j - 1])) q = c;
      } else if (c === '{' || c === '[') d++;
      else if (c === '}' || c === ']') {
        d--;
        if (d === 0) {
          end = j;
          break;
        }
      }
    }
    if (end < 0) this.fail('flow 映射没有闭合');
    const inner = this.s.slice(start + 1, end);
    if (!hasMappingColon(inner)) {
      this.i = end + 1;
      return this.s.slice(start, end + 1);
    }
    this.i++; // {
    const out = {};
    for (;;) {
      this.ws();
      if (this.s[this.i] === '}') {
        this.i++;
        return out;
      }
      if (this.i >= this.s.length) this.fail('flow 映射没有闭合');
      const key = this.key();
      this.ws();
      out[key] = this.s[this.i] === ',' || this.s[this.i] === '}' ? null : this.value(true);
      this.ws();
      if (this.s[this.i] === ',') this.i++;
      else if (this.s[this.i] !== '}') this.fail('flow 映射里缺逗号');
    }
  }
  key() {
    this.ws();
    const c = this.s[this.i];
    let k;
    if (c === '"' || c === "'") k = this.quoted();
    else {
      const m = this.s.slice(this.i).match(/^[^:,{}\[\]]*?(?=:(\s|$|,|\}))/);
      if (!m) this.fail('flow 映射的键后面缺冒号');
      k = m[0].trim();
      this.i += m[0].length;
    }
    this.ws();
    if (this.s[this.i] !== ':') this.fail('flow 映射的键后面缺冒号');
    this.i++;
    return String(k);
  }
  quoted() {
    const q = this.s[this.i++];
    let out = '';
    for (;;) {
      if (this.i >= this.s.length) this.fail('引号没有闭合');
      const c = this.s[this.i++];
      if (q === '"' && c === '\\') {
        const n = this.s[this.i++];
        out += { n: '\n', t: '\t', '"': '"', '\\': '\\', '/': '/' }[n] ?? n;
      } else if (c === q) {
        if (q === "'" && this.s[this.i] === "'") {
          out += "'";
          this.i++;
        } else return out;
      } else out += c;
    }
  }
  plain(inFlow) {
    const start = this.i;
    while (this.i < this.s.length) {
      const c = this.s[this.i];
      if (inFlow && (c === ',' || c === ']' || c === '}')) break;
      this.i++;
    }
    return scalar(this.s.slice(start, this.i));
  }
}

function hasMappingColon(inner) {
  let q = null;
  let d = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (q) {
      if (q === '"' && c === '\\') i++;
      else if (c === q) q = null;
    } else if (c === '"' || c === "'") {
      if (i === 0 || /[\s\[{,:]/.test(inner[i - 1])) q = c;
    } else if (c === '[' || c === '{') d++;
    else if (c === ']' || c === '}') d--;
    else if (c === ':' && d === 0 && (i === inner.length - 1 || /[\s,]/.test(inner[i + 1]))) return true;
  }
  return false;
}

function inline(text, where) {
  const t = text.trim();
  if (t === '') return null;
  const f = new Flow(t, where);
  const v = f.value(false);
  f.ws();
  if (f.i < t.length) f.fail(`多余内容「${t.slice(f.i, f.i + 20)}」`);
  return v;
}

export function parseYaml(src = '') {
  const raw = String(src).replace(/\r\n/g, '\n').split('\n');
  const lines = [];
  raw.forEach((line, n) => {
    if (/^\s*(#.*)?$/.test(line)) return;
    const indent = line.match(/^ */)[0].length;
    if (line[indent] === '\t') throw new Error(`第 ${n + 1} 行：不支持制表符缩进`);
    lines.push({ indent, text: stripComment(line.slice(indent)), n: n + 1, raw: line });
  });
  if (!lines.length) return null;

  let pos = 0;
  const where = (l) => `第 ${l.n} 行`;

  /** Join following lines while a flow collection started on `l` is still open. */
  function takeFlow(l, text) {
    let joined = text;
    let d = depthOf(joined);
    while (d > 0 && pos < lines.length) {
      const nx = lines[pos++];
      joined += ' ' + nx.text;
      d = depthOf(joined);
    }
    return joined;
  }

  function blockScalar(l, style, parentIndent) {
    const out = [];
    // block scalar lines are the raw lines after l.n whose indent exceeds parentIndent (blank lines kept)
    let k = l.n; // raw index of the line after l (raw is 0-based, l.n is 1-based)
    let base = null;
    while (k < raw.length) {
      const line = raw[k];
      if (line.trim() === '') {
        out.push('');
        k++;
        continue;
      }
      const ind = line.match(/^ */)[0].length;
      if (ind <= parentIndent) break;
      if (base === null) base = ind;
      out.push(line.slice(base));
      k++;
    }
    while (out.length && out[out.length - 1] === '') out.pop();
    // skip lines consumed by the scalar
    while (pos < lines.length && lines[pos].n <= k) pos++;
    return style.startsWith('|') ? out.join('\n') : out.join(' ').replace(/\s+/g, ' ').trim();
  }

  function valueAfterKey(l, rest, indent) {
    if (rest === undefined || rest === '') {
      const nx = lines[pos];
      if (nx && nx.indent > indent) return block(nx.indent);
      if (nx && nx.indent === indent && /^-(\s|$)/.test(nx.text)) return sequence(indent);
      return null;
    }
    if (/^[|>][+-]?$/.test(rest)) return blockScalar(l, rest, indent);
    return inline(takeFlow(l, rest), where(l));
  }

  function mapping(indent) {
    const out = {};
    while (pos < lines.length && lines[pos].indent === indent && !/^-(\s|$)/.test(lines[pos].text)) {
      const l = lines[pos++];
      const m = l.text.match(KEY);
      if (!m) throw new Error(`${where(l)}：读不出「键: 值」：${l.text.slice(0, 40)}`);
      out[unquoteKey(m[1])] = valueAfterKey(l, m[2], indent);
    }
    if (pos < lines.length && lines[pos].indent > indent) {
      const l = lines[pos];
      throw new Error(`${where(l)}：缩进对不上`);
    }
    return out;
  }

  function sequence(indent) {
    const out = [];
    while (pos < lines.length && lines[pos].indent === indent && /^-(\s|$)/.test(lines[pos].text)) {
      const l = lines[pos];
      const after = l.text.replace(/^-\s*/, '');
      const off = l.text.length - after.length;
      if (after === '') {
        pos++;
        const nx = lines[pos];
        out.push(nx && nx.indent > indent ? block(nx.indent) : null);
        continue;
      }
      if (KEY.test(after)) {
        // `- key: value` — the item is a mapping whose first key sits on this line
        lines[pos] = { ...l, indent: indent + off, text: after };
        out.push(mapping(indent + off));
        continue;
      }
      pos++;
      out.push(/^[|>][+-]?$/.test(after) ? blockScalar(l, after, indent) : inline(takeFlow(l, after), where(l)));
    }
    return out;
  }

  function block(indent) {
    const l = lines[pos];
    if (/^-(\s|$)/.test(l.text)) return sequence(indent);
    if (KEY.test(l.text)) return mapping(indent);
    pos++;
    return inline(takeFlow(l, l.text), where(l));
  }

  const first = lines[0];
  const result = block(first.indent);
  if (pos < lines.length) throw new Error(`${where(lines[pos])}：多余内容`);
  return result;
}
