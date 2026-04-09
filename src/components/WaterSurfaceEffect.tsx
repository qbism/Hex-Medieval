import { useFrame, extend } from '@react-three/fiber';
import { shaderMaterial } from '@react-three/drei';
import * as THREE from 'three';

const WaterSurfaceMaterial = shaderMaterial(
  { time: 0, color: new THREE.Color('#7495be') },
  // vertex shader
  `
    varying vec2 vUv;
    varying vec3 vPosition;
    uniform float time;
    void main() {
      vUv = uv;
      vPosition = position;
      
      // Add subtle wave to vertices (scale 2x)
      vec3 pos = position;
      float wave = sin(pos.x * 10.0 + time * 2.0) * cos(pos.y * 10.0 + time * 2.0) * 0.0125;
      pos.z += wave;
      
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,
  // fragment shader
  `
    uniform float time;
    uniform vec3 color;
    varying vec2 vUv;
    varying vec3 vPosition;

    float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
    }

    void main() {
      // Subtle color variation based on wave (scale 2x)
      float wave = sin(vPosition.x * 10.0 + time * 2.0) * cos(vPosition.y * 10.0 + time * 2.0);
      vec3 finalColor = color + vec3(wave * 0.1);
      
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

      gl_FragColor = vec4(finalColor, 0.8);
    }
  `
);

extend({ WaterSurfaceMaterial });

declare module '@react-three/fiber' {
  interface ThreeElements {
    waterSurfaceMaterial: any;
  }
}

const waterGeometries: Record<number, THREE.CircleGeometry> = {};
const getWaterGeometry = (radius: number) => {
  if (!waterGeometries[radius]) {
    waterGeometries[radius] = new THREE.CircleGeometry(radius, 6);
  }
  return waterGeometries[radius];
};

const sharedWaterMaterial = new WaterSurfaceMaterial();

export const WaterSurfaceEffect = ({ radius }: { radius: number }) => {
  useFrame((state) => {
    sharedWaterMaterial.time = state.clock.elapsedTime;
  });

  return (
    <mesh rotation={[-Math.PI / 2, 0, Math.PI / 2]} position={[0, 0.01, 0]} geometry={getWaterGeometry(radius)} material={sharedWaterMaterial} />
  );
};
