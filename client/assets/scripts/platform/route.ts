export type AppRoute = 'home' | 'stack' | 'pack' | 'mom' | 'level';

/** Maps a URL query string to the page shell, without touching browser globals. */
export function resolveRoute(search: string): AppRoute {
  const params = new URLSearchParams(search);
  const mode = params.get('mode');
  if (mode === 'mom') return 'mom';
  if (mode === 'stack') return 'stack';
  if (mode === 'pack') return 'pack';
  if (params.has('level')) return 'level';
  return 'home';
}
