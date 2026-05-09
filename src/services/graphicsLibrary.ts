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
  [TerrainType.FORT]: 0.4,
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
  get fortWall() {
    if (!geometryCache.fortWall) geometryCache.fortWall = new THREE.BoxGeometry(0.65, 0.25, 0.15);
    return geometryCache.fortWall;
  },
  get fortTower() {
    if (!geometryCache.fortTower) geometryCache.fortTower = new THREE.CylinderGeometry(0.15, 0.15, 0.4, 6);
    return geometryCache.fortTower;
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
        // Wavier displacement: Higher amplitude (0.08) and multiple octaves
        // Scale increased 2x (frequencies halved: 12->6, 24->12)
        float w1 = sin(pos.x * 6.0 + time * 1.2) * cos(pos.y * 6.0 + time * 1.2);
        float w2 = sin(pos.x * 12.0 - time * 0.6) * cos(pos.y * 12.0 - time * 0.6) * 0.5;
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
        float w1 = sin(vPosition.x * 6.0 + time * 1.2) * cos(vPosition.y * 6.0 + time * 1.2);
        float w2 = sin(vPosition.x * 12.0 - time * 0.6) * cos(vPosition.y * 12.0 - time * 0.6) * 0.5;
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
          uTime: { value: 0.0 },
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
          uniform float uTime;
          varying vec3 vWorldPosition;
          
          vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
          vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}

          float snoise(vec3 v){ 
            const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
            const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

            vec3 i  = floor(v + dot(v, C.yyy) );
            vec3 x0 = v - i + dot(i, C.xxx) ;

            vec3 g = step(x0.yzx, x0.xyz);
            vec3 l = 1.0 - g;
            vec3 i1 = min( g.xyz, l.zxy );
            vec3 i2 = max( g.xyz, l.zxy );

            vec3 x1 = x0 - i1 + 1.0 * C.xxx;
            vec3 x2 = x0 - i2 + 2.0 * C.xxx;
            vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;

            i = mod(i, 289.0 ); 
            vec4 p = permute( permute( permute( 
                       i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                     + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
                     + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

            float n_ = 1.0/7.0; // N=7
            vec3  ns = n_ * D.wyz - D.xzx;

            vec4 j = p - 49.0 * floor(p * ns.z *ns.z);

            vec4 x_ = floor(j * ns.z);
            vec4 y_ = floor(j - 7.0 * x_ );

            vec4 x = x_ *ns.x + ns.yyyy;
            vec4 y = y_ *ns.x + ns.yyyy;
            vec4 h = 1.0 - abs(x) - abs(y);

            vec4 b0 = vec4( x.xy, y.xy );
            vec4 b1 = vec4( x.zw, y.zw );

            vec4 s0 = floor(b0)*2.0 + 1.0;
            vec4 s1 = floor(b1)*2.0 + 1.0;
            vec4 sh = -step(h, vec4(0.0));

            vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
            vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

            vec3 p0 = vec3(a0.xy,h.x);
            vec3 p1 = vec3(a0.zw,h.y);
            vec3 p2 = vec3(a1.xy,h.z);
            vec3 p3 = vec3(a1.zw,h.w);

            vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
            p0 *= norm.x;
            p1 *= norm.y;
            p2 *= norm.z;
            p3 *= norm.w;

            vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
            m = m * m;
            return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                          dot(p2,x2), dot(p3,x3) ) );
          }

          float fbm(vec3 x) {
            float v = 0.0;
            float a = 0.5;
            vec3 shift = vec3(100.0);
            for (int i = 0; i < 2; ++i) {
                v += a * snoise(x);
                x = x * 2.0 + shift;
                a *= 0.5;
            }
            return v;
          }

          void main() {
            vec3 direction = normalize(vWorldPosition);
            // Transition for 79% sky (bottom 21%)
            float h = smoothstep(-0.65, -0.45, direction.y);
            vec3 baseColor = mix(colorBottom, colorTop, h);
            
            float cloudMask = smoothstep(-0.58, -0.2, direction.y);
            
            if (cloudMask > 0.0) {
                // Spherical projection for overhead clouds, shifted down
                float overheadY = max(direction.y + 0.6, 0.01);
                vec3 skyPos = direction * (1.0 / overheadY); 
                skyPos *= 0.8; // Reduced from 1.0 to make clouds another 25% larger

                // Pixelate the sky position for low-res "texture" look
                skyPos = floor(skyPos * 64.0) / 64.0;

                // LAYER 1: Slow, large
                float speed1 = uTime * 0.0125;
                float noise1 = fbm(skyPos + vec3(speed1, 0.0, speed1 * 0.5));
                float cloud1 = smoothstep(-0.1, 0.7, noise1); // Lowered thresholds for +25% density

                // LAYER 2: Fast, high (Simplified to single snoise call for performance)
                float speed2 = uTime * 0.03125;
                float noise2 = snoise(skyPos * 2.5 + vec3(-speed2, 10.0, speed2));
                float cloud2 = smoothstep(0.15, 0.8, noise2); // Lowered thresholds for +25% density

                float totalCloud = cloud1 * 0.8 + cloud2 * 0.4;
                totalCloud = clamp(totalCloud, 0.0, 1.0) * cloudMask; 
                
                vec3 cloudColor = vec3(1.0, 1.0, 1.0); 
                vec3 cloudShaded = mix(baseColor * 1.1, cloudColor, clamp(totalCloud + 0.2, 0.0, 1.0));

                baseColor = mix(baseColor, cloudShaded, clamp(totalCloud * 1.1, 0.0, 1.0));
            }

            gl_FragColor = vec4(baseColor, 1.0);
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
  getColoredCastle(colorValue: string) {
    const key = `castle_${colorValue}`;
    if (!materialCache[key]) {
      materialCache[key] = new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color(colorValue) } },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 color;
          varying vec2 vUv;
          float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
          void main() {
            vec2 uv = vUv * 6.0;
            vec2 id = floor(uv);
            vec2 f = fract(uv);
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
            vec3 stoneColor = color + vec3(var - 0.05);
            gl_FragColor = vec4(mix(color * 0.7, stoneColor, stone), 1.0);
          }
        `
      });
    }
    return materialCache[key] as THREE.ShaderMaterial;
  },
  getColoredCastleTower(colorValue: string) {
    const key = `castleTower_${colorValue}`;
    if (!materialCache[key]) {
      materialCache[key] = new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color(colorValue).multiplyScalar(0.8) } },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 color;
          varying vec2 vUv;
          float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
          void main() {
            vec2 uv = vUv * vec2(4.0, 8.0);
            vec2 id = floor(uv);
            vec2 f = fract(uv);
            float d = 1.0;
            for(int y=-1; y<=1; y++) {
              for(int x=-1; x<=1; x++) {
                vec2 g = vec2(float(x), float(y));
                vec2 o = vec2(hash(id+g), hash(id+g+vec2(0.321, 0.654)));
                vec2 r = g + o - f;
                d = min(d, dot(r, r));
              }
            }
            float stone = smoothstep(0.0, 0.1, sqrt(d));
            float var = hash(id) * 0.1;
            vec3 stoneColor = color + vec3(var - 0.05);
            gl_FragColor = vec4(mix(color * 0.7, stoneColor, stone), 1.0);
          }
        `
      });
    }
    return materialCache[key] as THREE.ShaderMaterial;
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
export const getPulsatingOpacity = (t: number, frequency = 3, minOpacity = 0.25, maxOpacity = 0.75) => {
  const range = maxOpacity - minOpacity;
  return minOpacity + range * (Math.sin(t * frequency) * 0.5 + 0.5);
};
