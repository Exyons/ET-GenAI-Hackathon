"use client";

import { EffectComposer, Bloom, N8AO } from "@react-three/postprocessing";

export default function PostProcessing() {
  return (
    <EffectComposer>
      <Bloom
        luminanceThreshold={0.9}
        luminanceSmoothing={0.4}
        intensity={0.6}
        mipmapBlur
      />
      <N8AO
        aoRadius={0.5}
        intensity={1}
        distanceFalloff={0.5}
      />
    </EffectComposer>
  );
}
