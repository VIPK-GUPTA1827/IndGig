import React, { useEffect, useState } from 'react';
import { X, Send, Loader2 } from 'lucide-react';
import api from '../utils/api';
import { useModalDismiss } from '../hooks/useModalDismiss';

export default function InviteToProjectDialog({ isOpen, onClose, freelancer, clientId, onInvited }) {
  const [gigs, setGigs] = useState([]);
  const [selectedGigId, setSelectedGigId] = useState('');
  const [message, setMessage] = useState('');
  const [loadingGigs, setLoadingGigs] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useModalDismiss(isOpen, onClose);

  useEffect(() => {
    if (!isOpen || !clientId) return;
    let cancelled = false;
    setLoadingGigs(true);
    setError('');

    api.get(`/api/gigs?client=${clientId}&status=open&limit=50`)
      .then((res) => {
        if (cancelled) return;
        const openGigs = (res.data || []).filter((g) => g.status === 'open');
        setGigs(openGigs);
        if (openGigs.length > 0) setSelectedGigId(openGigs[0]._id);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load your open projects');
      })
      .finally(() => {
        if (!cancelled) setLoadingGigs(false);
      });

    return () => { cancelled = true; };
  }, [isOpen, clientId]);

  if (!isOpen || !freelancer) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedGigId) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await api.post(`/api/gigs/${selectedGigId}/invites`, {
        freelancerId: freelancer._id,
        message: message.trim()
      });
      if (onInvited) onInvited(res);
      setMessage('');
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to send invitation');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white border border-[#DDE5ED] rounded-2xl w-full max-w-md p-6 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="invite-dialog-title">
        <div className="flex items-center justify-between mb-4">
          <h3 id="invite-dialog-title" className="text-base font-bold text-[#243040]">
            Invite {freelancer.name || freelancer.username}
          </h3>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="p-1.5 rounded-lg text-[#5A6675] hover:bg-slate-100 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {loadingGigs ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-[#2F6FAB]" />
          </div>
        ) : gigs.length === 0 ? (
          <p className="text-sm text-[#5A6675] py-4">
            You do not have any open projects yet. Post an open project from your dashboard first.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="invite-project-select" className="block text-xs font-semibold text-[#5A6675] mb-1.5">
                Select Open Project
              </label>
              <select
                id="invite-project-select"
                value={selectedGigId}
                onChange={(e) => setSelectedGigId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#DDE5ED] text-sm bg-white focus:outline-hidden focus:border-[#2F6FAB]"
              >
                {gigs.map((g) => (
                  <option key={g._id} value={g._id}>
                    {g.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="invite-message" className="block text-xs font-semibold text-[#5A6675] mb-1.5">
                Short Scope Message (optional)
              </label>
              <textarea
                id="invite-message"
                rows={3}
                maxLength={800}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Share what you're building and why their skills fit..."
                className="w-full px-3 py-2 rounded-xl border border-[#DDE5ED] text-sm focus:outline-hidden focus:border-[#2F6FAB]"
              />
            </div>

            {error && (
              <p role="alert" className="text-xs text-red-600 font-medium">{error}</p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-[#DDE5ED] text-xs font-semibold text-[#5A6675] cursor-pointer">
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !selectedGigId}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2F6FAB] hover:bg-[#25598A] text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
              >
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Send Invite
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
