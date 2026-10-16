export const DEV_TOKEN = 'dev-token';
export const APP_ORIGIN = 'app://-';
export const VITE_ORIGINS = ['http://127.0.0.1:5173', 'http://localhost:5173'] as const;

export type LaunchEnv = Readonly<Record<string, string | undefined>>;

export type LaunchConfig = {
  dev: boolean;
  port: number;
  token: string;
  /** How the token was chosen; the value itself is never logged. */
  tokenSource: 'env' | 'dev' | 'random';
  mediaSecret: string;
  allowedOrigins: string[];
};

/**
 * Per-launch secrets and origins (BUILD_PLAN §3.6 Security). The fixed `dev-token` and the Vite
 * origins exist only when `COACH_DEV=1`; otherwise the token is random unless the launcher
 * (the desktop shell) passes one in `COACH_TOKEN`.
 */
export function launchConfig(env: LaunchEnv, randomHex: (bytes: number) => string): LaunchConfig {
  const dev = env.COACH_DEV === '1';
  const envToken = env.COACH_TOKEN?.trim();
  const tokenSource = envToken ? 'env' : dev ? 'dev' : 'random';
  const token = envToken || (dev ? DEV_TOKEN : randomHex(32));
  const devOrigins = dev
    ? [...VITE_ORIGINS, ...(env.COACH_DEV_ORIGIN ? [env.COACH_DEV_ORIGIN] : [])]
    : [];
  return {
    dev,
    port: parsePort(env.PORT),
    token,
    tokenSource,
    mediaSecret: env.COACH_MEDIA_SECRET || randomHex(32),
    allowedOrigins: [APP_ORIGIN, ...devOrigins],
  };
}

/**
 * `COACH_LIBRARY` (dev/tests) wins, then the location saved in Settings (kept in the per-user
 * config dir, since the library cannot record its own whereabouts), then the platform default.
 */
export function resolveLibraryRoot(
  env: LaunchEnv,
  savedPointer: string | null,
  fallback: string,
): string {
  return env.COACH_LIBRARY || savedPointer || fallback;
}

function parsePort(value: string | undefined): number {
  if (value === undefined || value === '') return 8787;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535)
    throw new RangeError(`invalid PORT ${value}`);
  return port;
}
