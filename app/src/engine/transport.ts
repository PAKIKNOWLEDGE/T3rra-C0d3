/**
 * The byte channel to the engine, browser side.
 *
 * The dev implementation talks HTTP + SSE to `app/plugins/engine-bridge.ts`; the Tauri shell
 * will replace it with an ipc channel. Either way this module only moves lines: it never
 * parses ACP, never learns what a `sessionUpdate` is, and never decides anything.
 *
 * That separation is rule 4 (rules-inherited §一): the shell moves bytes, the TS contract
 * decides what they mean.
 */

export interface TransportProbe {
  readonly binary: string | null;
  readonly cwd: string | null;
}

export interface Transport {
  probe(): Promise<TransportProbe>;
  spawn(): Promise<void>;
  write(line: string): Promise<void>;
  kill(): Promise<void>;
  /** Called for every complete line the engine writes. */
  onLine(handler: (line: string) => void): void;
  onExit(handler: (info: { code: number | null; signal: string | null }) => void): void;
  onError(handler: (message: string) => void): void;
  dispose(): void;
}

const PREFIX = "/__t3";

export const createBridgeTransport = (clientId: string): Transport => {
  const query = `client=${encodeURIComponent(clientId)}`;
  const lineHandlers: ((line: string) => void)[] = [];
  const exitHandlers: ((info: { code: number | null; signal: string | null }) => void)[] = [];
  const errorHandlers: ((message: string) => void)[] = [];
  let stream: EventSource | undefined;

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
  };

  return {
    async probe(): Promise<TransportProbe> {
      const response = await fetch(`${PREFIX}/probe?${query}`);
      return (await response.json()) as TransportProbe;
    },
    async spawn(): Promise<void> {
      openStream();
      await post("/spawn", {});
    },
    async write(line: string): Promise<void> {
      // The bridge supplies the frame terminator, exactly as a byte-blind shell would.
      await post("/write", { line });
    },
    async kill(): Promise<void> {
      await post("/kill", {});
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
    dispose(): void {
      stream?.close();
      stream = undefined;
    },
  };
};