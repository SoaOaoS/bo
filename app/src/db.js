import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { NOMINEES_2026 } from './players.js';

const DEFAULT_SETTINGS = {
  voting_open: '1',
  results_public: '0',
  // 'optional' : un code valide = vote validé automatiquement, sinon validation admin.
  // 'required' : un code d'invitation est obligatoire pour voter.
  // 'disabled' : pas de code, tous les votes passent par la validation admin.
  code_mode: 'optional',
};

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      club TEXT NOT NULL DEFAULT '',
      country TEXT NOT NULL DEFAULT '',
      nationality TEXT NOT NULL DEFAULT '',
      position TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      used_at TEXT
    );

    CREATE TABLE IF NOT EXISTS votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      first_name_norm TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      reviewed_at TEXT,
      ip_hash TEXT NOT NULL DEFAULT '',
      device_id TEXT NOT NULL DEFAULT '',
      code_id INTEGER REFERENCES codes(id)
    );

    CREATE TABLE IF NOT EXISTS vote_items (
      vote_id INTEGER NOT NULL REFERENCES votes(id) ON DELETE CASCADE,
      rank INTEGER NOT NULL,
      player_id INTEGER NOT NULL REFERENCES players(id),
      PRIMARY KEY (vote_id, rank),
      UNIQUE (vote_id, player_id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insertSetting.run(k, v);

  const { n } = db.prepare('SELECT COUNT(*) AS n FROM players').get();
  if (n === 0) {
    const ins = db.prepare(
      'INSERT INTO players (name, club, country, nationality, position) VALUES (?, ?, ?, ?, ?)'
    );
    for (const p of NOMINEES_2026) ins.run(p.name, p.club, p.country, p.nationality, p.position);
  }
  return db;
}

export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function getSettings(db) {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    votingOpen: s.voting_open === '1',
    resultsPublic: s.results_public === '1',
    codeMode: s.code_mode,
  };
}

export function updateSettings(db, { votingOpen, resultsPublic, codeMode }) {
  const set = db.prepare('UPDATE settings SET value = ? WHERE key = ?');
  if (typeof votingOpen === 'boolean') set.run(votingOpen ? '1' : '0', 'voting_open');
  if (typeof resultsPublic === 'boolean') set.run(resultsPublic ? '1' : '0', 'results_public');
  if (['optional', 'required', 'disabled'].includes(codeMode)) set.run(codeMode, 'code_mode');
}
