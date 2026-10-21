import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_TIMER_DURATION,
  GAME_MODES,
  HOT_MODE,
  SOFT_MODE,
  TIMER_OPTIONS,
  isAdultMode,
  validateConfiguration,
} from "../src/config.js";
import { buildPoolKey, pickDilemma, secureRandomInt, shuffle } from "../src/game.js";

const deterministicRandom = (maxExclusive) => maxExclusive - 1;

function pool(size) {
  return Array.from({ length: size }, (_, index) => ({
    id: `dilemma-${index + 1}`,
    optionA: "Option A",
    optionB: "Option B",
  }));
}

test("la configuration accepte les modes soft et hot et refuse tout le reste", () => {
  assert.equal(validateConfiguration({ mode: SOFT_MODE }).ok, true);
  assert.equal(validateConfiguration({ mode: HOT_MODE }).config.mode, HOT_MODE);
  const invalid = validateConfiguration({ mode: "nimporte" });
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join(" "), /Soft ou Hot/);

  assert.equal(isAdultMode(HOT_MODE), true);
  assert.equal(isAdultMode(SOFT_MODE), false);
  assert.deepEqual([...GAME_MODES], ["soft", "hot"]);
});

test("le chrono actif accepte uniquement les durées proposées", () => {
  const rejected = validateConfiguration({ mode: SOFT_MODE, timerEnabled: true, timerDuration: 25 });
  assert.equal(rejected.ok, false);
  assert.match(rejected.errors.join(" "), /durée de débat/);
  assert.equal(rejected.config.timerDuration, DEFAULT_TIMER_DURATION);

  for (const duration of TIMER_OPTIONS) {
    const accepted = validateConfiguration({ mode: SOFT_MODE, timerEnabled: true, timerDuration: duration });
    assert.equal(accepted.ok, true);
    assert.equal(accepted.config.timerDuration, duration);
  }
});

test("le chrono désactivé ignore la durée fournie", () => {
  const disabled = validateConfiguration({ mode: HOT_MODE, timerEnabled: false, timerDuration: 25 });
  assert.equal(disabled.ok, true);
  assert.equal(disabled.config.timerEnabled, false);
  assert.equal(disabled.config.timerDuration, DEFAULT_TIMER_DURATION);
});

test("le tirage évite le dilemme précédent quand le pool le permet", () => {
  const drawn = pickDilemma(pool(3), "dilemma-3", deterministicRandom);
  assert.equal(drawn.id, "dilemma-2");
});

test("un pool à un seul dilemme peut être retiré immédiatement", () => {
  const drawn = pickDilemma(pool(1), "dilemma-1", deterministicRandom);
  assert.equal(drawn.id, "dilemma-1");
});

test("un pool vide ou invalide renvoie null", () => {
  assert.equal(pickDilemma([], null, deterministicRandom), null);
  assert.equal(pickDilemma(undefined, null, deterministicRandom), null);
});

test("la clé de pool distingue les modes", () => {
  assert.equal(buildPoolKey("soft"), "soft");
  assert.equal(buildPoolKey("hot"), "hot");
});

test("secureRandomInt reste dans les bornes et refuse les valeurs invalides", () => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const value = secureRandomInt(7);
    assert.ok(Number.isInteger(value));
    assert.ok(value >= 0 && value < 7);
  }
  assert.throws(() => secureRandomInt(0), RangeError);
  assert.throws(() => secureRandomInt(2.5), RangeError);
});

test("shuffle renvoie une permutation sans muter l'entrée", () => {
  const values = [1, 2, 3, 4];
  const shuffled = shuffle(values, deterministicRandom);
  assert.deepEqual([...shuffled].sort((first, second) => first - second), values);
  assert.deepEqual(values, [1, 2, 3, 4]);
});