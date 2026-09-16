import { render } from "preact";
import { App } from "./app";
import "./styles/index.css";

render(<App />, document.getElementById("app")!);

// Dev-only scaffolding (S6). Deleted by S8, which replaces it with
// `state/app-state.ts` and the first screen. Logs counts and one integer —
// never a project name, a session id or a path (NFR-6). Not the exit proof
// for this session — see src/services/reference-fs.test.ts for that.
if (import.meta.env.DEV) {
  void (async () => {
    const { createFileSystem } = await import("./services/filesystem.js");
    const { discover } = await import("./services/discovery.js");
    const { scanDiscovery } = await import("./services/scan.js");
    const fs = await createFileSystem();
    const discovery = await discover(fs);
    console.log(
      `[claude3pcost] roots=${discovery.roots.length} sessions=${discovery.sessions.length}`,
    );
    const report = await scanDiscovery(fs, discovery);
    console.log(
      `[claude3pcost] requests=${report.totals.requests} costMicroUsd=${report.totals.costMicroUsd}`,
    );
  })();
}
