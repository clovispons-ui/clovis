import {
  GAME_MODES,
  MAX_PLAYERS,
  MIN_PLAYERS,
  TIMER_OPTIONS,
  defaultImpostorCount,
  maxPlayableImpostors,
} from "./config.js";

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function modeCard(mode, title, description, selected) {
  return `
    <label class="mode-card ${selected ? "is-selected" : ""}">
      <input type="radio" name="mode" value="${mode}" ${selected ? "checked" : ""}>
      <span class="mode-radio" aria-hidden="true"></span>
      <span class="mode-card-copy">
        <strong>${title}</strong>
        <span>${description}</span>
      </span>
    </label>`;
}

function renderConfiguration(state) {
  const draft = state.draft;
  const playerCount = draft.names.length;
  const maxImpostors = Math.max(1, maxPlayableImpostors(playerCount));
  const minimumImpostors = draft.mode === GAME_MODES.CLOSE_WORD && draft.includeMisterWhite ? 2 : 1;
  const suggestedCount = Math.max(minimumImpostors, Math.min(maxImpostors, draft.impostorCount || defaultImpostorCount(playerCount)));
  const misterWhiteAvailable = maxImpostors >= 2;

  return `
    <section class="screen screen--config">
      <div class="hero-copy">
        <span class="eyebrow"><span class="eyebrow-line"></span> Le jeu commence ici</span>
        <h1>Qui bluffe<br><span>dans votre groupe&nbsp;?</span></h1>
        <p>Faites tourner l'écran, gardez votre secret, et repérez l'imposteur avant qu'il ne soit trop tard.</p>
      </div>
      <form id="configuration-form" class="panel config-panel" novalidate>
        ${state.error ? `<div class="notice notice--error" role="alert">${escapeHtml(state.error)}</div>` : ""}
        <div class="section-heading">
          <span class="step-index">01</span>
          <div><h2>Votre équipe</h2><p>De 3 à 12 joueurs autour du même écran.</p></div>
        </div>
        <div class="field-row">
          <label class="field-label" for="player-count">Nombre de joueurs</label>
          <select id="player-count" name="playerCount" class="select-control">
            ${Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, index) => index + MIN_PLAYERS)
              .map((count) => `<option value="${count}" ${count === playerCount ? "selected" : ""}>${count} joueurs</option>`)
              .join("")}
          </select>
        </div>
        <div class="player-grid" aria-label="Pseudos des joueurs">
          ${draft.names.map((name, index) => `
            <label class="player-field">
              <span>${String(index + 1).padStart(2, "0")}</span>
              <input class="text-control player-name" name="playerName" type="text" maxlength="24"
                autocomplete="off" placeholder="Pseudo du joueur ${index + 1}" value="${escapeHtml(name)}"
                aria-label="Pseudo du joueur ${index + 1}">
            </label>`).join("")}
        </div>

        <div class="section-heading section-heading--spaced">
          <span class="step-index">02</span>
          <div><h2>Choisissez votre mode</h2><p>Chaque variante change les informations secrètes.</p></div>
        </div>
        <div class="mode-grid">
          ${modeCard(GAME_MODES.MISTER_WHITE, "Mister White", "Un rôle sans mot. Il écoute et improvise.", draft.mode === GAME_MODES.MISTER_WHITE)}
          ${modeCard(GAME_MODES.CLUE, "L'indice", "L'imposteur reçoit une piste, pas le mot.", draft.mode === GAME_MODES.CLUE)}
          ${modeCard(GAME_MODES.CLOSE_WORD, "Mot proche", "Deux mots voisins, un seul groupe qui le sait.", draft.mode === GAME_MODES.CLOSE_WORD)}
        </div>

        <div class="settings-grid">
          <div class="field-block">
            <label class="field-label" for="impostor-count">${draft.mode === GAME_MODES.MISTER_WHITE ? "Mister White" : "Rôles adverses"}</label>
            <select id="impostor-count" name="impostorCount" class="select-control">
              ${Array.from({ length: maxImpostors - minimumImpostors + 1 }, (_, index) => index + minimumImpostors)
                .map((count) => `<option value="${count}" ${count === suggestedCount ? "selected" : ""}>${count} ${count > 1 ? "rôles" : "rôle"}</option>`)
                .join("")}
            </select>
            <span class="field-hint">${draft.mode === GAME_MODES.MISTER_WHITE ? "Le nombre de joueurs sans mot." : "Au moins un civil restera dans la partie."}</span>
          </div>
          ${draft.mode === GAME_MODES.CLOSE_WORD ? `
            <label class="toggle-card">
              <input type="checkbox" name="includeMisterWhite" ${draft.includeMisterWhite && misterWhiteAvailable ? "checked" : ""} ${misterWhiteAvailable ? "" : "disabled"}>
              <span class="toggle-visual" aria-hidden="true"></span>
              <span><strong>Ajouter Mister White</strong><small>${misterWhiteAvailable ? "Il occupe un rôle adverse et n'a aucun mot." : "Il faut au moins 5 joueurs pour garder l'équilibre."}</small></span>
            </label>` : ""}
        </div>

        <div class="section-heading section-heading--spaced">
          <span class="step-index">03</span>
          <div><h2>Ambiance de la manche</h2><p>Mélangez plusieurs thèmes si vous le souhaitez.</p></div>
        </div>
        <div class="category-grid">
          ${state.categories.map((category) => `
            <label class="category-chip">
              <input type="checkbox" name="categoryId" value="${escapeHtml(category.id)}"
                ${draft.categoryIds.includes(category.id) ? "checked" : ""}>
              <span class="checkmark" aria-hidden="true">✓</span>
              <span>${escapeHtml(category.label)}</span>
            </label>`).join("")}
        </div>

        <div class="section-heading section-heading--spaced">
          <span class="step-index">04</span>
          <div><h2>Chrono de discussion</h2><p>Le compte à rebours couvre toute la discussion.</p></div>
        </div>
        <div class="timer-settings">
          <label class="toggle-card toggle-card--compact">
            <input type="checkbox" name="timerEnabled" ${draft.timerEnabled ? "checked" : ""}>
            <span class="toggle-visual" aria-hidden="true"></span>
            <span><strong>Activer le chrono</strong><small>Temps accordé au groupe pour discuter.</small></span>
          </label>
          <label class="field-block timer-duration ${draft.timerEnabled ? "" : "is-disabled"}">
            <span class="field-label">Durée de discussion</span>
            <select name="timerDuration" class="select-control" ${draft.timerEnabled ? "" : "disabled"}>
              ${TIMER_OPTIONS.map((duration) => `<option value="${duration}" ${duration === draft.timerDuration ? "selected" : ""}>${duration} secondes</option>`).join("")}
            </select>
          </label>
        </div>

        <button class="button button--primary button--full start-button" type="submit" ${state.starting ? "disabled" : ""}>
          <span>${state.starting ? "Préparation…" : "Lancer la partie"}</span><span class="button-arrow" aria-hidden="true">↗</span>
        </button>
        <p class="privacy-note"><span aria-hidden="true">◉</span> Les rôles ne sont affichés qu'au moment de la révélation.</p>
      </form>
      <p class="screen-footnote">Pas de compte, pas de réseau, juste un peu de bluff.</p>
    </section>`;
}

function renderProgressDots(current, total) {
  return Array.from({ length: total }, (_, index) => `
    <span class="progress-dot ${index < current ? "is-done" : ""} ${index === current ? "is-current" : ""}"></span>
  `).join("");
}

function renderDistribution(state) {
  const player = state.round.players[state.dealIndex];
  const roleText = player.role === "civilian"
    ? "Tu es dans l'équipe des civils."
    : player.role === "misterWhite"
      ? "Tu es Mister White."
      : "Tu es l'imposteur.";
  const secretContent = player.secret?.kind === "clue"
    ? `<span class="secret-kicker">TON INDICE · ${escapeHtml(player.secret.precision)}</span><strong>${escapeHtml(player.secret.value)}</strong>`
    : player.secret?.kind === "word"
      ? `<span class="secret-kicker">TON MOT</span><strong>${escapeHtml(player.secret.value)}</strong>`
      : `<span class="secret-kicker">TON RÔLE</span><strong>Mister White</strong>`;
  const revealed = state.revealed;

  return `
    <section class="screen screen--play">
      <div class="play-topline"><span class="eyebrow"><span class="eyebrow-line"></span> Distribution secrète</span><span class="round-pill">Joueur ${state.dealIndex + 1} / ${state.round.players.length}</span></div>
      <div class="progress-track" aria-label="Progression de la distribution">${renderProgressDots(state.dealIndex, state.round.players.length)}</div>
      <div class="reveal-card panel">
        ${revealed ? `
          <span class="card-overline">C'EST À TON TOUR</span>
          <h1>${escapeHtml(player.name)}</h1>
          <p class="reveal-instruction">${escapeHtml(roleText)}</p>
          <div class="secret-panel ${player.secret?.kind === "word" ? "secret-panel--word" : ""}" aria-live="polite">${secretContent}</div>
          <p class="keep-secret">Mémorise cette information, puis passe l'appareil.</p>
          <button class="button button--primary button--full" type="button" data-action="hide-next">
            <span>Masquer et passer au suivant</span><span class="button-arrow" aria-hidden="true">→</span>
          </button>
        ` : `
          <span class="reveal-symbol" aria-hidden="true"><span></span><span></span><span></span></span>
          <span class="card-overline">PROCHAINE RÉVÉLATION</span>
          <h1>Passe l'écran à<br><span>${escapeHtml(player.name)}</span></h1>
          <p class="reveal-instruction">Vérifie que personne d'autre ne regarde.</p>
          <button class="button button--primary button--full" type="button" data-action="reveal">
            <span>Révéler mon rôle</span><span class="button-arrow" aria-hidden="true">↗</span>
          </button>
        `}
      </div>
      <p class="screen-footnote">L'écran se masque automatiquement si tu changes d'application.</p>
    </section>`;
}

function renderDiscussion(state) {
  const startingPlayer = state.round.players.find((player) => player.id === state.startingPlayerId);

  return `
    <section class="screen screen--play">
      <div class="play-topline"><span class="eyebrow"><span class="eyebrow-line"></span> Discussion</span><span class="round-pill">Manche ${state.roundNumber}</span></div>
      ${state.notice ? `<div class="notice notice--info">${escapeHtml(state.notice)}</div>` : ""}
      <div class="discussion-layout">
        <div class="discussion-main panel">
          <span class="card-overline">POUR COMMENCER</span>
          <div class="speaker-avatar" aria-hidden="true">${escapeHtml((startingPlayer?.name ?? "?").slice(0, 1).toLocaleUpperCase("fr"))}</div>
          <h1>${escapeHtml(startingPlayer?.name ?? "Groupe")}</h1>
          <p class="reveal-instruction">Commencez par cette personne, puis discutez librement.</p>
          ${state.roundTimerEnabled ? `
            <div class="timer-display" aria-live="off"><span class="timer-ring" aria-hidden="true">◷</span><span id="timer-value">${state.timerSeconds ?? state.roundTimerDuration}</span><small>SECONDES</small></div>
          ` : `<div class="turn-hint"><span class="turn-hint-dot"></span> Discutez librement, puis choisissez une personne.</div>`}
          <button class="button button--primary button--full" type="button" data-action="next-turn">
            <span>Choisir qui éliminer</span><span class="button-arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </div>
      <p class="screen-footnote">Restez vagues, écoutez bien, et ne donnez pas le mot. Le groupe choisira ensuite qui éliminer.</p>
    </section>`;
}

function renderEliminationChoice(state) {
  const candidates = state.round.players.filter((player) => player.active);
  return `
    <section class="screen screen--play">
      <div class="play-topline"><span class="eyebrow"><span class="eyebrow-line"></span> Fin de la discussion</span><span class="round-pill">Manche ${state.roundNumber}</span></div>
      <div class="choice-card panel">
        <span class="card-overline">DÉCISION DU GROUPE</span>
        <h1>Qui éliminez-vous&nbsp;?</h1>
        <p class="reveal-instruction">Discutez ensemble, puis touchez le joueur qui quitte la partie.</p>
        <div class="elimination-choices">
          ${candidates.map((candidate) => `
            <button class="elimination-choice" type="button" data-action="eliminate-player" data-player-id="${escapeHtml(candidate.id)}">
              <span class="choice-avatar" aria-hidden="true">${escapeHtml(candidate.name.slice(0, 1).toLocaleUpperCase("fr"))}</span>
              <span class="choice-name">${escapeHtml(candidate.name)}</span>
              <span class="choice-arrow" aria-hidden="true">→</span>
            </button>`).join("")}
        </div>
      </div>
    </section>`;
}

function renderElimination(state) {
  const player = state.round.players.find((item) => item.id === state.eliminatedPlayerId);
  const roleLabel = player.role === "civilian" ? "Civil" : player.role === "misterWhite" ? "Mister White" : "Imposteur";
  const roleClass = player.role === "civilian" ? "role-tag--civilian" : "role-tag--adversary";
  const isMisterWhite = player.role === "misterWhite";

  return `
    <section class="screen screen--play">
      <div class="play-topline"><span class="eyebrow"><span class="eyebrow-line"></span> Élimination</span><span class="round-pill">Choix du groupe</span></div>
      <div class="result-card panel">
        <span class="result-icon" aria-hidden="true">${isMisterWhite ? "?" : "✦"}</span>
        <span class="card-overline">LE GROUPE A CHOISI</span>
        <h1>${escapeHtml(player.name)}</h1>
        <p class="reveal-instruction">Son rôle était</p>
        <span class="role-tag ${roleClass}">${roleLabel}</span>
        ${isMisterWhite ? `<p class="result-note">Mister White a encore une chance de deviner le mot des civils.</p>` : ""}
        <button class="button button--primary button--full" type="button" data-action="continue-after-elimination">
          <span>${isMisterWhite ? "Donner sa dernière chance" : "Continuer"}</span><span class="button-arrow" aria-hidden="true">→</span>
        </button>
      </div>
    </section>`;
}

function renderLastChance(state) {
  const player = state.round.players.find((item) => item.id === state.eliminatedPlayerId);
  return `
    <section class="screen screen--play">
      <div class="play-topline"><span class="eyebrow"><span class="eyebrow-line"></span> Dernière chance</span><span class="round-pill">${escapeHtml(player.name)}</span></div>
      <div class="last-chance-card panel">
        <span class="result-icon result-icon--question" aria-hidden="true">?</span>
        <span class="card-overline">UNE SEULE TENTATIVE</span>
        <h1>${escapeHtml(player.name)},<br><span>quel était le mot&nbsp;?</span></h1>
        <p class="reveal-instruction">Écris ta réponse. Les accents et la casse ne comptent pas.</p>
        <form id="last-chance-form">
          <label class="field-label" for="last-chance-answer">Ta réponse</label>
          <input id="last-chance-answer" class="text-control answer-input" type="text" name="answer" autocomplete="off" maxlength="80" required>
          <button class="button button--primary button--full" type="submit">
            <span>Confirmer ma réponse</span><span class="button-arrow" aria-hidden="true">→</span>
          </button>
        </form>
      </div>
    </section>`;
}

function renderEnd(state) {
  const isCivilians = state.winner === "civilians";
  const label = isCivilians ? "Les civils" : "Les imposteurs";
  const content = state.round.content;

  return `
    <section class="screen screen--play">
      <div class="play-topline"><span class="eyebrow"><span class="eyebrow-line"></span> Fin de la partie</span><span class="round-pill">Manche ${state.roundNumber}</span></div>
      <div class="end-hero panel ${isCivilians ? "end-hero--civilians" : ""}">
        <span class="end-kicker">${isCivilians ? "BIEN JOUÉ" : "LE BLUFF A FONCTIONNÉ"}</span>
        <h1>${escapeHtml(label)}<br><span>${isCivilians ? "remportent la partie." : "l'emportent."}</span></h1>
        <p>${escapeHtml(state.endReason ?? "")}</p>
      </div>
      <div class="recap-card panel">
        <div class="recap-heading"><div><span class="card-overline">RÉVÉLATIONS</span><h2>Tout était là.</h2></div><span class="recap-count">${state.round.players.length} joueurs</span></div>
        ${content.civilianWord || content.impostorWord
          ? `<div class="word-recap">
              <span><small>Mot des civils</small><strong>${escapeHtml(content.civilianWord)}</strong></span>
              <span><small>Mot proche</small><strong>${escapeHtml(content.impostorWord)}</strong></span>
            </div>`
          : `<div class="word-recap"><span><small>Le mot secret</small><strong>${escapeHtml(content.value)}</strong></span></div>`}
        <ul class="recap-list">
          ${state.round.players.map((player) => {
            const role = player.role === "civilian" ? "Civil" : player.role === "misterWhite" ? "Mister White" : "Imposteur";
            const secret = player.secret?.kind === "word"
              ? player.secret.value
              : player.secret?.kind === "clue"
                ? `Indice : ${player.secret.value}`
                : "Aucun mot";
            return `<li><span class="recap-player ${player.active ? "" : "is-eliminated"}">${escapeHtml(player.name)}${player.active ? "" : `<small>éliminé·e</small>`}</span><span class="recap-role">${role}</span><strong>${escapeHtml(secret)}</strong></li>`;
          }).join("")}
        </ul>
        <button class="button button--primary button--full" type="button" data-action="replay">
          <span>Rejouer avec ces joueurs</span><span class="button-arrow" aria-hidden="true">↻</span>
        </button>
      </div>
    </section>`;
}

export function renderApp(root, state) {
  if (state.screen === "loading") {
    root.innerHTML = `<div class="loading-card" role="status">Préparation de la partie…</div>`;
    return;
  }
  if (state.screen === "error") {
    root.innerHTML = `<section class="error-card panel" role="alert"><span class="card-overline">OUPS</span><h1>La partie n'a pas pu démarrer.</h1><p>${escapeHtml(state.error)}</p><button class="button button--secondary" type="button" data-action="reload">Recharger l'application</button></section>`;
    return;
  }

  const view = {
    config: renderConfiguration,
    deal: renderDistribution,
    discussion: renderDiscussion,
    eliminationChoice: renderEliminationChoice,
    elimination: renderElimination,
    lastChance: renderLastChance,
    end: renderEnd,
  }[state.screen];
  root.innerHTML = view(state);
}

export function updateTimerDisplay(root, seconds) {
  const display = root.querySelector("#timer-value");
  if (display) display.textContent = String(seconds);
}
