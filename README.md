# FlightStudio

A local video editor for combining flight tracks with videos, photos and audio. Import timestamped IGC, KML or KMZ files, synchronize recordings, arrange multiple camera views and export a composed film.

The interface supports English and German, with light and dark themes.

## Tutorial and user guide / Tutorial und Anleitung

In FlightStudio, choose **Tutorial & Help → Start tutorial** (German: **Tutorial & Hilfe → Tutorial starten**). An empty project also has a direct start button. The 17-step tour highlights the actual controls, opens the relevant panels and explains them with arrows. Use Back/Next, the topic picker or Esc. It pauses playback without editing your project and restores the previous panel arrangement afterwards.

The same help window includes a searchable guide that works offline. Read it on GitHub: **[Deutsche Anleitung](docs/ANLEITUNG.de.md)** · **[English user guide](docs/GUIDE.en.md)**.

The tutorial is included from **2.4.0** onwards. Download the newer installer if you are using 2.3.0. Save your project before updating.

## Download and install / Herunterladen und installieren

**[Download FlightStudio for Windows](https://github.com/adorres1/FlightStudio/releases/latest)**

- **Installer (recommended):** Download `FlightStudio-V2-Setup-2.5.0.exe`, open it and follow the installation steps. Then open **FlightStudio V2** from the Start menu or desktop shortcut.
- **Portable:** Download `FlightStudio-V2-Portable-2.5.0.exe` and open it without installation. Projects are still stored in the Windows user profile, not beside the executable.
- Windows 10/11, 64-bit. No ChatGPT account, GitHub account, Node.js installation or command line is needed. Internet access is needed for online map layers.
- The executable is currently unsigned. Windows or an organization's application-control policy may block it. Do not disable security protections to run it.

**Deutsch:** Auf der [Download-Seite](https://github.com/adorres1/FlightStudio/releases/latest) unter **Assets** die Datei **FlightStudio-V2-Setup-2.5.0.exe** herunterladen, per Doppelklick starten und den Installationsschritten folgen. Anschliessend **FlightStudio V2** im Startmenü öffnen. Ein GitHub- oder ChatGPT-Konto ist nicht nötig. Die Dateien namens **Source code** sind für Entwickler, nicht für die Installation.

First steps: import an IGC flight, import videos/photos, review timestamp alignment, edit on the timeline, then export. Save the project before closing or updating. Imported files and exports stay on your computer.

## Updates and faster desktop export

From **2.5.0**, choose **Updates → Check for updates → Download and install** in the desktop app. Automatic startup checks run at most once daily and can be disabled. Downloads are checked against the release checksum before launching the Windows installer. The app saves the project before closing; Windows confirmations remain. Users on older versions need one manual update to get this feature. The browser edition opens the download page; the portable edition's update button installs the app normally.

Desktop export now decodes video sequentially with FFmpeg, overlaps frame preparation with encoding and uses AMD/NVIDIA/Intel H.264 encoding when a probe succeeds. **Export → Acceleration → CPU (compatibility)** remains available. WebM avoids the previous second video encode. Map rendering, source resolution and project complexity still affect speed.

**Deutsch:** Ab 2.5.0 oben **Updates → Updates suchen → Herunterladen und installieren**. Unter **Exportieren → Beschleunigung** ist die automatische GPU-Auswahl voreingestellt. Die genaue Erklärung steht in der [Anleitung](docs/ANLEITUNG.de.md#performance).

## Flight instruments / Fluginstrumente

Open **Instruments** to add a starter layout or individual displays: compass (GPS course), GPS/pressure vario, altitude tape, ground speed, UTC clock, elapsed time, distance, ground glide ratio and coordinates. Recorded IGC extensions and header fields are available when present. Each display has its own flight source, visibility, position, size and transparency. The same instruments appear in the live preview and exported film. Hide the map track while retaining its clips to show instruments without the map.

**Deutsch:** Oben **Instrumente → Grundlayout** wählen. Jede Anzeige lässt sich separat einblenden, verschieben und skalieren. **Hintergrund 0 %** macht sie transparent. Details und Datenherkunft stehen in der [Anleitung](docs/ANLEITUNG.de.md#instruments). Für Zusatzfelder in älteren Projekten die IGC-Datei erneut importieren.

## Features

- Live preview and a multitrack timeline: move, trim, split, duplicate and delete clips.
- Timestamp-based media alignment with manual correction and placement.
- Multiple flight tracks on one 3D map, with color-coded flight statistics.
- Movable and resizable picture-in-picture windows and flight data overlays.
- Mouse-controlled map rotation, panning and zoom, fixed views and camera transitions.
- Map styles and layouts per flight section, including grayscale relief and transparent relief.
- Playback speeds up to 200x; optional acceleration of flight sections without footage.
- MP4 and WebM export, including 4K and 24/25/30/50/60 fps in the desktop export pipeline.
- Background export in the desktop app; the computer and background process must remain running.

This is an independent editor, not a complete replacement for a professional video suite. AI cutouts, automatic captions and a full color-grading suite are not included.

## Run from source

Install Node.js 22 or newer, then run in this directory:

```sh
npm ci
npm run desktop
```

The desktop window uses Electron. To use the browser interface instead:

```sh
npm start
```

Open `http://127.0.0.1:4187` in a current Chromium-based browser. This is a local application with a Node.js backend; it cannot be hosted as a static GitHub Pages website.

On Windows, `START-FlightStudio-V2.cmd` starts the browser edition and `STOP-FlightStudio-V2.cmd` stops its local server. Dependencies must be installed first. Closing a browser tab does not stop the server.

## Build the Windows app

```sh
npm run build:desktop
```

The installer and portable executable are generated under `release/desktop-2.5.0`. `START-FlightStudio-Desktop.cmd` starts the unpacked build with this checkout's local data directory. Do not edit the same data directory from two instances at once.

Builds are unsigned unless the distributor configures code signing. Windows application-control policies can block unsigned builds. No security settings are changed by the application.

This repository contains the source code. Prebuilt Windows applications are attached to [GitHub Releases](https://github.com/adorres1/FlightStudio/releases). Building or installing dependencies downloads third-party components.

## Editing

Use **Media** and **Flights** in the header to open either gallery. Close either sidebar with its x button to free preview space. **Clip**, **Flight map & camera** and **Project settings** open the right sidebar. Drag the top of the timeline to adjust its height.

The preview switch selects **Window position** or **Rotate map**. In map mode, left-drag rotates and tilts, right-drag or Shift-drag pans, and the wheel zooms. In window mode, drag a frame or flight statistics box to move it; drag its corner to resize it.

To show the map in a grid for one section, split the flight clip at the desired boundaries and choose **Layout in this flight clip > Grid** in its properties. Custom frame positions take priority over automatic layouts.

Flight timestamps use UTC. Recordings without an explicit timezone use the project timezone. Edited camera exports may no longer describe the original timing of every frame; use original recordings or adjust clips manually.

Additional IGC files share the main flight's map. Compare by UTC or aligned flight starts and apply an optional time offset. The main flight controls the map timeline and camera target. Each visible flight has a matching color dot in its statistics row.

Save project files before moving or updating an installation. Project documents reference their media; they are not self-contained media archives.

## Local files and privacy

Imported media, working projects and exports stay local. The desktop edition normally stores data under `%APPDATA%/FlightStudio-V2/data`; the browser edition uses `data/` in the project directory. A folder synchronization service may separately synchronize those files.

Online map providers receive map and terrain requests. An internet connection is required for those layers. The application does not upload imported recordings or IGC files to a hosting service.

Local data, exports, logs, generated test media, dependencies and build output are excluded from Git. No real flight recordings or personal media are distributed in this repository. The optional demo route is generated mathematically and is not a recorded flight.

## Development and tests

```sh
npm test
```

The pretest step generates synthetic videos, a photo and two IGC fixtures into the ignored `examples/` directory. The tests cover flight parsing, timezones, camera interpolation, timeline edits, multiple flights, synchronization and export. No pre-existing media files are required. Test servers bind only to `127.0.0.1`.

`PORT` and `FLIGHTSTUDIO_DATA_DIR` select a local server port and data directory. For isolated desktop testing, `FLIGHTSTUDIO_DESKTOP_PORT` and `FLIGHTSTUDIO_PROFILE_DIR` can select a separate port and profile.

## License and map sources

The application source is licensed under MIT. Dependencies keep their own licenses; see [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt).

3D rendering uses CesiumJS. Online imagery and terrain currently come from Esri, with an OpenStreetMap street-map option. Data-provider terms, attribution requirements and service limits apply separately from the application's MIT license. Publicly reachable map endpoints do not imply unrestricted usage or redistribution rights.

## Editing improvements in 2.3

- Shotcut-inspired clip controls: 0–200% volume with percent and dB readouts, mute, and independent audio/video fades. Drag the fade handles or volume line directly on a timeline clip.
- Dissolve and wipe transitions between overlapping clips on one track. Applying a transition moves the incoming clip; other tracks keep their timing. The two sources share one layout tile during the transition.
- Mouse wheel over the timeline zooms at the pointer. Shift+wheel scrolls horizontally; Alt+wheel scrolls tracks. F fits selected clips; Shift+F fits the whole timeline.
- N toggles snapping; hold Alt while dragging to suspend snapping.
- Give the main flight a display name in the flight gallery. Toggle a name tag at the marker for each flight.
- Zoom image content with the wheel over its preview; Alt+drag pans within the frame. Frames can extend off-canvas and scale up to 500%. Reset frame position & zoom returns a clip to its automatic layout.
- Clip effects, name tags and transitions are saved with the project and used by both preview and export.
