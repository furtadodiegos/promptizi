#!/usr/bin/env node
/**
 * Validator Agent — reviews a PR diff against the team policy.
 *
 * Usage:
 *   node agents/validator/run.mjs <branch-name>
 *
 * The validator compares <branch-name> against main and asks Claude
 * to return a structured verdict (approve | request_changes).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

// ─── ETAPA A: Instruções ─────────────────────────────────────────
const SYSTEM = fs.readFileSync(path.join(__dirname, "system.md"), "utf8");

// ─── ETAPA B: Contexto (o diff) ──────────────────────────────────

const IGNORED_PATHS = [
  /package-lock\.json$/,
  /pnpm-lock\.yaml$/,
  /yarn\.lock$/,
];
const MAX_DIFF_CHARS = 50_000; // protege custo/latência

/**
 * Retorna o diff entre a branch passada e main.
 * Filtra lockfiles e trunca se passar do limite.
 */
function readDiff() {
  const branch = process.argv[2];
  if (!branch) {
    throw new Error("Uso: node agents/validator/run.mjs <branch-name>");
  }

  const raw = execSync(`git diff origin/main...${branch}`, {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });

  if (!raw.trim()) {
    throw new Error(`Sem diff entre origin/main e ${branch} — branch existe?`);
  }

  // separa por arquivo, descarta lockfiles
  const blocks = raw.split(/(?=^diff --git )/m);
  const kept = blocks.filter((b) => {
    const header = b.split("\n")[0] || "";
    return !IGNORED_PATHS.some((re) => re.test(header));
  });

  let filtered = kept.join("");
  if (filtered.length > MAX_DIFF_CHARS) {
    filtered =
      filtered.slice(0, MAX_DIFF_CHARS) +
      `\n\n[... diff truncated at ${MAX_DIFF_CHARS} chars ...]`;
  }
  return filtered;
}

// ─── ETAPA C: Chamar a IA ────────────────────────────────────────

const MODEL = "claude-opus-4-7";

async function callClaude({ system, diff }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY não encontrada no ambiente");
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system,
      messages: [
        { role: "user", content: `Review this pull request diff:\n\n${diff}` },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  console.log(
    `💰 tokens: ${data.usage.input_tokens} in / ${data.usage.output_tokens} out`,
  );
  return data.content[0].text;
}

// ─── ETAPA D: Parsear veredito e imprimir bonito ─────────────────

function parseVerdict(text) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error(`Veredito não é JSON válido:\n${text}`);
  }
  const v = JSON.parse(cleaned.slice(start, end + 1));
  if (!["approve", "request_changes"].includes(v.decision)) {
    throw new Error(`Decision inválida: ${v.decision}`);
  }
  return v;
}

function printVerdict(v) {
  const icon = (s) => (s === "pass" ? "✅" : s === "fail" ? "❌" : "➖");
  const header =
    v.decision === "approve" ? "✅ APROVADO" : "❌ MUDANÇAS PEDIDAS";

  console.log(`\n${"━".repeat(60)}`);
  console.log(`🕵️  Validator · ${header}`);
  console.log(`${"━".repeat(60)}`);
  console.log(`\n${v.summary}\n`);

  console.log("Checks:");
  for (const c of v.checks || []) {
    console.log(`  ${icon(c.status)} ${c.rule}`);
    console.log(`      ${c.detail}`);
  }

  if ((v.blocking_issues || []).length) {
    console.log("\n🚨 Blocking issues:");
    for (const issue of v.blocking_issues) {
      console.log(`  • ${issue}`);
    }
  }
  console.log("");
}

// ─── EXECUÇÃO ────────────────────────────────────────────────────

const diff = readDiff();
console.log(`🕵️  Validator pensando... (${diff.length} chars de diff)\n`);

const resposta = await callClaude({ system: SYSTEM, diff });
const verdict = parseVerdict(resposta);
printVerdict(verdict);

// exit code reflete decisão — útil pro CI depois
process.exit(verdict.decision === "approve" ? 0 : 1);
