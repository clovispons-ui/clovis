import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  GAME_PHASES,
  ROUND_SUB_PHASES,
  buzz,
  finishReveal,
  matchAnswer,
  nextRound,
  normalizeAnswer,
  startGame,
  submitBoardAnswer,
  submitFaceOffAnswer,
  submitStealAnswer,
  undoLastSubmission,
  validateQuestionSeed,
} from "../src/game.js";

const seed = JSON.parse(await readFile(new URL("../data/questions.fr.json", import.meta.url), "utf8"));
const firstQuestion = seed.questions[0];
const names = ["Les Étoiles", "Les Comètes"];
const fixedRandom = (maxExclusive) => maxExclusive - 1;

function startWithQuestion(question = firstQuestion) {
  return startGame(names, { ...seed, questions: [question, ...seed.questions.filter((item) => item.id !== question.id)] }, fixedRandom);
}

function beginBoard(state, teamId = "team-a") {
  const firstTeam = teamId;
  const secondTeam = teamId === "team-a" ? "team-b" : "team-a";
  let next = buzz(state, firstTeam);
  next = submitFaceOffAnswer(next, firstTeam, state.currentQuestion.answers[0].text);
  assert.equal(next.round.faceOff.currentTeamId, secondTeam);
  return submitFaceOffAnswer(next, secondTeam, "réponse inconnue");
}

test("la normalisation ignore accents, casse, apostrophes et ponctuation", () => {
  assert.equal(normalizeAnswer("  L’ÉOLIENNE ! "), "l eolienne");
  assert.equal(normalizeAnswer("cœur"), "coeur");
  assert.equal(matchAnswer(seed.questions[18], "Moulin à vent").text, "Une éolienne");
});

test("les articles initiaux sont facultatifs pour reconnaître une réponse", () => {
  const question = seed.questions.find((item) => item.sourceId === "train_q1046");
  assert.equal(matchAnswer(question, "brosse à dents").text, "Une brosse à dents");
});

test("le seed français satisfait le schéma et comporte assez de questions distinctes", () => {
  assert.deepEqual(validateQuestionSeed(seed), []);
  assert.ok(seed.questions.length >= 200);
  assert.equal(seed.meta.adaptationCount, 176);
  assert.equal(seed.questions.length, 200);
});

test("le premier buzzer répond d'abord et la meilleure réponse prend la main", () => {
  const state = startWithQuestion();
  let next = buzz(state, "team-a");
  assert.equal(next.round.boardVisible, true);
  next = submitFaceOffAnswer(next, "team-a", "regarder un film");
  assert.equal(next.round.faceOff.submissions.length, 1);
  assert.equal(next.round.faceOff.currentTeamId, "team-b");
  assert.throws(() => buzz(next, "team-b"), /déjà la parole/);
  next = submitFaceOffAnswer(next, "team-b", "manger");
  assert.equal(next.round.subPhase, ROUND_SUB_PHASES.BOARD_PLAY);
  assert.equal(next.round.controlTeamId, "team-b");
});

test("un duel sans réponse termine la manche sans points et révèle le tableau", () => {
  let state = startWithQuestion();
  state = buzz(state, "team-a");
  state = submitFaceOffAnswer(state, "team-a", "inconnu un");
  assert.equal(state.round.faceOff.currentTeamId, "team-b");
  state = submitFaceOffAnswer(state, "team-b", "inconnu deux");
  assert.equal(state.phase, GAME_PHASES.REVEAL);
  assert.equal(state.round.result, "face-off-empty");
  assert.equal(state.round.awardTeamId, null);
  assert.equal(state.round.awardPoints, 0);
  assert.equal(state.round.strikes, 0);
  assert.equal(state.round.boardVisible, true);
  state = finishReveal(state);
  assert.equal(state.teams.every((team) => team.score === 0), true);
  assert.equal(state.history[0].awardTeamId, null);
  state = nextRound(state);
  assert.equal(state.phase, GAME_PHASES.QUESTION);
  assert.equal(state.roundNumber, 2);
});

test("une réponse reconnue révèle une case, marque le pot et peut être annulée", () => {
  let state = beginBoard(startWithQuestion());
  state = submitBoardAnswer(state, state.round.controlTeamId, " café ");
  assert.equal(state.round.roundPot, 32);
  assert.equal(state.round.revealedAnswerIds.length, 1);
  assert.match(state.round.lastSubmission.label, /Boire du café.*32 points/);
  state = undoLastSubmission(state);
  assert.equal(state.round.roundPot, 0);
  assert.equal(state.round.revealedAnswerIds.length, 0);
});

test("une réponse inconnue ajoute une croix et la troisième déclenche le vol", () => {
  let state = beginBoard(startWithQuestion());
  const playingTeam = state.round.controlTeamId;
  state = submitBoardAnswer(state, playingTeam, "inconnu 1");
  state = submitBoardAnswer(state, playingTeam, "inconnu 2");
  state = submitBoardAnswer(state, playingTeam, "inconnu 3");
  assert.equal(state.round.strikes, 3);
  assert.equal(state.round.subPhase, ROUND_SUB_PHASES.STEAL);
});

test("une réponse déjà révélée ne rapporte pas de points et ne consomme pas de croix", () => {
  let state = beginBoard(startWithQuestion());
  const playingTeam = state.round.controlTeamId;
  state = submitBoardAnswer(state, playingTeam, "manger");
  state = submitBoardAnswer(state, playingTeam, "manger");
  assert.equal(state.round.roundPot, 46);
  assert.equal(state.round.strikes, 0);
  assert.equal(state.round.lastSubmission.kind, "duplicate");
});

test("le vol réussi attribue les points du tableau entier, même les réponses cachées", () => {
  let state = beginBoard(startWithQuestion());
  const playingTeam = state.round.controlTeamId;
  const stealingTeam = playingTeam === "team-a" ? "team-b" : "team-a";
  state = submitBoardAnswer(state, playingTeam, "inconnu 1");
  state = submitBoardAnswer(state, playingTeam, "inconnu 2");
  state = submitBoardAnswer(state, playingTeam, "inconnu 3");
  state = submitStealAnswer(state, stealingTeam, "boire du café");
  assert.equal(state.phase, GAME_PHASES.REVEAL);
  assert.equal(state.round.awardTeamId, stealingTeam);
  assert.equal(state.round.awardPoints, 98);
  state = finishReveal(state);
  assert.equal(state.teams.find((team) => team.id === stealingTeam).score, 98);
});

test("un vol manqué donne le pot trouvé à l'équipe qui jouait", () => {
  let state = beginBoard(startWithQuestion());
  const playingTeam = state.round.controlTeamId;
  const stealingTeam = playingTeam === "team-a" ? "team-b" : "team-a";
  state = submitBoardAnswer(state, playingTeam, "manger");
  state = submitBoardAnswer(state, playingTeam, "inconnu 1");
  state = submitBoardAnswer(state, playingTeam, "inconnu 2");
  state = submitBoardAnswer(state, playingTeam, "inconnu 3");
  state = submitStealAnswer(state, stealingTeam, "une réponse qui n'existe pas");
  assert.equal(state.round.awardTeamId, playingTeam);
  assert.equal(state.round.awardPoints, 46);
});

test("une manche attribue les points une seule fois et les cinq manches terminent la partie", () => {
  let state = startWithQuestion();
  for (let round = 0; round < 5; round += 1) {
    if (state.round.subPhase === ROUND_SUB_PHASES.FACE_OFF) state = beginBoard(state);
    while (state.phase === GAME_PHASES.QUESTION && state.round.subPhase === ROUND_SUB_PHASES.BOARD_PLAY) {
      state = submitBoardAnswer(state, state.round.controlTeamId, "pas une réponse");
      if (state.round.strikes === 3) break;
    }
    if (state.phase === GAME_PHASES.QUESTION && state.round.subPhase === ROUND_SUB_PHASES.STEAL) {
      const otherTeam = state.round.controlTeamId === "team-a" ? "team-b" : "team-a";
      state = submitStealAnswer(state, otherTeam, "raté");
    }
    state = finishReveal(state);
    assert.equal(state.history.length, round + 1);
    state = nextRound(state);
  }
  assert.equal(state.phase, GAME_PHASES.GAME_OVER);
  assert.equal(state.winner, null);
});

test("les transitions refusent les actions hors phase et les noms invalides", () => {
  assert.throws(() => startGame(["Même nom", "même nom"], seed), /différents/);
  assert.throws(() => submitBoardAnswer(startGame(names, seed), "team-a", "manger"), /pas disponible/);
  assert.throws(() => startGame(names, { ...seed, questions: seed.questions.slice(0, 199) }), /au moins 200/);
});
