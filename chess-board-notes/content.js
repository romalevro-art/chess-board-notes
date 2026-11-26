/* Chess Board Notes — licensed under GNU GPL v3.0. */
(() => {
    const host = location.hostname;
    const isLichess = host === 'lichess.org' || host.endsWith('.lichess.org');
    const isChessCom = host === 'chess.com' || host.endsWith('.chess.com');

    if (location.protocol !== 'https:' || (!isLichess && !isChessCom)) return;
    if (globalThis.chessBoardNotesLoaded) return;
    globalThis.chessBoardNotesLoaded = true;

    const svgNamespace = 'http://www.w3.org/2000/svg';
    const boardSelectors = isLichess
        ? ['.main-board .cg-wrap cg-board', '.cg-wrap cg-board']
        : ['.board-layout-chessboard wc-chess-board, .board-layout-chessboard chess-board',
            'wc-chess-board, chess-board'];

    let drawer = null;
    let layoutTimer = null;
    let currentPath = '';
    let selection = null;
    const marks = [];

    function hasBoardSize(rect) {
        return rect.width >= 120 && rect.height >= 120
            && Math.abs(rect.width - rect.height) <= 0.15 * rect.width;
    }

    function findBoard() {
        for (const selector of boardSelectors) {
            let largest = null;
            let largestArea = 0;
            for (const board of document.querySelectorAll(selector)) {
                const rect = board.getBoundingClientRect();
                const area = rect.width * rect.height;
                if (area > largestArea && hasBoardSize(rect)
                    && getComputedStyle(board).visibility === 'visible') {
                    largest = board;
                    largestArea = area;
                }
            }
            if (largest) return largest;
        }
        return null;
    }

    function getOrientation(board) {
        const flipped = isLichess
            ? board.closest('.cg-wrap')?.classList.contains('orientation-black')
            : board.classList.contains('flipped');
        return flipped ? 'b' : 'w';
    }

    function closeDrawer() {
        stopSelection();
        clearInterval(layoutTimer);
        layoutTimer = null;
        drawer?.terminate();
        drawer = null;
        marks.length = 0;
    }

    function synchronizeBoard() {
        if (!drawer) return null;
        const board = drawer.boardElem;
        if (location.pathname !== currentPath) {
            closeDrawer();
            return null;
        }

        if (!board.isConnected) {
            stopSelection();
            const replacement = findBoard();
            if (!replacement) {
                drawer.boardContainerElem.style.visibility = 'hidden';
                if (marks.length === 0) closeDrawer();
                return null;
            }

            const savedMarks = marks.splice(0);
            setUpDrawer(replacement);
            for (const mark of savedMarks) addMark(mark, mark.square);
            return replacement;
        }

        const rect = board.getBoundingClientRect();
        const visible = hasBoardSize(rect) && getComputedStyle(board).visibility === 'visible';
        drawer.boardContainerElem.style.visibility = visible ? 'visible' : 'hidden';
        if (!visible) {
            stopSelection();
            if (marks.length === 0) closeDrawer();
            return null;
        }

        const orientation = getOrientation(board);
        if (orientation !== drawer.orientation) {
            drawer.setOrientation(orientation);
            drawStartSquare();
        }

        return board;
    }

    function setUpDrawer(board) {
        if (drawer?.boardElem === board) return;
        closeDrawer();
        currentPath = location.pathname;
        drawer = new UniversalBoardDrawer(board, {
            fixedPosition: true,
            orientation: getOrientation(board),
            trackInput: false
        });
        drawer.boardContainerElem.setAttribute('data-chess-board-notes', '');
        drawer.boardContainerElem.setAttribute('aria-hidden', 'true');
        layoutTimer = setInterval(synchronizeBoard, 150);
    }

    function stopSelection() {
        if (!selection) return;
        selection.layer.remove();
        selection.abort.abort();
        selection = null;
    }

    function cancelSelection() {
        stopSelection();
        if (marks.length === 0) closeDrawer();
    }

    function drawStartSquare() {
        if (!selection?.from) return;
        const square = drawer.squareSvgCoordinates.find(
            ({ coordinates }) => drawer.coordinateToFen(coordinates) === selection.from
        );
        if (!square) return;

        const [x, y] = square.coordinates;
        selection.indicator.setAttribute('x', (x - 1) * 12.5 + '%');
        selection.indicator.setAttribute('y', (y - 1) * 12.5 + '%');
        selection.indicator.setAttribute('visibility', 'visible');
    }

    function addMark({ shape, color, text, from }, square) {
        let element;

        if (shape === 'arrow') {
            element = drawer.createShape('arrow', [from, square], {
                style: 'fill: ' + color + '; opacity: .85'
            });
        } else if (shape === 'rectangle') {
            element = drawer.createShape('rectangle', square, {
                style: 'fill: ' + color + '; opacity: .45'
            });
        } else {
            element = drawer.createShape('text', square, {
                text,
                size: Math.min(2.1, 7 / Array.from(text).length),
                style: 'fill: ' + color + '; stroke: #182420; stroke-width: 2px; paint-order: stroke; font-weight: 700'
            });
        }

        if (element) marks.push({ shape, color, text, from, square, element });
    }

    function takeSquare(event) {
        event.preventDefault();
        event.stopPropagation();
        if (event.button !== 0 || !synchronizeBoard() || !selection) return;
        const rect = drawer.boardElem.getBoundingClientRect();
        const x = Math.floor((event.clientX - rect.left) * 8 / rect.width);
        const y = Math.floor((event.clientY - rect.top) * 8 / rect.height);
        if (x < 0 || x >= 8 || y < 0 || y >= 8) return;
        const square = drawer.coordinateToFen([x + 1, y + 1]);

        if (selection.shape === 'arrow' && !selection.from) {
            selection.from = square;
            drawStartSquare();
            return;
        }

        if (selection.from === square) {
            selection.from = null;
            selection.indicator.setAttribute('visibility', 'hidden');
            return;
        }

        drawer.updateDimensions();
        addMark(selection, square);
        cancelSelection();
    }

    function startSelection(board, shape, color, text) {
        setUpDrawer(board);
        stopSelection();

        const layer = document.createElementNS(svgNamespace, 'g');
        const area = document.createElementNS(svgNamespace, 'rect');
        area.setAttribute('width', '100%');
        area.setAttribute('height', '100%');
        area.setAttribute('fill', 'transparent');
        area.style.pointerEvents = 'all';
        area.style.cursor = 'crosshair';
        area.style.touchAction = 'none';

        const indicator = document.createElementNS(svgNamespace, 'rect');
        indicator.setAttribute('width', '12.5%');
        indicator.setAttribute('height', '12.5%');
        indicator.setAttribute('fill', color);
        indicator.setAttribute('opacity', '.42');
        indicator.setAttribute('visibility', 'hidden');
        layer.append(area, indicator);
        drawer.boardContainerElem.append(layer);

        const abort = new AbortController();
        selection = { layer, indicator, abort, shape, color, text, from: null };

        const stopBoardInput = event => {
            event.preventDefault();
            event.stopPropagation();
        };
        for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'contextmenu']) {
            area.addEventListener(type, stopBoardInput);
        }
        area.addEventListener('click', takeSquare);
        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            cancelSelection();
        }, { capture: true, signal: abort.signal });
    }

    chrome.runtime.onMessage.addListener((message, sender, reply) => {
        if (sender.id !== chrome.runtime.id || sender.tab) return;

        const type = message?.type;
        if (type === 'board-notes:status') {
            const board = synchronizeBoard() || findBoard();
            reply({ ok: true, hasBoard: !!board, count: marks.length, mode: selection?.shape ?? null });
        } else if (type === 'board-notes:start') {
            const board = synchronizeBoard() || findBoard();
            if (!board) {
                reply({ ok: false, reason: 'no-board' });
                return;
            }

            const { shape, color } = message;
            const text = typeof message.text === 'string' ? message.text.trim().slice(0, 24) : '';
            if (!['arrow', 'rectangle', 'text'].includes(shape)
                || typeof color !== 'string' || !/^#[\da-f]{6}$/i.test(color)
                || (shape === 'text' && !text)) {
                reply({ ok: false, reason: 'invalid-mark' });
                return;
            }

            startSelection(board, shape, color, text);
            reply({ ok: true });
        } else if (type === 'board-notes:clear' || type === 'board-notes:undo') {
            synchronizeBoard();
            if (type === 'board-notes:clear') {
                closeDrawer();
            } else {
                const last = marks.pop()?.element;
                last?.remove();
                if (drawer && last) {
                    drawer.addedShapes = drawer.addedShapes.filter(({ element }) => element !== last);
                }
                cancelSelection();
            }
            reply({ ok: true, count: marks.length });
        }
    });
})();
