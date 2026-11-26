const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const config = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'supabase.sql'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'migration_notifications.sql'), 'utf8');

function core() {
  const end = js.indexOf('\n(() => {');
  assert.ok(end > 0, 'core helpers should remain isolated before the app bootstrap');
  const context = { window: { YSBackend: {} } };
  vm.runInNewContext(js.slice(0, end), context);
  return context.window.YSCore;
}

test('calculator keeps arithmetic precedence and rejects unsafe expressions', () => {
  const { evaluateExpression } = core();
  assert.equal(evaluateExpression('1+2*3'), 7);
  assert.equal(evaluateExpression('(1+2)*3'), 9);
  assert.equal(evaluateExpression('20%'), 0.2);
  assert.throws(() => evaluateExpression('1/0'), /القسمة على صفر/);
  assert.throws(() => evaluateExpression('window.alert(1)'), /غير صالحة/);
});

test('calculator uses a balanced 4-column key layout', () => {
  const grid = html.match(/<div class="calc-grid"[^>]*>([\s\S]*?)<\/div>/)?.[1] || '';
  const keys = grid.match(/class="ck(?:\s+[^"]+)?"/g) || [];
  assert.equal(keys.length, 21, 'five complete rows and one full-width equals row');
  assert.match(grid, /class=\"ck eq\"/);
  assert.match(grid, /data-c="="/);
  assert.match(css, /\.calc-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /\.ck\.eq\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
});

test('developer notifications support broadcast and developer-only audiences', () => {
  assert.match(html, /<option value="all">/);
  assert.match(html, /<option value="developers">/);
  assert.match(js, /createUserNotifications\(/);
  assert.match(config, /async function createUserNotifications\(/);
  assert.match(config, /Range-Unit/);
  assert.match(config, /pageSize = 500/);
});

test('new registration notifications fan out to every developer in the database', () => {
  const trigger = sql.match(/create or replace function public\.handle_new_auth_user\(\)([\s\S]*?)\$\$;/)?.[1] || '';
  assert.match(trigger, /insert into public\.user_notifications/i);
  assert.match(trigger, /from public\.app_user_roles/i);
  assert.match(trigger, /role\s*=\s*'developer'/i);
});

test('developer profile query exposes developer status for audience targeting', () => {
  const fn = sql.match(/create(?: or replace)? function public\.admin_list_profiles\(\)([\s\S]*?)\$\$;/)?.[1] || '';
  assert.match(fn, /is_developer/i);
  assert.match(fn, /app_user_roles/i);
  assert.match(migration, /create policy \"notification_insert_developer_only\"/i);
  assert.match(migration, /create trigger on_auth_user_created_yourself/i);
});

test('earnings catch-up has no ten-year hard stop and rounds saved amounts to cents', () => {
  assert.doesNotMatch(js, /scanned\s*<\s*3660/);
  assert.match(js, /roundMoney\(/);
  assert.match(js, /while\s*\(cursor\s*<\s*targetDate\)/);
});

test('new themes are selectable and stored as named themes', () => {
  assert.match(html, /data-theme="forest"/);
  assert.match(html, /data-theme="night"/);
  assert.match(html, /data-theme="ocean"/);
  assert.match(js, /const themes\s*=\s*\['forest',\s*'night',\s*'ocean',\s*'sand'\]/);
});
