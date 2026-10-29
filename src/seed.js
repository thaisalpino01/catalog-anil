import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { get, run, tx } from "./db.js";

const seedDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../seed");
const loadSeed = () => JSON.parse(fs.readFileSync(path.join(seedDir, "catalog.json"), "utf8"));

/** Popula o banco na primeira execução (catálogo vazio) e copia as imagens do seed. */
export function seedIfEmpty() {
  const imgDir = path.join(seedDir, "images");
  for (const file of fs.readdirSync(imgDir)) {
    const dest = path.join(config.mediaDir, file);
    if (!fs.existsSync(dest)) fs.copyFileSync(path.join(imgDir, file), dest);
  }

  if (get("SELECT COUNT(*) AS n FROM categories").n > 0) return;

  const data = loadSeed();
  tx(() => {
    for (const c of data.categories) {
      run(
        "INSERT INTO categories (slug, name, tagline, description, cover, specs, sort) VALUES (?,?,?,?,?,?,?)",
        c.slug, c.name, c.tagline || "", c.description || "", c.cover || "", JSON.stringify(c.specs || []), c.sort || 0,
      );
    }
    data.products.forEach((p, i) => {
      run(
        `INSERT INTO products (code, category, name, subtitle, length, width, depth, people, highlights, images, plan, colors, price, sort)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        p.code, p.category, p.name, p.subtitle || "", p.length ?? null, p.width ?? null, p.depth || "",
        p.people ?? null, JSON.stringify(p.highlights || []), JSON.stringify(p.images || []), p.plan || "",
        JSON.stringify(p.colors || (p.category === "banheiras" ? ["Branca"] : ["Azul", "Branca"])), p.price ?? null, i + 1,
      );
    });
    data.equipment.forEach((e, i) => {
      run(
        "INSERT INTO equipment (slug, name, description, image, categories, price, sort) VALUES (?,?,?,?,?,?,?)",
        e.slug, e.name, e.description || "", e.image || "", JSON.stringify(e.categories || []), e.price ?? null, i + 1,
      );
    });
    run("INSERT OR REPLACE INTO meta (key, value) VALUES ('prices-v1', 'seed')");
  });
  console.log(`[seed] Catálogo inicial carregado: ${data.products.length} produtos.`);
}

/**
 * Bancos criados antes dos preços: preenche uma única vez os valores do seed
 * (só onde o preço ainda está vazio, para não sobrescrever o que foi editado no painel).
 */
export function backfillPricesOnce() {
  if (get("SELECT value FROM meta WHERE key = 'prices-v1'")) return;
  const data = loadSeed();
  tx(() => {
    for (const p of data.products) {
      if (p.price != null) run("UPDATE products SET price = ? WHERE code = ? AND price IS NULL", p.price, p.code);
    }
    for (const e of data.equipment) {
      if (e.price != null) run("UPDATE equipment SET price = ? WHERE slug = ? AND price IS NULL", e.price, e.slug);
    }
    run("INSERT OR REPLACE INTO meta (key, value) VALUES ('prices-v1', ?)", new Date().toISOString());
  });
  console.log("[seed] Preços de referência aplicados ao catálogo existente.");
}
