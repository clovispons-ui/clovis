import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  DEFAULT_TIMER_DURATION,
  HOT_MODE,
  TIMER_OPTIONS,
  isAdultMode,
  validateConfiguration,
} from "./config.js";
import { closeDatabase, importSeed, openDatabase } from "./database.js";
import { createRepository } from "./repository.js";
import { CountdownTimer } from "../../common/src/timer.js";
import seedUrl from "../data/seed.json?url";

const INITIAL_STATE = {
  screen: "loading",
  error: null,
  starting: false,
  categories: [],
  mode: "soft",
  dilemma: null,
  roundNumber: 0,
  timerEnabled: false,
  timerDuration: DEFAULT_TIMER_DURATION,
  timerSeconds: null,
  timerExpired: false,
};

const MODE_ICONS = { soft: "◐", hot: "♨" };

function readSavedTheme() {
  try {
    return window.localStorage.getItem("tu-preferes-theme") === "light" ? "light" : "dark";
  } catch (error) {
    console.error("Impossible de lire le thème enregistré.", error);
    return "dark";
  }
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
      theme === "light" ? "#f8f2ea" : "#17121c",
    );
    try {
      window.localStorage.setItem("tu-preferes-theme", theme);
    } catch (error) {
      console.error("Impossible d'enregistrer le thème choisi.", error);
    }
  }, [theme]);

  useEffect(() => {
    let active = true;
    let database;

    async function prepareGame() {
      try {
        const seedResponse = await fetch(seedUrl);
        if (!seedResponse.ok) {
          throw new Error(`Impossible de charger la banque de dilemmes (HTTP ${seedResponse.status}).`);
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
          mode: categories[0]?.id ?? current.mode,
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
    if (game.screen !== "play" || !game.timerEnabled || !game.dilemma) return undefined;

    const timer = new CountdownTimer();
    timer.start(
      game.timerDuration,
      (seconds) => setGame((current) => (
        current.screen === "play" && current.timerSeconds !== seconds
          ? { ...current, timerSeconds: seconds }
          : current
      )),
      () => setGame((current) => (
        current.screen === "play"
          ? { ...current, timerSeconds: 0, timerExpired: true }
          : current
      )),
    );
    return () => timer.stop();
  }, [game.screen, game.dilemma?.id, game.timerEnabled, game.timerDuration]);

  function changeMode(mode) {
    setGame((current) => ({ ...current, error: null, mode }));
  }

  function drawNextDilemma(mode) {
    setGame((current) => ({ ...current, starting: true, error: null }));
    repositoryRef.current.drawDilemma(mode)
      .then((dilemma) => {
        setGame((current) => ({
          ...current,
          starting: false,
          dilemma,
          roundNumber: current.roundNumber + 1,
          timerSeconds: null,
          timerExpired: false,
          screen: "play",
        }));
      })
      .catch((error) => {
        setGame((current) => ({
          ...current,
          starting: false,
          error: error instanceof Error ? error.message : "Impossible de tirer un dilemme.",
        }));
      });
  }

  function startGame(event) {
    event.preventDefault();
    if (game.starting) return;

    const validation = validateConfiguration({
      mode: game.mode,
      timerEnabled: game.timerEnabled,
      timerDuration: game.timerDuration,
    });
    if (!validation.ok) {
      setGame((current) => ({ ...current, error: validation.errors.join(" ") }));
      return;
    }

    setGame((current) => ({
      ...current,
      roundNumber: 0,
      timerEnabled: validation.config.timerEnabled,
      timerDuration: validation.config.timerDuration,
    }));
    drawNextDilemma(validation.config.mode);
  }

  function nextDilemma() {
    if (game.starting) return;
    drawNextDilemma(game.mode);
  }

  function backToModeSelection() {
    setGame((current) => ({
      ...current,
      error: null,
      timerSeconds: null,
      timerExpired: false,
      screen: "config",
    }));
  }

  function renderConfiguration() {
    return (
      <section className="screen screen--config">
        <div className="hero-copy">
          <span className="eyebrow"><span className="eyebrow-line" />Le dilemme commence ici</span>
          <h1>Choisis<br /><span>ton camp.</span></h1>
          <p>Un dilemme, deux options, aucune échappatoire. Lisez à voix haute, choisissez votre côté et défendez-le.</p>
          <div className="hero-points">
            <span><i aria-hidden="true">01</i> Choisissez un mode</span>
            <span><i aria-hidden="true">02</i> Lisez le dilemme au groupe</span>
            <span><i aria-hidden="true">03</i> Défendez votre choix</span>
          </div>
        </div>

        <form className="panel config-panel" onSubmit={startGame}>
          {game.error && <div className="notice notice--error" role="alert">{game.error}</div>}
          {isAdultMode(game.mode) && (
            <div className="notice notice--warning" role="status">
              Contenu réservé aux adultes — 18+. Des dilemmes provocateurs sur la vie intime, les drogues et la délinquance. Assurez-vous que tout le groupe est d'accord pour jouer.
            </div>
          )}

          <SectionHeading number="01" title="Mode de jeu" description="Soft pour tous, Hot pour les groupes adultes qui aiment l'humour noir." />
          <div className="mode-grid">
            {game.categories.map((category) => (
              <label className={`mode-card ${game.mode === category.id ? "is-selected" : ""}`} key={category.id}>
                <input
                  type="radio"
                  name="mode"
                  value={category.id}
                  checked={game.mode === category.id}
                  onChange={() => changeMode(category.id)}
                />
                <span className="mode-icon" aria-hidden="true">{MODE_ICONS[category.id] ?? "◍"}</span>
                <span className="mode-card-copy">
                  <strong>
                    {category.label}
                    {category.adult && <span className="adult-tag" title="Contenu réservé aux adultes">18+</span>}
                  </strong>
                  <span>{category.description}</span>
                </span>
                <span className="mode-radio" aria-hidden="true" />
              </label>
            ))}
          </div>

          <SectionHeading number="02" title="Chrono de débat" description="Un temps de parole optionnel pour chaque dilemme, libre à vous de le respecter." />
          <div className="timer-settings">
            <label className="toggle-card">
              <input
                type="checkbox"
                checked={game.timerEnabled}
                onChange={(event) => setGame((current) => ({
                  ...current,
                  timerEnabled: event.target.checked,
                }))}
              />
              <span className="toggle-visual" aria-hidden="true" />
              <span><strong>Activer le chrono</strong><small>Temps accordé au groupe pour débattre.</small></span>
            </label>
            <label className={`field-block timer-duration ${game.timerEnabled ? "" : "is-disabled"}`}>
              <span className="field-label">Durée de débat</span>
              <select
                className="select-control"
                value={game.timerDuration}
                disabled={!game.timerEnabled}
                onChange={(event) => setGame((current) => ({
                  ...current,
                  timerDuration: Number(event.target.value),
                }))}
              >
                {TIMER_OPTIONS.map((duration) => (
                  <option value={duration} key={duration}>{duration} secondes</option>
                ))}
              </select>
            </label>
          </div>

          <button className="button button--primary button--full start-button" type="submit" disabled={game.starting}>
            <span>{game.starting ? "Tirage…" : "Lancer les dilemmes"}</span>
            <span className="button-arrow" aria-hidden="true">↗</span>
          </button>
          <p className="privacy-note"><span aria-hidden="true">◉</span> Aucune réponse enregistrée : seul l'historique de tirage reste local au navigateur.</p>
        </form>
        <p className="screen-footnote">Répondre « aucun » ou « les deux » est interdit. C'est la règle.</p>
      </section>
    );
  }

  function renderPlay() {
    const dilemma = game.dilemma;
    const categoryLabel = selectedCategoryLabel();
    const isHot = isAdultMode(game.mode);

    return (
      <section className="screen screen--play">
        <RoundTopline eyebrow="À débattre" label={`Dilemme ${game.roundNumber} · ${categoryLabel}`} />
        {game.error && <div className="notice notice--error" role="alert">{game.error}</div>}
        <div className="dilemma-card panel">
          <span className="card-overline">Tu préfères…</span>
          <div className="dilemma-options" role="group" aria-label="Les deux options du dilemme">
            <div className="dilemma-option">
              <span className="option-letter" aria-hidden="true">A</span>
              <p>{dilemma.optionA}</p>
            </div>
            <span className="dilemma-or" aria-hidden="true">ou</span>
            <div className="dilemma-option">
              <span className="option-letter" aria-hidden="true">B</span>
              <p>{dilemma.optionB}</p>
            </div>
          </div>
          <div className="dilemma-badges">
            <span className="theme-badge">{dilemma.theme}</span>
            {isHot && <span className="adult-badge">18+</span>}
          </div>
          {game.timerEnabled && (
            <div className={`timer-display ${game.timerExpired ? "is-expired" : ""}`} role="status">
              <span className="timer-ring" aria-hidden="true">◷</span>
              <span className="timer-seconds">
                {game.timerExpired ? "Temps écoulé" : `${game.timerSeconds ?? game.timerDuration} s`}
              </span>
              <small>{game.timerExpired ? "Continuez le débat ou passez au dilemme suivant." : "Temps de débat restant."}</small>
            </div>
          )}
        </div>
        <div className="play-actions">
          <button className="button button--primary" type="button" onClick={nextDilemma} disabled={game.starting}>
            <span>{game.starting ? "Tirage…" : "Un autre dilemme"}</span>
            <span className="button-arrow" aria-hidden="true">↻</span>
          </button>
          <button className="button button--secondary" type="button" onClick={backToModeSelection}>
            <span>Changer de mode</span>
          </button>
        </div>
        <p className="screen-footnote">Interdiction de répondre « aucun » ou « les deux » : choisissez votre camp et défendez-le.</p>
      </section>
    );
  }

  function selectedCategoryLabel() {
    return game.categories.find((category) => category.id === game.mode)?.label ?? game.mode;
  }

  function renderScreen() {
    if (game.screen === "loading") {
      return <div className="loading-card" role="status">Préparation des dilemmes…</div>;
    }
    if (game.screen === "error") {
      return (
        <section className="error-card panel" role="alert">
          <span className="card-overline">OUPS</span>
          <h1>Le jeu n'a pas pu démarrer.</h1>
          <p>{game.error}</p>
          <button className="button button--secondary" type="button" onClick={() => window.location.reload()}>Recharger l'application</button>
        </section>
      );
    }
    if (game.screen === "config") return renderConfiguration();
    if (game.screen === "play") return renderPlay();
    return null;
  }

  return (
    <>
      <div className="ambient ambient--one" aria-hidden="true" />
      <div className="ambient ambient--two" aria-hidden="true" />
      <header className="site-header">
        <a className="brand" href="../" aria-label="Tu préfères, accueil">
          <span className="brand-mark" aria-hidden="true">TP</span>
          <span className="brand-copy"><strong>tu préfères</strong><span>Des dilemmes à débattre</span></span>
        </a>
        <div className="header-actions">
          <span className="device-label"><span className="status-dot" />Un seul appareil</span>
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
        <span>Un seul écran. Aucune réponse enregistrée.</span>
        <span>Tu préfères · jeu local</span>
      </footer>
    </>
  );
}

createRoot(document.querySelector("#root")).render(<App />);