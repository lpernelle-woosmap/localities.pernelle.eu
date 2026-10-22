// map-manager.js - Map and marker management

import { CONFIG } from "./config.js";

// Property name used to tag shape features so the data layer can style
// target (red) and compare (blue) shapes differently within a single layer.
const SHAPE_ROLE = "_shapeRole";

let mapInstance = null;
let detailsMarker = null;
let targetGeometry = null; // geometry of the target result, to frame it with the compare one
let viewportPolygon = null;
let compareDetailsMarker = null;
let compareViewportPolygon = null;
let biasCircle = null;

/**
 * Initializes the Woosmap map
 * @param {HTMLElement} container - Map container element
 * @returns {Object} Map instance
 */
export function initializeMap(container) {
  mapInstance = new woosmap.map.Map(container, {
    center: CONFIG.MAP.DEFAULT_CENTER,
    zoom: CONFIG.MAP.DEFAULT_ZOOM,
    gestureHandling: CONFIG.MAP.GESTURE_HANDLING,
    disableDefaultUI: true,
    visualRefresh: true,
    styles: CONFIG.MAP.STYLES
  });

  setupDataLayerStyle();

  // Keep the geographical bias circle in sync with the map as it pans/zooms
  mapInstance.addListener("bounds_changed", () => {
    if (biasCircle) {
      biasCircle.setCenter(mapInstance.getCenter());
      biasCircle.setRadius(getBiasRadius());
    }
  });

  return mapInstance;
}

/**
 * Computes the haversine distance between two points in meters
 */
function metersBetween(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Returns the geographical bias radius adapted to the current zoom level.
 * Based on the visible map width (so it shrinks when zooming in and grows when
 * zooming out), a quarter of that width, capped at MAX_GEOGRAPHICAL_BIAS_RADIUS.
 * @returns {number} Radius in meters
 */
export function getBiasRadius() {
  if (!mapInstance || typeof mapInstance.getBounds !== "function") {
    return CONFIG.API.GEOGRAPHICAL_BIAS_RADIUS;
  }

  const bounds = mapInstance.getBounds();
  if (!bounds) return CONFIG.API.GEOGRAPHICAL_BIAS_RADIUS;

  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();
  const center = mapInstance.getCenter();

  // Horizontal span of the viewport at the center latitude
  const widthMeters = metersBetween(center.lat(), sw.lng(), center.lat(), ne.lng());
  const radius = Math.round(widthMeters / 4);

  // Clamp between the API minimum (10m) and the configured cap, so zooming in
  // very far never produces a radius below what the API accepts.
  return Math.min(
    Math.max(radius, CONFIG.API.MIN_GEOGRAPHICAL_BIAS_RADIUS),
    CONFIG.API.MAX_GEOGRAPHICAL_BIAS_RADIUS
  );
}

/**
 * Gets the current map instance
 * @returns {Object} Map instance
 */
export function getMap() {
  return mapInstance;
}

/**
 * Configures the data layer styling so each GeoJSON shape is colored according
 * to its role: target shapes use the red polygon style, compare shapes the blue.
 */
function setupDataLayerStyle() {
  if (!mapInstance) return;

  mapInstance.data.setStyle((feature) => {
    const style = feature.getProperty(SHAPE_ROLE) === "compare"
      ? CONFIG.MAP.COMPARE_POLYGON_STYLE
      : CONFIG.MAP.POLYGON_STYLE;

    return {
      strokeColor: style.STROKE_COLOR,
      strokeOpacity: style.STROKE_OPACITY,
      strokeWeight: style.STROKE_WEIGHT,
      fillColor: style.FILL_COLOR,
      fillOpacity: style.FILL_OPACITY
    };
  });
}

/**
 * Adds a GeoJSON shape (Polygon/MultiPolygon) to the data layer, tagged with the
 * given role so it gets the right color.
 * @param {Object} shape - GeoJSON geometry from result.geometry.shape
 * @param {string} role - "target" or "compare"
 */
function drawShape(shape, role) {
  mapInstance.data.addGeoJson({
    type: "Feature",
    properties: { [SHAPE_ROLE]: role },
    geometry: shape
  });
}

/**
 * Removes all data layer features previously added for the given role.
 * @param {string} role - "target" or "compare"
 */
function clearShapeFeatures(role) {
  if (!mapInstance) return;

  const toRemove = [];
  mapInstance.data.forEach((feature) => {
    if (feature.getProperty(SHAPE_ROLE) === role) {
      toRemove.push(feature);
    }
  });
  toRemove.forEach((feature) => mapInstance.data.remove(feature));
}

/**
 * Extends bounds with a geometry: its location and, when present, its viewport corners
 * @param {Object} bounds - woosmap.map.LatLngBounds to extend
 * @param {Object} geometry - result.geometry
 */
function extendBounds(bounds, geometry) {
  bounds.extend({ lat: geometry.location.lat, lng: geometry.location.lng });
  if (geometry.viewport) {
    bounds.extend({ lat: geometry.viewport.northeast.lat, lng: geometry.viewport.northeast.lng });
    bounds.extend({ lat: geometry.viewport.southwest.lat, lng: geometry.viewport.southwest.lng });
  }
}

/**
 * Fits the map to bounds without zooming closer than MAX_FIT_ZOOM (tiny
 * viewports such as addresses would otherwise zoom to street level and beyond).
 * @param {Object} bounds - woosmap.map.LatLngBounds
 */
function fitBoundsClamped(bounds) {
  mapInstance.fitBounds(bounds);
  if (mapInstance.getZoom() > CONFIG.MAP.MAX_FIT_ZOOM) {
    mapInstance.setZoom(CONFIG.MAP.MAX_FIT_ZOOM);
  }
}

/**
 * Zoom for a result without viewport: the first of its types with a configured zoom
 * @param {string[]|undefined} types - result.types
 * @returns {number} Zoom level
 */
function zoomForTypes(types) {
  const known = (types || []).find((type) => type in CONFIG.MAP.ZOOM_BY_TYPE);
  return known ? CONFIG.MAP.ZOOM_BY_TYPE[known] : CONFIG.MAP.DEFAULT_RESULT_ZOOM;
}

/**
 * Frames a result: fits its viewport when it has one, otherwise centers on its
 * location at a zoom chosen from its types.
 * @param {Object} result - Result with geometry (and optional types)
 */
function focusResult(result) {
  const { geometry, types } = result;
  if (geometry.viewport) {
    const bounds = new woosmap.map.LatLngBounds();
    extendBounds(bounds, geometry);
    fitBoundsClamped(bounds);
    return;
  }

  mapInstance.setZoom(zoomForTypes(types));
  mapInstance.panTo({ lat: geometry.location.lat, lng: geometry.location.lng });
}

/**
 * Draws the bounding box rectangle of a viewport (fallback when no shape is available)
 * @param {Object} viewport - { northeast, southwest } from result.geometry
 * @param {Object} style - CONFIG.MAP.POLYGON_STYLE or COMPARE_POLYGON_STYLE
 * @returns {Object} Polygon added to the map
 */
function drawViewportRectangle(viewport, style) {
  const { northeast, southwest } = viewport;
  const rectangle = [
    { lat: northeast.lat, lng: northeast.lng },
    { lat: southwest.lat, lng: northeast.lng },
    { lat: southwest.lat, lng: southwest.lng },
    { lat: northeast.lat, lng: southwest.lng },
    { lat: northeast.lat, lng: northeast.lng }
  ];

  const polygon = new woosmap.map.Polygon({
    paths: [rectangle],
    strokeColor: style.STROKE_COLOR,
    strokeOpacity: style.STROKE_OPACITY,
    strokeWeight: style.STROKE_WEIGHT,
    fillColor: style.FILL_COLOR,
    fillOpacity: style.FILL_OPACITY
  });
  polygon.setMap(mapInstance);
  return polygon;
}

/**
 * Creates a marker at a geometry location
 * @param {Object} geometry - result.geometry
 * @param {Object} icon - CONFIG.MAP.MARKER_ICON or COMPARE_MARKER_ICON
 * @returns {Object} Marker added to the map
 */
function createMarker(geometry, icon) {
  const marker = new woosmap.map.Marker({
    position: { lat: geometry.location.lat, lng: geometry.location.lng },
    icon: {
      url: icon.URL,
      scaledSize: new woosmap.map.Size(icon.SCALED_SIZE.width, icon.SCALED_SIZE.height)
    }
  });
  marker.setMap(mapInstance);
  return marker;
}

/**
 * Displays a location on the map with marker and shape or viewport, and frames it
 * @param {Object} result - Location result with geometry
 */
export function displayLocationOnMap(result) {
  if (!mapInstance || !result.geometry) return;

  // Clear previous shape, viewport polygon and marker
  clearShapeFeatures("target");
  if (viewportPolygon) {
    viewportPolygon.setMap(null);
    viewportPolygon = null;
  }
  if (detailsMarker) {
    detailsMarker.setMap(null);
    detailsMarker = null;
  }

  if (result.geometry.shape) {
    // Preferred: render the actual GeoJSON shape via the data layer
    drawShape(result.geometry.shape, "target");
  } else if (result.geometry.viewport) {
    viewportPolygon = drawViewportRectangle(result.geometry.viewport, CONFIG.MAP.POLYGON_STYLE);
  }

  focusResult(result);
  targetGeometry = result.geometry;
  detailsMarker = createMarker(result.geometry, CONFIG.MAP.MARKER_ICON);
}

/**
 * Displays compare environment location on the map with a blue marker and
 * shape or viewport, then frames both the target and compare geometries
 * @param {Object} result - Location result with geometry
 */
export function displayCompareLocationOnMap(result) {
  if (!mapInstance || !result.geometry) return;

  clearCompareLocationFromMap();

  if (result.geometry.shape) {
    // Preferred: render the actual GeoJSON shape via the data layer (blue)
    drawShape(result.geometry.shape, "compare");
  } else if (result.geometry.viewport) {
    compareViewportPolygon = drawViewportRectangle(result.geometry.viewport, CONFIG.MAP.COMPARE_POLYGON_STYLE);
  }

  compareDetailsMarker = createMarker(result.geometry, CONFIG.MAP.COMPARE_MARKER_ICON);

  // Frame both results
  if (detailsMarker && targetGeometry) {
    const bounds = new woosmap.map.LatLngBounds();
    extendBounds(bounds, targetGeometry);
    extendBounds(bounds, result.geometry);
    fitBoundsClamped(bounds);
  }
}

/**
 * Clears compare marker and polygon from the map
 */
export function clearCompareLocationFromMap() {
  clearShapeFeatures("compare");
  if (compareDetailsMarker) {
    compareDetailsMarker.setMap(null);
    compareDetailsMarker = null;
  }
  if (compareViewportPolygon) {
    compareViewportPolygon.setMap(null);
    compareViewportPolygon = null;
  }
}

/**
 * Adds click listener to map
 * @param {Function} callback - Click handler
 */
export function addMapClickListener(callback) {
  if (mapInstance) {
    mapInstance.addListener("click", callback);
  }
}

/**
 * Displays the geographical bias circle, centered on the current map center.
 * The circle follows the map center as it moves (see center_changed listener).
 */
export function showBiasCircle() {
  if (!mapInstance) return;

  if (biasCircle) {
    biasCircle.setCenter(mapInstance.getCenter());
    biasCircle.setRadius(getBiasRadius());
    return;
  }

  biasCircle = new woosmap.map.Circle({
    center: mapInstance.getCenter(),
    radius: getBiasRadius(),
    strokeColor: CONFIG.MAP.BIAS_CIRCLE_STYLE.STROKE_COLOR,
    strokeOpacity: CONFIG.MAP.BIAS_CIRCLE_STYLE.STROKE_OPACITY,
    strokeWeight: CONFIG.MAP.BIAS_CIRCLE_STYLE.STROKE_WEIGHT,
    fillColor: CONFIG.MAP.BIAS_CIRCLE_STYLE.FILL_COLOR,
    fillOpacity: CONFIG.MAP.BIAS_CIRCLE_STYLE.FILL_OPACITY
  });
  biasCircle.setMap(mapInstance);
}

/**
 * Removes the geographical bias circle from the map
 */
export function hideBiasCircle() {
  if (biasCircle) {
    biasCircle.setMap(null);
    biasCircle = null;
  }
}
