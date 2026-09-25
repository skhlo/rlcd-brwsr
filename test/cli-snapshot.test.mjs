import assert from "node:assert/strict";
import { test } from "node:test";

import { TextSnapshot } from "chrome-devtools-mcp/build/src/TextSnapshot.js";
import { SnapshotFormatter } from "chrome-devtools-mcp/build/src/formatters/SnapshotFormatter.js";

test("pinned CLI snapshot preserves hierarchy and scoped IDs on a selected page shape", async () => {
  const page = {
    pptrPage: {
      accessibility: {
        async snapshot(options) {
          assert.deepEqual(options, {
            includeIframes: true,
            interestingOnly: true,
          });
          return {
            role: "WebArea",
            name: "Task",
            loaderId: "top-loader",
            backendNodeId: 1,
            children: [
              {
                role: "heading",
                name: "History details",
                loaderId: "top-loader",
                backendNodeId: 2,
                children: [],
              },
              {
                role: "iframe",
                name: "Task frame",
                loaderId: "frame-loader",
                backendNodeId: 3,
                children: [
                  {
                    role: "button",
                    name: "Continue",
                    loaderId: "frame-loader",
                    backendNodeId: 4,
                    children: [],
                  },
                ],
              },
            ],
          };
        },
      },
    },
    uniqueBackendNodeIdToMcpId: new Map(),
    extraHandles: [],
  };
  const snapshot = await TextSnapshot.create(page, { devtoolsData: {} });
  const formatted = new SnapshotFormatter(snapshot).toString();
  assert.match(formatted, /heading "History details"/);
  assert.match(formatted, /iframe "Task frame"/);
  assert.match(formatted, /button "Continue"/);
  assert.equal(snapshot.idToNode.size, 4);
  assert.ok(
    [...snapshot.idToNode.values()].some(
      (node) => node.loaderId === "frame-loader" && node.role === "button",
    ),
  );
});
