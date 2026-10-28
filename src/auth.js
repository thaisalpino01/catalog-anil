import crypto from "node:crypto";
import { config } from "./config.js";

const COOKIE = "anil_admin";
const MAX_AGE_MS = 1000 * 60 * 60 * 12; // 12h

const sign = (value) => crypto.createHmac("sha256", config.sessionSecret).update(value).digest("base64url");

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

export function checkCredentials(user, password) {
  if (!config.adminPassword) return false;
  // compara os dois sempre, para não vazar pelo tempo qual campo errou
  const userOk = safeEqual(user, config.adminUser);
  const passOk = safeEqual(password, config.adminPassword);
  return userOk && passOk;
}

export function issueSession(res, req) {
  const payload = Buffer.from(JSON.stringify({ u: config.adminUser, exp: Date.now() + MAX_AGE_MS })).toString("base64url");
  res.cookie(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.secure,
    maxAge: MAX_AGE_MS,
    path: "/",
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { path: "/" });
}

function readCookie(req) {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE) return decodeURIComponent(v.join("="));
  }
  return null;
}

export function isAuthenticated(req) {
  const raw = readCookie(req);
  if (!raw) return false;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig || !safeEqual(sig, sign(payload))) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    return Date.now() < exp;
  } catch {
    return false;
  }
}

export function requireAdmin(req, res, next) {
  if (isAuthenticated(req)) return next();
  res.status(401).json({ error: "Não autenticado" });
}
