#!/usr/bin/env node
/**
 * Builder Agent — turns an issue into a code change plan.
 *
 * Usage:
 *   node agents/builder/run.mjs <path-to-issue.md>
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

// ─── ETAPA A: Instruções ─────────────────────────────────────────
const SYSTEM = fs.readFileSync(path.join(__dirname, "system.md"), "utf8");

// ─── ETAPA B: Contexto ───────────────────────────────────────────

/** Lê o arquivo da issue passado como argumento. */
function readIssue() {
  const issuePath = process.argv[2];
  if (!issuePath) {
    throw new Error("Uso: node agents/builder/run.mjs <issue.md>");
  }
  return fs.readFileSync(issuePath, "utf8");
}

/**
 * Pega um snapshot dos arquivos importantes do repo.
 * Assim o robô vê a "cara" do código antes de escrever.
 */
function repoSnapshot() {
  const files = execSync("git ls-files src test package.json", {
    cwd: REPO_ROOT,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);

  return files
    .map((f) => {
      const content = fs.readFileSync(path.join(REPO_ROOT, f), "utf8");
      return `--- ${f} ---\n${content}`;
    })
    .join("\n\n");
}

// ─── ETAPA C: Chamar a IA ────────────────────────────────────────

const MODEL = "claude-opus-4-7";

/**
 * Chama a API da Anthropic com nosso system + contexto.
 * @returns {Promise<string>} texto da resposta do robô
 */
async function callClaude({ system, issue, snapshot }) {
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
      max_tokens: 4000,
      system,
      messages: [
        {
          role: "user",
          content: `ISSUE:\n${issue}\n\nREPO SNAPSHOT:\n${snapshot}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();

  // 💰 Logar custo é hábito de sênior (observability!)
  console.log(
    `💰 tokens: ${data.usage.input_tokens} in / ${data.usage.output_tokens} out`,
  );

  return data.content[0].text;
}

// ─── EXECUÇÃO ────────────────────────────────────────────────────

const issue = readIssue();
const snapshot = repoSnapshot();

console.log("🤖 Builder pensando...\n");
const resposta = await callClaude({ system: SYSTEM, issue, snapshot });
// ─── ETAPA D: Aplicar a resposta ─────────────────────────────────

/**
 * Parseia a resposta do robô em JSON, tolerando ```json fences.
 * @param {string} text
 * @returns {{branch:string, commit_message:string, files:Array<{path:string,action:string,content:string}>, notes?:string}}
 */
function parsePlan(text) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error(`Resposta não é JSON válido:\n${text}`);
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

/**
 * Aplica o plano: cria branch, escreve arquivos, commita.
 * Deliberadamente NÃO faz push — você revisa antes.
 */
function applyPlan(plan) {
  // 1. branch nova a partir da main
  execSync(`git checkout -b ${plan.branch}`, {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });

  // 2. escrever cada arquivo
  for (const file of plan.files) {
    const full = path.join(REPO_ROOT, file.path);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, file.content);
    console.log(`  📄 ${file.action}: ${file.path}`);
  }

  // 3. commitar com a mensagem do robô
  execSync("git add -A", { cwd: REPO_ROOT, stdio: "inherit" });
  execSync(`git commit -m ${JSON.stringify(plan.commit_message)}`, {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });

  console.log(`\n✅ Branch '${plan.branch}' pronta. Para subir:`);
  console.log(`   git push -u origin ${plan.branch}`);
}

// ─── EXECUÇÃO ────────────────────────────────────────────────────

const issue = readIssue();
const snapshot = repoSnapshot();

console.log("🤖 Builder pensando...\n");
const resposta = await callClaude({ system: SYSTEM, issue, snapshot });

const plan = parsePlan(resposta);
console.log(`\n📋 Plano: ${plan.branch}\n`);

applyPlan(plan);

if (plan.notes) {
  console.log(`\n📝 Notes do robô:\n${plan.notes}`);
}
