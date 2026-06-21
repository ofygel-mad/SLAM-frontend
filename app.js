"use strict";
// Адрес бэкенда задаётся в config.js (генерируется из переменной BACKEND_URL при деплое).
const API_BASE = (window.API_BASE || "").replace(/\/$/, "");
const api = (p, opt) => fetch(API_BASE + "/api" + p, opt).then(r => {
  if (!r.ok) return r.json().then(e => { throw new Error(e.detail || r.statusText); });
  return r.json();
});
const jpost = (p, body) => api(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const jpatch = (p, body) => api(p, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const debounce = (fn, ms = 600) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const esc = s => (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------- тосты ---------- */
function toast(message, type = "info", ms = 3200) {
  const box = document.getElementById("toasts");
  const t = document.createElement("div");
  t.className = "toast " + (type === "error" ? "err" : type === "ok" ? "ok" : "");
  t.textContent = message;
  box.appendChild(t);
  setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .25s"; setTimeout(() => t.remove(), 250); }, ms);
}

/* ---------- модалки ---------- */
function modal(buildBody) {
  return new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    const box = document.createElement("div");
    box.className = "modal";
    overlay.appendChild(box);

    const close = (val) => {
      document.removeEventListener("keydown", onKey);
      overlay.style.opacity = "0"; overlay.style.transition = "opacity .15s";
      setTimeout(() => overlay.remove(), 150);
      resolve(val);
    };
    const onKey = (e) => { if (e.key === "Escape") close(null); };
    document.addEventListener("keydown", onKey);
    overlay.addEventListener("mousedown", e => { if (e.target === overlay) close(null); });

    buildBody(box, close);
    document.body.appendChild(overlay);
  });
}

function promptModal({ title, label, value = "", placeholder = "", okText = "Создать" }) {
  return modal((box, close) => {
    box.innerHTML = `<h3>${esc(title)}</h3>
      <label style="margin-top:4px">${esc(label)}</label>
      <input type="text" class="m-input" placeholder="${esc(placeholder)}">
      <div class="actions">
        <button class="ghost m-cancel">Отмена</button>
        <button class="m-ok">${esc(okText)}</button>
      </div>`;
    const input = box.querySelector(".m-input");
    input.value = value;
    const ok = () => { const v = input.value.trim(); if (!v) { input.classList.add("invalid"); input.focus(); return; } close(v); };
    box.querySelector(".m-ok").onclick = ok;
    box.querySelector(".m-cancel").onclick = () => close(null);
    input.addEventListener("keydown", e => { if (e.key === "Enter") ok(); });
    setTimeout(() => { input.focus(); input.select(); }, 60);
  });
}

function confirmModal({ title, message = "", summaryRows = null, okText = "OK", danger = false }) {
  return modal((box, close) => {
    let summary = "";
    if (summaryRows) {
      summary = `<div class="summary">` + summaryRows.map(([k, v]) =>
        `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("") + `</div>`;
    }
    box.innerHTML = `<h3>${esc(title)}</h3>
      ${message ? `<p>${esc(message)}</p>` : ""}
      ${summary}
      <div class="actions">
        <button class="ghost m-cancel">Отмена</button>
        <button class="m-ok" style="background:${danger ? "var(--danger)" : "var(--accent)"}">${esc(okText)}</button>
      </div>`;
    box.querySelector(".m-ok").onclick = () => close(true);
    box.querySelector(".m-cancel").onclick = () => close(false);
    setTimeout(() => box.querySelector(".m-ok").focus(), 60);
  });
}

/* ---------- рендер ---------- */
async function load() {
  try {
    const blocks = await api("/blocks");
    const root = document.getElementById("blocks");
    root.innerHTML = "";
    if (!blocks.length) {
      root.innerHTML = `<div class="empty"><div class="big">📋</div>
        Пока нет ни одной бригады.<br>Нажмите <b>«+ Блок»</b>, чтобы создать первую.</div>`;
      return;
    }
    blocks.forEach(b => root.appendChild(renderBlock(b)));
  } catch (e) {
    toast("Не удалось загрузить данные: " + e.message, "error", 5000);
  }
}

function renderBlock(b) {
  const tpl = document.getElementById("blockTpl").content.cloneNode(true);
  const el = tpl.querySelector(".block");
  el.dataset.id = b.id;

  const name = el.querySelector(".blockname");
  const company = el.querySelector(".company");
  name.value = b.name; company.value = b.company || "";

  const patch = debounce(() => jpatch("/blocks/" + b.id, { name: name.value, company: company.value }).catch(() => {}));
  name.addEventListener("input", patch);
  company.addEventListener("input", () => { company.classList.remove("invalid"); patch(); });

  el.querySelector(".workplace").addEventListener("input", e => e.target.classList.remove("invalid"));

  setupSeg(el.querySelector(".seg.task"), b.task, v => jpatch("/blocks/" + b.id, { task: v }).catch(() => {}));
  setupSeg(el.querySelector(".seg.object"), b.object_key, v => jpatch("/blocks/" + b.id, { object_key: v }).catch(() => {}));

  const wbox = el.querySelector(".workers");
  b.workers.forEach((w, i) => wbox.appendChild(renderWorker(w, i)));

  el.querySelector(".addWorker").addEventListener("click", async (ev) => {
    ev.currentTarget.disabled = true;
    try { await jpost("/blocks/" + b.id + "/workers", { full_name: "" }); await load(); }
    catch (e) { toast(e.message, "error"); ev.currentTarget.disabled = false; }
  });

  el.querySelector(".delBlock").addEventListener("click", async () => {
    const ok = await confirmModal({ title: "Удалить блок?", message: `Бригада «${b.name || "без названия"}» и все её ФИО будут удалены.`, okText: "Удалить", danger: true });
    if (ok) { try { await api("/blocks/" + b.id, { method: "DELETE" }); toast("Блок удалён", "ok"); load(); } catch (e) { toast(e.message, "error"); } }
  });

  el.querySelector(".doSubmit").addEventListener("click", () => doSubmit(el, b));
  return el;
}

function setupSeg(seg, value, onPick) {
  seg.querySelectorAll("button").forEach(btn => {
    btn.type = "button";
    if (btn.dataset.v === value) btn.classList.add("active");
    btn.addEventListener("click", () => {
      seg.querySelectorAll("button").forEach(x => x.classList.remove("active"));
      btn.classList.add("active");
      onPick(btn.dataset.v);
    });
  });
}

function renderWorker(w, index) {
  const div = document.createElement("div");
  div.className = "worker";
  const num = document.createElement("div");
  num.className = "num"; num.textContent = (index + 1) + ".";
  const inp = document.createElement("input");
  inp.type = "text"; inp.value = w.full_name; inp.placeholder = "Фамилия Имя Отчество";
  inp.addEventListener("input", debounce(() => jpatch("/workers/" + w.id, { full_name: inp.value }).catch(() => {})));
  const del = document.createElement("button");
  del.className = "icon"; del.type = "button"; del.textContent = "✕"; del.title = "Удалить";
  del.addEventListener("click", async () => { try { await api("/workers/" + w.id, { method: "DELETE" }); load(); } catch (e) { toast(e.message, "error"); } });
  div.appendChild(num); div.appendChild(inp); div.appendChild(del);
  return div;
}

/* ---------- отправка ---------- */
async function doSubmit(el, b) {
  const wpEl = el.querySelector(".workplace");
  const companyEl = el.querySelector(".company");
  const workplace = wpEl.value.trim();
  const company = companyEl.value.trim();
  const task = el.querySelector(".seg.task .active")?.dataset.v;
  const object_key = el.querySelector(".seg.object .active")?.dataset.v;

  if (!company) { companyEl.classList.add("invalid"); companyEl.scrollIntoView({ behavior: "smooth", block: "center" }); toast("Укажите подрядную организацию", "error"); return; }
  if (!workplace) { wpEl.classList.add("invalid"); wpEl.focus(); toast("Укажите наименование рабочего места", "error"); return; }
  const names = [...el.querySelectorAll(".worker input")].map(i => i.value.trim()).filter(Boolean);
  if (!names.length) { toast("В бригаде нет ни одного ФИО", "error"); return; }

  const taskLabel = task === "demontazh" ? "Демонтаж лесов" : "Монтаж лесов";
  const objLabel = object_key === "sulphide_2" ? "Сульфидная фабрика 2" : "Сульфидная фабрика 1";
  const ok = await confirmModal({
    title: "Отправить форму SLAM?",
    message: "Будет отправлена реальная форма на каждого работника бригады.",
    summaryRows: [
      ["Работников", String(names.length)],
      ["Тип работ", taskLabel],
      ["Объект", objLabel],
      ["Подрядчик", company],
    ],
    okText: `Отправить (${names.length})`,
  });
  if (!ok) return;

  const btn = el.querySelector(".doSubmit");
  btn.disabled = true; btn.textContent = "Запуск…";
  const pw = el.querySelector(".progressWrap"); pw.style.display = "block";
  pw.scrollIntoView({ behavior: "smooth", block: "nearest" });

  try {
    const job = await jpost("/blocks/" + b.id + "/submit", { workplace, submit: true, task, object_key, company });
    pollJob(job.id, el, btn);
  } catch (e) {
    toast("Ошибка запуска: " + e.message, "error", 5000);
    btn.disabled = false; btn.textContent = "Отправить за всю бригаду";
  }
}

async function pollJob(jobId, el, btn) {
  const fill = el.querySelector(".fill");
  const ptext = el.querySelector(".progressText");
  const rbox = el.querySelector(".results");
  const tick = async () => {
    let j;
    try { j = await api("/jobs/" + jobId); }
    catch (e) { toast("Потеряна связь с задачей: " + e.message, "error"); btn.disabled = false; btn.textContent = "Отправить за всю бригаду"; return; }

    fill.style.width = (j.total ? Math.round(j.done / j.total * 100) : 0) + "%";
    const statusRu = { queued: "в очереди", running: "выполняется", done: "готово", error: "ошибка" }[j.status] || j.status;
    ptext.textContent = `Обработано ${j.done} из ${j.total} • ${statusRu}`;
    rbox.innerHTML = "";
    j.results.forEach(r => {
      const cls = r.status === "ok" ? "ok" : r.status === "failed" ? "failed" : r.status === "running" ? "running" : "";
      const mark = r.status === "ok" ? (r.submitted ? "✅ отправлено" : "✓ заполнено")
        : r.status === "failed" ? "❌ ошибка"
        : r.status === "running" ? "⏳ заполняется…" : "⌛ ожидает";
      const d = document.createElement("div");
      d.className = "res " + cls;
      d.innerHTML = `<b>${esc(r.full_name) || "—"}</b> — ${mark}`;
      if (r.errors && r.errors.length) d.innerHTML += `<div class="errs">${esc(r.errors.join("\n"))}</div>`;
      if (r.steps && r.steps.length) {
        const det = document.createElement("details");
        det.innerHTML = `<summary>подробности</summary><pre>${esc(r.steps.join("\n"))}</pre>`;
        d.appendChild(det);
      }
      rbox.appendChild(d);
    });

    if (j.status === "done" || j.status === "error") {
      btn.disabled = false; btn.textContent = "Отправить за всю бригаду";
      const okCount = j.results.filter(r => r.submitted).length;
      const failCount = j.results.filter(r => r.status === "failed").length;
      if (failCount) toast(`Готово: отправлено ${okCount}, с ошибкой ${failCount}`, "error", 5000);
      else toast(`Готово: отправлено ${okCount} из ${j.total}`, "ok", 5000);
      return;
    }
    setTimeout(tick, 1500);
  };
  tick();
}

/* ---------- создание блока ---------- */
document.getElementById("addBlock").addEventListener("click", async () => {
  const name = await promptModal({ title: "Новая бригада", label: "Название блока (бригады)", value: "Бригада", placeholder: "Например: Бригада Иванова" });
  if (name === null) return;
  try { await jpost("/blocks", { name }); toast("Блок создан", "ok"); load(); }
  catch (e) { toast(e.message, "error"); }
});

load();
