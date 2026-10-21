import {
  GAME_MODES,
  defaultImpostorCount,
  maxPlayableImpostors,
  validateConfiguration,
} from "./config.js";
import { createRound, chooseStartingPlayer, eliminatePlayer as eliminateActivePlayer, getVictory, answersMatch } from "./game.js";
import { importSeed, openDatabase } from "./database.js";
import { createRepository } from "./repository.js";
import { CountdownTimer } from "./timer.js";
import { renderApp, updateTimerDisplay } from "./ui.js";

const root = document.querySelector("#app");
const timer = new CountdownTimer();
const state = {
  screen: "loading",
  error: null,
  starting: false,
  categories: [],
  draft: {
    names: ["Alex", "Sam", "Noa", "Lou"],
    mode: GAME_MODES.CLUE,
    impostorCount: 1,
    includeMisterWhite: false,
    categoryIds: [],
    timerEnabled: false,
    timerDuration: 30,
  },
  round: null,
  roundNumber: 0,
  dealIndex: 0,
  revealed: false,
  startingPlayerId: null,
  roundTimerEnabled: false,
  roundTimerDuration: 30,
  timerSeconds: null,
  eliminatedPlayerId: null,
  winner: null,
  endReason: "",
  notice: "",
};

function render() {
  renderApp(root, state);
}

function draftFromForm(form) {
  const formData = new FormData(form);
  return {
    ...state.draft,
    names: formData.getAll("playerName").map((name) => String(name)),
    mode: String(formData.get("mode") ?? state.draft.mode),
    impostorCount: Number(formData.get("impostorCount") ?? state.draft.impostorCount),
    includeMisterWhite: formData.has("includeMisterWhite"),
    categoryIds: formData.getAll("categoryId").map(String),
    timerEnabled: formData.has("timerEnabled"),
    timerDuration: Number(formData.get("timerDuration") ?? state.draft.timerDuration),
  };
}

function stopTimer() {
  timer.stop();
  state.timerSeconds = null;
}

function civilianWord() {
  return state.round.mode === GAME_MODES.CLOSE_WORD
    ? state.round.content.civilianWord
    : state.round.content.value;
}

function finishGame(winner, reason) {
  stopTimer();
  state.winner = winner;
  state.endReason = reason;
  state.screen = "end";
  state.notice = "";
  render();
}

function continueAfterElimination(message = "") {
  const winner = getVictory(state.round.players);
  if (winner === "civilians") {
    finishGame("civilians", "Tous les rôles adverses ont été démasqués.");
  } else if (winner === "impostors") {
    finishGame("impostors", "Les rôles adverses sont désormais aussi nombreux que les civils.");
  } else {
    enterDiscussion(message);
  }
}

function startDiscussionTimer() {
  if (!state.roundTimerEnabled) return;
  state.timerSeconds = state.roundTimerDuration;
  timer.start(
    state.roundTimerDuration,
    (seconds) => {
      state.timerSeconds = seconds;
      updateTimerDisplay(root, seconds);
    },
    finishDiscussion,
  );
}

function enterDiscussion(notice = "") {
  stopTimer();
  const startingPlayer = chooseStartingPlayer(state.round.players);
  if (!startingPlayer) {
    finishGame("impostors", "Il ne reste plus de civil pour commencer un nouveau tour.");
    return;
  }
  state.startingPlayerId = startingPlayer.id;
  state.notice = notice;
  state.roundTimerEnabled = state.lastConfig.timerEnabled;
  state.roundTimerDuration = state.lastConfig.timerDuration;
  state.screen = "discussion";
  render();
  startDiscussionTimer();
}

function finishDiscussion() {
  if (state.screen !== "discussion") return;
  stopTimer();
  beginEliminationChoice();
}

function beginEliminationChoice() {
  stopTimer();
  state.screen = "eliminationChoice";
  state.notice = "";
  render();
}

function eliminatePlayer(playerId) {
  if (state.screen !== "eliminationChoice") return;
  const eliminated = eliminateActivePlayer(state.round.players, playerId);
  state.eliminatedPlayerId = eliminated.id;
  state.screen = "elimination";
  render();
}

function startNewRound() {
  if (state.starting) return;
  const form = root.querySelector("#configuration-form");
  if (!form) return;
  state.draft = draftFromForm(form);
  const validation = validateConfiguration(state.draft);
  if (!validation.ok) {
    state.error = validation.errors.join(" ");
    render();
    return;
  }

  const knownCategoryIds = new Set(state.categories.map((category) => category.id));
  if (validation.config.categoryIds.some((categoryId) => !knownCategoryIds.has(categoryId))) {
    state.error = "Une catégorie sélectionnée n'est plus disponible. Recharge la page et réessaie.";
    render();
    return;
  }

  state.error = null;
  state.lastConfig = validation.config;
  state.draft = validation.config;
  state.starting = true;
  render();

  repository.drawContent(validation.config.mode, validation.config.categoryIds)
    .then((content) => {
      state.starting = false;
      state.roundNumber += 1;
      state.round = createRound(validation.config, content);
      state.dealIndex = 0;
      state.revealed = false;
      state.winner = null;
      state.eliminatedPlayerId = null;
      state.notice = "";
      state.screen = "deal";
      render();
    })
    .catch((error) => {
      state.starting = false;
      state.error = error instanceof Error ? error.message : "Impossible de tirer un mot pour cette partie.";
      state.screen = "config";
      render();
    });
}

function handleLastChance(form) {
  const answer = new FormData(form).get("answer");
  if (answersMatch(String(answer ?? ""), civilianWord())) {
    finishGame("impostors", "Mister White a deviné le mot des civils.");
    return;
  }

  if (state.round.mode === GAME_MODES.MISTER_WHITE) {
    finishGame("civilians", "Mister White n'a pas trouvé le mot secret.");
    return;
  }
  continueAfterElimination("Mister White s'est trompé et quitte la partie.");
}

function readCurrentForm() {
  const form = root.querySelector("#configuration-form");
  if (form) state.draft = draftFromForm(form);
}

root.addEventListener("input", (event) => {
  if (!event.target.matches(".player-name")) return;
  const inputs = [...root.querySelectorAll(".player-name")];
  state.draft.names = inputs.map((input) => input.value);
});

root.addEventListener("change", (event) => {
  const target = event.target;
  if (target.closest("#configuration-form") === null) return;

  if (target.name === "mode") {
    readCurrentForm();
    state.draft.mode = target.value;
    if (target.value !== GAME_MODES.CLOSE_WORD) state.draft.includeMisterWhite = false;
    render();
    return;
  }

  if (target.name === "playerCount") {
    readCurrentForm();
    const count = Number(target.value);
    const names = [...state.draft.names];
    while (names.length < count) names.push(`Joueur ${names.length + 1}`);
    state.draft.names = names.slice(0, count);
    if (maxPlayableImpostors(count) < 2) state.draft.includeMisterWhite = false;
    const minCount = state.draft.includeMisterWhite ? 2 : 1;
    state.draft.impostorCount = Math.max(
      minCount,
      Math.min(maxPlayableImpostors(count), defaultImpostorCount(count)),
    );
    render();
    return;
  }

  if (target.name === "includeMisterWhite") {
    readCurrentForm();
    if (target.checked) state.draft.impostorCount = Math.max(2, state.draft.impostorCount);
    render();
    return;
  }

  if (target.name === "timerEnabled") {
    readCurrentForm();
    render();
    return;
  }

  readCurrentForm();
});

root.addEventListener("submit", (event) => {
  if (event.target.id === "configuration-form") {
    event.preventDefault();
    startNewRound();
  } else if (event.target.id === "last-chance-form") {
    event.preventDefault();
    handleLastChance(event.target);
  }
});

root.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  switch (button.dataset.action) {
    case "reveal":
      if (state.screen === "deal") {
        state.revealed = true;
        render();
      }
      break;
    case "hide-next":
      state.revealed = false;
      if (state.dealIndex + 1 < state.round.players.length) {
        state.dealIndex += 1;
        render();
      } else {
        enterDiscussion();
      }
      break;
    case "next-turn":
      finishDiscussion();
      break;
    case "eliminate-player":
      eliminatePlayer(button.dataset.playerId);
      break;
    case "continue-after-elimination": {
      const eliminated = state.round.players.find((player) => player.id === state.eliminatedPlayerId);
      if (eliminated.role === "misterWhite") {
        state.screen = "lastChance";
        render();
      } else {
        continueAfterElimination();
      }
      break;
    }
    case "replay":
      stopTimer();
      state.round = null;
      state.screen = "config";
      state.error = null;
      state.notice = "";
      state.winner = null;
      state.draft = { ...state.lastConfig, names: [...state.lastConfig.names] };
      render();
      break;
    case "back-to-config":
      state.screen = "config";
      state.error = null;
      render();
      break;
    case "reload":
      window.location.reload();
      break;
    default:
      break;
  }
});

function hideSecretOnBlur() {
  if (state.screen === "deal" && state.revealed) {
    state.revealed = false;
    render();
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) hideSecretOnBlur();
});
window.addEventListener("blur", hideSecretOnBlur);
window.addEventListener("pagehide", stopTimer);

let repository;
try {
  const seedResponse = await fetch("./data/seed.json");
  if (!seedResponse.ok) throw new Error(`Impossible de charger la banque de mots (HTTP ${seedResponse.status}).`);
  const seed = await seedResponse.json();
  const database = await openDatabase();
  await importSeed(database, seed);
  repository = createRepository(database);
  state.categories = await repository.getCategories();
  state.draft.categoryIds = state.categories.map((category) => category.id);
  state.screen = "config";
  render();
} catch (error) {
  state.screen = "error";
  state.error = error instanceof Error ? error.message : "Impossible de préparer les données locales.";
  render();
}
