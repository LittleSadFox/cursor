import { describe, expect, it } from 'vitest';

import { macMenuTemplate } from './menu.js';

describe('macMenuTemplate', () => {
  it('includes settings, import, undo/redo, and Window', () => {
    const template = macMenuTemplate();
    const labels = JSON.stringify(template);
    expect(labels).toContain('Settings…');
    expect(labels).toContain('CmdOrCtrl+,');
    expect(labels).toContain('Import…');
    expect(labels).toContain('CmdOrCtrl+O');
    expect(labels).toContain('"role":"undo"');
    expect(labels).toContain('"role":"windowMenu"');
  });
});
