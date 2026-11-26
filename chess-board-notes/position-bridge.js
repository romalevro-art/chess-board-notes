/* Chess Board Notes — licensed under GNU GPL v3.0. */
(() => {
    const lichess = location.hostname === 'lichess.org';

    function isAnalysisPage() {
        if (location.protocol !== 'https:') return false;
        if (lichess) return /^\/analysis(?:\/|$)/.test(location.pathname);
        return ['chess.com', 'www.chess.com'].includes(location.hostname)
            && /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?analysis(?:\/|$)/i.test(location.pathname);
    }

    if (!isAnalysisPage() || window.chessBoardNotesPositionBridge) return;
    window.chessBoardNotesPositionBridge = true;

    window.addEventListener('chess-board-notes:read-position', () => {
        if (!isAnalysisPage()) return;
        let fen;

        if (lichess) {
            const analysis = window.site?.analysis;
            const variant = analysis?.data?.game?.variant?.key;
            if (analysis?.data?.game?.ongoing
                || (variant && !['standard', 'fromPosition'].includes(variant))) return;
            fen = analysis?.node?.fen;
        } else {
            const board = document.querySelector('.board-layout-chessboard wc-chess-board, .board-layout-chessboard chess-board')
                ?? document.querySelector('wc-chess-board, chess-board');
            const game = board?.game;
            if (game?.getVariant && game.getVariant() !== 'chess') return;
            if (typeof game?.getFEN === 'function') fen = game.getFEN();
        }

        if (typeof fen === 'string') {
            window.dispatchEvent(new CustomEvent('chess-board-notes:position', { detail: fen }));
        }
    });
})();
