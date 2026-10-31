import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import questionSeed from "../data/questions.fr.json";
import { MAX_STRIKES } from "./config.js";
import {
  GAME_PHASES,
  ROUND_SUB_PHASES,
  buzz,
  createInitialState,
  finishReveal,
  nextRound,
  startGame,
  submitBoardAnswer,
  submitFaceOffAnswer,
  submitStealAnswer,
  undoLastSubmission,
  validateQuestionSeed,
} from "./game.js";

function TeamScores({ game, activeTeamId = null, className = "" }) {
  return (
    <div className={`fo-scores ${className}`}>
      {game.teams.map((team) => (
        <div className={`fo-team-card${activeTeamId === team.id ? " is-active" : ""}`} key={team.id}>
          <span className="fo-team-name">{team.name}</span>
          <strong className="fo-team-score">{team.score}</strong>
        </div>
      ))}
    </div>
  );
}

function ResponseForm({ label, buttonLabel, onSubmit, disabled = false }) {
  const [value, setValue] = useState("");

  function submit(event) {
    event.preventDefault();
    if (!value.trim() || disabled) return;
    onSubmit(value);
    setValue("");
  }

  return (
    <form className="fo-response-form" onSubmit={submit}>
      <label className="fo-form-label" htmlFor="fo-answer-entry">{label}</label>
      <input
        autoComplete="off"
        className="text-control"
        disabled={disabled}
        id="fo-answer-entry"
        maxLength={100}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Saisir la réponse entendue…"
        value={value}
      />
      <button className="button button--primary" disabled={disabled || !value.trim()} type="submit">
        {buttonLabel}
      </button>
    </form>
  );
}

function AnswerBoard({ game }) {
  const revealed = game.phase !== GAME_PHASES.QUESTION;
  return (
    <section className="panel fo-panel" aria-label="Tableau des réponses">
      <div className="fo-board">
        {game.currentQuestion.answers.map((answer, index) => {
          const isRevealed = revealed || game.round.revealedAnswerIds.includes(answer.id);
          return (
            <div className={`fo-answer${isRevealed ? " is-revealed" : ""}`} key={`${game.currentQuestion.id}-${index}`}>
              <span className="fo-answer-rank">{index + 1}</span>
              <span className="fo-answer-text">{isRevealed ? answer.text : "••••••••••"}</span>
              <span className="fo-answer-points">{isRevealed ? answer.points : "—"}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function StrikeDisplay({ strikes }) {
  return (
    <div className="fo-strikes" aria-label={`${strikes} erreur${strikes > 1 ? "s" : ""} sur ${MAX_STRIKES}`}>
      {Array.from({ length: MAX_STRIKES }, (_, index) => (
        <span className={`fo-strike${index < strikes ? " is-active" : ""}`} key={index} aria-hidden="true">×</span>
      ))}
      <span className="fo-muted">{strikes}/{MAX_STRIKES} erreurs</span>
    </div>
  );
}

function FaceOffControls({ game, run }) {
  const { faceOff } = game.round;
  const submittedTeamIds = new Set(faceOff.submissions.map((submission) => submission.teamId));
  const currentTeam = game.teams.find((team) => team.id === faceOff.currentTeamId);

  return (
    <>
      <p className="fo-kicker">Duel de rapidité</p>
      <p className="fo-status-message" aria-live="polite">
        {currentTeam
          ? `${currentTeam.name} a la parole : saisissez sa proposition.`
          : game.round.lastSubmission?.kind === "faceOff"
            ? game.round.lastSubmission.label
            : "Les deux équipes sont prêtes ? Appuyez sur votre buzzer."}
      </p>
      {currentTeam ? (
        <ResponseForm
          buttonLabel="Valider la réponse"
          label={`Réponse du duel — ${currentTeam.name}`}
          onSubmit={(value) => run((state) => submitFaceOffAnswer(state, currentTeam.id, value))}
        />
      ) : (
        <div className="fo-buzzers">
          {game.teams.map((team) => (
            <button
              className="button fo-buzzer"
              disabled={submittedTeamIds.has(team.id)}
              key={team.id}
              onClick={() => run((state) => buzz(state, team.id))}
              type="button"
            >
              <strong>{team.name}</strong><span>Buzzer maintenant</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function QuestionControls({ game, run }) {
  const activeTeam = game.teams.find((team) => team.id === game.round.controlTeamId);
  const otherTeam = game.teams.find((team) => team.id !== game.round.controlTeamId);
  const isFaceOff = game.round.subPhase === ROUND_SUB_PHASES.FACE_OFF;
  const isSteal = game.round.subPhase === ROUND_SUB_PHASES.STEAL;
  const lastSubmission = game.round.lastSubmission;

  return (
    <section className="panel fo-panel fo-status-panel">
      {isFaceOff ? (
        <FaceOffControls game={game} run={run} />
      ) : (
        <>
          <p className="fo-kicker">{isSteal ? "Tentative de vol" : `À vous, ${activeTeam.name}`}</p>
          <p className="fo-status-message" data-kind={lastSubmission?.kind} aria-live="polite">
            {isSteal
              ? `${otherTeam.name}, une seule proposition pour voler la manche. Une bonne réponse remporte tout le tableau.`
              : lastSubmission?.label ?? "Écoutez les propositions et saisissez la réponse retenue par votre équipe."}
          </p>
          {isSteal ? (
            <ResponseForm
              buttonLabel="Tenter le vol"
              label={`Réponse de ${otherTeam.name}`}
              onSubmit={(value) => run((state) => submitStealAnswer(state, otherTeam.id, value))}
            />
          ) : (
            <>
              <ResponseForm
                buttonLabel="Valider la proposition"
                label={`Réponse entendue — ${activeTeam.name}`}
                onSubmit={(value) => run((state) => submitBoardAnswer(state, activeTeam.id, value))}
              />
              <StrikeDisplay strikes={game.round.strikes} />
              <div className="fo-pot"><span>Pot trouvé dans la manche</span><strong>{game.round.roundPot}</strong></div>
            </>
          )}
          {isSteal && <StrikeDisplay strikes={game.round.strikes} />}
        </>
      )}
      {game.round.undo && (
        <button
          className="fo-undo"
          onClick={() => run(undoLastSubmission)}
          type="button"
        >
          Annuler la dernière saisie
        </button>
      )}
    </section>
  );
}

function RoundReveal({ game, run }) {
  const team = game.teams.find((item) => item.id === game.round.awardTeamId);
  const resultLabel = {
    "board-cleared": "Toutes les réponses ont été trouvées.",
    "steal-success": "Vol réussi : les points du tableau, y compris les réponses cachées, sont remportés.",
    "steal-failed": "Vol manqué : l'équipe qui jouait conserve les points trouvés.",
    "face-off-empty": "Aucune équipe n'a trouvé de réponse au duel. La manche est passée sans point.",
  }[game.round.result];

  if (game.round.result === "face-off-empty") {
    const isFinalRound = game.roundNumber === game.roundsToPlay;
    return (
      <section className="panel fo-panel fo-result">
        <p className="fo-kicker">Récapitulatif · Manche {game.roundNumber}</p>
        <h2>Aucun mot trouvé</h2>
        <p className="fo-muted">{resultLabel}</p>
        <TeamScores game={game} className="fo-final-scores" />
        <button
          className="button button--primary"
          onClick={() => run((state) => nextRound(finishReveal(state)))}
          type="button"
        >
          {isFinalRound ? "Voir le résultat final" : "Question suivante"} <span className="button-arrow" aria-hidden="true">→</span>
        </button>
      </section>
    );
  }

  return (
    <section className="panel fo-panel fo-result">
      <p className="fo-kicker">Manche {game.roundNumber} terminée</p>
      <h2>{team.name} marque</h2>
      <p className="fo-result-points">{game.round.awardPoints} <small>points</small></p>
      <p className="fo-muted">{resultLabel}</p>
      <button className="button button--primary" onClick={() => run(finishReveal)} type="button">
        Confirmer le score <span className="button-arrow" aria-hidden="true">→</span>
      </button>
    </section>
  );
}

function RoundEnd({ game, run }) {
  const isFinalRound = game.roundNumber === game.roundsToPlay;
  return (
    <section className="panel fo-panel fo-result">
      <p className="fo-kicker">{isFinalRound ? "Dernière manche" : `Manche ${game.roundNumber} sur ${game.roundsToPlay}`}</p>
      <h2>{isFinalRound ? "Score final" : "Prêts pour la suite ?"}</h2>
      <TeamScores game={game} className="fo-final-scores" />
      <button className="button button--primary fo-start-button" onClick={() => run(nextRound)} type="button">
        {isFinalRound ? "Voir le résultat final" : "Start"} <span className="button-arrow" aria-hidden="true">→</span>
      </button>
    </section>
  );
}

function QuestionReady({ game, onStart }) {
  return (
    <section className="panel fo-panel fo-question-ready">
      <p className="fo-kicker">Manche {game.roundNumber} sur {game.roundsToPlay}</p>
      <h1>Les équipes sont prêtes ?</h1>
      <TeamScores game={game} className="fo-ready-scores" />
      <button className="button button--primary fo-start-button" onClick={onStart} type="button">
        Start <span className="button-arrow" aria-hidden="true">→</span>
      </button>
    </section>
  );
}

function GameOver({ game, onReset }) {
  const [first, second] = game.teams;
  const winner = game.teams.find((team) => team.id === game.winner);
  return (
    <section className="panel fo-panel fo-gameover">
      <p className="fo-kicker">Fin de partie · 5 manches</p>
      <h1>{winner ? `${winner.name} remporte la partie !` : "Match nul !"}</h1>
      <p className="fo-muted">
        {winner ? `${winner.score} à ${winner.id === first.id ? second.score : first.score} points.` : "Les deux équipes terminent à égalité."}
      </p>
      <TeamScores game={game} className="fo-final-scores" />
      <div className="fo-history" aria-label="Résumé des manches">
        {game.history.map((entry) => {
          const team = game.teams.find((item) => item.id === entry.awardTeamId);
          return (
            <div className="fo-history-row" key={entry.questionId}>
              <span>Manche {entry.roundNumber}</span>
              <strong>{entry.question}</strong>
              <span>{team ? `${team.name} +${entry.awardPoints}` : "Aucun point"}</span>
            </div>
          );
        })}
      </div>
      <button className="button button--primary" onClick={onReset} type="button">Nouvelle partie</button>
    </section>
  );
}

function App() {
  const [game, setGame] = useState(null);
  const [questionStarted, setQuestionStarted] = useState(false);
  const [teamNames, setTeamNames] = useState(["Équipe A", "Équipe B"]);
  const [error, setError] = useState("");
  const [dataReady, setDataReady] = useState(false);

  useEffect(() => {
    const errors = validateQuestionSeed(questionSeed);
    if (errors.length) setError(`La banque de questions est invalide : ${errors.join(" ")}`);
    else setDataReady(true);
  }, []);

  function run(action) {
    try {
      setError("");
      setGame(action(game));
    } catch (actionError) {
      console.error("Action Famille en Or impossible.", actionError);
      setError(actionError instanceof Error ? actionError.message : "Cette action n'a pas pu être effectuée.");
    }
  }

  function beginGame(event) {
    event.preventDefault();
    try {
      setError("");
      setGame(startGame(teamNames, questionSeed));
      setQuestionStarted(false);
    } catch (startError) {
      console.error("Impossible de démarrer Famille en Or.", startError);
      setError(startError instanceof Error ? startError.message : "Impossible de démarrer la partie.");
    }
  }

  function resetGame() {
    setGame(null);
    setQuestionStarted(false);
    setError("");
  }

  if (!dataReady && !error) {
    return <div className="loading-card">Préparation de la banque de questions…</div>;
  }

  if (!game) {
    return (
      <section className="fo-screen">
        <div className="fo-hero">
          <p className="fo-eyebrow">Le grand jeu des réponses</p>
          <h1>Famille<br /><span>en Or.</span></h1>
          <p>Écoutez les réponses criées, tapez votre proposition et découvrez le tableau. Deux équipes, cinq manches, un seul écran.</p>
        </div>
        <form className="panel fo-panel" onSubmit={beginGame}>
          <h2>Composez les équipes</h2>
          <p>Choisissez deux noms. À chaque manche, désignez qui buzze et qui saisit les réponses entendues.</p>
          {error && <p className="notice notice--error fo-error" role="alert">{error}</p>}
          <div className="fo-team-fields">
            {teamNames.map((name, index) => (
              <div className="field-block" key={index}>
                <label className="field-label" htmlFor={`fo-team-${index}`}>Équipe {index + 1}</label>
                <input
                  className="text-control"
                  id={`fo-team-${index}`}
                  maxLength={24}
                  onChange={(event) => setTeamNames((current) => current.map((item, itemIndex) => (
                    itemIndex === index ? event.target.value : item
                  )))}
                  required
                  value={name}
                />
              </div>
            ))}
          </div>
          <div className="fo-rules">
            <div className="fo-rule"><strong>Duel au buzzer</strong><span>La meilleure réponse classée donne la main à son équipe.</span></div>
            <div className="fo-rule"><strong>3 croix</strong><span>Après trois erreurs, l'autre équipe peut tenter de voler le tableau.</span></div>
            <div className="fo-rule"><strong>5 manches</strong><span>Un vol réussi rapporte les points de tout le tableau, même les cases cachées.</span></div>
          </div>
          <p className="fo-muted">Les scores de réponse proviennent de transcriptions de sondages américains ; ils servent de classement ludique et ne représentent pas un sondage français.</p>
          <button className="button button--primary button--full" disabled={!dataReady} type="submit">
            Lancer la partie <span className="button-arrow" aria-hidden="true">→</span>
          </button>
        </form>
      </section>
    );
  }

  if (game.phase === GAME_PHASES.GAME_OVER) {
    return <GameOver game={game} onReset={resetGame} />;
  }

  if (game.phase === GAME_PHASES.QUESTION && !questionStarted) {
    return (
      <section className="fo-screen">
        <div className="fo-game-top">
          <span className="fo-kicker">Famille en Or</span>
          <span className="fo-round-pill">Manche {game.roundNumber} / {game.roundsToPlay}</span>
          <span />
        </div>
        <QuestionReady game={game} onStart={() => setQuestionStarted(true)} />
      </section>
    );
  }

  const isReveal = game.phase === GAME_PHASES.REVEAL;
  const isRoundEnd = game.phase === GAME_PHASES.ROUND_END;
  const activeTeamId = isReveal || isRoundEnd ? game.round.awardTeamId : game.round.controlTeamId;

  return (
    <section className="fo-screen">
      <div className="fo-game-top">
        <span className="fo-kicker">Famille en Or</span>
        <span className="fo-round-pill">Manche {game.roundNumber} / {game.roundsToPlay}</span>
        <span />
      </div>
      <TeamScores game={game} activeTeamId={activeTeamId} />
      <section className="panel fo-question">
        <p className="fo-kicker">{game.round.subPhase === ROUND_SUB_PHASES.FACE_OFF ? "À vos buzzers" : isReveal || isRoundEnd ? "Tableau révélé" : "À vous de jouer"}</p>
        <h1>{game.currentQuestion.question}</h1>
        <p className="fo-question-hint">Criez vos réponses ! Le saisisseur de l'équipe les entre sur cet écran.</p>
      </section>
      {isReveal ? (
        <div className="fo-play-grid fo-reveal-grid">
          <AnswerBoard game={game} />
          <RoundReveal game={game} run={run} />
        </div>
      ) : (
        game.phase === GAME_PHASES.QUESTION && (
          game.round.boardVisible ? (
            <div className="fo-play-grid fo-play-grid--live">
              <AnswerBoard game={game} />
              <QuestionControls game={game} run={run} />
            </div>
          ) : (
            <QuestionControls game={game} run={run} />
          )
        )
      )}
      {isRoundEnd && <RoundEnd game={game} run={run} />}
      {error && <p className="notice notice--error fo-error" role="alert">{error}</p>}
    </section>
  );
}

createRoot(document.getElementById("app")).render(<App />);
