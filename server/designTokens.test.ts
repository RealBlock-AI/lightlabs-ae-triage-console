import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The token layer only works if two things hold, and neither is visible in a
// build that succeeds. A token defined in :root but absent from .dark leaves a
// colour frozen in one theme. A token absent from @theme never becomes a
// utility at all - the class silently matches nothing, the build still passes,
// and the page renders with no colour. Both happened while this was written.

const css = readFileSync("client/src/index.css", "utf8");

/** Tokens the design system owns, as opposed to shadcn's or Tailwind's. */
const SEMANTIC = /^--(ink|on-inverse|page|panel|sunken|inverse|inverse-line|line|nav|ok|warn|danger|note|info|brand|lane)(-|$)/;

/** Defined for CSS rules to consume directly; deliberately not utilities. */
const CSS_ONLY = new Set(["--brand-hover"]);

function blocks(selector: string) {
  const out: string[] = [];
  const re = new RegExp(`(^|\\n)${selector}\\s*\\{`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    const start = css.indexOf("{", m.index) + 1;
    out.push(css.slice(start, css.indexOf("\n}", start)));
  }
  return out.join("\n");
}

function declared(source: string) {
  return new Set(Array.from(source.matchAll(/(--[a-z0-9-]+)\s*:/g), m => m[1]).filter(t => SEMANTIC.test(t)));
}

const light = declared(blocks(":root"));
const dark = declared(blocks("\\.dark"));
/** The design system's own roles. shadcn keeps a separate @theme block for its
 *  primitives (--color-card, --color-sidebar-*) and that one is not ours to audit. */
const SEMANTIC_ROLE = /^(ink|on-inverse|page|panel|sunken|inverse|line|nav|ok|warn|danger|note|info|brand)(-|$)/;
const themed = new Map(Array.from(blocks("@theme inline").matchAll(/--color-([a-z0-9-]+)\s*:\s*var\((--[a-z0-9-]+)\)/g), m => [m[1], m[2]] as const).filter(([name]) => SEMANTIC_ROLE.test(name)));

describe("the design token layer", () => {
  it("defines a meaningful number of semantic tokens", () => {
    expect(light.size).toBeGreaterThan(40);
  });

  it("gives every light token a dark counterpart", () => {
    // A token with no .dark value is a colour that cannot follow the theme.
    expect(Array.from(light).filter(t => !dark.has(t)).sort()).toEqual([]);
  });

  it("defines no dark token that light does not have", () => {
    expect(Array.from(dark).filter(t => !light.has(t)).sort()).toEqual([]);
  });

  it("exposes every semantic token as a utility", () => {
    const mapped = new Set(themed.values());
    const unreachable = Array.from(light).filter(t => !mapped.has(t) && !CSS_ONLY.has(t) && !t.startsWith("--lane-"));
    expect(unreachable.sort()).toEqual([]);
  });

  it("maps every utility onto a token that actually exists", () => {
    // This is the failure that builds cleanly: @theme names a variable nothing
    // defines, so the utility resolves to nothing and the element loses colour.
    expect(Array.from(themed.entries()).filter(([, token]) => !light.has(token)).map(([name]) => name).sort()).toEqual([]);
  });

  it("routes utilities through var() so .dark can reroute them", () => {
    // `@theme inline` with a literal value would bake the light colour in.
    const inlineBlock = blocks("@theme inline");
    const semanticLines = inlineBlock.split("\n").filter(line => /--color-(ink|ok|warn|danger|note|info|page|panel|sunken|inverse|line|nav|on-inverse|brand)/.test(line));
    expect(semanticLines.length).toBeGreaterThan(0);
    expect(semanticLines.filter(line => line.includes(":") && !line.includes("var("))).toEqual([]);
  });
});

function sources() {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) { if (entry !== "ui") walk(path); }
      // ManusDialog carries another company's brand surface, not ours.
      else if (path.endsWith(".tsx") && !path.includes("ManusDialog")) found.push(path);
    }
  };
  walk("client/src");
  return found;
}

const PALETTE = /\b(?:hover:|focus:|active:|dark:|group-hover:|md:|lg:|sm:|xl:)*(?:text|bg|border|from|to|via|ring|decoration|divide|outline)-(?:slate|gray|zinc|neutral|stone|emerald|green|rose|red|amber|yellow|orange|violet|purple|indigo|blue|sky|cyan|teal|fuchsia|pink)-\d{2,3}\b/;
const ARBITRARY = /-\[#[0-9a-fA-F]{3,8}\]/;
const LITERAL = /["']#[0-9a-fA-F]{6}\b/;

describe("no page names a colour directly", () => {
  const files = sources();

  it("scans the pages and components", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("uses no raw Tailwind palette class", () => {
    // A palette class is frozen at its light value and cannot follow the theme.
    expect(files.filter(f => PALETTE.test(readFileSync(f, "utf8")))).toEqual([]);
  });

  it("uses no arbitrary hex class", () => {
    expect(files.filter(f => ARBITRARY.test(readFileSync(f, "utf8")))).toEqual([]);
  });

  it("passes no literal hex to an SVG or chart prop", () => {
    // stroke="#176344" is invisible to the token layer just like a class is.
    expect(files.filter(f => LITERAL.test(readFileSync(f, "utf8")))).toEqual([]);
  });
});
