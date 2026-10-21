import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  GAME_MODES,
  MAX_PLAYERS,
  MIN_PLAYERS,
  TIMER_OPTIONS,
  defaultImpostorCount,
  maxPlayableImpostors,
  validateConfiguration,
} from "./config.js";
import {
  answersMatch,
  chooseStartingPlayer,
  createRound,
  eliminatePlayer as eliminateActivePlayer,
  getVictory,
} from "./game.js";
import { closeDatabase, importSeed, openDatabase } from "./database.js";
import { createRepository } from "./repository.js";
import { CountdownTimer } from "../../common/src/timer.js";
import seedUrl from "../data/seed.json?url";

const INITIAL_STATE = {
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

function readSavedTheme() {
  try {
    return window.localStorage.getItem("imposteur-theme") === "light" ? "light" : "dark";
  } catch (error) {
    console.error("Impossible de lire le thème enregistré.", error);
    return "dark";
  }
}

function NumberStepper({ label, value, min, max, onChange, hint }) {
  return (
    <div className="stepper-field">
      <div className="stepper-copy">
        <span className="field-label">{label}</span>
        {hint && <span className="field-hint">{hint}</span>}
      </div>
      <div className="number-stepper" role="group" aria-label={label}>
        <button
          className="stepper-button"
          type="button"
          aria-label={`Diminuer : ${label}`}
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
        >
          <span aria-hidden="true">−</span>
        </button>
        <output className="stepper-value" aria-live="polite" aria-atomic="true">{value}</output>
        <button
          className="stepper-button"
          type="button"
          aria-label={`Augmenter : ${label}`}
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>
    </div>
  );
}

function SectionHeading({ number, title, description }) {
  return (
    <div className="section-heading">
      <span className="step-index">{number}</span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}

function RoundTopline({ eyebrow, label }) {
  return (
    <div className="play-topline">
      <span className="eyebrow"><span className="eyebrow-line" />{eyebrow}</span>
      <span className="round-pill">{label}</span>
    </div>
  );
}

function App() {
  const [game, setGame] = useState(INITIAL_STATE);
  const [theme, setTheme] = useState(readSavedTheme);
  const repositoryRef = useRef(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      "content",
      theme === "light" ? "#f3f5f0" : "#10131b",
    );
    try {
      window.localStorage.setItem("imposteur-theme", theme);
    } catch (error) {
      console.error("Impossible d’enregistrer le thème choisi.", error);
    }
  }, [theme]);

  useEffect(() => {
    let active = true;
    let database;

    async function prepareGame() {
      try {
        const seedResponse = await fetch(seedUrl);
        if (!seedResponse.ok) {
          throw new Error(`Impossible de charger la banque de mots (HTTP ${seedResponse.status}).`);
        }
        const seed = await seedResponse.json();
        const openedDatabase = await openDatabase();
        if (!active) {
          closeDatabase(openedDatabase);
          return;
        }
        database = openedDatabase;
        await importSeed(database, seed);
        if (!active) return;

        const repository = createRepository(database);
        repositoryRef.current = repository;
        const categories = await repository.getCategories();
        if (!active) return;

        setGame((current) => ({
          ...current,
          categories,
          draft: { ...current.draft, categoryIds: categories.map(({ id }) => id) },
          screen: "config",
        }));
      } catch (error) {
        if (!active) return;
        setGame((current) => ({
          ...current,
          screen: "error",
          error: error instanceof Error ? error.message : "Impossible de préparer les données locales.",
        }));
      }
    }

    prepareGame();
    return () => {
      active = false;
      repositoryRef.current = null;
      if (database) closeDatabase(database);
    };
  }, []);

  useEffect(() => {
    if (game.screen !== "discussion" || !game.roundTimerEnabled) return undefined;

    const timer = new CountdownTimer();
    timer.start(
      game.roundTimerDuration,
      (seconds) => setGame((current) => (
        current.screen === "discussion" ? { ...current, timerSeconds: seconds } : current
      )),
      () => setGame((current) => (
        current.screen === "discussion"
          ? { ...current, screen: "eliminationChoice", timerSeconds: null, notice: "" }
          : current
      )),
    );
    return () => timer.stop();
  }, [game.screen, game.roundTimerEnabled, game.roundTimerDuration]);

  useEffect(() => {
    function hideSecret() {
      if (document.hidden) {
        setGame((current) => (
          current.screen === "deal" && current.revealed
            ? { ...current, revealed: false }
            : current
        ));
      }
    }
    function hideSecretOnBlur() {
      setGame((current) => (
        current.screen === "deal" && current.revealed
          ? { ...current, revealed: false }
          : current
      ));
    }

    document.addEventListener("visibilitychange", hideSecret);
    window.addEventListener("blur", hideSecretOnBlur);
    return () => {
      document.removeEventListener("visibilitychange", hideSecret);
      window.removeEventListener("blur", hideSecretOnBlur);
    };
  }, []);

  function changePlayerCount(count) {
    setGame((current) => {
      const names = [...current.draft.names];
      while (names.length < count) names.push(`Joueur ${names.length + 1}`);
      const nextNames = names.slice(0, count);
      const includeMisterWhite = maxPlayableImpostors(count) >= 2 && current.draft.includeMisterWhite;
      const minImpostors = includeMisterWhite && current.draft.mode === GAME_MODES.CLOSE_WORD ? 2 : 1;
      const impostorCount = Math.max(
        minImpostors,
        Math.min(maxPlayableImpostors(count), defaultImpostorCount(count)),
      );
      return {
        ...current,
        error: null,
        draft: { ...current.draft, names: nextNames, includeMisterWhite, impostorCount },
      };
    });
  }

  function changeMode(mode) {
    setGame((current) => {
      const includeMisterWhite = mode === GAME_MODES.CLOSE_WORD && current.draft.includeMisterWhite;
      const minImpostors = includeMisterWhite ? 2 : 1;
      return {
        ...current,
        error: null,
        draft: {
          ...current.draft,
          mode,
          includeMisterWhite,
          impostorCount: Math.max(
            minImpostors,
            Math.min(maxPlayableImpostors(current.draft.names.length), current.draft.impostorCount),
          ),
        },
      };
    });
  }

  function changeIncludeMisterWhite(checked) {
    setGame((current) => ({
      ...current,
      draft: {
        ...current.draft,
        includeMisterWhite: checked,
        impostorCount: checked ? Math.max(2, current.draft.impostorCount) : current.draft.impostorCount,
      },
    }));
  }

  function changeImpostorCount(count) {
    setGame((current) => ({ ...current, draft: { ...current.draft, impostorCount: count } }));
  }

  function finishGame(winner, reason) {
    setGame((current) => ({
      ...current,
      winner,
      endReason: reason,
      screen: "end",
      timerSeconds: null,
      notice: "",
    }));
  }

  function enterDiscussion(notice = "") {
    const startingPlayer = chooseStartingPlayer(game.round.players);
    if (!startingPlayer) {
      finishGame("impostors", "Il ne reste plus de civil pour commencer un nouveau tour.");
      return;
    }
    setGame((current) => ({
      ...current,
      startingPlayerId: startingPlayer.id,
      notice,
      roundTimerEnabled: current.lastConfig.timerEnabled,
      roundTimerDuration: current.lastConfig.timerDuration,
      timerSeconds: current.lastConfig.timerEnabled ? current.lastConfig.timerDuration : null,
      screen: "discussion",
    }));
  }

  function continueAfterElimination(message = "") {
    const winner = getVictory(game.round.players);
    if (winner === "civilians") {
      finishGame("civilians", "Tous les imposteurs ont été démasqués.");
    } else if (winner === "impostors") {
      finishGame("impostors", "Les imposteurs sont désormais aussi nombreux que les civils.");
    } else {
      enterDiscussion(message);
    }
  }

  function beginEliminationChoice() {
    setGame((current) => ({
      ...current,
      screen: "eliminationChoice",
      timerSeconds: null,
      notice: "",
    }));
  }

  function startNewRound(event) {
    event.preventDefault();
    if (game.starting) return;

    const validation = validateConfiguration(game.draft);
    if (!validation.ok) {
      setGame((current) => ({ ...current, error: validation.errors.join(" ") }));
      return;
    }

    const knownCategoryIds = new Set(game.categories.map(({ id }) => id));
    if (validation.config.categoryIds.some((categoryId) => !knownCategoryIds.has(categoryId))) {
      setGame((current) => ({
        ...current,
        error: "Une catégorie sélectionnée n'est plus disponible. Recharge la page et réessaie.",
      }));
      return;
    }

    setGame((current) => ({
      ...current,
      error: null,
      lastConfig: validation.config,
      draft: validation.config,
      starting: true,
    }));

    repositoryRef.current.drawContent(validation.config.mode, validation.config.categoryIds)
      .then((content) => {
        setGame((current) => ({
          ...current,
          starting: false,
          roundNumber: current.roundNumber + 1,
          round: createRound(validation.config, content),
          dealIndex: 0,
          revealed: false,
          winner: null,
          eliminatedPlayerId: null,
          notice: "",
          screen: "deal",
        }));
      })
      .catch((error) => {
        setGame((current) => ({
          ...current,
          starting: false,
          error: error instanceof Error ? error.message : "Impossible de tirer un mot pour cette partie.",
          screen: "config",
        }));
      });
  }

  function handleLastChance(event) {
    event.preventDefault();
    const answer = new FormData(event.currentTarget).get("answer");
    const civilianWord = game.round.mode === GAME_MODES.CLOSE_WORD
      ? game.round.content.civilianWord
      : game.round.content.value;
    if (answersMatch(String(answer ?? ""), civilianWord)) {
      finishGame("impostors", "Mister White a deviné le mot des civils.");
      return;
    }

    if (game.round.mode === GAME_MODES.MISTER_WHITE) {
      finishGame("civilians", "Mister White n'a pas trouvé le mot secret.");
      return;
    }
    continueAfterElimination("Mister White s'est trompé et quitte la partie.");
  }

  function eliminatePlayer(playerId) {
    if (game.screen !== "eliminationChoice") return;
    try {
      const eliminated = eliminateActivePlayer(game.round.players, playerId);
      setGame((current) => ({
        ...current,
        eliminatedPlayerId: eliminated.id,
        screen: "elimination",
      }));
    } catch (error) {
      setGame((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "Impossible d'éliminer ce joueur.",
      }));
    }
  }

  function handleAction(action, playerId) {
    switch (action) {
      case "reveal":
        setGame((current) => current.screen === "deal" ? { ...current, revealed: true } : current);
        break;
      case "hide-next":
        if (game.dealIndex + 1 < game.round.players.length) {
          setGame((current) => ({ ...current, revealed: false, dealIndex: current.dealIndex + 1 }));
        } else {
          setGame((current) => ({ ...current, revealed: false }));
          enterDiscussion();
        }
        break;
      case "next-turn":
        beginEliminationChoice();
        break;
      case "eliminate-player":
        eliminatePlayer(playerId);
        break;
      case "continue-after-elimination": {
        const eliminated = game.round.players.find(({ id }) => id === game.eliminatedPlayerId);
        if (eliminated.role === "misterWhite") {
          setGame((current) => ({ ...current, screen: "lastChance" }));
        } else {
          continueAfterElimination();
        }
        break;
      }
      case "replay":
        setGame((current) => ({
          ...INITIAL_STATE,
          categories: current.categories,
          screen: "config",
          roundNumber: current.roundNumber,
          draft: { ...current.lastConfig, names: [...current.lastConfig.names] },
        }));
        break;
      case "reload":
        window.location.reload();
        break;
      default:
        break;
    }
  }

  function renderConfiguration() {
    const draft = game.draft;
    const playerCount = draft.names.length;
    const maxImpostors = maxPlayableImpostors(playerCount);
    const minImpostors = draft.mode === GAME_MODES.CLOSE_WORD && draft.includeMisterWhite ? 2 : 1;
    const canAddMisterWhite = maxImpostors >= 2;

    return (
      <section className="screen screen--config">
        <div className="hero-copy">
          <span className="eyebrow"><span className="eyebrow-line" />Le jeu commence ici</span>
          <h1>Qui bluffe<br /><span>dans votre groupe&nbsp;?</span></h1>
          <p>Faites tourner l'écran, gardez votre secret, et repérez l'imposteur avant qu'il ne soit trop tard.</p>
          <div className="hero-points">
            <span><i aria-hidden="true">01</i> Choisissez vos rôles</span>
            <span><i aria-hidden="true">02</i> Passez l'écran en secret</span>
            <span><i aria-hidden="true">03</i> Démasquez l'imposteur</span>
          </div>
        </div>

        <form className="panel config-panel" onSubmit={startNewRound}>
          {game.error && <div className="notice notice--error" role="alert">{game.error}</div>}
          <SectionHeading number="01" title="Votre équipe" description="De 3 à 12 joueurs autour du même écran." />
          <NumberStepper
            label="Nombre de joueurs"
            value={playerCount}
            min={MIN_PLAYERS}
            max={MAX_PLAYERS}
            onChange={changePlayerCount}
            hint="Réglez le nombre de personnes qui jouent."
          />
          <div className="player-grid" aria-label="Pseudos des joueurs">
            {draft.names.map((name, index) => (
              <label className="player-field" key={index}>
                <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <input
                  className="text-control"
                  name={`player-${index}`}
                  type="text"
                  maxLength={24}
                  autoComplete="off"
                  placeholder={`Pseudo du joueur ${index + 1}`}
                  value={name}
                  onChange={(event) => setGame((current) => {
                    const names = [...current.draft.names];
                    names[index] = event.target.value;
                    return { ...current, draft: { ...current.draft, names } };
                  })}
                  aria-label={`Pseudo du joueur ${index + 1}`}
                  required
                />
              </label>
            ))}
          </div>

          <SectionHeading number="02" title="Choisissez votre mode" description="Chaque variante change les informations secrètes." />
          <div className="mode-grid">
            {[
              [GAME_MODES.MISTER_WHITE, "Mister White", "Un rôle sans mot. Il écoute et improvise.", "◌"],
              [GAME_MODES.CLUE, "L'indice", "L'imposteur reçoit une piste, pas le mot.", "⌁"],
              [GAME_MODES.CLOSE_WORD, "Mot proche", "Deux mots voisins, un seul groupe qui le sait.", "↔"],
            ].map(([mode, title, description, icon]) => (
              <label className={`mode-card ${draft.mode === mode ? "is-selected" : ""}`} key={mode}>
                <input
                  type="radio"
                  name="mode"
                  value={mode}
                  checked={draft.mode === mode}
                  onChange={() => changeMode(mode)}
                />
                <span className="mode-icon" aria-hidden="true">{icon}</span>
                <span className="mode-card-copy"><strong>{title}</strong><span>{description}</span></span>
                <span className="mode-radio" aria-hidden="true" />
              </label>
            ))}
          </div>

          <div className="settings-grid">
            <NumberStepper
              label={draft.mode === GAME_MODES.MISTER_WHITE ? "Nombre de Mister White" : "Nombre d’imposteurs"}
              value={Math.min(maxImpostors, Math.max(minImpostors, draft.impostorCount))}
              min={minImpostors}
              max={maxImpostors}
              onChange={changeImpostorCount}
              hint={draft.mode === GAME_MODES.MISTER_WHITE
                ? "Ces joueurs n'auront aucun mot."
                : "Au moins un civil restera dans la partie."}
            />
            {draft.mode === GAME_MODES.CLOSE_WORD && (
              <label className="toggle-card">
                <input
                  type="checkbox"
                  checked={draft.includeMisterWhite && canAddMisterWhite}
                  disabled={!canAddMisterWhite}
                  onChange={(event) => changeIncludeMisterWhite(event.target.checked)}
                />
                <span className="toggle-visual" aria-hidden="true" />
                <span><strong>Ajouter Mister White</strong><small>
                  {canAddMisterWhite
                    ? "Il occupe une place d'imposteur et n'a aucun mot."
                    : "Il faut au moins 5 joueurs pour garder l'équilibre."}
                </small></span>
              </label>
            )}
          </div>

          <SectionHeading number="03" title="Ambiance de la manche" description="Mélangez plusieurs thèmes si vous le souhaitez." />
          <div className="category-grid">
            {game.categories.map((category) => (
              <label className="category-chip" key={category.id}>
                <input
                  type="checkbox"
                  value={category.id}
                  checked={draft.categoryIds.includes(category.id)}
                  onChange={(event) => setGame((current) => ({
                    ...current,
                    draft: {
                      ...current.draft,
                      categoryIds: event.target.checked
                        ? [...current.draft.categoryIds, category.id]
                        : current.draft.categoryIds.filter((id) => id !== category.id),
                    },
                  }))}
                />
                <span className="checkmark" aria-hidden="true">✓</span>
                <span>{category.label}</span>
              </label>
            ))}
          </div>

          <SectionHeading number="04" title="Chrono de discussion" description="Le compte à rebours couvre toute la discussion." />
          <div className="timer-settings">
            <label className="toggle-card toggle-card--compact">
              <input
                type="checkbox"
                checked={draft.timerEnabled}
                onChange={(event) => setGame((current) => ({
                  ...current,
                  draft: { ...current.draft, timerEnabled: event.target.checked },
                }))}
              />
              <span className="toggle-visual" aria-hidden="true" />
              <span><strong>Activer le chrono</strong><small>Temps accordé au groupe pour discuter.</small></span>
            </label>
            <label className={`field-block timer-duration ${draft.timerEnabled ? "" : "is-disabled"}`}>
              <span className="field-label">Durée de discussion</span>
              <select
                className="select-control"
                value={draft.timerDuration}
                disabled={!draft.timerEnabled}
                onChange={(event) => setGame((current) => ({
                  ...current,
                  draft: { ...current.draft, timerDuration: Number(event.target.value) },
                }))}
              >
                {TIMER_OPTIONS.map((duration) => (
                  <option value={duration} key={duration}>{duration} secondes</option>
                ))}
              </select>
            </label>
          </div>

          <button className="button button--primary button--full start-button" type="submit" disabled={game.starting}>
            <span>{game.starting ? "Préparation…" : "Lancer la partie"}</span>
            <span className="button-arrow" aria-hidden="true">↗</span>
          </button>
          <p className="privacy-note"><span aria-hidden="true">◉</span> Les rôles ne sont affichés qu'au moment de la révélation.</p>
        </form>
        <p className="screen-footnote">Pas de compte, pas de réseau, juste un peu de bluff.</p>
      </section>
    );
  }

  function renderScreen() {
    if (game.screen === "loading") {
      return <div className="loading-card" role="status">Préparation de la partie…</div>;
    }
    if (game.screen === "error") {
      return (
        <section className="error-card panel" role="alert">
          <span className="card-overline">OUPS</span>
          <h1>La partie n'a pas pu démarrer.</h1>
          <p>{game.error}</p>
          <button className="button button--secondary" type="button" onClick={() => handleAction("reload")}>Recharger l'application</button>
        </section>
      );
    }
    if (game.screen === "config") return renderConfiguration();
    if (game.screen === "deal") {
      const player = game.round.players[game.dealIndex];
      const roleText = player.role === "civilian"
        ? "Tu es dans l'équipe des civils."
        : player.role === "misterWhite"
          ? "Tu es Mister White."
          : "Tu es l'imposteur.";
      let secretContent;
      if (player.secret?.kind === "clue") {
        secretContent = <><span className="secret-kicker">TON INDICE · {player.secret.precision}</span><strong>{player.secret.value}</strong></>;
      } else if (player.secret?.kind === "word") {
        secretContent = <><span className="secret-kicker">TON MOT</span><strong>{player.secret.value}</strong></>;
      } else {
        secretContent = <><span className="secret-kicker">TON RÔLE</span><strong>Mister White</strong></>;
      }
      return (
        <section className="screen screen--play">
          <RoundTopline eyebrow="Distribution secrète" label={`Joueur ${game.dealIndex + 1} / ${game.round.players.length}`} />
          <div className="progress-track" role="progressbar" aria-label="Progression de la distribution" aria-valuemin="0" aria-valuemax={game.round.players.length} aria-valuenow={game.dealIndex + 1}>
            {game.round.players.map((item, index) => (
              <span className={`progress-dot ${index < game.dealIndex ? "is-done" : ""} ${index === game.dealIndex ? "is-current" : ""}`} key={item.id} />
            ))}
          </div>
          <div className="reveal-card panel">
            {game.revealed ? (
              <>
                <span className="card-overline">C'EST À TON TOUR</span>
                <h1>{player.name}</h1>
                <p className="reveal-instruction">{roleText}</p>
                <div className={`secret-panel ${player.secret?.kind === "word" ? "secret-panel--word" : ""}`} aria-live="polite">{secretContent}</div>
                <p className="keep-secret">Mémorise cette information, puis passe l'appareil.</p>
                <button className="button button--primary button--full" type="button" onClick={() => handleAction("hide-next")}>
                  <span>Masquer et passer au suivant</span><span className="button-arrow" aria-hidden="true">→</span>
                </button>
              </>
            ) : (
              <>
                <span className="reveal-symbol" aria-hidden="true"><span /><span /><span /></span>
                <span className="card-overline">PROCHAINE RÉVÉLATION</span>
                <h1>Passe l'écran à<br /><span>{player.name}</span></h1>
                <p className="reveal-instruction">Vérifie que personne d'autre ne regarde.</p>
                <button className="button button--primary button--full" type="button" onClick={() => handleAction("reveal")}>
                  <span>Révéler mon rôle</span><span className="button-arrow" aria-hidden="true">↗</span>
                </button>
              </>
            )}
          </div>
          <p className="screen-footnote">L'écran se masque automatiquement si tu changes d'application.</p>
        </section>
      );
    }
    if (game.screen === "discussion") {
      const startingPlayer = game.round.players.find(({ id }) => id === game.startingPlayerId);
      return (
        <section className="screen screen--play">
          <RoundTopline eyebrow="Discussion" label={`Manche ${game.roundNumber}`} />
          {game.notice && <div className="notice notice--info">{game.notice}</div>}
          <div className="discussion-layout">
            <div className="discussion-main panel">
              <span className="card-overline">POUR COMMENCER</span>
              <div className="speaker-avatar" aria-hidden="true">{(startingPlayer?.name ?? "?").slice(0, 1).toLocaleUpperCase("fr")}</div>
              <h1>{startingPlayer?.name ?? "Groupe"}</h1>
              <p className="reveal-instruction">Commencez par cette personne, puis discutez librement.</p>
              {game.roundTimerEnabled ? (
                <div className="timer-display" aria-live="off">
                  <span className="timer-ring" aria-hidden="true">◷</span>
                  <span>{game.timerSeconds ?? game.roundTimerDuration}</span>
                  <small>SECONDES</small>
                </div>
              ) : (
                <div className="turn-hint"><span className="turn-hint-dot" />Discutez librement, puis choisissez une personne.</div>
              )}
              <button className="button button--primary button--full" type="button" onClick={beginEliminationChoice}>
                <span>Choisir qui éliminer</span><span className="button-arrow" aria-hidden="true">→</span>
              </button>
            </div>
          </div>
          <p className="screen-footnote">Restez vagues, écoutez bien, et ne donnez pas le mot. Le groupe choisira ensuite qui éliminer.</p>
        </section>
      );
    }
    if (game.screen === "eliminationChoice") {
      const candidates = game.round.players.filter(({ active }) => active);
      return (
        <section className="screen screen--play">
          <RoundTopline eyebrow="Fin de la discussion" label={`Manche ${game.roundNumber}`} />
          {game.error && <div className="notice notice--error" role="alert">{game.error}</div>}
          <div className="choice-card panel">
            <span className="card-overline">DÉCISION DU GROUPE</span>
            <h1>Qui éliminez-vous&nbsp;?</h1>
            <p className="reveal-instruction">Discutez ensemble, puis touchez le joueur qui quitte la partie.</p>
            <div className="elimination-choices">
              {candidates.map((candidate) => (
                <button className="elimination-choice" type="button" key={candidate.id} onClick={() => handleAction("eliminate-player", candidate.id)}>
                  <span className="choice-avatar" aria-hidden="true">{candidate.name.slice(0, 1).toLocaleUpperCase("fr")}</span>
                  <span className="choice-name">{candidate.name}</span><span className="choice-arrow" aria-hidden="true">→</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      );
    }
    if (game.screen === "elimination") {
      const player = game.round.players.find(({ id }) => id === game.eliminatedPlayerId);
      const roleLabel = player.role === "civilian" ? "Civil" : player.role === "misterWhite" ? "Mister White" : "Imposteur";
      const isMisterWhite = player.role === "misterWhite";
      return (
        <section className="screen screen--play">
          <RoundTopline eyebrow="Élimination" label="Choix du groupe" />
          <div className="result-card panel">
            <span className="result-icon" aria-hidden="true">{isMisterWhite ? "?" : "✦"}</span>
            <span className="card-overline">LE GROUPE A CHOISI</span>
            <h1>{player.name}</h1>
            <p className="reveal-instruction">Son rôle était</p>
            <span className={`role-tag ${player.role === "civilian" ? "role-tag--civilian" : "role-tag--adversary"}`}>{roleLabel}</span>
            {isMisterWhite && <p className="result-note">Mister White a encore une chance de deviner le mot des civils.</p>}
            <button className="button button--primary button--full" type="button" onClick={() => handleAction("continue-after-elimination")}>
              <span>{isMisterWhite ? "Donner sa dernière chance" : "Continuer"}</span><span className="button-arrow" aria-hidden="true">→</span>
            </button>
          </div>
        </section>
      );
    }
    if (game.screen === "lastChance") {
      const player = game.round.players.find(({ id }) => id === game.eliminatedPlayerId);
      return (
        <section className="screen screen--play">
          <RoundTopline eyebrow="Dernière chance" label={player.name} />
          <div className="last-chance-card panel">
            <span className="result-icon result-icon--question" aria-hidden="true">?</span>
            <span className="card-overline">UNE SEULE TENTATIVE</span>
            <h1>{player.name},<br /><span>quel était le mot&nbsp;?</span></h1>
            <p className="reveal-instruction">Écris ta réponse. Les accents et la casse ne comptent pas.</p>
            <form onSubmit={handleLastChance}>
              <label className="field-label" htmlFor="last-chance-answer">Ta réponse</label>
              <input id="last-chance-answer" className="text-control answer-input" type="text" name="answer" autoComplete="off" maxLength={80} required />
              <button className="button button--primary button--full" type="submit">
                <span>Confirmer ma réponse</span><span className="button-arrow" aria-hidden="true">→</span>
              </button>
            </form>
          </div>
        </section>
      );
    }
    if (game.screen === "end") {
      const isCivilians = game.winner === "civilians";
      const content = game.round.content;
      return (
        <section className="screen screen--play">
          <RoundTopline eyebrow="Fin de la partie" label={`Manche ${game.roundNumber}`} />
          <div className={`end-hero panel ${isCivilians ? "end-hero--civilians" : ""}`}>
            <span className="end-kicker">{isCivilians ? "BIEN JOUÉ" : "LE BLUFF A FONCTIONNÉ"}</span>
            <h1>{isCivilians ? "Les civils" : "Les imposteurs"}<br /><span>{isCivilians ? "remportent la partie." : "l'emportent."}</span></h1>
            <p>{game.endReason}</p>
          </div>
          <div className="recap-card panel">
            <div className="recap-heading">
              <div><span className="card-overline">RÉVÉLATIONS</span><h2>Tout était là.</h2></div>
              <span className="recap-count">{game.round.players.length} joueurs</span>
            </div>
            {content.civilianWord || content.impostorWord ? (
              <div className="word-recap">
                <span><small>Mot des civils</small><strong>{content.civilianWord}</strong></span>
                <span><small>Mot proche</small><strong>{content.impostorWord}</strong></span>
              </div>
            ) : (
              <div className="word-recap"><span><small>Le mot secret</small><strong>{content.value}</strong></span></div>
            )}
            <ul className="recap-list">
              {game.round.players.map((player) => {
                const role = player.role === "civilian" ? "Civil" : player.role === "misterWhite" ? "Mister White" : "Imposteur";
                const secret = player.secret?.kind === "word"
                  ? player.secret.value
                  : player.secret?.kind === "clue"
                    ? `Indice : ${player.secret.value}`
                    : "Aucun mot";
                return (
                  <li key={player.id}>
                    <span className={`recap-player ${player.active ? "" : "is-eliminated"}`}>
                      {player.name}{!player.active && <small>éliminé·e</small>}
                    </span>
                    <span className="recap-role">{role}</span>
                    <strong>{secret}</strong>
                  </li>
                );
              })}
            </ul>
            <button className="button button--primary button--full" type="button" onClick={() => handleAction("replay")}>
              <span>Rejouer avec ces joueurs</span><span className="button-arrow" aria-hidden="true">↻</span>
            </button>
          </div>
        </section>
      );
    }
    return null;
  }

  return (
    <>
      <div className="ambient ambient--one" aria-hidden="true" />
      <div className="ambient ambient--two" aria-hidden="true" />
      <header className="site-header">
        <a className="brand" href="../" aria-label="À couvert, accueil">
          <span className="brand-mark" aria-hidden="true">AC</span>
          <span className="brand-copy"><strong>à couvert</strong><span>Le jeu du bluff</span></span>
        </a>
        <div className="header-actions">
          <span className="device-label"><span className="status-dot" />Pass-and-play</span>
          <button
            className="theme-toggle"
            type="button"
            onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}
            aria-label={`Passer au thème ${theme === "dark" ? "clair" : "sombre"}`}
            title={`Passer au thème ${theme === "dark" ? "clair" : "sombre"}`}
          >
            <span aria-hidden="true">{theme === "dark" ? "☼" : "☾"}</span>
            <span className="theme-toggle-label">{theme === "dark" ? "Clair" : "Sombre"}</span>
          </button>
        </div>
      </header>
      <main id="app" className="app-main" aria-live="polite">
        {renderScreen()}
      </main>
      <footer className="site-footer">
        <span>Un seul écran. Aucun secret enregistré.</span>
        <span>À couvert · jeu local</span>
      </footer>
    </>
  );
}

createRoot(document.querySelector("#root")).render(<App />);
