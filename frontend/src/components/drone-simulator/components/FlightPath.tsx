"use client";

import { useMemo } from "react";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import { FieldBounds } from "../types";
import { gpsToLocal, generateWaypointCoords } from "../utils/gpsToLocal";

interface FlightPathProps {
  bounds: FieldBounds;
  currentWaypoint: number;
  altitude: number;
}

export default function FlightPath({ bounds, currentWaypoint, altitude }: FlightPathProps) {
  const waypoints = useMemo(() => generateWaypointCoords(bounds), [bounds]);

  const allPoints = useMemo(() => {
    return waypoints.map(([lat, lon]) => {
      const pos = gpsToLocal(lat, lon, altitude, bounds);
      return new THREE.Vector3(pos.x, pos.y, pos.z);
    });
  }, [waypoints, altitude, bounds]);

  // Split into completed and remaining paths
  const completedPoints = useMemo(() => {
    if (currentWaypoint <= 0) return [];
    return allPoints.slice(0, Math.min(currentWaypoint, allPoints.length));
  }, [allPoints, currentWaypoint]);

  const remainingPoints = useMemo(() => {
    if (currentWaypoint <= 0) return allPoints;
    const startIdx = Math.max(0, currentWaypoint - 1);
    return allPoints.slice(startIdx);
  }, [allPoints, currentWaypoint]);

  return (
    <group>
      {/* Completed path - solid green */}
      {completedPoints.length >= 2 && (
        <Line
          points={completedPoints}
          color="#22c55e"
          lineWidth={2}
          opacity={0.8}
          transparent
        />
      )}

      {/* Remaining path - dashed gray */}
      {remainingPoints.length >= 2 && (
        <Line
          points={remainingPoints}
          color="#9ca3af"
          lineWidth={1}
          dashed
          dashSize={1}
          gapSize={0.5}
          opacity={0.4}
          transparent
        />
      )}

      {/* Waypoint markers on the ground */}
      {allPoints.map((pt, i) => (
        <mesh key={i} position={[pt.x, 0.1, pt.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.4, 8]} />
          <meshBasicMaterial
            color={i < currentWaypoint ? "#22c55e" : "#9ca3af"}
            transparent
            opacity={i < currentWaypoint ? 0.6 : 0.2}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}
