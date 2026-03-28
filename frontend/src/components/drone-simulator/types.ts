// All drone-related TypeScript types — mirrors backend SSE event shapes

export interface TelemetryEvent {
  type: "telemetry";
  drone_id: string;
  waypoint: number;
  total_waypoints: number;
  lat: number;
  lon: number;
  altitude_m: number;
  heading_deg: number;
  speed_ms: number;
  battery_pct: number;
  elapsed_s: number;
}

export interface DetectionEvent {
  type: "detection";
  drone_id: string;
  waypoint: number;
  lat: number;
  lon: number;
  zone: string;
  condition: string;
  confidence: number;
  severity: "healthy" | "mild" | "moderate" | "severe";
  description: string;
}

export interface MissionStartEvent {
  type: "mission_start";
  drone_id: string;
  field_area_hectares: number;
  total_waypoints: number;
  altitude_m: number;
  speed_ms: number;
  grid: string;
  field_bounds: FieldBounds;
}

export interface MissionCompleteEvent {
  type: "mission_complete";
  drone_id: string;
  total_time_s: number;
  area_covered_hectares: number;
  waypoints_surveyed: number;
  battery_remaining_pct: number;
  healthy_zones: string[];
  issues_count: number;
  zone_summaries: ZoneSummary[];
  issues: Issue[];
  overall_health: "healthy" | "warning" | "critical";
}

export interface ZoneSummary {
  zone: string;
  status: string;
  condition?: string;
  confidence?: number;
  details: string;
}

export interface Issue {
  zone: string;
  condition: string;
  severity: string;
  recommendation: string;
}

export interface SprayMission {
  condition: string;
  zones: string[];
  affected_area_hectares: number;
  treatment: string;
  priority: "high" | "medium";
}

export interface SprayPlan {
  status: string;
  total_affected_area_hectares: number;
  total_field_area_hectares: number;
  chemical_savings_pct: number;
  missions: SprayMission[];
  note: string;
}

export type DroneSSEEvent =
  | TelemetryEvent
  | DetectionEvent
  | MissionStartEvent
  | MissionCompleteEvent
  | { type: "takeoff"; drone_id: string; altitude_m: number; message: string }
  | { type: "returning"; drone_id: string; message: string }
  | { type: "zone_change"; drone_id: string; from_zone: string; to_zone: string; message: string };

export type MissionStatus = "idle" | "takeoff" | "surveying" | "returning" | "complete";

export interface FieldBounds {
  nw: [number, number]; // [lat, lon]
  se: [number, number];
}

export interface LocalPosition {
  x: number; // east-west
  y: number; // altitude
  z: number; // north-south (negated for three.js)
}

// Default demo field near Pune, Maharashtra
export const DEFAULT_FIELD_BOUNDS: FieldBounds = {
  nw: [18.525, 73.85],
  se: [18.515, 73.86],
};

export const FIELD_3D_SIZE = 100; // three.js units for the longest field dimension
