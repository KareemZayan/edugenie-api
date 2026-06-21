export interface TranscriptionStatusResponse {
  videoReady: boolean;
  transcriptReady: boolean;
  transcript: string | null;
}
