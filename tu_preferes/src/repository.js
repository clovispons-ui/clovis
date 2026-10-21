import { buildPoolKey, pickDilemma, secureRandomInt } from "./game.js";
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
        .sort((first, second) =>
          Number(Boolean(first.adult)) - Number(Boolean(second.adult)) ||
          first.label.localeCompare(second.label, "fr"),
        );
    },

    async drawDilemma(mode) {
      const poolKey = buildPoolKey(mode);
      const pool = (await getAll(database, "dilemmas"))
        .filter((dilemma) => dilemma.categoryId === mode);
      if (pool.length === 0) {
        throw new Error("Aucun dilemme disponible pour ce mode.");
      }

      const history = await getAll(database, "playedDilemmas");
      const latest = history
        .filter((entry) => entry.poolKey === poolKey)
        .sort((first, second) => second.playedAt - first.playedAt)[0];
      const selected = pickDilemma(pool, latest?.contentId, randomInt);
      if (!selected) {
        throw new Error("Aucun dilemme n'a pu être tiré pour ce mode.");
      }

      const transaction = database.transaction("playedDilemmas", "readwrite");
      const completion = transactionResult(transaction);
      transaction.objectStore("playedDilemmas").add({
        id: globalThis.crypto.randomUUID(),
        contentId: selected.id,
        poolKey,
        playedAt: Date.now(),
      });
      await completion;

      return { ...selected };
    },
  };
}