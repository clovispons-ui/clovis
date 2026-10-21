import assert from "node:assert/strict";
import test from "node:test";
import { normalizePlayerName } from "../src/players.js";

test("les pseudos sont normalisés sans accents ni espaces multiples", () => {
  assert.equal(normalizePlayerName("  Éléonore  Dubois "), "eleonore dubois");
});

test("les variantes d'un même pseudo ne peuvent pas se confondre", () => {
  assert.equal(normalizePlayerName("Léa"), normalizePlayerName("LEA"));
  assert.notEqual(normalizePlayerName("Léa"), normalizePlayerName("Léo"));
});