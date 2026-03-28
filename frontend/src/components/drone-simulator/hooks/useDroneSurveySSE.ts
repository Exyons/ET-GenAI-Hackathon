import { useState, useRef, useCallback } from "react";
import {
  TelemetryEvent,
  DetectionEvent,
  MissionStartEvent,
  MissionCompleteEvent,
  MissionStatus,
  DEFAULT_FIELD_BOUNDS,
} from "../types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export interface DroneSceneState {
  status: MissionStatus;
  telemetry: TelemetryEvent | null;
  prevTelemetry: TelemetryEvent | null;
  detections: DetectionEvent[];
  missionStart: MissionStartEvent | null;
  missionComplete: MissionCompleteEvent | null;
}

export function useDroneSurveySSE() {
  const [state, setState] = useState<DroneSceneState>({
    status: "idle",
    telemetry: null,
    prevTelemetry: null,
    detections: [],
    missionStart: null,
    missionComplete: null,
  });
  const [running, setRunning] = useState(false);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  const reset = useCallback(() => {
    setState({
      status: "idle",
      telemetry: null,
      prevTelemetry: null,
      detections: [],
      missionStart: null,
      missionComplete: null,
    });
  }, []);

  const startSurvey = useCallback(async () => {
    reset();
    setRunning(true);

    try {
      const bounds = DEFAULT_FIELD_BOUNDS;
      const res = await fetch(`${API_URL}/api/drone/survey`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nw_lat: bounds.nw[0],
          nw_lon: bounds.nw[1],
          se_lat: bounds.se[0],
          se_lon: bounds.se[1],
          altitude: 50,
          grid_rows: 4,
          grid_cols: 4,
        }),
      });

      if (!res.body) throw new Error("No response body");
      const reader = res.body.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let sseBuffer = "";

      const processLine = (line: string) => {
        if (!line.startsWith("data: ")) return;
        const dataStr = line.slice(6).trim();
        if (!dataStr) return;

        let event;
        try {
          event = JSON.parse(dataStr);
        } catch {
          return;
        }

        switch (event.type) {
          case "mission_start":
            setState((prev) => ({
              ...prev,
              status: "takeoff",
              missionStart: event as MissionStartEvent,
            }));
            break;

          case "takeoff":
            setState((prev) => ({ ...prev, status: "takeoff" }));
            break;

          case "telemetry":
            setState((prev) => ({
              ...prev,
              status: "surveying",
              prevTelemetry: prev.telemetry,
              telemetry: event as TelemetryEvent,
            }));
            break;

          case "detection":
            setState((prev) => ({
              ...prev,
              detections: [...prev.detections, event as DetectionEvent],
            }));
            break;

          case "returning":
            setState((prev) => ({ ...prev, status: "returning" }));
            break;

          case "mission_complete":
            setState((prev) => ({
              ...prev,
              status: "complete",
              missionComplete: event as MissionCompleteEvent,
            }));
            break;
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const parts = sseBuffer.split("\n\n");
        sseBuffer = parts.pop() || "";

        for (const part of parts) {
          for (const line of part.split("\n")) {
            processLine(line);
          }
        }
      }

      if (sseBuffer.trim()) {
        for (const line of sseBuffer.split("\n")) {
          processLine(line);
        }
      }
    } catch (err) {
      console.error("Drone survey SSE error:", err);
    } finally {
      setRunning(false);
      readerRef.current = null;
    }
  }, [reset]);

  return { ...state, running, startSurvey, reset };
}
