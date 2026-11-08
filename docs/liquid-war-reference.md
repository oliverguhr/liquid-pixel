# Liquid War als Referenz

Stand: 7. November 2026. Untersucht wurde der C-Code von Liquid War **5.6.6**,
heruntergeladen und gelesen, aber nicht gebaut oder ausgeführt.

## Quellen und Wiederauffindbarkeit

- [Offizielle Downloadseite](https://ufoot.org/liquidwar/v5/download/en/)
- [Quellarchiv 5.6.6](https://ufoot.org/download/liquidwar/v5/5.6.6/liquidwar-5.6.6.tar.gz)
- [Erklärung des Algorithmus durch den Entwickler](https://ufoot.org/liquidwar/v5/techinfo/algorithm/en/)
- [Erklärung der Quelldateien](https://ufoot.org/liquidwar/v5/techinfo/source/en/)
- [Debian-Quellarchiv mit weiteren Versionen](https://sources.debian.org/src/liquidwar/)

SHA-256 des untersuchten Downloads, lokal ermittelt:

```text
245d8066ecc38829bd110f00890eb6df44e098c80c2fbc89a46f34045aac43f7
```

Die folgenden Zeilennummern beziehen sich auf Dateien im entpackten Verzeichnis
`liquidwar-5.6.6/`. Die Dateiköpfe nennen GPL-2.0-or-later als Lizenz.

## Bewegung und Wege um Hindernisse

Laut [Algorithmusbeschreibung](https://ufoot.org/liquidwar/v5/techinfo/algorithm/en/)
folgen die Partikel einem Distanzfeld entlang begehbarer Wege zum Cursor.
Liquid War 5 fasst dafür Bereiche zu einem verbundenen Mesh zusammen.

Im C-Code ist die Aktualisierung in `src/grad.c`, Funktion
`spread_single_gradient`, ab Zeile 135 zu finden. Die Abschnitte ab Zeile 179
und 225 aktualisieren benachbarte Mesh-Bereiche anhand ihrer bisherigen
Distanz und der Bereichsgröße. `src/mesh.h` beschreibt die Struktur mit
Verbindungen und teambezogenen Gradienten.

Die anfängliche Implementierung unseres `Environment.updateGradient`
berechnete nur die direkte euklidische Entfernung. Eine Wand erhöhte den Wert
für den notwendigen Umweg nicht. Das passte zum reproduzierten Hängenbleiben.

Seit dem 8. November berechnet unsere Implementierung ein begehbares
Raster-Distanzfeld. Die Winkelkorrektur für eine runde Wolke, individuelle
Bewegungstakte und lokale Aktualisierungsprioritäten sind eigene Ergänzungen.
Die Details und Nachweise stehen in
[movement-validation.md](movement-validation.md); das adaptive Mesh des
Originals wird nicht übernommen.

## Ausweichen und Richtungswahl

`src/fighter.c` enthält die relevanten Regeln:

| Fundstelle | Beobachtung im C-Code |
| --- | --- |
| Zeile 82, `FIGHTER_MOVE_DIR` | Tabellen für mehrere bevorzugte Bewegungsrichtungen. |
| Zeile 225, `get_main_dir` | Hauptausrichtung anhand der benachbarten Gradienten. |
| Zeilen 371–403 | Richtungsprioritäten variieren anhand des logischen Spieltakts und der Partikelreihenfolge. |
| Zeilen 425–477 | Bis zu fünf freie Nachbarpositionen werden vor einem Angriff geprüft. |

Das liefert Ansätze gegen starre Richtungsbevorzugung und Blockieren. Die
anfänglichen zufälligen größeren Sprünge wurden durch geprüfte Nachbarschritte
ersetzt. Richtungswahl und Kollisionsprüfung werden getrennt abgesichert.

## Übernahme gegnerischer Partikel

Im untersuchten C-Pfad von `src/fighter.c` kommt ein Angriff nach den
Bewegungsversuchen. Der Hauptangriff ab Zeile 481 senkt die Gesundheit des
Gegners. Erst bei `health < 0` wechselt dieser zum Team des Angreifers und
erhält über `new_health` wieder einen nichtnegativen Gesundheitswert.
Weitere Angriffsrichtungen ab Zeile 495 verursachen weniger Schaden.
Eigene Nachbarn können ab Zeile 529 bis zu einer Obergrenze geheilt werden.
Die Parameter werden ab Zeile 321 berechnet.

Die [Beschreibung](https://ufoot.org/liquidwar/v5/techinfo/algorithm/en/)
spricht von Energieübertragung zum Angreifer. Der gelesene C-Angriffszweig
zeigt keine entsprechende direkte Heilung des Angreifers. Für genaue Regeln
sollten wir deshalb die konkrete Version und den ausgeführten Pfad beachten.

Für Phase 2 lassen sich daraus Prüfungen für wiederholten Kontakt,
Gesundheitsabbau, Teamwechsel und Heilung ableiten. Welche Parameter das
gewünschte Spielgefühl ergeben, bleibt mit dem Szenario »bewegte Wolke
übernimmt statische Wolke« zu beurteilen.

Seit dem 8. November ist dieses lokale Szenario über `Capture challenge`
implementiert. Unsere Startparameter, Ergänzungen zum Takt, Abweichungen
und die Verhaltensprüfungen stehen in
[capture-validation.md](capture-validation.md). Der Seitenangriff orientiert
sich an `SIDE_ATTACK_FACTOR = 4`, also einer Rechtsverschiebung um vier Bits.
Die konkrete Zahlenkonfiguration und der ruhende Gegner sind unsere eigenen
Festlegungen. Der Originalcode wurde als Referenz gelesen, nicht übernommen.

## Bezug zum Plan

- Phase 1: Begehbare Distanzen, Ausweichrichtungen und Randverhalten verbessern.
  Es gelten vorerst keine Performancekriterien.
- Phase 2: Übernahmeregeln anhand dieser Fundstellen konkretisieren und im
  vereinbarten einfachen Szenario prüfen.
- Phase 3: Reproduzierbare Richtungswahl ist ein nützlicher Ansatz für die
  spätere Synchronisation. Das WebSocket-Synchronisationsmodell bleibt offen.

Die Analyse ersetzt keine Prüfung unserer Implementierung im echten Browser.
Die Abnahmekriterien stehen in der [TODO-Liste](../TODO.md).
