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

const noBoard = 'Откройте страницу с шахматной доской на Chess.com или Lichess.';
const unsupportedPage = 'Разметка доступна на Chess.com и Lichess.';
const noConnection = 'Не удалось подключиться к доске. Обновите вкладку и снова откройте меню.';
const toolInstructions = {
  arrow: 'Укажите начало и конец стрелки на доске.',
  rectangle: 'Нажмите на клетку, которую хотите выделить.',
  text: 'Нажмите на клетку, где должна появиться метка.'
};

let tabId;
let hasBoard = false;
let count = 0;
let busy = true;

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
    if (!hasBoard) statusMessage.textContent = noBoard;
  } catch {
    statusMessage.textContent = noConnection;
  } finally {
    busy = false;
    updateButtons();
  }
}

async function run(message, successMessage) {
  if (busy || !hasBoard) return;
  busy = true;
  updateButtons();

  try {
    const response = await send(message);
    if (response?.reason === 'no-board') {
      hasBoard = false;
      statusMessage.textContent = noBoard;
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
    hasBoard = false;
    statusMessage.textContent = noConnection;
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

updateTool();
void connect();
