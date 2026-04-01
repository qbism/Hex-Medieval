import React, { useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrthographicCamera, MapControls, Text, useCursor, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { GameState, TerrainType, UnitType, HexCoord, hexToPixel, UNIT_ICONS, getNeighbors, TERRAIN_COLORS } from '../types';
import { soundEngine } from '../services/soundEngine';

import { Sparks3D, SmokeEffect3D, Projectile3D, MissEffect3D } from './Effects3D';
import { WaterfallEffect } from './WaterfallEffect';
import { WaterSurfaceEffect } from './WaterSurfaceEffect';
import { 
  ForestFeature, 
  MountainFeature, 
  CastleFeature, 
  FortressFeature, 
  VillageFeature, 
  GoldMineFeature,
  getPlayerBasicMaterial
} from './TerrainFeatures3D';

interface Game3DProps {
  gameState: GameState;
  hoveredHex: HexCoord | null;
  setHoveredHex: (coord: HexCoord | null) => void;
  handleHexClick: (q: number, r: number) => void;
  finalizeMove: (unitId: string, target: HexCoord) => void;
  finalizeAttack: (unitId: string, target: HexCoord) => void;
  clearAnimation: (animId: string) => void;
}

const TERRAIN_HEIGHTS: Record<TerrainType, number> = {
  [TerrainType.WATER]: 0.2,
  [TerrainType.PLAINS]: 0.4,
  [TerrainType.FOREST]: 0.5,
  [TerrainType.MOUNTAIN]: 1.2,
  [TerrainType.VILLAGE]: 0.45,
  [TerrainType.FORTRESS]: 0.5,
  [TerrainType.CASTLE]: 0.6,
  [TerrainType.GOLD_MINE]: 1.2,
};

// Geometry and Material Caches for Memory Efficiency
const tileGeometries: Record<number, THREE.CylinderGeometry> = {};
const getTileGeometry = (height: number) => {
  if (!tileGeometries[height]) {
    tileGeometries[height] = new THREE.CylinderGeometry(0.92, 0.92, height, 6);
  }
  return tileGeometries[height];
};

const tileBorderGeometries: Record<number, THREE.CylinderGeometry> = {};
const getTileBorderGeometry = (height: number) => {
  if (!tileBorderGeometries[height]) {
    tileBorderGeometries[height] = new THREE.CylinderGeometry(0.97, 0.97, height - 0.02, 6);
  }
  return tileBorderGeometries[height];
};

const tileMaterials: Record<string, THREE.MeshStandardMaterial> = {};
const getTileMaterial = (color: string, isWater: boolean) => {
  const key = `${color}-${isWater}`;
  if (!tileMaterials[key]) {
    tileMaterials[key] = new THREE.MeshStandardMaterial({
      color,
      opacity: isWater ? 0.8 : 1,
      transparent: isWater
    });
  }
  return tileMaterials[key];
};

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
const unitBaseGeo1 = new THREE.CylinderGeometry(0.38, 0.38, 0.2, 16);
const unitBaseGeo2 = new THREE.CylinderGeometry(0.42, 0.42, 0.18, 16);
const unitBaseMat = new THREE.MeshStandardMaterial({ color: "white" });

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

// 3D Hex Tile
const PulsatingAttackIndicator = ({ height, geometry, active }: { height: number, geometry: THREE.BufferGeometry, active: boolean }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
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
    >
      <meshBasicMaterial color="#ef4444" transparent opacity={0.5} side={THREE.DoubleSide} />
    </mesh>
  );
};

const HexTile3D = React.memo(({ tile, isSelected, isHovered, isPossibleMove, _isPossibleAttack, isAttackRange, onClick, onPointerEnter, onPointerLeave, playerColor, hasAdjacentSettlement, unitAtHex, isCurrentPlayer }: any) => {
  const { x, y: z } = hexToPixel(tile.coord.q, tile.coord.r);
  const height = TERRAIN_HEIGHTS[tile.terrain as TerrainType] || 0.4;
  const depth = 2.0; // About the width of a tile
  const totalHeight = height + depth;
  const baseColor = TERRAIN_COLORS[tile.terrain as TerrainType];
  const isPerimeter = Math.max(Math.abs(tile.coord.q), Math.abs(tile.coord.r), Math.abs(-tile.coord.q - tile.coord.r)) === 10;
  
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

  const handleClick = (e: any) => {
    e.stopPropagation();
    onClick(tile.coord.q, tile.coord.r);
  };

  const isWater = tile.terrain === TerrainType.WATER;
  const borderColor = isSelected ? 'white' : (isHovered ? 'white' : playerColor);

  return (
    <group position={[x, 0, z]}>
      <mesh 
        position={[0, height - totalHeight / 2, 0]}
        onClick={handleClick}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        geometry={getTileGeometry(totalHeight)}
        material={getTileMaterial(baseColor, isWater)}
      >
        {/* Border using a simple mesh instead of Edges for performance */}
        {(isSelected || isHovered || tile.ownerId !== null) && (
          <mesh 
            position={[0, -0.01, 0]}
            geometry={getTileBorderGeometry(totalHeight)}
            material={getBorderMaterial(borderColor)}
          />
        )}
      </mesh>

      {/* Waterfall Effect for perimeter water tiles */}
      {isPerimeter && tile.terrain === TerrainType.WATER && (
        <WaterfallEffect topHeight={height} depth={depth} />
      )}

      {/* Water Surface Effect */}
      {tile.terrain === TerrainType.WATER && (
        <group position={[0, height, 0]}>
          <WaterSurfaceEffect radius={0.92} />
        </group>
      )}

      {/* Indicators */}
      {isAttackRange && (
        <PulsatingAttackIndicator height={height} geometry={attackRangeGeo} active={true} />
      )}
      {isPossibleMove && (
        <mesh 
          position={[0, height + 0.04, 0]} 
          rotation={[-Math.PI / 2, 0, 0]} 
          geometry={tile.terrain === TerrainType.FOREST ? forestMoveGeo : possibleMoveGeo} 
          material={tile.terrain === TerrainType.FOREST ? forestMoveMat : possibleMoveMat} 
        />
      )}

      {/* Ownership indicator for settlements */}
      {tile.ownerId !== null && (tile.terrain === TerrainType.VILLAGE || tile.terrain === TerrainType.FORTRESS || tile.terrain === TerrainType.CASTLE || tile.terrain === TerrainType.GOLD_MINE) && (
        <mesh position={[0, height + 0.02, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 6]} geometry={territoryRingGeo}>
          <meshBasicMaterial color={playerColor} side={THREE.DoubleSide} />
        </mesh>
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

      {/* Terrain Features */}
      {tile.terrain === TerrainType.FOREST && <ForestFeature position={[0, height, 0]} />}
      {tile.terrain === TerrainType.MOUNTAIN && <MountainFeature position={[0, height, 0]} />}
      {tile.terrain === TerrainType.CASTLE && <CastleFeature position={[0, height, 0]} playerColor={playerColor} />}
      {tile.terrain === TerrainType.FORTRESS && <FortressFeature position={[0, height, 0]} playerColor={playerColor} />}
      {tile.terrain === TerrainType.VILLAGE && <VillageFeature position={[0, height, 0]} playerColor={playerColor} isClaimed={tile.ownerId !== null} />}
      {tile.terrain === TerrainType.GOLD_MINE && <GoldMineFeature position={[0, height, 0]} />}
    </group>
  );
});

// 3D Unit
const AnimatedUnit3D = ({ unit, playerColor, isSelected, anim, onAnimationEnd, onClick, isOnWater, tileHeight, canMove, isPossibleAttackTarget, isProhibitedTarget }: any) => {
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
      if (anim.type === 'move') soundEngine.playMove();
      if (anim.type === 'attack') soundEngine.playAttack();
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
      onClick={(e: any) => { e.stopPropagation(); onClick(); }}
    >
      {/* Unit Base */}
      <mesh position={[0, 0.1, 0]} geometry={unitBaseGeo1} material={unitBaseMat}>
        <mesh position={[0, -0.01, 0]} geometry={unitBaseGeo2} material={isSelected ? unitBaseMat : getPlayerBasicMaterial(playerColor)} />
      </mesh>

      {/* Unit Body */}
      <Billboard position={[0, 0.2, 0]}>
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
      <Billboard position={[0, 1.5, 0]}>
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
        <mesh position={[0, 2.0, 0]} geometry={actionDotGeo} material={actionDotMat} />
      )}

      {/* Attack Target Indicator */}
      {isPossibleAttackTarget && (
        <mesh position={[0, 0.5, 0]} geometry={new THREE.SphereGeometry(0.8, 16, 16)}>
          <meshBasicMaterial color="#ef4444" transparent opacity={0.2} wireframe />
        </mesh>
      )}

      {/* Prohibited Target Indicator (Catapult vs Forest) */}
      {isProhibitedTarget && (
        <Billboard position={[0, 2.0, 0]}>
          <Text fontSize={0.8} color="#ef4444" outlineWidth={0.05} outlineColor="black">
            🚫
          </Text>
        </Billboard>
      )}
    </group>
  );
};

const skySphereGeo = new THREE.SphereGeometry(500, 32, 32);
const skySphereMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: {
    colorBottom: { value: new THREE.Color('#450a0a') }, // Hell (dark red)
    colorTop: { value: new THREE.Color('#dbeafe') }, // Heaven (light blue)
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
    uniform vec3 colorBottom;
    uniform vec3 colorTop;
    varying vec3 vWorldPosition;
    void main() {
      vec3 direction = normalize(vWorldPosition);
      // direction.y goes from -1 (straight down) to +1 (straight up)
      // We want h to be 0 at the horizon (direction.y = 0) and 1 straight up
      float h = max(0.0, direction.y);
      vec3 color = mix(colorBottom, colorTop, h);
      gl_FragColor = vec4(color, 1.0);
    }
  `
});

export const Game3D: React.FC<Game3DProps> = ({ gameState, hoveredHex, setHoveredHex, handleHexClick, finalizeMove, finalizeAttack, clearAnimation }) => {
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const selectedUnit = gameState.units.find(u => u.id === gameState.selectedUnitId);
  const isSelectedCatapult = selectedUnit?.type === UnitType.CATAPULT;

  return (
    <Canvas>
      {/* Epic Ambient Sky Sphere */}
      <mesh geometry={skySphereGeo} material={skySphereMat} />

      <OrthographicCamera makeDefault position={[10, 20, 17.32]} zoom={30} near={-1000} far={1000} />
      <MapControls 
        enableRotate={true} 
        maxPolarAngle={Math.PI / 2 - 0.1}
        enableDamping 
        dampingFactor={0.05} 
        minZoom={10} 
        maxZoom={80} 
        target={[0, 0, 0]}
      />
      
      <ambientLight intensity={0.6} />
      <directionalLight 
        position={[10, 20, 10]} 
        intensity={1.5} 
      />

      <group position={[0, 0, 0]}>
        {/* Render Board */}
        {gameState.board.map((tile) => {
          const isSelected = gameState.selectedHex?.q === tile.coord.q && gameState.selectedHex?.r === tile.coord.r;
          const isHovered = hoveredHex?.q === tile.coord.q && hoveredHex?.r === tile.coord.r;
          const isPossibleMove = gameState.possibleMoves.some(m => m.q === tile.coord.q && m.r === tile.coord.r);
          const isPossibleAttack = gameState.possibleAttacks.some(a => a.q === tile.coord.q && a.r === tile.coord.r);
          const isAttackRange = gameState.attackRange.some(r => r.q === tile.coord.q && r.r === tile.coord.r);
          const unitAtHex = gameState.units.find(u => u.coord.q === tile.coord.q && u.coord.r === tile.coord.r);
          
          let hasAdjacentSettlement = false;
          if (tile.terrain === TerrainType.WATER) {
            const neighbors = getNeighbors(tile.coord);
            hasAdjacentSettlement = gameState.board.some(t => 
              (t.terrain === TerrainType.VILLAGE || t.terrain === TerrainType.FORTRESS || 
               t.terrain === TerrainType.CASTLE || t.terrain === TerrainType.GOLD_MINE) &&
              neighbors.some(n => n.q === t.coord.q && n.r === t.coord.r)
            );
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
              playerColor={tile.ownerId !== null ? gameState.players[tile.ownerId].color : '#000'}
              hasAdjacentSettlement={hasAdjacentSettlement}
              unitAtHex={unitAtHex}
              isCurrentPlayer={tile.ownerId === currentPlayer.id}
              onClick={handleHexClick}
              onPointerEnter={setHoveredHex}
              onPointerLeave={setHoveredHex}
            />
          );
        })}

        {/* Render Units */}
        {gameState.units.map((unit) => {
          const anim = gameState.animations.find(a => a.unitId === unit.id && (a.type === 'move' || a.type === 'attack'));
          const displayCoord = anim?.type === 'move' && anim.to ? anim.to : unit.coord;
          const tile = gameState.board.find(t => t.coord.q === displayCoord.q && t.coord.r === displayCoord.r);
          const isOnWater = tile?.terrain === TerrainType.WATER;
          const tileHeight = tile ? (TERRAIN_HEIGHTS[tile.terrain as TerrainType] || 0.4) : 0.4;
          
          const isAttackRange = gameState.attackRange.some(r => r.q === unit.coord.q && r.r === unit.coord.r);
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
                isPossibleAttackTarget={gameState.possibleAttacks.some(a => a.q === unit.coord.q && a.r === unit.coord.r)}
                isProhibitedTarget={isProhibitedTarget}
                onAnimationEnd={() => {
                  if (anim?.type === 'move') finalizeMove(unit.id, anim.to!);
                  if (anim?.type === 'attack') finalizeAttack(unit.id, anim.to!);
                }}
                onClick={() => handleHexClick(unit.coord.q, unit.coord.r)}
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
        {gameState.animations.filter(a => a.type === 'damage' || a.type === 'miss').map(anim => {
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
  );
};
