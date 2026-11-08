# Lokale Partikelübernahme

## Spielbares Szenario

`Capture challenge` startet auf dem vorhandenen Spielfeld eine blaue Wolke
mit 1.000 Einheiten links und eine ruhende rote Wolke mit 400 Einheiten rechts.
Die Maus steuert das blaue Team. Zum Ausprobieren die Maus in die Mitte der
roten Wolke bewegen und dort halten. Übernommene Einheiten wechseln sichtbar
die Farbe und folgen anschließend demselben Ziel wie die übrigen blauen.

Beide Teams verwenden dieselben Angriffs- und Heilungsregeln. Rot bleibt in
diesem Szenario ortsfest, kann aber eigene Nachbarn heilen und blaue Einheiten
bei passendem gerichteten Kontakt übernehmen. Die Position eines noch roten
Partikels bleibt gleich; beim Besitzwechsel bleibt seine ID erhalten.
Das ist ein lokales Abnahmeszenario, noch kein Netzwerkspiel oder Computergegner.

Die Oberfläche zeigt beide Teamzahlen und den unveränderten Gesamtbestand
an. Bei vollständiger Übernahme erscheint ein entsprechender Hinweis.
Geschwächte Einheiten sind dunkler. `Capture challenge` startet den Versuch
neu; `Spawn swarm` kehrt zur einzelnen Wolke zurück. Vorhandene Hindernisse
werden in beiden Fällen berücksichtigt und bleiben erhalten. Pause und
Fortsetzen funktionieren in beiden Modi.

## Regeln unserer Implementierung

Die Reihenfolge orientiert sich am C-Pfad aus Liquid War 5.6.6
([Fundstellen](liquid-war-reference.md)). Die folgenden Zahlen sind unsere
Startwerte und keine Behauptung über die Standardkonfiguration des Originals.

| Regel | Implementierung |
| --- | --- |
| Gesundheit | Ganze Zahlen von 0 bis 100, neue Einheiten starten mit 100. |
| Bewegung vor Kampf | Freie Haupt-, gute und akzeptable Ausweichrichtungen gehen vor. Einheiten, die im Halbschritt bewegt wurden, greifen in diesem Halbschritt nicht an. |
| Hauptangriff | Ein Gegner in der Hauptbewegungsrichtung verliert 16 Gesundheit. |
| Seitenangriff | Ist kein Hauptangriff möglich, wird höchstens ein Gegner in den ersten zwei guten Ausweichrichtungen angegriffen: 1 Schaden, also `16 >> 4`. |
| Übernahme | Erst bei `health < 0`. Teamwechsel am selben Partikel, mit derselben ID und Rasterzelle. Negative Gesundheit wird durch wiederholtes Auffüllen um 50 in den nichtnegativen Bereich gebracht; beispielsweise −16 → 34. |
| Heilung | Ohne passenden Gegner kann ein eigener Nachbar in Hauptrichtung 2 Gesundheit erhalten, höchstens bis 100. Kein direkter Lebensraub beim Angriff. |
| Takt | Höchstens eine Kontaktaktion je Einheit und logischem Frame, unabhängig von Geschwindigkeit und der Zahl der Bewegungsteilversuche. IDs verteilen diese Aktionen auf die zwei Halbschritte. |
| Reihenfolge | Zeitabhängig gemischte, deterministische Prioritäten. Eine gerade übernommene Einheit handelt frühestens im nächsten Halbschritt für ihr neues Team. |
| Reichweite | Ausschließlich begehbare Nachbarzellen. Keine Angriffe durch Wände oder gesperrte diagonale Ecken. |

Einheiten am eigenen Ziel halten an. Die rote Wolke verwendet ihr Zentrum
als Ziel für die gerichteten Kontaktregeln. Ihre ausgeschaltete Bewegung
erzeugt keinen Angriff, wenn eine freie zulässige Bewegung möglich wäre.

Jedes Team hat sein eigenes hindernisbewusstes Distanzfeld. Terrainänderungen
entwerten beide Felder. Nach einem Teamwechsel verwendet der Partikel das
Ziel und die Bewegungseigenschaften des neuen Teams. Eine Übernahme erzeugt
oder entfernt keine Partikel und ändert niemals den Rasterbesitzer auf einen
anderen Partikel.

## Automatische Prüfungen

`__tests__/capture.test.js` prüft isoliert und mit derselben Simulation:

- Wiederholten Gesundheitsabbau, die Grenze bei genau null, Auffüllen nach
  Übernahme sowie Erhaltung von ID, Position und Rasterbesitz.
- Ausweichen vor Angriff, die schwächere Seitenattacke, die Priorität vor
  Heilung, die Heilungsobergrenze und die gerichtete Angriffsreichweite.
- Schutz durch Wände und gesperrte diagonale Ecken.
- Besitzwechsel in beide Richtungen und anschließendes Folgen des neuen Ziels.
- Vom Bewegungstempo unabhängigen Kontakttakt.
- Eine ruhende rote Wolke und vollständige Übernahme mit reproduzierbaren Seeds.
- Getrennte Teamfelder, Invalidierung nach Terrainänderung sowie Spawn und
  Rückkehr zum Einzelwolkenmodus bei begrenztem Platz.

`browser-tests/capture.spec.js` bedient den echten Canvas und die Buttons:

- 1.000 blaue und 400 rote Einheiten mit tatsächlich verschiedenen Farben;
  ortsfeste rote Wolke und zustandsneutrales erneutes Rendern.
- Sichtbare schrittweise und schließlich vollständige Übernahme aller 400
  Gegner. Alle 1.400 IDs und Rasterbelegungen bleiben erhalten. Anschließend
  folgen auch die ehemals roten Einheiten einem anderen Mausziel.
- Identische Wiederholung einschließlich Gesundheit und Kampfstatistik;
  ausgelesene Harness-Zustände sind unabhängige Kopien.
- Eine vollständig gemalte Wand verhindert Schaden. Nach Löschen der Wand
  kann dieselbe Wolke übernommen werden.
- Schmale Ansicht, Pause/Fortsetzen und Rückkehr zum freien Spiel.

Die bisherigen Bewegungs-, Eingabe- und Darstellungsprüfungen bleiben bestehen.
Die Harness liefert zusätzlich `team` und `health` je Partikel, beide Teams
mit Ziel und Anzahl, die Kampfparameter sowie Angriffs-, Heilungs- und
Übernahmezähler. Ungültige Teams oder Gesundheitswerte werden diagnostiziert.

### Geprüfter Stand am 8. November 2026

- `npm test -- --runInBand`: **35 Tests bestanden**, davon 12 neue Prüfungen
  zur Übernahme.
- `npm run test:browser`: **36 Tests bestanden**, davon 5 neue Browserfälle
  zur Übernahme. Keine übersprungenen oder als erwartet markierten Fehlschläge.
- `npm run play:capture`: Der tatsächlich laufende Browser hat alle 400 roten
  Einheiten übernommen und anschließend alle 1.400 Einheiten zum neuen Ziel
  geführt. Sämtliche Belegungs-, Team- und Gesundheitsdiagnosen blieben null;
  es gab keine JavaScript-Laufzeitfehler.

In dieser Aufnahme entstanden 578 Besitzwechsel bis zur vollständigen
Übernahme, einschließlich Gegenübernahmen durch Rot. Die Haltepunkte waren:

| Zustand | Logischer Frame | Blau | Rot |
| --- | ---: | ---: | ---: |
| Zwei getrennte Wolken | 0 | 1.000 | 400 |
| Kontakt und beginnende Übernahme | 49,5 | 1.062 | 338 |
| Vollständige Übernahme | 138,5 | 1.400 | 0 |
| Gemeinsames Folgen des neuen Ziels | 303 | 1.400 | 0 |

Die Aufnahme verwendet laufende Frames; die exakten Haltepunkte können bei
erneutem Aufzeichnen variieren. Die Regressionstests verwenden dagegen feste
Schrittzahlen und Eingaben. Die Screenshots zeigen eine zusammenhängende
Kontaktfläche, sichtbare rote und blaue Individuen und passende Teamzähler.
Tempo und Spielgefühl können wir auf dieser Grundlage gemeinsam beurteilen.

## Laufende Animation prüfen

```bash
npm run play:capture
```

Der Browserlauf startet einen eigenen Server, betätigt die normalen Buttons
und steuert per Maus. Er zeichnet die laufende Anwendung auf; die Übernahme
wird nicht durch zusätzliche Debug-Schritte beschleunigt. Die Harness liest
an Haltepunkten ausschließlich den tatsächlichen Spielzustand aus.

Unter `artifacts/capture-preview/` entstehen:

- `capture-motion.webm`: Aufnahme der tatsächlichen Animation.
- `two-clouds.png`, `contact.png`, `captured.png`, `following.png` und die
  jeweiligen JSON-Zustände.
- `summary.json`: Simulationszeit, Teamzahlen, Kampfzähler und Diagnosen.

Diese generierten Dateien werden nicht eingecheckt. Der Nutzer hat das
Übernahmeszenario am 8. November 2026 mit »sieht gut aus« akzeptiert.
Die Kampfwerte bilden den akzeptierten ersten spielbaren Stand und können
bei späterem Bedarf angepasst werden.
