import { useMemo, useRef, useEffect, useState } from 'react';
import { extend, useFrame } from '@react-three/fiber';
import { shaderMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { hexToPixel } from '../types';

const WaterSurfaceMaterial = shaderMaterial(
  { time: 0, color: new THREE.Color('#7495be') },
  // vertex shader
  `
    attribute float selection;
    varying vec2 vUv;
    varying vec3 vPosition;
    varying float vSelection;
    uniform float time;
    void main() {
      vUv = uv;
      vPosition = position;
      vSelection = selection;
      
      // Add subtle wave to vertices (scale 2x)
      vec3 pos = position;
      float wave = sin(pos.x * 10.0 + time * 2.0) * cos(pos.y * 10.0 + time * 2.0) * 0.0125;
      pos.z += wave;
      
      gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(pos, 1.0);
    }
  `,
  // fragment shader
  `
    uniform float time;
    uniform vec3 color;
    varying vec2 vUv;
    varying vec3 vPosition;
    varying float vSelection;

    float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
    }

    void main() {
      // Subtle color variation based on wave (scale 2x)
      float wave = sin(vPosition.x * 10.0 + time * 2.0) * cos(vPosition.y * 10.0 + time * 2.0);
      vec3 finalColor = color + vec3(wave * 0.1);
      
      // Slightly more greenish
      finalColor.g += 0.08;
      finalColor.b -= 0.02;
      
      // White-flecked texture from waterfall (scaled 2x)
      vec2 uv = vUv;
      uv.x += time * 0.1;
      uv.y += time * 0.1;
      
      float drip = random(vec2(floor(uv.x * 20.0), mod(floor(uv.y * 7.5), 1000.0)));
      if (drip > 0.95) {
          finalColor += vec3(0.5);
      }
      
      // Add some foam at the edges
      float dist = distance(vUv, vec2(0.5));
      float foam = smoothstep(0.45, 0.5, dist);
      finalColor = mix(finalColor, vec3(1.0), foam * 0.5);
      
      // Additive #444444 (approx 0.27) based on selection factor
      // Base brightness is 1.25
      gl_FragColor = vec4(finalColor * 1.25 + vSelection * vec3(0.27), 0.8);
    }
  `
);

extend({ WaterSurfaceMaterial });

declare module '@react-three/fiber' {
  interface ThreeElements {
    waterSurfaceMaterial: any;
  }
}

const waterGeo = new THREE.CircleGeometry(0.92, 6);
const sharedWaterMaterial = new WaterSurfaceMaterial();

export const updateWaterTime = () => {
  sharedWaterMaterial.time = performance.now() / 1000;
};

export const WaterBasesInstanced = ({ 
  board, 
  selectedHex, 
  onClick,
  onPointerEnter,
  onPointerLeave
}: { 
  board: any[], 
  selectedHex: {q: number, r: number} | null,
  onClick: (q: number, r: number) => void,
  onPointerEnter: (coord: {q: number, r: number}) => void,
  onPointerLeave: () => void
}) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const selectionAttrRef = useRef<THREE.InstancedBufferAttribute>(null);
  
  const waterTiles = useMemo(() => board.filter(t => t.terrain === 'Water'), [board]);
  const selectionStates = useRef(new Float32Array(waterTiles.length));

  useEffect(() => {
    if (!meshRef.current) return;
    const dummy = new THREE.Object3D();

    waterTiles.forEach((tile, i) => {
      const { x, y: z } = hexToPixel(tile.coord.q, tile.coord.r);
      const height = 0.1; // WATER height in Game3D
      
      dummy.position.set(x, height + 0.01, z);
      dummy.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [waterTiles]);

  useFrame((_state, delta) => {
    if (!meshRef.current || !selectionAttrRef.current) return;
    sharedWaterMaterial.time = performance.now() / 1000;

    let needsUpdate = false;
    waterTiles.forEach((tile, i) => {
      const isSelected = selectedHex?.q === tile.coord.q && selectedHex?.r === tile.coord.r;
      const target = isSelected ? 1.0 : 0.0;
      const current = selectionStates.current[i];

      if (Math.abs(current - target) > 0.001) {
        if (target > current) {
          selectionStates.current[i] = Math.min(target, current + 20 * delta);
        } else {
          selectionStates.current[i] = Math.max(target, current - 5 * delta);
        }
        selectionAttrRef.current!.setX(i, selectionStates.current[i]);
        needsUpdate = true;
      }
    });

    if (needsUpdate) {
      selectionAttrRef.current.needsUpdate = true;
    }
  });

  return (
    <instancedMesh 
      ref={meshRef} 
      args={[waterGeo, sharedWaterMaterial, waterTiles.length]}
      onClick={(e) => {
        e.stopPropagation();
        const id = e.instanceId;
        if (id !== undefined) {
          onClick(waterTiles[id].coord.q, waterTiles[id].coord.r);
        }
      }}
      onPointerEnter={(e) => {
        e.stopPropagation();
        const id = e.instanceId;
        if (id !== undefined) {
          onPointerEnter(waterTiles[id].coord);
        }
      }}
      onPointerLeave={(e) => {
        e.stopPropagation();
        onPointerLeave();
      }}
    >
      <instancedBufferAttribute 
        ref={selectionAttrRef}
        attach="geometry-attributes-selection"
        args={[selectionStates.current, 1]}
      />
    </instancedMesh>
  );
};

// Deprecated component, keeping for type safety if needed but will be replaced in Game3D
export const WaterSurfaceEffect = ({ radius: _r, isSelected: _s }: any) => null;

