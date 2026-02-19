/* ════════════════════════════════════════════════════════════════════
   REGRAS DO XADREZ
   Lógica completa: movimentação, validação, xeque, xeque-mate,
   roque, en passant e promoção de peão.
════════════════════════════════════════════════════════════════════ */

const UNI = {
    white: { king: '♔', queen: '♕', rook: '♖', bishop: '♗', knight: '♘', pawn: '♙' },
    black: { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟' }
};

const PIECE_VAL = { queen: 8, rook: 6, bishop: 6, knight: 5, pawn: 3, king: 0 };

// ── Estado inicial do tabuleiro ──
function buildBoard() {
    const b = Array.from({ length: 8 }, () => Array(8).fill(null));
    const back = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
    let _uid = 1;
    for (let c = 0; c < 8; c++) {
        b[0][c] = { t: back[c], co: 'black', _id: _uid++ };
        b[1][c] = { t: 'pawn', co: 'black', _id: _uid++ };
        b[6][c] = { t: 'pawn', co: 'white', _id: _uid++ };
        b[7][c] = { t: back[c], co: 'white', _id: _uid++ };
    }
    return b;
}

function cloneB(b) { return b.map(r => r.map(p => p ? { ...p } : null)); }

const OB = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

// ── Verifica se uma casa está sendo atacada por uma cor ──
function attacked(b, r, c, byColor) {
    const pDir = byColor === 'white' ? 1 : -1;
    // Peão
    for (const dc of [-1, 1]) {
        const pr = r + pDir, pc = c + dc;
        if (OB(pr, pc) && b[pr][pc]?.t === 'pawn' && b[pr][pc]?.co === byColor) return true;
    }
    // Cavalo
    for (const [dr, dc] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) {
        const nr = r + dr, nc = c + dc;
        if (OB(nr, nc) && b[nr][nc]?.t === 'knight' && b[nr][nc]?.co === byColor) return true;
    }
    // Torre / Dama (ortogonal)
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        let nr = r + dr, nc = c + dc;
        while (OB(nr, nc)) {
            if (b[nr][nc]) {
                if (b[nr][nc].co === byColor && (b[nr][nc].t === 'rook' || b[nr][nc].t === 'queen')) return true;
                break;
            }
            nr += dr; nc += dc;
        }
    }
    // Bispo / Dama (diagonal)
    for (const [dr, dc] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        let nr = r + dr, nc = c + dc;
        while (OB(nr, nc)) {
            if (b[nr][nc]) {
                if (b[nr][nc].co === byColor && (b[nr][nc].t === 'bishop' || b[nr][nc].t === 'queen')) return true;
                break;
            }
            nr += dr; nc += dc;
        }
    }
    // Rei
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nr = r + dr, nc = c + dc;
        if (OB(nr, nc) && b[nr][nc]?.t === 'king' && b[nr][nc]?.co === byColor) return true;
    }
    return false;
}

// ── Movimentos pseudo-legais (sem filtrar rei em xeque) ──
function pseudoMoves(b, r, c, ep, cas) {
    const p = b[r][c]; if (!p) return [];
    const { t, co } = p;
    const enemy = co === 'white' ? 'black' : 'white';
    const dir = co === 'white' ? -1 : 1;
    const moves = [];

    const slide = (dr, dc) => {
        let nr = r + dr, nc = c + dc;
        while (OB(nr, nc)) {
            if (!b[nr][nc]) moves.push({ r: nr, c: nc });
            else { if (b[nr][nc].co === enemy) moves.push({ r: nr, c: nc }); break; }
            nr += dr; nc += dc;
        }
    };

    if (t === 'pawn') {
        // Se for Super Peão (ativado pela passiva), move como Rei
        if (p.superPawn) {
            for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
                const nr = r + dr, nc = c + dc;
                if (OB(nr, nc) && b[nr][nc]?.co !== co && b[nr][nc]?.t !== 'hole') moves.push({ r: nr, c: nc });
            }
        } else {
            // Movimento normal de peão
            const startRow = co === 'white' ? 6 : 1;
            // Movimento normal para frente (sem captura)
            if (OB(r + dir, c) && !b[r + dir][c]) {
                moves.push({ r: r + dir, c });
                if (r === startRow && !b[r + 2 * dir][c]) moves.push({ r: r + 2 * dir, c });
            }
            // Capturas diagonais
            for (const dc of [-1, 1]) {
                const nr = r + dir, nc = c + dc;
                if (!OB(nr, nc)) continue;
                if (b[nr][nc]?.co === enemy) moves.push({ r: nr, c: nc });
                if (ep && ep.r === nr && ep.c === nc) moves.push({ r: nr, c: nc, ep: true });
            }
        }
    }
    else if (t === 'knight') {
        for (const [dr, dc] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) {
            const nr = r + dr, nc = c + dc;
            if (OB(nr, nc) && b[nr][nc]?.co !== co && b[nr][nc]?.t !== 'hole') moves.push({ r: nr, c: nc });
        }
    }
    else if (t === 'bishop') { [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([dr, dc]) => slide(dr, dc)); }
    else if (t === 'rook') { [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([dr, dc]) => slide(dr, dc)); }
    else if (t === 'queen') { [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([dr, dc]) => slide(dr, dc)); }
    else if (t === 'king') {
        for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
            const nr = r + dr, nc = c + dc;
            if (OB(nr, nc) && b[nr][nc]?.co !== co && b[nr][nc]?.t !== 'hole') moves.push({ r: nr, c: nc });
        }
        // Roque
        if (cas) {
            const br = co === 'white' ? 7 : 0;
            const rt = cas[co];
            if (r === br && c === 4) {
                if (rt.kS && !b[br][5] && !b[br][6] && b[br][7]?.t === 'rook' && b[br][7]?.co === co)
                    moves.push({ r: br, c: 6, castle: 'k' });
                if (rt.qS && !b[br][3] && !b[br][2] && !b[br][1] && b[br][0]?.t === 'rook' && b[br][0]?.co === co)
                    moves.push({ r: br, c: 2, castle: 'q' });
            }
        }
    }
    return moves;
}

// ── Aplicar um movimento ao tabuleiro ──
function applyMove(b, fr, fc, tr, tc, flags = {}) {
    const nb = cloneB(b);
    const piece = nb[fr][fc];
    // Preserva o _id da peça original ou gera um novo se necessário (para não quebrar passivas)
    const originalId = piece._id || (Math.random() * 1000000 | 0);

    nb[tr][tc] = piece;
    nb[fr][fc] = null;
    if (flags.ep) nb[fr][tc] = null;                           // captura en passant
    if (flags.castle === 'k') { nb[tr][5] = nb[tr][7]; nb[tr][7] = null; } // roque curto
    if (flags.castle === 'q') { nb[tr][3] = nb[tr][0]; nb[tr][0] = null; } // roque longo

    // Se houver promoção, cria a nova peça mas tenta manter o ID "de alma" ou gera novo
    if (flags.promo) {
        nb[tr][tc] = { t: flags.promo, co: piece.co, _id: originalId };
    } else {
        // Garante que a peça movida tenha _id
        if (nb[tr][tc]) nb[tr][tc]._id = originalId;
    }
    return nb;
}

// ── Localiza o rei de uma cor no tabuleiro ──
function kingPos(b, co) {
    for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++)
            if (b[r][c]?.t === 'king' && b[r][c]?.co === co) return { r, c };
    return null;
}

// ── Filtra movimentos que deixariam o próprio rei em xeque ──
function legalMoves(b, r, c, ep, cas) {
    const p = b[r][c]; if (!p) return [];
    const enemy = p.co === 'white' ? 'black' : 'white';
    const pseudo = pseudoMoves(b, r, c, ep, cas);
    const legal = [];

    for (const m of pseudo) {
        if (m.castle) {
            const br = r, passC = m.castle === 'k' ? 5 : 3;
            if (attacked(b, br, 4, enemy)) continue; // rei em xeque no início
            if (attacked(b, br, passC, enemy)) continue; // casa de passagem atacada
        }
        const nb = applyMove(b, r, c, m.r, m.c, { ep: m.ep, castle: m.castle });
        const kp = kingPos(nb, p.co);
        if (kp && !attacked(nb, kp.r, kp.c, enemy)) legal.push(m);
    }
    return legal;
}

// ── Verifica se uma cor possui algum movimento legal ──
function anyLegal(b, co, ep, cas) {
    for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++)
            if (b[r][c]?.co === co && legalMoves(b, r, c, ep, cas).length > 0) return true;
    return false;
}

// ── Verifica se uma cor está em xeque ──
function inCheck(b, co) {
    const kp = kingPos(b, co);
    return kp ? attacked(b, kp.r, kp.c, co === 'white' ? 'black' : 'white') : false;
}

// ── Atualiza os direitos de roque após cada jogada ──
function updateCastling(cas, b, fr, fc, tr, tc) {
    const r = { white: { ...cas.white }, black: { ...cas.black } };
    const p = b[fr][fc];
    if (p?.t === 'king') {
        if (p.co === 'white') r.white = { kS: false, qS: false };
        else r.black = { kS: false, qS: false };
    }
    if (p?.t === 'rook') {
        if (fr === 7 && fc === 7) r.white.kS = false;
        if (fr === 7 && fc === 0) r.white.qS = false;
        if (fr === 0 && fc === 7) r.black.kS = false;
        if (fr === 0 && fc === 0) r.black.qS = false;
    }
    // Torre capturada também perde roque
    if (tr === 7 && tc === 7) r.white.kS = false;
    if (tr === 7 && tc === 0) r.white.qS = false;
    if (tr === 0 && tc === 7) r.black.kS = false;
    if (tr === 0 && tc === 0) r.black.qS = false;
    return r;
}

// ── Converte uma jogada para notação algébrica simplificada ──
function toAlg(b, fr, fc, tr, tc, flags = {}) {
    const f = 'abcdefgh';
    const p = b[fr][fc]; if (!p) return '?';
    if (flags.castle === 'k') return 'O-O';
    if (flags.castle === 'q') return 'O-O-O';
    const sym = { pawn: '', knight: 'N', bishop: 'B', rook: 'R', queen: 'Q', king: 'K' }[p.t];
    const cap = (b[tr][tc] || flags.ep) ? 'x' : '';
    const fromF = (p.t === 'pawn' && cap) ? f[fc] : '';
    const promo = flags.promo ? '=' + { queen: 'Q', rook: 'R', bishop: 'B', knight: 'N' }[flags.promo] : '';
    return sym + fromF + cap + f[tc] + (8 - tr) + promo;
}