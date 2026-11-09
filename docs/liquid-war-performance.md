# Performance-Tricks im Original von Liquid War

Stand: 9. November 2026. Untersucht wurde erneut **Liquid War 5.6.6**,
insbesondere `mesh.c`, `grad.c`, `cursor.c`, `move.c`, `fighter.c`, `area.h`,
`disp.c`, `distor.c`, `game.c` sowie die zugehörigen Assemblerpfade.
Der Originalcode wurde gelesen, nicht gebaut oder gemessen. Aussagen zum
möglichen Nutzen für Liquid Pixel sind deshalb Vorschläge, keine Messwerte.

Quellarchiv, Prüfsumme und allgemeine Fundstellen stehen in
[liquid-war-reference.md](liquid-war-reference.md). Ergänzende Primärquellen:
[Algorithmusbeschreibung](https://ufoot.org/liquidwar/v5/techinfo/algorithm/en/)
und [Quelldateiübersicht des Entwicklers](https://ufoot.org/liquidwar/v5/techinfo/source/en/).
Alle folgenden Zeilennummern beziehen sich auf das dort verlinkte Archiv 5.6.6.

## 1. Adaptive Kartenbereiche statt eines Wegwerts pro Pixel

**Beobachtung:** `src/mesh.c:166` (`group_mesher`) fasst geeignete freie
Quadrate zusammen. `create_mesh` ab Zeile 344 wiederholt das mit verdoppelter
Kantenlänge; `MESH_MAX_ELEM_SIZE` in Zeile 84 begrenzt sie auf 16. So entstehen
Bereiche mit Kantenlängen 1, 2, 4, 8 und 16 und vorbereiteten Verbindungen in
zwölf Richtungen. Große freie Flächen lassen sich grob darstellen; Hindernisse
und die Bedingungen für Verbindungen begrenzen das Zusammenfassen.

Ein freier 16×16-Bereich kann einen gemeinsamen Wegwert pro Team bekommen,
statt 256 einzelne Werte zu benötigen. Das ist eine lokale Reduktion der
Wegknoten, keine gemessene Beschleunigung um Faktor 256 für das ganze Spiel.
Die Belegung bleibt pixelgenau: `src/area.c:86` legt für jede Position einen
Verweis auf ihren Mesh-Bereich und ihren individuellen Bewohner an.

**Für uns:** Das ist ein vielversprechender größerer Ansatz für die
Wegfindung. Ein gröberes Navigationsmesh würde weder größere Partikel noch
eine niedrigere Darstellungsauflösung verlangen. Wir verwenden bisher
40.000 gleich große Zellen. Der Aufbau und die Aktualisierung beim Malen
von Hindernissen wären zusätzliche Arbeit; enge Durchgänge, Ecken und die
runde Wolke müssten erhalten bleiben. Der mögliche Gewinn hängt von der Karte ab.

## 2. Das vorhandene Feld mit wenigen Operationen weiterentwickeln

**Beobachtung:** `src/grad.c:135`, `spread_single_gradient`, verwendet einen
gerichteten Relaxationsdurchlauf. Pro logischem Takt wird mit
`(GLOBAL_CLOCK * 7) % 12` eine Richtung ausgewählt. Für jeden Bereich und jedes
aktive Team wird geprüft, ob sein Nachbar über ihn einen kleineren Wegwert
erhalten kann. Die Kosten für das Durchqueren entsprechen der Bereichsgröße.
Je nach Richtung wird das Mesh-Array vorwärts oder rückwärts durchlaufen.
`src/game.c:590` ruft diesen Durchlauf einmal pro Logiktakt auf.

Das Original benötigt in diesem Pfad weder A* noch eine Dijkstra-Prioritätsqueue.
Es berechnet auch nicht bei jeder Cursorbewegung ein vollständig neues,
auskonvergiertes Feld. Die alten Werte bleiben erhalten und werden über
mehrere Takte verbessert. Ein Durchlauf kostet proportional zur Zahl der
Mesh-Bereiche mal der Zahl aktiver Teams; mehrere Durchläufe können nötig sein.

Die Entwicklerbeschreibung nennt ungefähr zehn Prozent tolerierte
Wegungenauigkeit. Das ist eine Beschreibung des Spielanspruchs, keine im
gelesenen Code nachgewiesene Fehlergrenze für beliebige Karten oder Zielwechsel.

**Für uns:** Das könnte die Kosten bewegter Ziele senken. Unser Dijkstra
berechnet bei einer neuen Zielzelle bisher das gesamte Feld neu, bei gleichem
Ziel wird es schon wiederverwendet. Eine schrittweise Aktualisierung verändert
jedoch die Reaktion der Partikel auf Ziele. Unfertige Felder könnten vorübergehend
in alte Richtungen zeigen. Die Zahl und Reihenfolge der Arbeitsschritte müsste
im Multiplayer an logische Takte gebunden sein, nicht an verfügbare Millisekunden
oder die Bildrate des jeweiligen Clients.

## 3. Ein abgesenkter Cursorwert vermeidet das Anheben aller Wegwerte

**Beobachtung:** Der Kommentar in `src/cursor.c:111` erklärt einen besonders
kleinen, aber wesentlichen Trick: Der Cursor beginnt mit einem hohen
Ausgangswert. Wenn er sich bewegt, wird dieser verringert. So lassen sich
neue Informationen weiterhin durch kleinere Werte verbreiten, statt die
gesamte Karte zunächst um den Bewegungsbetrag anheben zu müssen.

Die tatsächliche Bedingung steht in `src/move.c:394`: Der Wert sinkt bei
erfolgter Bewegung und zusätzlich periodisch bei einem durch 13 teilbaren
Spielzeit-Zähler. Der Kommentar begründet die periodische Absenkung mit dem
Vermeiden von Kreisbewegungen verlorener Partikel. `apply_all_cursor`
in `src/cursor.c:152` schreibt den Wert in den aktuellen Mesh-Bereich.

**Für uns:** Damit beantwortet das Original die Frage nach der Wiederverwendung
alter Gradienten sehr konkret. Allerdings bewegt sich sein Spielcursor in
geprüften Nachbarschritten über begehbare Positionen (`src/move.c:326`).
Je nach Einstellung sind mehrere solcher Schritte pro Takt möglich
(`move_all_cursors`, Zeile 484). Unsere Mausziele dürfen dagegen direkt über
Wände springen oder auf Wänden liegen. Nur den Cursorwert bei jedem solchen
Sprung um eins zu senken wäre keine gleichwertige Übertragung. Große Sprünge,
Geländeänderungen und unerreichbare Bereiche brauchen eigene Regeln.

## 4. Gemeinsame Richtungen, vorbereitete Tabellen, kurze Partikelschleife

**Beobachtung:** In `src/fighter.c:407` wird die Hauptbewegungsrichtung für
einen Mesh-Bereich und ein Team höchstens einmal pro Logiktakt berechnet und
dann wiederverwendet. Die Berechnung erfolgt erst, wenn dort ein Partikel
verarbeitet wird. Im Bereich des Cursors gilt eine Ausnahme: `get_close_dir`
ab Zeile 271 bestimmt die Richtung aus dessen Position relativ zum Partikel.

`FIGHTER_MOVE_DIR` ab Zeile 82 enthält bereits die Reihenfolge von fünf
Bewegungsversuchen. `init_move_fighters` ab Zeile 146 berechnet daraus die
Koordinatenänderungen und Offsets im flachen Belegungsarray. Zur Laufzeit
werden freie Nachbarn direkt geprüft, mit Abbruch beim ersten erfolgreichen
Schritt (`fighter.c:425`). Keine Nachbarsortierung ist dafür nötig.

Der C-Pfad durchläuft das Armee-Array linear (`fighter.c:399`), ohne es in
jeder Bewegungsrunde zu sortieren. Zeitabhängige Tabellenwahl und wechselnde
Richtungsprioritäten sorgen trotzdem für deterministische Variation
(`fighter.c:371`, `403`). Angriffe und Heilung nutzen dieselben lokalen
Nachbarstellen. Die Parameter werden vor der Partikelschleife pro Team berechnet.

**Für uns:** Wiederverwendbare Navigation und weniger temporäre Kandidatenarrays
sind ein begrenzterer Versuch als ein neuer Wegalgorithmus. Statische begehbare
Nachbarn und die erste Minimumsuche haben wir bereits umgesetzt. Unsere
restliche Auswahl hängt aber auch von Partikel-ID und Takt ab, unsere
Aktualisierungsreihenfolge vom Potential. Eine einzige gecachte Richtung oder
eine feste globale Partikelreihenfolge würde diese Regeln ändern. Zunächst
wären die partikelunabhängigen Teile zu isolieren; individuelle Bewegung,
Kreisform und deterministische Gleichstände müssen erhalten bleiben.

## 5. Kompakte Daten und spezialisierte Rechenpfade

**Beobachtung:** `src/area.h:64` enthält einen kleinen Partikeldatensatz aus
Koordinaten, Gesundheit und Team. Das Spielfeld ist ein flaches Array von
Mesh-/Partikelverweisen (`area.c:90`). Mesh-Daten enthalten Integerwerte und
gepackte Richtungs-/Gradientenfelder (`mesh.h:70`). Laufende Bewegung verwendet
vorbereitete Arrays und direkte Zugriffe.

Zusätzlich existieren optionale Assemblerpfade für Gradienten (`spread.s`),
Partikel (`monster.s`) und die Wellenverzerrung (`glouglou.s`). Die
Gradientenroutinen sind sogar für zwei bis sechs Teams getrennt spezialisiert
(`spread.s:107`; Auswahl in `grad.c:152`). Diese Pfade sind durch Build- und
Laufzeiteinstellungen bedingt; es gibt weiterhin C-Implementierungen.

**Für uns:** Wiederverwendbare Puffer und flache numerische Arrays sind die
übertragbare Idee. Unsere Wegfelder sind bereits `Float64Array`s. Weitere
Umstellungen müssten einen messbaren Nutzen gegenüber den lesbaren
Objektstrukturen liefern. Assembler aus dem Original ist keine direkt nutzbare
Browseroptimierung; aus seiner Existenz folgt auch kein Bedarf an WebAssembly.

## 6. Einfache Pixelbilder, vorbereitete Effekte und getrennte Taktraten

**Beobachtung:** `erase_fighter` und `disp_fighter` in `src/fighter.c:129`
stellen am alten Ort den Hintergrund wieder her und schreiben am neuen Ort
einen Farbwert. Auch Gesundheitsänderungen aktualisieren die entsprechende
Stelle. Das Spielfeldbild bleibt zwischen den Schritten erhalten.
`src/disp.c:73` skaliert dieses Bild anschließend zur Ausgabe. Der finale
Bildschirmtransfer ist also nicht auf einzelne geänderte Pixel beschränkt.

Der Wellenmodus berechnet Tabellen entlang der Bildachsen
(`src/distor.c:244`, `prepare_wave_shapes`); die innere Pixelschleife ab Zeile
356 arbeitet mit diesen Tabellen und ganzzahliger Positionsfortschreibung.
Die zeitabhängigen Wellentabellen werden dabei für die Ausgabe erneuert,
nicht nur einmal beim Spielstart vorbereitet.

`src/game.c:777` kann mehrere Logikrunden vor einer Bildausgabe ausführen;
eine konfigurierbare Bildratenbegrenzung spart unnötige Darstellungen.
Die Gradienten- und Bewegungszeit wird bereits getrennt profiliert
(`game.c:581`, `597`).

**Für uns:** Einzelne Palettenpixel sind wesentlich günstiger als viele
überlappende transparente Leuchtflächen. Das Wiederherstellen nur der alten
Partikelposition lässt sich deshalb nicht unverändert auf unsere Halos
übertragen. Statischer Hintergrund, vorberechnete Effekte und eine kleinere
Leuchtebene sind bei uns bereits vorhanden. Scharfe HiDPI-Kerne und Leuchten
sollen erhalten bleiben. Die Trennung von Simulation und Darstellung haben
wir ebenfalls bereits.

## Einordnung für weitere Versuche

Das größte zusätzliche Potenzial vermute ich bei weniger Wegknoten und
wiederverwendeten Feldern. Das sind zugleich die Änderungen mit dem größten
Einfluss auf Navigation und Reaktionszeit. Ein kleinerer nächster Versuch
wäre, partikelunabhängige Richtungsinformationen wiederzuverwenden und
temporäre Arrays in `movementOptions` zu reduzieren. Sein tatsächlicher
Gewinn muss gemessen werden.

Die Erkenntnisse ergänzen die bereits abgeschlossenen
[acht Optimierungsversuche](performance-results.md). Anschließend wurden die
Richtungsauswahl und ein adaptives Mesh ausprobiert. Umsetzung, Abweichungen
vom Original und Messungen stehen in
[navigation-performance-results.md](navigation-performance-results.md).
Der Richtungscache bleibt erhalten; das Mesh wurde nach schlechteren
Laufzeiten im normalen Browserbetrieb wieder entfernt.
Die Originalfundstellen wurden mit dem lokalen Quellarchiv abgeglichen.
