// Call sites already include /api. Accept a host, /api or /api/v1 config
// without producing /api/api. Preserve any deployment subpath before /api.
export function normalizeApiBase(value = '') {
  return String(value).trim().replace(/\/+$/, '').replace(/\/api(?:\/v1)?$/i, '');
}

export const API_BASE = normalizeApiBase(import.meta.env.VITE_API_URL || '');
