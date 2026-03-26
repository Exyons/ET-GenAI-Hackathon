"""Lightweight Drone Simulator for Agricultural Field Surveys.

Simulates a drone flying a lawnmower survey pattern over a rectangular field.
At each waypoint, it can trigger the vision pipeline for crop disease detection.
Streams telemetry and detection results via SSE.

Usage:
    from agri_agent_backend.drone import DroneSimulator
    sim = DroneSimulator(field_bounds={"nw": [18.52, 73.85], "se": [18.51, 73.86]})
    for event in sim.run_survey():
        yield f"data: {json.dumps(event)}\\n\\n"
"""

import json
import math
import random
import time
import uuid
from dataclasses import dataclass, field, asdict
from typing import Generator


@dataclass
class DroneState:
    """Current state of the simulated drone."""
    drone_id: str = ""
    lat: float = 0.0
    lon: float = 0.0
    altitude: float = 50.0  # metres AGL
    heading: float = 0.0  # degrees, 0=North
    speed: float = 8.0  # m/s ground speed
    battery: float = 100.0  # percentage
    status: str = "idle"  # idle, takeoff, surveying, returning, landed
    waypoint_index: int = 0
    total_waypoints: int = 0
    elapsed_seconds: float = 0.0


@dataclass
class Detection:
    """A disease/anomaly detection at a specific location."""
    lat: float
    lon: float
    zone: str  # e.g., "NE", "SE", "NW", "SW", "Center"
    condition: str  # e.g., "bacterial_blight", "healthy", "nutrient_deficiency"
    confidence: float  # 0-1
    severity: str  # "healthy", "mild", "moderate", "severe"
    description: str = ""


# Simulated disease patterns for demo
DISEASE_SCENARIOS = [
    {
        "condition": "healthy",
        "severity": "healthy",
        "confidence": 0.92,
        "description": "Healthy green canopy with uniform growth. No signs of disease or pest damage.",
    },
    {
        "condition": "bacterial_blight",
        "severity": "moderate",
        "confidence": 0.85,
        "description": "Water-soaked lesions visible on leaves. V-shaped yellowing from leaf tips consistent with Bacterial Leaf Blight (Xanthomonas oryzae).",
    },
    {
        "condition": "leaf_blast",
        "severity": "severe",
        "confidence": 0.88,
        "description": "Diamond-shaped grey spots with dark borders on leaves. Pattern consistent with Rice Blast (Magnaporthe oryzae). Requires immediate treatment.",
    },
    {
        "condition": "nutrient_deficiency_zinc",
        "severity": "mild",
        "confidence": 0.78,
        "description": "Interveinal chlorosis in younger leaves with stunted growth. Consistent with Zinc deficiency. Recommend ZnSO4 application at 25 kg/hectare.",
    },
    {
        "condition": "fall_armyworm",
        "severity": "severe",
        "confidence": 0.91,
        "description": "Elongated papery windows on leaves with ragged holes. Frass visible in leaf whorls. Consistent with Fall Armyworm (Spodoptera frugiperda) infestation.",
    },
    {
        "condition": "water_stress",
        "severity": "moderate",
        "confidence": 0.82,
        "description": "Leaf rolling and wilting observed across this zone. Soil appears dry with visible cracks. Recommend immediate irrigation.",
    },
    {
        "condition": "brown_plant_hopper",
        "severity": "moderate",
        "confidence": 0.80,
        "description": "Circular drying patches (hopper burn) visible. Honeydew deposits on lower plant parts. Consistent with Brown Plant Hopper infestation.",
    },
]


def _get_zone_label(row: int, col: int, total_rows: int, total_cols: int) -> str:
    """Get cardinal direction label for a grid position."""
    if total_rows <= 1 and total_cols <= 1:
        return "Center"

    v = "N" if row < total_rows / 2 else "S"
    h = "W" if col < total_cols / 2 else "E"

    if total_rows <= 2 and total_cols <= 2:
        return f"{v}{h}"

    # Add "Center" for middle zones
    v_mid = total_rows / 3 <= row < 2 * total_rows / 3
    h_mid = total_cols / 3 <= col < 2 * total_cols / 3
    if v_mid and h_mid:
        return "Center"
    if v_mid:
        return h
    if h_mid:
        return v
    return f"{v}{h}"


def _haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two GPS coordinates in metres."""
    R = 6371000  # Earth radius in metres
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate bearing from point 1 to point 2 in degrees."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dlam = math.radians(lon2 - lon1)
    x = math.sin(dlam) * math.cos(phi2)
    y = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(dlam)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


class DroneSimulator:
    """Simulates a drone performing an agricultural field survey."""

    def __init__(
        self,
        field_bounds: dict,
        altitude: float = 50.0,
        speed: float = 8.0,
        grid_rows: int = 4,
        grid_cols: int = 4,
        disease_seed: int | None = None,
    ):
        """Initialize the drone simulator.

        Args:
            field_bounds: Dict with "nw" (northwest corner [lat, lon]) and
                         "se" (southeast corner [lat, lon])
            altitude: Survey altitude in metres AGL
            speed: Ground speed in m/s
            grid_rows: Number of survey rows
            grid_cols: Number of waypoints per row
            disease_seed: Random seed for reproducible disease patterns
        """
        self.nw_lat = field_bounds["nw"][0]
        self.nw_lon = field_bounds["nw"][1]
        self.se_lat = field_bounds["se"][0]
        self.se_lon = field_bounds["se"][1]

        self.altitude = altitude
        self.speed = speed
        self.grid_rows = grid_rows
        self.grid_cols = grid_cols

        self.rng = random.Random(disease_seed)
        self.drone_id = f"KISAN-{uuid.uuid4().hex[:6].upper()}"

        # Generate lawnmower waypoints
        self.waypoints = self._generate_waypoints()

        # Pre-generate disease detections (some zones healthy, some diseased)
        self.detections: list[Detection] = []
        self._generate_disease_pattern()

        self.state = DroneState(
            drone_id=self.drone_id,
            lat=self.nw_lat,
            lon=self.nw_lon,
            altitude=0.0,
            total_waypoints=len(self.waypoints),
        )

    def _generate_waypoints(self) -> list[tuple[float, float]]:
        """Generate lawnmower (boustrophedon) pattern waypoints."""
        waypoints = []
        lat_step = (self.se_lat - self.nw_lat) / max(self.grid_rows - 1, 1)
        lon_step = (self.se_lon - self.nw_lon) / max(self.grid_cols - 1, 1)

        for row in range(self.grid_rows):
            cols = range(self.grid_cols) if row % 2 == 0 else range(self.grid_cols - 1, -1, -1)
            for col in cols:
                lat = self.nw_lat + row * lat_step
                lon = self.nw_lon + col * lon_step
                waypoints.append((lat, lon))

        return waypoints

    def _generate_disease_pattern(self):
        """Pre-generate disease detections for each waypoint zone."""
        for i, (lat, lon) in enumerate(self.waypoints):
            row = i // self.grid_cols if i // self.grid_cols < self.grid_rows else self.grid_rows - 1
            col = i % self.grid_cols

            zone = _get_zone_label(row, col, self.grid_rows, self.grid_cols)

            # 60% chance of healthy, 40% chance of some issue
            if self.rng.random() < 0.6:
                scenario = DISEASE_SCENARIOS[0]  # healthy
            else:
                scenario = self.rng.choice(DISEASE_SCENARIOS[1:])

            self.detections.append(Detection(
                lat=lat,
                lon=lon,
                zone=zone,
                condition=scenario["condition"],
                confidence=scenario["confidence"] + self.rng.uniform(-0.05, 0.05),
                severity=scenario["severity"],
                description=scenario["description"],
            ))

    def get_field_area_hectares(self) -> float:
        """Calculate approximate field area in hectares."""
        width_m = _haversine_distance(self.nw_lat, self.nw_lon, self.nw_lat, self.se_lon)
        height_m = _haversine_distance(self.nw_lat, self.nw_lon, self.se_lat, self.nw_lon)
        return (width_m * height_m) / 10000

    def run_survey(self, step_delay: float = 0.5) -> Generator[dict, None, None]:
        """Run the survey simulation, yielding SSE events.

        Yields dicts with "type" key:
          - "mission_start": Survey parameters
          - "takeoff": Drone taking off
          - "telemetry": Position/battery/heading update at each waypoint
          - "detection": Disease detection at a waypoint
          - "zone_summary": Summary when moving to a new zone
          - "returning": Drone returning to launch
          - "mission_complete": Survey complete with full report
        """
        start_time = time.time()

        # Mission start
        yield {
            "type": "mission_start",
            "drone_id": self.drone_id,
            "field_area_hectares": round(self.get_field_area_hectares(), 2),
            "total_waypoints": len(self.waypoints),
            "altitude_m": self.altitude,
            "speed_ms": self.speed,
            "grid": f"{self.grid_rows}x{self.grid_cols}",
            "field_bounds": {
                "nw": [self.nw_lat, self.nw_lon],
                "se": [self.se_lat, self.se_lon],
            },
        }

        time.sleep(step_delay)

        # Takeoff
        self.state.status = "takeoff"
        self.state.altitude = self.altitude
        yield {
            "type": "takeoff",
            "drone_id": self.drone_id,
            "altitude_m": self.altitude,
            "message": f"Drone {self.drone_id} taking off to {self.altitude}m AGL",
        }

        time.sleep(step_delay)

        # Survey waypoints
        self.state.status = "surveying"
        prev_zone = None

        for i, ((lat, lon), detection) in enumerate(zip(self.waypoints, self.detections)):
            elapsed = time.time() - start_time

            # Calculate distance from previous position for battery drain
            if i > 0:
                dist = _haversine_distance(self.state.lat, self.state.lon, lat, lon)
                battery_drain = (dist / 1000) * 0.8  # ~0.8% per km
            else:
                battery_drain = 1.0  # takeoff cost

            self.state.lat = lat
            self.state.lon = lon
            self.state.battery = max(5.0, self.state.battery - battery_drain)
            self.state.waypoint_index = i + 1
            self.state.elapsed_seconds = elapsed

            # Calculate heading to next waypoint
            if i < len(self.waypoints) - 1:
                next_lat, next_lon = self.waypoints[i + 1]
                self.state.heading = _bearing(lat, lon, next_lat, next_lon)

            # Telemetry event
            yield {
                "type": "telemetry",
                "drone_id": self.drone_id,
                "waypoint": i + 1,
                "total_waypoints": len(self.waypoints),
                "lat": round(lat, 6),
                "lon": round(lon, 6),
                "altitude_m": self.altitude,
                "heading_deg": round(self.state.heading, 1),
                "speed_ms": self.speed,
                "battery_pct": round(self.state.battery, 1),
                "elapsed_s": round(elapsed, 1),
            }

            time.sleep(step_delay * 0.3)

            # Zone change notification
            if detection.zone != prev_zone:
                if prev_zone is not None:
                    yield {
                        "type": "zone_change",
                        "drone_id": self.drone_id,
                        "from_zone": prev_zone,
                        "to_zone": detection.zone,
                        "message": f"Moving to {detection.zone} quadrant",
                    }
                prev_zone = detection.zone

            # Detection event
            yield {
                "type": "detection",
                "drone_id": self.drone_id,
                "waypoint": i + 1,
                "lat": round(lat, 6),
                "lon": round(lon, 6),
                "zone": detection.zone,
                "condition": detection.condition,
                "confidence": round(detection.confidence, 3),
                "severity": detection.severity,
                "description": detection.description,
            }

            time.sleep(step_delay * 0.7)

        # Return to launch
        self.state.status = "returning"
        yield {
            "type": "returning",
            "drone_id": self.drone_id,
            "message": f"Survey complete. Drone {self.drone_id} returning to launch point.",
        }

        time.sleep(step_delay)

        # Mission complete — generate report
        self.state.status = "landed"
        self.state.lat = self.nw_lat
        self.state.lon = self.nw_lon
        self.state.altitude = 0.0

        report = self._generate_report(time.time() - start_time)
        yield {
            "type": "mission_complete",
            "drone_id": self.drone_id,
            **report,
        }

    def _generate_report(self, total_time: float) -> dict:
        """Generate a summary report of all detections."""
        zone_health: dict[str, list[Detection]] = {}
        for d in self.detections:
            zone_health.setdefault(d.zone, []).append(d)

        zone_summaries = []
        issues_found = []
        healthy_zones = []

        for zone, dets in sorted(zone_health.items()):
            conditions = [d.condition for d in dets]
            severities = [d.severity for d in dets if d.severity != "healthy"]

            if all(c == "healthy" for c in conditions):
                zone_summaries.append({"zone": zone, "status": "healthy", "details": "No issues detected"})
                healthy_zones.append(zone)
            else:
                # Get the most severe issue in this zone
                non_healthy = [d for d in dets if d.condition != "healthy"]
                worst = max(non_healthy, key=lambda d: {"mild": 1, "moderate": 2, "severe": 3}.get(d.severity, 0))
                zone_summaries.append({
                    "zone": zone,
                    "status": worst.severity,
                    "condition": worst.condition,
                    "confidence": round(worst.confidence, 3),
                    "details": worst.description,
                })
                issues_found.append({
                    "zone": zone,
                    "condition": worst.condition,
                    "severity": worst.severity,
                    "recommendation": _get_treatment_recommendation(worst.condition),
                })

        return {
            "total_time_s": round(total_time, 1),
            "area_covered_hectares": round(self.get_field_area_hectares(), 2),
            "waypoints_surveyed": len(self.waypoints),
            "battery_remaining_pct": round(self.state.battery, 1),
            "healthy_zones": healthy_zones,
            "issues_count": len(issues_found),
            "zone_summaries": zone_summaries,
            "issues": issues_found,
            "overall_health": "healthy" if not issues_found else (
                "critical" if any(i["severity"] == "severe" for i in issues_found) else "warning"
            ),
        }


def _get_treatment_recommendation(condition: str) -> str:
    """Return ICAR-approved treatment recommendation for a detected condition."""
    treatments = {
        "bacterial_blight": "Spray Streptocycline 0.015% + Copper oxychloride 0.25%. Drain excess water. Use resistant varieties for next season.",
        "leaf_blast": "URGENT: Spray Tricyclazole 75% WP at 0.6g/litre immediately. Avoid excess nitrogen. Ensure proper spacing for air circulation.",
        "nutrient_deficiency_zinc": "Apply ZnSO4 at 25 kg/hectare as soil application. For immediate relief, foliar spray of ZnSO4 0.5% solution.",
        "fall_armyworm": "URGENT: Spray Emamectin benzoate 5% SG at 0.4g/litre or Chlorantraniliprole 18.5% SC at 0.3ml/litre. Direct spray into leaf whorls.",
        "water_stress": "Irrigate immediately. Apply 5cm standing water. Consider installing drip irrigation for water efficiency.",
        "brown_plant_hopper": "Spray Pymetrozine 50% WG at 0.6g/litre at plant base. Do NOT use synthetic pyrethroids (causes resurgence). Drain field periodically.",
    }
    return treatments.get(condition, "Contact your nearest KVK (Krishi Vigyan Kendra) for specific treatment advice.")


def generate_spray_plan(detections: list[dict], field_bounds: dict) -> dict:
    """Generate a precision spray plan based on drone survey detections.

    Only targets zones with detected issues, saving chemicals and cost.
    """
    affected_zones = [d for d in detections if d.get("condition") != "healthy"]

    if not affected_zones:
        return {
            "status": "no_spray_needed",
            "message": "No disease or pest issues detected. Field is healthy.",
        }

    # Group by condition for chemical mixing
    by_condition: dict[str, list] = {}
    for d in affected_zones:
        by_condition.setdefault(d["condition"], []).append(d)

    spray_missions = []
    total_area = 0

    for condition, zones in by_condition.items():
        treatment = _get_treatment_recommendation(condition)
        zone_names = sorted(set(z["zone"] for z in zones))

        # Estimate affected area (proportional to number of waypoints affected)
        nw = field_bounds["nw"]
        se = field_bounds["se"]
        total_field_area = _haversine_distance(nw[0], nw[1], nw[0], se[1]) * _haversine_distance(nw[0], nw[1], se[0], nw[1]) / 10000
        affected_area = total_field_area * len(zones) / max(len(detections), 1)
        total_area += affected_area

        spray_missions.append({
            "condition": condition,
            "zones": zone_names,
            "affected_area_hectares": round(affected_area, 2),
            "treatment": treatment,
            "priority": "high" if any(z.get("severity") == "severe" for z in zones) else "medium",
        })

    # Sort by priority
    spray_missions.sort(key=lambda m: 0 if m["priority"] == "high" else 1)

    savings_pct = round((1 - total_area / max(total_field_area, 0.01)) * 100, 1)

    return {
        "status": "spray_plan_ready",
        "total_affected_area_hectares": round(total_area, 2),
        "total_field_area_hectares": round(total_field_area, 2),
        "chemical_savings_pct": max(0, savings_pct),
        "missions": spray_missions,
        "note": "Precision spraying only on affected zones saves chemicals and reduces environmental impact. All recommended chemicals are ICAR-approved.",
    }
