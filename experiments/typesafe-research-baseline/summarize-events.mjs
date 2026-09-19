#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const tokenFields = ["input", "output", "cacheRead", "cacheWrite", "totalTokens"];

function textContent(message) {
  if (!Array.isArray(message.content)) {
    return typeof message.content === "string" ? message.content : "";
  }
  return message.content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("");
}

function isBrowserCommand(toolName, args) {
  if (toolName === "chrome-devtools") return true;
  if (toolName !== "bash" || typeof args?.command !== "string") return false;
  return /(^|[^A-Za-z0-9_-])chrome-devtools(?=$|[^A-Za-z0-9_-])/.test(args.command);
}

export function summarizeEvents(events) {
  const assistantMessages = events
    .filter((event) => event?.type === "message_end" && event.message?.role === "assistant")
    .map((event) => event.message);
  const identities = new Map();
  for (const message of assistantMessages) {
    if (typeof message.provider === "string" && typeof message.model === "string") {
      identities.set(`${message.provider}\u0000${message.model}`, {
        provider: message.provider,
        id: message.model,
      });
    }
  }

  let tokens = null;
  const usageAvailable = assistantMessages.length > 0 && assistantMessages.every((message) =>
    tokenFields.every((field) => Number.isFinite(message.usage?.[field])),
  );
  if (usageAvailable) {
    tokens = {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    };
    for (const message of assistantMessages) {
      tokens.input += message.usage.input;
      tokens.output += message.usage.output;
      tokens.cacheRead += message.usage.cacheRead;
      tokens.cacheWrite += message.usage.cacheWrite;
      tokens.total += message.usage.totalTokens;
    }
  }

  const toolCalls = {};
  const failedToolCalls = {};
  let browserCommands = 0;
  for (const event of events) {
    if (event?.type === "tool_execution_start" && typeof event.toolName === "string") {
      toolCalls[event.toolName] = (toolCalls[event.toolName] ?? 0) + 1;
      if (isBrowserCommand(event.toolName, event.args)) browserCommands += 1;
    }
    if (
      event?.type === "tool_execution_end" &&
      event.isError === true &&
      typeof event.toolName === "string"
    ) {
      failedToolCalls[event.toolName] = (failedToolCalls[event.toolName] ?? 0) + 1;
    }
  }

  const finalMessage = [...assistantMessages]
    .reverse()
    .find((message) => message.stopReason === "stop" || textContent(message).length > 0);
  const unavailableMeasurements = [];
  if (!usageAvailable) unavailableMeasurements.push("provider-reported main-model tokens");

  return {
    model: identities.size === 1 ? [...identities.values()][0] : null,
    mainModelTurns: assistantMessages.length,
    tokens,
    toolCalls,
    failedToolCalls,
    browserCommands: {
      observed: browserCommands,
      method: "literal chrome-devtools executable/tool matches in captured bash commands and tool calls",
    },
    finalAnswer: finalMessage ? textContent(finalMessage).trim() : "",
    unavailableMeasurements,
  };
}

export function parseEventStream(contents) {
  const events = [];
  for (const [index, line] of contents.split("\n").entries()) {
    if (line.trim() === "") continue;
    try {
      events.push(JSON.parse(line));
    } catch (error) {
      throw new Error(`Invalid JSON event on line ${index + 1}: ${error.message}`);
    }
  }
  return events;
}

async function main() {
  const [eventsPath] = process.argv.slice(2);
  if (!eventsPath) {
    console.error("Usage: node summarize-events.mjs <pi-events.jsonl>");
    process.exitCode = 2;
    return;
  }
  const events = parseEventStream(await readFile(eventsPath, "utf8"));
  process.stdout.write(`${JSON.stringify(summarizeEvents(events), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
