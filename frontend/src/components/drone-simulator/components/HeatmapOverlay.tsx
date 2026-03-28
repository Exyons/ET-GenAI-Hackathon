"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { DetectionEvent, FieldBounds } from "../types";
import { field3DDimensions, gpsToLocal } from "../utils/gpsToLocal";

interface HeatmapOverlayProps {
  detections: DetectionEvent[];
  bounds: FieldBounds;
}

const SEVERITY_COLORS: Record<string, THREE.Color> = {
  healthy: new THREE.Color(0.2, 0.8, 0.2),
  mild: new THREE.Color(0.9, 0.85, 0.1),
  moderate: new THREE.Color(0.95, 0.5, 0.05),
  severe: new THREE.Color(0.95, 0.15, 0.1),
};

export default function HeatmapOverlay({ detections, bounds }: HeatmapOverlayProps) {
  const { width, height } = field3DDimensions(bounds);
  const segments = 32;

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(width, height, segments, segments);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const alphas = new Float32Array(pos.count);

    // Initialize all vertices as transparent
    for (let i = 0; i < pos.count; i++) {
      colors[i * 3] = 0.2;
      colors[i * 3 + 1] = 0.8;
      colors[i * 3 + 2] = 0.2;
      alphas[i] = 0;
    }

    // For each detection, color nearby vertices
    for (const det of detections) {
      const local = gpsToLocal(det.lat, det.lon, 0, bounds);
      const color = SEVERITY_COLORS[det.severity] || SEVERITY_COLORS.healthy;
      const influenceRadius = width / 5; // each detection affects a zone-sized area

      for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i);
        const vy = pos.getY(i); // this is the Z in world (plane is rotated)
        const dx = vx - local.x;
        const dz = vy - (-local.z); // plane Y maps to -world.Z
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < influenceRadius) {
          const falloff = 1 - dist / influenceRadius;
          const weight = falloff * falloff; // quadratic falloff

          // Blend color
          colors[i * 3] = THREE.MathUtils.lerp(colors[i * 3], color.r, weight);
          colors[i * 3 + 1] = THREE.MathUtils.lerp(colors[i * 3 + 1], color.g, weight);
          colors[i * 3 + 2] = THREE.MathUtils.lerp(colors[i * 3 + 2], color.b, weight);
          alphas[i] = Math.max(alphas[i], weight * 0.5);
        }
      }
    }

    // Apply alpha into vertex colors (since we use opacity for overall transparency)
    // We'll encode alpha by modulating brightness
    for (let i = 0; i < pos.count; i++) {
      const a = alphas[i];
      colors[i * 3] *= a > 0 ? 1 : 0;
      colors[i * 3 + 1] *= a > 0 ? 1 : 0;
      colors[i * 3 + 2] *= a > 0 ? 1 : 0;
    }

    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return { geo, hasAnyColor: detections.length > 0 };
  }, [detections, width, height, bounds]);

  if (!geometry.hasAnyColor) return null;

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.6, 0]}
    >
      <primitive object={geometry.geo} attach="geometry" />
      <meshBasicMaterial
        vertexColors
        transparent
        opacity={0.55}
        side={THREE.DoubleSide}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    </mesh>
  );
}
