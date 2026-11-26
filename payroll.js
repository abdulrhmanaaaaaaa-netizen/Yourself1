const WEEKS_PER_MONTH = 52 / 12;

export function scheduledHours(profile = {}) {
  const [sh = 0, sm = 0] = String(profile.workStart || '00:00').split(':').map(Number);
  const [eh = 0, em = 0] = String(profile.workEnd || '00:00').split(':').map(Number);
  let minutes = (eh * 60 + em) - (sh * 60 + sm);
  if (minutes <= 0) minutes += 24 * 60;
  return minutes / 60;
}

export function hourlyRate(profile = {}) {
  const income = Number(profile.salary);
  if (!Number.isFinite(income) || income <= 0) return 0;
  if (profile.salaryType === 'hourly') return income;
  const days = Number(profile.workDays);
  const hours = scheduledHours(profile);
  if (!Number.isFinite(days) || days < 1 || days > 7 || hours <= 0 || hours > 24) return 0;
  return income / (days * WEEKS_PER_MONTH * hours);
}

export function earningsForHours(profile, hours) {
  const duration = Number(hours);
  if (!Number.isFinite(duration) || duration < 0) return 0;
  return hourlyRate(profile) * duration;
}

export function splitEarningsByDate(start, end, rate) {
  const from = new Date(start);
  const to = new Date(end);
  const hourly = Number(rate);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from || !Number.isFinite(hourly) || hourly < 0) {
    throw new RangeError('Invalid session range or hourly rate.');
  }

  const daily = {};
  for (let cursor = new Date(from); cursor < to;) {
    const midnight = new Date(cursor);
    midnight.setHours(24, 0, 0, 0);
    if (midnight <= cursor) throw new RangeError('Invalid local date boundary.');
    const segmentEnd = new Date(Math.min(to.getTime(), midnight.getTime()));
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    daily[key] = (daily[key] || 0) + hourly * ((segmentEnd - cursor) / 3600000);
    cursor = segmentEnd;
  }
  return daily;
}
