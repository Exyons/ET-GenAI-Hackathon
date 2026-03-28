"use client";

import { Sky } from "@react-three/drei";

export default function SkyAndLighting() {
  return (
    <>
      <Sky
        distance={450000}
        sunPosition={[100, 60, -50]}
        inclination={0.6}
        azimuth={0.25}
        rayleigh={0.5}
      />
      <ambientLight intensity={0.4} color="#fffbe6" />
      <directionalLight
        position={[80, 100, -40]}
        intensity={1.2}
        color="#fff8e7"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={200}
        shadow-camera-left={-80}
        shadow-camera-right={80}
        shadow-camera-top={80}
        shadow-camera-bottom={-80}
      />
      <hemisphereLight
        args={["#87ceeb", "#3a5f0b", 0.3]}
      />
      <fog attach="fog" args={["#e8f4e8", 150, 350]} />
    </>
  );
}
