const view = document.getElementById("view");
const modal = document.getElementById("modal");
const modalBody = document.getElementById("modalBody");

const STATUS = {
  novo: "Novo",
  em_atendimento: "Em atendimento",
  convertido: "Convertido",
  perdido: "Perdido",
};
const SERVICES = { entrega: "Entrega", instalacao: "Instalação no local", orientacao: "Orientação técnica" };
const DELIVERY = { entrega: "Entrega no endereço", retirada: "Retirada na fábrica (Divinópolis)" };
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const BRL_CENTS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const money = (v) => (v == null ? "sob consulta" : (Number.isInteger(v) ? BRL : BRL_CENTS).format(v));

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const media = (f) => (f ? `/media/${encodeURIComponent(f)}` : "");
const fmtDate = (iso) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
const fmtM = (n) => Number(n || 0).toFixed(2).replace(".", ",");
const lines = (v) => String(v || "").split("\n").map((s) => s.trim()).filter(Boolean);

let cat = null; // cache do catálogo admin

async function api(path, opts = {}) {
  const res = await fetch(`/api/admin${path}`, {
    ...opts,
    headers: opts.body && !(opts.body instanceof FormData) ? { "content-type": "application/json" } : {},
    body: opts.body && !(opts.body instanceof FormData) ? JSON.stringify(opts.body) : opts.body,
  });
  if (res.status === 401) { showLogin(); throw new Error("Sessão expirada"); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Erro");
  return data;
}

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { t.hidden = true; }, 2600);
}

async function loadCatalog(force) {
  if (!cat || force) cat = await api("/catalogo");
  return cat;
}
const productByCode = (code) => cat?.products.find((p) => p.code === code);

/* ---------- login ---------- */
function showLogin() {
  document.getElementById("shell").hidden = true;
  document.getElementById("login").hidden = false;
}
document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  const err = document.getElementById("loginError");
  err.textContent = "";
  const res = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user: f.user.value, password: f.password.value }),
  });
  if (!res.ok) { err.textContent = (await res.json().catch(() => ({}))).error || "Falha no login"; return; }
  start();
});
document.getElementById("logout").addEventListener("click", async () => {
  await fetch("/api/admin/logout", { method: "POST" });
  showLogin();
});

/* ---------- roteamento ---------- */
const routes = [
  [/^#\/orcamento\/([\w-]+)$/, (m) => viewSubmission(m[1]), "orcamentos"],
  [/^#\/produtos$/, viewProducts, "produtos"],
  [/^#\/categorias$/, viewCategories, "categorias"],
  [/^#\/opcionais$/, viewEquipment, "opcionais"],
  [/^#\/vendedoras$/, viewSellers, "vendedoras"],
  [/^.*$/, viewSubmissions, "orcamentos"],
];
async function route() {
  const hash = location.hash || "#/";
  for (const [re, fn, nav] of routes) {
    const m = hash.match(re);
    if (!m) continue;
    document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("is-active", a.dataset.nav === nav));
    try { await fn(m); } catch (e) { view.innerHTML = `<div class="card empty">${esc(e.message)}</div>`; }
    return;
  }
}
window.addEventListener("hashchange", route);

/* ---------- orçamentos ---------- */
const listState = { q: "", status: "", seller: "" };

async function viewSubmissions() {
  await loadCatalog();
  const stats = await api("/stats");
  const total = Object.values(stats.byStatus).reduce((a, b) => a + b, 0);
  view.innerHTML = `
    <div class="page-head">
      <div><h1>Orçamentos</h1><p>Pedidos enviados pelos clientes no catálogo.</p></div>
      <a class="btn btn--light" id="csv" href="#">Exportar CSV</a>
    </div>
    <div class="stats">
      <div class="stat"><small>Hoje</small><strong>${stats.today}</strong></div>
      <div class="stat"><small>Novos</small><strong>${stats.byStatus.novo || 0}</strong></div>
      <div class="stat"><small>Em atendimento</small><strong>${stats.byStatus.em_atendimento || 0}</strong></div>
      <div class="stat"><small>Convertidos</small><strong>${stats.byStatus.convertido || 0}</strong></div>
      <div class="stat"><small>Total</small><strong>${total}</strong></div>
    </div>
    <div class="filters">
      <input class="input" id="q" placeholder="Buscar por código, cidade ou modelo" value="${esc(listState.q)}">
      <select class="input" id="status"><option value="">Todos os status</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${listState.status === k ? "selected" : ""}>${v}</option>`).join("")}</select>
      ${cat.sellers.length ? `<select class="input" id="seller"><option value="">Todas as vendedoras</option>${cat.sellers.map((s) => `<option value="${esc(s.slug)}" ${listState.seller === s.slug ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>` : ""}
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Código</th><th>Cidade</th><th>Modelos</th><th>Valor aprox.</th><th>Vendedora</th><th>Data</th><th>Status</th></tr></thead>
      <tbody id="rows"><tr><td colspan="7" class="empty">Carregando…</td></tr></tbody>
    </table></div>`;

  const load = async () => {
    const qs = new URLSearchParams(Object.entries(listState).filter(([, v]) => v));
    document.getElementById("csv").href = `/api/admin/orcamentos.csv?${qs}`;
    const { rows } = await api(`/orcamentos?${qs}&limit=200`);
    document.getElementById("rows").innerHTML = rows.length ? rows.map((s) => `
      <tr data-code="${esc(s.code)}">
        <td><span class="code">${esc(s.code)}</span></td>
        <td><strong>${esc(s.city)}</strong></td>
        <td><div class="thumbs">${s.items.slice(0, 4).map((i) => { const p = productByCode(i.code); return p ? `<img src="${media(p.images[0])}" alt="" title="${esc(i.name)}">` : ""; }).join("")}</div><div class="muted">${s.items.map((i) => esc(i.code)).join(", ")}</div></td>
        <td><strong>${s.total != null ? money(s.total) : "—"}</strong></td>
        <td class="muted">${esc(s.seller_name || "—")}</td>
        <td class="muted">${fmtDate(s.created_at)}</td>
        <td><span class="pill pill--${s.status}">${STATUS[s.status] || s.status}</span></td>
      </tr>`).join("") : `<tr><td colspan="7" class="empty">Nenhum orçamento encontrado.</td></tr>`;
    document.querySelectorAll("#rows tr[data-code]").forEach((tr) => tr.addEventListener("click", () => { location.hash = `#/orcamento/${tr.dataset.code}`; }));
  };

  let t;
  document.getElementById("q").addEventListener("input", (e) => { listState.q = e.target.value; clearTimeout(t); t = setTimeout(load, 250); });
  document.getElementById("status").addEventListener("change", (e) => { listState.status = e.target.value; load(); });
  document.getElementById("seller")?.addEventListener("change", (e) => { listState.seller = e.target.value; load(); });
  await load();
}

async function viewSubmission(code) {
  await loadCatalog();
  const s = await api(`/orcamentos/${encodeURIComponent(code)}`);
  view.innerHTML = `
    <div class="page-head">
      <div><a href="#/" class="muted">← Orçamentos</a><h1 style="margin-top:6px">${esc(s.code)}</h1><p>Recebido em ${fmtDate(s.created_at)}${s.origin ? ` · origem: ${esc(s.origin)}` : ""}</p></div>
      <div class="row">
        <button class="btn btn--light" id="copy">Copiar resumo</button>
      </div>
    </div>
    <div class="detail">
      <div class="card">
        <h3 class="section-title">Pedido</h3>
        <dl class="kv">
          <dt>Cidade</dt><dd>${esc(s.city)}</dd>
          <dt>Entrega</dt><dd>${esc(DELIVERY[s.delivery] || "—")}</dd>
          <dt>Serviços</dt><dd>${s.services.map((x) => esc(SERVICES[x] || x)).join(", ") || "—"}</dd>
          <dt>Opcionais</dt><dd>${s.equipment.map((e) => `${esc(e.name)} (${money(e.price)})`).join(", ") || "—"}</dd>
          <dt>Valor aproximado</dt><dd>${s.total != null ? money(s.total) : "sob consulta"}</dd>
          <dt>Observações</dt><dd style="font-weight:400">${esc(s.notes || "—")}</dd>
        </dl>
        <h3 class="section-title" style="margin-top:22px">Modelos escolhidos</h3>
        <div class="items">${s.items.map((i) => {
          const p = productByCode(i.code);
          return `<div class="item">${p ? `<img src="${media(p.images[0])}" alt="">` : "<span></span>"}<div><strong>${esc(i.name === i.code ? i.code : `${i.code} · ${i.name}`)}</strong> <span class="muted">${money(i.price)}</span><div class="muted">${esc(i.subtitle)}${i.color ? ` · cor ${esc(i.color.toLowerCase())}` : ""}${p ? ` · ${p.length ? `${fmtM(p.length)} × ${fmtM(p.width)} m` : ""}${p.depth ? ` · ${esc(p.depth)}` : ""}` : ""}</div></div></div>`;
        }).join("")}</div>
      </div>
      <div class="card">
        <h3 class="section-title">Atendimento</h3>
        <div class="grid2">
          <label class="field">Status
            <select class="input" id="st">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${s.status === k ? "selected" : ""}>${v}</option>`).join("")}</select>
          </label>
          <label class="field">Vendedora
            <select class="input" id="sl"><option value="">—</option>${cat.sellers.map((x) => `<option value="${esc(x.slug)}" ${s.seller === x.slug ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>
          </label>
        </div>
        <label class="field" style="margin-top:12px">Anotações internas
          <textarea class="input" id="nt" placeholder="Valores passados, retorno do cliente…">${esc(s.internal_notes)}</textarea>
        </label>
        <div class="row" style="margin-top:12px;justify-content:space-between">
          <span class="muted">Webhook n8n: ${esc(s.webhook_status || (cat.settings.webhook ? "pendente" : "não configurado"))}</span>
          <div class="row">
            ${cat.settings.webhook ? `<button class="btn btn--light btn--sm" id="rewh">Reenviar ao n8n</button>` : ""}
            <button class="btn btn--primary" id="save">Salvar</button>
          </div>
        </div>
        <h3 class="section-title" style="margin-top:22px">Resumo</h3>
        <pre class="summary">${esc(s.resumo)}</pre>
      </div>
    </div>`;

  const st = document.getElementById("st"), sl = document.getElementById("sl"), nt = document.getElementById("nt");
  document.getElementById("copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(s.resumo); toast("Resumo copiado"); } catch { toast("Não foi possível copiar"); }
  });
  document.getElementById("save").addEventListener("click", async () => {
    await api(`/orcamentos/${s.code}`, { method: "PATCH", body: { status: st.value, seller: sl.value, internal_notes: nt.value } });
    toast("Salvo");
  });
  document.getElementById("rewh")?.addEventListener("click", async () => {
    await api(`/orcamentos/${s.code}/reenviar-webhook`, { method: "POST" });
    toast("Reenviado");
    viewSubmission(s.code);
  });
}

/* ---------- editor de imagens ---------- */
function imageEditor(container, initial, { multiple = true } = {}) {
  let files = [...initial];
  const draw = () => {
    container.innerHTML = `<div class="imgs">
      ${files.map((f, i) => `<figure><img src="${media(f)}" alt=""><figcaption>
        ${multiple ? `<button type="button" data-left="${i}" title="Mover para a esquerda">◀</button>` : "<span></span>"}
        <button type="button" data-rm="${i}" title="Remover">remover</button>
      </figcaption></figure>`).join("")}
      ${multiple || !files.length ? `<label class="upload">+ enviar<br>imagem<input type="file" accept="image/jpeg,image/png,image/webp" ${multiple ? "multiple" : ""}></label>` : ""}
    </div>`;
    container.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => { files.splice(+b.dataset.rm, 1); draw(); }));
    container.querySelectorAll("[data-left]").forEach((b) => b.addEventListener("click", () => {
      const i = +b.dataset.left;
      if (i > 0) [files[i - 1], files[i]] = [files[i], files[i - 1]];
      draw();
    }));
    container.querySelector("input[type=file]")?.addEventListener("change", async (e) => {
      const fd = new FormData();
      [...e.target.files].forEach((f) => fd.append("files", f));
      try {
        const { files: up } = await api("/upload", { method: "POST", body: fd });
        files = multiple ? [...files, ...up] : up.slice(0, 1);
        draw();
      } catch (err) { toast(err.message); }
    });
  };
  draw();
  return () => files;
}

function openModal(html) {
  modalBody.innerHTML = html;
  modal.showModal();
  modalBody.querySelector("[data-cancel]")?.addEventListener("click", () => modal.close());
  return modalBody.querySelector("form");
}

/* ---------- produtos ---------- */
/** Resultado da última sincronização de preços vinda do sistema da Anil (via n8n). */
function syncBox(s) {
  if (!s) {
    return `<div class="card sync"><strong>Preços do sistema:</strong> nenhuma sincronização recebida ainda. Os preços abaixo são os cadastrados no painel.</div>`;
  }
  return `<div class="card sync">
    <strong>Preços sincronizados com o sistema em ${fmtDate(s.at)}</strong> — ${s.updated} ${s.updated === 1 ? "preço alterado" : "preços alterados"} de ${s.received} recebidos.
    O código do produto precisa ser igual à referência do sistema para o preço ser atualizado.
    ${s.missing.length ? `<div class="muted">Sem preço no sistema (mantêm o valor do painel): ${s.missing.map(esc).join(", ")}</div>` : ""}
    ${s.unknown.length ? `<div class="muted">Referências do sistema sem produto no catálogo: ${s.unknown.map(esc).join(", ")}</div>` : ""}
  </div>`;
}

async function viewProducts() {
  await loadCatalog(true);
  view.innerHTML = `
    <div class="page-head">
      <div><h1>Produtos</h1><p>Clique em um produto para editar fotos, medidas e disponibilidade.</p></div>
      <button class="btn btn--primary" id="new">Novo produto</button>
    </div>
    ${syncBox(cat.settings.priceSync)}
    ${cat.categories.map((c) => {
      const ps = cat.products.filter((p) => p.category === c.slug);
      return `<section class="cat-block">
        <h2>${esc(c.name)} <span class="pill ${c.active ? "pill--convertido" : "pill--off"}">${ps.filter((p) => p.active).length} ativos</span></h2>
        <div class="pgrid">${ps.map((p) => `
          <button class="pcard ${p.active ? "" : "is-off"}" data-id="${p.id}">
            <img src="${media(p.images[0])}" alt="" loading="lazy">
            <div><strong>${esc(p.name)}</strong><span class="muted">${esc(p.code)} · ${money(p.price)}</span></div>
          </button>`).join("") || `<div class="muted">Nenhum produto.</div>`}</div>
      </section>`;
    }).join("")}`;
  document.getElementById("new").addEventListener("click", () => editProduct(null));
  view.querySelectorAll(".pcard").forEach((b) => b.addEventListener("click", () => editProduct(cat.products.find((p) => p.id === +b.dataset.id))));
}

function editProduct(p) {
  const isNew = !p;
  p = p || { code: "", category: cat.categories[0]?.slug, name: "", subtitle: "", length: "", width: "", depth: "", people: "", highlights: [], images: [], plan: "", colors: ["Azul", "Branca"], sort: 99, active: true };
  const form = openModal(`
    <form>
      <h2>${isNew ? "Novo produto" : `Editar ${esc(p.code)}`}</h2>
      <div class="grid3">
        <label class="field">Código <span class="hint">= referência no sistema</span><input class="input" name="code" value="${esc(p.code)}" required></label>
        <label class="field">Categoria<select class="input" name="category">${cat.categories.map((c) => `<option value="${esc(c.slug)}" ${c.slug === p.category ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
        <label class="field">Ordem<input class="input" name="sort" type="number" value="${esc(p.sort)}"></label>
      </div>
      <div class="grid2">
        <label class="field">Nome exibido<input class="input" name="name" value="${esc(p.name)}" required></label>
        <label class="field">Subtítulo<input class="input" name="subtitle" value="${esc(p.subtitle)}" placeholder="Ex.: Com escada e dois bancos"></label>
      </div>
      <div class="grid3">
        <label class="field">Comprimento (m)<input class="input" name="length" type="number" step="0.01" value="${esc(p.length ?? "")}"></label>
        <label class="field">Largura (m)<input class="input" name="width" type="number" step="0.01" value="${esc(p.width ?? "")}"></label>
        <label class="field">Profundidade<input class="input" name="depth" value="${esc(p.depth)}" placeholder="Ex.: 1,40 m"></label>
      </div>
      <div class="grid3">
        <label class="field">Preço (R$) <span class="hint">vazio = sob consulta</span><input class="input" name="price" type="number" step="0.01" min="0" value="${esc(p.price ?? "")}"></label>
        <label class="field">Lugares (spas/banheiras)<input class="input" name="people" type="number" value="${esc(p.people ?? "")}"></label>
        <label class="field">Cores <span class="hint">separadas por vírgula</span><input class="input" name="colors" value="${esc(p.colors.join(", "))}"></label>
      </div>
      <label class="field">Destaques <span class="hint">um por linha</span><textarea class="input" name="highlights">${esc(p.highlights.join("\n"))}</textarea></label>
      <div class="field">Fotos <span class="hint">a primeira é a capa</span><div id="imgs"></div></div>
      <div class="field">Planta / desenho técnico<div id="plan"></div></div>
      <label class="check"><input type="checkbox" name="active" ${p.active ? "checked" : ""}> Visível no catálogo</label>
      <div class="error" id="err"></div>
      <div class="modal__actions">
        ${isNew ? "<span></span>" : `<button type="button" class="btn btn--danger" id="del">Excluir</button>`}
        <div class="row"><button type="button" class="btn btn--light" data-cancel>Cancelar</button><button class="btn btn--primary">Salvar</button></div>
      </div>
    </form>`);
  const getImgs = imageEditor(form.querySelector("#imgs"), p.images);
  const getPlan = imageEditor(form.querySelector("#plan"), p.plan ? [p.plan] : [], { multiple: false });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = form.elements;
    const body = {
      code: f.code.value, category: f.category.value, sort: f.sort.value, name: f.name.value, subtitle: f.subtitle.value,
      length: f.length.value, width: f.width.value, depth: f.depth.value, people: f.people.value, price: f.price.value,
      colors: f.colors.value.split(",").map((s) => s.trim()).filter(Boolean),
      highlights: lines(f.highlights.value), images: getImgs(), plan: getPlan()[0] || "", active: f.active.checked,
    };
    try {
      await api(isNew ? "/produtos" : `/produtos/${p.id}`, { method: isNew ? "POST" : "PUT", body });
      modal.close(); toast("Produto salvo"); viewProducts();
    } catch (err) { form.querySelector("#err").textContent = err.message; }
  });
  form.querySelector("#del")?.addEventListener("click", async () => {
    if (!confirm(`Excluir ${p.code}? Para só esconder do catálogo, desmarque "Visível no catálogo".`)) return;
    await api(`/produtos/${p.id}`, { method: "DELETE" });
    modal.close(); toast("Produto excluído"); viewProducts();
  });
}

/* ---------- categorias ---------- */
async function viewCategories() {
  await loadCatalog(true);
  view.innerHTML = `
    <div class="page-head">
      <div><h1>Categorias</h1><p>O que o cliente escolhe na etapa 2. A ficha técnica aparece nos detalhes de cada produto.</p></div>
      <button class="btn btn--primary" id="new">Nova categoria</button>
    </div>
    <div class="pgrid">${cat.categories.map((c) => `
      <button class="pcard ${c.active ? "" : "is-off"}" data-slug="${esc(c.slug)}">
        <img src="${media(c.cover)}" alt="">
        <div><strong>${esc(c.name)}</strong><span class="muted">${esc(c.tagline)}</span></div>
      </button>`).join("")}</div>`;
  document.getElementById("new").addEventListener("click", () => editCategory(null));
  view.querySelectorAll(".pcard").forEach((b) => b.addEventListener("click", () => editCategory(cat.categories.find((c) => c.slug === b.dataset.slug))));
}

function editCategory(c) {
  const isNew = !c;
  c = c || { slug: "", name: "", tagline: "", description: "", cover: "", specs: [], sort: 99, active: true };
  const form = openModal(`
    <form>
      <h2>${isNew ? "Nova categoria" : `Editar ${esc(c.name)}`}</h2>
      <div class="grid2">
        <label class="field">Nome<input class="input" name="name" value="${esc(c.name)}" required></label>
        <label class="field">Ordem<input class="input" name="sort" type="number" value="${esc(c.sort)}"></label>
      </div>
      <label class="field">Frase curta<input class="input" name="tagline" value="${esc(c.tagline)}"></label>
      <label class="field">Descrição<input class="input" name="description" value="${esc(c.description)}"></label>
      <label class="field">Ficha técnica <span class="hint">um item por linha</span><textarea class="input" name="specs" rows="5">${esc(c.specs.join("\n"))}</textarea></label>
      <div class="field">Imagem de capa<div id="cover"></div></div>
      <label class="check"><input type="checkbox" name="active" ${c.active ? "checked" : ""}> Visível no catálogo</label>
      <div class="error" id="err"></div>
      <div class="modal__actions"><span></span><div class="row"><button type="button" class="btn btn--light" data-cancel>Cancelar</button><button class="btn btn--primary">Salvar</button></div></div>
    </form>`);
  const getCover = imageEditor(form.querySelector("#cover"), c.cover ? [c.cover] : [], { multiple: false });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = form.elements;
    const body = { name: f.name.value, sort: f.sort.value, tagline: f.tagline.value, description: f.description.value, specs: lines(f.specs.value), cover: getCover()[0] || "", active: f.active.checked };
    try {
      await api(isNew ? "/categorias" : `/categorias/${c.slug}`, { method: isNew ? "POST" : "PUT", body });
      modal.close(); toast("Categoria salva"); viewCategories();
    } catch (err) { form.querySelector("#err").textContent = err.message; }
  });
}

/* ---------- opcionais ---------- */
async function viewEquipment() {
  await loadCatalog(true);
  view.innerHTML = `
    <div class="page-head">
      <div><h1>Opcionais</h1><p>Equipamentos que o cliente pode marcar na etapa 4.</p></div>
      <button class="btn btn--primary" id="new">Novo opcional</button>
    </div>
    <div class="pgrid">${cat.equipment.map((e) => `
      <button class="pcard ${e.active ? "" : "is-off"}" data-slug="${esc(e.slug)}">
        <img src="${media(e.image)}" alt="" style="object-fit:contain;background:#fff">
        <div><strong>${esc(e.name)}</strong><span class="muted">${esc(e.description)}</span></div>
      </button>`).join("")}</div>`;
  document.getElementById("new").addEventListener("click", () => editEquipment(null));
  view.querySelectorAll(".pcard").forEach((b) => b.addEventListener("click", () => editEquipment(cat.equipment.find((x) => x.slug === b.dataset.slug))));
}

function editEquipment(eq) {
  const isNew = !eq;
  eq = eq || { name: "", description: "", image: "", categories: cat.categories.map((c) => c.slug), sort: 99, active: true };
  const form = openModal(`
    <form>
      <h2>${isNew ? "Novo opcional" : `Editar ${esc(eq.name)}`}</h2>
      <div class="grid2">
        <label class="field">Nome<input class="input" name="name" value="${esc(eq.name)}" required></label>
        <label class="field">Ordem<input class="input" name="sort" type="number" value="${esc(eq.sort)}"></label>
      </div>
      <div class="grid2">
        <label class="field">Descrição<input class="input" name="description" value="${esc(eq.description)}"></label>
        <label class="field">Preço "a partir de" (R$) <span class="hint">vazio = sob consulta</span><input class="input" name="price" type="number" step="0.01" min="0" value="${esc(eq.price ?? "")}"></label>
      </div>
      <div class="field">Aparece para
        <div class="row">${cat.categories.map((c) => `<label class="check"><input type="checkbox" name="cats" value="${esc(c.slug)}" ${eq.categories.includes(c.slug) ? "checked" : ""}> ${esc(c.name)}</label>`).join("")}</div>
      </div>
      <div class="field">Imagem<div id="img"></div></div>
      <label class="check"><input type="checkbox" name="active" ${eq.active ? "checked" : ""}> Visível no catálogo</label>
      <div class="error" id="err"></div>
      <div class="modal__actions">
        ${isNew ? "<span></span>" : `<button type="button" class="btn btn--danger" id="del">Excluir</button>`}
        <div class="row"><button type="button" class="btn btn--light" data-cancel>Cancelar</button><button class="btn btn--primary">Salvar</button></div>
      </div>
    </form>`);
  const getImg = imageEditor(form.querySelector("#img"), eq.image ? [eq.image] : [], { multiple: false });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = form.elements;
    const body = {
      name: f.name.value, sort: f.sort.value, description: f.description.value, price: f.price.value, image: getImg()[0] || "",
      categories: [...form.querySelectorAll("input[name=cats]:checked")].map((i) => i.value), active: f.active.checked,
    };
    try {
      await api(isNew ? "/opcionais" : `/opcionais/${eq.slug}`, { method: isNew ? "POST" : "PUT", body });
      modal.close(); toast("Opcional salvo"); viewEquipment();
    } catch (err) { form.querySelector("#err").textContent = err.message; }
  });
  form.querySelector("#del")?.addEventListener("click", async () => {
    if (!confirm(`Excluir ${eq.name}?`)) return;
    await api(`/opcionais/${eq.slug}`, { method: "DELETE" });
    modal.close(); toast("Opcional excluído"); viewEquipment();
  });
}

/* ---------- vendedoras ---------- */
async function viewSellers() {
  await loadCatalog(true);
  const base = cat.settings.publicUrl || location.origin;
  const fmt = (p) => { const d = String(p).replace(/^55/, ""); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : p; };
  view.innerHTML = `
    <div class="page-head">
      <div><h1>Vendedoras e links</h1><p>Cada vendedora tem um link próprio. O cliente que entra por ele envia o código direto para o WhatsApp dela.</p></div>
      <button class="btn btn--primary" id="new">Nova vendedora</button>
    </div>
    <div class="card" style="margin-bottom:14px">
      <h3 class="section-title">Link geral</h3>
      <div class="linkbox"><span style="flex:1">${esc(base)}/</span><button class="btn btn--light btn--sm" data-copy="${esc(base)}/">Copiar</button></div>
      <p class="muted" style="margin:8px 0 0">Sem vendedora definida, o código vai para o WhatsApp padrão${cat.settings.defaultWhatsapp ? ` (${esc(fmt(cat.settings.defaultWhatsapp))})` : " — não configurado (variável WHATSAPP_PADRAO)"}.</p>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Vendedora</th><th>WhatsApp</th><th>Link para enviar ao cliente</th><th></th></tr></thead>
      <tbody>${cat.sellers.map((s) => `
        <tr>
          <td><strong>${esc(s.name)}</strong> ${s.active ? "" : `<span class="pill pill--off">inativa</span>`}</td>
          <td class="muted">${esc(fmt(s.whatsapp))}</td>
          <td><div class="linkbox"><span style="flex:1">${esc(base)}/?v=${esc(s.slug)}</span><button class="btn btn--light btn--sm" data-copy="${esc(base)}/?v=${esc(s.slug)}">Copiar</button></div></td>
          <td><button class="btn btn--light btn--sm" data-edit="${esc(s.slug)}">Editar</button></td>
        </tr>`).join("") || `<tr><td colspan="4" class="empty">Nenhuma vendedora cadastrada ainda.</td></tr>`}</tbody>
    </table></div>`;
  view.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", async (e) => {
    e.stopPropagation();
    try { await navigator.clipboard.writeText(b.dataset.copy); toast("Link copiado"); } catch { toast("Não foi possível copiar"); }
  }));
  document.getElementById("new").addEventListener("click", () => editSeller(null));
  view.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => editSeller(cat.sellers.find((s) => s.slug === b.dataset.edit))));
}

function editSeller(s) {
  const isNew = !s;
  s = s || { slug: "", name: "", whatsapp: "", active: true };
  const form = openModal(`
    <form>
      <h2>${isNew ? "Nova vendedora" : `Editar ${esc(s.name)}`}</h2>
      <div class="grid2">
        <label class="field">Nome<input class="input" name="name" value="${esc(s.name)}" required></label>
        <label class="field">WhatsApp com DDD<input class="input" name="whatsapp" value="${esc(String(s.whatsapp).replace(/^55/, ""))}" placeholder="37999999999" required></label>
      </div>
      ${isNew ? `<label class="field">Identificador do link <span class="hint">opcional — usado em ?v=</span><input class="input" name="slug" placeholder="ex.: ana"></label>` : ""}
      <label class="check"><input type="checkbox" name="active" ${s.active ? "checked" : ""}> Ativa</label>
      <div class="error" id="err"></div>
      <div class="modal__actions">
        ${isNew ? "<span></span>" : `<button type="button" class="btn btn--danger" id="del">Excluir</button>`}
        <div class="row"><button type="button" class="btn btn--light" data-cancel>Cancelar</button><button class="btn btn--primary">Salvar</button></div>
      </div>
    </form>`);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = form.elements;
    const body = { name: f.name.value, whatsapp: f.whatsapp.value, active: f.active.checked, slug: f.slug?.value };
    try {
      await api(isNew ? "/vendedoras" : `/vendedoras/${s.slug}`, { method: isNew ? "POST" : "PUT", body });
      modal.close(); toast("Vendedora salva"); viewSellers();
    } catch (err) { form.querySelector("#err").textContent = err.message; }
  });
  form.querySelector("#del")?.addEventListener("click", async () => {
    if (!confirm(`Excluir ${s.name}? O link dela deixará de funcionar.`)) return;
    await api(`/vendedoras/${s.slug}`, { method: "DELETE" });
    modal.close(); toast("Vendedora excluída"); viewSellers();
  });
}

/* ---------- início ---------- */
async function start() {
  const me = await fetch("/api/admin/me").then((r) => r.json());
  if (!me.authenticated) return showLogin();
  document.getElementById("login").hidden = true;
  document.getElementById("shell").hidden = false;
  route();
}
start();
