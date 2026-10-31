import { readFile } from "node:fs/promises";
import { validateQuestionSeed } from "../src/game.js";

const seed = JSON.parse(await readFile(new URL("../data/questions.fr.json", import.meta.url), "utf8"));
const errors = validateQuestionSeed(seed);

if (errors.length) {
  console.error(`Base Famille en Or invalide (${errors.length} problème(s)) :\n- ${errors.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log(`Base Famille en Or valide : ${seed.questions.length} questions françaises.`);
}
