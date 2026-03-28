"use client";

import { Suspense, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { t } from "@/app/i18n";
import { DEFAULT_FIELD_BOUNDS } from "./types";
import { useDroneSurveySSE } from "./hooks/useDroneSurveySSE";
import { useSprayPlan } from "./hooks/useSprayPlan";
import SkyAndLighting from "./components/SkyAndLighting";
import Terrain from "./components/Terrain";
import DroneModel from "./components/DroneModel";
import FlightPath from "./components/FlightPath";
import HeatmapOverlay from "./components/HeatmapOverlay";
import DetectionMarkers from "./components/DetectionMarkers";
import TelemetryHUD from "./components/TelemetryHUD";
import SprayEffect from "./components/SprayEffect";
import PostProcessing from "./components/PostProcessing";
import CameraController from "./components/CameraController";

interface DroneSimulatorSceneProps {
  language: string;
}

function LoadingFallback() {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#4a7c3f" />
    </mesh>
  );
}

export default function DroneSimulatorScene({ language }: DroneSimulatorSceneProps) {
  const {
    status,
    telemetry,
    prevTelemetry,
    detections,
    missionStart,
    missionComplete,
    running,
    startSurvey,
    reset,
  } = useDroneSurveySSE();

  const { sprayPlan, loading: sprayLoading, requestSprayPlan, resetSprayPlan } = useSprayPlan();

  const bounds = DEFAULT_FIELD_BOUNDS;
  const currentWaypoint = telemetry?.waypoint || 0;
  const altitude = telemetry?.altitude_m || 50;

  const severityColor = (sev: string) => {
    switch (sev) {
      case "healthy": return "bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 border-green-300 dark:border-green-700";
      case "mild": return "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700";
      case "moderate": return "bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-300 border-orange-300 dark:border-orange-700";
      case "severe": return "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 border-red-300 dark:border-red-700";
      default: return "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300 border-gray-300 dark:border-gray-600";
    }
  };

  const [showHelp, setShowHelp] = useState(false);

  const handleStartSurvey = () => {
    resetSprayPlan();
    startSurvey();
  };

  const handleReset = () => {
    reset();
    resetSprayPlan();
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-lg shadow-md w-full mx-auto max-w-4xl">
      <h2 className="text-xl font-bold text-green-800 dark:text-green-400 mb-4 flex items-center gap-2">
        <DroneIcon /> {t(language, "drone_title")}
      </h2>

      {/* Control bar */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={handleStartSurvey}
          disabled={running}
          className="flex-1 bg-green-600 text-white py-3 rounded font-bold hover:bg-green-700 disabled:opacity-50 transition-colors"
        >
          {running ? t(language, "drone_scanning") : t(language, "drone_start")}
        </button>
        {status === "complete" && (
          <button
            onClick={handleReset}
            className="px-4 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 py-3 rounded font-bold hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Reset
          </button>
        )}
      </div>

      {/* 3D Viewport */}
      <div className="relative w-full rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-900" style={{ height: "500px" }}>
        <Canvas
          shadows
          camera={{ position: [60, 55, 60], fov: 45 }}
          gl={{ antialias: true, alpha: false }}
          dpr={[1, 2]}
        >
          <Suspense fallback={<LoadingFallback />}>
            <SkyAndLighting />
            <Terrain bounds={bounds} />
            <FlightPath bounds={bounds} currentWaypoint={currentWaypoint} altitude={altitude} />
            <HeatmapOverlay detections={detections} bounds={bounds} />
            <DetectionMarkers detections={detections} bounds={bounds} />
            <DroneModel
              telemetry={telemetry}
              prevTelemetry={prevTelemetry}
              bounds={bounds}
              status={status}
            />
            {sprayPlan && sprayPlan.status === "spray_plan_ready" && (
              <SprayEffect sprayPlan={sprayPlan} detections={detections} bounds={bounds} />
            )}
            <PostProcessing />
          </Suspense>
          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.1}
            minDistance={10}
            maxDistance={200}
            maxPolarAngle={Math.PI / 2.1}
          />
          <CameraController
            telemetry={telemetry}
            bounds={bounds}
            status={status}
          />
        </Canvas>

        {/* HTML HUD overlay */}
        <TelemetryHUD
          telemetry={telemetry}
          status={status}
          missionComplete={missionComplete}
        />

        {/* Help button */}
        <button
          onClick={() => setShowHelp((v) => !v)}
          className="absolute bottom-3 right-3 w-8 h-8 bg-black/60 backdrop-blur-sm rounded-full text-white text-sm font-bold hover:bg-black/80 transition-colors flex items-center justify-center"
          title="Viewport controls"
        >
          ?
        </button>

        {/* Help popup */}
        {showHelp && (
          <div className="absolute bottom-14 right-3 bg-black/85 backdrop-blur-sm rounded-lg p-3 text-white text-xs font-mono space-y-1.5 max-w-[250px] shadow-xl">
            <div className="font-bold text-sm mb-2 text-green-400">Viewport Controls</div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-400">Rotate</span>
              <span>Left Click + Drag</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-400">Pan</span>
              <span>Right Click + Drag</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-400">Zoom</span>
              <span>Scroll Wheel</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-400">Pan (alt)</span>
              <span>Middle Click + Drag</span>
            </div>
            <hr className="border-gray-600" />
            <div className="text-gray-400 text-[10px]">
              Camera auto-follows drone. Interact to take manual control — auto-follow resumes after 3s.
            </div>
          </div>
        )}
      </div>

      {/* Live Detection Feed (during survey) */}
      {detections.length > 0 && status === "surveying" && (
        <div className="mt-4 space-y-2 max-h-40 overflow-y-auto">
          <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">Live Detections</h3>
          {detections.slice(-4).map((det, i) => (
            <div key={i} className={`p-2 rounded border text-sm ${severityColor(det.severity)}`}>
              <div className="flex justify-between items-center">
                <span className="font-bold">{t(language, "drone_zone")} {det.zone}</span>
                <span className="font-mono text-xs">{Math.round(det.confidence * 100)}%</span>
              </div>
              <div className="text-xs mt-1">{det.condition.replace(/_/g, " ")}</div>
            </div>
          ))}
        </div>
      )}

      {/* Mission Report */}
      {missionComplete && (
        <div className="mt-4 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <div className={`p-3 font-bold text-center ${
            missionComplete.overall_health === "healthy"
              ? "bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300"
              : missionComplete.overall_health === "critical"
                ? "bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300"
                : "bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300"
          }`}>
            {t(language, "drone_complete")} &mdash; {t(language,
              missionComplete.overall_health === "healthy" ? "drone_healthy"
                : missionComplete.overall_health === "critical" ? "drone_critical"
                  : "drone_warning"
            )}
          </div>

          <div className="p-3 text-sm grid grid-cols-2 md:grid-cols-4 gap-2 bg-gray-50 dark:bg-gray-800">
            <div><span className="text-gray-500 dark:text-gray-400">{t(language, "drone_field_area")}:</span> <span className="font-bold">{missionComplete.area_covered_hectares} ha</span></div>
            <div><span className="text-gray-500 dark:text-gray-400">{t(language, "drone_waypoint")}:</span> <span className="font-bold">{missionComplete.waypoints_surveyed}</span></div>
            <div><span className="text-gray-500 dark:text-gray-400">{t(language, "drone_battery")}:</span> <span className="font-bold">{missionComplete.battery_remaining_pct}%</span></div>
            <div><span className="text-gray-500 dark:text-gray-400">Time:</span> <span className="font-bold">{missionComplete.total_time_s}s</span></div>
          </div>

          {/* Zone Grid */}
          <div className="p-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {missionComplete.zone_summaries?.map((z, i) => (
                <div key={i} className={`p-2 rounded border text-xs ${severityColor(z.status)}`}>
                  <div className="font-bold">{t(language, "drone_zone")} {z.zone}</div>
                  <div className="mt-1">{z.condition ? z.condition.replace(/_/g, " ") : t(language, "drone_healthy")}</div>
                  {z.confidence && <div className="font-mono">{Math.round(z.confidence * 100)}%</div>}
                </div>
              ))}
            </div>
          </div>

          {/* Issues */}
          {missionComplete.issues?.length > 0 && (
            <div className="p-3 border-t border-gray-200 dark:border-gray-700">
              <h3 className="font-bold text-sm mb-2">Issues Found ({missionComplete.issues_count})</h3>
              {missionComplete.issues.map((issue, i) => (
                <div key={i} className="mb-2 p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded text-sm">
                  <div className="font-bold">{t(language, "drone_zone")} {issue.zone}: {issue.condition.replace(/_/g, " ")} ({issue.severity})</div>
                  <div className="text-xs text-gray-700 dark:text-gray-400 mt-1">{issue.recommendation}</div>
                </div>
              ))}
            </div>
          )}

          {missionComplete.issues_count === 0 && (
            <div className="p-3 text-center text-green-700 dark:text-green-400 font-bold">{t(language, "drone_no_issues")}</div>
          )}

          {/* Spray Plan Button */}
          {missionComplete.issues_count > 0 && !sprayPlan && (
            <div className="p-3 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => requestSprayPlan(detections)}
                disabled={sprayLoading}
                className="w-full bg-orange-500 text-white py-2 rounded font-bold hover:bg-orange-600 disabled:opacity-50 transition-colors"
              >
                {sprayLoading ? "Generating..." : t(language, "drone_spray_plan")}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Spray Plan */}
      {sprayPlan && sprayPlan.status === "spray_plan_ready" && (
        <div className="mt-4 border border-orange-200 dark:border-orange-800 rounded-lg bg-orange-50 dark:bg-orange-900/20 p-3">
          <h3 className="font-bold text-orange-800 dark:text-orange-400 mb-2">{t(language, "drone_spray_plan")}</h3>
          <div className="text-sm mb-2">
            <span className="text-gray-600 dark:text-gray-400">Affected: </span>
            <span className="font-bold">{sprayPlan.total_affected_area_hectares} ha</span>
            <span className="text-gray-600 dark:text-gray-400"> / {sprayPlan.total_field_area_hectares} ha total</span>
            <span className="ml-2 text-green-700 dark:text-green-400 font-bold">({sprayPlan.chemical_savings_pct}% chemical savings)</span>
          </div>
          {sprayPlan.missions?.map((m, i) => (
            <div key={i} className={`p-2 mb-2 rounded border text-sm ${m.priority === "high" ? "bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-700" : "bg-yellow-50 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700"}`}>
              <div className="font-bold">{m.condition.replace(/_/g, " ")} &mdash; Zones: {m.zones.join(", ")}</div>
              <div className="text-xs mt-1">{m.treatment}</div>
              <div className="text-xs mt-1 text-gray-500 dark:text-gray-400">Area: {m.affected_area_hectares} ha | Priority: {m.priority}</div>
            </div>
          ))}
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 italic">{sprayPlan.note}</div>
        </div>
      )}
    </div>
  );
}

function DroneIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M22 10l-6-6H8l-6 6 6 6h8l6-6zM12 14.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5zM3 18h18v2H3v-2z"/>
    </svg>
  );
}
