# Prüfung der Pixelbewegung

Stand: 9. November 2026. Die Prüfungen betreffen die lokale Bewegung, nicht
Partikelübernahme oder Netzwerkspiel. Performancevorgaben sind keine
Abnahmekriterien dieser Phase.

## Anforderungen und Nachweise

| Anforderung | Nachweis |
| --- | --- |
| Keine logische oder sichtbare Doppelbelegung | Ein Partikel belegt eine 4×4-Zelle; sein gezeichneter Kern liegt innerhalb dieser Fläche. Spawn, Respawn, lange Läufe und zufällige Labyrinthe prüfen eindeutige Positionen sowie Rasterbesitz. |
| Hindernisse umgehen | Ein Partikel sowie die volle Wolke umgehen eine endliche Wand. 1.000 Partikel verlassen ein U und erreichen die Zielseite. |
| Keine Wanddurchtritte | Jeder Schritt geht nur in eine Nachbarzelle. Tests decken dünne Wände, hohe Bewegungsbudgets und gesperrte diagonale Ecken ab. |
| Engstellen bewältigen | 100 Partikel passieren im Browser eine Öffnung von genau einer Partikelbreite. |
| Ränder und Ecken verlassen | Alle vier Ränder und Ecken werden angefahren und wieder verlassen; zusätzlich werden mit 1.000 Partikeln neun Ziele über 2.160 logische Frames gewechselt. |
| Maus und Tastatur funktionieren | Echte Browserereignisse steuern Mausziele und Pfeiltasten. Ein über dem Canvas liegender Spawn-Button malt keine Hindernisse. |
| Malen überschreibt keine Partikel und lässt keine Lücken zwischen Mausereignissen | Schnelle Striche werden kontinuierlich gefüllt, auch bis zum Spielfeldrand. Belegte Zellen werden beim Malen ausgespart. Geometrieänderungen invalidieren das Wegfeld. |
| Unerreichbare Ziele bleiben sicher | Eine versiegelte Wand bleibt undurchquerbar; anschließendes Zurücksteuern funktioniert. Ziele auf Hindernissen werden auf freie Zellen projiziert. |
| Kreis statt Raute oder Achteck | 1.000 ruhende Pixel werden in 32 Winkelsektoren ausgewertet: Verhältnis der Außenradien unter 1,06, maximaler Radius unter 82 Pixeln; mindestens 95 % des inneren Kreises sind gefüllt. |
| Individuen statt starrer Verschiebung | Stabile IDs erlauben den Vergleich einzelner Einheiten. Ein Bewegungsschritt erzeugt mehr als acht Verschiebungsvektoren; weniger als 75 % der Einheiten teilen denselben Vektor. Eine echte Browseranimation ergänzt diese Zustandsprüfung. |
| Wiederholbarkeit | Gleicher Seed und gleiche Eingaben erzeugen nach Reset identische Zustände. Die Bewegung selbst verwendet keine frischen Zufallszahlen. |

## Testbefehle und Artefakte

```bash
npm test -- --runInBand
npm run test:browser
npm run play:agent
npm run play:preview
```

Die Testdefinitionen stehen in `__tests__/environment.test.js`,
`browser-tests/game.spec.js` und `browser-tests/movement.spec.js`.
Der erste Prüflauf am 8. November umfasste 23 Unit- und 31 Browsertests ohne
erwartete Fehlschläge oder übersprungene Fälle, einschließlich der neuen
Darstellungs- und Steuerungsprüfungen. Der aufgezeichnete Wandlauf erreicht
mit allen 1.000 Partikeln die Zielseite; alle Belegungsdiagnosen bleiben null.
Der Kreisfall liefert Außenradien von etwa 71,6 bis 75,2 Pixeln
(damalige 16-Sektoren-Prüfung: Verhältnis 1,05). Der aufgezeichnete Einzelbewegungsfall enthält 19
Verschiebungsvektoren; der häufigste betrifft 40,6 % der Einheiten.

Nach der Korrektur der achteckigen Außenform am 9. November bestehen alle
68 Modell-/Serverprüfungen und alle 45 Browserfälle. Dazu gehören die strengere
32-Sektoren-Kreisprüfung, vollständige lokale und Online-Übernahmen sowie
identische Zustände in Chromium, Firefox, WebKit und Node. Die früheren
Performance-Replays dokumentieren den damaligen Stand; diese bewusste
Regeländerung verwendet `liquid-pixel-lockstep-3`.

Die zwölf Labyrinth-Seeds prüfen neben jeder Bewegung auch, dass alle freien
Nichtzielzellen mindestens einen absteigenden Weg im korrigierten Potential
haben. So werden lokale Minima durch die Kreiskorrektur gezielt gesucht.
Zusätzlich werden auf 300 kleinen Labyrinthen insgesamt 1.800 Start-Ziel-Paare
durchlaufen. Ein unabhängiger Vierwege-Flood-Fill bestimmt erreichbare Ziele;
das echte Pixel muss anschließend genau dort ankommen. Dadurch werden auch
sichere, aber kreisende Wege erfasst. Alle 1.800 Fälle bestehen.

`test-results/` enthält Zustände und Screenshots der Browserfälle.
`artifacts/agent-play/` enthält eine vollständige Wandumgehung und Trace;
`artifacts/swarm-preview/` eine Aufnahme der laufenden Animation und Bilder
zu den Zielwechseln. Diese generierten Dateien werden nicht committet.

## Bezug zum Original und eigene Ergänzungen

Wie im Original werden zuerst Hindernisdistanzen berechnet und danach pro
Einheit freie Haupt-, gute und seitliche Bewegungen geprüft. Richtungs- und
Verarbeitungsprioritäten variieren reproduzierbar. Siehe
[Referenznotizen](liquid-war-reference.md).

Unsere gleichmäßigen 4×4-Zellen ersetzen das adaptive Mesh des Originals.
Ein vollständiger Dijkstra-Lauf berechnet Raster-Umwegkosten mit 10/14 für
Achsen- und Diagonalschritte. Für die freie Kreisform wird dessen Winkelbias
entfernt: Aus dem Wegwert wird die direkte Rasterdistanz herausgerechnet und
die euklidische Distanz eingesetzt. Der Hindernisumweg bleibt dadurch als
Zusatzkosten erhalten. Das ist eine eigene Ergänzung für die hier gewünschte
organische Form, keine Behauptung über die exakte Originalimplementierung.

Die Ergänzung vom 9. November begrenzt seitliches Abdriften vom Ziel weg:
Alternativen mit kleinerem Potential bleiben immer erhalten. Andere Schritte
müssen in die bisher erlaubte Richtung zeigen und dürfen das Potential um
höchstens 300 erhöhen, also drei Zehntel eines freien Achsenschritts. Zuvor
erlaubte insbesondere das senkrechte Ausweichen größere Schritte nach außen;
die Wolke entwickelte dadurch acht flache Seiten. Ganz ohne solche kleinen
Ausweichschritte konnten im Übernahmetest einzelne Gegner übrig bleiben.
Beide Anforderungen werden deshalb gemeinsam geprüft.

Bei 1.000 Partikeln sinkt das Verhältnis der 32 Außenradien von rund 1,10
auf rund 1,05. Der bestehende Browsertest wurde von
16 Sektoren und 15 % Toleranz auf 32 Sektoren und 6 % verschärft, damit auch
das vorherige Achteck als Fehler erkannt wird. Die Darstellung verwendet
weiterhin die tatsächlichen Rasterpositionen; es gibt keine Kreis-Maske.

Einheiten haben eigene, versetzte Bewegungstakte. Die Reihenfolge wechselt
lokal innerhalb sich verschiebender Potentialbänder. Ein strikt von vorne
nach hinten abgearbeiteter, synchroner Gesamtblock wird dadurch vermieden.
Die helle Schattierung ist pro Einheit stabil und macht die tatsächlichen
individuellen Bewegungen sichtbar. Sie ist kein Ersatz für diese Bewegung.

## Grenzen der Aussage

Die Tests sichern die genannten Fehlerklassen und Szenarien ab. Sie beweisen
nicht die Abwesenheit jedes denkbaren Fehlers auf beliebigen Karten. Das
Bewegungsgefühl wird zusätzlich anhand der Animation und im direkten Spiel
mit dem Nutzer beurteilt. Partikel können bei fehlendem Platz oder einem
versiegelten Bereich naturgemäß nicht alle das Mausziel erreichen.
