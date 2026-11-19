import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export default function GitHubAuthButton({ role = 'freelancer', text = 'Continue with GitHub' }) {
  const [loading, setLoading] = useState(false);

  // If user clicks back button from GitHub (bfcache / back navigation), reset loading state
  useEffect(() => {
    const handlePageShow = (event) => {
      setLoading(false);
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  const handleGitHubClick = () => {
    setLoading(true);
    const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID || 'Ov23liZZpDhO5VgvOXXH';
    const redirectUri = `${window.location.origin}/auth/github/callback`;
    
    // Save chosen role in sessionStorage so callback page knows whether client or freelancer
    sessionStorage.setItem('oauth_role', role);

    // GitHub OAuth URL with user and user:email scope
    const githubUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&scope=read:user%20user:email`;

    window.location.href = githubUrl;
  };

  return (
    <button
      type="button"
      onClick={handleGitHubClick}
      disabled={loading}
      className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-white font-medium text-sm transition-all shadow-xs cursor-pointer disabled:opacity-50"
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
      ) : (
        <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
          />
        </svg>
      )}
      <span>{text}</span>
    </button>
  );
}
