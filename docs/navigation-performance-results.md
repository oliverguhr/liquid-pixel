# Zwei Optimierungen nach dem Vorbild von Liquid War

Stand: 9. November 2026. Diese Untersuchung folgt auf die
[acht ersten Optimierungsversuche](performance-results.md) und die erneute
[Analyse des Originalcodes](liquid-war-performance.md). **Der Richtungscache
bleibt erhalten, das adaptive Mesh wurde wieder entfernt.** Entscheidend
waren die Messungen im normalen Browserbetrieb.

## Gemeinsamer Versuchsstand vor der Browserprüfung

Ein zusätzlicher direkter Vergleich gegen den Stand vor beiden Änderungen
liefert auf Seed 123 folgende Mittelwerte aus drei A/B-Paaren:

| Szenario | Vorher, ms/Halbschritt | Cache + experimentelles Mesh | Weniger Rechenzeit |
| --- | ---: | ---: | ---: |
| Stehende Ziele | 5,80 | 2,65 | 54,3 % |
| Bewegte Ziele | 12,86 | 10,94 | 15,0 % |
| Kontakt | 5,06 | 2,72 | 46,3 % |

Die vollständigen Spielzustände und Berichte aller Batches sind identisch.
Aus den separaten Messungen der beiden Schritte werden keine Prozentwerte
addiert. Dieser Node-Vergleich allein hätte für eine Übernahme gesprochen.
Die anschließende Browserprüfung zeigt jedoch eine deutliche Regression
durch das Mesh. Die Tabelle beschreibt deshalb einen verworfenen Zwischenstand.

## 1. Richtungsauswahl wiederverwenden

`Environment.movementOptions` speichert die Navigation pro Team, Zelle und
deterministischer Richtungspriorität. Es gibt acht Prioritätsvarianten. Die
bisherige individuelle Auswahl anhand von Partikel-ID und Spieltakt wird
dadurch exakt wiederverwendet. Bei neuer Zielzelle oder verändertem Gelände
wird der Cache des jeweiligen Wegfelds erneuert.

Die Auswahl enthält Verweise auf Nachbarzellen. Deren aktuelle Belegung wird
weiterhin bei jeder Bewegung und Kontaktaktion geprüft. Ein inzwischen
eingetroffener anderer Partikel kann deshalb keine Doppelbelegung verursachen.

Vergleich mit dem unmittelbar vorherigen Spielstand, Seed 123, 2.000 Partikel:

| Szenario | Vorher, ms/Halbschritt | Mit Richtungscache | Weniger Rechenzeit |
| --- | ---: | ---: | ---: |
| Stehende Ziele | 5,55 | 2,57 | 53,7 % |
| Bewegte Ziele | 12,73 | 11,68 | 8,3 % |
| Kontakt | 5,09 | 2,71 | 46,7 % |

**Entscheidung: übernehmen.** Deutlicher Gewinn mit einer kleinen Ergänzung;
die Berichte und vollständigen Spielzustände der Vergleichsläufe sind identisch.

## 2. Ein adaptives Navigationsmesh

Die experimentelle `NavigationMesh.js` teilte begehbares Gelände in
hindernisfreie Quadrate.
An Hindernissen werden die Bereiche kleiner. Auf der normalen Karte sind
Kantenlängen von 1 bis 64 Rasterzellen möglich. Jeder Bereich behält alle
Randzellen als Übergänge, deren innere Verbindungskosten vorberechnet werden.
Tabellen für gleich große Bereiche werden gemeinsam verwendet.

Dijkstra verarbeitet diese Übergänge und die normalen, geprüften Verbindungen
zwischen Bereichen. Für das Innere eines leeren Quadrats genügen anschließend
zwei lineare Durchläufe, um die bisherigen Rasterdistanzen wiederherzustellen.
Das erhält die Kosten 10/14 für gerade/diagonale Schritte, die Eckverbote,
die Projektion unerreichbarer Ziele und die euklidische Korrektur für die
runde Wolke. Die Prioritätsqueue und die Bewegungsregeln bleiben verwendbar.

Das Mesh wird beim bestehenden Geometrieaufbau erneuert. Bewegte Partikel
verändern es nicht. Auf der Zufallskarte mit Seed 123 verwendet die Variante
mit maximal 64 Zellen Kantenlänge 928 Bereiche und 9.892 Randknoten.

Zunächst wurde eine Obergrenze von 16 Zellen ausprobiert: Im vollständigen
Modelllauf ergab sie nur 1,1 % Gewinn bei bewegten Zielen. Ein orientierender
Vergleich mit Größen 4, 8, 16, 32 und 64 sowie das Überspringen bereits
erreichter kleinerer Randwerte führte zur abschließend geprüften 64er-Variante.
Die einzelne Größenmessung dient der Auswahl, nicht als belastbarer Endvergleich.

Der abschließende Mesh-Vergleich erfolgt gegen den Stand **mit** Richtungscache:

| Karte | Bewegte Ziele vorher, ms/Halbschritt | Mit Mesh | Weniger Rechenzeit |
| --- | ---: | ---: | ---: |
| Seed 123 | 11,81 | 10,36 | 12,3 % |
| Seed 456 | 11,54 | 10,74 | 6,9 % |
| Seed 789 | 12,21 | 10,87 | 10,9 % |

Alle neun Vergleichspaare sind bei bewegten Zielen schneller. Bei stehenden
Zielen einschließlich des ersten Geometrieaufbaus steigt der Mittelwert um
etwa 0,08–0,17 ms je Halbschritt. In der Kontaktphase liegen die Änderungen
zwischen ungefähr −2 % und +2,4 % Rechenzeit. Das Mesh hilft vor allem bei
wiederholten Zielwechseln, nicht bei einem bereits gültigen stehenden Wegfeld.

**Entscheidung nach Browserprüfung: verwerfen.** Der zusätzliche Node-Gewinn
auf drei Zufallskarten war reproduzierbar und die Weglängen blieben exakt.
Im normalen Chromium-Spiel überwiegen jedoch die Kosten des Mesh. Der
Prototyp mit rund 125 Zeilen und seine integrierte Environment-Version sind
als lokale Zwischenstände unter
`artifacts/performance/versions/original-tricks-mesh-64/` gesichert;
die Anwendung verwendet wieder den bisherigen Raster-Dijkstra.

Eine über mehrere Takte nachlaufende Feldberechnung wie im Original ist eine
gesonderte, weiterhin offene Möglichkeit. Die hier geprüfte Mesh-Variante
liefert nach jedem Zielwechsel bereits das vollständige Feld. Sie benötigt
deshalb keine zusätzlichen Regeln für große Maussprünge oder unfertige Felder.

## Der entscheidende Browservergleich

Zwei normale Clients spielen auf Seed 123 mit denselben drei Messphasen und
echten Pointer-Eingaben. Beide verwenden denselben aktuellen Renderer.
`profile-multiplayer.cjs` kann dafür optional eine gespeicherte
`Environment.js` über Playwright in beide Clients laden. Das Spiel verwendet
dieselbe reale Lobby, denselben Server und dieselben Simulationstakte.

| Variante, je zwei Clients | Stehende Ziele, ms/Halbschritt | Bewegte Ziele, ms/Halbschritt | Kontakt, ms/Halbschritt | FPS bei bewegten Zielen |
| --- | ---: | ---: | ---: | ---: |
| Vor beiden Änderungen | 3,86–4,10 | 7,10–7,18 | 4,23–4,39 | 23,5–23,7 |
| Nur Richtungscache | 2,95–2,96 | 7,30–7,48 | 3,49–3,59 | 22,8–23,2 |
| Richtungscache und Mesh | 2,97–3,15 | 11,27–11,29 | 3,72–3,77 | 15,0–15,2 |

Der Mesh-Lauf hat 475 übereinstimmende gemeinsame Zustandsberichte, der
Cache-Lauf 419 und der Ausgangsstand 420. Alle Läufe enden ohne Browserfehler.
Das CPU-Profil zeigt `NavigationMesh.fill` als zusätzlichen großen Kostenpunkt.
Weniger Suchknoten bringen hier wegen der vielen Vergleiche zwischen
Bereichsrändern keinen Vorteil im tatsächlichen Browser. Ein Node-Ergebnis
lässt sich deshalb nicht als browserunabhängige Geschwindigkeitszusage behandeln.

Der Richtungscache reduziert die Browser-Simulationszeit bei stehenden Zielen
um ungefähr ein Viertel und im Kontakt um ungefähr ein Fünftel. Bei bewegten
Zielen gibt es in diesem Live-Vergleich keinen erkennbaren Gewinn; eine höhere
Bildrate dafür wird nicht behauptet. Die kleine Ergänzung bleibt wegen der
klaren Vorteile in den anderen Phasen und identischer Spielzustände erhalten.

Diese Live-Läufe verwenden Chromium mit Software-Rendering/SwiftShader und
zwei Clients auf demselben Rechner. Sie spielen wegen der echten Eingaben
und unterschiedlichen Laufzeiten keinen über beide Varianten exakt gleichen
Tick-Verlauf ab. Das ist eine praktische Regression dieses Prototyps,
keine allgemeine Aussage gegen jedes adaptive Mesh. Für exakte Zustandsvergleiche
werden weiterhin die festen Replays verwendet.

## Prüfung und Messmethode

- Pro Modellvergleich drei isolierte Node-Prozesspaare, Reihenfolge AB/BA/AB.
  Nach 30 Aufwärmbatches folgen je 60 Batches mit drei Halbschritten für
  stehende Ziele, bewegte Ziele und Kontakt. Jeder Bericht und die vollständigen
  Zustände am Ende jeder Phase müssen zwischen den Versionen übereinstimmen.
- Für die endgültige Mesh-Variante werden drei Karten verwendet, insgesamt
  neun Paare mit identischen Eingaben je Paar. Prozentwerte der einzelnen
  Schritte beziehen sich auf unterschiedliche Ausgangsstände und sind nicht addierbar.
- 400 zusätzliche vollständige Wegfelder auf leeren und zufälligen kleinen
  Karten wurden direkt mit dem vorherigen Rasteralgorithmus verglichen,
  einschließlich Ziele auf Hindernissen und in getrennten Bereichen.
- Sechs neue reguläre Testfälle vergleichen beide Teams auf unterschiedlich
  großen, freien, dicht bebauten sowie einzeiligen/einspaltigen Karten mit
  einem unabhängigen Rasterlöser. Je Fall gibt es acht Zielpositionen.
- Zwei zusätzliche Bewegungstests prüfen beide Teams nach bereits benutzten
  Wegen, Malen, Zielwechseln und Löschen. Ein vorhandener Test prüft nun auch
  neu belegte Nachbarzellen nach bereits vorbereiteter Navigation.
- Mit dem Mesh bestanden **68 Modell-/Servertests und alle 45 Browserfälle**.
  Dazu gehören
  Kreisform, individuelle Bewegung, Hindernisse, enge Durchgänge, Übernahmen,
  HiDPI und Leuchten, vollständige Online-Matches sowie identische Zustände
  in Chromium, Firefox, WebKit und Node über 1.080 Halbschritte.
- Nach Entfernen des Mesh wurden beide vollständigen Testsuiten erneut
  ausgeführt: **68 Modell-/Servertests und alle 45 Browserfälle bestanden**.
  Der endgültige Environment-Code entspricht exakt dem gemessenen Stand
  mit ausschließlich Richtungscache. Der laufende LAN-Server auf Port 4173
  liefert diese Fassung bereits aus.

Die Protokollversion bleibt `liquid-pixel-lockstep-2`, weil die Änderungen
dieselben spielentscheidenden Zustände und Wegwerte liefern. Die gemessenen
Prozente beschreiben Simulationszeit auf dem Messrechner, keine entsprechende
FPS-Zusage auf anderen Geräten.

## Lokale Nachweise und Wiederholung

Unter dem git-ignorierten Verzeichnis `artifacts/performance/` liegen:

- `original-tricks-directions.json`: Richtungscache gegen den vorherigen Stand.
- `original-tricks-combined.json`: direkter Vergleich des verworfenen Stands mit beiden Änderungen.
- `original-tricks-mesh.json`: erster Versuch mit maximal 16 Zellen.
- `original-tricks-mesh-sizes.json`: orientierende Auswahl der Bereichsgröße.
- `original-tricks-mesh-64.json`, `original-tricks-mesh-456.json`,
  `original-tricks-mesh-789.json`: endgültige Mesh-Vergleiche mit drei Karten.
- `versions/original-tricks-baseline`, `versions/original-tricks-directions`,
  `versions/original-tricks-mesh-16`, `versions/original-tricks-mesh-64`:
  gespeicherte Quelldateien der verglichenen Stände.
- `navigation-optimized.json`, `navigation-directions.json` und
  `navigation-browser-baseline.json`: normale Browserläufe mit Mesh, mit Cache
  und ohne beide Änderungen, zugehörige CPU-Profile und Screenshots.

Mit den vorhandenen lokalen Zwischenständen:

```bash
npm run compare:model -- artifacts/performance/versions/original-tricks-baseline artifacts/performance/versions/original-tricks-directions directions-repeat
npm run compare:model -- artifacts/performance/versions/original-tricks-directions artifacts/performance/versions/original-tricks-mesh-64 mesh-repeat 123
npm run compare:model -- artifacts/performance/versions/original-tricks-directions artifacts/performance/versions/original-tricks-mesh-64 mesh-repeat-456 456
npm run compare:model -- artifacts/performance/versions/original-tricks-baseline artifacts/performance/versions/original-tricks-mesh-64 combined-repeat
npm run profile:multiplayer -- directions-browser-repeat artifacts/performance/versions/original-tricks-directions/Environment.js
```

Bei `compare:model` ist das letzte optionale Argument der Karten-Seed,
standardmäßig 123. Bei `profile:multiplayer` ist es die alternative
Environment-Quelldatei mit denselben übrigen Abhängigkeiten.
Messungen nacheinander und ohne parallele Tests ausführen. Lokale
Zwischenstände sind keine Voraussetzung für Spiel oder reguläre Tests.
