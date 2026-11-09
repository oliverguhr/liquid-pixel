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

Stand: 9. November 2026. Die technischen Nachweise stehen in
[docs/movement-validation.md](docs/movement-validation.md).

| Fehler | Stand und Absicherung |
| --- | --- |
| Pixel werden übereinandergeschoben | Korrigiert: Darstellung und Belegung verwenden dieselbe 4×4-Zelle. Spawn und Respawn belegen ausschließlich freie Zellen; lange Läufe prüfen Doppelbelegungen und veraltete Besitzer. |
| Pixel bleiben vor Hindernissen hängen | Korrigiert: Hindernisbewusstes Distanzfeld mit lokalen Ausweichrichtungen. Wand, U und eine Öffnung von genau einer Partikelbreite werden im Browser durchlaufen. |
| Pixel kleben an Rändern und Ecken | Korrigiert und an allen vier Seiten sowie Ecken geprüft, auch mit 1.000 Partikeln und mehreren aufeinanderfolgenden Zielwechseln. |
| Große Schritte überspringen dünne Wände | Korrigiert: ausschließliche Nachbarschritte mit Prüfung jeder Teilbewegung. Gesperrte diagonale Ecken werden nicht geschnitten. |
| Raute, Viereck beziehungsweise Achteck statt Kreis | Korrigiert: euklidisch korrigiertes Potential und begrenztes seitliches Abdriften erhalten eine runde Wolke. 32 Winkelsektoren mit höchstens 6 % Radiusunterschied und die Füllung des Innenkreises werden geprüft. |
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
- [x] Den Look der Lobby ins Spiel übertragen: kleinere runde Partikel mit
  deutlichen Zwischenräumen und erhaltenem Leuchten. Seitliches Abdriften
  begrenzen, damit die ruhende Wolke keine achteckigen Kanten entwickelt.

Nachweise und Vorschauen: [docs/presentation-validation.md](docs/presentation-validation.md).

Ergänzung vom 9. November: Runde Partikel und eine rundere ruhende Wolke sind
mit 68 Modell-/Serverprüfungen und allen 45 Browserfällen geprüft. Der LAN-Server
auf Port 4173 wurde mit `liquid-pixel-lockstep-3` neu gestartet; beide Browser
müssen neu geladen werden.

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

## Performance nach dem ersten LAN-Test

Der Nutzer meldet ein ausgelastetes Notebook und Ruckler bei zwei Spielern.
Die [Performanceanalyse](docs/performance-analysis.md) enthält Messwerte,
Fundstellen und einfache Verbesserungsvorschläge. Lesbarkeit und die
bisherige Synchronität bleiben verbindlich.

- [x] Simulation mit festen Eingaben profilieren und zwei echte Clients messen.
- [x] Serverlast separat messen und Leuchteffekte als Grafik-Kosten isolieren.
- [x] Reproduzierbare Messbefehle und priorisierte Empfehlungen dokumentieren.
- [x] Optimierungen nach erwartetem Gewinn mit Aufwand und Unsicherheit
  [auflisten](docs/performance-analysis.md#optimierungsliste-nach-erwartetem-gewinn).
- [x] Die acht begrenzten Optimierungen zum Ausprobieren ausgewählt.

Die acht Versuche wurden einzeln umgesetzt und gemessen. Die
[Ergebnisse je Schritt](docs/performance-results.md) enthalten die Entscheidung
und den abschließenden Gesamtvergleich. Die Reihenfolge stammt aus der
vorläufigen Einschätzung:

1. [x] Leuchteffekte auf einer separaten Ebene mit geringerer Auflösung
   zeichnen. Das Leuchten ausdrücklich erhalten; Partikelkerne bleiben scharf.
2. [x] Statische begehbare Nachbarverbindungen für Wegfelder und Bewegung
   wiederverwenden; bei Geländeänderungen erneuern.
3. [x] Die erste Nachbarsortierung durch eine gleichwertige Minimumsuche ersetzen.
4. [x] Sortierschlüssel pro Partikel und Bewegungsrunde vorberechnen.
5. [x] Den vorhandenen Distanzcache mit numerischen Schlüsseln vereinfachen.
6. [x] Freie Zielzellen in ihrer eigenen Komponente direkt verwenden.
7. [x] Cache sortierter Hindernisse in Zustandsberichten ausprobiert und
   verworfen: einzelne Berichte günstiger, aber kein belastbarer Gesamtnutzen.
8. [x] Unveränderte Lobby-/Statusanzeigen seltener ins DOM schreiben.

Gesamtvergleich: rund 35–40 % weniger Simulationszeit und 50–71 % weniger
Zeichenzeit im Software-Renderer. 60 Modell-/Serverprüfungen und alle 45
Browserfälle bestanden, einschließlich gleicher Zustände in Chromium,
Firefox, WebKit und Node. Das lange Replay erhält die bisherigen Prüfsummen.
Die reale Bildrate im automatisierten Zwei-Client-Lauf steigt bei bewegten
Zielen von etwa 19 auf 23 FPS; Hardware-Rendering auf dem Notebook ist damit
nicht vermessen.

Inkrementelle Wegfelder über mehrere Takte bleiben eine Reserveoption.
Die Analyse beschreibt deren Grenzen. Jede spätere Umsetzung muss lesbar
bleiben und anhand der Messungen, des Spielverhaltens und der Synchronität
einzeln geprüft werden.

- [x] Originalcode erneut gezielt auf Performance-Tricks untersuchen und
  [Fundstellen sowie Übertragbarkeit](docs/liquid-war-performance.md) dokumentieren:
  adaptives Mesh, fortlaufende Gradienten, Cursorwert, Richtungstabellen und
  Darstellung. Das ist eine Untersuchung, keine Umsetzung weiterer Optimierungen.
- [x] Die Richtungsauswahl wiederverwenden: rund 47–54 % weniger Simulation
  bei stehenden Zielen/Kontakt und 8 % bei bewegten Zielen, identische Zustände.
  Im normalen Browserlauf rund 25 % weniger Simulationszeit bei stehenden
  Zielen und 20 % im Kontakt; kein klarer Vorteil bei bewegten Zielen.
- [x] Adaptives Navigationsmesh ausprobieren und messen: in Node zusätzlich
  7–12 % weniger Simulation bei bewegten Zielen auf drei Karten, im echten
  Browser jedoch langsamer (rund 15 statt 23 FPS). Mesh deshalb verworfen,
  Richtungscache behalten. Nachweise und Grenzen in
  [navigation-performance-results.md](docs/navigation-performance-results.md).
- [x] Endgültigen Stand erneut prüfen: 68 Modell-/Servertests und alle
  45 Browserfälle bestanden; der LAN-Server liefert die geprüfte Fassung.

## Spätere Aufgaben

- [ ] Vorgefertigte Karten speichern und laden.
- [ ] Dauerhafte Spielstatistik und Punktestand ergänzen; das reguläre Ende
  durch vollständige Übernahme ist im Mehrspielermodus bereits vorhanden.
- [ ] Bei Bedarf stärkeren Cheat-Schutz durch unabhängige Replay-Prüfung planen.
