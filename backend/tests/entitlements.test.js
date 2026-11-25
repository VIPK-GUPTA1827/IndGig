const request = require('supertest');
const app = require('../app');
const SavedSearch = require('../models/SavedSearch');
const Membership = require('../models/Membership');
const { makeUser } = require('./helpers');

describe('Plan Entitlements & Atomic Quotas (Phase E)', () => {
  it('enforces savedSearchLimit on free plan and falls back gracefully on expired pro plan', async () => {
    const freeUser = await makeUser({ role: 'freelancer', isEmailVerified: true });

    const planRes = await request(app)
      .get('/api/plans/me')
      .set('Authorization', `Bearer ${freeUser.token}`);
    expect(planRes.status).toBe(200);
    expect(planRes.body.data.tier).toBe('free');
    expect(planRes.body.data.entitlements.savedSearchLimit).toBe(5);

    for (let i = 0; i < 5; i++) {
      await SavedSearch.create({ owner: freeUser.user._id, name: `Search ${i}` });
    }

    const sixth = await request(app)
      .post('/api/saved-searches')
      .set('Authorization', `Bearer ${freeUser.token}`)
      .send({ name: 'Search 6' });
    expect(sixth.status).toBe(403);
    expect(sixth.body.code).toBe('QUOTA_EXCEEDED');

    // Expired pro plan gracefully falls back to free limits while keeping existing searches readable
    const expiredPro = await makeUser({
      role: 'freelancer',
      isEmailVerified: true,
      plan: { tier: 'pro', expiresAt: new Date(Date.now() - 60000) }
    });
    const expRes = await request(app)
      .get('/api/plans/me')
      .set('Authorization', `Bearer ${expiredPro.token}`);
    expect(expRes.body.data.tier).toBe('free');
    expect(expRes.body.data.expired).toBe(true);
  });

  it('enforces teamSeatLimit on organization invites', async () => {
    const owner = await makeUser({ role: 'client', isEmailVerified: true });
    const orgRes = await request(app)
      .post('/api/organizations')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'Seat Test Org' });
    const orgId = orgRes.body.data._id;

    // Add 2 more active members to hit free limit of 3
    for (let i = 0; i < 2; i++) {
      const m = await makeUser({ role: 'client', isEmailVerified: true });
      await Membership.create({ organization: orgId, user: m.user._id, role: 'reviewer', status: 'active' });
    }

    const overLimit = await request(app)
      .post(`/api/organizations/${orgId}/invites`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ email: 'extra@gmail.com', role: 'recruiter' });
    expect(overLimit.status).toBe(403);
    expect(overLimit.body.code).toBe('SEAT_LIMIT_EXCEEDED');
  });
});
