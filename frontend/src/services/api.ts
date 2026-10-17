import type { CaseResultResponse, SegmentResponse } from '../types';

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || ''
).replace(/\/+$/, '');

export interface UploadCasePayload {
  t1: File;
  t1gd: File;
  t2: File;
  flair: File;
  referenceMask?: File | null;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function checkedResponse(response: Response): Promise<Response> {
  if (response.ok) return response;

  let detail = `Request failed (${response.status})`;
  try {
    const body: unknown = await response.json();
    if (
      typeof body === 'object' &&
      body !== null &&
      'detail' in body &&
      typeof body.detail === 'string'
    ) {
      detail = body.detail;
    }
  } catch {
    // Keep the HTTP status message when the server did not return JSON.
  }
  throw new ApiError(detail, response.status);
}

function caseUrl(caseId: string, suffix = ''): string {
  return `${API_BASE_URL}/api/v1/cases/${encodeURIComponent(caseId)}${suffix}`;
}

export const apiService = {
  getBaseUrl(): string {
    return API_BASE_URL;
  },

  async checkHealth(): Promise<boolean> {
    try {
      return (await fetch(`${API_BASE_URL}/health`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(3500),
      })).ok;
    } catch {
      return false;
    }
  },

  async createCase(payload: UploadCasePayload): Promise<{
    case_id: string;
    validation_warnings: string[];
  }> {
    const body = new FormData();
    body.append('T1', payload.t1);
    body.append('T1ce', payload.t1gd);
    body.append('T2', payload.t2);
    body.append('FLAIR', payload.flair);
    if (payload.referenceMask) {
      body.append('expert_mask', payload.referenceMask);
    }

    const response = await checkedResponse(
      await fetch(`${API_BASE_URL}/api/v1/cases`, {
        method: 'POST',
        body,
        signal: AbortSignal.timeout(120000),
      }),
    );
    return response.json();
  },

  async segmentCase(caseId: string): Promise<SegmentResponse> {
    const response = await checkedResponse(
      await fetch(caseUrl(caseId, '/segment'), {
        method: 'POST',
        signal: AbortSignal.timeout(300000),
      }),
    );
    return response.json();
  },

  async getCaseResults(caseId: string): Promise<CaseResultResponse> {
    const response = await checkedResponse(
      await fetch(caseUrl(caseId, '/results'), {
        headers: { Accept: 'application/json' },
      }),
    );
    return response.json();
  },

  async downloadMask(caseId: string): Promise<Blob> {
    return (await checkedResponse(
      await fetch(caseUrl(caseId, '/mask')),
    )).blob();
  },

  async downloadReport(caseId: string): Promise<Blob> {
    return (await checkedResponse(
      await fetch(caseUrl(caseId, '/report')),
    )).blob();
  },

  async deleteCase(caseId: string): Promise<void> {
    await checkedResponse(
      await fetch(caseUrl(caseId), { method: 'DELETE' }),
    );
  },
};
