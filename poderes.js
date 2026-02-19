/* ═══════════════════════════════════════════════════════════════════════════
   PODERES.JS - Sistema de Poderes Mágicos
   ─────────────────────────────────────────────────────────────────────────
   Gerencia:
   - Lista interna de 6 poderes
   - Loja com 4 ofertas aleatórias
   - Compra com pontos de captura
   - Rotação automática ao comprar
   - Renderização da loja e poderes adquiridos
═══════════════════════════════════════════════════════════════════════════ */

// ─── LISTA MESTRE DE PODERES ────────────────────────────────────────────────

const PODERES_LISTA = [
    {
        id: 'buraco',
        nome: 'Buraco',
        custo: 15,
        icone: '◼',
        cor: '#b06cf0',
        desc: 'Cria um vazio intransponível no tabuleiro'
    },
    {
        id: 'duplicar',
        nome: 'Duplicar',
        custo: 14,
        icone: '✨',
        cor: '#4ade80',
        desc: 'Gera uma cópia espectral de uma peça aliada (exceto Rei e Rainha)'
    },
    {
        id: 'cacar',
        nome: 'Caçar',
        custo: 17,
        icone: '🂡',
        cor: '#dd291c',
        desc: 'voce puxa a peça inimiga mais próxima para uma casa adjacente à sua posição atual,'
    },
    {
        id: 'congelar',
        nome: 'Congelar',
        custo: 18,
        icone: '❋',
        cor: '#1daed3',
        desc: 'o jogador escolhe uma coluna vertical para congelar por 4 rodadas, impedindo movimentos inimigo'
    },
    {
        id: 'rebater',
        nome: 'Rebater',
        custo: 19,
        icone: '𓂀',
        cor: '#1d8b30',
        desc: 'cria um escudo protetor em uma peça aliada, evitando sua morte uma vez'
    },
    {
        id: 'bencao',
        nome: 'Benção',
        custo: 17,
        icone: '☯',
        cor: '#fcfcfc',
        desc: 'Dobra pontos por capturas e rubis por 6 turnos'
    },
];

// ─── ESTADO DA LOJA ─────────────────────────────────────────────────────────

let lojaState = {
    oferta: [],   // 4 índices de PODERES_LISTA atualmente na loja
    pontosGastos: { white: 0, black: 0 },
    bonusPoints: { white: 0, black: 0 },   // pontos bônus de rubis coletados
    bencao: { white: 0, black: 0 },       // turnos restantes da Benção por cor
    poderesAdquiridos: { white: [], black: [] },
};

// ─── UTILITÁRIOS ────────────────────────────────────────────────────────────

function _shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// ─── INICIALIZAÇÃO ───────────────────────────────────────────────────────────

/**
 * (Re)inicializa a loja — chamar junto com initGame()
 */
function inicializarLoja() {
    lojaState = {
        oferta: _shuffle([0, 1, 2, 3, 4, 5]).slice(0, 4),
        pontosGastos: { white: 0, black: 0 },
        bonusPoints: { white: 0, black: 0 },
        bencao: { white: 0, black: 0 },
        poderesAdquiridos: { white: [], black: [] },
    };
    renderLoja();
}

// ─── PONTOS DISPONÍVEIS ──────────────────────────────────────────────────────

/**
 * Retorna os pontos líquidos de uma cor
 * (pontos capturados + bônus de rubis − pontos já gastos na loja)
 */
function getPontos(cor) {
    const bruto = (G.captured?.[cor] || [])
        .reduce((sum, p) => sum + (PIECE_VAL[p.t] || 0), 0);
    const bonus = lojaState.bonusPoints[cor] || 0;
    return bruto + bonus - (lojaState.pontosGastos[cor] || 0);
}

/**
 * Credita 10 pontos bônus ao jogador que coletou o rubi.
 * @param {string} cor - 'white' ou 'black'
 */
function coletarRubi(cor) {
    const valor = (lojaState.bencao && lojaState.bencao[cor] > 0) ? 20 : 10;
    lojaState.bonusPoints[cor] = (lojaState.bonusPoints[cor] || 0) + valor;
    const label = cor === 'white' ? 'Brancas' : 'Pretas';
    if (valor === 20) {
        mostrarMensagem(`💎 ${label} coletaram o Rubi! Benção ativa: +20 pontos!`);
    } else {
        mostrarMensagem(`💎 ${label} coletaram o Rubi! +10 pontos!`);
    }
    renderLoja();
}

// ─── COMPRA ──────────────────────────────────────────────────────────────────

/**
 * Tenta comprar o poder na posição `ofertaIdx` da oferta atual.
 * @param {number} ofertaIdx - índice 0–3 do card na loja
 */
async function comprarPoder(ofertaIdx) {
    if (G.status === 'checkmate' || G.status === 'stalemate') return;

    const poderIdx = lojaState.oferta[ofertaIdx];
    const poder = PODERES_LISTA[poderIdx];
    const pontos = getPontos(G.turn);

    if (pontos < poder.custo) {
        mostrarMensagem('✦ Pontos insuficientes!');
        return;
    }

    // Deduzir custo
    lojaState.pontosGastos[G.turn] += poder.custo;

    // Substituir o card comprado por um poder fora da oferta atual
    const emOferta = new Set(lojaState.oferta);
    const disponiveis = [0, 1, 2, 3, 4, 5].filter(i => !emOferta.has(i));

    if (disponiveis.length > 0) {
        const novoIdx = disponiveis[Math.floor(Math.random() * disponiveis.length)];
        lojaState.oferta[ofertaIdx] = novoIdx;
    } else {
        lojaState.oferta.splice(ofertaIdx, 1);
    }

    // ── Poderes com ativação interativa (exigem escolha no tabuleiro) ──
    if (poder.id === 'buraco') {
        // Verifica se há casas vazias disponíveis
        let temCasaVazia = false;
        for (let r = 0; r < 8 && !temCasaVazia; r++)
            for (let c = 0; c < 8 && !temCasaVazia; c++)
                if (!G.board[r][c]) temCasaVazia = true;

        if (!temCasaVazia) {
            // Reembolsa e avisa — sem casas livres para colocar buraco
            lojaState.pontosGastos[G.turn] -= poder.custo;
            lojaState.oferta[ofertaIdx] = poderIdx; // devolve o card
            mostrarMensagem('◼ Nenhuma casa vazia disponível!');
            renderLoja();
            return;
        }

        // Registra a aquisição e entra no modo de seleção
        lojaState.poderesAdquiridos[G.turn].push({ ...poder });
        G.poderAtivo = { tipo: 'buraco', cor: G.turn };
        mostrarMensagem('◼ Clique em uma casa vazia para abrir o Buraco!', 6000);
        renderLoja();
        renderBoard(); // re-renderiza para mostrar dicas de casa selecionável
        return;
    }

    // ── Poder 'congelar' (escolha de coluna) ──
    if (poder.id === 'congelar') {
        // interação: jogador escolhe uma coluna vertical para congelar por 4 rodadas
        // impede que o inimigo mova peças que estejam nessa coluna
        lojaState.poderesAdquiridos[G.turn].push({ ...poder });
        G.poderAtivo = { tipo: 'congelar', cor: G.turn };
        mostrarMensagem('✦ Escolha uma coluna (clique em qualquer casa dessa coluna) para Congelar por 4 rodadas!', 6000);
        renderLoja();
        renderBoard();
        return;
    }

    // ── Poder 'benção' (ativa efeito de pontos dobrados por 6 turnos) ──
    if (poder.id === 'bencao') {
        // Ativa imediatamente (consumível no momento da compra)
        lojaState.bencao[G.turn] = 6;
        mostrarMensagem('✶ Benção ativada! Pontos dobrarão por 6 turnos.', 3000);
        renderLoja();
        // Consome a jogada
        await passarVezPorPoder('Benção');
        return;
    }

    // ── Poder 'duplicar' (duplica um peão aliado) ──
    if (poder.id === 'duplicar') {
        // Registra a aquisição e entra no modo de seleção de peça aliada
        lojaState.poderesAdquiridos[G.turn].push({ ...poder });
        G.poderAtivo = { tipo: 'duplicar', cor: G.turn };
        mostrarMensagem('❋ Escolha uma de suas peças (exceto Rei e Rainha) para duplicar!', 6000);
        renderLoja();
        renderBoard();
        return;
    }

    // ── Poder 'cacar' (puxar peça inimiga mais próxima na mesma coluna) ──
    if (poder.id === 'cacar') {
        // Registra a aquisição e entra no modo de seleção de uma peça aliada
        lojaState.poderesAdquiridos[G.turn].push({ ...poder });
        G.poderAtivo = { tipo: 'cacar', cor: G.turn };
        mostrarMensagem('⚡ Escolha uma de suas peças para puxar o inimigo mais próximo na mesma coluna (não pode puxar o Rei).', 7000);
        renderLoja();
        renderBoard();
        return;
    }

    // ── Poder 'rebater' (proteção/reflexo) ──
    if (poder.id === 'rebater') {
        // Registra a aquisição e entra no modo de seleção de peça aliada
        lojaState.poderesAdquiridos[G.turn].push({ ...poder });
        G.poderAtivo = { tipo: 'rebater', cor: G.turn };
        mostrarMensagem('⚔ Escolha uma peça sua para protegê-la (impede morte 1 vez).', 6000);
        renderLoja();
        renderBoard();
        return;
    }

    // ── Poderes passivos / futuros: adquire e passa a vez imediatamente ──
    lojaState.poderesAdquiridos[G.turn].push({ ...poder });
    mostrarMensagem(`✦ ${poder.nome} adquirido! Vez passada.`);
    renderLoja();
    passarVezPorPoder(poder.nome);
}

// ─── RENDERIZAÇÃO ────────────────────────────────────────────────────────────

/**
 * Atualiza toda a interface da loja.
 * Chamado após initGame, doMove e comprarPoder.
 */
function renderLoja() {
    const container = document.getElementById('loja-poderes');
    if (!container) return;

    const jogoAtivo = G.status === 'playing' || G.status === 'check';

    // Em multiplayer, só o jogador da vez pode comprar
    const isMyTurn = (typeof minhaCor === 'undefined' || !minhaCor)
        ? jogoAtivo
        : (G.turn === minhaCor && jogoAtivo);

    // ── Pontos ──
    const ptW = getPontos('white');
    const ptB = getPontos('black');
    _setEl('loja-pontos-white', ptW);
    _setEl('loja-pontos-black', ptB);

    // Destaque da barra do jogador ativo
    _toggleClass('loja-bar-white', 'loja-pts-ativo', G.turn === 'white' && jogoAtivo);
    _toggleClass('loja-bar-black', 'loja-pts-ativo', G.turn === 'black' && jogoAtivo);

    // ── Cards de Oferta ──
    container.innerHTML = '';

    lojaState.oferta.forEach((poderIdx, i) => {
        const p = PODERES_LISTA[poderIdx];
        const pontosAtuais = G.turn === 'white' ? ptW : ptB;
        const podeComprar = isMyTurn && pontosAtuais >= p.custo;

        const card = document.createElement('div');
        card.className = 'poder-card' + (podeComprar ? ' poder-card-disponivel' : ' poder-card-locked');

        card.innerHTML = `
            <div class="poder-icone" style="color:${p.cor};text-shadow:0 0 14px ${p.cor}88">
                ${p.icone}
            </div>
            <div class="poder-texto">
                <div class="poder-nome">${p.nome}</div>
                <div class="poder-desc">${p.desc}</div>
            </div>
            <button
                class="poder-btn-comprar"
                onclick="comprarPoder(${i})"
                ${podeComprar ? '' : 'disabled'}
                style="--pcolor:${p.cor}"
            >
                <span class="poder-custo">${p.custo}</span>
                <span class="poder-pts-label">pts</span>
            </button>
        `;

        container.appendChild(card);
    });

    // ── Poderes Adquiridos ──
    _renderAdquiridos();
}

function _renderAdquiridos() {
    ['white', 'black'].forEach(cor => {
        const el = document.getElementById(`poderes-adquiridos-${cor}`);
        if (!el) return;
        const lista = lojaState.poderesAdquiridos[cor];

        if (lista.length === 0) {
            el.innerHTML = '<span class="sem-poderes">Nenhum poder</span>';
        } else {
            el.innerHTML = lista.map(p =>
                `<span class="poder-badge-adq"
                    title="${p.nome} — ${p.desc}"
                    style="--pcolor:${p.cor}">
                    <span class="pbadge-icon">${p.icone}</span>
                    <span class="pbadge-nome">${p.nome}</span>
                 </span>`
            ).join('');
        }
    });
}

// ─── HELPERS DOM ─────────────────────────────────────────────────────────────

function _setEl(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

function _toggleClass(id, cls, flag) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle(cls, flag);
}