import { requestResult, transactionResult } from "../../common/src/indexeddb.js";

const DATABASE_NAME = "imposteur-local";
const DATABASE_VERSION = 1;
const STORE_NAMES = ["categories", "words", "wordPairs", "playedContent", "meta"];

export async function openDatabase() {
  if (!globalThis.indexedDB) throw new Error("IndexedDB n'est pas disponible dans ce navigateur.");

  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains("categories")) database.createObjectStore("categories", { keyPath: "id" });
    if (!database.objectStoreNames.contains("words")) database.createObjectStore("words", { keyPath: "id" });
    if (!database.objectStoreNames.contains("wordPairs")) database.createObjectStore("wordPairs", { keyPath: "id" });
    if (!database.objectStoreNames.contains("playedContent")) database.createObjectStore("playedContent", { keyPath: "id" });
    if (!database.objectStoreNames.contains("meta")) database.createObjectStore("meta", { keyPath: "id" });
  };
  return requestResult(request);
}

export async function importSeed(database, seed) {
  const transaction = database.transaction(["categories", "words", "wordPairs", "meta"], "readwrite");
  const completion = transactionResult(transaction);
  const metaStore = transaction.objectStore("meta");
  const currentVersion = await requestResult(metaStore.get("seedVersion"));

  if (currentVersion?.value === seed.version) {
    await completion;
    return;
  }

  const categories = transaction.objectStore("categories");
  const words = transaction.objectStore("words");
  const wordPairs = transaction.objectStore("wordPairs");

  for (const category of seed.categories) {
    categories.put({ ...category, active: true, source: "seed" });
  }
  for (const set of seed.wordSets) {
    set.values.forEach((value, index) => {
      words.put({
        id: `word-${set.categoryId}-${index + 1}`,
        categoryId: set.categoryId,
        value,
        clue: set.clue,
        cluePrecision: set.cluePrecision,
        source: "seed",
        active: true,
      });
    });
  }
  for (const set of seed.pairSets) {
    set.pairs.forEach(([civilianWord, impostorWord], index) => {
      wordPairs.put({
        id: `pair-${set.categoryId}-${index + 1}`,
        categoryId: set.categoryId,
        civilianWord,
        impostorWord,
        relationNote: "",
        source: "seed",
        active: true,
      });
    });
  }
  metaStore.put({ id: "seedVersion", value: seed.version });
  await completion;
}

export function closeDatabase(database) {
  database.close();
}

export { requestResult, transactionResult, STORE_NAMES };
