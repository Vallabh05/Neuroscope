import React, { useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import type { RegionVolume, SegmentationResult } from '../../types';
import {
  createBrainSurface,
  createLabelSurfaces,
  computeTumorAnatomy,
  volumeCenterWorld,
  volumeWorldExtent,
} from '../../utils/surface';
import { Brain, Crosshair, Eye, EyeOff, Grid3X3, Layers, MapPin, RotateCcw } from 'lucide-react';

interface ThreeBrainViewerProps {
  result: SegmentationResult;
  activeWorldPos: [number, number, number];
  regions: Record<'wt' | 'tc' | 'et', RegionVolume>;
  onToggleRegion: (id: 'wt' | 'tc' | 'et') => void;
  onChangeOpacity: (id: 'wt' | 'tc' | 'et', opacity: number) => void;
}

const RegionSurface: React.FC<{
  geometry: THREE.BufferGeometry;
  region: RegionVolume;
}> = ({ geometry, region }) => (
  <mesh geometry={geometry} visible={region.visible}>
    <meshStandardMaterial
      color={region.color}
      transparent
      opacity={region.opacity}
      side={THREE.DoubleSide}
      depthWrite={region.opacity > 0.7}
      roughness={0.4}
    />
  </mesh>
);

const CameraReset: React.FC<{ trigger: number; distance: number }> = ({ trigger, distance }) => {
  const { camera } = useThree();
  const previous = React.useRef(trigger);
  React.useEffect(() => {
    if (previous.current === trigger) return;
    previous.current = trigger;
    camera.position.set(0, -distance, distance * 0.35);
    camera.up.set(0, 0, 1);
    camera.lookAt(0, 0, 0);
  }, [camera, distance, trigger]);
  return null;
};

export const ThreeBrainViewer: React.FC<ThreeBrainViewerProps> = ({
  result,
  activeWorldPos,
  regions,
  onToggleRegion,
  onChangeOpacity,
}) => {
  const [showCrosshair, setShowCrosshair] = useState(true);
  const [showBrain, setShowBrain] = useState(true);
  const [brainOpacity, setBrainOpacity] = useState(0.18);
  const [showWireframe, setShowWireframe] = useState(false);
  const [resetCameraCount, setResetCameraCount] = useState(0);

  const center = useMemo(() => volumeCenterWorld(result.mask), [result.mask]);
  const extent = useMemo(() => volumeWorldExtent(result.mask), [result.mask]);
  const distance = Math.max(100, extent * 1.8);

  const geometries = useMemo(() => createLabelSurfaces(result.mask), [result.mask]);

  const brainGeometry = useMemo(() => {
    const mri =
      result.modalities?.t1gd ||
      result.modalities?.t1 ||
      result.modalities?.flair ||
      result.modalities?.t2;
    if (!mri) return null;
    return createBrainSurface(mri, { step: 3, smoothIterations: 3 });
  }, [result.modalities]);

  const tumorAnatomy = useMemo(() => computeTumorAnatomy(result), [result]);

  React.useEffect(
    () => () => {
      geometries.wt.dispose();
      geometries.tc.dispose();
      geometries.et.dispose();
      brainGeometry?.dispose();
    },
    [geometries, brainGeometry]
  );

  return (
    <div className="relative w-full h-full min-h-[460px] bg-[#000000] rounded border border-[#222222] overflow-hidden flex flex-col select-none">
      {/* Top Overlays Toolbar: Minimalist Vercel Bar */}
      <div className="absolute top-2.5 left-2.5 right-2.5 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="flex items-center space-x-2">
          <div className="pointer-events-auto flex items-center space-x-2 bg-[#0A0A0A] px-2.5 py-1 rounded border border-[#222222] text-xs font-mono text-neutral-300">
            <Layers className="w-3.5 h-3.5 text-neutral-400" />
            <span className="font-semibold text-white">3D Surface View</span>
            <span className="text-[10px] text-neutral-500">| World mm</span>
          </div>

          {tumorAnatomy && (
            <div className="pointer-events-auto hidden sm:flex items-center space-x-1.5 bg-[#0A0A0A] px-2.5 py-1 rounded border border-[#222222] text-xs font-mono text-neutral-300">
              <MapPin className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-neutral-500">Tumor:</span>
              <span className="font-semibold text-white">{tumorAnatomy.summary}</span>
              <span className="text-[10px] text-neutral-400 bg-[#171717] px-1 py-0.5 rounded border border-[#262626]">
                {tumorAnatomy.depth}
              </span>
            </div>
          )}
        </div>

        <div className="pointer-events-auto flex items-center space-x-1 bg-[#0A0A0A] p-0.5 rounded border border-[#222222]">
          <button
            type="button"
            onClick={() => setShowWireframe(value => !value)}
            className={`p-1.5 rounded transition-colors cursor-pointer ${
              showWireframe
                ? 'bg-[#222222] text-white'
                : 'text-neutral-500 hover:text-white'
            }`}
            title="Toggle brain cortex wireframe"
          >
            <Grid3X3 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setShowCrosshair(value => !value)}
            className={`p-1.5 rounded transition-colors cursor-pointer ${
              showCrosshair
                ? 'bg-[#222222] text-white'
                : 'text-neutral-500 hover:text-white'
            }`}
            title="Toggle 3D coordinate crosshair"
          >
            <Crosshair className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setResetCameraCount(value => value + 1)}
            className="p-1.5 rounded text-neutral-500 hover:text-white transition-colors cursor-pointer"
            title="Reset 3D camera"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Three.js Canvas */}
      <div className="flex-1 w-full min-h-[420px] cursor-grab active:cursor-grabbing">
        <Canvas>
          <PerspectiveCamera
            makeDefault
            position={[0, -distance, distance * 0.35]}
            up={[0, 0, 1]}
            fov={45}
            near={0.1}
            far={distance * 10}
          />
          <CameraReset trigger={resetCameraCount} distance={distance} />
          <ambientLight intensity={0.9} />
          <directionalLight position={[extent, -extent, extent]} intensity={1.3} />
          <directionalLight position={[-extent, extent, -extent / 2]} intensity={0.5} />
          <group position={[-center[0], -center[1], -center[2]]}>
            {/* Anatomical Brain Cortex Shell */}
            {brainGeometry && showBrain && (
              <group>
                <mesh geometry={brainGeometry}>
                  <meshStandardMaterial
                    color="#e2e8f0"
                    transparent
                    opacity={brainOpacity}
                    side={THREE.DoubleSide}
                    depthWrite={false}
                    roughness={0.45}
                    metalness={0.08}
                  />
                </mesh>
                {showWireframe && (
                  <mesh geometry={brainGeometry}>
                    <meshBasicMaterial
                      color="#cbd5e1"
                      wireframe
                      transparent
                      opacity={Math.min(brainOpacity + 0.2, 0.45)}
                      depthWrite={false}
                    />
                  </mesh>
                )}
              </group>
            )}

            {/* Segmented Tumor Volumes */}
            <RegionSurface geometry={geometries.wt} region={regions.wt} />
            <RegionSurface geometry={geometries.tc} region={regions.tc} />
            <RegionSurface geometry={geometries.et} region={regions.et} />

            {/* Crosshair with coordinate axes */}
            {showCrosshair && (
              <group position={[activeWorldPos[0], activeWorldPos[1], activeWorldPos[2]]}>
                <mesh>
                  <sphereGeometry args={[1.2, 12, 12]} />
                  <meshBasicMaterial color="#ffffff" />
                </mesh>
                <axesHelper args={[extent * 0.55]} />
              </group>
            )}
          </group>
          <OrbitControls enableDamping dampingFactor={0.08} />
        </Canvas>
      </div>

      {/* Bottom Region Visibility & Opacity Bar */}
      <div className="absolute bottom-2.5 left-2.5 right-2.5 z-10 pointer-events-none">
        <div className="pointer-events-auto bg-[#0A0A0A] p-2.5 rounded border border-[#222222] max-w-2xl mx-auto flex flex-wrap justify-between items-center gap-3 text-xs font-mono">
          {/* Brain Mesh Controls */}
          <div className="flex items-center space-x-2 border-r border-[#222222] pr-3 mr-1">
            <button
              type="button"
              onClick={() => setShowBrain(value => !value)}
              className={`flex items-center space-x-1.5 px-2 py-1 rounded border transition-colors cursor-pointer ${
                showBrain
                  ? 'border-[#333333] bg-[#141414] text-white'
                  : 'border-[#1C1C1C] bg-[#000000] text-neutral-500'
              }`}
              title="Toggle 3D anatomical brain cortex mesh"
            >
              <Brain className={`w-3.5 h-3.5 ${showBrain ? 'text-neutral-200' : 'text-neutral-600'}`} />
              <span className="font-semibold text-xs">Brain</span>
              {showBrain ? <Eye className="w-3 h-3 text-white" /> : <EyeOff className="w-3 h-3 text-neutral-600" />}
            </button>
            <input
              type="range"
              min="0.05"
              max="0.6"
              step="0.05"
              value={brainOpacity}
              disabled={!showBrain}
              onChange={event => setBrainOpacity(Number(event.target.value))}
              className="w-12 h-1 bg-[#1C1C1C] appearance-none cursor-pointer accent-white disabled:opacity-30"
              title={`Brain surface opacity: ${Math.round(brainOpacity * 100)}%`}
              aria-label="Brain surface opacity"
            />
          </div>

          {/* Tumor Region Controls (WT, TC, ET) */}
          {(['wt', 'tc', 'et'] as const).map(id => (
            <div key={id} className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => onToggleRegion(id)}
                className={`flex items-center space-x-1.5 px-2 py-1 rounded border transition-colors cursor-pointer ${
                  regions[id].visible
                    ? 'border-[#333333] bg-[#141414] text-white'
                    : 'border-[#1C1C1C] bg-[#000000] text-neutral-500'
                }`}
                title={`${regions[id].fullName}: ${regions[id].voxel_count.toLocaleString()} voxels`}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: regions[id].color }}
                />
                <span className="font-semibold text-xs">{regions[id].name}</span>
                {regions[id].visible ? <Eye className="w-3 h-3 text-white" /> : <EyeOff className="w-3 h-3 text-neutral-600" />}
              </button>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={regions[id].opacity}
                disabled={!regions[id].visible}
                onChange={event => onChangeOpacity(id, Number(event.target.value))}
                className="w-12 h-1 bg-[#1C1C1C] appearance-none cursor-pointer accent-white disabled:opacity-30"
                aria-label={`${regions[id].name} opacity`}
              />
            </div>
          ))}
        </div>
      </div>

      <p className="absolute bottom-13 left-2.5 right-2.5 text-center text-[10px] font-mono text-neutral-500 pointer-events-none">
        Interactive 3D tumor segmentation with anatomical brain cortex reference shell (World mm space).
      </p>
    </div>
  );
};

export default ThreeBrainViewer;

