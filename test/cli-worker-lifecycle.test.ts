import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { join } from "node:path";
import { test } from "node:test";

test("task helper rejects an unrelated endpoint and exits on parent EOF", async () => {
  const child = spawn(
    "node",
    [join(process.cwd(), "bridge", "cli_browser_worker.mjs")],
    {
      stdio: ["pipe", "pipe", "pipe"],
      env: { PATH: process.env.PATH, HOME: process.env.HOME },
    },
  );
  let stdout = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.resume();
  const exit = once(child, "exit");
  const reply = once(child.stdout, "data");
  child.stdin.write(
    `${JSON.stringify({
      id: 1,
      operation: "init",
      wsEndpoint: "ws://example.invalid/devtools/browser/foreign",
      targetId: "exact-task-target",
    })}\n`,
  );
  const timer = setTimeout(() => child.kill("SIGKILL"), 2_000);
  try {
    await reply;
    child.stdin.end();
    const [code] = await exit;
    assert.equal(code, 0);
    const response = JSON.parse(stdout.trim());
    assert.equal(response.id, 1);
    assert.equal(response.ok, false);
    assert.equal(response.error.type, "AdmissionError");
  } finally {
    clearTimeout(timer);
  }
});
