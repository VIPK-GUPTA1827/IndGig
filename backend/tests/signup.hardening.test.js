const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const { checkEmail } = require('../utils/emailCheck');
const { makeUser } = require('./helpers');

it('rejects gmili.com typo before creating an account', async () => {
  const response = await request(app).post('/api/auth/register').send({ name: 'Local Test', email: 'local-test@gmili.com', password: 'Password123!', role: 'client' });
  expect(response.status).toBe(400);
  expect(response.body.message).toContain('Please use a valid email');
  expect(await User.countDocuments()).toBe(0);
});
it('rejects custom/unsupported domains strictly', () => {
  const res = checkEmail('person@custom-company.example');
  expect(res.ok).toBe(false);
  expect(res.message).toContain('Please use a valid email');
});
it('an unverified client cannot post gigs even with a valid session', async () => {
  const { authHeader } = await makeUser({ isEmailVerified: false });
  const response = await request(app).post('/api/gigs').set(authHeader).send({ title: 'Testing verified email restriction', description: 'A long enough test description for a valid project.', category: 'Web Development', budget: 1000 });
  expect(response.status).toBe(403);
  expect(response.body.requiresVerification).toBe(true);
});
it('cannot claim inbox ownership using an invalid verification token', async () => {
  const { user } = await makeUser({ isEmailVerified: false });
  const response = await request(app).get('/api/auth/verify-email/not-a-real-token');
  expect(response.status).toBe(400);
  expect((await User.findById(user._id)).isEmailVerified).toBe(false);
});

it('pending signup issues no access token or usable refresh session', async () => {
  const response = await request(app).post('/api/auth/register').send({ name: 'Pending Test', email: 'pending-test@gmail.com', password: 'Password123!', role: 'client' });
  expect(response.status).toBe(201);
  expect(response.body.requiresVerification).toBe(true);
  expect(response.body.token).toBeUndefined();
  expect(response.body.refreshToken).toBeUndefined();
  const pending = await User.findOne({ email: 'pending-test@gmail.com' });
  expect(pending.isEmailVerified).toBe(false);
  expect(await require('../models/RefreshToken').countDocuments({ user: pending._id })).toBe(0);
});
it('blocks every representative private data/action path for a legacy unverified token', async () => {
  const { authHeader } = await makeUser({ isEmailVerified: false });
  for (const endpoint of ['/api/auth/me', '/api/bookings/my-bookings', '/api/wallet/transactions', '/api/messages/chats/contacts', '/api/notifications', '/api/v1/auth/me']) {
    const response = await request(app).get(endpoint).set(authHeader);
    expect(response.status).toBe(403);
    expect(response.body.requiresVerification).toBe(true);
  }
  expect((await request(app).post('/api/auth/switch-role').set(authHeader).send({})).status).toBe(403);
  expect((await request(app).post('/api/auth/logout-all').set(authHeader).send({})).status).toBe(200);
});
it('unverified session cannot refresh but logout remains available', async () => {
  const { user } = await makeUser({ isEmailVerified: false });
  const RefreshToken = require('../models/RefreshToken');
  const crypto = require('crypto');
  const raw = 'synthetic-local-refresh';
  await RefreshToken.create({ user: user._id, tokenHash: crypto.createHash('sha256').update(raw).digest('hex'), expiresAt: new Date(Date.now() + 60000) });
  expect((await request(app).post('/api/auth/refresh').send({ refreshToken: raw })).status).toBe(401);
  expect((await request(app).post('/api/auth/logout').send({})).status).toBe(200);
});
