import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

export interface GlobeTelemetry {
  city: string;
  asn: string;
  lat: string;
  lon: string;
  alt: string;
  doppler: string;
  packets: number;
}

interface ScanBlueprintAnimationProps {
  targetUrl?: string;
  onTelemetryUpdate?: (telemetry: GlobeTelemetry) => void;
}

const DATA_CENTERS = [
  { city: 'SAN FRANCISCO, US', asn: 'AS13335 CLOUDFLARE', latNum: 37.7749, lonNum: -122.4194, latStr: '37.77° N', lonStr: '122.42° W' },
  { city: 'ASHBURN, US-EAST', asn: 'AS16509 AMAZON-02', latNum: 39.0438, lonNum: -77.4874, latStr: '39.04° N', lonStr: '77.49° W' },
  { city: 'FRANKFURT, DE', asn: 'AS24940 HETZNER-AS', latNum: 50.1109, lonNum: 8.6821, latStr: '50.11° N', lonStr: '8.68° E' },
  { city: 'LONDON, UK', asn: 'AS15169 GOOGLE', latNum: 51.5074, lonNum: -0.1278, latStr: '51.51° N', lonStr: '0.13° W' },
  { city: 'SINGAPORE, SG', asn: 'AS45102 ALIBABA', latNum: 1.3521, lonNum: 103.8198, latStr: '1.35° N', lonStr: '103.82° E' },
  { city: 'TOKYO, JP', asn: 'AS2516 KDDI', latNum: 35.6762, lonNum: 139.6503, latStr: '35.68° N', lonStr: '139.65° E' },
];

export function getTargetDataCenter(url?: string) {
  if (!url) return DATA_CENTERS[0];
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = (hash * 31 + url.charCodeAt(i)) | 0;
  }
  return DATA_CENTERS[Math.abs(hash) % DATA_CENTERS.length];
}

function latLonToVector3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
}

export function ScanBlueprintAnimation({
  targetUrl,
  onTelemetryUpdate,
}: ScanBlueprintAnimationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const telemetryCbRef = useRef(onTelemetryUpdate);
  telemetryCbRef.current = onTelemetryUpdate;
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const getSize = () => ({
      w: Math.max(container.clientWidth, 340),
      h: Math.max(container.clientHeight, 360),
    });

    const initialSize = getSize();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, initialSize.w / initialSize.h, 0.1, 100);
    camera.position.set(0, 0.16, 5.55);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(initialSize.w, initialSize.h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    container.appendChild(renderer.domElement);

    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const textures: THREE.Texture[] = [];

    const activeDc = getTargetDataCenter(targetUrl);
    const globeRadius = 1.56;

    // ── 1. Textures ────────────────────────────────────────────────────────
    const loader = new THREE.TextureLoader();
    let loadedCount = 0;
    const onTexReady = () => {
      loadedCount += 1;
      if (loadedCount >= 5) {
        setIsLoaded(true);
      }
    };

    const dayTex = loader.load('/textures/earth_atmos_2048.jpg', onTexReady, undefined, onTexReady);
    const nightTex = loader.load('/textures/earth_lights_2048.png', onTexReady, undefined, onTexReady);
    const normalTex = loader.load('/textures/earth_normal_2048.jpg', onTexReady, undefined, onTexReady);
    const specTex = loader.load('/textures/earth_specular_2048.jpg', onTexReady, undefined, onTexReady);
    const cloudTex = loader.load('/textures/earth_clouds_1024.png', onTexReady, undefined, onTexReady);

    dayTex.colorSpace = THREE.SRGBColorSpace;
    nightTex.colorSpace = THREE.SRGBColorSpace;
    cloudTex.colorSpace = THREE.SRGBColorSpace;
    textures.push(dayTex, nightTex, normalTex, specTex, cloudTex);

    // ── 2. Studio Orbital Lighting ─────────────────────────────────────────
    const sunDirection = new THREE.Vector3(1.15, 0.45, 0.72).normalize();

    const sunLight = new THREE.DirectionalLight(0xfffcf5, 2.9);
    sunLight.position.copy(sunDirection).multiplyScalar(10);
    scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0x00f0ff, 0.9);
    rimLight.position.set(-5, 1, -4);
    scene.add(rimLight);

    const ambientLight = new THREE.AmbientLight(0x162244, 0.85);
    scene.add(ambientLight);

    // ── 3. Planetary Pivot Group ───────────────────────────────────────────
    const rootGroup = new THREE.Group();
    rootGroup.rotation.z = 0.28;
    rootGroup.rotation.x = 0.14;
    scene.add(rootGroup);

    const targetLonRad = -(activeDc.lonNum + 90) * (Math.PI / 180);
    let userYawOffset = 0;
    let userPitchOffset = 0;

    // ── 4. Photorealistic Three.js Surface (Bulletproof Native Shading) ────
    const globeGeo = new THREE.SphereGeometry(globeRadius, 96, 96);
    geometries.push(globeGeo);

    const globeMat = new THREE.MeshPhongMaterial({
      map: dayTex,
      normalMap: normalTex,
      normalScale: new THREE.Vector2(0.75, 0.75),
      specularMap: specTex,
      specular: new THREE.Color(0x5588aa),
      shininess: 22,
    });
    materials.push(globeMat);

    const globeMesh = new THREE.Mesh(globeGeo, globeMat);
    rootGroup.add(globeMesh);

    // ── 5. Night-Side Golden City Lights Layer (Additive, NaN-safe) ────────
    const nightGeo = new THREE.SphereGeometry(globeRadius * 1.003, 64, 64);
    geometries.push(nightGeo);

    const nightMat = new THREE.ShaderMaterial({
      uniforms: {
        uNightTex: { value: nightTex },
        uSunDir: { value: sunDirection },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormalWorld;
        void main() {
          vUv = uv;
          vNormalWorld = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uNightTex;
        uniform vec3 uSunDir;
        varying vec2 vUv;
        varying vec3 vNormalWorld;

        void main() {
          float sunDot = dot(normalize(vNormalWorld), normalize(uSunDir));
          float nightWeight = smoothstep(0.12, -0.32, sunDot);
          vec3 lights = texture2D(uNightTex, vUv).rgb;
          // Suppress dark indigo tint in earth_lights map so only crisp city clusters glow
          vec3 glow = max(lights - vec3(0.08), vec3(0.0)) * vec3(1.4, 1.05, 0.55) * 2.2 * nightWeight;
          gl_FragColor = vec4(glow, 1.0);
        }
      `,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    materials.push(nightMat);

    const nightMesh = new THREE.Mesh(nightGeo, nightMat);
    rootGroup.add(nightMesh);

    // ── 6. Photorealistic Drifting Clouds ──────────────────────────────────
    const cloudGeo = new THREE.SphereGeometry(globeRadius * 1.014, 64, 64);
    geometries.push(cloudGeo);

    const cloudMat = new THREE.MeshLambertMaterial({
      map: cloudTex,
      alphaMap: cloudTex,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    materials.push(cloudMat);

    const cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
    rootGroup.add(cloudMesh);

    // ── 7. Holographic Surface Scan Wave & Coordinate Grid (NaN-safe) ──────
    const scanShellGeo = new THREE.SphereGeometry(globeRadius * 1.021, 64, 64);
    geometries.push(scanShellGeo);

    const scanShellMat = new THREE.ShaderMaterial({
      uniforms: {
        uScanY: { value: 0.0 },
        uRadius: { value: globeRadius * 1.021 },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vPosLocal;
        void main() {
          vUv = uv;
          vPosLocal = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uScanY;
        uniform float uRadius;
        varying vec2 vUv;
        varying vec3 vPosLocal;

        void main() {
          float normY = vPosLocal.y / uRadius;
          float scanDist = abs(normY - uScanY);
          float beamCore = smoothstep(0.022, 0.0, scanDist);
          float beamHalo = smoothstep(0.18, 0.0, scanDist);

          float gridLon = smoothstep(0.96, 0.996, abs(cos(vUv.x * 3.14159265 * 48.0)));
          float gridLat = smoothstep(0.96, 0.996, abs(cos(vUv.y * 3.14159265 * 24.0)));
          float holoGrid = max(gridLon, gridLat);

          vec3 col = vec3(0.0, 0.94, 1.0) * beamCore * 0.95
                   + vec3(0.25, 0.85, 1.0) * holoGrid * (0.04 + beamHalo * 0.65)
                   + vec3(0.61, 0.0, 1.0) * beamHalo * 0.16;

          float alpha = clamp(beamCore * 0.85 + holoGrid * (0.05 + beamHalo * 0.6) + beamHalo * 0.12, 0.0, 1.0);
          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    materials.push(scanShellMat);

    const scanShellMesh = new THREE.Mesh(scanShellGeo, scanShellMat);
    rootGroup.add(scanShellMesh);

    // ── 8. Smooth Outer Rayleigh Atmosphere Rim Halo (Safe pow) ───────────
    const atmoGeo = new THREE.SphereGeometry(globeRadius * 1.15, 64, 64);
    geometries.push(atmoGeo);

    const atmoMat = new THREE.ShaderMaterial({
      uniforms: {
        uSunDir: { value: sunDirection },
      },
      vertexShader: `
        varying vec3 vNormalView;
        varying vec3 vNormalWorld;
        void main() {
          vNormalView = normalize(normalMatrix * normal);
          vNormalWorld = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uSunDir;
        varying vec3 vNormalView;
        varying vec3 vNormalWorld;
        void main() {
          float viewRim = dot(vNormalView, vec3(0.0, 0.0, 1.0));
          float baseGlow = clamp(0.62 - viewRim, 0.0001, 1.0);
          float glow = pow(baseGlow, 3.4);
          float sunBoost = 0.4 + 0.6 * smoothstep(-0.4, 0.6, dot(vNormalWorld, normalize(uSunDir)));
          vec3 atmoColor = mix(vec3(0.12, 0.38, 1.0), vec3(0.0, 0.94, 1.0), 0.65);
          gl_FragColor = vec4(atmoColor, glow * 0.68 * sunBoost);
        }
      `,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    materials.push(atmoMat);

    const atmoMesh = new THREE.Mesh(atmoGeo, atmoMat);
    scene.add(atmoMesh);

    // ── 9. Animated 3D Threat Arcs (TubeGeometry + Photon Pulse Shader) ────
    const targetSurfacePos = latLonToVector3(activeDc.latNum, activeDc.lonNum, globeRadius * 1.008);
    const arcMaterials: THREE.ShaderMaterial[] = [];

    const nodeDotGeo = new THREE.SphereGeometry(0.022, 16, 16);
    geometries.push(nodeDotGeo);
    const nodeDotMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    materials.push(nodeDotMat);

    DATA_CENTERS.forEach((coord, idx) => {
      if (coord.city === activeDc.city) return;
      const startPos = latLonToVector3(coord.latNum, coord.lonNum, globeRadius * 1.008);

      const dot = new THREE.Mesh(nodeDotGeo, nodeDotMat);
      dot.position.copy(startPos);
      rootGroup.add(dot);

      const mid = new THREE.Vector3().addVectors(startPos, targetSurfacePos).multiplyScalar(0.5);
      const chordDist = startPos.distanceTo(targetSurfacePos);
      mid.normalize().multiplyScalar(globeRadius + Math.max(0.28, chordDist * 0.32));

      const curve = new THREE.QuadraticBezierCurve3(startPos, mid, targetSurfacePos);
      const tubeGeo = new THREE.TubeGeometry(curve, 56, 0.0065, 6, false);
      geometries.push(tubeGeo);

      const arcMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uPhase: { value: idx * 0.31 },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform float uPhase;
          varying vec2 vUv;

          void main() {
            float flow = fract(vUv.x - uTime * 0.55 - uPhase);
            float pulse = smoothstep(0.65, 0.98, flow) * (1.0 - smoothstep(0.98, 1.0, flow));
            vec3 baseColor = mix(vec3(0.61, 0.0, 1.0), vec3(0.0, 0.94, 1.0), vUv.x);
            vec3 pulseColor = vec3(0.0, 1.0, 0.55);
            vec3 finalColor = mix(baseColor, pulseColor, pulse * 0.85);
            float alpha = 0.22 + pulse * 0.78;
            gl_FragColor = vec4(finalColor, alpha);
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      materials.push(arcMat);
      arcMaterials.push(arcMat);

      const arcMesh = new THREE.Mesh(tubeGeo, arcMat);
      rootGroup.add(arcMesh);
    });

    // ── 10. Target Beacon Pillar & Surface Pulse Ring ──────────────────────
    const targetNormal = targetSurfacePos.clone().normalize();
    const beaconHeight = 0.34;
    const beaconGeo = new THREE.CylinderGeometry(0.002, 0.022, beaconHeight, 16, 1, true);
    geometries.push(beaconGeo);

    const beaconMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        void main() {
          float fade = pow(max(0.0001, 1.0 - vUv.y), 1.8);
          gl_FragColor = vec4(0.0, 1.0, 0.62, fade * 0.85);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    materials.push(beaconMat);

    const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
    beaconMesh.position.copy(targetNormal.clone().multiplyScalar(globeRadius + beaconHeight * 0.5));
    beaconMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), targetNormal);
    rootGroup.add(beaconMesh);

    const targetCoreGeo = new THREE.SphereGeometry(0.036, 16, 16);
    geometries.push(targetCoreGeo);
    const targetCoreMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
    materials.push(targetCoreMat);
    const targetCore = new THREE.Mesh(targetCoreGeo, targetCoreMat);
    targetCore.position.copy(targetSurfacePos);
    rootGroup.add(targetCore);

    const pingRingGeo = new THREE.RingGeometry(0.045, 0.068, 40);
    geometries.push(pingRingGeo);
    const pingRingMat = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    materials.push(pingRingMat);

    const pingRing = new THREE.Mesh(pingRingGeo, pingRingMat);
    pingRing.position.copy(targetNormal.clone().multiplyScalar(globeRadius * 1.022));
    pingRing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), targetNormal);
    rootGroup.add(pingRing);

    // ── 11. Subtle Deep-Space Orbital Starfield ────────────────────────────
    const starCount = 650;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 4.2 + Math.random() * 5.0;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = r * Math.cos(phi);
    }
    const starsGeo = new THREE.BufferGeometry();
    starsGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    geometries.push(starsGeo);

    const starsMat = new THREE.PointsMaterial({
      color: 0xa5f3fc,
      size: 0.024,
      transparent: true,
      opacity: 0.45,
      sizeAttenuation: true,
    });
    materials.push(starsMat);
    const starField = new THREE.Points(starsGeo, starsMat);
    scene.add(starField);

    // ── 12. Pointer Drag + Subtle Parallax + Resize ────────────────────────
    let isDragging = false;
    let lastPointerX = 0;
    let lastPointerY = 0;
    let hoverNormX = 0;
    let hoverNormY = 0;

    const canvasEl = renderer.domElement;
    canvasEl.style.cursor = 'grab';

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true;
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;
      canvasEl.style.cursor = 'grabbing';
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      hoverNormX = ((e.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
      hoverNormY = -(((e.clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1);

      if (!isDragging) return;
      const dx = e.clientX - lastPointerX;
      const dy = e.clientY - lastPointerY;
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;
      userYawOffset += dx * 0.0065;
      userPitchOffset = Math.max(-0.55, Math.min(0.55, userPitchOffset + dy * 0.0045));
    };

    const onPointerUp = () => {
      isDragging = false;
      canvasEl.style.cursor = 'grab';
    };

    canvasEl.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    const resizeObserver = new ResizeObserver(() => {
      const { w, h } = getSize();
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    const fallbackTimer = setTimeout(() => {
      setIsLoaded(true);
    }, 900);

    // ── 13. 60 FPS Render Loop ─────────────────────────────────────────────
    let frameId = 0;
    const clock = new THREE.Clock();
    let lastTicker = 0;
    let smoothCamX = 0;
    let smoothCamY = 0.2;

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      rootGroup.rotation.y = targetLonRad + elapsed * 0.18 + userYawOffset;
      rootGroup.rotation.x = 0.14 + userPitchOffset;
      cloudMesh.rotation.y = elapsed * 0.032;
      starField.rotation.y = -elapsed * 0.015;

      const scanY = Math.sin(elapsed * 1.15) * 0.92;
      scanShellMat.uniforms.uScanY.value = scanY;

      arcMaterials.forEach((m) => {
        m.uniforms.uTime.value = elapsed;
      });

      const pulsePhase = (elapsed * 0.85) % 1.0;
      const pingScale = 1.0 + pulsePhase * 2.1;
      pingRing.scale.set(pingScale, pingScale, pingScale);
      pingRingMat.opacity = (1.0 - pulsePhase) * 0.85;

      const targetCamX = Math.max(-0.22, Math.min(0.22, hoverNormX * 0.18));
      const targetCamY = 0.2 + Math.max(-0.14, Math.min(0.14, hoverNormY * 0.12));
      smoothCamX += (targetCamX - smoothCamX) * 0.04;
      smoothCamY += (targetCamY - smoothCamY) * 0.04;
      camera.position.x = smoothCamX;
      camera.position.y = smoothCamY;
      camera.lookAt(0, 0, 0);

      if (elapsed - lastTicker > 0.25) {
        lastTicker = elapsed;
        telemetryCbRef.current?.({
          city: activeDc.city,
          asn: activeDc.asn,
          lat: activeDc.latStr,
          lon: activeDc.lonStr,
          alt: 'Live Check',
          doppler: 'X.509 / A-Rec',
          packets: 10,
        });
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      clearTimeout(fallbackTimer);
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      canvasEl.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [targetUrl]);

  return (
    <div className="relative w-full h-[380px] sm:h-[420px] flex items-center justify-center overflow-hidden">
      <div
        ref={containerRef}
        className={`w-full h-full transition-opacity duration-700 ${
          isLoaded ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {!isLoaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center space-y-3 pointer-events-none">
          <div className="w-10 h-10 rounded-full border-2 border-[#00f0ff] border-t-transparent animate-spin shadow-[0_0_18px_rgba(0,240,255,0.4)]" />
          <span className="text-xs font-mono text-cyan-300 tracking-wider">
            Acquiring Orbital Threat Telemetry...
          </span>
        </div>
      )}
    </div>
  );
}
