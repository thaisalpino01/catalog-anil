import crypto from "node:crypto";
import { config } from "./config.js";
import { all, get, run } from "./db.js";

export const SERVICES = {
  entrega: "Entrega",
  instalacao: "Instalação no local",
  orientacao: "Orientação técnica",
};
export const STATUSES = ["novo", "em_atendimento", "convertido", "perdido"];

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // sem 0/O/1/I/L para ditar por telefone

function newCode() {
  for (let attempt = 0; attempt < 20; attempt++) {
    const bytes = crypto.randomBytes(5);
    const body = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
    const code = `${config.codePrefix}-${body}`;
    if (!get("SELECT 1 AS x FROM submissions WHERE code = ?", code)) return code;
  }
  throw new Error("Não foi possível gerar código único");
}

class ValidationError extends Error {
  constructor(message) { super(message); this.status = 400; }
}
const fail = (msg) => { throw new ValidationError(msg); };

const clean = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Normaliza telefone BR para 55 + DDD + número. */
export function normalizePhone(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  if (d.length === 11 && d[2] !== "9") return null;
  return "55" + d;
}

// O link não pede dados pessoais: o telefone chega para a vendedora pela própria conversa do WhatsApp.
export function createSubmission(body, meta) {
  const city = clean(body.city, 80);
  if (city.length < 2) fail("Informe a cidade de entrega");

  const activeCats = new Set(all("SELECT slug FROM categories WHERE active = 1").map((c) => c.slug));
  const categories = [...new Set((body.categories || []).map(String))].filter((c) => activeCats.has(c));
  if (!categories.length) fail("Escolha pelo menos um tipo de produto");

  const items = [];
  for (const it of (body.items || []).slice(0, 20)) {
    const p = get("SELECT code, name, subtitle, category, colors FROM products WHERE code = ? AND active = 1", String(it.code));
    if (!p) continue;
    const color = p.colors.includes(it.color) ? it.color : "";
    items.push({ code: p.code, name: p.name, subtitle: p.subtitle, category: p.category, color });
  }
  if (!items.length) fail("Escolha pelo menos um modelo");

  const eqRows = all("SELECT slug, name, categories FROM equipment WHERE active = 1");
  const equipment = eqRows
    .filter((e) => (body.equipment || []).includes(e.slug))
    .filter((e) => !e.categories.length || e.categories.some((c) => categories.includes(c)))
    .map((e) => ({ slug: e.slug, name: e.name }));
  const services = (body.services || []).filter((s) => s in SERVICES);

  let seller = clean(body.seller, 40).toLowerCase();
  if (seller && !get("SELECT 1 AS x FROM sellers WHERE slug = ? AND active = 1", seller)) seller = "";

  const code = newCode();
  run(
    `INSERT INTO submissions (code, city, categories, items, equipment, services, notes, seller, origin, ip)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    code, city,
    JSON.stringify(categories), JSON.stringify(items), JSON.stringify(equipment), JSON.stringify(services),
    String(body.notes || "").trim().slice(0, 1000), seller, clean(body.origin, 120), meta.ip || "",
  );
  return getSubmission(code);
}

export function getSubmission(code) {
  return get("SELECT * FROM submissions WHERE code = ?", String(code).toUpperCase());
}

export function sellerFor(sub) {
  const s = sub.seller ? get("SELECT * FROM sellers WHERE slug = ?", sub.seller) : null;
  return s ? { name: s.name, whatsapp: s.whatsapp } : { name: "", whatsapp: config.defaultWhatsapp };
}

export function adminUrl(code) {
  return config.publicUrl ? `${config.publicUrl}/admin/#/orcamento/${code}` : "";
}

/** Mensagem curta que o cliente envia para a vendedora pelo WhatsApp. */
export function whatsappMessage(sub) {
  const lines = [
    `Olá! Montei meu orçamento no catálogo da Anil.`,
    ``,
    `*Código: ${sub.code}*`,
    ``,
    `Modelos escolhidos:`,
    ...sub.items.map((i) => `• ${i.name}${i.subtitle ? ` (${i.subtitle})` : ""}${i.color ? ` — cor ${i.color.toLowerCase()}` : ""}`),
    ``,
    `Entrega em: ${sub.city}`,
  ];
  if (sub.equipment.length) lines.push(``, `Opcionais: ${sub.equipment.map((e) => e.name).join(", ")}`);
  return lines.join("\n");
}

export function whatsappLink(number, text) {
  if (!number) return "";
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export function summaryText(sub) {
  const svc = sub.services.map((s) => SERVICES[s] || s);
  return [
    `Orçamento ${sub.code}`,
    `Cidade de entrega: ${sub.city}`,
    `Modelos: ${sub.items.map((i) => `${i.name}${i.color ? ` (${i.color})` : ""}`).join("; ")}`,
    sub.equipment.length ? `Opcionais: ${sub.equipment.map((e) => e.name).join(", ")}` : "",
    svc.length ? `Serviços: ${svc.join(", ")}` : "",
    sub.notes ? `Observações: ${sub.notes}` : "",
  ].filter(Boolean).join("\n");
}

export async function notifyWebhook(sub) {
  if (!config.webhookUrl) return;
  const seller = sellerFor(sub);
  const payload = {
    event: "orcamento.criado",
    codigo: sub.code,
    criado_em: sub.created_at,
    cidade_entrega: sub.city,
    categorias: sub.categories,
    modelos: sub.items,
    opcionais: sub.equipment,
    servicos: sub.services.map((s) => ({ slug: s, nome: SERVICES[s] || s })),
    observacoes: sub.notes,
    vendedora: sub.seller ? { slug: sub.seller, nome: seller.name, whatsapp: seller.whatsapp } : null,
    origem: sub.origin,
    resumo: summaryText(sub),
    link_painel: adminUrl(sub.code),
  };
  let status;
  try {
    const res = await fetch(config.webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(config.webhookToken ? { authorization: `Bearer ${config.webhookToken}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    status = res.ok ? `ok ${res.status}` : `erro ${res.status}`;
  } catch (e) {
    status = `falha: ${e.message}`.slice(0, 120);
  }
  run("UPDATE submissions SET webhook_status = ? WHERE code = ?", status, sub.code);
  if (!status.startsWith("ok")) console.warn(`[webhook] ${sub.code}: ${status}`);
}

export { ValidationError };
