import React, { useEffect, useRef, useState } from 'react';
import type {
  JobStage,
  ModalityVolumes,
  RegionVolume,
  IntegrityPassport,
  SegmentationResult,
  UploadSlotsState,
} from './types';
import { apiService } from './services/api';
import { parseNifti, assertSameGrid } from './utils/nifti';
import { Header, AppTab } from './components/layout/Header';
import { AboutModal } from './components/layout/AboutModal';
import { HomeView } from './components/home/HomeView';
import { UploadWorkspace } from './components/upload/UploadWorkspace';
import { ProcessingView } from './components/processing/ProcessingView';
import { ResultsPage } from './pages/ResultsPage';
import { ReportsView } from './components/reports/ReportsView';

function region(
  id: RegionVolume['id'],
  fullName: string,
  color: string,
  measurement: { voxel_count: number; volume_mm3: number; volume_cm3: number },
): RegionVolume {
  return {
    id,
    name: id.toUpperCase() as RegionVolume['name'],
    fullName,
    volume_ml: measurement.volume_cm3,
    volume_mm3: measurement.volume_mm3,
    voxel_count: measurement.voxel_count,
    description: `${measurement.voxel_count.toLocaleString()} voxels; labels from the model output.`,
    color,
    visible: true,
    opacity: id === 'wt' ? 0.35 : id === 'tc' ? 0.55 : 0.8,
  };
}

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isBackendConnected, setIsBackendConnected] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [processingStage, setProcessingStage] = useState<JobStage>('idle');
  const [stageDescription, setStageDescription] = useState('');
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [segmentationResult, setSegmentationResult] = useState<SegmentationResult | null>(null);
  const lastSubmittedFiles = useRef<UploadSlotsState | null>(null);
  const requestSequence = useRef(0);

  useEffect(() => {
    let active = true;
    const refreshHealth = async () => {
      const healthy = await apiService.checkHealth();
      if (active) setIsBackendConnected(healthy);
    };
    void refreshHealth();
    const timer = window.setInterval(refreshHealth, 15000);
    return () => {
      active = false;
      window.clearInterval(timer);
      requestSequence.current += 1;
    };
  }, []);

  const handleStartSegmentation = async (slots: UploadSlotsState) => {
    lastSubmittedFiles.current = slots;
    const requestId = ++requestSequence.current;
    setProcessingError(null);
    setIsProcessing(true);
    setActiveTab('cases');
    setProcessingStage('receiving_files');
    setStageDescription('Uploading and validating the four MRI volumes on the backend.');

    try {
      if (!slots.t1.file || !slots.t1gd.file || !slots.t2.file || !slots.flair.file) {
        throw new Error('Select all four required MRI modalities before continuing.');
      }
      const healthy = await apiService.checkHealth();
      setIsBackendConnected(healthy);
      if (!healthy) {
        throw new Error(`Cannot reach FastAPI at ${apiService.getBaseUrl()}. Start the backend and retry.`);
      }

      const created = await apiService.createCase({
        t1: slots.t1.file,
        t1gd: slots.t1gd.file,
        t2: slots.t2.file,
        flair: slots.flair.file,
        referenceMask: slots.reference_mask.file,
      });
      if (requestId !== requestSequence.current) return;
      setActiveCaseId(created.case_id);
      setProcessingStage('running_inference');
      setStageDescription('The backend is executing MONAI SegResNet synchronous segmentation.');
      const segmented = await apiService.segmentCase(created.case_id);
      if (requestId !== requestSequence.current) return;

      setProcessingStage('preparing_outputs');
      setStageDescription('Loading verified label mask and volume geometries into workstation.');
      const [t1, t1gd, t2, flair, maskBlob, reportBlob] = await Promise.all([
        parseNifti(slots.t1.file),
        parseNifti(slots.t1gd.file),
        parseNifti(slots.t2.file),
        parseNifti(slots.flair.file),
        apiService.downloadMask(created.case_id),
        apiService.downloadReport(created.case_id),
      ]);
      const mask = await parseNifti(maskBlob, { labels: true });
      const modalities: ModalityVolumes = { t1, t1gd, t2, flair };
      for (const volume of Object.values(modalities)) assertSameGrid(t1gd, volume);
      assertSameGrid(t1gd, mask);

      const report = JSON.parse(await reportBlob.text()) as IntegrityPassport;
      const metricData = segmented.expert_evaluation?.region_metrics ?? null;
      const result: SegmentationResult = {
        case_id: created.case_id,
        created_at: report.generated_at,
        dimensions: segmented.dimensions,
        voxel_spacing_mm: segmented.spacing_mm,
        affine: mask.affine,
        volumes: {
          wt: region('wt', 'Whole tumour', '#D97706', segmented.region_volumes.whole_tumor),
          tc: region('tc', 'Tumour core', '#DC2626', segmented.region_volumes.tumor_core),
          et: region('et', 'Enhancing tumour', '#0284C7', segmented.region_volumes.enhancing_tumor),
        },
        modalities,
        mask,
        model_identifier: segmented.model_identifier,
        model_device: segmented.device,
        inference_seconds: segmented.inference_seconds,
        warnings: [...new Set([...created.validation_warnings, ...segmented.warnings])],
        expert_metrics: metricData,
        report,
      };
      setSegmentationResult(result);
      setProcessingStage('completed');
      setIsProcessing(false);
      setActiveTab('workstation');
    } catch (error) {
      if (requestId !== requestSequence.current) return;
      const message = error instanceof Error ? error.message : 'Unexpected processing error.';
      setProcessingError(message);
      setProcessingStage('failed');
    }
  };

  const handleStartNewCase = async () => {
    requestSequence.current += 1;
    const caseId = activeCaseId;
    setActiveCaseId(null);
    setSegmentationResult(null);
    setProcessingError(null);
    setProcessingStage('idle');
    setIsProcessing(false);
    lastSubmittedFiles.current = null;
    setActiveTab('cases');
    if (caseId) {
      try {
        await apiService.deleteCase(caseId);
      } catch (error) {
        console.error('Could not delete case from the backend; it will expire automatically.', error);
      }
    }
  };

  const handleRetryProcessing = () => {
    if (lastSubmittedFiles.current) {
      void handleStartSegmentation(lastSubmittedFiles.current);
    } else {
      setIsProcessing(false);
      setActiveTab('cases');
    }
  };

  const handleOpenWorkstation = () => {
    if (segmentationResult) {
      setActiveTab('workstation');
    } else {
      setActiveTab('cases');
    }
  };

  return (
    <div className="min-h-screen bg-atern-bg text-atern-text flex flex-col font-sans antialiased selection:bg-atern-blue selection:text-white">
      <Header
        activeTab={activeTab}
        onTabChange={tab => {
          if (isProcessing && tab !== 'cases') return;
          setActiveTab(tab);
        }}
        onOpenAbout={() => setIsAboutOpen(true)}
        isBackendConnected={isBackendConnected}
        activeCaseId={activeCaseId}
        hasActiveCase={!!segmentationResult}
      />

      <main className="flex-1">
        {/* Section 1: Home View */}
        {activeTab === 'home' && (
          <HomeView
            onOpenWorkstation={handleOpenWorkstation}
            onOpenCases={() => setActiveTab('cases')}
            isBackendConnected={isBackendConnected}
            hasActiveCase={!!segmentationResult}
            activeCaseId={activeCaseId}
          />
        )}

        {/* Section 2: Cases View (Upload & Processing) */}
        {activeTab === 'cases' && (
          isProcessing ? (
            <ProcessingView
              stage={processingStage}
              stageDescription={stageDescription}
              progressPercent={null}
              error={processingError}
              onRetry={handleRetryProcessing}
              onCancel={() => {
                requestSequence.current += 1;
                setIsProcessing(false);
              }}
            />
          ) : (
            <UploadWorkspace
              onStartSegmentation={handleStartSegmentation}
              isBackendConnected={isBackendConnected}
              hasActiveCase={!!segmentationResult}
              activeCaseId={activeCaseId}
              onOpenWorkstation={() => setActiveTab('workstation')}
              onResetCase={() => void handleStartNewCase()}
            />
          )
        )}

        {/* Section 3: Workstation View */}
        {activeTab === 'workstation' && (
          <ResultsPage
            result={segmentationResult}
            onStartNewCase={() => void handleStartNewCase()}
            onOpenCases={() => setActiveTab('cases')}
          />
        )}

        {/* Section 4: Reports View */}
        {activeTab === 'reports' && (
          <ReportsView
            result={segmentationResult}
            onOpenCases={() => setActiveTab('cases')}
            onStartNewCase={() => void handleStartNewCase()}
          />
        )}
      </main>

      {/* About Modal Dialog */}
      <AboutModal isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />
    </div>
  );
};

export default App;
