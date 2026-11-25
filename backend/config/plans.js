const PLAN_ENTITLEMENTS = {
  free: {
    version: 1,
    savedSearchLimit: 5,
    teamSeatLimit: 3,
    analyticsEnabled: false,
    featuredListingEnabled: false
  },
  pro: {
    version: 1,
    savedSearchLimit: 25,
    teamSeatLimit: 10,
    analyticsEnabled: true,
    featuredListingEnabled: true
  }
};

function getEffectivePlan(user) {
  const rawTier = user?.plan?.tier === 'pro' ? 'pro' : 'free';
  const expiresAt = user?.plan?.expiresAt ? new Date(user.plan.expiresAt) : null;
  const expired = Boolean(expiresAt && expiresAt <= new Date());
  const effectiveTier = rawTier === 'pro' && !expired ? 'pro' : 'free';

  return {
    tier: effectiveTier,
    configuredTier: rawTier,
    expired,
    expiresAt,
    entitlements: PLAN_ENTITLEMENTS[effectiveTier]
  };
}

module.exports = {
  PLAN_ENTITLEMENTS,
  getEffectivePlan
};
