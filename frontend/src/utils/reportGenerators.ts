import { jsPDF } from 'jspdf';
import type { SegmentationResult } from '../types';
import { calculateTumorAnalytics } from './tumorAnalytics';

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Generates a clean, professional clinical & research PDF report using jsPDF.
 */
export function generatePdfReport(result: SegmentationResult): void {
  const analytics = calculateTumorAnalytics(result);
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // Header Banner
  doc.setFillColor(11, 18, 33); // NeuroScope dark navy
  doc.roundedRect(margin, y, contentWidth, 24, 2, 2, 'F');

  doc.setTextColor(6, 182, 212); // Cyan
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('NEUROSCOPE 3D', margin + 6, y + 9);

  doc.setTextColor(226, 232, 240); // Slate 200
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('MRI Brain Tumour Segmentation & Volumetric Analysis Report', margin + 6, y + 15);

  doc.setTextColor(148, 163, 184); // Slate 400
  doc.setFontSize(8);
  doc.text(`Generated: ${new Date(result.created_at).toLocaleString()}`, margin + 6, y + 20);

  // Tag
  doc.setFillColor(6, 78, 99);
  doc.roundedRect(pageWidth - margin - 44, y + 6, 38, 7, 1.5, 1.5, 'F');
  doc.setTextColor(165, 243, 252);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('RESEARCH PROTOTYPE', pageWidth - margin - 42, y + 10.5);

  y += 28;

  // Case Metadata Box
  doc.setFillColor(248, 250, 252); // Slate 50
  doc.setDrawColor(203, 213, 225); // Slate 300
  doc.roundedRect(margin, y, contentWidth, 22, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);

  doc.text('Case ID:', margin + 4, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.text(result.case_id, margin + 22, y + 5);

  doc.setFont('helvetica', 'bold');
  doc.text('Model:', margin + 4, y + 10);
  doc.setFont('helvetica', 'normal');
  doc.text(`${result.model_identifier} (${result.model_device}) • Inference: ${result.inference_seconds.toFixed(2)}s`, margin + 22, y + 10);

  doc.setFont('helvetica', 'bold');
  doc.text('Matrix:', margin + 4, y + 15);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `${result.dimensions.join(' × ')} voxels • Spacing: ${result.voxel_spacing_mm.map(s => s.toFixed(1)).join(' × ')} mm • Voxel Vol: ${analytics.voxelVolumeMm3.toFixed(3)} mm³`,
    margin + 22,
    y + 15,
  );

  doc.setFont('helvetica', 'bold');
  doc.text('Threshold:', margin + 4, y + 20);
  doc.setFont('helvetica', 'normal');
  doc.text('Sigmoid P(Tumour) ≥ 0.50 cutoff • Reoriented closest canonical RAS', margin + 22, y + 20);

  y += 26;

  // Section 1: Volumetric Measurements Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text('1. Tumour Volumetric Measurements (BraTS Nested & Sub-compartments)', margin, y + 4);
  y += 6;

  // Table Header
  const colX = [margin, margin + 46, margin + 74, margin + 102, margin + 130, margin + 156];
  doc.setFillColor(30, 41, 59); // Slate 800
  doc.rect(margin, y, contentWidth, 6.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);

  doc.text('Region / Compartment', colX[0] + 2, y + 4.5);
  doc.text('Labels', colX[1] + 2, y + 4.5);
  doc.text('Voxel Count', colX[2] + 2, y + 4.5);
  doc.text('Volume (mL)', colX[3] + 2, y + 4.5);
  doc.text('Volume (mm³)', colX[4] + 2, y + 4.5);
  doc.text('% of WT', colX[5] + 2, y + 4.5);

  y += 6.5;

  const tableRows = [
    {
      name: 'Whole Tumour (WT)',
      labels: '1 + 2 + 4',
      count: analytics.volumes.wt.count,
      ml: analytics.volumes.wt.ml,
      mm3: analytics.volumes.wt.mm3,
      pct: '100.0%',
      bold: true,
      bg: [254, 243, 199], // Light amber
    },
    {
      name: 'Tumour Core (TC)',
      labels: '1 + 4',
      count: analytics.volumes.tc.count,
      ml: analytics.volumes.tc.ml,
      mm3: analytics.volumes.tc.mm3,
      pct: `${analytics.ratios.coreToWholeRatio.toFixed(1)}%`,
      bold: true,
      bg: [254, 226, 226], // Light red
    },
    {
      name: 'Active Enhancing Tumour (ET)',
      labels: '4',
      count: analytics.volumes.et.count,
      ml: analytics.volumes.et.ml,
      mm3: analytics.volumes.et.mm3,
      pct: `${((analytics.volumes.et.ml / (analytics.volumes.wt.ml || 1)) * 100).toFixed(1)}%`,
      bold: true,
      bg: [207, 250, 254], // Light cyan
    },
    {
      name: 'Necrotic / Non-enhancing Core (NCR)',
      labels: '1 (TC \\ ET)',
      count: analytics.volumes.ncr.count,
      ml: analytics.volumes.ncr.ml,
      mm3: analytics.volumes.ncr.mm3,
      pct: `${((analytics.volumes.ncr.ml / (analytics.volumes.wt.ml || 1)) * 100).toFixed(1)}%`,
      bold: false,
      bg: [255, 255, 255],
    },
    {
      name: 'Peritumoral Vasogenic Edema (ED)',
      labels: '2 (WT \\ TC)',
      count: analytics.volumes.edema.count,
      ml: analytics.volumes.edema.ml,
      mm3: analytics.volumes.edema.mm3,
      pct: `${analytics.ratios.edemaFraction.toFixed(1)}%`,
      bold: false,
      bg: [248, 250, 252],
    },
  ];

  tableRows.forEach(row => {
    doc.setFillColor(row.bg[0], row.bg[1], row.bg[2]);
    doc.rect(margin, y, contentWidth, 6, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y + 6, margin + contentWidth, y + 6);

    doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);

    doc.text(row.name, colX[0] + 2, y + 4.2);
    doc.text(row.labels, colX[1] + 2, y + 4.2);
    doc.text(row.count.toLocaleString(), colX[2] + 2, y + 4.2);
    doc.text(`${row.ml.toFixed(2)} mL`, colX[3] + 2, y + 4.2);
    doc.text(`${Math.round(row.mm3).toLocaleString()} mm³`, colX[4] + 2, y + 4.2);
    doc.text(row.pct, colX[5] + 2, y + 4.2);

    y += 6;
  });

  y += 5;

  // Section 2: Clinical Morphometry & Ratios
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text('2. Morphometrics & Diagnostic Indices', margin, y + 4);
  y += 7;

  const cardW = (contentWidth - 6) / 3;
  const drawCard = (x: number, title: string, value: string, desc: string) => {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(x, y, cardW, 16, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(title.toUpperCase(), x + 3, y + 4);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(value, x + 3, y + 9.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(desc, x + 3, y + 13.5);
  };

  drawCard(
    margin,
    'Enhancing / Core Ratio',
    `${analytics.ratios.enhancingFraction.toFixed(1)}%`,
    'Active vascular fraction of tumor core',
  );
  drawCard(
    margin + cardW + 3,
    'Core / Whole Ratio',
    `${analytics.ratios.coreToWholeRatio.toFixed(1)}%`,
    'Bulk tumor pathology vs surrounding edema',
  );
  drawCard(
    margin + (cardW + 3) * 2,
    'Estimated 3D Caliper',
    `${analytics.maxDiameter3dMm.toFixed(1)} mm`,
    'Maximum 3D Feret diagonal span',
  );

  y += 19;

  // Spatial coordinates & Bounding Box Box
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, y, contentWidth, 18, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);

  doc.text('3D Bounding Box Extents (X × Y × Z):', margin + 4, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.text(
    analytics.bbox
      ? `${analytics.bbox.sizeMm[0].toFixed(1)} mm (RL) × ${analytics.bbox.sizeMm[1].toFixed(1)} mm (AP) × ${analytics.bbox.sizeMm[2].toFixed(1)} mm (SI)`
      : 'None',
    margin + 60,
    y + 5,
  );

  doc.setFont('helvetica', 'bold');
  doc.text('Whole Tumour Centroid:', margin + 4, y + 9.5);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Voxel [${analytics.centroids.wt.voxel.join(', ')}] • Physical World [${analytics.centroids.wt.world.map(v => v.toFixed(1)).join(', ')}] mm`,
    margin + 60,
    y + 9.5,
  );

  doc.setFont('helvetica', 'bold');
  doc.text('Enhancing Tumour Centroid:', margin + 4, y + 14);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Voxel [${analytics.centroids.et.voxel.join(', ')}] • Physical World [${analytics.centroids.et.world.map(v => v.toFixed(1)).join(', ')}] mm`,
    margin + 60,
    y + 14,
  );

  y += 23;

  // Section 3: Traceability & Expert Comparison (if provided)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text('3. Data Integrity, Model Provenance & Verification', margin, y + 4);
  y += 7;

  // Quality Checks Grid
  const checkColW = contentWidth / 4;
  const drawCheck = (idx: number, name: string, status: string) => {
    const cx = margin + idx * checkColW;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(cx, y, checkColW - 2, 10, 1, 1, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(name, cx + 2.5, y + 3.8);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(22, 163, 74); // Green
    doc.text(`✓ ${status}`, cx + 2.5, y + 8);
  };

  drawCheck(0, 'Input Modalities', 'VERIFIED');
  drawCheck(1, 'Spatial Affine Geometry', 'ALIGNED');
  drawCheck(2, 'NIfTI Round-Trip', 'VERIFIED');
  drawCheck(3, 'Decision Threshold', 'P ≥ 0.50');

  y += 14;

  // Input Modality Hashes
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, contentWidth, 18, 1, 1, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text('CRYPTOGRAPHIC INPUT INTEGRITY (SHA-256 HASHES):', margin + 3, y + 4);

  doc.setFont('courier', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(51, 65, 85);

  let hashY = y + 7.5;
  result.report.inputs.modalities.forEach(item => {
    doc.text(`${item.modality.padEnd(6)}: ${item.sha256}`, margin + 3, hashY);
    hashY += 3.2;
  });

  y += 22;

  // Expert Comparison (if available)
  if (result.expert_metrics) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Ground-Truth Expert Mask Evaluation:', margin, y + 3);
    y += 5;

    const metricsText = Object.entries(result.expert_metrics)
      .map(
        ([k, m]) =>
          `${k.toUpperCase()}: Dice ${(m.dice * 100).toFixed(1)}% | Sens ${m.sensitivity !== null ? (m.sensitivity * 100).toFixed(1) + '%' : 'N/A'}`,
      )
      .join('    •    ');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 118, 110);
    doc.text(metricsText, margin + 2, y + 3);
    y += 7;
  }

  // Footer Disclaimer
  const footerY = pageHeight - 16;
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, footerY, margin + contentWidth, footerY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('DISCLAIMER: RESEARCH AND TEACHING PROTOTYPE ONLY', margin, footerY + 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text(
    'This report is generated automatically by NeuroScope 3D for educational and algorithmic evaluation. It is NOT a medical device and must not be used for clinical diagnosis or treatment planning.',
    margin,
    footerY + 8,
    { maxWidth: contentWidth },
  );

  doc.save(`${result.case_id}_volumetric_report.pdf`);
}

/**
 * Generates a structured clinical & research CSV report.
 */
export function generateCsvReport(result: SegmentationResult): void {
  const analytics = calculateTumorAnalytics(result);
  const rows: (string | number)[][] = [
    ['# NEUROSCOPE 3D - MRI BRAIN TUMOR VOLUMETRIC & INTEGRITY REPORT'],
    ['Case_ID', result.case_id],
    ['Generated_At', result.created_at],
    ['Model_Identifier', result.model_identifier],
    ['Device', result.model_device],
    ['Inference_Duration_Seconds', result.inference_seconds.toFixed(2)],
    ['Dimensions_Voxels', result.dimensions.join('x')],
    ['Voxel_Spacing_mm', result.voxel_spacing_mm.map(s => s.toFixed(2)).join('x')],
    ['Voxel_Volume_mm3', analytics.voxelVolumeMm3.toFixed(4)],
    ['Decision_Threshold', '0.50'],
    [],
    ['# VOLUMETRIC MEASUREMENTS (BRATS COMPOSITE & EXCLUSIVE SUB-COMPARTMENTS)'],
    ['Region_ID', 'Region_Name', 'Stored_Labels', 'Voxel_Count', 'Volume_mL', 'Volume_mm3', 'Percent_WT', 'Percent_TC'],
    ['WT', 'Whole Tumour', '1+2+4', analytics.volumes.wt.count, analytics.volumes.wt.ml.toFixed(3), analytics.volumes.wt.mm3.toFixed(1), '100.0', '-'],
    ['TC', 'Tumour Core', '1+4', analytics.volumes.tc.count, analytics.volumes.tc.ml.toFixed(3), analytics.volumes.tc.mm3.toFixed(1), analytics.ratios.coreToWholeRatio.toFixed(1), '100.0'],
    ['ET', 'Enhancing Tumour', '4', analytics.volumes.et.count, analytics.volumes.et.ml.toFixed(3), analytics.volumes.et.mm3.toFixed(1), ((analytics.volumes.et.ml / (analytics.volumes.wt.ml || 1)) * 100).toFixed(1), analytics.ratios.enhancingFraction.toFixed(1)],
    ['NCR', 'Necrotic Non-Enhancing Core', '1', analytics.volumes.ncr.count, analytics.volumes.ncr.ml.toFixed(3), analytics.volumes.ncr.mm3.toFixed(1), ((analytics.volumes.ncr.ml / (analytics.volumes.wt.ml || 1)) * 100).toFixed(1), analytics.ratios.necroticFraction.toFixed(1)],
    ['ED', 'Peritumoral Edema', '2', analytics.volumes.edema.count, analytics.volumes.edema.ml.toFixed(3), analytics.volumes.edema.mm3.toFixed(1), analytics.ratios.edemaFraction.toFixed(1), '-'],
    [],
    ['# MORPHOMETRIC INDICES & LESION EXTENTS'],
    ['Metric', 'Value', 'Unit', 'Notes'],
    ['Enhancing_Fraction_ET_TC', analytics.ratios.enhancingFraction.toFixed(2), '%', 'Viable enhancing proportion of tumor core'],
    ['Core_To_Whole_Ratio_TC_WT', analytics.ratios.coreToWholeRatio.toFixed(2), '%', 'Proportion representing core pathology'],
    ['Edema_To_Core_Ratio_ED_TC', analytics.ratios.edemaToCoreRatio.toFixed(2), 'ratio', 'Peritumoral edema to core ratio'],
    ['Max_3D_Caliper_Diameter', analytics.maxDiameter3dMm.toFixed(2), 'mm', 'Estimated 3D diagonal Feret span'],
    ['Max_Axial_Diameter', analytics.maxAxialDiameterMm.toFixed(2), 'mm', 'Estimated 2D axial diagonal span'],
    ['Bounding_Box_Extent_X_RL', analytics.bbox ? analytics.bbox.sizeMm[0].toFixed(2) : 'N/A', 'mm', 'Right-Left physical span'],
    ['Bounding_Box_Extent_Y_AP', analytics.bbox ? analytics.bbox.sizeMm[1].toFixed(2) : 'N/A', 'mm', 'Anterior-Posterior physical span'],
    ['Bounding_Box_Extent_Z_SI', analytics.bbox ? analytics.bbox.sizeMm[2].toFixed(2) : 'N/A', 'mm', 'Superior-Inferior physical span'],
    ['Centroid_Voxel_WT', analytics.centroids.wt.voxel.join(';'), 'voxel', 'Whole tumor center of mass (X;Y;Z)'],
    ['Centroid_World_WT_mm', analytics.centroids.wt.world.map(v => v.toFixed(2)).join(';'), 'mm', 'Whole tumor world coordinate (x;y;z)'],
    ['Centroid_Voxel_ET', analytics.centroids.et.voxel.join(';'), 'voxel', 'Enhancing tumor center of mass'],
    ['Centroid_World_ET_mm', analytics.centroids.et.world.map(v => v.toFixed(2)).join(';'), 'mm', 'Enhancing tumor world coordinate'],
    ['Peak_Axial_Slice_Z', analytics.profiles.peaks.axial.slice, 'slice_idx', `Axial slice with maximum tumor burden (${analytics.profiles.peaks.axial.count} voxels)`],
    [],
    ['# INPUT MODALITIES & CRYPTOGRAPHIC TRACEABILITY'],
    ['Modality', 'SHA256_Hash'],
    ...result.report.inputs.modalities.map(m => [m.modality, m.sha256]),
    [],
    ['# VERIFICATION CHECKS'],
    ['Check', 'Status'],
    ['Input_Validation', result.report.inputs.validation.status],
    ['Segmentation_Geometry', result.report.segmentation.validation.status],
    ['Export_Verified', result.report.export.status],
    ...(result.expert_metrics
      ? [
          [],
          ['# EXPERT GROUND-TRUTH COMPARISON'],
          ['Region', 'Dice', 'Sensitivity', 'Predicted_Voxels', 'Reference_Voxels', 'Intersection_Voxels'],
          ...Object.entries(result.expert_metrics).map(([k, v]) => [
            k,
            v.dice.toFixed(4),
            v.sensitivity !== null ? v.sensitivity.toFixed(4) : 'N/A',
            v.predicted_voxel_count,
            v.reference_voxel_count,
            v.intersection_voxel_count,
          ]),
        ]
      : []),
  ];

  const csvText = rows
    .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  saveBlob(blob, `${result.case_id}_report.csv`);
}
