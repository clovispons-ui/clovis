export const SOFT_MODE = "soft";
export const HOT_MODE = "hot";

export const GAME_MODES = Object.freeze([SOFT_MODE, HOT_MODE]);

export const TIMER_OPTIONS = Object.freeze([30, 45, 60, 90, 120]);
export const DEFAULT_TIMER_DURATION = 60;

export function isAdultMode(mode) {
  return mode === HOT_MODE;
}

export function validateConfiguration(input) {
  const errors = [];
  const mode = input?.mode;

  if (mode !== SOFT_MODE && mode !== HOT_MODE) {
    errors.push("Choisissez un mode : Soft ou Hot.");
  }

  const timerEnabled = Boolean(input?.timerEnabled);
  const timerDuration = Number(input?.timerDuration ?? DEFAULT_TIMER_DURATION);
  if (timerEnabled && !TIMER_OPTIONS.includes(timerDuration)) {
    errors.push("Choisissez une durée de débat proposée.");
  }

  return {
    ok: errors.length === 0,
    errors,
    config: {
      mode: mode === HOT_MODE ? HOT_MODE : SOFT_MODE,
      timerEnabled,
      timerDuration: TIMER_OPTIONS.includes(timerDuration) ? timerDuration : DEFAULT_TIMER_DURATION,
    },
  };
}