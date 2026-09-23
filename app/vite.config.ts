import { defineConfig } from "vite";
import { engineBridge } from "./plugins/engine-bridge.ts";

/**
 * The dev server hosts the renderer and doubles as the byte pipe to the engine
 * (`plugins/engine-bridge.ts`). `root` is this app folder so the workspace root stays
 * a workspace root: docs, spikes and traces are not part of the served tree.
 */
export default defineConfig({
  root: "app",
  server: { port: 5191, strictPort: false },
  plugins: [engineBridge()],
});