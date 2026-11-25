import { ChevronDown, ChevronUp, RotateCcw, Stethoscope } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Doctor, HospitalSnapshot, Patient } from '../types';

interface Er3DSceneViewProps {
  snapshot: HospitalSnapshot;
  busyAction: string | null;
  onDispatchNext: (doctorId: string) => Promise<void>;
  onCompleteTreatment: (patientId: string, outcome: 'Discharged' | 'Transferred') => Promise<void>;
}

interface BaySceneBundle {
  group: THREE.Group;
  statusLight: THREE.Mesh;
  statusMat: THREE.MeshStandardMaterial;
  patientGroup: THREE.Group;
  screenMat: THREE.MeshStandardMaterial;
  hitMesh: THREE.Mesh;
}

const DEFAULT_CAMERA_POS = new THREE.Vector3(0, 14.5, 16.5);
const DEFAULT_TARGET = new THREE.Vector3(0, 0.8, 0);

function createFloorTileTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#e8eef2';
  ctx.fillRect(0, 0, 512, 512);

  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 3;
  for (let i = 0; i <= 512; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  ctx.fillStyle = '#dbe4eb';
  for (let x = 0; x < 512; x += 128) {
    for (let y = 0; y < 512; y += 128) {
      ctx.fillRect(x + 2, y + 2, 60, 60);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 5);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createVitalsScreenTexture(
  occupied: boolean,
  priority: number | null,
  hr: number | null,
  spo2: number | null
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = occupied ? '#071521' : '#0f172a';
  ctx.fillRect(0, 0, 256, 160);

  ctx.strokeStyle = occupied ? '#1e3a4c' : '#1e293b';
  ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, 248, 152);

  if (occupied) {
    const waveColor = priority === 1 ? '#ef4444' : priority === 2 ? '#f59e0b' : '#10b981';
    ctx.strokeStyle = waveColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    const midY = 66;
    for (let x = 14; x < 240; x += 2) {
      const local = (x - 14) % 52;
      let y = midY;
      if (local === 16) y = midY - 6;
      else if (local === 20) y = midY + 8;
      else if (local === 24) y = midY - 34;
      else if (local === 28) y = midY + 14;
      else if (local === 36) y = midY - 8;
      if (x === 14) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 20px monospace';
    ctx.fillText(`HR ${hr ?? 82}`, 16, 134);

    ctx.fillStyle = '#34d399';
    ctx.fillText(`SpO2 ${spo2 ?? 98}%`, 122, 134);
  } else {
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('BAY READY', 74, 86);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildAmbulanceModel(): THREE.Group {
  const ambulance = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35, metalness: 0.1 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.4 });
  const redMat = new THREE.MeshStandardMaterial({
    color: 0xdc2626,
    emissive: 0x991b1b,
    emissiveIntensity: 0.45,
    roughness: 0.3,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.15,
    metalness: 0.65,
  });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 });

  // 1. Rear medical box
  const box = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.45, 1.65), bodyMat);
  box.position.set(-0.35, 1.05, 0);
  box.castShadow = true;
  box.receiveShadow = true;
  ambulance.add(box);

  // 2. Front cab
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.15, 1.55), bodyMat);
  cab.position.set(1.5, 0.9, 0);
  cab.castShadow = true;
  ambulance.add(cab);

  // 3. Windshield
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.55, 1.38), glassMat);
  windshield.position.set(2.04, 1.12, 0);
  windshield.rotation.z = -0.18;
  ambulance.add(windshield);

  // 4. Side clinical stripe
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.64, 0.18, 1.68), stripeMat);
  stripe.position.set(-0.35, 0.85, 0);
  ambulance.add(stripe);

  // 5-6. Medical red cross on roof/side
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.48, 1.7), redMat);
  crossV.position.set(-0.4, 1.25, 0);
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.16, 1.7), redMat);
  crossH.position.set(-0.4, 1.25, 0);
  ambulance.add(crossV, crossH);

  // 7. Roof emergency lightbar
  const lightbar = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 1.05), redMat);
  lightbar.position.set(1.25, 1.56, 0);
  ambulance.add(lightbar);

  // 8-11. Four wheels
  const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.24, 18);
  wheelGeo.rotateX(Math.PI / 2);
  const wheelOffsets: Array<[number, number]> = [
    [-1.05, 0.78],
    [-1.05, -0.78],
    [1.45, 0.78],
    [1.45, -0.78],
  ];
  for (const [wx, wz] of wheelOffsets) {
    const wheel = new THREE.Mesh(wheelGeo, tireMat);
    wheel.position.set(wx, 0.32, wz);
    wheel.castShadow = true;
    ambulance.add(wheel);
  }

  return ambulance;
}

function buildHospitalBay(doctorId: string, position: THREE.Vector3): BaySceneBundle {
  const group = new THREE.Group();
  group.position.copy(position);

  const matFloor = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.75 });
  const matFrame = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.45, metalness: 0.55 });
  const matSheet = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.85 });
  const matRail = new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.4, metalness: 0.3 });
  const matHeadwall = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.65 });
  const matPatient = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.7 });

  // 1. Bay floor pad
  const pad = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.06, 4.1), matFloor);
  pad.position.set(0, 0.03, 0);
  pad.receiveShadow = true;
  group.add(pad);

  // Invisible hit mesh for accurate clicking anywhere in bay
  const hitMesh = new THREE.Mesh(
    new THREE.BoxGeometry(3.5, 2.6, 4.1),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitMesh.position.set(0, 1.3, 0);
  hitMesh.userData = { doctorId };
  group.add(hitMesh);

  // 2. Clinical headwall panel
  const headwall = new THREE.Mesh(new THREE.BoxGeometry(3.3, 2.1, 0.18), matHeadwall);
  headwall.position.set(0, 1.05, -1.85);
  headwall.castShadow = true;
  headwall.receiveShadow = true;
  group.add(headwall);

  // 3. Status beacon on headwall
  const statusMat = new THREE.MeshStandardMaterial({
    color: 0x10b981,
    emissive: 0x059669,
    emissiveIntensity: 0.55,
    roughness: 0.3,
  });
  const statusLight = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 0.12), statusMat);
  statusLight.position.set(0, 1.98, -1.72);
  group.add(statusLight);

  // 4. Bed chassis + legs
  const bedBase = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.16, 2.35), matFrame);
  bedBase.position.set(0, 0.48, -0.2);
  bedBase.castShadow = true;
  group.add(bedBase);

  const legGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.48, 10);
  for (const [lx, lz] of [
    [-0.56, -1.2],
    [0.56, -1.2],
    [-0.56, 0.8],
    [0.56, 0.8],
  ]) {
    const leg = new THREE.Mesh(legGeo, matFrame);
    leg.position.set(lx, 0.24, lz);
    group.add(leg);
  }

  // 5. Mattress + pillow
  const mattress = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.2, 2.24), matSheet);
  mattress.position.set(0, 0.66, -0.2);
  mattress.castShadow = true;
  group.add(mattress);

  const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.12, 0.42), matSheet);
  pillow.position.set(0, 0.8, -1.02);
  group.add(pillow);

  // 6. Side safety rails
  const sideRailGeo = new THREE.BoxGeometry(0.06, 0.22, 1.3);
  const railL = new THREE.Mesh(sideRailGeo, matRail);
  railL.position.set(-0.67, 0.8, -0.25);
  const railR = new THREE.Mesh(sideRailGeo, matRail);
  railR.position.set(0.67, 0.8, -0.25);
  group.add(railL, railR);

  // 7. Vitals monitor stand + screen
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 1.45, 12), matFrame);
  stand.position.set(1.12, 0.72, -1.25);
  const monitorHousing = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.44, 0.12), matFrame);
  monitorHousing.position.set(1.12, 1.48, -1.25);
  monitorHousing.rotation.y = -0.35;
  const screenMat = new THREE.MeshStandardMaterial({
    map: createVitalsScreenTexture(false, null, null, null),
    roughness: 0.2,
    emissive: 0x0f172a,
    emissiveIntensity: 0.35,
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.36), screenMat);
  screen.position.set(1.1, 1.48, -1.18);
  screen.rotation.y = -0.35;
  group.add(stand, monitorHousing, screen);

  // 8. IV pole & infusion bag
  const ivPole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 1.85, 8), matFrame);
  ivPole.position.set(-1.05, 0.92, -1.05);
  const ivBag = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.22, 0.08),
    new THREE.MeshStandardMaterial({ color: 0xbae6fd, transparent: true, opacity: 0.85 })
  );
  ivBag.position.set(-0.95, 1.65, -1.05);
  group.add(ivPole, ivBag);

  // 9. Overhead boom exam lamp
  const boomArm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.15), matFrame);
  boomArm.position.set(0, 2.25, -1.1);
  const lampHead = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.34, 0.1, 16),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe0f2fe, emissiveIntensity: 0.4 })
  );
  lampHead.position.set(0, 2.15, -0.55);
  group.add(boomArm, lampHead);

  // 10. Patient silhouette (visible when bay Busy)
  const patientGroup = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.95, 6, 12), matPatient);
  torso.rotation.x = Math.PI / 2;
  torso.position.set(0, 0.86, -0.05);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 14, 14),
    new THREE.MeshStandardMaterial({ color: 0xfde68a, roughness: 0.7 })
  );
  head.position.set(0, 0.92, -0.82);
  patientGroup.add(torso, head);
  patientGroup.visible = false;
  group.add(patientGroup);

  return { group, statusLight, statusMat, patientGroup, screenMat, hitMesh };
}

export function Er3DSceneView({
  snapshot,
  busyAction,
  onDispatchNext,
  onCompleteTreatment,
}: Er3DSceneViewProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const bayBundlesRef = useRef<Record<string, BaySceneBundle>>({});
  const waitingPillarsRef = useRef<THREE.Group | null>(null);
  const selectionRingRef = useRef<THREE.Mesh | null>(null);
  const requestRenderRef = useRef<(() => void) | null>(null);
  const resetCameraFnRef = useRef<(() => void) | null>(null);

  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(
    snapshot.doctors[0]?.id ?? 'DOC-101'
  );
  const [dockCollapsed, setDockCollapsed] = useState(false);

  const patientById = useMemo(
    () => new Map<string, Patient>(snapshot.allPatients.map((p) => [p.id, p])),
    [snapshot.allPatients]
  );

  const selectedDoctor: Doctor | undefined = useMemo(
    () => snapshot.doctors.find((d) => d.id === selectedDoctorId) ?? snapshot.doctors[0],
    [snapshot.doctors, selectedDoctorId]
  );

  const selectedPatient =
    selectedDoctor?.currentPatientId ? patientById.get(selectedDoctor.currentPatientId) ?? null : null;

  // Mount Three.js scene once inside ref container
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 960;
    const height = container.clientHeight || 560;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    const gl = renderer.getContext();
    const rendererInfo = String(gl.getParameter(gl.RENDERER) || '');
    const isSoftwareGl = /SwiftShader|llvmpipe|Software|Microsoft Basic Render/i.test(rendererInfo);

    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#dfe7ee');
    scene.fog = new THREE.Fog('#dfe7ee', 28, 62);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 100);
    camera.position.copy(DEFAULT_CAMERA_POS);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.maxPolarAngle = Math.PI / 2 - 0.08;
    controls.minDistance = 6;
    controls.maxDistance = 30;
    controls.target.copy(DEFAULT_TARGET);
    controls.update();

    // Lighting rig: hemisphere + shadow key + soft fill
    const hemi = new THREE.HemisphereLight(0xf8fafc, 0x94a3b8, 0.75);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.55);
    keyLight.position.set(10, 18, 12);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 45;
    keyLight.shadow.camera.left = -16;
    keyLight.shadow.camera.right = 16;
    keyLight.shadow.camera.top = 14;
    keyLight.shadow.camera.bottom = -14;
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xbae6fd, 0.45);
    fillLight.position.set(-12, 8, -10);
    scene.add(fillLight);

    // Main ER Floor
    const floorTex = createFloorTileTexture();
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 22),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.7, metalness: 0.05 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Perimeter low architectural walls
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.85 });
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(28, 2.8, 0.25), wallMat);
    backWall.position.set(0, 1.4, -9.2);
    backWall.receiveShadow = true;
    scene.add(backWall);

    // Build 6 ER bays arranged in 2 rows of 3
    const bayPositions = [
      new THREE.Vector3(-6.2, 0, -5.2),
      new THREE.Vector3(0, 0, -5.2),
      new THREE.Vector3(6.2, 0, -5.2),
      new THREE.Vector3(-6.2, 0, 1.2),
      new THREE.Vector3(0, 0, 1.2),
      new THREE.Vector3(6.2, 0, 1.2),
    ];

    const hitMeshes: THREE.Mesh[] = [];
    snapshot.doctors.slice(0, 6).forEach((doc, idx) => {
      const pos = bayPositions[idx] ?? new THREE.Vector3((idx - 2) * 4, 0, 4);
      const bundle = buildHospitalBay(doc.id, pos);
      bayBundlesRef.current[doc.id] = bundle;
      hitMeshes.push(bundle.hitMesh);
      scene.add(bundle.group);
    });

    // Waiting Triage Queue Pedestal Zone (right-front)
    const waitingGroup = new THREE.Group();
    waitingGroup.position.set(-6.5, 0, 7.2);
    waitingPillarsRef.current = waitingGroup;
    scene.add(waitingGroup);

    // Ambulance Arrival Pad (front-right)
    const padMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9 });
    const ambulancePad = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.06, 3.8), padMat);
    ambulancePad.position.set(5.8, 0.03, 7.4);
    ambulancePad.receiveShadow = true;
    scene.add(ambulancePad);

    const ambulance = buildAmbulanceModel();
    ambulance.position.set(5.4, 0.06, 7.4);
    scene.add(ambulance);

    // Selection ring mesh
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x0f766e, side: THREE.DoubleSide });
    const selectionRing = new THREE.Mesh(new THREE.RingGeometry(2.15, 2.32, 32), ringMat);
    selectionRing.rotation.x = -Math.PI / 2;
    selectionRing.position.set(bayPositions[0].x, 0.08, bayPositions[0].z);
    selectionRingRef.current = selectionRing;
    scene.add(selectionRing);

    // Raycasting on pointer click
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downX = 0;
    let downY = 0;

    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };

    const onPointerUp = (e: PointerEvent) => {
      const dist = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (dist > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(hitMeshes, false);
      if (hits.length > 0) {
        const hitDocId = hits[0].object.userData?.doctorId;
        if (typeof hitDocId === 'string') {
          setSelectedDoctorId(hitDocId);
          const bundle = bayBundlesRef.current[hitDocId];
          if (bundle) {
            selectionRing.position.set(bundle.group.position.x, 0.08, bundle.group.position.z);
            requestRender();
          }
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    // Rendering orchestration (software-GL safe vs hardware continuous damping)
    let rafId = 0;
    let dirty = true;

    const requestRender = () => {
      dirty = true;
      if (isSoftwareGl && !rafId) {
        rafId = window.requestAnimationFrame(() => {
          rafId = 0;
          controls.update();
          renderer.render(scene, camera);
          dirty = false;
        });
      }
    };
    requestRenderRef.current = requestRender;

    resetCameraFnRef.current = () => {
      camera.position.copy(DEFAULT_CAMERA_POS);
      controls.target.copy(DEFAULT_TARGET);
      controls.update();
      requestRender();
    };

    controls.addEventListener('change', () => {
      requestRender();
    });

    const onResize = () => {
      const w = container.clientWidth || 960;
      const h = container.clientHeight || 560;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };
    window.addEventListener('resize', onResize);
    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
    resizeObserver?.observe(container);

    if (isSoftwareGl) {
      renderer.render(scene, camera);
    } else {
      const tick = () => {
        rafId = window.requestAnimationFrame(tick);
        if (controls.enableDamping) controls.update();
        if (dirty || controls.enableDamping) {
          renderer.render(scene, camera);
          dirty = false;
        }
      };
      rafId = window.requestAnimationFrame(tick);
    }

    return () => {
      window.removeEventListener('resize', onResize);
      resizeObserver?.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      if (rafId) window.cancelAnimationFrame(rafId);
      controls.dispose();
      envTarget.dispose();
      floorTex.dispose();
      renderer.dispose();
      selectionRingRef.current = null;
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Sync 3D floor selection ring whenever selectedDoctor changes (via dock buttons or 3D raycast)
  useEffect(() => {
    const ring = selectionRingRef.current;
    if (!ring || !selectedDoctor) return;
    const bundle = bayBundlesRef.current[selectedDoctor.id];
    if (bundle) {
      ring.visible = true;
      ring.position.set(bundle.group.position.x, 0.08, bundle.group.position.z);
    } else {
      ring.visible = false;
    }
    requestRenderRef.current?.();
  }, [selectedDoctor?.id]);

  // Sync live clinical state into 3D bays & waiting queue pedestals
  useEffect(() => {
    for (const doc of snapshot.doctors) {
      const bundle = bayBundlesRef.current[doc.id];
      if (!bundle) continue;

      const pat = doc.currentPatientId ? patientById.get(doc.currentPatientId) ?? null : null;
      const occupied = doc.status === 'Busy' && pat !== null;
      bundle.patientGroup.visible = occupied;

      if (doc.status === 'Off-Duty') {
        bundle.statusMat.color.setHex(0x94a3b8);
        bundle.statusMat.emissive.setHex(0x475569);
      } else if (occupied && pat?.priority === 1) {
        bundle.statusMat.color.setHex(0xef4444);
        bundle.statusMat.emissive.setHex(0xb91c1c);
      } else if (occupied) {
        bundle.statusMat.color.setHex(0xf59e0b);
        bundle.statusMat.emissive.setHex(0xb45309);
      } else {
        bundle.statusMat.color.setHex(0x10b981);
        bundle.statusMat.emissive.setHex(0x059669);
      }

      const oldTex = bundle.screenMat.map;
      bundle.screenMat.map = createVitalsScreenTexture(
        occupied,
        pat?.priority ?? null,
        pat?.vitals.heartRate ?? null,
        pat?.vitals.spo2 ?? null
      );
      bundle.screenMat.needsUpdate = true;
      oldTex?.dispose();
    }

    // Update waiting queue priority columns (up to 8 visible)
    const waitingGroup = waitingPillarsRef.current;
    if (waitingGroup) {
      while (waitingGroup.children.length > 0) {
        const child = waitingGroup.children[0] as THREE.Mesh;
        waitingGroup.remove(child);
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
      const queued = [...snapshot.emergencyQueue, ...snapshot.standardQueue].slice(0, 8);
      queued.forEach((p, idx) => {
        const color =
          p.priority === 1 ? 0xdc2626 : p.priority === 2 ? 0xd97706 : p.priority === 3 ? 0x0284c7 : 0x0f766e;
        const height = p.priority === 1 ? 1.45 : p.priority === 2 ? 1.15 : p.priority === 3 ? 0.9 : 0.65;
        const pillar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.28, 0.34, height, 14),
          new THREE.MeshStandardMaterial({ color, roughness: 0.4 })
        );
        pillar.position.set((idx % 4) * 1.1, height / 2, Math.floor(idx / 4) * 1.2);
        pillar.castShadow = true;
        waitingGroup.add(pillar);
      });
    }

    requestRenderRef.current?.();
  }, [snapshot, patientById]);

  return (
    <div className="relative h-[calc(100vh-8.5rem)] min-h-[540px] w-full rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
      {/* Three.js Canvas Mount Outside React State Overlays */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Top-Left Minimal Bay Legend & Camera Reset */}
      <div className="absolute top-3 left-3 flex flex-wrap items-center gap-2 pointer-events-auto">
        <div className="px-3 py-1.5 rounded-lg bg-white/95 border border-slate-200 text-xs font-medium text-slate-800 shadow-xs flex items-center gap-3">
          <span className="font-semibold text-slate-900">3D ER Digital Twin</span>
          <span className="text-slate-400">·</span>
          <span className="text-slate-600">Drag to orbit · Click any bay</span>
        </div>
        <button
          type="button"
          onClick={() => resetCameraFnRef.current?.()}
          className="px-2.5 py-1.5 rounded-lg bg-white/95 border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-xs inline-flex items-center gap-1 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset View</span>
        </button>
      </div>

      {/* Compact Collapsible Bottom Dock (<= 15% height) */}
      <div className="absolute bottom-3 left-3 right-3 bg-white/95 border border-slate-200 rounded-xl shadow-sm pointer-events-auto">
        <div className="px-3.5 py-2 flex items-center justify-between gap-2 border-b border-slate-100">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {snapshot.doctors.slice(0, 6).map((doc) => {
              const active = doc.id === selectedDoctor?.id;
              return (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => setSelectedDoctorId(doc.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer transition-colors ${
                    active
                      ? 'bg-teal-700 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {doc.bay}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setDockCollapsed((c) => !c)}
            aria-label="Toggle bay dock"
            className="p-1 text-slate-500 hover:text-slate-800 cursor-pointer shrink-0"
          >
            {dockCollapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {!dockCollapsed && selectedDoctor && (
          <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
                <Stethoscope className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-slate-900 truncate">
                  {selectedDoctor.bay} · {selectedDoctor.name} ({selectedDoctor.status})
                </div>
                <div className="text-slate-600 truncate">
                  {selectedPatient
                    ? `Treating ${selectedPatient.name} (${selectedPatient.mrn}) · P${selectedPatient.priority} · HR ${selectedPatient.vitals.heartRate} bpm · SpO2 ${selectedPatient.vitals.spo2}%`
                    : `${selectedDoctor.specialty} — Bay ready for Min-Heap extraction`}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {selectedDoctor.status === 'Available' && (
                <button
                  type="button"
                  disabled={
                    busyAction === `dispatch-${selectedDoctor.id}` ||
                    snapshot.summary.emergencyWaitingCount + snapshot.summary.standardWaitingCount === 0
                  }
                  onClick={() => onDispatchNext(selectedDoctor.id)}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer disabled:opacity-50"
                >
                  Dispatch Next Patient
                </button>
              )}
              {selectedPatient && (
                <button
                  type="button"
                  disabled={busyAction === `complete-${selectedPatient.id}`}
                  onClick={() => onCompleteTreatment(selectedPatient.id, 'Discharged')}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer disabled:opacity-50"
                >
                  Discharge Patient
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
