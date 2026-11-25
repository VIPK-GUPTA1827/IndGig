import React, { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, ArrowLeft, MapPin, Clock, CheckCircle2, RefreshCw, SlidersHorizontal, X, Bookmark, Send } from 'lucide-react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { SkeletonGrid } from '../components/Skeleton';
import Seo from '../components/Seo';
import InviteToProjectDialog from '../components/InviteToProjectDialog';

const AVAILABILITY_LABELS = {
  available: { text: 'Available now', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  limited: { text: 'Limited capacity', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  unavailable: { text: 'Booked', cls: 'bg-slate-100 text-slate-600 border-slate-200' }
};

const formatINR = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

export default function FreelancerDirectory() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [shortlistMap, setShortlistMap] = useState({});
  const [inviteTarget, setInviteTarget] = useState(null);
  const backUrl = user
    ? user.role === 'client'
      ? '/client/dashboard'
      : '/freelancer/dashboard'
    : '/';
  const backLabel = user ? 'Back to Dashboard' : 'Back to IndGig';

  const [searchParams, setSearchParams] = useSearchParams();
  const [freelancers, setFreelancers] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const search = searchParams.get('search') || '';
  const maxRate = searchParams.get('maxRate') || '';
  const workPreference = searchParams.get('workPreference') || 'all';
  const availabilityStatus = searchParams.get('availabilityStatus') || 'all';
  const sort = searchParams.get('sort') || 'relevance';
  const page = parseInt(searchParams.get('page'), 10) || 1;

  const [searchInput, setSearchInput] = useState(search);
  const [maxRateInput, setMaxRateInput] = useState(maxRate);

  useEffect(() => {
    if (user?.role !== 'client') return;
    api.get('/api/shortlists')
      .then((res) => {
        const next = {};
        for (const item of res.data || []) {
          if (item.freelancer?._id) next[item.freelancer._id] = item._id;
        }
        setShortlistMap(next);
      })
      .catch(() => {});
  }, [user?._id, user?.role]);

  const handleToggleShortlist = async (devId) => {
    try {
      if (shortlistMap[devId]) {
        await api.delete(`/api/shortlists/${shortlistMap[devId]}`);
        setShortlistMap((prev) => {
          const copy = { ...prev };
          delete copy[devId];
          return copy;
        });
        toast?.success('Removed from shortlist');
      } else {
        const res = await api.post('/api/shortlists', { freelancerId: devId });
        if (res.data?._id) {
          setShortlistMap((prev) => ({ ...prev, [devId]: res.data._id }));
          toast?.success('Saved to shortlist');
        }
      }
    } catch (err) {
      toast?.error(err.message || 'Could not update shortlist');
    }
  };

  useEffect(() => {
    setSearchInput(search);
    setMaxRateInput(maxRate);
  }, [search, maxRate]);

  const updateParams = useCallback((updates) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value && value !== 'all') next.set(key, value);
      else next.delete(key);
    });
    if (!('page' in updates)) next.delete('page');
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  const clearAllFilters = () => {
    setSearchInput('');
    setMaxRateInput('');
    setSearchParams(new URLSearchParams());
  };

  const hasActiveFilters = Boolean(
    search || maxRate || workPreference !== 'all' || availabilityStatus !== 'all' || page > 1 || sort !== 'relevance'
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({ limit: '12', page: String(page) });
        if (search) params.set('search', search);
        if (maxRate) params.set('maxRate', maxRate);
        if (workPreference !== 'all') params.set('workPreference', workPreference);
        if (availabilityStatus !== 'all') params.set('availabilityStatus', availabilityStatus);
        if (sort && sort !== 'relevance') params.set('sort', sort);

        const res = await api.get(`/api/freelancers?${params.toString()}`);
        if (!cancelled) {
          setFreelancers(res.data || []);
          setTotalPages(res.totalPages || 1);
          setTotalCount(res.totalCount ?? (res.data ? res.data.length : 0));
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load developers');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [search, maxRate, workPreference, availabilityStatus, sort, page, reloadKey]);

  const handleFilterSubmit = (e) => {
    e.preventDefault();
    updateParams({ search: searchInput.trim(), maxRate: maxRateInput.trim() });
    setMobileFiltersOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#243040] font-sans">
      <Seo
        title="Find Developers & Tech Freelancers — IndGig"
        description="Browse verified Indian developers, designers, and engineers by skills, hourly rate, and live availability."
        path="/freelancers"
      />

      <header className="sticky top-0 z-30 bg-[#FAF8F5]/95 backdrop-blur-md border-b border-[#DDE5ED]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link to={backUrl} className="inline-flex items-center gap-2 text-xs font-bold text-[#5A6675] hover:text-[#2F6FAB] transition-colors">
              <ArrowLeft className="w-4 h-4" />
              <span>{backLabel}</span>
            </Link>
            <span className="h-4 w-px bg-[#DDE5ED]" aria-hidden="true" />
            <h1 className="text-sm sm:text-base font-bold text-[#243040]">Find Developers</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/marketplace" className="text-xs font-semibold text-[#5A6675] hover:text-[#2F6FAB] transition-colors">
              Browse Projects
            </Link>
            {!user && (
              <Link to="/signup" className="rounded-full bg-[#F2A541] hover:bg-[#D9943A] px-4 py-1.5 text-xs font-bold text-[#243040] transition-colors">
                Post a Project
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#243040]">Technical Talent Directory</h2>
            <p className="text-sm text-[#5A6675] mt-1">
              Filter developers by skills, hourly rate, work mode, and current availability.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileFiltersOpen((v) => !v)}
              className="lg:hidden inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-[#DDE5ED] bg-white text-xs font-semibold text-[#243040]"
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filters
            </button>
            <label htmlFor="dir-sort" className="sr-only">Sort developers</label>
            <select
              id="dir-sort"
              value={sort}
              onChange={(e) => updateParams({ sort: e.target.value })}
              className="px-3.5 py-2 rounded-xl border border-[#DDE5ED] bg-white text-xs font-semibold text-[#243040] focus:outline-hidden focus:border-[#2F6FAB]"
            >
              <option value="relevance">Sort: Relevance</option>
              <option value="rate_asc">Rate: Low to High</option>
              <option value="rate_desc">Rate: High to Low</option>
              <option value="newest">Newest Profiles</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Filters Sidebar / Mobile Drawer */}
          <aside className={`${mobileFiltersOpen ? 'block' : 'hidden'} lg:block lg:col-span-1`}>
            <form onSubmit={handleFilterSubmit} className="bg-white border border-[#DDE5ED] rounded-2xl p-5 space-y-5 sticky top-24">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#243040]">Filters</h3>
                {hasActiveFilters && (
                  <button type="button" onClick={clearAllFilters} className="text-xs font-semibold text-[#2F6FAB] hover:underline flex items-center gap-1 cursor-pointer">
                    <X className="w-3.5 h-3.5" /> Clear
                  </button>
                )}
              </div>

              <div>
                <label htmlFor="dir-search" className="block text-xs font-semibold text-[#5A6675] mb-1.5">
                  Skill or Keyword
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-[#5A6675] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="dir-search"
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="React, Node.js, Python..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-[#DDE5ED] text-sm focus:outline-hidden focus:border-[#2F6FAB]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="dir-max-rate" className="block text-xs font-semibold text-[#5A6675] mb-1.5">
                  Max Hourly Rate (₹)
                </label>
                <input
                  id="dir-max-rate"
                  type="number"
                  min="0"
                  value={maxRateInput}
                  onChange={(e) => setMaxRateInput(e.target.value)}
                  placeholder="e.g. 1500"
                  className="w-full px-3 py-2 rounded-xl border border-[#DDE5ED] text-sm focus:outline-hidden focus:border-[#2F6FAB]"
                />
              </div>

              <div>
                <label htmlFor="dir-work-pref" className="block text-xs font-semibold text-[#5A6675] mb-1.5">
                  Work Preference
                </label>
                <select
                  id="dir-work-pref"
                  value={workPreference}
                  onChange={(e) => updateParams({ workPreference: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-[#DDE5ED] text-sm bg-white focus:outline-hidden focus:border-[#2F6FAB]"
                >
                  <option value="all">All modes</option>
                  <option value="remote">Remote</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="onsite">On-site</option>
                </select>
              </div>

              <div>
                <label htmlFor="dir-availability" className="block text-xs font-semibold text-[#5A6675] mb-1.5">
                  Availability
                </label>
                <select
                  id="dir-availability"
                  value={availabilityStatus}
                  onChange={(e) => updateParams({ availabilityStatus: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-[#DDE5ED] text-sm bg-white focus:outline-hidden focus:border-[#2F6FAB]"
                >
                  <option value="all">Any availability</option>
                  <option value="available">Available now</option>
                  <option value="limited">Limited capacity</option>
                  <option value="unavailable">Booked</option>
                </select>
              </div>

              <button
                type="submit"
                className="w-full rounded-xl bg-[#2F6FAB] hover:bg-[#25598A] text-white py-2.5 text-xs font-bold transition-colors cursor-pointer"
              >
                Apply Filters
              </button>
            </form>
          </aside>

          {/* Results Grid */}
          <section className="lg:col-span-3">
            {!loading && !error && (
              <p className="text-xs font-semibold text-[#5A6675] mb-4">
                Showing {freelancers.length} of {totalCount} developers
              </p>
            )}

            {loading ? (
              <SkeletonGrid count={6} />
            ) : error ? (
              <div className="bg-white border border-red-200 rounded-2xl p-8 text-center">
                <p className="text-sm font-semibold text-red-600 mb-3">{error}</p>
                <button
                  type="button"
                  onClick={() => setReloadKey((k) => k + 1)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#243040] text-white text-xs font-bold cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Retry
                </button>
              </div>
            ) : freelancers.length === 0 ? (
              <div className="bg-white border border-[#DDE5ED] rounded-2xl p-10 text-center">
                <p className="text-base font-bold text-[#243040] mb-1">No matching developers found</p>
                <p className="text-xs text-[#5A6675] mb-4">Try broadening your skill keywords or rate limit.</p>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="px-4 py-2 rounded-xl bg-[#EAF1F7] text-[#2F6FAB] text-xs font-bold hover:bg-[#DDE5ED] transition-colors cursor-pointer"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {freelancers.map((dev) => {
                    const avail = AVAILABILITY_LABELS[dev.availabilityStatus] || AVAILABILITY_LABELS.available;
                    const visibleSkills = (dev.skills || []).slice(0, 4);
                    const extraSkills = Math.max(0, (dev.skills || []).length - 4);
                    return (
                      <article key={dev._id} className="bg-white border border-[#DDE5ED] rounded-2xl p-5 flex flex-col justify-between hover:border-[#2F6FAB] transition-colors shadow-2xs">
                        <div>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <img
                                src={dev.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(dev.name || dev.username || 'Dev')}&background=EAF1F7&color=243040`}
                                alt={dev.name || dev.username}
                                className="w-11 h-11 rounded-full object-cover border border-[#DDE5ED] shrink-0"
                                loading="lazy"
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <h3 className="text-sm font-bold text-[#243040] truncate">{dev.name || dev.username}</h3>
                                  {dev.verificationBadge && (
                                    <CheckCircle2 className="w-4 h-4 text-[#2F6FAB] shrink-0" aria-label="Verified profile" />
                                  )}
                                </div>
                                <p className="text-xs text-[#5A6675] truncate">{dev.headline || 'Software Developer'}</p>
                              </div>
                            </div>
                            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border shrink-0 ${avail.cls}`}>
                              {avail.text}
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-1.5 mt-4">
                            {visibleSkills.map((s, idx) => (
                              <span key={idx} className="px-2.5 py-0.5 rounded-full bg-[#EAF1F7] text-[#243040] text-[11px] font-medium">
                                {typeof s === 'string' ? s : s.name}
                              </span>
                            ))}
                            {extraSkills > 0 && (
                              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-[#5A6675] text-[11px] font-medium">
                                +{extraSkills}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="mt-5 pt-4 border-t border-[#DDE5ED] flex items-center justify-between gap-3">
                          <div className="text-xs text-[#5A6675] space-y-0.5">
                            <div className="font-bold text-[#243040]">
                              {dev.hourlyRate > 0 ? `${formatINR(dev.hourlyRate)}/hr` : 'Rate negotiable'}
                            </div>
                            <div className="flex items-center gap-2 text-[11px]">
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="w-3 h-3" /> {dev.workPreference || 'remote'}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Clock className="w-3 h-3" /> {dev.weeklyCapacity || '30+ hrs/week'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {user?.role === 'client' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleToggleShortlist(dev._id)}
                                  aria-label={shortlistMap[dev._id] ? 'Remove from shortlist' : 'Save to shortlist'}
                                  className={`p-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                                    shortlistMap[dev._id]
                                      ? 'border-[#2F6FAB] bg-[#EAF1F7] text-[#2F6FAB]'
                                      : 'border-[#DDE5ED] text-[#5A6675] hover:border-[#2F6FAB]'
                                  }`}
                                >
                                  <Bookmark className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setInviteTarget(dev)}
                                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-[#EAF1F7] hover:bg-[#DDE5ED] text-[#2F6FAB] text-xs font-bold transition-colors cursor-pointer"
                                >
                                  <Send className="w-3 h-3" /> Invite
                                </button>
                              </>
                            )}
                            <Link
                              to={`/profile/${dev._id}`}
                              className="px-4 py-2 rounded-xl bg-[#243040] hover:bg-[#2F6FAB] text-white text-xs font-bold transition-colors shrink-0"
                            >
                              View profile
                            </Link>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-8">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => updateParams({ page: String(page - 1) })}
                      className="px-3.5 py-2 rounded-xl border border-[#DDE5ED] bg-white text-xs font-semibold disabled:opacity-40 cursor-pointer"
                    >
                      Previous
                    </button>
                    <span className="text-xs font-semibold text-[#5A6675] px-2">
                      Page {page} of {totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={page >= totalPages}
                      onClick={() => updateParams({ page: String(page + 1) })}
                      className="px-3.5 py-2 rounded-xl border border-[#DDE5ED] bg-white text-xs font-semibold disabled:opacity-40 cursor-pointer"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </main>

      <InviteToProjectDialog
        isOpen={Boolean(inviteTarget)}
        onClose={() => setInviteTarget(null)}
        freelancer={inviteTarget}
        clientId={user?._id}
        onInvited={(res) => toast?.success(res?.duplicate ? 'Already invited to this project' : 'Invitation sent!')}
      />
    </div>
  );
}
