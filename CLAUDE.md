# CLAUDE.md — promptizi

This file is the charter for any AI agent (Claude Code, Cursor, etc.) working
on this repository. It explains the project, the conventions, and what to
check before making changes.

## Project

**promptizi** is a portfolio demo of a two-agent engineering team that
ships code through GitHub:

- **Builder Agent** turns a backlog issue into a code change (branch + commit).
- **Validator Agent** reviews a PR diff against a written policy and either
  approves or requests changes via a required status check.

The product the agents maintain is a tiny Node library that validates AI
prompts before they're sent to an LLM (today: token counting via `tiktoken`).
The product is deliberately small — the point is the agentic workflow, not
the product.

## Repo layout

```
agents/
  builder/                  Robô 1 · escreve código
    system.md               Instruções (prompt) do Builder
    run.mjs                 Pipeline: lê issue → chama Claude → cria branch + commit
  validator/                Robô 2 · revisa PR
    system.md               Instruções (prompt) com a validation policy
    run.mjs                 Pipeline: lê diff → chama Claude → imprime veredito (exit 0/1)
src/                        O produto que os agentes mantêm
  index.mjs                 countTokens(prompt) — usa tiktoken
test/                       Testes do produto (node:test)
evals/                      [FUTURO] PRs gabaritados para medir o Validator
docs/
  backlog/                  Issues em markdown que o Builder consome
.github/workflows/
  validator.yml             Roda o Validator em todo pull_request
```

## Stack & conventions

- **Runtime:** Node 22, ES modules (`.mjs`), zero build step.
- **Tests:** `node --test` (built-in). Use `node:test` + `node:assert/strict`.
- **Tipos:** JSDoc (`@param`, `@returns`) — NÃO usar TypeScript.
- **API keys:** lidas via `process.env`, carregadas com `node --env-file=.env`
  localmente e via `secrets` no GitHub Actions.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`, `ci:`, `docs:`, `test:`).
- **Agent prompts:** ficam em arquivos `system.md` separados, não hardcoded
  no `.mjs`. Isso permite versionar prompts como configuração.
- **Model:** ambos os agentes usam `claude-opus-4-7` (já é determinístico por
  padrão — **não passar `temperature`**, é deprecated nesse modelo).
- **Idioma:** comentários e UI em pt-BR; código e identifiers em en.

## How each agent works

### Builder (`node agents/builder/run.mjs <issue.md>`)

1. Lê `system.md` (instruções).
2. Lê a issue passada como argumento.
3. Gera um snapshot do repo via `git ls-files src test package.json`.
4. Chama `https://api.anthropic.com/v1/messages` com `system` + `user`.
5. Espera resposta em JSON estrito: `{ branch, commit_message, files[], notes }`.
6. Cria branch, escreve arquivos, `git add -A`, commita.
7. NÃO faz push — humano decide.

### Validator (`node agents/validator/run.mjs <branch>`)

1. Lê `system.md` (que contém a validation policy).
2. Resolve as refs (`resolveRef`: tenta o nome local, cai para `origin/<nome>`)
   e faz `git diff <base>...<head>` para pegar o diff.
3. Filtra lockfiles, trunca se passar de 50k chars.
4. Chama a API com o diff.
5. Espera JSON estrito: `{ decision, summary, checks[], blocking_issues[] }`.
6. Imprime veredito formatado e sai com `process.exit(0)` se `approve`,
   `process.exit(1)` se `request_changes`.

A validation policy (regras numeradas 1–5) está no `agents/validator/system.md`.

## CI / GitHub Actions

`.github/workflows/validator.yml` roda em `pull_request` events
(`opened`, `synchronize`, `reopened`):

1. `actions/checkout@v4` com `fetch-depth: 0`.
2. `actions/setup-node@v4` Node 22.
3. Roda `node agents/validator/run.mjs "$BRANCH"`, captura saída em
   `verdict.txt` e exit code via `${PIPESTATUS[0]}`.
4. Comenta no PR via `actions/github-script@v7`.
5. Cria commit status `validator-agent` (success | failure).

Secret necessário no repo: `ANTHROPIC_API_KEY`.

### Resolvido — diff falhava no CI (commit `26b38aa`)

**Sintoma:** o Validator produzia comentário vazio e status `failure` no CI.

**Causa:** em `pull_request`, o `actions/checkout` deixa o repo em HEAD
destacado no merge ref (`refs/remotes/pull/N/merge`). Não existe branch
local `main` nem o branch do PR — só refs remotas em `refs/remotes/origin/*`.
Então `git diff main...<branch>` (e depois `git diff origin/main...<branch>`)
estourava com `unknown revision`, porque o **head** do range não resolvia.

**Fix:** `resolveRef()` em `agents/validator/run.mjs` tenta o nome local e,
se não existir, cai para `origin/<nome>`. Aplicado nas duas pontas do diff.
Funciona local e no runner, sem precisar mexer no `validator.yml`.

Antes de propor fix, **leia os logs do step "Run Validator Agent"** via
`gh run view --log` ou abrindo o run mais recente em
`https://github.com/<owner>/<repo>/actions`.

## Common tasks

### Rodar o Builder localmente

```bash
node --env-file=.env agents/builder/run.mjs docs/backlog/0001-add-real-tokenizer.md
```

### Rodar o Validator localmente

```bash
node --env-file=.env agents/validator/run.mjs <branch-name>
```

### Rodar testes do produto

```bash
npm install     # tiktoken é uma dep WASM
npm test
```

### Inspecionar o último run do Actions

```bash
gh run list --workflow=validator.yml --limit 5
gh run view --log                   # log do run mais recente
gh run view <run-id> --log-failed   # só os steps que falharam
```

## Guardrails / things NOT to do

- ❌ **Não modifique `agents/`** quando estiver agindo como Builder pra resolver
  uma issue de produto. O agente nunca deveria poder se editar.
- ❌ Não adicione dependências sem mencionar no PR body — preferimos zero deps.
- ❌ Não comite `.env`, chaves, ou `flags.json`/qualquer arquivo de runtime.
- ❌ Não use `console.log` em `src/` (Rule 5 da policy do Validator).
- ❌ Não passe `temperature` na chamada da API — o modelo atual deprecou.
- ❌ Não troque `node:test` por Jest/Vitest — manter zero build.
- ❌ Não converta `.mjs` para `.ts`/`.js` — decisão consciente do projeto.

## Roadmap (próximas fases)

- **Fase 3 — diferenciais:**
  - `evals/` com 20 PRs gabaritados rodando no CI a cada push.
  - Observability: logar custo/tempo/decisão de cada run num JSON line.
  - `FAILURE_MODES.md` documentando casos reais já vistos.
  - Guardrail no Builder: validar main limpa + `git add` cirúrgico
    (só os arquivos do plano), em vez de `git add -A`.
- **Fase 4 — nice-to-have:** MCP server expondo o eval DB; landing page;
  AI Gateway para trocar de provider.

## How to ask Claude Code for help on this repo

- Para debugar workflows: peça `gh run view --log` antes de chutar solução.
- Para mexer em prompt: edite `agents/<robô>/system.md`, nunca o `.mjs`.
- Para adicionar regra de validação: nova entrada na policy do
  `agents/validator/system.md`, e (idealmente) um caso de teste em `evals/`.
- Para mudanças no Builder/Validator: lembre que esse é o "kernel" do projeto.
  Mudanças aqui são raras e deliberadas, não toques rotineiros.
