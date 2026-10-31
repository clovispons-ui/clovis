import { readFile, writeFile } from "node:fs/promises";
import { validateQuestionSeed } from "../src/game.js";

const sourceUrl = new URL("../family_feud_en.json", import.meta.url);
const adaptationsUrl = new URL("../data/adaptations.fr.json", import.meta.url);
const seedUrl = new URL("../data/questions.fr.json", import.meta.url);

const [source, adaptations, seed] = await Promise.all([
  readFile(sourceUrl, "utf8").then(JSON.parse),
  readFile(adaptationsUrl, "utf8").then(JSON.parse),
  readFile(seedUrl, "utf8").then(JSON.parse),
]);

const sourceById = new Map(source.questions.map((question) => [question.source_id, question]));
const adaptationIds = new Set();
const additions = [];
const sourceIdsToAdapt = new Set(adaptations.map((adaptation) => adaptation.sourceId));
const firstAdaptedIndex = seed.questions.findIndex((question) => sourceIdsToAdapt.has(question.sourceId));
const curatedBaseCount = seed.meta.curatedBaseCount ?? (
  firstAdaptedIndex < 0 ? seed.questions.length : firstAdaptedIndex
);
if (!Number.isInteger(curatedBaseCount) || curatedBaseCount < 1 || curatedBaseCount > seed.questions.length) {
  throw new Error("Le nombre de questions françaises de base est invalide.");
}
const baseQuestions = seed.questions.slice(0, curatedBaseCount);
const adaptedIds = new Set(baseQuestions.map((question) => question.sourceId));

for (const adaptation of adaptations) {
  if (!adaptation.sourceId || adaptationIds.has(adaptation.sourceId)) {
    throw new Error(`Identifiant source absent ou dupliqué : ${adaptation.sourceId || "(vide)"}.`);
  }
  adaptationIds.add(adaptation.sourceId);

  if (adaptedIds.has(adaptation.sourceId)) {
    throw new Error(`La question ${adaptation.sourceId} est déjà présente dans la banque française.`);
  }
  const sourceQuestion = sourceById.get(adaptation.sourceId);
  if (!sourceQuestion) throw new Error(`Question source introuvable : ${adaptation.sourceId}.`);
  if (adaptation.answers.length !== sourceQuestion.reponses.length) {
    throw new Error(
      `${adaptation.sourceId} : ${adaptation.answers.length} traductions pour ${sourceQuestion.reponses.length} réponses source.`,
    );
  }

  additions.push({
    id: `fr-${String(baseQuestions.length + additions.length + 1).padStart(3, "0")}`,
    question: adaptation.question,
    sourceId: adaptation.sourceId,
    source: sourceQuestion.source,
    answers: adaptation.answers.map((answer, index) => ({
      text: answer.text,
      aliases: answer.aliases,
      points: sourceQuestion.reponses[index].points,
    })),
  });
  adaptedIds.add(adaptation.sourceId);
}

const nextSeed = {
  ...seed,
  meta: {
    ...seed.meta,
    adaptationCount: additions.length,
    curatedBaseCount: baseQuestions.length,
    curationNote: "Questions traduites et adaptées individuellement depuis le corpus source ; les entrées source non sélectionnées ne sont pas incluses.",
  },
  questions: [...baseQuestions, ...additions],
};

const errors = validateQuestionSeed(nextSeed);
if (errors.length) {
  throw new Error(`La banque générée est invalide :\n- ${errors.join("\n- ")}`);
}

await writeFile(seedUrl, `${JSON.stringify(nextSeed, null, 2)}\n`, "utf8");
console.log(`Banque française générée : ${nextSeed.questions.length} questions (${additions.length} nouvelles).`);
