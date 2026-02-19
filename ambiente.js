/* ═══════════════════════════════════════════════════════════════════════════
   AMBIENTE.JS - Interface do Jogo de Xadrez
   ─────────────────────────────────────────────────────────────────────────────
   Gerencia:
   - Interface visual (status, capturas, histórico)
   - Promoção de peões
   - Autenticação Supabase
   - Multiplayer em tempo real
   - Detecção de desconexão via Presence
   - Modal de entrada por código (sem prompt() nativo)
═══════════════════════════════════════════════════════════════════════════ */

// ─── RENDERIZAÇÃO DA INTERFACE ─────────────────────────────────────────────

function renderStatus() {
    const statusEl = document.getElementById('status-display');
    const turnLabel = G.turn === 'white' ? 'Brancas' : 'Pretas';
    statusEl.className = 'status-display status-inline';

    // Modo seleção de poder ativo (tem prioridade sobre status normal)
    if (G.poderAtivo?.tipo === 'buraco') {
        statusEl.textContent = '◼ Escolha uma casa vazia para o Buraco';
        statusEl.classList.add('poder-ativo');
        return;
    }

    if (G.status === 'checkmate') {
        const winner = G.turn === 'white' ? 'Pretas' : 'Brancas';
        statusEl.textContent = `✦ Xeque-Mate — ${winner} Vencem! ✦`;
        statusEl.classList.add('checkmate');
    } else if (G.status === 'stalemate') {
        statusEl.textContent = '⬡ Empate por Afogamento';
        statusEl.classList.add('stalemate');
    } else if (G.status === 'check') {
        statusEl.textContent = `⚠ Xeque! Vez das ${turnLabel}`;
        statusEl.classList.add('check');
    } else {
        statusEl.textContent = `Vez das ${turnLabel}`;
    }
    // Indica se a Benção está ativa para o jogador da vez
    try {
        if (typeof lojaState !== 'undefined' && lojaState.bencao && lojaState.bencao[G.turn] > 0) {
            statusEl.textContent += ` — ✶ Benção (${lojaState.bencao[G.turn]} turnos)`;
            statusEl.classList.add('bencao-active');
        } else {
            statusEl.classList.remove('bencao-active');
        }
    } catch (e) { /* ignore */ }
}

function renderIndicators() {
    const gameActive = G.status !== 'checkmate' && G.status !== 'stalemate';
    document.getElementById('dot-white').classList.toggle('active', G.turn === 'white' && gameActive);
    document.getElementById('dot-black').classList.toggle('active', G.turn === 'black' && gameActive);
}

function calcScore(color) {
    return G.captured[color].reduce((sum, piece) => sum + (PIECE_VAL[piece.t] || 0), 0);
}

function renderCaptured() {
    ['white', 'black'].forEach(color => {
        const el = document.getElementById(`captured-${color}`);
        if (!el) return;

        const total = calcScore(color);
        const opponent = color === 'white' ? 'black' : 'white';
        const diff = total - calcScore(opponent);

        const sorted = [...G.captured[color]]
            .sort((a, b) => PIECE_VAL[b.t] - PIECE_VAL[a.t])
            .slice(0, 6);

        const piecesHTML = sorted.map(p => `
            <span class="cap-piece-badge">
                ${UNI[p.co][p.t]}<span class="cap-piece-val">+${PIECE_VAL[p.t]}</span>
            </span>`).join('');

        const advHTML = diff > 0 ? `<span class="score-advantage">+${diff}</span>` : '';

        el.innerHTML = `
            <div class="score-total">${total}<span class="score-pts"> pts</span>${advHTML}</div>
            <div class="cap-pieces-list">${piecesHTML}</div>`;
    });
}

function renderHistory() {
    const historyEl = document.getElementById('history');
    historyEl.innerHTML = '';

    for (let i = 0; i < G.history.length; i += 2) {
        const moveNum = Math.floor(i / 2) + 1;
        const whiteMove = G.history[i]?.move || '';
        const blackMove = G.history[i + 1]?.move || '';
        const entry = document.createElement('div');
        entry.className = 'move-entry';
        entry.innerHTML = `
            <span class="move-number">${moveNum}.</span>
            <span class="move-white">${whiteMove}</span>
            <span class="move-black">${blackMove}</span>`;
        historyEl.appendChild(entry);
    }
    historyEl.scrollTop = historyEl.scrollHeight;
}

function showPromo(color) {
    const overlay = document.getElementById('promotion-overlay');
    const choicesEl = document.getElementById('promotion-choices');
    choicesEl.innerHTML = '';

    ['queen', 'rook', 'bishop', 'knight'].forEach(pieceType => {
        const btn = document.createElement('button');
        btn.className = 'promotion-btn';
        btn.textContent = UNI[color][pieceType];
        btn.style.color = color === 'white' ? '#f5e8c5' : '#1a0a0a';
        btn.onclick = () => {
            overlay.style.display = 'none';
            const { fr, fc, tr, tc, flags } = G.promo;
            G.promo = null;
            doMove(fr, fc, tr, tc, flags, pieceType);
        };
        choicesEl.appendChild(btn);
    });

    overlay.style.display = 'flex';
}

// ─── FUNÇÕES AUXILIARES ─────────────────────────────────────────────────────

function surrender() {
    if (G.status !== 'playing' && G.status !== 'check') return;

    const winner = G.turn === 'white' ? 'Pretas' : 'Brancas';
    G.status = 'checkmate';

    const statusEl = document.getElementById('status-display');
    statusEl.className = 'status-display checkmate';
    statusEl.textContent = `✦ ${G.turn === 'white' ? 'Brancas Desistiram' : 'Pretas Desistiram'} — ${winner} Vencem! ✦`;

    renderIndicators();
    if (partidaId) salvarEstadoNoSupabase('surrender');
}

function mostrarMensagem(message, duration = 2000) {
    const el = document.getElementById('temp-message');
    el.textContent = message;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, duration);
}

// ─── SUPABASE ───────────────────────────────────────────────────────────────

const SB_URL = 'https://azpycumnnocmzuglkrma.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6cHljdW1ubm9jbXp1Z2xrcm1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyMjYxMTUsImV4cCI6MjA4NjgwMjExNX0.wMuv40j43LAdb7oE1A6j2jsMy6EMPG5ZSgI8lVN7Gvg';

const { createClient } = supabase;
const db = createClient(SB_URL, SB_KEY);

async function logout() {
    await db.auth.signOut();
    window.location.href = 'login.html';
}

(async () => {
    const { data } = await db.auth.getSession();
    if (!data.session) { window.location.href = 'login.html'; return; }
    const userName = data.session.user.user_metadata?.full_name || data.session.user.email;
    document.getElementById('user-name').textContent = userName;
})();

// ─── ESTADO MULTIPLAYER ─────────────────────────────────────────────────────

let minhaCor = null;
let partidaId = null;
let canalRealtime = null;
let canalPresence = null;
let checkInterval = null;
let pingInterval = null;
let desconexaoTimeout = null;

const PING_MS = 8000;
const ABANDONO_MS = 60000;

// ─── MODAL DE CÓDIGO ────────────────────────────────────────────────────────

/**
 * Abre o modal temático para digitar o código da sala.
 * Substitui completamente o prompt() nativo do browser.
 */
function abrirModalCodigo() {
    const modal = document.getElementById('modal-codigo');
    const input = document.getElementById('input-codigo');
    const erro = document.getElementById('modal-codigo-erro');
    const btn = document.getElementById('btn-confirmar-codigo');

    erro.textContent = '';
    input.value = '';
    btn.disabled = false;
    btn.textContent = 'Entrar na Sala';
    modal.style.display = 'flex';

    setTimeout(() => input.focus(), 50);

    input.onkeydown = (e) => {
        if (e.key === 'Enter') confirmarCodigoModal();
        if (e.key === 'Escape') fecharModalCodigo();
    };
}

function fecharModalCodigo() {
    document.getElementById('modal-codigo').style.display = 'none';
    document.getElementById('modal-codigo-erro').textContent = '';
}

async function confirmarCodigoModal() {
    const input = document.getElementById('input-codigo');
    const erroEl = document.getElementById('modal-codigo-erro');
    const btnEl = document.getElementById('btn-confirmar-codigo');
    const codigo = input.value.trim().toUpperCase();

    if (!codigo) { erroEl.textContent = '⚠ Digite o código da sala.'; return; }

    erroEl.textContent = '';
    btnEl.disabled = true;
    btnEl.textContent = 'Buscando...';

    try {
        const { data: { user } } = await db.auth.getUser();

        const { data: partida, error: errBusca } = await db
            .from('partidas')
            .select('*')
            .eq('codigo', codigo)
            .single();

        if (errBusca || !partida) {
            erroEl.textContent = '❌ Sala não encontrada.';
            btnEl.disabled = false; btnEl.textContent = 'Entrar na Sala';
            return;
        }

        if (partida.jogador_b) {
            erroEl.textContent = '❌ Esta sala já está cheia.';
            btnEl.disabled = false; btnEl.textContent = 'Entrar na Sala';
            return;
        }

        if (partida.jogador_w === user.id) {
            erroEl.textContent = '❌ Você não pode entrar na própria sala.';
            btnEl.disabled = false; btnEl.textContent = 'Entrar na Sala';
            return;
        }

        const { data, error: errUpdate } = await db
            .from('partidas')
            .update({ jogador_b: user.id, status: 'jogando' })
            .eq('codigo', codigo)
            .select()
            .single();

        if (errUpdate) {
            erroEl.textContent = '❌ Erro ao entrar na sala.';
            btnEl.disabled = false; btnEl.textContent = 'Entrar na Sala';
            return;
        }

        fecharModalCodigo();
        await entrarNaPartida(data.id);

    } catch (err) {
        console.error(err);
        erroEl.textContent = '❌ Erro inesperado. Tente novamente.';
        btnEl.disabled = false; btnEl.textContent = 'Entrar na Sala';
    }
}

// ─── CRIAR PARTIDA ──────────────────────────────────────────────────────────

async function criarPartida() {
    try {
        const codigo = Math.random().toString(36).substring(2, 8).toUpperCase();
        const { data: { user } } = await db.auth.getUser();

        const estadoInicial = {
            board: buildBoard(), turn: 'white', ep: null,
            cas: { white: { kS: true, qS: true }, black: { kS: true, qS: true } },
            history: [], captured: { white: [], black: [] }, lastMove: null, status: 'playing'
        };

        const { data, error } = await db.from('partidas').insert({
            codigo, jogador_w: user.id, jogador_b: null,
            estado: estadoInicial, turno: 'white', status: 'aguardando'
        }).select().single();

        if (error) { mostrarMensagem('Erro ao criar partida!'); return; }

        document.getElementById('menu-inicial').style.display = 'none';
        document.getElementById('room-code').textContent = codigo;
        document.getElementById('waiting-screen').style.display = 'flex';

        partidaId = data.id;
        iniciarVerificacaoJogador();

    } catch (err) {
        console.error(err);
        mostrarMensagem('Erro ao criar partida!');
    }
}

/**
 * Ponto de entrada do botão "Entrar em Partida" — abre o modal
 */
function entrarPartida() {
    abrirModalCodigo();
}

// ─── AGUARDAR OPONENTE ──────────────────────────────────────────────────────

function iniciarVerificacaoJogador() {
    checkInterval = setInterval(async () => {
        const { data } = await db.from('partidas')
            .select('jogador_b, status').eq('id', partidaId).single();

        if (data?.jogador_b && data.status === 'jogando') {
            clearInterval(checkInterval); checkInterval = null;
            document.getElementById('waiting-screen').style.display = 'none';
            await entrarNaPartida(partidaId);
        }
    }, 1500);
}

async function cancelarEspera() {
    if (checkInterval) { clearInterval(checkInterval); checkInterval = null; }
    if (partidaId) await db.from('partidas').delete().eq('id', partidaId);
    partidaId = null;
    document.getElementById('waiting-screen').style.display = 'none';
    document.getElementById('menu-inicial').style.display = 'flex';
}

// ─── RESTAURAR ESTADO COMPLETO ──────────────────────────────────────────────

/**
 * Aplica um estado recebido do Supabase:
 * - Extrai _lojaState de dentro do estado e restaura a variável global lojaState
 * - Atribui o restante a G
 */
function aplicarEstadoRecebido(estadoCompleto) {
    if (!estadoCompleto) return;

    const { _lojaState, ...estadoJogo } = estadoCompleto;
    G = estadoJogo;

    if (_lojaState && typeof lojaState !== 'undefined') {
        lojaState = _lojaState;
    }
}

// ─── ENTRAR NA PARTIDA ──────────────────────────────────────────────────────

async function entrarNaPartida(id) {
    partidaId = id;

    const { data: partida } = await db.from('partidas').select('*').eq('id', id).single();
    if (!partida) { mostrarMensagem('Erro ao carregar partida!'); return; }

    aplicarEstadoRecebido(partida.estado);

    await identificarCor();
    renderBoard();
    atualizarIndicadorCor();

    document.getElementById('menu-inicial').style.display = 'none';
    document.getElementById('game-layout').style.display = 'flex';
    document.getElementById('btn-menu-voltar').style.display = 'none';
    document.body.classList.add('game-active');

    // Canal 1 — recebe jogadas via Postgres Changes
    canalRealtime = db.channel(`moves:${id}`)
        .on('postgres_changes', {
            event: 'UPDATE', schema: 'public',
            table: 'partidas', filter: `id=eq.${id}`
        }, (payload) => {
            if (payload.new.status === 'abandonada') {
                mostrarMensagem('⚡ Oponente abandonou a partida!', 6000);
                G.status = 'checkmate';
                renderBoard();
                return;
            }
            aplicarEstadoRecebido(payload.new.estado);
            renderBoard();
        })
        .subscribe();

    // Canal 2 — Presence para detectar desconexão
    iniciarSistemaPresenca(id);
}

// ─── PRESENÇA / HEARTBEAT ───────────────────────────────────────────────────

/**
 * Usa Supabase Realtime Presence para monitorar a conexão do oponente.
 * Cada cliente "bate ponto" a cada PING_MS ms.
 * Se o oponente sumir, um aviso aparece. Após ABANDONO_MS, a partida é encerrada.
 */
function iniciarSistemaPresenca(id) {
    canalPresence = db.channel(`presence:${id}`, {
        config: { presence: { key: '' } }
    });

    canalPresence
        .on('presence', { event: 'sync' }, () => avaliarPresencaOponente())
        .on('presence', { event: 'leave' }, () => avaliarPresencaOponente())
        .on('presence', { event: 'join' }, () => avaliarPresencaOponente())
        .subscribe(async (status) => {
            if (status !== 'SUBSCRIBED') return;
            const { data: { user } } = await db.auth.getUser();
            await canalPresence.track({ uid: user.id, ts: Date.now() });

            pingInterval = setInterval(async () => {
                try { await canalPresence.track({ uid: user.id, ts: Date.now() }); }
                catch (_) { }
            }, PING_MS);
        });
}

async function avaliarPresencaOponente() {
    if (!canalPresence || !partidaId) return;

    const { data: { user } } = await db.auth.getUser();
    const myUid = user?.id;

    const state = canalPresence.presenceState();
    const presentes = Object.values(state).flat();
    const opponentOnline = presentes.some(p => p.uid && p.uid !== myUid);

    const avisoEl = document.getElementById('aviso-desconexao');
    if (!avisoEl) return;

    if (!opponentOnline && G.status !== 'checkmate' && G.status !== 'stalemate') {
        avisoEl.style.display = 'flex';

        if (!desconexaoTimeout) {
            desconexaoTimeout = setTimeout(async () => {
                avisoEl.style.display = 'none';
                mostrarMensagem('⚡ Oponente não reconectou. Você ganhou!', 8000);
                G.status = 'checkmate';
                renderBoard();
                await salvarEstadoNoSupabase('abandonada');
            }, ABANDONO_MS);
        }
    } else {
        avisoEl.style.display = 'none';
        if (desconexaoTimeout) { clearTimeout(desconexaoTimeout); desconexaoTimeout = null; }
    }
}

// ─── IDENTIFICAÇÃO DE COR ───────────────────────────────────────────────────

async function identificarCor() {
    const { data: { user } } = await db.auth.getUser();
    const { data: p } = await db.from('partidas')
        .select('jogador_w, jogador_b').eq('id', partidaId).single();

    if (p.jogador_w === user.id) minhaCor = 'white';
    else if (p.jogador_b === user.id) minhaCor = 'black';
    else minhaCor = null;
}

function atualizarIndicadorCor() {
    const el = document.getElementById('player-indicator');
    if (!minhaCor) {
        el.textContent = 'Modo Espectador';
        el.className = 'player-indicator';
    } else if (minhaCor === 'white') {
        el.textContent = '♔ Você joga com as BRANCAS';
        el.className = 'player-indicator white';
    } else {
        el.textContent = '♚ Você joga com as PRETAS';
        el.className = 'player-indicator black';
    }
    el.style.display = 'block';
}

// ─── SALVAR ESTADO ──────────────────────────────────────────────────────────

async function salvarEstadoNoSupabase(forceStatus = null) {
    if (!partidaId) return;

    // ── Determina o status correto para gravar na tabela ──────────────────
    let novoStatus;
    if (forceStatus) {
        novoStatus = forceStatus;                 // 'surrender' ou 'abandonada'
    } else if (G.status === 'checkmate') {
        novoStatus = 'checkmate';
    } else if (G.status === 'stalemate') {
        novoStatus = 'stalemate';
    } else {
        novoStatus = 'jogando';
    }

    // Inclui lojaState dentro do estado salvo para sincronizar no multiplayer
    const estadoCompleto = {
        ...G,
        _lojaState: (typeof lojaState !== 'undefined') ? lojaState : null
    };

    try {
        // ── Busca jogadores da partida ─────────────────────────────────────
        const { data: partida } = await db
            .from('partidas')
            .select('jogador_w, jogador_b')
            .eq('id', partidaId)
            .single();

        // ── Determina vencedor ────────────────────────────────────────────
        // Em checkmate: G.turn é o lado que perdeu (não consegue mover)
        // Em surrender: forceStatus='surrender', G.turn é quem desistiu
        let winnerId = null;
        let loserId = null;
        let isDraw = false;

        if ((novoStatus === 'checkmate' || novoStatus === 'surrender') && partida) {
            if (G.turn === 'white') {
                winnerId = partida.jogador_b;
                loserId = partida.jogador_w;
            } else {
                winnerId = partida.jogador_w;
                loserId = partida.jogador_b;
            }
        } else if (novoStatus === 'stalemate') {
            isDraw = true;
        } else if (novoStatus === 'abandonada') {
            // Quem ainda está online vence — determinado pela presença
            const { data: { user } } = await db.auth.getUser();
            if (partida) {
                winnerId = user.id;
                loserId = user.id === partida.jogador_w ? partida.jogador_b : partida.jogador_w;
            }
        }

        // ── Salva estado na tabela partidas ───────────────────────────────
        const updatePayload = {
            estado: estadoCompleto,
            turno: G.turn,
            status: novoStatus,
        };
        if (winnerId) updatePayload.winner_id = winnerId;

        await db.from('partidas').update(updatePayload).eq('id', partidaId);

        // ── Atualiza ranking apenas quando a partida terminou ─────────────
        const jogoTerminou = ['checkmate', 'stalemate', 'surrender', 'abandonada'].includes(novoStatus);
        if (jogoTerminou && partida) {
            await atualizarEstatisticas(winnerId, loserId, isDraw, partida);
        }

    } catch (err) {
        console.error('Erro ao salvar estado:', err);
    }
}

// ─── ATUALIZAR ESTATÍSTICAS NO RANKING ──────────────────────────────────────

/**
 * Atualiza wins/losses/draws/streak em ranking_global e profiles para ambos os jogadores.
 * Só o jogador que disparou o fim da partida executa isto (evita duplicata).
 */
async function atualizarEstatisticas(winnerId, loserId, isDraw, partida) {
    try {
        // IDs dos dois jogadores
        const jogadorIds = [partida.jogador_w, partida.jogador_b].filter(Boolean);
        if (jogadorIds.length < 2) return; // partida incompleta, não salva

        // Busca stats atuais de ambos em ranking_global
        const { data: rows } = await db
            .from('ranking_global')
            .select('*')
            .in('id', jogadorIds);

        // Cria mapa id → stats (com fallback zerado)
        const statsMap = {};
        jogadorIds.forEach(id => {
            statsMap[id] = rows?.find(r => r.id === id) || {
                id, wins: 0, losses: 0, draws: 0,
                total_games: 0, win_streak: 0, best_streak: 0
            };
        });

        // Calcula novos valores para cada jogador
        const updates = jogadorIds.map(id => {
            const s = { ...statsMap[id] };
            s.total_games += 1;

            if (isDraw) {
                s.draws += 1;
                s.win_streak = 0;
            } else if (id === winnerId) {
                s.wins += 1;
                s.win_streak += 1;
                if (s.win_streak > s.best_streak) s.best_streak = s.win_streak;
            } else {
                s.losses += 1;
                s.win_streak = 0;
            }

            s.win_rate_pct = s.total_games > 0
                ? Math.round((s.wins / s.total_games) * 100)
                : 0;

            return s;
        });

        // Upsert em ranking_global
        for (const u of updates) {
            await db.from('ranking_global').upsert(u, { onConflict: 'id' });
        }

        // Também sincroniza em profiles (wins/losses/draws/win_streak)
        for (const u of updates) {
            await db.from('profiles').update({
                wins: u.wins,
                losses: u.losses,
                draws: u.draws,
                win_streak: u.win_streak,
                total_games: u.total_games,
            }).eq('id', u.id);
        }

    } catch (err) {
        console.error('Erro ao atualizar estatísticas:', err);
    }
}

// ─── VOLTAR AO MENU ─────────────────────────────────────────────────────────

function voltarMenu() {
    if (canalRealtime) { canalRealtime.unsubscribe(); canalRealtime = null; }
    if (canalPresence) { canalPresence.unsubscribe(); canalPresence = null; }
    if (checkInterval) { clearInterval(checkInterval); checkInterval = null; }
    if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
    if (desconexaoTimeout) { clearTimeout(desconexaoTimeout); desconexaoTimeout = null; }

    partidaId = null;
    minhaCor = null;

    document.getElementById('player-indicator').style.display = 'none';
    const avisoEl = document.getElementById('aviso-desconexao');
    if (avisoEl) avisoEl.style.display = 'none';

    document.getElementById('menu-inicial').style.display = 'flex';
    document.getElementById('game-layout').style.display = 'none';
    document.body.classList.remove('game-active');

    initGame();
    renderBoard();
}