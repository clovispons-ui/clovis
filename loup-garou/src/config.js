import { normalizePlayerName } from "../../common/src/players.js";

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 12;

export const ROLES = Object.freeze({
  VILLAGER: "villager",
  WEREWOLF: "werewolf",
  SEER: "seer",
  WITCH: "witch",
  HUNTER: "hunter",
  LITTLE_GIRL: "littleGirl",
  CUPID: "cupid",
});

export const ROLE_DETAILS = Object.freeze({
  [ROLES.VILLAGER]: {
    name: "Villageois",
    team: "village",
    icon: "🌾",
    description: "Tu n'as pas de pouvoir nocturne. Le jour, observe les débats et vote pour éliminer les Loups-Garous.",
  },
  [ROLES.WEREWOLF]: {
    name: "Loup-Garou",
    team: "wolves",
    icon: "🐺",
    description: "Chaque nuit, les Loups-Garous choisissent ensemble une personne à éliminer. Gagnez quand vous êtes au moins aussi nombreux que les autres joueurs.",
  },
  [ROLES.SEER]: {
    name: "Voyante",
    team: "village",
    icon: "🔮",
    description: "Chaque nuit, découvre secrètement le rôle d'une autre personne encore en vie.",
  },
  [ROLES.WITCH]: {
    name: "Sorcière",
    team: "village",
    icon: "⚗️",
    description: "Tu possèdes une potion de vie pour sauver la victime des Loups et une potion de mort pour éliminer quelqu'un. Chaque potion ne peut servir qu'une fois.",
  },
  [ROLES.HUNTER]: {
    name: "Chasseur",
    team: "village",
    icon: "🏹",
    description: "Lorsque tu es éliminé, tu peux choisir une personne à emporter avec toi.",
  },
  [ROLES.LITTLE_GIRL]: {
    name: "Petite Fille",
    team: "village",
    icon: "🌙",
    description: "Pendant le tour des Loups-Garous, tu peux tenter d'observer leur identité. Les Loups peuvent toutefois te démasquer.",
  },
  [ROLES.CUPID]: {
    name: "Cupidon",
    team: "village",
    icon: "💘",
    description: "Lors de la première nuit, désigne deux amoureux. Si l'un meurt, l'autre meurt aussi. Si leurs camps diffèrent, ils gagnent seuls en restant les deux derniers en vie.",
  },
});

export const ROLE_ORDER = Object.freeze([
  ROLES.WEREWOLF,
  ROLES.SEER,
  ROLES.WITCH,
  ROLES.HUNTER,
  ROLES.LITTLE_GIRL,
  ROLES.CUPID,
]);

export function suggestedRoles(playerCount) {
  const roles = Object.fromEntries(Object.values(ROLES).map((role) => [role, 0]));
  roles[ROLES.WEREWOLF] = playerCount >= 8 ? 2 : 1;
  if (playerCount >= 5) roles[ROLES.SEER] = 1;
  if (playerCount >= 6) roles[ROLES.WITCH] = 1;
  if (playerCount >= 7) roles[ROLES.HUNTER] = 1;
  if (playerCount >= 9) roles[ROLES.CUPID] = 1;
  if (playerCount >= 11) roles[ROLES.LITTLE_GIRL] = 1;
  roles[ROLES.VILLAGER] = playerCount - Object.values(roles).reduce((sum, count) => sum + count, 0);
  return roles;
}

export function validateConfiguration(input) {
  const errors = [];
  const names = Array.isArray(input.names)
    ? input.names.map((name) => String(name ?? "").trim().replace(/\s+/g, " "))
    : [];
  const roles = {};

  if (names.length < MIN_PLAYERS || names.length > MAX_PLAYERS) {
    errors.push(`La partie doit compter entre ${MIN_PLAYERS} et ${MAX_PLAYERS} joueurs.`);
  }
  if (names.some((name) => !name)) errors.push("Chaque joueur doit avoir un pseudo.");
  if (new Set(names.map(normalizePlayerName)).size !== names.length) {
    errors.push("Les pseudos doivent être uniques, même en ignorant les accents et la casse.");
  }

  for (const role of Object.values(ROLES)) {
    const count = Number(input.roles?.[role] ?? 0);
    if (!Number.isInteger(count) || count < 0 || count > (role === ROLES.WEREWOLF || role === ROLES.VILLAGER ? MAX_PLAYERS : 1)) {
      errors.push(`Le nombre de cartes « ${ROLE_DETAILS[role].name} » n'est pas valide.`);
    }
    roles[role] = Number.isInteger(count) && count >= 0 ? count : 0;
  }

  if (roles[ROLES.WEREWOLF] < 1) errors.push("Il faut au moins un Loup-Garou.");
  if (roles[ROLES.VILLAGER] < 1) errors.push("Il faut au moins un Villageois.");
  if (roles[ROLES.WEREWOLF] >= names.length - roles[ROLES.WEREWOLF]) {
    errors.push("Les Loups-Garous doivent être moins nombreux que les autres joueurs au début de la partie.");
  }
  const total = Object.values(roles).reduce((sum, count) => sum + count, 0);
  if (total !== names.length) {
    errors.push(`La composition contient ${total} cartes pour ${names.length} joueurs.`);
  }

  if (!["screen", "human"].includes(input.narrator)) {
    errors.push("Choisissez un mode de narration valide.");
  }

  return {
    ok: errors.length === 0,
    errors,
    config: {
      names,
      roles,
      narrator: input.narrator,
      showScript: Boolean(input.showScript),
    },
  };
}
