import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute';
import * as AuthContextModule from '../context/AuthContext';

describe('ProtectedRoute component', () => {
  it('displays loading screen when loading is true', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: null,
      loading: true
    });

    render(
      <MemoryRouter>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('redirects unauthenticated user to /login', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: null,
      loading: false
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Protected Content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('redirects user with role mismatch to their workspace dashboard', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { _id: 'u1', role: 'client', isEmailVerified: true },
      loading: false
    });

    render(
      <MemoryRouter initialEntries={['/freelancer/jobs']}>
        <Routes>
          <Route
            path="/freelancer/jobs"
            element={
              <ProtectedRoute role="freelancer">
                <div>Freelancer Job Board</div>
              </ProtectedRoute>
            }
          />
          <Route path="/client/dashboard" element={<div>Client Dashboard</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Client Dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Freelancer Job Board')).not.toBeInTheDocument();
  });

  it('renders children when authenticated with matching role', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { _id: 'u2', role: 'freelancer', isEmailVerified: true },
      loading: false
    });

    render(
      <MemoryRouter initialEntries={['/freelancer/jobs']}>
        <ProtectedRoute role="freelancer">
          <div>Freelancer Job Board</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText('Freelancer Job Board')).toBeInTheDocument();
  });
});

it('redirects an unverified authenticated account to email verification', () => {
  vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({ user: { _id: 'pending', role: 'client', email: 'local@example.com', isEmailVerified: false }, loading: false });
  render(<MemoryRouter initialEntries={['/dashboard']}><Routes>
    <Route path="/dashboard" element={<ProtectedRoute><div>Private dashboard</div></ProtectedRoute>} />
    <Route path="/check-email" element={<div>Verify Email Page</div>} />
  </Routes></MemoryRouter>);
  expect(screen.getByText('Verify Email Page')).toBeInTheDocument();
  expect(screen.queryByText('Private dashboard')).not.toBeInTheDocument();
});
