const STORE_KEY = "anil-orcamento-v2";
const app = document.getElementById("app");
const tray = document.getElementById("tray");
const sheet = document.getElementById("sheet");
const params = new URLSearchParams(location.search);

const ICON = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>',
  close: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  ruler: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 16.5L16.5 3 21 7.5 7.5 21z"/><path d="M7 13l1.5 1.5M10 10l1.5 1.5M13 7l1.5 1.5"/></svg>',
  depth: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M8 17l4 4 4-4M3 8c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="M16 5.2a3 3 0 010 5.6M18 14.8c1.8.7 3 2.4 3 5.2"/></svg>',
  photos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="8.5" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/></svg>',
  drop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3s6 6.6 6 11a6 6 0 01-12 0c0-4.4 6-11 6-11z"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/></svg>',
  wa: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 01-2-1.2 7.4 7.4 0 01-1.4-1.7c-.1-.2 0-.4.1-.5l.4-.4.2-.4v-.4l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 00-.7.3 3 3 0 00-.9 2.2 5.2 5.2 0 001.1 2.8 11.9 11.9 0 004.6 4c1.7.7 2.3.8 3.2.7a2.7 2.7 0 001.8-1.3 2.2 2.2 0 00.2-1.3c-.1-.1-.3-.2-.5-.3z"/></svg>',
};

const COLOR_SWATCH = { azul: "#2f8fd6", branca: "#ffffff", branco: "#ffffff" };

/* ---------- estado ---------- */
const blank = () => ({
  step: 1,
  categories: [],
  picks: {},
  tab: "",
  filters: {},
  equipment: [],
  services: [],
  city: "",
  notes: "",
  result: null,
});
let state = load();
let catalog = null;

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && typeof s === "object") return { ...blank(), ...s };
  } catch {}
  return blank();
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {}
}

/* ---------- utilidades ---------- */
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const media = (f) => (f ? (/^https?:/.test(f) ? f : `/media/${encodeURIComponent(f)}`) : "");
const fmtM = (n) => Number(n).toFixed(2).replace(".", ",");
const byCode = (code) => catalog.products.find((p) => p.code === code);
const catOf = (slug) => catalog.categories.find((c) => c.slug === slug);
const pickedCodes = () => Object.keys(state.picks).filter((c) => byCode(c));

const cityOk = (v) => String(v || "").trim().length >= 2;

function specsOf(p) {
  const out = [];
  if (p.length && p.width) out.push(`<span class="spec">${ICON.ruler}${fmtM(p.length)} × ${fmtM(p.width)} m</span>`);
  if (p.depth) out.push(`<span class="spec">${ICON.depth}${esc(p.depth)} prof.</span>`);
  if (p.people) out.push(`<span class="spec">${ICON.people}${p.people} ${p.people > 1 ? "pessoas" : "pessoa"}</span>`);
  return out.join("");
}

/* ---------- navegação ---------- */
const STEP_PROGRESS = { 1: 12, 2: 45, 3: 75, 4: 92, 5: 100 };

function goTo(step, { push = true } = {}) {
  state.step = step;
  save();
  if (push) history.pushState({ step }, "", location.pathname + location.search);
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
window.addEventListener("popstate", (e) => {
  if (sheet.open) sheet.close();
  const step = e.state?.step || 1;
  if (state.result && step < 5) return history.pushState({ step: 5 }, "");
  state.step = step;
  save();
  render();
});

function renderSteps() {
  document.querySelectorAll("#steps li").forEach((li) => {
    const n = +li.dataset.step;
    li.classList.toggle("is-active", n === state.step);
    li.classList.toggle("is-done", n < state.step);
  });
  document.getElementById("progressBar").style.width = `${STEP_PROGRESS[state.step] || 0}%`;
}

function render() {
  renderSteps();
  const views = { 1: viewCategories, 2: viewProducts, 3: viewDetails, 4: viewReview, 5: viewDone };
  (views[state.step] || viewCategories)();
  renderTray();
}

/* ---------- etapa 1: vitrine + categorias ---------- */
function viewCategories() {
  const seller = catalog.seller;
  app.innerHTML = `
    <section class="hero">
      <img class="hero__img" src="/media/insp-1.jpg" alt="" aria-hidden="true">
      <div class="hero__inner stagger">
        <div class="hero__kicker">Catálogo Anil · Piscinas e Spas</div>
        <h1>Experiências que transformam ambientes <b>em momentos inesquecíveis</b></h1>
        <p>${seller ? `Você está sendo atendido(a) por <strong>${esc(seller.name)}</strong>. ` : ""}Escolha os modelos que mais combinam com o seu espaço e receba o orçamento da nossa equipe, direto da fábrica.</p>
      </div>
      <svg class="hero__wave" viewBox="0 0 1440 70" preserveAspectRatio="none" aria-hidden="true"><path d="M0 35c180-45 360-45 540 0s360 45 540 0 270-35 360-20v55H0z"/></svg>
    </section>
    <section class="panel panel--overlap">
      <div class="card">
        <div class="panel__head">
          <div class="panel__eyebrow">Etapa 1 de 4</div>
          <h2 class="panel__title">O que você <i>procura?</i></h2>
          <p class="panel__lead">Pode escolher mais de uma opção. Vamos mostrar só os modelos do que você marcar.</p>
        </div>
        <div class="cats stagger">
          ${catalog.categories.map((c) => `
            <button type="button" class="cat ${state.categories.includes(c.slug) ? "is-selected" : ""}" data-slug="${esc(c.slug)}" aria-pressed="${state.categories.includes(c.slug)}">
              <img src="${media(c.cover)}" alt="" loading="lazy">
              <span class="cat__check">${ICON.check}</span>
              <span class="cat__text">
                <span class="cat__name">${esc(c.name)}</span>
                <span class="cat__tag">${esc(c.tagline || c.description)}</span>
              </span>
            </button>`).join("")}
        </div>
        <div class="actions">
          <span></span>
          <button class="btn btn--primary" type="button" id="next" ${state.categories.length ? "" : "disabled"}>Ver modelos ${ICON.arrow}</button>
        </div>
      </div>
    </section>`;

  app.querySelectorAll(".cat").forEach((btn) => btn.addEventListener("click", () => {
    const slug = btn.dataset.slug;
    state.categories = state.categories.includes(slug) ? state.categories.filter((s) => s !== slug) : [...state.categories, slug];
    btn.classList.toggle("is-selected");
    btn.setAttribute("aria-pressed", state.categories.includes(slug));
    document.getElementById("next").disabled = !state.categories.length;
    save();
  }));
  document.getElementById("next").addEventListener("click", () => {
    // mantém só as escolhas das categorias ainda marcadas, na ordem do catálogo
    state.categories = catalog.categories.map((c) => c.slug).filter((s) => state.categories.includes(s));
    for (const code of Object.keys(state.picks)) {
      const p = byCode(code);
      if (!p || !state.categories.includes(p.category)) delete state.picks[code];
    }
    if (!state.categories.includes(state.tab)) state.tab = state.categories[0];
    goTo(2);
  });
}

/* ---------- etapa 2: modelos ---------- */
function chipsFor(products) {
  if (products.length <= 5) return [];
  if (products.every((p) => p.people)) {
    const vals = [...new Set(products.map((p) => p.people))].sort((a, b) => a - b);
    return vals.map((v) => ({ key: `p${v}`, label: `${v} ${v > 1 ? "pessoas" : "pessoa"}`, test: (p) => p.people === v }));
  }
  if (products.every((p) => p.length)) {
    return [
      { key: "l-4", label: "Até 4 m", test: (p) => p.length <= 4 },
      { key: "l4-6", label: "4 a 6 m", test: (p) => p.length > 4 && p.length <= 6 },
      { key: "l6", label: "Acima de 6 m", test: (p) => p.length > 6 },
    ].filter((c) => products.some(c.test));
  }
  return [];
}

function viewProducts() {
  const tab = state.categories.includes(state.tab) ? state.tab : state.categories[0];
  state.tab = tab;
  const all = catalog.products.filter((p) => p.category === tab);
  const chips = chipsFor(all);
  const active = chips.find((c) => c.key === state.filters[tab]);
  const list = active ? all.filter(active.test) : all;
  const countIn = (slug) => pickedCodes().filter((c) => byCode(c).category === slug).length;

  app.innerHTML = `
    <section class="panel">
      <div class="panel__head">
        <div class="panel__eyebrow">Etapa 2 de 4</div>
        <h2 class="panel__title">Escolha os <i>seus favoritos</i></h2>
        <p class="panel__lead">Toque na foto para ver detalhes, planta e cores. Marque quantos modelos quiser.</p>
      </div>
      ${state.categories.length > 1 ? `<div class="tabs" role="tablist">
        ${state.categories.map((s) => `<button class="tab ${s === tab ? "is-active" : ""}" role="tab" aria-selected="${s === tab}" data-tab="${esc(s)}">${esc(catOf(s)?.name)}${countIn(s) ? `<small>· ${countIn(s)}</small>` : ""}</button>`).join("")}
      </div>` : ""}
      ${chips.length ? `<div class="chips">
        <button class="chip ${!active ? "is-active" : ""}" data-chip="">Todos (${all.length})</button>
        ${chips.map((c) => `<button class="chip ${active?.key === c.key ? "is-active" : ""}" data-chip="${c.key}">${c.label}</button>`).join("")}
      </div>` : ""}
      <div class="grid stagger">
        ${list.map(productCard).join("") || `<div class="empty">Nenhum modelo nesse filtro.</div>`}
      </div>
      <div class="actions">
        <button class="btn btn--ghost" type="button" data-back>${ICON.back} Voltar</button>
        <span></span>
      </div>
    </section>`;

  app.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { state.tab = b.dataset.tab; save(); viewProducts(); }));
  app.querySelectorAll("[data-chip]").forEach((b) => b.addEventListener("click", () => { state.filters[tab] = b.dataset.chip; save(); viewProducts(); }));
  app.querySelector("[data-back]").addEventListener("click", () => goTo(1));
  app.querySelectorAll(".prod").forEach((el) => {
    const code = el.dataset.code;
    el.querySelector(".prod__media").addEventListener("click", () => openSheet(code));
    el.querySelector(".btn--details").addEventListener("click", () => openSheet(code));
    el.querySelector(".btn--select").addEventListener("click", () => togglePick(code));
  });
}

function productCard(p) {
  const sel = p.code in state.picks;
  const isCode = p.name === p.code;
  const photos = p.images.length + (p.plan ? 1 : 0);
  return `
    <article class="prod ${sel ? "is-selected" : ""}" data-code="${esc(p.code)}">
      <button class="prod__media" type="button" aria-label="Ver detalhes de ${esc(p.name)}">
        <img src="${media(p.images[0])}" alt="${esc(p.name)}" loading="lazy">
        ${photos > 1 ? `<span class="prod__count">${ICON.photos}${photos}</span>` : ""}
        <span class="prod__badge">${ICON.check}Escolhido</span>
      </button>
      <div class="prod__body">
        ${isCode
          ? `<div class="prod__code">${esc(p.code)}</div><div class="prod__sub">${esc(p.subtitle)}</div>`
          : `<div class="prod__name">${esc(p.name)}</div><div class="prod__sub">${esc(p.subtitle)}</div>`}
        <div class="specs">${specsOf(p)}</div>
        <div class="prod__foot">
          <button class="btn btn--details" type="button">Detalhes</button>
          <button class="btn btn--select" type="button">${sel ? `${ICON.check} Escolhido` : "Quero este"}</button>
        </div>
      </div>
    </article>`;
}

function togglePick(code, color) {
  const p = byCode(code);
  if (code in state.picks && color === undefined) delete state.picks[code];
  else state.picks[code] = color ?? state.picks[code] ?? p.colors[0] ?? "";
  save();
  const el = app.querySelector(`.prod[data-code="${CSS.escape(code)}"]`);
  if (el) el.outerHTML = productCard(p);
  const fresh = app.querySelector(`.prod[data-code="${CSS.escape(code)}"]`);
  if (fresh) {
    fresh.style.animation = "none";
    fresh.querySelector(".prod__media").addEventListener("click", () => openSheet(code));
    fresh.querySelector(".btn--details").addEventListener("click", () => openSheet(code));
    fresh.querySelector(".btn--select").addEventListener("click", () => togglePick(code));
  }
  app.querySelectorAll("[data-tab]").forEach((b) => {
    const n = pickedCodes().filter((c) => byCode(c).category === b.dataset.tab).length;
    b.innerHTML = `${esc(catOf(b.dataset.tab)?.name)}${n ? `<small>· ${n}</small>` : ""}`;
  });
  renderTray();
}

function renderTray() {
  const codes = pickedCodes();
  const show = state.step === 2 && codes.length > 0;
  tray.hidden = !show;
  document.body.classList.toggle("has-tray", show);
  if (!show) return;
  document.getElementById("trayCount").textContent = codes.length;
  document.getElementById("trayLabel").textContent = codes.length > 1 ? "modelos escolhidos" : "modelo escolhido";
  document.getElementById("trayThumbs").innerHTML = codes.slice(-4).map((c) => `<img src="${media(byCode(c).images[0])}" alt="">`).join("");
}
document.getElementById("trayNext").addEventListener("click", () => goTo(3));

/* ---------- folha de detalhes ---------- */
function openSheet(code) {
  const p = byCode(code);
  const cat = catOf(p.category);
  const shots = [...p.images.map((src) => ({ src, plan: false })), ...(p.plan ? [{ src: p.plan, plan: true }] : [])];
  const sel = code in state.picks;
  let color = state.picks[code] || p.colors[0] || "";
  const isCode = p.name === p.code;

  document.getElementById("sheetBody").innerHTML = `
    <div class="gallery">
      <button class="sheet__close" type="button" aria-label="Fechar">${ICON.close}</button>
      <img class="gallery__main" id="gMain" src="${media(shots[0].src)}" alt="${esc(p.name)}">
      ${shots.length > 1 ? `<div class="gallery__thumbs">${shots.map((s, i) => `<button type="button" class="${i === 0 ? "is-active" : ""} ${s.plan ? "is-plan" : ""}" data-i="${i}" aria-label="${s.plan ? "Planta" : `Foto ${i + 1}`}"><img src="${media(s.src)}" alt=""></button>`).join("")}</div>` : ""}
    </div>
    <div class="sheet__info">
      <div>
        <div class="label-sm">${esc(cat?.name)}</div>
        <h2 id="sheetTitle">${isCode ? esc(p.code) : `<b>${esc(p.name)}</b>`}</h2>
        <div class="prod__sub" style="margin-top:6px">${esc(p.subtitle)}</div>
      </div>
      ${p.length || p.depth || p.people ? `<dl class="dims">
        ${p.length ? `<div><dt>Comprimento</dt><dd>${fmtM(p.length)} m</dd></div>` : ""}
        ${p.width ? `<div><dt>Largura</dt><dd>${fmtM(p.width)} m</dd></div>` : ""}
        ${p.depth ? `<div><dt>Profundidade</dt><dd>${esc(p.depth)}</dd></div>` : p.people ? `<div><dt>Lugares</dt><dd>${p.people}</dd></div>` : ""}
      </dl>` : ""}
      ${p.highlights?.length ? `<div class="specs">${p.highlights.map((h) => `<span class="spec">${ICON.drop}${esc(h)}</span>`).join("")}</div>` : ""}
      ${cat?.specs?.length ? `<div><div class="label-sm" style="margin-bottom:8px">Ficha técnica</div><ul class="ficha">${cat.specs.map((s) => `<li>${ICON.check}<span>${esc(s)}</span></li>`).join("")}</ul></div>` : ""}
      ${p.colors.length > 1 ? `<div><div class="label-sm" style="margin-bottom:8px">Cor preferida</div><div class="colors">${p.colors.map((c) => `<button type="button" class="color ${c === color ? "is-active" : ""}" data-color="${esc(c)}"><i style="background:${COLOR_SWATCH[c.toLowerCase()] || "#ccc"}"></i>${esc(c)}</button>`).join("")}</div></div>` : ""}
      <div class="actions" style="margin-top:6px">
        <button class="btn btn--light" type="button" data-close>Voltar à lista</button>
        <button class="btn btn--primary" type="button" id="sheetPick">${sel ? "Atualizar escolha" : "Quero este modelo"} ${ICON.check}</button>
      </div>
      ${sel ? `<button class="btn btn--ghost" type="button" id="sheetRemove" style="align-self:center">Remover da minha lista</button>` : ""}
    </div>`;

  const main = document.getElementById("gMain");
  sheet.querySelectorAll(".gallery__thumbs button").forEach((b) => b.addEventListener("click", () => {
    const s = shots[+b.dataset.i];
    main.src = media(s.src);
    main.style.objectFit = s.plan ? "contain" : "";
    main.style.background = s.plan ? "#fff" : "";
    sheet.querySelectorAll(".gallery__thumbs button").forEach((x) => x.classList.toggle("is-active", x === b));
  }));
  sheet.querySelectorAll("[data-color]").forEach((b) => b.addEventListener("click", () => {
    color = b.dataset.color;
    sheet.querySelectorAll("[data-color]").forEach((x) => x.classList.toggle("is-active", x === b));
  }));
  sheet.querySelector(".sheet__close").addEventListener("click", () => sheet.close());
  sheet.querySelector("[data-close]").addEventListener("click", () => sheet.close());
  document.getElementById("sheetPick").addEventListener("click", () => { togglePick(code, color); sheet.close(); });
  document.getElementById("sheetRemove")?.addEventListener("click", () => { togglePick(code); sheet.close(); });
  sheet.showModal();
}
sheet.addEventListener("click", (e) => { if (e.target === sheet) sheet.close(); });

/* ---------- etapa 3: cidade e opcionais ---------- */
function viewDetails() {
  const eqs = catalog.equipment.filter((e) => !e.categories.length || e.categories.some((c) => state.categories.includes(c)));
  state.equipment = state.equipment.filter((s) => eqs.some((e) => e.slug === s));
  app.innerHTML = `
    <section class="panel">
      <div class="panel__head">
        <div class="panel__eyebrow">Etapa 3 de 4</div>
        <h2 class="panel__title">Onde vai ser <i>a entrega?</i></h2>
        <p class="panel__lead">Entregamos em todo o estado de Minas Gerais.</p>
      </div>
      <div class="card">
        <div class="form-grid form-grid--2">
          <div class="field">
            <label for="city">Cidade de entrega</label>
            <input class="input" id="city" placeholder="Ex.: Divinópolis" value="${esc(state.city)}" maxlength="80" autocomplete="address-level2" required>
            <div class="field__error" id="cityError"></div>
          </div>
          <div class="field">
            <label>Você vai precisar de <small>(opcional)</small></label>
            <div class="toggles">
              ${Object.entries(catalog.services).map(([k, v]) => `<button type="button" class="toggle ${state.services.includes(k) ? "is-selected" : ""}" data-svc="${k}"><span class="tick">${ICON.check}</span>${esc(v)}</button>`).join("")}
            </div>
          </div>
        </div>
      </div>
      ${eqs.length ? `
      <div class="panel__head section-gap">
        <h3 class="panel__title" style="font-size:clamp(20px,3.4vw,28px)">Equipamentos <i>de interesse</i></h3>
        <p class="panel__lead">Opcional. Nossa equipe confirma o que é compatível com cada modelo.</p>
      </div>
      <div class="eqs stagger">
        ${eqs.map((e) => `
          <button type="button" class="eq ${state.equipment.includes(e.slug) ? "is-selected" : ""}" data-eq="${esc(e.slug)}" aria-pressed="${state.equipment.includes(e.slug)}">
            <span class="tick">${ICON.check}</span>
            ${e.image ? `<img src="${media(e.image)}" alt="" loading="lazy">` : ""}
            <strong>${esc(e.name)}</strong>
            <span>${esc(e.description)}</span>
          </button>`).join("")}
      </div>` : ""}
      <div class="card section-gap">
        <div class="field">
          <label for="notes">Observações <small>(opcional)</small></label>
          <textarea class="input" id="notes" maxlength="1000" placeholder="Tamanho do espaço, prazo, dúvidas…">${esc(state.notes)}</textarea>
        </div>
      </div>
      <div class="actions">
        <button class="btn btn--ghost" type="button" data-back>${ICON.back} Voltar</button>
        <button class="btn btn--primary" type="button" id="next">Revisar pedido ${ICON.arrow}</button>
      </div>
    </section>`;

  app.querySelectorAll("[data-eq]").forEach((b) => b.addEventListener("click", () => {
    const s = b.dataset.eq;
    state.equipment = state.equipment.includes(s) ? state.equipment.filter((x) => x !== s) : [...state.equipment, s];
    b.classList.toggle("is-selected");
    b.setAttribute("aria-pressed", state.equipment.includes(s));
    save();
  }));
  app.querySelectorAll("[data-svc]").forEach((b) => b.addEventListener("click", () => {
    const s = b.dataset.svc;
    state.services = state.services.includes(s) ? state.services.filter((x) => x !== s) : [...state.services, s];
    b.classList.toggle("is-selected");
    save();
  }));
  const city = document.getElementById("city"), notes = document.getElementById("notes");
  const cityError = document.getElementById("cityError");
  city.addEventListener("input", () => {
    state.city = city.value;
    save();
    if (cityOk(city.value)) { city.classList.remove("is-invalid"); cityError.textContent = ""; }
  });
  notes.addEventListener("input", () => { state.notes = notes.value; save(); });
  if (!state.city) setTimeout(() => city.focus({ preventScroll: true }), 400);
  app.querySelector("[data-back]").addEventListener("click", () => goTo(2));
  document.getElementById("next").addEventListener("click", () => {
    if (!cityOk(city.value)) {
      city.classList.add("is-invalid");
      cityError.textContent = "Informe a cidade de entrega";
      city.scrollIntoView({ behavior: "smooth", block: "center" });
      return city.focus({ preventScroll: true });
    }
    state.city = city.value.replace(/\s+/g, " ").trim();
    goTo(4);
  });
}

/* ---------- etapa 4: revisão ---------- */
function viewReview() {
  const codes = pickedCodes();
  const eqNames = catalog.equipment.filter((e) => state.equipment.includes(e.slug)).map((e) => e.name);
  const svcNames = state.services.map((s) => catalog.services[s]).filter(Boolean);
  app.innerHTML = `
    <section class="panel">
      <div class="panel__head">
        <div class="panel__eyebrow">Etapa 4 de 4</div>
        <h2 class="panel__title">Tudo certo? <i>Confira e envie</i></h2>
        <p class="panel__lead">Ao enviar, você recebe um código de atendimento para falar direto com a nossa consultora.</p>
      </div>
      <div class="review">
        <div class="card">
          <dl>
            <div><dt>Cidade de entrega <button class="review__edit" data-go="3">editar</button></dt><dd>${esc(state.city)}</dd></div>
            ${svcNames.length ? `<div><dt>Serviços</dt><dd>${svcNames.map(esc).join(", ")}</dd></div>` : ""}
            ${eqNames.length ? `<div><dt>Equipamentos</dt><dd>${eqNames.map(esc).join(", ")}</dd></div>` : ""}
            ${state.notes ? `<div><dt>Observações</dt><dd style="font-weight:400">${esc(state.notes)}</dd></div>` : ""}
          </dl>
        </div>
        <div class="card">
          <div class="label-sm" style="margin-bottom:12px">Modelos escolhidos (${codes.length}) <button class="review__edit" data-go="2">editar</button></div>
          ${codes.length ? `<div class="picked">${codes.map((c) => {
            const p = byCode(c);
            return `<div class="picked__item"><img src="${media(p.images[0])}" alt=""><div><strong>${esc(p.name)}</strong><span>${esc(catOf(p.category)?.name)} · ${esc(p.subtitle)}${state.picks[c] ? ` · cor ${esc(state.picks[c].toLowerCase())}` : ""}</span></div></div>`;
          }).join("")}</div>` : `<div class="alert">Você ainda não escolheu nenhum modelo. <button class="review__edit" data-go="2">Escolher agora</button></div>`}
        </div>
      </div>
      <div id="sendError"></div>
      <div class="actions">
        <button class="btn btn--ghost" type="button" data-back>${ICON.back} Voltar</button>
        <button class="btn btn--primary" type="button" id="send" ${codes.length ? "" : "disabled"}>Enviar para a Anil ${ICON.arrow}</button>
      </div>
    </section>`;

  app.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => goTo(+b.dataset.go)));
  app.querySelector("[data-back]").addEventListener("click", () => goTo(3));
  document.getElementById("send").addEventListener("click", submit);
}

async function submit() {
  const btn = document.getElementById("send");
  const errBox = document.getElementById("sendError");
  btn.disabled = true;
  btn.innerHTML = "Enviando…";
  errBox.innerHTML = "";
  try {
    const res = await fetch("/api/orcamentos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        categories: state.categories,
        items: pickedCodes().map((code) => ({ code, color: state.picks[code] })),
        equipment: state.equipment,
        services: state.services,
        city: state.city,
        notes: state.notes,
        seller: catalog.seller?.slug || "",
        origin: params.get("origem") || params.get("utm_source") || "",
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Não foi possível enviar agora.");
    state.result = data;
    goTo(5);
  } catch (e) {
    errBox.innerHTML = `<div class="alert">${esc(e.message)} Tente novamente em instantes.</div>`;
    btn.disabled = false;
    btn.innerHTML = `Enviar para a Anil ${ICON.arrow}`;
  }
}

/* ---------- concluído ---------- */
function viewDone() {
  const r = state.result;
  if (!r) return goTo(1, { push: false });
  app.innerHTML = `
    <section class="panel">
      <div class="card done">
        <div class="done__icon">${ICON.check}</div>
        <h2 class="panel__title">Pronto! <i>Recebemos seu pedido.</i></h2>
        <div class="code-box">
          <small>Seu código de atendimento</small>
          <strong id="code">${esc(r.code)}</strong>
          <button class="copy" type="button" id="copy">${ICON.copy}<span>Copiar código</span></button>
        </div>
        ${r.whatsapp_url ? `
          <p>Agora é só enviar para ${r.seller ? `<strong>${esc(r.seller)}</strong>` : "a nossa consultora"} pelo WhatsApp. Ela já vai receber seus modelos e seguir com o orçamento.</p>
          <a class="btn btn--wa" href="${esc(r.whatsapp_url)}" target="_blank" rel="noopener">${ICON.wa} Enviar código no WhatsApp</a>
        ` : `<p>Envie esse código para a nossa consultora no WhatsApp para seguir com o orçamento.</p>`}
        <div class="actions" style="justify-content:center">
          <button class="btn btn--ghost" type="button" id="restart">Fazer um novo orçamento</button>
        </div>
      </div>
    </section>`;

  document.getElementById("copy").addEventListener("click", async (e) => {
    try { await navigator.clipboard.writeText(r.code); e.currentTarget.querySelector("span").textContent = "Copiado"; } catch {}
  });
  document.getElementById("restart").addEventListener("click", () => {
    state = { ...blank(), city: state.city };
    goTo(1);
  });
}

/* ---------- início ---------- */
async function init() {
  try {
    const q = params.get("v") ? `?v=${encodeURIComponent(params.get("v"))}` : "";
    catalog = await fetch(`/api/catalog${q}`).then((r) => { if (!r.ok) throw new Error(); return r.json(); });
  } catch {
    app.innerHTML = `<section class="panel"><div class="card empty">Não foi possível carregar o catálogo. Verifique sua conexão e recarregue a página.</div></section>`;
    return;
  }
  state.categories = state.categories.filter((s) => catOf(s));
  if (state.result) state.step = 5;
  else if (state.step > 1 && !state.categories.length) state.step = 1;
  else if (state.step > 3 && !cityOk(state.city)) state.step = 3;
  history.replaceState({ step: state.step }, "", location.pathname + location.search);
  render();
}
init();
