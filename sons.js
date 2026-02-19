// ─── SISTEMA DE SONS ─────────────────────────────────────────────
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function _getCtx() {
    if (!audioCtx) audioCtx = new AudioCtx();
    return audioCtx;
}

function tocarSom(tipo) {
    const ctx = _getCtx();
    // Se o contexto estiver suspenso por política de autoplay, tenta retomar.
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
        ctx.resume().catch(() => { /* ignora se não puder retomar agora */ });
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const sons = {
        mover:    { freq: 840, tipo: 'sine',   dur: 0.08, vol: 0.15 },
        capturar: { freq: 180, tipo: 'square', dur: 0.18, vol: 0.25 },
        xeque:    { freq: 600, tipo: 'sawtooth', dur: 0.25, vol: 0.3 },
        roque:    { freq: 520, tipo: 'triangle', dur: 0.15, vol: 0.2 },
        promocao: { freq: 880, tipo: 'sine',   dur: 0.4,  vol: 0.3 },
        buraco:   { freq: 80,  tipo: 'square', dur: 0.3,  vol: 0.3 },
    };

    const s = sons[tipo] || sons.mover;
    osc.type = s.tipo;
    osc.frequency.setValueAtTime(s.freq, ctx.currentTime);
    gain.gain.setValueAtTime(s.vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + s.dur);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + s.dur);
}