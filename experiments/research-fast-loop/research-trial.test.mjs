import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));

async function runNode(script, args, options = {}) {
  const child = spawn(
    process.execPath,
    [path.join(directory, script), ...args],
    {
      cwd: options.cwd ?? directory,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  const [code] = await once(child, "close");
  return {
    code,
    stdout: Buffer.concat(stdout).toString("utf8"),
    stderr: Buffer.concat(stderr).toString("utf8"),
  };
}

function ledger() {
  return {
    schemaVersion: 1,
    scope: "TypeSafe Jev trials for GitHub issues #5 and #6",
    budget: {
      maxRequests: 100,
      maxUsd: 5,
      model: "jev-1.13.0",
      inputUsdPerMillionTokens: 0.042,
      reservationInputTokensPerAttempt: 64_000,
      reservationUsdPerAttempt: 0.002688,
    },
    pricing: {
      source: "https://docs.typesafe.ai/models",
      retrievedAt: "2026-09-20",
      note: "Input tokens are billed; output tokens are free.",
    },
    attempts: [],
  };
}

test("research trial public command includes page preparation and retains measured evidence", async (t) => {
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "rlcd-fast-loop-trial-test-"),
  );
  t.after(() => rm(temporaryDirectory, { recursive: true }));

  const chromeState = path.join(temporaryDirectory, "chrome-state.json");
  const chromeLog = path.join(temporaryDirectory, "chrome.log");
  const chromeBin = path.join(temporaryDirectory, "fake-chrome.mjs");
  await writeFile(
    chromeBin,
    `#!/usr/bin/env node
import { appendFile, readFile, writeFile } from "node:fs/promises";
const args = process.argv.slice(2);
if (args.includes("--version")) { console.log("1.7.0"); process.exit(0); }
await appendFile(process.env.FAKE_CHROME_LOG, args.join(" ") + "\\n");
let pages = [{ id: 1, url: "about:blank", title: "", selected: true }];
try { pages = JSON.parse(await readFile(process.env.FAKE_CHROME_STATE, "utf8")); } catch {}
const command = args[0];
if (command === "list_pages") {
  if (pages.some((page) => page.selected)) console.log(JSON.stringify({ pages }));
  else console.log(JSON.stringify([{ type: "text", text: "The selected page has been closed. Call list_pages to see open pages." }]));
} else if (command === "new_page") {
  pages = pages.map((page) => ({ ...page, selected: false }));
  pages.push({ id: 2, url: args[1], title: "How to build with TypeSafe", selected: true });
  await writeFile(process.env.FAKE_CHROME_STATE, JSON.stringify(pages));
  console.log(JSON.stringify({ pages }));
} else if (command === "close_page") {
  pages = pages.filter((page) => page.id !== Number(args[1]));
  pages = pages.map((page) => ({ ...page, selected: false }));
  await writeFile(process.env.FAKE_CHROME_STATE, JSON.stringify(pages));
  console.log(JSON.stringify({ pages }));
} else if (command === "select_page") {
  pages = pages.map((page) => ({ ...page, selected: page.id === Number(args[1]) }));
  await writeFile(process.env.FAKE_CHROME_STATE, JSON.stringify(pages));
  console.log(JSON.stringify({ pages }));
} else {
  console.error("unexpected chrome command: " + command);
  process.exit(2);
}
`,
  );
  await chmod(chromeBin, 0o755);

  const ledgerPath = path.join(temporaryDirectory, "ledger.json");
  await writeFile(ledgerPath, `${JSON.stringify(ledger(), null, 2)}\n`);
  const piBin = path.join(temporaryDirectory, "fake-pi.mjs");
  await writeFile(
    piBin,
    `#!/usr/bin/env node
import { appendFile, readFile, writeFile } from "node:fs/promises";
if (process.argv.includes("--version")) { console.log("0.85.1"); process.exit(0); }
const phase = process.env.FAST_LOOP_PHASE;
const usage = phase === "research"
  ? { input: 10, output: 2, cacheRead: 3, cacheWrite: 0, totalTokens: 15 }
  : { input: 20, output: 4, cacheRead: 5, cacheWrite: 0, totalTokens: 29 };
if (phase === "research") {
  if (!process.argv.includes("--extension")) throw new Error("missing explicit extension");
  const ledgerPath = process.env.RLCD_JEV_TRIAL_LEDGER_PATH;
  const trialLedger = JSON.parse(await readFile(ledgerPath, "utf8"));
  trialLedger.attempts.push({ id: 1, issue: 6, purpose: process.env.RLCD_JEV_TRIAL_PURPOSE, startedAt: "2026-09-20T01:00:00.000Z", outcome: "success", reservedUsd: 0.002688, inputTokens: 111, outputTokens: 22, actualUsd: 0.000004662 });
  await writeFile(ledgerPath, JSON.stringify(trialLedger, null, 2) + "\\n");
  await appendFile(process.env.BASELINE_HTTP_LOG, JSON.stringify({ phase, url: "https://docs.typesafe.ai/api.md", startedAt: "2026-09-20T01:00:00.000Z", completedAt: "2026-09-20T01:00:00.010Z", status: 200, bytes: 10, sha256: "a".repeat(64), location: null }) + "\\n");
  console.log(JSON.stringify({ type: "tool_execution_start", toolCallId: "tool-1", toolName: "rlcd_brwsr_run", args: { goal: "fixed" } }));
  console.log(JSON.stringify({ type: "tool_execution_end", toolCallId: "tool-1", toolName: "rlcd_brwsr_run", isError: false, result: { details: { stopReason: "done_claim", trace: [{ outcome: "observed" }], metrics: { elapsedMs: 120, budgetOverrunMs: 0, classifierCalls: 1, browserCommands: 2, waits: 0, modelInputTokens: 111, modelOutputTokens: 22 } } } }));
}
const finalAnswer = phase === "research" ? "# Fake brief\\n\\nMeasured research." : "# Evaluation\\n\\nVERDICT: PASS";
console.log(JSON.stringify({ type: "message_end", message: { role: "assistant", provider: "test-provider", model: "test-model", stopReason: "stop", content: [{ type: "text", text: finalAnswer }], usage: { ...usage, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } } }));
`,
  );
  await chmod(piBin, 0o755);

  const outputDirectory = path.join(temporaryDirectory, "trial");
  const result = await runNode(
    "run-research-trial.mjs",
    [
      "--condition",
      "cold",
      "--output",
      outputDirectory,
      "--pi-bin",
      piBin,
      "--chrome-bin",
      chromeBin,
      "--ledger",
      ledgerPath,
      "--provider",
      "test-provider",
      "--model",
      "test-model",
      "--thinking",
      "low",
    ],
    {
      env: {
        TYPESAFE_API_KEY: "test-only-key",
        FAKE_CHROME_STATE: chromeState,
        FAKE_CHROME_LOG: chromeLog,
      },
    },
  );
  assert.equal(result.code, 0, result.stderr);

  const metrics = JSON.parse(
    await readFile(path.join(outputDirectory, "metrics.json"), "utf8"),
  );
  assert.equal(metrics.trialKind, "fast-loop-research");
  assert.equal(metrics.condition, "cold");
  assert.equal(metrics.verifiedOutcome, "PASS");
  assert.equal(metrics.mainModel.provider, "test-provider");
  assert.equal(metrics.mainModel.model, "test-model");
  assert.equal(metrics.mainModel.thinking, "low");
  assert.equal(metrics.mainModel.turns, 2);
  assert.deepEqual(metrics.mainModel.tokens, {
    input: 30,
    output: 6,
    cacheRead: 8,
    cacheWrite: 0,
    total: 44,
  });
  assert.equal(metrics.pagePreparation.includedInWallTime, true);
  assert.equal(
    metrics.pagePreparation.startUrl,
    "https://docs.typesafe.ai/concepts/how-to-build-with-system-one",
  );
  assert.equal(metrics.fastLoop.calls, 1);
  assert.deepEqual(metrics.fastLoop.stopReasons, ["done_claim"]);
  assert.equal(metrics.browserCommands.exactMeasuredTotal, 5);
  assert.equal(metrics.browserCommands.pagePreparation, 3);
  assert.equal(metrics.browserCommands.fastLoop, 2);
  assert.equal(metrics.jev.requests, 1);
  assert.equal(metrics.jev.inputTokens, 111);
  assert.equal(metrics.jev.outputTokens, 22);
  assert.equal(metrics.jev.actualUsd, 0.000004662);
  assert.equal(metrics.directHttpRequests.instrumentedFetchDocAttempts, 1);
  assert.equal(
    metrics.inputSha256["task.md"],
    "fd98a922fb03507db8acbba806b79085204d8b2f73047cfe093327515b3d51a2",
  );
  assert.equal(
    metrics.inputSha256["evaluation-checklist.md"],
    "4545ef417e604155e5c204df99a18dbde70dce3cc953e532e540544d686adf42",
  );
  assert.equal(metrics.retained.preExistingPagesPreserved, true);
  assert.equal(metrics.retained.taskPageClosed, true);
  assert.equal(metrics.retained.pagesAfterCleanup.length, 1);
  assert.match(
    await readFile(path.join(outputDirectory, "brief.md"), "utf8"),
    /Fake brief/,
  );
  assert.match(
    await readFile(path.join(outputDirectory, "evaluation.md"), "utf8"),
    /VERDICT: PASS/,
  );
  assert.equal(
    await readFile(path.join(outputDirectory, "retrievals.jsonl"), "utf8"),
    `${JSON.stringify({ phase: "research", url: "https://docs.typesafe.ai/api.md", startedAt: "2026-09-20T01:00:00.000Z", completedAt: "2026-09-20T01:00:00.010Z", status: 200, bytes: 10, sha256: "a".repeat(64), location: null })}\n`,
  );

  const chromeCommands = (await readFile(chromeLog, "utf8")).trim().split("\n");
  assert.deepEqual(
    chromeCommands.map((line) => line.split(" ")[0]),
    [
      "list_pages",
      "new_page",
      "list_pages",
      "close_page",
      "select_page",
      "list_pages",
    ],
  );
});
