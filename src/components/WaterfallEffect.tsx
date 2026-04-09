import { useFrame, extend } from '@react-three/fiber';
import { shaderMaterial } from '@react-three/drei';
import * as THREE from 'three';

const WaterfallMaterial = shaderMaterial(
  { time: 0, color: new THREE.Color('#8eaecf') },
  // vertex shader
  `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
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

      gl_FragColor = vec4(color + vec3(drip > 0.95 ? 0.5 : 0.0), alpha * 0.8);
    }
  `
);

extend({ WaterfallMaterial });

declare module '@react-three/fiber' {
  interface ThreeElements {
    waterfallMaterial: any;
  }
}

const waterfallGeometries: Record<number, THREE.CylinderGeometry> = {};
const getWaterfallGeometry = (depth: number) => {
  if (!waterfallGeometries[depth]) {
    waterfallGeometries[depth] = new THREE.CylinderGeometry(0.93, 0.93, depth, 6, 1, true);
  }
  return waterfallGeometries[depth];
};

const sharedWaterfallMaterial = new WaterfallMaterial();
sharedWaterfallMaterial.side = THREE.DoubleSide;

export const WaterfallEffect = ({ topHeight, depth }: { topHeight: number, depth: number }) => {
  useFrame((state) => {
    sharedWaterfallMaterial.time = state.clock.elapsedTime;
  });

  return (
    <mesh position={[0, topHeight - depth / 2, 0]} geometry={getWaterfallGeometry(depth)} material={sharedWaterfallMaterial} />
  );
};
