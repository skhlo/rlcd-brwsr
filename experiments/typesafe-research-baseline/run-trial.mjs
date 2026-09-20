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
import { parseEventStream, summarizeEvents } from "./summarize-events.mjs";

const experimentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(experimentDirectory, "../..");
const startingCommit = "6d7aa3f294e8da64aaa2b2ae5958c846e18472e3";

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function parseArguments(arguments_) {
  const options = {};
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--help") return { help: true };
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const value = arguments_[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for ${argument}`);
    options[argument.slice(2)] = value;
    index += 1;
  }
  return options;
}

function usage() {
  return `Usage: node run-trial.mjs \\
  --condition <cold|warm> \\
  --output <new-directory> \\
  [--pi-bin pi] \\
  [--provider $PI_PROVIDER] \\
  [--model $PI_MODEL] \\
  [--thinking $PI_REASONING_LEVEL]\n`;
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

async function copyInput(source, destination) {
  await copyFile(source, destination);
  return sha256(await readFile(destination));
}

export async function readFileAtCommit(root, commit, repositoryPath) {
  const child = spawn("git", ["-C", root, "show", `${commit}:${repositoryPath}`], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  const [code, signal] = await once(child, "close");
  if (code !== 0) {
    const diagnostic = Buffer.concat(stderr).toString("utf8").trim();
    throw new Error(
      `Could not read ${repositoryPath} from ${commit}: ${diagnostic || signal || `git exited ${code}`}`,
    );
  }
  return Buffer.concat(stdout);
}

async function prepareWorkspace(workspace) {
  const currentInputs = [
    [path.join(experimentDirectory, "task.md"), "task.md"],
    [path.join(experimentDirectory, "fetch-doc.mjs"), "fetch-doc.mjs"],
  ];
  const frozenContextInputs = [
    ["CONTEXT.md", "CONTEXT.md"],
    ["docs/RLCD-BRWSR.md", "RLCD-BRWSR.md"],
    [
      "docs/adr/0001-classifier-over-existing-browser-executor.md",
      "0001-classifier-over-existing-browser-executor.md",
    ],
  ];
  const hashes = {};
  for (const [source, name] of currentInputs) {
    hashes[name] = await copyInput(source, path.join(workspace, name));
  }
  for (const [repositoryPath, name] of frozenContextInputs) {
    const contents = await readFileAtCommit(repositoryRoot, startingCommit, repositoryPath);
    await writeFile(path.join(workspace, name), contents);
    hashes[name] = sha256(contents);
  }
  await chmod(path.join(workspace, "fetch-doc.mjs"), 0o755);
  hashes["prompts/research.md"] = sha256(
    await readFile(path.join(experimentDirectory, "prompts", "research.md")),
  );
  hashes["prompts/evaluate.md"] = sha256(
    await readFile(path.join(experimentDirectory, "prompts", "evaluate.md")),
  );
  hashes["evaluation-checklist.md"] = sha256(
    await readFile(path.join(experimentDirectory, "evaluation-checklist.md")),
  );
  return hashes;
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

async function runPiPhase({
  phase,
  prompt,
  workspace,
  piBin,
  provider,
  model,
  thinking,
  retrievalLog,
}) {
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const environment = {
    ...process.env,
    BASELINE_HTTP_LOG: retrievalLog,
    BASELINE_PHASE: phase,
    PI_SKIP_VERSION_CHECK: "1",
  };
  delete environment.BASELINE_ALLOW_ORIGIN;
  delete environment.TYPESAFE_API_KEY;

  const result = await captureProcess(
    piBin,
    [
      "--mode", "json",
      "--no-session",
      "--provider", provider,
      "--model", model,
      "--thinking", thinking,
      prompt,
    ],
    { cwd: workspace, env: environment },
  );
  const endedAt = new Date().toISOString();
  const wallTimeMs = Math.round(performance.now() - started);
  if (result.code !== 0) {
    const diagnostic = result.stderr.trim().slice(-2_000);
    throw new Error(`Pi ${phase} phase failed with ${result.code ?? result.signal}: ${diagnostic}`);
  }
  const summary = summarizeEvents(parseEventStream(result.stdout));
  if (summary.finalAnswer === "") throw new Error(`Pi ${phase} phase returned no final answer`);
  if (summary.model?.provider !== provider || summary.model?.id !== model) {
    throw new Error(
      `Pi ${phase} used ${summary.model?.provider ?? "unknown"}/${summary.model?.id ?? "unknown"}, expected ${provider}/${model}`,
    );
  }
  return { startedAt, endedAt, wallTimeMs, ...summary };
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
  const toolCalls = {};
  for (const phase of phases) {
    for (const [name, count] of Object.entries(phase.toolCalls)) {
      toolCalls[name] = (toolCalls[name] ?? 0) + count;
    }
  }
  return toolCalls;
}

function extractVerdict(evaluation) {
  const finalLine = evaluation.trim().split("\n").at(-1)?.trim();
  const match = /^VERDICT: (PASS|FAIL)$/.exec(finalLine ?? "");
  return match?.[1] ?? null;
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
        throw new Error(`Unexpected retained retrieval origin on line ${index + 1}`);
      }
      return entry;
    });
  return { contents: `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`, entries };
}

async function piVersion(piBin) {
  const result = await captureProcess(piBin, ["--version"], {
    cwd: repositoryRoot,
    env: { ...process.env, PI_SKIP_VERSION_CHECK: "1" },
  });
  if (result.code !== 0) throw new Error(`Could not read Pi version: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

export async function runTrial(options) {
  const condition = options.condition;
  if (condition !== "cold" && condition !== "warm") {
    throw new Error("--condition must be cold or warm");
  }
  if (!options.output) throw new Error("--output is required");
  const provider = options.provider || process.env.PI_PROVIDER;
  const model = options.model || process.env.PI_MODEL;
  const thinking = options.thinking || process.env.PI_REASONING_LEVEL;
  if (!provider || !model || !thinking) {
    throw new Error("provider, model and thinking must be supplied by flags or PI_* environment variables");
  }

  const output = path.resolve(options.output);
  const piBin = options.piBin || "pi";
  const trialStartedAt = new Date().toISOString();
  const trialStarted = performance.now();
  await ensureNewDirectory(output);
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "rlcd-typesafe-baseline-"));
  const workspace = path.join(temporaryRoot, "workspace");
  const retrievalLog = path.join(temporaryRoot, "retrievals.jsonl");
  await mkdir(workspace);
  await writeFile(retrievalLog, "", { mode: 0o600 });

  try {
    const inputSha256 = await prepareWorkspace(workspace);
    const researchPrompt = await readFile(path.join(experimentDirectory, "prompts", "research.md"), "utf8");
    const research = await runPiPhase({
      phase: "research",
      prompt: researchPrompt,
      workspace,
      piBin,
      provider,
      model,
      thinking,
      retrievalLog,
    });
    await writeFile(path.join(output, "brief.md"), `${research.finalAnswer.trim()}\n`);
    await writeFile(path.join(workspace, "brief.md"), `${research.finalAnswer.trim()}\n`);
    await copyFile(
      path.join(experimentDirectory, "evaluation-checklist.md"),
      path.join(workspace, "evaluation-checklist.md"),
    );

    const evaluationPrompt = await readFile(path.join(experimentDirectory, "prompts", "evaluate.md"), "utf8");
    const evaluation = await runPiPhase({
      phase: "evaluation",
      prompt: evaluationPrompt,
      workspace,
      piBin,
      provider,
      model,
      thinking,
      retrievalLog,
    });
    await writeFile(path.join(output, "evaluation.md"), `${evaluation.finalAnswer.trim()}\n`);

    const trialEndedAt = new Date().toISOString();
    const wallTimeMs = Math.round(performance.now() - trialStarted);
    const retrievals = await readRetrievals(retrievalLog);
    await writeFile(path.join(output, "retrievals.jsonl"), retrievals.contents);

    const phases = [research, evaluation];
    const verdict = extractVerdict(evaluation.finalAnswer);
    const unavailableMeasurements = [
      ...new Set([
        ...phases.flatMap((phase) => phase.unavailableMeasurements),
        "total direct HTTP requests",
        "total browser commands across unrestricted tool paths",
        "recovery work beyond observable failed tool calls",
        "retained baseline-owned descendant processes",
        "retained browser pages",
        ...(verdict === null ? ["independent evaluation verdict"] : []),
      ]),
    ];
    const retrievalCounts = Object.fromEntries(
      ["research", "evaluation"].map((phase) => [
        phase,
        retrievals.entries.filter((entry) => entry.phase === phase).length,
      ]),
    );

    const metrics = {
      schemaVersion: 2,
      trialKind: "normal-pi-baseline",
      condition,
      startingCommit,
      startedAt: trialStartedAt,
      endedAt: trialEndedAt,
      wallTimeMs,
      verifiedOutcome: verdict ?? "unavailable",
      mainModel: {
        provider,
        model,
        thinking,
        turns: phases.reduce((sum, phase) => sum + phase.mainModelTurns, 0),
        tokens: sumTokens(phases),
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
        piCacheRetention: process.env.PI_CACHE_RETENTION ?? "unset",
        providerReportedCacheReadTokens: sumTokens(phases)?.cacheRead ?? null,
        providerReportedCacheWriteTokens: sumTokens(phases)?.cacheWrite ?? null,
        documentationCache: "the optional fetch-doc helper has no application cache; other normal retrieval paths and upstream DNS/CDN caches are not controlled",
      },
      phaseWallTimeMs: {
        research: research.wallTimeMs,
        evaluation: evaluation.wallTimeMs,
      },
      toolCalls: sumToolCalls(phases),
      failedToolCalls: phases.reduce((counts, phase) => {
        for (const [name, count] of Object.entries(phase.failedToolCalls)) {
          counts[name] = (counts[name] ?? 0) + count;
        }
        return counts;
      }, {}),
      directHttpRequests: {
        total: null,
        instrumentedFetchDocAttempts: retrievals.entries.length,
        instrumentedByPhase: retrievalCounts,
        method: "fetch-doc.mjs retains one entry per HTTP response or failed attempt; normal direct HTTP and extension paths remain permitted and are not fully observable",
      },
      browserCommands: {
        total: null,
        observedToolCalls: phases.reduce((sum, phase) => sum + phase.browserCommands.observed, 0),
        method: `${research.browserCommands.method}; shell loops and extension-internal activity may not map one-to-one to browser commands`,
      },
      jev: {
        requests: 0,
        tokens: 0,
        basis: "Jev credentials were removed from trial children and the fixed protocol forbids inference; normal documentation and browser tools remain available",
      },
      verification: {
        method: "fresh independent Pi context applying the fixed checklist and re-fetching cited sources",
        wallTimeMs: evaluation.wallTimeMs,
        mainModelTurns: evaluation.mainModelTurns,
        mainModelTokens: evaluation.tokens,
        directHttpRequests: null,
        instrumentedFetchDocAttempts: retrievalCounts.evaluation,
      },
      recoveryWork: {
        value: null,
        reason: "not separately distinguishable from ordinary work; failed tool calls are reported independently",
      },
      retained: {
        baselineOwnedProcesses: null,
        processMethod: "unavailable: awaiting the direct Pi children does not establish whether they left descendants",
        browserPages: null,
        pageMethod: "unavailable: normal browser access is permitted and the runner does not inspect or close pre-existing browser state",
      },
      environment: {
        piVersion: await piVersion(piBin),
        nodeVersion: process.version,
        platform: `${process.platform}-${process.arch}`,
        resourceDiscovery: "normal Pi discovery enabled for extensions, skills (including TypeSafe) and prompt templates; only repository trial files are isolated",
        toolSelection: "normal Pi defaults; the runner does not apply a tool allowlist or disable browser-capable extensions",
      },
      frozenContext: {
        commit: startingCommit,
        method: "shared context files materialized directly from the named Git object with git show",
      },
      inputSha256,
      unavailableMeasurements,
    };
    await writeFile(path.join(output, "metrics.json"), `${JSON.stringify(metrics, null, 2)}\n`);
    return metrics;
  } finally {
    await rm(temporaryRoot, { recursive: true });
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
    provider: parsed.provider,
    model: parsed.model,
    thinking: parsed.thinking,
  });
  process.stdout.write(`${JSON.stringify({
    condition: metrics.condition,
    verifiedOutcome: metrics.verifiedOutcome,
    wallTimeMs: metrics.wallTimeMs,
    output: path.resolve(parsed.output),
  })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
