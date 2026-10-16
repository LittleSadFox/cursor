import { describe, expect, it } from 'vitest';

import { APP_ORIGIN, isAppOrigin, resolveAppRequest } from './protocol.js';

describe('app:// protocol', () => {
  it('serves index.html from the renderer root', () => {
    expect(resolveAppRequest('app://-/index.html', '/app/renderer')).toBe(
      '/app/renderer/index.html',
    );
    expect(resolveAppRequest('app://-/', '/app/renderer')).toBe('/app/renderer/index.html');
  });

  it('never resolves a path outside the renderer root', () => {
    const root = '/app/renderer';
    for (const url of [
      'app://-/../../etc/passwd',
      'app://-/foo/../../bar.js',
      'app://-/index.html',
    ]) {
      const resolved = resolveAppRequest(url, root);
      expect(resolved === null || resolved === root || resolved.startsWith(`${root}/`)).toBe(true);
    }
    expect(resolveAppRequest('https://example.com/x', root)).toBeNull();
  });

  it('identifies the packaged origin', () => {
    expect(isAppOrigin(APP_ORIGIN)).toBe(true);
    expect(isAppOrigin('http://localhost:5173')).toBe(false);
  });
});
