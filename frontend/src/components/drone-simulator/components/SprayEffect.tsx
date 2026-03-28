"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { SprayPlan, DetectionEvent, FieldBounds } from "../types";
import { gpsToLocal, field3DDimensions } from "../utils/gpsToLocal";

interface SprayEffectProps {
  sprayPlan: SprayPlan;
  detections: DetectionEvent[];
  bounds: FieldBounds;
}

const PARTICLE_COUNT = 200;

export default function SprayEffect({ sprayPlan, detections, bounds }: SprayEffectProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const { width, height } = field3DDimensions(bounds);

  // Find affected zone centers from detections
  const affectedPositions = useMemo(() => {
    const affectedZones = new Set<string>();
    sprayPlan.missions.forEach((m) => m.zones.forEach((z) => affectedZones.add(z)));

    return detections
      .filter((d) => affectedZones.has(d.zone) && d.severity !== "healthy")
      .map((d) => gpsToLocal(d.lat, d.lon, 0, bounds));
  }, [sprayPlan, detections, bounds]);

  // Initialize particle positions
  const { positions, velocities, colors } = useMemo(() => {
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    const vel = new Float32Array(PARTICLE_COUNT * 3);
    const col = new Float32Array(PARTICLE_COUNT * 3);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // Spread particles over affected positions
      const targetIdx = i % Math.max(1, affectedPositions.length);
      const target = affectedPositions[targetIdx] || { x: 0, y: 0, z: 0 };

      pos[i * 3] = target.x + (Math.random() - 0.5) * 8;
      pos[i * 3 + 1] = Math.random() * 15 + 5; // drop from survey altitude
      pos[i * 3 + 2] = target.z + (Math.random() - 0.5) * 8;

      vel[i * 3] = (Math.random() - 0.5) * 0.5;
      vel[i * 3 + 1] = -(Math.random() * 2 + 1); // fall speed
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.5;

      // Amber/orange spray color
      col[i * 3] = 0.9 + Math.random() * 0.1;
      col[i * 3 + 1] = 0.6 + Math.random() * 0.2;
      col[i * 3 + 2] = 0.1;
    }

    return { positions: pos, velocities: vel, colors: col };
  }, [affectedPositions]);

  useFrame((_, delta) => {
    if (!pointsRef.current) return;
    const posAttr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
    const posArray = posAttr.array as Float32Array;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      posArray[i * 3] += velocities[i * 3] * delta * 3;
      posArray[i * 3 + 1] += velocities[i * 3 + 1] * delta * 3;
      posArray[i * 3 + 2] += velocities[i * 3 + 2] * delta * 3;

      // Reset particle when it hits ground
      if (posArray[i * 3 + 1] < 0.2) {
        const targetIdx = i % Math.max(1, affectedPositions.length);
        const target = affectedPositions[targetIdx] || { x: 0, y: 0, z: 0 };
        posArray[i * 3] = target.x + (Math.random() - 0.5) * 8;
        posArray[i * 3 + 1] = Math.random() * 5 + 12;
        posArray[i * 3 + 2] = target.z + (Math.random() - 0.5) * 8;
      }
    }

    posAttr.needsUpdate = true;
  });

  if (affectedPositions.length === 0) return null;

  return (
    <group>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
            count={PARTICLE_COUNT}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[colors, 3]}
            count={PARTICLE_COUNT}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.3}
          vertexColors
          transparent
          opacity={0.6}
          depthWrite={false}
          sizeAttenuation
        />
      </points>

      {/* Spray zone highlight rings on ground */}
      {affectedPositions.map((pos, i) => (
        <mesh
          key={i}
          position={[pos.x, 0.08, pos.z]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[3, 4, 24]} />
          <meshBasicMaterial
            color="#f97316"
            transparent
            opacity={0.25}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}
