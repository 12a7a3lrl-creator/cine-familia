// =============================================================
// CONFIGURAÇÃO — Cine Família ADCG
// Projeto Firebase: cine-familia-adcg
// (Estes dados são públicos por natureza; quem protege o banco são as regras do Firestore.)
// =============================================================
window.CINE_CONFIG = {
  firebase: {
    apiKey: "AIzaSyDndKIMvGZpXHiO2VwYbCCQwS_Ry6jfazk",
    authDomain: "cine-familia-adcg.firebaseapp.com",
    projectId: "cine-familia-adcg",
    storageBucket: "cine-familia-adcg.firebasestorage.app",
    messagingSenderId: "1036590615457",
    appId: "1:1036590615457:web:ea8bc990041e6e4db319e0"
  },
  evento: {
    titulo: "Cine Família ADCG",
    filme: "A Virada: Ignição da Alma",
    data: "2026-11-23",   // AAAA-MM-DD
    hora: "19:30",
    local: "UCI Park Shopping Campo Grande",
    maxPessoas: 12        // máximo de pessoas por família/grupo
  }
};

// -------------------------------------------------------------
// Correção 09/11: quando o painel era reaberto já logado (?admin),
// a lista de inscrições não começava a ser acompanhada.
// Garante que, sempre que houver um administrador logado, o painel
// receba as inscrições em tempo real.
// -------------------------------------------------------------
setInterval(function () {
  try {
    if (typeof store !== 'undefined' && store && store.isAdmin && typeof app !== 'undefined' && !app.unAll && typeof startAll === 'function') {
      startAll();
      if (typeof live === 'function') live();
    }
  } catch (e) { console.error(e); }
}, 1000);
