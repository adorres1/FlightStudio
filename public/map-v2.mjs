import { sampleFlight } from "/lib/flight.mjs";
import { cameraAt } from "/lib/camera.mjs";
import { flightReadouts, flightName } from "/lib/flight-overlays.mjs";
export class FlightMap {
  constructor(warn) {
    const C = (this.C = window.Cesium);
    C.Ion.defaultAccessToken = "";
    this.warn = warn;
    this.heading = 0.3;
    this.pitch = -0.65;
    this.range = 4000;
    this.mode = "follow";
    this.frames = [];
    this.style = "";
    this.opacity = 0.65;
    const v = (this.viewer = new C.Viewer("map-source", {
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      selectionIndicator: false,
      infoBox: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      baseLayer: false,
      terrainProvider: new C.EllipsoidTerrainProvider(),
      useDefaultRenderLoop: false,
      contextOptions: { webgl: { preserveDrawingBuffer: true, alpha: true } },
      creditContainer: "map-credits",
    }));
    const scene = v.scene;
    scene.backgroundColor = C.Color.TRANSPARENT;
    scene.skyBox.show = false;
    scene.skyAtmosphere.show = false;
    scene.sun.show = false;
    scene.moon.show = false;
    scene.fog.enabled = false;
    scene.globe.showGroundAtmosphere = false;
    scene.globe.depthTestAgainstTerrain = false;
    scene.postProcessStages.fxaa.enabled = false;
    v.resolutionScale = 1;
    this.marker = v.entities.add({
      position: C.Cartesian3.fromDegrees(7.8, 46.7, 1700),
      point: {
        pixelSize: 13,
        color: C.Color.fromCssColorString("#ffb55b"),
        outlineWidth: 3,
        outlineColor: C.Color.WHITE,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        show: false, text: '', font: '14px sans-serif',
        fillColor: C.Color.WHITE, showBackground: true,
        backgroundColor: C.Color.fromCssColorString('#11222be6'),
        pixelOffset: new C.Cartesian2(0, -26), disableDepthTestDistance: Infinity,
      },
    });
    this.setStyle("satellite");
    this.terrainLabel = "Gelände lädt …";
    this.terrainReady = false;
    C.ArcGISTiledElevationTerrainProvider.fromUrl(
      "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer",
    )
      .then((p) => {
        v.terrainProvider = p;
        this.terrainReady = true;
        this.terrainLabel = "3D-Gelände";
        p.errorEvent.addEventListener(() => {
          if (!this.warned) {
            this.warned = true;
            warn(
              "Einige Geländedaten fehlen. Bitte Internetverbindung prüfen.",
            );
          }
        });
      })
      .catch(() => {
        this.terrainReady = true;
        this.terrainLabel = "Ohne Gelände";
        if (this.flight)
          warn(
            "Gelände nicht erreichbar. Relief ist erst mit geladenen Geländedaten verfügbar.",
          );
      });
  }
  setStyle(style, opacity = this.opacity) {
    const C = this.C,
      g = this.viewer.scene.globe;
    this.opacity = opacity;
    if (this.style === style) {
      if (g.material?.uniforms?.strength !== undefined)
        g.material.uniforms.strength = opacity;
      return;
    }
    this.style = style;
    this.viewer.imageryLayers.removeAll();
    g.material = undefined;
    g.translucency.enabled = false;
    g.baseColor = C.Color.WHITE;
    if (style === "satellite" || style === "osm") {
      this.viewer.imageryLayers.addImageryProvider(
        new C.UrlTemplateImageryProvider(
          style === "osm"
            ? {
                url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
                maximumLevel: 19,
                credit: "© OpenStreetMap contributors",
              }
            : {
                url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
                maximumLevel: 19,
                credit: "Tiles © Esri, Maxar, Earthstar Geographics",
              },
        ),
      );
    } else {
      const transparent = style === "overlay";
      g.baseColor = transparent ? C.Color.TRANSPARENT : C.Color.WHITE;
      g.translucency.enabled = transparent;
      g.translucency.frontFaceAlpha = 1;
      g.translucency.backFaceAlpha = 0;
      g.material = new C.Material({
        fabric: {
          type: "FlightStudioRelief",
          uniforms: { strength: opacity, overlay: transparent ? 1 : 0 },
          source: `
        czm_material czm_getMaterial(czm_materialInput inputData){
          czm_material material=czm_getDefaultMaterial(inputData);
          vec3 eyePosition=-inputData.positionToEyeEC;
          vec3 face=normalize(cross(dFdx(eyePosition),dFdy(eyePosition)));
          vec3 worldPosition=(czm_inverseView*vec4(eyePosition,1.0)).xyz;
          vec3 up=normalize(mat3(czm_view)*normalize(worldPosition));
          float incline=length(cross(face,up));
          float light=abs(dot(face,normalize(vec3(-0.35,0.6,0.75))));
          float interval=75.0;
          float position=mod(inputData.height,interval);
          float edge=max(fwidth(inputData.height)*0.9,0.8);
          float contour=1.0-smoothstep(0.0,edge,min(position,interval-position));
          float shade=mix(0.28,0.98,light)-contour*0.25;
          material.diffuse=vec3(clamp(shade,0.05,1.0));
          material.alpha=overlay>0.5?strength*clamp(incline*0.8+contour*0.9,0.0,1.0):1.0;
          return material;
        }`,
        },
      });
    }
  }
  load(flight) {
    const C = this.C;
    this.flight = flight;
    for (const line of this.lines || []) this.viewer.entities.remove(line);
    this.lines = [];
    let positions = [];
    const flush = () => {
      if (positions.length > 1)
        this.lines.push(
          this.viewer.entities.add({
            polyline: {
              positions,
              width: 3,
              arcType: C.ArcType.NONE,
              material: C.Color.fromCssColorString("#f28143"),
            },
          }),
        );
      positions = [];
    };
    for (const p of flight.points) {
      if (p.gap) flush();
      positions.push(C.Cartesian3.fromDegrees(p.lon, p.lat, p.alt));
    }
    flush();
    this.sphere = C.BoundingSphere.fromPoints(
      flight.points
        .filter(
          (_, i) =>
            i % Math.max(1, Math.floor(flight.points.length / 3000)) === 0,
        )
        .map((p) => C.Cartesian3.fromDegrees(p.lon, p.lat, p.alt)),
    );
    this.frame();
    this.initial = this.pose();
    this.primarySphere = this.sphere;
    this.overlayKey = null;
  }
  syncOverlays(overlays = []) {
    if (this.flight) {
      this.marker.label.text = flightName(this.flight).slice(0, 100);
      this.marker.label.show = this.flight.showNameTag === true;
    }
    this.overlays = overlays;
    const key = JSON.stringify(
      overlays.map((o) => [o.id, o.name, o.color, o.visible, o.showNameTag]),
    );
    if (key === this.overlayKey) return;
    this.overlayKey = key;
    const C = this.C;
    for (const entity of this.overlayEntities || [])
      this.viewer.entities.remove(entity);
    this.overlayEntities = [];
    this.overlayMarkers = new Map();
    const points = [];
    for (const overlay of overlays.filter((o) => o.visible !== false)) {
      const color = C.Color.fromCssColorString(overlay.color || "#2db7f5");
      let positions = [];
      const flush = () => {
        if (positions.length > 1)
          this.overlayEntities.push(
            this.viewer.entities.add({
              polyline: {
                positions,
                width: 3,
                arcType: C.ArcType.NONE,
                material: color,
              },
            }),
          );
        positions = [];
      };
      for (const [i, p] of overlay.flight.points.entries()) {
        if (p.gap) flush();
        const position = C.Cartesian3.fromDegrees(p.lon, p.lat, p.alt);
        positions.push(position);
        if (
          i % Math.max(1, Math.floor(overlay.flight.points.length / 2000)) ===
          0
        )
          points.push(position);
      }
      flush();
      const marker = this.viewer.entities.add({
        show: false,
        position: C.Cartesian3.ZERO,
        point: {
          pixelSize: 12,
          color,
          outlineWidth: 2,
          outlineColor: C.Color.WHITE,
          disableDepthTestDistance: Infinity,
        },
        label: {
          show: overlay.showNameTag !== false,
          text: String(overlay.name || overlay.flight.name).slice(0, 100),
          font: "13px sans-serif",
          fillColor: color,
          showBackground: true,
          backgroundColor: C.Color.fromCssColorString("#11222bd0"),
          pixelOffset: new C.Cartesian2(0, -22),
          disableDepthTestDistance: Infinity,
        },
      });
      this.overlayEntities.push(marker);
      this.overlayMarkers.set(overlay.id, marker);
    }
    this.sphere =
      points.length && this.primarySphere
        ? C.BoundingSphere.union(
            this.primarySphere,
            C.BoundingSphere.fromPoints(points),
          )
        : this.primarySphere;
  }
  get legend() {
    if (!this.flight) return [];
    return [
      { name: flightName(this.flight), color: "#f28143" },
      ...(this.overlays || [])
        .filter((o) => o.visible !== false)
        .map((o) => ({ name: o.name || o.flight.name, color: o.color })),
    ];
  }
  frame() {
    if (!this.sphere) return;
    const C = this.C,
      c = this.viewer.camera;
    c.lookAtTransform(C.Matrix4.IDENTITY);
    c.viewBoundingSphere(
      this.sphere,
      new C.HeadingPitchRange(
        0.25,
        -0.75,
        Math.max(2500, this.sphere.radius * 2.7),
      ),
    );
    c.lookAtTransform(C.Matrix4.IDENTITY);
  }
  pose() {
    const c = this.viewer.camera,
      p = c.positionCartographic,
      C = this.C;
    return {
      lon: C.Math.toDegrees(p.longitude),
      lat: C.Math.toDegrees(p.latitude),
      height: p.height,
      heading: c.heading,
      pitch: c.pitch,
      roll: c.roll,
    };
  }
  apply(p) {
    if (!p) return;
    const C = this.C;
    this.viewer.camera.setView({
      destination: C.Cartesian3.fromDegrees(p.lon, p.lat, p.height),
      orientation: { heading: p.heading, pitch: p.pitch, roll: p.roll || 0 },
    });
  }
  orbit() {
    if (!this.sample) return;
    const C = this.C,
      p = this.sample,
      c = this.viewer.camera;
    c.lookAt(
      C.Cartesian3.fromDegrees(p.lon, p.lat, p.alt),
      new C.HeadingPitchRange(this.heading, this.pitch, this.range),
    );
    c.lookAtTransform(C.Matrix4.IDENTITY);
  }
  gesture() {
    const C = this.C, camera = this.viewer.camera, scene = this.viewer.scene;
    const ray = camera.getPickRay(new C.Cartesian2(scene.canvas.clientWidth / 2, scene.canvas.clientHeight / 2));
    const anchor = (ray && scene.globe.pick(ray, scene)) ||
      (this.sample && C.Cartesian3.fromDegrees(this.sample.lon, this.sample.lat, this.sample.alt));
    if (!anchor) return null;
    return { anchor, heading: camera.heading, pitch: camera.pitch,
      range: C.Cartesian3.distance(camera.positionWC, anchor),
      right: C.Cartesian3.clone(camera.rightWC), up: C.Cartesian3.clone(camera.upWC),
      fov: camera.frustum.fovy || Math.PI / 3 };
  }
  moveGesture(start, dx, dy, pan = false, zoom = 1) {
    if (!start) return;
    const C = this.C, camera = this.viewer.camera;
    let anchor = C.Cartesian3.clone(start.anchor);
    if (pan) {
      const scale = start.range * 2 * Math.tan(start.fov / 2);
      C.Cartesian3.add(anchor, C.Cartesian3.multiplyByScalar(start.right, -dx * scale, new C.Cartesian3()), anchor);
      C.Cartesian3.add(anchor, C.Cartesian3.multiplyByScalar(start.up, dy * scale, new C.Cartesian3()), anchor);
      const p = C.Cartographic.fromCartesian(anchor), original = C.Cartographic.fromCartesian(start.anchor);
      anchor = C.Cartesian3.fromRadians(p.longitude, p.latitude, original.height);
    }
    this.heading = start.heading + (pan ? 0 : dx * 5);
    this.pitch = Math.max(-1.55, Math.min(-.06, start.pitch - (pan ? 0 : dy * 3)));
    this.range = Math.max(100, Math.min(200000, start.range * zoom));
    camera.lookAt(anchor, new C.HeadingPitchRange(this.heading, this.pitch, this.range));
    camera.lookAtTransform(C.Matrix4.IDENTITY);
  }
  update(source, output, settings) {
    if (!this.flight) return;
    this.readouts = flightReadouts(this.flight, this.overlays, source);
    this.sample = this.readouts[0]?.sample;
    this.marker.show = !!this.sample;
    if (this.sample) {
      const p = this.sample;
      this.marker.position = this.C.Cartesian3.fromDegrees(p.lon, p.lat, p.alt);
    }
    for (const row of this.readouts.slice(1)) {
      const marker = this.overlayMarkers?.get(row.id);
      if (!marker) continue;
      const p = row.sample;
      marker.show = !!p;
      if (p)
        marker.position = this.C.Cartesian3.fromDegrees(p.lon, p.lat, p.alt);
    }
    this.setStyle(settings.style, settings.opacity);
    if (settings.camera === "follow") this.orbit();
    if (settings.camera === "path")
      this.apply(
        cameraAt(
          output * 1000,
          settings.frames,
          settings.initial || this.initial,
        ),
      );
    this.viewer.resize();
    this.viewer.render();
    return this.sample;
  }
  resize(w, h) {
    const element = document.querySelector("#map-source");
    const limit = Math.min(8192, this.viewer.scene.context.maximumTextureSize || 8192);
    const scale = Math.min(1, limit / Math.max(w, h));
    w = Math.max(64, Math.round(w * scale));
    h = Math.max(64, Math.round(h * scale));
    if (element.clientWidth !== w || element.clientHeight !== h) {
      element.style.width = w + "px";
      element.style.height = h + "px";
      this.viewer.resize();
    }
  }
  get canvas() {
    return this.viewer.canvas;
  }
  get ready() {
    return this.terrainReady && this.viewer.scene.globe.tilesLoaded;
  }
  get attribution() {
    return this.style === "osm"
      ? "© OpenStreetMap · Terrain © Esri · Cesium"
      : this.style === "satellite"
        ? "Imagery © Esri, Maxar, Earthstar Geographics · Terrain © Esri · Cesium"
        : "Terrain © Esri · Cesium";
  }
}
