/**
 * Wandelt einen absoluten Dateipfad in eine media://-URL für <video>/<img>-Tags.
 * Der Main-Prozess bedient das media://-Protokoll und streamt die Datei.
 *
 * Niemals `file://` direkt im Renderer verwenden — Electron blockt das.
 */
export function mediaUrl(absolutePath: string | undefined | null): string | undefined {
  if (!absolutePath) return undefined;

  // Windows-Backslashes → Forward-Slashes für URL-Pfad
  const normalized = absolutePath.replace(/\\/g, '/');
  const withLeading = normalized.startsWith('/') ? normalized : '/' + normalized;

  // encodeURI behält Slashes, kodiert nur Spaces & Sonderzeichen
  return `media://local${encodeURI(withLeading)}`;
}
