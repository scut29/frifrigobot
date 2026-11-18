// src/activation.js
var page = (content, status = 200) => new Response(
  `<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Attiva Frifrigobot</title><style>body{font:18px system-ui;max-width:540px;margin:8vh auto;padding:24px;background:#f2f8f5;color:#173d32}main{padding:28px;border-radius:20px;background:white}input,button{font:inherit;box-sizing:border-box;width:100%;padding:14px;margin-top:12px;border:1px solid #bdd4c9;border-radius:10px}button{background:#176b50;color:white;cursor:pointer}p{line-height:1.5}label{display:block}</style><main><h1>\u{1F9CA} Frifrigobot</h1>${content}</main></html>`,
  {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"
    }
  }
);
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
function addDays(d, n) {
  const x = /* @__PURE__ */ new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}
function daysBetween(a, b) {
  return Math.round(
    (Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5
  );
}
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
var displayDate = (d) => d ? d.split("-").reverse().join("/") : "non indicata";
var tracksOpening = (p) => p.track_opening !== 0;
function expiry(p) {
  const a = tracksOpening(p) && p.opened_date ? addDays(p.opened_date, p.after_days) : null;
  return a && p.original_date ? a < p.original_date ? a : p.original_date : a || p.original_date || null;
}
function group(p, today) {
  if (p.finished) return 5;
  const e = expiry(p), d = e ? daysBetween(today, e) : Infinity;
  return d < 0 ? 0 : d === 0 ? 1 : d <= 3 ? 2 : p.opened_date ? 3 : 4;
}
function expiryTitle(p, today) {
  const e = expiry(p);
  if (!e) return "\u26AA Senza scadenza indicata";
  const n = daysBetween(today, e);
  return n < 0 ? "\u{1F534} Scaduti" : n === 0 ? "\u{1F7E0} Da consumare oggi" : n === 1 ? "\u{1F7E1} Entro domani" : `\u{1F7E2} Restano ${n} giorni`;
}
function packageLabel(p, ps) {
  const same = ps.filter((x) => x.name === p.name);
  const suffix = same.length > 1 ? ` \xB7 confezione ${same.findIndex((x) => x.id === p.id) + 1}` : "";
  return `${p.name}${suffix}`;
}
function sorted(ps, today) {
  return [...ps].sort(
    (a, b) => (expiry(a) || "9999").localeCompare(expiry(b) || "9999") || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
  );
}
function remaining(p, today) {
  const e = expiry(p);
  if (!e) return "nessuna scadenza indicata";
  const n = daysBetween(today, e);
  return n < 0 ? `scaduto da ${-n} giorni` : n === 0 ? "entro oggi" : n === 1 ? "entro domani" : `restano ${n} giorni`;
}
function csv(ps) {
  const cols = [
    "id",
    "name",
    "category",
    "original_date",
    "after_days",
    "opened_date",
    "quantity",
    "finished",
    "track_opening"
  ];
  return "\uFEFF" + [
    cols,
    ...ps.map(
      (p) => cols.map((k) => k === "track_opening" ? p[k] ?? 1 : p[k] ?? "")
    )
  ].map(
    (row) => row.map((v) => '"' + String(v).replaceAll('"', '""') + '"').join(",")
  ).join("\r\n");
}
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
  const legacy = cols?.join() === expected.join();
  if (!cols || !legacy && cols.join() !== [...expected, "track_opening"].join())
    throw Error("Usa un CSV esportato da Frifrigobot");
  if (rows.length > 100)
    throw Error("Importa al massimo 100 confezioni per file");
  const ids = /* @__PURE__ */ new Set();
  return rows.map((r) => {
    if (r.length !== cols.length) throw Error("Colonne CSV non valide");
    let p = Object.fromEntries(cols.map((k, i) => [k, r[i]]));
    if (!/^[\w-]{1,40}$/.test(p.id) || ids.has(p.id) || !p.name.trim() || p.name.length > 80 || p.category.length > 60 || p.quantity.length > 60 || !/^\d+$/.test(p.after_days) || +p.after_days < 1 || +p.after_days > 365 || !["0", "1"].includes(p.finished))
      throw Error("Valori CSV non validi");
    for (const k of ["original_date", "opened_date"]) {
      if (p[k] && !parseDate(p[k])) throw Error("Data CSV non valida");
      p[k] = p[k] || null;
    }
    if (p.opened_date && p.opened_date > rome().date)
      throw Error("Apertura futura non valida");
    const track_opening = legacy ? 1 : Number(p.track_opening);
    if (!legacy && !["0", "1"].includes(p.track_opening) || !track_opening && p.opened_date)
      throw Error("Modalit\xE0 apertura CSV non valida");
    ids.add(p.id);
    return {
      ...p,
      name: p.name.trim(),
      track_opening,
      after_days: +p.after_days,
      finished: +p.finished
    };
  });
}

// src/worker.js
var btn = (text, callback_data) => ({ text, callback_data });
var keys = (inline_keyboard) => ({ inline_keyboard });
var home = () => keys([
  [btn("\u{1F9CA} Il mio frigo", "list:all:0"), btn("\u2795 Aggiungi prodotto", "add")],
  [
    btn("\u{1F513} Apri prodotto", "list:closed:0"),
    btn("\u23F0 Scadenze", "list:due:0")
  ],
  [btn("\u2699\uFE0F Impostazioni", "settings")]
]);
var esc = (s) => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
var key = (s) => s.trim().normalize("NFKC").toLocaleLowerCase("it");
var uid = () => crypto.randomUUID().replaceAll("-", "").slice(0, 16);
var all = async (db, sql, ...p) => (await db.prepare(sql).bind(...p).all()).results;
var one = (db, sql, ...p) => db.prepare(sql).bind(...p).first();
var fields = [
  "name",
  "category",
  "original_date",
  "after_days",
  "opened_date",
  "quantity",
  "finished",
  "track_opening"
];
var Plan = class {
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
      method: extra._keep ? "sendMessage" : "ui",
      update_id: this.id,
      input_id: this.inputId || null,
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
      extra._session || this.outputSession || null,
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
    this.outputSession = token;
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
        _session: token
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
    e.description = data.description || "";
    throw e;
  }
  return data.result;
}
async function deliverPanel(env, r, p, now) {
  await env.DB.prepare("INSERT OR IGNORE INTO ui_panels(user_id) VALUES(?)").bind(r.user_id).run();
  const locked = await env.DB.prepare(
    "UPDATE ui_panels SET lease_owner=?,lease_until=? WHERE user_id=? AND lease_until<=?"
  ).bind(r.id, now + 6e4, r.user_id, now).run();
  if (!locked.meta.changes) {
    await env.DB.prepare("UPDATE outbox SET lease_until=? WHERE id=?").bind(now + 1e3, r.id).run();
    return;
  }
  try {
    const panel = await one(
      env.DB,
      "SELECT * FROM ui_panels WHERE user_id=?",
      r.user_id
    );
    const active = r.session_token ? await one(
      env.DB,
      "SELECT token FROM sessions WHERE user_id=?",
      r.user_id
    ) : null;
    if (p.update_id <= panel.last_update_id || r.session_token && active?.token !== r.session_token) {
      await env.DB.prepare(
        "UPDATE outbox SET status='sent',payload='{}' WHERE id=?"
      ).bind(r.id).run();
      return;
    }
    const body = { ...p.body };
    delete body._session;
    delete body._keep;
    const kind = body.reply_markup?.force_reply ? "prompt" : "inline";
    let messageId = null;
    if (kind === "inline" && panel.kind === "inline" && panel.message_id) {
      try {
        await telegram(env, "editMessageText", {
          ...body,
          message_id: panel.message_id
        });
        messageId = panel.message_id;
      } catch (e) {
        if (e.code === 400 && /message is not modified/i.test(e.description))
          messageId = panel.message_id;
        else if (!(e.code === 400 && /message (?:to edit not found|can't be edited)|MESSAGE_ID_INVALID/i.test(
          e.description
        )))
          throw e;
      }
    }
    if (!messageId)
      messageId = (await telegram(env, "sendMessage", body)).message_id;
    const ss = [
      env.DB.prepare(
        "UPDATE ui_panels SET message_id=?,kind=?,last_update_id=? WHERE user_id=? AND lease_owner=?"
      ).bind(messageId, kind, p.update_id, r.user_id, r.id),
      env.DB.prepare(
        "UPDATE outbox SET status='sent',message_id=?,payload='{}' WHERE id=?"
      ).bind(messageId, r.id),
      env.DB.prepare(
        "UPDATE sessions SET prompt_id=? WHERE user_id=? AND token=?"
      ).bind(messageId, r.user_id, r.session_token)
    ];
    for (const id of /* @__PURE__ */ new Set([
      panel.message_id !== messageId ? panel.message_id : null,
      p.input_id
    ])) {
      if (id && id !== messageId)
        ss.push(
          env.DB.prepare(
            "INSERT OR IGNORE INTO ui_cleanup(message_id,user_id,created_at) VALUES(?,?,?)"
          ).bind(id, r.user_id, new Date(now).toISOString())
        );
    }
    await env.DB.batch(ss);
  } finally {
    await env.DB.prepare(
      "UPDATE ui_panels SET lease_until=0,lease_owner=NULL WHERE user_id=? AND lease_owner=?"
    ).bind(r.user_id, r.id).run();
  }
}
async function cleanMessages(env, now) {
  const jobs = await all(
    env.DB,
    "SELECT * FROM ui_cleanup WHERE next_attempt<=? ORDER BY created_at LIMIT 12",
    now
  );
  for (const job of jobs) {
    if (await one(
      env.DB,
      "SELECT user_id FROM ui_panels WHERE message_id=?",
      job.message_id
    ))
      continue;
    try {
      await telegram(env, "deleteMessage", {
        chat_id: env.CHAT_ID,
        message_id: job.message_id
      });
      await env.DB.prepare("DELETE FROM ui_cleanup WHERE message_id=?").bind(job.message_id).run();
    } catch (e) {
      if ([400, 403].includes(e.code) || Date.parse(job.created_at) < now - 47 * 36e5) {
        await env.DB.prepare("DELETE FROM ui_cleanup WHERE message_id=?").bind(job.message_id).run();
      } else
        await env.DB.prepare(
          "UPDATE ui_cleanup SET next_attempt=? WHERE message_id=?"
        ).bind(now + Math.max(6e4, (e.retry || 0) * 1e3), job.message_id).run();
    }
  }
}
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
      if (p.method === "ui") {
        await deliverPanel(env, r, p, now);
        continue;
      } else if (p.method === "csv") {
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
        delete p.body._keep;
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
  await cleanMessages(env, now);
}
async function list(plan, mode = "all", page2 = 0) {
  const today = rome().date;
  let ps = sorted(
    await all(plan.env.DB, "SELECT * FROM products WHERE finished=0"),
    today
  );
  if (mode === "closed")
    ps = ps.filter((p) => tracksOpening(p) && !p.opened_date);
  if (mode === "due") ps = ps.filter((p) => expiry(p));
  page2 = Math.max(
    0,
    Math.min(page2, Math.max(0, Math.ceil(ps.length / 10) - 1))
  );
  const chunk = ps.slice(page2 * 10, page2 * 10 + 10);
  let text = mode === "closed" ? "\u{1F513} <b>Scegli una confezione da aprire</b>" : "\u{1F9CA} <b>Il nostro frigo</b>";
  let prev = null;
  for (const p of chunk) {
    const g = expiryTitle(p, today);
    if (g !== prev) {
      text += `

<b>${g}</b>`;
      prev = g;
    }
    text += `
\u2022 <b>${esc(packageLabel(p, ps))}</b> \xB7 ${esc(p.quantity)}
  ${remaining(p, today)}${p.opened_date ? " \xB7 aperto " + displayDate(p.opened_date) : ""}`;
  }
  if (!ps.length) text += "\nNessun prodotto in questa vista.";
  text += "\n\nTocca una confezione per gestirla. Le date sono giorni italiani; \u201Coggi\u201D termina a mezzanotte.";
  const rows = chunk.map((p) => [
    btn(
      `${!tracksOpening(p) ? "\u{1F4C5}" : p.opened_date ? "\u{1F513}" : "\u{1F4E6}"} ${packageLabel(p, ps)}`,
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
function card(plan, p) {
  const v = `${p.id}:${p.version}`, rows = [];
  if (!p.finished) {
    if (tracksOpening(p) && !p.opened_date)
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
    `${p.finished ? "\u2705" : "\u{1F4E6}"} <b>${esc(p.name)}</b>
${esc(p.quantity)}${p.category ? " \xB7 " + esc(p.category) : ""}
Confezione: ${displayDate(p.original_date)}${tracksOpening(p) ? `
Dopo apertura: ${p.after_days} giorni
Aperto: ${displayDate(p.opened_date)}` : "\n\u{1F4C5} Solo scadenza della confezione"}
Da consumare entro: <b>${displayDate(expiry(p))}</b>
${p.finished ? "Terminato" : remaining(p, rome().date)}`,
    keys(rows)
  );
}
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
    ...fields.map((k) => k === "track_opening" ? next[k] ?? 1 : next[k]),
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
async function askDays(plan, d) {
  const t = await one(
    plan.env.DB,
    "SELECT * FROM templates WHERE name_key=?",
    key(d.name)
  );
  const token = plan.session({
    ...d,
    category: t?.category || d.category || "",
    step: "days"
  });
  const rows = [];
  if (t && tracksOpening(t))
    rows.push([
      btn(`Usa ${t.after_days} giorni`, `wiz:${token}:days:${t.after_days}`)
    ]);
  rows.push([btn("\u{1F4C5} Solo scadenza", `wiz:${token}:noopening`)]);
  rows.push([btn("\u{1F513} Giorni dopo apertura", `wiz:${token}:customdays`)]);
  rows.push([btn("Annulla", `cancel:${token}`)]);
  plan.send(
    `<b>${esc(d.name)}</b>
${t ? tracksOpening(t) ? `Ricordo: <b>${t.after_days} giorni dall\u2019apertura</b>.
` : "Ricordo: solo scadenza della confezione.\n" : ""}Come vuoi gestire la scadenza?
Per uova e prodotti senza apertura scegli <b>Solo scadenza</b>.`,
    keys(rows)
  );
}
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
function review(plan, d) {
  const token = plan.session({ ...d, step: "review", count: d.count || 1 });
  plan.send(
    `\u{1F4E6} <b>${esc(d.name)}</b>
${d.count || 1} confezioni separate
${tracksOpening(d) ? `Dopo apertura: ${d.after_days} giorni` : "\u{1F4C5} Solo scadenza della confezione"}
Scadenza confezione: ${displayDate(d.original_date)}${d.category ? "\nCategoria: " + esc(d.category) : ""}${tracksOpening(d) ? "\nLe confezioni vengono aggiunte chiuse." : ""}`,
    keys([
      [
        btn("\u2705 Salva", `wiz:${token}:save`),
        ...tracksOpening(d) ? [btn("\u{1F513} Salva e apri oggi", `wiz:${token}:saveopen`)] : []
      ],
      [
        btn("\u{1F4E6} Numero confezioni", `wiz:${token}:count`),
        btn("\u{1F3F7} Categoria", `wiz:${token}:category`)
      ],
      [btn("Annulla", `cancel:${token}`)]
    ])
  );
}
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
async function handleText(plan, m, session) {
  const text = m.text?.trim() || "", command = text.split("@")[0];
  if (["/start", "/menu", "/frigo"].includes(command)) {
    plan.inputId = m.message_id;
    plan.clear();
    plan.send(
      "\u{1F9CA} <b>Frifrigobot</b>\nIl frigo condiviso, una confezione alla volta."
    );
    return;
  }
  if (command === "/annulla") {
    plan.inputId = m.message_id;
    plan.clear();
    plan.send("Operazione annullata.");
    return;
  }
  if (!session || m.reply_to_message?.message_id !== session.prompt_id) return;
  plan.expectedSession = session.token;
  if (m.text) plan.inputId = m.message_id;
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
    askOriginal(plan, { ...s, after_days: +text, track_opening: 1 });
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
    await change(plan, p, {
      [s.field]: value,
      ...s.field === "after_days" ? { track_opening: 1 } : {}
    });
    return;
  }
}
async function callback(plan, data, session) {
  const [op, a, b, c] = data.split(":"), s = session ? JSON.parse(session.data) : null;
  if ([
    "home",
    "list",
    "add",
    "settings",
    "item",
    "history",
    "export",
    "hour",
    "import"
  ].includes(op))
    plan.clear();
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
      "\u{1F514} Notifica di prova di Frifrigobot.\nIl bot pu\xF2 inviare messaggi in questo gruppo.",
      home(),
      { _keep: true }
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
        ...ps.map((p) => [btn(packageLabel(p, ps), `item:${p.id}`)]),
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
      `INSERT OR IGNORE INTO products(id,${fields.join(",")},updated_at) SELECT json_extract(value,'$.id'),${fields.map((k) => k === "track_opening" ? "coalesce(json_extract(value,'$.track_opening'),1)" : "json_extract(value,'$." + k + "')").join(",")},? FROM json_each(?) WHERE {G}`,
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
      askOriginal(plan, { ...s, after_days: +c, track_opening: 1 });
    else if (b === "noopening" && s.step === "days")
      askOriginal(plan, { ...s, after_days: 1, track_opening: 0 });
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
          "INSERT INTO products(id,name,category,original_date,after_days,opened_date,quantity,updated_at,track_opening) SELECT ?,?,?,?,?,?,?,?,? WHERE {G}",
          uid(),
          s.name,
          s.category || "",
          s.original_date || null,
          s.after_days,
          b === "saveopen" && tracksOpening(s) ? rome().date : null,
          "1 confezione",
          (/* @__PURE__ */ new Date()).toISOString(),
          s.track_opening ?? 1
        );
      plan.add(
        "INSERT INTO templates(name_key,name,after_days,category,track_opening) SELECT ?,?,?,?,? WHERE {G} ON CONFLICT(name_key) DO UPDATE SET after_days=excluded.after_days,category=excluded.category,track_opening=excluded.track_opening",
        key(s.name),
        s.name,
        s.after_days,
        s.category || "",
        s.track_opening ?? 1
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
  if ([
    "open",
    "date",
    "finish",
    "restore",
    "edit",
    "field",
    "noopening"
  ].includes(op)) {
    const p = await one(plan.env.DB, "SELECT * FROM products WHERE id=?", a);
    if (!p || p.version !== +b) {
      plan.send(
        "Pulsante superato. Aggiorna i dettagli.",
        keys([[btn("Aggiorna", `item:${a}`)]])
      );
      return;
    }
    if ((op === "open" || op === "date" || op === "field" && c === "opened_date") && !tracksOpening(p)) {
      plan.send("Questo prodotto usa solo la scadenza sulla confezione.");
      return;
    }
    if (op === "noopening" && !p.finished) {
      await change(plan, p, {
        track_opening: 0,
        opened_date: null,
        after_days: 1
      });
      plan.add(
        "UPDATE templates SET track_opening=0,after_days=1 WHERE name_key=? AND {G}",
        key(p.name)
      );
    } else if (op === "open" && !p.finished && !p.opened_date)
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
          ].filter(([, f]) => tracksOpening(p) || f !== "opened_date").map(([label, f]) => [
            btn(label, `field:${p.id}:${p.version}:${f}`)
          ]).concat([
            [btn("\u{1F4C5} Solo scadenza", `noopening:${p.id}:${p.version}`)]
          ])
        )
      );
    else if (op === "date" || op === "field") {
      const field = op === "date" ? "opened_date" : c;
      if (!fields.includes(field) || ["finished", "track_opening"].includes(field))
        return;
      plan.prompt(
        { step: "editfield", id: p.id, version: p.version, field },
        ["opened_date", "original_date"].includes(field) ? "Scrivi la data in formato GG/MM/AAAA. Scrivi - per rimuoverla." : field === "after_days" ? "Quanti giorni dopo l\u2019apertura? Da 1 a 365." : "Scrivi il nuovo valore."
      );
    }
    return;
  }
}
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
      alerts.push(`\u2022 ${esc(packageLabel(p, ps))}: ${remaining(p, r.date)}`);
  }
  if (s.summary) {
    const checks = ps.filter((p) => group(p, r.date) <= 2);
    if (checks.length)
      alerts.push(
        "\n\u{1F4CB} Da controllare:\n" + checks.slice(0, 15).map(
          (p) => `\u2022 ${esc(packageLabel(p, ps))}: ${remaining(p, r.date)}`
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
var worker_default = {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === "/setup" || path === "/activate") {
      const response = await activation(request, env);
      if (response) return response;
    }
    if (path === "/health" && request.method === "GET")
      return new Response("Frifrigobot online \xB7 versione 1.2.0", {
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
