const AppError = require('./AppError');
const TIME = /^(\d{1,2}):([0-5]\d)$/;
function normalizeTime(value) {
  if (typeof value !== 'string') throw new AppError('Invalid booking time', 400);
  const m = TIME.exec(value);
  if (!m || Number(m[1]) > 23) throw new AppError('Time must use 24-hour HH:MM format', 400);
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}
function timeRange(start, end) {
  const startTime = normalizeTime(start);
  const endTime = normalizeTime(end);
  if (startTime >= endTime) throw new AppError('Start time must be before end time', 400);
  return { startTime, endTime };
}
function bookingDate(value) {
  // Preserve the existing UTC calendar-day model, accepting ISO date or timestamp.
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)) {
    throw new AppError('Invalid booking date', 400);
  }
  const day = value.slice(0, 10);
  const date = new Date(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day || !Number.isFinite(Date.parse(value))) {
    throw new AppError('Invalid booking date', 400);
  }
  // ISO timestamps keep the original UTC-day interpretation.
  const parsed = new Date(value);
  parsed.setUTCHours(0, 0, 0, 0);
  return parsed;
}
module.exports = { normalizeTime, timeRange, bookingDate };
