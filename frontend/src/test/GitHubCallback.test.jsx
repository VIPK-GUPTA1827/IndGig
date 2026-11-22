import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GitHubCallback from '../pages/auth/GitHubCallback';
import { AuthProvider } from '../context/AuthContext';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('GitHubCallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('shows error when state does not match sessionStorage state (CSRF guard)', async () => {
    sessionStorage.setItem('oauth_state', 'valid-csrf-token');

    render(
      <MemoryRouter initialEntries={['/auth/github/callback?code=mock_code&state=different_state']}>
        <AuthProvider>
          <GitHubCallback />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('GitHub Login Failed')).toBeInTheDocument();
      expect(screen.getByText('Login expired. Please start GitHub login again.')).toBeInTheDocument();
    });
  });

  it('shows error when state or code is missing', async () => {
    render(
      <MemoryRouter initialEntries={['/auth/github/callback']}>
        <AuthProvider>
          <GitHubCallback />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('GitHub Login Failed')).toBeInTheDocument();
      expect(screen.getByText('Login expired. Please start GitHub login again.')).toBeInTheDocument();
    });
  });
});
