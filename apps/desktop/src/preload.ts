/**
 * Preload runs in a sandboxed renderer. It only exposes { port, token }
 * through contextBridge once Electron is present (P2-A.4).
 */
export type DesktopBridge = {
  port: number;
  token: string;
};

declare const process: { env: Record<string, string | undefined> };

export function desktopBridgeFromEnv(): DesktopBridge {
  return {
    port: Number(process.env.PORT ?? 8787),
    token: process.env.COACH_TOKEN ?? 'dev-token',
  };
}
