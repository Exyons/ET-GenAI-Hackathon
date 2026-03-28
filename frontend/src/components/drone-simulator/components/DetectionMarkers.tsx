"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { DetectionEvent, FieldBounds } from "../types";
import { gpsToLocal } from "../utils/gpsToLocal";

interface DetectionMarkersProps {
  detections: DetectionEvent[];
  bounds: FieldBounds;
}

const SEVERITY_COLORS: Record<string, string> = {
  healthy: "#22c55e",
  mild: "#eab308",
  moderate: "#f97316",
  severe: "#ef4444",
};

function Marker({ detection, bounds, index }: { detection: DetectionEvent; bounds: FieldBounds; index: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  const pos = gpsToLocal(detection.lat, detection.lon, 0, bounds);
  const color = SEVERITY_COLORS[detection.severity] || "#9ca3af";
  const isSevere = detection.severity === "severe";
  const pinHeight = detection.severity === "severe" ? 3.5 : detection.severity === "moderate" ? 3 : 2.5;

  useFrame((state) => {
    if (!groupRef.current) return;

    // Pop-in animation based on creation order
    const scale = Math.min(1, (state.clock.elapsedTime - index * 0.15) * 2);
    if (scale > 0) {
      groupRef.current.scale.setScalar(Math.max(0, scale));
    }

    // Pulse for severe markers
    if (isSevere && glowRef.current) {
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 4) * 0.3;
      glowRef.current.scale.setScalar(pulse);
    }
  });

  if (detection.severity === "healthy") return null;

  return (
    <group ref={groupRef} position={[pos.x, 0, pos.z]} scale={0}>
      {/* Pin shaft */}
      <mesh position={[0, pinHeight / 2, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.08, pinHeight, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>

      {/* Pin head */}
      <mesh position={[0, pinHeight, 0]} castShadow>
        <sphereGeometry args={[0.4, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.5}
        />
      </mesh>

      {/* Glow ring for severe */}
      {isSevere && (
        <mesh ref={glowRef} position={[0, pinHeight, 0]}>
          <ringGeometry args={[0.5, 0.8, 16]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.3}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Ground ring */}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.6, 0.9, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.4}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Tooltip */}
      <Html
        position={[0, pinHeight + 1.2, 0]}
        center
        distanceFactor={30}
        style={{ pointerEvents: "none" }}
      >
        <div className="bg-gray-900/90 text-white text-[10px] px-2 py-1 rounded shadow-lg whitespace-nowrap backdrop-blur-sm">
          <div className="font-bold">{detection.condition.replace(/_/g, " ")}</div>
          <div className="text-gray-300">
            Zone {detection.zone} | {Math.round(detection.confidence * 100)}%
          </div>
        </div>
      </Html>
    </group>
  );
}

export default function DetectionMarkers({ detections, bounds }: DetectionMarkersProps) {
  return (
    <group>
      {detections.map((det, i) => (
        <Marker key={`${det.zone}-${det.waypoint}-${i}`} detection={det} bounds={bounds} index={i} />
      ))}
    </group>
  );
}
