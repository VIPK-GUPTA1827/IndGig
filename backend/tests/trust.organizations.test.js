const request = require('supertest');
const app = require('../app');
const Gig = require('../models/Gig');
const { makeUser } = require('./helpers');

describe('Profiles Trust & Organization Isolation (Phase D)', () => {
  let adminUser, devUser, clientA, clientB, recruiterUser;

  beforeEach(async () => {
    adminUser = await makeUser({ role: 'admin', isEmailVerified: true });
    devUser = await makeUser({ role: 'freelancer', isEmailVerified: true, isDiscoverable: true });
    clientA = await makeUser({ role: 'client', isEmailVerified: true });
    clientB = await makeUser({ role: 'client', isEmailVerified: true });
    recruiterUser = await makeUser({ role: 'client', isEmailVerified: true });
  });

  it('prevents fake badge spoofing and hides expired or revoked badges', async () => {
    // Freelancer cannot self-assign verificationBadge
    await request(app)
      .put('/api/freelancer/profile')
      .set('Authorization', `Bearer ${devUser.token}`)
      .send({ verificationBadge: true, headline: 'Verified Hacker' });

    let dir = await request(app).get('/api/freelancers');
    expect(dir.body.data[0].verificationBadge).toBe(false);

    // Non-admin cannot verify
    const nonAdmin = await request(app)
      .put(`/api/admin/users/${devUser.user._id}/verify`)
      .set('Authorization', `Bearer ${clientA.token}`)
      .send({ technicalStatus: 'approved' });
    expect(nonAdmin.status).toBe(403);

    // Admin approves with future validity
    const future = new Date(Date.now() + 86400000).toISOString();
    const ok = await request(app)
      .put(`/api/admin/users/${devUser.user._id}/verify`)
      .set('Authorization', `Bearer ${adminUser.token}`)
      .send({ technicalStatus: 'approved', validUntil: future });
    expect(ok.status).toBe(200);
    expect(ok.body.data.verificationBadge).toBe(true);

    dir = await request(app).get('/api/freelancers');
    expect(dir.body.data[0].verificationBadge).toBe(true);

    // Admin revokes -> hidden in directory
    await request(app)
      .put(`/api/admin/users/${devUser.user._id}/verify`)
      .set('Authorization', `Bearer ${adminUser.token}`)
      .send({ technicalStatus: 'revoked', identityStatus: 'pending' });

    dir = await request(app).get('/api/freelancers');
    expect(dir.body.data[0].verificationBadge).toBe(false);
  });

  it('enforces organization isolation, single-use invites, and member removal', async () => {
    const orgA = await request(app)
      .post('/api/organizations')
      .set('Authorization', `Bearer ${clientA.token}`)
      .send({ name: 'Acme Tech', website: 'https://acme.example' });
    expect(orgA.status).toBe(201);
    const orgAId = orgA.body.data._id;

    const orgB = await request(app)
      .post('/api/organizations')
      .set('Authorization', `Bearer ${clientB.token}`)
      .send({ name: 'Beta Studio' });
    const orgBId = orgB.body.data._id;

    await Gig.create({
      title: 'Org A Internal Project',
      description: 'Scoped organization project with sufficient description length.',
      category: 'Web Development',
      budget: 40000,
      client: clientA.user._id,
      organization: orgAId,
      status: 'open'
    });

    // Invite recruiter to Org A
    const inv = await request(app)
      .post(`/api/organizations/${orgAId}/invites`)
      .set('Authorization', `Bearer ${clientA.token}`)
      .send({ email: recruiterUser.user.email, role: 'recruiter' });
    expect(inv.status).toBe(201);

    // Accept invite once
    const accept = await request(app)
      .post(`/api/organizations/invites/${inv.body.inviteToken}/accept`)
      .set('Authorization', `Bearer ${recruiterUser.token}`);
    expect(accept.status).toBe(200);
    const membershipId = accept.body.data._id;

    // Replay same invite token fails
    const replay = await request(app)
      .post(`/api/organizations/invites/${inv.body.inviteToken}/accept`)
      .set('Authorization', `Bearer ${clientB.token}`);
    expect(replay.status).toBe(400);

    // Recruiter can access Org A projects, blocked from Org B
    const okProj = await request(app)
      .get(`/api/organizations/${orgAId}/projects`)
      .set('Authorization', `Bearer ${recruiterUser.token}`);
    expect(okProj.status).toBe(200);
    expect(okProj.body.data.length).toBe(1);

    const crossOrg = await request(app)
      .get(`/api/organizations/${orgBId}/projects`)
      .set('Authorization', `Bearer ${recruiterUser.token}`);
    expect(crossOrg.status).toBe(403);

    // Owner removes recruiter -> immediate access loss
    const rem = await request(app)
      .patch(`/api/organizations/${orgAId}/members/${membershipId}`)
      .set('Authorization', `Bearer ${clientA.token}`)
      .send({ status: 'removed' });
    expect(rem.status).toBe(200);

    const afterRemove = await request(app)
      .get(`/api/organizations/${orgAId}/projects`)
      .set('Authorization', `Bearer ${recruiterUser.token}`);
    expect(afterRemove.status).toBe(403);
  });
});
