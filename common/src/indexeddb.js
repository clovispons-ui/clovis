export function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Échec d'une requête IndexedDB."));
  });
}

export function transactionResult(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("La transaction IndexedDB a été annulée."));
    transaction.onerror = () => reject(transaction.error ?? new Error("Échec de la transaction IndexedDB."));
  });
}