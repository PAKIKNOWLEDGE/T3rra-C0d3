/**
 * The byte channel to the engine, browser side.
 *
 * The dev implementation talks HTTP + SSE to `app/plugins/engine-bridge.ts`; the Tauri shell
 * will replace it with an ipc channel. Either way this module only moves lines/bytes: it never
 * parses ACP, never learns what a `sessionUpdate` is, and never decides anything.
 *
 * That separation is rule 4 (rules §一): the shell moves bytes, the TS contract
 * decides what they mean. `http()` is a generic request tunnel — path construction lives in
 * `engine-http.ts`.
 */

export interface TransportProbe {
  readonly binary: string | null;
  readonly cwd: string | null;
}

export interface TransportHttpResult {
  readonly status: number;
  readonly text: string;
}

export interface Transport {
  probe(): Promise<TransportProbe>;
  spawn(cwd?: string): Promise<void>;
  chooseFolder(): Promise<string | undefined>;
  projectConfig(method: "GET" | "PATCH", cwd: string, config?: unknown): Promise<TransportHttpResult>;
  write(line: string): Promise<void>;
  kill(): Promise<void>;
  /** Generic HTTP tunnel to the engine REST face (via the bridge's `opencode serve`). */
  http(method: string, path: string, body?: unknown): Promise<TransportHttpResult>;
  /** Called for every complete line the engine writes. */
  onLine(handler: (line: string) => void): void;
  onExit(handler: (info: { code: number | null; signal: string | null }) => void): void;
  onError(handler: (message: string) => void): void;
  /** The byte channel itself dropped (bridge restart, page left, dev server gone). */
  onLinkDown(handler: (reason: string) => void): void;
  dispose(): void;
}

const PREFIX = "/__t3";
const CHOOSE_FOLDER_TIMEOUT_MS = 65_000;

export const createBridgeTransport = (clientId: string): Transport => {
  const query = `client=${encodeURIComponent(clientId)}`;
  const lineHandlers: ((line: string) => void)[] = [];
  const exitHandlers: ((info: { code: number | null; signal: string | null }) => void)[] = [];
  const errorHandlers: ((message: string) => void)[] = [];
  const linkDownHandlers: ((reason: string) => void)[] = [];
  let stream: EventSource | undefined;
  /** Whether the channel was up the last time we looked, so a flap reports once per transition. */
  let linkUp = false;

  const post = async (path: string, body: unknown): Promise<void> => {
    const response = await fetch(`${PREFIX}${path}?${query}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`${path} failed: ${response.status} ${detail.slice(0, 200)}`);
    }
  };

  const openStream = (): void => {
    if (stream !== undefined) return;
    stream = new EventSource(`${PREFIX}/events?${query}`);
    stream.addEventListener("line", (event) => {
      const data = (event as MessageEvent<string>).data;
      if (data !== "") for (const handler of lineHandlers) handler(data);
    });
    stream.addEventListener("exit", (event) => {
      const info = JSON.parse((event as MessageEvent<string>).data) as { code: number | null; signal: string | null };
      for (const handler of exitHandlers) handler(info);
    });
    stream.addEventListener("engine-error", (event) => {
      const info = JSON.parse((event as MessageEvent<string>).data) as { message?: string };
      for (const handler of errorHandlers) handler(info.message ?? "engine error");
    });
    // Without this the UI kept asserting LINK OK over a dead channel (audit F7). EventSource
    // reconnects by itself, so "down" is a *transition* here, not a permanent state: `open`
    // clears it when the pipe comes back.
    stream.addEventListener("error", () => {
      if (linkUp) {
        linkUp = false;
        for (const handler of linkDownHandlers) handler(`stream ${stream?.readyState === 0 ? "closed" : "reconnecting"}`);
      }
    });
    stream.addEventListener("open", () => {
      linkUp = true;
    });
  };

  return {
    async probe(): Promise<TransportProbe> {
      const response = await fetch(`${PREFIX}/probe?${query}`);
      return (await response.json()) as TransportProbe;
    },
    async spawn(cwd?: string): Promise<void> {
      openStream();
      await post("/spawn", cwd === undefined ? {} : { cwd });
    },
    async chooseFolder(): Promise<string | undefined> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), CHOOSE_FOLDER_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(`${PREFIX}/choose-folder?${query}`, { method: "POST", signal: controller.signal });
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") throw new Error("folder picker timed out");
        throw error;
      } finally {
        clearTimeout(timeout);
      }
      const text = await response.text().catch(() => "");
      if (!response.ok) throw new Error(`/choose-folder failed: ${response.status} ${text.slice(0, 200)}`);
      try {
        const payload = JSON.parse(text) as { path?: unknown };
        return typeof payload.path === "string" && payload.path !== "" ? payload.path : undefined;
      } catch {
        throw new Error("/choose-folder returned invalid JSON");
      }
    },
    async projectConfig(method: "GET" | "PATCH", cwd: string, config?: unknown): Promise<TransportHttpResult> {
      const response = await fetch(`${PREFIX}/project-config?${query}&cwd=${encodeURIComponent(cwd)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, config: config ?? null }),
      });
      const text = await response.text().catch(() => "");
      return { status: response.status, text };
    },
    async write(line: string): Promise<void> {
      // The bridge supplies the frame terminator, exactly as a byte-blind shell would.
      await post("/write", { line });
    },
    async kill(): Promise<void> {
      await post("/kill", {});
    },
    async http(method: string, path: string, body?: unknown): Promise<TransportHttpResult> {
      const response = await fetch(`${PREFIX}/http?${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, path, body: body ?? null }),
      });
      const text = await response.text().catch(() => "");
      return { status: response.status, text };
    },
    onLine(handler): void {
      lineHandlers.push(handler);
    },
    onExit(handler): void {
      exitHandlers.push(handler);
    },
    onError(handler): void {
      errorHandlers.push(handler);
    },
    onLinkDown(handler): void {
      linkDownHandlers.push(handler);
    },
    dispose(): void {
      stream?.close();
      stream = undefined;
    },
  };
};
