/**
 * promptizi — valida prompts antes de mandar pra IA.
 * v0.1: conta tokens (aproximação por caracteres).
 */

/**
 * Conta tokens aproximados em um prompt.
 * Regra de bolso: ~4 caracteres = 1 token.
 *
 * @param {string} prompt - O texto a contar.
 * @returns {number} Quantidade aproximada de tokens.
 */
export function countTokens(prompt) {
  if (typeof prompt !== "string") {
    throw new TypeError("prompt deve ser uma string");
  }

  return Math.ceil(prompt.length / 4);
}
