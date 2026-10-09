# LobbyCard-Assistent der Jusos Ulm

Ein kleines Web-Tool, das Schritt für Schritt durch den Antrag auf **LobbyCard** und **KinderBonusCard** der Stadt Ulm führt – in 7 Sprachen (Deutsch, Englisch, Türkisch, Ukrainisch, Russisch, Arabisch, Persisch/Dari).

Am Ende entsteht das **offizielle PDF-Formular der Stadt Ulm**, fertig ausgefüllt. Die Nutzer\*innen müssen es nur noch ausdrucken, unterschreiben und abgeben.

## So funktioniert es

1. Sprache wählen
2. Erstantrag oder Verlängerung?
3. Wohnort (Ulm / Kind geht in Ulm zur Schule / woanders → kein Anspruch)
4. Sozialleistungen? → entscheidet, welches der **zwei Formulare** gebraucht wird:
   - Leistung ausgewählt → `antrag_leistungen.pdf` („mit Bezug von Sozialleistungen“)
   - „Nein, keine davon“ → `antrag_einkommen.pdf` („ohne Bezug von Sozialleistungen“)
5. Eigene Daten
6. Haushalt (Partner/in, bis zu 5 Kinder)
7. Nur beim Einkommens-Formular: Einkommen – mit Live-Vergleich zur Einkommensgrenze
8. Übersicht → „Antrag erstellen“ → PDF
9. Persönliche Checkliste: ausdrucken, unterschreiben, welche Unterlagen, wo abgeben (Anlaufstelle nach Stadtteil)

Über den Knopf **„Hilfe“** gibt es jederzeit die zuständige Anlaufstelle (mit Telefon und Öffnungszeiten), die E-Mail der Stadt und häufige Fragen.

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Grundgerüst der Seite |
| `app.js` | Programmlogik (Schritte, Prüfungen, PDF-Erstellung) |
| `texte.js` | **Alle Texte in allen Sprachen** |
| `config.js` | **Einkommensgrenzen, Anlaufstellen, Öffnungszeiten, PDF-Feldnamen** |
| `app.css` | Gestaltung |
| `antrag_leistungen.pdf`, `antrag_einkommen.pdf` | Original-Formulare der Stadt Ulm |
| `logo.png`, `logo-header.png` | Jusos-Logo |
| `vendor/` | pdf-lib, fontkit und die Schrift Arimo (lokal, kein CDN) – Lizenzen in `vendor/LIZENZEN.txt` |
| `archiv/` | Alte Versionen (index0 – indexV4, GitHub-Version). Muss nicht hochgeladen werden. |

## Veröffentlichen (z. B. GitHub Pages)

Alle Dateien und den Ordner `vendor/` hochladen (den Ordner `archiv/` nicht nötig). Die leere Datei `.nojekyll` gehört dazu: Sie sorgt dafür, dass GitHub Pages alle Dateien unverändert ausliefert.

Wichtig: Die Seite muss über einen Webserver laufen (`https://…`). Öffnet man `index.html` per Doppelklick als Datei, kann der Browser die PDF-Formulare nicht laden.

**Lokal testen:** Im Projektordner z. B. `npx serve .` oder `python -m http.server 8000` ausführen und `http://localhost:8000` öffnen.

## Wenn sich bei der Stadt etwas ändert

- **Neue Einkommensgrenzen** → `config.js` → `incomeLimit` (Grundbetrag, +688 € je weitere Person ab 14, +413 € je Kind unter 14). Stand jetzt: Formular 09/2025, laut Flyer 07/2026 weiter gültig.
- **Andere Adressen, Telefonnummern oder Öffnungszeiten** → `config.js` → `offices`
- **Neue PDF-Formulare** → PDF im Ordner austauschen (gleicher Dateiname) und einmal einen Testantrag erstellen. Wenn die Stadt Feldnamen ändert, bricht die Erstellung mit einer Fehlermeldung ab; dann die Namen in `config.js` (`pdfFields`, `forms`, `benefits`) anpassen. Die PDFs gibt es über die LobbyCard-Seite auf ulm.de (Online-Formulare der Stadt).
- **Texte ändern** → `texte.js`. Fehlt ein Text in einer Sprache, wird automatisch der deutsche angezeigt. Platzhalter wie `{email}` müssen erhalten bleiben.

## Datenschutz

- Alles läuft im Browser. Eingaben werden **nicht gespeichert und nicht verschickt**, auch nicht an die Jusos.
- Keine externen Dienste: keine Google Fonts, kein Tailwind-CDN, kein unpkg, kein Tracking. Alle Bibliotheken liegen in `vendor/`.
- Für eine öffentliche Seite der Jusos Ulm sollten Impressum und Datenschutzerklärung verlinkt sein: Links in `config.js` bei `impressumUrl` und `datenschutzUrl` eintragen – dann erscheinen sie in der Fußzeile.

## Gut zu wissen

- Namen müssen in lateinischen Buchstaben eingegeben werden (wie im Ausweis). Sonderzeichen wie ş, ğ, ı, ł, ő funktionieren im PDF dank eingebetteter Schrift.
- Arabische/persische Ziffern werden automatisch in 0–9 umgewandelt.
- Die Übersetzungen sollten idealerweise von Muttersprachler\*innen gegengelesen werden.
- Quellen: ulm.de (LobbyCard und KinderBonusCard), Flyer der Stadt Ulm Stand 07/2026, Formulare Stand 1/2023 und 09/2025. Stand der Angaben: Oktober 2026.
