import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateExpression } from '../src/calculator.js';
import { earningsForHours, hourlyRate, scheduledHours, splitEarningsByDate } from '../src/payroll.js';

test('calculator honors operator precedence and parentheses', () => {
  assert.equal(evaluateExpression('2+3*4'), 14);
  assert.equal(evaluateExpression('(2+3)*4'), 20);
});

test('calculator handles unary operators and postfix percentage', () => {
  assert.equal(evaluateExpression('-12+20%*50'), -2);
  assert.equal(evaluateExpression('50%'), 0.5);
});

test('calculator rejects code, malformed input, and division by zero', () => {
  assert.throws(() => evaluateExpression('alert(1)'));
  assert.throws(() => evaluateExpression('1/0'), /صفر/);
  assert.throws(() => evaluateExpression('(2+3'));
});

test('monthly income converts to an hourly equivalent using 52/12 weeks', () => {
  const profile = { salary: 12000, salaryType: 'monthly', workDays: 5, workStart: '09:00', workEnd: '17:00' };
  assert.equal(scheduledHours(profile), 8);
  assert.ok(Math.abs(hourlyRate(profile) - 12000 / (5 * (52 / 12) * 8)) < 1e-10);
  assert.ok(Math.abs(earningsForHours(profile, 2) - 2 * hourlyRate(profile)) < 1e-10);
});

test('hourly income stays hourly and overnight shifts are supported', () => {
  assert.equal(hourlyRate({ salary: 125, salaryType: 'hourly' }), 125);
  assert.equal(scheduledHours({ workStart: '22:00', workEnd: '06:00' }), 8);
});

test('calculator handles decimals and rejects oversized or incomplete expressions', () => {
  assert.equal(evaluateExpression('.5+1.25'), 1.75);
  assert.throws(() => evaluateExpression('9'.repeat(121)));
  assert.throws(() => evaluateExpression('2+'));
  assert.throws(() => evaluateExpression('1e20'));
});

test('payroll rejects invalid monthly schedules and negative durations', () => {
  assert.equal(hourlyRate({ salary: 5000, salaryType: 'monthly', workDays: 8, workStart: '09:00', workEnd: '17:00' }), 0);
  assert.equal(earningsForHours({ salary: 100, salaryType: 'hourly' }, -1), 0);
});

test('manual session earnings are split across local calendar dates', () => {
  const start = new Date(2026, 0, 2, 22, 0, 0);
  const end = new Date(2026, 0, 3, 2, 0, 0);
  assert.deepEqual(splitEarningsByDate(start, end, 150), {
    '2026-01-02': 300,
    '2026-01-03': 300
  });
  assert.throws(() => splitEarningsByDate(end, start, 150));
});
