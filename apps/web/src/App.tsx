import { SCHEMA_VERSION } from '@climbing-coach/schema';

/**
 * Scaffold shell. Full routes (home, library, review, …) arrive in P2-A.
 * Copy is English-only for now; Lingui catalogs land with the real UI.
 */
export function App() {
  return (
    <main className="shell">
      <p className="brand">Climbing Coach</p>
      <h1>Local training companion</h1>
      <p className="lede">
        Record attempts, cut clips, and compare movement. Schema {SCHEMA_VERSION} is wired;
        Phase 0 foundations are under way.
      </p>
    </main>
  );
}
