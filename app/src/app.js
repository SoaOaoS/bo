import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSettings, transaction, updateSettings } from './db.js';
import { POINTS, TOP_SIZE } from './players.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const ADMIN_COOKIE = 'bo_admin';
const DEVICE_COOKIE = 'bo_device';
const ADMIN_SESSION_MS = 12 * 60 * 60 * 1000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans 0/O/1/I

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// --- Utilitaires ---------------------------------------------------------

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function normalizeName(name) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function generateCode() {
  const bytes = crypto.randomBytes(8);
  let s = '';
  for (const b of bytes) s += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Limiteur très simple en mémoire : `max` tentatives par fenêtre et par clé.
function rateLimiter({ windowMs, max }) {
  const hits = new Map();
  return {
    check(key) {
      const now = Date.now();
      const entry = hits.get(key);
      if (!entry || entry.reset < now) {
        hits.set(key, { count: 1, reset: now + windowMs });
        return true;
      }
      entry.count += 1;
      return entry.count <= max;
    },
  };
}

// --- Application ---------------------------------------------------------

export function createApp({ db, adminPassword, sessionSecret, secureCookies = false, trustProxy = false }) {
  if (!adminPassword) throw new Error('ADMIN_PASSWORD doit être défini');
  const secret = sessionSecret || crypto.randomBytes(32).toString('hex');
  const app = express();
  app.disable('x-powered-by');
  if (trustProxy) app.set('trust proxy', trustProxy);

  const loginLimiter = rateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });
  const voteLimiter = rateLimiter({ windowMs: 60 * 60 * 1000, max: 20 });
  const cookieFlags = `Path=/; HttpOnly; SameSite=Strict${secureCookies ? '; Secure' : ''}`;

  const sign = (value) => crypto.createHmac('sha256', secret).update(value).digest('base64url');
  const hashIp = (ip) => crypto.createHmac('sha256', secret).update(`ip:${ip}`).digest('hex').slice(0, 16);

  function isAdmin(req) {
    const token = parseCookies(req.headers.cookie)[ADMIN_COOKIE];
    if (!token) return false;
    const [expires, sig] = token.split('.');
    if (!expires || !sig || !safeEqual(sig, sign(`admin:${expires}`))) return false;
    return Number(expires) > Date.now();
  }

  function requireAdmin(req, _res, next) {
    if (!isAdmin(req)) return next(new HttpError(401, 'Authentification administrateur requise'));
    next();
  }

  app.use((_req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
      'Content-Security-Policy':
        "default-src 'self'; img-src 'self' data: https://flagcdn.com; style-src 'self'; script-src 'self'; frame-ancestors 'none'",
    });
    next();
  });
  app.use(express.json({ limit: '20kb' }));

  // --- Requêtes communes ---

  const activePlayers = db.prepare(
    'SELECT id, name, club, country, nationality, position FROM players WHERE active = 1 ORDER BY name COLLATE NOCASE'
  );
  const voteItems = db.prepare(
    `SELECT vi.rank, p.id, p.name, p.club, p.country
       FROM vote_items vi JOIN players p ON p.id = vi.player_id
      WHERE vi.vote_id = ? ORDER BY vi.rank`
  );

  function computeResults() {
    const votes = db.prepare("SELECT id FROM votes WHERE status = 'approved'").all();
    const rows = db
      .prepare(
        `SELECT vi.rank, p.id, p.name, p.club, p.country, p.nationality, p.position
           FROM vote_items vi
           JOIN votes v ON v.id = vi.vote_id AND v.status = 'approved'
           JOIN players p ON p.id = vi.player_id`
      )
      .all();
    const byPlayer = new Map();
    for (const r of rows) {
      let e = byPlayer.get(r.id);
      if (!e) {
        e = {
          id: r.id, name: r.name, club: r.club, country: r.country,
          nationality: r.nationality, position: r.position,
          points: 0, mentions: 0, ranks: Array(TOP_SIZE).fill(0),
        };
        byPlayer.set(r.id, e);
      }
      e.points += POINTS[r.rank - 1];
      e.mentions += 1;
      e.ranks[r.rank - 1] += 1;
    }
    // Départage : points, puis nombre de 1res places, 2es places, etc.
    const ranking = [...byPlayer.values()].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      for (let i = 0; i < TOP_SIZE; i++) if (b.ranks[i] !== a.ranks[i]) return b.ranks[i] - a.ranks[i];
      return a.name.localeCompare(b.name);
    });
    const { n: pending } = db.prepare("SELECT COUNT(*) AS n FROM votes WHERE status = 'pending'").get();
    return { approvedVotes: votes.length, pendingVotes: pending, points: POINTS, ranking };
  }

  // --- API publique ---

  app.get('/api/config', (req, res) => {
    const s = getSettings(db);
    res.json({ ...s, topSize: TOP_SIZE, points: POINTS, isAdmin: isAdmin(req) });
  });

  app.get('/api/players', (_req, res) => {
    res.json(activePlayers.all());
  });

  // Statut du vote fait depuis ce navigateur (s'il existe).
  app.get('/api/me', (req, res) => {
    const deviceId = parseCookies(req.headers.cookie)[DEVICE_COOKIE];
    if (!deviceId) return res.json({ vote: null });
    const vote = db
      .prepare('SELECT id, first_name, status, created_at FROM votes WHERE device_id = ? ORDER BY id DESC LIMIT 1')
      .get(deviceId);
    if (!vote) return res.json({ vote: null });
    res.json({
      vote: { firstName: vote.first_name, status: vote.status, createdAt: vote.created_at, top: voteItems.all(vote.id) },
    });
  });

  app.post('/api/votes', (req, res) => {
    const settings = getSettings(db);
    if (!settings.votingOpen) throw new HttpError(403, 'Les votes sont fermés');
    if (!voteLimiter.check(req.ip)) throw new HttpError(429, 'Trop de tentatives, réessayez plus tard');

    const firstName = String(req.body?.firstName ?? '').trim().replace(/\s+/g, ' ');
    const firstNameNorm = normalizeName(firstName);
    if (firstNameNorm.length < 2 || firstName.length > 40) {
      throw new HttpError(400, 'Indiquez un prénom valide (2 à 40 caractères)');
    }

    const top = req.body?.top;
    if (!Array.isArray(top) || top.length !== TOP_SIZE) {
      throw new HttpError(400, `Votre classement doit contenir exactement ${TOP_SIZE} joueurs`);
    }
    const ids = top.map(Number);
    if (ids.some((id) => !Number.isInteger(id)) || new Set(ids).size !== TOP_SIZE) {
      throw new HttpError(400, 'Chaque joueur ne peut apparaître qu\'une seule fois');
    }
    const validIds = new Set(activePlayers.all().map((p) => p.id));
    if (ids.some((id) => !validIds.has(id))) throw new HttpError(400, 'Joueur inconnu dans le classement');

    const cookies = parseCookies(req.headers.cookie);
    let deviceId = cookies[DEVICE_COOKIE];
    if (!deviceId || !/^[a-f0-9]{32}$/.test(deviceId)) deviceId = crypto.randomBytes(16).toString('hex');

    const rawCode = normalizeCode(req.body?.code);
    if (settings.codeMode === 'required' && !rawCode) {
      throw new HttpError(400, 'Un code d\'invitation est nécessaire pour voter');
    }

    const result = transaction(db, () => {
      const existingDevice = db
        .prepare("SELECT id FROM votes WHERE device_id = ? AND status != 'rejected'")
        .get(deviceId);
      if (existingDevice) throw new HttpError(409, 'Vous avez déjà voté depuis cet appareil');

      const existingName = db
        .prepare("SELECT id FROM votes WHERE first_name_norm = ? AND status != 'rejected'")
        .get(firstNameNorm);
      if (existingName) {
        throw new HttpError(
          409,
          'Ce prénom a déjà voté. Si vous êtes une autre personne, ajoutez l\'initiale de votre nom (ex : « Thomas B. »)'
        );
      }

      let codeId = null;
      if (rawCode && settings.codeMode !== 'disabled') {
        const formatted = `${rawCode.slice(0, 4)}-${rawCode.slice(4)}`;
        const code = db.prepare('SELECT id, used_at FROM codes WHERE code = ?').get(formatted);
        if (!code) throw new HttpError(400, 'Code d\'invitation invalide');
        if (code.used_at) throw new HttpError(409, 'Ce code d\'invitation a déjà été utilisé');
        db.prepare("UPDATE codes SET used_at = datetime('now') WHERE id = ?").run(code.id);
        codeId = code.id;
      }

      const status = codeId ? 'approved' : 'pending';
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO votes (first_name, first_name_norm, status, ip_hash, device_id, code_id, reviewed_at)
           VALUES (?, ?, ?, ?, ?, ?, CASE WHEN ? = 'approved' THEN datetime('now') END)`
        )
        .run(firstName, firstNameNorm, status, hashIp(req.ip), deviceId, codeId, status);
      const ins = db.prepare('INSERT INTO vote_items (vote_id, rank, player_id) VALUES (?, ?, ?)');
      ids.forEach((pid, i) => ins.run(lastInsertRowid, i + 1, pid));
      return { id: Number(lastInsertRowid), status };
    });

    res.set('Set-Cookie', `${DEVICE_COOKIE}=${deviceId}; Max-Age=31536000; ${cookieFlags}`);
    res.status(201).json(result);
  });

  app.get('/api/results', (req, res) => {
    if (!getSettings(db).resultsPublic && !isAdmin(req)) {
      throw new HttpError(403, 'Les résultats ne sont pas encore publiés');
    }
    res.json(computeResults());
  });

  // --- Authentification admin ---

  app.post('/api/admin/login', (req, res) => {
    if (!loginLimiter.check(req.ip)) throw new HttpError(429, 'Trop de tentatives, réessayez dans 15 minutes');
    if (!safeEqual(String(req.body?.password ?? ''), adminPassword)) {
      throw new HttpError(401, 'Mot de passe incorrect');
    }
    const expires = String(Date.now() + ADMIN_SESSION_MS);
    res.set('Set-Cookie', `${ADMIN_COOKIE}=${expires}.${sign(`admin:${expires}`)}; Max-Age=${ADMIN_SESSION_MS / 1000}; ${cookieFlags}`);
    res.json({ ok: true });
  });

  app.post('/api/admin/logout', (_req, res) => {
    res.set('Set-Cookie', `${ADMIN_COOKIE}=; Max-Age=0; ${cookieFlags}`);
    res.json({ ok: true });
  });

  // --- API admin ---

  const admin = express.Router();
  admin.use(requireAdmin);

  admin.get('/settings', (_req, res) => res.json(getSettings(db)));
  admin.put('/settings', (req, res) => {
    updateSettings(db, req.body ?? {});
    res.json(getSettings(db));
  });

  admin.get('/votes', (req, res) => {
    const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : null;
    const votes = db
      .prepare(
        `SELECT v.id, v.first_name, v.status, v.created_at, v.reviewed_at, v.ip_hash, c.code,
                (SELECT COUNT(*) FROM votes o WHERE o.ip_hash = v.ip_hash AND o.id != v.id AND o.status != 'rejected') AS same_ip
           FROM votes v LEFT JOIN codes c ON c.id = v.code_id
          ${status ? 'WHERE v.status = ?' : ''}
          ORDER BY v.id DESC`
      )
      .all(...(status ? [status] : []));
    res.json(
      votes.map((v) => ({
        id: v.id,
        firstName: v.first_name,
        status: v.status,
        createdAt: v.created_at,
        reviewedAt: v.reviewed_at,
        code: v.code,
        sameIpCount: v.same_ip,
        top: voteItems.all(v.id),
      }))
    );
  });

  function setVoteStatus(id, status) {
    return transaction(db, () => {
      const vote = db.prepare('SELECT id, first_name_norm, device_id FROM votes WHERE id = ?').get(id);
      if (!vote) throw new HttpError(404, 'Vote introuvable');
      if (status === 'approved') {
        // Ne pas compter deux fois la même personne.
        const dup = db
          .prepare("SELECT id FROM votes WHERE id != ? AND status = 'approved' AND (first_name_norm = ? OR device_id = ?)")
          .get(id, vote.first_name_norm, vote.device_id);
        if (dup) throw new HttpError(409, `Un vote déjà validé (n°${dup.id}) existe pour ce prénom ou cet appareil`);
      }
      db.prepare("UPDATE votes SET status = ?, reviewed_at = datetime('now') WHERE id = ?").run(status, id);
    });
  }

  admin.post('/votes/:id/approve', (req, res) => {
    setVoteStatus(Number(req.params.id), 'approved');
    res.json({ ok: true });
  });
  admin.post('/votes/:id/reject', (req, res) => {
    setVoteStatus(Number(req.params.id), 'rejected');
    res.json({ ok: true });
  });
  admin.delete('/votes/:id', (req, res) => {
    const { changes } = db.prepare('DELETE FROM votes WHERE id = ?').run(Number(req.params.id));
    if (!changes) throw new HttpError(404, 'Vote introuvable');
    res.json({ ok: true });
  });

  admin.get('/codes', (_req, res) => {
    res.json(
      db
        .prepare(
          `SELECT c.id, c.code, c.label, c.created_at AS createdAt, c.used_at AS usedAt, v.first_name AS usedBy
             FROM codes c LEFT JOIN votes v ON v.code_id = c.id ORDER BY c.id DESC`
        )
        .all()
    );
  });
  admin.post('/codes', (req, res) => {
    const count = Math.min(Math.max(parseInt(req.body?.count, 10) || 1, 1), 500);
    const label = String(req.body?.label ?? '').trim().slice(0, 60);
    const created = transaction(db, () => {
      const ins = db.prepare('INSERT OR IGNORE INTO codes (code, label) VALUES (?, ?)');
      const out = [];
      while (out.length < count) {
        const code = generateCode();
        if (ins.run(code, label).changes) out.push(code);
      }
      return out;
    });
    res.status(201).json({ codes: created });
  });
  admin.delete('/codes/:id', (req, res) => {
    const { changes } = db.prepare('DELETE FROM codes WHERE id = ? AND used_at IS NULL').run(Number(req.params.id));
    if (!changes) throw new HttpError(409, 'Code introuvable ou déjà utilisé');
    res.json({ ok: true });
  });

  function readPlayer(body) {
    const p = {
      name: String(body?.name ?? '').trim().slice(0, 80),
      club: String(body?.club ?? '').trim().slice(0, 80),
      country: String(body?.country ?? '').trim().toLowerCase().slice(0, 10),
      nationality: String(body?.nationality ?? '').trim().slice(0, 60),
      position: ['GK', 'DEF', 'MIL', 'ATT'].includes(body?.position) ? body.position : '',
      active: body?.active === false ? 0 : 1,
    };
    if (!p.name) throw new HttpError(400, 'Le nom du joueur est obligatoire');
    return p;
  }

  admin.get('/players', (_req, res) => {
    res.json(
      db.prepare('SELECT id, name, club, country, nationality, position, active FROM players ORDER BY name COLLATE NOCASE').all()
        .map((p) => ({ ...p, active: p.active === 1 }))
    );
  });
  admin.post('/players', (req, res) => {
    const p = readPlayer(req.body);
    const { lastInsertRowid } = db
      .prepare('INSERT INTO players (name, club, country, nationality, position, active) VALUES (?, ?, ?, ?, ?, ?)')
      .run(p.name, p.club, p.country, p.nationality, p.position, p.active);
    res.status(201).json({ id: Number(lastInsertRowid) });
  });
  admin.put('/players/:id', (req, res) => {
    const p = readPlayer(req.body);
    const { changes } = db
      .prepare('UPDATE players SET name = ?, club = ?, country = ?, nationality = ?, position = ?, active = ? WHERE id = ?')
      .run(p.name, p.club, p.country, p.nationality, p.position, p.active, Number(req.params.id));
    if (!changes) throw new HttpError(404, 'Joueur introuvable');
    res.json({ ok: true });
  });

  admin.get('/results.csv', (_req, res) => {
    const { ranking } = computeResults();
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [['Rang', 'Joueur', 'Club', 'Points', 'Citations', ...POINTS.map((_, i) => `${i + 1}e`)].join(';')];
    ranking.forEach((p, i) => lines.push([i + 1, esc(p.name), esc(p.club), p.points, p.mentions, ...p.ranks].join(';')));
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="resultats-ballon-dor.csv"');
    res.send('﻿' + lines.join('\n'));
  });

  app.use('/api/admin', admin);

  // --- Fichiers statiques & erreurs ---

  app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Ressource introuvable')));

  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON invalide' });
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Erreur interne' : err.message });
  });

  return app;
}
