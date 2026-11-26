'use strict';

const form = document.querySelector('#annotation-form');
const color = document.querySelector('#mark-color');
const textField = document.querySelector('#text-field');
const markText = document.querySelector('#mark-text');
const instructions = document.querySelector('#board-instructions');
const start = document.querySelector('#start');
const undo = document.querySelector('#undo');
const clear = document.querySelector('#clear');
const statusMessage = document.querySelector('#status');
const engineToggle = document.querySelector('#engine-toggle');
const engineStatus = document.querySelector('#engine-status');

const noBoard = 'Откройте страницу с шахматной доской на Chess.com или Lichess.';
const unsupportedPage = 'Разметка доступна на Chess.com и Lichess.';
const noConnection = 'Не удалось подключиться к доске. Обновите вкладку и снова откройте меню.';
const toolInstructions = {
  arrow: 'Укажите начало и конец стрелки на доске.',
  rectangle: 'Нажмите на клетку, которую хотите выделить.',
  text: 'Нажмите на клетку, где должна появиться метка.'
};
const engineMessages = {
  idle: 'Запуск анализа…',
  waiting: 'Ожидание позиции…',
  thinking: 'Анализ позиции…',
  'no-moves': 'В этой позиции нет доступных ходов.',
  error: 'Не удалось выполнить анализ.'
};
const readyMessages = [
  'Анализ завершён.',
  'На доске показан лучший ход.',
  'На доске показаны два лучших хода.',
  'На доске показаны три лучших хода.'
];

let tabId;
let hasBoard = false;
let count = 0;
let busy = true;
let enginePoll;
let engineRevision = 0;
const engine = { available: false, enabled: false, state: 'idle', count: 0, pending: false, message: '' };

function selectedShape() {
  return form.elements.shape.value;
}

function updateTool() {
  const shape = selectedShape();
  const acceptsText = shape === 'text';
  textField.hidden = !acceptsText;
  markText.disabled = !acceptsText;
  markText.required = acceptsText;
  markText.setCustomValidity('');
  instructions.textContent = `${toolInstructions[shape]} Клавиша Esc отменяет выбор.`;
  start.textContent = shape === 'arrow' ? 'Выбрать клетки' : 'Выбрать клетку';
}

function updateButtons() {
  start.disabled = busy || !hasBoard;
  undo.disabled = start.disabled || count === 0;
  clear.disabled = undo.disabled;
}

function describeEngine() {
  if (engine.pending) return engine.enabled ? 'Выключение…' : 'Включение…';
  if (engine.message) return engine.message;
  if (!engine.available) return 'Доступно только на странице анализа.';
  if (engine.state === 'error') return engineMessages.error;
  if (!engine.enabled) return 'Показывает до трёх лучших ходов на доске.';
  if (engine.state === 'ready') return readyMessages[engine.count] || readyMessages[0];
  return engineMessages[engine.state] || engineMessages.idle;
}

function updateEngine() {
  engineToggle.disabled = !hasBoard || !engine.available || engine.pending;
  engineToggle.setAttribute('aria-checked', String(engine.enabled));
  const message = describeEngine();
  if (engineStatus.textContent !== message) engineStatus.textContent = message;

  clearTimeout(enginePoll);
  if (engine.enabled && !engine.pending && !engine.message && ['idle', 'waiting', 'thinking'].includes(engine.state)) {
    enginePoll = setTimeout(pollEngine, 650);
  }
}

function setEngineStatus(response) {
  engine.available = response.engineAvailable ?? engine.available;
  engine.enabled = engine.available && response.engineEnabled === true;
  engine.state = response.engineState ?? 'idle';
  engine.count = response.engineCount;
  engine.message = '';
}

function loseBoard(message) {
  hasBoard = false;
  statusMessage.textContent = message;
  engineRevision++;
  setEngineStatus({ engineAvailable: false });
  updateButtons();
  updateEngine();
}

async function send(message) {
  if (!Number.isInteger(tabId)) throw new Error('No active tab');
  return chrome.tabs.sendMessage(tabId, message);
}

function isSupportedPage(address) {
  const { protocol, hostname } = new URL(address || 'about:blank');
  return protocol === 'https:' && ['chess.com', 'lichess.org'].some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
  );
}

async function readBoardStatus() {
  const message = { type: 'board-notes:status' };
  try {
    return await send(message);
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['UniversalBoardDrawer.js', 'content.js']
    });
    return send(message);
  }
}

async function connect() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!isSupportedPage(tab?.url)) {
      statusMessage.textContent = unsupportedPage;
      return;
    }
    tabId = tab?.id;
    const response = await readBoardStatus();
    if (!response?.ok) throw new Error('Could not reach the board');
    hasBoard = response.hasBoard;
    count = response.count;
    setEngineStatus(response);
    if (!hasBoard) statusMessage.textContent = noBoard;
  } catch {
    statusMessage.textContent = noConnection;
  } finally {
    busy = false;
    updateButtons();
    updateEngine();
  }
}

async function pollEngine() {
  const revision = engineRevision;
  try {
    const response = await send({ type: 'board-notes:status' });
    if (revision !== engineRevision) return;
    if (!response?.ok) throw new Error('Could not get the engine status');
    if (!response.hasBoard) {
      loseBoard(noBoard);
      return;
    }
    setEngineStatus(response);
  } catch {
    if (revision !== engineRevision) return;
    engine.message = 'Связь с анализом прервалась. Откройте меню снова.';
  }
  updateEngine();
}

async function toggleEngine() {
  if (!hasBoard || !engine.available || engine.pending) return;
  const revision = ++engineRevision;
  const enabled = !engine.enabled;
  engine.pending = true;
  updateEngine();

  try {
    if (enabled) {
      await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        files: ['position-bridge.js']
      });
    }
    if (revision !== engineRevision) return;
    const response = await send({ type: 'board-notes:engine', enabled });
    if (revision !== engineRevision) return;
    if (response?.reason === 'no-board') {
      loseBoard(noBoard);
      return;
    }
    if (response?.reason === 'unavailable') {
      setEngineStatus({ engineAvailable: false });
      return;
    }
    if (!response?.ok) throw new Error('Could not change the engine state');
    setEngineStatus(response);
  } catch {
    if (revision === engineRevision) engine.message = 'Не удалось переключить Stockfish. Попробуйте ещё раз.';
  } finally {
    engine.pending = false;
    updateEngine();
  }
}

async function run(message, successMessage) {
  if (busy || !hasBoard) return;
  busy = true;
  updateButtons();

  try {
    const response = await send(message);
    if (response?.reason === 'no-board') {
      loseBoard(noBoard);
      return;
    }
    if (!response?.ok) throw new Error('Board command failed');

    if (message.type === 'board-notes:start') {
      window.close();
      return;
    }
    count = response.count;
    statusMessage.textContent = successMessage;
  } catch {
    loseBoard(noConnection);
  } finally {
    busy = false;
    updateButtons();
  }
}

form.addEventListener('change', (event) => {
  if (event.target.name === 'shape') updateTool();
});

markText.addEventListener('input', () => markText.setCustomValidity(''));

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const shape = selectedShape();
  const text = shape === 'text' ? markText.value.trim() : '';
  if (shape === 'text' && !text) {
    markText.setCustomValidity('Введите текст метки.');
    markText.reportValidity();
    return;
  }
  void run({ type: 'board-notes:start', shape, color: color.value, text });
});

undo.addEventListener('click', () => {
  void run({ type: 'board-notes:undo' }, 'Последняя метка удалена.');
});

clear.addEventListener('click', () => {
  void run({ type: 'board-notes:clear' }, 'Метки удалены.');
});

engineToggle.addEventListener('click', () => void toggleEngine());

updateTool();
void connect();
