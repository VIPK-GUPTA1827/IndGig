const request = require('supertest');
const http = require('http');
const { io: connect } = require('socket.io-client');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const app = require('../app');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const { setupSocket } = require('../socket');
const { signAccessToken } = require('../utils/tokens');
const { makeUser } = require('./helpers');
const { checkEnv } = require('../config/env');

const connected = socket => new Promise((resolve, reject) => {
  socket.once('connect', resolve);
  socket.once('connect_error', reject);
});

describe('Session lifecycle hardening', () => {
  it('requires a strong JWT signing secret in production', () => {
    const result = checkEnv({ NODE_ENV: 'production', MONGO_URI: 'mongodb://localhost/test', JWT_SECRET: 'weak', CLIENT_URL: 'https://example.com', CORS_ORIGINS: 'https://example.com' });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
  });
  it('password reset links can change a password only once even in parallel', async () => {
    const { user, authHeader } = await makeUser();
    const raw = crypto.randomBytes(32).toString('hex');
    await User.updateOne({ _id: user._id }, { resetPasswordToken: crypto.createHash('sha256').update(raw).digest('hex'), resetPasswordExpire: new Date(Date.now() + 60000) });
    const responses = await Promise.all([1, 2].map(() => request(app).put(`/api/auth/reset-password/${raw}`).send({ password: 'NewPassword123!' })));
    expect(responses.map(r => r.status).sort()).toEqual([200, 400]);
    expect((await User.findById(user._id)).tokenVersion).toBe(1);
    expect((await request(app).get('/api/auth/me').set(authHeader)).status).toBe(401);
  });
  it('refresh token snapshots cannot restore a revoked session', async () => {
    const { user } = await makeUser();
    const raw = crypto.randomBytes(48).toString('hex');
    await RefreshToken.create({ user: user._id, tokenHash: crypto.createHash('sha256').update(raw).digest('hex'), tokenVersion: 0, expiresAt: new Date(Date.now() + 60000) });
    await User.updateOne({ _id: user._id }, { $inc: { tokenVersion: 1 } });
    expect((await request(app).post('/api/auth/refresh').send({ refreshToken: raw })).status).toBe(401);
  });
});

describe('Live socket authorization', () => {
  let server, io, sockets, url;
  beforeEach(async () => {
    sockets = [];
    server = http.createServer(app);
    io = setupSocket(server);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${server.address().port}`;
  });
  afterEach(async () => {
    sockets.forEach(socket => socket.disconnect());
    await new Promise(resolve => io.close(resolve));
    if (server.listening) await new Promise(resolve => server.close(resolve));
  });
  const open = (url, options, sockets) => {
    const socket = connect(url, { transports: ['websocket'], reconnection: false, timeout: 2000, ...options });
    sockets.push(socket);
    return socket;
  };
  it('denies an untrusted browser websocket origin', async () => {
    const { token } = await makeUser();
    const socket = open(url, { auth: { token }, extraHeaders: { Origin: 'https://untrusted.invalid' } }, sockets);
    await expect(connected(socket)).rejects.toThrow();
  });
  it.each(['suspend', 'revoke', 'expire'])('rejects events after session %s', async mode => {
    const { user, token } = await makeUser();
    const socket = open(url, { auth: { token } }, sockets);
    await connected(socket);
    if (mode === 'suspend') await User.updateOne({ _id: user._id }, { isSuspended: true });
    if (mode === 'revoke') await User.updateOne({ _id: user._id }, { $inc: { tokenVersion: 1 } });
    if (mode === 'expire') {
      // Replace the server-side token with an actually expired signed token to
      // exercise the packet verification path without a timing-sensitive sleep.
      const serverSocket = io.sockets.sockets.get(socket.id);
      serverSocket.accessToken = jwt.sign({ id: user._id.toString(), v: 0 }, process.env.JWT_SECRET, { expiresIn: -1 });
    }
    const disconnected = new Promise(resolve => socket.once('disconnect', resolve));
    socket.emit('typing', { recipient: user._id.toString() });
    await disconnected;
    expect(socket.connected).toBe(false);
  });
  it('denies an unverified account socket handshake', async () => {
    const { token } = await makeUser({ isEmailVerified: false });
    const socket = open(url, { auth: { token } }, sockets);
    await expect(connected(socket)).rejects.toThrow();
  });
  it('retains valid authenticated message delivery', async () => {
    const sender = await makeUser();
    const recipient = await makeUser();
    const socket = open(url, { auth: { token: signAccessToken(sender.user) } }, sockets);
    await connected(socket);
    const reply = await new Promise(resolve => socket.emit('send_message', { recipient: recipient.user._id.toString(), text: 'Local test message' }, resolve));
    expect(reply.ok).toBe(true);
    expect(reply.id).toBeDefined();
  });
});
