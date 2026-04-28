import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { PerspectiveCamera, OrbitControls, Text, useCursor, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { GameState, TerrainType, UnitType, HexCoord, hexToPixel, UNIT_ICONS, getNeighbors, getDistance, UNIT_STATS } from '../types';
import { TERRAIN_COLORS } from '../constants/colors';
import { Sparks3D, SmokeEffect3D, Projectile3D, MissEffect3D } from './Effects3D';
import { WaterfallEffect } from './WaterfallEffect';
import { WaterSurfaceEffect, updateWaterTime } from './WaterSurfaceEffect';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';
import { 
  CastleFeature, 
  FortressFeature, 
  VillageFeature, 
  GoldMineFeature,
  forestCone1,
  forestCone2,
  forestCone3,
  forestMat,
  mountainCone1,
  mountainMat
} from './TerrainFeatures3D';

interface Game3DProps {
  gameState: GameState;
  hoveredHex: HexCoord | null;
  setHoveredHex: (coord: HexCoord | null) => void;
  handleHexClick: (q: number, r: number) => void;
  finalizeMove: (unitId: string, target: HexCoord) => void;
  finalizeAttack: (unitId: string, target: HexCoord) => void;
  clearAnimation: (animId: string) => void;
  showStrategicView: boolean;
}

const TERRAIN_HEIGHTS: Record<TerrainType, number> = {
  [TerrainType.WATER]: 0.1,
  [TerrainType.PLAINS]: 0.2,
  [TerrainType.FOREST]: 0.3,
  [TerrainType.MOUNTAIN]: 0.4,
  [TerrainType.VILLAGE]: 0.25,
  [TerrainType.FORTRESS]: 0.4,
  [TerrainType.CASTLE]: 0.5,
  [TerrainType.GOLD_MINE]: 0.4,
};

// Geometry and Material Caches for Memory Efficiency
const tileGeometries: Record<number, THREE.CylinderGeometry> = {};
const getTileGeometry = (height: number) => {
  if (!tileGeometries[height]) {
    const geo = new THREE.CylinderGeometry(0.92, 0.92, height, 6);
    // Optimization: Don't render bottom cap (last 18 indices for a 6-segment cylinder)
    geo.setDrawRange(0, 54); 
    tileGeometries[height] = geo;
  }
  return tileGeometries[height];
};

const tileBorderGeometries: Record<number, THREE.CylinderGeometry> = {};
const borderMaterials: Record<string, THREE.MeshBasicMaterial> = {};
const getBorderMaterial = (color: string) => {
  if (!borderMaterials[color]) {
    borderMaterials[color] = new THREE.MeshBasicMaterial({ color });
  }
  return borderMaterials[color];
};

const possibleMoveGeo = new THREE.CircleGeometry(0.4, 32);
const possibleMoveMat = new THREE.MeshBasicMaterial({ color: "white", transparent: true, opacity: 0.5 });

const forestMoveGeo = new THREE.BoxGeometry(0.4, 0.4, 0.01);
const forestMoveMat = new THREE.MeshBasicMaterial({ color: '#22c55e', transparent: true, opacity: 0.8 });
const _possibleAttackGeo = new THREE.RingGeometry(0.75, 0.9, 6);
const _possibleAttackMat = new THREE.MeshBasicMaterial({ color: "#ef4444", transparent: true, opacity: 0.8, side: THREE.DoubleSide });
const _attackRangeMat = new THREE.MeshBasicMaterial({ color: "#ef4444", transparent: true, opacity: 0.15, side: THREE.DoubleSide });
const attackRangeGeo = new THREE.CircleGeometry(0.85, 6);

const territoryRingGeo = new THREE.RingGeometry(0.7, 0.9, 6);

// Shared Geometries and Materials for Units
const unitConeGeo = new THREE.ConeGeometry(0.4, 0.6, 16);
const infantryGeo = new THREE.BoxGeometry(0.4, 0.8, 0.4);
const archerGeo = new THREE.ConeGeometry(0.3, 1, 8);
const knightGeo1 = new THREE.CylinderGeometry(0.3, 0.3, 0.8, 8);
const knightGeo2 = new THREE.BoxGeometry(0.3, 0.4, 0.4);

const catapultGeo1 = new THREE.BoxGeometry(0.6, 0.3, 0.6);
const catapultGeo2 = new THREE.CylinderGeometry(0.1, 0.1, 0.8, 8);

const actionDotGeo = new THREE.SphereGeometry(0.15, 16, 16);
const actionDotMat = new THREE.MeshBasicMaterial({ color: "#22c55e" });

const playerMaterials: Record<string, THREE.MeshStandardMaterial> = {};
const getPlayerMaterial = (color: string) => {
  if (!playerMaterials[color]) {
    playerMaterials[color] = new THREE.MeshStandardMaterial({ color });
  }
  return playerMaterials[color];
};

const attackIndicatorMat = new THREE.MeshBasicMaterial({ color: "#ef4444", transparent: true, opacity: 0.5, side: THREE.DoubleSide });
const attackTargetMat = new THREE.MeshBasicMaterial({ color: "#ef4444", transparent: true, opacity: 0.2, wireframe: true });
const attackTargetGeo = new THREE.SphereGeometry(0.8, 16, 16);

// 3D Hex Tile
const PulsatingAttackIndicator = React.memo(({ height, geometry, active }: { height: number, geometry: THREE.BufferGeometry, active: boolean }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame(({ performance: _perf }) => {
    if (!meshRef.current) return;
    const t = performance.now() / 1000;
    // Pulsate between 0.25 and 0.75
    const opacity = 0.25 + 0.5 * (Math.sin(t * 3) * 0.5 + 0.5);
    (meshRef.current.material as THREE.MeshBasicMaterial).opacity = opacity;
  });

  if (!active) return null;

  return (
    <mesh 
      ref={meshRef}
      position={[0, height + 0.045, 0]} 
      rotation={[-Math.PI / 2, 0, Math.PI / 6]} 
      geometry={geometry}
      material={attackIndicatorMat}
    />
  );
});

const HexTile3D = React.memo(({ tile, isSelected, isHovered, isPossibleMove, _isPossibleAttack, isAttackRange, isExtendedRange, onClick, onPointerEnter, onPointerLeave, playerColor, hasAdjacentSettlement, unitAtHex, isCurrentPlayer, evaluation }: any) => {
  const { x, y: z } = hexToPixel(tile.coord.q, tile.coord.r);
  const height = TERRAIN_HEIGHTS[tile.terrain as TerrainType] || 0.4;
  const isWater = tile.terrain === TerrainType.WATER;
  const depth = 2.0; 
  const totalHeight = height + depth;
  
  const [hovered, setHovered] = useState(false);
  
  useCursor(hovered);

  const handlePointerEnter = (e: any) => {
    e.stopPropagation();
    setHovered(true);
    onPointerEnter(tile.coord);
  };

  const handlePointerLeave = (e: any) => {
    e.stopPropagation();
    setHovered(false);
    onPointerLeave(null);
  };

  // Use white for hover, player color for ownership. Selection is handled by instanced shader.
  return (
    <group position={[x, 0, z]}>
      {/* 
        The base tile mesh is now handled by MapBasesInstanced for performance.
        We only render overlays, borders, and effects here. 
      */}
      
      {/* Invisible interaction layer for non-water tiles (water has its own interaction) */}
      {!isWater && (
        <mesh 
          position={[0, height - totalHeight / 2, 0]}
          onClick={(e) => {
            e.stopPropagation();
            onClick?.(tile.coord.q, tile.coord.r);
          }}
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
          geometry={getTileGeometry(totalHeight)}
          visible={false} 
        />
      )}

      {/* Waterfall Effect for perimeter water tiles */}
      {isPerimeter(tile.coord) && isWater && (
        <WaterfallEffect topHeight={height} depth={depth} />
      )}

      {/* Water Surface Effect */}
      {isWater && (
        <group position={[0, height, 0]}>
          <WaterSurfaceEffect 
            radius={0.92} 
            isSelected={isSelected} 
            onClick={() => onClick(tile.coord.q, tile.coord.r)}
            onInteractionEnter={() => onPointerEnter(tile.coord)}
            onInteractionLeave={() => onPointerLeave(null)}
          />
        </group>
      )}

      {/* Indicators */}
      {isAttackRange && (
        <PulsatingAttackIndicator height={height} geometry={attackRangeGeo} active={true} />
      )}
      {isPossibleMove && (
        <mesh 
          position={[0, height + ([TerrainType.MOUNTAIN, TerrainType.GOLD_MINE].includes(tile.terrain as any) ? 1.4 : 0.04), 0]} 
          rotation={[-Math.PI / 2, 0, 0]} 
          geometry={tile.terrain === TerrainType.FOREST ? forestMoveGeo : possibleMoveGeo} 
          material={tile.terrain === TerrainType.FOREST ? forestMoveMat : possibleMoveMat} 
        />
      )}

      {/* Ownership indicator for settlements */}
      {tile.ownerId !== null && (tile.terrain === TerrainType.VILLAGE || tile.terrain === TerrainType.FORTRESS || tile.terrain === TerrainType.CASTLE || tile.terrain === TerrainType.GOLD_MINE) && (
        <mesh 
          position={[0, height + 0.02, 0]} 
          rotation={[-Math.PI / 2, 0, Math.PI / 6]} 
          geometry={territoryRingGeo}
          material={getBorderMaterial(playerColor)}
        />
      )}

      {/* Recruitment Hint */}
      {!unitAtHex && isCurrentPlayer && (tile.terrain === TerrainType.CASTLE || tile.terrain === TerrainType.VILLAGE) && (
        <Billboard position={[0, height + 0.5, 0]}>
          <Text fontSize={0.5} color="white" outlineWidth={0.05} outlineColor="black">
            ⊕
          </Text>
        </Billboard>
      )}

      {/* Boat on Water adjacent to settlement */}
      {tile.terrain === TerrainType.WATER && hasAdjacentSettlement && (
        <Billboard position={[0, height + 0.2, 0]}>
          <Text fontSize={0.6}>
            ⛵
          </Text>
        </Billboard>
      )}

      {/* Extended Range Indicator */}
      {isExtendedRange && (
        <Billboard position={[0, height + 0.8, 0]}>
          <Text fontSize={0.8} color="#ef4444" outlineWidth={0.05} outlineColor="black" fontWeight="bold">
            +
          </Text>
        </Billboard>
      )}

      {/* Strategic Evaluation Indicators */}
      {evaluation && (
        <group position={[0, height + 0.1, 0]}>
          {evaluation.opportunity > 0 && (
            <mesh position={[-0.3, 0, 0]}>
              <sphereGeometry args={[Math.min(0.4, 0.05 * Math.sqrt(evaluation.opportunity)), 16, 16]} />
              <meshBasicMaterial color="#22c55e" transparent opacity={0.7} />
            </mesh>
          )}
          {evaluation.peril > 0 && (
            <mesh position={[0.3, 0, 0]}>
              <sphereGeometry args={[Math.min(0.4, 0.05 * Math.sqrt(evaluation.peril)), 16, 16]} />
              <meshBasicMaterial color="#ef4444" transparent opacity={0.7} />
            </mesh>
          )}
          {evaluation.isAvailableTarget && (
            <Billboard position={[0, 0.6, 0]}>
              <Text fontSize={0.8} color="#eab308" outlineWidth={0.06} outlineColor="black" fontWeight="bold">
                +
              </Text>
            </Billboard>
          )}
          {isHovered && (evaluation.opportunity !== 0 || evaluation.peril > 0 || evaluation.isAvailableTarget) && (
            <Billboard position={[0, 1.5, 0]}>
              <Text 
                fontSize={0.25} 
                color="white" 
                outlineWidth={0.02} 
                outlineColor="black"
                maxWidth={3}
                textAlign="center"
              >
                {evaluation.reasons.join('\n')}
              </Text>
            </Billboard>
          )}
        </group>
      )}

      {/* Terrain Features */}
      {tile.terrain === TerrainType.CASTLE && <CastleFeature position={[0, height, 0]} playerColor={playerColor} />}
      {tile.terrain === TerrainType.FORTRESS && <FortressFeature position={[0, height, 0]} playerColor={playerColor} />}
      {tile.terrain === TerrainType.VILLAGE && <VillageFeature position={[0, height, 0]} playerColor={playerColor} isClaimed={tile.ownerId !== null} />}
      {tile.terrain === TerrainType.GOLD_MINE && <GoldMineFeature position={[0, height, 0]} />}
    </group>
  );
});

const isPerimeter = (coord: HexCoord) => Math.max(Math.abs(coord.q), Math.abs(coord.r), Math.abs(-coord.q - coord.r)) === 10;

const MapBasesInstanced = React.memo(({ board, selectedHex, hoveredHex, onClick }: { board: any[], selectedHex: HexCoord | null, hoveredHex: HexCoord | null, onClick: (q: number, r: number) => void }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const selectionAttrRef = useRef<THREE.InstancedBufferAttribute>(null);
  const hoverAttrRef = useRef<THREE.InstancedBufferAttribute>(null);
  
  // Only instance non-water tiles to handle water shader separately or keep it simple
  const nonWaterTiles = useMemo(() => board.filter(t => t.terrain !== TerrainType.WATER), [board]);
  const selectionStates = useRef(new Float32Array(nonWaterTiles.length));
  const hoverStates = useRef(new Float32Array(nonWaterTiles.length));

  const unitHexGeo = useMemo(() => {
    const geo = new THREE.CylinderGeometry(0.92, 0.92, 1, 6);
    geo.setDrawRange(0, 54); // No bottom cap
    return geo;
  }, []);

  const instancedMat = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial();
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = `
        attribute float selection;
        attribute float hover;
        varying float vSelection;
        varying float vHover;
        ${shader.vertexShader}
      `.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        vSelection = selection;
        vHover = hover;
        `
      );
      
      shader.fragmentShader = `
        varying float vSelection;
        varying float vHover;
        ${shader.fragmentShader}
      `.replace(
        '#include <color_fragment>',
        `
        #include <color_fragment>
        // Neutral highlights: selection #444444 (vec3(0.27)), hover #222222 (vec3(0.13))
        diffuseColor.rgb += vSelection * vec3(0.27) + vHover * vec3(0.13);
        `
      );
    };
    return mat;
  }, []);

  useEffect(() => {
    if (!meshRef.current) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    nonWaterTiles.forEach((tile, i) => {
      const { x, y: z } = hexToPixel(tile.coord.q, tile.coord.r);
      const height = TERRAIN_HEIGHTS[tile.terrain as TerrainType] || 0.4;
      const depth = 2.0;
      const totalHeight = height + depth;
      const baseColor = TERRAIN_COLORS[tile.terrain as TerrainType];

      dummy.scale.set(1, totalHeight, 1);
      dummy.position.set(x, height - totalHeight / 2, z);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);

      color.set(baseColor);
      meshRef.current!.setColorAt(i, color);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  }, [nonWaterTiles]);

  useFrame((_state, delta) => {
    if (!meshRef.current || !selectionAttrRef.current || !hoverAttrRef.current) return;
    
    let needsUpdate = false;
    nonWaterTiles.forEach((tile, i) => {
      // Selection
      const isSelected = selectedHex?.q === tile.coord.q && selectedHex?.r === tile.coord.r;
      const targetSel = isSelected ? 1.0 : 0.0;
      const currentSel = selectionStates.current[i];

      if (Math.abs(currentSel - targetSel) > 0.001) {
        if (targetSel > currentSel) {
          selectionStates.current[i] = Math.min(targetSel, currentSel + 20 * delta);
        } else {
          selectionStates.current[i] = Math.max(targetSel, currentSel - 5 * delta);
        }
        selectionAttrRef.current!.setX(i, selectionStates.current[i]);
        needsUpdate = true;
      }

      // Hover
      const isHovered = hoveredHex?.q === tile.coord.q && hoveredHex?.r === tile.coord.r;
      const targetHover = isHovered ? 1.0 : 0.0;
      const currentHover = hoverStates.current[i];

      if (Math.abs(currentHover - targetHover) > 0.001) {
        if (targetHover > currentHover) {
          hoverStates.current[i] = Math.min(targetHover, currentHover + 20 * delta);
        } else {
          hoverStates.current[i] = Math.max(targetHover, currentHover - 10 * delta);
        }
        hoverAttrRef.current!.setX(i, hoverStates.current[i]);
        needsUpdate = true;
      }
    });

    if (needsUpdate) {
      selectionAttrRef.current.needsUpdate = true;
      hoverAttrRef.current.needsUpdate = true;
    }
  });

  return (
    <instancedMesh 
      ref={meshRef} 
      args={[unitHexGeo, instancedMat, nonWaterTiles.length]}
      onClick={(e) => {
        e.stopPropagation();
        const instanceId = e.instanceId;
        if (instanceId !== undefined) {
          const tile = nonWaterTiles[instanceId];
          onClick(tile.coord.q, tile.coord.r);
        }
      }}
    >
      <instancedBufferAttribute 
        ref={selectionAttrRef}
        attach="geometry-attributes-selection"
        args={[selectionStates.current, 1]}
      />
      <instancedBufferAttribute 
        ref={hoverAttrRef}
        attach="geometry-attributes-hover"
        args={[hoverStates.current, 1]}
      />
    </instancedMesh>
  );
});

// 3D Unit
const AnimatedUnit3D = React.memo(({ unit, playerColor, isSelected, anim, onAnimationEnd, isOnWater, tileHeight, canMove, isPossibleAttackTarget, isProhibitedTarget }: any) => {
  const { x, y: z } = hexToPixel(unit.coord.q, unit.coord.r);
  
  const targetX = anim?.to ? hexToPixel(anim.to.q, anim.to.r).x : x;
  const targetZ = anim?.to ? hexToPixel(anim.to.q, anim.to.r).y : z;
  
  const baseHeight = tileHeight + 0.1;

  const groupRef = useRef<THREE.Group>(null);
  const animTimeRef = useRef(0);
  const animDoneRef = useRef(false);

  useEffect(() => {
    if (anim) {
      animTimeRef.current = 0;
      animDoneRef.current = false;
    }
  }, [anim]);

  useFrame((_state, delta) => {
    if (!groupRef.current) return;

    if (anim) {
      animTimeRef.current += delta;
      
      const duration = 0.4;
      const progress = Math.min(animTimeRef.current / duration, 1);
      
      // Easing function (easeInOutQuad)
      const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      if (anim.type === 'move') {
        groupRef.current.position.x = THREE.MathUtils.lerp(x, targetX, ease);
        groupRef.current.position.z = THREE.MathUtils.lerp(z, targetZ, ease);
        // Parabolic arc for movement
        groupRef.current.position.y = baseHeight + Math.sin(progress * Math.PI) * 1.0;
      } else if (anim.type === 'attack') {
        if (unit.type === UnitType.CATAPULT || unit.type === UnitType.ARCHER) {
          // Small hop in place for ranged units
          groupRef.current.position.y = baseHeight + Math.sin(progress * Math.PI) * 0.5;
        } else {
          // Bump forward and back for melee units
          const bumpProgress = progress < 0.5 ? progress * 2 : (1 - progress) * 2;
          const bumpEase = bumpProgress < 0.5 ? 2 * bumpProgress * bumpProgress : 1 - Math.pow(-2 * bumpProgress + 2, 2) / 2;
          
          groupRef.current.position.x = THREE.MathUtils.lerp(x, (x + targetX) / 2, bumpEase);
          groupRef.current.position.z = THREE.MathUtils.lerp(z, (z + targetZ) / 2, bumpEase);
          groupRef.current.position.y = baseHeight;
        }
      }

      if (progress >= 1 && !animDoneRef.current) {
        animDoneRef.current = true;
        onAnimationEnd?.();
      }
    } else {
      groupRef.current.position.x = THREE.MathUtils.lerp(groupRef.current.position.x, x, 0.1);
      groupRef.current.position.z = THREE.MathUtils.lerp(groupRef.current.position.z, z, 0.1);
      groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, baseHeight, 0.1);
    }
  });

  return (
    <group
      ref={groupRef}
      position={[x, baseHeight, z]}
    >
      {/* Unit Support Cone */}
      <mesh 
        position={[0, 0.3, 0]} 
        geometry={unitConeGeo} 
        material={getPlayerMaterial(playerColor)} 
      />

      {/* Unit Body */}
      <Billboard position={[0, 0.6, 0]}>
        {unit.type === UnitType.INFANTRY && (
          <mesh position={[0, 0.4, 0]} geometry={infantryGeo} material={getPlayerMaterial(playerColor)} />
        )}
        {unit.type === UnitType.ARCHER && (
          <mesh position={[0, 0.5, 0]} geometry={archerGeo} material={getPlayerMaterial(playerColor)} />
        )}
        {unit.type === UnitType.KNIGHT && (
          <group position={[0, 0.4, 0]}>
            <mesh rotation={[Math.PI/2, 0, 0]} geometry={knightGeo1} material={getPlayerMaterial(playerColor)} />
            <mesh position={[0, 0.4, 0.3]} geometry={knightGeo2} material={getPlayerMaterial(playerColor)} />
          </group>
        )}
        {unit.type === UnitType.CATAPULT && (
          <group position={[0, 0.3, 0]}>
            <mesh position={[0, 0, 0]} geometry={catapultGeo1} material={getPlayerMaterial(playerColor)} />
            <mesh position={[0, 0.4, 0.2]} rotation={[Math.PI/4, 0, 0]} geometry={catapultGeo2} material={getPlayerMaterial(playerColor)} />
          </group>
        )}
      </Billboard>

      {/* Icon */}
      <Billboard position={[0, 1.8, 0]}>
        {isOnWater && (
          <Text position={[-0.5, 0, 0]} fontSize={0.6}>
            🛶
          </Text>
        )}
        <Text position={[0, 0, 0]} fontSize={0.8} color="white" outlineWidth={0.05} outlineColor="black">
          {UNIT_ICONS[unit.type as UnitType]}
        </Text>
      </Billboard>

      {/* Action Dot */}
      {canMove && !isSelected && (
        <mesh position={[0, 2.3, 0]} geometry={actionDotGeo} material={actionDotMat} />
      )}

      {/* Attack Target Indicator */}
      {isPossibleAttackTarget && (
        <mesh 
          position={[0, 0.5, 0]} 
          geometry={attackTargetGeo}
          material={attackTargetMat}
        />
      )}

      {/* Prohibited Target Indicator (Catapult vs Forest) */}
      {isProhibitedTarget && (
        <Billboard position={[0, 2.3, 0]}>
          <Text fontSize={0.8} color="#ef4444" outlineWidth={0.05} outlineColor="black">
            🚫
          </Text>
        </Billboard>
      )}
    </group>
  );
});

const FeaturesInstanced = React.memo(({ board }: { board: any[] }) => {
  const forests = useMemo(() => board.filter(t => t.terrain === TerrainType.FOREST), [board]);
  const mountains = useMemo(() => board.filter(t => t.terrain === TerrainType.MOUNTAIN), [board]);

  const forestRefs = [useRef<THREE.InstancedMesh>(null), useRef<THREE.InstancedMesh>(null), useRef<THREE.InstancedMesh>(null)];
  const mountainRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const dummy = new THREE.Object3D();
    
    // Forest 1
    if (forestRefs[0].current) {
      forests.forEach((tile, i) => {
        const { x, y: z } = hexToPixel(tile.coord.q, tile.coord.r);
        const height = TERRAIN_HEIGHTS[TerrainType.FOREST];
        dummy.position.set(x - 0.2, height + 0.3, z - 0.2);
        dummy.updateMatrix();
        forestRefs[0].current!.setMatrixAt(i, dummy.matrix);
      });
      forestRefs[0].current.instanceMatrix.needsUpdate = true;
    }
    // Forest 2
    if (forestRefs[1].current) {
      forests.forEach((tile, i) => {
        const { x, y: z } = hexToPixel(tile.coord.q, tile.coord.r);
        const height = TERRAIN_HEIGHTS[TerrainType.FOREST];
        dummy.position.set(x + 0.3, height + 0.4, z + 0.1);
        dummy.updateMatrix();
        forestRefs[1].current!.setMatrixAt(i, dummy.matrix);
      });
      forestRefs[1].current.instanceMatrix.needsUpdate = true;
    }
    // Forest 3
    if (forestRefs[2].current) {
      forests.forEach((tile, i) => {
        const { x, y: z } = hexToPixel(tile.coord.q, tile.coord.r);
        const height = TERRAIN_HEIGHTS[TerrainType.FOREST];
        dummy.position.set(x - 0.1, height + 0.25, z + 0.3);
        dummy.updateMatrix();
        forestRefs[2].current!.setMatrixAt(i, dummy.matrix);
      });
      forestRefs[2].current.instanceMatrix.needsUpdate = true;
    }

    // Mountain
    if (mountainRef.current) {
      mountains.forEach((tile, i) => {
        const { x, y: z } = hexToPixel(tile.coord.q, tile.coord.r);
        const height = TERRAIN_HEIGHTS[TerrainType.MOUNTAIN];
        dummy.position.set(x, height + 0.575, z);
        dummy.rotation.set(0, Math.PI / 4, 0);
        dummy.updateMatrix();
        mountainRef.current!.setMatrixAt(i, dummy.matrix);
      });
      mountainRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [forests, mountains]);

  return (
    <group>
      {forests.length > 0 && (
        <>
          <instancedMesh ref={forestRefs[0]} args={[forestCone1, forestMat, forests.length]} />
          <instancedMesh ref={forestRefs[1]} args={[forestCone2, forestMat, forests.length]} />
          <instancedMesh ref={forestRefs[2]} args={[forestCone3, forestMat, forests.length]} />
        </>
      )}
      {mountains.length > 0 && (
        <instancedMesh ref={mountainRef} args={[mountainCone1, mountainMat, mountains.length]} />
      )}
    </group>
  );
});
const skySphereGeo = new THREE.SphereGeometry(800, 32, 32);
const skySphereMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: {
    colorTop: { value: new THREE.Color('#94E2FF') }, // Brighter Sky Blue (+10%)
    colorBottom: { value: new THREE.Color('#7A4F44') }, // Terra Cotta (+25% saturation, adjusted brightness)
  },
  vertexShader: `
    varying vec3 vWorldPosition;
    void main() {
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 colorTop;
    uniform vec3 colorBottom;
    varying vec3 vWorldPosition;

    void main() {
      vec3 direction = normalize(vWorldPosition);
      // Align midpoint to 35% latitude from bottom
      // Total range -1..1 (diff 2). 35% of 2 is 0.7. -1 + 0.7 = -0.3.
      // So midpoint should be at y = -0.3.
      // For smoothstep(A, B, y) to have midpoint at -0.3, (A+B)/2 = -0.3.
      // Let's use A = -1.0, B = 0.4. (-1 + 0.4)/2 = -0.3.
      float h = smoothstep(-1.0, 0.4, direction.y);
      vec3 color = mix(colorBottom, colorTop, h);
      gl_FragColor = vec4(color, 1.0);
    }
  `
});

const GlobalSceneUpdates = () => {
  useFrame(() => {
    updateWaterTime();
  });
  return null;
};

const birdGeo = new THREE.BoxGeometry(0.1, 0.05, 0.3);
const wingGeo = new THREE.BoxGeometry(0.4, 0.01, 0.15);
const birdMat = new THREE.MeshStandardMaterial({ color: "white" });

const batGeo = new THREE.BoxGeometry(0.15, 0.1, 0.3);
const batWingGeo = new THREE.BoxGeometry(0.6, 0.01, 0.25);
const batMat = new THREE.MeshStandardMaterial({ color: "#2a0505" });
const batWingMat = new THREE.MeshStandardMaterial({ color: "#450a0a" });

const BackgroundElements = React.memo(() => {
  const birdMeshRef = useRef<THREE.InstancedMesh>(null);
  const birdLeftWingRef = useRef<THREE.InstancedMesh>(null);
  const birdRightWingRef = useRef<THREE.InstancedMesh>(null);

  const batMeshRef = useRef<THREE.InstancedMesh>(null);
  const batLeftWingRef = useRef<THREE.InstancedMesh>(null);
  const batRightWingRef = useRef<THREE.InstancedMesh>(null);

  // Reuse Object3D instances to avoid GC pressure
  const dummyObject = useMemo(() => new THREE.Object3D(), []);
  const wingLObject = useMemo(() => new THREE.Object3D(), []);
  const wingRObject = useMemo(() => new THREE.Object3D(), []);

  const entities = useMemo(() => {
    const data = [];
    for (let i = 0; i < 10; i++) {
       data.push({
         x: (Math.random() - 0.5) * 100,
         y: 8 + Math.random() * 4,
         z: (Math.random() - 0.5) * 100,
         speed: 2 + Math.random() * 3,
         offset: Math.random() * 100,
         type: 'bird'
       });
    }
    for (let i = 0; i < 6; i++) {
      data.push({
        x: (Math.random() - 0.5) * 120,
        y: -12 - Math.random() * 8,
        z: (Math.random() - 0.5) * 120,
        speed: 3 + Math.random() * 4,
        offset: Math.random() * 100,
        type: 'bat'
      });
    }
    return data;
  }, []);

  useFrame(({ clock }) => {
    let birdIdx = 0;
    let batIdx = 0;

    entities.forEach((e) => {
      const t = clock.getElapsedTime() + e.offset;
      const x = e.x + (e.type === 'bird' ? Math.sin(t * 0.1) * 30 : Math.cos(t * 0.15) * 40);
      let z = e.z + t * e.speed;
      const boundary = e.type === 'bird' ? 80 : 100;
      if (z > boundary) z = -boundary;
      const y = e.y + (e.type === 'bird' ? Math.sin(t * 2) * 0.2 : Math.sin(t * 5) * 0.3);

      dummyObject.position.set(x, y, z);
      dummyObject.updateMatrix();

      if (e.type === 'bird') {
        if (birdMeshRef.current) birdMeshRef.current.setMatrixAt(birdIdx, dummyObject.matrix);
        
        const flap = Math.sin(t * 12) * 0.6;
        wingLObject.position.set(x + 0.2, y, z);
        wingLObject.rotation.z = flap;
        wingLObject.updateMatrix();
        if (birdLeftWingRef.current) birdLeftWingRef.current.setMatrixAt(birdIdx, wingLObject.matrix);

        wingRObject.position.set(x - 0.2, y, z);
        wingRObject.rotation.z = -flap;
        wingRObject.updateMatrix();
        if (birdRightWingRef.current) birdRightWingRef.current.setMatrixAt(birdIdx, wingRObject.matrix);
        
        birdIdx++;
      } else {
        if (batMeshRef.current) batMeshRef.current.setMatrixAt(batIdx, dummyObject.matrix);
        
        const flap = Math.sin(t * 18) * 0.9;
        wingLObject.position.set(x + 0.3, y, z);
        wingLObject.rotation.z = flap;
        wingLObject.updateMatrix();
        if (batLeftWingRef.current) batLeftWingRef.current.setMatrixAt(batIdx, wingLObject.matrix);

        wingRObject.position.set(x - 0.3, y, z);
        wingRObject.rotation.z = -flap;
        wingRObject.updateMatrix();
        if (batRightWingRef.current) batRightWingRef.current.setMatrixAt(batIdx, wingRObject.matrix);
        
        batIdx++;
      }
    });

    if (birdMeshRef.current) birdMeshRef.current.instanceMatrix.needsUpdate = true;
    if (birdLeftWingRef.current) birdLeftWingRef.current.instanceMatrix.needsUpdate = true;
    if (birdRightWingRef.current) birdRightWingRef.current.instanceMatrix.needsUpdate = true;
    if (batMeshRef.current) batMeshRef.current.instanceMatrix.needsUpdate = true;
    if (batLeftWingRef.current) batLeftWingRef.current.instanceMatrix.needsUpdate = true;
    if (batRightWingRef.current) batRightWingRef.current.instanceMatrix.needsUpdate = true;
  });

  const birdCount = entities.filter(e => e.type === 'bird').length;
  const batCount = entities.filter(e => e.type === 'bat').length;

  return (
    <group>
      {birdCount > 0 && (
        <>
          <instancedMesh ref={birdMeshRef} args={[birdGeo, birdMat, birdCount]} />
          <instancedMesh ref={birdLeftWingRef} args={[wingGeo, birdMat, birdCount]} />
          <instancedMesh ref={birdRightWingRef} args={[wingGeo, birdMat, birdCount]} />
        </>
      )}
      {batCount > 0 && (
        <>
          <instancedMesh ref={batMeshRef} args={[batGeo, batMat, batCount]} />
          <instancedMesh ref={batLeftWingRef} args={[batWingGeo, batWingMat, batCount]} />
          <instancedMesh ref={batRightWingRef} args={[batWingGeo, batWingMat, batCount]} />
        </>
      )}
    </group>
  );
});

const CameraRotationTicker = ({ controls, rotationActive }: { controls: any, rotationActive: React.MutableRefObject<any> }) => {
  useFrame((_state, delta) => {
    if (!controls) return;
    
    // Significantly increase speed for Orthographic camera responsiveness
    const speed = 2.5; // Even faster for better feel
    
    let needsUpdate = false;
    if (rotationActive.current.left) {
      controls.setAzimuthalAngle(controls.getAzimuthalAngle() + speed * delta);
      needsUpdate = true;
    }
    if (rotationActive.current.right) {
      controls.setAzimuthalAngle(controls.getAzimuthalAngle() - speed * delta);
      needsUpdate = true;
    }
    if (rotationActive.current.up) {
      controls.setPolarAngle(controls.getPolarAngle() + speed * delta);
      needsUpdate = true;
    }
    if (rotationActive.current.down) {
      controls.setPolarAngle(controls.getPolarAngle() - speed * delta);
      needsUpdate = true;
    }
    
    if (needsUpdate) {
      controls.update();
    }
  });
  return null;
};

const CameraControlsOverlay = React.memo(({ rotationActive }: { rotationActive: React.MutableRefObject<any> }) => {
  const [activeActions, setActiveActions] = useState({ left: false, right: false, up: false, down: false });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture keys if an input is focused
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          rotationActive.current.up = true;
          setActiveActions(prev => prev.up ? prev : { ...prev, up: true });
          break;
        case 'ArrowDown':
          e.preventDefault();
          rotationActive.current.down = true;
          setActiveActions(prev => prev.down ? prev : { ...prev, down: true });
          break;
        case 'ArrowLeft':
          e.preventDefault();
          rotationActive.current.left = true;
          setActiveActions(prev => prev.left ? prev : { ...prev, left: true });
          break;
        case 'ArrowRight':
          e.preventDefault();
          rotationActive.current.right = true;
          setActiveActions(prev => prev.right ? prev : { ...prev, right: true });
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp': 
          rotationActive.current.up = false; 
          setActiveActions(prev => ({ ...prev, up: false }));
          break;
        case 'ArrowDown': 
          rotationActive.current.down = false; 
          setActiveActions(prev => ({ ...prev, down: false }));
          break;
        case 'ArrowLeft': 
          rotationActive.current.left = false; 
          setActiveActions(prev => ({ ...prev, left: false }));
          break;
        case 'ArrowRight': 
          rotationActive.current.right = false; 
          setActiveActions(prev => ({ ...prev, right: false }));
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown, { passive: false });
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [rotationActive]);

  return (
    <div className="absolute bottom-6 right-6 flex flex-col items-center gap-2 pointer-events-none z-10 scale-90 sm:scale-100 origin-bottom-right">
      <button 
        onPointerDown={(e) => { 
          (e.target as HTMLElement).releasePointerCapture(e.pointerId);
          rotationActive.current.up = true; 
          setActiveActions(prev => ({ ...prev, up: true }));
        }}
        onPointerUp={() => { 
          rotationActive.current.up = false; 
          setActiveActions(prev => ({ ...prev, up: false }));
        }}
        onPointerLeave={() => { 
          rotationActive.current.up = false; 
          setActiveActions(prev => ({ ...prev, up: false }));
        }}
        className={`w-12 h-12 bg-white/20 backdrop-blur-md border-2 border-black/20 rounded-xl flex items-center justify-center hover:bg-white/40 active:scale-95 transition-all pointer-events-auto shadow-lg ${activeActions.up ? 'bg-white/60 border-amber-500 scale-95' : ''}`}
        title="Rotate Up"
      >
        <ArrowUp size={30} className={activeActions.up ? "text-amber-600" : "text-black/60"} />
      </button>
      <div className="flex gap-2">
        <button 
          onPointerDown={(e) => { 
            (e.target as HTMLElement).releasePointerCapture(e.pointerId);
            rotationActive.current.left = true; 
            setActiveActions(prev => ({ ...prev, left: true }));
          }}
          onPointerUp={() => { 
            rotationActive.current.left = false; 
            setActiveActions(prev => ({ ...prev, left: false }));
          }}
          onPointerLeave={() => { 
            rotationActive.current.left = false; 
            setActiveActions(prev => ({ ...prev, left: false }));
          }}
          className={`w-12 h-12 bg-white/20 backdrop-blur-md border-2 border-black/20 rounded-xl flex items-center justify-center hover:bg-white/40 active:scale-95 transition-all pointer-events-auto shadow-lg ${activeActions.left ? 'bg-white/60 border-amber-500 scale-95' : ''}`}
          title="Spin Left"
        >
          <ArrowLeft size={30} className={activeActions.left ? "text-amber-600" : "text-black/60"} />
        </button>
        <button 
          onPointerDown={(e) => { 
            (e.target as HTMLElement).releasePointerCapture(e.pointerId);
            rotationActive.current.down = true; 
            setActiveActions(prev => ({ ...prev, down: true }));
          }}
          onPointerUp={() => { 
            rotationActive.current.down = false; 
            setActiveActions(prev => ({ ...prev, down: false }));
          }}
          onPointerLeave={() => { 
            rotationActive.current.down = false; 
            setActiveActions(prev => ({ ...prev, down: false }));
          }}
          className={`w-12 h-12 bg-white/20 backdrop-blur-md border-2 border-black/20 rounded-xl flex items-center justify-center hover:bg-white/40 active:scale-95 transition-all pointer-events-auto shadow-lg ${activeActions.down ? 'bg-white/60 border-amber-500 scale-95' : ''}`}
          title="Rotate Down"
        >
          <ArrowDown size={30} className={activeActions.down ? "text-amber-600" : "text-black/60"} />
        </button>
        <button 
          onPointerDown={(e) => { 
            (e.target as HTMLElement).releasePointerCapture(e.pointerId);
            rotationActive.current.right = true; 
            setActiveActions(prev => ({ ...prev, right: true }));
          }}
          onPointerUp={() => { 
            rotationActive.current.right = false; 
            setActiveActions(prev => ({ ...prev, right: false }));
          }}
          onPointerLeave={() => { 
            rotationActive.current.right = false; 
            setActiveActions(prev => ({ ...prev, right: false }));
          }}
          className={`w-12 h-12 bg-white/20 backdrop-blur-md border-2 border-black/20 rounded-xl flex items-center justify-center hover:bg-white/40 active:scale-95 transition-all pointer-events-auto shadow-lg ${activeActions.right ? 'bg-white/60 border-amber-500 scale-95' : ''}`}
          title="Spin Right"
        >
          <ArrowRight size={30} className={activeActions.right ? "text-amber-600" : "text-black/60"} />
        </button>
      </div>
    </div>
  );
});

const SunLight = () => {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const targetRef = useRef<THREE.Object3D>(new THREE.Object3D());
  
  useFrame(({ camera }) => {
    if (!lightRef.current) return;
    
    // Position light over the left shoulder relative to camera
    // We want it to "hit the scene at 45 degrees"
    // Left shoulder means offset to the left (-X in local camera space)
    // and slightly up (+Y in local camera space) and behind (+Z in local camera space)
    
    const offset = new THREE.Vector3(-20, 20, 20); // Relative offset
    offset.applyQuaternion(camera.quaternion);
    lightRef.current.position.copy(camera.position).add(offset);
    
    // We want the light to target the point the camera is looking at, or just 0,0,0
    // DirectionalLight uses a target Object3D. 
    // If not specified, it targets 0,0,0.
  });

  return (
    <>
      <primitive object={targetRef.current} position={[0, 0, 0]} />
      <directionalLight 
        ref={lightRef} 
        intensity={2.2} 
        target={targetRef.current}
      />
    </>
  );
};

export const Game3D: React.FC<Game3DProps> = ({ gameState, hoveredHex, setHoveredHex, handleHexClick, finalizeMove, finalizeAttack, clearAnimation, showStrategicView }) => {
  const [controls, setControls] = useState<any>(null);
  const rotationActive = useRef({ left: false, right: false, up: false, down: false });
  
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const selectedUnit = gameState.units.find(u => u.id === gameState.selectedUnitId);
  const isSelectedCatapult = selectedUnit?.type === UnitType.CATAPULT;

  // Pre-calculate lookups for performance
  const possibleMovesSet = useMemo(() => new Set(gameState.possibleMoves.map(m => `${m.q},${m.r}`)), [gameState.possibleMoves]);
  const possibleAttacksSet = useMemo(() => new Set(gameState.possibleAttacks.map(a => `${a.q},${a.r}`)), [gameState.possibleAttacks]);
  const attackRangeSet = useMemo(() => new Set(gameState.attackRange.map(r => `${r.q},${r.r}`)), [gameState.attackRange]);
  const unitsMap = useMemo(() => {
    const map = new Map<string, any>();
    (gameState.units || []).forEach(u => map.set(`${u.coord.q},${u.coord.r}`, u));
    return map;
  }, [gameState.units]);

  const boardMap = useMemo(() => {
    const map = new Map<string, any>();
    (gameState.board || []).forEach(t => map.set(`${t.coord.q},${t.coord.r}`, t));
    return map;
  }, [gameState.board]);

  const animationsMap = useMemo(() => {
    const map = new Map<string, any>();
    (gameState.animations || []).forEach(a => {
      if (a.unitId) map.set(a.unitId, a);
    });
    return map;
  }, [gameState.animations]);

  const matrixMap = useMemo(() => {
    const map = new Map<string, any>();
    if (showStrategicView && gameState.opportunityPerilMatrix) {
      gameState.opportunityPerilMatrix.forEach(eval_ => {
        map.set(`${eval_.q},${eval_.r}`, eval_);
      });
    }
    return map;
  }, [showStrategicView, gameState.opportunityPerilMatrix]);

  useEffect(() => {
    const handleResize = () => {
      if (controls) {
        // Force controls to sync with new camera state/aspect
        controls.update();
      }
      // Some browsers (mobile safari/chrome) need a small delay for 
      // the DOM layout to settle before coordinate mapping is reliable
      const timer = setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 100);
      return () => clearTimeout(timer);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [controls]);

  return (
    <div className="w-full h-full relative">
      <Canvas>
        <GlobalSceneUpdates />
        {/* Epic Ambient Sky Sphere */}
        <mesh geometry={skySphereGeo} material={skySphereMat} />
        
        {/* Background Animated Elements */}
        <BackgroundElements />

        <PerspectiveCamera 
          makeDefault 
          position={[60, 64, 60]} 
          fov={18} 
          near={0.1} 
          far={3000} 
          onUpdate={(c) => {
            if (c instanceof THREE.PerspectiveCamera) {
              const horizontalFov = 18;
              const aspect = c.aspect;
              if (aspect < 1) {
                if (Math.abs(c.fov - horizontalFov) > 0.01) {
                  c.fov = horizontalFov;
                  c.updateProjectionMatrix();
                }
              } else {
                const targetFov = (2 * Math.atan(Math.tan((horizontalFov * Math.PI) / 360) / aspect) * 180) / Math.PI;
                if (Math.abs(c.fov - targetFov) > 0.01) {
                  c.fov = targetFov;
                  c.updateProjectionMatrix();
                }
              }
            }
          }}
        />
        <OrbitControls 
          ref={(inst) => {
            setControls(inst);
            if (inst) {
              // Standard OrbitControls has internal key listeners, disable them
              (inst as any).enableKeys = false;
            }
          }}
          enableRotate={true} 
          minPolarAngle={0.01}
          maxPolarAngle={Math.PI / 2 - 0.15}
          enableDamping 
          dampingFactor={0.05} 
          minDistance={10} 
          maxDistance={150} 
          target={[0, 0, 0]}
          screenSpacePanning={false}
          mouseButtons={{
            LEFT: THREE.MOUSE.PAN,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.ROTATE
          }}
        />
        <CameraRotationTicker controls={controls} rotationActive={rotationActive} />
        
        <ambientLight intensity={0.4} />
        <SunLight />

        <group position={[0, 0, 0]}>
        {/* Render Board Bases (Instanced) */}
        <MapBasesInstanced 
          board={gameState.board} 
          selectedHex={gameState.selectedHex}
          hoveredHex={hoveredHex}
          onClick={handleHexClick} 
        />

        {/* Render Board Features (Instanced) */}
        <FeaturesInstanced board={gameState.board} />

        {/* Render Board */}
        {gameState.board.map((tile) => {
          const coordKey = `${tile.coord.q},${tile.coord.r}`;
          const isSelected = gameState.selectedHex?.q === tile.coord.q && gameState.selectedHex?.r === tile.coord.r;
          const isHovered = hoveredHex?.q === tile.coord.q && hoveredHex?.r === tile.coord.r;
          const isPossibleMove = possibleMovesSet.has(coordKey);
          const isPossibleAttack = possibleAttacksSet.has(coordKey);
          const isAttackRange = attackRangeSet.has(coordKey);
          const isExtendedRange = isPossibleAttack && selectedUnit && getDistance(selectedUnit.coord, tile.coord, gameState.board) > UNIT_STATS[selectedUnit.type].range;
          const unitAtHex = unitsMap.get(coordKey);
          const evaluation = matrixMap.get(coordKey);
          
          let hasAdjacentSettlement = false;
          if (tile.terrain === TerrainType.WATER) {
            const neighbors = getNeighbors(tile.coord);
            hasAdjacentSettlement = neighbors.some(n => {
              const neighborTile = boardMap.get(`${n.q},${n.r}`);
              return neighborTile && (
                neighborTile.terrain === TerrainType.VILLAGE || neighborTile.terrain === TerrainType.FORTRESS || 
                neighborTile.terrain === TerrainType.CASTLE || neighborTile.terrain === TerrainType.GOLD_MINE
              );
            });
          }

          return (
            <HexTile3D
              key={`tile-${tile.coord.q}-${tile.coord.r}`}
              tile={tile}
              isSelected={isSelected}
              isHovered={isHovered}
              isPossibleMove={isPossibleMove}
              isPossibleAttack={isPossibleAttack}
              isAttackRange={isAttackRange}
              isExtendedRange={isExtendedRange}
              playerColor={tile.ownerId !== null ? gameState.players[tile.ownerId].color : '#000'}
              hasAdjacentSettlement={hasAdjacentSettlement}
              unitAtHex={unitAtHex}
              isCurrentPlayer={tile.ownerId === currentPlayer.id}
              evaluation={evaluation}
              onClick={handleHexClick}
              onPointerEnter={setHoveredHex}
              onPointerLeave={setHoveredHex}
            />
          );
        })}

        {/* Render Units */}
        {gameState.units.map((unit) => {
          const anim = animationsMap.get(unit.id);
          const displayCoord = anim?.type === 'move' && anim.to ? anim.to : unit.coord;
          const coordKey = `${displayCoord.q},${displayCoord.r}`;
          const tile = boardMap.get(coordKey);
          const isOnWater = tile?.terrain === TerrainType.WATER;
          const tileHeight = tile ? (TERRAIN_HEIGHTS[tile.terrain as TerrainType] || 0.4) : 0.4;
          
          const isAttackRange = attackRangeSet.has(`${unit.coord.q},${unit.coord.r}`);
          const isProhibitedTarget = isSelectedCatapult && tile?.terrain === TerrainType.FOREST && isAttackRange && unit.ownerId !== currentPlayer.id;

          return (
            <React.Fragment key={unit.id}>
              <AnimatedUnit3D
                unit={unit}
                playerColor={gameState.players[unit.ownerId].color}
                isSelected={gameState.selectedUnitId === unit.id}
                canMove={unit.ownerId === currentPlayer.id && unit.movesLeft > 0}
                anim={anim}
                isOnWater={isOnWater}
                tileHeight={tileHeight}
                isPossibleAttackTarget={possibleAttacksSet.has(`${unit.coord.q},${unit.coord.r}`)}
                isProhibitedTarget={isProhibitedTarget}
                onAnimationEnd={() => {
                  if (anim?.type === 'move') finalizeMove(unit.id, anim.to!);
                  if (anim?.type === 'attack') finalizeAttack(unit.id, anim.to!);
                }}
              />
              {/* Projectiles for ranged attacks */}
              {anim?.type === 'attack' && (unit.type === UnitType.CATAPULT || unit.type === UnitType.ARCHER) && (
                <Projectile3D 
                  from={{ x: hexToPixel(unit.coord.q, unit.coord.r).x, z: hexToPixel(unit.coord.q, unit.coord.r).y }}
                  to={{ x: hexToPixel(anim.to!.q, anim.to!.r).x, z: hexToPixel(anim.to!.q, anim.to!.r).y }}
                  type={unit.type === UnitType.CATAPULT ? 'boulder' : 'arrow'}
                />
              )}
            </React.Fragment>
          );
        })}

          {/* Damage Popups and Sparks */}
          {(gameState.animations || []).filter(a => a.type === 'damage' || a.type === 'miss').map(anim => {
            const { x, y: z } = hexToPixel(anim.to!.q, anim.to!.r);
            if (anim.type === 'miss') {
              return (
                <MissEffect3D 
                  key={anim.id} 
                  x={x} 
                  z={z} 
                  onComplete={() => clearAnimation(anim.id)} 
                />
              );
            }
            return (
              <group key={anim.id}>
                <Sparks3D x={x} z={z} />
                <SmokeEffect3D 
                  x={x} 
                  z={z} 
                  onComplete={() => clearAnimation(anim.id)}
                />
              </group>
            );
          })}
        </group>
      </Canvas>

      {/* Floating Camera Controls Overlay (refactored to separate component) */}
      <CameraControlsOverlay rotationActive={rotationActive} />
    </div>
  );
};
