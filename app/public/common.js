// Fonctions partagées entre les pages.

export async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
    credentials: 'same-origin',
  });
  const data = res.headers.get('content-type')?.includes('application/json') ? await res.json() : null;
  if (!res.ok) {
    const err = new Error(data?.error || `Erreur ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function flag(country, cls = 'flag') {
  if (!country) return null;
  const img = el('img', { class: cls, src: `https://flagcdn.com/w40/${country}.png`, alt: '', loading: 'lazy' });
  img.addEventListener('error', () => img.remove());
  return img;
}

export function initials(name) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function avatar(player) {
  return el('div', { class: 'avatar' }, initials(player.name), flag(player.country));
}

export const POSITIONS = { GK: 'Gardien', DEF: 'Défenseur', MIL: 'Milieu', ATT: 'Attaquant' };

export function statusBadge(status) {
  const labels = { pending: 'En attente', approved: 'Validé', rejected: 'Refusé' };
  return el('span', { class: `badge ${status}` }, labels[status] || status);
}

export function showAlert(container, type, message) {
  container.replaceChildren(el('div', { class: `alert ${type}` }, message));
}
