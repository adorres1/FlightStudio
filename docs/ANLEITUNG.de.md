# FlightStudio – Anleitung

[English guide](GUIDE.en.md) · [Windows-Download](https://github.com/adorres1/FlightStudio/releases/latest)

Für FlightStudio 2.5.0. In der App: **Tutorial & Hilfe → Tutorial starten**. Im leeren Projekt gibt es auch direkt **Tutorial starten**. Die Tour hat 17 Schritte, Pfeile und hervorgehobene Bedienelemente. Zurück/Weiter, Themenauswahl und Esc sind jederzeit verfügbar. Dein Projekt wird dabei nicht bearbeitet; die Vorschau pausiert und die vorherige Anordnung der Menüs wird am Ende wiederhergestellt.

Die nachlesbare Hilfe im Programm funktioniert ohne Internet und lässt sich durchsuchen. Nur Online-Karten und Gelände brauchen eine Verbindung.

## Inhalt

- [1 · Dein erster Flugfilm](#start)
- [Mediathek und Quellvorschau](#library)
- [2 · Zeitstempel und Synchronisierung](#timing)
- [3 · Schneiden, Einrasten und Spuren](#editing)
- [4 · Gemeinsam schneiden oder nur das Video](#range)
- [5 · Tempo und lange Abschnitte ohne Video](#speed)
- [6 · Layout, Bild-in-Bild und Bildzoom](#layout)
- [7 · Karte mit der Maus und Kamerafahrten](#camera)
- [8 · Mehrere Flüge, Namen und Daten](#multiple)
- [Instrumente: Kompass, Vario und IGC-Werte](#instruments)
- [9 · Ton, Ein-/Ausblenden und Übergänge](#effects)
- [10 · Sichern und auf einen anderen Laptop wechseln](#save)
- [11 · Exportieren](#export)
- [Updates suchen und installieren](#updates)
- [Exporttempo und Beschleunigung](#performance)
- [12 · Wenn etwas nicht wie erwartet aussieht](#trouble)

<a id="start"></a>

## 1 · Dein erster Flugfilm

1. Unter Flüge → Flugdateien hinzufügen die IGC-Originaldatei importieren. Der Demoflug ist eine künstlich erzeugte Route zum Ausprobieren.
2. Unter Medien → Importieren Videos, Fotos oder Ton laden. „Beim Import in Timeline einsetzen“ fügt sie direkt ein.
3. Mit der Abspiellinie zu einem gut erkennbaren Moment gehen und prüfen, ob Video und Flug zusammenpassen. Clips bei Bedarf verschieben.
4. Clips kürzen, das Projektlayout wählen und die Vorschau mit der Leertaste prüfen.
5. Projekt sichern. Für einen ersten Test einen kurzen Bereich markieren und als MP4 mit 1080p/30 fps exportieren. Für den ganzen Film danach Bereich → Alles wählen.

<a id="library"></a>

## Mediathek und Quellvorschau

Links bleiben Videos und Fotos als unbewegte Thumbnails sichtbar. Ein Klick wählt das Medium und zeigt seine Eigenschaften. Plus fügt es in die Timeline ein; passende Aufnahmezeiten werden berücksichtigt. Ohne passende Zeit wird die Abspiellinie verwendet. Doppelklick auf das Thumbnail fügt ebenfalls ein. Ziehen auf eine Spur erlaubt dir, die Position selbst zu bestimmen.

Nur der kleine Vorschau-Knopf ▷ öffnet das Original in einem grossen Fenster. Mit den dortigen Bedienelementen kannst du Video oder Ton ansehen und anhören. Die Timeline bleibt währenddessen pausiert. Esc oder × schliesst die Quellvorschau und stoppt ihren Ton. „An Abspielposition einsetzen“ fügt das Original an der aktuellen Timeline-Position ein und schliesst die Quellvorschau.

Die grosse Programmvorschau zeigt deinen geschnittenen Film mit Layout, Karte und Instrumenten. Play oder die Leertaste startet diese Vorschau. Die Quellvorschau zeigt dagegen das unveränderte Original vor dem Schnitt.

<a id="timing"></a>

## 2 · Zeitstempel und Synchronisierung

Importiere den Hauptflug möglichst vor den Medien. Passende Aufnahmezeiten ordnen Clips entlang des Flugs ein. Gleichzeitig aufgenommene Videos erhalten getrennte Spuren. Ohne passende Zeit beginnt ein Clip an der aktuellen Abspiellinie. Die Zuordnung bleibt jederzeit von Hand veränderbar.

IGC-Zeiten sind UTC. Unter Projekt-Einstellungen → Zeitzone der Aufnahmen legst du fest, wie Zeiten ohne eigene Zeitzone interpretiert werden. Beim ausgewählten Medienclip gibt es Aufnahmezeit und zeitliche Zuordnung. Prüfe die Vorschau nach einer Korrektur erneut.

Bei einem bereits geschnittenen Insta360-Export ist der Zeitstempel möglicherweise nicht mehr der ursprüngliche Aufnahmebeginn. Bereits entfernte Teile und Tempoänderungen kann FlightStudio nicht rekonstruieren. Nutze Originalaufnahmen oder teile und ordne den exportierten Clip von Hand zu.

<a id="editing"></a>

## 3 · Schneiden, Einrasten und Spuren

Clip ziehen: Start verschieben. Clip-Ränder ziehen: kürzen. Strg-Klick: mehrere Clips auswählen. Abspiellinie setzen und S: ausgewählte Clips teilen. Entf: ausgewählte Clips entfernen. Strg + D: duplizieren. Strg + Z/Y: rückgängig/wiederholen.

Einrasten ist eine Positionierungshilfe beim Verschieben: Der Clip-Anfang rastet an nahen Clip-Anfängen/-Enden, der Abspiellinie und bei 0 ein. N schaltet um; Alt beim Ziehen setzt es vorübergehend aus. Es verändert weder den Inhalt noch das Tempo eines Clips.

Links an jeder Spur kannst du Sichtbarkeit, Ton und Sperre einstellen. × entfernt die Spur samt ihren Clips. Mit Strg + Z kannst du das rückgängig machen. Die Originaldateien bleiben erhalten. Medien und Flüge oben öffnen die Galerien; ein erneuter Klick oder × schliesst sie. Die Trennlinie über der Timeline verändert deren Höhe.

<a id="range"></a>

## 4 · Gemeinsam schneiden oder nur das Video

Setze I am Anfang und O am Ende eines Bereichs; alternativ die Sekundenwerte Von/bis eingeben. „Alle Spuren · Zeit schliessen“ schneidet den Bereich über die Spuren hinweg und zieht das nachfolgende Material nach vorne. So bleiben gemeinsame Video-/Flugschnitte zeitlich zusammen.

Soll der Flug weiterlaufen, wähle nur die Video-Clips und „Gewählte Clips · Lücke lassen“. „Bereich löschen“ entfernt dann nur deren betroffenen Teil. Die Karte bleibt zeitlich erhalten. Gesperrte Spuren werden nicht bearbeitet; prüfe Sperren vor einem gemeinsamen Schnitt.

<a id="speed"></a>

## 5 · Tempo und lange Abschnitte ohne Video

Für ein einzelnes Stück: Clip mit S an den Grenzen teilen, auswählen und unter Clip → Clip-Tempo die Geschwindigkeit setzen. Für einen Bereich: I/O, die gewünschten Clips oder alle Spuren wählen, Tempo einstellen und „Tempo anwenden“. Bis 200× ist möglich.

Die Automatik „Flug ohne Video/Foto beschleunigen“ startet ausgeschaltet. „50× einschalten“ aktiviert sie; das Zahlenfeld erlaubt bis 200×. Beispiel: 10 Minuten reiner Flug dauern bei 50× etwa 12 Sekunden. Ein manuell gesetztes Tempo am Flugclip hat Vorrang. Ton allein zählt nicht als Video/Foto.

Filmzeit zeigt die durch Automatik verkürzte Timeline. Schnittzeit ohne Automatik zeigt die unbeschleunigte Anordnung. „Vorschau“ neben Play verändert nur die Abspielgeschwindigkeit beim Anschauen, nicht das Tempo des exportierten Films.

<a id="layout"></a>

## 6 · Layout, Bild-in-Bild und Bildzoom

Projektlayout unter der Vorschau wählt Automatisch, Vollbild, Video gross, Flug gross, Raster oder Untereinander. Die Auswahl 16:9 / 9:16 / 1:1 legt das Bildformat fest. Parallel laufende Kameras können eigene Felder belegen.

Im Modus Fensterposition kannst du Bildfenster ziehen und an der Ecke skalieren. Auch das Datenkästchen mit den farbigen Flugwerten lässt sich bewegen und skalieren. Fenster dürfen ausserhalb des Bildrandes liegen; exportiert wird nur der sichtbare Ausschnitt.

Im Video-/Fotobild zoomt das Mausrad den Bildinhalt, Alt + Ziehen verschiebt den Ausschnitt. Genaue Werte findest du unter Clip → Grösse, Position & Zoom. „Bildposition & Zoom zurücksetzen“ gibt dem automatischen Layout wieder die Kontrolle.

Raster oder transparente Karte nur in einem Abschnitt: Flugclip an den Grenzen teilen, das Stück auswählen und unter „Karte in diesem Abschnitt“ Layout/Kartenstil einstellen. Eigene Fensterpositionen haben Vorrang; verwende bei Bedarf „Layout verwenden“.

<a id="camera"></a>

## 7 · Karte mit der Maus und Kamerafahrten

Schalter auf Karte drehen: Auf der Karte ziehen dreht und neigt die Ansicht. Rechtsziehen oder Umschalt + Ziehen verschiebt sie. Das Mausrad verändert den Abstand. Flugkarte & Kamera öffnet die Regler für Richtung, Neigung und Abstand sowie die Kartenstile.

Kamerafahrt: Einen Ausgangsblick einstellen (der erste gespeicherte Blick gilt ab Flugbeginn) und „Blickwinkel hier speichern“ drücken. Zu einer späteren Position gehen, einen Zielblick einstellen, die Übergangsdauer wählen und erneut speichern. Der Übergang beginnt an diesem neuen Punkt und bewegt sich vom vorherigen zum neuen Blick. Die App verwendet gespeicherte Kamerafahrten; prüfe das Ergebnis in der Vorschau. Übergänge dürfen sich nicht überschneiden und müssen in den Flug passen.

Die Kartenstile umfassen Satellit, Strassenkarte, Schwarzweiss-Relief und transparentes Relief. Für Karten und Gelände brauchst du Internet. Die Quellenangaben bleiben auch im Export sichtbar.

<a id="multiple"></a>

## 8 · Mehrere Flüge, Namen und Daten

Weitere IGC-Dateien unter Flüge hinzufügen. Der Hauptflug steuert die Karten-Timeline und das Kameraziel. Weitere Flüge erscheinen auf derselben Karte; du kannst sie nach UTC oder Flugbeginn vergleichen und einen Zeitversatz setzen.

Die Fluggalerie enthält Namen, Farben, Sichtbarkeit und Nametags. Jeder Flug hat einen passenden Farbpunkt bei seinen Zahlenwerten. Im Modus Fensterposition kannst du das gemeinsame Datenkästchen in der Vorschau verschieben und skalieren.

<a id="instruments"></a>

## Instrumente: Kompass, Vario und IGC-Werte

In der Kopfleiste Instrumente öffnen. Nach dem IGC-Import entweder das Grundlayout einschalten oder unter Einzelne Anzeige / IGC-Feld einen Wert wählen und hinzufügen. Das Grundlayout enthält Uhrzeit (UTC), Geschwindigkeit über Grund, GPS-Vario, GPS-Höhe mit Skala und einen Kompass mit GPS-Kurs.

Jede Anzeige lässt sich separat ein-/ausschalten, entfernen, verschieben und skalieren. Zum Verschieben den Modus Fensterposition verwenden; die Ecke verändert die Grösse. Ein Doppelklick öffnet die Einstellungen. Dort findest du auch genaue Position, Grösse, Deckkraft und Hintergrund. Hintergrund 0 % lässt nur Schrift und Skala stehen. Bei mehreren IGC-Dateien pro Anzeige die Datenquelle wählen. Der Farbpunkt kennzeichnet den Flug.

Weitere Anzeigen: Flugzeit, geflogene Strecke, Gleitzahl über Grund, Koordinaten und – wenn vorhanden – Druckhöhe, daraus berechnetes Vario, Satelliten, IGC-Kopfdaten und I-/J-/K-Zusatzfelder. Bekannte Zusatzfelder werden benannt; unbekannte bleiben unveränderte Rohwerte ohne angenommene Einheit. Hersteller-Kommentare, Wettbewerbsaufgaben und Prüfsignaturen sind keine Instrumentanzeigen. Ältere Projekte benötigen einen erneuten IGC-Import, um zuvor nicht gespeicherte Zusatzfelder zu erhalten.

GPS-Kurs ist die Bewegungsrichtung über Grund, kein Magnetkompass. GPS-Höhe ist keine Höhe über Gelände. Geschwindigkeit, Kurs, Vario und Gleitzahl werden aus der Original-Flugzeit berechnet; Zeitraffer multipliziert diese Messwerte nicht. Glättung stellt das rückblickende Zeitfenster ein (0 = zwischen GPS-Punkten). Bei Stillstand fehlt der Kurs; eine Gleitzahl wird nur im Sinken gezeigt. Fehlende Werte und GPS-Lücken erscheinen als Strich. Zusätzliche K-Daten werden höchstens 120 Sekunden gehalten.

Die Instrumente folgen den Schnitten und dem Tempo der Flugclips. Für Anzeigen ohne sichtbare Karte die 3D-Flugspur mit dem Auge ausblenden, ihre Clips aber behalten. Ein gelöschter Flugabschnitt hat keine zugeordneten Daten. Positionen und Optionen werden im Projekt gespeichert und für Vorschau und Export gleich verwendet.

<a id="effects"></a>

## 9 · Ton, Ein-/Ausblenden und Übergänge

Timeline-Clip auswählen und Clip öffnen. Bei Video/Audio: 100 % entspricht dem Originalton, 0 % ist stumm, bis 200 % ist möglich. Sehr lauter Ton kann übersteuern. Tonblenden sind unabhängig von Bildblenden. Die Linie unten im Timeline-Clip regelt die Lautstärke direkt; die Griffe oben regeln die Bildblenden.

„Clip aktiv · Bild und Ton“ blendet einen Clip samt Ton aus, ohne ihn zu löschen. Du kannst stattdessen eine ganze Spur ausblenden oder stummschalten.

Für Überblenden oder Wischen: Zwei passende Clips auf derselben Spur anordnen, den zweiten wählen und unter „Übergang vom vorherigen Clip“ Art und Dauer einstellen. „Übergang anwenden“ verschiebt diesen Clip in eine Überlappung. Andere Spuren bleiben stehen. Bei zeitlich synchronisiertem Material danach die Zuordnung prüfen.

<a id="save"></a>

## 10 · Sichern und auf einen anderen Laptop wechseln

Der aktuelle Arbeitsstand wird lokal automatisch gespeichert. „Projekt sichern“ erstellt zusätzlich eine .flightstudio-Datei. Sie enthält Bearbeitungsdaten und Flugspur, aber keine Originalvideos, Fotos oder Audiodateien. „Öffnen“ lädt ein Projekt. Vor Updates eine Projektdatei sichern.

Für einen anderen Laptop: Projektdatei und Originalmedien mitnehmen. Fehlende Originalmedien dort importieren und danach die Projektdatei erneut öffnen. Die Medien möglichst unverändert mit ihren Dateinamen behalten. Eine installierte App und die portable EXE speichern Daten im Windows-Benutzerprofil unter %APPDATA%/FlightStudio-V2/data.

<a id="export"></a>

## 11 · Exportieren

Der Export verwendet den markierten Bereich. Für den ganzen Film zuerst Bereich → Alles wählen. Unter Exportieren stehen MP4 oder WebM, Auflösung, Bildrate, Qualität und Ton zur Auswahl. Ein guter Start ist MP4 / 1080p / 30 fps / Ausgewogen. Hohe Auflösung und Bildrate brauchen mehr Zeit und Speicher.

Die Desktop-App unterstützt bis 4K und 60 fps. Ein Hintergrundexport kann weiterlaufen, wenn das Editorfenster geschlossen ist. Rechner und FlightStudio-Hintergrundprozess müssen an bleiben; vollständig Beenden oder Ruhezustand unterbricht die Arbeit. Eine reine Browser-Aufzeichnung benötigt einen sichtbaren Tab und hat weniger Exportoptionen.

Während des Hintergrundexports wird der Projektstand vom Exportstart verwendet. Spätere Bearbeitungen ändern diesen laufenden Export nicht. Fertige Dateien erscheinen im Exportfenster. Kartenanbieter benötigen eine Internetverbindung.

<a id="updates"></a>

## Updates suchen und installieren

Oben auf Updates klicken. „Updates suchen“ prüft das neueste stabile FlightStudio-Release auf GitHub. Eine neuere Version wird als „Update verfügbar“ hervorgehoben. Die automatische Suche beim Start ist voreingestellt, höchstens einmal täglich, und lässt sich im selben Fenster ausschalten. Ohne Internet wird eine fehlgeschlagene Prüfung angezeigt, keine falsche Entwarnung.

In der Desktop-App: „Herunterladen und installieren“ lädt den Windows-Installer, prüft Dateigrösse und SHA-256-Prüfsumme, speichert den aktuellen Projektstand und öffnet die Installation. Danach schliesst FlightStudio. Den Windows-Installationsschritten folgen und die App anschliessend wieder öffnen. Während eines Exports ist die Installation gesperrt. Windows-Bestätigungen und Sicherheitsprüfungen bleiben bestehen.

Der Download lässt sich abbrechen. Bei der portablen Ausgabe installiert dieser Knopf die App regulär; Daten bleiben im selben Windows-Benutzerprofil. In der Browser-Oberfläche öffnet sich stattdessen die Downloadseite. Versionen vor 2.5.0 müssen einmal manuell aktualisiert werden, weil sie diesen Update-Knopf noch nicht enthalten. Bei der Suche werden keine Projekte, Flugdaten oder Medien hochgeladen.

<a id="performance"></a>

## Exporttempo und Beschleunigung

Der Desktop-Export liest Videos ab 2.5.0 mit FFmpeg fortlaufend und verwendet die Original-Zeitstempel. Schnitte, variable Bildraten, Zeitlupe und mehrere Kameras werden dabei berücksichtigt. Die 3D-Karte und Instrumente werden weiterhin für jeden Ausgabemoment berechnet. Nur wenige Videobilder werden vorausgeladen; der ganze Film wird nicht in den Arbeitsspeicher geladen.

Unter Exportieren → Beschleunigung ist „Automatisch (GPU, falls verfügbar)“ voreingestellt. MP4 prüft AMD-, NVIDIA- und Intel-Encoding mit der gewählten Auflösung und Bildrate. Ohne funktionierenden GPU-Encoder wird die CPU verwendet. Der tatsächlich verwendete Encoder steht beim Fortschritt. „CPU (Kompatibilität)“ erzwingt die Software-Ausgabe, falls ein Grafiktreiber Probleme macht. GPU-Encoding kann bei gleicher Qualitätsstufe grössere Dateien ergeben.

WebM verwendet VP9 auf der CPU und wird nur einmal kodiert. MP4 ist für einen schnellen Export meist die passendere Wahl. Die Dauer hängt auch von Originalauflösung, mehreren Videos, Gelände, Zoom und Ausgabebildrate ab. Eine geringere Vorschauqualität verändert die Exportauflösung nicht. Der neue Dekoder beschleunigt den Desktop-Export; die reine Browser-Aufzeichnung verwendet weiterhin die Vorschau.

<a id="trouble"></a>

## 12 · Wenn etwas nicht wie erwartet aussieht

Falscher Moment im Video: Aufnahmezeit, Zeitzone und manuelle Verschiebung prüfen. Ein Clip reagiert nicht: prüfen, ob seine Spur gesperrt ist. Ein Clip bleibt unsichtbar: Abspielposition, Clip aktiv, Sichtbarkeit der Spur, Deckkraft und Fensterposition prüfen.

Zu kurze Ausgabedatei: den Exportbereich und die Tempo-Automatik prüfen. Falsches Raster: eigene Clip-Position über „Layout verwenden“ zurücksetzen. Video lässt sich nicht abspielen: eine MP4-Datei mit H.264-Video und AAC-Ton verwenden. Fehlendes Relief: Internet und vollständig geladene Geländedaten prüfen.

## Tastenkürzel

| Taste / Geste | Funktion |
| --- | --- |
| Space | Abspielen / Pause |
| S | Ausgewählte Clips teilen |
| Delete | Ausgewählte Clips entfernen |
| Ctrl + D | Duplizieren |
| Ctrl + Z / Ctrl + Y | Rückgängig / Wiederholen |
| I / O | Bereichsanfang / -ende setzen |
| N / Alt + drag | Einrasten umschalten / kurz aussetzen |
| F / Shift + F | Auswahl / ganzen Film einpassen |
| Wheel / Shift + wheel | Timeline zoomen / horizontal scrollen |
| Alt + wheel | Spuren vertikal scrollen |
| ← / → | Ein Vorschaubild zurück / vor; mit Umschalt 5 Sekunden |
| Esc | Tutorial beenden / Seitenmenü schliessen |

Tastenkürzel für den Schnitt gelten ausserhalb von Eingabefeldern und Dialogen.
