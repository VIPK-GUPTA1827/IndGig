import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PublicProfile from '../pages/PublicProfile';
import { AuthProvider } from '../context/AuthContext';
import api from '../utils/api';

vi.mock('../utils/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  }
}));

describe('PublicProfile API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls /api/auth/me when route is /profile/me or no id provided', async () => {
    api.get.mockResolvedValue({
      success: true,
      data: {
        _id: 'user123',
        name: 'Vipin Gupta',
        role: 'freelancer',
        bio: 'Full Stack Engineer',
        skills: ['React', 'Node.js']
      }
    });

    render(
      <MemoryRouter initialEntries={['/profile/me']}>
        <AuthProvider>
          <Routes>
            <Route path="/profile/:id" element={<PublicProfile />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Vipin Gupta')).toBeInTheDocument();
    });

    expect(api.get).toHaveBeenCalledWith('/api/auth/me');
  });

  it('calls /api/auth/user/:id with proper encoding for third-party user profiles', async () => {
    api.get.mockResolvedValue({
      success: true,
      data: {
        _id: 'user456',
        name: 'John Doe',
        role: 'freelancer',
        bio: 'UI/UX Designer',
        skills: ['Figma']
      }
    });

    render(
      <MemoryRouter initialEntries={['/profile/user456']}>
        <AuthProvider>
          <Routes>
            <Route path="/profile/:id" element={<PublicProfile />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    expect(api.get).toHaveBeenCalledWith('/api/auth/user/user456');
  });
});
