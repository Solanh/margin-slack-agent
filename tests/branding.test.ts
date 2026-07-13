import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface SlackManifest {
  display_information?: {
    background_color?: string;
  };
}

describe("Margin branding", () => {
  it("keeps the Slack display color aligned with the checked-in logo", async () => {
    const [manifestJson, iconSvg] = await Promise.all([
      readFile(resolve(process.cwd(), "manifest.json"), "utf8"),
      readFile(resolve(process.cwd(), "assets/margin-app-icon.svg"), "utf8"),
    ]);
    const manifest = JSON.parse(manifestJson) as SlackManifest;

    expect(manifest.display_information?.background_color).toBe("#242433");
    expect(iconSvg).toContain('fill="#242433"');
  });

  it("includes a square 512 px PNG ready for Slack upload", async () => {
    const icon = await readFile(
      resolve(process.cwd(), "assets/margin-app-icon.png"),
    );

    expect(icon.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(icon.readUInt32BE(16)).toBe(512);
    expect(icon.readUInt32BE(20)).toBe(512);
  });
});
