import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const seed = JSON.parse(await readFile(new URL("../data/seed.json", import.meta.url), "utf8"));

test("la banque contient le minimum de mots et de paires", () => {
  assert.ok(seed.wordSets.reduce((total, set) => total + set.values.length, 0) >= 300);
  assert.ok(seed.pairSets.reduce((total, set) => total + set.pairs.length, 0) >= 100);
});

test("tous les contenus sont rattachés à une catégorie et les paires sont distinctes", () => {
  const categories = new Set(seed.categories.map((category) => category.id));
  for (const set of seed.wordSets) {
    assert.ok(categories.has(set.categoryId));
    assert.ok(set.clue.trim());
    assert.ok(["vague", "moyenne", "precise"].includes(set.cluePrecision));
  }
  for (const set of seed.pairSets) {
    assert.ok(categories.has(set.categoryId));
    for (const [civilianWord, impostorWord] of set.pairs) {
      assert.notEqual(civilianWord.trim().toLocaleLowerCase("fr"), impostorWord.trim().toLocaleLowerCase("fr"));
    }
  }
});
