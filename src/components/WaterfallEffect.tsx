import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { hexToPixel } from '../types';
import { GEOMETRIES, createWaterfallMaterial } from '../services/graphicsLibrary';

const sharedWaterfallMaterial = createWaterfallMaterial();

export const updateWaterfallTime = (t: number) => {
  (sharedWaterfallMaterial as THREE.ShaderMaterial).uniforms.time.value = t;
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

  return (
    <instancedMesh ref={meshRef} args={[GEOMETRIES.waterfall, sharedWaterfallMaterial, waterfallTiles.length]} raycast={() => null} />
  );
};

// Deprecated, replaced by WaterfallsInstanced in Game3D
export const WaterfallEffect = () => null;

