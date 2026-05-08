import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { PerspectiveCamera, OrbitControls, Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { GameState, TerrainType, UnitType, HexCoord, hexToPixel, UNIT_ICONS, getNeighbors, getDistance, UNIT_STATS } from '../types';
import { TERRAIN_COLORS } from '../constants/colors';
import { Sparks3D, SmokeEffect3D, Projectile3D, MissEffect3D } from './Effects3D';
import { WaterBasesInstanced, updateWaterTime } from './WaterSurfaceEffect';
import { WaterfallsInstanced, updateWaterfallTime } from './WaterfallEffect';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';
import { 
  CastleFeature, 
  FortressFeature, 
  VillageFeature, 
  GoldMineFeature
} from './TerrainFeatures3D';
import { GEOMETRIES, MATERIALS, TERRAIN_HEIGHTS, getPulsatingOpacity } from '../services/graphicsLibrary';

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

// 3D Hex Tile
// PulsatingAttackIndicator removed - replaced by AttackIndicatorsInstanced

const AttackIndicatorsInstanced = React.memo(({ coords }: { coords: {q: number, r: number}[] }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  
  useEffect(() => {
    if (!meshRef.current || coords.length === 0) return;
    const dummy = new THREE.Object3D();
    coords.forEach((c, i) => {
      const { x, y: z } = hexToPixel(c.q, c.r);
      const height = 0.4; // Default/Max height for indicators
      dummy.position.set(x, height + 0.045, z);
      dummy.rotation.set(-Math.PI / 2, 0, Math.PI / 6);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [coords]);

  useFrame(({ clock }) => {
    if (!meshRef.current || coords.length === 0) return;
    const opacity = getPulsatingOpacity(clock.getElapsedTime());
    (meshRef.current.material as THREE.MeshBasicMaterial).opacity = opacity;
  });

  if (coords.length === 0) return null;

  return (
    <instancedMesh 
      ref={meshRef} 
      args={[GEOMETRIES.attackRange, MATERIALS.attackIndicator, coords.length]} 
      raycast={() => null}
    />
  );
});

const PossibleMovesInstanced = React.memo(({ moves, boardMap }: { moves: {q: number, r: number}[], boardMap: Map<string, any> }) => {
  const plainsMeshRef = useRef<THREE.InstancedMesh>(null);
  const forestMeshRef = useRef<THREE.InstancedMesh>(null);

  const plainsMoves = useMemo(() => moves.filter(m => boardMap.get(`${m.q},${m.r}`)?.terrain !== TerrainType.FOREST), [moves, boardMap]);
  const forestMoves = useMemo(() => moves.filter(m => boardMap.get(`${m.q},${m.r}`)?.terrain === TerrainType.FOREST), [moves, boardMap]);

  useEffect(() => {
    const dummy = new THREE.Object3D();
    if (plainsMeshRef.current) {
      plainsMoves.forEach((m, i) => {
        const { x, y: z } = hexToPixel(m.q, m.r);
        const tile = boardMap.get(`${m.q},${m.r}`);
        const height = TERRAIN_HEIGHTS[tile?.terrain as TerrainType] || 0.4;
        const elevation = [TerrainType.MOUNTAIN, TerrainType.GOLD_MINE].includes(tile?.terrain as any) ? 1.4 : 0.04;
        dummy.position.set(x, height + elevation, z);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.updateMatrix();
        plainsMeshRef.current!.setMatrixAt(i, dummy.matrix);
      });
      plainsMeshRef.current.instanceMatrix.needsUpdate = true;
    }
    if (forestMeshRef.current) {
      forestMoves.forEach((m, i) => {
        const { x, y: z } = hexToPixel(m.q, m.r);
        const height = TERRAIN_HEIGHTS[TerrainType.FOREST];
        dummy.position.set(x, height + 0.04, z);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.updateMatrix();
        forestMeshRef.current!.setMatrixAt(i, dummy.matrix);
      });
      forestMeshRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [plainsMoves, forestMoves, boardMap]);

  return (
    <group raycast={() => null}>
      {plainsMoves.length > 0 && <instancedMesh ref={plainsMeshRef} args={[GEOMETRIES.possibleMove, MATERIALS.possibleMove, plainsMoves.length]} raycast={() => null} />}
      {forestMoves.length > 0 && <instancedMesh ref={forestMeshRef} args={[GEOMETRIES.forestMove, MATERIALS.forestMove, forestMoves.length]} raycast={() => null} />}
    </group>
  );
});

// SettlementOwnershipInstanced removed in favor of direct base tile coloring
const StrategicIndicatorsInstanced = React.memo(({ analysis, board }: { analysis: any, board: any[] }) => {
  const oppMeshRef = useRef<THREE.InstancedMesh>(null);
  const threatMeshRef = useRef<THREE.InstancedMesh>(null);

  const entries = useMemo(() => {
    if (!analysis) return [];
    return board.map(t => {
      const key = `${t.coord.q},${t.coord.r}`;
      return {
        key,
        coord: t.coord,
        terrain: t.terrain,
        opp: analysis.opportunityMap[key] || 0,
        threat: analysis.threatMap[key]?.eminentThreatValue || 0
      };
    }).filter(e => e.opp > 0 || e.threat > 0);
  }, [analysis, board]);

  useEffect(() => {
    const dummy = new THREE.Object3D();
    const oppEntries = entries.filter(e => e.opp > 0);
    const threatEntries = entries.filter(e => e.threat > 0);

    if (oppMeshRef.current) {
      oppEntries.forEach((e, i) => {
        const { x, y: z } = hexToPixel(e.coord.q, e.coord.r);
        const height = TERRAIN_HEIGHTS[e.terrain as TerrainType] || 0.4;
        const radius = 0.014 * Math.sqrt(Math.min(1000, e.opp));
        dummy.position.set(x - 0.3, height + 0.1, z);
        dummy.scale.set(radius, radius, radius);
        dummy.updateMatrix();
        oppMeshRef.current!.setMatrixAt(i, dummy.matrix);
      });
      oppMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    if (threatMeshRef.current) {
      threatEntries.forEach((e, i) => {
        const { x, y: z } = hexToPixel(e.coord.q, e.coord.r);
        const height = TERRAIN_HEIGHTS[e.terrain as TerrainType] || 0.4;
        const radius = 0.014 * Math.sqrt(Math.min(1000, e.threat));
        dummy.position.set(x + 0.3, height + 0.1, z);
        dummy.scale.set(radius, radius, radius);
        dummy.updateMatrix();
        threatMeshRef.current!.setMatrixAt(i, dummy.matrix);
      });
      threatMeshRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [entries]);

  if (!analysis) return null;

  return (
    <group raycast={() => null}>
      <instancedMesh ref={oppMeshRef} args={[GEOMETRIES.sphere, MATERIALS.opportunity, entries.filter(e => e.opp > 0).length]} raycast={() => null} />
      <instancedMesh ref={threatMeshRef} args={[GEOMETRIES.sphere, MATERIALS.threat, entries.filter(e => e.threat > 0).length]} raycast={() => null} />
    </group>
  );
});

const MapBasesInstanced = React.memo(({ board, playerColors, selectedHex, hoveredHex, onClick, onPointerEnter }: { board: any[], playerColors: string[], selectedHex: HexCoord | null, hoveredHex: HexCoord | null, onClick: (q: number, r: number) => void, onPointerEnter?: (coord: HexCoord | null) => void }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const selectionAttrRef = useRef<THREE.InstancedBufferAttribute>(null);
  const hoverAttrRef = useRef<THREE.InstancedBufferAttribute>(null);
  const mountainAttrRef = useRef<THREE.InstancedBufferAttribute>(null);
  const settlementAttrRef = useRef<THREE.InstancedBufferAttribute>(null);
  
  // Only instance non-water tiles - stable layout
  const nonWaterTiles = useMemo(() => board.filter(t => t.terrain !== TerrainType.WATER), [board]);
  const selectionStates = useRef(new Float32Array(nonWaterTiles.length));
  const hoverStates = useRef(new Float32Array(nonWaterTiles.length));
  useMemo(() => {
    if (selectionStates.current.length !== nonWaterTiles.length) {
      selectionStates.current = new Float32Array(nonWaterTiles.length);
      hoverStates.current = new Float32Array(nonWaterTiles.length);
    }
  }, [nonWaterTiles.length]);
  
  // These attributes only need to update when board layout changes
  const mountainStates = useMemo(() => new Float32Array(nonWaterTiles.map(t => t.terrain === TerrainType.MOUNTAIN ? 1.0 : 0.0)), [nonWaterTiles]);
  // Note: settlement status can change if a village is upgraded, but the "cobblestone" look is the same
  const settlementStates = useMemo(() => new Float32Array(nonWaterTiles.map(t => 
    [TerrainType.VILLAGE, TerrainType.FORTRESS, TerrainType.CASTLE, TerrainType.GOLD_MINE].includes(t.terrain as any) ? 1.0 : 0.0
  )), [nonWaterTiles]);

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
        attribute float isMountain;
        attribute float isSettlement;
        varying float vSelection;
        varying float vHover;
        varying float vLocalY;
        varying float vIsMountain;
        varying float vIsSettlement;
        varying vec2 vUv;
        ${shader.vertexShader}
      `.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        vSelection = selection;
        vHover = hover;
        vIsMountain = isMountain;
        vIsSettlement = isSettlement;
        vLocalY = position.y;
        vUv = uv;
        `
      );
      
      shader.fragmentShader = `
        varying float vSelection;
        varying float vHover;
        varying float vLocalY;
        varying float vIsMountain;
        varying float vIsSettlement;
        varying vec2 vUv;
        
        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }

        ${shader.fragmentShader}
      `.replace(
        '#include <color_fragment>',
        `
        #include <color_fragment>
        
        // Bedrock gradient logic
        // Higher threshold for gradient transition (moved 25% up)
        float bedrockFade = smoothstep(-0.05, 0.55, vLocalY);
        
        // Further desaturated and refined grayish brown
        vec3 bedrockBase = vec3(0.1, 0.09, 0.08); 
        
        // Coarser bedrock texture scale (divided multipliers by 3 for 300% larger features)
        float streak = hash(vec2(floor(vUv.y * 21.3), 0.0));
        float blocks = hash(vec2(floor(vUv.x * 26.6), floor(vUv.y * 32.0)));
        
        float brightness = 0.7 + 0.4 * smoothstep(0.2, 0.8, streak);
        if (blocks > 0.92) brightness += 0.3;
        
        vec3 finalBedrock = bedrockBase * brightness;

        // Apply bedrock to sides, or entire tile if mountain
        if (vNormal.y < 0.5 || vIsMountain > 0.5) {
            diffuseColor.rgb = mix(finalBedrock, diffuseColor.rgb, bedrockFade * (1.0 - vIsMountain));
            if (vIsMountain > 0.5) {
               // Mountains are purely bedrock texture
               diffuseColor.rgb = finalBedrock;
            }
        }
        
        // Cobblestone overlay for settlements (top face only)
        if (vNormal.y > 0.5 && vIsSettlement > 0.5) {
            // Finer cobblestone texture (multiplied by 4 for 25% scale / 4x detail density)
            vec2 stoneUv = vUv * 24.0;
            vec2 id = floor(stoneUv);
            vec2 f = fract(stoneUv);
            float d = 1.0;
            for(int y=-1; y<=1; y++) {
                for(int x=-1; x<=1; x++) {
                    vec2 g = vec2(float(x), float(y));
                    vec2 o = vec2(hash(id+g), hash(id+g+vec2(0.123, 0.456)));
                    vec2 r = g + o - f;
                    d = min(d, dot(r, r));
                }
            }
            float stone = smoothstep(0.0, 0.1, sqrt(d));
            float var = hash(id) * 0.1;
            vec3 stoneColor = diffuseColor.rgb + vec3(var - 0.05);
            diffuseColor.rgb = mix(diffuseColor.rgb * 0.7, stoneColor, stone);
        }

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
      
      let baseColor = TERRAIN_COLORS[tile.terrain as TerrainType];
      // Graphics update: settlements show owner color on the base tile
      if (tile.ownerId !== null && [TerrainType.VILLAGE, TerrainType.FORTRESS, TerrainType.CASTLE, TerrainType.GOLD_MINE].includes(tile.terrain as any)) {
        baseColor = playerColors[tile.ownerId];
      }

      dummy.scale.set(1, totalHeight, 1);
      dummy.position.set(x, height - totalHeight / 2, z);
      
      // Random rotation in 60 degree increments
      const rotationIndex = Math.floor(Math.abs(Math.sin(tile.coord.q * 123 + tile.coord.r * 456) * 100)) % 6;
      dummy.rotation.y = rotationIndex * (Math.PI / 3);
      
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);

      color.set(baseColor);
      meshRef.current!.setColorAt(i, color);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [nonWaterTiles]);

  // Separate effect for colors which can change when settlements are claimed/upgraded
  useEffect(() => {
    if (!meshRef.current) return;
    const color = new THREE.Color();
    
    // Create a lookup map for faster processing (O(N) instead of O(N^2))
    const currentBoardMap = new Map<string, any>();
    board.forEach(t => currentBoardMap.set(`${t.coord.q},${t.coord.r}`, t));

    nonWaterTiles.forEach((tile, i) => {
      const effectiveTile = currentBoardMap.get(`${tile.coord.q},${tile.coord.r}`) || tile;

      let baseColor = TERRAIN_COLORS[effectiveTile.terrain as TerrainType];
      if (effectiveTile.ownerId !== null && [TerrainType.VILLAGE, TerrainType.FORTRESS, TerrainType.CASTLE, TerrainType.GOLD_MINE].includes(effectiveTile.terrain as any)) {
        baseColor = playerColors[effectiveTile.ownerId];
      }
      color.set(baseColor);
      meshRef.current!.setColorAt(i, color);
    });
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  }, [board, playerColors]); // Depend on full board to catch upgrades

  const lastSelectedHex = useRef<HexCoord | null>(null);
  const lastHoveredHex = useRef<HexCoord | null>(null);
  const isTransitioning = useRef(false);

  useFrame((_state, delta) => {
    if (!meshRef.current || !selectionAttrRef.current || !hoverAttrRef.current) return;
    
    const hexChanged = lastSelectedHex.current?.q !== selectedHex?.q || lastSelectedHex.current?.r !== selectedHex?.r ||
                       lastHoveredHex.current?.q !== hoveredHex?.q || lastHoveredHex.current?.r !== hoveredHex?.r;

    if (hexChanged) {
      lastSelectedHex.current = selectedHex;
      lastHoveredHex.current = hoveredHex;
      isTransitioning.current = true;
    }

    if (!isTransitioning.current) return;

    let needsUpdate = false;
    let anyStillMoving = false;

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
        anyStillMoving = true;
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
        anyStillMoving = true;
      }
    });

    isTransitioning.current = anyStillMoving;

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
        const instanceId = e.instanceId;
        if (instanceId !== undefined && nonWaterTiles[instanceId]) {
          const tile = nonWaterTiles[instanceId];
          onClick(tile.coord.q, tile.coord.r);
        }
      }}
      onPointerMove={(e) => {
        const instanceId = e.instanceId;
        if (instanceId !== undefined && nonWaterTiles[instanceId]) {
          onPointerEnter?.(nonWaterTiles[instanceId].coord);
        }
      }}
      onPointerOut={() => {
         onPointerEnter?.(null);
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
      <instancedBufferAttribute 
        ref={mountainAttrRef}
        attach="geometry-attributes-isMountain"
        args={[mountainStates, 1]}
      />
      <instancedBufferAttribute 
        ref={settlementAttrRef}
        attach="geometry-attributes-isSettlement"
        args={[settlementStates, 1]}
      />
    </instancedMesh>
  );
});

// 3D Unit
const AnimatedUnit3D = React.memo(({ unit, playerColor, isSelected, anim, onAnimationEnd, isOnWater, tileHeight, canMove, isPossibleAttackTarget, isProhibitedTarget }: any) => {
  const { x, y: z } = hexToPixel(unit.coord.q, unit.coord.r);
  const baseHeight = tileHeight + 0.1;

  const groupRef = useRef<THREE.Group>(null);
  const animTimeRef = useRef(0);
  const animDoneRef = useRef(false);
  const lastAnimRef = useRef<string | null>(null);

  const targetX = useMemo(() => anim?.to ? hexToPixel(anim.to.q, anim.to.r).x : x, [anim?.to, x]);
  const targetZ = useMemo(() => anim?.to ? hexToPixel(anim.to.q, anim.to.r).y : z, [anim?.to, z]);

  // Sync state when anim changes
  if (anim && lastAnimRef.current !== anim.id) {
    animTimeRef.current = 0;
    animDoneRef.current = false;
    lastAnimRef.current = anim.id;
  } else if (!anim && lastAnimRef.current !== null) {
    lastAnimRef.current = null;
  }

  // Use useEffect to firmly snap position when animation state clears
  useEffect(() => {
    if (!anim && groupRef.current) {
      groupRef.current.position.set(x, baseHeight, z);
    }
  }, [anim, x, z, baseHeight]);

  useFrame((_state, delta) => {
    if (!groupRef.current) return;

    if (anim) {
      animTimeRef.current += delta;
      const duration = 0.4;
      const progress = Math.min(animTimeRef.current / duration, 1);
      const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      if (anim.type === 'move') {
        groupRef.current.position.x = THREE.MathUtils.lerp(x, targetX, ease);
        groupRef.current.position.z = THREE.MathUtils.lerp(z, targetZ, ease);
        groupRef.current.position.y = baseHeight + Math.sin(progress * Math.PI) * 1.0;
      } else if (anim.type === 'attack') {
        if (unit.type === UnitType.CATAPULT || unit.type === UnitType.ARCHER) {
          groupRef.current.position.y = baseHeight + Math.sin(progress * Math.PI) * 0.5;
        } else {
          const bumpProgress = progress < 0.5 ? progress * 2 : (1 - progress) * 2;
          const bumpEase = bumpProgress < 0.5 ? 2 * bumpProgress * bumpProgress : 1 - Math.pow(-2 * bumpProgress + 2, 2) / 2;
          groupRef.current.position.x = THREE.MathUtils.lerp(x, (x + targetX) / 2, bumpEase);
          groupRef.current.position.z = THREE.MathUtils.lerp(z, (z + targetZ) / 2, bumpEase);
          groupRef.current.position.y = baseHeight;
        }
      }

      if (progress >= 1) {
        groupRef.current.position.x = targetX;
        groupRef.current.position.z = targetZ;
        groupRef.current.position.y = baseHeight;

        if (!animDoneRef.current) {
          animDoneRef.current = true;
          setTimeout(onAnimationEnd, 0);
        }
      }
    } else {
      // Firmly stay at current grid position
      groupRef.current.position.x = x;
      groupRef.current.position.z = z;
      groupRef.current.position.y = baseHeight;
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
        geometry={GEOMETRIES.unitCone} 
        material={MATERIALS.getPlayer(playerColor)} 
        raycast={() => null}
      />

      {/* Unit Body */}
      <Billboard position={[0, 0.6, 0]} raycast={() => null}>
        {unit.type === UnitType.INFANTRY && (
          <mesh position={[0, 0.4, 0]} geometry={GEOMETRIES.infantry} material={MATERIALS.getPlayer(playerColor)} raycast={() => null} />
        )}
        {unit.type === UnitType.ARCHER && (
          <mesh position={[0, 0.5, 0]} geometry={GEOMETRIES.archer} material={MATERIALS.getPlayer(playerColor)} raycast={() => null} />
        )}
        {unit.type === UnitType.KNIGHT && (
          <group position={[0, 0.4, 0]}>
            <mesh rotation={[Math.PI/2, 0, 0]} geometry={GEOMETRIES.knightBody} material={MATERIALS.getPlayer(playerColor)} raycast={() => null} />
            <mesh position={[0, 0.4, 0.3]} geometry={GEOMETRIES.knightHead} material={MATERIALS.getPlayer(playerColor)} raycast={() => null} />
          </group>
        )}
        {unit.type === UnitType.CATAPULT && (
          <group position={[0, 0.3, 0]}>
            <mesh position={[0, 0, 0]} geometry={GEOMETRIES.catapultBase} material={MATERIALS.getPlayer(playerColor)} raycast={() => null} />
            <mesh position={[0, 0.4, 0.2]} rotation={[Math.PI/4, 0, 0]} geometry={GEOMETRIES.catapultArm} material={MATERIALS.getPlayer(playerColor)} raycast={() => null} />
          </group>
        )}
      </Billboard>

      {/* Icon */}
      <Billboard position={[0, 1.8, 0]} raycast={() => null}>
        {isOnWater && (
          <Text position={[-0.5, 0, 0]} fontSize={0.6} color="black" raycast={() => null}>
            🛶
          </Text>
        )}
        <Text 
          position={[0, 0, 0]} 
          fontSize={0.8} 
          color={isOnWater ? "black" : "white"} 
          outlineWidth={0.05} 
          outlineColor={isOnWater ? "white" : "black"}
          raycast={() => null}
        >
          {UNIT_ICONS[unit.type as UnitType]}
        </Text>
      </Billboard>

      {/* Action Dot */}
      {canMove && !isSelected && (
        <mesh position={[0, 2.3, 0]} geometry={GEOMETRIES.actionDot} material={MATERIALS.actionDot} raycast={() => null} />
      )}

      {/* Attack Target Indicator */}
      {isPossibleAttackTarget && (
        <mesh 
          position={[0, 0.5, 0]} 
          geometry={GEOMETRIES.attackTarget}
          material={MATERIALS.attackTarget}
          raycast={() => null}
        />
      )}

      {/* Prohibited Target Indicator (Catapult vs Forest) */}
      {isProhibitedTarget && (
        <Billboard position={[0, 2.3, 0]}>
          <Text fontSize={0.8} color="#ef4444" outlineWidth={0.05} outlineColor="black" raycast={() => null}>
            🚫
          </Text>
        </Billboard>
      )}
    </group>
  );
});

const FeaturesInstanced = React.memo(({ board }: { board: any[] }) => {
  // More stable filtering for terrain features that don't change type in this game
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
      forestRefs[0].current.raycast = () => null;
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
      forestRefs[1].current.raycast = () => null;
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
      forestRefs[2].current.raycast = () => null;
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
      mountainRef.current.raycast = () => null;
    }
  }, [forests, mountains]);

  return (
    <group>
      {forests.length > 0 && (
        <>
          <instancedMesh ref={forestRefs[0]} args={[GEOMETRIES.forestCone1, MATERIALS.forest, forests.length]} raycast={() => null} />
          <instancedMesh ref={forestRefs[1]} args={[GEOMETRIES.forestCone2, MATERIALS.forest, forests.length]} raycast={() => null} />
          <instancedMesh ref={forestRefs[2]} args={[GEOMETRIES.forestCone3, MATERIALS.forest, forests.length]} raycast={() => null} />
        </>
      )}
      {mountains.length > 0 && (
        <instancedMesh ref={mountainRef} args={[GEOMETRIES.mountainCone1, MATERIALS.mountain, mountains.length]} raycast={() => null} />
      )}
    </group>
  );
});

const SkySphere = React.memo(() => {
  useFrame(({ clock }) => {
    if (MATERIALS.sky.uniforms.uTime) {
      MATERIALS.sky.uniforms.uTime.value = clock.getElapsedTime();
    }
  });
  return <mesh geometry={GEOMETRIES.skySphere} material={MATERIALS.sky} raycast={() => null} />;
});

const BIRD_BODY_GEO = new THREE.BoxGeometry(0.1, 0.05, 0.3);
const BIRD_WING_GEO = new THREE.BoxGeometry(0.4, 0.01, 0.15);
const BAT_BODY_GEO = new THREE.BoxGeometry(0.15, 0.1, 0.3);
const BAT_WING_GEO = new THREE.BoxGeometry(0.6, 0.01, 0.25);

const FlightShader = {
  vertexShader: `
    attribute vec4 instanceData; // x: radius, y: posY, z: speed, w: offset
    attribute float instanceType; // 0 for bird, 1 for bat
    uniform float uTime;
    varying vec2 vUv;
    varying float vType;
    
    void main() {
      vUv = uv;
      vType = instanceType;
      
      float t = uTime * instanceData.z + instanceData.w;
      vec3 pos = position;
      
      // Size reduction (0.5 scale from previous JS)
      pos *= 0.5;

      // Roll around central Z axis (reduced for requested horizontal orientation)
      // 0.5236 rad = 30 degrees (was 1.0472 / 60 deg)
      float r = 0.5236; 
      if (instanceType <= 0.5) r += 3.14159; // upside down white birds
      float cr = cos(r);
      float sr = sin(r);
      mat2 mRoll = mat2(cr, -sr, sr, cr);
      pos.xy = mRoll * pos.xy;
      
      // Face flight direction (tangent of circular path + 180 correction)
      float angle = t + 1.5708 + 3.14159; 
      float c = cos(angle);
      float s = sin(angle);
      mat2 rot = mat2(c, -s, s, c);
      
      vec2 rotatedPos = rot * pos.xz;
      pos.xz = rotatedPos;
      
      vec3 worldOffset = vec3(cos(t) * instanceData.x, instanceData.y + sin(uTime * 2.0) * 0.5, sin(t) * instanceData.x);
      
      vec4 mvPosition = modelViewMatrix * vec4(pos + worldOffset, 1.0);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    varying vec2 vUv;
    varying float vType;
    uniform vec3 colorBird;
    uniform vec3 colorBat;
    
    void main() {
      vec3 color = vType > 0.5 ? colorBat : colorBird;
      gl_FragColor = vec4(color, 1.0);
    }
  `
};

// Refined Wing Shader to handle flapping
const WingShader = {
  vertexShader: `
    attribute vec4 instanceData; // x: radius, y: posY, z: speed, w: offset
    attribute float side; // 1 for left, -1 for right
    attribute float instanceType; 
    uniform float uTime;
    varying float vType;
    
    void main() {
      vType = instanceType;
      float t = uTime * instanceData.z + instanceData.w;
      vec3 pos = position;
      pos *= 0.5;
       float flapFreq = instanceType > 0.5 ? 18.0 : 12.0;
      float flapAmp = instanceType > 0.5 ? 0.9 : 0.6;
      float flap = sin(uTime * flapFreq + instanceData.w * 10.0) * flapAmp;
      
      // Pivot offset: move wing so its edge is at the origin before rotation
      float halfWidth = instanceType > 0.5 ? 0.15 : 0.1;
      float bodyHalfWidth = instanceType > 0.5 ? 0.0375 : 0.025;
      
      // Move wing hinge to Origin
      pos.x += halfWidth; 
      
      // Flap rotation around Z axis + Open Spread Offset (0.4 rad approx 23 deg)
      float openOffset = 0.4;
      float angleZ = flap + openOffset;
      float cz = cos(angleZ);
      float sz = sin(angleZ);
      mat2 rotZ = mat2(cz, -sz, sz, cz);
      pos.xy = rotZ * pos.xy; 
      
      // Mirror and Shift to side of body
      pos.x *= side;
      pos.x += side * bodyHalfWidth;

      // Apply the same roll as body
      float r = 0.5236; 
      if (instanceType <= 0.5) r += 3.14159; // upside down white birds
      float cr = cos(r);
      float sr = sin(r);
      mat2 mRoll = mat2(cr, -sr, sr, cr);
      pos.xy = mRoll * pos.xy;

      // Face flight direction (tangent + 180 correction)
      float angleY = t + 1.5708 + 3.14159; 
      float cy = cos(angleY);
      float sy = sin(angleY);
      mat2 rotY = mat2(cy, -sy, sy, cy);
      vec2 rotatedXZ = rotY * pos.xz;
      pos.xz = rotatedXZ;

      vec3 worldOffset = vec3(cos(t) * instanceData.x, instanceData.y + sin(uTime * 2.0) * 0.5, sin(t) * instanceData.x);
      
      vec4 mvPosition = modelViewMatrix * vec4(pos + worldOffset, 1.0);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    uniform vec3 colorBird;
    uniform vec3 colorBat;
    varying float vType;
    void main() {
      vec3 color = vType > 0.5 ? colorBat : colorBird;
      gl_FragColor = vec4(color, 1.0);
    }
  `
};

const BackgroundElements = React.memo(() => {
  const birdCount = 5;
  const batCount = 3;

  const birdData = useMemo(() => {
    const data = new Float32Array(birdCount * 4);
    for (let i = 0; i < birdCount; i++) {
       data[i * 4 + 0] = 24 + Math.random() * 24; // radius
       data[i * 4 + 1] = 10 + Math.random() * 5;  // y
       data[i * 4 + 2] = 0.0375 + Math.random() * 0.05; // speed
       data[i * 4 + 3] = Math.random() * Math.PI * 2; // offset
    }
    return data;
  }, []);

  const batData = useMemo(() => {
    const data = new Float32Array(batCount * 4);
    for (let i = 0; i < batCount; i++) {
      data[i * 4 + 0] = 19.2 + Math.random() * 19.2;
      data[i * 4 + 1] = 12 + Math.random() * 6;
      data[i * 4 + 2] = -0.1 - Math.random() * 0.125;
      data[i * 4 + 3] = Math.random() * Math.PI * 2;
    }
    return data;
  }, []);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    colorBird: { value: new THREE.Color("white") },
    colorBat: { value: new THREE.Color("#2a0505") }
  }), []);

  const batWingUniforms = useMemo(() => ({
    uTime: { value: 0 },
    colorBird: { value: new THREE.Color("white") },
    colorBat: { value: new THREE.Color("#450a0a") } 
  }), []);

  const birdWingData = useMemo(() => {
    const data = new Float32Array(birdCount * 2 * 4);
    for (let i = 0; i < birdCount; i++) {
       const base = i * 4;
       const targetA = i * 2 * 4;
       const targetB = (i * 2 + 1) * 4;
       for(let j=0; j<4; j++) {
         data[targetA + j] = birdData[base + j];
         data[targetB + j] = birdData[base + j];
       }
    }
    return data;
  }, [birdData]);

  const batWingData = useMemo(() => {
    const data = new Float32Array(batCount * 2 * 4);
    for (let i = 0; i < batCount; i++) {
       const base = i * 4;
       const targetA = i * 2 * 4;
       const targetB = (i * 2 + 1) * 4;
       for(let j=0; j<4; j++) {
         data[targetA + j] = batData[base + j];
         data[targetB + j] = batData[base + j];
       }
    }
    return data;
  }, [batData]);

  const birdWingSideData = useMemo(() => {
    const data = new Float32Array(birdCount * 2);
    for(let i=0; i<birdCount; i++) {
      data[i*2] = 1;      // Right
      data[i*2 + 1] = -1; // Left
    }
    return data;
  }, [birdCount]);

  const batWingSideData = useMemo(() => {
    const data = new Float32Array(batCount * 2);
    for(let i=0; i<batCount; i++) {
      data[i*2] = 1;
      data[i*2 + 1] = -1;
    }
    return data;
  }, [batCount]);

  const birdWingTypeData = useMemo(() => new Float32Array(birdCount * 2).fill(0), [birdCount]);
  const batWingTypeData = useMemo(() => new Float32Array(batCount * 2).fill(1), [batCount]);

  const birdTypeData = useMemo(() => new Float32Array(birdCount).fill(0), [birdCount]);
  const batTypeData = useMemo(() => new Float32Array(batCount).fill(1), [batCount]);

  return (
    <group>
      <EnvironmentalManager birdUniforms={uniforms} batWingUniforms={batWingUniforms} />
      {/* BIRDS */}
      <instancedMesh args={[BIRD_BODY_GEO, null, birdCount]} raycast={() => null}>
        <shaderMaterial attach="material" {...FlightShader} uniforms={uniforms} />
        <instancedBufferAttribute attach="geometry-attributes-instanceData" args={[birdData, 4]} />
        <instancedBufferAttribute attach="geometry-attributes-instanceType" args={[birdTypeData, 1]} />
      </instancedMesh>
      <instancedMesh args={[BIRD_WING_GEO, null, birdCount * 2]} raycast={() => null}>
        <shaderMaterial attach="material" {...WingShader} uniforms={uniforms} />
        <instancedBufferAttribute attach="geometry-attributes-instanceData" args={[birdWingData, 4]} />
        <instancedBufferAttribute attach="geometry-attributes-side" args={[birdWingSideData, 1]} />
        <instancedBufferAttribute attach="geometry-attributes-instanceType" args={[birdWingTypeData, 1]} />
      </instancedMesh>
 
      {/* BATS */}
      <instancedMesh args={[BAT_BODY_GEO, null, batCount]} raycast={() => null}>
        <shaderMaterial attach="material" {...FlightShader} uniforms={uniforms} />
        <instancedBufferAttribute attach="geometry-attributes-instanceData" args={[batData, 4]} />
        <instancedBufferAttribute attach="geometry-attributes-instanceType" args={[batTypeData, 1]} />
      </instancedMesh>
      <instancedMesh args={[BAT_WING_GEO, null, batCount * 2]} raycast={() => null}>
        <shaderMaterial attach="material" {...WingShader} uniforms={batWingUniforms} />
        <instancedBufferAttribute attach="geometry-attributes-instanceData" args={[batWingData, 4]} />
        <instancedBufferAttribute attach="geometry-attributes-side" args={[batWingSideData, 1]} />
        <instancedBufferAttribute attach="geometry-attributes-instanceType" args={[batWingTypeData, 1]} />
      </instancedMesh>
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
        onPointerDown={() => { 
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
          onPointerDown={() => { 
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
          onPointerDown={() => { 
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
          onPointerDown={() => { 
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

const RecruitHint = React.memo(({ q, r, boardMap, unitsMap, currentPlayerId, playerColor }: { q: number, r: number, boardMap: Map<string, any>, unitsMap: Map<string, any>, currentPlayerId: number, playerColor: string }) => {
  const tile = boardMap.get(`${q},${r}`);
  if (!tile) return null;
  
  const isEligible = !unitsMap.has(`${q},${r}`) && 
                    tile.ownerId === currentPlayerId && 
                    (tile.terrain === TerrainType.CASTLE || tile.terrain === TerrainType.VILLAGE);
  
  if (!isEligible) return null;
  
  const height = TERRAIN_HEIGHTS[tile.terrain as TerrainType] || 0.4;
  const { x, y: z } = hexToPixel(q, r);

  return (
    <Billboard position={[x, height + 0.5, z]} raycast={() => null}>
      <Text fontSize={0.5} color="white" outlineWidth={0.05} outlineColor="black" raycast={() => null}>
        ⊕
      </Text>
    </Billboard>
  );
});

const RecruitmentLayer = React.memo(({ recruitmentCoords, boardMap, unitsMap, currentPlayerId, playerColor }: { recruitmentCoords: HexCoord[], boardMap: Map<string, any>, unitsMap: Map<string, any>, currentPlayerId: number, playerColor: string }) => {
  return (
    <group>
      {recruitmentCoords.map((coord) => (
        <RecruitHint 
          key={`recruit-${coord.q}-${coord.r}`}
          q={coord.q}
          r={coord.r}
          boardMap={boardMap}
          unitsMap={unitsMap}
          currentPlayerId={currentPlayerId}
          playerColor={playerColor}
        />
      ))}
    </group>
  );
});

const SettlementFeature = React.memo(({ q, r, boardMap, playerColors }: { q: number, r: number, boardMap: Map<string, any>, playerColors: string[] }) => {
  const tile = boardMap.get(`${q},${r}`);
  if (!tile) return null;
  
  const terrain = tile.terrain;
  const ownerId = tile.ownerId;
  const playerColor = ownerId !== null ? playerColors[ownerId] : '#000';
  
  const { x, y: z } = useMemo(() => hexToPixel(q, r), [q, r]);
  const height = TERRAIN_HEIGHTS[terrain] || 0.4;
  
  return (
    <>
      {terrain === TerrainType.CASTLE && <CastleFeature position={[x, height, z]} playerColor={playerColor} />}
      {terrain === TerrainType.FORTRESS && <FortressFeature position={[x, height, z]} playerColor={playerColor} />}
      {terrain === TerrainType.VILLAGE && <VillageFeature position={[x, height, z]} playerColor={playerColor} isClaimed={ownerId !== null} />}
      {terrain === TerrainType.GOLD_MINE && <GoldMineFeature position={[x, height, z]} />}
    </>
  );
});

const SettlementsLayer = React.memo(({ settlementCoords, boardMap, playerColors }: { settlementCoords: HexCoord[], boardMap: Map<string, any>, playerColors: string[] }) => {
  return (
    <group raycast={() => null}>
      {settlementCoords.map((coord) => (
        <SettlementFeature 
          key={`settlement-${coord.q}-${coord.r}`} 
          q={coord.q}
          r={coord.r}
          boardMap={boardMap}
          playerColors={playerColors} 
        />
      ))}
    </group>
  );
});

const OverlaysLayer = React.memo(({ 
  board, 
  hoveredHex, 
  possibleAttacksSet, 
  selectedUnit, 
  gameState, 
  showStrategicView, 
  hasAdjacentSettlementMap 
}: any) => {
  const overlays = useMemo(() => {
    return board.filter(t => {
      const coordKey = `${t.coord.q},${t.coord.r}`;
      const isHovered = hoveredHex?.q === t.coord.q && hoveredHex?.r === t.coord.r;
      const isPossibleAttack = possibleAttacksSet.has(coordKey);
      
      const hasBoat = t.terrain === TerrainType.WATER && hasAdjacentSettlementMap.get(coordKey);
      const isExtendedRange = isPossibleAttack && selectedUnit && getDistance(selectedUnit.coord, t.coord) > UNIT_STATS[selectedUnit.type].range;
      const hasStrategicInfo = showStrategicView && isHovered && (gameState.strategicAnalysis.opportunityMap[coordKey] > 0 || (gameState.strategicAnalysis.threatMap[coordKey]?.eminentThreatValue || 0) > 0);
      
      return hasBoat || isExtendedRange || hasStrategicInfo;
    });
  }, [board, hoveredHex, possibleAttacksSet, selectedUnit, showStrategicView, gameState.strategicAnalysis, hasAdjacentSettlementMap]);

  return (
    <group>
      {overlays.map((tile) => {
        const coordKey = `${tile.coord.q},${tile.coord.r}`;
        const isHovered = hoveredHex?.q === tile.coord.q && hoveredHex?.r === tile.coord.r;
        const isPossibleAttack = possibleAttacksSet.has(coordKey);
        const isExtendedRange = isPossibleAttack && selectedUnit && getDistance(selectedUnit.coord, tile.coord) > UNIT_STATS[selectedUnit.type].range;
        
        const height = TERRAIN_HEIGHTS[tile.terrain as TerrainType] || 0.4;
        const { x, y: z } = hexToPixel(tile.coord.q, tile.coord.r);

        return (
          <group key={`overlays-${tile.coord.q}-${tile.coord.r}`} raycast={() => null}>
            {tile.terrain === TerrainType.WATER && hasAdjacentSettlementMap.get(coordKey) && (
              <Billboard position={[x, height + 0.35, z]} raycast={() => null}>
                <Text fontSize={0.6} color="black" raycast={() => null}>⛵</Text>
              </Billboard>
            )}
            {isExtendedRange && (
              <Billboard position={[x, height + 0.8, z]} raycast={() => null}>
                <Text fontSize={0.8} color="#ef4444" outlineWidth={0.05} outlineColor="black" fontWeight="bold" raycast={() => null}>+</Text>
              </Billboard>
            )}
            {showStrategicView && isHovered && (gameState.strategicAnalysis.opportunityMap[coordKey] > 0 || (gameState.strategicAnalysis.threatMap[coordKey]?.eminentThreatValue || 0) > 0) && (
              <Billboard position={[x, height + 1.5, z]} raycast={() => null}>
                <Text fontSize={0.5} color="white" outlineWidth={0.02} outlineColor="black" maxWidth={3} textAlign="center" raycast={() => null}>
                  {`${gameState.strategicAnalysis.opportunityMap[coordKey] > 0 ? 'Opportunity: ' + Math.round(gameState.strategicAnalysis.opportunityMap[coordKey]) : ''}
${gameState.strategicAnalysis.threatMap[coordKey]?.eminentThreatValue > 0 ? 'Peril: ' + Math.round(gameState.strategicAnalysis.threatMap[coordKey].eminentThreatValue) : ''}`}
                </Text>
              </Billboard>
            )}
          </group>
        );
      })}
    </group>
  );
});

const UnitsLayer = React.memo(({ 
  units, 
  playerColors, 
  selectedUnitId, 
  currentPlayerId, 
  animationsMap, 
  boardMap, 
  possibleAttacksSet, 
  attackRangeSet,
  isSelectedCatapult,
  onFinalizeMove,
  onFinalizeAttack
}: any) => {
  return (
    <group raycast={() => null}>
      {units.map((unit: any) => {
        const anim = animationsMap.get(unit.id);
        const displayCoord = anim?.type === 'move' && anim.to ? anim.to : unit.coord;
        const coordKey = `${displayCoord.q},${displayCoord.r}`;
        const tile = boardMap.get(coordKey);
        const isOnWater = tile?.terrain === TerrainType.WATER;
        const tileHeight = tile ? (TERRAIN_HEIGHTS[tile.terrain as TerrainType] || 0.4) : 0.4;
        
        const isAttackRange = attackRangeSet.has(`${unit.coord.q},${unit.coord.r}`);
        const isProhibitedTarget = isSelectedCatapult && tile?.terrain === TerrainType.FOREST && isAttackRange && unit.ownerId !== currentPlayerId;

        return (
          <React.Fragment key={unit.id}>
            <AnimatedUnit3D
              unit={unit}
              playerColor={playerColors[unit.ownerId]}
              isSelected={selectedUnitId === unit.id}
              canMove={unit.ownerId === currentPlayerId && unit.movesLeft > 0}
              anim={anim}
              isOnWater={isOnWater}
              tileHeight={tileHeight}
              isPossibleAttackTarget={possibleAttacksSet.has(`${unit.coord.q},${unit.coord.r}`)}
              isProhibitedTarget={isProhibitedTarget}
              onAnimationEnd={() => {
                if (anim?.type === 'move') onFinalizeMove(unit.id, anim.to!);
                if (anim?.type === 'attack') onFinalizeAttack(unit.id, anim.to!);
              }}
            />
            {anim?.type === 'attack' && (unit.type === UnitType.CATAPULT || unit.type === UnitType.ARCHER) && (
              <Projectile3D 
                from={{ x: hexToPixel(unit.coord.q, unit.coord.r).x, z: hexToPixel(unit.coord.q, unit.coord.r).y }}
                to={{ x: hexToPixel(anim.to!.q, anim.to!.r).x, z: hexToPixel(anim.to!.q, anim.to!.r).y }}
                type={unit.type === UnitType.CATAPULT ? 'boulder' : 'arrow'}
                raycast={() => null}
              />
            )}
          </React.Fragment>
        );
      })}
    </group>
  );
});

const EnvironmentalManager = React.memo(({ birdUniforms, batWingUniforms }: any) => {
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    updateWaterTime(t);
    updateWaterfallTime(t);
    if (birdUniforms) birdUniforms.uTime.value = t;
    if (batWingUniforms) batWingUniforms.uTime.value = t;
  });
  return null;
});

export const Game3D: React.FC<Game3DProps> = ({ gameState, hoveredHex, setHoveredHex, handleHexClick, finalizeMove, finalizeAttack, clearAnimation, showStrategicView }) => {
  const [controls, setControls] = useState<any>(null);
  const rotationActive = useRef({ left: false, right: false, up: false, down: false });
  
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const selectedUnit = gameState.units.find(u => u.id === gameState.selectedUnitId);
  const isSelectedCatapult = selectedUnit?.type === UnitType.CATAPULT;

  // Pre-calculate lookups for performance
  const possibleAttacksSet = useMemo(() => new Set(gameState.possibleAttacks.map(a => `${a.q},${a.r}`)), [gameState.possibleAttacks]);
  const attackRangeSet = useMemo(() => new Set(gameState.attackRange.map(r => `${r.q},${r.r}`)), [gameState.attackRange]);
  const playerColors = useMemo(() => {
    return (gameState.players || []).map(p => p.color);
  }, [JSON.stringify(gameState.players.map(p => p.color))]);

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
  
  const settlementCoords = useMemo(() => {
    return gameState.board
      .filter(t => [TerrainType.CASTLE, TerrainType.FORTRESS, TerrainType.VILLAGE, TerrainType.GOLD_MINE].includes(t.terrain as any))
      .map(t => t.coord);
  }, [gameState.board]); // Depend on full board to catch terrain changes from upgrades

  const recruitmentCoords = useMemo(() => {
    return gameState.board
      .filter(t => t.terrain === TerrainType.CASTLE || t.terrain === TerrainType.VILLAGE)
      .map(t => t.coord);
  }, [gameState.board]); // Depend on full board to catch terrain changes from upgrades

  const animationsMap = useMemo(() => {
    const map = new Map<string, any>();
    (gameState.animations || []).forEach(a => {
      if (a.unitId) map.set(a.unitId, a);
    });
    return map;
  }, [gameState.animations]);

  useEffect(() => {
    const handleResize = () => {
      if (controls) {
        // Force controls to sync with new camera state/aspect
        controls.update();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [controls]);

  const hasAdjacentSettlementMap = useMemo(() => {
    const map = new Map<string, boolean>();
    gameState.board.filter(t => t.terrain === TerrainType.WATER).forEach(tile => {
      const neighbors = getNeighbors(tile.coord);
      const hasAdj = neighbors.some(n => {
        const neighborTile = boardMap.get(`${n.q},${n.r}`);
        return neighborTile && (
          neighborTile.terrain === TerrainType.VILLAGE || neighborTile.terrain === TerrainType.FORTRESS || 
          neighborTile.terrain === TerrainType.CASTLE || neighborTile.terrain === TerrainType.GOLD_MINE
        );
      });
      map.set(`${tile.coord.q},${tile.coord.r}`, hasAdj);
    });
    return map;
  }, [gameState.board, boardMap]);

  return (
    <div className="w-full h-full relative">
      <Canvas>
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
              (inst as any).enableKeys = false;
            }
          }}
          enableRotate={true} 
          enablePan={true}
          panSpeed={1.0}
          rotateSpeed={1.0}
          minPolarAngle={0.01}
          maxPolarAngle={Math.PI / 2 - 0.15}
          enableDamping 
          dampingFactor={0.1} 
          minDistance={10} 
          maxDistance={300} 
          target={[0, 0, 0]}
          screenSpacePanning={true}
        />
        <CameraRotationTicker controls={controls} rotationActive={rotationActive} />
        
        <ambientLight intensity={0.4} />
        <SunLight />

        <group position={[0, 0, 0]}>
        {/* Render Board Bases (Instanced) */}
        <MapBasesInstanced 
          board={gameState.board} 
          playerColors={playerColors}
          selectedHex={gameState.selectedHex}
          hoveredHex={hoveredHex}
          onClick={handleHexClick} 
          onPointerEnter={setHoveredHex}
        />

        {/* Water Surface (Instanced for GPU Efficiency) */}
        <WaterBasesInstanced
          board={gameState.board}
          selectedHex={gameState.selectedHex}
          onClick={handleHexClick}
          onPointerEnter={setHoveredHex}
          onPointerLeave={() => setHoveredHex(null)}
        />

        {/* Waterfalls (Instanced) */}
        <WaterfallsInstanced board={gameState.board} />

        {/* Board Features and Infrastructure Layers */}
        <FeaturesInstanced board={gameState.board} />
        
        <SettlementsLayer 
          settlementCoords={settlementCoords}
          boardMap={boardMap} 
          playerColors={playerColors} 
        />

        <RecruitmentLayer 
          recruitmentCoords={recruitmentCoords}
          boardMap={boardMap} 
          unitsMap={unitsMap} 
          currentPlayerId={currentPlayer.id} 
          playerColor={currentPlayer.color}
        />

        {/* Global Attack Indicators */}
        <AttackIndicatorsInstanced 
          coords={gameState.attackRange}
        />

        {/* Possible Moves */}
        <PossibleMovesInstanced 
           moves={gameState.possibleMoves}
           boardMap={boardMap}
        />

        {/* Strategic Indicators */}
        <StrategicIndicatorsInstanced 
          analysis={showStrategicView ? gameState.strategicAnalysis : null}
          board={gameState.board}
        />

        {/* Overlay Objects (Isolated from interaction layer) */}
        <OverlaysLayer 
          board={gameState.board}
          hoveredHex={hoveredHex}
          possibleAttacksSet={possibleAttacksSet}
          selectedUnit={selectedUnit}
          gameState={gameState}
          showStrategicView={showStrategicView}
          hasAdjacentSettlementMap={hasAdjacentSettlementMap}
        />

        {/* Render Units */}
        <UnitsLayer 
          units={gameState.units}
          playerColors={playerColors}
          selectedUnitId={gameState.selectedUnitId}
          currentPlayerId={currentPlayer.id}
          animationsMap={animationsMap}
          boardMap={boardMap}
          possibleAttacksSet={possibleAttacksSet}
          attackRangeSet={attackRangeSet}
          isSelectedCatapult={isSelectedCatapult}
          onFinalizeMove={finalizeMove}
          onFinalizeAttack={finalizeAttack}
        />

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

        {/* Environmental (Moved to end for safer hit-testing) */}
        <SkySphere />
        <BackgroundElements />
      </Canvas>

      {/* Floating Camera Controls Overlay (refactored to separate component) */}
      <CameraControlsOverlay rotationActive={rotationActive} />
    </div>
  );
};
