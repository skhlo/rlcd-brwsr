import assert from "node:assert/strict";
import { test } from "node:test";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import rlcdBrwsrExtension from "../config/pi/extensions/rlcd-brwsr.ts";

test("loading the production extension only registers rlcd_brwsr_run", () => {
  const registered: string[] = [];
  const pi = {
    registerTool(tool: { name: string }) {
      registered.push(tool.name);
    },
  } as unknown as ExtensionAPI;

  rlcdBrwsrExtension(pi);

  assert.deepEqual(registered, ["rlcd_brwsr_run"]);
});
