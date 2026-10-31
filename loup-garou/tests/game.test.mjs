import assert from "node:assert/strict";
import test from "node:test";
import { ROLE_DETAILS, ROLES, suggestedRoles, validateConfiguration } from "../src/config.js";
import {
  applyHunterShot,
  beginDayVote,
  beginNextNight,
  createGame,
  eliminateByVillage,
  finishRoleDistribution,
  finishDayWithoutElimination,
  getCurrentNightStep,
  getPrivateNightResult,
  startNight,
  performNightAction,
  skipHunterShot,
} from "../src/game.js";

const deterministicRandom = (maxExclusive) => maxExclusive - 1;

function setup(names, roles, overrides = {}) {
  return {
    names,
    roles: {
      [ROLES.VILLAGER]: 0,
      [ROLES.WEREWOLF]: 0,
      [ROLES.SEER]: 0,
      [ROLES.WITCH]: 0,
      [ROLES.HUNTER]: 0,
      [ROLES.LITTLE_GIRL]: 0,
      [ROLES.CUPID]: 0,
      ...roles,
    },
    narrator: "human",
    showScript: true,
    ...overrides,
  };
}

function finishDeal(game) {
  game.dealIndex = game.players.length - 1;
  finishRoleDistribution(game);
  startNight(game);
}

test("les suggestions remplissent les compositions entre 4 et 12 joueurs", () => {
  for (let count = 4; count <= 12; count += 1) {
    const roles = suggestedRoles(count);
    assert.equal(Object.values(roles).reduce((sum, roleCount) => sum + roleCount, 0), count);
    assert.ok(roles[ROLES.WEREWOLF] >= 1);
    assert.ok(roles[ROLES.VILLAGER] >= 1);
  }
});

test("la configuration refuse une composition incomplète ou des pseudos dupliqués", () => {
  const valid = validateConfiguration(setup(
    ["Alice", "Benoît", "Chloé", "David"],
    { [ROLES.VILLAGER]: 3, [ROLES.WEREWOLF]: 1 },
  ));
  assert.equal(valid.ok, true, valid.errors.join(" "));

  const incomplete = validateConfiguration(setup(
    ["Alice", "Benoît", "Chloé", "David"],
    { [ROLES.VILLAGER]: 2, [ROLES.WEREWOLF]: 1 },
  ));
  assert.equal(incomplete.ok, false);
  assert.match(incomplete.errors.join(" "), /4 joueurs/);

  const unbalanced = validateConfiguration(setup(
    ["A", "B", "C", "D"],
    { [ROLES.VILLAGER]: 1, [ROLES.WEREWOLF]: 3 },
  ));
  assert.match(unbalanced.errors.join(" "), /moins nombreux/);

  const duplicate = validateConfiguration(setup(
    ["Zoé", " Zoe ", "Chloé", "David"],
    { [ROLES.VILLAGER]: 3, [ROLES.WEREWOLF]: 1 },
  ));
  assert.match(duplicate.errors.join(" "), /uniques/);
});

test("la distribution attribue chaque carte une fois et garde les rôles dans l'état privé", () => {
  const game = createGame(setup(
    ["Alice", "Benoît", "Chloé", "David"],
    { [ROLES.VILLAGER]: 2, [ROLES.WEREWOLF]: 1, [ROLES.SEER]: 1 },
  ), deterministicRandom);

  assert.equal(game.phase, "deal");
  assert.deepEqual(game.players.map(({ name }) => name), ["Alice", "Benoît", "Chloé", "David"]);
  assert.deepEqual(
    game.players.map(({ role }) => role).sort(),
    [ROLES.VILLAGER, ROLES.VILLAGER, ROLES.WEREWOLF, ROLES.SEER].sort(),
  );
  assert.ok(game.players.every(({ alive }) => alive));
});

test("la partie attend la fin de la distribution avant de commencer la première nuit", () => {
  const game = createGame(setup(
    ["Alice", "Benoît", "Chloé", "David"],
    { [ROLES.VILLAGER]: 3, [ROLES.WEREWOLF]: 1 },
  ), deterministicRandom);

  assert.throws(() => finishRoleDistribution(game), /distribution des rôles n'est pas terminée/);
  assert.throws(() => startNight(game), /La nuit ne peut pas commencer/);

  game.dealIndex = game.players.length - 1;
  finishRoleDistribution(game);
  assert.equal(game.phase, "ready");
  assert.throws(() => finishRoleDistribution(game), /distribution des rôles n'est pas terminée/);

  startNight(game);
  assert.equal(game.phase, "night");
});

test("la Voyante inspecte un autre joueur et obtient son rôle en privé", () => {
  const game = createGame(setup(
    ["Alice", "Benoît", "Chloé", "David"],
    { [ROLES.VILLAGER]: 2, [ROLES.WEREWOLF]: 1, [ROLES.SEER]: 1 },
  ), deterministicRandom);
  finishDeal(game);
  while (getCurrentNightStep(game)?.role !== ROLES.SEER) {
    const step = getCurrentNightStep(game);
    if (step.role === ROLES.WEREWOLF) {
      const target = game.players.find((player) => player.role !== ROLES.WEREWOLF);
      performNightAction(game, { targetId: target.id });
    } else {
      performNightAction(game, {});
    }
  }
  const seer = game.players.find((player) => player.role === ROLES.SEER);
  const target = game.players.find((player) => player.alive && player.id !== seer.id);
  performNightAction(game, { targetId: target.id });

  assert.deepEqual(getPrivateNightResult(game, seer.id), {
    kind: "seer",
    targetName: target.name,
    roleName: target.role === ROLES.WEREWOLF ? "Loup-Garou" : "Villageois",
  });
  assert.equal(game.phase, "dawn");
  assert.ok(game.nightReport.some((line) => line.includes(`Voyante : a sondé ${target.name}`)));
});

test("la Voyante voit son résultat même si les Loups l'éliminent cette nuit", () => {
  const game = createGame(setup(
    ["Alice", "Benoît", "Chloé", "David"],
    { [ROLES.VILLAGER]: 2, [ROLES.WEREWOLF]: 1, [ROLES.SEER]: 1 },
  ), deterministicRandom);
  finishDeal(game);
  const seer = game.players.find((player) => player.role === ROLES.SEER);

  performNightAction(game, { targetId: seer.id });
  assert.equal(getCurrentNightStep(game).role, ROLES.SEER);

  const target = game.players.find((player) => player.alive && player.id !== seer.id);
  performNightAction(game, { targetId: target.id });

  assert.equal(seer.alive, false);
  assert.deepEqual(getPrivateNightResult(game, seer.id), {
    kind: "seer",
    targetName: target.name,
    roleName: ROLE_DETAILS[target.role].name,
  });
});

test("la Petite Fille n'est pas réveillée et observe les Loups dans la pièce", () => {
  const game = createGame(setup(
    ["Alice", "Benoît", "Chloé", "David", "Émile"],
    { [ROLES.VILLAGER]: 2, [ROLES.WEREWOLF]: 1, [ROLES.LITTLE_GIRL]: 1, [ROLES.SEER]: 1 },
  ), deterministicRandom);
  finishDeal(game);

  assert.equal(getCurrentNightStep(game).role, ROLES.WEREWOLF);
  const wolfTarget = game.players.find((player) => player.role === ROLES.VILLAGER);
  performNightAction(game, { targetId: wolfTarget.id });
  assert.equal(getCurrentNightStep(game).role, ROLES.SEER);

  const seerTarget = game.players.find((player) => player.alive && player.role !== ROLES.SEER);
  performNightAction(game, { targetId: seerTarget.id });
  assert.equal(game.phase, "dawn");
  assert.ok(game.nightReport.every((line) => !line.startsWith("Petite Fille :")));
  assert.equal(getPrivateNightResult(game, game.players.find((player) => player.role === ROLES.LITTLE_GIRL).id), null);
});

test("la Sorcière peut sauver la victime et consommer sa potion une seule fois", () => {
  const game = createGame(setup(
    ["A", "B", "C", "D", "E"],
    { [ROLES.VILLAGER]: 2, [ROLES.WEREWOLF]: 1, [ROLES.WITCH]: 1, [ROLES.SEER]: 1 },
  ), deterministicRandom);
  finishDeal(game);

  while (getCurrentNightStep(game)?.role !== ROLES.WITCH) {
    const step = getCurrentNightStep(game);
    const target = game.players.find((player) => player.alive && player.role !== ROLES.WEREWOLF && player.id !== step.actorId);
    performNightAction(game, step.role === ROLES.WEREWOLF ? { targetId: target.id } : { targetId: target.id });
  }
  const victim = game.players.find((player) => player.id === game.nightActions.wolfTargetId);
  performNightAction(game, { save: true, kill: false });

  assert.equal(victim.alive, true);
  assert.equal(game.usedPotions.save, true);
  assert.equal(game.phase, "dawn");
  assert.ok(game.nightReport.some((line) => line.includes("potion de vie utilisée")));
});

test("Cupidon lie les amoureux, dont la mort entraîne celle du partenaire", () => {
  const game = createGame(setup(
    ["A", "B", "C", "D", "E"],
    { [ROLES.VILLAGER]: 2, [ROLES.WEREWOLF]: 1, [ROLES.CUPID]: 1, [ROLES.SEER]: 1 },
  ), deterministicRandom);
  finishDeal(game);

  const cupid = getCurrentNightStep(game);
  const wolf = game.players.find((player) => player.role === ROLES.WEREWOLF);
  const villager = game.players.find((player) => player.role === ROLES.VILLAGER);
  const lovers = [wolf, villager];
  performNightAction(game, { targetIds: lovers.map(({ id }) => id) });
  while (getCurrentNightStep(game)?.role === "lover") {
    const lover = game.players.find(({ id }) => id === getCurrentNightStep(game).actorId);
    assert.deepEqual(getPrivateNightResult(game, lover.id), { kind: "lover", name: lovers.find(({ id }) => id !== lover.id).name });
    assert.equal(getCurrentNightStep(game).key, `lover:${lover.id}`);
    performNightAction(game, {});
  }
  while (game.phase === "night") {
    const step = getCurrentNightStep(game);
    const target = step.role === ROLES.WEREWOLF
      ? game.players.find((player) => player.alive && player.id === wolf.loverId)
      : game.players.find((player) => player.alive && player.id !== step.actorId);
    performNightAction(game, { targetId: target.id });
  }
  assert.equal(wolf.alive, false);
  assert.equal(villager.alive, false);
});

test("le village élimine directement la personne choisie après son vote réel", () => {
  const game = createGame(setup(
    ["A", "B", "C", "D", "E"],
    { [ROLES.VILLAGER]: 4, [ROLES.WEREWOLF]: 1 },
  ), deterministicRandom);
  game.phase = "dayVote";
  const villager = game.players.find((player) => player.role === ROLES.VILLAGER);
  eliminateByVillage(game, villager.id);
  assert.equal(game.phase, "dayEnd");
  assert.equal(villager.alive, false);
  assert.equal(game.players.filter(({ alive }) => alive).length, 4);
  assert.equal(game.dayEliminatedIds.length, 1);
  assert.equal(game.players.find(({ id }) => id === game.dayEliminatedIds[0]).role, villager.role);
});

test("si le groupe ne se met pas d'accord, la journée se termine sans élimination", () => {
  const game = createGame(setup(
    ["A", "B", "C", "D", "E"],
    { [ROLES.VILLAGER]: 4, [ROLES.WEREWOLF]: 1 },
  ), deterministicRandom);
  game.phase = "dayVote";
  finishDayWithoutElimination(game);
  assert.equal(game.phase, "dayEnd");
  assert.match(game.notice, /Aucune élimination/);
  assert.equal(game.players.filter(({ alive }) => alive).length, 5);
  assert.deepEqual(game.dayEliminatedIds, []);
});

test("la victoire des Loups est évaluée après élimination et le Chasseur peut riposter", () => {
  const game = createGame(setup(
    ["A", "B", "C", "D", "E"],
    { [ROLES.VILLAGER]: 2, [ROLES.WEREWOLF]: 1, [ROLES.HUNTER]: 1, [ROLES.SEER]: 1 },
  ), deterministicRandom);
  const hunter = game.players.find((player) => player.role === ROLES.HUNTER);
  game.phase = "hunterShot";
  game.pendingHunterId = hunter.id;
  game.afterHunterPhase = "dayEnd";
  game.nightActions = {};
  hunter.alive = false;
  const target = game.players.find((player) => player.alive && player.id !== hunter.id);
  applyHunterShot(game, target.id);
  assert.equal(target.alive, false);
  assert.equal(game.phase, "dayEnd");
  assert.deepEqual(game.dayEliminatedIds, [target.id]);

  const nightShot = createGame(setup(
    ["A", "B", "C", "D"],
    { [ROLES.VILLAGER]: 2, [ROLES.WEREWOLF]: 1, [ROLES.HUNTER]: 1 },
  ), deterministicRandom);
  const nightHunter = nightShot.players.find((player) => player.role === ROLES.HUNTER);
  const nightTarget = nightShot.players.find((player) => player.role === ROLES.VILLAGER);
  nightShot.phase = "hunterShot";
  nightShot.pendingHunterId = nightHunter.id;
  nightShot.afterHunterPhase = "dawn";
  nightShot.nightActions = {};
  nightHunter.alive = false;
  nightShot.nightEliminatedIds = [nightHunter.id];
  applyHunterShot(nightShot, nightTarget.id);
  assert.deepEqual(nightShot.nightEliminatedIds, [nightHunter.id, nightTarget.id]);

  const next = createGame(setup(
    ["A", "B", "C", "D"],
    { [ROLES.VILLAGER]: 2, [ROLES.WEREWOLF]: 1, [ROLES.HUNTER]: 1 },
  ), deterministicRandom);
  next.phase = "hunterShot";
  next.pendingHunterId = next.players.find((player) => player.role === ROLES.HUNTER).id;
  next.nightActions = {};
  next.players.find((player) => player.role === ROLES.HUNTER).alive = false;
  const wolf = next.players.find((player) => player.role === ROLES.WEREWOLF);
  applyHunterShot(next, wolf.id);
  assert.equal(next.phase, "end");
  assert.equal(next.winner, "village");
});

test("les amoureux de camps opposés remportent seuls la partie", () => {
  const game = createGame(setup(
    ["A", "B", "C", "D"],
    { [ROLES.VILLAGER]: 2, [ROLES.WEREWOLF]: 1, [ROLES.CUPID]: 1 },
  ), deterministicRandom);
  const wolf = game.players.find((player) => player.role === ROLES.WEREWOLF);
  const villager = game.players.find((player) => player.role === ROLES.VILLAGER);
  const third = game.players.find((player) => player.id !== wolf.id && player.id !== villager.id);
  wolf.loverId = villager.id;
  villager.loverId = wolf.id;
  third.alive = false;
  game.players.find((player) => player.id !== wolf.id && player.id !== villager.id && player.alive).alive = false;
  game.phase = "dayEnd";
  beginNextNight(game);
  assert.equal(game.phase, "end");
  assert.equal(game.winner, "lovers");
});

test("le Chasseur peut renoncer à son tir", () => {
  const game = createGame(setup(
    ["A", "B", "C", "D"],
    { [ROLES.VILLAGER]: 2, [ROLES.WEREWOLF]: 1, [ROLES.HUNTER]: 1 },
  ), deterministicRandom);
  game.phase = "hunterShot";
  game.pendingHunterId = game.players.find((player) => player.role === ROLES.HUNTER).id;
  game.nightActions = {};
  game.players.find((player) => player.role === ROLES.HUNTER).alive = false;
  skipHunterShot(game);
  assert.equal(game.phase, "dayEnd");
});

test("une partie va de la première nuit au vote et à la victoire du village", () => {
  const game = createGame(setup(
    ["A", "B", "C", "D", "E"],
    { [ROLES.VILLAGER]: 4, [ROLES.WEREWOLF]: 1 },
  ), deterministicRandom);
  finishDeal(game);
  const wolf = game.players.find((player) => player.role === ROLES.WEREWOLF);
  const victim = game.players.find((player) => player.role === ROLES.VILLAGER);
  performNightAction(game, { targetId: victim.id });
  assert.equal(game.phase, "dawn");
  assert.deepEqual(game.nightSummary, [victim.name]);
  assert.deepEqual(game.nightEliminatedIds, [victim.id]);

  beginDayVote(game);
  assert.equal(game.phase, "dayVote");
  eliminateByVillage(game, wolf.id);
  assert.equal(game.phase, "end");
  assert.equal(game.winner, "village");
});
