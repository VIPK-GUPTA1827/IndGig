/**
 * Sanitizes external URLs to prevent javascript: and data: protocol XSS attacks.
 * Strictly permits only http:// and https:// URLs.
 * If a protocol-less domain like "github.com/user" is passed, prepends "https://".
 */
export function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return '#';
  const trimmed = url.trim();
  if (trimmed === '' || trimmed === '#') return '#';

  // Check for safe http/https protocol
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  // If starts with letters followed by a colon (e.g. javascript:, data:, vbscript:) reject
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/i.test(trimmed)) {
    return '#';
  }

  // Prepend https:// for common web domain formats (e.g. "github.com/vipin")
  if (/^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(\/.*)?$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }

  return '#';
}
