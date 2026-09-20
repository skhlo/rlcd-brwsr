#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import {
  access,
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  parseEventStream,
  summarizeEvents,
} from "../typesafe-research-baseline/summarize-events.mjs";
import { readFileAtCommit } from "../typesafe-research-baseline/run-trial.mjs";

const experimentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(experimentDirectory, "../..");
const baselineDirectory = path.resolve(
  experimentDirectory,
  "../typesafe-research-baseline",
);
const startingCommit = "6d7aa3f294e8da64aaa2b2ae5958c846e18472e3";
const defaultStartUrl =
  "https://docs.typesafe.ai/concepts/how-to-build-with-system-one";
const defaultExtension = path.join(
  experimentDirectory,
  "real-jev-issue-6-extension.ts",
);
const defaultLedger = path.resolve(
  experimentDirectory,
  "../jev-trial-ledger.json",
);

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function parseArguments(arguments_) {
  const options = {};
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--help") return { help: true };
    if (!argument.startsWith("--")) {
      throw new Error(`Unexpected argument: ${argument}`);
    }
    const value = arguments_[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${argument}`);
    }
    options[argument.slice(2)] = value;
    index += 1;
  }
  return options;
}

function usage() {
  return `Usage: node run-research-trial.mjs \\
  --condition <cold|warm> \\
  --output <new-directory> \\
  [--pi-bin pi] \\
  [--chrome-bin chrome-devtools] \\
  [--ledger experiments/jev-trial-ledger.json] \\
  [--provider openai-codex] \\
  [--model gpt-5.6-sol] \\
  [--thinking xhigh]\n`;
}

async function ensureNewDirectory(directory) {
  try {
    await access(directory);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    await mkdir(path.dirname(directory), { recursive: true });
    await mkdir(directory);
    return;
  }
  throw new Error(`Output directory already exists: ${directory}`);
}

async function captureProcess(executable, arguments_, options = {}) {
  const child = spawn(executable, arguments_, {
    cwd: options.cwd,
    env: options.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  const [code, signal] = await once(child, "close");
  return {
    code,
    signal,
    stdout: Buffer.concat(stdout).toString("utf8"),
    stderr: Buffer.concat(stderr).toString("utf8"),
  };
}

async function checkedCommand(executable, arguments_, options = {}) {
  const result = await captureProcess(executable, arguments_, options);
  if (result.code !== 0) {
    throw new Error(
      `${path.basename(executable)} ${arguments_[0] ?? "command"} failed with ${result.code ?? result.signal}: ${result.stderr.trim().slice(-2_000)}`,
    );
  }
  return result;
}

async function copyInput(source, destination) {
  await copyFile(source, destination);
  return sha256(await readFile(destination));
}

async function prepareWorkspace(workspace) {
  const hashes = {};
  const currentInputs = [
    [path.join(baselineDirectory, "task.md"), "task.md"],
    [path.join(baselineDirectory, "fetch-doc.mjs"), "fetch-doc.mjs"],
  ];
  const frozenContextInputs = [
    ["CONTEXT.md", "CONTEXT.md"],
    ["docs/RLCD-BRWSR.md", "RLCD-BRWSR.md"],
    [
      "docs/adr/0001-classifier-over-existing-browser-executor.md",
      "0001-classifier-over-existing-browser-executor.md",
    ],
  ];

  for (const [source, name] of currentInputs) {
    hashes[name] = await copyInput(source, path.join(workspace, name));
  }
  for (const [repositoryPath, name] of frozenContextInputs) {
    const contents = await readFileAtCommit(
      repositoryRoot,
      startingCommit,
      repositoryPath,
    );
    await writeFile(path.join(workspace, name), contents);
    hashes[name] = sha256(contents);
  }
  await chmod(path.join(workspace, "fetch-doc.mjs"), 0o755);

  const researchPrompt = path.join(
    experimentDirectory,
    "prompts",
    "research.md",
  );
  const evaluationPrompt = path.join(
    baselineDirectory,
    "prompts",
    "evaluate.md",
  );
  const evaluationChecklist = path.join(
    baselineDirectory,
    "evaluation-checklist.md",
  );
  hashes["prompts/research.md"] = sha256(await readFile(researchPrompt));
  hashes["prompts/evaluate.md"] = sha256(await readFile(evaluationPrompt));
  hashes["evaluation-checklist.md"] = sha256(
    await readFile(evaluationChecklist),
  );
  hashes["real-jev-issue-6-extension.ts"] = sha256(
    await readFile(defaultExtension),
  );
  return hashes;
}

function parsePages(stdout) {
  let value;
  try {
    value = JSON.parse(stdout);
  } catch {
    throw new Error("Chrome CLI returned invalid page-list JSON");
  }
  if (!value || typeof value !== "object" || !Array.isArray(value.pages)) {
    throw new Error("Chrome CLI page list did not contain pages");
  }
  return value.pages.map((page) => {
    if (
      !page ||
      typeof page !== "object" ||
      !Number.isInteger(page.id) ||
      typeof page.url !== "string" ||
      typeof page.title !== "string" ||
      typeof page.selected !== "boolean"
    ) {
      throw new Error("Chrome CLI returned a malformed page entry");
    }
    return {
      id: page.id,
      url: page.url,
      title: page.title,
      selected: page.selected,
    };
  });
}

async function listPages(chromeBin, environment) {
  const result = await checkedCommand(
    chromeBin,
    ["list_pages", "--output-format=json"],
    { cwd: repositoryRoot, env: environment },
  );
  return parsePages(result.stdout);
}

function textContent(message) {
  if (!Array.isArray(message?.content)) {
    return typeof message?.content === "string" ? message.content : "";
  }
  return message.content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("");
}

function toolDetails(event) {
  const result = event?.result;
  if (result && typeof result === "object" && result.details) {
    return result.details;
  }
  if (result && typeof result === "object" && Array.isArray(result.content)) {
    const text = result.content
      .filter(
        (block) => block?.type === "text" && typeof block.text === "string",
      )
      .map((block) => block.text)
      .join("");
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  }
  if (typeof result === "string") {
    try {
      return JSON.parse(result);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function fastLoopSummary(events) {
  const starts = events.filter(
    (event) =>
      event?.type === "tool_execution_start" &&
      event.toolName === "rlcd_brwsr_run",
  );
  const ends = events.filter(
    (event) =>
      event?.type === "tool_execution_end" &&
      event.toolName === "rlcd_brwsr_run",
  );
  const details = ends
    .map(toolDetails)
    .filter((value) => value && typeof value === "object");
  const stopReasons = details
    .map((detail) => detail.stopReason)
    .filter((value) => typeof value === "string");
  const metrics = details
    .map((detail) => detail.metrics)
    .filter((value) => value && typeof value === "object");
  const trace = details.flatMap((detail) =>
    Array.isArray(detail.trace) ? detail.trace : [],
  );

  return {
    calls: starts.length,
    completedCalls: ends.length,
    resultDetailsAvailable: details.length,
    stopReasons,
    completionClaims: stopReasons.filter((reason) => reason === "done_claim")
      .length,
    staleDecisions:
      stopReasons.filter((reason) => reason === "stale_target").length +
      trace.filter((entry) => entry?.outcome === "stale_target").length,
    consequentialActionStops: stopReasons.filter(
      (reason) => reason === "consequential_action",
    ).length,
    browserCommands: metrics.reduce(
      (total, value) =>
        total +
        (Number.isFinite(value.browserCommands) ? value.browserCommands : 0),
      0,
    ),
    classifierCalls: metrics.reduce(
      (total, value) =>
        total +
        (Number.isFinite(value.classifierCalls) ? value.classifierCalls : 0),
      0,
    ),
    modelInputTokens: metrics.reduce(
      (total, value) =>
        total +
        (Number.isFinite(value.modelInputTokens) ? value.modelInputTokens : 0),
      0,
    ),
    modelOutputTokens: metrics.reduce(
      (total, value) =>
        total +
        (Number.isFinite(value.modelOutputTokens)
          ? value.modelOutputTokens
          : 0),
      0,
    ),
    waits: metrics.reduce(
      (total, value) =>
        total + (Number.isFinite(value.waits) ? value.waits : 0),
      0,
    ),
    budgetOverrunMs: metrics.reduce(
      (total, value) =>
        total +
        (Number.isFinite(value.budgetOverrunMs) ? value.budgetOverrunMs : 0),
      0,
    ),
  };
}

async function runPiPhase({
  phase,
  prompt,
  workspace,
  piBin,
  provider,
  model,
  thinking,
  retrievalLog,
  extension,
  ledgerPath,
  trialPurpose,
}) {
  const environment = {
    ...process.env,
    BASELINE_HTTP_LOG: retrievalLog,
    BASELINE_PHASE: phase,
    FAST_LOOP_PHASE: phase,
    PI_SKIP_VERSION_CHECK: "1",
  };
  delete environment.BASELINE_ALLOW_ORIGIN;
  if (phase === "research") {
    environment.RLCD_JEV_TRIAL_LEDGER_PATH = ledgerPath;
    environment.RLCD_JEV_TRIAL_PURPOSE = trialPurpose;
  } else {
    delete environment.TYPESAFE_API_KEY;
    delete environment.RLCD_JEV_TRIAL_LEDGER_PATH;
    delete environment.RLCD_JEV_TRIAL_PURPOSE;
  }

  const arguments_ = [
    "--mode",
    "json",
    "--no-session",
    "--provider",
    provider,
    "--model",
    model,
    "--thinking",
    thinking,
    ...(phase === "research" ? ["--extension", extension] : []),
    prompt,
  ];
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const result = await captureProcess(piBin, arguments_, {
    cwd: workspace,
    env: environment,
  });
  const endedAt = new Date().toISOString();
  const wallTimeMs = Math.round(performance.now() - started);
  if (result.code !== 0) {
    throw new Error(
      `Pi ${phase} phase failed with ${result.code ?? result.signal}: ${result.stderr.trim().slice(-2_000)}`,
    );
  }
  const events = parseEventStream(result.stdout);
  const summary = summarizeEvents(events);
  if (summary.finalAnswer === "") {
    const fallback = [...events]
      .reverse()
      .find((event) => event?.type === "message_end")?.message;
    summary.finalAnswer = textContent(fallback).trim();
  }
  if (summary.finalAnswer === "") {
    throw new Error(`Pi ${phase} phase returned no final answer`);
  }
  if (summary.model?.provider !== provider || summary.model?.id !== model) {
    throw new Error(
      `Pi ${phase} used ${summary.model?.provider ?? "unknown"}/${summary.model?.id ?? "unknown"}, expected ${provider}/${model}`,
    );
  }
  return {
    startedAt,
    endedAt,
    wallTimeMs,
    events,
    ...summary,
    ...(phase === "research" ? { fastLoop: fastLoopSummary(events) } : {}),
  };
}

function sumTokens(phases) {
  if (phases.some((phase) => phase.tokens === null)) return null;
  return phases.reduce(
    (total, phase) => ({
      input: total.input + phase.tokens.input,
      output: total.output + phase.tokens.output,
      cacheRead: total.cacheRead + phase.tokens.cacheRead,
      cacheWrite: total.cacheWrite + phase.tokens.cacheWrite,
      total: total.total + phase.tokens.total,
    }),
    { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  );
}

function sumToolCalls(phases) {
  const counts = {};
  for (const phase of phases) {
    for (const [name, count] of Object.entries(phase.toolCalls)) {
      counts[name] = (counts[name] ?? 0) + count;
    }
  }
  return counts;
}

function sumFailedToolCalls(phases) {
  const counts = {};
  for (const phase of phases) {
    for (const [name, count] of Object.entries(phase.failedToolCalls)) {
      counts[name] = (counts[name] ?? 0) + count;
    }
  }
  return counts;
}

function extractVerdict(evaluation) {
  const finalLine = evaluation.trim().split("\n").at(-1)?.trim();
  return /^VERDICT: (PASS|FAIL)$/.exec(finalLine ?? "")?.[1] ?? null;
}

async function readRetrievals(retrievalLog) {
  const contents = await readFile(retrievalLog, "utf8");
  if (contents.trim() === "") return { contents: "", entries: [] };
  const entries = contents
    .trim()
    .split("\n")
    .map((line, index) => {
      const entry = JSON.parse(line);
      const url = new URL(entry.url);
      if (url.origin !== "https://docs.typesafe.ai") {
        throw new Error(
          `Unexpected retained retrieval origin on line ${index + 1}`,
        );
      }
      return entry;
    });
  return {
    contents: `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
    entries,
  };
}

async function readLedger(ledgerPath) {
  const ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
  if (
    !ledger ||
    typeof ledger !== "object" ||
    ledger.schemaVersion !== 1 ||
    !Array.isArray(ledger.attempts) ||
    !ledger.budget ||
    ledger.budget.model !== "jev-1.13.0"
  ) {
    throw new Error("Jev trial ledger is malformed");
  }
  return ledger;
}

function ledgerDelta(before, after, trialPurpose) {
  const priorIds = new Set(before.attempts.map((attempt) => attempt.id));
  const attempts = after.attempts.filter(
    (attempt) => !priorIds.has(attempt.id),
  );
  if (
    attempts.some(
      (attempt) =>
        attempt.issue !== 6 ||
        attempt.purpose !== trialPurpose ||
        attempt.outcome === "reserved",
    )
  ) {
    throw new Error(
      "New Jev ledger attempts did not settle with the expected issue and purpose",
    );
  }
  const outcomes = {};
  for (const attempt of attempts) {
    outcomes[attempt.outcome] = (outcomes[attempt.outcome] ?? 0) + 1;
  }
  return {
    requests: attempts.length,
    outcomes,
    inputTokens: attempts.reduce(
      (sum, attempt) => sum + (attempt.inputTokens ?? 0),
      0,
    ),
    outputTokens: attempts.reduce(
      (sum, attempt) => sum + (attempt.outputTokens ?? 0),
      0,
    ),
    actualUsd: attempts.reduce(
      (sum, attempt) => sum + (attempt.actualUsd ?? 0),
      0,
    ),
    unknownBillingReservedUsd: attempts.reduce(
      (sum, attempt) =>
        sum + (attempt.actualUsd === undefined ? attempt.reservedUsd : 0),
      0,
    ),
    committedUsd: attempts.reduce(
      (sum, attempt) => sum + (attempt.actualUsd ?? attempt.reservedUsd),
      0,
    ),
  };
}

function cumulativeBudget(ledger) {
  const committedUsd = ledger.attempts.reduce(
    (sum, attempt) => sum + (attempt.actualUsd ?? attempt.reservedUsd),
    0,
  );
  return {
    attemptedRequests: ledger.attempts.length,
    actualUsd: ledger.attempts.reduce(
      (sum, attempt) => sum + (attempt.actualUsd ?? 0),
      0,
    ),
    unknownBillingReservedUsd: ledger.attempts.reduce(
      (sum, attempt) =>
        sum + (attempt.actualUsd === undefined ? attempt.reservedUsd : 0),
      0,
    ),
    committedUsd,
    remainingRequests: ledger.budget.maxRequests - ledger.attempts.length,
    remainingUsd: ledger.budget.maxUsd - committedUsd,
  };
}

async function version(executable) {
  const result = await checkedCommand(executable, ["--version"], {
    cwd: repositoryRoot,
    env: { ...process.env, PI_SKIP_VERSION_CHECK: "1" },
  });
  return result.stdout.trim();
}

async function currentCommit() {
  const result = await checkedCommand(
    "git",
    ["-C", repositoryRoot, "rev-parse", "HEAD"],
    { cwd: repositoryRoot, env: process.env },
  );
  return result.stdout.trim();
}

export async function runTrial(options) {
  if (options.condition !== "cold" && options.condition !== "warm") {
    throw new Error("--condition must be cold or warm");
  }
  if (!options.output) throw new Error("--output is required");
  if (!process.env.TYPESAFE_API_KEY?.trim()) {
    throw new Error(
      "TYPESAFE_API_KEY is not configured; no page or paid trial was started",
    );
  }

  const provider = options.provider || process.env.PI_PROVIDER;
  const model = options.model || process.env.PI_MODEL;
  const thinking = options.thinking || process.env.PI_REASONING_LEVEL;
  if (!provider || !model || !thinking) {
    throw new Error(
      "provider, model and thinking must be supplied by flags or PI_* environment variables",
    );
  }

  const output = path.resolve(options.output);
  const piBin = options.piBin || "pi";
  const chromeBin = options.chromeBin || "chrome-devtools";
  const extension = path.resolve(options.extension || defaultExtension);
  const ledgerPath = path.resolve(options.ledgerPath || defaultLedger);
  const startUrl = options.startUrl || defaultStartUrl;
  const trialPurpose = `${options.condition} primary research`;
  const trialStartedAt = new Date().toISOString();
  const trialStarted = performance.now();
  await ensureNewDirectory(output);
  let temporaryRoot;
  let browserWorkStarted = false;
  let pageCreationAttempted = false;
  let pagesBefore = [];
  let preparedPage;
  let cleanupComplete = false;
  let failedStage = "workspace_preparation";
  const completedPhases = [];
  let ledgerBefore;
  const cleanup = {
    taskPageClosed: null,
    preExistingPagesPreserved: null,
    pagesAfterCleanup: [],
    commands: 0,
    errors: [],
  };
  const cleanupTiming = {
    startedAt: null,
    endedAt: null,
    wallTimeMs: null,
  };
  const cleanupPreparedPage = async () => {
    if (cleanupComplete) return cleanup;
    cleanupComplete = true;
    if (!browserWorkStarted) return cleanup;
    if (preparedPage) {
      cleanup.commands += 1;
      const closed = await captureProcess(
        chromeBin,
        ["close_page", String(preparedPage.id), "--output-format=json"],
        { cwd: repositoryRoot, env: process.env },
      );
      if (closed.code !== 0) {
        cleanup.errors.push(
          `close_page exited ${String(closed.code ?? closed.signal)}`,
        );
      }
      const pageToRestore =
        pagesBefore.find((page) => page.selected) ?? pagesBefore[0];
      if (pageToRestore) {
        cleanup.commands += 1;
        const selected = await captureProcess(
          chromeBin,
          ["select_page", String(pageToRestore.id), "--output-format=json"],
          { cwd: repositoryRoot, env: process.env },
        );
        if (selected.code !== 0) {
          cleanup.errors.push(
            `select_page exited ${String(selected.code ?? selected.signal)}`,
          );
        }
      }
    }
    try {
      cleanup.commands += 1;
      cleanup.pagesAfterCleanup = await listPages(chromeBin, process.env);
    } catch (error) {
      cleanup.errors.push(
        error instanceof Error ? error.message : String(error),
      );
      return cleanup;
    }
    cleanup.taskPageClosed = preparedPage
      ? !cleanup.pagesAfterCleanup.some((page) => page.id === preparedPage.id)
      : pageCreationAttempted
        ? null
        : true;
    cleanup.preExistingPagesPreserved = pagesBefore.every((beforePage) =>
      cleanup.pagesAfterCleanup.some(
        (afterPage) =>
          afterPage.id === beforePage.id && afterPage.url === beforePage.url,
      ),
    );
    return cleanup;
  };
  const finalizeCleanup = async () => {
    if (cleanupTiming.endedAt !== null) return cleanup;
    cleanupTiming.startedAt = new Date().toISOString();
    const started = performance.now();
    await cleanupPreparedPage();
    cleanupTiming.endedAt = new Date().toISOString();
    cleanupTiming.wallTimeMs = Math.round(performance.now() - started);
    return cleanup;
  };

  try {
    temporaryRoot = await mkdtemp(
      path.join(os.tmpdir(), "rlcd-typesafe-fast-loop-"),
    );
    const workspace = path.join(temporaryRoot, "workspace");
    const retrievalLog = path.join(temporaryRoot, "retrievals.jsonl");
    await mkdir(workspace);
    await writeFile(retrievalLog, "", { mode: 0o600 });
    const inputSha256 = await prepareWorkspace(workspace);
    failedStage = "ledger_snapshot";
    ledgerBefore = await readLedger(ledgerPath);
    const protocolCommit = await currentCommit();

    failedStage = "page_preparation";
    browserWorkStarted = true;
    const pagePreparationStartedAt = new Date().toISOString();
    const pagePreparationStarted = performance.now();
    pagesBefore = await listPages(chromeBin, process.env);
    pageCreationAttempted = true;
    await checkedCommand(
      chromeBin,
      ["new_page", startUrl, "--timeout", "30000", "--output-format=json"],
      { cwd: repositoryRoot, env: process.env },
    );
    const pagesAfterPreparation = await listPages(chromeBin, process.env);
    const previousPageIds = new Set(pagesBefore.map((page) => page.id));
    const createdPages = pagesAfterPreparation.filter(
      (page) => !previousPageIds.has(page.id),
    );
    if (createdPages.length !== 1 || createdPages[0].selected !== true) {
      throw new Error(
        `Expected one newly selected prepared page, observed ${createdPages.length}`,
      );
    }
    preparedPage = createdPages[0];
    const pagePreparationEndedAt = new Date().toISOString();
    const pagePreparationWallTimeMs = Math.round(
      performance.now() - pagePreparationStarted,
    );

    const researchPrompt = await readFile(
      path.join(experimentDirectory, "prompts", "research.md"),
      "utf8",
    );
    failedStage = "research";
    const research = await runPiPhase({
      phase: "research",
      prompt: researchPrompt,
      workspace,
      piBin,
      provider,
      model,
      thinking,
      retrievalLog,
      extension,
      ledgerPath,
      trialPurpose,
    });
    completedPhases.push("research");
    await writeFile(
      path.join(output, "brief.md"),
      `${research.finalAnswer.trim()}\n`,
    );
    await writeFile(
      path.join(workspace, "brief.md"),
      `${research.finalAnswer.trim()}\n`,
    );
    await copyFile(
      path.join(baselineDirectory, "evaluation-checklist.md"),
      path.join(workspace, "evaluation-checklist.md"),
    );

    const evaluationPrompt = await readFile(
      path.join(baselineDirectory, "prompts", "evaluate.md"),
      "utf8",
    );
    failedStage = "evaluation";
    const evaluation = await runPiPhase({
      phase: "evaluation",
      prompt: evaluationPrompt,
      workspace,
      piBin,
      provider,
      model,
      thinking,
      retrievalLog,
      extension,
      ledgerPath,
      trialPurpose,
    });
    completedPhases.push("evaluation");
    await writeFile(
      path.join(output, "evaluation.md"),
      `${evaluation.finalAnswer.trim()}\n`,
    );

    const measuredWorkSubtotalEndedAt = new Date().toISOString();
    const measuredWorkSubtotalWallTimeMs = Math.round(
      performance.now() - trialStarted,
    );
    failedStage = "artifact_finalization";
    const ledgerAfter = await readLedger(ledgerPath);
    const jev = ledgerDelta(ledgerBefore, ledgerAfter, trialPurpose);
    const budgetAfterTrial = cumulativeBudget(ledgerAfter);
    const retrievals = await readRetrievals(retrievalLog);
    await writeFile(path.join(output, "retrievals.jsonl"), retrievals.contents);
    failedStage = "cleanup";
    await finalizeCleanup();
    failedStage = "post_cleanup_measurement";
    const environment = {
      piVersion: await version(piBin),
      chromeDevtoolsCliVersion: await version(chromeBin),
      nodeVersion: process.version,
      platform: `${process.platform}-${process.arch}`,
      resourceDiscovery:
        "normal Pi extension, skill and prompt-template discovery remained enabled; the issue #6 real-Jev extension was added explicitly",
      tailscaleServe: "unavailable on this host; no package was installed",
    };

    const phases = [research, evaluation];
    const verdict = extractVerdict(evaluation.finalAnswer);
    const tokens = sumTokens(phases);
    const retrievalCounts = Object.fromEntries(
      ["research", "evaluation"].map((phase) => [
        phase,
        retrievals.entries.filter((entry) => entry.phase === phase).length,
      ]),
    );
    const unavailableMeasurements = [
      ...new Set([
        ...phases.flatMap((phase) => phase.unavailableMeasurements),
        "total direct HTTP requests across unrestricted normal follow-up paths",
        "exact browser-command count for researcher-issued shell loops",
        "recovery reasoning distinct from ordinary research and synthesis",
        ...(verdict === null ? ["independent evaluation verdict"] : []),
      ]),
    ];
    const trialEndedAt = new Date().toISOString();
    const fullEndToEndWallTimeMs = Math.round(performance.now() - trialStarted);

    const metrics = {
      schemaVersion: 2,
      trialKind: "fast-loop-research",
      condition: options.condition,
      protocolCommit,
      startedAt: trialStartedAt,
      endedAt: trialEndedAt,
      timing: {
        measuredWorkSubtotalEndedAt,
        measuredWorkSubtotalWallTimeMs,
        cleanupStartedAt: cleanupTiming.startedAt,
        cleanupEndedAt: cleanupTiming.endedAt,
        cleanupWallTimeMs: cleanupTiming.wallTimeMs,
        fullEndToEndWallTimeMs,
        coverage:
          "Full total runs from public-command trial start through page cleanup and post-cleanup version capture; final metrics serialization is necessarily outside its own recorded timestamp.",
      },
      verifiedOutcome: verdict ?? "unavailable",
      mainModel: {
        provider,
        model,
        thinking,
        turns: phases.reduce((sum, phase) => sum + phase.mainModelTurns, 0),
        tokens,
        phaseTurns: {
          research: research.mainModelTurns,
          evaluation: evaluation.mainModelTurns,
        },
        phaseTokens: {
          research: research.tokens,
          evaluation: evaluation.tokens,
        },
      },
      cacheConditions: {
        freshPiContextPerPhase: true,
        sessionPersistence: "disabled with --no-session",
        priorAnswerAvailableToResearcher: false,
        priorSourcePacketAvailableToResearcher: false,
        piCacheRetention: process.env.PI_CACHE_RETENTION ?? "unset",
        providerReportedCacheReadTokens: tokens?.cacheRead ?? null,
        providerReportedCacheWriteTokens: tokens?.cacheWrite ?? null,
        documentationCaches:
          "DNS, TLS, CDN, browser, provider and Chrome daemon caches are not controlled; cold and warm are operational labels",
      },
      phaseWallTimeMs: {
        browserPreparation: pagePreparationWallTimeMs,
        researchEvidenceAndSynthesis: research.wallTimeMs,
        independentVerification: evaluation.wallTimeMs,
      },
      pagePreparation: {
        includedInMeasuredWorkSubtotal: true,
        startedAt: pagePreparationStartedAt,
        endedAt: pagePreparationEndedAt,
        wallTimeMs: pagePreparationWallTimeMs,
        startUrl,
        commands: 3,
        preparedPageId: preparedPage.id,
      },
      fastLoop: research.fastLoop,
      toolCalls: sumToolCalls(phases),
      failedToolCalls: sumFailedToolCalls(phases),
      browserCommands: {
        measuredWorkSubtotal: 3 + research.fastLoop.browserCommands,
        pagePreparation: 3,
        fastLoop: research.fastLoop.browserCommands,
        cleanup: cleanup.commands,
        exactRunnerTotal:
          3 + research.fastLoop.browserCommands + cleanup.commands,
        observedExternalResearchToolCalls: research.browserCommands.observed,
        total:
          research.browserCommands.observed === 0
            ? 3 + research.fastLoop.browserCommands + cleanup.commands
            : null,
      },
      directHttpRequests: {
        total: null,
        instrumentedFetchDocAttempts: retrievals.entries.length,
        instrumentedByPhase: retrievalCounts,
        method:
          "fetch-doc.mjs retains each instrumented response or failed attempt; unrestricted normal direct-HTTP paths remained allowed and are not fully observable",
      },
      jev: {
        model: ledgerAfter.budget.model,
        uncertaintyPolicy:
          "Stop only when the applicable operation or selected target has zero confidence or no unique probability leader outside the 0.001 validation tolerance; this floor remains uncalibrated.",
        ...jev,
        classifierCallsReportedByTool: research.fastLoop.classifierCalls,
        ledgerAndToolCallCountsAgree:
          jev.requests === research.fastLoop.classifierCalls,
      },
      verification: {
        method:
          "fresh independent Pi context applying the unchanged fixed checklist and re-fetching cited official sources; TYPESAFE_API_KEY removed",
        wallTimeMs: evaluation.wallTimeMs,
        mainModelTurns: evaluation.mainModelTurns,
        mainModelTokens: evaluation.tokens,
        directHttpRequests: null,
        instrumentedFetchDocAttempts: retrievalCounts.evaluation,
      },
      recoveryWork: {
        value: null,
        observableFailedToolCalls: Object.values(
          sumFailedToolCalls(phases),
        ).reduce((sum, count) => sum + count, 0),
        instrumentedResearchFollowUpRequests: retrievalCounts.research,
        reason:
          "event summaries do not distinguish recovery reasoning from ordinary source completion and synthesis",
      },
      retained: cleanup,
      environment,
      frozenContext: {
        commit: startingCommit,
        method:
          "shared context files materialized directly from the same Git object as the accepted normal baseline",
      },
      comparisonPolicy: {
        fixedTaskAndChecklist: true,
        normalBaselineRuns:
          "2026-09-19-normal-cold-1 and 2026-09-19-normal-warm-1; constrained pilots excluded",
        normalBaselineOutcomesRemain:
          "cold FAIL 19/20 at 417.316 s; warm FAIL 15/20 at 456.307 s",
        fastLoopDirectFollowUpAllowed: true,
        forcedBrowserOnlyRestriction: false,
        sampleSize: "n=1 per condition",
      },
      inputSha256,
      budgetAfterTrial,
      unavailableMeasurements,
    };
    await writeFile(
      path.join(output, "metrics.json"),
      `${JSON.stringify(metrics, null, 2)}\n`,
    );
    return metrics;
  } catch (error) {
    const failedAttemptSubtotalEndedAt = new Date().toISOString();
    const failedAttemptSubtotalWallTimeMs = Math.round(
      performance.now() - trialStarted,
    );
    await finalizeCleanup();
    const attemptsBefore = ledgerBefore?.attempts.length ?? null;
    let attemptsAfter = null;
    try {
      attemptsAfter = (await readLedger(ledgerPath)).attempts.length;
    } catch {
      // The failure artifact reports unavailable accounting rather than guessing.
    }
    const failureEndedAt = new Date().toISOString();
    const fullEndToEndWallTimeMs = Math.round(performance.now() - trialStarted);
    await writeFile(
      path.join(output, "failure.json"),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          trialKind: "fast-loop-research",
          condition: options.condition,
          outcome: "incomplete",
          failedStage,
          startedAt: trialStartedAt,
          endedAt: failureEndedAt,
          completedPhases,
          preparedPageId: preparedPage?.id ?? null,
          error: {
            name: error instanceof Error ? error.name : "Error",
            message: error instanceof Error ? error.message : String(error),
          },
          timing: {
            failedAttemptSubtotalEndedAt,
            failedAttemptSubtotalWallTimeMs,
            cleanupStartedAt: cleanupTiming.startedAt,
            cleanupEndedAt: cleanupTiming.endedAt,
            cleanupWallTimeMs: cleanupTiming.wallTimeMs,
            fullEndToEndWallTimeMs,
            coverage:
              "Full total runs from public-command trial start through the cleanup attempt and post-cleanup ledger count; failure artifact serialization is necessarily outside its own recorded timestamp.",
          },
          ledgerAccounting: {
            attemptsBefore,
            attemptsAfter,
            attemptsDuringInvocation:
              attemptsBefore === null || attemptsAfter === null
                ? null
                : attemptsAfter - attemptsBefore,
          },
          cleanup,
        },
        null,
        2,
      )}\n`,
    );
    throw error;
  } finally {
    await finalizeCleanup();
    if (temporaryRoot) await rm(temporaryRoot, { recursive: true });
  }
}

async function main() {
  const parsed = parseArguments(process.argv.slice(2));
  if (parsed.help) {
    process.stdout.write(usage());
    return;
  }
  const metrics = await runTrial({
    condition: parsed.condition,
    output: parsed.output,
    piBin: parsed["pi-bin"],
    chromeBin: parsed["chrome-bin"],
    ledgerPath: parsed.ledger,
    extension: parsed.extension,
    startUrl: parsed["start-url"],
    provider: parsed.provider,
    model: parsed.model,
    thinking: parsed.thinking,
  });
  process.stdout.write(
    `${JSON.stringify({
      condition: metrics.condition,
      verifiedOutcome: metrics.verifiedOutcome,
      fullEndToEndWallTimeMs: metrics.timing.fullEndToEndWallTimeMs,
      output: path.resolve(parsed.output),
    })}\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
