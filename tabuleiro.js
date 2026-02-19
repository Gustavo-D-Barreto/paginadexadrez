/* ═══════════════════════════════════════════════════════════════════════════
   TABULEIRO.JS - Renderização e Interação do Tabuleiro de Xadrez
   ─────────────────────────────────────────────────────────────────────────────
   Gerencia:
   - Renderização do tabuleiro 8x8
   - Destaque de casas e peças
   - Dicas de movimentos legais
   - Interação do usuário (cliques)
   - Execução de movimentos
   - Integração com Supabase para multiplayer
═══════════════════════════════════════════════════════════════════════════ */

// ─── CONSTANTES ─────────────────────────────────────────────────────────────

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

// ─── ESTADO GLOBAL DO JOGO ──────────────────────────────────────────────────

let G = {}; // Estado global da partida

/**
 * Inicializa o estado do jogo
 */
function initGame() {
    G = {
        board: buildBoard(),           // Tabuleiro 8x8 com peças
        turn: 'white',                 // Turno atual ('white' ou 'black')
        sel: null,                     // Casa selecionada {r, c}
        legal: [],                     // Movimentos legais da peça selecionada
        ep: null,                      // Alvo en passant {r, c}
        cas: {                         // Direitos de roque
            white: { kS: true, qS: true },
            black: { kS: true, qS: true }
        },
        status: 'playing',             // 'playing', 'check', 'checkmate', 'stalemate'
        lastMove: null,                // Último movimento {fr, fc, tr, tc}
        promo: null,                   // Promoção pendente
        history: [],                   // Histórico de jogadas
        captured: {                    // Peças capturadas
            white: [],
            black: []
        },
        // Zona perigosa: quando não nulo contém {r, c, turns}
        // `r`,`c` = canto superior-esquerdo da área 2x2; `turns` = meios-movimentos restantes
        dangerZone: null,
        ruby: null,                    // Posição atual do rubi {r, c} ou null
        poderAtivo: null,              // Poder aguardando ativação {tipo, cor} ou null
        frozen: [],                    // Lista de congelamentos ativos: {col, color, turns}
    };
}

// ─── RENDERIZAÇÃO DO TABULEIRO ──────────────────────────────────────────────

/**
 * Renderiza o tabuleiro completo e atualiza a interface
 */
function renderBoard() {
    renderRankLabels();
    renderFileLabels();
    renderSquares();

    // Atualiza elementos da interface
    renderStatus();
    renderCaptured();
    renderHistory();
    renderIndicators();
}

/**
 * Renderiza os rótulos das linhas (1-8)
 */
function renderRankLabels() {
    const container = document.getElementById('rank-labels');
    container.innerHTML = '';

    RANKS.forEach(rank => {
        const label = document.createElement('div');
        label.className = 'rank-label';
        label.textContent = rank;
        container.appendChild(label);
    });
}

/**
 * Renderiza os rótulos das colunas (a-h)
 */
function renderFileLabels() {
    const container = document.getElementById('file-labels');
    container.innerHTML = '';

    FILES.forEach(file => {
        const label = document.createElement('div');
        label.className = 'file-label';
        label.textContent = file;
        container.appendChild(label);
    });
}

/**
 * Renderiza todas as casas do tabuleiro
 */
function renderSquares() {
    const boardEl = document.getElementById('board');
    boardEl.innerHTML = '';

    // Calcula posição do rei se estiver em xeque
    const kingInCheck = (G.status === 'check' || G.status === 'checkmate')
        ? kingPos(G.board, G.turn)
        : null;

    // Cria todas as 64 casas
    for (let row = 0; row < 8; row++) {
        const rowEl = document.createElement('div');
        rowEl.className = 'board-row';

        for (let col = 0; col < 8; col++) {
            const square = createSquare(row, col, kingInCheck);
            rowEl.appendChild(square);
        }

        boardEl.appendChild(rowEl);
    }
}

/**
 * Cria um elemento de casa do tabuleiro
 * @param {number} row - Linha da casa (0-7)
 * @param {number} col - Coluna da casa (0-7)
 * @param {Object} kingInCheck - Posição do rei em xeque {r, c} ou null
 * @returns {HTMLElement} Elemento da casa
 */
function createSquare(row, col, kingInCheck) {
    const square = document.createElement('div');
    const isLight = (row + col) % 2 === 0;

    square.className = 'square ' + (isLight ? 'light' : 'dark');
    square.dataset.row = row;
    square.dataset.col = col;

    // Destaque: casa selecionada
    if (G.sel && G.sel.r === row && G.sel.c === col) {
        square.classList.add('selected');
    }

    // Destaque: último movimento
    if (G.lastMove) {
        if (G.lastMove.fr === row && G.lastMove.fc === col) {
            square.classList.add('last-from');
        }
        if (G.lastMove.tr === row && G.lastMove.tc === col) {
            square.classList.add('last-to');
        }
    }

    // Destaque: rei em xeque
    if (kingInCheck && kingInCheck.r === row && kingInCheck.c === col) {
        square.classList.add('in-check');
    }

    // Pega a peça atual (necessário para destaques e renderização)
    const piece = G.board[row][col];

    // Adiciona dicas de movimento legal
    if (G.sel) {
        const isLegalMove = G.legal.some(m => m.r === row && m.c === col);

        if (isLegalMove) {
            const hint = document.createElement('div');
            hint.className = piece ? 'move-hint-ring' : 'move-hint-dot';
            square.appendChild(hint);
        }
    }

    // Destaque: modo seleção de buraco
    const podeAtivo = G.poderAtivo?.tipo === 'buraco' && G.poderAtivo.cor === G.turn;
    if (podeAtivo && !G.board[row][col] && !(G.ruby?.r === row && G.ruby?.c === col)) {
        square.classList.add('buraco-selectable');
    }

    // Destaque: modo seleção de duplicar (peões aliados selecionáveis)
    const podeDuplicar = G.poderAtivo?.tipo === 'duplicar' && G.poderAtivo.cor === G.turn;
    if (podeDuplicar && piece && piece.co === G.turn && piece.t !== 'king' && piece.t !== 'queen') {
        square.classList.add('duplicar-selectable');
    }

    // Destaque: coluna congelada (efeito visual azul) — mostra sombra e badge de turnos
    const frozenEntry = G.frozen?.find(f => f.col === col && f.turns > 0);
    if (frozenEntry) {
        square.classList.add('frozen-column');
        // mostra rodadas restantes (cada 2 meios-movimentos = 1 rodada)
        square.dataset.frozenTurns = Math.ceil(frozenEntry.turns / 2);
    }

    // Destaque: zona perigosa (marca em vermelho enquanto estiver ativa)
    if (isInDangerZone(row, col)) {
        square.classList.add('danger-zone');
        if (G.dangerZone && typeof G.dangerZone.turns === 'number') {
            const roundsLeft = Math.ceil(G.dangerZone.turns / 2);
            square.dataset.dangerRounds = roundsLeft;
        }
    }

    // Renderiza a peça na casa (ou o buraco)
    if (piece?.t === 'hole') {
        const holeEl = document.createElement('div');
        holeEl.className = 'hole-cell';
        const roundsLeft = Math.ceil(piece.turnosRestantes / 2);
        holeEl.innerHTML = `<span class="hole-counter">${roundsLeft}</span>`;
        square.appendChild(holeEl);
    } else if (piece) {
        const pieceEl = document.createElement('div');

        // Mapa de peças com sprite customizado por cor
        const SPRITE_MAP = {
            white: {
                pawn: 'piece-white-pawn',
                rook: 'piece-white-rook',
                knight: 'piece-white-knight',
                queen: 'piece-white-queen'
            },
            black: {
                pawn: 'piece-black-pawn',
                queen:'piece-black-queen'
            }
        };

        const spriteClass = SPRITE_MAP[piece.co]?.[piece.t];

        if (spriteClass) {
            pieceEl.className = 'piece ' + spriteClass;
            // Sem textContent — a imagem vem pelo CSS background-image
        } else {
            // Comportamento padrão (Unicode) para as outras peças
            pieceEl.className = 'piece ' + (piece.co === 'white' ? 'white' : 'black');
            pieceEl.textContent = UNI[piece.co][piece.t];
        }

        // Visual: peça protegida pelo poder 'rebater'
        if (piece.rebater) {
            pieceEl.classList.add('rebater-protected');
        }

        // Visual temporário quando uma tentativa de captura foi rebatida
        if (G._recentRebaterEffect) {
            const re = G._recentRebaterEffect;
            if (re.attacker && re.attacker.r === row && re.attacker.c === col) {
                pieceEl.classList.add('rebater-hit');
            }
            if (re.defender && re.defender.r === row && re.defender.c === col) {
                pieceEl.classList.add('rebater-defended');
            }
        }

        square.appendChild(pieceEl);

        // Adiciona evento de clique na casa (peça presente)
        square.addEventListener('click', () => handleSquareClick(row, col));

        return square;
    }

    // Renderiza o rubi se estiver nesta casa (executa tanto em casas vazias
    // quanto nas que contêm peças — antes o rubi só era adicionado dentro
    // do bloco onde havia peça, então não aparecia quando estava em casa
    // vazia).
    if (G.ruby && G.ruby.r === row && G.ruby.c === col) {
        const rubiEl = document.createElement('div');
        rubiEl.className = 'ruby-pickup';
        square.appendChild(rubiEl);
    }

    // Garante que casas vazias também sejam clicáveis e que a função
    // sempre retorne o elemento `square` (evita `undefined` ao montar o DOM).
    square.addEventListener('click', () => handleSquareClick(row, col));
    return square;

}

// ─── INTERAÇÃO DO USUÁRIO ───────────────────────────────────────────────────

/**
 * Trata o clique em uma casa do tabuleiro
 * @param {number} row - Linha clicada
 * @param {number} col - Coluna clicada
 */
function handleSquareClick(row, col) {
    // Bloqueia interação se não for o turno do jogador (em modo multiplayer)
    if (typeof minhaCor !== 'undefined' && minhaCor && G.turn !== minhaCor) {
        mostrarMensagem('Não é sua vez!');
        return;
    }

    // Bloqueia interação se o jogo terminou ou está aguardando promoção
    if (G.status === 'checkmate' || G.status === 'stalemate' || G.promo) {
        return;
    }

    // Modo seleção de buraco: intercepta cliques antes de qualquer outra lógica
    if (G.poderAtivo?.tipo === 'buraco') {
        const clickedCell = G.board[row][col];
        const isRuby = G.ruby?.r === row && G.ruby?.c === col;
        if (!clickedCell && !isRuby) {
            ativarBuraco(row, col);
        } else {
            mostrarMensagem('◼ Escolha uma casa vazia e sem rubi!');
        }
        return;
    }

    // Modo seleção de rebater: escolhe uma peça aliada para proteger
    if (G.poderAtivo?.tipo === 'rebater') {
        const clickedPiece = G.board[row][col];
        if (!clickedPiece || clickedPiece.co !== G.turn) {
            mostrarMensagem('⚔ Clique em uma peça sua para aplicar Rebater!');
            return;
        }
        if (clickedPiece.rebater) {
            mostrarMensagem('⚔ Esta peça já possui proteção!');
            return;
        }
        ativarRebater(row, col);
        return;
    }

    // Modo seleção de duplicar: escolhe um peão aliado para duplicar
    if (G.poderAtivo?.tipo === 'duplicar') {
        const clickedPiece = G.board[row][col];
        if (!clickedPiece || clickedPiece.co !== G.turn || clickedPiece.t === 'king' || clickedPiece.t === 'queen') {
            mostrarMensagem('❋ Clique em uma de suas peças (exceto Rei e Rainha) para duplicar!');
            return;
        }
        ativarDuplicar(row, col);
        return;
    }

    // Modo seleção de cacar: escolhe uma peça aliada que irá puxar o inimigo mais próximo na mesma coluna
    if (G.poderAtivo?.tipo === 'cacar') {
        const clickedPiece = G.board[row][col];
        if (!clickedPiece || clickedPiece.co !== G.turn) {
            mostrarMensagem('⚡ Clique em uma de suas peças para usar Caçar!');
            return;
        }
        ativarCacar(row, col);
        return;
    }

    // Modo seleção de congelar: escolhe uma coluna inteira (qualquer casa da coluna)
    if (G.poderAtivo?.tipo === 'congelar') {
        // apenas o comprador pode ativar na sua vez
        if (G.poderAtivo.cor !== G.turn) {
            mostrarMensagem('✦ Apenas o comprador pode escolher a coluna agora.');
            return;
        }
        ativarCongelar(col);
        return;
    }

    const clickedPiece = G.board[row][col];

    // Se já há uma casa selecionada
    if (G.sel) {
        const legalMove = G.legal.find(m => m.r === row && m.c === col);

        // Movimento legal encontrado
        if (legalMove) {
            const movingPiece = G.board[G.sel.r][G.sel.c];

            // Verifica se é promoção de peão
            if (movingPiece.t === 'pawn' && (row === 0 || row === 7)) {
                G.promo = {
                    fr: G.sel.r,
                    fc: G.sel.c,
                    tr: row,
                    tc: col,
                    flags: { ep: legalMove.ep, castle: legalMove.castle }
                };
                G.sel = null;
                G.legal = [];
                showPromo(G.turn);
                return;
            }

            // Executa o movimento
            doMove(
                G.sel.r,
                G.sel.c,
                row,
                col,
                { ep: legalMove.ep, castle: legalMove.castle }
            );
            return;
        }

        // Clicou em outra peça própria - reseleciona
        if (clickedPiece?.co === G.turn) {
            // bloqueia se a peça está congelada nesta coluna
            if (G.frozen?.some(f => f.color === G.turn && f.col === col && f.turns > 0)) {
                mostrarMensagem('✦ Esta peça está congelada nesta coluna e não pode ser movida.');
                return;
            }
            G.sel = { r: row, c: col };
            G.legal = legalMoves(G.board, row, col, G.ep, G.cas);
            renderBoard();
            return;
        }

        // Clicou em casa inválida - desseleciona
        G.sel = null;
        G.legal = [];
        renderBoard();
        return;
    }

    // Nenhuma casa selecionada - seleciona a peça se for do turno correto
    if (clickedPiece?.co === G.turn) {
        // bloqueia seleção se a peça estiver congelada nessa coluna
        if (G.frozen?.some(f => f.color === G.turn && f.col === col && f.turns > 0)) {
            mostrarMensagem('✦ Esta peça está congelada nesta coluna e não pode ser movida.');
            return;
        }
        G.sel = { r: row, c: col };
        G.legal = legalMoves(G.board, row, col, G.ep, G.cas);
        renderBoard();
    }
}

// ─── RUBI ────────────────────────────────────────────────────────────────────

/**
 * Escolhe uma casa vazia aleatória do tabuleiro e posiciona o rubi.
 * Ignora casas já ocupadas por peças.
 */
function spawnRuby() {
    const vazias = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (!G.board[r][c]) vazias.push({ r, c });
        }
    }
    if (vazias.length === 0) return;
    G.ruby = vazias[Math.floor(Math.random() * vazias.length)];
    mostrarMensagem('💎 Um Rubi apareceu no tabuleiro!');
}

/**
 * Gera uma zona perigosa aleatória 2x2 dentro das células a3..h6
 * A zona dura 4 meios-movimentos (2 rodadas) antes de detonar
 */
function spawnDangerZone() {
    if (G.dangerZone) return; // já existe
    // rows correspondentes a ranks 6..3 -> índices 2..5, então canto superior pode ir de 2..4
    const rStart = 2 + Math.floor(Math.random() * 3); // 2,3 ou 4
    const cStart = Math.floor(Math.random() * 7); // 0..6 (para caber 2x2)
    G.dangerZone = { r: rStart, c: cStart, turns: 4 };
    mostrarMensagem('☠ Zona perigosa surgirá aqui por 2 rodadas!', 2500);
    renderBoard();
}

/**
 * Remove todas as peças na zona perigosa e limpa o estado
 */
function detonateDangerZone() {
    if (!G.dangerZone) return;
    const { r, c } = G.dangerZone;
    const toKill = [];
    for (let rr = r; rr <= r + 1; rr++) {
        for (let cc = c; cc <= c + 1; cc++) {
            if (G.board[rr] && G.board[rr][cc] && G.board[rr][cc].t !== 'hole') {
                toKill.push({ r: rr, c: cc });
            }
        }
    }

    // Se não houver peças, limpa imediatamente
    if (toKill.length === 0) {
        G.dangerZone = null;
        mostrarMensagem('☠ Zona perigosa detonou! Nenhuma peça presente.', 1800);
        renderBoard();
        return;
    }

    // Anima as peças (girar e encolher) antes de removê-las do estado
    const boardEl = document.getElementById('board');
    const ANIM_MS = 1400;
    toKill.forEach(pos => {
        try {
            const sq = boardEl.querySelector(`.square[data-row="${pos.r}"][data-col="${pos.c}"]`);
            const pieceEl = sq?.querySelector('.piece');
            if (pieceEl) {
                // adiciona classe que dispara a animação CSS
                pieceEl.classList.add('die-anim');
                // força repaint
                void pieceEl.offsetWidth;
            }
        } catch (e) { /* ignore DOM issues */ }
    });

    // Após a animação, remove as peças do tabuleiro e rerender
    setTimeout(() => {
        let killed = 0;
        for (const pos of toKill) {
            if (G.board[pos.r] && G.board[pos.r][pos.c] && G.board[pos.r][pos.c].t !== 'hole') {
                G.board[pos.r][pos.c] = null;
                killed++;
            }
        }
        G.dangerZone = null;
        if (killed > 0) mostrarMensagem(`☠ Zona perigosa detonou! ${killed} peça(s) foram destruídas.`, 2600);
        renderBoard();
    }, ANIM_MS);
}

/**
 * Retorna true se a casa (row,col) está dentro da zona perigosa marcada
 */
function isInDangerZone(row, col) {
    if (!G.dangerZone) return false;
    const { r, c } = G.dangerZone;
    return row >= r && row <= r + 1 && col >= c && col <= c + 1;
}

// ─── EXECUÇÃO DE MOVIMENTOS ─────────────────────────────────────────────────

/**
 * Executa um movimento e atualiza o estado do jogo
 * @param {number} fr - Linha de origem
 * @param {number} fc - Coluna de origem
 * @param {number} tr - Linha de destino
 * @param {number} tc - Coluna de destino
 * @param {Object} flags - Flags especiais {ep, castle}
 * @param {string} promo - Tipo de promoção ('queen', 'rook', etc.)
 */
async function doMove(fr, fc, tr, tc, flags = {}, promo = null) {
    // Determina se há captura
    const capturedPiece = flags.ep ? G.board[fr][tc] : G.board[tr][tc];

    // Verifica se a peça está coletando o rubi
    const coletouRubi = G.ruby && G.ruby.r === tr && G.ruby.c === tc;
    if (coletouRubi) {
        G.ruby = null;
        if (typeof coletarRubi === 'function') coletarRubi(G.turn);
    }

    // Converte para notação algébrica
    const algebraicNotation = toAlg(G.board, fr, fc, tr, tc, { ...flags, promo });

    // Atualiza direitos de roque (baseado no estado pré-movimento)
    G.cas = updateCastling(G.cas, G.board, fr, fc, tr, tc);

    const movingPiece = G.board[fr][fc];

    // --- Proteção 'rebater' (impede a captura: atacante volta, defensor perde proteção) ---
    if (capturedPiece && capturedPiece.rebater) {
        // Local do defensor que estava sendo capturado (considera en-passant)
        const defR = flags.ep ? fr : tr;
        const defC = tc;

        // Remove a proteção da peça defendida
        if (G.board[defR] && G.board[defR][defC]) G.board[defR][defC].rebater = false;

        // Não aplicamos o movimento: atacante volta para sua casa (mantém-se em fr,fc)
        // Marcamos um efeito visual temporário para atacante e defensor
        G._recentRebaterEffect = {
            defender: { r: defR, c: defC },
            attacker: { r: fr, c: fc }
        };

        mostrarMensagem('⚔ A proteção rebateu o ataque! O atacante recuou.', 1800);

        // Registro no histórico como tentativa rebatida
        G.lastMove = { fr, fc, tr, tc };
        G.history.push({ move: algebraicNotation + ' (rebatido)', color: G.turn });

        // Sem en-passant após tentativa
        G.ep = null;

        // Troca o turno (o atacante gastou sua jogada)
        G.turn = G.turn === 'white' ? 'black' : 'white';

        // Efeitos pós-movimento
        decrementarBuracos();
        const meiosMovimentos = G.history.length;
        if (meiosMovimentos > 0 && meiosMovimentos % 6 === 0 && !G.ruby) spawnRuby();
        // A cada 8 rodadas (16 meios-movimentos) spawna uma zona perigosa
        if (meiosMovimentos > 0 && meiosMovimentos % 16 === 0 && !G.dangerZone) spawnDangerZone();

        const hasLegalMoves = anyLegal(G.board, G.turn, G.ep, G.cas);
        const isInCheck = inCheck(G.board, G.turn);
        G.status = !hasLegalMoves ? (isInCheck ? 'checkmate' : 'stalemate') : (isInCheck ? 'check' : 'playing');

        // Limpa seleção e poder ativo
        G.sel = null;
        G.legal = [];
        G.poderAtivo = null;

        renderBoard();

        // Limpa o efeito visual após curto período
        setTimeout(() => {
            G._recentRebaterEffect = null;
            renderBoard();
        }, 800);

        if (typeof salvarEstadoNoSupabase === 'function' && partidaId) {
            await salvarEstadoNoSupabase();
        }
        return;
    }

    // --- Buraco: se o destino for um buraco, a peça que se move morre e é capturada ---
    if (capturedPiece && capturedPiece.t === 'hole') {
        // movingPiece caiu no buraco — é capturado pelo jogador que realizou o movimento (G.turn)
        G.board[fr][fc] = null; // remove mover
        G.captured[G.turn] = G.captured[G.turn] || [];
        G.captured[G.turn].push(movingPiece);
        mostrarMensagem('◼ Peça caiu no buraco e foi capturada!', 1400);

        // Registro e efeitos similares a uma captura comum
        G.lastMove = { fr, fc, tr, tc };
        G.history.push({ move: algebraicNotation + ' (caiu no buraco)', color: G.turn });

        // Sem en-passant possível após isso
        G.ep = null;

        // Troca o turno (o jogador gastou sua jogada)
        G.turn = G.turn === 'white' ? 'black' : 'white';

        // Efeitos pós-movimento
        decrementarBuracos();
        const meiosMovimentos = G.history.length;
        if (meiosMovimentos > 0 && meiosMovimentos % 6 === 0 && !G.ruby) spawnRuby();
        if (meiosMovimentos > 0 && meiosMovimentos % 16 === 0 && !G.dangerZone) spawnDangerZone();

        const hasLegalMoves = anyLegal(G.board, G.turn, G.ep, G.cas);
        const isInCheck = inCheck(G.board, G.turn);
        G.status = !hasLegalMoves ? (isInCheck ? 'checkmate' : 'stalemate') : (isInCheck ? 'check' : 'playing');

        // Limpa seleção e poder ativo
        G.sel = null;
        G.legal = [];
        G.poderAtivo = null;

        renderBoard();

        if (typeof salvarEstadoNoSupabase === 'function' && partidaId) {
            await salvarEstadoNoSupabase();
        }
        return;
    }

    // Atualiza en passant (só se o movimento ocorrer de fato)
    G.ep = (movingPiece?.t === 'pawn' && Math.abs(tr - fr) === 2)
        ? { r: (fr + tr) / 2, c: fc }
        : null;

    // Aplica o movimento ao tabuleiro
    G.board = applyMove(G.board, fr, fc, tr, tc, { ...flags, promo });

    // Adiciona peça capturada à lista
    if (capturedPiece) {
        G.captured[G.turn].push(capturedPiece);
        // Se benção ativa, concede pontos extras equivalentes ao valor da peça (dobrando)
        try {
            if (typeof lojaState !== 'undefined' && lojaState.bencao && lojaState.bencao[G.turn] > 0) {
                lojaState.bonusPoints[G.turn] = (lojaState.bonusPoints[G.turn] || 0) + (PIECE_VAL[capturedPiece.t] || 0);
                mostrarMensagem('✶ Benção: pontos da captura dobrados!', 1200);
                renderLoja();
            }
        } catch (e) { /* ignora se lojaState não existir */ }
    }

    // Registra o movimento
    G.lastMove = { fr, fc, tr, tc };
    G.history.push({ move: algebraicNotation, color: G.turn });

    // Troca o turno
    G.turn = G.turn === 'white' ? 'black' : 'white';

    // Decrementa buracos a cada meio-movimento (10 turnos = 5 rodadas)
    decrementarBuracos();

    // A cada 3 rodadas completas (6 meios-movimentos), spawna um rubi se não houver um
    const meiosMovimentos = G.history.length;
    if (meiosMovimentos > 0 && meiosMovimentos % 6 === 0 && !G.ruby) {
        spawnRuby();
    }
    // A cada 8 rodadas (16 meios-movimentos) spawna uma zona perigosa
    if (meiosMovimentos > 0 && meiosMovimentos % 16 === 0 && !G.dangerZone) spawnDangerZone();

    // Verifica status do jogo
    const hasLegalMoves = anyLegal(G.board, G.turn, G.ep, G.cas);
    const isInCheck = inCheck(G.board, G.turn);

    G.status = !hasLegalMoves
        ? (isInCheck ? 'checkmate' : 'stalemate')
        : (isInCheck ? 'check' : 'playing');

    // Limpa seleção
    G.sel = null;
    G.legal = [];

    // Renderiza o tabuleiro
    renderBoard();

    // Salva no Supabase se estiver em partida multiplayer
    if (typeof salvarEstadoNoSupabase === 'function' && partidaId) {
        await salvarEstadoNoSupabase();
    }
}

// ─── BURACOS ────────────────────────────────────────────────────────────────────

/**
 * Decrementa o contador de todos os buracos no tabuleiro.
 * Chamado após cada meio-movimento (doMove e passarVezPorPoder).
 * 10 meios-movimentos = 5 rodadas completas.
 */
function decrementarBuracos() {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (G.board[r][c]?.t === 'hole') {
                G.board[r][c].turnosRestantes--;
                if (G.board[r][c].turnosRestantes <= 0) {
                    G.board[r][c] = null;
                    mostrarMensagem('◼ Um buraco fechou!', 1500);
                }
            }
        }
    }
    // Decrementa duração da Benção (se presente)
    try {
        if (typeof lojaState !== 'undefined' && lojaState.bencao) {
            ['white', 'black'].forEach(cor => {
                if (lojaState.bencao[cor] > 0) {
                    lojaState.bencao[cor]--;
                    if (lojaState.bencao[cor] === 0) {
                        mostrarMensagem(`✶ Benção de ${cor === 'white' ? 'Brancas' : 'Pretas'} acabou!` , 2000);
                        renderLoja();
                    }
                }
            });
        }
    } catch (e) { /* ignore */ }

    // Decrementa duração de congelamentos (G.frozen)
    try {
        if (G.frozen && Array.isArray(G.frozen) && G.frozen.length > 0) {
            for (let i = G.frozen.length - 1; i >= 0; i--) {
                G.frozen[i].turns--;
                if (G.frozen[i].turns <= 0) {
                    const col = G.frozen[i].col;
                    const clr = G.frozen[i].color === 'white' ? 'Brancas' : 'Pretas';
                    mostrarMensagem(`✦ Congelamento na coluna ${FILES[col]} das ${clr} terminou!`, 1800);
                    G.frozen.splice(i, 1);
                }
            }
        }
    } catch (e) { /* ignore */ }

    // Decrementa contador da zona perigosa (se houver)
    try {
        if (G.dangerZone) {
            G.dangerZone.turns--;
            if (G.dangerZone.turns <= 0) {
                detonateDangerZone();
            }
        }
    } catch (e) { /* ignore */ }
}

/**
 * Ativa o poder 'congelar' para a coluna especificada.
 * @param {number} col - coluna 0-7 escolhida pelo comprador
 */
async function ativarCongelar(col) {
    if (typeof col !== 'number' || col < 0 || col > 7) {
        mostrarMensagem('✦ Coluna inválida para congelamento.');
        return;
    }

    if (!G.poderAtivo || G.poderAtivo.tipo !== 'congelar') {
        mostrarMensagem('✦ Nenhum poder de congelar ativo.');
        return;
    }

    // alvo é o inimigo do comprador
    const comprador = G.poderAtivo.cor;
    const alvo = comprador === 'white' ? 'black' : 'white';

    G.frozen = G.frozen || [];
    // 4 rodadas = 8 meios-movimentos
    G.frozen.push({ col: col, color: alvo, turns: 8 });

    mostrarMensagem(`✦ Coluna ${FILES[col]} congelada para ${alvo} por 4 rodadas!` , 2500);

    // Consome a vez do comprador (comportamento consistente com outros poderes)
    await passarVezPorPoder('Congelar');
}

/**
 * Passa a vez como efeito de usar um poder (sem mover peça).
 * @param {string} descricao - Rótulo para o histórico
 */
async function passarVezPorPoder(descricao = 'Poder') {
    G.history.push({ move: `[${descricao}]`, color: G.turn });
    G.turn = G.turn === 'white' ? 'black' : 'white';

    decrementarBuracos();

    // Verifica rubi spawn (conta como meio-movimento)
    const meiosMovimentos = G.history.length;
    if (meiosMovimentos > 0 && meiosMovimentos % 6 === 0 && !G.ruby) {
        spawnRuby();
    }
    // A cada 8 rodadas (16 meios-movimentos) spawna uma zona perigosa
    if (meiosMovimentos > 0 && meiosMovimentos % 16 === 0 && !G.dangerZone) spawnDangerZone();

    const hasLegalMoves = anyLegal(G.board, G.turn, G.ep, G.cas);
    const isInCheck = inCheck(G.board, G.turn);
    G.status = !hasLegalMoves
        ? (isInCheck ? 'checkmate' : 'stalemate')
        : (isInCheck ? 'check' : 'playing');

    G.sel = null;
    G.legal = [];
    G.poderAtivo = null;

    renderBoard();

    if (typeof salvarEstadoNoSupabase === 'function' && partidaId) {
        await salvarEstadoNoSupabase();
    }
}

/**
 * Coloca um buraco na casa (row, col) e passa a vez.
 * @param {number} row
 * @param {number} col
 */
async function ativarBuraco(row, col) {
    // Garante que a casa ainda está vazia (dupla checagem)
    if (G.board[row][col] || (G.ruby?.r === row && G.ruby?.c === col)) {
        mostrarMensagem('◼ Escolha uma casa vazia!');
        return;
    }

    G.board[row][col] = { t: 'hole', co: null, turnosRestantes: 10 };
    mostrarMensagem('◼ Buraco aberto! Dura 5 rodadas.', 2500);
    await passarVezPorPoder('Buraco');
}

/**
 * Ativa o poder 'rebater' sobre a peça aliada selecionada.
 * @param {number} row
 * @param {number} col
 */
async function ativarRebater(row, col) {
    const piece = G.board[row][col];
    if (!piece || piece.co !== G.turn) {
        mostrarMensagem('⚔ Selecione uma peça sua válida!');
        return;
    }
    if (piece.rebater) {
        mostrarMensagem('⚔ Esta peça já possui proteção!');
        return;
    }

    piece.rebater = true;
    mostrarMensagem('⚔ Proteção aplicada! Esta peça resistirá a 1 ataque (rebatendo).', 2200);
    await passarVezPorPoder('Rebater');
}

/**
 * Ativa o poder 'duplicar' para o peão selecionado.
 * Coloca uma cópia do peão na frente; se ocupado -> atrás; se ainda ocupado -> lados; se impossível -> mostra mensagem.
 */
async function ativarDuplicar(row, col) {
    const piece = G.board[row][col];
    if (!piece || piece.co !== G.turn) {
        mostrarMensagem('❋ Selecione uma peça sua válida!');
        return;
    }
    if (piece.t === 'king' || piece.t === 'queen') {
        mostrarMensagem('❋ Não é possível duplicar Rei ou Rainha!');
        return;
    }

    // Gera lista de casas candidatas para colocar a cópia.
    // Para peões damos preferência por frente/atrás; para as outras peças, preferência lateral e adjacentes.
    const candidates = [];
    if (piece.t === 'pawn') {
        const dir = piece.co === 'white' ? -1 : 1;
        const frontR = row + dir;
        const backR = row - dir;
        if (frontR >= 0 && frontR < 8) candidates.push({ r: frontR, c: col });
        if (backR >= 0 && backR < 8) candidates.push({ r: backR, c: col });
        if (col - 1 >= 0) candidates.push({ r: row, c: col - 1 });
        if (col + 1 < 8) candidates.push({ r: row, c: col + 1 });
    } else {
        // laterais, frente/atrás, e diagonais
        if (col - 1 >= 0) candidates.push({ r: row, c: col - 1 });
        if (col + 1 < 8) candidates.push({ r: row, c: col + 1 });
        if (row - 1 >= 0) candidates.push({ r: row - 1, c: col });
        if (row + 1 < 8) candidates.push({ r: row + 1, c: col });
        // diagonais
        if (row - 1 >= 0 && col - 1 >= 0) candidates.push({ r: row - 1, c: col - 1 });
        if (row - 1 >= 0 && col + 1 < 8) candidates.push({ r: row - 1, c: col + 1 });
        if (row + 1 < 8 && col - 1 >= 0) candidates.push({ r: row + 1, c: col - 1 });
        if (row + 1 < 8 && col + 1 < 8) candidates.push({ r: row + 1, c: col + 1 });
    }

    let placed = false;
    for (const pos of candidates) {
        // não pode colocar sobre peça nem sobre o rubi; pode sobre buraco? não — buraco é célula especial
        if (!G.board[pos.r][pos.c] && !(G.ruby?.r === pos.r && G.ruby?.c === pos.c)) {
            // cria cópia simples da peça (sem flags especiais como rebater)
            G.board[pos.r][pos.c] = { t: piece.t, co: piece.co };
            const pretty = piece.t[0].toUpperCase() + piece.t.slice(1);
            mostrarMensagem(`❋ ${pretty} duplicada!`, 1800);
            placed = true;
            break;
        }
    }

    if (!placed) {
        mostrarMensagem('❋ É impossível criar a duplicada');
        return; // mantém o modo de seleção para tentar outra peça
    }

    await passarVezPorPoder('Duplicar');
}

/**
 * Ativa o poder 'cacar': a peça aliada escolhida puxa o inimigo mais próximo
 * na mesma coluna para uma casa adjacente vazia da peça escolhida.
 * Não pode puxar o rei inimigo.
 */
async function ativarCacar(row, col) {
    if (!G.poderAtivo || G.poderAtivo.tipo !== 'cacar') {
        mostrarMensagem('⚡ Nenhum poder Caçar ativo.');
        return;
    }

    const comprador = G.poderAtivo.cor;
    if (comprador !== G.turn) {
        mostrarMensagem('⚡ Apenas o comprador pode ativar Caçar agora.');
        return;
    }

    const chosen = G.board[row][col];
    if (!chosen || chosen.co !== G.turn) {
        mostrarMensagem('⚡ Selecione uma de suas peças.');
        return;
    }

    const colIdx = col;
    // procura peças inimigas na mesma coluna, excluindo rei
    const enemies = [];
    for (let r = 0; r < 8; r++) {
        const p = G.board[r][colIdx];
        if (p && p.co && p.co !== G.turn && p.t !== 'king') {
            enemies.push({ r, c: colIdx, piece: p });
        }
    }

    if (enemies.length === 0) {
        mostrarMensagem('⚡ Nenhum inimigo válido nesta coluna para puxar!');
        return;
    }

    // escolhe o inimigo mais próximo em distância vertical
    enemies.sort((a, b) => Math.abs(a.r - row) - Math.abs(b.r - row));
    const target = enemies[0];

    // encontra casas adjacentes livres à peça escolhida
    const adjOffsets = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1], /* [0,0] */ [0, 1],
        [1, -1], [1, 0], [1, 1]
    ];

    const candidates = [];
    for (const off of adjOffsets) {
        const nr = row + off[0];
        const nc = col + off[1];
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
            // permite puxar para casas vazias ou para buraco (caso a peça caia)
            if (( !G.board[nr][nc] || (G.board[nr][nc] && G.board[nr][nc].t === 'hole') )
                && !(G.ruby?.r === nr && G.ruby?.c === nc)) {
                candidates.push({ r: nr, c: nc });
            }
        }
    }

    if (candidates.length === 0) {
        mostrarMensagem('⚡ Nenhuma casa adjacente livre para puxar o inimigo!');
        return;
    }

    // escolhe a casa adjacente que resulta no menor deslocamento do inimigo
    candidates.sort((a, b) => (
        Math.abs(a.r - target.r) + Math.abs(a.c - target.c)
    ) - (
        Math.abs(b.r - target.r) + Math.abs(b.c - target.c)
    ));

    const dest = candidates[0];

    // anima o arrasto da peça inimiga antes de atualizar o estado
    try {
        await animatePieceDrag(target.r, target.c, dest.r, dest.c, target.piece);
    } catch (e) {
        // se animação falhar, apenas realiza a mudança sem animação
    }

    // remove peça da posição antiga
    G.board[target.r][target.c] = null;

    // se destino é um buraco, a peça morre e é adicionada às capturadas do comprador
    const destCell = G.board[dest.r][dest.c];
    if (destCell && destCell.t === 'hole') {
        // comprador recebe a peça capturada
        G.captured[comprador] = G.captured[comprador] || [];
        G.captured[comprador].push(target.piece);
        mostrarMensagem('◼ Peça inimiga caiu no buraco e foi capturada!', 1800);
    } else {
        // coloca a peça normalmente
        G.board[dest.r][dest.c] = target.piece;
        mostrarMensagem('⚡ Peça inimiga puxada!', 1800);
    }

    // consome a vez do comprador
    await passarVezPorPoder('Caçar');
}

/**
 * Anima visualmente a peça sendo arrastada de uma casa para outra.
 * Retorna uma Promise que resolve ao final da animação.
 */
function animatePieceDrag(sr, sc, dr, dc, piece) {
    return new Promise((resolve) => {
        const boardEl = document.getElementById('board');
        if (!boardEl) return resolve();

        const srcEl = boardEl.querySelector(`.square[data-row="${sr}"][data-col="${sc}"]`);
        const dstEl = boardEl.querySelector(`.square[data-row="${dr}"][data-col="${dc}"]`);
        if (!srcEl || !dstEl) return resolve();

        const srcRect = srcEl.getBoundingClientRect();
        const dstRect = dstEl.getBoundingClientRect();

        const overlay = document.createElement('div');
        overlay.className = 'piece-drag-overlay';
        overlay.textContent = UNI[piece.co][piece.t] || '';
        overlay.style.position = 'absolute';
        overlay.style.left = `${srcRect.left + window.scrollX}px`;
        overlay.style.top = `${srcRect.top + window.scrollY}px`;
        overlay.style.width = `${srcRect.width}px`;
        overlay.style.height = `${srcRect.height}px`;
        overlay.style.lineHeight = `${srcRect.height}px`;
        overlay.style.fontSize = window.getComputedStyle(srcEl.querySelector('.piece') || srcEl).fontSize || '28px';
        overlay.style.textAlign = 'center';
        overlay.style.pointerEvents = 'none';
        overlay.style.zIndex = 9999;
        overlay.style.transition = 'transform 520ms cubic-bezier(.2,.9,.2,1), opacity 200ms';
        overlay.style.willChange = 'transform, opacity';

        document.body.appendChild(overlay);

        // força reflow
        void overlay.offsetWidth;

        const dx = dstRect.left - srcRect.left;
        const dy = dstRect.top - srcRect.top;

        overlay.style.transform = `translate(${dx}px, ${dy}px)`;

        // Ao terminar, remove overlay
        const cleanup = () => {
            overlay.style.opacity = '0';
            setTimeout(() => {
                if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
                resolve();
            }, 180);
        };

        overlay.addEventListener('transitionend', function onEnd(e) {
            if (e.propertyName === 'transform') {
                overlay.removeEventListener('transitionend', onEnd);
                cleanup();
            }
        });
    });
}

// ─── GERENCIAMENTO DE PARTIDAS ──────────────────────────────────────────────

/**
 * Inicia uma nova partida local
 */
function newGame() {
    // Se estiver em partida multiplayer, confirma saída
    if (partidaId) {
        if (!confirm('Deseja sair da partida multiplayer e iniciar uma partida local?')) {
            return;
        }
        voltarMenu();
    }

    initGame();
    renderBoard();
}