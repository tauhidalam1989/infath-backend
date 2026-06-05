/**
 * Reinterprets a string that may be UTF-8 bytes wrongly interpreted as Latin-1 (mojibake)
 * into proper UTF-8. Used for filenames that appear as e.g. "ØºØ±Ù Ø¨" instead of Arabic.
 * Only runs when the string contains high bytes (128–255); otherwise returns as-is.
 */
export function ensureUtf8FileName(fileName: string | null | undefined): string {
  if (fileName == null || fileName === '') return fileName ?? '';
  // If no high bytes (128–255), treat as already valid UTF-8
  if (!/[\x80-\xff]/.test(fileName)) return fileName;
  try {
    const decoded = Buffer.from(fileName, 'latin1').toString('utf8');
    // If decoding produced replacement character, original might be valid UTF-8; don't replace
    if (decoded.includes('\uFFFD')) return fileName;
    return decoded;
  } catch {
    return fileName;
  }
}
