import { api, el, avatar, flag, showAlert } from './common.js';

const $ = (id) => document.getElementById(id);

function stat(value, label) {
  return el('div', { class: 'stat' }, el('div', { class: 'v' }, value), el('div', { class: 'l' }, label));
}

async function load() {
  try {
    const data = await api('/api/results');
    const { ranking, approvedVotes, pendingVotes } = data;

    $('stats').replaceChildren(
      stat(approvedVotes, 'votes comptabilisés'),
      stat(pendingVotes, 'votes en attente'),
      stat(ranking.length, 'joueurs cités')
    );

    if (!ranking.length) {
      showAlert($('msg'), 'info', 'Aucun vote validé pour le moment.');
      $('podium').replaceChildren();
    } else {
      $('msg').replaceChildren();
      const medals = ['🥇', '🥈', '🥉'];
      // Ordre visuel : 2e, 1er, 3e.
      $('podium').replaceChildren(
        ...[1, 0, 2]
          .filter((i) => ranking[i])
          .map((i) =>
            el('div', { class: `step ${i === 0 ? 'first' : ''}` },
              el('div', { class: 'medal' }, medals[i]),
              el('div', { class: 'pname' }, ranking[i].name),
              el('div', { class: 'hint' }, ranking[i].club),
              el('div', { class: 'ppts' }, `${ranking[i].points} pts`))
          )
      );
    }

    const max = ranking[0]?.points || 1;
    $('rows').replaceChildren(
      ...ranking.map((p, i) => {
        const bar = el('div', { class: 'bar' });
        bar.style.width = `${Math.round((p.points / max) * 100)}%`;
        return el('tr', {},
          el('td', { class: 'num' }, i + 1),
          el('td', {},
            el('div', { class: 'row' }, avatar(p),
              el('div', {}, el('strong', {}, p.name), el('div', { class: 'hint' }, flag(p.country), ' ', p.club)))),
          el('td', { class: 'num' }, el('strong', {}, p.points)),
          el('td', { class: 'num' }, p.ranks[0]),
          el('td', { class: 'num' }, p.mentions),
          el('td', { class: 'bar-cell' }, bar));
      })
    );
    $('content').classList.remove('hidden');
  } catch (err) {
    showAlert($('msg'), err.status === 403 ? 'info' : 'error', err.message);
  }
}

load();
setInterval(load, 30000);
