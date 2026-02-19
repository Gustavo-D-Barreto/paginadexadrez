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
        ruby: null,                    // Posição atual do rubi {r, c} ou null
        poderAtivo: null,              // Poder aguardando ativação {tipo, cor} ou null
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
    if (podeDuplicar && piece && piece.co === G.turn && piece.t === 'pawn') {
        square.classList.add('duplicar-selectable');
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
                quenn: 'piece-white-queen'
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
        if (!clickedPiece || clickedPiece.co !== G.turn || clickedPiece.t !== 'pawn') {
            mostrarMensagem('❋ Clique em um de seus peões para duplicar!');
            return;
        }
        ativarDuplicar(row, col);
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
    if (!piece || piece.co !== G.turn || piece.t !== 'pawn') {
        mostrarMensagem('❋ Selecione um peão seu válido!');
        return;
    }

    const dir = piece.co === 'white' ? -1 : 1; // direção para frente
    const frontR = row + dir;
    const backR = row - dir;

    // Prioridade: frente, atrás, esquerda, direita
    const candidates = [];
    if (frontR >= 0 && frontR < 8) candidates.push({ r: frontR, c: col });
    if (backR >= 0 && backR < 8) candidates.push({ r: backR, c: col });
    if (col - 1 >= 0) candidates.push({ r: row, c: col - 1 });
    if (col + 1 < 8) candidates.push({ r: row, c: col + 1 });

    let placed = false;
    for (const pos of candidates) {
        // não pode colocar sobre peça nem sobre o rubi
        if (!G.board[pos.r][pos.c] && !(G.ruby?.r === pos.r && G.ruby?.c === pos.c)) {
            G.board[pos.r][pos.c] = { t: 'pawn', co: piece.co };
            mostrarMensagem('❋ Peão duplicado!', 1800);
            placed = true;
            break;
        }
    }

    if (!placed) {
        mostrarMensagem('❋ É impossível criar a duplicada');
        return; // mantém o modo de seleção para tentar outro peão
    }

    await passarVezPorPoder('Duplicar');
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