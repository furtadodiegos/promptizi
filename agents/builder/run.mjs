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

function readIssue() {
  const issuePath = process.argv[2];
  if (!issuePath) {
    throw new Error("Uso: node agents/builder/run.mjs <issue.md>");
  }
  return fs.readFileSync(issuePath, "utf8");
}

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
  console.log(
    `💰 tokens: ${data.usage.input_tokens} in / ${data.usage.output_tokens} out`,
  );
  return data.content[0].text;
}

// ─── ETAPA D: Aplicar a resposta ─────────────────────────────────

function parsePlan(text) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error(`Resposta não é JSON válido:\n${text}`);
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

function applyPlan(plan) {
  execSync(`git checkout -b ${plan.branch}`, {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });

  for (const file of plan.files) {
    const full = path.join(REPO_ROOT, file.path);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, file.content);
    console.log(`  📄 ${file.action}: ${file.path}`);
  }

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
