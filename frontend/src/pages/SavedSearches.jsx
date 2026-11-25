import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Bell, Trash2, ExternalLink } from 'lucide-react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import Seo from '../components/Seo';

export default function SavedSearches() {
  const { user } = useAuth();
  const [searches, setSearches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const backUrl = user?.role === 'client' ? '/client/dashboard' : '/freelancer/dashboard';

  useEffect(() => {
    let cancelled = false;
    api.get('/api/saved-searches')
      .then((res) => {
        if (!cancelled) setSearches(res.data || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load saved searches');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const handleToggle = async (item) => {
    try {
      const res = await api.patch(`/api/saved-searches/${item._id}`, { enabled: !item.enabled });
      setSearches((prev) => prev.map((s) => (s._id === item._id ? res.data : s)));
    } catch (err) {
      setError(err.message || 'Could not update search');
    }
  };

  const handleFrequencyChange = async (item, frequency) => {
    try {
      const res = await api.patch(`/api/saved-searches/${item._id}`, { frequency });
      setSearches((prev) => prev.map((s) => (s._id === item._id ? res.data : s)));
    } catch (err) {
      setError(err.message || 'Could not update frequency');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/api/saved-searches/${id}`);
      setSearches((prev) => prev.filter((s) => s._id !== id));
    } catch (err) {
      setError(err.message || 'Could not delete saved search');
    }
  };

  const buildSearchLink = (item) => {
    const f = item.filters || {};
    const params = new URLSearchParams();
    if (f.search) params.set('search', f.search);
    if (f.category) params.set('category', f.category);
    if (f.minBudget) params.set('minBudget', String(f.minBudget));
    if (f.maxBudget) params.set('maxBudget', String(f.maxBudget));
    const base = item.type === 'developers' ? '/freelancers' : '/marketplace';
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#243040] font-sans">
      <Seo title="Saved Searches & Alerts — IndGig" path="/saved-searches" noindex />

      <header className="sticky top-0 z-30 bg-[#FAF8F5]/95 backdrop-blur-md border-b border-[#DDE5ED]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to={backUrl} className="inline-flex items-center gap-1.5 text-xs font-bold text-[#5A6675] hover:text-[#2F6FAB]">
              <ArrowLeft className="w-4 h-4" /> Dashboard
            </Link>
            <span className="h-4 w-px bg-[#DDE5ED]" />
            <h1 className="text-sm sm:text-base font-bold text-[#243040]">Saved Searches &amp; Alerts</h1>
          </div>
          <Link to="/marketplace" className="text-xs font-bold text-[#2F6FAB] hover:underline">
            Browse Projects
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-4">
        {error && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="bg-white border border-[#DDE5ED] rounded-2xl p-8 text-center text-xs text-[#5A6675]">
            Loading saved searches...
          </div>
        ) : searches.length === 0 ? (
          <div className="bg-white border border-[#DDE5ED] rounded-2xl p-10 text-center">
            <Bell className="w-7 h-7 text-[#2F6FAB] mx-auto mb-2" />
            <p className="text-base font-bold text-[#243040]">No saved searches yet</p>
            <p className="text-xs text-[#5A6675] mt-1 mb-4">
              Filter projects on the marketplace and click Save Search to get instant or daily alerts.
            </p>
            <Link to="/marketplace" className="inline-block px-4 py-2 rounded-xl bg-[#2F6FAB] text-white text-xs font-bold">
              Explore Marketplace
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {searches.map((item) => (
              <div key={item._id} className="bg-white border border-[#DDE5ED] rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-[#243040]">{item.name}</h2>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${item.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                      {item.enabled ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <p className="text-xs text-[#5A6675]">
                    {[
                      item.filters?.search && `Keyword: ${item.filters.search}`,
                      item.filters?.category && `Category: ${item.filters.category}`,
                      item.filters?.minBudget && `Min ₹${item.filters.minBudget}`,
                      item.filters?.maxBudget && `Max ₹${item.filters.maxBudget}`
                    ].filter(Boolean).join(' · ') || 'All open projects'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label={`Alert frequency for ${item.name}`}
                    value={item.frequency}
                    onChange={(e) => handleFrequencyChange(item, e.target.value)}
                    className="px-2.5 py-1.5 rounded-xl border border-[#DDE5ED] text-xs font-semibold bg-white"
                  >
                    <option value="instant">Instant in-app</option>
                    <option value="daily">Daily digest</option>
                    <option value="off">Off</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => handleToggle(item)}
                    className="px-3 py-1.5 rounded-xl border border-[#DDE5ED] text-xs font-semibold text-[#243040] hover:bg-slate-50 cursor-pointer"
                  >
                    {item.enabled ? 'Pause' : 'Resume'}
                  </button>
                  <Link
                    to={buildSearchLink(item)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#EAF1F7] text-[#2F6FAB] text-xs font-bold"
                  >
                    View <ExternalLink className="w-3 h-3" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDelete(item._id)}
                    aria-label={`Delete ${item.name}`}
                    className="p-1.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
