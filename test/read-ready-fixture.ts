import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const defaultOperationTimeoutMs = 3_000;
const shutdownAllowanceMs = 2_500;

interface ReadReadyFixtureOptions {
  startupDelayMs?: number;
  suppressReadiness?: boolean;
  operationTimeoutMs?: number;
}

interface ReadReadyProcessObservation {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

interface ReadReadyCancellationObservation {
  readonly cancellation: Readonly<{
    requested: true;
    signal: "SIGTERM";
    sent: boolean;
  }>;
  readonly exit: ReadReadyProcessObservation;
  readonly close: ReadReadyProcessObservation;
  readonly terminal: Readonly<Record<string, unknown>>;
}

export interface ReadReadyRunner {
  readonly pid: number;
  cancel(): Promise<ReadReadyCancellationObservation>;
}

export class ReadReadyFixtureError extends Error {
  readonly pid: number | undefined;

  constructor(message: string, pid: number | undefined) {
    super(message);
    this.name = "ReadReadyFixtureError";
    this.pid = pid;
  }
}

interface ObservedChild {
  readonly child: ChildProcessWithoutNullStreams;
  readonly pid: number | undefined;
  readonly started: boolean;
  readonly stdout: Buffer[];
  readonly stderr: Buffer[];
  readonly spawnError: Promise<Error>;
  readonly exit: Promise<ReadReadyProcessObservation>;
  readonly close: Promise<ReadReadyProcessObservation>;
  readonly streamsClosed: Promise<void>;
  spawnFailure: Error | undefined;
  stdinFailure: Error | undefined;
  exitObservation: ReadReadyProcessObservation | undefined;
  closeObservation: ReadReadyProcessObservation | undefined;
}

function operationTimeout(options: ReadReadyFixtureOptions): number {
  const value = options.operationTimeoutMs ?? defaultOperationTimeoutMs;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("read-ready operation timeout must be a positive integer");
  }
  return value;
}

function immutable<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) immutable(child);
  return Object.freeze(value);
}

function observeChild(child: ChildProcessWithoutNullStreams): ObservedChild {
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  let resolveSpawnError: (error: Error) => void = () => {};
  let resolveExit: (
    observation: ReadReadyProcessObservation,
  ) => void = () => {};
  let resolveClose: (
    observation: ReadReadyProcessObservation,
  ) => void = () => {};
  let resolveStdoutClose: () => void = () => {};
  let resolveStderrClose: () => void = () => {};
  let resolveStdinClose: () => void = () => {};
  const spawnError = new Promise<Error>((resolve) => {
    resolveSpawnError = resolve;
  });
  const exit = new Promise<ReadReadyProcessObservation>((resolve) => {
    resolveExit = resolve;
  });
  const close = new Promise<ReadReadyProcessObservation>((resolve) => {
    resolveClose = resolve;
  });
  const stdoutClosed = new Promise<void>((resolve) => {
    resolveStdoutClose = resolve;
  });
  const stderrClosed = new Promise<void>((resolve) => {
    resolveStderrClose = resolve;
  });
  const stdinClosed = new Promise<void>((resolve) => {
    resolveStdinClose = resolve;
  });
  const observed: ObservedChild = {
    child,
    pid: child.pid,
    started: child.pid !== undefined,
    stdout,
    stderr,
    spawnError,
    exit,
    close,
    streamsClosed: Promise.all([stdoutClosed, stderrClosed, stdinClosed]).then(
      () => undefined,
    ),
    spawnFailure: undefined,
    stdinFailure: undefined,
    exitObservation: undefined,
    closeObservation: undefined,
  };

  child.stdout.on("data", (chunk: Buffer) => stdout.push(Buffer.from(chunk)));
  child.stderr.on("data", (chunk: Buffer) => stderr.push(Buffer.from(chunk)));
  child.stdout.once("close", resolveStdoutClose);
  child.stderr.once("close", resolveStderrClose);
  child.stdin.once("close", resolveStdinClose);
  child.stdin.once("error", (error) => {
    observed.stdinFailure = error;
  });
  child.once("error", (error) => {
    observed.spawnFailure = error;
    resolveSpawnError(error);
  });
  child.once("exit", (code, signal) => {
    const observation = immutable({ code, signal });
    observed.exitObservation = observation;
    resolveExit(observation);
  });
  child.once("close", (code, signal) => {
    const observation = immutable({ code, signal });
    observed.closeObservation = observation;
    resolveClose(observation);
  });
  return observed;
}

async function waitForReadiness(
  marker: string,
  pid: number,
  signal: AbortSignal,
): Promise<void> {
  while (!signal.aborted) {
    try {
      const value = (await readFile(marker, "utf8")).trim();
      if (value) {
        if (value !== String(pid)) {
          throw new Error(
            "read readiness marker did not identify the owned bridge",
          );
        }
        return;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    try {
      await delay(10, undefined, { signal });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).name !== "AbortError") throw error;
    }
  }
}

async function beforeDeadline<T>(
  promise: Promise<T>,
  deadlineAt: number,
): Promise<{ kind: "value"; value: T } | { kind: "timeout" }> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise.then((value) => ({ kind: "value" as const, value })),
      new Promise<{ kind: "timeout" }>((resolve) => {
        timer = setTimeout(
          () => resolve({ kind: "timeout" as const }),
          Math.max(0, deadlineAt - Date.now()),
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function waitForProtectedRead(
  observed: ObservedChild,
  marker: string,
  deadlineAt: number,
  timeoutMs: number,
): Promise<void> {
  const readinessController = new AbortController();
  const pid = observed.pid;
  const readiness =
    pid === undefined
      ? new Promise<void>((resolve) => {
          readinessController.signal.addEventListener(
            "abort",
            () => resolve(),
            {
              once: true,
            },
          );
        })
      : waitForReadiness(marker, pid, readinessController.signal);
  const readinessOutcome = readiness.then(
    () => ({ kind: "ready" as const }),
    (error: unknown) => ({ kind: "readiness-error" as const, error }),
  );
  const boundedOutcome = await beforeDeadline(
    Promise.race([
      readinessOutcome,
      observed.spawnError.then((error) => ({
        kind: "spawn-error" as const,
        error,
      })),
      observed.exit.then((exit) => ({ kind: "early-exit" as const, exit })),
      observed.close.then((close) => ({ kind: "early-close" as const, close })),
    ]),
    deadlineAt,
  );
  readinessController.abort();
  await readinessOutcome;

  if (boundedOutcome.kind === "timeout") {
    throw new ReadReadyFixtureError(
      `read readiness exceeded ${timeoutMs} ms`,
      pid,
    );
  }
  const outcome = boundedOutcome.value;
  if (outcome.kind === "ready") return;
  if (outcome.kind === "spawn-error") throw outcome.error;
  if (outcome.kind === "readiness-error") throw outcome.error;
  if (observed.spawnFailure) throw observed.spawnFailure;
  const processObservation =
    outcome.kind === "early-exit" ? outcome.exit : outcome.close;
  throw new ReadReadyFixtureError(
    `read readiness failed: owned bridge exited before readiness (${String(processObservation.code)}, ${String(processObservation.signal)})`,
    pid,
  );
}

function parseTerminal(stdout: Buffer[]): Readonly<Record<string, unknown>> {
  const parsed: unknown = JSON.parse(Buffer.concat(stdout).toString("utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("read-ready bridge terminal result must be an object");
  }
  return immutable(parsed as Record<string, unknown>);
}

function cleanupFailure(message: string, observed: ObservedChild): Error {
  const stderr = Buffer.concat(observed.stderr).toString("utf8").trim();
  return new Error(stderr ? `${message}: ${stderr}` : message);
}

async function settleWithin(
  promise: Promise<unknown>,
  deadlineAt: number,
): Promise<boolean> {
  if (Date.now() >= deadlineAt) return false;
  return (await beforeDeadline(promise, deadlineAt)).kind === "value";
}

async function shutdownOwnedChild(
  observed: ObservedChild,
  directory: string,
): Promise<Error[]> {
  const failures: Error[] = [];
  const deadlineAt = Date.now() + shutdownAllowanceMs;
  const { child } = observed;

  try {
    try {
      if (!child.stdin.destroyed) child.stdin.end();
    } catch (error) {
      failures.push(error instanceof Error ? error : new Error(String(error)));
    }

    if (observed.started) {
      if (
        !observed.closeObservation &&
        !(await settleWithin(
          observed.close,
          Math.min(deadlineAt, Date.now() + 250),
        ))
      ) {
        try {
          child.kill("SIGTERM");
        } catch (error) {
          failures.push(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      }
      if (
        !observed.closeObservation &&
        !(await settleWithin(
          observed.close,
          Math.min(deadlineAt, Date.now() + 1_000),
        ))
      ) {
        try {
          child.kill("SIGKILL");
        } catch (error) {
          failures.push(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      }
      if (
        !observed.closeObservation &&
        !(await settleWithin(observed.close, deadlineAt))
      ) {
        failures.push(
          cleanupFailure(
            `read-ready cleanup retained owned child pid ${String(observed.pid)}`,
            observed,
          ),
        );
      }
      if (
        observed.closeObservation &&
        !observed.exitObservation &&
        !(await settleWithin(observed.exit, deadlineAt))
      ) {
        failures.push(
          cleanupFailure(
            `read-ready cleanup did not observe exit for owned child pid ${String(observed.pid)}`,
            observed,
          ),
        );
      }
    } else if (
      !observed.closeObservation &&
      !(await settleWithin(observed.close, deadlineAt))
    ) {
      failures.push(
        cleanupFailure(
          "read-ready no-PID child did not close its stdio",
          observed,
        ),
      );
    }

    if (!child.stdin.destroyed) child.stdin.destroy();
    if (!(await settleWithin(observed.streamsClosed, deadlineAt))) {
      failures.push(
        cleanupFailure("read-ready child streams did not close", observed),
      );
    }
    if (observed.stdinFailure) failures.push(observed.stdinFailure);
  } catch (error) {
    failures.push(error instanceof Error ? error : new Error(String(error)));
  }

  try {
    await rm(directory, { recursive: true });
  } catch (error) {
    failures.push(
      new Error(`read-ready cleanup retained workspace ${directory}`, {
        cause: error,
      }),
    );
  }
  return failures;
}

function throwFailures(
  primaryFailed: boolean,
  primary: unknown,
  cleanup: Error[],
): never {
  if (primaryFailed && cleanup.length > 0) {
    throw new AggregateError(
      [primary, ...cleanup],
      "read-ready operation and cleanup both failed",
    );
  }
  if (primaryFailed) throw primary;
  if (cleanup.length === 1) throw cleanup[0];
  throw new AggregateError(cleanup, "read-ready cleanup failed");
}

export async function withReadReadyRunner<T>(
  options: ReadReadyFixtureOptions,
  body: (runner: ReadReadyRunner) => Promise<T> | T,
): Promise<T> {
  const timeoutMs = operationTimeout(options);
  const deadlineAt = Date.now() + timeoutMs;
  let directory: string | undefined;
  let observed: ObservedChild | undefined;
  let operationsClosed = false;
  let primaryFailure: unknown;
  let primaryFailed = false;
  let bodyResult: T | undefined;
  let bodyCompleted = false;

  try {
    directory = mkdtempSync(join(tmpdir(), "rlcd-read-ready-test-"));
    const marker = join(directory, "read-ready");
    const child = spawn(
      join(repositoryRoot, ".venv", "bin", "python"),
      [join(repositoryRoot, "bridge", "rlcd_brwsr_bridge.py")],
      {
        cwd: repositoryRoot,
        env: {
          HOME: directory,
          TMPDIR: directory,
          PATH: process.env.PATH,
          PYTHONNOUSERSITE: "1",
          PYTHONDONTWRITEBYTECODE: "1",
          PYTHONPATH: join(repositoryRoot, "test", "python", "read_ready"),
          RLCD_TEST_READ_READY_MARKER: marker,
          RLCD_TEST_STARTUP_DELAY_MS: String(options.startupDelayMs ?? 0),
          RLCD_TEST_SUPPRESS_READ_READY: options.suppressReadiness ? "1" : "0",
          BH_AGENT_WORKSPACE: directory,
          BU_NAME: "rlcd-brwsr-read-ready-test",
          BU_CDP_URL: "http://127.0.0.1:43114",
          TYPESAFE_API_KEY: "synthetic-typesafe-key-MOON-62",
          TEXT_MODEL_API_KEY: "synthetic-openrouter-key-STAR-73",
        },
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    observed = observeChild(child);
    await waitForProtectedRead(observed, marker, deadlineAt, timeoutMs);
    const pid = observed.pid;
    if (pid === undefined) {
      throw observed.spawnFailure ?? new Error("read-ready bridge has no PID");
    }

    let cancellation: Promise<ReadReadyCancellationObservation> | undefined;
    const runner: ReadReadyRunner = Object.freeze({
      pid,
      cancel(): Promise<ReadReadyCancellationObservation> {
        if (operationsClosed) {
          return Promise.reject(
            new Error("read-ready operation is closed outside its scope"),
          );
        }
        if (cancellation) return cancellation;
        cancellation = (async () => {
          const sent = child.kill("SIGTERM");
          const processResult = await beforeDeadline(
            Promise.all([observed!.exit, observed!.close]),
            deadlineAt,
          );
          if (processResult.kind === "timeout") {
            throw new ReadReadyFixtureError(
              `read-ready operation exceeded ${timeoutMs} ms during cancellation`,
              pid,
            );
          }
          const [exit, close] = processResult.value;
          return immutable({
            cancellation: {
              requested: true as const,
              signal: "SIGTERM" as const,
              sent,
            },
            exit,
            close,
            terminal: parseTerminal(observed!.stdout),
          });
        })();
        return cancellation;
      },
    });

    const bodyOutcome = await beforeDeadline(
      Promise.resolve()
        .then(() => body(runner))
        .then(
          (value) => ({ kind: "value" as const, value }),
          (error: unknown) => ({ kind: "error" as const, error }),
        ),
      deadlineAt,
    );
    if (bodyOutcome.kind === "timeout") {
      throw new ReadReadyFixtureError(
        `read-ready operation exceeded ${timeoutMs} ms`,
        pid,
      );
    }
    if (bodyOutcome.value.kind === "error") throw bodyOutcome.value.error;
    bodyResult = bodyOutcome.value.value;
    bodyCompleted = true;
  } catch (error) {
    primaryFailed = true;
    primaryFailure = error;
  } finally {
    operationsClosed = true;
  }

  const cleanupFailures =
    directory === undefined
      ? []
      : observed
        ? await shutdownOwnedChild(observed, directory)
        : await (async () => {
            try {
              await rm(directory, { recursive: true });
              return [];
            } catch (error) {
              return [
                new Error(
                  `read-ready cleanup retained workspace ${directory}`,
                  { cause: error },
                ),
              ];
            }
          })();

  if (primaryFailed || cleanupFailures.length > 0) {
    throwFailures(primaryFailed, primaryFailure, cleanupFailures);
  }
  if (!bodyCompleted) {
    throw new Error("read-ready operation ended without a result");
  }
  return bodyResult as T;
}
