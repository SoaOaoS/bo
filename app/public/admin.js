import { api, el, flag, POSITIONS, statusBadge, showAlert } from './common.js';

const $ = (id) => document.getElementById(id);
const state = { voteFilter: 'pending', codes: [], players: [] };

function notify(type, message) {
  showAlert($('msg'), type, message);
  if (type === 'success') setTimeout(() => $('msg').replaceChildren(), 3000);
}

async function guard(fn) {
  try {
    await fn();
  } catch (err) {
    if (err.status === 401) return showLogin();
    notify('error', err.message);
  }
}

// --- Connexion ---

function showLogin() {
  $('panel').classList.add('hidden');
  $('login').classList.remove('hidden');
  $('password').focus();
}

async function showPanel() {
  $('login').classList.add('hidden');
  $('panel').classList.remove('hidden');
  await Promise.all([loadVotes(), loadSettings()]);
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/admin/login', { method: 'POST', body: { password: $('password').value } });
    $('password').value = '';
    $('login-msg').replaceChildren();
    await showPanel();
  } catch (err) {
    showAlert($('login-msg'), 'error', err.message);
  }
});

$('logout').addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST' });
  showLogin();
});

// --- Onglets ---

$('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-tab]');
  if (!btn) return;
  const tab = btn.dataset.tab;
  for (const b of $('tabs').querySelectorAll('button')) b.classList.toggle('active', b === btn);
  for (const p of document.querySelectorAll('[data-panel]')) p.classList.toggle('hidden', p.dataset.panel !== tab);
  $('msg').replaceChildren();
  if (tab === 'votes') guard(loadVotes);
  if (tab === 'codes') guard(loadCodes);
  if (tab === 'players') guard(loadPlayers);
  if (tab === 'settings') guard(loadSettings);
});

// --- Votes ---

function renderVoteFilters() {
  const options = [['pending', 'En attente'], ['approved', 'Validés'], ['rejected', 'Refusés'], ['', 'Tous']];
  $('vote-filters').replaceChildren(
    ...options.map(([key, label]) =>
      el('button', {
        type: 'button',
        class: `chip ${state.voteFilter === key ? 'active' : ''}`,
        onclick: () => { state.voteFilter = key; guard(loadVotes); },
      }, label))
  );
}

async function voteAction(id, action) {
  await guard(async () => {
    if (action === 'delete') {
      if (!confirm('Supprimer définitivement ce vote ?')) return;
      await api(`/api/admin/votes/${id}`, { method: 'DELETE' });
    } else {
      await api(`/api/admin/votes/${id}/${action}`, { method: 'POST' });
    }
    await loadVotes();
  });
}

async function loadVotes() {
  renderVoteFilters();
  const [votes, pending] = await Promise.all([
    api(`/api/admin/votes${state.voteFilter ? `?status=${state.voteFilter}` : ''}`),
    api('/api/admin/votes?status=pending'),
  ]);
  $('pending-count').textContent = pending.length ? `(${pending.length})` : '';

  // Repère les prénoms proches pour aider à détecter les doublons.
  const all = state.voteFilter === '' ? votes : await api('/api/admin/votes');
  const firstWord = (n) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/)[0];
  const nameCount = new Map();
  for (const v of all) if (v.status !== 'rejected') nameCount.set(firstWord(v.firstName), (nameCount.get(firstWord(v.firstName)) || 0) + 1);

  if (!votes.length) {
    $('votes').replaceChildren(el('p', { class: 'hint' }, 'Aucun vote dans cette catégorie.'));
    return;
  }

  $('votes').replaceChildren(
    ...votes.map((v) => {
      const flags = [];
      if (v.code) flags.push(el('span', { class: 'badge approved' }, `Code ${v.code}`));
      if (v.sameIpCount > 0) flags.push(el('span', { class: 'badge pending' }, `⚠ ${v.sameIpCount} autre(s) vote(s) depuis la même adresse IP`));
      if ((nameCount.get(firstWord(v.firstName)) || 0) > 1) flags.push(el('span', { class: 'badge pending' }, '⚠ Prénom similaire à un autre vote'));

      return el('div', { class: 'vote-card' },
        el('div', {},
          el('div', { class: 'row' }, el('strong', {}, v.firstName), statusBadge(v.status),
            el('span', { class: 'hint' }, `n°${v.id} · ${new Date(v.createdAt + 'Z').toLocaleString('fr-FR')}`)),
          flags.length ? el('div', { class: 'flags' }, flags) : null,
          el('ol', { class: 'top' }, v.top.map((p) => el('li', {}, p.name)))),
        el('div', { class: 'acts' },
          v.status !== 'approved' ? el('button', { type: 'button', class: 'ok small', onclick: () => voteAction(v.id, 'approve') }, 'Valider') : null,
          v.status !== 'rejected' ? el('button', { type: 'button', class: 'danger small', onclick: () => voteAction(v.id, 'reject') }, 'Refuser') : null,
          el('button', { type: 'button', class: 'small', onclick: () => voteAction(v.id, 'delete') }, 'Supprimer')));
    })
  );
}

// --- Codes ---

async function loadCodes() {
  state.codes = await api('/api/admin/codes');
  $('codes').replaceChildren(
    ...(state.codes.length
      ? state.codes.map((c) =>
          el('tr', {},
            el('td', {}, el('strong', {}, c.code)),
            el('td', {}, c.label),
            el('td', {}, c.usedAt ? el('span', { class: 'badge approved' }, `Utilisé par ${c.usedBy ?? '—'}`) : el('span', { class: 'badge pending' }, 'Disponible')),
            el('td', {}, c.usedAt ? null : el('button', {
              type: 'button', class: 'small danger',
              onclick: () => guard(async () => { await api(`/api/admin/codes/${c.id}`, { method: 'DELETE' }); await loadCodes(); }),
            }, 'Supprimer'))))
      : [el('tr', {}, el('td', { colspan: 4, class: 'hint' }, 'Aucun code généré.'))])
  );
}

$('codes-form').addEventListener('submit', (e) => {
  e.preventDefault();
  guard(async () => {
    const { codes } = await api('/api/admin/codes', {
      method: 'POST',
      body: { count: Number($('codes-count').value), label: $('codes-label').value },
    });
    notify('success', `${codes.length} code(s) généré(s).`);
    await loadCodes();
  });
});

$('copy-codes').addEventListener('click', async () => {
  const unused = state.codes.filter((c) => !c.usedAt).map((c) => c.code);
  if (!unused.length) return notify('info', 'Aucun code disponible.');
  try {
    await navigator.clipboard.writeText(unused.join('\n'));
    notify('success', `${unused.length} code(s) copié(s) dans le presse-papiers.`);
  } catch {
    notify('info', unused.join('  '));
  }
});

// --- Joueurs ---

function resetPlayerForm() {
  $('player-form').reset();
  $('player-id').value = '';
  $('player-form-title').textContent = 'Ajouter un joueur';
  $('player-cancel').classList.add('hidden');
}

function editPlayer(p) {
  $('player-id').value = p.id;
  $('player-name').value = p.name;
  $('player-club').value = p.club;
  $('player-nationality').value = p.nationality;
  $('player-country').value = p.country;
  $('player-position').value = p.position;
  $('player-form-title').textContent = `Modifier ${p.name}`;
  $('player-cancel').classList.remove('hidden');
  $('player-form').scrollIntoView({ behavior: 'smooth' });
}

function playerBody(p, overrides = {}) {
  return { name: p.name, club: p.club, nationality: p.nationality, country: p.country, position: p.position, active: p.active, ...overrides };
}

async function loadPlayers() {
  state.players = await api('/api/admin/players');
  $('players').replaceChildren(
    ...state.players.map((p) =>
      el('tr', {},
        el('td', {}, flag(p.country), ' ', el('strong', {}, p.name)),
        el('td', {}, p.club),
        el('td', {}, POSITIONS[p.position] || ''),
        el('td', {}, el('input', {
          type: 'checkbox', checked: p.active, 'aria-label': 'Visible',
          onchange: (e) => guard(async () => {
            await api(`/api/admin/players/${p.id}`, { method: 'PUT', body: playerBody(p, { active: e.target.checked }) });
            await loadPlayers();
          }),
        })),
        el('td', {}, el('button', { type: 'button', class: 'small', onclick: () => editPlayer(p) }, 'Modifier'))))
  );
}

$('player-form').addEventListener('submit', (e) => {
  e.preventDefault();
  guard(async () => {
    const id = $('player-id').value;
    const existing = state.players.find((p) => String(p.id) === id);
    const body = {
      name: $('player-name').value,
      club: $('player-club').value,
      nationality: $('player-nationality').value,
      country: $('player-country').value,
      position: $('player-position').value,
      active: existing ? existing.active : true,
    };
    if (id) await api(`/api/admin/players/${id}`, { method: 'PUT', body });
    else await api('/api/admin/players', { method: 'POST', body });
    notify('success', id ? 'Joueur modifié.' : 'Joueur ajouté.');
    resetPlayerForm();
    await loadPlayers();
  });
});

$('player-cancel').addEventListener('click', resetPlayerForm);

// --- Paramètres ---

async function loadSettings() {
  const s = await api('/api/admin/settings');
  $('set-voting').checked = s.votingOpen;
  $('set-results').checked = s.resultsPublic;
  $('set-code-mode').value = s.codeMode;
}

async function saveSettings() {
  await guard(async () => {
    await api('/api/admin/settings', {
      method: 'PUT',
      body: { votingOpen: $('set-voting').checked, resultsPublic: $('set-results').checked, codeMode: $('set-code-mode').value },
    });
    notify('success', 'Paramètres enregistrés.');
  });
}

for (const id of ['set-voting', 'set-results', 'set-code-mode']) $(id).addEventListener('change', saveSettings);

// --- Démarrage ---

api('/api/config').then((c) => (c.isAdmin ? showPanel() : showLogin())).catch(showLogin);
