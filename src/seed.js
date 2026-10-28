import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { get, run, tx } from "./db.js";

const seedDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../seed");

/** Popula o banco na primeira execução (catálogo vazio) e copia as imagens do seed. */
export function seedIfEmpty() {
  const imgDir = path.join(seedDir, "images");
  for (const file of fs.readdirSync(imgDir)) {
    const dest = path.join(config.mediaDir, file);
    if (!fs.existsSync(dest)) fs.copyFileSync(path.join(imgDir, file), dest);
  }

  if (get("SELECT COUNT(*) AS n FROM categories").n > 0) return;

  const data = JSON.parse(fs.readFileSync(path.join(seedDir, "catalog.json"), "utf8"));
  tx(() => {
    for (const c of data.categories) {
      run(
        "INSERT INTO categories (slug, name, tagline, description, cover, specs, sort) VALUES (?,?,?,?,?,?,?)",
        c.slug, c.name, c.tagline || "", c.description || "", c.cover || "", JSON.stringify(c.specs || []), c.sort || 0,
      );
    }
    data.products.forEach((p, i) => {
      run(
        `INSERT INTO products (code, category, name, subtitle, length, width, depth, people, highlights, images, plan, colors, sort)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        p.code, p.category, p.name, p.subtitle || "", p.length ?? null, p.width ?? null, p.depth || "",
        p.people ?? null, JSON.stringify(p.highlights || []), JSON.stringify(p.images || []), p.plan || "",
        JSON.stringify(p.colors || (p.category === "banheiras" ? ["Branca"] : ["Azul", "Branca"])), i + 1,
      );
    });
    data.equipment.forEach((e, i) => {
      run(
        "INSERT INTO equipment (slug, name, description, image, categories, sort) VALUES (?,?,?,?,?,?)",
        e.slug, e.name, e.description || "", e.image || "", JSON.stringify(e.categories || []), i + 1,
      );
    });
  });
  console.log(`[seed] Catálogo inicial carregado: ${data.products.length} produtos.`);
}
