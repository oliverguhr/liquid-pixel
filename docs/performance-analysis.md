# Performanceanalyse des Mehrspielermodus

Stand: 8. November 2026, Spielstand `fc8b77f`. Anlass: Das Notebook läuft
beim Spiel mit zwei Personen am Limit und die Darstellung ruckelt.

**Fortschreibung vom 9. November:** Die acht Versuche wurden inzwischen
beauftragt, implementiert und einzeln gemessen. Ergebnisse und Entscheidungen
stehen in [performance-results.md](performance-results.md). Die folgenden
Messwerte und Einschätzungen dokumentieren den Ausgangsstand.

Die Analyse bestätigt Engpässe in der Client-Simulation und in der Darstellung.
Der separat gemessene Server benötigt für ein Match etwa **1,8 % eines
CPU-Kerns**. Die folgenden Empfehlungen sollen schrittweise umgesetzt werden;
die Messskripte und diese Dokumentation ändern noch keine Spielregeln oder Optik.

## Messaufbau und Grenzen

- Intel Core i7-1165G7, Node 26.13.0, Playwright Chromium 158.0.8127.18.
- Normale Welt mit 800×800 Koordinaten, 4×4-Zellen, zwei Teams mit jeweils
  1.000 Partikeln und Zufallskarte aus Seed 123 mit 2.820 Hinderniszellen.
- Zwei echte Browser-Sitzungen ohne `?debug`, normale Lobby und WebSockets,
  Mausereignisse für beide Spieler. Der Messserver läuft auf einem eigenen
  temporären Port und in einem getrennten Prozess. Der LAN-Spielserver wird
  nicht verwendet oder beendet.
- Nach zwei Sekunden Aufwärmen: fünf Sekunden unveränderte Ziele,
  160 Zieländerungen im angestrebten 50-ms-Abstand und fünf Sekunden Kontakt.
  Unter Last dauern die Mausereignisse länger; dieser Live-Lauf ist deshalb
  kein identisches Replay für einen exakten Vorher-Nachher-Vergleich.
- Der ergänzende Node-Lauf verwendet dagegen exakt dieselben Eingaben pro
  Simulationsschritt. Drei aufeinanderfolgende Phasen umfassen jeweils
  720 Halbschritte, also zwölf simulierte Sekunden. Die erste Phase enthält
  den kalten ersten Wegfeldaufbau; die letzte läuft nach einem Sieg weiter.
- Die Zeitmessungen umschließen echte Methoden; CPU-Stichproben lokalisieren
  zusätzlich die teuren Funktionen. Gemessene Wegfeldzeiten sind bereits in
  der Simulationszeit enthalten, also nicht dazuaddieren. Messung und Profiler
  verursachen selbst etwas Aufwand. Werte sind Beobachtungen, keine Testgrenzen.
- **Der automatisierte Browser verwendet Software-Rendering/SwiftShader.**
  Die Grafikwerte und FPS sind daher keine Messung des vom Nutzer geöffneten
  Browsers mit dessen Grafikbeschleunigung. Beide Testclients laufen außerdem
  auf demselben Rechner. Die getrennte Node-Messung bestätigt den CPU-Engpass
  unabhängig von der Grafik. GPU-Metadaten stehen in den Browser-JSON-Dateien.

## Ergebnisse

Wiederholung mit getrenntem Serverprozess, beide Clients:

| Situation | Bilder/s | Simulation pro Halbschritt, Mittel | Simulation p95 | Zeichnen pro Bild, Mittel |
| --- | ---: | ---: | ---: | ---: |
| Ziele bleiben stehen | 31,8–32,4 | 5,98–6,02 ms | 8,2–8,6 ms | 16,35–16,73 ms |
| Beide Ziele bewegen sich | 19,1 | 10,07–10,23 ms | 37,5–37,9 ms | 16,24–16,66 ms |
| Wolken kommen in Kontakt | 28,6–28,9 | 6,64–6,71 ms | 9,6–10,3 ms | 16,70–16,74 ms |

Die Simulation schafft im Live-Lauf weiterhin ungefähr 59–60 Halbschritte
pro Sekunde, zeichnet aber oft erst nach mehreren Schritten wieder. Bei
bewegten Zielen sind es im Mittel 3,1 Schritte pro Bild. 95 % der vollständigen
Zeichenaufrufe inklusive Aufholen dauern höchstens etwa 68–69 ms. Für 60 FPS
stehen nur 16,7 ms für ein ganzes Bild zur Verfügung.

438 gemeinsame Zustandsberichte stimmen überein; kein Browserfehler und kein
Desync. Am letzten gemeinsam ausgelesenen Prüfpunkt: Tick 1308, Hash
`388be249fce70785`, Teamzahlen `[1647, 353]`. Das belegt synchrones Spiel trotz
ruckelnder Darstellung, keine allgemeine Geschwindigkeitsgarantie.

Der Node-Lauf mit festem Replay ergibt bei bewegten Zielen **18,82 ms pro
Halbschritt im Mittel, p95 43,99 ms**. Die Wegfeldberechnung benötigt dabei
8,32 Sekunden von rund 13,55 Sekunden Simulationszeit, also etwa 61 %.
Auch ohne Zieländerungen kosten die Schritte im Mittel 9,14 ms.
Unterschiede zum Browser entstehen unter anderem durch die exakt höhere
Zielwechselrate, Laufzeit/JIT und den unterschiedlichen Verlauf der Figuren.

## 1. Wiederholte Berechnung des gesamten Wegfelds

Fundstellen: `Environment.js`, `updateGradient` ab Zeile 198,
`canTraverse` ab Zeile 167; `Determinism.js`, `distance` ab Zeile 10.

Bei jeder neuen Zielzelle berechnet Dijkstra die Distanzen für das gesamte
200×200-Raster neu. Danach folgt ein weiterer vollständiger Durchlauf für
das euklidische Potential. Bei zwei bewegten Spielern sind bis zu 40 solche
Berechnungen je Sekunde und Client möglich. Bei unverändertem Ziel greift
bereits ein Cache; ihn einfach nochmals hinzuzufügen wäre keine Verbesserung.

In diesen Schleifen werden dieselben Hindernisse und diagonalen Eckverbote
immer wieder geprüft, obwohl das Gelände im Online-Match konstant bleibt.
Die euklidischen Distanzen sind ebenfalls schon zwischengespeichert, aber
jeder Zugriff baut einen neuen Textschlüssel und fragt die Map zweimal ab.
Beides erscheint deutlich in den CPU-Profilen.

Einfache Ansatzpunkte: Begehbare Nachbarverbindungen beim Geometrieaufbau
vorberechnen und nach Malen/Löschen neu aufbauen. Für den Entfernungscache
einen eindeutig definierten numerischen Schlüssel und einen Zugriff verwenden;
die exakte ganzzahlige Berechnung beibehalten. Wenn das Ziel bereits in einer
Komponente liegt, ist dort die nächste freie Zielzelle unmittelbar bekannt;
die aufwendige Suche bleibt für Ziele auf Wänden oder in anderen Komponenten.

Ein anderer Wegfindungsalgorithmus, ein gröberes Raster oder asynchron
nachgereichte Wegfelder wären größere Eingriffe. Dafür ergibt sich aus dieser
Analyse noch kein Bedarf; zuerst die einfachen Schritte messen.

## 2. Mehrfache Sortierungen und Nachbarprüfungen pro Partikel

Fundstellen: `Environment.js`, `movementOptions` ab Zeile 256 und
`updateSubstep` ab Zeile 338.

Mit den Standardwerten gibt es drei Bewegungsrunden je Halbschritt. Jede
Runde filtert und sortiert die berechtigten Partikel. Der Sortiervergleich
berechnet Potentialband, Zellzugriff und Priorität für dieselbe Einheit
mehrfach neu. Hinzu kommen pro Bewegungsversuch zwei Sortierungen der bis
zu acht Nachbarn sowie mehrere Filter. Beim Kontakt wird diese Auswahl
erneut berechnet. Dadurch bleibt die Last auch bei stehendem Mauszeiger hoch.

Einfache Ansatzpunkte, einzeln prüfen:

1. Sortierschlüssel einmal pro Partikel **und Bewegungsrunde** berechnen und
   beim Sortieren nur die gespeicherten Werte vergleichen. Die Position kann
   sich zwischen Runden ändern; ein Schlüssel für den ganzen Frame wäre falsch.
2. Den Hauptnachbarn mit einem linearen Minimum suchen. Die erste vollständige
   Nachbarsortierung wird nur für ihr erstes Element gebraucht. Die nachfolgende
   Kandidatenreihenfolge und sämtliche Gleichstandsregeln bleiben verbindlich.
3. Die vorberechneten begehbaren Verbindungen auch hier nutzen. Belegung durch
   Partikel weiterhin aktuell prüfen, da sie sich bei jeder Bewegung ändert.

Kein Pooling, keine Worker-Verteilung und kein Umbau der gesamten Datenstruktur
sind für diese ersten Änderungen nötig. Neue Caches sollen klar benannte Werte
und einen einzigen nachvollziehbaren Zeitpunkt für ihre Erneuerung haben.

## 3. Leuchteffekte auf dem hochauflösenden Canvas

Fundstellen: `Renderer.js`, `render` ab Zeile 110;
`Game.js`, `renderingDensity` ab Zeile 14.

Je Bild werden 2.000 additive Leuchtsprites und 2.000 Partikelsprites
gezeichnet. Die Texturen sind bereits gecacht; teuer ist hier das wiederholte
Zeichnen und Mischen. Das Canvas ist mindestens 1600×1600 groß, bei Dichte 3
2400×2400, auch wenn die sichtbare Fläche deutlich kleiner ist.

Ein isolierter Vergleich mit identischem, pausiertem Zustand überspringt nur
die Leucht-Zeichenaufrufe im Messbrowser. Er verändert keine Spieldateien:

| Pixeldichte | Mit Leuchten, Mittel | Ohne Leuchten, Mittel |
| --- | ---: | ---: |
| 1 | 11,03 ms | 4,74 ms |
| 2, normale Mindestdichte | 14,32 ms | 3,00 ms |
| 3 | 24,57 ms | 2,75 ms |

Damit ist der Leuchtpass in diesem Software-Renderer als großer Kostenfaktor
isoliert. Die Zahlen sind keine Zusage für Hardware-Rendering. Das Entfernen
aller Effekte dient nur der Diagnose, nicht als abgenommene neue Optik.

Der Nutzer möchte die Leuchteffekte ausdrücklich behalten. Als Versuch ist
eine separate Leuchtebene in geringerer Auflösung vorgesehen, während
Partikelkerne und Konturen scharf bleiben. Visuell vergleichen und auf dem
Notebook mit dessen Browser nachmessen. Das Abschalten der Effekte oder eine
Rückkehr zur alten groben Spielauflösung sind keine vorgesehenen Optimierungen.

## Kleinere Kosten und Verstärker

- `MatchSimulation.report/state`: Etwa 0,75–0,80 ms je Bericht im Live-Lauf,
  ungefähr 20-mal pro Sekunde. Dabei werden auch die unveränderten Hindernisse
  neu sortiert und der Gesamtzustand als JSON gehasht. Ein Cache der sortierten
  Geometrie ist möglich, hat gegenüber Simulation und Darstellung aber niedrigere
  Priorität. Häufigkeit und Inhalt der Synchronitätsprüfung zuerst beibehalten.
- `Multiplayer.receive` ruft auch nach jedem Frame und jeder Bestätigung die
  UI-Aktualisierung auf. Die gemessene Laufzeit liegt meist unter 0,1 ms;
  unnötige DOM-Schreibvorgänge sind hier ein kleiner Aufräumpunkt.
- `Multiplayer.advance`: Bis zu sechs Simulationsschritte pro Bild holen
  Rückstand auf. Das erklärt lange Einzelbilder unter Last. Die gemeinsame
  Schrittfolge und das Rückstaufenster des Servers sichern die Synchronität;
  bloß Schritte auszulassen würde dieses Problem falsch lösen.
- Der Server hat im getrennten Prozess rund 358 ms CPU-Zeit in 19,98 Sekunden
  benötigt, entsprechend 1,79 % eines Kerns für ein Match. Das ist keine
  Skalierungsprüfung mit vielen Matches, liefert aber keinen Hinweis auf den
  Server als Engpass in diesem Zwei-Personen-Szenario.
- Eine Speicherbereinigung ist im CPU-Profil sichtbar, dominiert es aber
  nicht. Diese Untersuchung ist kein Langzeittest auf Speicherlecks.

## Optimierungsliste nach erwartetem Gewinn

**Ursprüngliche Planung vor der Umsetzung.** Der Nutzer hatte zunächst
ausschließlich diese Liste beauftragt und anschließend die acht Versuche
freigegeben. Die Reihenfolge bewertet die erwartete Einsparung auf dem Client,
nicht das Verhältnis von Nutzen zu Aufwand. Innerhalb ähnlicher Größenordnungen
ist sie vorläufig; die Verbesserungen selbst sind noch nicht gemessen.

| Rang | Geplanter Versuch | Erwarteter Gewinn | Aufwand und Grenzen |
| --- | --- | --- | --- |
| 1 | Leuchten auf einer separaten Ebene mit geringerer Auflösung zeichnen und hochskalieren; Partikelkerne bleiben scharf. | Hoch im Software-Renderer; auf der Notebook-GPU noch offen. | Mittel. Leuchten erhalten und Aussehen vergleichen. Die gemessene Differenz von rund 11 ms bei Dichte 2 beschreibt vollständiges Weglassen, nicht die erwartete Einsparung dieses Versuchs. |
| 2 | Begehbare Nachbarverbindungen und diagonale Eckverbote pro Karte vorberechnen und für Wegfelder sowie Bewegung wiederverwenden. | Mittel bis hoch; spart Arbeit in beiden großen Rechenbereichen. | Gering bis mittel. Nach Malen/Löschen erneuern; bewegliche Partikelbelegung weiterhin aktuell prüfen. |
| 3 | Bei der Nachbarauswahl die erste vollständige Sortierung durch eine Minimumsuche ersetzen. | Mittel bis hoch durch die vielen Bewegungs- und Kontaktversuche. | Gering bis mittel. Gleichen Hauptnachbarn und exakt dieselbe spätere Kandidatenreihenfolge erhalten. |
| 4 | Sortierschlüssel der Partikel einmal pro Bewegungsrunde berechnen. | Mittel; weniger Zellzugriffe und Rechnungen in den vielen Sortiervergleichen. | Gering. Nach Bewegungen in der nächsten Runde neu berechnen und Gleichstandsregeln erhalten. |
| 5 | Den vorhandenen Cache euklidischer Entfernungen mit numerischen Schlüsseln und einem Zugriff nutzen. | Mittel bei häufigen Zielwechseln. | Gering. Eindeutige Schlüssel, Wertebereich und exakte ganzzahlige Ergebnisse absichern. |
| 6 | Eine freie Zielzelle direkt als Ziel ihrer eigenen Komponente verwenden. | Klein; spart einen Kartendurchlauf je Zielwechsel, Dijkstra bleibt bestehen. | Gering. Die bisherige Suche für Ziele in Wänden und andere Komponenten behalten. |
| 7 | Sortierte statische Hinderniskoordinaten für Zustandsberichte wiederverwenden. | Klein; nur ein Teil der insgesamt etwa 0,8 ms pro Bericht entfällt. | Gering. Cache bei Geländeänderung erneuern; Inhalt und Häufigkeit der Prüfsummen erhalten. |
| 8 | Lobby-/Statusanzeigen nur bei tatsächlichen Änderungen ins DOM schreiben. | Sehr klein im aktuellen Profil. | Gering. Alle Statuswechsel weiterhin sofort anzeigen. |

Die Wirkungen überlappen sich und sind nicht einfach addierbar. Insbesondere
ist die gesamte gemessene Wegfeldzeit keine Einsparungsprognose für Rang 2.
Für einen besonders kleinen ersten Versuch bietet sich Rang 4 an; das ist
eine Empfehlung nach Aufwand und Risiko aus der ursprünglichen Planung.

### Größerer Ansatz mit noch unklarem Gewinn

Grobe gemeinsame Wegplanung, etwa mit A*, plus feinere lokale Distanzfelder
könnte weniger Kartenfläche untersuchen und damit einen sehr hohen Gewinn
bringen. Ohne Prototyp lässt sich dieser Vorschlag nicht seriös in die
obige Rangfolge einordnen. Aufwand und zusätzliche Komplexität sind hoch:
Teilwolken auf verschiedenen Hindernisseiten brauchen jeweils erreichbare
Anschlüsse, ein Schwerpunkt kann in einer Wand liegen, und schmale Durchgänge
müssen erhalten bleiben. Ein einzelner zentraler Pfad mit ausschließlich
lokalem Ausweichen garantiert diese Eigenschaften nicht.

Auch eine inkrementelle Aktualisierung bestehender Felder bei Zielwechseln
bleibt eine spätere Untersuchungsoption. Bei unverändertem Ziel werden die
Felder schon heute wiederverwendet; diese vorhandene Funktion zählt nicht
als neue Optimierung. Beide größeren Ansätze bleiben Reserveoptionen außerhalb
der inzwischen durchgeführten acht begrenzten Versuche.

## Absicherung nach Auswahl eines Versuchs

Jeden ausgewählten Versuch einzeln umsetzen und mit denselben Messbefehlen
vergleichen. Optimierungen ohne nachweisbaren Nutzen wieder entfernen.
Lesbarkeit, erhaltene Leuchteffekte und deterministische Synchronität bleiben
verbindlich.

Für Änderungen an der Simulation gelten weiterhin die bestehenden Bewegungs-
und Übernahmetests sowie identische vollständige Zustände in Chromium,
Firefox, WebKit und Node. Zusätzlich das feste Replay gegen den bisherigen
Stand vergleichen. Referenzhashes dieses Replays:

| Ende der Phase | Tick | Hash |
| --- | ---: | --- |
| stationary | 720 | `cf0f7e67d2be652f` |
| moving-targets | 1440 | `1b968c079d4f4fa7` |
| contact | 2160 | `6dc9f598d7ae198c` |

Die Hashes sind zusätzliche Vergleichspunkte, kein Ersatz für die
Verhaltenstests. Änderungen der tatsächlichen Regeln erfordern weiterhin
die Prüfung der Protokollversion. Renderänderungen müssen nachweislich
denselben Modellzustand erhalten und im laufenden Spiel beurteilt werden.

## Messungen wiederholen

Nach Installation von Node-Abhängigkeiten und Playwright-Chromium:

```bash
npm run profile:model
npm run profile:multiplayer -- baseline-isolated
npm run profile:rendering
```

Auf dieser Arbeitsumgebung für die Browserbefehle zusätzlich
`PLAYWRIGHT_BROWSERS_PATH=/tmp/liquid-pixel-browsers` setzen. Die Befehle
nacheinander ausführen, damit sich die Messungen nicht gegenseitig belasten.

Alle drei Befehle wurden erfolgreich ausgeführt. Die Prüfung des
Rendervergleichs bestätigt einen unveränderten Zustandsbericht; der Live-Lauf
prüft übereinstimmende Berichte und Browserfehler. Die gesamte vorhandene
Spieletestsuite wurde für diese Analyse nicht erneut ausgeführt, da kein
Produktionscode geändert wurde.

JSON-Messungen, Screenshots und CPU-Profile liegen unter
`artifacts/performance/` und bleiben git-ignoriert. Die `.cpuprofile`-Dateien
können in den JavaScript-Profiler der Browser-Entwicklerwerkzeuge geladen
werden. `model.json`, `baseline-isolated.json` und `rendering.json` werden bei
erneuten Läufen überschrieben; für den Live-Lauf kann ein anderer Dateiname
als Argument angegeben werden.
