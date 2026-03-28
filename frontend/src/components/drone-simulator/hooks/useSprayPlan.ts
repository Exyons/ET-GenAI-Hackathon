import { useState, useCallback } from "react";
import { DetectionEvent, SprayPlan, DEFAULT_FIELD_BOUNDS } from "../types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function useSprayPlan() {
  const [sprayPlan, setSprayPlan] = useState<SprayPlan | null>(null);
  const [loading, setLoading] = useState(false);

  const requestSprayPlan = useCallback(async (detections: DetectionEvent[]) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/drone/spray_plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          detections: detections.map((d) => ({
            zone: d.zone,
            condition: d.condition,
            severity: d.severity,
            confidence: d.confidence,
            lat: d.lat,
            lon: d.lon,
          })),
          field_bounds: {
            nw: DEFAULT_FIELD_BOUNDS.nw,
            se: DEFAULT_FIELD_BOUNDS.se,
          },
        }),
      });
      const plan = await res.json();
      setSprayPlan(plan);
    } catch (err) {
      console.error("Spray plan error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const resetSprayPlan = useCallback(() => setSprayPlan(null), []);

  return { sprayPlan, loading, requestSprayPlan, resetSprayPlan };
}
