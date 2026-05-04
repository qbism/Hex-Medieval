import * as THREE from 'three';
import { TerrainType } from '../types';

/**
 * Graphics Library for Hex Medieval
 * Consolidates geometries, materials, and shared graphics constants.
 * Optimized for hardware from 2015 onwards (using instancing and shared assets).
 */

// --- Constants ---

export const TERRAIN_HEIGHTS: Record<TerrainType, number> = {
  [TerrainType.WATER]: 0.1,
  [TerrainType.PLAINS]: 0.2,
  [TerrainType.FOREST]: 0.3,
  [TerrainType.MOUNTAIN]: 0.4,
  [TerrainType.VILLAGE]: 0.25,
  [TerrainType.FORTRESS]: 0.4,
  [TerrainType.CASTLE]: 0.5,
  [TerrainType.GOLD_MINE]: 0.4,
};

// --- Geometry Cache ---

const geometryCache: Record<string, THREE.BufferGeometry> = {};

export const getTileGeometry = (height: number): THREE.CylinderGeometry => {
  const key = `tile_${height.toFixed(2)}`;
  if (!geometryCache[key]) {
    const geo = new THREE.CylinderGeometry(0.92, 0.92, height, 6);
    // Optimization: Don't render bottom cap (last 18 indices for a 6-segment cylinder)
    geo.setDrawRange(0, 54);
    geometryCache[key] = geo;
  }
  return geometryCache[key] as THREE.CylinderGeometry;
};

// --- Shared Geometries ---

export const GEOMETRIES = {
  get possibleMove() {
    if (!geometryCache.possibleMove) geometryCache.possibleMove = new THREE.CircleGeometry(0.4, 32);
    return geometryCache.possibleMove;
  },
  get forestMove() {
    if (!geometryCache.forestMove) geometryCache.forestMove = new THREE.BoxGeometry(0.4, 0.4, 0.01);
    return geometryCache.forestMove;
  },
  get attackRange() {
    if (!geometryCache.attackRange) geometryCache.attackRange = new THREE.CircleGeometry(0.85, 6);
    return geometryCache.attackRange;
  },
  get unitCone() {
    if (!geometryCache.unitCone) geometryCache.unitCone = new THREE.ConeGeometry(0.4, 0.6, 16);
    return geometryCache.unitCone;
  },
  get infantry() {
    if (!geometryCache.infantry) geometryCache.infantry = new THREE.BoxGeometry(0.4, 0.8, 0.4);
    return geometryCache.infantry;
  },
  get archer() {
    if (!geometryCache.archer) geometryCache.archer = new THREE.ConeGeometry(0.3, 1, 8);
    return geometryCache.archer;
  },
  get knightBody() {
    if (!geometryCache.knightBody) geometryCache.knightBody = new THREE.CylinderGeometry(0.3, 0.3, 0.8, 8);
    return geometryCache.knightBody;
  },
  get knightHead() {
    if (!geometryCache.knightHead) geometryCache.knightHead = new THREE.BoxGeometry(0.3, 0.4, 0.4);
    return geometryCache.knightHead;
  },
  get catapultBase() {
    if (!geometryCache.catapultBase) geometryCache.catapultBase = new THREE.BoxGeometry(0.6, 0.3, 0.6);
    return geometryCache.catapultBase;
  },
  get catapultArm() {
    if (!geometryCache.catapultArm) geometryCache.catapultArm = new THREE.CylinderGeometry(0.1, 0.1, 0.8, 8);
    return geometryCache.catapultArm;
  },
  get actionDot() {
    if (!geometryCache.actionDot) geometryCache.actionDot = new THREE.SphereGeometry(0.15, 16, 16);
    return geometryCache.actionDot;
  },
  get sphere() {
    if (!geometryCache.sphere) geometryCache.sphere = new THREE.SphereGeometry(1, 16, 16);
    return geometryCache.sphere;
  },
  get forestCone1() {
    if (!geometryCache.forestCone1) geometryCache.forestCone1 = new THREE.ConeGeometry(0.2, 0.7, 5);
    return geometryCache.forestCone1;
  },
  get forestCone2() {
    if (!geometryCache.forestCone2) geometryCache.forestCone2 = new THREE.ConeGeometry(0.28, 0.9, 5);
    return geometryCache.forestCone2;
  },
  get forestCone3() {
    if (!geometryCache.forestCone3) geometryCache.forestCone3 = new THREE.ConeGeometry(0.18, 0.6, 5);
    return geometryCache.forestCone3;
  },
  get mountainCone1() {
    if (!geometryCache.mountainCone1) geometryCache.mountainCone1 = new THREE.ConeGeometry(0.69, 1.15, 4);
    return geometryCache.mountainCone1;
  },
  get thorn() {
    if (!geometryCache.thorn) geometryCache.thorn = new THREE.ConeGeometry(0.02, 0.08, 3);
    return geometryCache.thorn;
  },
  get castleWall() {
    if (!geometryCache.castleWall) geometryCache.castleWall = new THREE.BoxGeometry(0.65, 0.5, 0.15);
    return geometryCache.castleWall;
  },
  get castleTower() {
    if (!geometryCache.castleTower) geometryCache.castleTower = new THREE.CylinderGeometry(0.15, 0.15, 0.8, 6);
    return geometryCache.castleTower;
  },
  get castleRoof() {
    if (!geometryCache.castleRoof) geometryCache.castleRoof = new THREE.ConeGeometry(0.2, 0.4, 6);
    return geometryCache.castleRoof;
  },
  get flagPole() {
    if (!geometryCache.flagPole) geometryCache.flagPole = new THREE.CylinderGeometry(0.02, 0.02, 0.4, 4);
    return geometryCache.flagPole;
  },
  get flag() {
    if (!geometryCache.flag) geometryCache.flag = new THREE.PlaneGeometry(0.3, 0.2, 4, 4);
    return geometryCache.flag;
  },
  get fortressWall() {
    if (!geometryCache.fortressWall) geometryCache.fortressWall = new THREE.BoxGeometry(0.65, 0.25, 0.15);
    return geometryCache.fortressWall;
  },
  get fortressTower() {
    if (!geometryCache.fortressTower) geometryCache.fortressTower = new THREE.CylinderGeometry(0.15, 0.15, 0.4, 6);
    return geometryCache.fortressTower;
  },
  get villageBox1() {
    if (!geometryCache.villageBox1) geometryCache.villageBox1 = new THREE.BoxGeometry(0.3, 0.4, 0.3);
    return geometryCache.villageBox1;
  },
  get villageBox2() {
    if (!geometryCache.villageBox2) geometryCache.villageBox2 = new THREE.BoxGeometry(0.25, 0.3, 0.25);
    return geometryCache.villageBox2;
  },
  get villageCone1() {
    if (!geometryCache.villageCone1) geometryCache.villageCone1 = new THREE.ConeGeometry(0.25, 0.3, 4);
    return geometryCache.villageCone1;
  },
  get villageCone2() {
    if (!geometryCache.villageCone2) geometryCache.villageCone2 = new THREE.ConeGeometry(0.2, 0.25, 4);
    return geometryCache.villageCone2;
  },
  get villageTower() {
    if (!geometryCache.villageTower) geometryCache.villageTower = new THREE.CylinderGeometry(0.1, 0.1, 0.5, 6);
    return geometryCache.villageTower;
  },
  get mineBox() {
    if (!geometryCache.mineBox) geometryCache.mineBox = new THREE.BoxGeometry(0.2, 0.3, 0.2);
    return geometryCache.mineBox;
  },
  get mineDodec1() {
    if (!geometryCache.mineDodec1) geometryCache.mineDodec1 = new THREE.DodecahedronGeometry(0.1);
    return geometryCache.mineDodec1;
  },
  get mineDodec2() {
    if (!geometryCache.mineDodec2) geometryCache.mineDodec2 = new THREE.DodecahedronGeometry(0.08);
    return geometryCache.mineDodec2;
  },
  get skySphere() {
    if (!geometryCache.skySphere) geometryCache.skySphere = new THREE.SphereGeometry(800, 32, 32);
    return geometryCache.skySphere;
  },
  get attackTarget() {
    if (!geometryCache.attackTarget) geometryCache.attackTarget = new THREE.SphereGeometry(0.8, 16, 16);
    return geometryCache.attackTarget;
  },
  get spark() {
    if (!geometryCache.spark) geometryCache.spark = new THREE.SphereGeometry(0.12, 4, 4);
    return geometryCache.spark;
  },
  get smoke() {
    if (!geometryCache.smoke) geometryCache.smoke = new THREE.SphereGeometry(0.3, 8, 8);
    return geometryCache.smoke;
  },
  get boulder() {
    if (!geometryCache.boulder) geometryCache.boulder = new THREE.DodecahedronGeometry(0.3, 0);
    return geometryCache.boulder;
  },
  get arrow() {
    if (!geometryCache.arrow) {
      const geo = new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8);
      geo.rotateX(Math.PI / 2); // Align with Z axis for lookAt
      geometryCache.arrow = geo;
    }
    return geometryCache.arrow;
  },
  get water() {
    if (!geometryCache.water) geometryCache.water = new THREE.CircleGeometry(0.92, 6);
    return geometryCache.water;
  },
  get waterfall() {
    if (!geometryCache.waterfall) geometryCache.waterfall = new THREE.CylinderGeometry(0.93, 0.93, 2.0, 6, 1, true);
    return geometryCache.waterfall;
  }
};

// --- Material Cache ---

const materialCache: Record<string, THREE.Material> = {};

/**
 * Shader material creator for water surface
 */
export const createWaterSurfaceMaterial = () => {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      color: { value: new THREE.Color('#8eaecf') } // Same as waterfall
    },
    vertexShader: `
      attribute float selection;
      varying vec2 vUv;
      varying vec3 vPosition;
      varying float vSelection;
      uniform float time;
      void main() {
        vUv = uv;
        vPosition = position;
        vSelection = selection;
        
        vec3 pos = position;
        // Wavier displacement: Higher amplitude (0.025) and multiple octaves
        // Scale increased 2x (frequencies halved: 12->6, 24->12)
        float w1 = sin(pos.x * 6.0 + time * 0.8) * cos(pos.y * 6.0 + time * 0.8);
        float w2 = sin(pos.x * 12.0 - time * 0.4) * cos(pos.y * 12.0 - time * 0.4) * 0.5;
        pos.z += (w1 + w2) * 0.04;
        
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec3 color;
      varying vec2 vUv;
      varying vec3 vPosition;
      varying float vSelection;

      float random(vec2 st) {
          return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
      }

      void main() {
        // Complex wave pattern for color variation (frequencies halved to increase scale)
        float w1 = sin(vPosition.x * 6.0 + time * 0.8) * cos(vPosition.y * 6.0 + time * 0.8);
        float w2 = sin(vPosition.x * 12.0 - time * 0.4) * cos(vPosition.y * 12.0 - time * 0.4) * 0.5;
        float wave = (w1 + w2);
        
        // Waterfall color logic
        vec3 finalColor = color;
        finalColor.g += 0.08;
        finalColor.b -= 0.02;
        
        // Add streak/texture logic from waterfall adapted for surface
        // Bigger pixels: halved texture density (30->15)
        vec2 uv = vUv;
        uv.x += time * 0.05;
        uv.y += time * 0.05;
        float streak = random(vec2(floor(uv.x * 15.0), floor(uv.y * 15.0)));
        finalColor += mix(vec3(0.0), vec3(0.15), smoothstep(0.7, 1.0, streak));

        // Highlight peaks (whitecaps) - farther apart and larger
        float whitecap = smoothstep(0.5, 1.2, wave);
        finalColor = mix(finalColor, vec3(1.0), whitecap * 0.8);
        
        // Surface sparkles - bigger pixels (40->20, 20->10)
        float drip = random(vec2(floor(uv.x * 20.0), mod(floor(uv.y * 10.0), 1000.0)));
        if (drip > 0.97) {
            finalColor += vec3(0.4);
        }
        
        // Edge foam
        float dist = distance(vUv, vec2(0.5));
        float foam = smoothstep(0.44, 0.5, dist);
        finalColor = mix(finalColor, vec3(0.9, 0.95, 1.0), foam * 0.6);
        
        gl_FragColor = vec4(finalColor * 1.1 + vSelection * vec3(0.27), 1.0);
      }
    `,
    transparent: false
  });
};

/**
 * Shader material creator for waterfall
 */
export const createWaterfallMaterial = () => {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      color: { value: new THREE.Color('#8eaecf') }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec3 color;
      varying vec2 vUv;
      float random(vec2 st) {
          return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
      }
      void main() {
        vec2 uv = vUv;
        uv.y += time * 0.8;
        float streak = random(vec2(floor(vUv.x * 30.0), 0.0));
        float drip = random(vec2(floor(vUv.x * 40.0), mod(floor(uv.y * 15.0), 1000.0)));
        
        vec3 waterColor = color;
        waterColor.g += 0.08;
        waterColor.b -= 0.02;
        
        // Use the streak and drip logic to vary color instead of alpha
        float brightness = 0.8 + 0.4 * smoothstep(0.2, 0.8, streak);
        if (drip > 0.92) brightness += 0.3;
        
        gl_FragColor = vec4(waterColor * brightness, 1.0);
      }
    `,
    transparent: false,
    side: THREE.DoubleSide
  });
};

export const MATERIALS = {
  get possibleMove() {
    if (!materialCache.possibleMove) {
      materialCache.possibleMove = new THREE.MeshBasicMaterial({ color: "white", transparent: true, opacity: 0.5 });
    }
    return materialCache.possibleMove as THREE.MeshBasicMaterial;
  },
  get forestMove() {
    if (!materialCache.forestMove) {
      materialCache.forestMove = new THREE.MeshBasicMaterial({ color: '#22c55e', transparent: true, opacity: 0.8 });
    }
    return materialCache.forestMove as THREE.MeshBasicMaterial;
  },
  get attackIndicator() {
    if (!materialCache.attackIndicator) {
      materialCache.attackIndicator = new THREE.MeshBasicMaterial({ color: "#ef4444", transparent: true, opacity: 0.5, side: THREE.DoubleSide });
    }
    return materialCache.attackIndicator as THREE.MeshBasicMaterial;
  },
  get actionDot() {
    if (!materialCache.actionDot) {
      materialCache.actionDot = new THREE.MeshBasicMaterial({ color: "#22c55e" });
    }
    return materialCache.actionDot as THREE.MeshBasicMaterial;
  },
  get opportunity() {
    if (!materialCache.opportunity) {
      materialCache.opportunity = new THREE.MeshBasicMaterial({ color: "#22c55e", transparent: true, opacity: 0.6 });
    }
    return materialCache.opportunity as THREE.MeshBasicMaterial;
  },
  get threat() {
    if (!materialCache.threat) {
      materialCache.threat = new THREE.MeshBasicMaterial({ color: "#ef4444", transparent: true, opacity: 0.6 });
    }
    return materialCache.threat as THREE.MeshBasicMaterial;
  },
  get spark() {
    if (!materialCache.spark) {
      materialCache.spark = new THREE.MeshBasicMaterial({ color: "#fbbf24", transparent: true, opacity: 0.9 });
    }
    return materialCache.spark as THREE.MeshBasicMaterial;
  },
  get smoke() {
    if (!materialCache.smoke) {
      materialCache.smoke = new THREE.MeshStandardMaterial({ color: "#555555", transparent: true, opacity: 0.6 });
    }
    return materialCache.smoke as THREE.MeshStandardMaterial;
  },
  get boulder() {
    if (!materialCache.boulder) {
      materialCache.boulder = new THREE.MeshStandardMaterial({ color: "#444444" });
    }
    return materialCache.boulder as THREE.MeshStandardMaterial;
  },
  get arrow() {
    if (!materialCache.arrow) {
      materialCache.arrow = new THREE.MeshStandardMaterial({ color: "#8b4513" });
    }
    return materialCache.arrow as THREE.MeshStandardMaterial;
  },
  get attackTarget() {
    if (!materialCache.attackTarget) {
      materialCache.attackTarget = new THREE.MeshBasicMaterial({ color: "#ef4444", transparent: true, opacity: 0.2, wireframe: true });
    }
    return materialCache.attackTarget as THREE.MeshBasicMaterial;
  },
  get sky() {
    if (!materialCache.sky) {
      materialCache.sky = new THREE.ShaderMaterial({
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
            float h = smoothstep(-1.0, 0.4, direction.y);
            vec3 color = mix(colorBottom, colorTop, h);
            gl_FragColor = vec4(color, 1.0);
          }
        `
      });
    }
    return materialCache.sky as THREE.ShaderMaterial;
  },
  getPlayer(color: string) {
    const key = `player_${color}`;
    if (!materialCache[key]) {
      materialCache[key] = new THREE.MeshStandardMaterial({ color });
    }
    return materialCache[key] as THREE.MeshStandardMaterial;
  },
  getPlayerBasic(color: string) {
    const key = `player_basic_${color}`;
    if (!materialCache[key]) {
      materialCache[key] = new THREE.MeshBasicMaterial({ color });
    }
    return materialCache[key] as THREE.MeshBasicMaterial;
  },
  get forest() {
    if (!materialCache.forest) materialCache.forest = new THREE.MeshStandardMaterial({ color: "#044738" });
    return materialCache.forest as THREE.MeshStandardMaterial;
  },
  get vine() {
    if (!materialCache.vine) materialCache.vine = new THREE.MeshStandardMaterial({ color: "#066342" });
    return materialCache.vine as THREE.MeshStandardMaterial;
  },
  get mountain() {
    if (!materialCache.mountain) {
      materialCache.mountain = new THREE.ShaderMaterial({
        uniforms: {
          colorBase: { value: new THREE.Color("#676767") },
          colorSnow: { value: new THREE.Color("#f0f0f0") }
        },
        vertexShader: `
          varying vec3 vPosition;
          void main() {
            vPosition = position;
            #ifdef USE_INSTANCING
              gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
            #else
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            #endif
          }
        `,
        fragmentShader: `
          uniform vec3 colorBase;
          uniform vec3 colorSnow;
          varying vec3 vPosition;
          void main() {
            float h = vPosition.y; 
            float snow = smoothstep(-0.1, 0.35, h);
            vec3 color = mix(colorBase, colorSnow, snow);
            gl_FragColor = vec4(color, 1.0);
          }
        `
      });
    }
    return materialCache.mountain as THREE.ShaderMaterial;
  },
  get castle() {
    if (!materialCache.castle) materialCache.castle = new THREE.MeshStandardMaterial({ color: "#d1d5db" });
    return materialCache.castle as THREE.MeshStandardMaterial;
  },
  get castleTower() {
    if (!materialCache.castleTower) materialCache.castleTower = new THREE.MeshStandardMaterial({ color: "#9ca3af" });
    return materialCache.castleTower as THREE.MeshStandardMaterial;
  },
  get castleRoof() {
    if (!materialCache.castleRoof) materialCache.castleRoof = new THREE.MeshStandardMaterial({ color: "#b45309" });
    return materialCache.castleRoof as THREE.MeshStandardMaterial;
  },
  get mineBase() {
    if (!materialCache.mineBase) materialCache.mineBase = new THREE.MeshStandardMaterial({ color: "#1c1917" });
    return materialCache.mineBase as THREE.MeshStandardMaterial;
  },
  get gold() {
    if (!materialCache.gold) materialCache.gold = new THREE.MeshStandardMaterial({ color: "#fbbf24", metalness: 0.8, roughness: 0.2 });
    return materialCache.gold as THREE.MeshStandardMaterial;
  },
  get villageWood() {
    if (!materialCache.villageWood) materialCache.villageWood = new THREE.MeshStandardMaterial({ color: "#873e06" });
    return materialCache.villageWood as THREE.MeshStandardMaterial;
  }
};

// --- Shared Logic ---

/**
 * Calculates current opacity for a pulsating effect.
 */
export const getPulsatingOpacity = (frequency = 3, minOpacity = 0.25, maxOpacity = 0.75) => {
  const t = performance.now() / 1000;
  const range = maxOpacity - minOpacity;
  return minOpacity + range * (Math.sin(t * frequency) * 0.5 + 0.5);
};
