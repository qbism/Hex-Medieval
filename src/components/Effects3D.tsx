import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Text } from '@react-three/drei';

const sparkGeo = new THREE.SphereGeometry(0.12, 4, 4);
const sparkMat = new THREE.MeshBasicMaterial({ color: "#fbbf24", transparent: true, opacity: 0.9 });

const smokeGeo = new THREE.SphereGeometry(0.3, 8, 8);

const boulderGeo = new THREE.DodecahedronGeometry(0.3, 0);
const boulderMat = new THREE.MeshStandardMaterial({ color: "#444444" });

const arrowGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8);
arrowGeo.rotateX(Math.PI / 2); // Align with Z axis for lookAt
const arrowMat = new THREE.MeshStandardMaterial({ color: "#8b4513" });

export const MissEffect3D = ({ x, z, onComplete }: any) => {
  const textRef = useRef<THREE.Group>(null);
  const animTimeRef = useRef(0);
  const animDoneRef = useRef(false);

  useFrame((_state, delta) => {
    if (!textRef.current) return;

    animTimeRef.current += delta;
    const duration = 1.2;
    const progress = Math.min(animTimeRef.current / duration, 1);

    // Float up and fade out
    textRef.current.position.y = 1.5 + progress * 1.5;
    textRef.current.scale.setScalar(1 + progress * 0.5);
    
    if (progress >= 1 && !animDoneRef.current) {
      animDoneRef.current = true;
      onComplete?.();
    }
  });

  return (
    <group ref={textRef} position={[x, 1.5, z]}>
      <Text
        fontSize={0.6}
        color="#ffffff"
        outlineWidth={0.05}
        outlineColor="#3b82f6"
        anchorX="center"
        anchorY="middle"
      >
        MISS
      </Text>
    </group>
  );
};

export const SmokeEffect3D = ({ x, z, onComplete }: any) => {
  const groupRef = useRef<THREE.Group>(null);
  const animTimeRef = useRef(0);
  const animDoneRef = useRef(false);

  const particles = useMemo(() => Array.from({ length: 8 }).map(() => ({
    velocity: new THREE.Vector3(
      (Math.random() - 0.5) * 0.5,
      Math.random() * 1.5 + 0.5,
      (Math.random() - 0.5) * 0.5
    ),
    position: new THREE.Vector3(
      (Math.random() - 0.5) * 0.4,
      0,
      (Math.random() - 0.5) * 0.4
    ),
    scale: Math.random() * 0.5 + 0.5,
    offset: Math.random() * 0.5
  })), []);

  useFrame((_state, delta) => {
    if (!groupRef.current) return;

    animTimeRef.current += delta;
    const duration = 2.0;
    const progress = Math.min(animTimeRef.current / duration, 1);

    groupRef.current.children.forEach((child, i) => {
      const p = particles[i];
      const pProgress = Math.max(0, Math.min((animTimeRef.current - p.offset) / (duration - p.offset), 1));
      
      child.position.x = p.position.x + p.velocity.x * pProgress;
      child.position.y = p.position.y + p.velocity.y * pProgress;
      child.position.z = p.position.z + p.velocity.z * pProgress;
      
      child.scale.setScalar(p.scale * (1 + pProgress * 2));
      (child as any).material.opacity = 0.6 * (1 - pProgress);
    });

    if (progress >= 1 && !animDoneRef.current) {
      animDoneRef.current = true;
      onComplete?.();
    }
  });

  return (
    <group ref={groupRef} position={[x, 0.5, z]}>
      {particles.map((_p, i) => (
        <mesh key={i} geometry={smokeGeo}>
          <meshStandardMaterial color="#555555" transparent opacity={0.6} />
        </mesh>
      ))}
    </group>
  );
};

export const Projectile3D = ({ from, to, type, onComplete }: any) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const animTimeRef = useRef(0);
  const animDoneRef = useRef(false);

  const duration = 0.6;

  useFrame((_state, delta) => {
    if (!meshRef.current) return;

    animTimeRef.current += delta;
    const progress = Math.min(animTimeRef.current / duration, 1);
    
    // Ease out quad
    const ease = progress; // Linear is fine for projectile path

    const x = THREE.MathUtils.lerp(from.x, to.x, ease);
    const z = THREE.MathUtils.lerp(from.z, to.z, ease);
    
    // Parabolic arc
    const arcHeight = type === 'boulder' ? 4 : 2;
    const y = 1 + Math.sin(progress * Math.PI) * arcHeight;

    meshRef.current.position.set(x, y, z);

    // Rotation
    if (type === 'boulder') {
      meshRef.current.rotation.x += delta * 10;
      meshRef.current.rotation.z += delta * 5;
    } else {
      // Arrow points towards target along the trajectory
      const nextProgress = Math.min((animTimeRef.current + 0.01) / duration, 1);
      const nextX = THREE.MathUtils.lerp(from.x, to.x, nextProgress);
      const nextZ = THREE.MathUtils.lerp(from.z, to.z, nextProgress);
      const nextY = 1 + Math.sin(nextProgress * Math.PI) * arcHeight;
      
      meshRef.current.lookAt(nextX, nextY, nextZ);
    }

    if (progress >= 1 && !animDoneRef.current) {
      animDoneRef.current = true;
      onComplete?.();
    }
  });

  return (
    <mesh ref={meshRef} geometry={type === 'boulder' ? boulderGeo : arrowGeo} material={type === 'boulder' ? boulderMat : arrowMat} />
  );
};

export const Sparks3D = ({ x, z, onComplete }: any) => {
  const groupRef = useRef<THREE.Group>(null);
  const animTimeRef = useRef(0);
  const animDoneRef = useRef(false);

  const particles = useMemo(() => Array.from({ length: 16 }).map(() => ({
    velocity: new THREE.Vector3(
      (Math.random() - 0.5) * 10,
      Math.random() * 8 + 4,
      (Math.random() - 0.5) * 10
    ),
    position: new THREE.Vector3(0, 0, 0),
    scale: Math.random() * 0.6 + 0.4
  })), []);

  useFrame((_state, delta) => {
    if (!groupRef.current) return;

    animTimeRef.current += delta;
    const duration = 0.5;
    const progress = Math.min(animTimeRef.current / duration, 1);

    groupRef.current.children.forEach((child, i) => {
      const p = particles[i];
      p.velocity.y -= 30 * delta; // gravity
      p.position.addScaledVector(p.velocity, delta);
      child.position.copy(p.position);
      child.scale.setScalar(p.scale * (1 - progress));
    });

    if (progress >= 1 && !animDoneRef.current) {
      animDoneRef.current = true;
      onComplete?.();
    }
  });

  return (
    <group ref={groupRef} position={[x, 1, z]}>
      {particles.map((_p, i) => (
        <mesh key={i} geometry={sparkGeo} material={sparkMat} />
      ))}
    </group>
  );
};
