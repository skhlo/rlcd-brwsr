import assert from "node:assert/strict";
import { once } from "node:events";
import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readFileAtCommit } from "./run-trial.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));

async function runCommand(executable, args, options = {}) {
  const child = spawn(executable, args, {
    cwd: options.cwd ?? directory,
    env: { ...process.env, ...options.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
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

async function runNode(script, args, options = {}) {
  const child = spawn(process.execPath, [path.join(directory, script), ...args], {
    cwd: options.cwd ?? directory,
    env: { ...process.env, ...options.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
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

test("summarize-events reports provider usage and observable tool counts", async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "rlcd-summary-test-"));
  try {
    const eventsPath = path.join(temporaryDirectory, "events.jsonl");
    const events = [
      { type: "session", version: 3, id: "trial", timestamp: "2026-09-20T00:00:00Z", cwd: "/private/path" },
      {
        type: "message_end",
        message: {
          role: "assistant",
          provider: "test-provider",
          model: "test-model",
          stopReason: "toolUse",
          content: [{ type: "toolCall", id: "a", name: "bash", arguments: {} }],
          usage: {
            input: 10,
            output: 2,
            cacheRead: 3,
            cacheWrite: 4,
            totalTokens: 19,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
        },
      },
      {
        type: "tool_execution_start",
        toolCallId: "a",
        toolName: "bash",
        args: { command: "node fetch-doc.mjs https://docs.typesafe.ai/llms.txt" },
      },
      {
        type: "tool_execution_start",
        toolCallId: "b",
        toolName: "bash",
        args: { command: "chrome-devtools take_snapshot --output-format=json" },
      },
      {
        type: "tool_execution_end",
        toolCallId: "a",
        toolName: "bash",
        result: {},
        isError: false,
      },
      {
        type: "tool_execution_end",
        toolCallId: "b",
        toolName: "bash",
        result: {},
        isError: true,
      },
      {
        type: "message_end",
        message: {
          role: "assistant",
          provider: "test-provider",
          model: "test-model",
          stopReason: "stop",
          content: [
            { type: "thinking", thinking: "not retained" },
            { type: "text", text: "# Brief\n\nFinished." },
          ],
          usage: {
            input: 20,
            output: 5,
            cacheRead: 6,
            cacheWrite: 0,
            totalTokens: 31,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
        },
      },
    ];
    await writeFile(eventsPath, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`);

    const result = await runNode("summarize-events.mjs", [eventsPath]);
    assert.equal(result.code, 0, result.stderr);
    const summary = JSON.parse(result.stdout);
    assert.deepEqual(summary.model, { provider: "test-provider", id: "test-model" });
    assert.equal(summary.mainModelTurns, 2);
    assert.deepEqual(summary.tokens, {
      input: 30,
      output: 7,
      cacheRead: 9,
      cacheWrite: 4,
      total: 50,
    });
    assert.deepEqual(summary.toolCalls, { bash: 2 });
    assert.deepEqual(summary.failedToolCalls, { bash: 1 });
    assert.equal(summary.browserCommands.observed, 1);
    assert.match(summary.browserCommands.method, /captured bash commands/);
    assert.equal(summary.finalAnswer, "# Brief\n\nFinished.");
    assert.deepEqual(summary.unavailableMeasurements, []);
  } finally {
    await rm(temporaryDirectory, { recursive: true });
  }
});

test("summarize-events marks provider token usage unavailable instead of inventing zeros", async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "rlcd-summary-test-"));
  try {
    const eventsPath = path.join(temporaryDirectory, "events.jsonl");
    await writeFile(
      eventsPath,
      `${JSON.stringify({
        type: "message_end",
        message: {
          role: "assistant",
          provider: "test-provider",
          model: "test-model",
          stopReason: "stop",
          content: [{ type: "text", text: "Done" }],
        },
      })}\n`,
    );

    const result = await runNode("summarize-events.mjs", [eventsPath]);
    assert.equal(result.code, 0, result.stderr);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.tokens, null);
    assert.deepEqual(summary.unavailableMeasurements, ["provider-reported main-model tokens"]);
  } finally {
    await rm(temporaryDirectory, { recursive: true });
  }
});

test("trial prompts preserve normal Pi research paths while excluding Firecrawl and Jev", async () => {
  for (const name of ["research.md", "evaluate.md"]) {
    const prompt = await readFile(path.join(directory, "prompts", name), "utf8");
    assert.match(prompt, /normal Pi|normal documentation-research/i);
    assert.match(prompt, /TypeSafe skill/i);
    assert.match(prompt, /Chrome/i);
    assert.match(prompt, /Firecrawl/i);
    assert.match(prompt, /Do not call[\s\S]{0,40}Jev|Do not use[\s\S]{0,40}Jev|must not call Jev/i);
    assert.doesNotMatch(prompt, /Fetch documentation only with|Do not use curl, wget, a browser/i);
  }
});

test("frozen context comes from the pinned Git object instead of a changed working tree", async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "rlcd-frozen-input-test-"));
  try {
    assert.equal((await runCommand("git", ["init", "--quiet"], { cwd: temporaryDirectory })).code, 0);
    assert.equal(
      (await runCommand("git", ["config", "user.email", "test@example.invalid"], {
        cwd: temporaryDirectory,
      })).code,
      0,
    );
    assert.equal(
      (await runCommand("git", ["config", "user.name", "Baseline Test"], {
        cwd: temporaryDirectory,
      })).code,
      0,
    );
    const contextPath = path.join(temporaryDirectory, "CONTEXT.md");
    await writeFile(contextPath, "frozen context\n");
    assert.equal((await runCommand("git", ["add", "CONTEXT.md"], { cwd: temporaryDirectory })).code, 0);
    assert.equal(
      (await runCommand("git", ["commit", "--quiet", "-m", "test: freeze context"], {
        cwd: temporaryDirectory,
      })).code,
      0,
    );
    const revision = await runCommand("git", ["rev-parse", "HEAD"], { cwd: temporaryDirectory });
    assert.equal(revision.code, 0, revision.stderr);

    await writeFile(contextPath, "changed working-tree context\n");

    assert.equal(
      (await readFileAtCommit(temporaryDirectory, revision.stdout.trim(), "CONTEXT.md")).toString(),
      "frozen context\n",
    );
    assert.equal(await readFile(contextPath, "utf8"), "changed working-tree context\n");
  } finally {
    await rm(temporaryDirectory, { recursive: true });
  }
});

test("run-trial retains sanitized public artifacts and measured phase totals", async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "rlcd-runner-test-"));
  try {
    const fakePi = path.join(temporaryDirectory, "fake-pi.mjs");
    const outputDirectory = path.join(temporaryDirectory, "trial");
    await writeFile(
      fakePi,
      `#!/usr/bin/env node
if (process.argv.includes("--version")) {
  console.log("0.85.1");
  process.exit(0);
}
const forbiddenFlags = [
  "--no-context-files",
  "--no-extensions",
  "--no-skills",
  "--no-prompt-templates",
  "--no-tools",
  "--tools",
];
const disabledNormalResource = forbiddenFlags.find((flag) => process.argv.includes(flag));
if (disabledNormalResource) {
  console.error(\`Normal Pi resource discovery disabled by \${disabledNormalResource}\`);
  process.exit(2);
}
const phase = process.env.BASELINE_PHASE;
const finalAnswer = phase === "research"
  ? "# Fake brief\\n\\nA measured answer."
  : "# Evaluation\\n\\nAll fixed checks passed.\\n\\nVERDICT: PASS";
const event = {
  type: "message_end",
  message: {
    role: "assistant",
    provider: "test-provider",
    model: "test-model",
    stopReason: "stop",
    content: [{ type: "text", text: finalAnswer }],
    usage: {
      input: phase === "research" ? 10 : 20,
      output: phase === "research" ? 2 : 4,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: phase === "research" ? 12 : 24,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  },
};
console.log(JSON.stringify(event));
`,
    );
    await chmod(fakePi, 0o755);

    const result = await runNode("run-trial.mjs", [
      "--condition", "cold",
      "--output", outputDirectory,
      "--pi-bin", fakePi,
      "--provider", "test-provider",
      "--model", "test-model",
      "--thinking", "low",
    ]);
    assert.equal(result.code, 0, result.stderr);

    const metrics = JSON.parse(await readFile(path.join(outputDirectory, "metrics.json"), "utf8"));
    assert.equal(metrics.condition, "cold");
    assert.equal(metrics.verifiedOutcome, "PASS");
    assert.equal(metrics.mainModel.turns, 2);
    assert.deepEqual(metrics.mainModel.tokens, {
      input: 30,
      output: 6,
      cacheRead: 0,
      cacheWrite: 0,
      total: 36,
    });
    assert.equal(metrics.directHttpRequests.total, null);
    assert.equal(metrics.directHttpRequests.instrumentedFetchDocAttempts, 0);
    assert.equal(metrics.browserCommands.total, null);
    assert.equal(metrics.browserCommands.observedToolCalls, 0);
    assert.deepEqual(metrics.failedToolCalls, {});
    assert.equal(metrics.retained.baselineOwnedProcesses, null);
    assert.equal(metrics.retained.browserPages, null);
    assert.match(metrics.environment.resourceDiscovery, /normal Pi discovery enabled/);
    assert.equal(metrics.frozenContext.commit, "6d7aa3f294e8da64aaa2b2ae5958c846e18472e3");
    assert.match(metrics.frozenContext.method, /Git object/);
    assert(metrics.unavailableMeasurements.includes("total direct HTTP requests"));
    assert(metrics.unavailableMeasurements.includes("retained baseline-owned descendant processes"));
    assert.match(await readFile(path.join(outputDirectory, "brief.md"), "utf8"), /Fake brief/);
    assert.match(await readFile(path.join(outputDirectory, "evaluation.md"), "utf8"), /VERDICT: PASS/);
    assert.deepEqual((await readdir(outputDirectory)).sort(), [
      "brief.md",
      "evaluation.md",
      "metrics.json",
      "retrievals.jsonl",
    ]);
  } finally {
    await rm(temporaryDirectory, { recursive: true });
  }
});

test("fetch-doc records a response when reading its body fails", async () => {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, {
      "content-length": "100",
      "content-type": "text/markdown",
    });
    response.flushHeaders();
    response.write("partial");
    response.destroy();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "rlcd-fetch-test-"));
  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const logPath = path.join(temporaryDirectory, "retrievals.jsonl");
    const result = await runNode("fetch-doc.mjs", [`${origin}/document.md`], {
      env: {
        BASELINE_ALLOW_ORIGIN: origin,
        BASELINE_HTTP_LOG: logPath,
        BASELINE_PHASE: "research",
      },
    });

    assert.equal(result.code, 1);
    const entries = (await readFile(logPath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.equal(entries.length, 1);
    assert.equal(entries[0].status, 200);
    assert.equal(entries[0].bytes, null);
    assert.equal(entries[0].sha256, null);
    assert.match(entries[0].error, /terminated|body|socket/i);
  } finally {
    server.close();
    await once(server, "close");
    await rm(temporaryDirectory, { recursive: true });
  }
});

test("fetch-doc follows and records each HTTP response through its CLI contract", async () => {
  const requests = [];
  const server = http.createServer((request, response) => {
    requests.push(request.url);
    if (request.url === "/start") {
      response.writeHead(302, { location: "/document.md" });
      response.end();
      return;
    }
    response.writeHead(200, { "content-type": "text/markdown" });
    response.end("# Primary source\n");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "rlcd-fetch-test-"));
  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const logPath = path.join(temporaryDirectory, "retrievals.jsonl");
    const result = await runNode("fetch-doc.mjs", [`${origin}/start`], {
      env: {
        BASELINE_ALLOW_ORIGIN: origin,
        BASELINE_HTTP_LOG: logPath,
        BASELINE_PHASE: "research",
      },
    });

    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, "# Primary source\n");
    assert.deepEqual(requests, ["/start", "/document.md"]);

    const entries = (await readFile(logPath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.equal(entries.length, 2);
    assert.deepEqual(entries.map(({ status }) => status), [302, 200]);
    assert.deepEqual(entries.map(({ phase }) => phase), ["research", "research"]);
    assert.equal(entries[1].url, `${origin}/document.md`);
    assert.equal(entries[1].bytes, 17);
    assert.match(entries[1].sha256, /^[a-f0-9]{64}$/);
    assert.match(entries[0].startedAt, /^2026-|^20\d\d-/);
    assert.match(entries[1].completedAt, /^2026-|^20\d\d-/);
  } finally {
    server.close();
    await once(server, "close");
    await rm(temporaryDirectory, { recursive: true });
  }
});
