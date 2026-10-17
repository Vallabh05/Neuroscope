import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, GizmoHelper, GizmoViewport } from '@react-three/drei';
import * as THREE from 'three';
import type { RegionVolume, SegmentationResult } from '../../types';
import {
  createAnatomicalBrainSurface,
  getBrainLobeLandmarks,
  createBrainSurface,
  createLabelSurfaces,
  computeTumorAnatomy,
  volumeCenterWorld,
  volumeWorldExtent,
  type AnatomicalLandmark,
} from '../../utils/surface';
import {
  Brain,
  Crosshair,
  Eye,
  EyeOff,
  Grid3X3,
  Layers,
  MapPin,
  RotateCcw,
  Scissors,
  Compass,
  Info,
  Check,
} from 'lucide-react';

export type ViewPreset = '3d' | 'axial' | 'coronal' | 'sagittal';
export type CutawayMode = 'full' | 'cut_left' | 'cut_right' | 'axial_cut' | 'coronal_cut';
export type BrainSurfaceType = 'anatomical' | 'patient_mri';

interface ThreeBrainViewerProps {
  result: SegmentationResult;
  activeWorldPos: [number, number, number];
  regions: Record<'wt' | 'tc' | 'et', RegionVolume>;
  onToggleRegion: (id: 'wt' | 'tc' | 'et') => void;
  onChangeOpacity: (id: 'wt' | 'tc' | 'et', opacity: number) => void;
  onSelectWorldPos?: (world: [number, number, number]) => void;
}

const RegionSurface: React.FC<{
  geometry: THREE.BufferGeometry;
  region: RegionVolume;
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
}> = ({ geometry, region, onPointerDown }) => (
  <mesh
    geometry={geometry}
    visible={region.visible}
    onPointerDown={onPointerDown}
  >
    <meshStandardMaterial
      color={region.color}
      transparent
      opacity={region.opacity}
      side={THREE.DoubleSide}
      depthWrite={region.opacity > 0.7}
      roughness={0.35}
      metalness={0.1}
    />
  </mesh>
);

const CameraController: React.FC<{
  targetView: ViewPreset;
  distance: number;
  trigger: number;
}> = ({ targetView, distance, trigger }) => {
  const { camera } = useThree();
  const prevTrigger = useRef(trigger);

  useEffect(() => {
    if (prevTrigger.current === trigger && trigger !== 0) return;
    prevTrigger.current = trigger;

    if (targetView === '3d') {
      camera.position.set(0, -distance * 0.9, distance * 0.45);
      camera.up.set(0, 0, 1);
    } else if (targetView === 'axial') {
      // Superior to Inferior (Top-down), Anterior points Up
      camera.position.set(0, 0, distance);
      camera.up.set(0, 1, 0);
    } else if (targetView === 'coronal') {
      // Anterior to Posterior (Front), Superior points Up
      camera.position.set(0, -distance, 0);
      camera.up.set(0, 0, 1);
    } else if (targetView === 'sagittal') {
      // Lateral (Side), Superior points Up
      camera.position.set(distance, 0, 0);
      camera.up.set(0, 0, 1);
    }
    camera.lookAt(0, 0, 0);
  }, [camera, distance, targetView, trigger]);

  return null;
};

// 3D Cardinal anatomical orientation letters
const CardinalIndicators: React.FC<{
  extent: number;
}> = ({ extent }) => {
  const r = extent * 0.62;
  return (
    <group>
      {/* Anterior (+Y in standard world) */}
      <mesh position={[0, r, 0]}>
        <sphereGeometry args={[1.6, 8, 8]} />
        <meshBasicMaterial color="#38bdf8" />
      </mesh>
      {/* Posterior (-Y) */}
      <mesh position={[0, -r, 0]}>
        <sphereGeometry args={[1.6, 8, 8]} />
        <meshBasicMaterial color="#94a3b8" />
      </mesh>
      {/* Left (-X) */}
      <mesh position={[-r, 0, 0]}>
        <sphereGeometry args={[1.6, 8, 8]} />
        <meshBasicMaterial color="#a78bfa" />
      </mesh>
      {/* Right (+X) */}
      <mesh position={[r, 0, 0]}>
        <sphereGeometry args={[1.6, 8, 8]} />
        <meshBasicMaterial color="#a78bfa" />
      </mesh>
      {/* Superior (+Z) */}
      <mesh position={[0, 0, r]}>
        <sphereGeometry args={[1.6, 8, 8]} />
        <meshBasicMaterial color="#34d399" />
      </mesh>
    </group>
  );
};

export const ThreeBrainViewer: React.FC<ThreeBrainViewerProps> = ({
  result,
  activeWorldPos,
  regions,
  onToggleRegion,
  onChangeOpacity,
  onSelectWorldPos,
}) => {
  // View & Camera Controls
  const [viewPreset, setViewPreset] = useState<ViewPreset>('3d');
  const [viewTrigger, setViewTrigger] = useState(0);

  // Anatomy & Cutaway Modes
  const [cutawayMode, setCutawayMode] = useState<CutawayMode>('full');
  const [brainType, setBrainType] = useState<BrainSurfaceType>('anatomical');
  const [showBrain, setShowBrain] = useState(true);
  const [brainOpacity, setBrainOpacity] = useState(0.22);
  const [showWireframe, setShowWireframe] = useState(false);

  // Overlays & Landmarks
  const [showCrosshair, setShowCrosshair] = useState(true);
  const [showLandmarks, setShowLandmarks] = useState(false);
  const [selectedLandmark, setSelectedLandmark] = useState<AnatomicalLandmark | null>(null);

  // Centering & Dimensions in World space
  const center = useMemo(() => volumeCenterWorld(result.mask), [result.mask]);
  const extent = useMemo(() => volumeWorldExtent(result.mask), [result.mask]);
  const distance = Math.max(100, extent * 1.85);

  // 1. Tumor geometries (exact patient AI segmentation)
  const tumorGeometries = useMemo(() => createLabelSurfaces(result.mask), [result.mask]);

  // 2. High-fidelity Anatomical Brain (Left & Right hemispheres, longitudinal fissure, cerebellum, brainstem)
  const mriVolume = result.modalities?.t1gd || result.modalities?.t1 || result.modalities?.flair || result.modalities?.t2 || result.mask;
  const anatomicalBrain = useMemo(() => createAnatomicalBrainSurface(mriVolume), [mriVolume]);

  // 3. Direct patient MRI thresholded surface
  const patientMriBrain = useMemo(() => {
    const mri = result.modalities?.t1gd || result.modalities?.t1 || result.modalities?.flair || result.modalities?.t2;
    if (!mri) return null;
    return createBrainSurface(mri, { step: 3, smoothIterations: 3 });
  }, [result.modalities]);

  // 4. Contextual brain anatomical landmarks
  const landmarks = useMemo(() => getBrainLobeLandmarks(mriVolume), [mriVolume]);

  // 5. Patient tumor anatomical localization
  const tumorAnatomy = useMemo(() => computeTumorAnatomy(result), [result]);

  // Cleanup geometries on unmount
  useEffect(() => () => {
    tumorGeometries.wt.dispose();
    tumorGeometries.tc.dispose();
    tumorGeometries.et.dispose();
    anatomicalBrain.leftHemisphere.dispose();
    anatomicalBrain.rightHemisphere.dispose();
    anatomicalBrain.cerebellum.dispose();
    anatomicalBrain.brainstem.dispose();
    anatomicalBrain.combined.dispose();
    patientMriBrain?.dispose();
  }, [tumorGeometries, anatomicalBrain, patientMriBrain]);

  // Dynamic clipping planes for cutaway modes
  const clippingPlanes = useMemo(() => {
    if (cutawayMode === 'axial_cut') {
      // Cuts superior half at current crosshair Z (relative to center)
      const cutZ = activeWorldPos[2] - center[2];
      return [new THREE.Plane(new THREE.Vector3(0, 0, -1), cutZ)];
    }
    if (cutawayMode === 'coronal_cut') {
      // Cuts anterior half at current crosshair Y (relative to center)
      const cutY = activeWorldPos[1] - center[1];
      return [new THREE.Plane(new THREE.Vector3(0, 1, 0), -cutY)];
    }
    return [];
  }, [cutawayMode, activeWorldPos, center]);

  const handleSelectView = (preset: ViewPreset) => {
    setViewPreset(preset);
    setViewTrigger(c => c + 1);
  };

  const handleResetCamera = () => {
    handleSelectView('3d');
  };

  const handlePointerDownMesh = (e: ThreeEvent<PointerEvent>) => {
    // Intercept click on 3D surface to update 2D orthogonal slices
    e.stopPropagation();
    if ('point' in e && e.point) {
      const p = e.point as THREE.Vector3;
      const worldPoint: [number, number, number] = [
        p.x + center[0],
        p.y + center[1],
        p.z + center[2],
      ];
      onSelectWorldPos?.(worldPoint);
    }
  };

  return (
    <div className="relative w-full h-full min-h-[480px] bg-[#000000] rounded border border-[#222222] overflow-hidden flex flex-col select-none font-sans">
      {/* ── Top Primary Control Bar ── */}
      <div className="absolute top-2.5 left-2.5 right-2.5 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Left: Workstation Title & Tumor Localization Badge */}
        <div className="flex items-center space-x-2">
          <div className="pointer-events-auto flex items-center space-x-2 bg-[#0A0A0A]/90 backdrop-blur-md px-3 py-1.5 rounded border border-[#222222] text-xs font-mono text-neutral-300">
            <Layers className="w-3.5 h-3.5 text-neutral-400" />
            <span className="font-semibold text-white">3D Workstation</span>
            <span className="text-[10px] text-neutral-500">| World mm</span>
          </div>

          {tumorAnatomy && (
            <div className="pointer-events-auto flex items-center space-x-1.5 bg-[#0A0A0A]/90 backdrop-blur-md px-2.5 py-1.5 rounded border border-[#222222] text-xs font-mono text-neutral-300">
              <MapPin className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span className="text-neutral-500">Tumor:</span>
              <span className="font-semibold text-white">{tumorAnatomy.summary}</span>
              <span className="text-[10px] text-neutral-400 bg-[#171717] px-1.5 py-0.5 rounded border border-[#262626]">
                {tumorAnatomy.depth}
              </span>
            </div>
          )}
        </div>

        {/* Right: Camera Perspective Presets (3D, Axial, Coronal, Sagittal, Reset) */}
        <div className="pointer-events-auto flex items-center space-x-1 bg-[#0A0A0A]/90 backdrop-blur-md p-1 rounded border border-[#222222] text-xs font-mono">
          <span className="text-[10px] uppercase text-neutral-500 font-bold px-1.5 mr-0.5">Views</span>
          {(['3d', 'axial', 'coronal', 'sagittal'] as const).map(preset => (
            <button
              key={preset}
              type="button"
              onClick={() => handleSelectView(preset)}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer capitalize ${
                viewPreset === preset
                  ? 'bg-[#222222] text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white hover:bg-[#141414]'
              }`}
              title={`Switch camera to ${preset} perspective`}
            >
              {preset === '3d' ? '3D' : preset}
            </button>
          ))}
          <div className="w-[1px] h-3.5 bg-[#222222] mx-1" />
          <button
            type="button"
            onClick={handleResetCamera}
            className="p-1 rounded text-neutral-400 hover:text-white hover:bg-[#141414] transition-colors cursor-pointer"
            title="Reset 3D camera to default framing"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Secondary Floating Strip: Anatomy Cutaway & Overlay Controls ── */}
      <div className="absolute top-12 left-2.5 z-20 flex flex-wrap items-center gap-1.5 pointer-events-none">
        {/* Cutaway Selector */}
        <div className="pointer-events-auto flex items-center space-x-1 bg-[#0A0A0A]/90 backdrop-blur-md p-1 rounded border border-[#222222] text-xs font-mono">
          <Scissors className="w-3.5 h-3.5 text-neutral-400 ml-1 mr-0.5" />
          <span className="text-[10px] text-neutral-500 uppercase font-semibold mr-1">Cutaway:</span>
          {(
            [
              { id: 'full', label: 'Full Brain' },
              { id: 'cut_left', label: 'Cut Left Hemi' },
              { id: 'cut_right', label: 'Cut Right Hemi' },
              { id: 'axial_cut', label: 'Axial Cut' },
              { id: 'coronal_cut', label: 'Coronal Cut' },
            ] as const
          ).map(mode => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setCutawayMode(mode.id)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                cutawayMode === mode.id
                  ? 'bg-neutral-200 text-black font-semibold'
                  : 'text-neutral-400 hover:text-white hover:bg-[#1A1A1A]'
              }`}
              title={`Internal anatomical cutaway: ${mode.label}`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        {/* Brain Surface Model: Atlas vs Patient MRI */}
        <div className="pointer-events-auto flex items-center space-x-1 bg-[#0A0A0A]/90 backdrop-blur-md p-1 rounded border border-[#222222] text-xs font-mono">
          <Brain className="w-3.5 h-3.5 text-neutral-400 ml-1" />
          <button
            type="button"
            onClick={() => setBrainType('anatomical')}
            className={`px-2 py-0.5 rounded text-[10px] transition-colors cursor-pointer ${
              brainType === 'anatomical'
                ? 'bg-[#222222] text-white font-semibold'
                : 'text-neutral-400 hover:text-white'
            }`}
            title="Anatomical reference brain with cerebral hemispheres, gyri, sulci, and cerebellum"
          >
            Atlas Brain
          </button>
          <button
            type="button"
            onClick={() => setBrainType('patient_mri')}
            className={`px-2 py-0.5 rounded text-[10px] transition-colors cursor-pointer ${
              brainType === 'patient_mri'
                ? 'bg-[#222222] text-white font-semibold'
                : 'text-neutral-400 hover:text-white'
            }`}
            title="Patient-specific boundary contour extracted from MRI sequence"
          >
            Patient MRI
          </button>
        </div>

        {/* Toggles: Landmarks, Crosshairs, Wireframe */}
        <div className="pointer-events-auto flex items-center space-x-1 bg-[#0A0A0A]/90 backdrop-blur-md p-1 rounded border border-[#222222] text-xs font-mono">
          <button
            type="button"
            onClick={() => setShowLandmarks(v => !v)}
            className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] transition-colors cursor-pointer ${
              showLandmarks
                ? 'bg-[#222222] text-cyan-300 font-semibold border border-cyan-800/50'
                : 'text-neutral-400 hover:text-white'
            }`}
            title="Toggle 3D anatomical lobe landmark labels"
          >
            <Compass className="w-3 h-3" />
            <span>Lobe Pins</span>
          </button>
          <button
            type="button"
            onClick={() => setShowCrosshair(v => !v)}
            className={`p-1 rounded transition-colors cursor-pointer ${
              showCrosshair ? 'bg-[#222222] text-white' : 'text-neutral-500 hover:text-white'
            }`}
            title="Toggle 3D coordinate crosshair synced with 2D slices"
          >
            <Crosshair className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setShowWireframe(v => !v)}
            className={`p-1 rounded transition-colors cursor-pointer ${
              showWireframe ? 'bg-[#222222] text-white' : 'text-neutral-500 hover:text-white'
            }`}
            title="Toggle brain cortex wireframe"
          >
            <Grid3X3 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Active Landmark Detail Card ── */}
      {selectedLandmark && (
        <div className="absolute top-22 left-2.5 z-20 pointer-events-auto bg-[#0A0A0A]/95 backdrop-blur-md p-3 rounded border border-cyan-800/60 max-w-xs shadow-2xl text-xs font-mono space-y-1 animate-in fade-in">
          <div className="flex items-center justify-between">
            <span className="font-bold text-cyan-300 text-sm">{selectedLandmark.name}</span>
            <button
              type="button"
              onClick={() => setSelectedLandmark(null)}
              className="text-neutral-500 hover:text-white p-0.5 cursor-pointer"
            >
              ×
            </button>
          </div>
          <p className="text-[11px] text-neutral-300 leading-relaxed font-sans">{selectedLandmark.description}</p>
          <div className="pt-1 flex items-center justify-between text-[10px] text-neutral-500 border-t border-[#1F1F1F]">
            <span>Region: {selectedLandmark.category}</span>
            <span>Hemisphere: {selectedLandmark.hemisphere}</span>
          </div>
        </div>
      )}

      {/* ── Three.js Canvas ── */}
      <div className="flex-1 w-full min-h-[420px] cursor-grab active:cursor-grabbing">
        <Canvas gl={{ localClippingEnabled: true }}>
          <PerspectiveCamera
            makeDefault
            position={[0, -distance * 0.9, distance * 0.45]}
            up={[0, 0, 1]}
            fov={42}
            near={0.5}
            far={distance * 12}
          />
          <CameraController
            targetView={viewPreset}
            distance={distance}
            trigger={viewTrigger}
          />

          <ambientLight intensity={1.1} />
          <directionalLight position={[extent, -extent, extent * 1.2]} intensity={1.4} />
          <directionalLight position={[-extent, extent, -extent * 0.5]} intensity={0.6} />
          <directionalLight position={[0, extent * 1.5, 0]} intensity={0.5} />

          <group position={[-center[0], -center[1], -center[2]]}>
            {/* 1. Anatomical Brain Rendering */}
            {showBrain && (
              <group>
                {brainType === 'anatomical' ? (
                  <group>
                    {/* Left Cerebral Hemisphere */}
                    {cutawayMode !== 'cut_left' && (
                      <mesh
                        geometry={anatomicalBrain.leftHemisphere}
                        onPointerDown={handlePointerDownMesh}
                      >
                        <meshStandardMaterial
                          color="#f1f5f9"
                          transparent
                          opacity={brainOpacity}
                          side={THREE.DoubleSide}
                          depthWrite={false}
                          roughness={0.42}
                          metalness={0.06}
                          clippingPlanes={clippingPlanes}
                          clipShadows
                        />
                      </mesh>
                    )}

                    {/* Right Cerebral Hemisphere */}
                    {cutawayMode !== 'cut_right' && (
                      <mesh
                        geometry={anatomicalBrain.rightHemisphere}
                        onPointerDown={handlePointerDownMesh}
                      >
                        <meshStandardMaterial
                          color="#f1f5f9"
                          transparent
                          opacity={brainOpacity}
                          side={THREE.DoubleSide}
                          depthWrite={false}
                          roughness={0.42}
                          metalness={0.06}
                          clippingPlanes={clippingPlanes}
                          clipShadows
                        />
                      </mesh>
                    )}

                    {/* Cerebellum */}
                    <mesh
                      geometry={anatomicalBrain.cerebellum}
                      onPointerDown={handlePointerDownMesh}
                    >
                      <meshStandardMaterial
                        color="#e2e8f0"
                        transparent
                        opacity={brainOpacity * 0.9}
                        side={THREE.DoubleSide}
                        depthWrite={false}
                        roughness={0.5}
                        clippingPlanes={clippingPlanes}
                      />
                    </mesh>

                    {/* Brainstem */}
                    <mesh
                      geometry={anatomicalBrain.brainstem}
                      onPointerDown={handlePointerDownMesh}
                    >
                      <meshStandardMaterial
                        color="#cbd5e1"
                        transparent
                        opacity={brainOpacity * 0.85}
                        side={THREE.DoubleSide}
                        depthWrite={false}
                        roughness={0.5}
                        clippingPlanes={clippingPlanes}
                      />
                    </mesh>

                    {/* Optional Wireframe overlay */}
                    {showWireframe && (
                      <mesh geometry={anatomicalBrain.combined}>
                        <meshBasicMaterial
                          color="#94a3b8"
                          wireframe
                          transparent
                          opacity={Math.min(brainOpacity + 0.18, 0.45)}
                          depthWrite={false}
                          clippingPlanes={clippingPlanes}
                        />
                      </mesh>
                    )}
                  </group>
                ) : patientMriBrain ? (
                  // Direct Patient MRI surface
                  <group>
                    <mesh
                      geometry={patientMriBrain}
                      onPointerDown={handlePointerDownMesh}
                    >
                      <meshStandardMaterial
                        color="#e2e8f0"
                        transparent
                        opacity={brainOpacity}
                        side={THREE.DoubleSide}
                        depthWrite={false}
                        roughness={0.45}
                        metalness={0.08}
                        clippingPlanes={clippingPlanes}
                      />
                    </mesh>
                    {showWireframe && (
                      <mesh geometry={patientMriBrain}>
                        <meshBasicMaterial
                          color="#cbd5e1"
                          wireframe
                          transparent
                          opacity={Math.min(brainOpacity + 0.2, 0.45)}
                          depthWrite={false}
                          clippingPlanes={clippingPlanes}
                        />
                      </mesh>
                    )}
                  </group>
                ) : null}
              </group>
            )}

            {/* 2. Patient-Specific Segmented Tumour Volumes (WT, TC, ET) */}
            <RegionSurface
              geometry={tumorGeometries.wt}
              region={regions.wt}
              onPointerDown={handlePointerDownMesh}
            />
            <RegionSurface
              geometry={tumorGeometries.tc}
              region={regions.tc}
              onPointerDown={handlePointerDownMesh}
            />
            <RegionSurface
              geometry={tumorGeometries.et}
              region={regions.et}
              onPointerDown={handlePointerDownMesh}
            />

            {/* 3. 3D Anatomical Lobe Landmark Pins */}
            {showLandmarks &&
              landmarks.map(lm => (
                <group key={lm.id} position={lm.worldPos}>
                  <mesh
                    onClick={e => {
                      e.stopPropagation();
                      setSelectedLandmark(lm);
                    }}
                  >
                    <sphereGeometry args={[2.8, 16, 16]} />
                    <meshStandardMaterial
                      color="#06b6d4"
                      emissive="#0891b2"
                      emissiveIntensity={0.8}
                    />
                  </mesh>
                  <mesh>
                    <ringGeometry args={[3.4, 4.4, 16]} />
                    <meshBasicMaterial color="#38bdf8" transparent opacity={0.6} side={THREE.DoubleSide} />
                  </mesh>
                </group>
              ))}

            {/* 4. Coordinate Crosshair linked to 2D Orthogonal Slices */}
            {showCrosshair && (
              <group position={[activeWorldPos[0], activeWorldPos[1], activeWorldPos[2]]}>
                <mesh>
                  <sphereGeometry args={[1.5, 14, 14]} />
                  <meshBasicMaterial color="#ffffff" />
                </mesh>
                <axesHelper args={[extent * 0.55]} />
              </group>
            )}

            {/* 5. Cardinal Direction Indicators */}
            <CardinalIndicators extent={extent} />
          </group>

          {/* Interactive Orientation Navigation Gizmo in Bottom Left */}
          <GizmoHelper alignment="bottom-left" margin={[65, 65]}>
            <GizmoViewport
              axisColors={['#ef4444', '#10b981', '#3b82f6']}
              labelColor="#ffffff"
            />
          </GizmoHelper>

          <OrbitControls
            enableDamping
            dampingFactor={0.08}
            rotateSpeed={0.85}
            minDistance={distance * 0.3}
            maxDistance={distance * 4}
          />
        </Canvas>
      </div>

      {/* ── Bottom Region Visibility, Opacity & Brain Control Bar ── */}
      <div className="absolute bottom-2.5 left-2.5 right-2.5 z-20 pointer-events-none">
        <div className="pointer-events-auto bg-[#0A0A0A]/95 backdrop-blur-md p-2.5 rounded border border-[#222222] max-w-4xl mx-auto flex flex-wrap justify-between items-center gap-3 text-xs font-mono shadow-2xl">
          {/* Brain Shell Controls */}
          <div className="flex items-center space-x-2 border-r border-[#222222] pr-3 mr-1">
            <button
              type="button"
              onClick={() => setShowBrain(v => !v)}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded border transition-colors cursor-pointer ${
                showBrain
                  ? 'border-[#333333] bg-[#141414] text-white'
                  : 'border-[#1C1C1C] bg-[#000000] text-neutral-500'
              }`}
              title="Toggle anatomical 3D brain surface visibility"
            >
              <Brain className={`w-3.5 h-3.5 ${showBrain ? 'text-neutral-200' : 'text-neutral-600'}`} />
              <span className="font-semibold text-xs">Brain Shell</span>
              {showBrain ? <Eye className="w-3 h-3 text-white" /> : <EyeOff className="w-3 h-3 text-neutral-600" />}
            </button>
            <input
              type="range"
              min="0.05"
              max="0.80"
              step="0.05"
              value={brainOpacity}
              disabled={!showBrain}
              onChange={e => setBrainOpacity(Number(e.target.value))}
              className="w-14 h-1 bg-[#1C1C1C] appearance-none cursor-pointer accent-white disabled:opacity-30"
              title={`Brain surface opacity: ${Math.round(brainOpacity * 100)}%`}
              aria-label="Brain opacity"
            />
            <span className="text-[10px] text-neutral-400 w-7">{Math.round(brainOpacity * 100)}%</span>
          </div>

          {/* Tumor Region Controls (WT, TC, ET) with volume & voxel counts */}
          <div className="flex flex-wrap items-center gap-2.5">
            {(['wt', 'tc', 'et'] as const).map(id => (
              <div key={id} className="flex items-center space-x-1.5">
                <button
                  type="button"
                  onClick={() => onToggleRegion(id)}
                  className={`flex items-center space-x-1.5 px-2.5 py-1 rounded border transition-colors cursor-pointer ${
                    regions[id].visible
                      ? 'border-[#333333] bg-[#141414] text-white shadow-sm'
                      : 'border-[#1C1C1C] bg-[#000000] text-neutral-500'
                  }`}
                  title={`${regions[id].fullName}: ${regions[id].voxel_count.toLocaleString()} voxels (${regions[id].volume_ml.toFixed(1)} mL)`}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: regions[id].color }}
                  />
                  <span className="font-semibold text-xs">{regions[id].name}</span>
                  <span className="text-[10px] text-neutral-500 font-normal">
                    {regions[id].volume_ml.toFixed(1)}ml
                  </span>
                  {regions[id].visible ? (
                    <Eye className="w-3 h-3 text-white ml-0.5" />
                  ) : (
                    <EyeOff className="w-3 h-3 text-neutral-600 ml-0.5" />
                  )}
                </button>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={regions[id].opacity}
                  disabled={!regions[id].visible}
                  onChange={e => onChangeOpacity(id, Number(e.target.value))}
                  className="w-12 h-1 bg-[#1C1C1C] appearance-none cursor-pointer accent-white disabled:opacity-30"
                  title={`${regions[id].name} opacity: ${Math.round(regions[id].opacity * 100)}%`}
                  aria-label={`${regions[id].name} opacity`}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Subtitle / Clinical Provenance Note ── */}
      <p className="absolute bottom-13.5 left-2.5 right-2.5 text-center text-[10px] font-mono text-neutral-500 pointer-events-none">
        Contextual Anatomical Reference (SRI24/MNI space) • Patient AI Tumour Segmentation (exact millimeter grid). Click surface to sync 2D slices.
      </p>
    </div>
  );
};

export default ThreeBrainViewer;
