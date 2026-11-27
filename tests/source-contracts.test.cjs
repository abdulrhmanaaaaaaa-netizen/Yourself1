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
const accountMigration = fs.readFileSync(path.join(root, 'migration_accounts_visibility.sql'), 'utf8');

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

test('save queue serializes writes and preserves the latest payload order', async () => {
  const { createSaveQueue } = core();
  const started = [];
  const finished = [];
  const queue = createSaveQueue(async payload => {
    started.push(payload.value);
    await new Promise(resolve => setTimeout(resolve, payload.delay));
    finished.push(payload.value);
    return payload.value;
  });
  const first = queue.enqueue({value: 1, delay: 8});
  const second = queue.enqueue({value: 2, delay: 0});
  assert.equal(await first, 1);
  assert.equal(await second, 2);
  assert.deepEqual(started, [1, 2]);
  assert.deepEqual(finished, [1, 2]);
  assert.equal(queue.revision, 2);
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


test('appearance themes have distinct preview palettes and update the selected state', () => {
  for (const theme of ['forest', 'night', 'ocean', 'sand']) {
    assert.match(html, new RegExp(`data-theme=\"${theme}\"[^>]*aria-pressed=`));
    assert.match(css, new RegExp(`\\.tt\\.${theme}\\s*\\{[^}]*--sw-bg:`));
  }
  const swatches = ['forest', 'night', 'ocean', 'sand'].map(theme => {
    const blocks = [...css.matchAll(new RegExp(`\\.tt\\.${theme}\\s*\\{([^}]*)\\}`, 'g'))];
    const block = blocks.at(-1)?.[1] || '';
    return block.match(/--sw-bg:\s*(#[0-9A-F]{6})/i)?.[1]?.toLowerCase();
  });
  assert.equal(new Set(swatches).size, 4, 'each theme preview must have its own background color');
  assert.match(js, /html\.dataset\.theme=theme/);
  assert.match(js, /button\.setAttribute\('aria-pressed',String\(selected\)\)/);
});

test('notification controls use a bell SVG with an anchored unread badge', () => {
  const button = html.match(/<button class=\"ib notice-toggle\"[\s\S]*?<\/button>/)?.[0] || '';
  assert.match(button, /<svg[\s\S]*?<path d=\"M18 9a6 6 0 0 0-12 0/);
  assert.match(button, /id=\"topNotificationCount\"/);
  assert.match(css, /\.notice-toggle>svg\s*\{/);
  assert.match(css, /\.notice-toggle \.nav-count\s*\{[^}]*position:absolute/s);
  assert.match(js, /topButton\.setAttribute\('aria-label'/);
});

test('12-hour clock conversion preserves midnight, noon and afternoon minutes', () => {
  const { parseTime12, time12Parts, formatTime12 } = core();
  assert.equal(parseTime12('12', '00', 'AM'), '00:00');
  assert.equal(parseTime12('12', '00', 'PM'), '12:00');
  assert.equal(parseTime12('01', '45', 'PM'), '13:45');
  assert.equal(parseTime12('11', '09', 'PM'), '23:09');
  assert.deepEqual(JSON.parse(JSON.stringify(time12Parts('00:15'))), { hour: '12', minute: '15', period: 'AM' });
  assert.deepEqual(JSON.parse(JSON.stringify(time12Parts('13:45'))), { hour: '01', minute: '45', period: 'PM' });
  assert.equal(formatTime12('21:05'), '09:05 مساءً');
  assert.throws(() => parseTime12('13', '00', 'AM'), /Invalid/);
});

test('the official brand mark is used as the app logo and favicon', () => {
  assert.match(html, /rel="icon"[^>]+yourself-logo\.jpg/);
  assert.ok(fs.existsSync(path.join(root, 'yourself-logo-mark.png')), 'transparent logo mark asset must ship with the page');
  assert.ok((html.match(/class="logo" src="\.\/yourself-logo-mark\.png"/g) || []).length >= 4);
  assert.doesNotMatch(html, /<div class="logo"[^>]*>\s*<span>Y<\/span>/);
});

test('each appearance theme defines its own brand color and forest is the default', () => {
  const lastBlock = selector => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = [...css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'gs'))];
    return matches.at(-1)?.[1] || '';
  };
  const palette = [':root', 'html.theme-night', 'html.theme-ocean', 'html.theme-sand'].map(selector => {
    const color = lastBlock(selector).match(/--brand:\s*(#[0-9A-F]{6})/i)?.[1]?.toLowerCase();
    assert.ok(color, `${selector} must define a brand color`);
    return color;
  });
  assert.equal(new Set(palette).size, 4, 'forest, night, ocean and sand each use a distinct logo/brand color');
  assert.match(js, /setTheme\(gP\(\)\.theme\|\|'forest'\)/);
  assert.match(css, /\.logo,\.auth-context-mark\s*\{[^}]*background-color:var\(--brand\)/s);
  assert.match(js, /updateThemeFavicon\(logoColors\[theme\]\)/);
  assert.match(js, /canvas\.toDataURL\('image\/png'\)/);
  assert.match(css, /\.dr-item\.on i,\.dr-item\.dev i[^}]*color:#8B9996!important/s);
  assert.match(css, /\.av-xl\{[^}]*border-radius:50%/s);
  assert.match(js, /input\.type = 'hidden'/);
  assert.match(js, /data-time-part="period"/);
  assert.match(js, /formatTime12\(p\.workStart\)/);
  assert.match(js, /formatTime12\(i\.time\)/);
});


test('avatar cropper supports drag, zoom, circular preview and a centered square export', () => {
  const { avatarCropGeometry } = core();
  const landscape = avatarCropGeometry(400, 200, 100, 1, 80, -50);
  assert.equal(landscape.width, 200);
  assert.equal(landscape.height, 100);
  assert.equal(landscape.x, 50, 'horizontal drag is clamped to keep the crop filled');
  assert.equal(landscape.y, 0, 'no vertical drag is needed for this landscape crop');
  assert.equal(landscape.left, 0);
  assert.equal(landscape.top, 0);
  const portrait = avatarCropGeometry(200, 400, 100, 1.5, 0, -200);
  assert.equal(portrait.height, 300);
  assert.equal(portrait.y, -100);
  assert.equal(portrait.top, -200);
  assert.match(js, /pointerdown/);
  assert.match(js, /pointermove/);
  assert.match(js, /avatarCropZoom/);
  assert.match(js, /context\.drawImage\(state\.image/);
  assert.match(css, /\.crop-viewport[^{]*\{[^}]*border-radius:50%/s);
});

test('sidebar uses grayscale SVG icons and contains no user portrait', () => {
  const drawer = html.match(/<aside class="drawer"[\s\S]*?<\/aside>/)?.[0] || '';
  assert.doesNotMatch(drawer, /drAvatar|avatar-img|<img/i);
  assert.ok((drawer.match(/<svg viewBox="0 0 24 24"/g) || []).length >= 12);
  assert.match(css, /\.dr-item\.on>svg[^}]*stroke:#899491!important/s);
});

test('developers can view account metadata only through a role-checked RPC', () => {
  assert.match(js, /YS\.viewUser\(/);
  assert.match(js, /async function viewUser\(/);
  assert.match(js, /u\.avatar_path/);
  assert.match(js, /app_data_updated_at/);
  assert.match(accountMigration, /create function public\.admin_list_profiles\(\)/i);
  assert.match(accountMigration, /if not public\.is_current_user_developer\(\) then/i);
  assert.match(accountMigration, /left join public\.user_data d/i);
  assert.doesNotMatch(accountMigration, /select\s+d\.payload/i);
  assert.match(accountMigration, /create policy "avatar_read_self_or_developer"/i);
  assert.match(accountMigration, /for select to authenticated/i);
  assert.match(accountMigration, /is_current_user_developer\(\)/i);
  assert.match(accountMigration, /revoke all on function public\.admin_list_profiles\(\) from public, anon/i);
});


test('developer account directory opens on all users instead of pending requests only', () => {
  assert.match(html, /class="flt on" data-df="all">كل الحسابات/);
  assert.match(js, /dFilter:'all'/);
});
