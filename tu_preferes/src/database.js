import { requestResult, transactionResult } from "../../common/src/indexeddb.js";

const DATABASE_NAME = "tu-preferes-local";
const DATABASE_VERSION = 1;

export async function openDatabase() {
  if (!globalThis.indexedDB) throw new Error("IndexedDB n'est pas disponible dans ce navigateur.");

  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains("categories")) database.createObjectStore("categories", { keyPath: "id" });
    if (!database.objectStoreNames.contains("dilemmas")) database.createObjectStore("dilemmas", { keyPath: "id" });
    if (!database.objectStoreNames.contains("playedDilemmas")) database.createObjectStore("playedDilemmas", { keyPath: "id" });
    if (!database.objectStoreNames.contains("meta")) database.createObjectStore("meta", { keyPath: "id" });
  };
  return requestResult(request);
}

export async function importSeed(database, seed) {
  const transaction = database.transaction(["categories", "dilemmas", "meta"], "readwrite");
  const completion = transactionResult(transaction);
  const metaStore = transaction.objectStore("meta");
  const currentVersion = await requestResult(metaStore.get("seedVersion"));

  if (currentVersion?.value === seed.version) {
    await completion;
    return;
  }

  const categories = transaction.objectStore("categories");
  const dilemmas = transaction.objectStore("dilemmas");
  categories.clear();
  dilemmas.clear();

  for (const category of seed.categories) {
    categories.put({ ...category, source: "seed" });
  }
  for (const set of seed.dilemmaSets) {
    set.dilemmas.forEach(([optionA, optionB], index) => {
      dilemmas.put({
        id: `dilemma-${set.categoryId}-${index + 1}`,
        categoryId: set.categoryId,
        theme: set.theme,
        optionA,
        optionB,
        source: "seed",
      });
    });
  }
  metaStore.put({ id: "seedVersion", value: seed.version });
  await completion;
}

export function closeDatabase(database) {
  database.close();
}

export { requestResult, transactionResult };