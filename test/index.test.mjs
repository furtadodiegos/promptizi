import { test } from "node:test";
import assert from "node:assert/strict";
import { countTokens } from "../src/index.mjs";

test("conta 1 token para 'hello'", () => {
  assert.equal(countTokens("hello"), 1);
});

test("string vazia retorna 0 tokens", () => {
  assert.equal(countTokens(""), 0);
});

test("conta tokens de uma frase simples", () => {
  // 'Hello, world!' em cl100k_base = 4 tokens
  assert.equal(countTokens("Hello, world!"), 4);
});

test("retorna número positivo para texto não-trivial", () => {
  const n = countTokens("The quick brown fox jumps over the lazy dog.");
  assert.ok(n > 0);
  assert.equal(typeof n, "number");
});

test("lança TypeError se não for string", () => {
  assert.throws(() => countTokens(123), TypeError);
});

test("lança TypeError para null", () => {
  assert.throws(() => countTokens(null), TypeError);
});
