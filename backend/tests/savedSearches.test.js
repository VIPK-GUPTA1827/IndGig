const request = require('supertest');
const app = require('../app');
const Gig = require('../models/Gig');
const SavedSearch = require('../models/SavedSearch');
const Notification = require('../models/Notification');
const { dispatchInstantAlertsForGig, runDailyDigest } = require('../utils/savedSearchMatcher');
const { makeUser } = require('./helpers');

describe('Saved Searches & Matching Alerts (Phase C)', () => {
  let freelancer, otherUser, clientUser;

  beforeEach(async () => {
    freelancer = await makeUser({ role: 'freelancer', isEmailVerified: true });
    otherUser = await makeUser({ role: 'freelancer', isEmailVerified: true });
    clientUser = await makeUser({ role: 'client', isEmailVerified: true });
  });

  it('supports owner-scoped saved search CRUD and blocks other users', async () => {
    const created = await request(app)
      .post('/api/saved-searches')
      .set('Authorization', `Bearer ${freelancer.token}`)
      .send({
        name: 'Remote React Gigs',
        type: 'projects',
        frequency: 'instant',
        filters: { search: 'react', minBudget: 15000, maxBudget: 60000 }
      });
    expect(created.status).toBe(201);
    const id = created.body.data._id;

    const listRes = await request(app)
      .get('/api/saved-searches')
      .set('Authorization', `Bearer ${freelancer.token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBe(1);

    const wrongPatch = await request(app)
      .patch(`/api/saved-searches/${id}`)
      .set('Authorization', `Bearer ${otherUser.token}`)
      .send({ enabled: false });
    expect(wrongPatch.status).toBe(404);

    const pauseRes = await request(app)
      .patch(`/api/saved-searches/${id}`)
      .set('Authorization', `Bearer ${freelancer.token}`)
      .send({ enabled: false });
    expect(pauseRes.status).toBe(200);
    expect(pauseRes.body.data.enabled).toBe(false);

    const delRes = await request(app)
      .delete(`/api/saved-searches/${id}`)
      .set('Authorization', `Bearer ${freelancer.token}`);
    expect(delRes.status).toBe(200);
  });

  it('dispatches instant alert once per matching open gig and skips drafts/duplicates', async () => {
    await SavedSearch.create({
      owner: freelancer.user._id,
      type: 'projects',
      name: 'React Alerts',
      filters: { search: 'react', minBudget: 10000 },
      frequency: 'instant',
      enabled: true
    });

    const draftGig = await Gig.create({
      title: 'React Draft Project',
      description: 'Draft project description long enough for schema validation.',
      category: 'Web Development',
      budget: 25000,
      client: clientUser.user._id,
      status: 'draft'
    });
    expect(await dispatchInstantAlertsForGig(app, draftGig)).toBe(0);

    const openGig = await Gig.create({
      title: 'React Admin Portal',
      description: 'Build a React admin portal with clean UI and API integration.',
      category: 'Web Development',
      budget: 30000,
      client: clientUser.user._id,
      status: 'open'
    });
    expect(await dispatchInstantAlertsForGig(app, openGig)).toBe(1);
    // Re-running on edit should not duplicate alert
    expect(await dispatchInstantAlertsForGig(app, openGig)).toBe(0);

    const count = await Notification.countDocuments({
      recipient: freelancer.user._id,
      type: 'saved_search_alert'
    });
    expect(count).toBe(1);
  });

  it('daily digest skips zero matches and advances cursor when processed', async () => {
    const s = await SavedSearch.create({
      owner: freelancer.user._id,
      type: 'projects',
      name: 'Daily Rust',
      filters: { search: 'rust' },
      frequency: 'daily',
      enabled: true,
      lastProcessedAt: null
    });

    const sent = await runDailyDigest();
    expect(sent).toBe(0);

    const updated = await SavedSearch.findById(s._id);
    expect(updated.lastProcessedAt).not.toBeNull();
  });
});
