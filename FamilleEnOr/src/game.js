import {
  MAX_STRIKES,
  MIN_QUESTION_COUNT,
  ROUND_COUNT,
  TEAM_IDS,
  validateTeamNames,
} from "./config.js";

const PHASES = Object.freeze({
  LOBBY: "LOBBY",
  QUESTION: "QUESTION",
  REVEAL: "REVEAL",
  ROUND_END: "ROUND_END",
  GAME_OVER: "GAME_OVER",
});

const SUB_PHASES = Object.freeze({
  FACE_OFF: "FACE_OFF",
  BOARD_PLAY: "BOARD_PLAY",
  STEAL: "STEAL",
});

export function normalizeAnswer(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fr")
    .replaceAll("œ", "oe")
    .replaceAll("æ", "ae")
    .replace(/[’'`]/g, " ")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function getAnswerVariants(value) {
  const normalized = normalizeAnswer(value);
  const withoutArticle = normalized.replace(/^(?:de la|de l|du|des|le|la|les|un|une|de|d|l)\s+/, "");
  return withoutArticle && withoutArticle !== normalized
    ? [normalized, withoutArticle]
    : [normalized];
}

export function validateQuestionSeed(seed) {
  const errors = [];
  if (seed?.meta?.locale !== "fr-FR") errors.push("La langue du seed doit être fr-FR.");
  if (!seed?.meta?.sourceUrl || !seed?.meta?.license || !seed?.meta?.attribution || !seed?.meta?.scoreNote) {
    errors.push("Les métadonnées de provenance, licence et scores sont requises.");
  }
  if (!Array.isArray(seed?.questions)) {
    errors.push("Le seed doit contenir une liste de questions.");
    return errors;
  }
  if (seed.questions.length < MIN_QUESTION_COUNT) {
    errors.push(`La banque doit contenir au moins ${MIN_QUESTION_COUNT} questions.`);
  }

  const questionIds = new Set();
  const normalizedQuestions = new Set();
  for (const question of seed.questions) {
    const label = typeof question?.id === "string" && question.id ? question.id : "(sans identifiant)";
    if (typeof question?.id !== "string" || !question.id.trim() || questionIds.has(question.id)) {
      errors.push(`Identifiant de question absent ou dupliqué : ${label}.`);
    }
    questionIds.add(question?.id);
    if (typeof question?.question !== "string" || !question.question.trim()) errors.push(`Question vide : ${label}.`);
    const normalizedQuestion = normalizeAnswer(typeof question?.question === "string" ? question.question : "");
    if (normalizedQuestions.has(normalizedQuestion)) errors.push(`Question en double : ${label}.`);
    normalizedQuestions.add(normalizedQuestion);
    if (typeof question?.sourceId !== "string" || !question.sourceId.trim()
      || typeof question?.source !== "string" || !question.source.trim()) {
      errors.push(`Provenance manquante : ${label}.`);
    }
    if (!Array.isArray(question?.answers) || question.answers.length < 2) {
      errors.push(`Il faut au moins deux réponses pour ${label}.`);
      continue;
    }

    const acceptedAnswers = new Set();
    question.answers.forEach((answer, index) => {
      if (typeof answer?.text !== "string" || !answer.text.trim()) {
        errors.push(`Réponse vide dans ${label}, rang ${index + 1}.`);
      }
      if (!Number.isInteger(answer?.points) || answer.points <= 0) {
        errors.push(`Les points doivent être des entiers positifs dans ${label}, rang ${index + 1}.`);
      }
      if (!Array.isArray(answer?.aliases) || answer.aliases.some((alias) => typeof alias !== "string")) {
        errors.push(`La liste d'alias est invalide dans ${label}, rang ${index + 1}.`);
      }
      const aliases = Array.isArray(answer?.aliases)
        ? answer.aliases.filter((alias) => typeof alias === "string")
        : [];
      for (const accepted of [answer?.text, ...aliases]) {
        const normalized = normalizeAnswer(accepted ?? "");
        if (!normalized) {
          errors.push(`Réponse ou alias vide dans ${label}, rang ${index + 1}.`);
        } else if (acceptedAnswers.has(normalized)) {
          errors.push(`Réponse ou alias ambigu dans ${label} : « ${accepted} ».`);
        } else {
          acceptedAnswers.add(normalized);
        }
      }
    });
  }
  return errors;
}

export function secureRandomInt(maxExclusive) {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 0x100000000) {
    throw new RangeError("La borne aléatoire doit être un entier positif inférieur ou égal à 2^32.");
  }

  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) throw new Error("Le navigateur ne fournit pas de générateur aléatoire sécurisé.");

  const range = 0x100000000;
  const limit = range - (range % maxExclusive);
  const buffer = new Uint32Array(1);
  do {
    cryptoApi.getRandomValues(buffer);
  } while (buffer[0] >= limit);
  return buffer[0] % maxExclusive;
}

export function matchAnswer(question, value) {
  const variants = new Set(getAnswerVariants(value));
  if (!variants.size || variants.has("")) return null;
  const matches = question.answers.filter((answer) => (
    [answer.text, ...answer.aliases].some((accepted) => (
      getAnswerVariants(accepted).some((variant) => variants.has(variant))
    ))
  ));
  return matches.length === 1 ? matches[0] : null;
}

export function createInitialState() {
  return {
    phase: PHASES.LOBBY,
    teams: TEAM_IDS.map((id, index) => ({
      id,
      name: index === 0 ? "Équipe A" : "Équipe B",
      score: 0,
    })),
    roundsToPlay: ROUND_COUNT,
    roundNumber: 0,
    questionQueue: [],
    currentQuestion: null,
    round: null,
    history: [],
    winner: null,
    error: null,
  };
}

function cloneRound(round) {
  return {
    ...round,
    revealedAnswerIds: [...round.revealedAnswerIds],
    faceOff: { ...round.faceOff, submissions: [...round.faceOff.submissions] },
    lastSubmission: round.lastSubmission ? { ...round.lastSubmission } : null,
  };
}

function withUndo(state, next) {
  return {
    ...next,
    round: {
      ...next.round,
      undo: {
        phase: state.phase,
        round: cloneRound(state.round),
      },
    },
  };
}

function getOpponentTeamId(teamId) {
  return TEAM_IDS.find((candidate) => candidate !== teamId);
}

function getAnswerRank(question, answer) {
  return question.answers.indexOf(answer) + 1;
}

function startQuestion(state, question, roundNumber) {
  return {
    ...state,
    phase: PHASES.QUESTION,
    roundNumber,
    currentQuestion: question,
    winner: null,
    error: null,
    round: {
      subPhase: SUB_PHASES.FACE_OFF,
      controlTeamId: null,
      boardVisible: false,
      strikes: 0,
      stealUsed: false,
      roundPot: 0,
      revealedAnswerIds: [],
      faceOff: { firstBuzzTeamId: null, currentTeamId: null, submissions: [] },
      lastSubmission: null,
      awardTeamId: null,
      awardPoints: 0,
      result: null,
      undo: null,
    },
  };
}

export function startGame(names, seed, randomInt = secureRandomInt) {
  const teamValidation = validateTeamNames(names);
  const seedErrors = validateQuestionSeed(seed);
  if (!teamValidation.ok || seedErrors.length) {
    throw new Error([...teamValidation.errors, ...seedErrors].join(" "));
  }

  const queue = seed.questions.map((question) => ({
    ...question,
    answers: question.answers.map((answer, index) => ({
      ...answer,
      id: answer.id ?? `${question.id}-a${index + 1}`,
    })),
  }));
  for (let index = queue.length - 1; index > 0; index -= 1) {
    const other = randomInt(index + 1);
    [queue[index], queue[other]] = [queue[other], queue[index]];
  }

  const teams = teamValidation.config.teams.map((team) => ({ ...team, score: 0 }));
  return startQuestion({
    ...createInitialState(),
    teams,
    roundsToPlay: teamValidation.config.roundsToPlay,
    questionQueue: queue.slice(0, ROUND_COUNT),
  }, queue[0], 1);
}

function assertPhase(state, phase, subPhase) {
  if (state.phase !== phase || (subPhase && state.round?.subPhase !== subPhase)) {
    throw new Error("Cette action n'est pas disponible à cette étape de la manche.");
  }
}

export function buzz(state, teamId) {
  assertPhase(state, PHASES.QUESTION, SUB_PHASES.FACE_OFF);
  if (!TEAM_IDS.includes(teamId)) throw new Error("Équipe inconnue.");
  if (state.round.faceOff.currentTeamId) throw new Error("Une équipe a déjà la parole pour le duel.");
  if (state.round.faceOff.submissions.some((submission) => submission.teamId === teamId)) {
    throw new Error("Cette équipe a déjà proposé une réponse au duel.");
  }
  const firstBuzzTeamId = state.round.faceOff.firstBuzzTeamId ?? teamId;
  return {
    ...state,
    round: {
      ...state.round,
      undo: null,
      boardVisible: true,
      faceOff: { ...state.round.faceOff, firstBuzzTeamId, currentTeamId: teamId },
    },
  };
}

function resolveFaceOff(state, submissions) {
  const first = submissions[0];
  const second = submissions[1];
  if (!first.answer && !second.answer) {
    return endRound(state, null, 0, "face-off-empty");
  }

  let winner;
  if (!first.answer) winner = second;
  else if (!second.answer) winner = first;
  else {
    const firstRank = getAnswerRank(state.currentQuestion, first.answer);
    const secondRank = getAnswerRank(state.currentQuestion, second.answer);
    winner = firstRank <= secondRank ? first : second;
  }

  return {
    ...state,
    round: {
      ...state.round,
      subPhase: SUB_PHASES.BOARD_PLAY,
      controlTeamId: winner.teamId,
      faceOff: { ...state.round.faceOff, currentTeamId: null, submissions },
      lastSubmission: {
        kind: "faceOff",
        label: `${state.teams.find((team) => team.id === winner.teamId).name} prend la main.`,
      },
    },
  };
}

export function submitFaceOffAnswer(state, teamId, value) {
  assertPhase(state, PHASES.QUESTION, SUB_PHASES.FACE_OFF);
  if (state.round.faceOff.currentTeamId !== teamId) throw new Error("Cette équipe n'a pas la parole au duel.");
  if (!normalizeAnswer(value)) throw new Error("Saisissez une réponse avant de valider.");
  const answer = matchAnswer(state.currentQuestion, value);
  const submissions = [
    ...state.round.faceOff.submissions,
    { teamId, answerId: answer?.id ?? null, answer },
  ];
  if (submissions.length === 2) return resolveFaceOff(state, submissions);
  return {
    ...state,
    round: {
      ...state.round,
      undo: null,
      faceOff: { ...state.round.faceOff, currentTeamId: getOpponentTeamId(teamId), submissions },
      lastSubmission: {
        kind: "faceOff",
        label: answer
          ? `${state.teams.find((team) => team.id === teamId).name} a trouvé une réponse. À l'autre équipe de répondre directement.`
          : "Réponse absente du tableau. À l'autre équipe de répondre directement.",
      },
    },
  };
}

function endRound(state, awardTeamId, awardPoints, result) {
  return {
    ...state,
    phase: PHASES.REVEAL,
    round: {
      ...state.round,
      subPhase: null,
      awardTeamId,
      awardPoints,
      result,
      undo: null,
    },
  };
}

export function submitBoardAnswer(state, teamId, value) {
  assertPhase(state, PHASES.QUESTION, SUB_PHASES.BOARD_PLAY);
  if (teamId !== state.round.controlTeamId) throw new Error("Seule l'équipe qui joue peut proposer une réponse.");
  if (!normalizeAnswer(value)) throw new Error("Saisissez une réponse avant de valider.");

  const answer = matchAnswer(state.currentQuestion, value);
  if (answer && state.round.revealedAnswerIds.includes(answer.id)) {
    return {
      ...state,
      round: {
        ...state.round,
        undo: null,
        lastSubmission: { kind: "duplicate", label: "Cette réponse a déjà été trouvée." },
      },
    };
  }

  if (answer) {
    const roundPot = state.round.roundPot + answer.points;
    const revealedAnswerIds = [...state.round.revealedAnswerIds, answer.id];
    const next = {
      ...state,
      round: {
        ...state.round,
        roundPot,
        revealedAnswerIds,
        lastSubmission: {
          kind: "correct",
          label: `Bonne réponse : ${answer.text} (+${answer.points} points).`,
        },
      },
    };
    if (revealedAnswerIds.length === state.currentQuestion.answers.length) {
      return withUndo(state, endRound(next, teamId, roundPot, "board-cleared"));
    }
    return withUndo(state, next);
  }

  const strikes = state.round.strikes + 1;
  const next = {
    ...state,
    round: {
      ...state.round,
      strikes,
      lastSubmission: { kind: "wrong", label: `Réponse absente du tableau : croix ${strikes} sur ${MAX_STRIKES}.` },
    },
  };
  if (strikes === MAX_STRIKES) {
    return withUndo(state, {
      ...next,
      round: { ...next.round, subPhase: SUB_PHASES.STEAL },
    });
  }
  return withUndo(state, next);
}

export function submitStealAnswer(state, teamId, value) {
  assertPhase(state, PHASES.QUESTION, SUB_PHASES.STEAL);
  const opposingTeamId = getOpponentTeamId(state.round.controlTeamId);
  if (teamId !== opposingTeamId || state.round.stealUsed) throw new Error("Cette équipe ne peut pas tenter le vol.");
  if (!normalizeAnswer(value)) throw new Error("Saisissez une réponse avant de valider.");
  const answer = matchAnswer(state.currentQuestion, value);
  const successful = Boolean(answer);
  const totalBoardPoints = state.currentQuestion.answers.reduce((sum, item) => sum + item.points, 0);
  const next = {
    ...state,
    round: { ...state.round, stealUsed: true },
  };
  return withUndo(
    state,
    endRound(
      next,
      successful ? teamId : state.round.controlTeamId,
      successful ? totalBoardPoints : state.round.roundPot,
      successful ? "steal-success" : "steal-failed",
    ),
  );
}

export function undoLastSubmission(state) {
  const snapshot = state.round?.undo;
  if (!snapshot) throw new Error("Il n'y a aucune saisie à annuler.");
  return {
    ...state,
    phase: snapshot.phase,
    round: { ...cloneRound(snapshot.round), undo: null },
    error: null,
  };
}

export function finishReveal(state) {
  assertPhase(state, PHASES.REVEAL);
  const noAward = state.round.result === "face-off-empty"
    && state.round.awardTeamId === null
    && state.round.awardPoints === 0;
  if ((!noAward && !TEAM_IDS.includes(state.round.awardTeamId)) || !Number.isInteger(state.round.awardPoints)) {
    throw new Error("Le résultat de la manche est incomplet.");
  }
  const teams = state.teams.map((team) => (
    !noAward && team.id === state.round.awardTeamId
      ? { ...team, score: team.score + state.round.awardPoints }
      : team
  ));
  const historyEntry = {
    roundNumber: state.roundNumber,
    questionId: state.currentQuestion.id,
    question: state.currentQuestion.question,
    awardTeamId: state.round.awardTeamId,
    awardPoints: state.round.awardPoints,
    result: state.round.result,
    strikes: state.round.strikes,
  };
  return {
    ...state,
    phase: PHASES.ROUND_END,
    teams,
    history: [...state.history, historyEntry],
    round: { ...state.round, undo: null },
  };
}

export function nextRound(state) {
  assertPhase(state, PHASES.ROUND_END);
  if (state.roundNumber >= state.roundsToPlay) {
    const [first, second] = state.teams;
    return {
      ...state,
      phase: PHASES.GAME_OVER,
      winner: first.score === second.score
        ? null
        : state.teams.find((team) => team.score > Math.min(first.score, second.score)).id,
    };
  }
  return startQuestion(state, state.questionQueue[state.roundNumber], state.roundNumber + 1);
}

export const GAME_PHASES = PHASES;
export const ROUND_SUB_PHASES = SUB_PHASES;
