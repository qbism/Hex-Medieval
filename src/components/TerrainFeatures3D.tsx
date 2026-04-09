import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Shared Geometries and Materials for Terrain Features
export const forestCone1 = new THREE.ConeGeometry(0.2, 0.7, 5);
export const forestCone2 = new THREE.ConeGeometry(0.28, 0.9, 5);
export const forestCone3 = new THREE.ConeGeometry(0.18, 0.6, 5);
export const forestMat = new THREE.MeshStandardMaterial({ color: "#022c22" });
const vineMat = new THREE.MeshStandardMaterial({ color: "#111827" });
const thornGeo = new THREE.ConeGeometry(0.02, 0.08, 3);

export const mountainCone1 = new THREE.ConeGeometry(0.6, 1, 4);
export const mountainMat1 = new THREE.MeshStandardMaterial({ color: "#78716c" });
export const mountainCone2 = new THREE.ConeGeometry(0.3, 0.3, 4);
export const mountainMat2 = new THREE.MeshStandardMaterial({ color: "white" });

const castleWallGeo = new THREE.BoxGeometry(0.65, 0.5, 0.15);
const castleMat = new THREE.MeshStandardMaterial({ color: "#d1d5db" });
const castleTowerGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.8, 6);
const castleTowerMat = new THREE.MeshStandardMaterial({ color: "#9ca3af" });
const castleRoofGeo = new THREE.ConeGeometry(0.2, 0.4, 6);
const castleRoofMat = new THREE.MeshStandardMaterial({ color: "#b45309" });
const flagPoleGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.4, 4);
const flagGeo = new THREE.PlaneGeometry(0.3, 0.2, 4, 4);

const fortressWallGeo = new THREE.BoxGeometry(0.65, 0.25, 0.15);
const fortressTowerGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.4, 6);
const fortressMat = new THREE.MeshStandardMaterial({ color: "#d1d5db" });

const villageBox1 = new THREE.BoxGeometry(0.3, 0.4, 0.3);
const villageBox2 = new THREE.BoxGeometry(0.25, 0.3, 0.25);
const villageMat1 = new THREE.MeshStandardMaterial({ color: "#fef3c7" });
const villageCone1 = new THREE.ConeGeometry(0.25, 0.3, 4);
const villageCone2 = new THREE.ConeGeometry(0.2, 0.25, 4);
const villageTowerGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.5, 6);
const villageMat2 = new THREE.MeshStandardMaterial({ color: "#b45309" });

const mineBox = new THREE.BoxGeometry(0.2, 0.3, 0.2);
const mineMat1 = new THREE.MeshStandardMaterial({ color: "#1c1917" });
const mineDodec1 = new THREE.DodecahedronGeometry(0.1);
const mineDodec2 = new THREE.DodecahedronGeometry(0.08);
const mineMat2 = new THREE.MeshStandardMaterial({ color: "#fbbf24", metalness: 0.8, roughness: 0.2 });

const playerBasicMaterials: Record<string, THREE.MeshBasicMaterial> = {};
export const getPlayerBasicMaterial = (color: string) => {
  if (!playerBasicMaterials[color]) {
    playerBasicMaterials[color] = new THREE.MeshBasicMaterial({ color });
  }
  return playerBasicMaterials[color];
};

export const ForestFeature = ({ position }: { position: [number, number, number] }) => (
  <group position={position}>
    {/* Main Trees - more irregular heights and rotations */}
    <group position={[-0.2, 0.35, -0.2]} rotation={[0.1, 0, 0.1]}>
      <mesh geometry={forestCone1} material={forestMat} />
      {/* Thorns */}
      <mesh position={[0.1, 0, 0]} rotation={[0, 0, Math.PI/2]} geometry={thornGeo} material={vineMat} />
      <mesh position={[-0.1, 0.1, 0]} rotation={[0, 0, -Math.PI/2]} geometry={thornGeo} material={vineMat} />
    </group>
    
    <group position={[0.3, 0.45, 0.1]} rotation={[-0.1, 0.5, 0]}>
      <mesh geometry={forestCone2} material={forestMat} />
      <mesh position={[0.12, -0.1, 0]} rotation={[0, 0, Math.PI/2]} geometry={thornGeo} material={vineMat} />
    </group>

    <group position={[-0.1, 0.3, 0.3]} rotation={[0, -0.3, -0.1]}>
      <mesh geometry={forestCone3} material={forestMat} />
      <mesh position={[0, 0.1, 0.1]} rotation={[Math.PI/2, 0, 0]} geometry={thornGeo} material={vineMat} />
    </group>

    {/* Twisted Vines */}
    {Array.from({ length: 4 }).map((_, i) => (
      <mesh 
        key={i} 
        position={[Math.sin(i * 1.5) * 0.3, 0.1, Math.cos(i * 1.5) * 0.3]} 
        rotation={[Math.random(), Math.random(), Math.random()]}
      >
        <cylinderGeometry args={[0.01, 0.01, 0.6, 4]} />
        <meshStandardMaterial color="#064e3b" />
      </mesh>
    ))}
  </group>
);

export const MountainFeature = ({ position }: { position: [number, number, number] }) => (
  <group position={position}>
    <mesh position={[0, 0.5, 0]} rotation={[0, Math.PI/4, 0]} geometry={mountainCone1} material={mountainMat1} />
    <mesh position={[0, 1, 0]} rotation={[0, Math.PI/4, 0]} geometry={mountainCone2} material={mountainMat2} />
  </group>
);

export const CastleFeature = ({ position, playerColor }: { position: [number, number, number], playerColor: string }) => {
  const flagRef = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (flagRef.current) {
      flagRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 3) * 0.2;
      flagRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 5) * 0.1;
    }
  });

  return (
    <group position={position}>
      {/* Hollow interior with 6 walls */}
      {Array.from({ length: 6 }).map((_, i) => {
        const angle = (i * Math.PI) / 3 + Math.PI / 6;
        const tx = Math.cos(angle) * 0.52;
        const tz = Math.sin(angle) * 0.52;
        return <mesh key={`wall-${i}`} position={[tx, 0.25, tz]} rotation={[0, -angle + Math.PI / 2, 0]} geometry={castleWallGeo} material={castleMat} />;
      })}
      {/* Towers at the 6 corners of the hexagon */}
      {Array.from({ length: 6 }).map((_, i) => {
        const angle = (i * Math.PI) / 3;
        const tx = Math.cos(angle) * 0.6;
        const tz = Math.sin(angle) * 0.6;
        const isMainTower = i === 0;
        return (
          <group key={i} position={[tx, 0.4, tz]}>
            <mesh geometry={castleTowerGeo} material={castleTowerMat} />
            {isMainTower && (
              <group position={[0, 0.4, 0]}>
                <mesh position={[0, 0.2, 0]} geometry={castleRoofGeo} material={castleRoofMat} />
                <group position={[0, 0.4, 0]}>
                  <mesh position={[0, 0.2, 0]} geometry={flagPoleGeo} material={castleTowerMat} />
                  <mesh ref={flagRef} position={[0.15, 0.3, 0]} geometry={flagGeo} material={getPlayerBasicMaterial(playerColor)} />
                </group>
              </group>
            )}
          </group>
        );
      })}
    </group>
  );
};

export const FortressFeature = ({ position, playerColor }: { position: [number, number, number], playerColor: string }) => {
  const flagRef = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (flagRef.current) {
      flagRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 3) * 0.2;
      flagRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 5) * 0.1;
    }
  });

  return (
    <group position={position}>
      {/* Hollow interior with 6 short walls */}
      {Array.from({ length: 6 }).map((_, i) => {
        const angle = (i * Math.PI) / 3 + Math.PI / 6;
        const tx = Math.cos(angle) * 0.52;
        const tz = Math.sin(angle) * 0.52;
        return <mesh key={`wall-${i}`} position={[tx, 0.125, tz]} rotation={[0, -angle + Math.PI / 2, 0]} geometry={fortressWallGeo} material={fortressMat} />;
      })}
      {/* Short towers at the 6 corners */}
      {Array.from({ length: 6 }).map((_, i) => {
        const angle = (i * Math.PI) / 3;
        const tx = Math.cos(angle) * 0.6;
        const tz = Math.sin(angle) * 0.6;
        const isMainTower = i === 0;
        return (
          <group key={i} position={[tx, 0.2, tz]}>
            <mesh geometry={fortressTowerGeo} material={castleTowerMat} />
            {isMainTower && (
              <group position={[0, 0.2, 0]}>
                <mesh position={[0, 0.2, 0]} geometry={flagPoleGeo} material={castleTowerMat} />
                <mesh ref={flagRef} position={[0.15, 0.3, 0]} geometry={flagGeo} material={getPlayerBasicMaterial(playerColor)} />
              </group>
            )}
          </group>
        );
      })}
    </group>
  );
};

export const VillageFeature = ({ position, playerColor, isClaimed }: { position: [number, number, number], playerColor: string, isClaimed: boolean }) => {
  const flagRef = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (flagRef.current) {
      flagRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 3) * 0.2;
      flagRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 5) * 0.1;
    }
  });

  return (
    <group position={position}>
      <mesh position={[-0.2, 0.2, -0.2]} geometry={villageBox1} material={villageMat1} />
      <mesh position={[-0.2, 0.5, -0.2]} rotation={[0, Math.PI/4, 0]} geometry={villageCone1} material={villageMat2} />
      <mesh position={[0.2, 0.15, 0.2]} geometry={villageBox2} material={villageMat1} />
      <mesh position={[0.2, 0.4, 0.2]} rotation={[0, Math.PI/4, 0]} geometry={villageCone2} material={villageMat2} />
      {/* Claimed village gets a third building with a flag */}
      {isClaimed && (
        <group position={[0, 0, 0.3]}>
          <mesh position={[0, 0.25, 0]} geometry={villageTowerGeo} material={villageMat1} />
          <mesh position={[0, 0.5, 0]} geometry={flagPoleGeo} material={castleTowerMat} />
          <mesh ref={flagRef} position={[0.15, 0.6, 0]} geometry={flagGeo} material={getPlayerBasicMaterial(playerColor)} />
        </group>
      )}
    </group>
  );
};

export const GoldMineFeature = ({ position }: { position: [number, number, number] }) => (
  <group position={position}>
    {/* Mountain Base */}
    <mesh position={[0, 0.5, 0]} rotation={[0, Math.PI/4, 0]} geometry={mountainCone1} material={mountainMat1} />
    {/* Snow Peak */}
    <mesh position={[0, 1, 0]} rotation={[0, Math.PI/4, 0]} geometry={mountainCone2} material={mountainMat2} />
    {/* Mine Opening 1 */}
    <group position={[0.2, 0.15, 0.3]} rotation={[0, Math.PI/4, 0]}>
      <mesh geometry={mineBox} material={mineMat1} />
      <mesh position={[0, -0.1, 0.1]} geometry={mineDodec1} material={mineMat2} />
      <mesh position={[0.1, -0.1, 0.05]} geometry={mineDodec2} material={mineMat2} />
    </group>
    {/* Mine Opening 2 */}
    <group position={[-0.3, 0.15, -0.2]} rotation={[0, -Math.PI/4, 0]}>
      <mesh geometry={mineBox} material={mineMat1} />
      <mesh position={[0, -0.1, 0.1]} geometry={mineDodec1} material={mineMat2} />
    </group>
  </group>
);
