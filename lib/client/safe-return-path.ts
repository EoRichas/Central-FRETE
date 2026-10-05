export function safeReturnPath(value: string | null, origin: string): string | null {
  if (!value?.startsWith('/') || /[\\\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value, origin);
    return url.origin === origin ? `${url.pathname}${url.search}${url.hash}` : null;
  } catch { return null; }
}
