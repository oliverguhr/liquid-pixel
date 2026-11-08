# Mehrspielermodus: Ablauf und Aufteilung

Stand: 8. November 2026. Lobby und Netzwerkspiel sind implementiert.
Start: `npm start`, danach `/` in zwei Tabs oder Browsern öffnen.
Der bisherige Singleplayer ist unter `/playground` erreichbar.

## Vorgaben des Nutzers

- Beim Öffnen der Seite zeigt eine Lobby die Zahl aller verbundenen Spieler
  und die Zahl der auf einen Mitspieler Wartenden.
- Über »Spielen« startet die Suche nach einem zufälligen freien Mitspieler.
- Nach Spielende kommen beide Spieler wieder in die Lobby.
- Möglichst viel wird auf den Clients berechnet, um den Server zu entlasten.
  Die Synchronität darf darunter nicht leiden.
- Einfache Manipulationen sollen erschwert werden; umfassender Cheat-Schutz
  hat zunächst keine Priorität.

## Implementierte Aufteilung

Beide Browser simulieren jeweils **das vollständige Match**, einschließlich
beider Schwärme, Hindernissen, Bewegung, Gesundheit, Heilung und Übernahmen.
Nur so können sie alle Kontakte nach denselben Regeln berechnen.
Grafik und Eingabeerfassung bleiben ebenfalls im Browser.

Der Server verwaltet Verbindungen, Lobbyzahlen, Warteschlange, zufällige
Paarung und Matchzugehörigkeit. Er legt Startkonfiguration, Regelversion
und die verbindliche Folge nummerierter Eingaben fest und verteilt diese
über WebSocket an beide Spieler. Im normalen Betrieb berechnet er keine
Partikelbewegung und überträgt keine laufenden Partikel-Snapshots.

Dieses Verfahren heißt deterministisches Lockstep. Beide Clients dürfen
denselben Simulationsschritt erst mit demselben vom Server freigegebenen
Eingabepaket ausführen. Auch das eigene Mausziel wird erst mit diesem Paket
spielwirksam. Der sichtbare Mauszeiger kann sofort reagieren.

## Voraussetzungen für Synchronität

1. Identische Startbedingungen: Karte, Einheiten, Regeln und gemeinsamer
   Zufallsalgorithmus mit Seed; kompatible Simulationsversionen.
2. Feste nummerierte Simulationsschritte, unabhängig von Renderfrequenz,
   Bildschirmauflösung und lokaler Uhr. Keine zusätzlichen Schritte, weil
   ein Browser schneller zeichnet.
3. Der Server ordnet Eingaben eindeutig Spielern und künftigen Schritten zu.
   Pro Schritt erhalten beide dieselben Ziele für beide Teams. Regeln für
   fehlende oder verspätete Eingaben gelten zentral für beide; ein Browser
   darf dafür keine eigene Ersatzentscheidung treffen.
4. Ein kleiner Eingabepuffer glättet ungleichmäßige Zustellung. Fehlt ein
   freigegebenes Paket, wartet die Simulation. Ein langsamer Client kann
   dadurch das Match verzögern. Der Vorlauf ist auf zwölf Halbschritte
   begrenzt; ohne bestätigten gemeinsamen Fortschritt endet das Match nach
   zehn Sekunden mit einem entsprechenden Hinweis.
5. Prüfsummen vergleichen an denselben Schritten den kanonischen Zustand
   einschließlich aller Daten, die spätere Simulation beeinflussen:
   Partikelreihenfolge, IDs, Teams, Gesundheit, Positionen, Bewegungsguthaben,
   Takt, Ziele, Terrain und gegebenenfalls Zufallszustand.
6. Bei abweichenden Prüfsummen wird die Partie angehalten und in der ersten
   Version mit einem Synchronisationshinweis beendet. Kein Client-Snapshot
   wird ungeprüft zur Wahrheit erklärt und kein Sieger aus dem abweichenden
   Zustand bestimmt. Danach kehren beide in die Lobby zurück.

Gleiche Zeitpunkte auf den Bildschirmen sind keine Voraussetzung: Die
Browser können kurz unterschiedlich weit in der Darstellung sein. Für
dieselbe Schrittnummer müssen ihre Simulationszustände identisch sein.

`Determinism.js` stellt einen gemeinsamen 32-Bit-Zufallsgenerator und exakt
gerundete ganzzahlige euklidische Distanzen bereit. `Math.hypot` entscheidet
somit nicht mehr über das Bewegungspotential. Die akzeptierte Kreisform
bleibt erhalten. Sortierungen erhalten eine eindeutige Partikel-ID als
letztes Entscheidungskriterium. Grafik und Canvas-Größe beeinflussen die
Simulation nicht.

`MatchSimulation.js` erzeugt beide beweglichen Schwärme mit jeweils 1.000
Einheiten, wendet Eingabepakete an und erzeugt kanonische Zustände und
Prüfsummen. Die normale Spiellogik aus `Environment.js` wird wiederverwendet.
Der Server lädt lediglich Versions- und Konfigurationsvorgaben; er erzeugt
oder aktualisiert keine Spielwelt.

## Zufällige Hindernisse

Jedes neue Match erzeugt über `MatchTerrain.js` eine Hinderniskarte aus dem
gemeinsamen Seed. Ein eigener deterministischer Zufallsstrom bestimmt Position,
Größe und Form der Hindernisse. Auf der normalen 800×800-Karte werden bis zu
sechs spiegelbildliche Paare aus ovalen und abgeschrägten Blöcken platziert.
Die Spiegelachse liegt zwischen den beiden Startzielen, damit keine Seite
einen zufälligen Geländevorteil erhält.

Die Startbereiche bleiben großzügig frei. Zwischen getrennten Hindernissen
bleiben mindestens zwei Zellen Platz, außerdem ein freier Randstreifen.
Jedes neue Paar wird vor der Übernahme per Vier-Wege-Flutfüllung geprüft:
Alle freien Zellen müssen weiterhin zusammenhängend sein. Andernfalls wird
das Paar verworfen. Die Suche nach Platz ist begrenzt; auf kleinen oder
dicht belegten Testwelten können deshalb weniger oder keine Hindernisse
entstehen. Es werden keine Partikel verschoben oder gelöscht, um Hindernisse
einzusetzen; die Karte entsteht vor dem Spawn.

Beide Clients erzeugen dieselbe Karte und nehmen ihre Hindernisse in die
Zustandsprüfsumme auf. Die Protokollversion ist jetzt
`liquid-pixel-lockstep-2`; nach dieser Änderung sind ein Serverneustart und
ein Neuladen beider Browser erforderlich.

## Protokoll und Takt

`scripts/multiplayer.cjs` bindet WebSocket an `/socket` desselben HTTP-Servers.
Die Lobbyzahlen zählen verbundene Sitzungen, einschließlich laufender
Matches. Wartend sind nur Sitzungen, die sich ausdrücklich eingereiht haben.
Alle 50 Millisekunden werden Wartende zufällig gepaart. Ein Spieler kann
jeweils höchstens einem Match angehören.

| Nachricht | Richtung und Bedeutung |
| --- | --- |
| `hello`, `lobby` | Server → Client: Version, Online-/Wartendenzahlen und eigener Suchstatus. |
| `queue`, `cancel` | Client → Server: Suche starten oder abbrechen. |
| `match` | Server → beide Clients: gemeinsame Match-ID, Seed, Regeln und individuelle Teamzuordnung. |
| `input` | Client → Server: eigenes ganzzahliges Mausziel und aufsteigende Sequenznummer. Kein frei wählbares Team. |
| `frame` | Server → beide Clients: dieselben Ziele für drei nummerierte Halbschritte. |
| `ack` | Client → Server: erreichter Schritt, Zustandsprüfsumme und Teamzahlen. Auch Schritt null wird beidseitig bestätigt. |
| `verified` | Server → beide Clients: Berichte für denselben Schritt stimmen überein. |
| `leave`, `ended` | Verlassen beziehungsweise gemeinsam bestätigtes Ende oder Abbruchgrund. |

Der Server verschickt alle 50 Millisekunden drei Halbschritte, entsprechend
der vorhandenen Simulation mit 60 Halbschritten pro Sekunde. Das jeweils
zuletzt gültige Ziel bleibt bis zur nächsten Eingabe bestehen. Zu spät
angekommene Ziele gelten für ein späteres Paket; beide Clients erhalten
immer dieselbe Zuordnung. Der Vorlauf von höchstens vier Paketen begrenzt
Rückstau. Nach jedem Paket werden beide Zustandsberichte verglichen.

`Multiplayer.js` puffert Pakete und rechnet bei niedriger Renderfrequenz
mehrere feste Schritte nach. Fehlende Pakete erzeugen keine zusätzlichen
lokalen Schritte. Die Maus bewegt den eigenen sichtbaren Zielmarker sofort;
die Wirkung auf den Schwarm beginnt mit dem verbindlichen Eingabepaket.
Malen, lokales Pausieren und Spawnen sind im Online-Match deaktiviert.

## Begrenzter Schutz gegen Manipulationen

- Der Server erlaubt nur Eingaben für das der Verbindung zugewiesene Team
  und Match. Team, Geschwindigkeit, Gesundheit und Besitzwechsel lassen sich
  nicht als Eingaben vom Client setzen.
- Nachrichtentypen, Koordinaten, Größe, Häufigkeit und Sequenzen werden
  geprüft. Startparameter kommen vom Server; fremde oder veraltete
  Matchnachrichten werden verworfen.
- Ein Sieg wird erst nach übereinstimmenden Abschlussmeldungen für denselben
  Schritt und Zustand freigegeben. Eine einseitige Siegbehauptung reicht nicht.
- Zustandsprüfsummen helfen bei Fehlern und einfachen Manipulationen, ersetzen
  aber keine unabhängige Regelprüfung: Ein veränderter Client kann auch falsche
  Prüfsummen melden, Ergebnisse verweigern oder die Partie stören.

Nachrichten sind auf 2 KiB und 150 Nachrichten je Sekunde und Sitzung
begrenzt. Rückgestaute WebSocket-Ausgabe ist ebenfalls begrenzt. Fremde
Browser-Origins werden abgewiesen; hinter einem Reverse Proxy muss deshalb
der ursprüngliche Host erhalten bleiben. Die Prüfsumme verwendet zwei
32-Bit-Akkumulatoren zur Fehlererkennung und ist kein kryptografischer
Authentizitätsnachweis. Lobby und Matches liegen im Speicher eines
Node-Prozesses; ein Neustart beendet bestehende Sitzungen.

Spätere stärkere Prüfung kann Eingabe-Replays auf dem Server verwenden.
Serverseitiges vollständiges Nachrechnen kostet selbst Rechenzeit; es ist
kein kostenloser Ersatz für eine laufende Serversimulation. Für den ersten
Stand wird kein vollständiger Cheat-Schutz versprochen.

## Ablauf und Prüfungen

Die Suche ist abbrechbar. Spieler in einem laufenden Match stehen nicht für
weitere Paarungen bereit. Ein Match endet regulär, wenn ein Team keine
Einheiten mehr besitzt. Beide sehen kurz das Ergebnis und kommen zurück in
die Lobby; eine neue Suche beginnt erst nach erneutem Klick.
Bei Verlassen oder Verbindungsabbruch endet die Partie mit einem Hinweis.
Eine automatische Wiederaufnahme laufender Partien ist zunächst nicht vorgesehen.

Nach 2,5 Sekunden wechselt die Ergebnisansicht automatisch zur Lobby;
»Zur Lobby« beendet die Anzeige sofort. Nach einer getrennten Verbindung
versucht der Client alle zwei Sekunden erneut, die Lobby zu erreichen.
Es gibt dabei weder automatisches Einreihen noch Wiederaufnahme des alten
Matches. Der Server entfernt nicht mehr erreichbare Verbindungen zusätzlich
per Ping/Pong-Prüfung.

`__tests__/match.test.js` prüft portable Distanzwerte, Seed und Zustand,
1800 Halbschritte zweier unabhängiger Welten mit Terrain und Kampf sowie
die Relevanz von Gesundheit, Team, Bewegungsguthaben und Übernahmetakt für
die Prüfsumme. `__tests__/server.test.js` verwendet echte WebSockets für
Lobbyzahlen, Paarung, identische Pakete, fremde Team-Eingaben, Rückstau,
abweichende Berichte, beidseitige Ergebnisbestätigung, Zeitüberschreitung,
Verbindungsabbruch, alte Match-IDs und ungültige Zugriffe.

`browser-tests/multiplayer.spec.js` prüft den sichtbaren Ablauf in zwei
Browser-Sitzungen. Beide Spieler bewegen ihre Wolken, eine vollständige
Übernahme beendet das Spiel und beide kehren in die Lobby zurück.
Weitere Fälle vergleichen verzögerte echte WebSocket-Pakete, angehaltenes
Rendern, Wiederverbindung, absichtliche Zustandsmanipulation und schmale
Ansichten. Firefox und WebKit spielen gegen Chromium bei 15 und 30 Render-
Frames pro Sekunde. Ein weiterer Test vergleicht die vollständigen Zustände
von Chromium, Firefox, WebKit und Node nach jeweils 90 Schritten bis zu
insgesamt 1080 Halbschritten, einschließlich Kampf und Übernahmen.

`npm run play:multiplayer` zeichnet zwei unabhängige normale Browser-Sitzungen
mit festem Server-Seed 123 auf: Lobby, Warten, Paarung, Kontakt, Sieg und
Rückkehr. Es verwendet normale Buttons und Mausereignisse; die Simulation
wird nicht über Debug-Schritte beschleunigt. Aufnahmen, Screenshots und
beide vollständigen Endzustände liegen in `artifacts/multiplayer-preview/`.

## Ausgeführte Validierung

Am 8. November 2026 bestanden:

- `npm test -- --runInBand`: **59 Modell-, WebSocket- und Kartenprüfungen**.
  Die sieben neuen Kartentests prüfen unter anderem 30 Seeds auf Symmetrie,
  freie Startzonen, vollständige Belegung und verbundene freie Zellen sowie
  kleine Karten und begrenztes Verhalten bei ungültigen oder übergroßen Anfragen.
- `npm run test:browser -- multiplayer.spec.js`: **acht Prüfungen** mit den
  neuen Kartenregeln. Die vollständigen 44 Browserprüfungen waren vor dem
  Hinzufügen der Zufallskarten grün. Keine übersprungenen oder erwarteten
  Fehlschläge.
- `npm run play:multiplayer`: zwei normale Sitzungen ohne Debug-Harness.
  Beide erzeugten bei Seed 123 dieselben **2.820 Hinderniszellen** und meldeten
  nach vollständiger Übernahme Schritt **573**, Teamzahlen **2.000 : 0** und
  Prüfsumme **`22452aba3026ccd6`**. Zusätzlich wurden ihre
  vollständigen Endzustände direkt verglichen. Beide kehrten in die Lobby
  zurück; es gab keine JavaScript-Laufzeitfehler.
- JavaScript-Syntax, lokale Dokumentationslinks und `git diff --check` geprüft.

Der Nutzer hat außerdem den Test im lokalen Netzwerk auf zwei Computern
am 8. November 2026 als funktionierend bestätigt.

Die Aufnahmen `player-1.webm` und `player-2.webm` zeigen den laufenden Ablauf.
Die gespeicherten Ansichten zeigen Desktop- und mobile Lobby sowie beide
Teamansichten mit korrekter Zuordnung und sich verändernden Teamzahlen.
Die exakten Abschluss-Schritte können bei erneuter Aufnahme variieren, weil
die realen Mausereignisse zu unterschiedlichen Schritten eintreffen können.

Auf diesem Entwicklungsrechner wurden die fehlenden WebKit-Systembibliotheken
für die Tests ausschließlich unter `/tmp` bereitgestellt, da `sudo` eine
interaktive Anmeldung verlangte. Regulär richtet
`npx playwright install-deps chromium firefox webkit` die Browserbibliotheken
ein; dieser Systemaufruf war hier nicht ausführbar. Alle drei Engines wurden
anschließend mit den lokalen Bibliotheken tatsächlich ausgeführt.

## Quellen

- [Glenn Fiedler: Deterministic Lockstep](https://gafferongames.com/post/deterministic_lockstep/)
  erklärt gleiche Startzustände, feste Schritte, identische Eingaben und die
  Abwägung zwischen Eingabepuffer, Wartezeiten und Verzögerung.
- [ECMAScript: Math.hypot](https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-math.hypot)
  beschreibt das Ergebnis als implementierungsabhängige Näherung.
