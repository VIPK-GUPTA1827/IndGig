const SavedSearch = require('../models/SavedSearch');
const AlertDelivery = require('../models/AlertDelivery');
const Gig = require('../models/Gig');
const User = require('../models/User');
const { sendNotification } = require('./notifications');
const { getTransporter, getSenderEmail } = require('./mailer');

function matchesProject(savedSearch, gig) {
  if (!gig || gig.status !== 'open') return false;
  if (String(gig.client) === String(savedSearch.owner)) return false;

  const f = savedSearch.filters || {};
  if (f.category && f.category !== 'All' && gig.category !== f.category) {
    return false;
  }

  const budget = Number(gig.budget) || 0;
  if (Number.isFinite(f.minBudget) && f.minBudget > 0 && budget < f.minBudget) {
    return false;
  }
  if (Number.isFinite(f.maxBudget) && f.maxBudget > 0 && budget > f.maxBudget) {
    return false;
  }
  if (f.workPreference && f.workPreference !== 'all' && gig.locationType && gig.locationType !== f.workPreference) {
    return false;
  }

  const haystack = `${gig.title || ''} ${gig.description || ''} ${(gig.skillsRequired || []).join(' ')}`.toLowerCase();
  if (f.search && !haystack.includes(f.search.toLowerCase())) {
    return false;
  }
  if (Array.isArray(f.skills) && f.skills.length > 0) {
    const anySkill = f.skills.some((s) => s && haystack.includes(String(s).toLowerCase()));
    if (!anySkill) return false;
  }

  return true;
}

async function dispatchInstantAlertsForGig(app, gig) {
  if (!gig || gig.status !== 'open') return 0;

  const searches = await SavedSearch.find({
    type: 'projects',
    enabled: true,
    frequency: 'instant'
  }).lean();

  let sent = 0;
  for (const search of searches) {
    if (!matchesProject(search, gig)) continue;

    try {
      await AlertDelivery.create({
        savedSearch: search._id,
        project: gig._id,
        channel: 'in_app'
      });
    } catch (err) {
      if (err.code === 11000) continue; // Already alerted for this gig + search
      throw err;
    }

    await sendNotification(
      app,
      search.owner,
      gig.client,
      'saved_search_alert',
      `Match for "${search.name}"`,
      `New project "${gig.title}" (₹${Number(gig.budget || 0).toLocaleString('en-IN')}) matches your saved search.`,
      gig._id,
      { email: false }
    );
    sent += 1;
  }
  return sent;
}

async function runDailyDigest() {
  const searches = await SavedSearch.find({
    type: 'projects',
    enabled: true,
    frequency: 'daily'
  });

  let emailsSent = 0;
  for (const search of searches) {
    const since = search.lastProcessedAt || search.createdAt || new Date(Date.now() - 24 * 60 * 60 * 1000);
    const now = new Date();

    const candidateGigs = await Gig.find({
      status: 'open',
      createdAt: { $gt: since, $lte: now }
    }).lean();

    const matched = [];
    for (const gig of candidateGigs) {
      if (!matchesProject(search, gig)) continue;
      const alreadyDelivered = await AlertDelivery.exists({
        savedSearch: search._id,
        project: gig._id,
        channel: 'email'
      });
      if (!alreadyDelivered) matched.push(gig);
    }

    // Skip empty emails when zero results match
    if (matched.length === 0) {
      search.lastProcessedAt = now;
      await search.save();
      continue;
    }

    const owner = await User.findById(search.owner).select('email name username');
    if (!owner || !owner.email) continue;

    const transporter = await getTransporter();
    if (transporter) {
      const lines = matched.slice(0, 10).map((g) => `- ${g.title} (₹${Number(g.budget || 0).toLocaleString('en-IN')})`).join('\n');
      await transporter.sendMail({
        from: getSenderEmail(),
        to: owner.email,
        subject: `${matched.length} new project(s) matching "${search.name}" — IndGig`,
        text: `Hi ${owner.name || owner.username},\n\nNew open projects match your saved search "${search.name}":\n\n${lines}\n\nVisit IndGig Marketplace to apply.`
      });
    }

    for (const gig of matched) {
      await AlertDelivery.updateOne(
        { savedSearch: search._id, project: gig._id, channel: 'email' },
        { $setOnInsert: { savedSearch: search._id, project: gig._id, channel: 'email' } },
        { upsert: true }
      );
    }

    search.lastProcessedAt = now;
    await search.save();
    emailsSent += 1;
  }

  return emailsSent;
}

module.exports = {
  matchesProject,
  dispatchInstantAlertsForGig,
  runDailyDigest
};
