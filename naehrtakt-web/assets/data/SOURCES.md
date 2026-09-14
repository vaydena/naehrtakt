# Nährtakt – Quellen- und Lückendokumentation zu `supplements.json`

Stand: 2026-09-14 · Version 1 · 35 Supplements · 12 Interaktions-Paare

Alle numerischen Werte (Höchstmenge/Upper Level) wurden an der jeweiligen Primärquelle
geprüft (Volltext-Abruf der BfR- und EFSA-PDF-Tabellen, nicht aus dem Gedächtnis).
Nicht seriös belegbare Werte stehen in der JSON auf `null` mit Begründung im `note`-Feld –
es wurde nichts geschätzt oder interpoliert.

## Verwendete Quellen (entspricht `meta.sources`)

| Kürzel | Quelle | URL | Stand |
|---|---|---|---|
| BfR-2021 | BfR – Höchstmengenempfehlungen für Vitamine und Mineralstoffe in Nahrungsergänzungsmitteln (konsolidierte Tabelle; Werte aus 2021, 2023, 2024) | https://www.bfr.bund.de/cm/343/hoechstmengenempfehlungen-des-bfr.pdf | Feb. 2025 |
| BfR-2021 (Presse) | BfR-Höchstmengenvorschläge 2021 (Pressemitteilung) | https://www.bfr.bund.de/de/presseinformation/2021/11/hoechstmengen_fuer_vitamine_und_mineralstoffe_in_nahrungsergaenzungsmitteln_und_angereicherten_lebensmitteln-269582.html | 2021 |
| EFSA-UL | EFSA/SCF – Overview on Tolerable Upper Intake Levels (Summary Tables, Version 11) | https://www.efsa.europa.eu/sites/default/files/2023-11/ul_summary_tables-version-8.pdf | Aug. 2025 |
| EFSA-Omega3-2012 | EFSA NDA Panel – Tolerable Upper Intake Level of EPA, DHA and DPA | https://doi.org/10.2903/j.efsa.2012.2815 | 2012 |
| EFSA-Curcumin-2010 | EFSA ANS Panel – Re-evaluation of curcumin (E 100) | https://doi.org/10.2903/j.efsa.2010.1679 | 2010 |
| DGE | DGE – Referenzwerte für die Nährstoffzufuhr | https://www.dge.de/wissenschaft/referenzwerte/ | 2024 |
| NIH-ODS | NIH Office of Dietary Supplements – Fact Sheets | https://ods.od.nih.gov/factsheets/list-all/ | 2024 |
| NIH-ODS (Vitamin C) | NIH ODS – Vitamin C Fact Sheet (UL 2000 mg) | https://ods.od.nih.gov/factsheets/VitaminC-HealthProfessional/ | 2021 |
| VZ | Verbraucherzentrale – Nahrungsergänzungsmittel | https://www.verbraucherzentrale.de/wissen/lebensmittel/nahrungsergaenzungsmittel | 2025 |
| VZ (Eisen) | Verbraucherzentrale – Eisen richtig einnehmen | https://www.verbraucherzentrale.de/wissen/lebensmittel/nahrungsergaenzungsmittel/eisen-qualitaet-nicht-quantitaet-ist-die-frage-8026 | 2025 |
| VZ (Melatonin) | Verbraucherzentrale – Melatonin zum Einschlafen | https://www.verbraucherzentrale.de/wissen/lebensmittel/melatonin-zum-einschlafen-wie-sinnvoll-sind-produkte-wie-sprays-118307 | 2024 |
| BfArM-Melatonin | BfR/BfArM – Melatonin als Arzneimittel zulassungspflichtig | https://www.bfr.bund.de/veroeffentlichung/melatonin-als-arzneimittel-zulassungspflichtig-empfehlung-der-bundesinstitute-erfolgt-dosisunabhaengig/ | 2023 |

Hinweis: Die BfR-„2021"-Tabelle ist die aktuell veröffentlichte konsolidierte Fassung; einzelne
Nährstoffe wurden darin 2023 (Vitamin D, Vitamin B6, Selen) bzw. 2024 (Folsäure) aktualisiert.
Das jeweilige Jahr steht im `note`-Feld des Werts.

## Wert-Herkunft je Supplement (nur belegte Zahlen)

| Supplement | BfR (NEM/Tag) | Jahr | EFSA/UL (Erwachsene) | Quelle UL |
|---|---|---|---|---|
| Vitamin A | 200 µg (0,2 mg) | 2021 | 3000 µg RE | EFSA 2024 |
| Beta-Carotin | 3,5 mg | 2021 | kein UL | EFSA 2024 |
| Vitamin D | 20 µg | 2023 | 100 µg | EFSA 2018/2023 |
| Vitamin E | 30 mg | 2021 | 300 mg (α-Tocopherol) | SCF 2003 |
| Vitamin K2 | 25 µg | 2021 | kein UL | SCF 2003 |
| Vitamin C | 250 mg | 2021 | 2000 mg (US-UL) | NIH-ODS |
| Vitamin B1 | keine HM | 2021 | kein UL | SCF 2001 |
| Vitamin B2 | keine HM | 2021 | kein UL | SCF 2000 |
| Vitamin B3 (Niacin) | Nikotinamid 160 mg / Nikotinsäure 4,0 mg | 2021 | Nikotinamid 900 mg / Nikotinsäure 10 mg | SCF 2002 |
| Vitamin B5 | keine HM | 2021 | kein UL | SCF 2002 |
| Vitamin B6 | 0,9 mg | 2023 | 12 mg | EFSA 2023 |
| Vitamin B7 (Biotin) | keine HM | 2021 | kein UL | SCF 2001 |
| Vitamin B9 (Folsäure) | 200 µg (400 µg Kinderwunsch) | 2024 | 1000 µg | EFSA 2023 |
| Vitamin B12 | 25 µg | 2021 | kein UL | SCF 2000 |
| Calcium | 500 mg | 2021 | 2500 mg | EFSA 2012 |
| Magnesium | 250 mg | 2021 | 250 mg (nur supplementäres Mg) | SCF 2001 |
| Kalium | 500 mg | 2021 | kein UL | EFSA 2005 |
| Eisen | 6 mg | 2021 | 40 mg (safe level, kein UL) | EFSA 2024 |
| Zink | 6,5 mg | 2021 | 25 mg | SCF 2002 |
| Kupfer | 1 mg | 2021 | 5 mg | SCF 2003 |
| Selen | 40 µg | 2023 | 255 µg | EFSA 2023 |
| Jod | 100 µg (150 µg Schwangere/Stillende) | 2021 | 600 µg | SCF 2003 |
| Mangan | 0,5 mg | 2021 | 8 mg (safe level, kein UL) | EFSA 2023 |
| Chrom | 60 µg | 2021 | kein UL (Cr III) | SCF 2003 |
| Omega-3 (EPA/DHA) | keine | – | 5 g/Tag EPA+DHA ohne Sicherheitsbedenken (kein UL) | EFSA 2012 |
| Curcumin | keine | – | ADI 3 mg/kg KG/Tag (kein UL) | EFSA 2010 |
| Ballaststoffe (Flohsamen) | keine | – | ≥30 g/Tag Richtwert (kein UL) | DGE |

Timing-/Einnahmehinweise (`timing.note`) stützen sich auf Verbraucherzentrale (VZ) und NIH ODS,
die fettlöslich/wasserlöslich-Logik auf die Nährstoff-Klassifikation der BfR/EFSA-Quellen.

## Sicherheitsrelevante Werte – Prüfvermerk

Die vom Auftrag besonders markierten Werte wurden direkt in den amtlichen Tabellen gegengelesen
und sind **belegt und aktuell**:

- **Vitamin A**: BfR-NEM 0,2 mg / EFSA-UL 3000 µg RE (vorgebildetes Retinol). Schwangerschaft: nur nach ärztl. Rücksprache (BfR).
- **Vitamin D**: BfR-NEM 20 µg (2023) / EFSA-UL 100 µg. Bestätigt.
- **Niacin (B3)**: Zwei Formen mit stark unterschiedlichen Grenzen – Nikotinamid (BfR 160 mg / EFSA-UL 900 mg) vs. Nikotinsäure (BfR 4,0 mg / EFSA-UL 10 mg). Beide in JSON abgebildet.
- **Vitamin B6**: BfR **0,9 mg** (2023, zuvor 3,5 mg) / EFSA-UL **12 mg** (2023, zuvor 25 mg). Aktuelle, abgesenkte Werte verwendet.
- **Zink**: BfR 6,5 mg / EFSA-UL 25 mg. Bestätigt.
- **Selen**: BfR **40 µg** (2023, zuvor 45 µg) / EFSA-UL **255 µg** (2023, zuvor 300 µg). Aktuelle Werte verwendet.
- **Jod**: BfR 100 µg / EFSA-UL 600 µg. Bestätigt.
- **Eisen**: BfR 6 mg / EFSA **kein UL**, safe level 40 mg (2024). Beide korrekt gekennzeichnet.

Es bestand bei keinem dieser Werte Unsicherheit; alle stammen aus den abgerufenen Volltext-Tabellen
(BfR-Höchstmengentabelle, EFSA UL Summary Version 11).

## Lücken – bewusst auf `null` gesetzte Werte

### Keine BfR-Höchstmenge (`limits.bfr.value = null`) – 15 Einträge

**BfR hat explizit KEINE Höchstmenge festgelegt** (Stellungnahme 2021, „Keine Höchstmengen"):
- Vitamin B1 (Thiamin)
- Vitamin B2 (Riboflavin)
- Vitamin B5 (Pantothensäure)
- Vitamin B7 (Biotin)

**Von der BfR nicht adressiert / kein NEM-Höchstmengenvorschlag vorhanden:**
- Omega-3 (EPA/DHA)
- Coenzym Q10
- Kreatin
- L-Arginin
- L-Carnitin
- Probiotika
- Ballaststoffe (Flohsamen)
- Melatonin (VZ: für Melatonin-NEM gibt es keine festgelegten Höchstmengen; Rechtsstatus uneinheitlich)
- Kollagen
- Curcumin (keine spezifische BfR-NEM-Höchstmenge)
- Vitamin-B-Komplex (Kombipräparat – es gelten die Einzelwerte der B-Vitamine)

### Kein EFSA/SCF-UL (`limits.ul.value = null`) – 19 Einträge

**EFSA/SCF: „No adequate data to derive a UL" bzw. keine definierten Schadwirkungen:**
- Beta-Carotin (kein UL; Raucher-Warnhinweis)
- Vitamin K2 (kein UL, SCF 2003)
- Vitamin B1 (SCF 2001)
- Vitamin B2 (SCF 2000)
- Vitamin B5 (SCF 2002)
- Vitamin B7 / Biotin (SCF 2001)
- Vitamin B12 (SCF 2000: keine definierten Schadwirkungen)
- Kalium (EFSA 2005)
- Chrom / Cr III (SCF 2003)

**Kein UL und keine andere amtliche EU-Höchstmenge belegbar:**
- Coenzym Q10
- Kreatin (kein UL; übliche Dosis ~3 g/Tag nur als Kontext im `note`, nicht als Grenzwert)
- L-Arginin
- L-Carnitin
- Probiotika
- Kollagen
- Vitamin-B-Komplex (Sammelpräparat – Einzelwerte maßgeblich)

**`null` als Grenzwert, aber belegter Kontextwert im `note`-Feld hinterlegt:**
- Ballaststoffe (Flohsamen): DGE-Richtwert ≥30 g/Tag (Mindest-, keine Höchstmenge)
- Curcumin: EFSA-ADI 3 mg/kg KG/Tag (Additiv E 100; kein NEM-UL)
- Melatonin: bewusst KEINE Dosis-/Höchstangabe wegen uneinheitlichem Rechtsstatus (NEM ≤ ~0,5–1 mg oft toleriert, ab ~0,5 mg/Tag häufig als Arzneimittel eingestuft; EU-Health-Claim nur bei 1 mg/Portion)

### Sonderfall Omega-3
`limits.ul.value = 5000 mg` ist KEIN UL, sondern der von der EFSA (2012) genannte „safe level"
für ergänzendes EPA+DHA (bis 5 g/Tag). Analog gekennzeichnet wie die EFSA-„safe levels" bei
Eisen (40 mg) und Mangan (8 mg). Jeweils im `note`-Feld ausdrücklich als safe level / kein UL benannt.

## Interaktions-Paare – Quellen

| Paar | Art | Abstand | Quelle |
|---|---|---|---|
| Eisen ↔ Calcium | Hemmung | 2 h (VZ: 2–3 h) | VZ |
| Eisen ↔ Zink | Konkurrenz | 2 h | NIH-ODS |
| Zink ↔ Kupfer | Hemmung | – | NIH-ODS |
| Calcium ↔ Magnesium | Hinweis | – | VZ |
| Calcium ↔ Zink | Hemmung | 2 h | NIH-ODS |
| Vitamin C → Eisen | Synergie | zusammen | NIH-ODS |
| Vitamin E ↔ Vitamin K2 | Hinweis | – | NIH-ODS |
| Folsäure ↔ Vitamin B12 | Hinweis | – | NIH-ODS |
| Vitamin D → Calcium | Synergie | – | NIH-ODS |
| Vitamin D → Magnesium | Synergie | – | NIH-ODS |
| Vitamin D ↔ Vitamin K2 | Hinweis | – | VZ |
| Vitamin-B-Komplex ↔ Magnesium | Hinweis (Timing) | – | VZ |

`spacingHours` gibt einen praktischen Mindestabstand als Verbraucherhinweis wieder (für Eisen↔Calcium
durch die VZ mit 2–3 h belegt); bei reinen Timing-/Synergie-/Dauer-Hinweisen steht `null`.
