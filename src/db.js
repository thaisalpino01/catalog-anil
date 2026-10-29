import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

fs.mkdirSync(config.mediaDir, { recursive: true });

export const db = new DatabaseSync(path.join(config.dataDir, "catalogo.db"));
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS categories (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tagline TEXT DEFAULT '',
  description TEXT DEFAULT '',
  cover TEXT DEFAULT '',
  specs TEXT DEFAULT '[]',
  sort INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL REFERENCES categories(slug) ON UPDATE CASCADE,
  name TEXT NOT NULL,
  subtitle TEXT DEFAULT '',
  length REAL,
  width REAL,
  depth TEXT DEFAULT '',
  people INTEGER,
  highlights TEXT DEFAULT '[]',
  images TEXT DEFAULT '[]',
  plan TEXT DEFAULT '',
  colors TEXT DEFAULT '["Azul","Branca"]',
  sort INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS equipment (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  image TEXT DEFAULT '',
  categories TEXT DEFAULT '[]',
  sort INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS sellers (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  city TEXT NOT NULL,
  categories TEXT DEFAULT '[]',
  items TEXT DEFAULT '[]',
  equipment TEXT DEFAULT '[]',
  services TEXT DEFAULT '[]',
  notes TEXT DEFAULT '',
  seller TEXT DEFAULT '',
  origin TEXT DEFAULT '',
  status TEXT DEFAULT 'novo',
  internal_notes TEXT DEFAULT '',
  webhook_status TEXT DEFAULT '',
  ip TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_submissions_created ON submissions(created_at DESC);
`);

const JSON_FIELDS = ["specs", "highlights", "images", "colors", "categories", "items", "equipment", "services"];

/** Converte colunas JSON (texto) em arrays e flags 0/1 em boolean. */
export function hydrate(row) {
  if (!row) return row;
  const out = { ...row };
  for (const f of JSON_FIELDS) {
    if (typeof out[f] === "string") {
      try { out[f] = JSON.parse(out[f]); } catch { out[f] = []; }
    }
  }
  if ("active" in out) out.active = !!out.active;
  return out;
}

export const all = (sql, ...params) => db.prepare(sql).all(...params).map(hydrate);
export const get = (sql, ...params) => hydrate(db.prepare(sql).get(...params));
export const run = (sql, ...params) => db.prepare(sql).run(...params);

export function tx(fn) {
  db.exec("BEGIN");
  try { const r = fn(); db.exec("COMMIT"); return r; }
  catch (e) { db.exec("ROLLBACK"); throw e; }
}
