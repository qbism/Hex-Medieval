import { useMemo, useRef } from 'react';
import { extend, useFrame } from '@react-three/fiber';
import { shaderMaterial } from '@react-three/drei';
import * as THREE from 'three';

const WaterSurfaceMaterial = shaderMaterial(
  { time: 0, color: new THREE.Color('#7495be'), selectionBrightness: 0 },
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
    uniform float selectionBrightness;
    varying vec2 vUv;
    varying vec3 vPosition;

    float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
    }

    void main() {
      // Subtle color variation based on wave (scale 2x)
      float wave = sin(vPosition.x * 10.0 + time * 2.0) * cos(vPosition.y * 10.0 + time * 2.0);
      vec3 finalColor = color + vec3(wave * 0.1);
      
      // Slightly more greenish
      finalColor.g += 0.08;
      finalColor.b -= 0.02;
      
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
      
      // Additive #444444 (approx 0.27) based on selection factor
      // Base brightness is 1.25
      gl_FragColor = vec4(finalColor * 1.25 + selectionBrightness * vec3(0.27), 0.8);
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

export const updateWaterTime = () => {
  sharedWaterMaterial.time = performance.now() / 1000;
};

export const WaterSurfaceEffect = ({ 
  radius, 
  isSelected = false, 
  onClick,
  onInteractionEnter, 
  onInteractionLeave 
}: { 
  radius: number, 
  isSelected?: boolean,
  onClick?: () => void,
  onInteractionEnter?: () => void,
  onInteractionLeave?: () => void
}) => {
  const material = useMemo(() => new WaterSurfaceMaterial(), []);
  const selectionFactor = useRef(0);
  
  useFrame((_state, delta) => {
    material.time = performance.now() / 1000;
    
    // Selection highlight: additive #444444 (vec3(0.27))
    // Transitions: 50ms up, 200ms down
    const target = isSelected ? 1.0 : 0.0;
    if (Math.abs(selectionFactor.current - target) > 0.001) {
      if (target > selectionFactor.current) {
        selectionFactor.current = Math.min(target, selectionFactor.current + 20 * delta);
      } else {
        selectionFactor.current = Math.max(target, selectionFactor.current - 5 * delta);
      }
    }
    material.selectionBrightness = selectionFactor.current;
  });

  return (
    <mesh 
      rotation={[-Math.PI / 2, 0, Math.PI / 2]} 
      position={[0, 0.01, 0]} 
      geometry={getWaterGeometry(radius)} 
      material={material} 
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      onPointerEnter={(e) => {
        e.stopPropagation();
        onInteractionEnter?.();
      }}
      onPointerLeave={(e) => {
        e.stopPropagation();
        onInteractionLeave?.();
      }}
    />
  );
};
