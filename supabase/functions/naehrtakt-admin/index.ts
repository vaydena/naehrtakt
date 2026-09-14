// Nährtakt – Betreiber-API (Operator). Zugriff auf das unexponierte Schema
// `naehrtakt` ausschließlich hier, als postgres-Owner über SUPABASE_DB_URL
// (direkte pg-Verbindung, NICHT über PostgREST).
//
// Authentifizierung: Header `x-admin-key` -> SHA-256 -> konstantzeitiger
// Vergleich gegen naehrtakt.operator_auth.key_hash (id = 1). Der Klartext-
// Schlüssel liegt NUR lokal beim Betreiber (OPERATOR-KEY.local.txt), nie in
// der DB und nie im Repo.
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

// Konstantzeitiger Hex-Vergleich (verhindert Timing-Seitenkanal beim Login).
function ctEq(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function checkAdmin(req: Request): Promise<boolean> {
  const provided = String(req.headers.get("x-admin-key") || "").trim();
  if (!provided) return false;
  const rows = await sql`select key_hash from naehrtakt.operator_auth where id = 1 limit 1`;
  if (rows.length === 0) return false;
  const want = String(rows[0].key_hash || "");
  const got = await sha256hex(provided);
  return ctEq(got, want);
}

// ---- Schlüsselerzeugung ------------------------------------------------------
// Unmissverständliches Alphabet (kein 0/O/1/I/L/5/S/8/B).
const ALPHABET = "ACDEFGHJKMNPQRTUVWXYZ2346789";
function randChars(n: number): string {
  const out: string[] = [];
  const buf = new Uint8Array(1);
  const max = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  while (out.length < n) {
    crypto.getRandomValues(buf);
    if (buf[0] >= max) continue; // Rejection-Sampling gegen Modulo-Bias
    out.push(ALPHABET[buf[0] % ALPHABET.length]);
  }
  return out.join("");
}
function group(n: number, len: number): string {
  return Array.from({ length: n }, () => randChars(len)).join("-");
}
// Nutzer-Lizenz: NT-XXXXX-XXXXX-XXXXX
function newLicenseKey(): string {
  return "NT-" + group(3, 5);
}
// Betreiber-Schlüssel: NT-BETR-XXXXX-XXXXX-XXXXX-XXXXX
function newOperatorKey(): string {
  return "NT-BETR-" + group(4, 5);
}
async function newUniqueLicenseKey(): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const k = newLicenseKey();
    const hit = await sql`select 1 from naehrtakt.licenses where key = ${k} limit 1`;
    if (hit.length === 0) return k;
  }
  throw new Error("key_generation_failed");
}

// ---- Eingabe-Helfer ----------------------------------------------------------
const str = (v: unknown, max = 500): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};
const uuid = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? s : null;
};
const intIn = (v: unknown, def: number, lo: number, hi: number): number => {
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n)) return def;
  return Math.min(hi, Math.max(lo, n));
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const action = String(body?.action ?? "").trim();

  // Auth für alle Aktionen (login prüft nur den Schlüssel selbst).
  let ok = false;
  try { ok = await checkAdmin(req); } catch { ok = false; }
  if (!ok) return json({ error: "unauthorized" }, 401);

  try {
    switch (action) {
      case "login": return json({ ok: true });
      case "stats": return await stats();
      case "licenses": return await licenses(body);
      case "license_create": return await licenseCreate(body);
      case "license_update": return await licenseUpdate(body);
      case "license_status": return await licenseStatus(body);
      case "license_delete": return await licenseDelete(body);
      case "activations": return await activations(body);
      case "activation_delete": return await activationDelete(body);
      case "orders": return await orders(body);
      case "order_create": return await orderCreate(body);
      case "order_update": return await orderUpdate(body);
      case "messages": return await messages(body);
      case "message_update": return await messageUpdate(body);
      case "message_delete": return await messageDelete(body);
      case "export": return await exportAll();
      case "set_key": return await setKey(body);
      default: return json({ error: "unknown_action" }, 400);
    }
  } catch (e) {
    try { console.error("naehrtakt-admin", action, String((e as Error)?.message || e)); } catch (_e) { /* ignore */ }
    return json({ error: "server_error" }, 500);
  }
});

// ---- Aktionen ----------------------------------------------------------------
async function stats(): Promise<Response> {
  const lic = await sql`
    select
      count(*)::int as total,
      count(*) filter (where status = 'active')::int as active,
      count(*) filter (where status <> 'active')::int as blocked,
      count(*) filter (where first_activated is not null)::int as activated
    from naehrtakt.licenses`;
  const act = await sql`select count(*)::int as total, count(distinct license_id)::int as devices_licenses from naehrtakt.activations`;
  const ord = await sql`
    select
      count(*)::int as total,
      count(*) filter (where status = 'pending')::int as pending,
      count(*) filter (where status = 'paid')::int as paid,
      coalesce(sum(amount) filter (where status = 'paid'), 0)::float as revenue
    from naehrtakt.orders`;
  const msg = await sql`select count(*)::int as total, count(*) filter (where read = false)::int as unread from naehrtakt.messages`;
  const recent = await sql`
    select kind, count(*)::int as n
    from naehrtakt.events
    where created_at > now() - interval '30 days'
    group by kind order by n desc limit 20`;
  return json({
    licenses: lic[0], activations: act[0], orders: ord[0], messages: msg[0],
    events_30d: recent,
  });
}

async function licenses(body: Record<string, unknown>): Promise<Response> {
  const q = str(body.q, 120);
  const status = str(body.status, 20);
  const limit = intIn(body.limit, 100, 1, 500);
  const offset = intIn(body.offset, 0, 0, 1_000_000);
  const like = q ? `%${q}%` : null;

  const rows = await sql`
    select l.id, l.key, l.status, l.name, l.email, l.note, l.order_id,
           l.max_devices, l.activated_count, l.first_activated, l.last_seen,
           l.created_at, l.updated_at,
           (select count(*)::int from naehrtakt.activations a where a.license_id = l.id) as devices
    from naehrtakt.licenses l
    where (${like}::text is null or l.key ilike ${like} or l.name ilike ${like} or l.email ilike ${like})
      and (${status}::text is null or l.status = ${status})
    order by l.created_at desc
    limit ${limit} offset ${offset}`;
  return json({ rows });
}

async function licenseCreate(body: Record<string, unknown>): Promise<Response> {
  const name = str(body.name, 200);
  const email = str(body.email, 200);
  const note = str(body.note, 1000);
  const maxDevices = intIn(body.max_devices, 5, 1, 100);
  const orderId = uuid(body.order_id);
  const key = await newUniqueLicenseKey();

  const rows = await sql`
    insert into naehrtakt.licenses (key, name, email, note, max_devices, order_id)
    values (${key}, ${name}, ${email}, ${note}, ${maxDevices}, ${orderId})
    returning id, key, status, name, email, note, max_devices, created_at`;
  const lic = rows[0];

  // Optional: bestehende Bestellung mit dieser Lizenz verknüpfen + auf bezahlt.
  if (orderId) {
    await sql`update naehrtakt.orders set license_id = ${lic.id}, status = 'paid', updated_at = now() where id = ${orderId}`;
  }
  await sql`insert into naehrtakt.events (kind, license_id, detail) values ('license_create', ${lic.id}, ${sql.json({ by: "operator" })})`;
  return json({ ok: true, license: lic });
}

async function licenseUpdate(body: Record<string, unknown>): Promise<Response> {
  const id = uuid(body.id);
  if (!id) return json({ error: "bad_id" }, 400);
  const name = str(body.name, 200);
  const email = str(body.email, 200);
  const note = str(body.note, 1000);
  const maxDevices = body.max_devices === undefined ? null : intIn(body.max_devices, 5, 1, 100);

  const rows = await sql`
    update naehrtakt.licenses set
      name = coalesce(${name}, name),
      email = coalesce(${email}, email),
      note = coalesce(${note}, note),
      max_devices = coalesce(${maxDevices}::int, max_devices),
      updated_at = now()
    where id = ${id}
    returning id, key, status, name, email, note, max_devices`;
  if (rows.length === 0) return json({ error: "not_found" }, 404);
  return json({ ok: true, license: rows[0] });
}

async function licenseStatus(body: Record<string, unknown>): Promise<Response> {
  const id = uuid(body.id);
  if (!id) return json({ error: "bad_id" }, 400);
  const status = str(body.status, 20);
  if (status !== "active" && status !== "blocked") return json({ error: "bad_status" }, 400);

  const rows = await sql`
    update naehrtakt.licenses set status = ${status}, updated_at = now()
    where id = ${id} returning id, key, status`;
  if (rows.length === 0) return json({ error: "not_found" }, 404);
  await sql`insert into naehrtakt.events (kind, license_id, detail) values (${"license_" + status}, ${id}, ${sql.json({ by: "operator" })})`;
  return json({ ok: true, license: rows[0] });
}

async function licenseDelete(body: Record<string, unknown>): Promise<Response> {
  const id = uuid(body.id);
  if (!id) return json({ error: "bad_id" }, 400);
  // activations -> ON DELETE CASCADE, orders.license_id -> ON DELETE SET NULL.
  // events bleiben als Audit-Spur erhalten (kein FK).
  const rows = await sql`delete from naehrtakt.licenses where id = ${id} returning id, key`;
  if (rows.length === 0) return json({ error: "not_found" }, 404);
  await sql`insert into naehrtakt.events (kind, detail) values ('license_delete', ${sql.json({ key: rows[0].key })})`;
  return json({ ok: true });
}

async function activations(body: Record<string, unknown>): Promise<Response> {
  const licId = uuid(body.license_id);
  const limit = intIn(body.limit, 200, 1, 1000);
  const rows = licId
    ? await sql`
        select id, license_id, device_hash, user_agent, created_at, last_seen
        from naehrtakt.activations where license_id = ${licId}
        order by last_seen desc limit ${limit}`
    : await sql`
        select a.id, a.license_id, a.device_hash, a.user_agent, a.created_at, a.last_seen, l.key
        from naehrtakt.activations a join naehrtakt.licenses l on l.id = a.license_id
        order by a.last_seen desc limit ${limit}`;
  return json({ rows });
}

async function activationDelete(body: Record<string, unknown>): Promise<Response> {
  const id = uuid(body.id);
  if (!id) return json({ error: "bad_id" }, 400);
  const rows = await sql`delete from naehrtakt.activations where id = ${id} returning license_id`;
  if (rows.length === 0) return json({ error: "not_found" }, 404);
  // Zähler der Lizenz aktualisieren.
  await sql`
    update naehrtakt.licenses set
      activated_count = (select count(*) from naehrtakt.activations where license_id = ${rows[0].license_id})
    where id = ${rows[0].license_id}`;
  return json({ ok: true });
}

async function orders(body: Record<string, unknown>): Promise<Response> {
  const status = str(body.status, 20);
  const limit = intIn(body.limit, 200, 1, 1000);
  const offset = intIn(body.offset, 0, 0, 1_000_000);
  const rows = await sql`
    select o.id, o.ref, o.email, o.name, o.amount::float as amount, o.currency, o.method,
           o.status, o.license_id, o.note, o.created_at, o.updated_at,
           l.key as license_key
    from naehrtakt.orders o
    left join naehrtakt.licenses l on l.id = o.license_id
    where (${status}::text is null or o.status = ${status})
    order by o.created_at desc
    limit ${limit} offset ${offset}`;
  return json({ rows });
}

async function orderCreate(body: Record<string, unknown>): Promise<Response> {
  const ref = str(body.ref, 60) || ("NT-" + group(2, 4));
  const email = str(body.email, 200);
  const name = str(body.name, 200);
  const amount = Number.isFinite(Number(body.amount)) ? Number(body.amount) : 29.0;
  const method = str(body.method, 40);
  const note = str(body.note, 1000);
  const rows = await sql`
    insert into naehrtakt.orders (ref, email, name, amount, method, note)
    values (${ref}, ${email}, ${name}, ${amount}, ${method}, ${note})
    returning id, ref, email, name, amount::float as amount, currency, method, status, created_at`;
  return json({ ok: true, order: rows[0] });
}

async function orderUpdate(body: Record<string, unknown>): Promise<Response> {
  const id = uuid(body.id);
  if (!id) return json({ error: "bad_id" }, 400);
  const status = str(body.status, 20);
  const note = str(body.note, 1000);
  const licenseId = body.license_id === undefined ? undefined : uuid(body.license_id);
  const rows = await sql`
    update naehrtakt.orders set
      status = coalesce(${status}, status),
      note = coalesce(${note}, note),
      license_id = ${licenseId === undefined ? sql`license_id` : licenseId},
      updated_at = now()
    where id = ${id}
    returning id, ref, status, license_id`;
  if (rows.length === 0) return json({ error: "not_found" }, 404);
  return json({ ok: true, order: rows[0] });
}

async function messages(body: Record<string, unknown>): Promise<Response> {
  const limit = intIn(body.limit, 100, 1, 500);
  const offset = intIn(body.offset, 0, 0, 1_000_000);
  const onlyUnread = body.unread === true;
  const rows = await sql`
    select id, direction, from_addr, to_addr, subject, body, meta, read, created_at
    from naehrtakt.messages
    where (${onlyUnread} = false or read = false)
    order by created_at desc
    limit ${limit} offset ${offset}`;
  return json({ rows });
}

async function messageUpdate(body: Record<string, unknown>): Promise<Response> {
  const id = uuid(body.id);
  if (!id) return json({ error: "bad_id" }, 400);
  const read = body.read === true;
  const rows = await sql`update naehrtakt.messages set read = ${read} where id = ${id} returning id, read`;
  if (rows.length === 0) return json({ error: "not_found" }, 404);
  return json({ ok: true, message: rows[0] });
}

async function messageDelete(body: Record<string, unknown>): Promise<Response> {
  const id = uuid(body.id);
  if (!id) return json({ error: "bad_id" }, 400);
  const rows = await sql`delete from naehrtakt.messages where id = ${id} returning id`;
  if (rows.length === 0) return json({ error: "not_found" }, 404);
  return json({ ok: true });
}

async function exportAll(): Promise<Response> {
  const licenses = await sql`select * from naehrtakt.licenses order by created_at`;
  const activations = await sql`select * from naehrtakt.activations order by created_at`;
  const orders = await sql`select * from naehrtakt.orders order by created_at`;
  const messages = await sql`select * from naehrtakt.messages order by created_at`;
  const events = await sql`select * from naehrtakt.events order by created_at desc limit 5000`;
  return json({
    exported_at: new Date().toISOString(),
    counts: {
      licenses: licenses.length, activations: activations.length,
      orders: orders.length, messages: messages.length, events: events.length,
    },
    licenses, activations, orders, messages, events,
  });
}

// Betreiber-Schlüssel rotieren. Ohne new_key erzeugt der Server einen neuen
// und gibt ihn GENAU EINMAL im Klartext zurück (Betreiber muss ihn speichern).
async function setKey(body: Record<string, unknown>): Promise<Response> {
  const provided = str(body.new_key, 80);
  const plaintext = provided || newOperatorKey();
  const hash = await sha256hex(plaintext);
  await sql`
    insert into naehrtakt.operator_auth (id, key_hash, updated_at)
    values (1, ${hash}, now())
    on conflict (id) do update set key_hash = excluded.key_hash, updated_at = now()`;
  // Klartext nur zurückgeben, wenn der Server ihn erzeugt hat.
  return json({ ok: true, key: provided ? undefined : plaintext });
}
