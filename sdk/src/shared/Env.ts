export function getGraphhopperApiKey() {
  return validate(process.env["EXPO_PUBLIC_API_GRAPHHOPPER_KEY"], "GraphHopper API key");
}

export function getGoogleApiKey() {
  return validate(process.env["EXPO_PUBLIC_API_GOOGLE_KEY"], "Google Geo Coding API Key");
}

export function getGeospatialARCoreApiKey() {
  return validate(process.env["GEOSPATIAL_ARCORE_KEY"], "Google Geospatial ARCore API Key");
}

export function getCmsBaseUrl() {
  return validate(process.env["EXPO_PUBLIC_CMS_BASE_URL"], "CMS base URL");
}

// Measurement builds add the checkpoint button and the positioning log for test walks.
export function isMeasurementBuild(): boolean {
  return process.env["EXPO_PUBLIC_MEASUREMENT_BUILD"] === "true";
}

function validate(value: string | undefined, name: string): string {
  if (!value || value.length === 0) {
    throw new Error(
      `Missing required environment variable: '${name}'. Add it to your .env file. Check company Bitwarden or use your own.`,
    );
  }

  return value;
}
