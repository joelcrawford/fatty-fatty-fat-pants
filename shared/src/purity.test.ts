import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

// This package runs in three places: Node (the API), browsers (the web app)
// and React Native (the mobile app). Code that works in only one of them
// breaks another, usually at runtime and far from here. This test reads the
// source and refuses the usual suspects.

const dir = __dirname;
const sources = fs.readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

const FORBIDDEN: [RegExp, string][] = [
  [/from\s+["'](react|react-dom|react-native|expo[^"']*)["']/, "a UI framework"],
  [/from\s+["'](express|better-sqlite3|jsonwebtoken)["']/, "a server library"],
  [/from\s+["'](node:)?(fs|path|crypto|os|http|https|child_process|url|util|stream|buffer)["']/, "a Node built-in"],
  [/\brequire\s*\(/, "require()"],
  [/\b(window|document|localStorage|sessionStorage|navigator)\s*[.\[]/, "a browser global"],
  [/\bprocess\.(env|cwd|argv)\b/, "process.*"],
  [/\bimport\.meta\b/, "import.meta (bundler-specific)"],
  [/\bBuffer\b/, "Buffer"],
];

describe("the shared package stays platform-neutral", () => {
  it("has source files to check", () => {
    expect(sources.length).toBeGreaterThan(5);
  });

  it.each(sources)("%s uses nothing that exists on only one platform", (file) => {
    // Comments may mention anything; only code counts.
    const code = fs.readFileSync(path.join(dir, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const [pattern, what] of FORBIDDEN) {
      expect([file, what, pattern.test(code)]).toEqual([file, what, false]);
    }
  });

  it("depends on zod and nothing else at runtime", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, "..", "package.json"), "utf8"));
    expect(Object.keys(pkg.dependencies)).toEqual(["zod"]);
  });
});
