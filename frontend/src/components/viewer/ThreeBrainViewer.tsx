import React, { useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import type { RegionVolume, SegmentationResult } from '../../types';
import { createLabelSurfaces, volumeCenterWorld, volumeWorldExtent } from '../../utils/surface';
import { Crosshair, Eye, EyeOff, Layers, RotateCcw } from 'lucide-react';

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
      roughness={0.42}
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
  const [resetCameraCount, setResetCameraCount] = useState(0);
  const center = useMemo(() => volumeCenterWorld(result.mask), [result.mask]);
  const extent = useMemo(() => volumeWorldExtent(result.mask), [result.mask]);
  const distance = Math.max(100, extent * 1.8);
  const geometries = useMemo(() => createLabelSurfaces(result.mask), [result.mask]);

  React.useEffect(() => () => {
    geometries.wt.dispose();
    geometries.tc.dispose();
    geometries.et.dispose();
  }, [geometries]);

  return (
    <div className="relative w-full h-full min-h-[460px] bg-neuro-950 rounded-2xl border border-neuro-800 overflow-hidden flex flex-col select-none">
      <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between pointer-events-none">
        <div className="pointer-events-auto flex items-center space-x-2 bg-neuro-900/90 px-3 py-1.5 rounded-xl border border-neuro-800 text-xs">
          <Layers className="w-3.5 h-3.5 text-cyan-400" />
          <span className="font-semibold text-slate-200">Predicted mask surface</span>
          <span className="text-[10px] font-mono text-slate-400">| affine world mm</span>
        </div>
        <div className="pointer-events-auto flex items-center space-x-1 bg-neuro-900/90 p-1 rounded-xl border border-neuro-800">
          <button
            onClick={() => setShowCrosshair(value => !value)}
            className="p-1.5 rounded-lg text-cyan-300 hover:bg-neuro-800"
            title="Toggle world-coordinate crosshair"
          >
            <Crosshair className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setResetCameraCount(value => value + 1)}
            className="p-1.5 rounded-lg text-slate-300 hover:bg-neuro-800"
            title="Reset camera"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

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
          <ambientLight intensity={0.75} />
          <directionalLight position={[extent, -extent, extent]} intensity={1.2} />
          <directionalLight position={[-extent, extent, -extent / 2]} intensity={0.45} />
          <group position={[-center[0], -center[1], -center[2]]}>
            <RegionSurface geometry={geometries.wt} region={regions.wt} />
            <RegionSurface geometry={geometries.tc} region={regions.tc} />
            <RegionSurface geometry={geometries.et} region={regions.et} />
            {showCrosshair && (
              <group position={[
                activeWorldPos[0],
                activeWorldPos[1],
                activeWorldPos[2],
              ]}>
                <mesh>
                  <sphereGeometry args={[1.2, 12, 12]} />
                  <meshBasicMaterial color="#38bdf8" />
                </mesh>
                <axesHelper args={[extent * 0.55]} />
              </group>
            )}
          </group>
          <OrbitControls enableDamping dampingFactor={0.08} />
        </Canvas>
      </div>

      <div className="absolute bottom-3 left-3 right-3 z-10 pointer-events-none">
        <div className="pointer-events-auto bg-neuro-900/95 p-3 rounded-2xl border border-neuro-800 shadow-xl max-w-xl mx-auto flex flex-wrap justify-between gap-3 text-xs">
          {(['wt', 'tc', 'et'] as const).map(id => (
            <div key={id} className="flex items-center gap-2">
              <button
                onClick={() => onToggleRegion(id)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border ${
                  regions[id].visible ? 'border-neuro-700 text-white' : 'border-neuro-800 text-slate-500'
                }`}
                title={`${regions[id].fullName}: ${regions[id].voxel_count.toLocaleString()} voxels`}
              >
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: regions[id].color }} />
                <span className="font-bold">{regions[id].name}</span>
                {regions[id].visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              </button>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={regions[id].opacity}
                disabled={!regions[id].visible}
                onChange={event => onChangeOpacity(id, Number(event.target.value))}
                className="w-14 accent-cyan-400 disabled:opacity-30"
                aria-label={`${regions[id].name} opacity`}
              />
            </div>
          ))}
        </div>
      </div>
      <p className="absolute bottom-[4.8rem] left-3 right-3 text-center text-[10px] text-slate-400 pointer-events-none">
        This scene shows the predicted label surfaces only; it is not a rendered brain anatomy.
      </p>
    </div>
  );
};
