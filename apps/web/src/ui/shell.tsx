import { useLingui } from '@lingui/react';
import { Link, Outlet } from '@tanstack/react-router';

const NAV = [
  { to: '/', label: 'nav.home' },
  { to: '/library', label: 'nav.library' },
  { to: '/recordings', label: 'nav.recordings' },
  { to: '/trash', label: 'nav.trash' },
  { to: '/settings', label: 'nav.settings' },
] as const;

export function Shell() {
  const { i18n } = useLingui();
  return (
    <div className="app">
      <header className="topbar">
        <p className="brand">{i18n._('app.name')}</p>
        <nav>
          {NAV.map((item) => (
            <Link key={item.to} to={item.to} className="nav-link">
              {i18n._(item.label)}
            </Link>
          ))}
        </nav>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
