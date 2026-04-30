import { useFrame, extend } from '@react-three/fiber';
import { shaderMaterial } from '@react-three/drei';
import { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { hexToPixel } from '../types';

const WaterfallMaterial = shaderMaterial(
  { time: 0, color: new THREE.Color('#8eaecf') },
  // vertex shader
  `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    }
  `,
  // fragment shader
  `
    uniform float time;
    uniform vec3 color;
    varying vec2 vUv;

    float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
    }

    void main() {
      vec2 uv = vUv;
      // scroll down
      uv.y += time * 0.8;
      
      // create streaks
      float streak = random(vec2(floor(vUv.x * 30.0), 0.0));
      float alpha = smoothstep(0.2, 0.8, streak) * 0.5;
      
      // drips
      float drip = random(vec2(floor(vUv.x * 40.0), mod(floor(uv.y * 15.0), 1000.0)));
      if (drip > 0.92) alpha += 0.6;

      // fade out at bottom
      alpha *= smoothstep(0.0, 0.1, vUv.y);
      // fade out at top
      alpha *= smoothstep(1.0, 0.9, vUv.y);

      vec3 waterColor = color;
      waterColor.g += 0.08;
      waterColor.b -= 0.02;
      gl_FragColor = vec4(waterColor + vec3(drip > 0.95 ? 0.5 : 0.0), alpha * 0.8);
    }
  `
);

extend({ WaterfallMaterial });

declare module '@react-three/fiber' {
  interface ThreeElements {
    waterfallMaterial: any;
  }
}

const waterfallGeo = new THREE.CylinderGeometry(0.93, 0.93, 2.0, 6, 1, true);
const sharedWaterfallMaterial = new WaterfallMaterial();
sharedWaterfallMaterial.side = THREE.DoubleSide;

export const updateWaterfallTime = () => {
  sharedWaterfallMaterial.time = performance.now() / 1000;
};

const isPerimeter = (q: number, r: number) => Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r)) === 10;

export const WaterfallsInstanced = ({ board }: { board: any[] }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const waterfallTiles = useMemo(() => board.filter(t => t.terrain === 'Water' && isPerimeter(t.coord.q, t.coord.r)), [board]);

  useEffect(() => {
    if (!meshRef.current) return;
    const dummy = new THREE.Object3D();

    waterfallTiles.forEach((tile, i) => {
      const { x, y: z } = hexToPixel(tile.coord.q, tile.coord.r);
      const height = 0.1;
      const depth = 2.0;
      
      dummy.position.set(x, height - depth / 2, z);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [waterfallTiles]);

  useFrame(() => {
    updateWaterfallTime();
  });

  return (
    <instancedMesh ref={meshRef} args={[waterfallGeo, sharedWaterfallMaterial, waterfallTiles.length]} />
  );
};

// Deprecated, replaced by WaterfallsInstanced in Game3D
export const WaterfallEffect = () => null;

