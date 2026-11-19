import { describe, it, expect, vi, afterEach } from 'vitest';
import { normalizeApiBase } from '../utils/apiBase';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

describe('API base configuration', () => {
  it.each([
    ['', ''],
    ['https://backend.example', 'https://backend.example'],
    ['https://backend.example/', 'https://backend.example'],
    ['https://backend.example/api', 'https://backend.example'],
    ['https://backend.example/api/', 'https://backend.example'],
    ['https://backend.example/api/v1/', 'https://backend.example'],
    ['/api', ''],
    ['/api/v1', ''],
    ['https://backend.example/service/api', 'https://backend.example/service'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeApiBase(input)).toBe(expected);
  });
  it('signup does not duplicate /api when VITE_API_URL ends with /api', async () => {
    vi.stubEnv('VITE_API_URL', 'https://backend.example/api');
    vi.resetModules();
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ success: true, requiresVerification: true }) });
    vi.stubGlobal('fetch', fetch);
    const { api } = await import('../utils/api');
    await api.post('/api/auth/register', { email: 'local-test@example.com' });
    expect(fetch.mock.calls[0][0]).toBe('https://backend.example/api/auth/register');
    expect(fetch.mock.calls[0][1].credentials).toBe('include');
  });
  it('silent refresh uses the same normalized base', async () => {
    vi.stubEnv('VITE_API_URL', 'https://backend.example/api/v1/');
    vi.resetModules();
    const fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true }) });
    vi.stubGlobal('fetch', fetch);
    const { api } = await import('../utils/api');
    await api.get('/api/gigs');
    expect(fetch.mock.calls.map(call => call[0])).toEqual([
      'https://backend.example/api/gigs',
      'https://backend.example/api/auth/refresh',
      'https://backend.example/api/gigs'
    ]);
  });
});
