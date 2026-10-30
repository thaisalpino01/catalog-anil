import crypto from "node:crypto";
import { config } from "./config.js";
import { all, get, run, tx } from "./db.js";

const safeEqual = (a, b) => {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
};

/** Só aceita chamadas com "Authorization: Bearer <PRICE_SYNC_TOKEN>". */
export function requireSyncToken(req, res, next) {
  if (!config.priceSyncToken) return res.status(503).json({ error: "PRICE_SYNC_TOKEN não configurado" });
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!safeEqual(token, config.priceSyncToken)) return res.status(401).json({ error: "Token inválido" });
  next();
}

/**
 * Recebe a lista da API de preços ([{ reference, price }]) e atualiza o preço dos produtos
 * cujo código é igual à referência. Produtos fora da lista mantêm o preço atual.
 */
export function syncPrices(list) {
  if (!Array.isArray(list)) throw Object.assign(new Error("Envie uma lista de { reference, price }"), { status: 400 });
  const incoming = new Map();
  for (const row of list.slice(0, 2000)) {
    const ref = String(row?.reference ?? "").trim().toUpperCase();
    const price = Number(row?.price);
    if (ref && Number.isFinite(price) && price >= 0 && price < 1e8) incoming.set(ref, Math.round(price * 100) / 100);
  }
  if (!incoming.size) throw Object.assign(new Error("Nenhum preço válido recebido"), { status: 400 });

  const products = all("SELECT code, price FROM products");
  const known = new Set(products.map((p) => p.code.toUpperCase()));
  const changes = [];
  tx(() => {
    for (const p of products) {
      const price = incoming.get(p.code.toUpperCase());
      if (price === undefined || price === p.price) continue;
      run("UPDATE products SET price = ? WHERE code = ?", price, p.code);
      changes.push({ code: p.code, from: p.price, to: price });
    }
  });

  const result = {
    at: new Date().toISOString(),
    received: incoming.size,
    updated: changes.length,
    changes,
    // referências da API que não existem no catálogo (ex.: acessórios ou modelos ainda não cadastrados)
    unknown: [...incoming.keys()].filter((r) => !known.has(r)),
    // produtos do catálogo que não vieram na API (mantêm o preço que já tinham)
    missing: products.map((p) => p.code).filter((c) => !incoming.has(c.toUpperCase())),
  };
  run("INSERT OR REPLACE INTO meta (key, value) VALUES ('prices-sync', ?)", JSON.stringify(result));
  return result;
}

export function lastSync() {
  const row = get("SELECT value FROM meta WHERE key = 'prices-sync'");
  try { return row ? JSON.parse(row.value) : null; } catch { return null; }
}
