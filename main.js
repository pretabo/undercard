const Engine = window.UnderCardEngine;

if (!Engine) {
  throw new Error("UnderCardEngine failed to load.");
}

const DEFAULT_PLAYER_WRESTLER = "Jamie 'The Best Wrestler & Fit' Wyatt";
const RARITY_LIMITS = { common: 4, uncommon: 3, rare: 2, special: 1 };
const AI_STEP_DELAY = 1000;

const DATA_FILES = {
  cardPool: "data/card-pool.json",
  deckRecipe: "data/deck-recipe.json",
  wrestlers: "data/wrestlers.json"
};

const gameData = {
  cardPool: [],
  cardLookup: {},
  deckRecipe: [],
  wrestlers: []
};

const app = {
  isReady: false,
  state: null,
  ui: {
    pendingContinueAction: null,
    pinCountTimers: [],
    rollOffTimers: [],
    pinCountRunning: false,
    lastHandledLogIndex: 0,
    lastShownRollOffId: 0,
    moveToastTimer: null
  },
  timers: new Set()
};

const dom = {
  appContent: document.getElementById("app-content"),
  startupError: document.getElementById("startup-error"),
  restartButton: document.getElementById("restart-button"),
  fullLogButton: document.getElementById("full-log-button"),
  closeLogButton: document.getElementById("close-log-button"),
  logModal: document.getElementById("log-modal"),
  logModalBackdrop: document.querySelector("#log-modal .log-modal__backdrop"),
  matchLogList: document.getElementById("match-log-list"),
  closeCardButton: document.getElementById("close-card-button"),
  closePinButton: document.getElementById("close-pin-button"),
  closeRollOffButton: document.getElementById("close-rolloff-button"),
  closeHandMenuButton: document.getElementById("close-hand-menu-button"),
  cardModal: document.getElementById("card-modal"),
  cardModalBackdrop: document.querySelector("#card-modal .card-modal__backdrop"),
  pinModal: document.getElementById("pin-modal"),
  pinModalBackdrop: document.querySelector("#pin-modal .pin-modal__backdrop"),
  rollOffModal: document.getElementById("rolloff-modal"),
  rollOffModalBackdrop: document.querySelector("#rolloff-modal .rolloff-modal__backdrop"),
  handMenuModal: document.getElementById("hand-menu-modal"),
  handMenuModalBackdrop: document.querySelector("#hand-menu-modal .hand-menu-modal__backdrop"),
  rollOffTitle: document.getElementById("rolloff-title"),
  cardModalType: document.getElementById("card-modal-type"),
  cardModalTitle: document.getElementById("card-modal-title"),
  cardModalMeta: document.getElementById("card-modal-meta"),
  cardModalValue: document.getElementById("card-modal-value"),
  cardModalReason: document.getElementById("card-modal-reason"),
  cardModalEffect: document.getElementById("card-modal-effect"),
  cardModalAction: document.getElementById("card-modal-action"),
  pinModalTitle: document.getElementById("pin-modal-title"),
  pinModalStats: document.getElementById("pin-modal-stats"),
  rollOffAttackerName: document.getElementById("rolloff-attacker-name"),
  rollOffAttackerRoll: document.getElementById("rolloff-attacker-roll"),
  rollOffAttackerCard: document.getElementById("rolloff-attacker-card"),
  rollOffDefenderName: document.getElementById("rolloff-defender-name"),
  rollOffDefenderRoll: document.getElementById("rolloff-defender-roll"),
  rollOffDefenderCard: document.getElementById("rolloff-defender-card"),
  rollOffResult: document.getElementById("rolloff-result"),
  pinCountOverlay: document.getElementById("pin-count-overlay"),
  pinCountValue: document.getElementById("pin-count-value"),
  directorTitle: document.getElementById("director-title"),
  directorSubtitle: document.getElementById("director-subtitle"),
  directorPrimary: document.getElementById("director-primary"),
  outcomeBanner: document.getElementById("outcome-banner"),
  moveToast: document.getElementById("move-toast"),
  sequenceCombo: document.getElementById("sequence-combo"),
  sequenceSlots: document.getElementById("sequence-slots"),
  handCards: document.getElementById("hand-cards"),
  drawPileCount: document.getElementById("draw-pile-count"),
  playerPinSummary: document.getElementById("player-pin-summary"),
  handMenuButton: document.getElementById("hand-menu-button"),
  handMenuStopEarly: document.getElementById("hand-menu-stop-early"),
  recentEventsList: document.getElementById("recent-events-list"),
  wrestlerPanels: {
    player: {
      card: document.getElementById("player-summary"),
      name: document.getElementById("player-name"),
      role: document.getElementById("player-role"),
      stats: document.getElementById("player-stats"),
      pin: document.getElementById("player-pin"),
      status: document.getElementById("player-status")
    },
    enemy: {
      card: document.getElementById("enemy-summary"),
      name: document.getElementById("enemy-name"),
      role: document.getElementById("enemy-role"),
      stats: document.getElementById("enemy-stats"),
      pin: document.getElementById("enemy-pin"),
      status: document.getElementById("enemy-status")
    }
  }
};

bindEvents();
boot();

function bindEvents() {
  dom.restartButton?.addEventListener("click", restartMatch);
  dom.fullLogButton?.addEventListener("click", openLogModal);
  dom.closeLogButton?.addEventListener("click", closeLogModal);
  dom.logModalBackdrop?.addEventListener("click", closeLogModal);
  dom.closeCardButton?.addEventListener("click", closeCardModal);
  dom.cardModalBackdrop?.addEventListener("click", closeCardModal);
  dom.closePinButton?.addEventListener("click", closePinModal);
  dom.pinModalBackdrop?.addEventListener("click", closePinModal);
  dom.closeRollOffButton?.addEventListener("click", closeRollOffModal);
  dom.rollOffModalBackdrop?.addEventListener("click", closeRollOffModal);
  dom.closeHandMenuButton?.addEventListener("click", closeHandMenuModal);
  dom.handMenuModalBackdrop?.addEventListener("click", closeHandMenuModal);
  dom.handMenuButton?.addEventListener("click", openHandMenuModal);
  dom.handMenuStopEarly?.addEventListener("click", () => {
    if (!canPlayerStopEarly(app.state)) {
      return;
    }

    closeHandMenuModal();
    Engine.stopTurn(app.state);
    refreshApp();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    if (dom.cardModal && !dom.cardModal.hidden) {
      closeCardModal();
      return;
    }

    if (dom.pinModal && !dom.pinModal.hidden) {
      closePinModal();
      return;
    }

    if (dom.rollOffModal && !dom.rollOffModal.hidden) {
      closeRollOffModal();
      return;
    }

    if (dom.handMenuModal && !dom.handMenuModal.hidden) {
      closeHandMenuModal();
      return;
    }

    if (dom.logModal && !dom.logModal.hidden) {
      closeLogModal();
    }
  });
}

async function boot() {
  try {
    await loadGameData();
    validateGameData();
    app.isReady = true;
    startMatch(app);
  } catch (error) {
    renderStartupError(error);
  }
}

async function loadGameData() {
  const loaded = await Promise.all(
    Object.entries(DATA_FILES).map(async ([key, path]) => {
      const response = await fetch(path);

      if (!response.ok) {
        throw new Error(`Could not load game data from ${path}.`);
      }

      const data = await response.json();
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error(`Game data in ${path} is empty or invalid.`);
      }

      return [key, data];
    })
  );

  loaded.forEach(([key, data]) => {
    gameData[key] = data;
  });

  gameData.cardLookup = Object.fromEntries(gameData.cardPool.map((card) => [card.id, card]));
}

function validateGameData() {
  const baseDeckSize = gameData.deckRecipe.reduce((sum, entry) => sum + entry.count, 0);
  if (baseDeckSize !== 48) {
    throw new Error(`Base maneuver recipe must total 48 cards. Found ${baseDeckSize}.`);
  }

  gameData.deckRecipe.forEach((entry) => {
    const card = gameData.cardLookup[entry.cardId];
    if (!card) {
      throw new Error(`Deck recipe references unknown card id "${entry.cardId}".`);
    }

    if (entry.count > RARITY_LIMITS[card.rarity]) {
      throw new Error(`Deck recipe exceeds ${card.name}'s copy limit.`);
    }
  });

  gameData.wrestlers.forEach((wrestler) => {
    if (!wrestler.name || !wrestler.signature) {
      throw new Error("Each wrestler needs a name and signature.");
    }

    const deck = Engine.buildDeckForWrestler(wrestler, gameData.cardLookup, gameData.deckRecipe);
    validateDeckForWrestler(deck, wrestler.name);
  });
}

function validateDeckForWrestler(deck, wrestlerName) {
  if (deck.length !== 49) {
    throw new Error(`${wrestlerName}'s deck must contain exactly 49 cards.`);
  }

  const counts = {};
  let pinCount = 0;

  deck.forEach((card) => {
    counts[card.id] = (counts[card.id] || 0) + 1;
    if (card.type === "pin") {
      pinCount += 1;
    }
  });

  if (pinCount < 1) {
    throw new Error(`${wrestlerName}'s deck must contain at least 1 pin card.`);
  }

  Object.entries(counts).forEach(([cardId, count]) => {
    const card = deck.find((entry) => entry.id === cardId);
    const limit = RARITY_LIMITS[card.rarity] || 1;
    if (count > limit) {
      throw new Error(`${wrestlerName}'s deck exceeds ${card.name}'s copy limit.`);
    }
  });
}

function renderStartupError(error) {
  console.error(error);
  dom.appContent.hidden = true;
  dom.startupError.hidden = false;
  dom.startupError.innerHTML = `
    <h2>Unable to load game data</h2>
    <p>Check the browser console and confirm the local JSON files are available.</p>
    <p class="startup-error__detail">${error.message}</p>
  `;
}

function restartMatch() {
  if (!app.isReady) {
    return;
  }

  startMatch(app);
}

function startMatch(currentApp) {
  clearScheduledCalls(currentApp);
  stopPinCountOverlay();
  hideMoveToast();
  currentApp.ui.lastHandledLogIndex = 0;
  closeCardModal();
  closeLogModal();
  closeHandMenuModal();

  const matchup = pickRandomMatchup();
  currentApp.state = Engine.createMatch({
    player: {
      name: matchup.player.name,
      maneuverDeck: Engine.buildDeckForWrestler(matchup.player, gameData.cardLookup, gameData.deckRecipe),
      shuffleManeuverDeck: true
    },
    enemy: {
      name: matchup.enemy.name,
      maneuverDeck: Engine.buildDeckForWrestler(matchup.enemy, gameData.cardLookup, gameData.deckRecipe),
      shuffleManeuverDeck: true
    }
  });

  refreshApp();
}

function pickRandomMatchup() {
  const roster = gameData.wrestlers;
  const playerTemplate =
    roster.find((wrestler) => wrestler.name === DEFAULT_PLAYER_WRESTLER) || roster[0];
  const enemyPool = roster.filter((wrestler) => wrestler.name !== playerTemplate.name);
  const enemyTemplate =
    enemyPool[Math.floor(Math.random() * enemyPool.length)] || playerTemplate;

  return {
    player: cloneWrestler(playerTemplate),
    enemy: cloneWrestler(enemyTemplate)
  };
}

function cloneWrestler(wrestler) {
  return {
    name: wrestler.name,
    signature: { ...wrestler.signature, onHitEffects: cloneEffects(wrestler.signature.onHitEffects) }
  };
}

function cloneEffects(effects) {
  return Array.isArray(effects) ? effects.map((effect) => ({ ...effect })) : [];
}

function refreshApp() {
  maybeRunAiFlow();
  renderApp(app);
}

function maybeRunAiFlow() {
  clearScheduledCalls(app);
  app.ui.pendingContinueAction = null;

  if (!app.state || app.state.match.over) {
    return;
  }

  if (app.state.phase === Engine.PHASES.TURN_END) {
    app.ui.pendingContinueAction = () => {
      if (!app.state || app.state.match.over || app.state.phase !== Engine.PHASES.TURN_END) {
        return;
      }
      Engine.continueAfterTurnEnd(app.state);
      refreshApp();
    };
    return;
  }

  if (app.state.phase === Engine.PHASES.PINFALL_DRAW) {
    return;
  }

  if (app.state.phase === Engine.PHASES.CHOOSE_NEXT_ACTION && app.state.turn.attackerKey === "enemy") {
    app.ui.pendingContinueAction = runEnemyOffenseStep;
    return;
  }

  if (!app.state.resolution || app.state.resolution.defenderKey !== "enemy") {
    return;
  }

  if (
    (app.state.phase === Engine.PHASES.RESOLVE_ATTACK ||
      app.state.phase === Engine.PHASES.PIN_DEFENCE_DECISION) &&
    app.state.resolution.awaitingDefenceChoice
  ) {
    app.ui.pendingContinueAction = runEnemyDefenseStep;
    return;
  }

}

function runEnemyOffenseStep() {
  if (!app.state || app.state.match.over || app.state.turn.attackerKey !== "enemy") {
    return;
  }

  const decision = Engine.chooseAiOffence(app.state, "enemy");

  if (decision.type === "stop") {
    Engine.stopTurn(app.state);
    refreshApp();
    return;
  }

  Engine.playOffensiveCard(app.state, decision.handIndex, "enemy");
  refreshApp();
}

function runEnemyDefenseStep() {
  if (
    !app.state ||
    app.state.match.over ||
    !app.state.resolution ||
    app.state.resolution.defenderKey !== "enemy" ||
    !app.state.resolution.awaitingDefenceChoice
  ) {
    return;
  }

  const decision = Engine.chooseAiDefence(app.state);

  if (decision.type === "none") {
    Engine.chooseNoDefence(app.state);
    refreshApp();
    return;
  }

  Engine.prepareDefence(app.state, decision.handIndex);
  Engine.callDefenceCoin(app.state);
  refreshApp();
}

function scheduleCall(currentApp, delay, callback) {
  const timeoutId = window.setTimeout(() => {
    currentApp.timers.delete(timeoutId);
    callback();
  }, delay);

  currentApp.timers.add(timeoutId);
}

function clearScheduledCalls(currentApp) {
  currentApp.timers.forEach((timeoutId) => window.clearTimeout(timeoutId));
  currentApp.timers.clear();
  hideMoveToast();
}

function renderApp(currentApp) {
  if (!currentApp.state) {
    return;
  }

  processNewMatchLog(currentApp.state);
  renderDirector(currentApp.state);
  renderSequence(currentApp.state);
  renderWrestlerPanel(currentApp.state, "player", dom.wrestlerPanels.player);
  renderWrestlerPanel(currentApp.state, "enemy", dom.wrestlerPanels.enemy);
  renderHand(currentApp);
  renderRecentEvents(currentApp.state);
  renderMatchLog(currentApp.state);
  maybeShowRollOffModal(currentApp.state);
}

function processNewMatchLog(state) {
  const startIndex = Math.max(0, app.ui.lastHandledLogIndex);
  const newEntries = state.log.slice(startIndex);
  app.ui.lastHandledLogIndex = state.log.length;

  for (const entry of newEntries) {
    if (entry.startsWith("LOG_STATE ")) {
      continue;
    }

    maybeHandlePinCountFromLogEntry(entry);

    const toast = moveToastMessageFromLogEntry(entry);
    if (toast) {
      showMoveToast(toast);
    }
  }
}

function maybeHandlePinCountFromLogEntry(entry) {
  const countMatch = entry.match(/^Count\s+(\d+):\s+(Fail|Kickout)\./i);
  if (!countMatch) {
    return;
  }

  const card = countMatch[2].toLowerCase();
  if (card === "kickout") {
    startPinCountOverlay("KICKOUT!!");
    return;
  }

  const failCount = Number(countMatch[1] || 1);
  startPinCountOverlay(String(failCount));
}

function moveToastMessageFromLogEntry(entry) {
  const playMatch = entry.match(/^(.+?) plays (.+?) into slot \d+/);
  if (playMatch) {
    return `${playMatch[1].trim()} used ${playMatch[2].trim()}!`;
  }

  const attackSuccessSuffix = "'s turn ends immediately.";
  if (entry.endsWith(attackSuccessSuffix) && /\s(reverses|dodges)\s/.test(entry)) {
    const head = entry.slice(0, -attackSuccessSuffix.length);
    const lastClauseBreak = head.lastIndexOf(". ");
    if (lastClauseBreak !== -1) {
      const defenceClause = head.slice(0, lastClauseBreak);
      const clauseMatch = defenceClause.match(/^(.+?) (reverses|dodges) (.+)$/);
      if (clauseMatch) {
        const who = clauseMatch[1].trim();
        return clauseMatch[2] === "reverses" ? `${who} used a reversal!` : `${who} used a dodge!`;
      }
    }
  }

  const pinReverse = entry.match(/^(.+?) reverses the pin onto (.+)\.$/);
  if (pinReverse) {
    return `${pinReverse[1].trim()} used a reversal!`;
  }

  const pinDodge = entry.match(/^(.+?) dodges the pin from (.+)\.$/);
  if (pinDodge) {
    return `${pinDodge[1].trim()} used a dodge!`;
  }

  return null;
}

function showMoveToast(message) {
  if (!dom.moveToast) {
    return;
  }

  window.clearTimeout(app.ui.moveToastTimer);
  dom.moveToast.textContent = message;
  dom.moveToast.hidden = false;
  dom.moveToast.classList.remove("move-toast--visible");
  void dom.moveToast.offsetWidth;
  dom.moveToast.classList.add("move-toast--visible");

  app.ui.moveToastTimer = window.setTimeout(() => {
    hideMoveToast();
  }, 2800);
}

function hideMoveToast() {
  window.clearTimeout(app.ui.moveToastTimer);
  app.ui.moveToastTimer = null;
  if (!dom.moveToast) {
    return;
  }
  dom.moveToast.classList.remove("move-toast--visible");
  dom.moveToast.hidden = true;
  dom.moveToast.textContent = "";
}

function startPinCountOverlay(value) {
  if (!dom.pinCountOverlay || !dom.pinCountValue) {
    return;
  }

  stopPinCountOverlay();
  app.ui.pinCountRunning = true;
  dom.pinCountOverlay.hidden = false;

  setPinCountOverlayValue(value);

  app.ui.pinCountTimers.push(
    window.setTimeout(() => {
      app.ui.pinCountRunning = false;
      dom.pinCountOverlay.hidden = true;
      app.ui.pinCountTimers = [];
    }, 1000)
  );
}

function stopPinCountOverlay() {
  if (!dom.pinCountOverlay) {
    return;
  }

  app.ui.pinCountTimers.forEach((timerId) => window.clearTimeout(timerId));
  app.ui.pinCountTimers = [];
  app.ui.pinCountRunning = false;
  dom.pinCountOverlay.hidden = true;
}

function setPinCountOverlayValue(text) {
  if (!dom.pinCountValue) {
    return;
  }

  dom.pinCountValue.textContent = text;
  dom.pinCountValue.classList.remove("pin-count-overlay__value--animate");
  void dom.pinCountValue.offsetWidth;
  dom.pinCountValue.classList.add("pin-count-overlay__value--animate");
}

function renderDirector(state) {
  const attacker = state.match.over ? null : Engine.getCurrentAttacker(state);
  const slotLabel = state.match.over
    ? "Match complete"
    : state.phase === Engine.PHASES.PINFALL_DRAW
      ? "Pinfall draw"
      : state.phase === Engine.PHASES.TURN_END
        ? "Turn ended"
      : `Slot ${Math.min(state.turn.nextSlot, 3)} of 3`;

  dom.directorTitle.textContent = attacker ? `${attacker.name} / ${slotLabel}` : "UnderCard / Match complete";
  dom.directorSubtitle.textContent = buildDirectorSubtitle(state);
  dom.directorPrimary.hidden = true;
  dom.directorPrimary.disabled = true;
  dom.directorPrimary.onclick = null;

  if (state.match.over) {
    dom.outcomeBanner.hidden = false;
    dom.outcomeBanner.textContent = state.match.winnerKey === "player" ? "You win" : "You lose";
    dom.outcomeBanner.className =
      state.match.winnerKey === "player"
        ? "outcome-banner outcome-banner--win"
        : "outcome-banner outcome-banner--lose";
    return;
  }

  dom.outcomeBanner.hidden = true;
  dom.outcomeBanner.className = "outcome-banner";
}

function buildDirectorSubtitle(state) {
  if (state.match.over) {
    return state.match.reason;
  }

  if (state.phase === Engine.PHASES.PINFALL_DRAW) {
    const pinned = state.players[state.pinAttempt.defenderKey];
    return `${pinned.name} draws pinfall cards one at a time.`;
  }

  if (state.phase === Engine.PHASES.TURN_END) {
    return state.status || lastLogLine(state);
  }

  if (state.phase === Engine.PHASES.RESOLVE_ATTACK && state.resolution?.awaitingDefenceChoice) {
    return `${state.players[state.resolution.defenderKey].name} chooses dodge, reversal, or no defence.`;
  }

  if (state.phase === Engine.PHASES.PIN_DEFENCE_DECISION && state.resolution?.awaitingDefenceChoice) {
    return `${state.players[state.resolution.defenderKey].name} chooses how to answer the pin.`;
  }

  if (state.phase === Engine.PHASES.CHOOSE_NEXT_ACTION) {
    return `${Engine.getCurrentAttacker(state).name} can play only into the next open slot.`;
  }

  return state.status || lastLogLine(state);
}

function renderSequence(state) {
  const activeSlot = getActiveSlot(state);
  const actionModel = buildActionModel(state);

  dom.sequenceCombo.textContent = "";
  dom.sequenceSlots.replaceChildren();

  const track = document.createElement("div");
  track.className = "sequence-track";

  state.turn.slots.forEach((slotEntry) => {
    track.appendChild(buildSequenceTrackSlot(buildSequenceSlotModel(state, slotEntry, activeSlot), activeSlot));
  });

  dom.sequenceSlots.appendChild(track);
  dom.sequenceSlots.appendChild(buildSequenceFooter(state, actionModel.buttons));
}

function buildSequenceFooter(state, actionButtons) {
  const footer = document.createElement("div");
  footer.className = "sequence-footer";

  const controls = document.createElement("div");
  controls.className = "sequence-controls";

  if (actionButtons.length > 0) {
    controls.appendChild(buildSequenceActionButtons(actionButtons));
    footer.appendChild(controls);
    return footer;
  }

  const continueButton = buildSequenceContinueButton(state);
  controls.appendChild(continueButton);
  footer.appendChild(controls);

  return footer;
}

function buildSequenceContinueButton(state) {
  const button = document.createElement("button");
  const actionable = Boolean(app.ui.pendingContinueAction) && !state.match.over;
  button.type = "button";
  button.className = "sequence-continue";
  button.textContent = "Continue";
  button.disabled = !actionable;
  button.hidden = !actionable;
  button.addEventListener("click", () => {
    if (!app.ui.pendingContinueAction) {
      return;
    }
    app.ui.pendingContinueAction();
  });
  return button;
}

function buildSequenceActionButtons(buttonModels) {
  const container = document.createElement("div");
  container.className = "action-buttons sequence-action-buttons";

  buttonModels.forEach((buttonModel) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `action-button ${buttonModel.tone || "action-button--primary"}`;
    button.textContent = buttonModel.label;
    button.disabled = Boolean(buttonModel.disabled);
    button.addEventListener("click", buttonModel.onClick);
    container.appendChild(button);
  });

  return container;
}

function getActiveSlot(state) {
  if (state.pinAttempt) {
    return state.pinAttempt.slot;
  }

  if (state.resolution) {
    return state.resolution.slot;
  }

  if (state.turn.nextSlot <= 3) {
    return state.turn.nextSlot;
  }

  return 3;
}

function pickFocusSlot(state, activeSlot) {
  if (activeSlot && state.turn.slots[activeSlot - 1]) {
    return state.turn.slots[activeSlot - 1];
  }

  for (let index = state.turn.slots.length - 1; index >= 0; index -= 1) {
    if (state.turn.slots[index].card) {
      return state.turn.slots[index];
    }
  }

  return state.turn.slots[0];
}

function buildSequenceSlotModel(state, slotEntry, activeSlot) {
  const isCurrent = activeSlot === slotEntry.slot && !state.match.over;

  if (slotEntry.card) {
    return {
      slot: slotEntry.slot,
      current: isCurrent,
      title: "",
      image: slotEntry.card.image || "",
      rarity: capitalize(slotEntry.card.rarity || "common"),
      damage: slotEntry.card.type === "attack" ? Number(slotEntry.card.damage || 0) : null,
      type: capitalize(slotEntry.card.type),
      stateLabel: "",
      meta: "",
      result: slotEntry.result,
      variant:
        slotEntry.onSlot === false
          ? "offslot"
          : slotEntry.countedForCombo || slotEntry.card.type === "pin"
            ? "success"
            : slotEntry.result === "Resolving"
              ? "live"
              : "stopped"
    };
  }

  if (slotEntry.slot === activeSlot) {
    return {
      slot: slotEntry.slot,
      current: true,
      title: state.turn.attackerKey === "player" ? "Choose card" : "Incoming",
      image: "",
      rarity: null,
      damage: null,
      type: "",
      stateLabel: "",
      meta: "",
      result: "",
      variant: "live"
    };
  }

  return {
    slot: slotEntry.slot,
    current: false,
    title: "Waiting",
    image: "",
    rarity: null,
    damage: null,
    type: "",
    stateLabel: "",
    meta: "",
    result: "",
    variant: slotEntry.slot < activeSlot ? "open" : "locked"
  };
}

function buildSequenceTrackSlot(model, activeSlot) {
  const slot = document.createElement("div");
  slot.className = [
    "sequence-track__slot",
    activeSlot === model.slot ? "sequence-track__slot--current" : "",
    model.variant ? `sequence-track__slot--${model.variant}` : ""
  ]
    .filter(Boolean)
    .join(" ");

  const number = document.createElement("span");
  number.className = "sequence-track__number";
  number.textContent = String(model.slot);
  slot.appendChild(number);

  if (model.image) {
    const image = document.createElement("img");
    image.className = "sequence-track__image";
    image.src = model.image;
    image.alt = model.title || `Slot ${model.slot} card`;
    image.loading = "lazy";
    slot.appendChild(image);
  }

  if (model.title) {
    const title = document.createElement("span");
    title.className = "sequence-track__title";
    title.textContent = model.title;
    slot.appendChild(title);
  }

  return slot;
}

function buildSequenceFocusCard(model) {
  const card = document.createElement("article");
  card.className = [
    "sequence-focus",
    model.variant ? `sequence-focus--${model.variant}` : "",
    model.current ? "sequence-focus--current" : ""
  ]
    .filter(Boolean)
    .join(" ");

  const badge = document.createElement("p");
  badge.className = "sequence-focus__slot";
  badge.textContent = `Slot ${model.slot}`;
  card.appendChild(badge);

  const stateLine = document.createElement("p");
  stateLine.className = "sequence-focus__state";
  stateLine.textContent = model.stateLabel;
  card.appendChild(stateLine);

  if (model.type) {
    const type = document.createElement("p");
    type.className = "sequence-focus__type";
    type.textContent = model.type;
    card.appendChild(type);
  }

  const title = document.createElement("h3");
  title.className = "sequence-focus__title";
  title.textContent = model.title;
  card.appendChild(title);

  if (model.meta) {
    const meta = document.createElement("p");
    meta.className = "sequence-focus__meta";
    meta.textContent = model.meta;
    card.appendChild(meta);
  }

  if (model.result && model.result !== model.stateLabel) {
    const result = document.createElement("p");
    result.className = "sequence-focus__result";
    result.textContent = model.result;
    card.appendChild(result);
  }

  return card;
}

function buildActionModel(state) {
  if (state.match.over) {
    return {
      title: "Match Over",
      text: state.match.reason,
      outcome: "Reset to play again.",
      phase: "Result",
      buttons: []
    };
  }

  if (state.phase === Engine.PHASES.PINFALL_DRAW) {
    const pinned = state.players[state.pinAttempt.defenderKey];
    const attacker = state.players[state.pinAttempt.attackerKey];

    return {
      title: "Pinfall Draw",
      text: `${pinned.name} is pinned by ${attacker.name}.`,
      outcome: `Kickout ends the pin. Three Fail cards end the match. ${state.pinAttempt.drawnCards.length} drawn so far.`,
      phase: `Count ${state.pinAttempt.drawnCards.length} / ${Engine.constants.PIN_DRAW_COUNT}`,
      buttons: [
        {
          label: "Draw Next Card",
          tone: "action-button--primary",
          onClick: () => {
            Engine.drawNextPinfallCard(app.state);
            refreshApp();
          }
        }
      ]
    };
  }

  if (state.phase === Engine.PHASES.TURN_END) {
    return {
      title: "Turn Ended",
      text: state.status || lastLogLine(state),
      outcome: "Advancing to the next turn.",
      phase: "Turn end",
      buttons: []
    };
  }

  if (state.phase === Engine.PHASES.RESOLVE_ATTACK && state.resolution?.defenderKey === "player") {
    return buildPlayerDefenceModel(state, false);
  }

  if (state.phase === Engine.PHASES.PIN_DEFENCE_DECISION && state.resolution?.defenderKey === "player") {
    return buildPlayerDefenceModel(state, true);
  }

  if (state.phase === Engine.PHASES.CHOOSE_NEXT_ACTION && state.turn.attackerKey === "player") {
    return {
      title: `Slot ${state.turn.nextSlot}: Your Move`,
      text: "Play an attack, taunt, or pin into the next sequential slot.",
      outcome: "You can stop early whenever you want.",
      phase: "Offensive sequence",
      buttons: []
    };
  }

  if (state.turn.attackerKey === "enemy") {
    const phase =
      state.phase === Engine.PHASES.RESOLVE_ATTACK || state.phase === Engine.PHASES.PIN_DEFENCE_DECISION
        ? "Enemy response"
        : "Enemy turn";

    return {
      title: "Stand By",
      text: `${state.players.enemy.name} is resolving the current turn.`,
      outcome: lastLogLine(state),
      phase,
      buttons: []
    };
  }

  return {
    title: "Resolving",
    text: state.status || "Working through the current state.",
    outcome: lastLogLine(state),
    phase: "State machine",
    buttons: []
  };
}

function buildPlayerDefenceModel(state, isPin) {
  const attackCard = state.resolution.card;

  return {
    title: isPin ? "Pin Incoming" : `Defend Slot ${state.resolution.slot}`,
    text: isPin
      ? `${attackCard.name} has been played. Play a dodge/reversal from hand, or take the pin.`
      : `${attackCard.name} is ${state.resolution.onSlot ? "on-slot" : "off-slot"} for ${attackCard.damage} damage.`,
    outcome: isPin
      ? "A successful reversal flips the same pin back."
      : state.resolution.onSlot
        ? "No defence or a failed defence lets the attack land."
        : "Off-slot attack: the defender has advantage on the roll-off.",
    phase: isPin ? "Pin defence" : "Attack defence",
    buttons: [
      {
        label: isPin ? "No Defence" : "Take Hit",
        tone: "action-button--take",
        onClick: () => {
          Engine.chooseNoDefence(app.state);
          refreshApp();
        }
      }
    ]
  };
}

function renderWrestlerPanel(state, wrestlerKey, panelDom) {
  const wrestler = state.players[wrestlerKey];
  const isAttacker = !state.match.over && state.turn.attackerKey === wrestlerKey;
  const pinSummary = Engine.getPinfallSummary(wrestler);
  const pinChance = calculatePinChance(pinSummary.fail, pinSummary.total);

  panelDom.name.textContent = wrestler.name;
  panelDom.role.textContent = "";
  panelDom.role.hidden = true;
  panelDom.card.classList.toggle("wrestler-block--attacker", isAttacker);
  panelDom.stats.innerHTML = `
    <span class="stat-pill">DMG ${wrestler.damage}</span>
    <span class="stat-pill">HAND ${wrestler.hand.length}</span>
    <span class="stat-pill">DECK ${wrestler.maneuverDeck.length}</span>
  `;
  panelDom.pin.innerHTML = `
    <button type="button" class="stat-pill stat-pill--pin" aria-label="Open pin breakdown">
      PIN ${formatPercent(pinChance)}
    </button>
  `;
  panelDom.pin.querySelector(".stat-pill--pin")?.addEventListener("click", () => {
    openPinModal(state, wrestlerKey);
  });
  const statusLine = buildWrestlerStatusLine(state, wrestlerKey);
  panelDom.status.textContent = statusLine;
  panelDom.status.hidden = !statusLine;
  panelDom.card.dataset.state = pickPanelState(pinChance, wrestler.damage);
}

function buildWrestlerStatusLine(state, wrestlerKey) {
  const labels = [];

  return labels.join(" / ");
}

function pickPanelState(pinChance, damage) {
  if (pinChance >= 0.35 || damage >= 20) {
    return "danger";
  }

  if (pinChance >= 0.18 || damage >= 10) {
    return "warning";
  }

  return "steady";
}

function calculatePinChance(failCount, totalCount) {
  if (failCount < 3 || totalCount < 3) {
    return 0;
  }

  let chance = 1;
  for (let index = 0; index < 3; index += 1) {
    chance *= (failCount - index) / (totalCount - index);
  }

  return chance;
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function renderHand(currentApp) {
  const state = currentApp.state;
  const player = state.players.player;
  const pinSummary = Engine.getPinfallSummary(player);

  const canStop = canPlayerStopEarly(state);
  dom.handMenuButton.hidden = state.match.over;
  dom.handMenuButton.disabled = state.match.over;
  dom.handMenuStopEarly.disabled = !canStop;

  dom.playerPinSummary.textContent = `Fail ${pinSummary.fail} / Kickout ${pinSummary.kickout}`;
  dom.drawPileCount.textContent = `Deck ${player.maneuverDeck.length} / Discard ${player.discardPile.length}`;
  dom.handCards.replaceChildren();

  if (player.hand.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Hand is empty.";
    dom.handCards.appendChild(empty);
    return;
  }

  const entries = player.hand.map((card, handIndex) => {
    return {
      card,
      handIndex,
      mode: getPlayerHandMode(state, card),
      category: getCardCategory(card)
    };
  });

  const ordered = sortHandEntries(state, entries);
  if (ordered.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Nothing here.";
    dom.handCards.appendChild(empty);
    return;
  }

  ordered.forEach((entry) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = [
      "hand-card",
      `hand-card--${entry.card.type}`,
      entry.mode.clickable ? "hand-card--live" : "hand-card--inactive",
      entry.mode.offSlot ? "hand-card--offslot" : "",
      entry.mode.validSlot ? "hand-card--valid" : ""
    ]
      .filter(Boolean)
      .join(" ");
    button.dataset.handIndex = String(entry.handIndex);
    button.setAttribute("aria-disabled", entry.mode.clickable ? "false" : "true");
    button.innerHTML = `
      <div class="hand-card__front">
        <span class="hand-card__type hand-card__type--${entry.card.type}">${capitalize(entry.card.type)}</span>
        <span class="hand-card__title">${entry.card.name}</span>
      </div>
    `;
    button.addEventListener("click", () => openCardModal(currentApp, entry));
    dom.handCards.appendChild(button);
  });
}

function getPlayerHandMode(state, card) {
  if (state.match.over || state.phase === Engine.PHASES.PINFALL_DRAW) {
    return { clickable: false, reason: "Finish the current step." };
  }

  if (state.resolution?.defenderKey === "player" && state.resolution.awaitingDefenceChoice) {
    return Engine.DEFENSIVE_TYPES.has(card.type)
      ? { clickable: true, reason: "Use this to defend." }
      : { clickable: false, reason: "Not a defence card." };
  }

  if (state.turn.attackerKey !== "player" || state.phase !== Engine.PHASES.CHOOSE_NEXT_ACTION) {
    return { clickable: false, reason: "Wait for your turn." };
  }

  if (!Engine.OFFENSIVE_TYPES.has(card.type)) {
    return { clickable: false, reason: "Hold this for defence." };
  }

  if (card.type === "pin") {
    return { clickable: true, reason: "Pins are slot-agnostic.", validSlot: true };
  }

  const onSlot = Engine.doesCardMatchSlot(card, state.turn.nextSlot);
  return onSlot
    ? { clickable: true, reason: "Correct slot.", validSlot: true }
    : { clickable: true, reason: "Off-slot but still legal.", offSlot: true };
}

function getCardCategory(card) {
  if (Engine.DEFENSIVE_TYPES.has(card.type)) {
    return "defense";
  }

  if (card.type === "pin") {
    return "pin";
  }

  return "offense";
}

function sortHandEntries(state, entries) {
  const order =
    state.resolution?.defenderKey === "player" && state.resolution.awaitingDefenceChoice
      ? ["dodge", "reversal", "attack", "taunt", "pin"]
      : ["attack", "taunt", "pin", "dodge", "reversal"];

  return [...entries].sort((left, right) => {
    if (left.mode.clickable !== right.mode.clickable) {
      return left.mode.clickable ? -1 : 1;
    }

    return order.indexOf(left.card.type) - order.indexOf(right.card.type);
  });
}

function renderRecentEvents(state) {
  dom.recentEventsList.replaceChildren();
  const recent = state.log.filter((entry) => !entry.startsWith("LOG_STATE ")).slice(-4);

  if (recent.length === 0) {
    const item = document.createElement("li");
    item.textContent = "Nothing yet.";
    dom.recentEventsList.appendChild(item);
    return;
  }

  recent.forEach((entry) => {
    const item = document.createElement("li");
    item.textContent = entry;
    dom.recentEventsList.appendChild(item);
  });
}

function renderMatchLog(state) {
  dom.matchLogList.replaceChildren();

  state.log.forEach((entry) => {
    const item = document.createElement("li");
    if (entry.startsWith("LOG_STATE ")) {
      const code = document.createElement("code");
      code.textContent = entry.slice("LOG_STATE ".length);
      item.appendChild(code);
    } else {
      item.textContent = entry;
    }
    dom.matchLogList.appendChild(item);
  });
}

function openLogModal() {
  closeCardModal();
  closeHandMenuModal();
  dom.logModal.hidden = false;
  syncModalState();
}

function closeLogModal() {
  dom.logModal.hidden = true;
  syncModalState();
}

function openPinModal(state, wrestlerKey) {
  if (!dom.pinModal || !dom.pinModalTitle || !dom.pinModalStats) {
    return;
  }

  const wrestler = state.players[wrestlerKey];
  const pinSummary = Engine.getPinfallSummary(wrestler);

  dom.pinModalTitle.textContent = wrestler.name;
  dom.pinModalStats.textContent = `Fail ${pinSummary.fail} / Kickout ${pinSummary.kickout}`;
  dom.pinModal.hidden = false;
  syncModalState();
}

function closePinModal() {
  if (!dom.pinModal) {
    return;
  }

  dom.pinModal.hidden = true;
  syncModalState();
}

function openCardModal(currentApp, entry) {
  const { state } = currentApp;
  const card = entry.card;
  const cardReason = entry.mode.reason || "";

  closeLogModal();
  closeHandMenuModal();
  dom.cardModalType.textContent = capitalize(card.type);
  dom.cardModalTitle.textContent = card.name;
  dom.cardModalMeta.textContent = formatCardSlot(card);
  dom.cardModalValue.textContent = `${formatCardPrimaryLabel(card)} ${formatCardPrimaryValue(card)}`;
  dom.cardModalReason.textContent = cardReason;
  dom.cardModalReason.hidden = !cardReason;
  dom.cardModalEffect.textContent = describeCard(card);

  if (entry.mode.clickable) {
    dom.cardModalAction.hidden = false;
    dom.cardModalAction.disabled = false;
    dom.cardModalAction.textContent =
      state.resolution?.defenderKey === "player" && state.resolution.awaitingDefenceChoice
        ? `Use ${card.name}`
        : `Play ${card.name}`;
    dom.cardModalAction.onclick = () => {
      closeCardModal();

      if (state.resolution?.defenderKey === "player" && state.resolution.awaitingDefenceChoice) {
        Engine.prepareDefence(app.state, entry.handIndex);
        Engine.callDefenceCoin(app.state);
        refreshApp();
        return;
      }

      Engine.playOffensiveCard(app.state, entry.handIndex, "player");
      refreshApp();
    };
  } else {
    dom.cardModalAction.hidden = true;
    dom.cardModalAction.disabled = true;
    dom.cardModalAction.onclick = null;
  }

  dom.cardModal.hidden = false;
  syncModalState();
}

function closeCardModal() {
  if (!dom.cardModal) {
    return;
  }

  dom.cardModal.hidden = true;
  dom.cardModalAction.onclick = null;
  syncModalState();
}

function maybeShowRollOffModal(state) {
  const rollOff = state.lastDefenceRoll;
  if (!rollOff || rollOff.id <= app.ui.lastShownRollOffId) {
    return;
  }

  app.ui.lastShownRollOffId = rollOff.id;
  resetRollOffVisualState();
  dom.rollOffTitle.textContent = capitalize(rollOff.defenceChoice || "roll-off");
  dom.rollOffAttackerName.textContent = rollOff.attackerName;
  dom.rollOffAttackerRoll.textContent = "?";
  dom.rollOffDefenderName.textContent = rollOff.defenderName;
  dom.rollOffDefenderRoll.textContent = "?";
  dom.rollOffResult.textContent = "Rolling...";
  dom.rollOffModal.hidden = false;
  syncModalState();

  clearRollOffAnimationTimers();
  animateRollOffValue(dom.rollOffAttackerRoll, rollOff.attackerRoll, 1050);
  animateRollOffValue(dom.rollOffDefenderRoll, rollOff.defenderRoll, 1450, () => {
    renderDefenderRollBreakdown(rollOff);
  });
  scheduleRollOffTimer(() => {
    const attackerWon = rollOff.winnerName === rollOff.attackerName;
    dom.rollOffAttackerCard?.classList.toggle("rolloff-modal__fighter--winner", attackerWon);
    dom.rollOffAttackerCard?.classList.toggle("rolloff-modal__fighter--loser", !attackerWon);
    dom.rollOffDefenderCard?.classList.toggle("rolloff-modal__fighter--winner", !attackerWon);
    dom.rollOffDefenderCard?.classList.toggle("rolloff-modal__fighter--loser", attackerWon);
    dom.rollOffResult.textContent = `${rollOff.winnerName} wins the roll-off`;
  }, 1520);
}

function closeRollOffModal() {
  if (!dom.rollOffModal) {
    return;
  }
  clearRollOffAnimationTimers();
  resetRollOffVisualState();
  dom.rollOffModal.hidden = true;
  syncModalState();
}

function openHandMenuModal() {
  if (!dom.handMenuModal || dom.handMenuButton?.disabled) {
    return;
  }
  closeLogModal();
  closeCardModal();
  closeRollOffModal();
  dom.handMenuModal.hidden = false;
  syncModalState();
}

function closeHandMenuModal() {
  if (!dom.handMenuModal) {
    return;
  }
  dom.handMenuModal.hidden = true;
  syncModalState();
}

function syncModalState() {
  const anyModalOpen =
    (dom.logModal && !dom.logModal.hidden) ||
    (dom.cardModal && !dom.cardModal.hidden) ||
    (dom.pinModal && !dom.pinModal.hidden) ||
    (dom.rollOffModal && !dom.rollOffModal.hidden) ||
    (dom.handMenuModal && !dom.handMenuModal.hidden);
  document.body.classList.toggle("modal-open", Boolean(anyModalOpen));
}

function animateRollOffValue(node, finalValue, totalDurationMs, onComplete) {
  let elapsed = 0;

  const tick = () => {
    const progress = Math.min(elapsed / totalDurationMs, 1);
    if (progress >= 1) {
      if (onComplete) {
        onComplete();
      } else {
        node.textContent = String(finalValue);
      }
      return;
    }

    node.textContent = String(1 + Math.floor(Math.random() * 20));
    const delay = Math.round(26 + 180 * progress * progress);
    elapsed += delay;
    scheduleRollOffTimer(tick, delay);
  };

  tick();
}

function renderDefenderRollBreakdown(rollOff) {
  if (!Array.isArray(rollOff.defenderRolls) || rollOff.defenderRolls.length <= 1) {
    dom.rollOffDefenderRoll.textContent = String(rollOff.defenderRoll);
    return;
  }

  const [firstRoll, secondRoll] = rollOff.defenderRolls;
  let mutedIndex = -1;
  if (firstRoll !== secondRoll) {
    mutedIndex = firstRoll < secondRoll ? 0 : 1;
  }

  dom.rollOffDefenderRoll.innerHTML = `
    <span class="rolloff-modal__roll-value ${mutedIndex === 0 ? "rolloff-modal__roll-value--muted" : ""}">${firstRoll}</span>
    <span class="rolloff-modal__roll-separator">/</span>
    <span class="rolloff-modal__roll-value ${mutedIndex === 1 ? "rolloff-modal__roll-value--muted" : ""}">${secondRoll}</span>
  `;
}

function scheduleRollOffTimer(callback, delayMs) {
  const timeoutId = window.setTimeout(() => {
    app.ui.rollOffTimers = app.ui.rollOffTimers.filter((id) => id !== timeoutId);
    callback();
  }, delayMs);
  app.ui.rollOffTimers.push(timeoutId);
}

function clearRollOffAnimationTimers() {
  app.ui.rollOffTimers.forEach((timeoutId) => window.clearTimeout(timeoutId));
  app.ui.rollOffTimers = [];
}

function resetRollOffVisualState() {
  dom.rollOffAttackerCard?.classList.remove("rolloff-modal__fighter--winner", "rolloff-modal__fighter--loser");
  dom.rollOffDefenderCard?.classList.remove("rolloff-modal__fighter--winner", "rolloff-modal__fighter--loser");
}

function formatCardSlot(card) {
  if (card.validSlot === "any") {
    return card.type === "pin" ? "Pin / Any slot" : "Any slot";
  }

  if (card.validSlot === null || card.validSlot === undefined) {
    return "Defense";
  }

  return `Slot ${card.validSlot}`;
}

function formatCardPrimaryValue(card) {
  if (card.type === "attack") {
    return String(card.damage || 0);
  }

  if (card.type === "taunt") {
    return "SETUP";
  }

  if (card.type === "pin") {
    return "PIN";
  }

  return "DEF";
}

function formatCardPrimaryLabel(card) {
  if (card.type === "attack") {
    return "Damage";
  }

  if (card.type === "taunt") {
    return "Taunt";
  }

  if (card.type === "pin") {
    return "Pin";
  }

  return "Defense";
}

function describeCard(card) {
  const parts = [];

  if (card.type === "attack") {
    parts.push(`Deals ${card.damage} damage.`);
  }

  if (card.type === "taunt") {
    parts.push(`Undefendable taunt for slot ${card.validSlot}.`);
  }

  if (card.type === "pin") {
    parts.push("Slot-agnostic. Ends the offensive sequence immediately.");
  }

  if (card.onSlotEffect?.length) {
    parts.push(`On-slot: ${formatEffects(card.onSlotEffect)}.`);
  }

  if (card.offSlotEffect?.length || card.type === "taunt") {
    parts.push(`Off-slot: ${card.offSlotEffect?.length ? formatEffects(card.offSlotEffect) : "No effect"}.`);
  }

  if (card.onHitEffects?.length) {
    parts.push(`On hit: ${formatEffects(card.onHitEffects)}.`);
  }

  if (card.onPinEffects?.length) {
    parts.push(`On pin: ${formatEffects(card.onPinEffects)}.`);
  }

  if (card.afterUse === "exhaust") {
    parts.push("Exhausts after use.");
  }

  return parts.join(" ");
}

function formatEffects(effects) {
  return effects
    .map((effect) => {
      if (effect.type === "add_pinfall" || effect.type === "pinfall") {
        return `add ${effect.amount || 1} ${effect.card} to ${effect.target === "self" ? "your" : "their"} pinfall deck`;
      }

      if (effect.type === "modify_damage") {
        const amount = Number(effect.amount || 0);
        return `${amount >= 0 ? "+" : ""}${amount} damage`;
      }

      return effect.type;
    })
    .join(", ");
}

function canPlayerStopEarly(state) {
  return Boolean(
    state &&
      !state.match.over &&
      state.phase === Engine.PHASES.CHOOSE_NEXT_ACTION &&
      state.turn.attackerKey === "player"
  );
}

function shortenCardName(name) {
  return name.length > 16 ? `${name.slice(0, 14)}…` : name;
}

function formatDefenceSummary(defence) {
  if (defence.choice === "none") {
    return "No defence";
  }

  if (defence.success === null) {
    return `${capitalize(defence.choice)} readied`;
  }

  return `${capitalize(defence.choice)} ${defence.success ? "success" : "failed"}`;
}

function lastLogLine(state) {
  for (let index = state.log.length - 1; index >= 0; index -= 1) {
    const entry = state.log[index];
    if (!entry.startsWith("LOG_STATE ")) {
      return entry;
    }
  }
  return "";
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
