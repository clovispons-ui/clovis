import { normalizePlayerName } from "../../common/src/players.js";

export { normalizePlayerName };

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 12;

export const GAME_MODES = Object.freeze({
  MISTER_WHITE: "mister-white",
  CLUE: "clue",
  CLOSE_WORD: "close-word",
});

export const TIMER_OPTIONS = Object.freeze([30, 45, 60, 90, 120]);

export function defaultImpostorCount(playerCount) {
  if (playerCount <= 5) return 1;
  if (playerCount <= 9) return 2;
  return 3;
}

export function maxPlayableImpostors(playerCount) {
  return Math.floor((playerCount - 1) / 2);
}

export function validateConfiguration(input) {
  const errors = [];
  const names = Array.isArray(input.names)
    ? input.names.map((name) => String(name ?? "").trim().replace(/\s+/g, " "))
    : [];

  if (names.length < MIN_PLAYERS || names.length > MAX_PLAYERS) {
    errors.push(`La partie doit compter entre ${MIN_PLAYERS} et ${MAX_PLAYERS} joueurs.`);
  }
  if (names.some((name) => !name)) errors.push("Chaque joueur doit avoir un pseudo.");

  const normalizedNames = names.map(normalizePlayerName);
  if (new Set(normalizedNames).size !== normalizedNames.length) {
    errors.push("Les pseudos doivent être uniques, même en ignorant les accents et la casse.");
  }

  if (!Object.values(GAME_MODES).includes(input.mode)) errors.push("Choisissez un mode de jeu valide.");
  if (!Array.isArray(input.categoryIds) || input.categoryIds.length === 0) {
    errors.push("Sélectionnez au moins une catégorie.");
  }

  const impostorCount = Number(input.impostorCount);
  if (!Number.isInteger(impostorCount) || impostorCount < 1 || impostorCount > maxPlayableImpostors(names.length)) {
    errors.push("Le nombre de rôles adverses doit rester inférieur au nombre de civils au début de la partie.");
  }
  if (input.mode === GAME_MODES.CLOSE_WORD && input.includeMisterWhite && impostorCount < 2) {
    errors.push("Avec Mister White en mode mot proche, il faut au moins deux rôles adverses.");
  }

  const timerDuration = Number(input.timerDuration);
  if (input.timerEnabled && !TIMER_OPTIONS.includes(timerDuration)) {
    errors.push("Choisissez une durée de discussion proposée.");
  }

  return {
    ok: errors.length === 0,
    errors,
    config: {
      names,
      mode: input.mode,
      impostorCount,
      includeMisterWhite: input.mode === GAME_MODES.CLOSE_WORD && Boolean(input.includeMisterWhite),
      categoryIds: [...new Set(input.categoryIds ?? [])],
      timerEnabled: Boolean(input.timerEnabled),
      timerDuration,
    },
  };
}
