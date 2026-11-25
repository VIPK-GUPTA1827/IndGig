const request = require('supertest');
const app = require('../app');
const { makeUser } = require('./helpers');

describe('Freelancer Directory (GET /api/freelancers)', () => {
  beforeEach(async () => {
    await makeUser({
      name: 'Aarav React',
      role: 'freelancer',
      isEmailVerified: true,
      isDiscoverable: true,
      hourlyRate: 1200,
      workPreference: 'remote',
      availabilityStatus: 'available',
      headline: 'Senior React & Node.js Engineer',
      skills: [{ name: 'React', level: 'Expert' }, { name: 'Node.js', level: 'Expert' }]
    });
    await makeUser({
      name: 'Riya Python',
      role: 'freelancer',
      isEmailVerified: true,
      isDiscoverable: true,
      hourlyRate: 2500,
      workPreference: 'hybrid',
      availabilityStatus: 'limited',
      headline: 'FastAPI & ML Specialist',
      skills: [{ name: 'Python', level: 'Expert' }, { name: 'C++', level: 'Intermediate' }]
    });
    await makeUser({
      name: 'Hidden Dev',
      role: 'freelancer',
      isEmailVerified: true,
      isDiscoverable: false,
      hourlyRate: 900,
      skills: [{ name: 'React', level: 'Intermediate' }]
    });
    await makeUser({
      name: 'Suspended Dev',
      role: 'freelancer',
      isEmailVerified: true,
      isSuspended: true,
      hourlyRate: 800,
      skills: [{ name: 'React', level: 'Intermediate' }]
    });
    await makeUser({
      name: 'Unverified Dev',
      role: 'freelancer',
      isEmailVerified: false,
      hourlyRate: 700
    });
    await makeUser({
      name: 'Client Account',
      role: 'client',
      isEmailVerified: true
    });
  });

  it('returns only verified, non-suspended, discoverable freelancers without leaking private fields', async () => {
    const res = await request(app).get('/api/freelancers');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.totalCount).toBe(2);
    expect(res.body.data.map((u) => u.name).sort()).toEqual(['Aarav React', 'Riya Python']);

    for (const dev of res.body.data) {
      expect(dev.email).toBeUndefined();
      expect(dev.password).toBeUndefined();
      expect(dev.tokenVersion).toBeUndefined();
      expect(dev.walletBalance).toBeUndefined();
      expect(dev.githubId).toBeUndefined();
    }
  });

  it('filters by search, maxRate, workPreference and availabilityStatus safely', async () => {
    const res = await request(app).get('/api/freelancers?search=react&maxRate=1500&workPreference=remote&availabilityStatus=available');
    expect(res.status).toBe(200);
    expect(res.body.totalCount).toBe(1);
    expect(res.body.data[0].name).toBe('Aarav React');

    // Escaped regex special characters like C++ should not throw 500
    const cppRes = await request(app).get('/api/freelancers?search=C%2B%2B');
    expect(cppRes.status).toBe(200);
    expect(cppRes.body.totalCount).toBe(1);
    expect(cppRes.body.data[0].name).toBe('Riya Python');
  });

  it('rejects invalid query filter values with 400', async () => {
    const badRate = await request(app).get('/api/freelancers?maxRate=-50');
    expect(badRate.status).toBe(400);

    const badPref = await request(app).get('/api/freelancers?workPreference=mars');
    expect(badPref.status).toBe(400);
  });
});
