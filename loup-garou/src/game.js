import { ROLE_DETAILS, ROLES, validateConfiguration } from "./config.js";

export function secureRandomInt(maxExclusive) {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 0x100000000) {
    throw new RangeError("La borne aléatoire doit être un entier positif inférieur ou égal à 2^32.");
  }
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("Le navigateur ne fournit pas de générateur aléatoire sécurisé.");
  }
  const range = 0x100000000;
  const limit = range - (range % maxExclusive);
  const buffer = new Uint32Array(1);
  do {
    globalThis.crypto.getRandomValues(buffer);
  } while (buffer[0] >= limit);
  return buffer[0] % maxExclusive;
}

export function shuffle(values, randomInt = secureRandomInt) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = randomInt(index + 1);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export function createGame(input, randomInt = secureRandomInt) {
  const validation = validateConfiguration(input);
  if (!validation.ok) throw new Error(validation.errors.join(" "));

  const { config } = validation;
  const roles = Object.entries(config.roles).flatMap(([role, count]) => Array(count).fill(role));
  const players = shuffle(roles, randomInt).map((role, index) => ({
    id: `player-${index + 1}`,
    name: config.names[index],
    role,
    alive: true,
    loverId: null,
  }));
  return {
    config,
    players,
    phase: "deal",
    dealIndex: 0,
    revealed: false,
    day: 1,
    nightStep: null,
    nightActions: null,
    nightSummary: [],
    nightEliminatedIds: [],
    nightReport: [],
    dayEliminatedIds: [],
    winner: null,
    endReason: "",
    usedPotions: { save: false, kill: false },
    notice: "",
  };
}

export function getPlayer(game, id) {
  return game.players.find((player) => player.id === id);
}

export function getNightSteps(game) {
  const alive = game.players.filter((player) => player.alive);
  const steps = [];
  if (game.day === 1) {
    const cupid = alive.find((player) => player.role === ROLES.CUPID);
    if (cupid && alive.filter((player) => player.loverId).length === 0) {
      steps.push({ role: ROLES.CUPID, actorId: cupid.id, key: "cupid" });
    }
    for (const lover of alive.filter((player) => player.loverId)) {
      if (!game.nightActions?.acknowledgedLovers?.includes(lover.id)) {
        steps.push({ role: "lover", actorId: lover.id, key: `lover:${lover.id}` });
      }
    }
  }
  if (alive.some((player) => player.role === ROLES.WEREWOLF) && game.nightActions?.wolfDone !== true) {
    steps.push({ role: ROLES.WEREWOLF, key: "wolves" });
  }
  const seer = alive.find((player) => player.role === ROLES.SEER);
  if (seer && game.nightActions?.seerDone !== true) {
    steps.push({ role: ROLES.SEER, actorId: seer.id, key: "seer" });
  }
  const witch = alive.find((player) => player.role === ROLES.WITCH);
  if (witch && game.nightActions?.witchDone !== true) {
    steps.push({ role: ROLES.WITCH, actorId: witch.id, key: "witch" });
  }
  return steps;
}

export function getCurrentNightStep(game) {
  return game.phase === "night" ? getNightSteps(game)[0] ?? null : null;
}

export function finishRoleDistribution(game) {
  if (game.phase !== "deal" || game.dealIndex !== game.players.length - 1) {
    throw new Error("La distribution des rôles n'est pas terminée.");
  }
  game.phase = "ready";
  return game;
}

export function startNight(game) {
  if (!["ready", "dayEnd"].includes(game.phase)) throw new Error("La nuit ne peut pas commencer à cette étape.");
  game.phase = "night";
  game.nightActions = {
    wolfTargetId: null,
    wolfDone: false,
    seerTargetId: null,
    seerResult: null,
    witchSave: false,
    witchKillTargetId: null,
    acknowledgedLovers: [],
    witchDone: false,
    seerDone: false,
  };
  game.notice = "";
  return game;
}

export function beginDayVote(game) {
  if (game.phase !== "dawn") throw new Error("Le jour ne peut pas commencer à cette étape.");
  game.phase = "dayVote";
  game.notice = "";
  return game;
}

function assertTarget(game, targetId, { excludeId, role } = {}) {
  const target = getPlayer(game, targetId);
  if (!target?.alive) throw new Error("Choisis un joueur encore en vie.");
  if (target.id === excludeId) throw new Error("Tu ne peux pas te choisir toi-même.");
  if (role && target.role === role) throw new Error("Les Loups-Garous ne peuvent pas choisir un des leurs.");
  return target;
}

export function performNightAction(game, action) {
  const step = getCurrentNightStep(game);
  if (!step) throw new Error("Aucune action nocturne n'est attendue.");

  if (step.role === "lover") {
    game.nightActions.acknowledgedLovers.push(step.actorId);
  } else {
    switch (step.key) {
      case "cupid": {
        const selected = [...new Set(action.targetIds ?? [])];
        if (selected.length !== 2) throw new Error("Cupidon doit choisir exactement deux personnes.");
        const [first, second] = selected.map((id) => assertTarget(game, id));
        first.loverId = second.id;
        second.loverId = first.id;
        break;
      }
      case "wolves": {
        const target = assertTarget(game, action.targetId, { role: ROLES.WEREWOLF });
        game.nightActions.wolfTargetId = target.id;
        game.nightActions.wolfDone = true;
        break;
      }
      case "seer": {
        const target = assertTarget(game, action.targetId, { excludeId: step.actorId });
        game.nightActions.seerTargetId = target.id;
        game.nightActions.seerResult = { playerId: target.id, role: target.role };
        game.nightActions.seerDone = true;
        break;
      }
      case "witch": {
        if (action.save && (game.usedPotions.save || !game.nightActions.wolfTargetId)) {
          throw new Error("La potion de vie n'est pas disponible.");
        }
        if (action.kill && game.usedPotions.kill) throw new Error("La potion de mort a déjà été utilisée.");
        if (action.kill) {
          assertTarget(game, action.killTargetId, { excludeId: step.actorId });
        }
        game.nightActions.witchSave = Boolean(action.save);
        game.nightActions.witchKillTargetId = action.kill ? action.killTargetId : null;
        game.usedPotions.save ||= Boolean(action.save);
        game.usedPotions.kill ||= Boolean(action.kill);
        game.nightActions.witchDone = true;
        break;
      }
      default:
        throw new Error("Cette action nocturne n'est pas reconnue.");
    }
  }

  if (getCurrentNightStep(game)) return game;
  return resolveNight(game);
}

export function getPrivateNightResult(game, playerId) {
  const player = getPlayer(game, playerId);
  if (!player) return null;
  if (player.role === ROLES.SEER && game.nightActions?.seerResult) {
    const target = getPlayer(game, game.nightActions.seerResult.playerId);
    return target ? { kind: "seer", targetName: target.name, roleName: ROLE_DETAILS[target.role].name } : null;
  }
  if (!player.alive) return null;
  if (player.loverId) {
    const lover = getPlayer(game, player.loverId);
    if (lover) return { kind: "lover", name: lover.name };
  }
  return null;
}

function checkVictory(game) {
  const alive = game.players.filter((player) => player.alive);
  const livingLovers = alive.filter((player) => player.loverId && getPlayer(game, player.loverId)?.alive);
  if (
    livingLovers.length === 2
    && livingLovers[0].loverId === livingLovers[1].id
    && ROLE_DETAILS[livingLovers[0].role].team !== ROLE_DETAILS[livingLovers[1].role].team
    && alive.length === 2
  ) {
    return "lovers";
  }
  const wolves = alive.filter((player) => player.role === ROLES.WEREWOLF).length;
  if (wolves === 0) return "village";
  if (wolves >= alive.length - wolves) return "wolves";
  return null;
}

function finishIfWon(game) {
  const winner = checkVictory(game);
  if (!winner) return false;
  game.phase = "end";
  game.winner = winner;
  game.endReason = winner === "village"
    ? "Tous les Loups-Garous ont été éliminés."
    : winner === "wolves"
      ? "Les Loups-Garous sont au moins aussi nombreux que les autres joueurs."
      : "Les deux amoureux de camps opposés sont les derniers survivants.";
  return true;
}

function eliminateWithLover(game, playerId, deaths) {
  const player = getPlayer(game, playerId);
  if (!player?.alive) return;
  player.alive = false;
  deaths.push(player.id);
  const lover = getPlayer(game, player.loverId);
  if (lover?.alive) eliminateWithLover(game, lover.id, deaths);
}

function resolveNight(game) {
  const deaths = [];
  const wolfTarget = getPlayer(game, game.nightActions.wolfTargetId);
  const firstNightCupid = game.day === 1 ? game.players.find((player) => player.role === ROLES.CUPID) : null;
  const lovers = firstNightCupid
    ? game.players.filter((player) => player.loverId).map((player) => player.name)
    : [];
  const seerTarget = getPlayer(game, game.nightActions.seerTargetId);
  const witch = game.players.find((player) => player.role === ROLES.WITCH && player.alive);
  game.nightReport = [
    ...(firstNightCupid ? [`Cupidon : ${lovers.length === 2 ? `a lié ${lovers.join(" et ")}` : "n'a pas formé de couple"}.`] : []),
    ...(lovers.length === 2 ? [`Amoureux : ${lovers.join(" et ")} se sont réveillés et reconnus.`] : []),
    wolfTarget ? `Loups-Garous : cible choisie — ${wolfTarget.name}.` : "Loups-Garous : aucune cible.",
    ...(seerTarget ? [`Voyante : a sondé ${seerTarget.name} (${ROLE_DETAILS[seerTarget.role].name}).`] : []),
    ...(witch ? [`Sorcière : potion de vie ${game.nightActions.witchSave ? "utilisée" : "non utilisée"}.`] : []),
    ...(witch ? [`Sorcière : potion de mort ${game.nightActions.witchKillTargetId ? `utilisée contre ${getPlayer(game, game.nightActions.witchKillTargetId)?.name ?? "une cible"}` : "non utilisée"}.`] : []),
  ];
  if (wolfTarget?.alive && !game.nightActions.witchSave) {
    eliminateWithLover(game, wolfTarget.id, deaths);
  }
  const witchTarget = getPlayer(game, game.nightActions.witchKillTargetId);
  if (witchTarget?.alive) eliminateWithLover(game, witchTarget.id, deaths);
  game.nightEliminatedIds = [...new Set(deaths)];
  game.nightSummary = game.nightEliminatedIds.map((id) => getPlayer(game, id)?.name).filter(Boolean);
  game.nightStep = null;

  const hunter = game.players.find((player) => !player.alive && player.role === ROLES.HUNTER && !game.nightActions.hunterShotUsed);
  if (hunter) {
    game.phase = "hunterShot";
    game.pendingHunterId = hunter.id;
    game.afterHunterPhase = "dawn";
  } else if (finishIfWon(game)) {
    return game;
  } else {
    game.phase = "dawn";
  }
  return game;
}

export function applyHunterShot(game, targetId) {
  if (game.phase !== "hunterShot") throw new Error("Le Chasseur n'a pas de tir à effectuer.");
  const hunter = getPlayer(game, game.pendingHunterId);
  const target = assertTarget(game, targetId, { excludeId: hunter?.id });
  const deaths = [];
  eliminateWithLover(game, target.id, deaths);
  game.nightActions.hunterShotUsed = true;
  const nextPhase = game.afterHunterPhase ?? "dayEnd";
  game.nightSummary.push(...deaths.map((id) => getPlayer(game, id)?.name).filter(Boolean));
  if (nextPhase === "dawn") game.nightEliminatedIds.push(...deaths);
  game.nightReport.push(`Chasseur : ${getPlayer(game, target.id)?.name} a été emporté dans la riposte.`);
  game.pendingHunterId = null;
  if (nextPhase === "dayEnd") game.dayEliminatedIds.push(...deaths);
  game.afterHunterPhase = null;
  if (!finishIfWon(game)) {
    game.phase = nextPhase;
  }
  return game;
}

export function skipHunterShot(game) {
  if (game.phase !== "hunterShot") throw new Error("Le Chasseur n'a pas de tir à effectuer.");
  game.nightActions.hunterShotUsed = true;
  game.pendingHunterId = null;
  const nextPhase = game.afterHunterPhase ?? "dayEnd";
  game.afterHunterPhase = null;
  if (!finishIfWon(game)) {
    game.phase = nextPhase;
  }
  return game;
}

export function eliminateByVillage(game, targetId) {
  if (game.phase !== "dayVote") throw new Error("Le vote n'est pas ouvert.");
  const target = assertTarget(game, targetId);
  const deaths = [];
  eliminateWithLover(game, target.id, deaths);
  game.dayEliminatedIds = [...new Set(deaths)];
  const hunter = game.players.find((player) => deaths.includes(player.id) && player.role === ROLES.HUNTER);
  if (hunter) {
    game.phase = "hunterShot";
    game.pendingHunterId = hunter.id;
    game.afterHunterPhase = "dayEnd";
  } else if (!finishIfWon(game)) {
    game.phase = "dayEnd";
  }
  return game;
}

export function finishDayWithoutElimination(game) {
  if (game.phase !== "dayVote") throw new Error("Le vote n'est pas ouvert.");
  game.dayEliminatedIds = [];
  game.notice = "Aucune élimination : le village n'a choisi personne.";
  game.phase = "dayEnd";
  return game;
}

export function beginNextNight(game) {
  if (game.phase !== "dayEnd") throw new Error("La journée n'est pas terminée.");
  if (finishIfWon(game)) return game;
  game.day += 1;
  return startNight(game);
}

export function revealAllRoles(game) {
  return game.players.map((player) => ({
    name: player.name,
    roleName: ROLE_DETAILS[player.role].name,
    alive: player.alive,
  }));
}
