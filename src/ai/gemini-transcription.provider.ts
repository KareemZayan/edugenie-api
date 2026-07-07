import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  TranscriptionProvider,
  TranscriptSegment,
} from './transcription.provider';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
// gemini-2.0-flash was retired (Jun 1 2026). Use a current Flash id; overridable
// via GEMINI_TRANSCRIBE_MODEL. Flash models are covered by the free tier.
const DEFAULT_MODEL = 'gemini-flash-latest';
const TIMEOUT_MS = 55_000; // stay under the serverless function budget

const PROMPT =
  'You are a transcription engine. Transcribe the spoken audio verbatim into ' +
  'plain text. Output ONLY the transcript — no preamble, timestamps, speaker ' +
  'labels, or commentary. If there is no intelligible speech, output nothing.';

// Segmented (time-coded) transcription prompt. Gemini timestamps are APPROXIMATE
// and may drift a few seconds — acceptable for lesson-level seeking. For frame-
// accurate alignment, swap this provider for a forced-alignment tool (e.g.
// WhisperX) that re-aligns the verbatim text to the audio; the rest of the
// pipeline already consumes {start,text} segments and needs no further change.
const SEGMENT_PROMPT =
  'You are a video transcription engine. Transcribe the spoken audio verbatim ' +
  'and split it into short segments (roughly one sentence, or a few seconds ' +
  'each). Return ONLY a JSON array — no markdown, no code fences, no commentary ' +
  '— where each element is {"start": <number of seconds from the start of the ' +
  'audio>, "text": "<segment text>"}. Timestamps must be non-decreasing. If ' +
  'there is no intelligible speech, return [].';

/**
 * Speech-to-text via the Gemini API (free-tier Flash). Given an audio URL
 * (an audio-only Cloudinary delivery URL), it downloads the bytes, sends them
 * inline to `generateContent`, and returns the transcript string. Mirrors the
 * REST/fetch/error conventions of GeminiEmbeddingsProvider; the key rides the
 * `x-goog-api-key` header (never logged, never in the URL).
 *
 *   GEMINI_API_KEY          Google AI Studio key (free tier is sufficient)
 *   GEMINI_TRANSCRIBE_MODEL optional model id override (default gemini-flash-latest)
 */
@Injectable()
export class GeminiTranscriptionProvider implements TranscriptionProvider {
  private readonly logger = new Logger(GeminiTranscriptionProvider.name);
  private readonly apiKey = process.env.GEMINI_API_KEY;
  readonly model = process.env.GEMINI_TRANSCRIBE_MODEL || DEFAULT_MODEL;

  get isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Transcribe the audio at `audioUrl`. Returns the transcript text (may be an
   * empty string for silent/non-speech audio). Throws ServiceUnavailableException
   * on network/timeout/HTTP errors so callers can mark the lesson 'failed'.
   */
  async transcribeAudioUrl(
    audioUrl: string,
    mimeType = 'audio/mpeg',
  ): Promise<string> {
    return (await this.generate(audioUrl, PROMPT, mimeType)).trim();
  }

  /**
   * Time-coded transcription: returns approximate `{ start, text }` segments for
   * a clickable transcript + timestamped search. Robust to the model wrapping
   * its JSON in markdown fences, and falls back to a single start:0 segment when
   * the output isn't parseable JSON (so a lesson never loses its transcript).
   * Returns [] for silent/non-speech audio.
   */
  async transcribeSegments(
    audioUrl: string,
    mimeType = 'audio/mpeg',
  ): Promise<TranscriptSegment[]> {
    const raw = (await this.generate(audioUrl, SEGMENT_PROMPT, mimeType)).trim();
    return this.parseSegments(raw);
  }

  /** Shared Gemini generateContent call: inline audio + prompt → raw text. */
  private async generate(
    audioUrl: string,
    prompt: string,
    mimeType: string,
  ): Promise<string> {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException(
        'Transcription is not configured (set GEMINI_API_KEY).',
      );
    }

    const base64 = await this.fetchAsBase64(audioUrl);

    const url = `${GEMINI_BASE}/models/${this.model}:generateContent`;
    const body = {
      contents: [
        {
          parts: [
            { inline_data: { mime_type: mimeType, data: base64 } },
            { text: prompt },
          ],
        },
      ],
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey as string,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      this.logger.error(
        `Gemini transcription request failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw new ServiceUnavailableException(
        'Transcription service is unavailable. Please try again.',
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(
        `Gemini transcription returned ${res.status}: ${text.slice(0, 300)}`,
      );
      throw new ServiceUnavailableException(
        'Transcription service error. Please try again.',
      );
    }

    const json = (await res.json()) as unknown;
    return this.extractText(json).trim();
  }

  /**
   * Parse the model's segmented output into clean `{ start, text }` records.
   * Strips ```json fences, validates each entry, coerces `start` to a
   * non-negative number, and drops junk. On any parse failure it degrades to a
   * single segment (start 0) carrying the raw text, so the transcript survives.
   */
  private parseSegments(raw: string): TranscriptSegment[] {
    if (!raw) return [];
    const stripped = raw
      .replace(/^\s*```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();
    try {
      const parsed = JSON.parse(stripped) as unknown;
      if (!Array.isArray(parsed)) throw new Error('not an array');
      const segments = parsed
        .map((s) => {
          const o = s as Record<string, unknown>;
          const start = Number(o?.start);
          const text = typeof o?.text === 'string' ? o.text.trim() : '';
          return { start: Number.isFinite(start) && start >= 0 ? start : 0, text };
        })
        .filter((s) => s.text.length > 0);
      return segments;
    } catch {
      this.logger.warn(
        'Segmented transcription was not valid JSON — falling back to one segment',
      );
      return [{ start: 0, text: stripped }];
    }
  }

  /** Download the audio and base64-encode it for inline_data. */
  private async fetchAsBase64(audioUrl: string): Promise<string> {
    let res: Response;
    try {
      res = await fetch(audioUrl);
    } catch (err) {
      this.logger.error(
        `Audio fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new ServiceUnavailableException('Could not download lesson audio.');
    }
    if (!res.ok) {
      this.logger.error(`Audio fetch returned ${res.status} for ${audioUrl}`);
      throw new ServiceUnavailableException('Could not download lesson audio.');
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.toString('base64');
  }

  /**
   * Pull transcript text from a Gemini generateContent response, tolerating
   * shape drift: { candidates: [{ content: { parts: [{ text }] } }] }.
   */
  private extractText(json: unknown): string {
    if (typeof json === 'string') return json;
    if (!json || typeof json !== 'object') return '';
    const j = json as Record<string, any>;
    const parts = j.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) {
      return parts
        .map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
        .join('')
        .trim();
    }
    // Fallbacks for alternate wrappers.
    return (
      j.candidates?.[0]?.content?.text ??
      j.text ??
      j.output_text ??
      ''
    );
  }
}
