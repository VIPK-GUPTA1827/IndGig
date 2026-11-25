import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SavedSearches from '../pages/SavedSearches';
import { AuthProvider } from '../context/AuthContext';
import api from '../utils/api';

vi.mock('../utils/api', () => ({
  default: {
    get: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  }
}));

describe('SavedSearches Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders saved searches and supports pause/delete', async () => {
    const initial = [
      {
        _id: 's1',
        name: 'React Remote',
        type: 'projects',
        frequency: 'instant',
        enabled: true,
        filters: { search: 'react', minBudget: 20000 }
      }
    ];
    api.get.mockImplementation((url) => {
      if (url.startsWith('/api/auth/me')) return Promise.resolve({ success: true, user: { _id: 'u1', role: 'freelancer' } });
      return Promise.resolve({ success: true, data: initial });
    });
    api.patch.mockResolvedValue({ success: true, data: { ...initial[0], enabled: false } });
    api.delete.mockResolvedValue({ success: true });

    render(
      <MemoryRouter>
        <AuthProvider>
          <SavedSearches />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('React Remote')).toBeInTheDocument();
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await waitFor(() => {
      expect(screen.getByText('Paused')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Delete React Remote' }));
    await waitFor(() => {
      expect(screen.getByText('No saved searches yet')).toBeInTheDocument();
    });
  });
});
