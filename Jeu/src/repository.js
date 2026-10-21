import { GAME_MODES } from "./config.js";
import { secureRandomInt } from "./game.js";
import { requestResult, transactionResult } from "./database.js";

async function getAll(database, storeName) {
  const transaction = database.transaction(storeName, "readonly");
  const completion = transactionResult(transaction);
  const values = await requestResult(transaction.objectStore(storeName).getAll());
  await completion;
  return values;
}

export function createRepository(database, randomInt = secureRandomInt) {
  return {
    async getCategories() {
      return (await getAll(database, "categories"))
        .filter((category) => category.active)
        .sort((first, second) => first.label.localeCompare(second.label, "fr"));
    },

    async getAvailableContent(mode, categoryIds) {
      const allowedCategories = new Set(categoryIds);
      const storeName = mode === GAME_MODES.CLOSE_WORD ? "wordPairs" : "words";
      return (await getAll(database, storeName))
        .filter((item) => item.active && allowedCategories.has(item.categoryId));
    },

    async drawContent(mode, categoryIds) {
      const isPair = mode === GAME_MODES.CLOSE_WORD;
      const contentType = isPair ? "pair" : "word";
      const poolKey = `${contentType}:${[...categoryIds].sort().join(",")}`;
      const pool = await this.getAvailableContent(mode, categoryIds);
      if (pool.length === 0) {
        throw new Error(isPair
          ? "Aucune paire disponible pour les catégories sélectionnées."
          : "Aucun mot disponible pour les catégories sélectionnées.");
      }

      const history = await getAll(database, "playedContent");
      const latest = history
        .filter((entry) => entry.poolKey === poolKey)
        .sort((first, second) => second.playedAt - first.playedAt)[0];
      const candidates = pool.length > 1 && latest
        ? pool.filter((item) => item.id !== latest.contentId)
        : pool;
      const selected = candidates[randomInt(candidates.length)];

      const transaction = database.transaction("playedContent", "readwrite");
      const completion = transactionResult(transaction);
      transaction.objectStore("playedContent").add({
        id: globalThis.crypto.randomUUID(),
        contentType,
        contentId: selected.id,
        poolKey,
        playedAt: Date.now(),
      });
      await completion;

      return { ...selected };
    },
  };
}
