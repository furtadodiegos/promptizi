#!/usr/bin/env node
/**
 * Eval capture — transforma uma branch (um PR real) num caso de eval.
 *
 * O loop que isto fecha:
 *   1. captura o diff da branch                     (automático)
 *   2. roda o Validator pra PROPOR um gabarito      (automático)
 *   3. você carimba o gabarito correto via --expected (humano)
 *   4. salva <name>.diff + <name>.expected.json em evals/cases/
 *
 * O gabarito é HUMANO de propósito: se você só gravasse a decisão do robô,
 * nunca pegaria os casos em que ele erra. Quando o Validator DISCORDA do seu
 * gabarito, esse é o caso mais valioso — uma regressão capturada.
 *
 * Uso:
 *   node --env-file=.env evals/capture.mjs <branch> --name <slug> \
 *        [--expected approve|request_changes] [--note "..."]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  SYSTEM,
  callClaude,
  parseVerdict,
  diffForBranch,
} from "../agents/validator/run.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CASES_DIR = path.join(__dirname, "cases");

// ── parse de argumentos (simples) ──
const args = process.argv.slice(2);
const branch = args[0];
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i + 1] : undefined;
};
const name = flag("name");
const expectedFlag = flag("expected");
const note = flag("note");

if (!branch || !name) {
  console.error(
    'Uso: node --env-file=.env evals/capture.mjs <branch> --name <slug> ' +
      '[--expected approve|request_changes] [--note "..."]',
  );
  process.exit(2);
}

// ── 1. captura o diff da branch (automático) ──
const diff = diffForBranch(branch);
console.log(`📥 Diff capturado de '${branch}' (${diff.length} chars)`);

// ── 2. roda o Validator pra PROPOR um gabarito (automático) ──
const verdict = parseVerdict(await callClaude({ system: SYSTEM, diff }));
console.log(`🤖 Validator decidiu: ${verdict.decision}`);

// ── 3. gabarito = humano (--expected) ou a proposta do robô (provisório) ──
const expected = expectedFlag || verdict.decision;
const carimbado = Boolean(expectedFlag);

if (verdict.decision !== expected) {
  console.log(
    "\n🚨 O Validator DISCORDOU do gabarito — caso de regressão valioso!",
  );
  console.log(`   robô: ${verdict.decision}  ·  gabarito humano: ${expected}`);
}

// ── 4. salva o caso ──
const diffPath = path.join(CASES_DIR, `${name}.diff`);
const expPath = path.join(CASES_DIR, `${name}.expected.json`);

fs.writeFileSync(diffPath, diff);
fs.writeFileSync(
  expPath,
  JSON.stringify(
    {
      decision: expected,
      source_branch: branch,
      validator_said: verdict.decision,
      stamped_by_human: carimbado,
      note: note || verdict.summary,
    },
    null,
    2,
  ) + "\n",
);

console.log("\n✅ Caso salvo:");
console.log(`   ${path.relative(process.cwd(), diffPath)}`);
console.log(`   ${path.relative(process.cwd(), expPath)}`);

if (!carimbado) {
  console.log(
    "\n⚠️  Gabarito provisório (= decisão do robô). " +
      "Revise o expected.json e carimbe com --expected se ele errou.",
  );
}
