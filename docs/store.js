/* ============================================================
   CAMADA DE DADOS
   - Modo Firebase (produção): Firestore com transações atômicas
   - Modo demonstração: localStorage + BroadcastChannel (abas)
   Ambos expõem a mesma API para o app.
   ============================================================ */

const CODE_ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function genCode(n = 7) {
  const a = new Uint32Array(n); crypto.getRandomValues(a);
  return Array.from(a, x => CODE_ALPHA[x % CODE_ALPHA.length]).join('');
}
function genToken() {
  const a = new Uint8Array(16); crypto.getRandomValues(a);
  return Array.from(a, x => x.toString(16).padStart(2, '0')).join('');
}

/* ---------- Índice físico dos assentos (a partir das plantas) ---------- */
const SEATS = {};   // sala -> id -> info
const ROWSEQ = {};  // sala -> [{r, y, ids}] (ordem de exibição: fundo -> tela)
LAYOUTS.forEach(L => {
  SEATS[L.id] = {};
  ROWSEQ[L.id] = L.rows.map((row, ri) => {
    const ids = row.s.map((s, k) => {
      const id = row.r + (k + 1);
      SEATS[L.id][id] = { id, r: row.r, n: k + 1, x: s[0], y: row.y, t: s[1], b0: !!s[2], ri };
      return id;
    });
    return { r: row.r, y: row.y, ids };
  });
});
const SALA = Object.fromEntries(LAYOUTS.map(L => [L.id, L]));
const TOTAL_FISICO = LAYOUTS.reduce((t, L) => t + Object.keys(SEATS[L.id]).length, 0);

function emptyRoom(salaId) {
  const seats = {};
  Object.values(SEATS[salaId]).forEach(s => { if (s.b0) seats[s.id] = { b: true }; });
  return { seats, v: 0 };
}

/* Valida se um conjunto de assentos pode ser reservado para um código */
function validarAssentos(room, salaId, ids, congId, code, admin) {
  if (!ids.length) throw new Error('Nenhum assento selecionado.');
  for (const id of ids) {
    if (!SEATS[salaId][id]) throw new Error(`Assento ${id} não existe na ${SALA[salaId].nome}.`);
    const st = room.seats[id] || {};
    if (st.b) throw new Error(`O assento ${id} está bloqueado.`);
    if (st.i && st.i !== code) throw new Error(`O assento ${id} acabou de ser reservado por outra família. Escolha outro.`);
    if (!admin && st.a !== congId) throw new Error(`O assento ${id} não pertence à área da sua congregação.`);
  }
}

/* ======================= MODO DEMONSTRAÇÃO ======================= */
function makeLocalStore() {
  const KEY = 'cineFamiliaADCG.demo.v1';
  let db = null;
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  const subs = new Set();
  let ch = null;
  try { ch = new BroadcastChannel(KEY); ch.onmessage = () => { try { db = JSON.parse(localStorage.getItem(KEY)) || db; } catch (e) {} sync(); emit(); }; } catch (e) {}
  const S = { mode: 'demo', rooms: {}, congs: [], isAdmin: false, user: null };
  function sync() { S.rooms = db.rooms; S.congs = db.congs; }
  function emit() { subs.forEach(f => { try { f(); } catch (e) { console.error(e); } }); }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} try { ch && ch.postMessage(1); } catch (e) {} sync(); emit(); }
  const delay = () => new Promise(r => setTimeout(r, 120));

  S.on = f => { subs.add(f); return () => subs.delete(f); };
  S.init = async () => { if (!db || !db.rooms) { db = seedDemo(); save(); } sync(); };
  S.resetDemo = async () => { db = seedDemo(); save(); };
  S.adminLogin = async (email, senha) => { await delay(); if (senha !== '1234') throw new Error('Senha incorreta. Na demonstração a senha é 1234.'); S.isAdmin = true; S.user = email || 'admin'; emit(); };
  S.adminLogout = async () => { S.isAdmin = false; emit(); };
  S.congByToken = async t => db.congs.find(c => c.token === t) || null;
  S.watchInsc = (token, cb) => { const f = () => cb(Object.values(db.insc).filter(i => i.token === token).map(withBil)); f(); return S.on(f); };
  S.watchAllInsc = cb => { const f = () => cb(Object.values(db.insc).map(withBil)); f(); return S.on(f); };
  function withBil(i) { const b = db.bil[i.code]; return { ...i, checkin: b ? b.checkin : null }; }

  S.criarInscricao = async (token, cong, dados, sala, ids) => {
    await delay();
    const code = genCode();
    if (sala) validarAssentos(db.rooms[sala], sala, ids, cong.id, code, S.isAdmin);
    const insc = { code, token, congId: cong.id, ...dados, sala: sala || null, assentos: sala ? ids : [], criadoEm: Date.now() };
    if (sala) ids.forEach(id => { db.rooms[sala].seats[id] = { ...(db.rooms[sala].seats[id] || {}), i: code }; });
    db.insc[code] = insc;
    db.bil[code] = bilheteDe(insc, cong);
    save(); return insc;
  };
  S.definirLugares = async (token, insc, sala, ids, admin) => {
    await delay();
    const cur = db.insc[insc.code]; if (!cur) throw new Error('Inscrição não encontrada.');
    if (sala) validarAssentos(db.rooms[sala], sala, ids, cur.congId, cur.code, admin || S.isAdmin);
    if (cur.sala) cur.assentos.forEach(id => { const st = db.rooms[cur.sala].seats[id]; if (st && st.i === cur.code) delete st.i; });
    if (sala) ids.forEach(id => { db.rooms[sala].seats[id] = { ...(db.rooms[sala].seats[id] || {}), i: cur.code }; });
    cur.sala = sala || null; cur.assentos = sala ? ids : [];
    Object.assign(db.bil[cur.code], { sala: cur.sala, assentos: cur.assentos });
    save();
  };
  S.atualizarInscricao = async (token, code, dados) => {
    const cur = db.insc[code]; Object.assign(cur, dados);
    Object.assign(db.bil[code], { nome: cur.responsavel, qtd: cur.qtd }); save();
  };
  S.cancelar = async (token, insc) => {
    await delay();
    const cur = db.insc[insc.code]; if (!cur) return;
    if (cur.sala) cur.assentos.forEach(id => { const st = db.rooms[cur.sala].seats[id]; if (st && st.i === cur.code) delete st.i; });
    delete db.insc[cur.code]; if (db.bil[cur.code]) db.bil[cur.code].cancelado = true; save();
  };
  S.adminSeats = async (sala, changes) => {
    let skipped = 0; const room = db.rooms[sala];
    for (const [id, ch] of Object.entries(changes)) {
      const st = room.seats[id] || {};
      if (st.i && ('a' in ch || ch.b)) { skipped++; continue; }
      const nx = { ...st, ...ch }; if (nx.a == null) delete nx.a; if (!nx.b) delete nx.b;
      if (Object.keys(nx).length) room.seats[id] = nx; else delete room.seats[id];
    }
    save(); return skipped;
  };
  S.adminSeatMany = async (sala, list) => {
    for (const { code, ids } of list) {
      const cur = db.insc[code]; if (!cur || cur.sala) continue;
      validarAssentos(db.rooms[sala], sala, ids, cur.congId, code, true);
      ids.forEach(id => { db.rooms[sala].seats[id] = { ...(db.rooms[sala].seats[id] || {}), i: code }; });
      cur.sala = sala; cur.assentos = ids; Object.assign(db.bil[code], { sala, assentos: ids });
    }
    save();
  };
  S.saveCong = async c => {
    if (!c.id) { c = { ...c, id: 'c' + genCode(6).toLowerCase(), token: genToken() }; db.congs.push(c); }
    else { const k = db.congs.findIndex(x => x.id === c.id); db.congs[k] = { ...db.congs[k], ...c }; }
    Object.values(db.bil).forEach(b => { if (b.congId === c.id) b.congNome = c.nome; });
    save(); return c;
  };
  S.saveCongs = async list => { for (const c of list) { const n = { ...c, id: 'c' + genCode(6).toLowerCase(), token: genToken() }; db.congs.push(n); } save(); };
  S.deleteCong = async id => {
    db.congs = db.congs.filter(c => c.id !== id);
    Object.values(db.rooms).forEach(r => Object.values(r.seats).forEach(st => { if (st.a === id && !st.i) delete st.a; }));
    save();
  };
  S.getBilhete = async code => db.bil[code] || null;
  S.checkin = async (code, val) => { if (!db.bil[code]) throw new Error('Bilhete não encontrado.'); db.bil[code].checkin = val ? Date.now() : null; save(); };
  S.initRooms = async () => { LAYOUTS.forEach(L => { if (!db.rooms[L.id]) db.rooms[L.id] = emptyRoom(L.id); }); save(); };
  return S;
}

function bilheteDe(insc, cong) {
  return { code: insc.code, nome: insc.responsavel, congId: cong.id, congNome: cong.nome, sala: insc.sala, assentos: insc.assentos, qtd: insc.qtd, checkin: null, criadoEm: insc.criadoEm };
}

/* ======================= MODO FIREBASE ======================= */
async function makeFirebaseStore(cfg) {
  const B = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const [{ initializeApp }, F, A] = await Promise.all([
    import(B + 'firebase-app.js'), import(B + 'firebase-firestore.js'), import(B + 'firebase-auth.js')]);
  const fb = initializeApp(cfg);
  const db = F.getFirestore(fb);
  const auth = A.getAuth(fb);
  const subs = new Set();
  const S = { mode: 'firebase', rooms: {}, congs: [], isAdmin: false, user: null };
  const emit = () => subs.forEach(f => { try { f(); } catch (e) { console.error(e); } });
  S.on = f => { subs.add(f); return () => subs.delete(f); };
  let tokens = {}, unPriv = null;
  const mergeTokens = () => { S.congs = S.congs.map(c => ({ ...c, token: tokens[c.id] || c.token })); };

  async function refreshAdmin() {
    const u = auth.currentUser;
    S.isAdmin = false; S.user = null;
    if (u && !u.isAnonymous) {
      const d = await F.getDoc(F.doc(db, 'admins', u.uid)).catch(() => null);
      S.isAdmin = !!(d && d.exists()); S.user = u.email;
    }
    if (unPriv) { unPriv(); unPriv = null; tokens = {}; }
    if (S.isAdmin) unPriv = F.onSnapshot(F.collection(db, 'congregacoesPriv'), qs => {
      tokens = {}; qs.forEach(d => tokens[d.id] = d.data().token); mergeTokens(); emit();
    });
  }

  S.init = async () => {
    await new Promise((res, rej) => {
      const un = A.onAuthStateChanged(auth, u => { if (u) { un(); res(); } else A.signInAnonymously(auth).catch(rej); });
    });
    await refreshAdmin();
    await new Promise(res => {
      let a = false, b = false; const done = () => a && b && res();
      F.onSnapshot(F.collection(db, 'salas'), qs => { qs.forEach(d => S.rooms[d.id] = d.data()); a = true; done(); emit(); }, e => { console.error(e); a = true; done(); });
      F.onSnapshot(F.collection(db, 'congregacoes'), qs => { S.congs = qs.docs.map(d => ({ id: d.id, ...d.data() })); mergeTokens(); b = true; done(); emit(); }, e => { console.error(e); b = true; done(); });
    });
  };
  S.adminLogin = async (email, senha) => {
    await A.signInWithEmailAndPassword(auth, email, senha);
    await refreshAdmin();
    if (!S.isAdmin) { await S.adminLogout(); throw new Error('Este usuário não está cadastrado como administrador.'); }
    emit();
  };
  S.adminLogout = async () => { await A.signOut(auth); await A.signInAnonymously(auth); await refreshAdmin(); emit(); };
  S.congByToken = async t => {
    const d = await F.getDoc(F.doc(db, 'acessos', t)).catch(() => null);
    if (!d || !d.exists()) return null;
    const id = d.data().congId;
    return S.congs.find(c => c.id === id) || (async () => { const c = await F.getDoc(F.doc(db, 'congregacoes', id)); return c.exists() ? { id, ...c.data() } : null; })();
  };
  S.watchInsc = (token, cb) => F.onSnapshot(F.collection(db, 'acessos', token, 'inscricoes'), qs => cb(qs.docs.map(d => d.data())));
  S.watchAllInsc = cb => {
    let ins = [], bil = {};
    const out = () => cb(ins.map(i => ({ ...i, checkin: bil[i.code] ? bil[i.code].checkin : null })));
    const u1 = F.onSnapshot(F.collectionGroup(db, 'inscricoes'), qs => { ins = qs.docs.map(d => ({ ...d.data(), token: d.ref.parent.parent.id })); out(); });
    const u2 = F.onSnapshot(F.collection(db, 'bilhetes'), qs => { bil = {}; qs.forEach(d => bil[d.id] = d.data()); out(); });
    return () => { u1(); u2(); };
  };
  const seatUpd = (ids, code) => Object.fromEntries(ids.map(id => [`seats.${id}.i`, code === null ? F.deleteField() : code]));

  S.criarInscricao = async (token, cong, dados, sala, ids) => {
    const code = genCode();
    const insc = { code, congId: cong.id, ...dados, sala: sala || null, assentos: sala ? ids : [], criadoEm: Date.now() };
    await F.runTransaction(db, async tx => {
      let roomRef;
      if (sala) {
        roomRef = F.doc(db, 'salas', String(sala));
        const snap = await tx.get(roomRef);
        validarAssentos(snap.data(), sala, ids, cong.id, code, S.isAdmin);
      }
      if (sala) tx.update(roomRef, { ...seatUpd(ids, code), v: F.increment(1) });
      tx.set(F.doc(db, 'acessos', token, 'inscricoes', code), insc);
      tx.set(F.doc(db, 'bilhetes', code), bilheteDe(insc, cong));
    });
    return insc;
  };
  S.definirLugares = async (token, insc, sala, ids, admin) => {
    await F.runTransaction(db, async tx => {
      const iRef = F.doc(db, 'acessos', token, 'inscricoes', insc.code);
      const iSnap = await tx.get(iRef); if (!iSnap.exists()) throw new Error('Inscrição não encontrada.');
      const cur = iSnap.data();
      const oldRef = cur.sala ? F.doc(db, 'salas', String(cur.sala)) : null;
      const newRef = sala ? F.doc(db, 'salas', String(sala)) : null;
      const oldSnap = oldRef ? await tx.get(oldRef) : null;
      const newSnap = newRef ? (cur.sala === sala ? oldSnap : await tx.get(newRef)) : null;
      if (sala) validarAssentos(newSnap.data(), sala, ids, cur.congId, cur.code, admin || S.isAdmin);
      const upd = {};
      if (cur.sala) { const room = oldSnap.data(); cur.assentos.forEach(id => { if ((room.seats[id] || {}).i === cur.code) upd[cur.sala + '|' + id] = null; }); }
      if (sala) ids.forEach(id => upd[sala + '|' + id] = cur.code);
      const bySala = {};
      Object.entries(upd).forEach(([k, v]) => { const [s, id] = k.split('|'); (bySala[s] = bySala[s] || {})[`seats.${id}.i`] = v === null ? F.deleteField() : v; });
      Object.entries(bySala).forEach(([s, u]) => tx.update(F.doc(db, 'salas', s), { ...u, v: F.increment(1) }));
      tx.update(iRef, { sala: sala || null, assentos: sala ? ids : [] });
      tx.update(F.doc(db, 'bilhetes', cur.code), { sala: sala || null, assentos: sala ? ids : [] });
    });
  };
  S.atualizarInscricao = async (token, code, dados) => {
    const b = F.writeBatch(db);
    b.update(F.doc(db, 'acessos', token, 'inscricoes', code), dados);
    b.update(F.doc(db, 'bilhetes', code), { nome: dados.responsavel, qtd: dados.qtd });
    await b.commit();
  };
  S.cancelar = async (token, insc) => {
    await F.runTransaction(db, async tx => {
      const iRef = F.doc(db, 'acessos', token, 'inscricoes', insc.code);
      const iSnap = await tx.get(iRef); if (!iSnap.exists()) return;
      const cur = iSnap.data();
      let roomSnap = null, roomRef = null;
      if (cur.sala) { roomRef = F.doc(db, 'salas', String(cur.sala)); roomSnap = await tx.get(roomRef); }
      if (roomSnap) {
        const room = roomSnap.data();
        const ids = cur.assentos.filter(id => (room.seats[id] || {}).i === cur.code);
        if (ids.length) tx.update(roomRef, { ...seatUpd(ids, null), v: F.increment(1) });
      }
      tx.delete(iRef);
      tx.update(F.doc(db, 'bilhetes', cur.code), { cancelado: true });
    });
  };
  S.adminSeats = async (sala, changes) => {
    let skipped = 0;
    await F.runTransaction(db, async tx => {
      skipped = 0;
      const ref = F.doc(db, 'salas', String(sala));
      const room = (await tx.get(ref)).data();
      const upd = {};
      for (const [id, ch] of Object.entries(changes)) {
        const st = room.seats[id] || {};
        if (st.i && ('a' in ch || ch.b)) { skipped++; continue; }
        if ('a' in ch) upd[`seats.${id}.a`] = ch.a == null ? F.deleteField() : ch.a;
        if ('b' in ch) upd[`seats.${id}.b`] = ch.b ? true : F.deleteField();
      }
      if (Object.keys(upd).length) tx.update(ref, { ...upd, v: F.increment(1) });
    });
    return skipped;
  };
  S.adminSeatMany = async (sala, list) => {
    for (let k = 0; k < list.length; k += 150) {
      const chunk = list.slice(k, k + 150);
      await F.runTransaction(db, async tx => {
        const ref = F.doc(db, 'salas', String(sala));
        const room = (await tx.get(ref)).data();
        const upd = {};
        chunk.forEach(({ code, ids, congId }) => { validarAssentos(room, sala, ids, congId, code, true); ids.forEach(id => upd[`seats.${id}.i`] = code); });
        tx.update(ref, { ...upd, v: F.increment(1) });
        chunk.forEach(({ token, code, ids }) => {
          tx.update(F.doc(db, 'acessos', token, 'inscricoes', code), { sala, assentos: ids });
          tx.update(F.doc(db, 'bilhetes', code), { sala, assentos: ids });
        });
      });
    }
  };
  S.saveCong = async c => {
    const dados = { nome: c.nome, responsavel: c.responsavel || '', telefone: c.telefone || '', cota: +c.cota || 0 };
    if (!c.id) {
      const ref = F.doc(F.collection(db, 'congregacoes')); const token = genToken();
      const b = F.writeBatch(db);
      b.set(ref, dados); b.set(F.doc(db, 'congregacoesPriv', ref.id), { token }); b.set(F.doc(db, 'acessos', token), { congId: ref.id });
      await b.commit(); return { id: ref.id, token, ...dados };
    }
    await F.updateDoc(F.doc(db, 'congregacoes', c.id), dados); return c;
  };
  S.saveCongs = async list => {
    for (let k = 0; k < list.length; k += 150) {
      const b = F.writeBatch(db);
      list.slice(k, k + 150).forEach(c => {
        const ref = F.doc(F.collection(db, 'congregacoes')); const token = genToken();
        b.set(ref, { nome: c.nome, responsavel: c.responsavel || '', telefone: c.telefone || '', cota: +c.cota || 0 });
        b.set(F.doc(db, 'congregacoesPriv', ref.id), { token }); b.set(F.doc(db, 'acessos', token), { congId: ref.id });
      });
      await b.commit();
    }
  };
  S.deleteCong = async id => {
    for (const L of LAYOUTS) {
      const room = S.rooms[L.id]; if (!room) continue;
      const ch = {}; Object.entries(room.seats).forEach(([sid, st]) => { if (st.a === id && !st.i) ch[sid] = { a: null }; });
      if (Object.keys(ch).length) await S.adminSeats(L.id, ch);
    }
    const tk = tokens[id];
    const b = F.writeBatch(db);
    b.delete(F.doc(db, 'congregacoes', id)); b.delete(F.doc(db, 'congregacoesPriv', id));
    if (tk) b.delete(F.doc(db, 'acessos', tk));
    await b.commit();
  };
  S.getBilhete = async code => { const d = await F.getDoc(F.doc(db, 'bilhetes', code)); return d.exists() ? d.data() : null; };
  S.checkin = async (code, val) => F.updateDoc(F.doc(db, 'bilhetes', code), { checkin: val ? Date.now() : null });
  S.initRooms = async () => {
    for (const L of LAYOUTS) {
      const ref = F.doc(db, 'salas', String(L.id));
      const d = await F.getDoc(ref); if (!d.exists()) await F.setDoc(ref, emptyRoom(L.id));
    }
  };
  return S;
}

/* ======================= DADOS DE DEMONSTRAÇÃO ======================= */
function seedDemo() {
  const db = { rooms: {}, congs: [], insc: {}, bil: {} };
  LAYOUTS.forEach(L => db.rooms[L.id] = emptyRoom(L.id));
  const nomes = [['Igreja Sede (exemplo)', 80], ['Congregação João Wesley', 60], ['Congregação Exemplo 03', 45], ['Congregação Exemplo 04', 38],
    ['Congregação Exemplo 05', 52], ['Congregação Exemplo 06', 30], ['Congregação Exemplo 07', 26], ['Congregação Exemplo 08', 41], ['Congregação Exemplo 09', 34], ['Congregação Exemplo 10', 22]];
  db.congs = nomes.map(([nome, cota], k) => ({ id: 'c' + (k + 1), nome, responsavel: '', telefone: '', cota, token: genToken() }));
  const plan = planoDistribuicao(db.rooms, db.congs, [1, 4, 7]);
  plan.forEach(({ sala, ids, congId }) => ids.forEach(id => { db.rooms[sala].seats[id] = { ...(db.rooms[sala].seats[id] || {}), a: congId }; }));
  const pn = ['Silva', 'Souza', 'Oliveira', 'Santos', 'Pereira', 'Costa', 'Rodrigues', 'Almeida', 'Nascimento', 'Lima', 'Araújo', 'Fernandes', 'Carvalho', 'Gomes', 'Martins', 'Rocha', 'Ribeiro', 'Alves', 'Monteiro', 'Mendes'];
  const pr = ['Ana', 'João', 'Maria', 'Pedro', 'Paulo', 'Lucas', 'Juliana', 'Marcos', 'Fernanda', 'Rafael', 'Patrícia', 'Carlos', 'Débora', 'Tiago', 'Raquel', 'André'];
  let k = 0;
  db.congs.slice(0, 6).forEach(c => {
    for (let f = 0; f < 4; f++) {
      const qtd = 2 + ((k * 7) % 4);
      const code = genCode();
      const insc = { code, token: c.token, congId: c.id, responsavel: `${pr[k % pr.length]} ${pn[k % pn.length]}`, telefone: '', qtd, nomes: [], obs: '', sala: null, assentos: [], criadoEm: Date.now() - k * 3600e3 };
      k++;
      if (f < 3) {
        for (const L of LAYOUTS) { const ids = acharLugares(db.rooms[L.id], L.id, c.id, qtd); if (ids) { ids.forEach(id => db.rooms[L.id].seats[id].i = code); insc.sala = L.id; insc.assentos = ids; break; } }
      }
      db.insc[code] = insc; db.bil[code] = bilheteDe(insc, c);
    }
  });
  return db;
}

/* ======================= ALGORITMOS ======================= */
const adj = (sala, a, b) => Math.abs(SEATS[sala][a].x - SEATS[sala][b].x) <= 1.25;

/* Corridas de assentos lado a lado (sem corredor) que satisfazem pred */
function corridas(sala, pred) {
  const out = [];
  ROWSEQ[sala].forEach(row => {
    let cur = [];
    row.ids.forEach(id => {
      if (pred(id) && (!cur.length || adj(sala, cur[cur.length - 1], id))) cur.push(id);
      else { if (cur.length) out.push(cur); cur = pred(id) ? [id] : []; }
    });
    if (cur.length) out.push(cur);
  });
  return out;
}

/* Melhor bloco de n lugares lado a lado, livre, na área da congregação.
   Heurística de encaixe: prefere encaixe exato e pontas de corredor, evitando sobrar 1 lugar isolado. */
function acharLugares(room, sala, congId, n, opts = {}) {
  const livre = id => { const st = room.seats[id] || {}; return !st.b && !st.i && st.a === congId && (opts.especiais || SEATS[sala][id].t === 'N'); };
  let best = null, bestScore = Infinity;
  corridas(sala, livre).forEach((run, ri) => {
    if (run.length < n) return;
    const sobra = run.length - n;
    const score = (sobra === 0 ? 0 : sobra === 1 ? 50 : 10) + ri * 0.01;
    if (score < bestScore) { bestScore = score; best = run.slice(0, n); }
  });
  if (!best && !opts.especiais) return acharLugares(room, sala, congId, n, { especiais: true });
  return best;
}

/* Ordem serpentina (fundo -> frente, alternando o sentido) dos assentos comuns livres */
function ordemSerpentina(room, sala) {
  const out = [];
  ROWSEQ[sala].forEach((row, k) => {
    const ids = row.ids.filter(id => { const st = room.seats[id] || {}; return !st.b && !st.a && !st.i && SEATS[sala][id].t === 'N'; });
    out.push(...(k % 2 ? ids.reverse() : ids));
  });
  return out;
}

/* Distribuição automática de áreas por cota (maiores primeiro, first-fit nas salas) */
function planoDistribuicao(rooms, congs, salas) {
  const pool = {}; salas.forEach(s => pool[s] = ordemSerpentina(rooms[s], s));
  const plan = [];
  [...congs].filter(c => +c.cota > 0).sort((a, b) => b.cota - a.cota).forEach(c => {
    let falta = +c.cota;
    let s = salas.find(s => pool[s].length >= falta);
    if (s) { plan.push({ congId: c.id, sala: s, ids: pool[s].splice(0, falta) }); return; }
    const ordem = [...salas].sort((a, b) => pool[b].length - pool[a].length);
    for (const s2 of ordem) { if (!falta) break; const take = pool[s2].splice(0, falta); if (take.length) { plan.push({ congId: c.id, sala: s2, ids: take }); falta -= take.length; } }
    if (falta) plan.push({ congId: c.id, falta });
  });
  return plan;
}

/* Contagens por sala */
function statsSala(room, sala) {
  const r = { total: 0, bloq: 0, area: 0, res: 0, livre: 0 };
  Object.keys(SEATS[sala]).forEach(id => {
    const st = (room && room.seats[id]) || {}; r.total++;
    if (st.b) r.bloq++; else if (st.i) { r.res++; if (st.a) r.area++; } else if (st.a) r.area++; else r.livre++;
  });
  return r;
}
