import { test } from "node:test";
import assert from "node:assert/strict";
import { countTokens } from "../src/index.mjs";

test("conta tokens de uma frase simples", () => {
  assert.equal(countTokens("Olá, mundo!"), 3);
});

test("string vazia retorna 0 tokens", () => {
  assert.equal(countTokens(""), 0);
});

test("lança erro se não for string", () => {
  assert.throws(() => countTokens(123), TypeError);
});
