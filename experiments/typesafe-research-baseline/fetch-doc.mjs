#!/usr/bin/env node

import { createHash } from "node:crypto";
import { appendFile } from "node:fs/promises";

const maximumRedirects = 5;
const defaultAllowedOrigin = "https://docs.typesafe.ai";

function allowedOrigin() {
  return process.env.BASELINE_ALLOW_ORIGIN || defaultAllowedOrigin;
}

function checkedUrl(value) {
  const url = new URL(value);
  if (url.origin !== allowedOrigin()) {
    throw new Error(`Only ${allowedOrigin()} may be fetched in this trial`);
  }
  if (url.protocol !== "https:" && process.env.BASELINE_ALLOW_ORIGIN === undefined) {
    throw new Error("Trial documentation fetches must use HTTPS");
  }
  return url;
}

async function record(entry) {
  const logPath = process.env.BASELINE_HTTP_LOG;
  if (!logPath) throw new Error("BASELINE_HTTP_LOG is required");
  await appendFile(logPath, `${JSON.stringify(entry)}\n`, { encoding: "utf8", mode: 0o600 });
}

async function fetchOnce(url) {
  const startedAt = new Date().toISOString();
  let response;
  try {
    response = await fetch(url, {
      redirect: "manual",
      headers: {
        accept: "text/markdown,text/plain;q=0.9,*/*;q=0.1",
        "user-agent": "rlcd-brwsr-research-baseline/1",
      },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    await record({
      phase: process.env.BASELINE_PHASE ?? "unknown",
      url: url.href,
      startedAt,
      completedAt: new Date().toISOString(),
      status: null,
      bytes: null,
      sha256: null,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  await record({
    phase: process.env.BASELINE_PHASE ?? "unknown",
    url: url.href,
    startedAt,
    completedAt: new Date().toISOString(),
    status: response.status,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    location: response.headers.get("location"),
  });
  return { response, bytes };
}

async function main() {
  const [urlArgument, ...extraArguments] = process.argv.slice(2);
  if (!urlArgument || extraArguments.length > 0) {
    console.error("Usage: node fetch-doc.mjs <url>");
    process.exitCode = 2;
    return;
  }

  let currentUrl = checkedUrl(urlArgument);
  for (let redirectCount = 0; redirectCount <= maximumRedirects; redirectCount += 1) {
    const { response, bytes } = await fetchOnce(currentUrl);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error(`HTTP ${response.status} did not include a Location header`);
      if (redirectCount === maximumRedirects) throw new Error("Too many documentation redirects");
      currentUrl = checkedUrl(new URL(location, currentUrl).href);
      continue;
    }
    if (!response.ok) throw new Error(`Documentation fetch failed with HTTP ${response.status}`);
    process.stdout.write(bytes);
    return;
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
