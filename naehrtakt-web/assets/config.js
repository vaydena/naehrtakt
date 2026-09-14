/* ==========================================================================
   Nährtakt – zentrale Konfiguration (öffentlich; keine Geheimnisse hier!)
   fnBase/anonKey sind bewusst öffentlich (die Function prüft serverseitig).
   Bankdaten sind die Zahlungsdaten des Betreibers und dürfen öffentlich stehen.
   ========================================================================== */
window.NT_CONFIG = {
  productName: "Nährtakt",
  domain: "naehrtakt.vaydena.de",
  version: "nt-v1",

  // Supabase Edge Functions (öffentlicher Endpunkt, verify_jwt=false)
  fnBase:  "https://xeuexovdipdiiuzjpzkj.supabase.co/functions/v1",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhldWV4b3ZkaXBkaWl1empwemtqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2ODIzMzUsImV4cCI6MjA5OTI1ODMzNX0.b-rm79RT7yoTa173ykRXkYuVD_Snva8BywHIqo0X09I",

  // Preis / Kauf – Einmal-Lizenz
  price:       "2,99 €",
  priceValue:  2.99,
  currency:    "EUR",
  licensePrefix: "NT",

  // Zahlungsdaten – erscheinen auf der Zahlseite (GiroCode + PayPal)
  pay: {
    empfaenger:  "Karl-Heinz Bicker",           // Kontoinhaber (für Überweisung/GiroCode)
    iban:        "DE95700510030000785303",
    bic:         "BYLADEM1FSI",
    bank:        "Sparkasse",
    paypalEmail: "kontakt@vaydena.de",           // PayPal „Geld an Freunde/Familie senden"
    paypalMe:    "",                             // optionaler paypal.me-Link (leer = E-Mail-Weg)
    kontaktMail: "kontakt@vaydena.de",
    verwendung:  "Naehrtakt-Lizenz"             // Verwendungszweck-Präfix (+ E-Mail des Käufers)
  }
};
