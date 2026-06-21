"use strict";
// Адрес бэкенда задаётся в config.js (генерируется из переменной BACKEND_URL при деплое).
// Пустая строка = тот же домен (удобно для локальной разработки).
const API_BASE = (window.API_BASE || "").replace(/\/$/, "");
const api = (p, opt) => fetch(API_BASE + "/api" + p, opt).then(r => {
  if (!r.ok) return r.json().then(e => { throw new Error(e.detail || r.statusText); });
  return r.json();
});
const debounce = (fn, ms = 600) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

async function load() {
  const blocks = await api("/blocks");
  const root = document.getElementById("blocks");
  root.innerHTML = "";
  blocks.forEach(b => root.appendChild(renderBlock(b)));
}

function renderBlock(b) {
  const tpl = document.getElementById("blockTpl").content.cloneNode(true);
  const el = tpl.querySelector(".block");
  el.dataset.id = b.id;

  const name = el.querySelector(".blockname");
  const company = el.querySelector(".company");
  name.value = b.name; company.value = b.company || "";

  const patch = debounce(() => api("/blocks/" + b.id, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name.value, company: company.value })
  }));
  name.addEventListener("input", patch);
  company.addEventListener("input", patch);

  // сегменты task / object
  setupSeg(el.querySelector(".seg.task"), b.task, v =>
    api("/blocks/" + b.id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task: v }) }));
  setupSeg(el.querySelector(".seg.object"), b.object_key, v =>
    api("/blocks/" + b.id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ object_key: v }) }));

  // работники
  const wbox = el.querySelector(".workers");
  b.workers.forEach(w => wbox.appendChild(renderWorker(w)));

  el.querySelector(".addWorker").addEventListener("click", async () => {
    await api("/blocks/" + b.id + "/workers", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: "" })
    });
    load();
  });

  el.querySelector(".delBlock").addEventListener("click", async () => {
    if (confirm("Удалить блок «" + b.name + "»?")) { await api("/blocks/" + b.id, { method: "DELETE" }); load(); }
  });

  el.querySelector(".doSubmit").addEventListener("click", () => doSubmit(el, b));
  return el;
}

function setupSeg(seg, value, onPick) {
  seg.querySelectorAll("button").forEach(btn => {
    if (btn.dataset.v === value) btn.classList.add("active");
    btn.addEventListener("click", () => {
      seg.querySelectorAll("button").forEach(x => x.classList.remove("active"));
      btn.classList.add("active");
      onPick(btn.dataset.v);
    });
  });
}

function renderWorker(w) {
  const div = document.createElement("div");
  div.className = "worker";
  const inp = document.createElement("input");
  inp.type = "text"; inp.value = w.full_name; inp.placeholder = "Фамилия Имя Отчество";
  inp.addEventListener("input", debounce(() =>
    api("/workers/" + w.id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ full_name: inp.value }) })));
  const del = document.createElement("button");
  del.className = "del"; del.textContent = "✕";
  del.addEventListener("click", async () => { await api("/workers/" + w.id, { method: "DELETE" }); load(); });
  div.appendChild(inp); div.appendChild(del);
  return div;
}

async function doSubmit(el, b) {
  const workplace = el.querySelector(".workplace").value.trim();
  if (!workplace) { alert("Укажите наименование рабочего места"); return; }
  const task = el.querySelector(".seg.task .active")?.dataset.v;
  const object_key = el.querySelector(".seg.object .active")?.dataset.v;
  const company = el.querySelector(".company").value.trim();
  if (!company) { alert("Укажите подрядную организацию"); return; }
  if (!confirm("Отправить форму SLAM за всех работников бригады? Это реальная отправка.")) return;

  const btn = el.querySelector(".doSubmit");
  btn.disabled = true; btn.textContent = "Запуск…";
  const pw = el.querySelector(".progressWrap"); pw.style.display = "block";

  try {
    const job = await api("/blocks/" + b.id + "/submit", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workplace, submit: true, task, object_key, company })
    });
    pollJob(job.id, el, btn);
  } catch (e) {
    alert("Ошибка: " + e.message);
    btn.disabled = false; btn.textContent = "Отправить (заполнить за всю бригаду)";
  }
}

async function pollJob(jobId, el, btn) {
  const fill = el.querySelector(".fill");
  const ptext = el.querySelector(".progressText");
  const rbox = el.querySelector(".results");
  const tick = async () => {
    const j = await api("/jobs/" + jobId);
    fill.style.width = (j.total ? Math.round(j.done / j.total * 100) : 0) + "%";
    ptext.textContent = `Обработано ${j.done} из ${j.total} • статус: ${j.status}`;
    rbox.innerHTML = "";
    j.results.forEach(r => {
      const d = document.createElement("div");
      d.className = "res " + (r.status === "ok" ? "ok" : r.status === "failed" ? "failed" : r.status === "running" ? "running" : "");
      const mark = r.status === "ok" ? (r.submitted ? "✅ отправлено" : "✓ заполнено") :
        r.status === "failed" ? "❌ ошибка" : r.status === "running" ? "⏳ заполняется…" : "…";
      d.innerHTML = `<b>${r.full_name || "—"}</b> — ${mark}`;
      if (r.errors && r.errors.length) d.innerHTML += `<div class="errs">${r.errors.join("\n")}</div>`;
      if (r.steps && r.steps.length) {
        const det = document.createElement("details");
        det.innerHTML = `<summary>подробности</summary><pre>${r.steps.join("\n")}</pre>`;
        d.appendChild(det);
      }
      rbox.appendChild(d);
    });
    if (j.status === "done" || j.status === "error") {
      btn.disabled = false; btn.textContent = "Отправить (заполнить за всю бригаду)";
      return;
    }
    setTimeout(tick, 1500);
  };
  tick();
}

document.getElementById("addBlock").addEventListener("click", async () => {
  const name = prompt("Название блока (бригады):", "Бригада");
  if (name === null) return;
  await api("/blocks", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name || "Без названия" })
  });
  load();
});

load();
