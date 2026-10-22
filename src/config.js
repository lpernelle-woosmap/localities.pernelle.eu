// config.js - Application configuration and constants

export const CONFIG = {
  // Map configuration
  MAP: {
    DEFAULT_CENTER: { lat: 48.8534, lng: 2.3488 }, // Paris
    DEFAULT_ZOOM: 5,
    // Zoom applied when a result has no viewport, by its first type
    ZOOM_BY_TYPE: {
      country: 5,
      admin_level: 7,
      locality: 11,
      postal_code: 12,
      airport: 13,
      address: 16
    },
    DEFAULT_RESULT_ZOOM: 15, // other types (POI, stations, shopping...)
    MAX_FIT_ZOOM: 17, // cap when fitting a tiny viewport or two very close markers
    GESTURE_HANDLING: "greedy",
    MARKER_ICON: {
      URL: "marker-red.svg",
      SCALED_SIZE: { height: 40, width: 40 }
    },
    POLYGON_STYLE: {
      STROKE_COLOR: "#b71c1c",
      STROKE_OPACITY: 0.8,
      STROKE_WEIGHT: 2,
      FILL_COLOR: "#b71c1c",
      FILL_OPACITY: 0.5
    },
    COMPARE_MARKER_ICON: {
      URL: "marker-blue.svg",
      SCALED_SIZE: { height: 40, width: 40 }
    },
    COMPARE_POLYGON_STYLE: {
      STROKE_COLOR: "#1565C0",
      STROKE_OPACITY: 0.8,
      STROKE_WEIGHT: 2,
      FILL_COLOR: "#1565C0",
      FILL_OPACITY: 0.3
    },
    BIAS_CIRCLE_STYLE: {
      STROKE_COLOR: "#7c3aed",
      STROKE_OPACITY: 0.8,
      STROKE_WEIGHT: 2,
      FILL_COLOR: "#7c3aed",
      FILL_OPACITY: 0.15
    },
    STYLES: [
      {
        featureType: "point_of_interest",
        elementType: "all",
        stylers: [{ visibility: "on" }]
      }
    ]
  },

  // API configuration
  API: {
    DEFAULT_LANGUAGE: "fr",
    DEBOUNCE_DELAY: 300, // milliseconds
    GEOGRAPHICAL_BIAS_RADIUS: 10000, // meters (fallback when map bounds are unavailable)
    MIN_GEOGRAPHICAL_BIAS_RADIUS: 10, // meters (API minimum accepted radius)
    MAX_GEOGRAPHICAL_BIAS_RADIUS: 100000 // meters (cap for the zoom-adaptive radius)
  },

  // Woosmap SDK
  WOOSMAP: {
    SDK_KEY: "woos-afefb9b4-238c-3c6a-a036-9b630b6ca775",
    SDK_URL: "https://sdk.woosmap.com/map/map.js"
  }
};
