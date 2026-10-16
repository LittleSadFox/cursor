/**
 * Electron main process (P2-A.4).
 * Packaged renderer is served from `app://-`. The Fastify API still binds to
 * 127.0.0.1. Linux CI tests protocol.ts and menu.ts without launching Electron.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { macMenuTemplate, type DesktopMenuHandlers } from './menu.js';
import { APP_ORIGIN, APP_PROTOCOL, resolveAppRequest } from './protocol.js';

const here = dirname(fileURLToPath(import.meta.url));

export type ElectronLike = {
  app: { whenReady: () => Promise<void> };
  BrowserWindow: new (opts: Record<string, unknown>) => {
    loadURL: (url: string) => Promise<void>;
    webContents: { send: (channel: string, ...args: unknown[]) => void };
  };
  Menu: { buildFromTemplate: (t: unknown) => unknown; setApplicationMenu: (m: unknown) => void };
  protocol: {
    registerSchemesAsPrivileged?: (s: unknown) => void;
    handle: (
      scheme: string,
      handler: (req: { url: string }) => Promise<Response> | Response,
    ) => void;
  };
};

export async function startDesktop(electron: ElectronLike, rendererRoot: string): Promise<void> {
  electron.protocol.registerSchemesAsPrivileged?.([
    {
      scheme: APP_PROTOCOL,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
    },
  ]);
  await electron.app.whenReady();
  electron.protocol.handle(APP_PROTOCOL, async (request) => {
    const filePath = resolveAppRequest(request.url, rendererRoot);
    if (!filePath) return new Response('Not found', { status: 404 });
    const { pathToFileURL } = await import('node:url');
    return fetch(pathToFileURL(filePath));
  });

  // Per-launch secret shared with the server; the preload hands it to the renderer (P2-D).
  const token = process.env.COACH_TOKEN || randomBytes(32).toString('hex');
  process.env.COACH_TOKEN = token;
  const port = process.env.PORT ?? '8787';
  spawn(process.execPath, [join(here, '../../server/dist/main.js')], {
    env: { ...process.env, COACH_TOKEN: token, PORT: port },
    stdio: 'inherit',
  });

  const windowRef: { current?: InstanceType<ElectronLike['BrowserWindow']> } = {};
  const handlers: DesktopMenuHandlers = {
    openSettings: () => windowRef.current?.webContents.send('navigate', '/settings'),
    openImport: () => windowRef.current?.webContents.send('navigate', '/recordings'),
  };
  electron.Menu.setApplicationMenu(
    electron.Menu.buildFromTemplate(macMenuTemplate().map((item) => bindClicks(item, handlers))),
  );

  const win = new electron.BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: join(here, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  windowRef.current = win;
  await win.loadURL(`${APP_ORIGIN}/index.html`);
}

function bindClicks(
  item: ReturnType<typeof macMenuTemplate>[number],
  handlers: DesktopMenuHandlers,
): Record<string, unknown> {
  return {
    ...item,
    ...(item.click
      ? {
          click: () => {
            const name = item.click;
            if (name) handlers[name]();
          },
        }
      : {}),
    ...(item.submenu ? { submenu: item.submenu.map((child) => bindClicks(child, handlers)) } : {}),
  };
}
