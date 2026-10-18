# FlightStudio

A local video editor for combining flight tracks with videos, photos and audio. Import timestamped IGC, KML or KMZ files, synchronize recordings, arrange multiple camera views and export a composed film.

The interface supports English and German, with light and dark themes.

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

The installer and portable executable are generated under `release/desktop-2.2.0`. `START-FlightStudio-Desktop.cmd` starts the unpacked build with this checkout's local data directory. Do not edit the same data directory from two instances at once.

Builds are unsigned unless the distributor configures code signing. Windows application-control policies can block unsigned builds. No security settings are changed by the application.

This repository contains source code, not prebuilt applications or bundled runtime binaries. Building or installing dependencies downloads third-party components.

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
