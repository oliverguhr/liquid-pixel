# Aufgaben

## Vereinbarte Reihenfolge

1. **Singleplayer stabilisieren:** Hindernisse malen und eine organische Wolke
   aus individuellen Pixeln zuverlässig mit der Maus steuern.
2. **Partikelübernahme:** Eine bewegte Wolke übernimmt eine statische
   gegnerische Wolke nach klaren Regeln, angelehnt an Liquid War.
3. **Netzwerkspiel:** Zwei Spieler bewegen ihre Wolken über WebSocket und
   können sich gegenseitig Pixel übernehmen.

Die Liste ist eine Planung; spätere Phasen werden nach den Erfahrungen mit
der vorherigen konkretisiert. Für Phase 1 gelten keine Performancevorgaben.

## Fehlerstatus der Bewegung

Stand: 8. November 2026. Die technischen Nachweise stehen in
[docs/movement-validation.md](docs/movement-validation.md).

| Fehler | Stand und Absicherung |
| --- | --- |
| Pixel werden übereinandergeschoben | Korrigiert: Darstellung und Belegung verwenden dieselbe 4×4-Zelle. Spawn und Respawn belegen ausschließlich freie Zellen; lange Läufe prüfen Doppelbelegungen und veraltete Besitzer. |
| Pixel bleiben vor Hindernissen hängen | Korrigiert: Hindernisbewusstes Distanzfeld mit lokalen Ausweichrichtungen. Wand, U und eine Öffnung von genau einer Partikelbreite werden im Browser durchlaufen. |
| Pixel kleben an Rändern und Ecken | Korrigiert und an allen vier Seiten sowie Ecken geprüft, auch mit 1.000 Partikeln und mehreren aufeinanderfolgenden Zielwechseln. |
| Große Schritte überspringen dünne Wände | Korrigiert: ausschließliche Nachbarschritte mit Prüfung jeder Teilbewegung. Gesperrte diagonale Ecken werden nicht geschnitten. |
| Raute beziehungsweise Viereck statt Kreis | Korrigiert: euklidisch korrigiertes Potential erhält Umwegkosten und entfernt den Winkelbias im freien Feld. 16 Winkelsektoren und die Füllung des Innenkreises werden geprüft. |
| Wolke wird wie ein starrer Ausschnitt verschoben | Überarbeitet: eigene Bewegungstakte, wechselnde lokale Prioritäten und getrennt gezeichnete Halbschritte. IDs und unterschiedliche Verschiebungsvektoren sichern tatsächliche Einzelbewegung ab. Der Nutzer hat die Fassung vorerst akzeptiert. |
| Schnelles Malen erzeugt Lücken; Button malt auf dem Spielfeld | Korrigiert: kontinuierlicher Strich bis zum Rand und Beginn des Malens nur auf dem Canvas. Belegte Zellen werden geschützt. |

Aktuell gibt es keine übersprungenen Bewegungstests oder als erwartet
markierten Fehlschläge. Neue Beobachtungen werden weiterhin als konkrete
Fehler mit Seed, Eingaben und Verlauf aufgenommen.

## Phase 1: Singleplayer stabilisieren

### Ausführen und reproduzierbar prüfen

- [x] Lokalen Server und lokale p5.js-Abhängigkeit bereitstellen.
- [x] Das echte Spiel per Playwright mit Maus und Spawn-Button bedienen.
- [x] Pausieren, feste Seeds und genaue logische Simulationsschritte erlauben.
- [x] Partikel-IDs, Zustände und Belegungsdiagnosen auslesen.
- [x] Screenshots, Browsertrace und eine laufende Animation speichern.
- [x] Spiel auf Port 4173 und isolierte Tests auf 4174 parallel ermöglichen.
- [x] Originalcode von Liquid War 5.6.6 zu Wegen und Bewegungsregeln untersuchen
  und [Fundstellen dokumentieren](docs/liquid-war-reference.md).

### Belegung und Grenzen

- [x] Zeile und Spalte null sowie alle Ränder und Ecken zugänglich machen;
  ungültige Koordinaten sicher abfangen.
- [x] Sichtbare Partikelfläche und Kollisionszelle gleich groß machen.
- [x] Eindeutige freie Spawnzellen verwenden und alte Rasterbesitzer beim
  erneuten Spawnen bereinigen.
- [x] Bei Platzmangel höchstens die Zahl freier Zellen besetzen; auch eine
  vollständig blockierte Karte ohne Endlosschleife behandeln.
- [x] Jeden Bewegungsschritt und gesperrte diagonale Durchgänge prüfen.
- [x] Partikelzahl und Besitz auch nach langen Läufen und beim Malen erhalten.

### Wege und Eingaben

- [x] Ein Distanzfeld entlang begehbarer Wege berechnen.
- [x] Freie Haupt-, gute und seitliche Ausweichrichtungen vorsehen.
- [x] Dynamisch gemalte Hindernisse in die Wegberechnung aufnehmen.
- [x] Ziele auf Hindernissen und in unerreichbaren Bereichen auf die jeweils
  nächste freie Zelle des eigenen Bereichs projizieren.
- [x] Wand, U, enge Öffnung, versiegelte Wand und anschließendes Zurücksteuern
  mit sinnvollen Verhaltenstests prüfen.
- [x] Maus und Pfeiltasten ohne Laufzeitfehler verwenden können.

### Organischer Schwarm

- [x] Eine ruhende freie Wolke als gefüllten Kreis statt als Raute verdichten.
- [x] Individuelle Bewegungstakte und lokale Konkurrenz um freie Zellen
  statt einer synchronen Verschiebung des Gesamtblocks verwenden.
- [x] Bewegung in zwei sichtbare Halbschritte je logischem Frame aufteilen.
- [x] Stabile helle Schattierungen machen einzelne Einheiten erkennbar.
- [x] Kreisform, Füllung und tatsächliche Vielfalt der Einzelbewegungen prüfen.
- [x] Eine reale Animation mit mehreren Mauszielwechseln aufnehmen.
- [x] Gemeinsam mit dem Nutzer die überarbeitete Animation im Spiel beurteilen:
  rund, organisch, als Individuen erkennbar, ohne störende Streifen oder Lücken.

Der Nutzer hat die Bewegung am 8. November vorerst akzeptiert. Eine Aufnahme
liegt nach `npm run play:preview` unter
`artifacts/swarm-preview/swarm-motion.webm`.

### Moderne Darstellung

- [x] Darstellungsauflösung erhöhen und HiDPI-Bildschirme berücksichtigen:
  mindestens 1600×1600, bei Pixeldichte 3 bis 2400×2400.
- [x] Einzelne Einheiten und Hindernisse mit einer modernen Canvas-Darstellung
  zeigen; die akzeptierten Bewegungsregeln erhalten.
- [x] Eine responsive Oberfläche mit Einheitenzähler, Spawn, Pause/Fortsetzen
  und Löschen der Hindernisse gestalten.
- [x] Eingaben bei skaliertem Canvas sowie Desktop- und schmale Ansichten prüfen.

Nachweise und Vorschauen: [docs/presentation-validation.md](docs/presentation-validation.md).

### Weitere Qualität bei Bedarf

- [x] Den Modellzustand ohne p5-Stubs in Node testen können; Browser und Tests
  verwenden dieselbe Implementierung.
- [x] Zusätzliche deterministische Labyrinthe für Belegung, Wanddurchtritte,
  diagonale Ecken und absteigende Potentiale prüfen.
- [x] Für 1.800 unabhängig als erreichbar bestimmte Start-Ziel-Paare prüfen,
  dass einzelne Pixel ihr Ziel tatsächlich erreichen und nicht nur sicher
  umherlaufen.
- [ ] Weitere gemeldete Karten- oder Bewegungsfehler als Szenarien ergänzen.
- [ ] Tests bei Bedarf in CI ausführen lassen.

## Phase 2: Gegnerische Partikel übernehmen

- [x] Übernahme- und Heilungsregeln des Originals anhand der
  [Referenznotizen](docs/liquid-war-reference.md) für unser Spiel konkretisieren.
- [x] Zweiten lokalen Schwarm mit eigener Zugehörigkeit ergänzen.
- [x] Regeln für Kontakt, Gesundheit und Besitzwechsel umsetzen.
- [x] Einfaches Abnahmeszenario: Eine Wolke bleibt statisch; eine zweite,
  bewegte Wolke wird hineingesteuert und übernimmt ihre Pixel.
- [x] Besitzwechsel, Partikelzahl und Rasterbelegung prüfen.
- [x] Gemeinsam beurteilen, ob das »Fressen« sichtbar nachvollziehbar und
  sinnvoll aussieht.

Spielbar über `Capture challenge`: 1.000 blaue gegen 400 ruhende rote
Einheiten. Beide Teams verwenden dieselben Kampfregeln. Die konkreten Regeln,
automatischen Prüfungen und die laufende Aufnahme stehen in
[docs/capture-validation.md](docs/capture-validation.md).

Der Nutzer hat das Übernahmeszenario am 8. November 2026 mit »sieht gut aus«
akzeptiert. Phase 2 ist damit abgeschlossen.

## Phase 3: Zwei Spieler über WebSocket synchronisieren

- Ziel: Beide Clients berechnen die gesamte Simulation; der Server vermittelt
  Eingaben und verwaltet Lobby und Matches. Synchronität hat Vorrang;
  umfassender Cheat-Schutz folgt später. Details:
  [docs/multiplayer-design.md](docs/multiplayer-design.md).

- [x] Deterministisches Lockstep mit festen Schritten, identischem Zufall und
  browserübergreifend gleichen Berechnungen umsetzen und zunächst isoliert prüfen.
- [x] Kanonische Zustandsprüfsummen und einen kontrollierten Abbruch bei
  Abweichungen ergänzen; keine ungeprüften Client-Snapshots übernehmen.
- [x] Lobby mit Online- und Wartendenzahl sowie abbrechbarer Zufallssuche ergänzen.
- [x] Verbindung und Zuordnung zweier Spieler zu ihren Wolken umsetzen.
- [x] Eingaben serverseitig prüfen, nummerierten Schritten zuordnen und identisch
  an beide Clients verteilen. Bewegung und Übernahmen auf beiden Clients berechnen.
- [x] In zwei Browser-Kontexten beide Wolken bewegen und Übernahmen in beide
  Richtungen bei konsistentem Spielstand prüfen.
- [x] Chromium, Firefox und WebKit sowie verzögerte Eingaben und unterschiedliche
  Renderfrequenzen auf identische Zustände je Simulationsschritt prüfen.
- [x] Spielende beidseitig bestätigen, kurz das Ergebnis zeigen und beide in
  die Lobby zurückführen. Kein erneutes automatisches Einreihen.
- [x] Verhalten bei Verzögerung, Verbindungsabbruch und erneutem Verbinden
  festlegen und prüfen.

Technisch geprüft am 8. November 2026: 52 Modell-/Servertests und 44
Browserprüfungen bestanden. Zwei normale Sitzungen haben ein vollständiges
Match bis zum gemeinsam bestätigten Sieg und zurück zur Lobby gespielt.
Aufnahmen: `artifacts/multiplayer-preview/`; Ablauf und Grenzen:
[docs/multiplayer-design.md](docs/multiplayer-design.md).

Der Nutzer hat am 8. November 2026 bestätigt, dass der neue Server bei ihm
startet. Ein zuvor von uns gestarteter Spielserver wurde dafür beendet.

## Zufällige Mehrspielerkarten

- [x] Hindernisse deterministisch aus dem Match-Seed erzeugen, damit beide
  Clients dieselbe Karte erhalten.
- [x] Spiegelbildliches Gelände, freie Startbereiche und durchgehend
  verbundene begehbare Bereiche absichern.
- [x] Reproduzierbarkeit, unterschiedliche Seeds, kleine Karten sowie
  vollständige 1.000er-Schwärme über 30 Seeds prüfen.
- [x] Zufallskarten im echten Match und browserübergreifend auf gleiche
  Zustände und vollständige Übernahme prüfen.

Geprüft: 59 Modell-/Serverprüfungen und acht Mehrspieler-Browserfälle grün.
Die laufende Aufnahme mit Seed 123 zeigt 2.820 identische Hinderniszellen
auf beiden Clients und einen vollständig synchronen Spielabschluss.
Vorschau: `artifacts/multiplayer-preview/random-terrain.png`.

Der Nutzer hat den Test im lokalen Netzwerk auf zwei Computern am
8. November 2026 als funktionierend bestätigt.

## Spätere Aufgaben

- [ ] Performance erst bei konkretem Bedarf messen und Ziele vereinbaren.
- [ ] Vorgefertigte Karten speichern und laden.
- [ ] Dauerhafte Spielstatistik und Punktestand ergänzen; das reguläre Ende
  durch vollständige Übernahme ist im Mehrspielermodus bereits vorhanden.
- [ ] Bei Bedarf stärkeren Cheat-Schutz durch unabhängige Replay-Prüfung planen.
