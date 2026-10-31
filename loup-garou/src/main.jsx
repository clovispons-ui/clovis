import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  ROLE_DETAILS,
  ROLE_ORDER,
  ROLES,
  suggestedRoles,
  validateConfiguration,
} from "./config.js";
import {
  applyHunterShot,
  beginDayVote,
  beginNextNight,
  createGame,
  eliminateByVillage,
  finishRoleDistribution,
  finishDayWithoutElimination,
  getCurrentNightStep,
  getPrivateNightResult,
  performNightAction,
  skipHunterShot,
  startNight,
} from "./game.js";

const INITIAL_NAMES = ["Joueur 1", "Joueur 2", "Joueur 3", "Joueur 4"];
const initialRoles = suggestedRoles(INITIAL_NAMES.length);
const NIGHT_SLEEP_SECONDS = 10;

function getInitialDraft() {
  return {
    names: [...INITIAL_NAMES],
    roles: initialRoles,
    narrator: "screen",
    showScript: true,
  };
}

function SectionTitle({ number, title, description }) {
  return (
    <div className="section-title">
      <span>{number}</span>
      <div><h2>{title}</h2><p>{description}</p></div>
    </div>
  );
}

function PlayerChoice({ player, selected, disabled, onClick, detail }) {
  return (
    <button
      className={`player-choice${selected ? " is-selected" : ""}`}
      type="button"
      disabled={disabled}
      onClick={onClick}
    >
      <span className="player-avatar" aria-hidden="true">{player.name.slice(0, 1).toLocaleUpperCase("fr")}</span>
      <span className="player-choice-copy"><strong>{player.name}</strong>{detail && <small>{detail}</small>}</span>
      {selected && <span className="selected-mark" aria-hidden="true">✓</span>}
    </button>
  );
}

function App() {
  const [draft, setDraft] = useState(getInitialDraft);
  const [game, setGame] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [nightActionHidden, setNightActionHidden] = useState(false);
  const [privateResult, setPrivateResult] = useState(null);
  const [nightTransition, setNightTransition] = useState(null);
  const [reviewMode, setReviewMode] = useState("");
  const [reviewPlayerId, setReviewPlayerId] = useState(null);
  const [reviewRevealed, setReviewRevealed] = useState(false);
  const speechKeyRef = useRef("");

  const activePlayers = useMemo(() => game?.players.filter((player) => player.alive) ?? [], [game]);
  const currentStep = game ? getCurrentNightStep(game) : null;
  const nightTransitionKey = nightTransition?.key;
  const nightTransitionWakeAt = nightTransition?.wakeAt;

  useEffect(() => {
    if (!nightTransitionKey || nightTransitionWakeAt === null || nightTransitionWakeAt === undefined) return undefined;
    const updateCountdown = () => {
      const secondsLeft = Math.max(0, Math.ceil((nightTransitionWakeAt - Date.now()) / 1000));
      setNightTransition((current) => current?.key === nightTransitionKey
        ? secondsLeft === 0 ? null : { ...current, secondsLeft }
        : current);
    };
    updateCountdown();
    const intervalId = window.setInterval(updateCountdown, 200);
    return () => window.clearInterval(intervalId);
  }, [nightTransitionKey, nightTransitionWakeAt]);

  const speechText = useMemo(() => {
    if (!game || privateResult || nightActionHidden || game.config.narrator !== "screen") return "";
    if (nightTransition) return nightTransition.message;
    if (game.phase === "night" && currentStep) {
      if (currentStep.role === "lover") return "Les amoureux, réveillez-vous et découvrez-vous en silence.";
      return currentStep.role === ROLES.WEREWOLF
        ? "Les Loups-Garous se réveillent et choisissent ensemble une victime."
        : currentStep.role === ROLES.SEER
          ? "La Voyante se réveille et choisit une personne à sonder."
          : currentStep.role === ROLES.WITCH
            ? "La Sorcière se réveille. Voici la victime des Loups-Garous."
              : "Cupidon se réveille et choisit deux amoureux.";
    }
    if (game.phase === "dayVote") return "Le jour se lève. Discutez et votez en groupe.";
    if (game.phase === "dayEnd") return "Le village a terminé le vote. La nuit suivante approche.";
    if (game.phase === "dawn") return "Le jour se lève. Les joueurs éliminés sont annoncés au village.";
    if (game.phase === "hunterShot") return "Le Chasseur peut choisir une personne à emporter dans sa riposte.";
    return "";
  }, [game, currentStep, nightActionHidden, nightTransition, privateResult]);

  function repeatNarration() {
    if (!speechText || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance !== "function") return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(speechText);
    utterance.lang = "fr-FR";
    const frenchVoice = window.speechSynthesis.getVoices().find((voice) => voice.lang.toLocaleLowerCase("fr").startsWith("fr"));
    if (frenchVoice) utterance.voice = frenchVoice;
    window.speechSynthesis.speak(utterance);
  }

  useEffect(() => {
    if (!speechText || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance !== "function" || !document.hasFocus()) return;
    const key = `${game?.phase}:${game?.day}:${nightTransition ? `sleep:${nightTransition.key}` : currentStep?.key ?? ""}`;
    if (speechKeyRef.current === key) return;
    speechKeyRef.current = key;
    repeatNarration();
  }, [speechText, game, currentStep, nightTransition]);

  useEffect(() => {
    function hidePrivateContent() {
      setRevealed(false);
      setReviewRevealed(false);
      setPrivateResult(null);
      setReviewMode("");
      setReviewPlayerId(null);
      setNightActionHidden(true);
      clearNightInputs();
      speechKeyRef.current = "";
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    }
    function onVisibilityChange() {
      if (document.hidden) hidePrivateContent();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", hidePrivateContent);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", hidePrivateContent);
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  function changePlayerCount(count) {
    setDraft((current) => {
      const names = [...current.names];
      while (names.length < count) names.push(`Joueur ${names.length + 1}`);
      const roles = suggestedRoles(count);
      return { ...current, names: names.slice(0, count), roles };
    });
    setError("");
  }

  function updateRole(role, value) {
    setDraft((current) => {
      const roles = { ...current.roles, [role]: Math.max(0, Math.min(role === ROLES.WEREWOLF || role === ROLES.VILLAGER ? MAX_PLAYERS : 1, Number(value) || 0)) };
      if (role !== ROLES.VILLAGER) {
        roles[ROLES.VILLAGER] = Math.max(0, current.names.length - ROLE_ORDER.reduce((sum, item) => sum + roles[item], 0));
      }
      return { ...current, roles };
    });
    setError("");
  }

  function startGame(event) {
    event.preventDefault();
    const validation = validateConfiguration(draft);
    if (!validation.ok) {
      setError(validation.errors.join(" "));
      return;
    }
    setBusy(true);
    try {
      setGame(createGame(validation.config));
      setRevealed(false);
      setNightActionHidden(false);
      setPrivateResult(null);
      setNightTransition(null);
      setReviewMode("");
      clearNightInputs();
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Impossible de préparer la partie.");
    } finally {
      setBusy(false);
    }
  }

  function updateGame(action) {
    setGame((current) => {
      const next = structuredClone(current);
      action(next);
      return next;
    });
    setError("");
  }

  function continueAfterPrivateResult() {
    setPrivateResult(null);
    setNightTransition((current) => current
      ? {
        ...current,
        wakeAt: game.config.narrator === "screen" ? Date.now() + NIGHT_SLEEP_SECONDS * 1000 : null,
        secondsLeft: game.config.narrator === "screen" ? NIGHT_SLEEP_SECONDS : null,
      }
      : current);
  }

  function completeNightAction(action) {
    if (!game || !currentStep) return;
    try {
      const next = structuredClone(game);
      const completedStep = currentStep;
      const actorId = currentStep.actorId;
      performNightAction(next, action);
      const result = actorId ? getPrivateNightResult(next, actorId) : null;
      setGame(next);
      setNightActionHidden(false);
      clearNightInputs();
      const sleepers = {
        cupid: "Cupidon se rendort.",
        lover: "Les amoureux se rendorment.",
        wolves: "Les Loups-Garous se rendorment.",
        seer: "La Voyante se rendort.",
        witch: "La Sorcière se rendort.",
      };
      setNightTransition({
        key: completedStep.key,
        message: sleepers[completedStep.key] ?? "Le rôle qui vient d'agir se rendort.",
        wakeAt: result || game.config.narrator === "human" ? null : Date.now() + NIGHT_SLEEP_SECONDS * 1000,
        secondsLeft: result || game.config.narrator === "human" ? null : NIGHT_SLEEP_SECONDS,
      });
      if (result) setPrivateResult({ playerId: actorId, result });
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Impossible d'enregistrer l'action.");
    }
  }

  function revealRoleNext() {
    setRevealed(false);
    if (game.dealIndex + 1 < game.players.length) {
      updateGame((next) => { next.dealIndex += 1; });
      return;
    }
    updateGame((next) => finishRoleDistribution(next));
  }

  function displayRoleCard(player) {
    const details = ROLE_DETAILS[player.role];
    return (
      <div className={`role-card role-card--${details.team}`}>
        <div className="role-card-heading">
          <span className="role-card-illustration" aria-hidden="true">{details.icon}</span>
          <div><span className="card-overline">TON RÔLE SECRET</span><h2>{details.name}</h2></div>
        </div>
        <p>{details.description}</p>
        {player.loverId && game.players.find((item) => item.id === player.loverId) && (
          <p className="lover-note">Ton cœur est lié à {game.players.find((item) => item.id === player.loverId).name}.</p>
        )}
      </div>
    );
  }

  function submitVote(targetId) {
    try {
      updateGame((next) => eliminateByVillage(next, targetId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Impossible d'enregistrer l'élimination.");
    }
  }

  function submitHunterShot(targetId) {
    try {
      updateGame((next) => applyHunterShot(next, targetId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Impossible d'effectuer la riposte.");
    }
  }

  function beginReview() {
    setReviewMode("select");
    setReviewPlayerId(null);
  }

  function startNightWithPause(startNextNight = false) {
    const nextDay = startNextNight ? game.day + 1 : game.day;
    updateGame((next) => startNextNight ? beginNextNight(next) : startNight(next));
    setNightActionHidden(false);
    setNightTransition({
      key: `start:${nextDay}`,
      message: "Tout le monde s'endort.",
      wakeAt: game.config.narrator === "screen" ? Date.now() + NIGHT_SLEEP_SECONDS * 1000 : null,
      secondsLeft: game.config.narrator === "screen" ? NIGHT_SLEEP_SECONDS : null,
    });
  }

  function finishReview() {
    setReviewMode("");
    setReviewPlayerId(null);
    setReviewRevealed(false);
  }

  function renderHeader() {
    return (
      <header className="game-header">
        <a className="brand-link" href="../" aria-label="Retour aux mini-jeux">
          <span className="brand-mark">LG</span>
          <span><strong>clovis</strong><small>Mini-jeux locaux</small></span>
        </a>
        <span className="device-pill"><i /> Un seul appareil</span>
      </header>
    );
  }

  function renderConfiguration() {
    const totalRoles = Object.values(draft.roles).reduce((sum, amount) => sum + amount, 0);
    const remaining = draft.names.length - totalRoles;
    const specialRoleCount = ROLE_ORDER.reduce((sum, role) => sum + draft.roles[role], 0);
    const maxWolves = Math.floor((draft.names.length - 1) / 2);
    return (
      <section className="screen setup-screen">
        <div className="setup-intro">
          <span className="eyebrow">Le village s'endort</span>
          <h1>Le Loup-Garou</h1>
          <p>Distribuez les rôles en secret, survivez à la nuit et trouvez les Loups avant qu'ils ne prennent le dessus.</p>
          <div className="feature-list">
            <span>01 · Chacun découvre sa carte et son pouvoir</span>
            <span>02 · Les rôles agissent sur le même téléphone</span>
            <span>03 · Débattez, votez et découvrez le dénouement</span>
          </div>
        </div>
        <form className="setup-panel panel" onSubmit={startGame}>
          {error && <div className="notice notice--error" role="alert">{error}</div>}
          <SectionTitle number="01" title="Les joueurs" description="Le narrateur extérieur ne compte pas parmi les joueurs." />
          <div className="count-control">
            <div><strong>Nombre de joueurs</strong><small>De {MIN_PLAYERS} à {MAX_PLAYERS} joueurs, narrateur exclu.</small></div>
            <div className="stepper">
              <button type="button" aria-label="Retirer un joueur" disabled={draft.names.length <= MIN_PLAYERS} onClick={() => changePlayerCount(draft.names.length - 1)}>−</button>
              <output>{draft.names.length}</output>
              <button type="button" aria-label="Ajouter un joueur" disabled={draft.names.length >= MAX_PLAYERS} onClick={() => changePlayerCount(draft.names.length + 1)}>+</button>
            </div>
          </div>
          <div className="names-grid">
            {draft.names.map((name, index) => (
              <label key={index}>
                <span>Joueur {index + 1}</span>
                <input
                  type="text"
                  maxLength="24"
                  value={name}
                  onChange={(event) => {
                    const names = [...draft.names];
                    names[index] = event.target.value;
                    setDraft((current) => ({ ...current, names }));
                    setError("");
                  }}
                />
              </label>
            ))}
          </div>
          {draft.names.length < 6 && <p className="setup-hint">À partir de 6 joueurs, les compositions offrent plus de possibilités.</p>}

          <SectionTitle number="02" title="Les rôles" description="La suggestion se met à jour avec le nombre de joueurs. Ajuste les cartes à ta convenance." />
          <div className="role-setup-list">
            <div className="role-setup-row role-setup-row--readonly">
              <div><strong>Villageois</strong><small>Les cartes restantes, après les rôles choisis.</small></div>
              <output>{Math.max(0, remaining + draft.roles[ROLES.VILLAGER])}</output>
            </div>
            {ROLE_ORDER.map((role) => (
              <div className="role-setup-row" key={role}>
                <div><strong>{ROLE_DETAILS[role].name}</strong><small>{role === ROLES.WEREWOLF ? "Minimum 1. Les Loups choisissent une victime chaque nuit." : ROLE_DETAILS[role].description}</small></div>
                <div className="stepper stepper--small">
                  <button type="button" aria-label={`Retirer une carte ${ROLE_DETAILS[role].name}`} disabled={draft.roles[role] === 0 || (role === ROLES.WEREWOLF && draft.roles[role] <= 1)} onClick={() => updateRole(role, draft.roles[role] - 1)}>−</button>
                  <output>{draft.roles[role]}</output>
                  <button type="button" aria-label={`Ajouter une carte ${ROLE_DETAILS[role].name}`} disabled={draft.roles[role] >= (role === ROLES.WEREWOLF ? maxWolves : 1) || specialRoleCount >= draft.names.length - 1} onClick={() => updateRole(role, draft.roles[role] + 1)}>+</button>
                </div>
              </div>
            ))}
            <p className={`composition-total${remaining < 0 ? " is-invalid" : ""}`}>Cartes sélectionnées : {totalRoles} / {draft.names.length}</p>
          </div>

          <SectionTitle number="03" title="La narration" description="Les consignes restent affichées dans les deux modes." />
          <div className="narration-options">
            <label className={`narration-choice${draft.narrator === "screen" ? " is-selected" : ""}`}>
              <input type="radio" name="narrator" checked={draft.narrator === "screen"} onChange={() => setDraft((current) => ({ ...current, narrator: "screen" }))} />
              <span><strong>L'écran raconte</strong><small>Lit les consignes à voix haute, en plus de les afficher.</small></span>
            </label>
            <label className={`narration-choice${draft.narrator === "human" ? " is-selected" : ""}`}>
              <input type="radio" name="narrator" checked={draft.narrator === "human"} onChange={() => setDraft((current) => ({ ...current, narrator: "human" }))} />
              <span><strong>Un narrateur humain</strong><small>Un maître du jeu extérieur guide les rôles.</small></span>
            </label>
          </div>
          {draft.narrator === "human" && (
            <label className="script-toggle">
              <input type="checkbox" checked={draft.showScript} onChange={(event) => setDraft((current) => ({ ...current, showScript: event.target.checked }))} />
              <span><strong>Afficher le script au narrateur</strong><small>Il avance les étapes et consulte un récapitulatif détaillé à la fin de chaque nuit.</small></span>
            </label>
          )}
          <button className="button button--primary button--full" type="submit" disabled={busy || remaining !== 0}>
            {busy ? "Préparation…" : "Distribuer les rôles"} <span aria-hidden="true">↗</span>
          </button>
          <p className="privacy-note">Les rôles ne sont pas enregistrés et ne s'affichent qu'en privé.</p>
        </form>
      </section>
    );
  }

  function renderDeal() {
    const player = game.players[game.dealIndex];
    return (
      <section className="screen play-screen">
        <p className="eyebrow">Distribution secrète <span>·</span> Joueur {game.dealIndex + 1} / {game.players.length}</p>
        <div className="progress-track">{game.players.map((item, index) => <i className={index < game.dealIndex ? "is-done" : index === game.dealIndex ? "is-current" : ""} key={item.id} />)}</div>
        <div className="play-card panel">
          {revealed ? (
            <>
              <span className="card-overline">C'EST À TON TOUR</span>
              <h1>{player.name}</h1>
              {displayRoleCard(player)}
              <p className="keep-secret">Lis bien ton rôle et son pouvoir, puis passe l'appareil en masquant l'écran.</p>
              <button className="button button--primary button--full" type="button" onClick={revealRoleNext}>
                {game.dealIndex + 1 === game.players.length ? "Masquer et commencer la nuit" : "Masquer et passer au suivant"} <span aria-hidden="true">→</span>
              </button>
            </>
          ) : (
            <>
              <span className="reveal-emblem" aria-hidden="true">✦</span>
              <span className="card-overline">PROCHAINE RÉVÉLATION</span>
              <h1>Passe l'écran à<br /><span>{player.name}</span></h1>
              <p>Vérifie que personne d'autre ne regarde avant d'afficher ta carte.</p>
              <button className="button button--primary button--full" type="button" onClick={() => setRevealed(true)}>Découvrir ma carte <span aria-hidden="true">↗</span></button>
            </>
          )}
        </div>
      </section>
    );
  }

  function renderReady() {
    return (
      <section className="screen play-screen">
        <p className="eyebrow">Distribution terminée <span>·</span> Tout le monde a vu son rôle</p>
        <div className="play-card panel">
          <span className="reveal-emblem" aria-hidden="true">☾</span>
          <span className="card-overline">LA NUIT APPROCHE</span>
          <h1>Tout le monde est prêt ?</h1>
          <p>Chacun peut revoir sa carte en privé avant que tous les joueurs ferment les yeux.</p>
          <button className="button button--secondary button--full review-button" type="button" onClick={beginReview}>
            Revoir mon rôle (chacun son tour)
          </button>
          <button className="button button--primary button--full" type="button" onClick={() => startNightWithPause()}>
            Tout le monde s'endort · Commencer la nuit <span aria-hidden="true">→</span>
          </button>
        </div>
      </section>
    );
  }

  function getStepCopy(step) {
    if (step.role === "lover") {
      return "Les amoureux se réveillent et découvrent leur lien en silence.";
    }
    if (step.role === ROLES.WEREWOLF) return "Les Loups-Garous se réveillent et choisissent ensemble une victime.";
    if (step.role === ROLES.SEER) return "La Voyante se réveille et choisit une personne à sonder.";
    if (step.role === ROLES.WITCH) return "La Sorcière se réveille pour décider si elle utilise ses potions.";
    return "Cupidon se réveille et choisit deux personnes à lier.";
  }

  function renderNightAction() {
    const step = currentStep;
    if (!step) return null;
    const actor = step.actorId ? game.players.find((player) => player.id === step.actorId) : null;
    const targetPlayers = activePlayers.filter((player) => {
      if (step.role === ROLES.WEREWOLF) return player.role !== ROLES.WEREWOLF;
      if (step.role === ROLES.SEER) return player.id !== actor?.id;
      return true;
    });

    if (nightActionHidden) {
      return (
        <section className="screen play-screen">
          <p className="eyebrow">Nuit {game.day} <span>·</span> Action masquée</p>
          <div className="play-card panel">
            <span className="card-overline">ÉCRAN PROTÉGÉ</span>
            <h1>{step.role === "lover" ? "Les amoureux" : ROLE_DETAILS[step.role]?.name}</h1>
            <p>L'action a été masquée. Vérifie que seul le rôle concerné regarde avant de la reprendre.</p>
            <button className="button button--primary button--full" type="button" onClick={() => setNightActionHidden(false)}>
              Reprendre l'action <span aria-hidden="true">→</span>
            </button>
          </div>
        </section>
      );
    }

    return (
      <section className="screen play-screen">
        <p className="eyebrow">Nuit {game.day} <span>·</span> {getStepCopy(step)}</p>
        <div className="play-card panel">
          <span className="card-overline">RÉVEIL SECRET · LES AUTRES FERMENT LES YEUX</span>
          <h1>{step.role === "lover" ? "Les amoureux" : ROLE_DETAILS[step.role]?.name}</h1>
          {game.config.narrator === "screen" && <button className="button button--secondary button--full" type="button" onClick={repeatNarration}>Répéter la consigne à voix haute</button>}
          {error && <div className="notice notice--error" role="alert">{error}</div>}
          {step.role === "cupid" && (
            <>
              <p>Choisis deux personnes encore en vie. Elles découvriront leur lien secrètement.</p>
              <div className="choices-list">
                {activePlayers.map((player) => (
                  <PlayerChoice key={player.id} player={player} selected={nightTargets.includes(player.id)} disabled={!nightTargets.includes(player.id) && nightTargets.length >= 2} onClick={() => toggleNightTarget(player.id)} />
                ))}
              </div>
              <button className="button button--primary button--full" type="button" disabled={nightTargets.length !== 2} onClick={() => completeNightAction({ targetIds: nightTargets })}>Confirmer les amoureux</button>
            </>
          )}
          {step.role === "lover" && (
            <>
              <p>Vous êtes amoureux. Si l'un de vous est éliminé, l'autre le sera aussi.</p>
              <button className="button button--primary button--full" type="button" onClick={() => completeNightAction({})}>Nous avons compris — continuer</button>
            </>
          )}
          {step.role === ROLES.WEREWOLF && (
            <>
              <p>Choisissez ensemble une personne à éliminer cette nuit.</p>
              <div className="choices-list">{targetPlayers.map((player) => <PlayerChoice key={player.id} player={player} selected={nightTarget === player.id} onClick={() => setNightTarget(player.id)} />)}</div>
              <button className="button button--primary button--full" type="button" disabled={!nightTarget} onClick={() => completeNightAction({ targetId: nightTarget })}>Confirmer la victime</button>
            </>
          )}
          {step.role === ROLES.SEER && (
            <>
              <p>Choisis une personne pour découvrir son rôle, sans le révéler aux autres.</p>
              <div className="choices-list">{targetPlayers.map((player) => <PlayerChoice key={player.id} player={player} selected={nightTarget === player.id} onClick={() => setNightTarget(player.id)} />)}</div>
              <button className="button button--primary button--full" type="button" disabled={!nightTarget} onClick={() => completeNightAction({ targetId: nightTarget })}>Découvrir son rôle</button>
            </>
          )}
          {step.role === ROLES.WITCH && renderWitchForm()}
        </div>
      </section>
    );
  }

  const [nightTarget, setNightTarget] = useState("");
  const [nightTargets, setNightTargets] = useState([]);
  const [witchSave, setWitchSave] = useState(false);
  const [witchKill, setWitchKill] = useState(false);
  const [witchTarget, setWitchTarget] = useState("");

  function toggleNightTarget(playerId) {
    setNightTargets((current) => current.includes(playerId)
      ? current.filter((id) => id !== playerId)
      : current.length < 2 ? [...current, playerId] : current);
  }

  function clearNightInputs() {
    setNightTarget("");
    setNightTargets([]);
    setWitchSave(false);
    setWitchKill(false);
    setWitchTarget("");
  }

  function confirmNightAction(action) {
    completeNightAction(action);
    clearNightInputs();
  }

  function renderWitchForm() {
    const victim = game.players.find((player) => player.id === game.nightActions?.wolfTargetId);
    const saveAvailable = !game.usedPotions.save && Boolean(victim);
    const killAvailable = !game.usedPotions.kill;
    return (
      <>
        <p>Les Loups ont choisi {victim?.name ?? "une victime"}. Tu peux utiliser chacune de tes potions au plus une fois.</p>
        <label className={`potion-option${witchSave ? " is-selected" : ""}`}>
          <input type="checkbox" checked={witchSave} disabled={!saveAvailable} onChange={(event) => setWitchSave(event.target.checked)} />
          <span><strong>Potion de vie</strong><small>{game.usedPotions.save ? "Déjà utilisée" : `Sauver ${victim?.name ?? "la victime"}`}</small></span>
        </label>
        <label className={`potion-option${witchKill ? " is-selected" : ""}`}>
          <input type="checkbox" checked={witchKill} disabled={!killAvailable} onChange={(event) => setWitchKill(event.target.checked)} />
          <span><strong>Potion de mort</strong><small>{game.usedPotions.kill ? "Déjà utilisée" : "Éliminer une personne encore en vie"}</small></span>
        </label>
        {witchKill && (
          <div className="choices-list">
            {activePlayers.filter((player) => player.id !== getCurrentNightStep(game)?.actorId).map((player) => (
              <PlayerChoice key={player.id} player={player} selected={witchTarget === player.id} onClick={() => setWitchTarget(player.id)} />
            ))}
          </div>
        )}
        <button className="button button--primary button--full" type="button" disabled={witchKill && !witchTarget} onClick={() => confirmNightAction({ save: witchSave, kill: witchKill, killTargetId: witchTarget })}>
          Valider les potions
        </button>
      </>
    );
  }

  function renderPrivateResult() {
    if (!privateResult) return null;
    const player = game.players.find((item) => item.id === privateResult.playerId);
    const result = privateResult.result;
    return (
      <section className="screen play-screen">
        <p className="eyebrow">{player?.name} <span>·</span> Information privée</p>
        <div className="play-card panel private-result">
          {result.kind === "seer" && (
            <div className="night-reveal night-reveal--seer" aria-live="polite">
              <span className="card-overline">LE RÔLE DE {result.targetName.toLocaleUpperCase("fr")}</span>
              <strong className="night-reveal-value">{result.roleName}</strong>
            </div>
          )}
          {result.kind === "lover" && (
            <div className="night-reveal" aria-live="polite">
              <span className="card-overline">TON AMOUREUX / TON AMOUREUSE</span>
              <strong className="night-reveal-value">{result.name}</strong>
            </div>
          )}
          <button className="button button--primary button--full" type="button" onClick={continueAfterPrivateResult}>Masquer et continuer</button>
        </div>
      </section>
    );
  }

  function renderNightRecap() {
    const deaths = (game.nightEliminatedIds ?? []).map((id) => game.players.find((player) => player.id === id)).filter(Boolean);
    return (
      <div className="night-recap">
        <span className="card-overline">{game.config.narrator === "human" ? "RÉCAPITULATIF POUR LE NARRATEUR" : "LE JOUR SE LÈVE"}</span>
        {deaths.length ? (
          <>
            <h2>Éliminés cette nuit</h2>
            <div className="night-deaths">{deaths.map((player) => (
              <span key={player.id}><strong>{player.name}</strong><small>{ROLE_DETAILS[player.role].name}</small></span>
            ))}</div>
          </>
        ) : <h2>Personne n'a été éliminé cette nuit.</h2>}
      </div>
    );
  }

  function renderNightTransition() {
    return (
      <section className="screen play-screen">
        <p className="eyebrow">Nuit {game.day} <span>·</span> Silence</p>
        <div className="play-card panel">
          <span className="card-overline">LES YEUX FERMÉS</span>
          <h1>{nightTransition.message}</h1>
          {nightTransition.wakeAt === null ? (
            <>
              <p>Narrateur, vérifie que tout le monde dort avant d'annoncer la prochaine étape.</p>
              <button className="button button--primary button--full" type="button" onClick={() => setNightTransition(null)}>
                {currentStep ? "Continuer le script" : "Annoncer le jour"} <span aria-hidden="true">→</span>
              </button>
            </>
          ) : (
            <>
              <p>Gardez le silence et laissez tout le monde s'endormir avant le prochain réveil.</p>
              <div className="night-countdown" role="timer" aria-label={`Prochain réveil dans ${nightTransition.secondsLeft} secondes`}>
                {nightTransition.secondsLeft}
                <span>secondes avant le prochain réveil</span>
              </div>
            </>
          )}
        </div>
      </section>
    );
  }

  function renderDawn() {
    return (
      <section className="screen play-screen">
        <p className="eyebrow">Nuit {game.day} <span>·</span> Le jour se lève</p>
        <div className="play-card panel">
          {renderNightRecap()}
          {game.config.narrator === "human" && game.config.showScript && (
            <div className="narrator-recap">
              <span className="card-overline">NOTES PRIVÉES DU NARRATEUR</span>
              <ul>{(game.nightReport ?? []).map((line, index) => <li key={index}>{line}</li>)}</ul>
            </div>
          )}
          <p>Le narrateur annonce le résultat de la nuit. Les actions et les rôles restent secrets.</p>
          <button className="button button--primary button--full" type="button" onClick={() => updateGame((next) => beginDayVote(next))}>
            Annoncer le jour et ouvrir le vote <span aria-hidden="true">→</span>
          </button>
        </div>
      </section>
    );
  }

  function renderDayVote() {
    const candidates = game.players.filter((player) => player.alive);
    return (
      <section className="screen play-screen">
        <p className="eyebrow">Jour {game.day} <span>·</span> Le village débat</p>
        <div className="play-card panel">
          {game.notice && <div className="notice">{game.notice}</div>}
          {error && <div className="notice notice--error" role="alert">{error}</div>}
          <span className="card-overline">VOTE EN GROUPE, HORS ÉCRAN</span>
          <h1>Qui le village a-t-il choisi ?</h1>
          <p>Discutez et votez ensemble à voix haute. Une fois la décision prise, touchez ici la personne éliminée.</p>
          <div className="choices-list">{candidates.map((player) => <PlayerChoice key={player.id} player={player} onClick={() => submitVote(player.id)} />)}</div>
          <p className="vote-progress">En cas d'égalité sans décision, le village peut terminer la journée sans élimination.</p>
          <button className="button button--secondary button--full" type="button" onClick={() => updateGame((next) => finishDayWithoutElimination(next))}>Personne n'est éliminé</button>
          <button className="button button--secondary button--full review-button" type="button" onClick={beginReview}>Revoir ma carte (chacun son tour)</button>
        </div>
      </section>
    );
  }

  function renderHunterShot() {
    const hunter = game.players.find((player) => player.id === game.pendingHunterId);
    return (
      <section className="screen play-screen">
        <p className="eyebrow">Riposte du Chasseur</p>
        <div className="play-card panel">
          <span className="card-overline">DERNIÈRE ACTION</span>
          <h1>{hunter?.name}, choisis une personne à emporter.</h1>
          <p>Passe le téléphone au Chasseur. Son tir peut entraîner la mort de la personne liée à sa cible.</p>
          <div className="choices-list">{activePlayers.filter((player) => player.id !== hunter?.id).map((player) => <PlayerChoice key={player.id} player={player} onClick={() => submitHunterShot(player.id)} />)}</div>
          <button className="button button--secondary button--full" type="button" onClick={() => updateGame((next) => skipHunterShot(next))}>Ne pas utiliser mon tir</button>
        </div>
      </section>
    );
  }

  function renderDayEnd() {
    const eliminated = (game.dayEliminatedIds ?? []).map((id) => game.players.find((player) => player.id === id)).filter(Boolean);
    return (
      <section className="screen play-screen">
        <p className="eyebrow">Jour {game.day} <span>·</span> Tour terminé</p>
        <div className="play-card panel">
          <span className="card-overline">LE VILLAGE A VOTÉ</span>
          {eliminated.length ? (
            <>
              <h1>{eliminated.length > 1 ? "Les joueurs éliminés" : "Le joueur éliminé"}</h1>
              <div className="night-deaths">{eliminated.map((player) => (
                <span key={player.id}><strong>{player.name}</strong><small>{ROLE_DETAILS[player.role].name}</small></span>
              ))}</div>
            </>
          ) : <h1>Personne n'a été éliminé.</h1>}
          {game.notice && <p>{game.notice}</p>}
          <div className="living-list"><strong>Encore en vie</strong>{activePlayers.map((player) => <span key={player.id}>{player.name}</span>)}</div>
          <button className="button button--secondary button--full review-button" type="button" onClick={beginReview}>Revoir ma carte (chacun son tour)</button>
          <button className="button button--primary button--full" type="button" onClick={() => startNightWithPause(true)}>Passer à la nuit {game.day + 1} <span aria-hidden="true">→</span></button>
        </div>
      </section>
    );
  }

  function renderReview() {
    if (reviewMode === "select") {
      return (
        <section className="screen play-screen">
          <p className="eyebrow">Rappel privé des rôles</p>
          <div className="play-card panel">
            <span className="card-overline">CHOISIS TON PSEUDO</span>
            <h1>Qui veut revoir sa carte ?</h1>
            <p>Seul le joueur choisi doit regarder l'écran avant de révéler sa carte.</p>
            <div className="choices-list">{game.players.map((player) => <PlayerChoice key={player.id} player={player} onClick={() => { setReviewPlayerId(player.id); setReviewMode("card"); }} />)}</div>
            <button className="button button--secondary button--full" type="button" onClick={finishReview}>Retour à la partie</button>
          </div>
        </section>
      );
    }
    const player = game.players.find((item) => item.id === reviewPlayerId);
    return (
      <section className="screen play-screen">
        <p className="eyebrow">Rappel privé · {player?.name}</p>
        <div className="play-card panel">
          {reviewRevealed ? (
            <>
              <span className="card-overline">{player?.name}</span>
              {player && displayRoleCard(player)}
              <button className="button button--primary button--full" type="button" onClick={() => { setReviewRevealed(false); finishReview(); }}>Masquer et retourner à la partie</button>
            </>
          ) : (
            <>
              <span className="card-overline">RÉVÉLATION PRIVÉE</span>
              <h1>Passe le téléphone à {player?.name}</h1>
              <button className="button button--primary button--full" type="button" onClick={() => setReviewRevealed(true)}>Révéler ma carte</button>
              <button className="button button--secondary button--full" type="button" onClick={finishReview}>Annuler</button>
            </>
          )}
        </div>
      </section>
    );
  }

  function renderEnd() {
    const winnerLabel = game.winner === "wolves" ? "Les Loups-Garous gagnent" : game.winner === "lovers" ? "Les amoureux gagnent" : "Le village gagne";
    return (
      <section className="screen play-screen">
        <p className="eyebrow">Fin de la partie</p>
        <div className="play-card panel end-card">
          <span className="card-overline">LE DÉNOUEMENT</span>
          <h1>{winnerLabel}</h1>
          <p>{game.endReason}</p>
          <div className="role-reveal-list">
            {game.players.map((player) => (
              <div className="role-reveal-row" key={player.id}>
                <span className={player.alive ? "alive-dot" : "dead-dot"} />
                <strong>{player.name}</strong>
                <span>{ROLE_DETAILS[player.role].name}</span>
                {!player.alive && <small>Éliminé</small>}
              </div>
            ))}
          </div>
          <button className="button button--primary button--full" type="button" onClick={() => { setGame(null); setDraft(getInitialDraft()); setError(""); }}>Nouvelle partie</button>
        </div>
      </section>
    );
  }

  if (!game) {
    return <><div className="ambient ambient--one" /><div className="ambient ambient--two" />{renderHeader()}<main className="app-main">{renderConfiguration()}</main></>;
  }

  let content;
  if (reviewMode) content = renderReview();
  else if (privateResult) content = renderPrivateResult();
  else if (nightTransition) content = renderNightTransition();
  else if (game.phase === "deal") content = renderDeal();
  else if (game.phase === "ready") content = renderReady();
  else if (game.phase === "night") content = renderNightAction();
  else if (game.phase === "dayVote") content = renderDayVote();
  else if (game.phase === "dawn") content = renderDawn();
  else if (game.phase === "hunterShot") content = renderHunterShot();
  else if (game.phase === "dayEnd") content = renderDayEnd();
  else content = renderEnd();

  return (
    <>
      <div className="ambient ambient--one" /><div className="ambient ambient--two" />
      {renderHeader()}
      <main className="app-main">
        {content}
        {error && game.phase !== "night" && <div className="notice notice--error global-error" role="alert">{error}</div>}
      </main>
      {game.phase === "night" && game.config.narrator === "screen" && !("speechSynthesis" in window) && (
        <p className="speech-fallback">La synthèse vocale n'est pas disponible dans ce navigateur ; suis les consignes affichées.</p>
      )}
    </>
  );
}

createRoot(document.getElementById("root")).render(<App />);
