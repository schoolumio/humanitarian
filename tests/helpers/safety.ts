/**
 * Guard rail: integration tests truncate tables between tests, so they must only ever run
 * against a local database whose name ends in "_test".
 */
export function assertDisposableTestDatabase(url: string | undefined) {
  if (!url) throw new Error("No test database URL configured");
  const u = new URL(url);
  const name = u.pathname.replace(/^\//, "");
  if (!["localhost", "127.0.0.1", "postgres"].includes(u.hostname) || !name.endsWith("_test")) {
    throw new Error(`Refusing to run destructive test setup against ${u.hostname}/${name}. Use a local *_test database.`);
  }
}
