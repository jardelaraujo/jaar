/* Casa Avintes — gastos da casa
 * Backend: Supabase (login + base de dados partilhada). Sem configuração → modo demo (localStorage).
 */
(() => {
  "use strict";

  const CATEGORIAS = [
    "Aquisição da Casa", "Materiais", "Ferramentas", "Móveis",
    "Eletrodomésticos", "Decoração", "Serviços", "Outros",
  ];

  // Dados atuais do Notion, usados para popular o modo demo.
  const SEED = [
    ["Primeira Fração dos 10% de entrada (Carlo Rui)", "2026-05-05", 5000.00, "Jardel"],
    ["Fração dos 10% de entrada (Gisela Cristina)", "2026-05-20", 3281.25, "Jardel"],
    ["Fração dos 10% de entrada (Paula Maria)", "2026-05-20", 3281.25, "Jardel"],
    ["Fração dos 10% de entrada (Carlo Rui)", "2026-05-21", 5500.00, "Jardel"],
    ["Fração dos 10% de entrada (Paula Maria)", "2026-05-21", 14437.50, "Jardel"],
    ["Comissão Dossier", "2026-06-17", 301.60, "Jardel"],
    ["Comissão Avaliação", "2026-06-17", 239.20, "Pessoa 2"],
  ].map(([nome, data, preco, quem_pagou]) => ({
    id: uid(), nome, categoria: "Aquisição da Casa", data, loja: null,
    preco, quantidade: 1, pago: true, quem_pagou, created_at: new Date().toISOString(),
  }));

  // ───────────────────────── utilidades ─────────────────────────
  function uid() {
    return (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random().toString(16).slice(2);
  }
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const eur = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });
  const eurCompact = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", notation: "compact", maximumFractionDigits: 1 });
  const fmtData = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" });
  const fmtMes = (ym) => new Date(ym + "-01T00:00:00").toLocaleDateString("pt-PT", { month: "short", year: "2-digit" });
  const total = (g) => Number(g.preco) * Number(g.quantidade || 1);
  const sum = (arr) => arr.reduce((a, g) => a + total(g), 0);
  const hoje = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (t.hidden = true), 2600);
  }

  // ───────────────────────── backend ─────────────────────────
  const cfg = window.CASA_CONFIG || {};
  const temSupabase = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);

  function supabaseBackend() {
    const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    const cols = "id,nome,categoria,data,loja,preco,quantidade,pago,quem_pagou,created_at";
    const ok = ({ data, error }) => { if (error) throw error; return data; };
    return {
      demo: false,
      async session() { return (await sb.auth.getSession()).data.session?.user ?? null; },
      onAuth(cb) { sb.auth.onAuthStateChange((_e, s) => cb(s?.user ?? null)); },
      async login(email, password) {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message === "Invalid login credentials" ? "Email ou palavra-passe incorretos." : error.message);
        return data.user;
      },
      async logout() { await sb.auth.signOut(); },
      async list() { return ok(await sb.from("gastos").select(cols).order("data", { ascending: false }).order("created_at", { ascending: false })); },
      async create(g) { return ok(await sb.from("gastos").insert(g).select(cols).single()); },
      async update(id, g) { return ok(await sb.from("gastos").update(g).eq("id", id).select(cols).single()); },
      async remove(id) { ok(await sb.from("gastos").delete().eq("id", id)); },
    };
  }

  function demoBackend() {
    const KEY = "casa-avintes:gastos", USER = "casa-avintes:user";
    const read = () => {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) return JSON.parse(raw);
      } catch (_) { /* sem storage */ }
      return SEED.slice();
    };
    let mem = read();
    const write = () => { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (_) { /* ignora */ } };
    const sorted = () => mem.slice().sort((a, b) => b.data.localeCompare(a.data) || b.created_at.localeCompare(a.created_at));
    let user = null;
    try { user = JSON.parse(localStorage.getItem(USER) || "null"); } catch (_) { /* ignora */ }
    return {
      demo: true,
      async session() { return user; },
      onAuth() {},
      async login(email) {
        user = { email };
        try { localStorage.setItem(USER, JSON.stringify(user)); } catch (_) { /* ignora */ }
        return user;
      },
      async logout() { user = null; try { localStorage.removeItem(USER); } catch (_) { /* ignora */ } },
      async list() { return sorted(); },
      async create(g) { const n = { ...g, id: uid(), created_at: new Date().toISOString() }; mem.push(n); write(); return n; },
      async update(id, g) { const i = mem.findIndex((x) => x.id === id); mem[i] = { ...mem[i], ...g }; write(); return mem[i]; },
      async remove(id) { mem = mem.filter((x) => x.id !== id); write(); },
    };
  }

  const api = temSupabase ? supabaseBackend() : demoBackend();

  // ───────────────────────── estado ─────────────────────────
  const state = { user: null, gastos: [], tab: "resumo", tempo: "mensal" };
  const charts = {};

  // ───────────────────────── auth / vistas ─────────────────────────
  async function showApp(user) {
    state.user = user;
    $("#view-login").hidden = true;
    $("#view-app").hidden = false;
    $("#user-email").textContent = user.email || "";
    $("#demo-banner").hidden = !api.demo;
    await refresh();
  }

  function showLogin() {
    state.user = null;
    $("#view-app").hidden = true;
    $("#view-login").hidden = false;
    $("#demo-note").hidden = !api.demo;
  }

  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget, btn = f.querySelector("button[type=submit]"), err = $("#login-error");
    err.hidden = true;
    btn.disabled = true;
    try {
      const user = await api.login(f.email.value.trim(), f.password.value);
      f.password.value = "";
      await showApp(user);
    } catch (ex) {
      err.textContent = ex.message || "Não foi possível entrar.";
      err.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  $("#logout").addEventListener("click", async () => { await api.logout(); showLogin(); });

  // ───────────────────────── dados ─────────────────────────
  async function refresh() {
    try {
      state.gastos = (await api.list()).map((g) => ({ ...g, preco: Number(g.preco), quantidade: Number(g.quantidade) }));
    } catch (ex) {
      toast("Erro a carregar: " + (ex.message || ex));
      state.gastos = [];
    }
    render();
  }

  function render() {
    renderSugestoes();
    renderKpis();
    renderLista();
    if (state.tab === "resumo") renderCharts();
  }

  // ───────────────────────── tabs ─────────────────────────
  $$(".tab").forEach((b) => b.addEventListener("click", () => {
    state.tab = b.dataset.tab;
    $$(".tab").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    $("#tab-resumo").hidden = state.tab !== "resumo";
    $("#tab-lancamentos").hidden = state.tab !== "lancamentos";
    if (state.tab === "resumo") renderCharts();
  }));

  // ───────────────────────── KPIs ─────────────────────────
  function renderKpis() {
    const g = state.gastos;
    const pagos = g.filter((x) => x.pago);
    const mes = hoje().slice(0, 7);
    $("#kpi-total").textContent = eur.format(sum(g));
    $("#kpi-count").textContent = `${g.length} lançamento${g.length === 1 ? "" : "s"}`;
    $("#kpi-pago").textContent = eur.format(sum(pagos));
    $("#kpi-pendente").textContent = eur.format(sum(g.filter((x) => !x.pago)));
    $("#kpi-mes").textContent = eur.format(sum(g.filter((x) => x.data.startsWith(mes))));
  }

  // ───────────────────────── gráficos ─────────────────────────
  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

  function baseOptions({ horizontal = false } = {}) {
    const ink2 = cssVar("--ink-2"), grid = cssVar("--grid"), muted = cssVar("--muted");
    const valueAxis = {
      beginAtZero: true,
      grid: { color: grid, drawTicks: false },
      border: { display: false },
      ticks: { color: muted, padding: 8, callback: (v) => eurCompact.format(v), maxTicksLimit: 6 },
    };
    const catAxis = {
      grid: { display: false },
      border: { color: cssVar("--axis") },
      ticks: { color: ink2, padding: 6, autoSkip: !horizontal },
    };
    return {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: horizontal ? "y" : "x",
      interaction: { mode: horizontal ? "nearest" : "index", intersect: horizontal, axis: horizontal ? "y" : "x" },
      animation: { duration: 250 },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: cssVar("--ink"), titleColor: cssVar("--page"), bodyColor: cssVar("--page"),
          padding: 10, cornerRadius: 8, displayColors: false,
          callbacks: { label: (c) => eur.format(horizontal ? c.parsed.x : c.parsed.y) },
        },
      },
      scales: horizontal ? { x: valueAxis, y: catAxis } : { x: catAxis, y: valueAxis },
    };
  }

  function draw(id, config) {
    if (typeof Chart === "undefined") return;
    Chart.defaults.font.family = cssVar("--font");
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(document.getElementById(id), config);
  }

  function porMes() {
    const m = new Map();
    for (const g of state.gastos) m.set(g.data.slice(0, 7), (m.get(g.data.slice(0, 7)) || 0) + total(g));
    if (!m.size) return [];
    // preenche meses vazios entre o primeiro e o último
    const keys = [...m.keys()].sort();
    const out = [];
    let [y, mo] = keys[0].split("-").map(Number);
    const [ly, lm] = keys[keys.length - 1].split("-").map(Number);
    while (y < ly || (y === ly && mo <= lm)) {
      const k = `${y}-${String(mo).padStart(2, "0")}`;
      out.push([k, m.get(k) || 0]);
      mo++; if (mo > 12) { mo = 1; y++; }
    }
    return out;
  }

  function agrupar(chave) {
    const m = new Map();
    for (const g of state.gastos) {
      const k = (g[chave] || "").trim() || "Sem indicação";
      m.set(k, (m.get(k) || 0) + total(g));
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }

  function renderCharts() {
    const s1 = cssVar("--series-1");
    const bar = { backgroundColor: s1, hoverBackgroundColor: s1, borderRadius: 4, borderSkipped: "start", maxBarThickness: 36 };

    // 1) Evolução no tempo
    const meses = porMes();
    const labels = meses.map(([k]) => fmtMes(k));
    if (state.tempo === "mensal") {
      draw("chart-tempo", {
        type: "bar",
        data: { labels, datasets: [{ label: "Gasto no mês", data: meses.map(([, v]) => v), ...bar }] },
        options: baseOptions(),
      });
    } else {
      let acc = 0;
      draw("chart-tempo", {
        type: "line",
        data: {
          labels,
          datasets: [{
            label: "Total acumulado", data: meses.map(([, v]) => (acc += v)),
            borderColor: s1, backgroundColor: s1 + "22", fill: "origin", borderWidth: 2, tension: 0.25,
            pointRadius: 4, pointHoverRadius: 6, pointBackgroundColor: s1, pointBorderColor: cssVar("--surface"), pointBorderWidth: 2,
          }],
        },
        options: baseOptions(),
      });
    }

    // 2) Categoria (barras horizontais, ordenadas)
    const cats = agrupar("categoria");
    draw("chart-categoria", {
      type: "bar",
      data: { labels: cats.map(([k]) => k), datasets: [{ label: "Total", data: cats.map(([, v]) => v), ...bar, maxBarThickness: 28 }] },
      options: baseOptions({ horizontal: true }),
    });

    // 3) Quem pagou
    const pessoas = agrupar("quem_pagou");
    const tot = sum(state.gastos) || 1;
    const opt = baseOptions({ horizontal: true });
    opt.plugins.tooltip.callbacks.label = (c) => `${eur.format(c.parsed.x)} (${Math.round((c.parsed.x / tot) * 100)}%)`;
    draw("chart-pessoa", {
      type: "bar",
      data: { labels: pessoas.map(([k]) => k), datasets: [{ label: "Total", data: pessoas.map(([, v]) => v), ...bar, maxBarThickness: 28 }] },
      options: opt,
    });
  }

  $$(".seg-btn").forEach((b) => b.addEventListener("click", () => {
    state.tempo = b.dataset.time;
    $$(".seg-btn").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    renderCharts();
  }));

  // redesenha ao mudar tema claro/escuro
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { if (state.user && state.tab === "resumo") renderCharts(); });

  // ───────────────────────── lista ─────────────────────────
  function filtrados() {
    const q = $("#f-busca").value.trim().toLowerCase();
    const cat = $("#f-categoria").value;
    const pago = $("#f-pago").value;
    return state.gastos.filter((g) =>
      (!q || g.nome.toLowerCase().includes(q) || (g.loja || "").toLowerCase().includes(q)) &&
      (!cat || g.categoria === cat) &&
      (pago === "" || String(Number(g.pago)) === pago)
    );
  }

  function renderLista() {
    const rows = filtrados();
    const tbody = $("#lista");
    tbody.innerHTML = rows.map((g) => `
      <tr data-id="${esc(g.id)}" tabindex="0">
        <td class="td-data td-hide-m">${esc(fmtData(g.data))}</td>
        <td class="td-nome">${esc(g.nome)}</td>
        <td class="td-meta">${esc(fmtData(g.data))} · ${esc(g.categoria)}${g.quem_pagou ? " · " + esc(g.quem_pagou) : ""}</td>
        <td class="td-hide-m"><span class="pill pill-cat">${esc(g.categoria)}</span></td>
        <td class="td-hide-m">${esc(g.loja || "—")}</td>
        <td class="td-hide-m">${esc(g.quem_pagou || "—")}</td>
        <td class="num td-hide-m">${esc(String(g.quantidade).replace(".", ","))}</td>
        <td class="num td-total">${esc(eur.format(total(g)))}</td>
        <td class="td-estado">${g.pago ? '<span class="pill pill-pago">✓ Pago</span>' : '<span class="pill pill-pend">⏳ Por pagar</span>'}</td>
      </tr>`).join("");
    $("#lista-vazia").hidden = rows.length > 0;
    $("#list-summary").textContent = rows.length
      ? `${rows.length} de ${state.gastos.length} lançamentos · ${eur.format(sum(rows))}`
      : "";
  }

  ["#f-busca", "#f-categoria", "#f-pago"].forEach((s) => $(s).addEventListener("input", renderLista));
  $("#lista").addEventListener("click", (e) => { const tr = e.target.closest("tr[data-id]"); if (tr) abrirForm(tr.dataset.id); });
  $("#lista").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { const tr = e.target.closest("tr[data-id]"); if (tr) abrirForm(tr.dataset.id); }
  });

  function renderSugestoes() {
    const uniq = (k) => [...new Set(state.gastos.map((g) => g[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt"));
    $("#lojas").innerHTML = uniq("loja").map((v) => `<option value="${esc(v)}">`).join("");
    $("#pessoas").innerHTML = uniq("quem_pagou").map((v) => `<option value="${esc(v)}">`).join("");
  }

  // ───────────────────────── exportar CSV ─────────────────────────
  $("#export-csv").addEventListener("click", () => {
    const head = ["Data", "Nome", "Categoria", "Loja", "Quem pagou", "Preço", "Quantidade", "Total", "Pago"];
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = filtrados().map((g) => [g.data, g.nome, g.categoria, g.loja, g.quem_pagou,
      g.preco.toFixed(2), g.quantidade, total(g).toFixed(2), g.pago ? "Sim" : "Não"].map(q).join(";"));
    const blob = new Blob(["﻿" + [head.map(q).join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `gastos-casa-avintes-${hoje()}.csv` });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  // ───────────────────────── formulário ─────────────────────────
  const dlg = $("#dlg"), form = $("#gasto-form");
  const selCat = form.categoria;
  selCat.innerHTML = CATEGORIAS.map((c) => `<option>${esc(c)}</option>`).join("");
  $("#f-categoria").insertAdjacentHTML("beforeend", CATEGORIAS.map((c) => `<option>${esc(c)}</option>`).join(""));

  function atualizarTotalForm() {
    const p = parseFloat(form.preco.value) || 0, q = parseFloat(form.quantidade.value) || 0;
    $("#form-total").textContent = eur.format(p * q);
  }
  form.preco.addEventListener("input", atualizarTotalForm);
  form.quantidade.addEventListener("input", atualizarTotalForm);

  function abrirForm(id) {
    const g = id ? state.gastos.find((x) => x.id === id) : null;
    form.reset();
    $("#form-error").hidden = true;
    $("#dlg-title").textContent = g ? "Editar lançamento" : "Novo lançamento";
    $("#btn-apagar").hidden = !g;
    form.id.value = g?.id || "";
    form.nome.value = g?.nome || "";
    form.categoria.value = g?.categoria || "Materiais";
    form.data.value = g?.data || hoje();
    form.preco.value = g ? g.preco : "";
    form.quantidade.value = g ? g.quantidade : 1;
    form.loja.value = g?.loja || "";
    form.quem_pagou.value = g?.quem_pagou || "";
    form.pago.checked = g ? g.pago : true;
    atualizarTotalForm();
    dlg.showModal();
    if (!g) setTimeout(() => form.nome.focus(), 50);
  }

  $("#fab").addEventListener("click", () => abrirForm(null));
  $("#btn-cancelar").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("button[type=submit]");
    const payload = {
      nome: form.nome.value.trim(),
      categoria: form.categoria.value,
      data: form.data.value,
      loja: form.loja.value.trim() || null,
      preco: Math.round(parseFloat(form.preco.value) * 100) / 100,
      quantidade: parseFloat(form.quantidade.value) || 1,
      pago: form.pago.checked,
      quem_pagou: form.quem_pagou.value.trim() || null,
    };
    if (!payload.nome || !payload.data || !(payload.preco >= 0)) return;
    btn.disabled = true;
    try {
      if (form.id.value) await api.update(form.id.value, payload);
      else await api.create(payload);
      dlg.close();
      toast(form.id.value ? "Lançamento atualizado" : "Lançamento adicionado");
      await refresh();
    } catch (ex) {
      $("#form-error").textContent = "Erro ao guardar: " + (ex.message || ex);
      $("#form-error").hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  $("#btn-apagar").addEventListener("click", async () => {
    const id = form.id.value;
    if (!id || !confirm("Apagar este lançamento?")) return;
    try {
      await api.remove(id);
      dlg.close();
      toast("Lançamento apagado");
      await refresh();
    } catch (ex) {
      $("#form-error").textContent = "Erro ao apagar: " + (ex.message || ex);
      $("#form-error").hidden = false;
    }
  });

  // ───────────────────────── arranque ─────────────────────────
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  api.onAuth((user) => { if (!user && state.user) showLogin(); });

  api.session().then((user) => (user ? showApp(user) : showLogin())).catch(showLogin);
})();
