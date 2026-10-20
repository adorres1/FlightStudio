# FlightStudio – User Guide

[Deutsche Anleitung](ANLEITUNG.de.md) · [Windows download](https://github.com/adorres1/FlightStudio/releases/latest)

For FlightStudio 2.5.0. In the app: **Tutorial & Help → Start tutorial**. An empty project also offers a direct **Start tutorial** button. The 17-step tour highlights controls with arrows. Back/Next, topic selection and Esc are available throughout. The tour does not edit your project; it pauses playback and restores the previous panel arrangement when finished.

The searchable in-app guide works offline. Online map and terrain layers need a connection.

## Contents

- [1 · Your first flight film](#start)
- [Media library and source preview](#library)
- [2 · Timestamps and synchronization](#timing)
- [3 · Editing, snapping and tracks](#editing)
- [4 · Cut together or only the video](#range)
- [5 · Speed and long sections without video](#speed)
- [6 · Layout, picture-in-picture and image zoom](#layout)
- [7 · Map mouse controls and camera moves](#camera)
- [8 · Multiple flights, names and statistics](#multiple)
- [Instruments: compass, vario and IGC fields](#instruments)
- [9 · Audio, fades and transitions](#effects)
- [10 · Saving and moving to another laptop](#save)
- [11 · Exporting](#export)
- [Checking for and installing updates](#updates)
- [Export speed and acceleration](#performance)
- [12 · When something looks wrong](#trouble)

<a id="start"></a>

## 1 · Your first flight film

1. Open Flights → Add flight files and import the original IGC. The demo flight is a generated route for experimenting.
2. Open Media → Import and load videos, photos or audio. “Add to timeline on import” places them directly.
3. Move the playhead to a recognizable moment and check that video and flight match. Move clips if needed.
4. Trim clips, choose a project layout and check playback with Space.
5. Save the project. Select a short range and export an MP4 at 1080p/30 fps as a first test. Choose Range → All to export the whole film afterwards.

<a id="library"></a>

## Media library and source preview

Videos and photos stay as still thumbnails in the library. A click selects the media and shows its properties. Plus adds it to the timeline, using matching capture times or otherwise the playhead. Double-clicking the thumbnail also inserts it. Drag onto a track to choose the position yourself.

Only the small preview button ▷ opens the original in a large window. Use its controls to play video or audio. The timeline stays paused. Esc or × closes the source preview and stops its audio. “Insert at playhead” adds the original at the current timeline position and closes the source preview.

The large program preview shows your edited film with its layout, map and instruments. Play or Space starts that preview. The source preview shows the unedited original.

<a id="timing"></a>

## 2 · Timestamps and synchronization

Import the main flight before your media when possible. Matching capture times align clips along the flight. Simultaneous videos get separate tracks. Without a matching timestamp, a clip starts at the current playhead. Placement can always be changed manually.

IGC times use UTC. Project settings → Recording time zone controls how times without an explicit zone are interpreted. A selected media clip offers capture-time and timing-alignment controls. Check the preview again after correcting them.

An edited Insta360 export may no longer carry the original capture start. FlightStudio cannot reconstruct removed sections or speed changes. Use originals, or split and align the exported clip manually.

<a id="editing"></a>

## 3 · Editing, snapping and tracks

Drag a clip to move its start. Drag an edge to trim. Ctrl-click to select multiple clips. Set the playhead and press S to split selected clips. Delete removes selected clips. Ctrl + D duplicates; Ctrl + Z/Y undoes/redoes.

Snapping helps position clips while moving them: the clip start snaps to nearby clip starts/ends, the playhead and time zero. N toggles it; Alt while dragging bypasses it. Snapping changes neither the contents nor speed of a clip.

Track headers control visibility, mute and locking. × removes the track and its clips. Ctrl + Z undoes this; source files remain intact. Media and Flights in the header open their galleries; click again or × to close. Drag the divider above the timeline to change its height.

<a id="range"></a>

## 4 · Cut together or only the video

Press I at the start and O at the end of a range, or enter the From/to seconds. “All tracks · ripple edit” cuts across tracks and brings later material forward. This keeps joint video/flight cuts together in time.

To keep the flight running, select only the video clips and choose “Selected clips · keep gaps”. “Delete range” removes only their affected portion. The map keeps its timing. Locked tracks are not edited; check track locks before a joint cut.

<a id="speed"></a>

## 5 · Speed and long sections without video

For one section, split at its boundaries with S, select it and set Clip → Clip speed. For a range, use I/O, choose selected clips or all tracks, set a speed and press “Apply speed”. Speeds up to 200× are supported.

“Accelerate flight without video/photo” starts disabled. “Enable 50×” turns it on; the number field allows up to 200×. For example, 10 minutes of flight-only footage take about 12 seconds at 50×. Manual flight-clip speeds have priority. Audio alone does not count as video/photo.

Film time shows the timeline shortened by automatic acceleration. Edit time without speed-up shows the unaccelerated arrangement. “Preview” beside Play changes only viewing speed, not the speed of the exported film.

<a id="layout"></a>

## 6 · Layout, picture-in-picture and image zoom

Project layout below the preview selects Auto, Full screen, Large video, Large flight, Grid or Stack. Choose 16:9 / 9:16 / 1:1 for the aspect ratio. Simultaneous camera recordings can occupy separate tiles.

In Window position mode, drag frames and resize them at a corner. The color-coded flight-statistics box can also be moved and resized. Frames may extend outside the canvas; only the visible portion is exported.

On a video/photo, the wheel zooms the image and Alt + drag pans within it. Exact values are available under Clip → Size, position & zoom. “Reset frame position & zoom” returns control to the automatic layout.

For a grid or transparent map in only one section, split the flight clip at the boundaries, select the section and set its layout/map style under “Map in this section”. Custom frame positions have priority; use “Use layout” if needed.

<a id="camera"></a>

## 7 · Map mouse controls and camera moves

Switch to Rotate map: drag on the map to rotate and tilt. Right-drag or Shift + drag pans. The wheel changes the distance. Flight map & camera opens heading, pitch, distance and map-style controls.

Camera move: set an initial view (the first saved view applies from the beginning of the flight) and press “Save view here”. Go to a later position, set the target view and transition duration, then save again. The transition starts at that new point and moves from the previous view to the target. The app uses saved camera moves; check the preview. Transitions must not overlap and must fit within the flight.

Map styles include satellite, street map, grayscale relief and transparent relief. Maps and terrain require internet access. Provider credits remain visible in exports.

<a id="multiple"></a>

## 8 · Multiple flights, names and statistics

Add further IGC files under Flights. The main flight controls the map timeline and camera target. Other flights share the map; compare them by UTC or flight start and apply a time offset.

The flight gallery contains names, colors, visibility and name tags. A matching color dot identifies each flight in the statistics. In Window position mode, move and resize the shared statistics box in the preview.

<a id="instruments"></a>

## Instruments: compass, vario and IGC fields

Open Instruments in the header. After importing IGC, enable the starter layout or choose an Individual display / IGC field and add it. The starter layout contains UTC time, ground speed, GPS vario, GPS altitude with a scale and a compass showing GPS course.

Toggle, remove, move and resize every display independently. Use Window position mode to drag; resize at the corner. Double-click to open settings with exact position, size, opacity and background. Background 0% leaves only text and scale. With multiple IGC files, select the data source per display. The color dot identifies the flight.

Additional displays include elapsed time, distance, ground glide ratio, coordinates and, when present, pressure altitude, derived pressure vario, satellites, IGC header data and I/J/K extension fields. Known extensions are named; unknown fields remain unchanged raw values without assumed units. Manufacturer comments, competition tasks and validation signatures are not instrument displays. Reimport IGC in older projects to load extension fields that were not previously stored.

GPS course is movement over ground, not a magnetic compass. GPS altitude is not height above terrain. Speed, course, vario and glide ratio use original flight time; time-lapse does not multiply these values. Smoothing sets the trailing time window (0 = between GPS fixes). Stationary data has no course; glide ratio appears only during descent. Missing values and GPS gaps show a dash. Additional K-record data is held for at most 120 seconds.

Instruments follow flight-clip cuts and speed. For displays without a visible map, hide the 3D flight track with its eye control but retain its clips. A deleted flight section has no associated data. Positions and options are saved in the project and used identically in preview and export.

<a id="effects"></a>

## 9 · Audio, fades and transitions

Select a timeline clip and open Clip. For video/audio, 100% is original volume, 0% is silent and up to 200% is available. Very loud audio can clip. Audio fades are independent from visual fades. The line at the bottom of a timeline clip adjusts volume directly; top handles adjust visual fades.

“Clip enabled · picture and audio” disables a clip and its sound without deleting it. You can also hide or mute an entire track.

For a dissolve or wipe, arrange two suitable clips on the same track, select the second and set the type and duration under “Transition from previous clip”. “Apply transition” moves this clip into an overlap. Other tracks stay in place. Recheck alignment for synchronized footage afterwards.

<a id="save"></a>

## 10 · Saving and moving to another laptop

The current working state is saved locally automatically. “Save project” also creates a .flightstudio file. It contains editing data and the flight track, but not original videos, photos or audio. “Open” loads a project. Save a project file before updating.

For another laptop, copy both the project file and original media. Import missing originals there, then reopen the project file. Keep media unchanged, with their filenames when possible. Both installed and portable editions store data under %APPDATA%/FlightStudio-V2/data in the Windows user profile.

<a id="export"></a>

## 11 · Exporting

Export uses the selected range. Choose Range → All for the whole film. Export offers MP4 or WebM, resolution, frame rate, quality and audio. A good starting point is MP4 / 1080p / 30 fps / Balanced. Higher resolutions and frame rates need more time and storage.

The desktop app supports up to 4K and 60 fps. Background export can continue after closing the editor window. Keep the computer and FlightStudio background process running; fully quitting or sleeping interrupts the work. Browser recording requires a visible tab and has fewer export options.

Background export uses the project snapshot taken at export start. Later edits do not change that running export. Finished files appear in the export window. Map providers require an internet connection.

<a id="updates"></a>

## Checking for and installing updates

Click Updates in the header. “Check for updates” checks the latest stable FlightStudio release on GitHub. A newer version highlights the “Update available” button. Automatic startup checks are enabled by default, at most once daily, and can be disabled in the same window. An offline check reports a failure, not a false up-to-date result.

In the desktop app, “Download and install” downloads the Windows installer, verifies its size and SHA-256 checksum, saves the current project and opens installation. FlightStudio then closes. Follow the Windows installer and reopen the app afterwards. Installation is blocked during export. Windows confirmations and security checks remain in place.

Downloads can be cancelled. From the portable edition, this button installs the app normally; data stays in the same Windows user profile. The browser interface opens the download page instead. Versions before 2.5.0 need one manual update because they do not yet have this button. Checks do not upload projects, flight data or media.

<a id="performance"></a>

## Export speed and acceleration

From 2.5.0, desktop export reads videos sequentially with FFmpeg using their original timestamps, accounting for cuts, variable frame rates, slow motion and multiple cameras. The 3D map and instruments are still rendered for each output moment. Only a bounded number of frames are read ahead; the whole movie is not loaded into memory.

Export → Acceleration defaults to “Automatic (GPU if available)”. MP4 probes AMD, NVIDIA and Intel encoding at the selected resolution and frame rate. If no GPU encoder works, it uses the CPU. The progress display shows the selected encoder. “CPU (compatibility)” forces software encoding if a graphics driver causes problems. GPU encoding may produce larger files at the same quality setting.

WebM uses CPU VP9 and encodes video only once. MP4 is usually the better choice for a fast export. Source resolution, multiple videos, terrain, zoom and output frame rate also affect duration. Preview quality does not change export resolution. The new decoder accelerates desktop export; browser recording still uses the preview.

<a id="trouble"></a>

## 12 · When something looks wrong

Wrong video moment: check capture time, time zone and manual placement. A clip does not respond: check whether its track is locked. An invisible clip: check playhead time, clip enabled state, track visibility, opacity and frame position.

Output too short: check the export range and automatic speed setting. Unexpected grid: reset custom clip positions with “Use layout”. Video will not play: use MP4 with H.264 video and AAC audio. Missing relief: check internet and that terrain has loaded.

## Keyboard shortcuts

| Key / gesture | Function |
| --- | --- |
| Space | Play / pause |
| S | Split selected clips |
| Delete | Remove selected clips |
| Ctrl + D | Duplicate |
| Ctrl + Z / Ctrl + Y | Undo / redo |
| I / O | Set range start / end |
| N / Alt + drag | Toggle / temporarily bypass snapping |
| F / Shift + F | Fit selection / whole film |
| Wheel / Shift + wheel | Zoom timeline / scroll horizontally |
| Alt + wheel | Scroll tracks vertically |
| ← / → | Previous / next preview frame; with Shift, 5 seconds |
| Esc | Exit tutorial / close side panel |

Editor shortcuts apply outside input fields and dialogs.
