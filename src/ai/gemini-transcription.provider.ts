import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
// gemini-2.0-flash was retired (Jun 1 2026). Use a current Flash id; overridable
// via GEMINI_TRANSCRIBE_MODEL. Flash models are covered by the free tier.
const DEFAULT_MODEL = 'gemini-flash-latest';
const TIMEOUT_MS = 55_000; // stay under the serverless function budget

const PROMPT =
  'You are a transcription engine. Transcribe the spoken audio verbatim into ' +
  'plain text. Output ONLY the transcript — no preamble, timestamps, speaker ' +
  'labels, or commentary. If there is no intelligible speech, output nothing.';

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
export class GeminiTranscriptionProvider {
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
            { text: PROMPT },
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
