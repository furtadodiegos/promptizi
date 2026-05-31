# Issue: Use o tokenizer real da OpenAI

A contagem atual usa `length / 4` — é só uma estimativa.

## Acceptance criteria

- Substituir a aproximação por `tiktoken` (lib oficial da OpenAI).
- Manter a mesma API: `countTokens(prompt) -> number`.
- Atualizar os testes para validar números reais (ex: "hello" = 1 token).
- Sem mudar a assinatura da função.
