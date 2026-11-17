import React from 'react';

const Maintenance = () => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 selection:bg-amber-500/20">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold tracking-wide uppercase">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          Scheduled Maintenance
        </div>

        {/* Icon */}
        <div className="w-20 h-20 mx-auto rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center shadow-xl">
          <svg className="w-10 h-10 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.162 1.141-.14 1.685.068a3.75 3.75 0 011.602 1.096m-3.287-1.164l-1.821-1.82a2.25 2.25 0 00-3.182 0l-1.06 1.06a2.25 2.25 0 000 3.182l1.06 1.06" />
          </svg>
        </div>

        {/* Heading & Text */}
        <div className="space-y-3">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            We'll be back soon!
          </h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            The platform is currently undergoing scheduled infrastructure upgrades and system maintenance. We're working hard to improve your experience.
          </p>
        </div>

        {/* Estimated time / Status note */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400 flex items-center justify-center gap-2">
          <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Expected back online shortly. Thank you for your patience!
        </div>

        {/* Footer */}
        <p className="text-[11px] text-slate-500">
          &copy; {new Date().getFullYear()} Platform Operations Team.
        </p>
      </div>
    </div>
  );
};

export default Maintenance;
