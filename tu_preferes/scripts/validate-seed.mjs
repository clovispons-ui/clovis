import { readFile } from "node:fs/promises";

const seedUrl = new URL("../data/seed.json", import.meta.url);
const seed = JSON.parse(await readFile(seedUrl, "utf8"));
const categoryIds = new Set(seed.categories.map((category) => category.id));
const sets = seed.dilemmaSets ?? [];
const countByCategory = new Map();
const errors = [];
const uniquePairIds = new Set();
const normalize = (value) => value.trim().toLocaleLowerCase("fr");

if (!Number.isInteger(seed.version) || seed.version < 1) errors.push("version doit être un entier positif.");
if (categoryIds.size !== seed.categories.length) errors.push("Les identifiants de catégories doivent être uniques.");

const soft = seed.categories.find((category) => category.id === "soft");
const hot = seed.categories.find((category) => category.id === "hot");
if (!soft) errors.push("La catégorie soft est requise.");
if (!hot) errors.push("La catégorie hot est requise.");
if (soft && soft.adult !== false) errors.push("La catégorie soft ne doit pas être marquée adulte.");
if (hot && hot.adult !== true) errors.push("La catégorie hot doit être marquée adulte (adult: true).");

for (const category of seed.categories) {
  if (!category.id || !category.label) errors.push("Chaque catégorie doit avoir un identifiant et un libellé.");
  if (!category.description?.trim()) errors.push(`Description manquante pour la catégorie ${category.id}.`);
}

for (const set of sets) {
  if (!categoryIds.has(set.categoryId)) errors.push(`Catégorie inconnue pour un groupe de dilemmes : ${set.categoryId}.`);
  if (!set.theme?.trim()) errors.push(`Sous-thème absent pour la catégorie ${set.categoryId}.`);
  if (!Array.isArray(set.dilemmas)) {
    errors.push(`Liste de dilemmes invalide pour la catégorie ${set.categoryId}.`);
    continue;
  }

  for (const dilemma of set.dilemmas) {
    if (!Array.isArray(dilemma) || dilemma.length !== 2) {
      errors.push(`Dilemme malformé dans ${set.theme} : deux options exactement sont attendues.`);
      continue;
    }

    const [optionA, optionB] = dilemma;
    if (!optionA?.trim() || !optionB?.trim()) errors.push(`Option vide dans le sous-thème ${set.theme}.`);
    if (normalize(optionA ?? "") === normalize(optionB ?? "")) {
      errors.push(`Dilemme aux deux options identiques : ${optionA}.`);
    }

    const pairId = [normalize(optionA ?? ""), normalize(optionB ?? "")].sort().join(" | ");
    if (uniquePairIds.has(pairId)) errors.push(`Dilemme en double : ${optionA} / ${optionB}.`);
    uniquePairIds.add(pairId);

    countByCategory.set(set.categoryId, (countByCategory.get(set.categoryId) ?? 0) + 1);
  }
}

const softCount = countByCategory.get("soft") ?? 0;
const hotCount = countByCategory.get("hot") ?? 0;
if (softCount < 100) errors.push(`La banque soft doit contenir au moins 100 dilemmes (actuellement ${softCount}).`);
if (hotCount < 50) errors.push(`La banque hot doit contenir au moins 50 dilemmes (actuellement ${hotCount}).`);

if (errors.length > 0) {
  console.error(`Seed invalide (${errors.length} problème(s)) :\n- ${errors.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log(`Seed valide : ${softCount} dilemmes soft et ${hotCount} dilemmes hot.`);
}