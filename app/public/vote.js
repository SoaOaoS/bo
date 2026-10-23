import { api, el, avatar, flag, POSITIONS, statusBadge, showAlert } from './common.js';

const DRAFT_KEY = 'bo-draft';
const state = { config: null, players: [], top: [], filter: 'ALL', search: '' };
const byId = new Map();

const $ = (id) => document.getElementById(id);

function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (d && Array.isArray(d.top)) {
      state.top = d.top.filter((id) => byId.has(id)).slice(0, state.config.topSize);
      $('firstName').value = d.firstName || '';
    }
  } catch { /* stockage indisponible : pas de brouillon */ }
}

function saveDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ top: state.top, firstName: $('firstName').value }));
  } catch { /* ignoré */ }
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignoré */ }
}

function playerMeta(p) {
  return [p.club, p.nationality].filter(Boolean).join(' · ');
}

function renderFilters() {
  const present = new Set(state.players.map((p) => p.position));
  const options = [['ALL', 'Tous'], ...Object.entries(POSITIONS).filter(([k]) => present.has(k))];
  $('filters').replaceChildren(
    ...options.map(([key, label]) =>
      el('button', {
        type: 'button',
        class: `chip ${state.filter === key ? 'active' : ''}`,
        onclick: () => { state.filter = key; renderFilters(); renderPool(); },
      }, label)
    )
  );
}

function matches(p) {
  if (state.filter !== 'ALL' && p.position !== state.filter) return false;
  if (!state.search) return true;
  const hay = `${p.name} ${p.club} ${p.nationality}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return hay.includes(state.search);
}

function renderPool() {
  const full = state.top.length >= state.config.topSize;
  const list = state.players.filter(matches);
  $('pool').replaceChildren(
    ...(list.length
      ? list.map((p) => {
          const picked = state.top.includes(p.id);
          return el('button', {
            type: 'button',
            class: `player ${picked ? 'picked' : ''}`,
            disabled: picked || full,
            title: picked ? 'Déjà dans votre classement' : full ? 'Votre top 10 est complet' : 'Ajouter',
            onclick: () => addPlayer(p.id),
          },
          avatar(p),
          el('div', { class: 'info' },
            el('div', { class: 'name' }, p.name, p.position ? el('span', { class: 'pos' }, p.position) : null),
            el('div', { class: 'meta' }, playerMeta(p))));
        })
      : [el('p', { class: 'hint' }, 'Aucun joueur ne correspond.')])
  );
}

let dragFrom = null;

function renderSlots() {
  const { topSize, points } = state.config;
  const slots = [];
  for (let i = 0; i < topSize; i++) {
    const id = state.top[i];
    const p = id != null ? byId.get(id) : null;
    const li = el('li', { class: `slot ${p ? 'filled' : ''}`, dataset: { index: i } },
      el('span', { class: 'rank' }, i + 1),
      p
        ? [
            avatar(p),
            el('div', { class: 'info' },
              el('div', { class: 'name' }, p.name),
              el('div', { class: 'hint' }, p.club)),
            el('div', { class: 'actions' },
              el('button', { type: 'button', class: 'icon small', title: 'Monter', disabled: i === 0, onclick: () => move(i, i - 1) }, '↑'),
              el('button', { type: 'button', class: 'icon small', title: 'Descendre', disabled: i >= state.top.length - 1, onclick: () => move(i, i + 1) }, '↓'),
              el('button', { type: 'button', class: 'icon small danger', title: 'Retirer', onclick: () => removeAt(i) }, '✕')),
          ]
        : el('span', { class: 'empty' }, 'Choisissez un joueur'),
      el('span', { class: 'pts' }, `${points[i]} pt${points[i] > 1 ? 's' : ''}`)
    );

    if (p) {
      li.draggable = true;
      li.addEventListener('dragstart', (e) => {
        dragFrom = i;
        li.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(i));
      });
      li.addEventListener('dragend', () => li.classList.remove('dragging'));
    }
    li.addEventListener('dragover', (e) => {
      if (dragFrom == null) return;
      e.preventDefault();
      li.classList.add('drag-over');
    });
    li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      li.classList.remove('drag-over');
      if (dragFrom == null) return;
      move(dragFrom, Math.min(i, state.top.length - 1));
      dragFrom = null;
    });
    slots.push(li);
  }
  $('slots').replaceChildren(...slots);
  $('count').textContent = `(${state.top.length}/${topSize})`;
  $('jump').textContent = `Mon top 10 (${state.top.length}/${topSize}) ↓`;
  $('submit').disabled = state.top.length !== topSize;
}

function render() {
  renderPool();
  renderSlots();
  saveDraft();
}

function addPlayer(id) {
  if (state.top.includes(id) || state.top.length >= state.config.topSize) return;
  state.top.push(id);
  render();
}

function removeAt(i) {
  state.top.splice(i, 1);
  render();
}

function move(from, to) {
  if (to < 0 || to >= state.top.length || from === to) return;
  const [id] = state.top.splice(from, 1);
  state.top.splice(to, 0, id);
  render();
}

function renderAlreadyVoted(vote) {
  const messages = {
    pending: 'Votre vote a bien été enregistré. Il sera comptabilisé dès qu\'un administrateur l\'aura validé.',
    approved: 'Votre vote a été validé et est comptabilisé. Merci !',
    rejected: 'Votre vote a été refusé par un administrateur.',
  };
  const box = $('already');
  box.replaceChildren(
    el('h2', {}, `Merci ${vote.firstName} ! `, statusBadge(vote.status)),
    el('p', {}, messages[vote.status]),
    el('ol', {}, vote.top.map((p) => el('li', {}, flag(p.country), ' ', el('strong', {}, p.name), ` — ${p.club}`))),
    state.config.resultsPublic ? el('a', { class: 'btn', href: '/results' }, 'Voir les résultats') : null
  );
  box.classList.remove('hidden');
}

async function submitVote(e) {
  e.preventDefault();
  const msg = $('form-msg');
  msg.replaceChildren();
  const firstName = $('firstName').value.trim();
  if (!firstName) return showAlert(msg, 'error', 'Indiquez votre prénom.');
  if (state.top.length !== state.config.topSize) return showAlert(msg, 'error', 'Complétez votre top 10.');
  if (!confirm(`Confirmer votre vote ? Vous ne pourrez plus le modifier.\n\n${state.top.map((id, i) => `${i + 1}. ${byId.get(id).name}`).join('\n')}`)) return;

  $('submit').disabled = true;
  try {
    await api('/api/votes', {
      method: 'POST',
      body: { firstName, code: $('code').value, top: state.top },
    });
    clearDraft();
    const { vote } = await api('/api/me');
    $('vote-area').classList.add('hidden');
    $('jump').classList.add('hidden');
    renderAlreadyVoted(vote);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    showAlert(msg, 'error', err.message);
    $('submit').disabled = false;
  }
}

async function init() {
  try {
    const [config, players, me] = await Promise.all([api('/api/config'), api('/api/players'), api('/api/me')]);
    state.config = config;
    state.players = players;
    players.forEach((p) => byId.set(p.id, p));

    if (me.vote && me.vote.status !== 'rejected') return renderAlreadyVoted(me.vote);
    if (me.vote) renderAlreadyVoted(me.vote);
    if (!config.votingOpen) {
      return showAlert($('global-msg'), 'info', 'Les votes sont actuellement fermés.');
    }

    if (config.codeMode === 'disabled') $('code-row').classList.add('hidden');
    if (config.codeMode === 'required') {
      $('code').required = true;
      $('code-optional').textContent = '(obligatoire)';
      $('code-hint').textContent = 'Le code vous a été transmis par l\'organisateur. Il n\'est utilisable qu\'une seule fois.';
    }

    loadDraft();
    renderFilters();
    render();
    $('vote-area').classList.remove('hidden');
    $('jump').classList.remove('hidden');
    $('jump').addEventListener('click', () => $('ranking').scrollIntoView({ behavior: 'smooth' }));
    $('search').addEventListener('input', (e) => {
      state.search = e.target.value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
      renderPool();
    });
    $('firstName').addEventListener('input', saveDraft);
    $('vote-form').addEventListener('submit', submitVote);
  } catch (err) {
    showAlert($('global-msg'), 'error', `Impossible de charger l'application : ${err.message}`);
  }
}

init();
