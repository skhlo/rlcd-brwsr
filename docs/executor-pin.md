# Chrome DevTools CLI pin

RLCD-brwsr's first executor target is `chrome-devtools` from
[`ChromeDevTools/chrome-devtools-mcp`](https://github.com/ChromeDevTools/chrome-devtools-mcp).

Verified on 2026-09-19:

- npm package: `chrome-devtools-mcp@1.7.0`
- npm registry `gitHead`: `774d78f5eef5e610407a0c92fa6ec5ed74b027e8`
- npm integrity: `sha512-6xFW7oiUxTxZuHcfyYBkKQtmttjCbfifKZMSEk5CV8H2FucvKweYiJr8CblddYHtYjA4C14K9VAs1r49906RBA==`
- upstream commit: [`774d78f5eef5e610407a0c92fa6ec5ed74b027e8`](https://github.com/ChromeDevTools/chrome-devtools-mcp/commit/774d78f5eef5e610407a0c92fa6ec5ed74b027e8), whose commit message releases 1.7.0
- upstream tree: `1f916def4313c991efbf95c5da8fd9b6976d5f32`

The installed package manifest reports version 1.7.0 but has no `gitHead`. The commit pin above comes
from npm's registry metadata and was independently resolved through GitHub's commit API; it is not
inferred from that local manifest.

The 1.7.0 CLI contract observed for this slice is asymmetric:

- a successful JSON snapshot is an object with a structured `snapshot` tree; its root normally has
  `role: "RootWebArea"`, a URL, and a title in `name`, and node `id` values are action UIDs;
- a tool-level JSON error is an array of text records and can still leave the CLI process with exit
  code 0.

RLCD-brwsr therefore validates the process result, checks `killed` independently of the exit code,
parses stdout as `unknown`, and accepts only a valid structured snapshot as success.
