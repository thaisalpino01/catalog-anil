import express from "express";
import multer from "multer";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { all, get, run, tx } from "./db.js";
import { seedIfEmpty, backfillPricesOnce, renameCodesOnce } from "./seed.js";
import { requireSyncToken, syncPrices, lastSync } from "./prices.js";
import { checkCredentials, issueSession, clearSession, isAuthenticated, requireAdmin } from "./auth.js";
import {
  createSubmission, getSubmission, notifyWebhook, sellerFor, whatsappMessage, whatsappLink,
  summaryText, normalizePhone, DELIVERY, SERVICES, SERVICE_LABELS, STATUSES,
} from "./submissions.js";

seedIfEmpty();
backfillPricesOnce();
renameCodesOnce();

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
const app = express();
app.disable("x-powered-by");
if (config.trustProxy) app.set("trust proxy", true);
app.use(express.json({ limit: "200kb" }));

app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "SAMEORIGIN",
    "Content-Security-Policy":
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'self'",
  });
  next();
});

/* ---------- limitador simples em memória ---------- */
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  setInterval(() => hits.clear(), windowMs).unref();
  return (req, res, next) => {
    const n = (hits.get(req.ip) || 0) + 1;
    hits.set(req.ip, n);
    if (n > max) return res.status(429).json({ error: "Muitas tentativas. Aguarde alguns minutos." });
    next();
  };
}

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ---------- público ---------- */
app.get("/healthz", (req, res) => res.json({ ok: true }));

function publicCatalog() {
  const categories = all("SELECT slug, name, tagline, description, cover, specs FROM categories WHERE active = 1 ORDER BY sort, name");
  const slugs = new Set(categories.map((c) => c.slug));
  const products = all(
    `SELECT code, category, name, subtitle, length, width, depth, people, highlights, images, plan, colors, price
     FROM products WHERE active = 1 ORDER BY sort, length, name`,
  ).filter((p) => slugs.has(p.category));
  const equipment = all("SELECT slug, name, description, image, categories, price FROM equipment WHERE active = 1 ORDER BY sort, name");
  return { categories, products, equipment, delivery: DELIVERY, services: SERVICES };
}

app.get("/api/catalog", (req, res) => {
  const data = publicCatalog();
  const v = String(req.query.v || "").toLowerCase();
  const seller = v ? get("SELECT slug, name FROM sellers WHERE slug = ? AND active = 1", v) : null;
  res.set("Cache-Control", "no-store").json({ ...data, seller: seller ? { slug: seller.slug, name: seller.name } : null });
});

app.post("/api/orcamentos", rateLimit({ windowMs: 10 * 60 * 1000, max: 15 }), asyncRoute(async (req, res) => {
  const sub = createSubmission(req.body || {}, { ip: req.ip });
  notifyWebhook(sub).catch(() => {});
  const seller = sellerFor(sub);
  const message = whatsappMessage(sub);
  res.status(201).json({
    code: sub.code,
    seller: seller.name || null,
    total: sub.total,
    message,
    whatsapp_url: whatsappLink(seller.whatsapp, message),
  });
}));

/* ---------- integração: preços do sistema da Anil (enviados pelo n8n) ---------- */
app.post("/api/integracoes/precos", rateLimit({ windowMs: 60 * 1000, max: 20 }), requireSyncToken, (req, res) => {
  const body = req.body;
  const result = syncPrices(Array.isArray(body) ? body : body?.items);
  console.log(`[precos] ${result.updated} atualizados de ${result.received} recebidos`);
  res.json(result);
});

app.use("/media", express.static(config.mediaDir, { maxAge: "7d", fallthrough: false }));

/* ---------- admin: sessão ---------- */
const admin = express.Router();

admin.post("/login", rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), (req, res) => {
  const { user, password } = req.body || {};
  if (!checkCredentials(String(user || ""), String(password || ""))) {
    return res.status(401).json({ error: "Usuário ou senha incorretos" });
  }
  issueSession(res, req);
  res.json({ ok: true });
});
admin.post("/logout", (req, res) => { clearSession(res); res.json({ ok: true }); });
admin.get("/me", (req, res) => res.json({ authenticated: isAuthenticated(req) }));

admin.use(requireAdmin);

/* ---------- admin: orçamentos ---------- */
function decorate(sub) {
  const seller = sellerFor(sub);
  return {
    ...sub,
    seller_name: seller.name,
    resumo: summaryText(sub),
  };
}

function querySubmissions(q) {
  const where = [];
  const params = [];
  if (q.status && STATUSES.includes(q.status)) { where.push("status = ?"); params.push(q.status); }
  if (q.seller) { where.push("seller = ?"); params.push(String(q.seller)); }
  if (q.q) {
    const term = String(q.q).trim();
    where.push("(code LIKE ? OR city LIKE ? OR items LIKE ?)");
    params.push(`%${term.toUpperCase()}%`, `%${term}%`, `%${term}%`);
  }
  return { sql: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

admin.get("/stats", (req, res) => {
  const rows = all("SELECT status, COUNT(*) AS n FROM submissions GROUP BY status");
  const today = get("SELECT COUNT(*) AS n FROM submissions WHERE created_at >= ?", new Date().toISOString().slice(0, 10)).n;
  res.json({ byStatus: Object.fromEntries(rows.map((r) => [r.status, r.n])), today });
});

admin.get("/orcamentos", (req, res) => {
  const { sql, params } = querySubmissions(req.query);
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const total = get(`SELECT COUNT(*) AS n FROM submissions ${sql}`, ...params).n;
  const rows = all(`SELECT * FROM submissions ${sql} ORDER BY created_at DESC LIMIT ? OFFSET ?`, ...params, limit, offset);
  res.json({ total, rows: rows.map(decorate) });
});

admin.get("/orcamentos.csv", (req, res) => {
  const { sql, params } = querySubmissions(req.query);
  const rows = all(`SELECT * FROM submissions ${sql} ORDER BY created_at DESC`, ...params);
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = ["codigo", "data", "cidade", "entrega", "modelos", "opcionais", "servicos", "valor_aproximado", "observacoes", "vendedora", "status"];
  const lines = rows.map((s) => [
    s.code, s.created_at, s.city, DELIVERY[s.delivery] || "",
    s.items.map((i) => `${i.code}${i.name !== i.code ? ` ${i.name}` : ""}${i.color ? ` (${i.color})` : ""}`).join("; "),
    s.equipment.map((e) => e.name).join("; "),
    s.services.map((x) => SERVICE_LABELS[x] || x).join("; "),
    s.total != null ? String(s.total).replace(".", ",") : "",
    s.notes, s.seller, s.status,
  ].map(esc).join(";"));
  res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="orcamentos-anil.csv"` });
  res.send("﻿" + [header.join(";"), ...lines].join("\r\n"));
});

admin.get("/orcamentos/:code", (req, res) => {
  const sub = getSubmission(req.params.code);
  if (!sub) return res.status(404).json({ error: "Orçamento não encontrado" });
  res.json(decorate(sub));
});

admin.patch("/orcamentos/:code", (req, res) => {
  const sub = getSubmission(req.params.code);
  if (!sub) return res.status(404).json({ error: "Orçamento não encontrado" });
  const { status, internal_notes, seller } = req.body || {};
  if (status !== undefined && !STATUSES.includes(status)) return res.status(400).json({ error: "Status inválido" });
  run(
    "UPDATE submissions SET status = COALESCE(?, status), internal_notes = COALESCE(?, internal_notes), seller = COALESCE(?, seller) WHERE code = ?",
    status ?? null, internal_notes !== undefined ? String(internal_notes).slice(0, 2000) : null,
    seller !== undefined ? String(seller) : null, sub.code,
  );
  res.json(decorate(getSubmission(sub.code)));
});

admin.post("/orcamentos/:code/reenviar-webhook", asyncRoute(async (req, res) => {
  const sub = getSubmission(req.params.code);
  if (!sub) return res.status(404).json({ error: "Orçamento não encontrado" });
  if (!config.webhookUrl) return res.status(400).json({ error: "N8N_WEBHOOK_URL não configurado" });
  await notifyWebhook(sub);
  res.json(decorate(getSubmission(sub.code)));
}));

/* ---------- admin: catálogo ---------- */
admin.get("/catalogo", (req, res) => {
  res.json({
    categories: all("SELECT * FROM categories ORDER BY sort, name"),
    products: all("SELECT * FROM products ORDER BY category, sort, length, name"),
    equipment: all("SELECT * FROM equipment ORDER BY sort, name"),
    sellers: all("SELECT * FROM sellers ORDER BY name"),
    settings: { publicUrl: config.publicUrl, defaultWhatsapp: config.defaultWhatsapp, webhook: !!config.webhookUrl, priceSync: lastSync() },
  });
});

const slugify = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const arr = (v) => JSON.stringify(Array.isArray(v) ? v.map(String).filter(Boolean) : []);
const num = (v) => (v === "" || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));
const bool = (v) => (v === false || v === 0 || v === "0" ? 0 : 1);

admin.post("/categorias", (req, res) => {
  const b = req.body || {};
  const slug = slugify(b.slug || b.name);
  if (!slug || !b.name) return res.status(400).json({ error: "Nome obrigatório" });
  if (get("SELECT 1 AS x FROM categories WHERE slug = ?", slug)) return res.status(409).json({ error: "Já existe uma categoria com esse identificador" });
  run("INSERT INTO categories (slug, name, tagline, description, cover, specs, sort, active) VALUES (?,?,?,?,?,?,?,?)",
    slug, b.name, b.tagline || "", b.description || "", b.cover || "", arr(b.specs), num(b.sort) ?? 99, bool(b.active));
  res.status(201).json(get("SELECT * FROM categories WHERE slug = ?", slug));
});

admin.put("/categorias/:slug", (req, res) => {
  const b = req.body || {};
  if (!get("SELECT 1 AS x FROM categories WHERE slug = ?", req.params.slug)) return res.status(404).json({ error: "Categoria não encontrada" });
  run("UPDATE categories SET name=?, tagline=?, description=?, cover=?, specs=?, sort=?, active=? WHERE slug=?",
    b.name, b.tagline || "", b.description || "", b.cover || "", arr(b.specs), num(b.sort) ?? 0, bool(b.active), req.params.slug);
  res.json(get("SELECT * FROM categories WHERE slug = ?", req.params.slug));
});

function productValues(b) {
  return [
    String(b.code || "").trim().toUpperCase(), b.category, String(b.name || "").trim(), b.subtitle || "",
    num(b.length), num(b.width), b.depth || "", num(b.people),
    arr(b.highlights), arr(b.images), b.plan || "", arr(b.colors), num(b.price), num(b.sort) ?? 0, bool(b.active),
  ];
}
function validateProduct(b) {
  if (!b.code || !b.name) return "Código e nome são obrigatórios";
  if (!get("SELECT 1 AS x FROM categories WHERE slug = ?", b.category)) return "Categoria inválida";
  return null;
}

admin.post("/produtos", (req, res) => {
  const b = req.body || {};
  const err = validateProduct(b);
  if (err) return res.status(400).json({ error: err });
  try {
    const r = run(`INSERT INTO products (code, category, name, subtitle, length, width, depth, people, highlights, images, plan, colors, price, sort, active)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ...productValues(b));
    res.status(201).json(get("SELECT * FROM products WHERE id = ?", r.lastInsertRowid));
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) return res.status(409).json({ error: "Já existe um produto com esse código" });
    throw e;
  }
});

admin.put("/produtos/:id", (req, res) => {
  const b = req.body || {};
  const err = validateProduct(b);
  if (err) return res.status(400).json({ error: err });
  if (!get("SELECT 1 AS x FROM products WHERE id = ?", req.params.id)) return res.status(404).json({ error: "Produto não encontrado" });
  try {
    run(`UPDATE products SET code=?, category=?, name=?, subtitle=?, length=?, width=?, depth=?, people=?, highlights=?, images=?, plan=?, colors=?, price=?, sort=?, active=?
      WHERE id=?`, ...productValues(b), req.params.id);
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) return res.status(409).json({ error: "Já existe um produto com esse código" });
    throw e;
  }
  res.json(get("SELECT * FROM products WHERE id = ?", req.params.id));
});

admin.delete("/produtos/:id", (req, res) => {
  run("DELETE FROM products WHERE id = ?", req.params.id);
  res.json({ ok: true });
});

admin.post("/opcionais", (req, res) => {
  const b = req.body || {};
  const slug = slugify(b.slug || b.name);
  if (!slug || !b.name) return res.status(400).json({ error: "Nome obrigatório" });
  if (get("SELECT 1 AS x FROM equipment WHERE slug = ?", slug)) return res.status(409).json({ error: "Já existe um opcional com esse identificador" });
  run("INSERT INTO equipment (slug, name, description, image, categories, price, sort, active) VALUES (?,?,?,?,?,?,?,?)",
    slug, b.name, b.description || "", b.image || "", arr(b.categories), num(b.price), num(b.sort) ?? 99, bool(b.active));
  res.status(201).json(get("SELECT * FROM equipment WHERE slug = ?", slug));
});

admin.put("/opcionais/:slug", (req, res) => {
  const b = req.body || {};
  run("UPDATE equipment SET name=?, description=?, image=?, categories=?, price=?, sort=?, active=? WHERE slug=?",
    b.name, b.description || "", b.image || "", arr(b.categories), num(b.price), num(b.sort) ?? 0, bool(b.active), req.params.slug);
  res.json(get("SELECT * FROM equipment WHERE slug = ?", req.params.slug));
});

admin.delete("/opcionais/:slug", (req, res) => {
  run("DELETE FROM equipment WHERE slug = ?", req.params.slug);
  res.json({ ok: true });
});

/* ---------- admin: vendedoras ---------- */
admin.post("/vendedoras", (req, res) => {
  const b = req.body || {};
  const slug = slugify(b.slug || b.name);
  const whatsapp = normalizePhone(b.whatsapp);
  if (!slug || !b.name) return res.status(400).json({ error: "Nome obrigatório" });
  if (!whatsapp) return res.status(400).json({ error: "WhatsApp inválido" });
  if (get("SELECT 1 AS x FROM sellers WHERE slug = ?", slug)) return res.status(409).json({ error: "Já existe uma vendedora com esse identificador" });
  run("INSERT INTO sellers (slug, name, whatsapp, active) VALUES (?,?,?,?)", slug, b.name.trim(), whatsapp, bool(b.active));
  res.status(201).json(get("SELECT * FROM sellers WHERE slug = ?", slug));
});

admin.put("/vendedoras/:slug", (req, res) => {
  const b = req.body || {};
  const whatsapp = normalizePhone(b.whatsapp);
  if (!whatsapp) return res.status(400).json({ error: "WhatsApp inválido" });
  run("UPDATE sellers SET name=?, whatsapp=?, active=? WHERE slug=?", String(b.name || "").trim(), whatsapp, bool(b.active), req.params.slug);
  res.json(get("SELECT * FROM sellers WHERE slug = ?", req.params.slug));
});

admin.delete("/vendedoras/:slug", (req, res) => {
  tx(() => run("DELETE FROM sellers WHERE slug = ?", req.params.slug));
  res.json({ ok: true });
});

/* ---------- admin: upload de imagens ---------- */
const ALLOWED = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
const upload = multer({
  storage: multer.diskStorage({
    destination: config.mediaDir,
    filename: (req, file, cb) => cb(null, `up-${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ALLOWED[file.mimetype]}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype in ALLOWED),
});
admin.post("/upload", upload.array("files", 10), (req, res) => {
  res.json({ files: (req.files || []).map((f) => f.filename) });
});

app.use("/api/admin", admin);

/* ---------- arquivos estáticos ---------- */
// sempre revalida (ETag): depois de um deploy ninguém fica com JS antigo falando com a API nova
app.use(express.static(publicDir, { index: false, setHeaders: (res) => res.set("Cache-Control", "no-cache") }));
app.get(["/admin", "/admin/"], (req, res) => res.sendFile(path.join(publicDir, "admin/index.html")));
app.get("/", (req, res) => res.sendFile(path.join(publicDir, "index.html")));

app.use((req, res) => res.status(404).json({ error: "Não encontrado" }));

app.use((err, req, res, next) => {
  if (err.status === 400 || err.name === "ValidationError") return res.status(400).json({ error: err.message });
  if (err instanceof multer.MulterError) return res.status(400).json({ error: `Upload: ${err.message}` });
  if (err.status === 404 || err.code === "ENOENT") return res.status(404).end();
  console.error(err);
  res.status(500).json({ error: "Erro interno" });
});

fs.mkdirSync(config.mediaDir, { recursive: true });
app.listen(config.port, () => console.log(`[anil-catalogo] ouvindo na porta ${config.port}`));
