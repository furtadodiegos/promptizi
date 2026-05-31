/**
 * promptizi — valida prompts antes de mandar pra IA.
 * v0.2: conta tokens usando o tokenizer real da OpenAI (tiktoken).
 */

import { encoding_for_model } from "tiktoken";

// Reutiliza o encoder entre chamadas para evitar overhead.
const encoder = encoding_for_model("gpt-4");

/**
 * Conta tokens em um prompt usando o tokenizer oficial da OpenAI.
 *
 * @param {string} prompt - O texto a contar.
 * @returns {number} Quantidade de tokens.
 */
export function countTokens(prompt) {
  if (typeof prompt !== "string") {
    throw new TypeError("prompt deve ser uma string");
  }

  if (prompt.length === 0) {
    return 0;
  }

  return encoder.encode(prompt).length;
}
