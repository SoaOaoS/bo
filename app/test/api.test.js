import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';

let server;
let base;
const PASSWORD = 'motdepasse-test';

before(async () => {
  const app = createApp({ db: openDb(':memory:'), adminPassword: PASSWORD, sessionSecret: 'test' });
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

async function call(path, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get('set-cookie');
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  return { status: res.status, data, cookie: setCookie?.split(';')[0] };
}

async function login() {
  const r = await call('/api/admin/login', { method: 'POST', body: { password: PASSWORD } });
  assert.equal(r.status, 200);
  return r.cookie;
}

test('la banque contient les 30 nommés', async () => {
  const { data } = await call('/api/players');
  assert.equal(data.length, 30);
  assert.ok(data.some((p) => p.name === 'Ousmane Dembélé'));
});

test('flux complet : vote en attente, validation admin, résultats', async () => {
  const { data: players } = await call('/api/players');
  const top = players.slice(0, 10).map((p) => p.id);

  const bad = await call('/api/votes', { method: 'POST', body: { firstName: 'Léa', top: top.slice(0, 9) } });
  assert.equal(bad.status, 400);

  const dupPlayers = await call('/api/votes', { method: 'POST', body: { firstName: 'Léa', top: [...top.slice(0, 9), top[0]] } });
  assert.equal(dupPlayers.status, 400);

  const v1 = await call('/api/votes', { method: 'POST', body: { firstName: 'Léa', top } });
  assert.equal(v1.status, 201);
  assert.equal(v1.data.status, 'pending');

  // Même appareil : refusé.
  const again = await call('/api/votes', { method: 'POST', body: { firstName: 'Paul', top }, cookie: v1.cookie });
  assert.equal(again.status, 409);

  // Même prénom (accents/casse ignorés) : refusé.
  const sameName = await call('/api/votes', { method: 'POST', body: { firstName: ' lea ', top } });
  assert.equal(sameName.status, 409);

  // Résultats privés par défaut.
  assert.equal((await call('/api/results')).status, 403);

  const admin = await login();
  assert.equal((await call('/api/admin/votes')).status, 401);
  const pending = await call('/api/admin/votes?status=pending', { cookie: admin });
  assert.equal(pending.data.length, 1);

  assert.equal((await call(`/api/admin/votes/${v1.data.id}/approve`, { method: 'POST', cookie: admin })).status, 200);

  const results = await call('/api/results', { cookie: admin });
  assert.equal(results.data.approvedVotes, 1);
  assert.equal(results.data.ranking[0].id, top[0]);
  assert.equal(results.data.ranking[0].points, 15);
  assert.equal(results.data.ranking[9].points, 1);

  const me = await call('/api/me', { cookie: v1.cookie });
  assert.equal(me.data.vote.status, 'approved');
});

test('code d\'invitation : validation automatique et usage unique', async () => {
  const admin = await login();
  const { data } = await call('/api/admin/codes', { method: 'POST', body: { count: 1 }, cookie: admin });
  const [code] = data.codes;
  const { data: players } = await call('/api/players');
  const top = players.slice(10, 20).map((p) => p.id);

  const v = await call('/api/votes', { method: 'POST', body: { firstName: 'Hugo', top, code: code.toLowerCase().replace('-', '') } });
  assert.equal(v.status, 201);
  assert.equal(v.data.status, 'approved');

  const reuse = await call('/api/votes', { method: 'POST', body: { firstName: 'Inès', top, code } });
  assert.equal(reuse.status, 409);

  const invalid = await call('/api/votes', { method: 'POST', body: { firstName: 'Inès', top, code: 'ZZZZ-ZZZZ' } });
  assert.equal(invalid.status, 400);
});

test('paramètres : code obligatoire et votes fermés', async () => {
  const admin = await login();
  const { data: players } = await call('/api/players');
  const top = players.slice(0, 10).map((p) => p.id);

  await call('/api/admin/settings', { method: 'PUT', body: { codeMode: 'required', resultsPublic: true }, cookie: admin });
  assert.equal((await call('/api/votes', { method: 'POST', body: { firstName: 'Zoé', top } })).status, 400);
  assert.equal((await call('/api/results')).status, 200);

  await call('/api/admin/settings', { method: 'PUT', body: { votingOpen: false }, cookie: admin });
  assert.equal((await call('/api/votes', { method: 'POST', body: { firstName: 'Zoé', top } })).status, 403);
});

test('mauvais mot de passe admin refusé', async () => {
  const r = await call('/api/admin/login', { method: 'POST', body: { password: 'nope' } });
  assert.equal(r.status, 401);
});
