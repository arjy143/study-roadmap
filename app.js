/* Study Roadmap — static, no build step.
   State lives in localStorage; optional sync stores it as progress.json in this repo via the GitHub API. */
(() => {
  "use strict";

  const STORE_KEY = "roadmap.state.v1";
  const CFG_KEY = "roadmap.sync.v1";
  const SLOTS = [
    ["work", "At work", "input · reading"],
    ["home", "At home", "output · problems & building"],
    ["weekend", "Weekend", "deep work"],
  ];
  const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  let plan = null;
  let state = { tasks: {}, notes: {} };   // tasks[id] = {v:bool,t:ms}; notes[date] = {text,t}
  const app = document.getElementById("app");

  /* ---------------- utilities ---------------- */
  const pad = n => String(n).padStart(2, "0");
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const todayIso = () => iso(new Date());
  const dowIdx = s => (parse(s).getDay() + 6) % 7;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtLong = s => { const d = parse(s); return `${["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`; };
  const fmtShort = s => { const d = parse(s); return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`; };
  const hrs = m => (m / 60).toFixed(m % 60 === 0 ? 0 : 1) + "h";
  const clampDay = s => s < plan.start ? plan.start : s > plan.end ? plan.end : s;

  function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 1800);
  }

  /* ---------------- persistence ---------------- */
  function load() {
    try { const s = JSON.parse(localStorage.getItem(STORE_KEY)); if (s && s.tasks) state = { tasks: s.tasks, notes: s.notes || {} }; } catch (_) {}
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) {}
    Sync.schedule();
  }
  const isDone = id => !!(state.tasks[id] && state.tasks[id].v);
  function setDone(id, v) { state.tasks[id] = { v, t: Date.now() }; save(); }

  function merge(a, b) {
    const out = { tasks: { ...a.tasks }, notes: { ...a.notes } };
    for (const [k, x] of Object.entries(b.tasks || {})) if (!out.tasks[k] || x.t > out.tasks[k].t) out.tasks[k] = x;
    for (const [k, x] of Object.entries(b.notes || {})) if (!out.notes[k] || x.t > out.notes[k].t) out.notes[k] = x;
    return out;
  }

  /* ---------------- sync via GitHub contents API ---------------- */
  const Sync = (() => {
    let cfg = {};
    try { cfg = JSON.parse(localStorage.getItem(CFG_KEY)) || {}; } catch (_) {}
    if (!cfg.repo) {
      const owner = location.hostname.endsWith(".github.io") ? location.hostname.split(".")[0] : "arjy143";
      const repo = location.pathname.split("/").filter(Boolean)[0] || "study-roadmap";
      cfg.repo = `${owner}/${repo}`;
    }
    let sha = null, timer = null, status = "off", lastMsg = "";
    const PATH = "progress.json";
    const api = () => `https://api.github.com/repos/${cfg.repo}/contents/${PATH}`;
    const headers = () => ({ Authorization: `Bearer ${cfg.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" });
    const b64enc = s => btoa(unescape(encodeURIComponent(s)));
    const b64dec = s => decodeURIComponent(escape(atob(s.replace(/\n/g, ""))));
    const setStatus = (s, m) => { status = s; lastMsg = m || ""; const el = document.getElementById("syncStatus"); if (el) el.innerHTML = statusHtml(); };
    const statusHtml = () => `<span class="syncdot ${status === "ok" ? "ok" : status === "err" ? "err" : status === "busy" ? "busy" : ""}"></span>${esc(
      status === "off" ? "Sync off — progress is saved on this device only." : lastMsg)}`;

    async function pull() {
      const r = await fetch(api() + "?t=" + Date.now(), { headers: headers(), cache: "no-store" });
      if (r.status === 404) { sha = null; return null; }
      if (!r.ok) throw new Error(`GitHub ${r.status}`);
      const j = await r.json(); sha = j.sha;
      return JSON.parse(b64dec(j.content));
    }
    async function push(retry = true) {
      const body = { message: `progress ${todayIso()}`, content: b64enc(JSON.stringify(state, null, 0)) };
      if (sha) body.sha = sha;
      const r = await fetch(api(), { method: "PUT", headers: headers(), body: JSON.stringify(body) });
      if ((r.status === 409 || r.status === 422) && retry) {   // someone else wrote first: merge and retry
        const remote = await pull(); if (remote) state = merge(state, remote);
        try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) {}
        return push(false);
      }
      if (!r.ok) throw new Error(`GitHub ${r.status}`);
      sha = (await r.json()).content.sha;
    }
    async function syncNow(quiet) {
      if (!cfg.token) return;
      setStatus("busy", "Syncing…");
      try {
        const remote = await pull();
        const before = JSON.stringify(state);
        if (remote) state = merge(state, remote);
        try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) {}
        if (!remote || JSON.stringify(remote) !== JSON.stringify(state)) await push();
        setStatus("ok", `Synced ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
        if (JSON.stringify(state) !== before && !(document.activeElement && document.activeElement.id === "note")) render(true);
        if (!quiet) toast("Synced");
      } catch (e) { setStatus("err", `Sync failed (${e.message}). Changes are kept on this device.`); }
    }
    return {
      get cfg() { return cfg; }, statusHtml,
      enabled: () => !!cfg.token,
      configure(token) {
        cfg.token = token || undefined;
        try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (_) {}
        if (cfg.token) syncNow(false); else setStatus("off");
      },
      schedule() { if (!cfg.token) return; clearTimeout(timer); timer = setTimeout(() => syncNow(true), 2500); },
      syncNow,
      init() { if (cfg.token) syncNow(true); document.addEventListener("visibilitychange", () => { if (!document.hidden && cfg.token) syncNow(true); }); },
    };
  })();

  /* ---------------- derived data ---------------- */
  const dayOf = s => plan.days[s];
  function dayStats(s) {
    const d = dayOf(s); if (!d || d.rest || !d.tasks.length) return { total: 0, done: 0, mins: 0, doneMins: 0 };
    let done = 0, mins = 0, doneMins = 0;
    for (const t of d.tasks) { mins += t.mins; if (isDone(t.id)) { done++; doneMins += t.mins; } }
    return { total: d.tasks.length, done, mins, doneMins };
  }
  function weekOf(s) {
    const d = dayOf(s); if (!d) return null;
    return plan.weeks.find(w => w.n === d.week) || null;
  }
  function weekDays(n) {
    if (n === 0) return [plan.start];
    const w = plan.weeks.find(x => x.n === n); return [...Array(7)].map((_, i) => addDays(w.start, i));
  }
  function totals(upTo) {
    let total = 0, done = 0, mins = 0, doneMins = 0, problems = 0, plannedProblems = 0, dueTotal = 0, dueDone = 0;
    for (const [k, d] of Object.entries(plan.days)) {
      for (const t of d.tasks) {
        const isD = isDone(t.id);
        total++; mins += t.mins;
        if (isD) { done++; doneMins += t.mins; }
        if (t.fresh) { plannedProblems += t.n; if (isD) problems += t.n; }
        if (k <= upTo) { dueTotal++; if (isD) dueDone++; }
      }
    }
    return { total, done, mins, doneMins, problems, plannedProblems, dueTotal, dueDone };
  }
  function streak() {
    let s = todayIso(); if (s > plan.end) s = plan.end;
    let n = 0;
    const today = dayStats(s);
    if (today.total && today.done < today.total) s = addDays(s, -1);   // today not finished yet: don't break the streak
    while (s >= plan.start) {
      const d = dayOf(s), st = dayStats(s);
      if (d && !d.rest && st.total) { if (st.done === st.total) n++; else break; }
      s = addDays(s, -1);
    }
    return n;
  }

  /* ---------------- header ---------------- */
  function renderHeader() {
    const t = totals(todayIso());
    const pct = t.total ? t.done / t.total : 0;
    const C = 2 * Math.PI * 13;
    document.getElementById("overall").innerHTML =
      `<span>${Math.round(pct * 100)}%</span><svg class="ring" viewBox="0 0 34 34" aria-label="${Math.round(pct * 100)} percent complete">
        <circle class="bgc" cx="17" cy="17" r="13"/><circle class="fgc" cx="17" cy="17" r="13" transform="rotate(-90 17 17)"
        stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/></svg>`;
    const s = clampDay(todayIso()), w = weekOf(s);
    const daysLeft = Math.max(0, Math.round((parse(plan.target) - parse(todayIso())) / 864e5));
    document.getElementById("brandSub").textContent =
      `${w ? `Week ${w.n} of ${plan.weeks.length} · ${w.theme}` : "Orientation"} · ${daysLeft} days to ready`;
  }
  function setTab(tab) {
    document.querySelectorAll("#tabs a").forEach(a => a.classList.toggle("on", a.dataset.tab === tab));
  }

  /* ---------------- views ---------------- */
  function taskHtml(t) {
    const done = isDone(t.id);
    const hasMore = t.detail || t.link;
    let more = "";
    if (hasMore) {
      more = `<div class="t-detail">${t.detail ? esc(t.detail) : ""}${t.link ? `${t.detail ? " " : ""}<a href="${esc(t.link)}" target="_blank" rel="noopener">Open link ↗</a>` : ""}</div>`;
    }
    return `<div class="task${done ? " is-done" : ""}" data-id="${esc(t.id)}">
      <input type="checkbox" class="chk" ${done ? "checked" : ""} aria-label="${esc(t.title)}">
      <div class="t-title">${esc(t.title)}</div>
      <div class="t-side"><span class="kind k-${esc(t.kind)}">${esc(t.kind)}</span><span class="mins">${t.mins}m</span></div>
      ${hasMore ? `<div></div><div><button class="t-more" type="button">details ▾</button></div>` : ""}
      ${more}
    </div>`;
  }

  function viewDay(s) {
    s = clampDay(s);
    setTab(s === clampDay(todayIso()) ? "today" : "");
    const d = dayOf(s), w = weekOf(s), st = dayStats(s);
    const isToday = s === todayIso();
    const prev = s > plan.start ? addDays(s, -1) : null, next = s < plan.end ? addDays(s, 1) : null;
    let body = "";
    if (!d) body = `<div class="card rest"><div class="big">Nothing planned</div>This day is outside the roadmap.</div>`;
    else if (d.rest) body = `<div class="card rest"><div class="big">Rest day</div>Nothing scheduled. Properly rest — the plan assumes you will.</div>`;
    else {
      for (const [slot, label, sub] of SLOTS) {
        const ts = d.tasks.filter(t => t.slot === slot); if (!ts.length) continue;
        const m = ts.reduce((a, t) => a + t.mins, 0);
        body += `<section class="slot"><h2><span>${label} <small>· ${sub}</small></span><small>${hrs(m)}</small></h2>
          <div class="card">${ts.map(taskHtml).join("")}</div></section>`;
      }
    }
    const note = (state.notes[s] && state.notes[s].text) || "";
    app.innerHTML = `
      <div class="daynav">
        <button class="navbtn" data-go="${prev || ""}" ${prev ? "" : "disabled"} aria-label="Previous day">←</button>
        ${isToday ? "" : `<button class="navbtn today-btn" data-go="${clampDay(todayIso())}">Jump to today</button>`}
        <button class="navbtn" data-go="${next || ""}" ${next ? "" : "disabled"} aria-label="Next day">→</button>
      </div>
      <div class="dayhead">
        <div class="eyebrow">${isToday ? "Today · " : ""}${w ? `Week ${w.n} · ${esc(w.theme)}` : "Day 0 · Orientation"}</div>
        <h1>${fmtLong(s)}</h1>
        ${w ? `<p class="goal">${esc(w.goal)}</p>` : ""}
        ${st.total ? `<div class="daymeta"><span><b>${st.done}/${st.total}</b> done</span><span><b>${hrs(st.doneMins)}</b> of ${hrs(st.mins)}</span></div>
        <div class="bar ${st.done === st.total ? "done" : ""}"><i style="width:${(st.done / st.total) * 100}%"></i></div>` : ""}
      </div>
      ${body}
      ${d && !d.rest ? `<section class="notes"><h2 class="section-h">Notes</h2>
        <textarea id="note" placeholder="What did you measure? What did you miss? What's blocking you?">${esc(note)}</textarea>
        <div class="hint">${Sync.enabled() ? "Synced with your other devices. Note: the repo is public, so keep notes non-sensitive." : "Saved on this device. Turn on sync in Progress to share across devices."}</div></section>` : ""}`;

    app.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => { if (b.dataset.go) location.hash = `#/day/${b.dataset.go}`; }));
    app.querySelectorAll(".task").forEach(el => {
      const id = el.dataset.id;
      el.querySelector(".chk").addEventListener("change", e => {
        setDone(id, e.target.checked);
        el.classList.toggle("is-done", e.target.checked);
        const nd = dayStats(s);
        if (e.target.checked && nd.done === nd.total) toast("Day complete ✓");
        refreshDayMeta(s); renderHeader();
      });
      const toggle = () => { el.classList.toggle("open"); const b = el.querySelector(".t-more"); if (b) b.textContent = el.classList.contains("open") ? "details ▴" : "details ▾"; };
      const more = el.querySelector(".t-more"); if (more) more.addEventListener("click", toggle);
      el.querySelector(".t-title").addEventListener("click", () => { if (more) toggle(); });
    });
    const ta = document.getElementById("note");
    if (ta) {
      let nt; ta.addEventListener("input", () => { clearTimeout(nt); nt = setTimeout(() => {
        state.notes[s] = { text: ta.value, t: Date.now() }; save(); }, 600); });
    }
  }
  function refreshDayMeta(s) {
    const st = dayStats(s);
    const meta = app.querySelector(".daymeta"), bar = app.querySelector(".dayhead .bar");
    if (meta) meta.innerHTML = `<span><b>${st.done}/${st.total}</b> done</span><span><b>${hrs(st.doneMins)}</b> of ${hrs(st.mins)}</span>`;
    if (bar) { bar.classList.toggle("done", st.done === st.total); bar.firstElementChild.style.width = `${(st.done / st.total) * 100}%`; }
  }

  function viewWeek(n) {
    setTab("week");
    const cur = dayOf(clampDay(todayIso()));
    if (n == null || isNaN(n)) n = cur ? Math.max(1, cur.week) : 1;
    n = Math.min(Math.max(1, n), plan.weeks.length);
    const w = plan.weeks.find(x => x.n === n);
    const days = weekDays(n);
    let wm = 0, wdm = 0, wt = 0, wd = 0;
    days.forEach(s => { const st = dayStats(s); wm += st.mins; wdm += st.doneMins; wt += st.total; wd += st.done; });
    const rows = days.map(s => {
      const d = dayOf(s); const st = dayStats(s);
      const items = !d ? "" : d.rest ? `<div class="wk-t"><span class="dot"></span><span style="color:var(--ink-3)">Rest day</span></div>` :
        d.tasks.map(t => `<div class="wk-t${isDone(t.id) ? " done" : ""}"><span class="dot"></span><span>${esc(t.title)}</span></div>`).join("");
      return `<a class="wk-day${s === todayIso() ? " is-today" : ""}" href="#/day/${s}">
        <div class="wk-date">${DOW[dowIdx(s)]}<b>${parse(s).getDate()}</b>${st.total ? `<span>${st.done}/${st.total}</span>` : ""}</div>
        <div class="wk-tasks">${items}</div></a>`;
    }).join("");
    app.innerHTML = `
      <div class="weekhead">
        <button class="navbtn" data-w="${n - 1}" ${n > 1 ? "" : "disabled"} aria-label="Previous week">←</button>
        <div style="text-align:center;flex:1;min-width:0">
          <div class="eyebrow">Week ${n} of ${plan.weeks.length} · ${fmtShort(days[0])} – ${fmtShort(days[6])}</div>
          <h1>${esc(w.theme)}</h1>
        </div>
        <button class="navbtn" data-w="${n + 1}" ${n < plan.weeks.length ? "" : "disabled"} aria-label="Next week">→</button>
      </div>
      <p class="goal" style="color:var(--ink-2);margin:0 0 8px;text-align:center">${esc(w.goal)}</p>
      <div class="daymeta" style="justify-content:center"><span><b>${wd}/${wt}</b> tasks</span><span><b>${hrs(wdm)}</b> of ${hrs(wm)}</span></div>
      <div class="bar ${wt && wd === wt ? "done" : ""}" style="margin-bottom:18px"><i style="width:${wt ? (wd / wt) * 100 : 0}%"></i></div>
      <div class="card">${rows}</div>`;
    app.querySelectorAll("[data-w]").forEach(b => b.addEventListener("click", () => { location.hash = `#/week/${b.dataset.w}`; }));
  }

  function viewCalendar() {
    setTab("calendar");
    const t = todayIso();
    let html = `<div class="legend"><span><i style="background:var(--ok);opacity:.5;border-color:var(--ok)"></i>complete</span>
      <span><i style="background:var(--ok-soft)"></i>partly done</span><span><i style="border-color:var(--miss)"></i>past, unfinished</span>
      <span><i style="background:repeating-linear-gradient(135deg,transparent 0 3px,var(--rule-2) 3px 4px)"></i>rest</span></div>`;
    let m = parse(plan.start); m.setDate(1);
    const endD = parse(plan.end);
    while (m <= endD) {
      const y = m.getFullYear(), mo = m.getMonth();
      const first = new Date(y, mo, 1), lead = (first.getDay() + 6) % 7, nd = new Date(y, mo + 1, 0).getDate();
      let cells = DOW.map(d => `<div class="dow">${d[0]}</div>`).join("");
      for (let i = 0; i < lead; i++) cells += `<div class="cell out"></div>`;
      for (let dd = 1; dd <= nd; dd++) {
        const s = `${y}-${pad(mo + 1)}-${pad(dd)}`, d = dayOf(s);
        if (!d) { cells += `<div class="cell none">${dd}</div>`; continue; }
        const st = dayStats(s), pct = st.total ? st.done / st.total : 0;
        const cls = ["cell"]; if (s === t) cls.push("today"); if (d.rest) cls.push("restd");
        if (st.total && pct === 1) cls.push("full"); else if (st.total && s < t) cls.push("missed");
        cells += `<a class="${cls.join(" ")}" href="#/day/${s}" aria-label="${fmtLong(s)}: ${st.done} of ${st.total} done">
          <div class="fill" style="height:${pct * 100}%"></div><span>${dd}</span>${st.total ? `<span class="pct">${st.done}/${st.total}</span>` : ""}</a>`;
      }
      html += `<section class="month"><h2>${MONTHS[mo]} ${y}</h2><div class="grid">${cells}</div></section>`;
      m = new Date(y, mo + 1, 1);
    }
    app.innerHTML = html;
  }

  function viewStats() {
    setTab("stats");
    const t = totals(todayIso());
    const curW = (dayOf(clampDay(todayIso())) || {}).week || 0;
    const kpis = `<div class="kpis">
      <div class="kpi"><div class="v">${t.done}<span style="font-size:15px;color:var(--ink-3)">/${t.total}</span></div><div class="l">tasks done</div>
        <div class="s">${t.dueTotal ? Math.round((t.dueDone / t.dueTotal) * 100) : 0}% of what's due so far</div></div>
      <div class="kpi"><div class="v">${hrs(t.doneMins)}</div><div class="l">hours logged</div><div class="s">of ${hrs(t.mins)} planned</div></div>
      <div class="kpi"><div class="v">${t.problems}</div><div class="l">new problems</div><div class="s">target ${t.plannedProblems} this quarter</div></div>
      <div class="kpi"><div class="v">${streak()}</div><div class="l">day streak</div><div class="s">fully completed days in a row</div></div></div>`;
    const weeks = plan.weeks.map(w => {
      let a = 0, b = 0; weekDays(w.n).forEach(s => { const st = dayStats(s); a += st.done; b += st.total; });
      const p = b ? a / b : 0;
      return `<a class="wrow" href="#/week/${w.n}"${w.n === curW ? ' style="box-shadow:inset 3px 0 0 var(--accent)"' : ""}><span class="n">W${w.n}</span>
        <div><div class="th">${esc(w.theme)}</div><div class="bar ${p === 1 ? "done" : ""}"><i style="width:${p * 100}%"></i></div></div>
        <span class="p">${a}/${b}</span></a>`;
    }).join("");
    const phases = plan.phases.map(p => `<div class="phase${p.n === 1 ? " cur" : ""}"><b>${p.n}. ${esc(p.name)}</b><span class="m">months ${esc(p.months)}</span><p>${esc(p.summary)}</p></div>`).join("");
    app.innerHTML = `${kpis}
      <h2 class="section-h">Weeks</h2><div class="card weeks">${weeks}</div>
      <h2 class="section-h">The year</h2><div class="phases">${phases}</div>
      <h2 class="section-h">Sync across devices</h2>
      <div class="card settings" style="padding:14px">
        <div id="syncStatus">${Sync.statusHtml()}</div>
        <p>Paste a fine-grained GitHub token limited to <b>${esc(Sync.cfg.repo)}</b> with <b>Contents: read &amp; write</b>. Ticks and notes are then saved to <code>progress.json</code> in the repo, so your phone and laptop stay in step. Do this once per device. The repo is public, so keep notes non-sensitive.</p>
        <div class="row"><input type="password" id="tok" placeholder="github_pat_…" autocomplete="off" value="${Sync.cfg.token ? "••••••••" : ""}">
          <button class="btn primary" id="tokSave">${Sync.enabled() ? "Update" : "Turn on sync"}</button>
          ${Sync.enabled() ? `<button class="btn" id="syncNow">Sync now</button><button class="btn danger" id="tokOff">Turn off</button>` : ""}</div>
        <p><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Create a token ↗</a> — Repository access: only ${esc(Sync.cfg.repo.split("/")[1])}; Permissions: Contents → Read and write; expiry: 1 year.</p>
      </div>
      <h2 class="section-h">Backup</h2>
      <div class="card settings" style="padding:14px"><div class="row" style="margin-top:0">
        <button class="btn" id="exp">Export progress</button><label class="btn" style="display:inline-flex;align-items:center">Import<input type="file" id="imp" accept="application/json" hidden></label>
      </div></div>`;
    document.getElementById("tokSave").addEventListener("click", () => {
      const v = document.getElementById("tok").value.trim();
      if (!v || v.startsWith("••")) { toast("Paste a token first"); return; }
      Sync.configure(v);
      viewStats();
    });
    const off = document.getElementById("tokOff"); if (off) off.addEventListener("click", () => { Sync.configure(null); viewStats(); toast("Sync off"); });
    const now = document.getElementById("syncNow"); if (now) now.addEventListener("click", () => Sync.syncNow(false));
    document.getElementById("exp").addEventListener("click", () => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 1)], { type: "application/json" }));
      a.download = `roadmap-progress-${todayIso()}.json`; a.click();
    });
    document.getElementById("imp").addEventListener("change", async e => {
      const f = e.target.files[0]; if (!f) return;
      try { state = merge(state, JSON.parse(await f.text())); save(); render(true); toast("Imported"); } catch (_) { toast("That file didn't look right"); }
    });
  }

  /* ---------------- router ---------------- */
  function render(keepScroll) {
    if (!plan) return;
    renderHeader();
    const h = location.hash.replace(/^#\/?/, "").split("/");
    if (h[0] === "day" && /^\d{4}-\d\d-\d\d$/.test(h[1] || "")) viewDay(h[1]);
    else if (h[0] === "week") viewWeek(h[1] ? parseInt(h[1], 10) : null);
    else if (h[0] === "calendar") viewCalendar();
    else if (h[0] === "stats") viewStats();
    else viewDay(todayIso());
    if (!keepScroll) window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", () => render());

  load();
  fetch("plan.json", { cache: "no-cache" }).then(r => r.json()).then(p => {
    plan = p; render(); Sync.init();
  }).catch(() => { app.innerHTML = `<div class="card rest"><div class="big">Couldn't load the plan</div>Check your connection and refresh.</div>`; });
})();
