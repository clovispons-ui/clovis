import assert from "node:assert/strict";
import test from "node:test";
import { CountdownTimer } from "../src/timer.js";

test("un chrono de durée nulle signale la fin immédiatement", () => {
  const timer = new CountdownTimer();
  const ticks = [];
  let ended = false;
  timer.start(0, (secondsLeft) => ticks.push(secondsLeft), () => {
    ended = true;
  });
  assert.deepEqual(ticks, [0]);
  assert.ok(ended);
});

test("stop interrompt le compte à rebours sans signaler la fin", async () => {
  const timer = new CountdownTimer();
  let ended = false;
  timer.start(30, () => {}, () => {
    ended = true;
  });
  timer.stop();
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(ended, false);
});