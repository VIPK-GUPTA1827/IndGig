import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Loader2, AlertCircle } from 'lucide-react';
import api from '../../utils/api';

export default function GitHubCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { loginWithGitHub } = useAuth();
  const [error, setError] = useState('');
  const exchangedRef = useRef(false);

  useEffect(() => {
    const code = searchParams.get('code');
    const role = sessionStorage.getItem('oauth_role') || 'freelancer';

    if (!code) {
      setError('No authorization code provided by GitHub.');
      return;
    }

    if (exchangedRef.current) return;
    exchangedRef.current = true;

    async function exchangeCode() {
      try {
        const res = await loginWithGitHub(code, role);
        if (res && res.user) {
          if (res.user.role === 'client') {
            navigate('/client/dashboard', { replace: true });
          } else {
            navigate('/freelancer/dashboard', { replace: true });
          }
        } else {
          setError(res?.message || 'GitHub login failed.');
        }
      } catch (err) {
        console.error('GitHub exchange error:', err);
        setError(err.response?.data?.message || err.message || 'Authentication failed.');
      }
    }

    exchangeCode();
  }, [searchParams, navigate, loginWithGitHub]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md w-full p-8 bg-white rounded-2xl shadow-xl text-center">
        {error ? (
          <div>
            <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 mb-2">GitHub Login Failed</h2>
            <p className="text-sm text-slate-600 mb-6">{error}</p>
            <button
              onClick={() => navigate('/login')}
              className="px-5 py-2.5 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary-hover transition-all"
            >
              Back to Login
            </button>
          </div>
        ) : (
          <div>
            <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-4" />
            <h2 className="text-lg font-bold text-slate-900 mb-2">Authorizing with GitHub...</h2>
            <p className="text-sm text-slate-500">Please wait while we set up your secure workspace session.</p>
          </div>
        )}
      </div>
    </div>
  );
}
