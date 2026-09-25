import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  DefaultResourceLoader,
  type ExtensionAPI,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

import rlcdBrwsrExtension from "../config/pi/extensions/rlcd-brwsr.ts";

test("loading the production extension registers discovery and run without other work", () => {
  const registered: string[] = [];
  const pi = {
    registerTool(tool: { name: string }) {
      registered.push(tool.name);
    },
  } as unknown as ExtensionAPI;

  rlcdBrwsrExtension(pi);

  assert.deepEqual(registered, ["rlcd_brwsr_list_tabs", "rlcd_brwsr_run"]);
});

test("repo settings load and reload the two tools only inside this checkout", async (t) => {
  const outside = mkdtempSync(join(tmpdir(), "rlcd-pi-load-"));
  t.after(() => rmSync(outside, { recursive: true }));
  const agentDir = join(outside, "agent");
  const root = fileURLToPath(new URL("../", import.meta.url));
  const extensionPath = join(root, "config/pi/extensions/rlcd-brwsr.ts");

  for (const cwd of [root, outside]) {
    const loader = new DefaultResourceLoader({
      cwd,
      agentDir,
      settingsManager: SettingsManager.create(cwd, agentDir, {
        projectTrusted: true,
      }),
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
    });
    for (let load = 0; load < 2; load++) {
      await loader.reload({ resolveProjectTrust: async () => true });
      const result = loader.getExtensions();
      assert.deepEqual(result.errors, []);
      assert.equal(result.extensions.length, cwd === root ? 1 : 0);
      if (cwd === outside) continue;
      const extension = result.extensions[0];
      assert.ok(extension);
      assert.equal(extension.resolvedPath, extensionPath);
      assert.deepEqual(
        [...extension.tools.keys()],
        ["rlcd_brwsr_list_tabs", "rlcd_brwsr_run"],
      );
      for (const tool of extension.tools.values()) {
        assert.equal(tool.definition.executionMode, "sequential");
      }
    }
  }
});
