# Nährtakt – Datenschema `assets/data/supplements.json`

Verbindliche Regeln für die Datenbasis:

- **Keine erfundenen Werte.** Jede Zahl (Obergrenze, Referenzwert) braucht eine belegte Quelle.
  Quellen-Hierarchie: **BfR** (Höchstmengenempfehlungen für NEM, 2021) → **EFSA** (Tolerable Upper Intake Levels) →
  **DGE** (Referenzwerte) → **NIH ODS** (Fact Sheets). Für Verbraucher-Timing-Hinweise zusätzlich Verbraucherzentrale.
- Ist ein Wert nicht belegbar, steht `null` + ein Hinweis im `note`-Feld – **niemals** eine geschätzte Zahl.
- Alle Texte auf Deutsch. Kein Heilversprechen, keine Indikations-/Therapieaussage. Nur Verzehrs-/Timing-Info.

## JSON-Struktur

```jsonc
{
  "meta": {
    "version": "1",
    "updated": "YYYY-MM-DD",
    "disclaimer": "Kein Medizinprodukt ...",
    "sources": {                 // Kürzel -> {name, url, jahr}
      "BfR-2021": { "name": "BfR Höchstmengenempfehlungen für Nahrungsergänzungsmittel", "url": "...", "jahr": 2021 },
      "EFSA-UL":  { "name": "EFSA Tolerable Upper Intake Levels", "url": "..." },
      "DGE":      { "name": "DGE Referenzwerte", "url": "..." },
      "NIH-ODS":  { "name": "NIH Office of Dietary Supplements", "url": "..." }
    }
  },

  "supplements": [
    {
      "id": "vitamin-d",                       // kebab-case, stabil
      "name": "Vitamin D",
      "aliases": ["Vitamin D3", "Cholecalciferol"],
      "category": "vitamin-fett",              // siehe categories unten
      "unit": "µg",                            // Basiseinheit der Zahlen
      "unitNote": "1 µg = 40 I.E.",            // optional
      "summary": "Kurzbeschreibung, 1 Satz, sachlich.",

      "timing": {
        "frequency": "1× täglich",             // typische Einnahmehäufigkeit
        "slots": ["morgens", "mittags"],       // Werte: morgens|mittags|abends|nacht|beliebig
        "withFood": "mit-fett",                // mit-essen|mit-fett|nuechtern|egal
        "note": "Fettlöslich – zu einer fetthaltigen Mahlzeit."
      },

      "limits": {
        "bfr": { "value": 20,  "unit": "µg", "source": "BfR-2021", "note": "Empf. Höchstmenge in NEM/Tag" },
        "ul":  { "value": 100, "unit": "µg", "source": "EFSA-UL",  "note": "Tolerable Upper Intake Level Erwachsene" }
      },

      "sourceRefs": ["BfR-2021", "EFSA-UL"]
    }
  ],

  // Paar-Regeln für die Planer-Engine (Abstände / Interferenzen zwischen NEM)
  "interactionPairs": [
    {
      "a": "eisen",
      "b": "calcium",
      "spacingHours": 2,                       // empfohlener zeitlicher Mindestabstand; null wenn nur Hinweis
      "kind": "hemmung",                       // hemmung|synergie|konkurrenz|hinweis
      "reason": "Calcium kann die Eisenaufnahme verringern.",
      "source": "NIH-ODS"
    }
  ]
}
```

## Kategorien (`category`)
`vitamin-fett` (fettlösliche Vitamine A,D,E,K), `vitamin-wasser` (wasserlösliche: B-Komplex, C),
`mineralstoff`, `spurenelement`, `omega`, `aminosaeure`, `probiotikum`, `sonstige`.

## Abzudeckende NEM (Startumfang, häufigste in DE)
Vitamin A, Vitamin D, Vitamin E, Vitamin K (K2), Vitamin C, B1, B2, B3 (Niacin), B5, B6, B7 (Biotin),
B9 (Folsäure), B12, Calcium, Magnesium, Kalium, Eisen, Zink, Kupfer, Selen, Jod, Mangan, Chrom,
Omega-3 (EPA/DHA), Coenzym Q10, Kreatin, L-Arginin, L-Carnitin, Probiotika, Ballaststoffe (Flohsamen),
Melatonin (Hinweis rezept-/Statusabhängig in DE), Kollagen, Curcumin, Vitamin-B-Komplex.

## Wichtige Paar-Regeln (mind. abzudecken)
- Eisen ↔ Calcium (Abstand ~2 h; Calcium hemmt Eisen)
- Eisen ↔ Zink (konkurrieren um Aufnahme; getrennt einnehmen)
- Zink ↔ Kupfer (hohe Zn-Dosen senken Cu; ausgewogen/getrennt)
- Calcium ↔ Magnesium (hohe Einzeldosen: aufteilen)
- Calcium ↔ Zink (hohe Ca-Dosen können Zn-Aufnahme mindern)
- Vitamin C → Eisen (Synergie: verbessert Aufnahme von Nicht-Häm-Eisen)
- Fettlösliche Vitamine (A,D,E,K) → mit Fett; K und E in hoher Dosis nicht zeitgleich unklar → Hinweis
- Magnesium/Calcium abends vs. B-Vitamine morgens (anregend) – Timing-Hinweis
