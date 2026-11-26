const stockfishPath = 'vendor/stockfish/stockfish-19-lite-single.js';
const maxWaitingTabs = 6;
const waiting = new Map();
const uciMove = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
let running = false;
let engine;
let idleTimer;

function receiveEngineOutput(commands, timeoutMs, readLine) {
  return new Promise((resolve, reject) => {
    const worker = engine;
    const timer = setTimeout(() => fail('Stockfish timed out'), timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
    }

    function fail(message) {
      cleanup();
      reject(new Error(message));
    }

    function onError() {
      fail('Stockfish worker failed');
    }

    function onMessage(event) {
      if (typeof event.data !== 'string') return;
      for (const line of event.data.split('\n')) {
        const result = readLine(line.trim());
        if (result !== undefined) {
          cleanup();
          resolve(result);
          break;
        }
      }
    }

    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    for (const command of commands) worker.postMessage(command);
  });
}

function closeEngine() {
  engine?.terminate();
  engine = undefined;
}

async function searchPosition(fen) {
  if (!engine) {
    engine = new Worker(chrome.runtime.getURL(stockfishPath));
    await receiveEngineOutput(['uci'], 6000, line => line === 'uciok' || undefined);
    await receiveEngineOutput(['setoption name MultiPV value 3', 'isready'], 3000,
      line => line === 'readyok' || undefined);
  }

  const linesByDepth = new Map();
  return receiveEngineOutput([`position fen ${fen}`, 'go depth 13 movetime 750'], 3500, line => {
    const bestMove = line.match(/^bestmove\s+(\S+)/)?.[1];
    if (bestMove) {
      if (!uciMove.test(bestMove)) return [];
      const snapshots = [...linesByDepth.entries()].sort(([depthA, linesA], [depthB, linesB]) =>
        linesB.size - linesA.size || depthB - depthA);
      const snapshot = snapshots.find(([, lines]) =>
        lines.size === snapshots[0][1].size && lines.get(1) === bestMove) ?? snapshots[0];
      const ranked = [...(snapshot?.[1] ?? [])].sort(([rankA], [rankB]) => rankA - rankB);
      return [...new Set([bestMove, ...ranked.map(([, move]) => move)])].slice(0, 3);
    }

    if (line.startsWith('info depth ')) {
      const depth = Number(line.match(/^info depth (\d+)/)?.[1]);
      const rank = Number(line.match(/\bmultipv ([1-3])\b/)?.[1]);
      const move = line.match(/\bpv (\S+)/)?.[1];
      if (depth > 0 && rank && uciMove.test(move)) {
        if (!linesByDepth.has(depth)) linesByDepth.set(depth, new Map());
        linesByDepth.get(depth).set(rank, move);
      }
    }
    return undefined;
  });
}

async function runQueue() {
  if (running) return;
  running = true;
  clearTimeout(idleTimer);
  while (waiting.size > 0) {
    const [tabId, job] = waiting.entries().next().value;
    waiting.delete(tabId);
    let result;
    try {
      result = { ok: true, moves: await searchPosition(job.fen) };
    } catch {
      closeEngine();
      result = { ok: false, reason: 'engine-unavailable' };
    }
    job.respond(result);
  }
  idleTimer = setTimeout(closeEngine, 45000);
  running = false;
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== 'board-notes:engine-search' || sender.id !== chrome.runtime.id || sender.tab) return false;
  const previous = waiting.get(message.tabId);
  if (previous) {
    previous.respond({ ok: false, reason: 'superseded' });
  } else if (waiting.size >= maxWaitingTabs) {
    respond({ ok: false, reason: 'busy' });
    return false;
  }
  waiting.set(message.tabId, { fen: message.fen, respond });
  void runQueue();
  return true;
});
