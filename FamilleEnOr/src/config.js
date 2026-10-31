export const ROUND_COUNT = 5;
export const MIN_QUESTION_COUNT = 200;
export const MAX_STRIKES = 3;
export const TEAM_IDS = Object.freeze(["team-a", "team-b"]);

export function validateTeamNames(names) {
  if (!Array.isArray(names) || names.length !== TEAM_IDS.length) {
    return { ok: false, errors: ["Il faut exactement deux équipes."] };
  }

  const cleanedNames = names.map((name) => String(name).trim());
  if (cleanedNames.some((name) => !name)) {
    return { ok: false, errors: ["Chaque équipe doit avoir un nom."] };
  }
  if (cleanedNames.some((name) => name.length > 24)) {
    return { ok: false, errors: ["Les noms d'équipe ne peuvent pas dépasser 24 caractères."] };
  }
  if (cleanedNames[0].toLocaleLowerCase("fr") === cleanedNames[1].toLocaleLowerCase("fr")) {
    return { ok: false, errors: ["Les deux équipes doivent avoir des noms différents."] };
  }

  return {
    ok: true,
    config: {
      teams: TEAM_IDS.map((id, index) => ({ id, name: cleanedNames[index] })),
      roundsToPlay: ROUND_COUNT,
    },
    errors: [],
  };
}
