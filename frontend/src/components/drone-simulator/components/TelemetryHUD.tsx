"use client";

import { TelemetryEvent, MissionStatus, MissionCompleteEvent } from "../types";

interface TelemetryHUDProps {
  telemetry: TelemetryEvent | null;
  status: MissionStatus;
  missionComplete: MissionCompleteEvent | null;
}

export default function TelemetryHUD({ telemetry, status, missionComplete }: TelemetryHUDProps) {
  if (status === "idle" && !missionComplete) return null;

  const statusLabel: Record<MissionStatus, string> = {
    idle: "STANDBY",
    takeoff: "TAKING OFF",
    surveying: "SURVEYING",
    returning: "RTL",
    complete: "COMPLETE",
  };

  const statusColor: Record<MissionStatus, string> = {
    idle: "text-gray-400",
    takeoff: "text-yellow-400",
    surveying: "text-green-400",
    returning: "text-orange-400",
    complete: "text-blue-400",
  };

  return (
    <>
      {/* Top-left: Status and drone ID */}
      <div className="absolute top-3 left-3 pointer-events-none">
        <div className="bg-black/70 backdrop-blur-sm rounded-lg px-3 py-2 text-white font-mono text-xs space-y-1">
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2 h-2 rounded-full ${status === "surveying" ? "bg-green-400 animate-pulse" : status === "complete" ? "bg-blue-400" : "bg-yellow-400 animate-pulse"}`} />
            <span className={`font-bold ${statusColor[status]}`}>
              {statusLabel[status]}
            </span>
          </div>
          {telemetry && (
            <div className="text-gray-400 text-[10px]">
              {telemetry.drone_id}
            </div>
          )}
          {telemetry && status === "surveying" && (
            <div className="text-gray-300 text-[10px]">
              {telemetry.elapsed_s.toFixed(0)}s elapsed
            </div>
          )}
        </div>
      </div>

      {/* Top-right: Telemetry data */}
      {telemetry && status !== "complete" && (
        <div className="absolute top-3 right-3 pointer-events-none">
          <div className="bg-black/70 backdrop-blur-sm rounded-lg px-3 py-2 text-white font-mono text-xs space-y-1.5">
            {/* Battery */}
            <div className="flex items-center gap-2">
              <span className="text-gray-400 w-8">BAT</span>
              <div className="w-16 bg-gray-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${telemetry.battery_pct > 50 ? "bg-green-400" : telemetry.battery_pct > 20 ? "bg-yellow-400" : "bg-red-400"}`}
                  style={{ width: `${telemetry.battery_pct}%` }}
                />
              </div>
              <span className={telemetry.battery_pct < 20 ? "text-red-400" : "text-green-400"}>
                {telemetry.battery_pct.toFixed(0)}%
              </span>
            </div>

            {/* Altitude */}
            <div className="flex items-center gap-2">
              <span className="text-gray-400 w-8">ALT</span>
              <span className="text-white">{telemetry.altitude_m}m</span>
            </div>

            {/* Speed */}
            <div className="flex items-center gap-2">
              <span className="text-gray-400 w-8">SPD</span>
              <span className="text-white">{telemetry.speed_ms}m/s</span>
            </div>

            {/* Heading */}
            <div className="flex items-center gap-2">
              <span className="text-gray-400 w-8">HDG</span>
              <span className="text-white">{telemetry.heading_deg.toFixed(0)}&deg;</span>
            </div>
          </div>
        </div>
      )}

      {/* Bottom-center: Waypoint progress */}
      {telemetry && status === "surveying" && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none">
          <div className="bg-black/70 backdrop-blur-sm rounded-lg px-4 py-2 text-white font-mono text-xs flex items-center gap-3">
            <span className="text-gray-400">WPT</span>
            <div className="w-32 bg-gray-700 rounded-full h-1.5">
              <div
                className="bg-green-400 h-1.5 rounded-full transition-all"
                style={{ width: `${(telemetry.waypoint / telemetry.total_waypoints) * 100}%` }}
              />
            </div>
            <span className="text-green-400">
              {telemetry.waypoint}/{telemetry.total_waypoints}
            </span>
          </div>
        </div>
      )}

      {/* Mission complete overlay */}
      {status === "complete" && missionComplete && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none">
          <div className={`backdrop-blur-sm rounded-lg px-4 py-2 font-mono text-xs text-center ${
            missionComplete.overall_health === "healthy"
              ? "bg-green-900/70 text-green-300"
              : missionComplete.overall_health === "critical"
                ? "bg-red-900/70 text-red-300"
                : "bg-yellow-900/70 text-yellow-300"
          }`}>
            <div className="font-bold text-sm mb-1">MISSION COMPLETE</div>
            <div>{missionComplete.area_covered_hectares} ha | {missionComplete.waypoints_surveyed} waypoints | {missionComplete.issues_count} issues</div>
          </div>
        </div>
      )}
    </>
  );
}
