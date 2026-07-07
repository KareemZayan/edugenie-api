/**
 * Transcription provider abstraction. Two implementations exist:
 *  - GeminiTranscriptionProvider (inline audio → generateContent)
 *  - OpenAiTranscriptionProvider (Whisper /audio/transcriptions, verbose_json)
 * The active one is chosen by the TRANSCRIPTION_PROVIDER factory in
 * CloudinaryModule (OpenAI when OPEN_AI_API_KEY is set, else Gemini).
 */
export interface TranscriptSegment {
  /** Start time in seconds from the audio start (approximate for Gemini). */
  start: number;
  text: string;
}

export interface TranscriptionProvider {
  readonly isConfigured: boolean;
  readonly model: string;
  /** Full plain-text transcript (may be '' for silent audio). */
  transcribeAudioUrl(audioUrl: string, mimeType?: string): Promise<string>;
  /** Time-coded segments for a clickable transcript + timestamped search. */
  transcribeSegments(audioUrl: string, mimeType?: string): Promise<TranscriptSegment[]>;
}

/** DI token for the selected transcription provider. */
export const TRANSCRIPTION_PROVIDER = Symbol('TRANSCRIPTION_PROVIDER');
