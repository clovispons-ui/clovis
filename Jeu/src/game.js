import { GAME_MODES, normalizePlayerName } from "./config.js";

export function secureRandomInt(maxExclusive) {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 0x100000000) {
    throw new RangeError("La borne aléatoire doit être un entier positif inférieur ou égal à 2^32.");
  }

  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    throw new Error("Le navigateur ne fournit pas de générateur aléatoire sécurisé.");
  }

  const range = 0x100000000;
  const limit = range - (range % maxExclusive);
  const buffer = new Uint32Array(1);
  do {
    cryptoApi.getRandomValues(buffer);
  } while (buffer[0] >= limit);
  return buffer[0] % maxExclusive;
}

export function shuffle(values, randomInt = secureRandomInt) {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const otherIndex = randomInt(index + 1);
    [shuffled[index], shuffled[otherIndex]] = [shuffled[otherIndex], shuffled[index]];
  }
  return shuffled;
}

export function createRound(config, content, randomInt = secureRandomInt) {
  if (!content) throw new Error("Aucun mot ou paire n'a été fourni pour cette manche.");
  const players = config.names.map((name, index) => ({
    id: `player-${index + 1}`,
    name,
    role: "civilian",
    secret: null,
    active: true,
  }));

  const adversaryIds = shuffle(players.map(({ id }) => id), randomInt).slice(0, config.impostorCount);
  const misterWhiteId = config.mode === GAME_MODES.MISTER_WHITE
    ? null
    : config.mode === GAME_MODES.CLOSE_WORD && config.includeMisterWhite
      ? adversaryIds[0]
      : null;

  for (const player of players) {
    if (config.mode === GAME_MODES.MISTER_WHITE) {
      player.secret = player.role === "civilian" ? { kind: "word", value: content.value } : null;
      continue;
    }

    if (!adversaryIds.includes(player.id)) {
      player.secret = {
        kind: "word",
        value: config.mode === GAME_MODES.CLOSE_WORD ? content.civilianWord : content.value,
      };
      continue;
    }

    if (config.mode === GAME_MODES.CLUE) {
      player.role = "impostor";
      player.secret = {
        kind: "clue",
        value: content.clue,
        precision: content.cluePrecision,
      };
    } else if (player.id === misterWhiteId) {
      player.role = "misterWhite";
      player.secret = null;
    } else {
      player.role = "impostor";
      player.secret = { kind: "word", value: content.impostorWord };
    }
  }

  if (config.mode === GAME_MODES.MISTER_WHITE) {
    for (const player of players) {
      if (adversaryIds.includes(player.id)) {
        player.role = "misterWhite";
        player.secret = null;
      }
    }
  }

  return {
    mode: config.mode,
    content: structuredClone(content),
    players,
    categoryIds: [...config.categoryIds],
  };
}

export function chooseStartingPlayer(players, randomInt = secureRandomInt) {
  const activePlayers = players.filter((player) => player.active);
  const civilians = activePlayers.filter((player) => player.role === "civilian");
  if (civilians.length === 0) return null;
  return civilians[randomInt(civilians.length)];
}

export function eliminatePlayer(players, playerId) {
  const player = players.find((candidate) => candidate.id === playerId && candidate.active);
  if (!player) throw new Error("Ce joueur n'est pas encore actif dans la manche.");
  player.active = false;
  return player;
}

export function getVictory(players) {
  const activePlayers = players.filter((player) => player.active);
  const civilians = activePlayers.filter((player) => player.role === "civilian").length;
  const adversaries = activePlayers.length - civilians;

  if (adversaries === 0) return "civilians";
  if (adversaries >= civilians) return "impostors";
  return null;
}

export function answersMatch(answer, civilianWord) {
  return normalizePlayerName(answer) === normalizePlayerName(civilianWord);
}
