// Nährtakt – öffentliche Lizenz-API (Einmal-Lizenz).
// Aktionen: activate, check. Zugriff auf das unexponierte Schema `naehrtakt`
// ausschließlich hier, als postgres-Owner über SUPABASE_DB_URL (direkte pg-
// Verbindung, NICHT über PostgREST). Kein Geheimnis im Client.
import postgres from "npm:postgres@3";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false });

async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Kanonische Schlüsselform NT-XXXXX-XXXXX-XXXXX aus beliebiger Eingabe.
function normKey(raw: unknown): string {
  const core = String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^NT/, "").slice(0, 15);
  const groups = core.match(/.{1,5}/g) || [];
  return ["NT", ...groups].join("-");
}
function coreLen(key: string): number {
  return key.replace(/[^A-Z0-9]/g, "").replace(/^NT/, "").length;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const action = String(body?.action ?? "").trim();
  const ua = String(req.headers.get("user-agent") || "").slice(0, 200);

  try {
    if (action === "activate") return await activate(body, ua);
    if (action === "check") return await check(body);
    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    try { console.error("naehrtakt-public", action, String((e as Error)?.message || e)); } catch (_e) { /* ignore */ }
    return json({ error: "server_error" }, 500);
  }
});

async function activate(body: Record<string, unknown>, ua: string): Promise<Response> {
  const key = normKey(body.key);
  if (coreLen(key) < 15) return json({ valid: false, reason: "Schlüssel ist unvollständig." });
  const device = String(body.device ?? "").replace(/[^a-f0-9]/gi, "").slice(0, 64);
  const deviceHash = device ? await sha256hex(device) : null;

  const rows = await sql`
    select id, status, name, max_devices from naehrtakt.licenses where key = ${key} limit 1`;
  if (rows.length === 0) {
    await sql`insert into naehrtakt.events (kind, detail) values ('activate_unknown', ${sql.json({ ua })})`;
    return json({ valid: false, reason: "Schlüssel nicht gefunden. Bitte prüfe die Eingabe." });
  }
  const lic = rows[0];
  if (lic.status !== "active") {
    await sql`insert into naehrtakt.events (kind, license_id, detail) values ('activate_blocked', ${lic.id}, ${sql.json({ ua })})`;
    return json({ valid: false, reason: "Dieser Schlüssel ist gesperrt." });
  }

  if (deviceHash) {
    const existing = await sql`
      select id from naehrtakt.activations
       where license_id = ${lic.id} and device_hash = ${deviceHash} limit 1`;
    if (existing.length === 0) {
      const cnt = await sql`select count(*)::int as n from naehrtakt.activations where license_id = ${lic.id}`;
      if (cnt[0].n >= lic.max_devices) {
        await sql`insert into naehrtakt.events (kind, license_id, detail)
                  values ('activate_denied_maxdevices', ${lic.id}, ${sql.json({ ua, max: lic.max_devices })})`;
        return json({ valid: false, reason: "Die maximale Geräteanzahl für diesen Schlüssel ist erreicht." });
      }
      await sql`insert into naehrtakt.activations (license_id, device_hash, user_agent)
                values (${lic.id}, ${deviceHash}, ${ua})`;
    } else {
      await sql`update naehrtakt.activations set last_seen = now() where id = ${existing[0].id}`;
    }
  } else {
    // Kein Geräte-Token übermittelt: generische Aktivierung protokollieren.
    await sql`insert into naehrtakt.activations (license_id, user_agent) values (${lic.id}, ${ua})`;
  }

  await sql`
    update naehrtakt.licenses set
      activated_count = (select count(*) from naehrtakt.activations where license_id = ${lic.id}),
      first_activated = coalesce(first_activated, now()),
      last_seen = now()
    where id = ${lic.id}`;
  await sql`insert into naehrtakt.events (kind, license_id, detail) values ('activate', ${lic.id}, ${sql.json({ ua })})`;
  return json({ valid: true, name: lic.name ?? null });
}

async function check(body: Record<string, unknown>): Promise<Response> {
  const key = normKey(body.key);
  if (coreLen(key) < 15) return json({ valid: false, reason: "Schlüssel ist unvollständig." });
  const device = String(body.device ?? "").replace(/[^a-f0-9]/gi, "").slice(0, 64);
  const deviceHash = device ? await sha256hex(device) : null;

  const rows = await sql`select id, status, name from naehrtakt.licenses where key = ${key} limit 1`;
  if (rows.length === 0) return json({ valid: false, reason: "Schlüssel nicht gefunden." });
  const lic = rows[0];
  if (lic.status !== "active") return json({ valid: false, reason: "Dieser Schlüssel ist gesperrt." });

  await sql`update naehrtakt.licenses set last_seen = now() where id = ${lic.id}`;
  if (deviceHash) {
    await sql`update naehrtakt.activations set last_seen = now()
              where license_id = ${lic.id} and device_hash = ${deviceHash}`;
  }
  return json({ valid: true, name: lic.name ?? null });
}
