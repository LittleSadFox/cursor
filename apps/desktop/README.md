# Desktop (Electron, macOS arm64)

P2-A.4: custom `app://-` protocol, macOS menu (app / Edit with undo·redo / Window),
Cmd+, settings and Cmd+O import. Protocol mapping and the menu template are unit-tested
without launching Electron (Linux CI).

P2-D packaging, signing, notarization, Photos import, and a shipped ffmpeg build are
still blocked on ADR-002 and a Mac.

To run the shell on a Mac once Electron is installed:

```bash
pnpm --filter @climbing-coach/server build
pnpm --filter @climbing-coach/web build
pnpm --filter @climbing-coach/desktop build
npx electron apps/desktop/dist/main.js
```

The shell generates a per-launch token, passes it to the server in `COACH_TOKEN`, and (P2-D)
hands it to the renderer through the preload bridge.
