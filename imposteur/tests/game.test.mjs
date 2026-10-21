import assert from "node:assert/strict";
import test from "node:test";
import {
  GAME_MODES,
  defaultImpostorCount,
  maxPlayableImpostors,
  validateConfiguration,
} from "../src/config.js";
import {
  answersMatch,
  createRound,
  chooseStartingPlayer,
  eliminatePlayer,
  getVictory,
} from "../src/game.js";

const deterministicRandom = (maxExclusive) => maxExclusive - 1;

function configuration(mode, overrides = {}) {
  const validated = validateConfiguration({
    names: ["Alice", "Benoît", "Chloé", "David", "Emma"],
    mode,
    impostorCount: 1,
    includeMisterWhite: false,
    categoryIds: ["animaux"],
    timerEnabled: false,
    timerDuration: 30,
    ...overrides,
  });
  assert.equal(validated.ok, true, validated.errors.join(", "));
  return validated.config;
}

test("la configuration applique les limites et rejette les pseudos dupliqués", () => {
  assert.equal(defaultImpostorCount(4), 1);
  assert.equal(defaultImpostorCount(7), 2);
  assert.equal(defaultImpostorCount(11), 3);
  assert.equal(maxPlayableImpostors(3), 1);
  assert.equal(maxPlayableImpostors(4), 1);
  assert.equal(maxPlayableImpostors(5), 2);
  const result = validateConfiguration({
    names: ["Zoé", " Zoe ", "Léo"],
    mode: GAME_MODES.CLUE,
    impostorCount: 1,
    categoryIds: ["animaux"],
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /uniques/);

  const unbalanced = validateConfiguration({
    names: ["A", "B", "C", "D"],
    mode: GAME_MODES.CLUE,
    impostorCount: 2,
    categoryIds: ["animaux"],
  });
  assert.equal(unbalanced.ok, false);
  assert.match(unbalanced.errors.join(" "), /inférieur au nombre de civils/);
});

test("Mister White ne reçoit aucun mot et les civils reçoivent le mot commun", () => {
  const round = createRound(
    configuration(GAME_MODES.MISTER_WHITE, { impostorCount: 2 }),
    { value: "Éléphant" },
    deterministicRandom,
  );
  assert.equal(round.players.filter((player) => player.role === "misterWhite").length, 2);
  assert.ok(round.players.filter((player) => player.role === "misterWhite").every((player) => player.secret === null));
  assert.ok(round.players.filter((player) => player.role === "civilian").every((player) => player.secret.value === "Éléphant"));
});

test("l'imposteur du mode indice reçoit une piste, sans le mot civil", () => {
  const round = createRound(
    configuration(GAME_MODES.CLUE),
    { value: "Tigre", clue: "C'est un animal.", cluePrecision: "vague" },
    deterministicRandom,
  );
  const impostor = round.players.find((player) => player.role === "impostor");
  assert.deepEqual(impostor.secret, { kind: "clue", value: "C'est un animal.", precision: "vague" });
  assert.ok(round.players.filter((player) => player.role === "civilian").every((player) => player.secret.value === "Tigre"));
});

test("le mode proche attribue deux mots différents et peut inclure Mister White", () => {
  const round = createRound(
    configuration(GAME_MODES.CLOSE_WORD, { impostorCount: 2, includeMisterWhite: true }),
    { civilianWord: "Plage", impostorWord: "Piscine" },
    deterministicRandom,
  );
  assert.equal(round.players.filter((player) => player.role === "misterWhite").length, 1);
  assert.equal(round.players.filter((player) => player.role === "impostor").length, 1);
  assert.ok(round.players.filter((player) => player.role === "civilian").every((player) => player.secret.value === "Plage"));
  assert.equal(round.players.find((player) => player.role === "impostor").secret.value, "Piscine");
});

test("la personne qui commence est civile et les joueurs éliminés sont ignorés", () => {
  const round = createRound(configuration(GAME_MODES.CLUE), {
    value: "Tigre",
    clue: "Un animal",
    cluePrecision: "vague",
  }, deterministicRandom);
  const starter = chooseStartingPlayer(round.players, deterministicRandom);
  assert.equal(starter.role, "civilian");
  round.players[0].active = false;
  assert.notEqual(chooseStartingPlayer(round.players, deterministicRandom), round.players[0]);
});

test("le clic sur un joueur l'élimine directement une seule fois", () => {
  const round = createRound(configuration(GAME_MODES.CLUE), {
    value: "Tigre",
    clue: "Un animal",
    cluePrecision: "vague",
  }, deterministicRandom);
  const selectedPlayer = round.players[1];

  assert.equal(eliminatePlayer(round.players, selectedPlayer.id), selectedPlayer);
  assert.equal(selectedPlayer.active, false);
  assert.throws(() => eliminatePlayer(round.players, selectedPlayer.id), /pas encore actif/);
});

test("les conditions de victoire respectent le seuil parité et la dernière chance", () => {
  const round = createRound(configuration(GAME_MODES.CLUE), {
    value: "Tigre",
    clue: "Un animal",
    cluePrecision: "vague",
  }, deterministicRandom);
  assert.equal(getVictory(round.players), null);
  round.players.find((player) => player.role === "impostor").active = false;
  assert.equal(getVictory(round.players), "civilians");

  const nearParity = round.players.slice(0, 3).map((player, index) => ({
    ...player,
    id: `test-${index}`,
    active: true,
    role: index === 0 ? "civilian" : "impostor",
  }));
  assert.equal(getVictory(nearParity), "impostors");
});

test("la réponse Mister White ignore casse, accents et espaces périphériques", () => {
  assert.equal(answersMatch("  ELEPHANT ", "Éléphant"), true);
  assert.equal(answersMatch("éléphant bleu", "Éléphant"), false);
});
