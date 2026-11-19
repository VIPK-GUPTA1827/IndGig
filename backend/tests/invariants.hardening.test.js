const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const Gig = require('../models/Gig');
const Booking = require('../models/Booking');
const { makeUser } = require('./helpers');
const { debit } = require('../utils/wallet');
const { errorHandler } = require('../middleware/errorHandler');

it('concurrent debits never overspend the same balance', async () => {
  const { user } = await makeUser({ walletBalance: 100 });
  const results = await Promise.allSettled([debit(user._id, 75), debit(user._id, 75)]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect((await User.findById(user._id)).walletBalance).toBe(25);
});
it('rolls back milestone approval if active escrow is missing', async () => {
  const client = await makeUser();
  const freelancer = await makeUser({ role: 'freelancer' });
  const gig = await Gig.create({ title: 'Escrow guard regression test', description: 'A long enough description for this test project.', category: 'Web Development', budget: 1000, client: client.user._id, freelancer: freelancer.user._id, status: 'in-progress', milestones: [{ title: 'Delivery', amount: 1000, budget: 1000, status: 'submitted' }] });
  const r = await request(app).put(`/api/gigs/${gig._id}/milestones/${gig.milestones[0]._id}/approve`).set(client.authHeader).send({});
  expect(r.status).toBe(409);
  const unchanged = await Gig.findById(gig._id);
  expect(unchanged.status).toBe('in-progress');
  expect(unchanged.milestones[0].status).toBe('submitted');
});
it('accepts adjacent bookings rather than treating them as overlapping', async () => {
  const c = await makeUser();
  const f = await makeUser({ role: 'freelancer' });
  for (const [startTime, endTime] of [['09:00', '10:00'], ['10:00', '11:00']]) {
    const r = await request(app).post('/api/bookings').set(c.authHeader).send({ freelancerId: f.user._id, date: '2026-12-01', startTime, endTime, description: 'Consultation' });
    expect(r.status).toBe(201);
  }
  expect(await Booking.countDocuments()).toBe(2);
});
it('prevents outsiders from changing a booking', async () => {
  const c = await makeUser();
  const f = await makeUser({ role: 'freelancer' });
  const outsider = await makeUser();
  const booking = await Booking.create({ client: c.user._id, freelancer: f.user._id, date: new Date('2026-12-01'), startTime: '09:00', endTime: '10:00', description: 'Consultation' });
  const r = await request(app).put(`/api/bookings/${booking._id}/status`).set(outsider.authHeader).send({ status: 'cancelled' });
  expect(r.status).toBe(403);
});
it('normalizes malformed JSON and oversized bodies without executing a route', async () => {
  expect((await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{')).status).toBe(400);
  expect((await request(app).post('/api/auth/login').send({ data: 'x'.repeat(110000) })).status).toBe(413);
});
it('redacts unexpected server error details in production', () => {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  try {
    errorHandler(new Error('Internal database details'), { method: 'GET', originalUrl: '/api/test' }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Internal Server Error' });
  } finally { process.env.NODE_ENV = original; log.mockRestore(); }
});
