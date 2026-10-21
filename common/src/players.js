export function normalizePlayerName(name) {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fr-FR");
}