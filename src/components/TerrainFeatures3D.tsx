import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GEOMETRIES, MATERIALS } from '../services/graphicsLibrary';

export const ForestFeature = React.memo(({ position }: { position: [number, number, number] }) => (
  <group position={position}>
    {/* Main Trees - more irregular heights and rotations */}
    <group position={[-0.2, 0.35, -0.2]} rotation={[0.1, 0, 0.1]}>
      <mesh geometry={GEOMETRIES.forestCone1} material={MATERIALS.forest} raycast={() => null} />
      {/* Thorns */}
      <mesh position={[0.1, 0, 0]} rotation={[0, 0, Math.PI/2]} geometry={GEOMETRIES.thorn} material={MATERIALS.vine} raycast={() => null} />
      <mesh position={[-0.1, 0.1, 0]} rotation={[0, 0, -Math.PI/2]} geometry={GEOMETRIES.thorn} material={MATERIALS.vine} raycast={() => null} />
    </group>
    
    <group position={[0.3, 0.45, 0.1]} rotation={[-0.1, 0.5, 0]}>
      <mesh geometry={GEOMETRIES.forestCone2} material={MATERIALS.forest} raycast={() => null} />
      <mesh position={[0.12, -0.1, 0]} rotation={[0, 0, Math.PI/2]} geometry={GEOMETRIES.thorn} material={MATERIALS.vine} raycast={() => null} />
    </group>

    <group position={[-0.1, 0.3, 0.3]} rotation={[0, -0.3, -0.1]}>
      <mesh geometry={GEOMETRIES.forestCone3} material={MATERIALS.forest} raycast={() => null} />
      <mesh position={[0, 0.1, 0.1]} rotation={[Math.PI/2, 0, 0]} geometry={GEOMETRIES.thorn} material={MATERIALS.vine} raycast={() => null} />
    </group>

    {/* Twisted Vines */}
    {Array.from({ length: 4 }).map((_, i) => (
      <mesh 
        key={i} 
        position={[Math.sin(i * 1.5) * 0.3, 0.1, Math.cos(i * 1.5) * 0.3]} 
        rotation={[Math.random(), Math.random(), Math.random()]}
        raycast={() => null}
      >
        <cylinderGeometry args={[0.01, 0.01, 0.6, 4]} />
        <meshStandardMaterial color="#0a7e60" />
      </mesh>
    ))}
  </group>
));

export const MountainFeature = React.memo(({ position }: { position: [number, number, number] }) => (
  <group position={position}>
    <mesh position={[0, 0.575, 0]} rotation={[0, Math.PI/4, 0]} geometry={GEOMETRIES.mountainCone1} material={MATERIALS.mountain} raycast={() => null} />
  </group>
));

export const CastleFeature = React.memo(({ position, playerColor }: { position: [number, number, number], playerColor: string }) => {
  const flagRef = useRef<THREE.Mesh>(null);
  
  useFrame(() => {
    if (flagRef.current) {
      const time = performance.now() / 1000;
      flagRef.current.rotation.y = Math.sin(time * 3) * 0.2;
      flagRef.current.rotation.z = Math.sin(time * 5) * 0.1;
    }
  });

  return (
    <group position={position}>
      {/* Hollow interior with 6 walls */}
      {Array.from({ length: 6 }).map((_, i) => {
        const angle = (i * Math.PI) / 3 + Math.PI / 6;
        const tx = Math.cos(angle) * 0.52;
        const tz = Math.sin(angle) * 0.52;
        return <mesh key={`wall-${i}`} position={[tx, 0.25, tz]} rotation={[0, -angle + Math.PI / 2, 0]} geometry={GEOMETRIES.castleWall} material={MATERIALS.castle} raycast={() => null} />;
      })}
      {/* Towers at the 6 corners of the hexagon */}
      {Array.from({ length: 6 }).map((_, i) => {
        const angle = (i * Math.PI) / 3;
        const tx = Math.cos(angle) * 0.6;
        const tz = Math.sin(angle) * 0.6;
        const isMainTower = i === 0;
        return (
          <group key={i} position={[tx, 0.4, tz]}>
            <mesh geometry={GEOMETRIES.castleTower} material={MATERIALS.castleTower} raycast={() => null} />
            {isMainTower && (
              <group position={[0, 0.4, 0]}>
                <mesh position={[0, 0.2, 0]} geometry={GEOMETRIES.castleRoof} material={MATERIALS.castleRoof} raycast={() => null} />
                <group position={[0, 0.4, 0]}>
                  <mesh position={[0, 0.2, 0]} geometry={GEOMETRIES.flagPole} material={MATERIALS.castleTower} raycast={() => null} />
                  <mesh ref={flagRef} position={[0.15, 0.3, 0]} geometry={GEOMETRIES.flag} material={MATERIALS.getPlayerBasic(playerColor)} raycast={() => null} />
                </group>
              </group>
            )}
          </group>
        );
      })}
    </group>
  );
});

export const FortFeature = React.memo(({ position, playerColor }: { position: [number, number, number], playerColor: string }) => {
  const flagRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (flagRef.current) {
      const time = performance.now() / 1000;
      flagRef.current.rotation.y = Math.sin(time * 3) * 0.2;
      flagRef.current.rotation.z = Math.sin(time * 5) * 0.1;
    }
  });

  return (
    <group position={position}>
      {/* Hollow interior with 6 short walls */}
      {Array.from({ length: 6 }).map((_, i) => {
        const angle = (i * Math.PI) / 3 + Math.PI / 6;
        const tx = Math.cos(angle) * 0.52;
        const tz = Math.sin(angle) * 0.52;
        return <mesh key={`wall-${i}`} position={[tx, 0.125, tz]} rotation={[0, -angle + Math.PI / 2, 0]} geometry={GEOMETRIES.fortWall} material={MATERIALS.castle} raycast={() => null} />;
      })}
      {/* Short towers at the 6 corners */}
      {Array.from({ length: 6 }).map((_, i) => {
        const angle = (i * Math.PI) / 3;
        const tx = Math.cos(angle) * 0.6;
        const tz = Math.sin(angle) * 0.6;
        const isMainTower = i === 0;
        return (
          <group key={i} position={[tx, 0.2, tz]}>
            <mesh geometry={GEOMETRIES.fortTower} material={MATERIALS.castleTower} raycast={() => null} />
            {isMainTower && (
              <group position={[0, 0.2, 0]}>
                <mesh position={[0, 0.2, 0]} geometry={GEOMETRIES.flagPole} material={MATERIALS.castleTower} raycast={() => null} />
                <mesh ref={flagRef} position={[0.15, 0.3, 0]} geometry={GEOMETRIES.flag} material={MATERIALS.getPlayerBasic(playerColor)} raycast={() => null} />
              </group>
            )}
          </group>
        );
      })}
    </group>
  );
});

export const VillageFeature = React.memo(({ position, playerColor, isClaimed }: { position: [number, number, number], playerColor: string, isClaimed: boolean }) => {
  const flagRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (flagRef.current) {
      const time = performance.now() / 1000;
      flagRef.current.rotation.y = Math.sin(time * 3) * 0.2;
      flagRef.current.rotation.z = Math.sin(time * 5) * 0.1;
    }
  });

  return (
    <group position={position}>
      <mesh position={[-0.2, 0.2, -0.2]} geometry={GEOMETRIES.villageBox1} material={MATERIALS.castle} raycast={() => null} />
      <mesh position={[-0.2, 0.5, -0.2]} rotation={[0, Math.PI/4, 0]} geometry={GEOMETRIES.villageCone1} material={MATERIALS.villageWood} raycast={() => null} />
      <mesh position={[0.2, 0.15, 0.2]} geometry={GEOMETRIES.villageBox2} material={MATERIALS.castle} raycast={() => null} />
      <mesh position={[0.2, 0.4, 0.2]} rotation={[0, Math.PI/4, 0]} geometry={GEOMETRIES.villageCone2} material={MATERIALS.villageWood} raycast={() => null} />
      {/* Claimed village gets a third building with a flag */}
      {isClaimed && (
        <group position={[0, 0, 0.3]}>
          <mesh position={[0, 0.25, 0]} geometry={GEOMETRIES.villageTower} material={MATERIALS.castle} raycast={() => null} />
          <mesh position={[0, 0.5, 0]} geometry={GEOMETRIES.flagPole} material={MATERIALS.castleTower} raycast={() => null} />
          <mesh ref={flagRef} position={[0.15, 0.6, 0]} geometry={GEOMETRIES.flag} material={MATERIALS.getPlayerBasic(playerColor)} raycast={() => null} />
        </group>
      )}
    </group>
  );
});

export const GoldMineFeature = React.memo(({ position }: { position: [number, number, number] }) => (
  <group position={position}>
    {/* Mountain Base */}
    <mesh position={[0, 0.575, 0]} rotation={[0, Math.PI/4, 0]} geometry={GEOMETRIES.mountainCone1} material={MATERIALS.mountain} raycast={() => null} />
    {/* Mine Opening 1 */}
    <group position={[0.23, 0.1725, 0.345]} rotation={[0, Math.PI/4, 0]} scale={[1.15, 1.15, 1.15]}>
      <mesh geometry={GEOMETRIES.mineBox} material={MATERIALS.mineBase} raycast={() => null} />
      <mesh position={[0, -0.1, 0.1]} geometry={GEOMETRIES.mineDodec1} material={MATERIALS.gold} raycast={() => null} />
      <mesh position={[0.1, -0.1, 0.05]} geometry={GEOMETRIES.mineDodec2} material={MATERIALS.gold} raycast={() => null} />
    </group>
    {/* Mine Opening 2 */}
    <group position={[-0.345, 0.1725, -0.23]} rotation={[0, -Math.PI/4, 0]} scale={[1.15, 1.15, 1.15]}>
      <mesh geometry={GEOMETRIES.mineBox} material={MATERIALS.mineBase} raycast={() => null} />
      <mesh position={[0, -0.1, 0.1]} geometry={GEOMETRIES.mineDodec1} material={MATERIALS.gold} raycast={() => null} />
    </group>
  </group>
));
