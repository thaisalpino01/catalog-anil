import path from "node:path";
import crypto from "node:crypto";

const env = process.env;
const dataDir = path.resolve(env.DATA_DIR || "./data");

if (!env.ADMIN_PASSWORD) {
  console.warn("[config] ADMIN_PASSWORD não definido — o painel /admin ficará bloqueado.");
}
if (!env.SESSION_SECRET) {
  console.warn("[config] SESSION_SECRET não definido — sessões do painel serão perdidas a cada reinício.");
}

export const config = {
  port: Number(env.PORT || 3000),
  dataDir,
  mediaDir: path.join(dataDir, "media"),
  publicUrl: (env.PUBLIC_URL || "").replace(/\/$/, ""),
  adminUser: env.ADMIN_USER || "admin",
  adminPassword: env.ADMIN_PASSWORD || "",
  sessionSecret: env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
  // WhatsApp que recebe o orçamento quando o link não indica vendedora (?v=)
  defaultWhatsapp: (env.WHATSAPP_PADRAO || "").replace(/\D/g, ""),
  webhookUrl: env.N8N_WEBHOOK_URL || "",
  webhookToken: env.N8N_WEBHOOK_TOKEN || "",
  codePrefix: (env.CODE_PREFIX || "ANL").toUpperCase(),
  trustProxy: env.TRUST_PROXY !== "false",
};
