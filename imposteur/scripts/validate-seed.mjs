import { readFile } from "node:fs/promises";

const seedUrl = new URL("../data/seed.json", import.meta.url);
const seed = JSON.parse(await readFile(seedUrl, "utf8"));
const categoryIds = new Set(seed.categories.map((category) => category.id));
const words = seed.wordSets.flatMap((set) => set.values);
const pairs = seed.pairSets.flatMap((set) => set.pairs);
const errors = [];
const uniqueWordIds = new Set();
const normalize = (value) => value.trim().toLocaleLowerCase("fr");

if (!Number.isInteger(seed.version) || seed.version < 1) errors.push("version doit être un entier positif.");
if (categoryIds.size !== seed.categories.length) errors.push("Les identifiants de catégories doivent être uniques.");
if (words.length < 300) errors.push(`La banque doit contenir au moins 300 mots simples (actuellement ${words.length}).`);
if (pairs.length < 100) errors.push(`La banque doit contenir au moins 100 paires (actuellement ${pairs.length}).`);

for (const category of seed.categories) {
  if (!category.id || !category.label) errors.push("Chaque catégorie doit avoir un identifiant et un libellé.");
}

for (const set of seed.wordSets) {
  if (!categoryIds.has(set.categoryId)) errors.push(`Catégorie inconnue pour le groupe de mots : ${set.categoryId}.`);
  if (!set.clue?.trim()) errors.push(`Indice absent pour la catégorie ${set.categoryId}.`);
  if (!["vague", "moyenne", "precise"].includes(set.cluePrecision)) {
    errors.push(`Précision d'indice invalide pour la catégorie ${set.categoryId}.`);
  }
  for (const value of set.values) {
    if (!value.trim()) errors.push(`Mot vide dans la catégorie ${set.categoryId}.`);
    const id = `${set.categoryId}:${normalize(value)}`;
    if (uniqueWordIds.has(id)) errors.push(`Mot en double dans la catégorie ${set.categoryId} : ${value}.`);
    uniqueWordIds.add(id);
  }
}

for (const set of seed.pairSets) {
  if (!categoryIds.has(set.categoryId)) errors.push(`Catégorie inconnue pour le groupe de paires : ${set.categoryId}.`);
  for (const [civilianWord, impostorWord] of set.pairs) {
    if (!civilianWord?.trim() || !impostorWord?.trim()) errors.push(`Paire incomplète dans la catégorie ${set.categoryId}.`);
    if (normalize(civilianWord) === normalize(impostorWord)) {
      errors.push(`Paire identique interdite : ${civilianWord} / ${impostorWord}.`);
    }
  }
}

if (errors.length > 0) {
  console.error(`Seed invalide (${errors.length} problème(s)) :\n- ${errors.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log(`Seed valide : ${seed.categories.length} catégories, ${words.length} mots et ${pairs.length} paires.`);
}
