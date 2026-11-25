const request = require('supertest');
const app = require('../app');
const Gig = require('../models/Gig');
const ProjectInvite = require('../models/ProjectInvite');
const Notification = require('../models/Notification');
const { makeUser } = require('./helpers');

describe('Shortlists and Project Invitations (Phase B)', () => {
  let clientA, clientB, devUser, openGig;

  beforeEach(async () => {
    clientA = await makeUser({ role: 'client', isEmailVerified: true });
    clientB = await makeUser({ role: 'client', isEmailVerified: true });
    devUser = await makeUser({ role: 'freelancer', isEmailVerified: true, hourlyRate: 1500 });

    openGig = await Gig.create({
      title: 'React Dashboard Build',
      description: 'Build an analytics dashboard with React and Tailwind CSS cleanly.',
      category: 'Web Development',
      budget: 25000,
      client: clientA.user._id,
      status: 'open'
    });
  });

  it('allows client to shortlist idempotently and blocks unauthorized delete', async () => {
    const first = await request(app)
      .post('/api/shortlists')
      .set('Authorization', `Bearer ${clientA.token}`)
      .send({ freelancerId: devUser.user._id });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post('/api/shortlists')
      .set('Authorization', `Bearer ${clientA.token}`)
      .send({ freelancerId: devUser.user._id });
    expect(second.status).toBe(200);

    const listRes = await request(app)
      .get('/api/shortlists')
      .set('Authorization', `Bearer ${clientA.token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBe(1);

    const wrongDelete = await request(app)
      .delete(`/api/shortlists/${first.body.data._id}`)
      .set('Authorization', `Bearer ${clientB.token}`);
    expect(wrongDelete.status).toBe(404);

    const okDelete = await request(app)
      .delete(`/api/shortlists/${first.body.data._id}`)
      .set('Authorization', `Bearer ${clientA.token}`);
    expect(okDelete.status).toBe(200);
  });

  it('enforces invite ownership, idempotency, expiry and freelancer acceptance', async () => {
    // Non-owner client rejected
    const nonOwner = await request(app)
      .post(`/api/gigs/${openGig._id}/invites`)
      .set('Authorization', `Bearer ${clientB.token}`)
      .send({ freelancerId: devUser.user._id });
    expect(nonOwner.status).toBe(403);

    // Owner sends invite
    const created = await request(app)
      .post(`/api/gigs/${openGig._id}/invites`)
      .set('Authorization', `Bearer ${clientA.token}`)
      .send({ freelancerId: devUser.user._id, message: 'Interested in working together?' });
    expect(created.status).toBe(201);

    // Duplicate click returns existing invite without duplicate notification
    const dup = await request(app)
      .post(`/api/gigs/${openGig._id}/invites`)
      .set('Authorization', `Bearer ${clientA.token}`)
      .send({ freelancerId: devUser.user._id });
    expect(dup.status).toBe(200);
    expect(dup.body.duplicate).toBe(true);

    const notifs = await Notification.countDocuments({ recipient: devUser.user._id, type: 'invite_received' });
    expect(notifs).toBe(1);

    // Client cannot accept on freelancer's behalf
    const wrongAccept = await request(app)
      .patch(`/api/invites/${created.body.data._id}`)
      .set('Authorization', `Bearer ${clientA.token}`)
      .send({ status: 'accepted' });
    expect(wrongAccept.status).toBe(400);

    // Freelancer accepts
    const accept = await request(app)
      .patch(`/api/invites/${created.body.data._id}`)
      .set('Authorization', `Bearer ${devUser.token}`)
      .send({ status: 'accepted' });
    expect(accept.status).toBe(200);
    expect(accept.body.data.status).toBe('accepted');
  });

  it('rejects expired invitations', async () => {
    const expiredInvite = await ProjectInvite.create({
      project: openGig._id,
      client: clientA.user._id,
      freelancer: devUser.user._id,
      status: 'pending',
      expiresAt: new Date(Date.now() - 60000)
    });

    const res = await request(app)
      .patch(`/api/invites/${expiredInvite._id}`)
      .set('Authorization', `Bearer ${devUser.token}`)
      .send({ status: 'accepted' });
    expect(res.status).toBe(400);
  });
});
