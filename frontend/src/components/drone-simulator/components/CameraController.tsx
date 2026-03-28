"use client";

import { useRef, useEffect } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { TelemetryEvent, FieldBounds, MissionStatus } from "../types";
import { gpsToLocal } from "../utils/gpsToLocal";

interface CameraControllerProps {
  telemetry: TelemetryEvent | null;
  bounds: FieldBounds;
  status: MissionStatus;
}

// EDIT THESE to change camera positions:
// [x, y, z] — y is height, x/z are horizontal offset from drone
const IDLE_OFFSET = new THREE.Vector3(8, 6, 8);       // Close-up on parked drone
const SURVEY_OFFSET = new THREE.Vector3(30, 35, 30);   // Pulled back overhead during survey
const COMPLETE_OFFSET = new THREE.Vector3(30, 30, 30);  // Wide view after mission

export default function CameraController({ telemetry, bounds, status }: CameraControllerProps) {
  const { camera, controls } = useThree();
  const targetPos = useRef(new THREE.Vector3());
  const targetLookAt = useRef(new THREE.Vector3(0, 0, 0));
  const hasInitialized = useRef(false);
  const isUserInteracting = useRef(false);
  const interactionTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect user interaction — stop auto-camera while user is orbiting
  useEffect(() => {
    const ctrl = controls as any;
    if (!ctrl?.addEventListener) return;

    const onStart = () => {
      isUserInteracting.current = true;
      if (interactionTimeout.current) clearTimeout(interactionTimeout.current);
    };
    const onEnd = () => {
      // Resume auto-camera after 3 seconds of no interaction
      interactionTimeout.current = setTimeout(() => {
        isUserInteracting.current = false;
      }, 3000);
    };

    ctrl.addEventListener("start", onStart);
    ctrl.addEventListener("end", onEnd);
    return () => {
      ctrl.removeEventListener("start", onStart);
      ctrl.removeEventListener("end", onEnd);
      if (interactionTimeout.current) clearTimeout(interactionTimeout.current);
    };
  }, [controls]);

  // Set initial camera position close to drone's start
  useEffect(() => {
    if (hasInitialized.current) return;
    const droneStart = gpsToLocal(bounds.nw[0], bounds.nw[1], 0, bounds);
    const initPos = new THREE.Vector3(
      droneStart.x + IDLE_OFFSET.x,
      IDLE_OFFSET.y,
      droneStart.z + IDLE_OFFSET.z
    );
    camera.position.copy(initPos);
    const ctrl = controls as any;
    if (ctrl?.target) {
      ctrl.target.set(droneStart.x, 1, droneStart.z);
      ctrl.update();
    }
    hasInitialized.current = true;
  }, [camera, controls, bounds]);

  useFrame((_, delta) => {
    if (isUserInteracting.current) return;

    const ctrl = controls as any;
    if (!ctrl?.target) return;

    let dronePos: THREE.Vector3;

    if (telemetry && status !== "idle") {
      const local = gpsToLocal(telemetry.lat, telemetry.lon, telemetry.altitude_m, bounds);
      dronePos = new THREE.Vector3(local.x, local.y, local.z);
    } else {
      const local = gpsToLocal(bounds.nw[0], bounds.nw[1], 0, bounds);
      dronePos = new THREE.Vector3(local.x, 0.5, local.z);
    }

    // Choose camera offset based on status
    let offset: THREE.Vector3;
    if (status === "idle") {
      offset = IDLE_OFFSET;
    } else if (status === "complete") {
      offset = COMPLETE_OFFSET;
    } else {
      offset = SURVEY_OFFSET;
    }

    // Target camera position: drone position + offset
    targetPos.current.set(
      dronePos.x + offset.x,
      offset.y,
      dronePos.z + offset.z
    );

    // Target look-at: slightly ahead of drone
    targetLookAt.current.set(dronePos.x, 1, dronePos.z);

    // Smooth lerp toward target
    const lerpSpeed = status === "takeoff" ? 0.8 : 1.5;
    camera.position.lerp(targetPos.current, Math.min(1, delta * lerpSpeed));
    ctrl.target.lerp(targetLookAt.current, Math.min(1, delta * lerpSpeed));
    ctrl.update();
  });

  return null;
}
