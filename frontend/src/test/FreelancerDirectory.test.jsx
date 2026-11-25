import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import FreelancerDirectory from '../pages/FreelancerDirectory';
import { AuthProvider } from '../context/AuthContext';
import { ToastProvider } from '../context/ToastContext';
import api from '../utils/api';

vi.mock('../utils/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  }
}));

describe('FreelancerDirectory Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches and renders public freelancer cards', async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/api/auth/me')) return Promise.reject({ status: 401 });
      return Promise.resolve({
        success: true,
        totalCount: 1,
        totalPages: 1,
        page: 1,
        data: [
          {
            _id: 'dev1',
            name: 'Aarav Sharma',
            headline: 'Full Stack React Developer',
            hourlyRate: 1200,
            workPreference: 'remote',
            weeklyCapacity: '30+ hrs/week',
            availabilityStatus: 'available',
            verificationBadge: true,
            skills: [{ name: 'React' }, { name: 'Node.js' }]
          }
        ]
      });
    });

    render(
      <MemoryRouter initialEntries={['/freelancers']}>
        <AuthProvider>
          <ToastProvider>
            <Routes>
              <Route path="/freelancers" element={<FreelancerDirectory />} />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Aarav Sharma')).toBeInTheDocument();
      expect(screen.getByText('Full Stack React Developer')).toBeInTheDocument();
      expect(screen.getAllByText('Available now').length).toBeGreaterThanOrEqual(2);
      expect(screen.getByRole('link', { name: /view profile/i })).toHaveAttribute('href', '/profile/dev1');
    });
  });

  it('shows empty state and clear filters button when no developers match', async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/api/auth/me')) return Promise.reject({ status: 401 });
      return Promise.resolve({ success: true, totalCount: 0, totalPages: 1, page: 1, data: [] });
    });

    render(
      <MemoryRouter initialEntries={['/freelancers?search=rust']}>
        <AuthProvider>
          <ToastProvider>
            <Routes>
              <Route path="/freelancers" element={<FreelancerDirectory />} />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('No matching developers found')).toBeInTheDocument();
    });

    const clearBtn = screen.getByRole('button', { name: /clear filters/i });
    fireEvent.click(clearBtn);
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/freelancers?limit=12&page=1');
    });
  });
});
