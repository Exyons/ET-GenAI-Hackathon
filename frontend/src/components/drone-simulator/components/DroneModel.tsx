"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { TelemetryEvent, FieldBounds, MissionStatus } from "../types";
import { gpsToLocal } from "../utils/gpsToLocal";

interface DroneModelProps {
  telemetry: TelemetryEvent | null;
  prevTelemetry: TelemetryEvent | null;
  bounds: FieldBounds;
  status: MissionStatus;
}

export default function DroneModel({ telemetry, prevTelemetry, bounds, status }: DroneModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const rotorRefs = useRef<THREE.Mesh[]>([]);
  const currentPos = useRef(new THREE.Vector3(0, 3, 0));
  const currentHeading = useRef(0);
  const bobPhase = useRef(0);

  // LED colors based on status
  const ledColor = useMemo(() => {
    if (status === "idle") return "#333333";
    if (status === "returning") return "#ff8800";
    if (telemetry && telemetry.battery_pct < 20) return "#ff0000";
    return "#00ff44";
  }, [status, telemetry?.battery_pct]);

  // Arm positions for the quad-rotor layout
  const armPositions: [number, number, number][] = [
    [1.2, 0.1, 1.2],
    [-1.2, 0.1, 1.2],
    [1.2, 0.1, -1.2],
    [-1.2, 0.1, -1.2],
  ];

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    // Target position from telemetry
    let targetPos: THREE.Vector3;
    let targetHeading = currentHeading.current;

    if (telemetry && status !== "idle") {
      const local = gpsToLocal(telemetry.lat, telemetry.lon, telemetry.altitude_m, bounds);
      targetPos = new THREE.Vector3(local.x, local.y, local.z);
      targetHeading = -THREE.MathUtils.degToRad(telemetry.heading_deg);
    } else if (status === "idle") {
      // Parked position at NW corner
      const local = gpsToLocal(bounds.nw[0], bounds.nw[1], 0, bounds);
      targetPos = new THREE.Vector3(local.x, 0.5, local.z);
    } else {
      targetPos = currentPos.current.clone();
    }

    // Smooth position interpolation — lower = slower/smoother drone movement
    // EDIT HERE to change drone visual speed (0.5 = very slow, 2.0 = fast)
    const lerpSpeed = 1.2;
    currentPos.current.lerp(targetPos, Math.min(1, delta * lerpSpeed));
    groupRef.current.position.copy(currentPos.current);

    // Hovering bob
    if (status === "surveying" || status === "takeoff" || status === "returning") {
      bobPhase.current += delta * 2;
      groupRef.current.position.y += Math.sin(bobPhase.current) * 0.15;
    }

    // Smooth heading rotation
    currentHeading.current = THREE.MathUtils.lerp(
      currentHeading.current,
      targetHeading,
      Math.min(1, delta * 2)
    );
    groupRef.current.rotation.y = currentHeading.current;

    // Banking during turns (tilt in direction of movement)
    if (telemetry && prevTelemetry) {
      const headingDiff = telemetry.heading_deg - (prevTelemetry?.heading_deg || telemetry.heading_deg);
      const bankAngle = THREE.MathUtils.clamp(headingDiff * 0.01, -0.15, 0.15);
      groupRef.current.rotation.z = THREE.MathUtils.lerp(
        groupRef.current.rotation.z,
        bankAngle,
        Math.min(1, delta * 3)
      );
    }

    // Rotor spin
    const rotorSpeed = status === "idle" ? 0 : status === "surveying" ? 40 : 25;
    rotorRefs.current.forEach((rotor) => {
      if (rotor) rotor.rotation.y += delta * rotorSpeed;
    });
  });

  const setRotorRef = (index: number) => (el: THREE.Mesh | null) => {
    if (el) rotorRefs.current[index] = el;
  };

  return (
    <group ref={groupRef} castShadow>
      {/* Central body */}
      <mesh castShadow>
        <boxGeometry args={[1.0, 0.3, 1.0]} />
        <meshStandardMaterial color="#2a2a2a" metalness={0.6} roughness={0.3} />
      </mesh>

      {/* Camera gimbal */}
      <mesh position={[0, -0.25, 0.2]} castShadow>
        <sphereGeometry args={[0.15, 12, 12]} />
        <meshStandardMaterial color="#1a1a1a" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Camera lens */}
      <mesh position={[0, -0.28, 0.3]}>
        <cylinderGeometry args={[0.06, 0.06, 0.05, 12]} />
        <meshStandardMaterial color="#000000" metalness={1} roughness={0} />
      </mesh>

      {/* Arms and rotors */}
      {armPositions.map((pos, i) => (
        <group key={i}>
          {/* Arm */}
          <mesh
            position={[pos[0] * 0.5, pos[1], pos[2] * 0.5]}
            rotation={[0, Math.atan2(pos[2], pos[0]), 0]}
            castShadow
          >
            <boxGeometry args={[1.7, 0.1, 0.12]} />
            <meshStandardMaterial color="#333333" metalness={0.5} roughness={0.4} />
          </mesh>

          {/* Motor housing */}
          <mesh position={pos} castShadow>
            <cylinderGeometry args={[0.18, 0.18, 0.2, 12]} />
            <meshStandardMaterial color="#444444" metalness={0.6} roughness={0.3} />
          </mesh>

          {/* Rotor disc */}
          <mesh ref={setRotorRef(i)} position={[pos[0], pos[1] + 0.18, pos[2]]}>
            <cylinderGeometry args={[0.7, 0.7, 0.02, 3]} />
            <meshStandardMaterial
              color="#666666"
              transparent
              opacity={0.3}
              side={THREE.DoubleSide}
            />
          </mesh>

          {/* LED on each arm tip */}
          <mesh position={[pos[0], pos[1] - 0.1, pos[2]]}>
            <sphereGeometry args={[0.06, 8, 8]} />
            <meshStandardMaterial
              color={ledColor}
              emissive={ledColor}
              emissiveIntensity={status === "idle" ? 0 : 2}
            />
          </mesh>
        </group>
      ))}

      {/* Landing gear */}
      {[[-0.6, -0.3, 0.5], [0.6, -0.3, 0.5], [-0.6, -0.3, -0.5], [0.6, -0.3, -0.5]].map((pos, i) => (
        <mesh key={`gear-${i}`} position={pos as [number, number, number]}>
          <cylinderGeometry args={[0.03, 0.03, 0.3, 6]} />
          <meshStandardMaterial color="#555555" />
        </mesh>
      ))}

      {/* Front indicator (small red LED) */}
      <mesh position={[0, 0, 0.55]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshStandardMaterial
          color="#ff0000"
          emissive="#ff0000"
          emissiveIntensity={status === "idle" ? 0 : 1.5}
        />
      </mesh>

      {/* Rear indicator (small white LED) */}
      <mesh position={[0, 0, -0.55]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive="#ffffff"
          emissiveIntensity={status === "idle" ? 0 : 1}
        />
      </mesh>
    </group>
  );
}
