import { FieldBounds, LocalPosition, FIELD_3D_SIZE } from "../types";

// Earth radius in meters
const R = 6371000;

/** Convert degrees to radians */
function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Compute the real-world dimensions of the field in meters.
 */
export function fieldDimensionsMeters(bounds: FieldBounds): { widthM: number; heightM: number } {
  const [nwLat, nwLon] = bounds.nw;
  const [seLat, seLon] = bounds.se;

  // Width: distance along longitude at the average latitude
  const avgLat = (nwLat + seLat) / 2;
  const widthM = Math.abs(seLon - nwLon) * toRad(1) * R * Math.cos(toRad(avgLat));

  // Height: distance along latitude
  const heightM = Math.abs(nwLat - seLat) * toRad(1) * R;

  return { widthM, heightM };
}

/**
 * Convert GPS (lat, lon) to local 3D coordinates.
 * The field center maps to (0, 0, 0).
 * X = east-west, Z = north-south (negated so north is -Z in three.js), Y = altitude.
 */
export function gpsToLocal(
  lat: number,
  lon: number,
  altitude: number,
  bounds: FieldBounds
): LocalPosition {
  const [nwLat, nwLon] = bounds.nw;
  const [seLat, seLon] = bounds.se;

  const { widthM, heightM } = fieldDimensionsMeters(bounds);
  const maxDim = Math.max(widthM, heightM);
  const scale = FIELD_3D_SIZE / maxDim;

  const centerLat = (nwLat + seLat) / 2;
  const centerLon = (nwLon + seLon) / 2;

  // Offset from center in meters
  const avgLat = centerLat;
  const dLon = (lon - centerLon) * toRad(1) * R * Math.cos(toRad(avgLat));
  const dLat = (lat - centerLat) * toRad(1) * R;

  return {
    x: dLon * scale,
    y: altitude * scale * 0.5, // scale altitude but dampen so drone isn't too high
    z: -dLat * scale, // negate: north is -Z in three.js
  };
}

/**
 * Get the 3D field dimensions (width along X, height along Z).
 */
export function field3DDimensions(bounds: FieldBounds): { width: number; height: number } {
  const { widthM, heightM } = fieldDimensionsMeters(bounds);
  const maxDim = Math.max(widthM, heightM);
  const scale = FIELD_3D_SIZE / maxDim;
  return {
    width: widthM * scale,
    height: heightM * scale,
  };
}

/**
 * Generate the lawnmower waypoint GPS coordinates (mirrors backend logic).
 */
export function generateWaypointCoords(
  bounds: FieldBounds,
  rows: number = 4,
  cols: number = 4
): Array<[number, number]> {
  const [nwLat, nwLon] = bounds.nw;
  const [seLat, seLon] = bounds.se;

  const latStep = (seLat - nwLat) / Math.max(rows - 1, 1);
  const lonStep = (seLon - nwLon) / Math.max(cols - 1, 1);

  const waypoints: Array<[number, number]> = [];

  for (let row = 0; row < rows; row++) {
    const colRange = row % 2 === 0
      ? Array.from({ length: cols }, (_, i) => i)
      : Array.from({ length: cols }, (_, i) => cols - 1 - i);

    for (const col of colRange) {
      const lat = nwLat + row * latStep;
      const lon = nwLon + col * lonStep;
      waypoints.push([lat, lon]);
    }
  }

  return waypoints;
}
