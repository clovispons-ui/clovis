import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const seed = JSON.parse(await readFile(new URL("../data/seed.json", import.meta.url), "utf8"));
const countByCategory = new Map();

for (const set of seed.dilemmaSets) {
  countByCategory.set(set.categoryId, (countByCategory.get(set.categoryId) ?? 0) + set.dilemmas.length);
}

test("la banque contient assez de dilemmes soft et hot", () => {
  assert.ok((countByCategory.get("soft") ?? 0) >= 100, "Le mode soft doit proposer au moins 100 dilemmes.");
  assert.ok((countByCategory.get("hot") ?? 0) >= 50, "Le mode hot doit proposer au moins 50 dilemmes.");
});

test("les catégories soft et hot sont bien définies", () => {
  const categories = new Map(seed.categories.map((category) => [category.id, category]));
  assert.equal(categories.size, 2);
  assert.equal(categories.get("soft")?.adult, false);
  assert.equal(categories.get("hot")?.adult, true);
  for (const category of seed.categories) {
    assert.ok(category.label.trim());
    assert.ok(category.description.trim());
  }
});

test("chaque dilemme a deux options distinctes, uniques et rattachées à un sous-thème", () => {
  const categories = new Set(seed.categories.map((category) => category.id));
  const seen = new Set();
  const normalize = (value) => value.trim().toLocaleLowerCase("fr");

  for (const set of seed.dilemmaSets) {
    assert.ok(categories.has(set.categoryId), `Catégorie inconnue : ${set.categoryId}.`);
    assert.ok(set.theme.trim(), "Chaque groupe de dilemmes doit avoir un sous-thème.");
    for (const [optionA, optionB] of set.dilemmas) {
      assert.ok(optionA.trim(), "La première option ne doit pas être vide.");
      assert.ok(optionB.trim(), "La seconde option ne doit pas être vide.");
      assert.notEqual(normalize(optionA), normalize(optionB), `Dilemme aux options identiques : ${optionA}.`);
      const pairId = [normalize(optionA), normalize(optionB)].sort().join(" | ");
      assert.ok(!seen.has(pairId), `Dilemme en double : ${optionA} / ${optionB}.`);
      seen.add(pairId);
    }
  }
});