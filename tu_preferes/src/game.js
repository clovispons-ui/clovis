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

export function buildPoolKey(mode) {
  return String(mode);
}

export function pickDilemma(pool, lastDilemmaId, randomInt = secureRandomInt) {
  if (!Array.isArray(pool) || pool.length === 0) return null;

  const candidates = pool.length > 1 && lastDilemmaId
    ? pool.filter((dilemma) => dilemma.id !== lastDilemmaId)
    : pool;
  return candidates[randomInt(candidates.length)];
}