import assert from "node:assert/strict";
import { test } from "node:test";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import rlcdBrwsrExtension from "../config/pi/extensions/rlcd-brwsr.ts";

test("loading the production extension registers without browser or classifier work", () => {
  let registrations = 0;
  let execCalls = 0;
  const pi = {
    registerTool() {
      registrations += 1;
    },
    async exec() {
      execCalls += 1;
      throw new Error("extension load must not execute the browser CLI");
    },
  } as unknown as ExtensionAPI;

  rlcdBrwsrExtension(pi);

  assert.equal(registrations, 1);
  assert.equal(execCalls, 0);
});
