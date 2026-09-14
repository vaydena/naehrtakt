// naehrtakt-mail — Posteingang des Hostinger-Postfachs fuer den Betreiber-Bereich.
// Auth: identisch zu naehrtakt-admin (x-admin-key, SHA-256 gegen naehrtakt.operator_auth.key_hash).
// IMAP-Zugangsdaten kommen ausschliesslich aus Secrets: MAIL_USER, MAIL_PASSWORD,
// optional MAIL_HOST (Standard imap.hostinger.com) und MAIL_PORT (Standard 993).
// Ohne gesetzte Secrets liefert die Function sauber 503 (mail_not_configured).
import postgres from "npm:postgres@3";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false });

async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

// ---------------------------------------------------------------- Text-Utils
const LATIN1 = new TextDecoder("latin1");
const latin1 = (b: Uint8Array) => LATIN1.decode(b);
const encodeLatin1 = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);

function b64bytes(s: string): Uint8Array {
  const bin = atob(s.replace(/[^A-Za-z0-9+/=]/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  }
  return btoa(s);
}
function qpBytes(s: string, underscoreSpace = false): Uint8Array {
  if (underscoreSpace) s = s.replace(/_/g, " ");
  s = s.replace(/=\r?\n/g, "");
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(s.slice(i + 1, i + 3))) {
      out.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else out.push(s.charCodeAt(i) & 0xff);
  }
  return new Uint8Array(out);
}
function decodeText(bytes: Uint8Array, charset: string): string {
  const cs = (charset || "utf-8").toLowerCase().replace(/^"+|"+$/g, "");
  try { return new TextDecoder(cs).decode(bytes); }
  catch { try { return new TextDecoder("utf-8").decode(bytes); } catch { return latin1(bytes); } }
}
// RFC 2047 encoded words in Kopfzeilen (=?utf-8?B?...?=)
function dec2047(s: string): string {
  s = s.replace(/(=\?[^?]+\?[bq]\?[^?]*\?=)[ \t]+(?==\?)/gi, "$1");
  return s.replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi, (all, cs, enc, data) => {
    try {
      const bytes = enc.toLowerCase() === "b" ? b64bytes(data) : qpBytes(data, true);
      return decodeText(bytes, cs);
    } catch { return all; }
  });
}

// ---------------------------------------------------------------- MIME
function splitHeadBody(raw: Uint8Array): { header: string; body: Uint8Array } {
  for (let i = 0; i + 1 < raw.length; i++) {
    if (raw[i] === 10) {
      if (raw[i + 1] === 10) return { header: latin1(raw.subarray(0, i)), body: raw.subarray(i + 2) };
      if (raw[i + 1] === 13 && raw[i + 2] === 10) return { header: latin1(raw.subarray(0, i)), body: raw.subarray(i + 3) };
    }
  }
  return { header: latin1(raw), body: new Uint8Array(0) };
}
function parseHeaderBlock(headerText: string): Map<string, string> {
  const map = new Map<string, string>();
  const unfolded = headerText.replace(/\r?\n[ \t]+/g, " ");
  for (const line of unfolded.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const name = line.slice(0, idx).trim().toLowerCase();
    if (!map.has(name)) map.set(name, line.slice(idx + 1).trim());
  }
  return map;
}
function getParam(header: string, name: string): string {
  let m = new RegExp(name + "\\*=([^;\\s]+)", "i").exec(header);
  if (m) {
    const v = m[1].replace(/^"|"$/g, "");
    const mm = /^([^']*)'[^']*'(.*)$/.exec(v);
    if (mm) { try { return decodeURIComponent(mm[2]); } catch { return mm[2]; } }
  }
  m = new RegExp(name + '\\s*=\\s*"([^"]*)"', "i").exec(header);
  if (m) return m[1];
  m = new RegExp(name + "\\s*=\\s*([^;\\s]+)", "i").exec(header);
  return m ? m[1] : "";
}
function decodeTransfer(body: Uint8Array, cte: string): Uint8Array {
  if (cte === "base64") { try { return b64bytes(latin1(body)); } catch { return body; } }
  if (cte === "quoted-printable") return qpBytes(latin1(body));
  return body;
}
function splitMultipart(bodyStr: string, boundary: string): string[] {
  const parts: string[] = [];
  const delim = "--" + boundary;
  let cur: string[] | null = null;
  for (const ln of bodyStr.split(/\r?\n/)) {
    const isDelim = ln.startsWith(delim) && ["", "--"].includes(ln.slice(delim.length).trim());
    if (isDelim) {
      if (cur) parts.push(cur.join("\r\n"));
      cur = ln.slice(delim.length).trim() === "--" ? null : [];
    } else if (cur) cur.push(ln);
  }
  if (cur && cur.length) parts.push(cur.join("\r\n"));
  return parts;
}

interface Part { mime: string; data: Uint8Array; filename: string; charset: string; cid: string; attachment: boolean; }

function walkPart(raw: Uint8Array, depth: number, out: Part[]): void {
  const { header, body } = splitHeadBody(raw);
  const h = parseHeaderBlock(header);
  const ct = h.get("content-type") ?? "text/plain";
  const mime = ((ct.split(";")[0] || "").trim().toLowerCase()) || "text/plain";
  if (mime.startsWith("multipart/") && depth < 8) {
    const boundary = getParam(ct, "boundary");
    if (boundary) {
      for (const p of splitMultipart(latin1(body), boundary)) walkPart(encodeLatin1(p), depth + 1, out);
      return;
    }
  }
  const cte = (h.get("content-transfer-encoding") ?? "").trim().toLowerCase();
  const disp = h.get("content-disposition") ?? "";
  const filename = dec2047(getParam(disp, "filename") || getParam(ct, "name") || "").trim();
  const cid = (h.get("content-id") ?? "").trim().replace(/^<|>$/g, "");
  out.push({
    mime,
    data: decodeTransfer(body, cte),
    filename,
    charset: getParam(ct, "charset") || "utf-8",
    cid,
    attachment: /^\s*attachment/i.test(disp) || !mime.startsWith("text/"),
  });
}

function parseAddr(s: string): { name: string; addr: string } {
  const m = /<([^>]+)>/.exec(s);
  if (m) return { name: s.replace(m[0], "").trim().replace(/^"|"$/g, "").trim(), addr: m[1].trim() };
  return { name: "", addr: s.trim() };
}
function parseMailDate(dateHdr: string, internal: string): string | null {
  let t = Date.parse((dateHdr || "").replace(/\([^)]*\)\s*$/, "").trim());
  if (isNaN(t) && internal) {
    t = Date.parse(internal.replace(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})/, "$1 $2 $3"));
  }
  return isNaN(t) ? null : new Date(t).toISOString();
}
function fallbackName(i: number, mime: string): string {
  const ext: Record<string, string> = {
    "application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif",
    "message/rfc822": ".eml", "text/calendar": ".ics",
  };
  return "anhang-" + (i + 1) + (ext[mime] ?? ".bin");
}

function parseMessage(raw: Uint8Array) {
  const { header } = splitHeadBody(raw);
  const h = parseHeaderBlock(header);
  const parts: Part[] = [];
  walkPart(raw, 0, parts);
  let text = "", html = "";
  for (const p of parts) {
    if (!p.attachment && p.mime === "text/plain" && !text) text = decodeText(p.data, p.charset);
    else if (!p.attachment && p.mime === "text/html" && !html) html = decodeText(p.data, p.charset);
  }
  const atts = parts.filter((p) => p.attachment);
  const used = new Set<Part>();
  if (html) {
    let budget = 2_000_000; // eingebettete cid-Bilder klein halten
    for (const p of atts) {
      if (p.cid && p.mime.startsWith("image/") && p.data.length <= 500_000 && budget > 0 && html.includes("cid:" + p.cid)) {
        html = html.split("cid:" + p.cid).join("data:" + p.mime + ";base64," + toB64(p.data));
        budget -= p.data.length;
        used.add(p);
      }
    }
  }
  const rest = atts.filter((p) => !used.has(p));
  const from = parseAddr(dec2047(h.get("from") ?? ""));
  return {
    headers: {
      from: from.name || from.addr,
      fromAddr: from.addr,
      to: dec2047(h.get("to") ?? ""),
      subject: dec2047(h.get("subject") ?? "").trim(),
      date: parseMailDate(h.get("date") ?? "", ""),
    },
    text,
    html,
    attachments: rest.map((p, i) => ({ index: i, filename: p.filename || fallbackName(i, p.mime), mime: p.mime, size: p.data.length })),
    attParts: rest,
  };
}

// ---------------------------------------------------------------- IMAP-Client
interface ImapLine { text: string; literals: Uint8Array[] }

class Imap {
  private conn: Deno.TlsConn;
  private buf = new Uint8Array(0);
  private off = 0;
  private tag = 0;
  private constructor(conn: Deno.TlsConn) { this.conn = conn; }

  static async connect(host: string, port: number): Promise<Imap> {
    const conn = await Deno.connectTls({ hostname: host, port });
    const im = new Imap(conn);
    await im.readLine(); // Begruessung "* OK ..."
    return im;
  }

  close(): void { try { this.conn.close(); } catch { /* schon zu */ } }

  private async fill(): Promise<void> {
    const chunk = new Uint8Array(65536);
    const n = await this.conn.read(chunk);
    if (n === null) throw new Error("imap_closed");
    const rest = this.buf.subarray(this.off);
    const nb = new Uint8Array(rest.length + n);
    nb.set(rest);
    nb.set(chunk.subarray(0, n), rest.length);
    this.buf = nb;
    this.off = 0;
  }
  private async readLine(): Promise<string> {
    for (;;) {
      const idx = this.buf.indexOf(10, this.off);
      if (idx >= 0) {
        let end = idx;
        if (end > this.off && this.buf[end - 1] === 13) end--;
        const line = latin1(this.buf.subarray(this.off, end));
        this.off = idx + 1;
        return line;
      }
      await this.fill();
    }
  }
  private async readN(n: number): Promise<Uint8Array> {
    const out = new Uint8Array(n);
    const avail = this.buf.length - this.off;
    const take = Math.min(avail, n);
    out.set(this.buf.subarray(this.off, this.off + take));
    this.off += take;
    let got = take;
    while (got < n) {
      const chunk = new Uint8Array(Math.min(65536, n - got));
      const r = await this.conn.read(chunk);
      if (r === null) throw new Error("imap_closed");
      out.set(chunk.subarray(0, r), got);
      got += r;
    }
    return out;
  }
  private async write(s: string): Promise<void> {
    const data = new TextEncoder().encode(s);
    let w = 0;
    while (w < data.length) w += await this.conn.write(data.subarray(w));
  }

  async cmd(command: string): Promise<{ ok: boolean; lines: ImapLine[]; tagLine: string }> {
    const t = "A" + (++this.tag);
    await this.write(t + " " + command + "\r\n");
    const lines: ImapLine[] = [];
    for (;;) {
      let text = await this.readLine();
      if (text.startsWith(t + " ")) {
        return { ok: /^OK/i.test(text.slice(t.length + 1)), lines, tagLine: text };
      }
      const literals: Uint8Array[] = [];
      let m: RegExpExecArray | null;
      while ((m = /\{(\d+)\}$/.exec(text)) !== null) {
        const lit = await this.readN(parseInt(m[1]));
        literals.push(lit);
        const cont = await this.readLine();
        text = text.slice(0, m.index) + "<LIT" + (literals.length - 1) + ">" + cont;
      }
      lines.push({ text, literals });
    }
  }

  async login(user: string, pass: string): Promise<void> {
    const t = "A" + (++this.tag);
    await this.write(t + " AUTHENTICATE PLAIN\r\n");
    let line = await this.readLine();
    if (line.startsWith("+")) {
      const creds = new TextEncoder().encode("\0" + user + "\0" + pass);
      await this.write(toB64(creds) + "\r\n");
      line = await this.readLine();
    }
    while (line.startsWith("*")) line = await this.readLine();
    if (new RegExp("^" + t + " OK", "i").test(line)) return;
    // Rueckfall: klassisches LOGIN mit Anfuehrungszeichen
    if (/[\r\n\x00]/.test(user + pass)) throw new Error("imap_auth_failed");
    const q = (s: string) => '"' + s.replace(/([\\"])/g, "\\$1") + '"';
    const r = await this.cmd("LOGIN " + q(user) + " " + q(pass));
    if (!r.ok) throw new Error("imap_auth_failed");
  }

  async selectInbox(): Promise<number> {
    const r = await this.cmd("SELECT INBOX");
    if (!r.ok) throw new Error("imap_select_failed");
    for (const ln of r.lines) {
      const m = /^\* (\d+) EXISTS/i.exec(ln.text);
      if (m) return parseInt(m[1]);
    }
    return 0;
  }

  // Mailbox-Name fuer COPY/MOVE sicher quoten (Sonderzeichen/Leerzeichen).
  quoteMailbox(name: string): string {
    return '"' + name.replace(/([\\"])/g, "\\$1") + '"';
  }

  // Papierkorb-Ordner ermitteln: zuerst per SPECIAL-USE-Attribut \Trash,
  // sonst per Namensheuristik. Leerer String = kein Papierkorb gefunden.
  async findTrash(): Promise<string> {
    let r;
    try { r = await this.cmd('LIST "" "*"'); } catch { return ""; }
    const boxes: { attrs: string; name: string }[] = [];
    for (const ln of r.lines) {
      const m = /^\* LIST \(([^)]*)\) (?:"[^"]*"|NIL) (?:"((?:[^"\\]|\\.)*)"|(\S+))/i.exec(ln.text);
      if (!m) continue;
      const attrs = m[1] || "";
      const name = m[2] !== undefined ? m[2].replace(/\\(.)/g, "$1") : (m[3] ?? "");
      if (name) boxes.push({ attrs, name });
    }
    for (const b of boxes) if (/\\Trash\b/i.test(b.attrs)) return b.name;
    const rx = /(^|[.\/])(Trash|Papierkorb|Deleted Items|Deleted Messages|Gel(?:ö|oe)schte)([.\/ ]|$)/i;
    for (const b of boxes) if (rx.test(b.name)) return b.name;
    return "";
  }

  async logout(): Promise<void> {
    try { await this.cmd("LOGOUT"); } catch { /* egal */ }
  }
}

// Timeout-Wrapper: raeumt den Timer auf und laesst spaete Ablehnungen des
// Original-Promises nie zu einer unbehandelten Rejection werden (wuerde sonst
// den Worker beenden, bevor die Antwort geloggt ist).
function withTimeout<T>(p: Promise<T>, ms: number, err = "imap_timeout"): Promise<T> {
  p.catch(() => { /* spaete Ablehnung bewusst geschluckt */ });
  let h = 0;
  const timer = new Promise<never>((_, rej) => { h = setTimeout(() => rej(new Error(err)), ms); });
  return Promise.race([p, timer]).finally(() => clearTimeout(h)) as Promise<T>;
}

async function withImap<T>(fn: (im: Imap) => Promise<T>): Promise<T> {
  const host = Deno.env.get("MAIL_HOST") || "imap.hostinger.com";
  const port = parseInt(Deno.env.get("MAIL_PORT") || "993");
  const user = Deno.env.get("MAIL_USER") || "";
  const pass = Deno.env.get("MAIL_PASSWORD") || "";
  if (!user || !pass) throw new Error("mail_not_configured");
  let im: Imap | null = null;
  try {
    const connecting = Imap.connect(host, port);
    const t0 = Date.now();
    try {
      im = await withTimeout(connecting, 8000, "imap_connect_failed");
    } catch (e) {
      // Falls der Connect spaeter doch noch durchkommt: Verbindung schliessen.
      connecting.then((c) => c.close()).catch(() => { /* egal */ });
      console.error("mail: Verbindung zu", host + ":" + port, "fehlgeschlagen nach", Date.now() - t0, "ms:", e instanceof Error ? e.message : String(e));
      throw new Error("imap_connect_failed");
    }
    console.log("mail: verbunden mit", host + ":" + port, "nach", Date.now() - t0, "ms");
    await im.login(user, pass);
    const out = await fn(im);
    await im.logout();
    return out;
  } finally {
    im?.close();
  }
}

async function fetchRawMail(im: Imap, uid: string): Promise<Uint8Array> {
  const sz = await im.cmd("UID FETCH " + uid + " (RFC822.SIZE)");
  let size = -1;
  for (const ln of sz.lines) {
    if (new RegExp("UID " + uid + "\\b").test(ln.text)) {
      const m = /RFC822\.SIZE (\d+)/i.exec(ln.text);
      if (m) size = parseInt(m[1]);
    }
  }
  if (size < 0) throw new Error("not_found");
  if (size > 15_000_000) throw new Error("mail_too_large");
  const r = await im.cmd("UID FETCH " + uid + " (BODY.PEEK[])");
  for (const ln of r.lines) {
    if (/ FETCH /i.test(ln.text) && ln.literals.length) return ln.literals[ln.literals.length - 1];
  }
  throw new Error("not_found");
}

// ---------------------------------------------------------------- Handler
const KNOWN = new Map<string, number>([
  ["mail_not_configured", 503], ["imap_connect_failed", 502], ["imap_auth_failed", 502],
  ["imap_select_failed", 502], ["imap_timeout", 504], ["imap_closed", 502],
  ["mail_too_large", 413], ["attachment_too_large", 413], ["not_found", 404],
  ["bad_uid", 400], ["bad_index", 400], ["delete_failed", 502],
]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const key = req.headers.get("x-admin-key") ?? "";
  if (!key) return json({ error: "unauthorized" }, 401);
  let hash: string;
  try { hash = await sha256hex(key); } catch { return json({ error: "server_error" }, 500); }
  try {
    const auth = await sql`select key_hash from naehrtakt.operator_auth where id = 1 limit 1`;
    if (auth.length === 0 || !safeEqual(String(auth[0].key_hash), hash)) {
      return json({ error: "unauthorized" }, 401);
    }
  } catch { return json({ error: "server_error" }, 500); }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const action = String(body?.action ?? "").trim();

  try {
    if (action === "list") {
      const mails = await withTimeout(withImap(async (im) => {
        const exists = await im.selectInbox();
        if (!exists) return [];
        const start = Math.max(1, exists - 49);
        const r = await im.cmd("FETCH " + start + ":* (UID FLAGS INTERNALDATE RFC822.SIZE BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)])");
        const out: unknown[] = [];
        for (const ln of r.lines) {
          if (!/^\* \d+ FETCH/i.test(ln.text)) continue;
          const uid = /UID (\d+)/i.exec(ln.text)?.[1];
          if (!uid) continue;
          const flags = /FLAGS \(([^)]*)\)/i.exec(ln.text)?.[1] ?? "";
          if (/\\Deleted/i.test(flags)) continue;
          const internal = /INTERNALDATE "([^"]*)"/i.exec(ln.text)?.[1] ?? "";
          const size = parseInt(/RFC822\.SIZE (\d+)/i.exec(ln.text)?.[1] ?? "0");
          const h = parseHeaderBlock(ln.literals[0] ? latin1(ln.literals[0]) : "");
          const from = parseAddr(dec2047(h.get("from") ?? ""));
          out.push({
            uid: parseInt(uid),
            seen: /\\Seen/i.test(flags),
            size,
            from: from.name || from.addr,
            fromAddr: from.addr,
            subject: dec2047(h.get("subject") ?? "").trim() || "(kein Betreff)",
            date: parseMailDate(h.get("date") ?? "", internal),
          });
        }
        (out as { uid: number }[]).sort((a, b) => b.uid - a.uid);
        return out;
      }), 25000);
      console.log("mail: list ok –", (mails as unknown[]).length, "Mails");
      return json({ ok: true, mails, mailbox: Deno.env.get("MAIL_USER") || "" });
    }

    if (action === "get") {
      const uid = String(body?.uid ?? "").trim();
      if (!/^\d{1,12}$/.test(uid)) return json({ error: "bad_uid" }, 400);
      const msg = await withTimeout(withImap(async (im) => {
        await im.selectInbox();
        const raw = await fetchRawMail(im, uid);
        try { await im.cmd("UID STORE " + uid + " +FLAGS.SILENT (\\Seen)"); } catch { /* egal */ }
        return parseMessage(raw);
      }), 40000);
      console.log("mail: get ok – uid", uid);
      return json({ ok: true, headers: msg.headers, text: msg.text, html: msg.html, attachments: msg.attachments });
    }

    if (action === "attachment") {
      const uid = String(body?.uid ?? "").trim();
      if (!/^\d{1,12}$/.test(uid)) return json({ error: "bad_uid" }, 400);
      const index = Number(body?.index);
      if (!Number.isInteger(index) || index < 0 || index > 200) return json({ error: "bad_index" }, 400);
      const att = await withTimeout(withImap(async (im) => {
        await im.selectInbox();
        const raw = await fetchRawMail(im, uid);
        const msg = parseMessage(raw);
        const p = msg.attParts[index];
        if (!p) throw new Error("not_found");
        if (p.data.length > 10_000_000) throw new Error("attachment_too_large");
        return { filename: p.filename || fallbackName(index, p.mime), mime: p.mime, b64: toB64(p.data) };
      }), 40000);
      console.log("mail: attachment ok – uid", uid, "index", index);
      return json({ ok: true, ...att });
    }

    // E-Mail loeschen: bevorzugt in den Papierkorb verschieben (wiederherstellbar),
    // sonst endgueltig entfernen. Der Client schickt nur die validierte UID.
    if (action === "delete") {
      const uid = String(body?.uid ?? "").trim();
      if (!/^\d{1,12}$/.test(uid)) return json({ error: "bad_uid" }, 400);
      const res = await withTimeout(withImap(async (im) => {
        await im.selectInbox();
        // Existenz pruefen, sonst not_found (verhindert stilles Fehlschlagen).
        const chk = await im.cmd("UID FETCH " + uid + " (UID)");
        let found = false;
        for (const ln of chk.lines) {
          if (/^\* \d+ FETCH/i.test(ln.text) && new RegExp("UID " + uid + "\\b").test(ln.text)) { found = true; break; }
        }
        if (!found) throw new Error("not_found");

        const trash = await im.findTrash();
        let movedToTrash = false;

        if (trash && !/^INBOX$/i.test(trash)) {
          const qbox = im.quoteMailbox(trash);
          // 1) UID MOVE (RFC 6851) – atomar, expunged das Original selbst.
          const mv = await im.cmd("UID MOVE " + uid + " " + qbox);
          if (mv.ok) {
            movedToTrash = true;
          } else {
            // 2) Rueckfall: in den Papierkorb kopieren, dann Original loeschen.
            const cp = await im.cmd("UID COPY " + uid + " " + qbox);
            movedToTrash = cp.ok;
            const st = await im.cmd("UID STORE " + uid + " +FLAGS (\\Deleted)");
            if (!st.ok) throw new Error("delete_failed");
            const ex = await im.cmd("UID EXPUNGE " + uid);
            if (!ex.ok) await im.cmd("EXPUNGE");
          }
        } else {
          // Kein Papierkorb vorhanden: endgueltig loeschen.
          const st = await im.cmd("UID STORE " + uid + " +FLAGS (\\Deleted)");
          if (!st.ok) throw new Error("delete_failed");
          const ex = await im.cmd("UID EXPUNGE " + uid);
          if (!ex.ok) await im.cmd("EXPUNGE");
        }
        return { movedToTrash };
      }), 30000);
      console.log("mail: delete ok – uid", uid, res.movedToTrash ? "→ Papierkorb" : "(endgueltig)");
      return json({ ok: true, movedToTrash: res.movedToTrash });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    console.error("mail: Aktion", action || "(leer)", "fehlgeschlagen:", msg || String(e));
    if (KNOWN.has(msg)) return json({ error: msg }, KNOWN.get(msg));
    return json({ error: "server_error" }, 500);
  }
});
