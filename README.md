# Nährtakt

**Planer + Nachschlagewerk für Nahrungsergänzungsmittel** — zeigt, in welchen Abständen
man welches Präparat zu sich nehmen darf (Timing/Häufigkeit je Präparat **und** Abstände
zwischen sich störenden Präparaten, z. B. Eisen ↔ Calcium ~2 h).

> ⚕️ **Kein Medizinprodukt.** Nährtakt trifft keine Heil-, Therapie- oder Indikationsaussagen
> und ersetzt keine ärztliche/apothekerliche Beratung. Alle Angaben stammen aus belegten,
> öffentlich zugänglichen Quellen (BfR, EFSA/SCF, DGE, NIH ODS, Verbraucherzentrale) und
> sind Näherungswerte ohne Gewähr. Keine erfundenen klinischen Daten.

- **Live:** https://naehrtakt.vaydena.de
- **Anbieter:** Vaydena – Softwarelösungen (Karl-Heinz Bicker), Freising
- **Monetarisierung:** Einmal-Lizenz `NT-XXXXX-XXXXX-XXXXX` (29 €), Zahlung manuell
  (Banküberweisung mit GiroCode-QR + PayPal), kein Stripe/Karten.

---

## Architektur

Statische **PWA** (offline-fähig via Service Worker, clientseitige JSON-DB) — reines
Vanilla-JS, keine Build-Kette.

```
naehrtakt/
├─ naehrtakt-web/                 ← der ausgelieferte Web-Baum (nur DAS wird deployt)
│  ├─ index.html                  Landing (Funktionen, Preis)
│  ├─ app.html                    Die App (Nachschlagewerk, Tagesplan, Abstands-Prüfung)
│  ├─ freischalten.html           Lizenz-Aktivierung (noindex)
│  ├─ zahlung.html                Bezahlseite (GiroCode/EPC-QR + PayPal)
│  ├─ impressum.html / datenschutz.html
│  ├─ sw.js  manifest.webmanifest deploy-version.txt
│  └─ assets/
│     ├─ app.css site.css         gemeinsame CSS-Tokens (Petrol #0f7268 / Amber #e08a1e)
│     ├─ config.js                window.NT_CONFIG (Preise, Bankdaten, Function-Base-URL)
│     ├─ engine.js                Planer-/Abstands-Logik
│     ├─ license.js               Aktivierung + stille Online-Revalidierung
│     ├─ app.js install.js qrcode-generator.js (vendored, MIT)
│     ├─ data/supplements.json    Präparate-Datenbank  (+ SOURCES.md = Quellenbelege)
│     └─ img/                     Favicon + PWA-Icons
├─ supabase/functions/            Edge Functions (separat via Supabase deployt, NICHT statisch)
│  ├─ naehrtakt-public/           Kauf/Aktivierung/Revalidierung (verify_jwt=false)
│  ├─ naehrtakt-admin/            Betreiber-API (x-admin-key)
│  └─ naehrtakt-mail/             IMAP-Posteingang für den Betreiber-Bereich
├─ tools/gen_icons.py             Icon-Generator
├─ DATA-SCHEMA.md                 DB-Schema-Doku
└─ OPERATOR-KEY.local.txt         ⛔ nur lokal, NIE committen/deployen (gitignored)
```

**Backend:** geteiltes Supabase-Projekt `xeuexovdipdiiuzjpzkj`, isoliertes Schema
`naehrtakt`. Lizenzen als Einmal-Key; nach der Aktivierung offline nutzbar, mit stiller
Online-Revalidierung. Gerätebindung anonym über einen im Browser erzeugten Zufallswert,
der serverseitig nur als **SHA-256-Hash** (`device_hash`) gespeichert wird
(`max_devices`-Begrenzung, keine Personen-/Gerätedaten).

**Betreiber-Schlüssel:** liegt im Klartext **ausschließlich** in
`OPERATOR-KEY.local.txt`; in der DB steht nur sein SHA-256-Hash
(`naehrtakt.operator_auth`). Die Datei ist per `.gitignore` ausgeschlossen.

---

## Lokale Vorschau

```bash
python -m http.server 8814 --directory naehrtakt-web
```

Dann http://localhost:8814 öffnen (Launch-Config `naehrtakt-web-dev` vorhanden).

---

## Deployment → Hostinger (naehrtakt.vaydena.de)

Standardweg: **`git push` auf `main` → GitHub Actions → curl-FTPS** nach `/naehrtakt/`.
Der Web-Baum liegt im Unterordner `naehrtakt-web/`; die Deploy-Schritte laufen deshalb mit
`working-directory: naehrtakt-web` und spiegeln `naehrtakt-web/<pfad>` → `/naehrtakt/<pfad>`.
Alles außerhalb (supabase/, tools/, `*.md`, `*.local.txt`) wird dadurch **nie** mit-deployt.

### Einmaliger User-Schritt: FTP-Passwort als Secret

Der Workflow ist bewusst „grün-aber-übersprungen", solange das Secret fehlt.
Im Repo **Settings → Secrets and variables → Actions → Tab _Secrets_ → New repository secret**:

| Name           | Wert                                                        |
|----------------|------------------------------------------------------------|
| `FTP_PASSWORD` | Passwort des Deploy-FTP-Kontos `u424339903.deploy` (dasselbe wie bei den anderen Vaydena-Projekten) |

⚠️ Als **Secret** anlegen, nicht als Variable. Danach löst jeder Push (oder
_Actions → Deploy zu Hostinger → Run workflow_) den Upload aus. Der Verify-Schritt prüft
live Titel, Dateigrößen und den Marker aus `deploy-version.txt` (aktuell `nt-v1-3e7c`).

- **„530 Login incorrect"** = `FTP_PASSWORD` falsch. **Nicht** wiederholt neu starten —
  Hostingers Brute-Force-Schutz sperrt sonst die Runner-IP (danach curl 28). Secret
  korrigieren, dann **einmal** neu auslösen (andere IP).

### Fallback: lokal deployen

Wenn es sofort live muss oder das Secret noch nicht stimmt:

```powershell
powershell -ExecutionPolicy Bypass -File "deploy-local.ps1"
```

Fragt das Passwort einmal interaktiv ab (landet nie auf Platte/History), lädt gebündelt
per curl-FTPS hoch (Windows-Schannel-Fix `--tlsv1.2 --tls-max 1.2`, plus Ausweichwege),
und verifiziert live. Diagnose in `deploy-local.log` (gitignored, Passwort maskiert).

---

## Supabase-Functions (separat)

Die drei Edge Functions unter `supabase/functions/` werden **nicht** statisch deployt,
sondern über Supabase (alle `verify_jwt=false`, da öffentlicher/anonymer Zugriff bzw.
eigene `x-admin-key`-Prüfung).

**Noch ausstehender User-Schritt** (bis dahin liefert der Posteingang 503):
Für `naehrtakt-mail` die IMAP-/MAIL-Secrets auf der Function setzen
(Zugangsdaten des Postfachs). Erst danach funktioniert der IMAP-Posteingang im
Betreiber-Bereich.

---

## Sicherheits-Leitplanken

- `OPERATOR-KEY.local.txt` / alle `*.local.txt`: **nie** committen/deployen (gitignored).
- `FTP_PASSWORD` ist ein Geheimnis — Wert nie lesen/loggen/echoen.
- Keine erfundenen klinischen Daten; nur belegte Quellen (siehe `assets/data/SOURCES.md`).
- Kein Medizinprodukt — Disclaimer in Impressum, Datenschutz und App.
