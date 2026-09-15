/**
 * Root application component.
 *
 * S1 scaffold: renders a placeholder shell only. Application logic arrives
 * from S8 onward.
 */
export function App() {
  return (
    <main class="app-shell" data-testid="app-shell">
      {/* TODO(S2): route both strings through t() once src/i18n/ exists. */}
      <h1 class="app-shell__title">Claude3PCost</h1>
      <p class="app-shell__version">Version {__APP_VERSION__}</p>
    </main>
  );
}
