#!/usr/bin/env node

/**
 * Importa dados do schema public do ACP/GPVA a partir de um diretório de JSONs.
 * Dry-run por padrão; use --apply para escrever.
 *
 * Espera arquivos opcionais no diretório, um array JSON por tabela:
 * setores.json, supervisores.json, lideres_estrutura.json, equipes.json,
 * tipos_servico.json, motivos_inviabilidade.json, impactos.json,
 * complementos_servico.json, catalog_order.json, expedientes.json,
 * servicos.json, impactos_expediente.json, vinculos_complementos.json,
 * procedimentos.json, procedimento_versoes.json, google_form_settings.json,
 * user_roles.json.
 *
 * Auth deve ser migrado ANTES deste script para preservar as FKs de auth.users.
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--"));
const apply = args.includes("--apply");
if (!dir) {
  console.error("Informe o diretório dos exports JSON.");
  process.exit(2);
}

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.");
  process.exit(2);
}

const sb = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const order = [
  "setores",
  "supervisores",
  "lideres_estrutura",
  "equipes",
  "user_roles",
  "tipos_servico",
  "motivos_inviabilidade",
  "impactos",
  "complementos_servico",
  "catalog_order",
  "expedientes",
  "servicos",
  "impactos_expediente",
  "vinculos_complementos",
  "procedimentos",
  "procedimento_versoes",
  "google_form_settings",
];

async function readRows(table) {
  const filename = path.join(dir, `${table}.json`);
  try {
    const raw = await fs.readFile(filename, "utf8");
    const parsed = JSON.parse(raw);
    const rows = Array.isArray(parsed) ? parsed : parsed?.rows;
    if (!Array.isArray(rows)) throw new Error("esperado array ou { rows: [...] }");
    return rows;
  } catch (e) {
    if (e?.code === "ENOENT") return null;
    throw new Error(`${table}.json inválido: ${e.message}`);
  }
}

async function assertAuthIds(rows, fields, table) {
  const ids = [...new Set(rows.flatMap((r) => fields.map((f) => r?.[f])).filter(Boolean))];
  for (const id of ids) {
    const { data, error } = await sb.auth.admin.getUserById(id);
    if (error || !data?.user) throw new Error(`${table}: auth user ausente no destino: ${id}`);
  }
}

let total = 0;
let written = 0;
let skippedFiles = 0;

for (const table of order) {
  const rows = await readRows(table);
  if (rows === null) {
    skippedFiles++;
    console.log(`[SKIP] ${table}.json ausente.`);
    continue;
  }

  total += rows.length;
  if (rows.length === 0) {
    console.log(`[OK] ${table}: 0 registros.`);
    continue;
  }

  if (["equipes"].includes(table)) await assertAuthIds(rows, ["id"], table);
  if (table === "lideres_estrutura") await assertAuthIds(rows, ["user_id"], table);
  if (table === "user_roles") await assertAuthIds(rows, ["user_id"], table);
  if (table === "supervisores") await assertAuthIds(rows, ["user_id"], table);
  if (table === "setores") await assertAuthIds(rows, ["supervisor_user_id"], table);
  if (table === "procedimentos") await assertAuthIds(rows, ["responsavel_id"], table);
  if (table === "procedimento_versoes") {
    await assertAuthIds(rows, ["criado_por_id", "publicado_por_id", "status_alterado_por_id"], table);
  }

  if (!apply) {
    console.log(`[DRY-RUN] ${table}: ${rows.length} registros prontos para upsert.`);
    continue;
  }

  const chunkSize = 250;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const options = table === "catalog_order"
      ? { onConflict: "team_id,catalog" }
      : table === "google_form_settings"
        ? { onConflict: "id" }
        : table === "user_roles"
          ? { onConflict: "user_id,role" }
          : { onConflict: "id" };
    const { error } = await sb.from(table).upsert(chunk, options);
    if (error) throw new Error(`${table}: ${error.message}`);
    written += chunk.length;
  }
  console.log(`[OK] ${table}: ${rows.length} registros processados.`);
}

console.log(`\nResumo: modo=${apply ? "APPLY" : "DRY-RUN"} registros=${total} escritos=${written} arquivos_ausentes=${skippedFiles}`);
if (!apply) console.log("Nenhuma escrita foi realizada. Execute Auth primeiro e use --apply somente após validar todos os exports.");
