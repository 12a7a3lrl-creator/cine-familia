// =============================================================
// CONFIGURAÇÃO — Cine Família ADCG
// 1) Cole aqui o "firebaseConfig" do seu projeto (Console do Firebase >
//    Configurações do projeto > Seus apps > App da Web).
// 2) Enquanto apiKey estiver vazio, o site roda em MODO DEMONSTRAÇÃO
//    (dados só no navegador, sem compartilhamento).
// =============================================================
window.CINE_CONFIG = {
  firebase: {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
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
