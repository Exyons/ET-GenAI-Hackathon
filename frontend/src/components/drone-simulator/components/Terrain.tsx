"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { FieldBounds } from "../types";
import { field3DDimensions } from "../utils/gpsToLocal";

interface TerrainProps {
  bounds: FieldBounds;
}

export default function Terrain({ bounds }: TerrainProps) {
  const { width, height } = field3DDimensions(bounds);
  const segments = 64;

  // Procedural crop-row texture
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d")!;

    // Base soil color
    ctx.fillStyle = "#4a7c3f";
    ctx.fillRect(0, 0, 512, 512);

    // Crop rows (north-south stripes)
    const rowWidth = 512 / 20;
    for (let i = 0; i < 20; i++) {
      const x = i * rowWidth;
      // Alternating darker/lighter green for crop rows
      if (i % 2 === 0) {
        ctx.fillStyle = "#3d6b33";
        ctx.fillRect(x, 0, rowWidth * 0.4, 512);
        // Add slight texture dots for crops
        ctx.fillStyle = "#5a8f4e";
        for (let y = 0; y < 512; y += 8) {
          ctx.fillRect(x + rowWidth * 0.1, y, 3, 3);
          ctx.fillRect(x + rowWidth * 0.25, y + 4, 3, 3);
        }
      } else {
        // Soil between rows
        ctx.fillStyle = "#6b8e5a";
        ctx.fillRect(x, 0, rowWidth, 512);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    return tex;
  }, []);

  // Slight terrain undulation via vertex displacement
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(width, height, segments, segments);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      // Gentle rolling hills
      const displacement =
        Math.sin(x * 0.08) * 0.3 +
        Math.cos(y * 0.06) * 0.2 +
        Math.sin(x * 0.15 + y * 0.1) * 0.15;
      pos.setZ(i, displacement);
    }
    geo.computeVertexNormals();
    return geo;
  }, [width, height]);

  return (
    <group>
      {/* Main field */}
      <mesh
        geometry={geometry}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <meshStandardMaterial
          map={texture}
          roughness={0.9}
          metalness={0.0}
          color="#5a8f4a"
        />
      </mesh>

      {/* Surrounding ground plane (larger, flatter) */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.1, 0]}
        receiveShadow
      >
        <planeGeometry args={[width * 3, height * 3]} />
        <meshStandardMaterial
          color="#6b8e5a"
          roughness={1}
          metalness={0}
        />
      </mesh>

      {/* Field boundary markers (corner posts) */}
      {[
        [-width / 2, 0, -height / 2],
        [width / 2, 0, -height / 2],
        [-width / 2, 0, height / 2],
        [width / 2, 0, height / 2],
      ].map((pos, i) => (
        <mesh key={i} position={pos as [number, number, number]} castShadow>
          <cylinderGeometry args={[0.15, 0.15, 2, 8]} />
          <meshStandardMaterial color="#8B4513" />
        </mesh>
      ))}
    </group>
  );
}
