const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const Gig = require('../models/Gig');
const Proposal = require('../models/Proposal');
const Escrow = require('../models/Escrow');
const Dispute = require('../models/Dispute');
const Booking = require('../models/Booking');
const { makeUser } = require('./helpers');

const makeContract = async () => {
  const client = await makeUser({ role: 'client', walletBalance: 10000 });
  const freelancer = await makeUser({ role: 'freelancer' });
  const gig = await Gig.create({ title: 'Backend hardening project', description: 'A test project with a sufficiently long description.', category: 'Web Development', budget: 1000, client: client.user._id, freelancer: freelancer.user._id, status: 'in-progress' });
  const proposal = await Proposal.create({ gig: gig._id, freelancer: freelancer.user._id, coverLetter: 'A detailed proposal for this test contract.', bidAmount: 1000, estimatedTime: '1 week' });
  const escrow = await Escrow.create({ gig: gig._id, proposal: proposal._id, client: client.user._id, freelancer: freelancer.user._id, amount: 1000 });
  return { client, freelancer, gig, escrow };
};

describe('Backend hardening regressions', () => {
  it('rejects cross-origin state changes, not merely hiding their responses with CORS', async () => {
    const { authHeader } = await makeUser();
    const r = await request(app).post('/api/auth/logout-all').set(authHeader).set('Origin', 'https://untrusted.invalid');
    expect(r.status).toBe(403);
  });
  it('rejects cookie writes without browser origin evidence', async () => {
    const { token } = await makeUser();
    const r = await request(app).post('/api/auth/logout-all').set('Cookie', `token=${token}`);
    expect(r.status).toBe(403);
  });
  it('allows trusted-origin cookie writes and bearer-only API clients', async () => {
    const a = await makeUser();
    expect((await request(app).post('/api/auth/logout-all').set('Cookie', `token=${a.token}`).set('Origin', 'http://localhost:3000')).status).toBe(200);
    const b = await makeUser();
    expect((await request(app).post('/api/auth/logout-all').set(b.authHeader)).status).toBe(200);
  });
  it('rejects malformed JWT subjects as unauthenticated rather than server errors', async () => {
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ id: 'not-an-id' }, process.env.JWT_SECRET);
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)).status).toBe(401);
  });
  it('rejects invalid booking dates and times with 400', async () => {
    const c = await makeUser({ role: 'client' });
    const f = await makeUser({ role: 'freelancer' });
    for (const fields of [{ date: 'not-a-date' }, { startTime: '25:00' }, { startTime: '12:00', endTime: '09:00' }, { date: '2026-02-30' }]) {
      const r = await request(app).post('/api/bookings').set(c.authHeader).send({ freelancerId: f.user._id, date: '2026-12-01', startTime: '09:00', endTime: '10:00', description: 'Backend consultation', ...fields });
      expect(r.status).toBe(400);
    }
  });
  it('serializes overlapping booking requests for one freelancer', async () => {
    const c = await makeUser({ role: 'client' });
    const f = await makeUser({ role: 'freelancer' });
    const responses = await Promise.all(['09:00', '09:30'].map(startTime => request(app).post('/api/bookings').set(c.authHeader).send({ freelancerId: f.user._id, date: '2026-12-01', startTime, endTime: '10:00', description: 'Backend consultation' })));
    expect(responses.map(r => r.status).sort()).toEqual([201, 409]);
    expect(await Booking.countDocuments()).toBe(1);
  });
  it('does not miscompare single-digit availability times lexically', async () => {
    const f = await makeUser({ role: 'freelancer' });
    const r = await request(app).put('/api/bookings/availability').set(f.authHeader).send({ slots: [{ dayOfWeek: 'Monday', startTime: '9:00', endTime: '10:00' }] });
    expect(r.status).toBe(200);
    expect(r.body.data[0].startTime).toBe('09:00');
  });
  it('creates only one open dispute under concurrent requests', async () => {
    const { client, gig } = await makeContract();
    const body = { gigId: gig._id, reason: 'Other', explanation: 'Work does not match our agreed project scope.' };
    const rs = await Promise.all([1, 2].map(() => request(app).post('/api/disputes').set(client.authHeader).send(body)));
    expect(rs.map(r => r.status).sort()).toEqual([201, 409]);
    expect(await Dispute.countDocuments({ gig: gig._id })).toBe(1);
    expect((await Gig.findById(gig._id)).status).toBe('disputed');
  });
  it('dispute freeze and payout cannot both succeed concurrently', async () => {
    const { client, gig, escrow } = await makeContract();
    const rs = await Promise.all([
      request(app).post('/api/disputes').set(client.authHeader).send({ gigId: gig._id, reason: 'Other', explanation: 'Work does not match our agreed project scope.' }),
      request(app).put(`/api/gigs/${gig._id}/complete`).set(client.authHeader).send({})
    ]);
    expect(rs.filter(r => r.status >= 200 && r.status < 300)).toHaveLength(1);
    const g = await Gig.findById(gig._id);
    const e = await Escrow.findById(escrow._id);
    expect(g.status === 'disputed' ? e.status === 'held' : e.status === 'released').toBe(true);
  });
  it('blocks milestone payout after a dispute', async () => {
    const { client, gig, escrow } = await makeContract();
    // Add a positive pending milestone to gig
    gig.milestones = [{
      title: 'Phase 1 Delivery',
      budget: 1000,
      status: 'submitted'
    }];
    await gig.save();

    await request(app).post('/api/disputes')
      .set(client.authHeader).send({
        gigId: String(gig._id),
        reason: 'Other',
        explanation: 'Delivery differs from the agreed scope.'
      }).expect(201);

    const beforeFreelancer = await User.findById(gig.freelancer);
    const milestoneId = gig.milestones[0]._id;

    await request(app)
      .put(`/api/gigs/${gig._id}/milestones/${milestoneId}/approve`)
      .set(client.authHeader).send({}).expect(409);

    const afterFreelancer = await User.findById(gig.freelancer);
    const storedEscrow = await Escrow.findById(escrow._id);

    expect(afterFreelancer.walletBalance).toBe(beforeFreelancer.walletBalance);
    expect(storedEscrow.releasedAmount || 0).toBe(0);
  });
  it('rejects duplicate milestone IDs in reorder request', async () => {
    const { client, gig } = await makeContract();
    gig.milestones = [
      { title: 'Milestone 1', budget: 500, status: 'pending' },
      { title: 'Milestone 2', budget: 500, status: 'pending' }
    ];
    await gig.save();

    const id1 = gig.milestones[0]._id.toString();
    const res = await request(app)
      .put(`/api/gigs/${gig._id}/milestones/reorder`)
      .set(client.authHeader)
      .send({ milestoneIds: [id1, id1] });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Each milestone is required once');
  });
  it('rejects invalid milestone amounts on creation', async () => {
    const { client, gig } = await makeContract();
    for (const amount of [0, -1, 1.5, '', null, true]) {
      const res = await request(app)
        .post(`/api/gigs/${gig._id}/milestones`)
        .set(client.authHeader)
        .send({ title: 'Delivery', amount });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Use a positive whole-rupee milestone amount');
    }
  });
  it('rejects negative and non-finite internal wallet mutations', async () => {
    const { user } = await makeUser({ walletBalance: 100 });
    const { credit, debit } = require('../utils/wallet');
    for (const amount of [-10, 0, Infinity, NaN, 1.1, '10']) {
      await expect(credit(user._id, amount)).rejects.toThrow();
      await expect(debit(user._id, amount)).rejects.toThrow();
    }
    expect((await User.findById(user._id)).walletBalance).toBe(100);
  });
});
