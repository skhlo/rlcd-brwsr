import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const port = Number.parseInt(process.env.RLCD_FIXTURE_PORT ?? "43113", 10);
if (!Number.isInteger(port) || port < 0 || port > 65_535) {
  throw new Error("RLCD_FIXTURE_PORT must be an integer from 0 through 65535");
}
const routes = new Map([
  ["/", join(directory, "index.html")],
  ["/index.html", join(directory, "index.html")],
  ["/destination.html", join(directory, "destination.html")],
  ["/text-entry.html", join(directory, "..", "text-entry", "index.html")],
]);

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  const filePath = routes.get(pathname);
  if (!filePath) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found\n");
    return;
  }
  try {
    const body = await readFile(filePath);
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

server.listen(port, "127.0.0.1", () => {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Fixture did not bind a TCP port");
  }
  console.log(
    JSON.stringify({
      pid: process.pid,
      origin: `http://127.0.0.1:${address.port}`,
    }),
  );
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
