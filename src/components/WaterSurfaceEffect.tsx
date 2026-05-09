import { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { hexToPixel } from '../types';
import { GEOMETRIES, createWaterSurfaceMaterial } from '../services/graphicsLibrary';

const sharedWaterMaterial = createWaterSurfaceMaterial();

export const updateWaterTime = (t: number) => {
  (sharedWaterMaterial as THREE.ShaderMaterial).uniforms.time.value = t;
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
  useMemo(() => {
    if (selectionStates.current.length !== waterTiles.length) {
      selectionStates.current = new Float32Array(waterTiles.length);
    }
  }, [waterTiles.length]);

  useEffect(() => {
    if (!meshRef.current) return;
    const dummy = new THREE.Object3D();

    waterTiles.forEach((tile, i) => {
      const { x, y: z } = hexToPixel(tile.coord.q, tile.coord.r);
      const height = 0.1; // WATER height in Game3D
      
      dummy.position.set(x, height + 0.01, z);
      dummy.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
      dummy.scale.set(1.03, 1.03, 1);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [waterTiles]);

  const lastSelectedHex = useRef<{q: number, r: number} | null>(null);
  const isTransitioning = useRef(false);

  useFrame((_state, delta) => {
    if (!meshRef.current || !selectionAttrRef.current) return;

    const hexChanged = lastSelectedHex.current?.q !== selectedHex?.q || lastSelectedHex.current?.r !== selectedHex?.r;
    
    if (!hexChanged && !isTransitioning.current) return;

    if (hexChanged) {
      lastSelectedHex.current = selectedHex;
      isTransitioning.current = true;
    }

    let needsUpdate = false;
    let anyStillMoving = false;

    for (let i = 0; i < waterTiles.length; i++) {
      const tile = waterTiles[i];
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
        anyStillMoving = true;
      }
    }

    isTransitioning.current = anyStillMoving;

    if (needsUpdate) {
      selectionAttrRef.current.needsUpdate = true;
    }
  });

  return (
    <instancedMesh 
      ref={meshRef} 
      args={[GEOMETRIES.water, sharedWaterMaterial, waterTiles.length]}
      onPointerEnter={(e) => {
        if (e.pointerType !== 'mouse') return;
        const id = e.instanceId;
        if (id !== undefined) {
          onPointerEnter(waterTiles[id].coord);
        }
      }}
      onPointerLeave={() => {
        onPointerLeave();
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        const id = e.instanceId;
        if (id !== undefined) {
          onClick(waterTiles[id].coord.q, waterTiles[id].coord.r);
        }
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

