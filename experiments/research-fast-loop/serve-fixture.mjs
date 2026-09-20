import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const fixtureDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixture",
);
const requestedPort = Number.parseInt(
  process.env.RLCD_FIXTURE_PORT ?? "43113",
  10,
);
if (
  !Number.isInteger(requestedPort) ||
  requestedPort < 0 ||
  requestedPort > 65_535
) {
  throw new Error("RLCD_FIXTURE_PORT must be an integer from 0 through 65535");
}

const routes = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/evidence.html", "evidence.html"],
  ["/journey.html", "journey.html"],
  ["/ambiguous-select.html", "ambiguous-select.html"],
  ["/adversarial.html", "adversarial.html"],
  ["/lifecycle.html", "lifecycle.html"],
]);

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  if (pathname === "/slow") {
    const timer = setTimeout(() => {
      response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      response.end("Slow fixture completed\n");
    }, 60_000);
    request.once("close", () => clearTimeout(timer));
    return;
  }

  const filename = routes.get(pathname);
  if (!filename) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found\n");
    return;
  }

  try {
    const body = await readFile(join(fixtureDirectory, filename));
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
    });
    response.end(body);
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end(`${error instanceof Error ? error.message : String(error)}\n`);
  }
});

server.listen(requestedPort, "127.0.0.1", () => {
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Fixture did not bind a TCP port");
  console.log(
    JSON.stringify({
      pid: process.pid,
      origin: `http://127.0.0.1:${address.port}`,
    }),
  );
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
