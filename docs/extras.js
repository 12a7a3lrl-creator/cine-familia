/* ============================================================
   EXTRAS — melhorias publicadas depois da versão inicial
   (carregado automaticamente pelo config.js, depois do app.js)
   ============================================================ */

/* 09/11 — Painel: garante que as inscrições sejam acompanhadas
   mesmo quando o painel é reaberto já logado (?admin). */
setInterval(function () {
  try {
    if (store && store.isAdmin && !app.unAll) { startAll(); live(); }
  } catch (e) { console.error(e); }
}, 1000);

/* 09/11 — Acomodar UMA família específica (aba Inscrições). */
ACTS.acomodarUma = async el => {
  const i = app.all.find(x => x.code === el.dataset.code);
  if (!i || i.sala) return;
  const rooms = JSON.parse(JSON.stringify(store.rooms));
  for (const L of LAYOUTS) {
    if (!rooms[L.id]) continue;
    const ids = acharLugares(rooms[L.id], L.id, i.congId, +i.qtd);
    if (!ids) continue;
    el.disabled = true; el.textContent = 'Acomodando…';
    try {
      await store.adminSeatMany(L.id, [{ token: i.token, code: i.code, ids, congId: i.congId }]);
      toast(`${i.responsavel}: Sala ${L.id} · ${seatsTxt(ids)}`);
    } catch (e) { toast(e.message, 'err'); el.disabled = false; el.textContent = 'Acomodar'; }
    return;
  }
  toast('Não há lugares seguidos suficientes na área desta congregação. Amplie a área em “Mapa e áreas”.', 'warn');
};
ACTS.filtroSemLugar = () => { app.soSemLugar = !app.soSemLugar; render(); };

aInsc = function () {
  const q = app.busca.toLowerCase();
  const semLugar = app.all.filter(i => !i.sala).length;
  const list = app.all
    .filter(i => !app.soSemLugar || !i.sala)
    .filter(i => !q || (i.responsavel + ' ' + (congById(i.congId)?.nome || '') + ' ' + i.code).toLowerCase().includes(q))
    .sort((a, b) => (congById(a.congId)?.nome || '').localeCompare(congById(b.congId)?.nome || '', 'pt') || a.responsavel.localeCompare(b.responsavel, 'pt'));
  return `<section class="card"><div class="row wrap"><h3 class="grow">${app.all.length} famílias</h3>
    <button class="btn sm ${app.soSemLugar ? 'primary' : ''}" data-act="filtroSemLugar">Só sem lugar (${semLugar})</button>
    <button class="btn sm" data-act="csvInsc">Exportar CSV</button></div>
  <input class="search" placeholder="Buscar por nome, congregação ou código…" data-input="busca" value="${esc(app.busca)}">
  <div class="tablewrap"><table><thead><tr><th>Responsável</th><th>Congregação</th><th>Pessoas</th><th>Sala</th><th>Assentos</th><th>Código</th><th></th></tr></thead><tbody>
  ${list.map(i => `<tr><td>${esc(i.responsavel)}${i.obs ? `<div class="small muted">${esc(i.obs)}</div>` : ''}</td><td>${esc(congById(i.congId)?.nome || '?')}</td><td>${i.qtd}</td><td>${i.sala ? `<span class="sala-dot" style="--c:${SALA[i.sala].cor}"></span>${i.sala}` : '<span class="pill warn">—</span>'}</td><td class="small">${sortSeats(i.assentos).join(' ')}</td><td class="mono">${i.code}</td><td>${i.checkin ? '<span class="pill ok">entrou</span>' : ''} ${i.sala ? `<button class="btn sm ghost" data-act="abrirBilhete" data-code="${i.code}">Bilhete</button>` : `<button class="btn sm primary" data-act="acomodarUma" data-code="${i.code}">Acomodar</button>`}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Nenhuma inscrição.</td></tr>'}
  </tbody></table></div></section>`;
};
if (app.view === 'admin' && app.admTab === 'insc') render();
