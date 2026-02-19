// passivas.js
// Gerencia passivas desbloqueadas por capturas (por enquanto: cavalo)
(function () {
    function initPassivas() {
        const board = document.getElementById('board');
        if (!board) return;

        // Clique com botão direito: mostra confirmação para ativar a passiva
        board.addEventListener('contextmenu', function (ev) {
            const sq = ev.target.closest('.square');
            if (!sq) return;
            ev.preventDefault();
            const r = Number(sq.dataset.row);
            const c = Number(sq.dataset.col);
            const p = (window.G && G.board && G.board[r]) ? G.board[r][c] : null;
            console.log(`[CONTEXTMENU] Clicou em (${r},${c}), peça:`, p);
            if (!p) {
                console.log(`[CONTEXTMENU] Sem peça`);
                mostrarMensagem('Passiva não disponível', 1200);
                return;
            }
            // Permite ativar a passiva do dono da peça (independente do turno)
            if (!G) {
                console.log(`[CONTEXTMENU] G não definido`);
                mostrarMensagem('Passiva não disponível', 1200);
                return;
            }

            // Somente cavalo por enquanto
            console.log(`[CONTEXTMENU] Cavalo? ${p.t === 'knight'}, PassivaReady? ${p.passivaReady}, Capturas: ${p.capturas}`);
            if (p.t === 'knight' && p.passivaReady) {
                // remove qualquer confirm existente
                const existing = document.getElementById('passiva-confirm');
                if (existing) existing.remove();

                // cria botão flutuante de confirmação
                const wrapper = document.createElement('div');
                wrapper.id = 'passiva-confirm';
                wrapper.style.position = 'fixed';
                wrapper.style.left = (ev.clientX + 6) + 'px';
                wrapper.style.top = (ev.clientY + 6) + 'px';
                wrapper.style.zIndex = 9999;
                wrapper.style.background = 'rgba(20,20,20,0.95)';
                wrapper.style.color = '#fff';
                wrapper.style.padding = '6px';
                wrapper.style.borderRadius = '6px';
                wrapper.style.boxShadow = '0 4px 10px rgba(0,0,0,0.5)';
                wrapper.style.fontSize = '13px';
                wrapper.style.display = 'flex';
                wrapper.style.gap = '6px';
                wrapper.style.alignItems = 'center';

                const txt = document.createElement('div');
                txt.textContent = 'Usar passiva do Cavalo?';
                wrapper.appendChild(txt);

                const btnYes = document.createElement('button');
                btnYes.textContent = 'Usar';
                btnYes.style.padding = '4px 8px';
                btnYes.style.border = 'none';
                btnYes.style.borderRadius = '4px';
                btnYes.style.cursor = 'pointer';
                btnYes.style.background = '#3a86ff';
                btnYes.style.color = '#fff';
                wrapper.appendChild(btnYes);

                const btnNo = document.createElement('button');
                btnNo.textContent = 'Cancelar';
                btnNo.style.padding = '4px 8px';
                btnNo.style.border = 'none';
                btnNo.style.borderRadius = '4px';
                btnNo.style.cursor = 'pointer';
                btnNo.style.background = '#888';
                btnNo.style.color = '#fff';
                wrapper.appendChild(btnNo);

                document.body.appendChild(wrapper);

                function cleanup() {
                    const el = document.getElementById('passiva-confirm');
                    if (el) el.remove();
                    document.removeEventListener('mousedown', outsideClick);
                }

                function outsideClick(e) {
                    if (!wrapper.contains(e.target)) cleanup();
                }

                document.addEventListener('mousedown', outsideClick);

                btnNo.addEventListener('click', function (e) {
                    e.stopPropagation();
                    cleanup();
                });

                btnYes.addEventListener('click', function (e) {
                    e.stopPropagation();
                    cleanup();
                    // Ativa modo de seleção para troca — owner é a cor da peça
                    G.poderAtivo = { type: 'knightSwap', source: { r, c }, owner: p.co };
                    mostrarMensagem('Passiva disponível: clique em outra sua peça para trocar de lugar', 2000);
                });

            } else {
                mostrarMensagem('Passiva não disponível', 1200);
            }
        });

        // Captura cliques esquerdos para confirmar a troca quando G.poderAtivo está ativo
        board.addEventListener('mousedown', function (ev) {
            if (ev.button !== 0) return; // só esquerdo
            if (!G || !G.poderAtivo) return;
            const sq = ev.target.closest('.square');
            if (!sq) return;
            const r = Number(sq.dataset.row);
            const c = Number(sq.dataset.col);

            const active = G.poderAtivo;
            if (active.type === 'knightSwap') {
                const src = active.source;
                // selecionar apenas outra peça do mesmo dono
                const targetPiece = G.board[r] ? G.board[r][c] : null;
                if (!targetPiece || targetPiece.co !== active.owner) {
                    mostrarMensagem('Selecione uma peça sua válida para trocar.', 1200);
                    return ev.stopPropagation();
                }
                // Não fazer nada se clicar na mesma casa
                if (src.r === r && src.c === c) {
                    mostrarMensagem('Selecione outra peça para trocar.', 1000);
                    return ev.stopPropagation();
                }

                // Executa a troca de posições
                const srcPiece = G.board[src.r][src.c];
                const tgtPiece = G.board[r][c];
                G.board[src.r][src.c] = tgtPiece;
                G.board[r][c] = srcPiece;

                // Consumir a passiva: resetar estado do cavalo
                try {
                    srcPiece.passivaReady = false;
                    srcPiece.capturas = 0;
                } catch (e) { /* ignore */ }

                // Registrar no histórico como uma ação especial
                G.history.push({ move: 'passiva: cavalo troca', color: active.owner });
                G.lastMove = { fr: src.r, fc: src.c, tr: r, tc: c };

                // Troca de turno (consome a jogada)
                G.turn = G.turn === 'white' ? 'black' : 'white';

                // Limpa poder ativo
                G.poderAtivo = null;

                mostrarMensagem('Passiva usada: peças trocadas!', 1600);
                try { renderBoard(); } catch (e) { /* ignore */ }

                // Salva estado se em partida multiplayer
                (async function () {
                    try {
                        if (typeof salvarEstadoNoSupabase === 'function' && typeof partidaId !== 'undefined' && partidaId) {
                            await salvarEstadoNoSupabase();
                        }
                    } catch (e) { /* ignore */ }
                })();

                ev.stopPropagation();
                ev.preventDefault();
            }
        }, { capture: true });
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') initPassivas();
    else window.addEventListener('DOMContentLoaded', initPassivas);
})();
