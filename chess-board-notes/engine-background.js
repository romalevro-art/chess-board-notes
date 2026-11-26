const enginePage = 'engine-offscreen.html';
let creatingEnginePage;

function isAnalysisPage(sender) {
  if (sender.id !== chrome.runtime.id || !Number.isInteger(sender.tab?.id) || sender.frameId !== 0 || !sender.url) return false;
  const { protocol, hostname, pathname } = new URL(sender.url);
  if (protocol !== 'https:') return false;
  if (hostname === 'chess.com' || hostname === 'www.chess.com') {
    return /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?analysis(?:\/|$)/i.test(pathname);
  }
  return hostname === 'lichess.org' && /^\/analysis(?:\/|$)/.test(pathname);
}

function isValidFen(fen) {
  if (typeof fen !== 'string' || fen.length > 100) return false;
  const fields = fen.split(' ');
  if (fields.length !== 6) return false;
  const [board, color, castling, enPassant, halfmove, fullmove] = fields;
  if (!/^[wb]$/.test(color) || !/^(?:-|[KQkq]{1,4})$/.test(castling)) return false;
  if (castling !== '-' && castling !== [...'KQkq'].filter(right => castling.includes(right)).join('')) return false;
  if (enPassant !== '-' && !new RegExp(`^[a-h]${color === 'w' ? '6' : '3'}$`).test(enPassant)) return false;
  if (!/^\d{1,5}$/.test(halfmove) || !/^[1-9]\d{0,5}$/.test(fullmove)) return false;

  const ranks = board.split('/');
  if (ranks.length !== 8 || /[Pp]/.test(ranks[0] + ranks[7])) return false;
  if (board.split('K').length !== 2 || board.split('k').length !== 2) return false;
  return ranks.every(rank => /^[1-8prnbqkPRNBQK]+$/.test(rank) && !/[1-8]{2}/.test(rank)
    && rank.replace(/[1-8]/g, width => '.'.repeat(Number(width))).length === 8);
}

function ensureEnginePage() {
  if (!creatingEnginePage) {
    creatingEnginePage = (async () => {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [chrome.runtime.getURL(enginePage)]
      });
      if (contexts.length === 0) {
        await chrome.offscreen.createDocument({
          url: enginePage,
          reasons: ['WORKERS'],
          justification: 'Run Stockfish in a local worker for chess analysis.'
        });
      }
    })().finally(() => { creatingEnginePage = undefined; });
  }
  return creatingEnginePage;
}

async function analyzePosition(message, sender) {
  if (!isAnalysisPage(sender)) return { ok: false, reason: 'analysis-only' };
  if (!isValidFen(message.fen)) return { ok: false, reason: 'invalid-fen' };

  await ensureEnginePage();
  return await chrome.runtime.sendMessage({
    type: 'board-notes:engine-search',
    fen: message.fen,
    tabId: sender.tab.id
  }) ?? { ok: false, reason: 'engine-unavailable' };
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== 'board-notes:analyze') return false;
  analyzePosition(message, sender).then(respond, () => respond({ ok: false, reason: 'engine-unavailable' }));
  return true;
});
