export type DesktopMenuHandlers = {
  openSettings: () => void;
  openImport: () => void;
};

export type MenuItemDesc = {
  role?: string;
  type?: 'separator';
  label?: string;
  accelerator?: string;
  click?: keyof DesktopMenuHandlers;
  submenu?: MenuItemDesc[];
};

/** macOS menu: app, Edit (undo/redo), Window, plus Cmd+, and Cmd+O (BUILD_PLAN P2-A.4). */
export function macMenuTemplate(): MenuItemDesc[] {
  return [
    {
      label: 'Climbing Coach',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: 'openSettings' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [{ label: 'Import…', accelerator: 'CmdOrCtrl+O', click: 'openImport' }],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    { role: 'windowMenu', label: 'Window' },
  ];
}
