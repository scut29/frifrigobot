var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/activation.js
var page = /* @__PURE__ */ __name((content, status = 200) => new Response(
  `<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Attiva Frifrigobot</title><style>body{font:18px system-ui;max-width:540px;margin:8vh auto;padding:24px;background:#f2f8f5;color:#173d32}main{padding:28px;border-radius:20px;background:white}input,button{font:inherit;box-sizing:border-box;width:100%;padding:14px;margin-top:12px;border:1px solid #bdd4c9;border-radius:10px}button{background:#176b50;color:white;cursor:pointer}p{line-height:1.5}label{display:block}</style><main><h1>\u{1F9CA} Frifrigobot</h1>${content}</main></html>`,
  {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"
    }
  }
), "page");
async function activation(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/setup" && request.method === "GET")
    return page(
      '<p>Dopo aver impostato i quattro segreti in Cloudflare, attiva il collegamento con Telegram.</p><form method="post" action="/activate"><label for="secret">WEBHOOK_SECRET configurato in Cloudflare</label><input id="secret" name="secret" type="password" autocomplete="off" minlength="32" maxlength="256" required><button>Attiva il bot</button></form><p>Il segreto viene usato solo per questa richiesta e non viene inserito nell\u2019indirizzo o salvato dal modulo.</p>'
    );
  if (url.pathname !== "/activate" || request.method !== "POST") return null;
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin)
    return new Response("Forbidden", { status: 403 });
  if (Number(request.headers.get("content-length") || 0) > 2048)
    return new Response("Too large", { status: 413 });
  const raw = await request.text();
  if (raw.length > 2048) return new Response("Too large", { status: 413 });
  const supplied = new URLSearchParams(raw).get("secret");
  if (!env.WEBHOOK_SECRET || supplied !== env.WEBHOOK_SECRET)
    return page(
      "<p>Segreto non corretto. Torna indietro e usa il valore WEBHOOK_SECRET del tuo Worker.</p>",
      403
    );
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(env.WEBHOOK_SECRET) || !/^-\d+$/.test(env.CHAT_ID || "") || !/^\d+,\s*\d+$/.test(env.ALLOWED_USER_IDS || "") || new Set(env.ALLOWED_USER_IDS.split(",").map((x) => x.trim())).size !== 2 || !env.BOT_TOKEN)
    return page(
      "<p>Completa i quattro segreti Cloudflare: token del bot, segreto casuale di almeno 32 caratteri, ID del gruppo e due ID utente distinti separati da virgola.</p>",
      503
    );
  try {
    await env.DB.prepare("SELECT id FROM settings WHERE id=1").first();
    const me = await telegram(env, "getMe", {});
    if (me.username?.toLowerCase() !== "frifrigobot")
      return page(
        "<p>Il token non appartiene a @Frifrigobot. Controlla BOT_TOKEN.</p>",
        503
      );
    const chat = await telegram(env, "getChat", { chat_id: env.CHAT_ID });
    if (!["group", "supergroup"].includes(chat.type))
      return page("<p>CHAT_ID deve indicare il vostro gruppo.</p>", 503);
    await telegram(env, "setWebhook", {
      url: new URL("/telegram", url).toString(),
      secret_token: env.WEBHOOK_SECRET,
      max_connections: 1,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: false
    });
    const info = await telegram(env, "getWebhookInfo", {});
    if (info.url !== new URL("/telegram", url).toString())
      throw Error("Webhook non confermato");
    await env.DB.prepare(
      "INSERT OR IGNORE INTO outbox(id,payload,created_at) VALUES(?,?,?)"
    ).bind(
      "setup:welcome",
      JSON.stringify({
        method: "sendMessage",
        body: {
          chat_id: env.CHAT_ID,
          text: "\u{1F9CA} Frifrigobot \xE8 collegato. Premi il pulsante per aprire il menu.",
          reply_markup: {
            inline_keyboard: [
              [{ text: "\u{1F9CA} Apri il nostro frigo", callback_data: "home" }]
            ]
          }
        }
      }),
      (/* @__PURE__ */ new Date()).toISOString()
    ).run();
    await flush(env);
    return page(
      "<h2>Collegamento attivato</h2><p>Apri il gruppo Telegram e premi il pulsante del menu. La verifica dei prodotti e delle notifiche reali va completata nel gruppo.</p>"
    );
  } catch {
    console.error("activation_failed");
    return page(
      "<p>Attivazione non completata. Controlla che il bot sia nel gruppo e che il database sia stato inizializzato. Puoi riprovare senza duplicare l\u2019inventario.</p>",
      503
    );
  }
}
__name(activation, "activation");

// src/domain.js
var fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23"
});
function rome(now = /* @__PURE__ */ new Date()) {
  const p = Object.fromEntries(
    fmt.formatToParts(now).map((x) => [x.type, x.value])
  );
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}
__name(rome, "rome");
function addDays(d, n) {
  const x = /* @__PURE__ */ new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}
__name(addDays, "addDays");
function daysBetween(a, b) {
  return Math.round(
    (Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5
  );
}
__name(daysBetween, "daysBetween");
function parseDate(s) {
  s = s.trim();
  let d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) d = s;
  else {
    const m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
    if (!m) return null;
    d = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  const dt = /* @__PURE__ */ new Date(d + "T12:00:00Z");
  return !isNaN(dt) && dt.toISOString().slice(0, 10) === d && d >= "2000-01-01" && d <= "2100-12-31" ? d : null;
}
__name(parseDate, "parseDate");
var displayDate = /* @__PURE__ */ __name((d) => d ? d.split("-").reverse().join("/") : "non indicata", "displayDate");
function expiry(p) {
  const a = p.opened_date ? addDays(p.opened_date, p.after_days) : null;
  return a && p.original_date ? a < p.original_date ? a : p.original_date : a || p.original_date || null;
}
__name(expiry, "expiry");
function group(p, today) {
  if (p.finished) return 5;
  const e = expiry(p), d = e ? daysBetween(today, e) : Infinity;
  return d < 0 ? 0 : d === 0 ? 1 : d <= 3 ? 2 : p.opened_date ? 3 : 4;
}
__name(group, "group");
var titles = [
  "\u{1F534} Scaduti",
  "\u{1F7E0} Da consumare oggi",
  "\u{1F7E1} Entro 3 giorni",
  "\u{1F7E2} Aperti",
  "\u{1F535} Chiusi"
];
function sorted(ps, today) {
  return [...ps].sort(
    (a, b) => group(a, today) - group(b, today) || (expiry(a) || "9999").localeCompare(expiry(b) || "9999") || a.name.localeCompare(b.name)
  );
}
__name(sorted, "sorted");
function remaining(p, today) {
  const e = expiry(p);
  if (!e) return "nessuna scadenza indicata";
  const n = daysBetween(today, e);
  return n < 0 ? `scaduto da ${-n} giorni` : n === 0 ? "entro oggi" : n === 1 ? "entro domani" : `restano ${n} giorni`;
}
__name(remaining, "remaining");
function csv(ps) {
  const cols = [
    "id",
    "name",
    "category",
    "original_date",
    "after_days",
    "opened_date",
    "quantity",
    "finished"
  ];
  return "\uFEFF" + [cols, ...ps.map((p) => cols.map((k) => p[k] ?? ""))].map(
    (row) => row.map((v) => '"' + String(v).replaceAll('"', '""') + '"').join(",")
  ).join("\r\n");
}
__name(csv, "csv");
function readCSV(text) {
  text = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [], s = "", q = false;
  for (let i = 0; i < text.length; i++) {
    let c = text[i];
    if (c === '"') {
      if (q && text[i + 1] === '"') {
        s += '"';
        i++;
      } else if (q || s === "") q = !q;
      else throw Error("CSV non valido");
    } else if (c === "," && !q) {
      row.push(s);
      s = "";
    } else if ((c === "\n" || c === "\r") && !q) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(s);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      s = "";
    } else s += c;
  }
  if (q) throw Error("Virgolette CSV non chiuse");
  if (s || row.length) {
    row.push(s);
    rows.push(row);
  }
  const cols = rows.shift();
  const expected = [
    "id",
    "name",
    "category",
    "original_date",
    "after_days",
    "opened_date",
    "quantity",
    "finished"
  ];
  if (!cols || cols.join() !== expected.join())
    throw Error("Usa un CSV esportato da Frifrigobot");
  if (rows.length > 100)
    throw Error("Importa al massimo 100 confezioni per file");
  const ids = /* @__PURE__ */ new Set();
  return rows.map((r) => {
    if (r.length !== 8) throw Error("Colonne CSV non valide");
    let p = Object.fromEntries(cols.map((k, i) => [k, r[i]]));
    if (!/^[\w-]{1,40}$/.test(p.id) || ids.has(p.id) || !p.name.trim() || p.name.length > 80 || p.category.length > 60 || p.quantity.length > 60 || !/^\d+$/.test(p.after_days) || +p.after_days < 1 || +p.after_days > 365 || !["0", "1"].includes(p.finished))
      throw Error("Valori CSV non validi");
    for (const k of ["original_date", "opened_date"]) {
      if (p[k] && !parseDate(p[k])) throw Error("Data CSV non valida");
      p[k] = p[k] || null;
    }
    if (p.opened_date && p.opened_date > rome().date)
      throw Error("Apertura futura non valida");
    ids.add(p.id);
    return {
      ...p,
      name: p.name.trim(),
      after_days: +p.after_days,
      finished: +p.finished
    };
  });
}
__name(readCSV, "readCSV");

// src/worker.js
var btn = /* @__PURE__ */ __name((text, callback_data) => ({ text, callback_data }), "btn");
var keys = /* @__PURE__ */ __name((inline_keyboard) => ({ inline_keyboard }), "keys");
var home = /* @__PURE__ */ __name(() => keys([
  [btn("\u{1F9CA} Il mio frigo", "list:all:0"), btn("\u2795 Aggiungi prodotto", "add")],
  [
    btn("\u{1F513} Apri prodotto", "list:closed:0"),
    btn("\u23F0 Scadenze", "list:due:0")
  ],
  [btn("\u2699\uFE0F Impostazioni", "settings")]
]), "home");
var esc = /* @__PURE__ */ __name((s) => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"), "esc");
var key = /* @__PURE__ */ __name((s) => s.trim().normalize("NFKC").toLocaleLowerCase("it"), "key");
var uid = /* @__PURE__ */ __name(() => crypto.randomUUID().replaceAll("-", "").slice(0, 16), "uid");
var all = /* @__PURE__ */ __name(async (db, sql, ...p) => (await db.prepare(sql).bind(...p).all()).results, "all");
var one = /* @__PURE__ */ __name((db, sql, ...p) => db.prepare(sql).bind(...p).first(), "one");
var fields = [
  "name",
  "category",
  "original_date",
  "after_days",
  "opened_date",
  "quantity",
  "finished"
];
var Plan = class {
  static {
    __name(this, "Plan");
  }
  constructor(env, id, user) {
    this.env = env;
    this.id = id;
    this.user = String(user);
    this.statements = [];
    this.seq = 0;
    this.tag = `update:${id}`;
    this.owner = uid();
    this.expectedSession = null;
  }
  add(sql, ...params) {
    this.statements.push(
      this.env.DB.prepare(
        sql.replaceAll(
          "{G}",
          `EXISTS (SELECT 1 FROM processed WHERE id=${Number(this.id)} AND owner='${this.owner}' AND valid=1)`
        )
      ).bind(...params)
    );
  }
  send(text, markup = home(), extra = {}, condition = "1", args = []) {
    const payload = {
      method: "sendMessage",
      body: {
        chat_id: this.env.CHAT_ID,
        text,
        parse_mode: "HTML",
        reply_markup: markup,
        ...extra
      }
    };
    this.add(
      `INSERT OR IGNORE INTO outbox(id,payload,created_at,session_token,user_id) SELECT ?,?,?,?,? WHERE {G} AND (${condition})`,
      `${this.tag}:${this.seq++}`,
      JSON.stringify(payload),
      (/* @__PURE__ */ new Date()).toISOString(),
      extra._session || null,
      this.user,
      ...args
    );
  }
  document(text) {
    this.add(
      "INSERT OR IGNORE INTO outbox(id,payload,created_at) SELECT ?,?,? WHERE {G}",
      `${this.tag}:${this.seq++}`,
      JSON.stringify({ method: "csv", text }),
      (/* @__PURE__ */ new Date()).toISOString()
    );
  }
  session(s) {
    const token = uid();
    this.add(
      "INSERT INTO sessions(user_id,token,data,updated_at) SELECT ?,?,?,? WHERE {G} ON CONFLICT(user_id) DO UPDATE SET token=excluded.token,data=excluded.data,prompt_id=NULL,updated_at=excluded.updated_at",
      this.user,
      token,
      JSON.stringify(s),
      (/* @__PURE__ */ new Date()).toISOString()
    );
    return token;
  }
  clear() {
    this.add("DELETE FROM sessions WHERE user_id=? AND {G}", this.user);
  }
  prompt(s, text) {
    const token = this.session(s);
    this.send(
      `<a href="tg://user?id=${this.user}">Per te</a> \xB7 ` + text + "\nRispondi a questo messaggio. Per annullare: /annulla",
      {
        force_reply: true,
        selective: true,
        input_field_placeholder: "Scrivi qui\u2026"
      },
      {
        _session: token,
        ...this.messageId ? { reply_parameters: { message_id: this.messageId } } : {}
      }
    );
  }
  async commit() {
    const valid = this.expectedSession ? "EXISTS(SELECT 1 FROM sessions WHERE user_id=? AND token=?)" : "1";
    const params = [
      this.id,
      (/* @__PURE__ */ new Date()).toISOString(),
      this.owner,
      ...this.expectedSession ? [this.user, this.expectedSession] : []
    ];
    const claim = this.env.DB.prepare(
      `INSERT OR IGNORE INTO processed(id,created_at,owner,valid) SELECT ?,?,?,${valid}`
    ).bind(...params);
    const fallback = this.env.DB.prepare(
      "INSERT OR IGNORE INTO outbox(id,payload,created_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM processed WHERE id=? AND owner=? AND valid=0)"
    ).bind(
      this.tag + ":stale",
      JSON.stringify({
        method: "sendMessage",
        body: {
          chat_id: this.env.CHAT_ID,
          text: "Questa procedura \xE8 gi\xE0 stata completata o sostituita. Riapri il menu.",
          reply_markup: home()
        }
      }),
      (/* @__PURE__ */ new Date()).toISOString(),
      this.id,
      this.owner
    );
    return this.env.DB.batch([claim, ...this.statements, fallback]);
  }
};
async function telegram(env, method, body) {
  let response;
  try {
    response = await (env.FETCH || fetch)(
      `https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12e3)
      }
    );
  } catch {
    throw Error("Telegram non raggiungibile");
  }
  const data = await response.json();
  if (!data.ok) {
    const e = Error("Telegram API: " + response.status);
    e.code = data.error_code;
    e.retry = data.parameters?.retry_after;
    throw e;
  }
  return data.result;
}
__name(telegram, "telegram");
async function flush(env, now = Date.now()) {
  const rows = await all(
    env.DB,
    "SELECT * FROM outbox WHERE status='pending' AND lease_until<=? ORDER BY created_at,id LIMIT 4",
    now
  );
  for (const r of rows) {
    const lease = await env.DB.prepare(
      "UPDATE outbox SET lease_until=?,attempts=attempts+1 WHERE id=? AND status='pending' AND lease_until<=?"
    ).bind(now + 6e4, r.id, now).run();
    if (!lease.meta.changes) continue;
    try {
      const p = JSON.parse(r.payload);
      let result;
      if (p.method === "csv") {
        const form = new FormData();
        form.set("chat_id", env.CHAT_ID);
        form.set(
          "document",
          new Blob([p.text], { type: "text/csv;charset=utf-8" }),
          "frifrigobot-inventario.csv"
        );
        const response = await (env.FETCH || fetch)(
          `https://api.telegram.org/bot${env.BOT_TOKEN}/sendDocument`,
          { method: "POST", body: form, signal: AbortSignal.timeout(12e3) }
        );
        const d = await response.json();
        if (!d.ok) throw Error("Invio CSV fallito");
        result = d.result;
      } else {
        delete p.body._session;
        result = await telegram(env, p.method, p.body);
      }
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE outbox SET status='sent',message_id=?,payload='{}' WHERE id=?"
        ).bind(result?.message_id || null, r.id),
        env.DB.prepare(
          "UPDATE sessions SET prompt_id=? WHERE user_id=? AND token=?"
        ).bind(result?.message_id || null, r.user_id, r.session_token)
      ]);
    } catch (e) {
      await env.DB.prepare("UPDATE outbox SET lease_until=? WHERE id=?").bind(
        now + Math.min(
          36e5,
          Math.max(
            (e.retry || 0) * 1e3,
            3e4 * 2 ** Math.min(r.attempts, 6)
          )
        ),
        r.id
      ).run();
      console.error("outbox_delivery_failed", { code: e.code || 0 });
    }
  }
}
__name(flush, "flush");
async function list(plan, mode = "all", page2 = 0) {
  const today = rome().date;
  let ps = sorted(
    await all(plan.env.DB, "SELECT * FROM products WHERE finished=0"),
    today
  );
  if (mode === "closed") ps = ps.filter((p) => !p.opened_date);
  if (mode === "due") ps = ps.filter((p) => group(p, today) <= 2);
  page2 = Math.max(
    0,
    Math.min(page2, Math.max(0, Math.ceil(ps.length / 10) - 1))
  );
  const chunk = ps.slice(page2 * 10, page2 * 10 + 10);
  let text = mode === "closed" ? "\u{1F513} <b>Scegli una confezione da aprire</b>" : "\u{1F9CA} <b>Il nostro frigo</b>";
  let prev = -1;
  for (const p of chunk) {
    const g = group(p, today);
    if (g !== prev) {
      text += `

<b>${titles[g]}</b>`;
      prev = g;
    }
    text += `
\u2022 <b>${esc(p.name)}</b> \xB7 ${esc(p.quantity)} \xB7 #${p.id.slice(-4)}
  ${remaining(p, today)}${p.opened_date ? " \xB7 aperto " + displayDate(p.opened_date) : ""}`;
  }
  if (!ps.length) text += "\nNessun prodotto in questa vista.";
  text += "\n\nTocca una confezione per gestirla. Le date sono giorni italiani; \u201Coggi\u201D termina a mezzanotte.";
  const rows = chunk.map((p) => [
    btn(
      `${p.opened_date ? "\u{1F513}" : "\u{1F4E6}"} ${p.name} \xB7 #${p.id.slice(-4)}`,
      `item:${p.id}`
    )
  ]);
  const nav = [];
  if (page2) nav.push(btn("\u2190", `list:${mode}:${page2 - 1}`));
  if ((page2 + 1) * 10 < ps.length)
    nav.push(btn("\u2192", `list:${mode}:${page2 + 1}`));
  if (nav.length) rows.push(nav);
  rows.push([btn("\u2795 Aggiungi", "add"), btn("\u{1F3E0} Menu", "home")]);
  plan.send(text, keys(rows));
}
__name(list, "list");
function card(plan, p) {
  const v = `${p.id}:${p.version}`, rows = [];
  if (!p.finished) {
    if (!p.opened_date)
      rows.push([
        btn("\u{1F513} Apri oggi", `open:${v}`),
        btn("\u{1F4C5} Apertura precedente", `date:${v}`)
      ]);
    rows.push([
      btn("\u2705 Terminato", `finish:${v}`),
      btn("\u270F\uFE0F Modifica", `edit:${v}`)
    ]);
  } else rows.push([btn("\u21A9\uFE0F Ripristina", `restore:${v}`)]);
  rows.push([btn("\u{1F9CA} Inventario", "list:all:0")]);
  plan.send(
    `${p.finished ? "\u2705" : "\u{1F4E6}"} <b>${esc(p.name)}</b> \xB7 #${p.id.slice(-4)}
${esc(p.quantity)}${p.category ? " \xB7 " + esc(p.category) : ""}
Confezione: ${displayDate(p.original_date)}
Dopo apertura: ${p.after_days} giorni
Aperto: ${displayDate(p.opened_date)}
Da consumare entro: <b>${displayDate(expiry(p))}</b>
${p.finished ? "Terminato" : remaining(p, rome().date)}`,
    keys(rows)
  );
}
__name(card, "card");
async function change(plan, p, patch) {
  const next = { ...p, ...patch, version: p.version + 1 }, undoId = uid();
  plan.add(
    "INSERT INTO undo(id,product_id,expected_version,snapshot,created_at) SELECT ?,?,?,?,? WHERE {G} AND EXISTS(SELECT 1 FROM products WHERE id=? AND version=?)",
    undoId,
    p.id,
    next.version,
    JSON.stringify(p),
    (/* @__PURE__ */ new Date()).toISOString(),
    p.id,
    p.version
  );
  plan.add(
    `UPDATE products SET ${fields.map((k) => k + "=?").join(",")},version=version+1,updated_at=?,last_event=? WHERE id=? AND version=? AND {G}`,
    ...fields.map((k) => next[k]),
    (/* @__PURE__ */ new Date()).toISOString(),
    plan.tag,
    p.id,
    p.version
  );
  plan.send(
    `\u2705 <b>${esc(p.name)}</b> aggiornato.
${next.finished ? "Confezione terminata." : remaining(next, rome().date) + " \xB7 scadenza " + displayDate(expiry(next))}`,
    keys([
      [btn("\u21A9\uFE0F Annulla operazione", `undo:${undoId}`)],
      [btn("\u{1F4E6} Dettagli", `item:${p.id}`), btn("\u{1F9CA} Inventario", "list:all:0")]
    ]),
    {},
    "EXISTS(SELECT 1 FROM products WHERE id=? AND last_event=?)",
    [p.id, plan.tag]
  );
  plan.send(
    "La confezione \xE8 stata modificata nel frattempo. Riapri i dettagli.",
    keys([[btn("Aggiorna", `item:${p.id}`)]]),
    {},
    "NOT EXISTS(SELECT 1 FROM products WHERE id=? AND last_event=?)",
    [p.id, plan.tag]
  );
}
__name(change, "change");
async function askDays(plan, d) {
  const t = await one(
    plan.env.DB,
    "SELECT * FROM templates WHERE name_key=?",
    key(d.name)
  );
  if (t) {
    const token = plan.session({ ...d, category: t.category, step: "days" });
    plan.send(
      `<b>${esc(d.name)}</b>
Ricordo: <b>${t.after_days} giorni dall\u2019apertura</b>.`,
      keys([
        [
          btn(
            `Usa ${t.after_days} giorni`,
            `wiz:${token}:days:${t.after_days}`
          ),
          btn("Cambia", `wiz:${token}:customdays`)
        ],
        [btn("Annulla", `cancel:${token}`)]
      ])
    );
  } else
    plan.prompt(
      { ...d, step: "days" },
      `Entro quanti giorni dall\u2019apertura va consumato <b>${esc(d.name)}</b>?
Leggi la confezione (da 1 a 365).`
    );
}
__name(askDays, "askDays");
function askOriginal(plan, d) {
  const token = plan.session({ ...d, step: "original" });
  plan.send(
    "\u{1F4C5} Scadenza sulla confezione?",
    keys([
      [
        btn("Nessuna / non ora", `wiz:${token}:original`),
        btn("Inserisci data", `wiz:${token}:customoriginal`)
      ],
      [btn("Annulla", `cancel:${token}`)]
    ])
  );
}
__name(askOriginal, "askOriginal");
function review(plan, d) {
  const token = plan.session({ ...d, step: "review", count: d.count || 1 });
  plan.send(
    `\u{1F4E6} <b>${esc(d.name)}</b>
${d.count || 1} confezioni separate
Dopo apertura: ${d.after_days} giorni
Scadenza confezione: ${displayDate(d.original_date)}${d.category ? "\nCategoria: " + esc(d.category) : ""}
Le confezioni vengono aggiunte chiuse.`,
    keys([
      [
        btn("\u2705 Salva", `wiz:${token}:save`),
        btn("\u{1F513} Salva e apri oggi", `wiz:${token}:saveopen`)
      ],
      [
        btn("\u{1F4E6} Numero confezioni", `wiz:${token}:count`),
        btn("\u{1F3F7} Categoria", `wiz:${token}:category`)
      ],
      [btn("Annulla", `cancel:${token}`)]
    ])
  );
}
__name(review, "review");
async function settings(plan) {
  const s = await one(plan.env.DB, "SELECT * FROM settings WHERE id=1");
  plan.send(
    `\u2699\uFE0F <b>Impostazioni</b>
Avvisi alle ${String(s.hour).padStart(2, "0")}:00, fuso Europe/Rome. Ora legale automatica.
Le durate seguono l\u2019etichetta; non verificano lo stato dell\u2019alimento.`,
    keys([
      [btn(`${s.day_before ? "\u2705" : "\u2B1C"} Giorno prima`, "toggle:day_before")],
      [btn(`${s.on_day ? "\u2705" : "\u2B1C"} Giorno della scadenza`, "toggle:on_day")],
      [btn(`${s.summary ? "\u2705" : "\u2B1C"} Riepilogo utile`, "toggle:summary")],
      [btn("\u{1F557} Cambia ora", "hour"), btn("\u{1F514} Prova notifica", "testnotify")],
      [btn("\u{1F4E4} Esporta CSV", "export"), btn("\u{1F4E5} Recupera CSV", "import")],
      [btn("\u{1F4DA} Prodotti terminati", "history"), btn("\u{1F3E0} Menu", "home")]
    ])
  );
}
__name(settings, "settings");
async function handleText(plan, m, session) {
  const text = m.text?.trim() || "", command = text.split("@")[0];
  if (["/start", "/menu", "/frigo"].includes(command)) {
    plan.clear();
    plan.send(
      "\u{1F9CA} <b>Frifrigobot</b>\nIl frigo condiviso, una confezione alla volta."
    );
    return;
  }
  if (command === "/annulla") {
    plan.clear();
    plan.send("Operazione annullata.");
    return;
  }
  if (!session || m.reply_to_message?.message_id !== session.prompt_id) return;
  plan.expectedSession = session.token;
  const s = JSON.parse(session.data);
  if (Date.now() - Date.parse(session.updated_at) > 36e5) {
    plan.clear();
    plan.send("Procedura scaduta. Ricomincia dal menu.");
    return;
  }
  if (s.step === "import") {
    if (!m.document) {
      plan.prompt(s, "Allega il CSV esportato rispondendo a questo messaggio.");
      return;
    }
    if (m.document.file_size > 1e5) {
      plan.send("File troppo grande: massimo 100 KB.");
      return;
    }
    const file = await telegram(plan.env, "getFile", {
      file_id: m.document.file_id
    });
    const response = await (plan.env.FETCH || fetch)(
      `https://api.telegram.org/file/bot${plan.env.BOT_TOKEN}/${file.file_path}`,
      { signal: AbortSignal.timeout(12e3) }
    );
    if (!response.ok) throw Error("CSV non disponibile");
    const raw = await response.text();
    if (new TextEncoder().encode(raw).length > 1e5)
      throw Error("CSV troppo grande");
    try {
      const rows = readCSV(raw), token = plan.session({ step: "importconfirm", rows });
      plan.send(
        `\u{1F4E5} ${rows.length} confezioni da recuperare.
Gli ID gi\xE0 presenti saranno ignorati.`,
        keys([
          [btn("Conferma recupero", `importconfirm:${token}`)],
          [btn("Annulla", `cancel:${token}`)]
        ])
      );
    } catch (e) {
      plan.send(esc(e.message));
    }
    return;
  }
  if (s.step === "name") {
    if (!text || text.length > 80) {
      plan.prompt(s, "Nome da 1 a 80 caratteri.");
      return;
    }
    await askDays(plan, { name: text, category: "", original_date: null });
    return;
  }
  if (s.step === "days") {
    if (!/^\d+$/.test(text) || +text < 1 || +text > 365) {
      plan.prompt(s, "Inserisci un numero intero da 1 a 365.");
      return;
    }
    askOriginal(plan, { ...s, after_days: +text });
    return;
  }
  if (s.step === "original") {
    const d = parseDate(text);
    if (!d) {
      plan.prompt(
        s,
        "Data non valida. Usa GG/MM/AAAA, per esempio 25/11/2026."
      );
      return;
    }
    review(plan, { ...s, original_date: d });
    return;
  }
  if (s.step === "count") {
    if (!/^\d+$/.test(text) || +text < 1 || +text > 20) {
      plan.prompt(s, "Da 1 a 20 confezioni per aggiunta.");
      return;
    }
    review(plan, { ...s, count: +text });
    return;
  }
  if (s.step === "category") {
    if (text.length > 60) {
      plan.prompt(s, "Categoria: massimo 60 caratteri.");
      return;
    }
    review(plan, { ...s, category: text === "-" ? "" : text });
    return;
  }
  if (s.step === "hour") {
    if (!/^\d{1,2}$/.test(text) || +text > 23) {
      plan.prompt(s, "Scrivi un\u2019ora da 0 a 23.");
      return;
    }
    plan.add("UPDATE settings SET hour=? WHERE id=1 AND {G}", +text);
    plan.clear();
    plan.send(`\u2705 Avvisi alle ${text.padStart(2, "0")}:00 italiane.`);
    return;
  }
  if (s.step === "editfield") {
    const p = await one(plan.env.DB, "SELECT * FROM products WHERE id=?", s.id);
    if (!p || p.version !== s.version) {
      plan.clear();
      plan.send("La confezione \xE8 cambiata. Riapri i dettagli.");
      return;
    }
    let value = text;
    if (["opened_date", "original_date"].includes(s.field)) {
      value = text === "-" ? null : parseDate(text);
      if (text !== "-" && !value) {
        plan.prompt(
          s,
          "Data non valida: usa GG/MM/AAAA oppure - per rimuoverla."
        );
        return;
      }
      if (s.field === "opened_date" && value > rome().date) {
        plan.prompt(s, "L\u2019apertura non pu\xF2 essere nel futuro.");
        return;
      }
    } else if (s.field === "after_days") {
      if (!/^\d+$/.test(text) || +text < 1 || +text > 365) {
        plan.prompt(s, "Numero di giorni da 1 a 365.");
        return;
      }
      value = +text;
    } else {
      const limit = s.field === "name" ? 80 : 60;
      if (!value || value.length > limit) {
        plan.prompt(s, `Scrivi da 1 a ${limit} caratteri.`);
        return;
      }
      if (s.field === "category" && value === "-") value = "";
    }
    plan.clear();
    await change(plan, p, { [s.field]: value });
    return;
  }
}
__name(handleText, "handleText");
async function callback(plan, data, session) {
  const [op, a, b, c] = data.split(":"), s = session ? JSON.parse(session.data) : null;
  if (op === "home") {
    plan.send("\u{1F9CA} <b>Frifrigobot</b>");
    return;
  }
  if (op === "list") {
    await list(plan, a, +b || 0);
    return;
  }
  if (op === "cancel") {
    if (session?.token === a) plan.clear();
    plan.send("Operazione annullata.");
    return;
  }
  if (op === "add") {
    plan.prompt({ step: "name" }, "\u2795 Come si chiama il prodotto?");
    return;
  }
  if (op === "item") {
    const p = await one(plan.env.DB, "SELECT * FROM products WHERE id=?", a);
    if (p) card(plan, p);
    else plan.send("Confezione non trovata.");
    return;
  }
  if (op === "settings") {
    await settings(plan);
    return;
  }
  if (op === "toggle" && ["day_before", "on_day", "summary"].includes(a)) {
    plan.add(`UPDATE settings SET ${a}=1-${a} WHERE id=1 AND {G}`);
    plan.send(
      "\u2705 Preferenza aggiornata.",
      keys([[btn("\u2699\uFE0F Mostra impostazioni", "settings")]])
    );
    return;
  }
  if (op === "hour") {
    plan.prompt(
      { step: "hour" },
      "A quale ora italiana vuoi gli avvisi? Scrivi un numero da 0 a 23."
    );
    return;
  }
  if (op === "testnotify") {
    plan.send(
      "\u{1F514} Notifica di prova di Frifrigobot.\nIl bot pu\xF2 inviare messaggi in questo gruppo."
    );
    return;
  }
  if (op === "history") {
    const ps = await all(
      plan.env.DB,
      "SELECT * FROM products WHERE finished=1 ORDER BY updated_at DESC LIMIT 15"
    );
    plan.send(
      "\u{1F4DA} Ultime 15 confezioni terminate",
      keys([
        ...ps.map((p) => [
          btn(`${p.name} \xB7 #${p.id.slice(-4)}`, `item:${p.id}`)
        ]),
        [btn("\u{1F3E0} Menu", "home")]
      ])
    );
    return;
  }
  if (op === "export") {
    plan.document(
      csv(await all(plan.env.DB, "SELECT * FROM products ORDER BY id"))
    );
    plan.send(
      "\u{1F4E4} CSV esportato, inclusi i prodotti terminati. Conservalo per il recupero."
    );
    return;
  }
  if (op === "import") {
    plan.prompt(
      { step: "import" },
      "\u{1F4E5} Allega come risposta un CSV esportato da Frifrigobot (massimo 100 KB / 100 confezioni)."
    );
    return;
  }
  if (op === "importconfirm" && s?.step === "importconfirm" && session.token === a) {
    plan.expectedSession = a;
    plan.add(
      `INSERT OR IGNORE INTO products(id,${fields.join(",")},updated_at) SELECT json_extract(value,'$.id'),${fields.map((k) => "json_extract(value,'$." + k + "')").join(",")},? FROM json_each(?) WHERE {G}`,
      (/* @__PURE__ */ new Date()).toISOString(),
      JSON.stringify(s.rows)
    );
    plan.clear();
    plan.send(
      "\u2705 Recupero completato. Gli ID gi\xE0 presenti sono stati ignorati."
    );
    return;
  }
  if (op === "wiz") {
    plan.expectedSession = a;
    if (!session || session.token !== a || Date.now() - Date.parse(session.updated_at) > 36e5) {
      plan.send("Questo pulsante non \xE8 pi\xF9 attivo. Ricomincia dal menu.");
      return;
    }
    if (b === "days" && s.step === "days" && /^\d+$/.test(c) && +c >= 1 && +c <= 365)
      askOriginal(plan, { ...s, after_days: +c });
    else if (b === "customdays" && s.step === "days")
      plan.prompt(s, "Quanti giorni dopo l\u2019apertura? Da 1 a 365.");
    else if (b === "original" && s.step === "original")
      review(plan, { ...s, original_date: null });
    else if (b === "customoriginal" && s.step === "original")
      plan.prompt(s, "Scrivi la data sulla confezione in formato GG/MM/AAAA.");
    else if (b === "count" && s.step === "review")
      plan.prompt(
        { ...s, step: "count" },
        "Quante confezioni uguali? Da 1 a 20. Ognuna avr\xE0 un\u2019identit\xE0 separata."
      );
    else if (b === "category" && s.step === "review")
      plan.prompt(
        { ...s, step: "category" },
        "Categoria facoltativa (es. Latticini). Scrivi - per lasciarla vuota."
      );
    else if (["save", "saveopen"].includes(b) && s.step === "review") {
      for (let i = 0; i < (s.count || 1); i++)
        plan.add(
          "INSERT INTO products(id,name,category,original_date,after_days,opened_date,quantity,updated_at) SELECT ?,?,?,?,?,?,?,? WHERE {G}",
          uid(),
          s.name,
          s.category || "",
          s.original_date || null,
          s.after_days,
          b === "saveopen" ? rome().date : null,
          "1 confezione",
          (/* @__PURE__ */ new Date()).toISOString()
        );
      plan.add(
        "INSERT INTO templates(name_key,name,after_days,category) SELECT ?,?,?,? WHERE {G} ON CONFLICT(name_key) DO UPDATE SET after_days=excluded.after_days,category=excluded.category",
        key(s.name),
        s.name,
        s.after_days,
        s.category || ""
      );
      plan.clear();
      plan.send(
        `\u2705 Aggiunte ${s.count || 1} confezioni di <b>${esc(s.name)}</b>${b === "saveopen" ? ", aperte oggi" : ""}.`,
        keys([
          [
            btn("\u{1F9CA} Il mio frigo", "list:all:0"),
            btn("\u2795 Aggiungi altro", "add")
          ]
        ])
      );
    }
    return;
  }
  if (op === "undo") {
    const u = await one(plan.env.DB, "SELECT * FROM undo WHERE id=?", a);
    if (!u) {
      plan.send("Operazione non disponibile.");
      return;
    }
    const p = await one(
      plan.env.DB,
      "SELECT * FROM products WHERE id=?",
      u.product_id
    );
    if (!p || p.version !== u.expected_version) {
      plan.send("Sono state fatte altre modifiche: correggi dai dettagli.");
      return;
    }
    await change(plan, p, JSON.parse(u.snapshot));
    return;
  }
  if (["open", "date", "finish", "restore", "edit", "field"].includes(op)) {
    const p = await one(plan.env.DB, "SELECT * FROM products WHERE id=?", a);
    if (!p || p.version !== +b) {
      plan.send(
        "Pulsante superato. Aggiorna i dettagli.",
        keys([[btn("Aggiorna", `item:${a}`)]])
      );
      return;
    }
    if (op === "open" && !p.finished && !p.opened_date)
      await change(plan, p, { opened_date: rome().date });
    else if (op === "finish" && !p.finished)
      await change(plan, p, { finished: 1 });
    else if (op === "restore" && p.finished)
      await change(plan, p, { finished: 0 });
    else if (op === "edit")
      plan.send(
        "\u270F\uFE0F Quale dato vuoi correggere?",
        keys(
          [
            ["Nome", "name"],
            ["Categoria", "category"],
            ["Scadenza confezione", "original_date"],
            ["Giorni dopo apertura", "after_days"],
            ["Data apertura / richiudi", "opened_date"],
            ["Quantit\xE0 descrittiva", "quantity"]
          ].map(([label, f]) => [
            btn(label, `field:${p.id}:${p.version}:${f}`)
          ])
        )
      );
    else if (op === "date" || op === "field") {
      const field = op === "date" ? "opened_date" : c;
      if (!fields.includes(field) || field === "finished") return;
      plan.prompt(
        { step: "editfield", id: p.id, version: p.version, field },
        ["opened_date", "original_date"].includes(field) ? "Scrivi la data in formato GG/MM/AAAA. Scrivi - per rimuoverla." : field === "after_days" ? "Quanti giorni dopo l\u2019apertura? Da 1 a 365." : "Scrivi il nuovo valore."
      );
    }
    return;
  }
}
__name(callback, "callback");
async function processUpdate(env, u) {
  const m = u.callback_query?.message || u.message, user = u.callback_query?.from || u.message?.from;
  if (!m || !user || user.is_bot || !Number.isSafeInteger(u.update_id)) return;
  if (!env.CHAT_ID || String(m.chat.id) !== String(env.CHAT_ID) || !["group", "supergroup"].includes(m.chat.type) || !String(env.ALLOWED_USER_IDS || "").split(",").map((x) => x.trim()).includes(String(user.id)))
    return;
  if (await one(env.DB, "SELECT id FROM processed WHERE id=?", u.update_id)) {
    await flush(env);
    return;
  }
  const plan = new Plan(env, u.update_id, user.id);
  plan.messageId = m.message_id;
  const session = await one(
    env.DB,
    "SELECT * FROM sessions WHERE user_id=?",
    String(user.id)
  );
  if (u.callback_query) {
    try {
      await telegram(env, "answerCallbackQuery", {
        callback_query_id: u.callback_query.id
      });
    } catch {
    }
    await callback(plan, u.callback_query.data || "", session);
  } else await handleText(plan, m, session);
  await plan.commit();
  await flush(env);
}
__name(processUpdate, "processUpdate");
async function scheduled(env, now = /* @__PURE__ */ new Date()) {
  const r = rome(now), s = await one(env.DB, "SELECT * FROM settings WHERE id=1");
  if (!s || r.hour < s.hour) {
    await flush(env, now.getTime());
    return;
  }
  const ps = sorted(
    await all(env.DB, "SELECT * FROM products WHERE finished=0"),
    r.date
  );
  let alerts = [];
  for (const p of ps) {
    const e = expiry(p);
    if (!e) continue;
    const d = daysBetween(r.date, e);
    if (d === 1 && s.day_before || d === 0 && s.on_day)
      alerts.push(
        `\u2022 ${esc(p.name)} \xB7 #${p.id.slice(-4)}: ${remaining(p, r.date)}`
      );
  }
  if (s.summary) {
    const checks = ps.filter((p) => group(p, r.date) <= 2);
    if (checks.length)
      alerts.push(
        "\n\u{1F4CB} Da controllare:\n" + checks.slice(0, 15).map(
          (p) => `\u2022 ${esc(p.name)} \xB7 #${p.id.slice(-4)}: ${remaining(p, r.date)}`
        ).join("\n")
      );
  }
  if (alerts.length) {
    const text = `\u23F0 <b>Frifrigobot \xB7 ${displayDate(r.date)}</b>
` + alerts.slice(0, 15).join("\n");
    await env.DB.prepare(
      "INSERT OR IGNORE INTO outbox(id,payload,created_at) VALUES(?,?,?)"
    ).bind(
      "daily:" + r.date,
      JSON.stringify({
        method: "sendMessage",
        body: {
          chat_id: env.CHAT_ID,
          text,
          parse_mode: "HTML",
          reply_markup: home()
        }
      }),
      now.toISOString()
    ).run();
  }
  await flush(env, now.getTime());
  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM processed WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days')"
    ),
    env.DB.prepare(
      "DELETE FROM sessions WHERE updated_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')"
    ),
    env.DB.prepare(
      "DELETE FROM undo WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days')"
    ),
    env.DB.prepare(
      "DELETE FROM outbox WHERE status='sent' AND created_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days')"
    )
  ]);
}
__name(scheduled, "scheduled");
var worker_default = {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === "/setup" || path === "/activate") {
      const response = await activation(request, env);
      if (response) return response;
    }
    if (path === "/health" && request.method === "GET")
      return new Response("Frifrigobot online", {
        headers: { "Cache-Control": "no-store" }
      });
    if (path !== "/telegram" || request.method !== "POST")
      return new Response("Not found", { status: 404 });
    if (!env.WEBHOOK_SECRET || request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET)
      return new Response("Forbidden", { status: 403 });
    if (!env.CHAT_ID || !env.ALLOWED_USER_IDS || !env.BOT_TOKEN)
      return new Response("Not configured", { status: 503 });
    if (Number(request.headers.get("content-length") || 0) > 262144)
      return new Response("Too large", { status: 413 });
    try {
      const raw = await request.text();
      if (raw.length > 262144)
        return new Response("Too large", { status: 413 });
      await processUpdate(env, JSON.parse(raw));
      return new Response("OK");
    } catch {
      console.error("telegram_update_failed");
      return new Response("Retry later", { status: 500 });
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(scheduled(env, new Date(event.scheduledTime)));
  }
};
export {
  worker_default as default,
  flush,
  processUpdate,
  scheduled,
  telegram
};
//# sourceMappingURL=worker.js.map
