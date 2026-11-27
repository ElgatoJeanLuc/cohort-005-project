import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";

// `.oxlintrc.json` lists the files that were already over a size limit when
// the limit arrived ("Remove each entry once the file is split"). The list
// only shrinks. A file on it must still break the rule it is exempt from, so
// a new file cannot join the list and a split file cannot stay on it.

const EXEMPTABLE = [
  "max-lines",
  "max-lines-per-function",
  "max-params",
  "max-depth",
];

const configSchema = z.object({
  overrides: z.array(
    z.object({
      files: z.array(z.string()),
      rules: z.record(z.unknown()),
    })
  ),
});

const diagnosticsSchema = z.object({
  diagnostics: z.array(z.object({ code: z.string(), filename: z.string() })),
});

function stripLineComments(json: string): string {
  return json.replace(/^\s*\/\/.*$/gm, "");
}

const config = configSchema
  .passthrough()
  .parse(JSON.parse(stripLineComments(readFileSync(".oxlintrc.json", "utf8"))));

const exemptions = config.overrides.flatMap((override) => {
  const rules = Object.keys(override.rules).filter((rule) =>
    EXEMPTABLE.includes(rule)
  );
  const isFileList = override.files.every((file) => !file.includes("*"));
  return isFileList
    ? rules.map((rule) => ({ rule, files: override.files }))
    : [];
});

function filesBreaking(rule: string, files: string[]): Set<string> {
  const withoutExemptions = {
    ...config,
    overrides: config.overrides.filter(
      (override) => !Object.keys(override.rules).includes(rule)
    ),
  };
  const path = `.oxlintrc.exemptions-${process.pid}.json`;
  writeFileSync(path, JSON.stringify(withoutExemptions));
  try {
    const { stdout: output } = spawnSync(
      "npx",
      ["oxlint", "-c", path, "-f", "json", ...files],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
    );
    const { diagnostics } = diagnosticsSchema
      .passthrough()
      .parse(JSON.parse(output));
    return new Set(
      diagnostics
        .filter((diagnostic) => diagnostic.code.includes(`(${rule})`))
        .map((diagnostic) => diagnostic.filename)
    );
  } finally {
    rmSync(path);
  }
}

describe("oxlint size-limit exemptions", () => {
  it("has exemption lists to check", () => {
    expect(exemptions.length).toBeGreaterThan(0);
  });

  for (const { rule, files } of exemptions) {
    it(`every file exempt from ${rule} still breaks it`, () => {
      const breaking = filesBreaking(rule, files);
      const stale = files.filter((file) => !breaking.has(file));
      expect(
        stale,
        `Remove from the ${rule} exemption: they no longer break it, or never did`
      ).toEqual([]);
    }, 60_000);
  }
});
