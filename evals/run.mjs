#!/usr/bin/env node
/**
 * Eval runner — roda o Validator em casos gabaritados e mede o acerto.
 *
 * Cada caso é um par de arquivos em evals/cases/:
 *   <nome>.diff           → o diff (PR de mentira) a revisar
 *   <nome>.expected.json  → { decision: "approve" | "request_changes", ... }
 *
 * O runner alimenta o Validator com cada diff, compara a decisão dele com
 * o gabarito e imprime um placar. Sai com código 1 se algum caso falhar.
 *
 * Uso:
 *   node --env-file=.env evals/run.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SYSTEM, callClaude, parseVerdict } from "../agents/validator/run.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CASES_DIR = path.join(__dirname, "cases");

/**
 * Carrega todos os casos (.diff + .expected.json) da pasta cases/.
 * @returns {{name: string, diff: string, expected: object}[]}
 */
function loadCases() {
  return fs
    .readdirSync(CASES_DIR)
    .filter((f) => f.endsWith(".diff"))
    .sort()
    .map((f) => {
      const name = f.replace(/\.diff$/, "");
      const diff = fs.readFileSync(path.join(CASES_DIR, f), "utf8");
      const expected = JSON.parse(
        fs.readFileSync(path.join(CASES_DIR, `${name}.expected.json`), "utf8"),
      );
      return { name, diff, expected };
    });
}

const cases = loadCases();
console.log(`🧪 Rodando ${cases.length} evals contra o Validator...\n`);

let pass = 0;

for (const c of cases) {
  const resposta = await callClaude({ system: SYSTEM, diff: c.diff });
  const verdict = parseVerdict(resposta);
  const ok = verdict.decision === c.expected.decision;
  if (ok) pass++;

  console.log(
    `  ${ok ? "✅" : "❌"} ${c.name}` +
      `  ·  esperado: ${c.expected.decision}  →  obteve: ${verdict.decision}`,
  );
  if (!ok) {
    console.log(`       ↳ regra-alvo: ${c.expected.rule_focus}`);
    console.log(`       ↳ veredito do robô: ${verdict.summary}`);
  }
}

console.log(`\n${"━".repeat(55)}`);
console.log(`📊 Placar: ${pass}/${cases.length} acertos`);
console.log("━".repeat(55));

// exit code reflete o resultado — útil pro CI depois
process.exit(pass === cases.length ? 0 : 1);
