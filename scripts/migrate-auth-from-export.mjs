#!/usr/bin/env node

/**
 * Migra usuários Supabase Auth a partir de um JSON exportado da origem.
 *
 * Segurança:
 * - dry-run por padrão;
 * - nunca imprime password_hash;
 * - exige --apply para escrever;
 * - preserva UUID quando o export contém `id`;
 * - preserva hash bcrypt/argon2 via `password_hash` quando disponível.
 *
 * Formato aceito:
 * [
 *   {
 *     "id": "uuid-v4",
 *     "email": "equipe@gpva.local",
 *     "password_hash": "$2a$...",
 *     "email_confirm": true,
 *     "user_metadata": {},
 *     "app_metadata": {}
 *   }
 * ]
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-auth-from-export.mjs ./auth-users.json
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-auth-from-export.mjs ./auth-users.json --apply
 */

import fs from "node:fs/promises";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const apply = args.includes("--apply");

if (!file) {
  console.error("Informe o caminho do JSON de usuários.");
  process.exit(2);
}

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.");
  process.exit(2);
}

const raw = await fs.readFile(file, "utf8");
const parsed = JSON.parse(raw);
const users = Array.isArray(parsed) ? parsed : parsed?.users;
if (!Array.isArray(users)) {
  console.error("Export inválido: esperado array ou objeto { users: [...] }.");
  process.exit(2);
}

const sb = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const isUuid = (v) =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

let planned = 0;
let created = 0;
let skipped = 0;
let failed = 0;

for (const source of users) {
  const id = source?.id;
  const email = typeof source?.email === "string" ? source.email.trim() : "";
  if (!isUuid(id) || !email) {
    failed++;
    console.error(`[INVÁLIDO] id/email ausente ou UUID não-v4: ${email || "(sem email)"}`);
    continue;
  }

  const existing = await sb.auth.admin.getUserById(id);
  if (!existing.error && existing.data?.user) {
    skipped++;
    console.log(`[SKIP] ${email} — UUID já existe no destino.`);
    continue;
  }

  planned++;
  if (!apply) {
    console.log(`[DRY-RUN] criaria ${email} mantendo UUID ${id}.`);
    continue;
  }

  const attrs = {
    id,
    email,
    email_confirm: source.email_confirm ?? Boolean(source.email_confirmed_at),
    user_metadata: source.user_metadata ?? source.raw_user_meta_data ?? {},
    app_metadata: source.app_metadata ?? source.raw_app_meta_data ?? {},
  };

  const passwordHash = source.password_hash ?? source.encrypted_password;
  if (typeof passwordHash === "string" && passwordHash.trim()) {
    attrs.password_hash = passwordHash;
  } else if (typeof source.password === "string" && source.password) {
    attrs.password = source.password;
  } else {
    console.error(`[ERRO] ${email} — export sem password_hash/password.`);
    failed++;
    continue;
  }

  const { error } = await sb.auth.admin.createUser(attrs);
  if (error) {
    failed++;
    console.error(`[ERRO] ${email} — ${error.message}`);
  } else {
    created++;
    console.log(`[OK] ${email} — UUID preservado.`);
  }
}

console.log(`\nResumo: modo=${apply ? "APPLY" : "DRY-RUN"} total=${users.length} planejados=${planned} criados=${created} existentes=${skipped} falhas=${failed}`);
if (!apply) console.log("Nenhuma escrita foi realizada. Use --apply somente após validar o export.");
if (failed > 0) process.exitCode = 1;
