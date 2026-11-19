const User = require('../models/User');
const AppError = require('./AppError');

function validateAmount(amount) {
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0) {
    throw new AppError(
      'Wallet amount must be a positive safe integer in whole rupees', 400
    );
  }
}

/**
 * Atomically credits a user's walletBalance using $inc
 */
async function credit(userId, amount, session) {
  validateAmount(amount);
  const user = await User.findOneAndUpdate(
    { _id: userId, walletBalance: { $lte: Number.MAX_SAFE_INTEGER - amount } },
    { $inc: { walletBalance: amount } },
    { returnDocument: 'after', session }
  );
  if (!user) throw new AppError('User not found', 404);
  return user;
}

/**
 * Atomically debits a user's walletBalance if balance >= amount
 */
async function debit(userId, amount, session) {
  validateAmount(amount);
  const user = await User.findOneAndUpdate(
    { _id: userId, walletBalance: { $gte: amount } },
    { $inc: { walletBalance: -amount } },
    { returnDocument: 'after', session }
  );
  if (!user) {
    throw new AppError('Insufficient wallet balance', 400);
  }
  return user;
}

module.exports = { credit, debit };
