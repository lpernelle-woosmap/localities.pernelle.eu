// map-manager.js - Map and marker management

import { CONFIG } from "./config.js";

// Property name used to tag shape features so the data layer can style
// target (red) and compare (blue) shapes differently within a single layer.
const SHAPE_ROLE = "_shapeRole";

let mapInstance = null;
let detailsMarker = null;
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
 * Fits the map to a geometry viewport (NE/SW bounds), if present.
 * @param {Object} viewport - { northeast, southwest } from result.geometry
 */
function fitToViewport(viewport) {
  if (!viewport) return;

  const bounds = new woosmap.map.LatLngBounds();
  bounds.extend({ lat: viewport.northeast.lat, lng: viewport.northeast.lng });
  bounds.extend({ lat: viewport.southwest.lat, lng: viewport.southwest.lng });
  mapInstance.fitBounds(bounds);
}

/**
 * Displays a location on the map with marker and optional viewport
 * @param {Object} result - Location result with geometry
 */
export function displayLocationOnMap(result) {
  if (!mapInstance || !result.geometry) return;

  const { lat, lng } = result.geometry.location;
  const markerPosition = { lat, lng };

  // Clear previous shape and viewport polygon
  clearShapeFeatures("target");
  if (viewportPolygon) {
    viewportPolygon.setMap(null);
    viewportPolygon = null;
  }

  if (result.geometry.shape) {
    // Preferred: render the actual GeoJSON shape via the data layer
    drawShape(result.geometry.shape, "target");

    if (result.geometry.viewport) {
      fitToViewport(result.geometry.viewport);
    } else {
      mapInstance.panTo(markerPosition);
    }
  } else if (result.geometry.viewport) {
    // Fallback: draw the bounding box rectangle when no shape is available
    const { northeast, southwest } = result.geometry.viewport;
    const rectangle = [
      { lat: northeast.lat, lng: northeast.lng },
      { lat: southwest.lat, lng: northeast.lng },
      { lat: southwest.lat, lng: southwest.lng },
      { lat: northeast.lat, lng: southwest.lng },
      { lat: northeast.lat, lng: northeast.lng }
    ];

    viewportPolygon = new woosmap.map.Polygon({
      paths: [rectangle],
      strokeColor: CONFIG.MAP.POLYGON_STYLE.STROKE_COLOR,
      strokeOpacity: CONFIG.MAP.POLYGON_STYLE.STROKE_OPACITY,
      strokeWeight: CONFIG.MAP.POLYGON_STYLE.STROKE_WEIGHT,
      fillColor: CONFIG.MAP.POLYGON_STYLE.FILL_COLOR,
      fillOpacity: CONFIG.MAP.POLYGON_STYLE.FILL_OPACITY
    });
    viewportPolygon.setMap(mapInstance);
    mapInstance.panTo(markerPosition);
  } else {
    // Set zoom based on type
    const type = result.types?.[0];
    let zoom = CONFIG.MAP.ZOOM_LEVELS.ADDRESS;

    if (type === "locality") {
      zoom = CONFIG.MAP.ZOOM_LEVELS.LOCALITY;
    } else if (type === "postal_code") {
      zoom = CONFIG.MAP.ZOOM_LEVELS.POSTAL_CODE;
    }

    mapInstance.setZoom(zoom);
    mapInstance.panTo(markerPosition);
  }

  // Clear previous marker
  if (detailsMarker) {
    detailsMarker.setMap(null);
    detailsMarker = null;
  }

  // Create new marker
  detailsMarker = new woosmap.map.Marker({
    position: markerPosition,
    icon: {
      url: CONFIG.MAP.MARKER_ICON.URL,
      scaledSize: new woosmap.map.Size(
        CONFIG.MAP.MARKER_ICON.SCALED_SIZE.width,
        CONFIG.MAP.MARKER_ICON.SCALED_SIZE.height
      )
    }
  });
  detailsMarker.setMap(mapInstance);
}

/**
 * Displays compare environment location on the map with a blue marker and optional viewport
 * @param {Object} result - Location result with geometry
 */
export function displayCompareLocationOnMap(result) {
  if (!mapInstance || !result.geometry) return;

  const { lat, lng } = result.geometry.location;

  // Clear previous compare shape and viewport polygon
  clearShapeFeatures("compare");
  if (compareViewportPolygon) {
    compareViewportPolygon.setMap(null);
    compareViewportPolygon = null;
  }

  if (result.geometry.shape) {
    // Preferred: render the actual GeoJSON shape via the data layer (blue)
    drawShape(result.geometry.shape, "compare");
  } else if (result.geometry.viewport) {
    // Fallback: draw the bounding box rectangle when no shape is available
    const { northeast, southwest } = result.geometry.viewport;
    const rectangle = [
      { lat: northeast.lat, lng: northeast.lng },
      { lat: southwest.lat, lng: northeast.lng },
      { lat: southwest.lat, lng: southwest.lng },
      { lat: northeast.lat, lng: southwest.lng },
      { lat: northeast.lat, lng: northeast.lng }
    ];

    compareViewportPolygon = new woosmap.map.Polygon({
      paths: [rectangle],
      strokeColor: CONFIG.MAP.COMPARE_POLYGON_STYLE.STROKE_COLOR,
      strokeOpacity: CONFIG.MAP.COMPARE_POLYGON_STYLE.STROKE_OPACITY,
      strokeWeight: CONFIG.MAP.COMPARE_POLYGON_STYLE.STROKE_WEIGHT,
      fillColor: CONFIG.MAP.COMPARE_POLYGON_STYLE.FILL_COLOR,
      fillOpacity: CONFIG.MAP.COMPARE_POLYGON_STYLE.FILL_OPACITY
    });
    compareViewportPolygon.setMap(mapInstance);
  }

  // Clear previous compare marker
  if (compareDetailsMarker) {
    compareDetailsMarker.setMap(null);
    compareDetailsMarker = null;
  }

  // Create compare marker (blue)
  compareDetailsMarker = new woosmap.map.Marker({
    position: { lat, lng },
    icon: {
      url: CONFIG.MAP.COMPARE_MARKER_ICON.URL,
      scaledSize: new woosmap.map.Size(
        CONFIG.MAP.COMPARE_MARKER_ICON.SCALED_SIZE.width,
        CONFIG.MAP.COMPARE_MARKER_ICON.SCALED_SIZE.height
      )
    }
  });
  compareDetailsMarker.setMap(mapInstance);

  // Fit bounds to show both markers
  if (detailsMarker) {
    const mainPos = detailsMarker.getPosition();
    const bounds = new woosmap.map.LatLngBounds();
    bounds.extend({ lat: mainPos.lat(), lng: mainPos.lng() });
    bounds.extend({ lat, lng });
    mapInstance.fitBounds(bounds);
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
