import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  TranscriptionProvider,
  TranscriptSegment,
} from './transcription.provider';

//   OPEN_AI_API_KEY           OpenAI key
//   OPEN_AI_TRANSCRIBE_MODEL  optional transcription model override (default whisper-1)

const OPENAI_URL = 'https://api.openai.com/v1/audio/transcriptions';
// whisper-1 is the model that returns segment timestamps (verbose_json +
// timestamp_granularities). The gpt-4o-transcribe / gpt-audio models DON'T
// support verbose_json, so they yield no segments — keep whisper-1 for
// timestamps. This deliberately uses its OWN env var (not OPEN_AI_MODEL, which
// is the chat model, e.g. gpt-5.4-mini, and can't transcribe).
const DEFAULT_MODEL = 'whisper-1';
const TIMEOUT_MS = 110_000;

/**
 * Speech-to-text via the OpenAI Whisper API. Downloads the (Cloudinary audio-
 * only) MP3 and uploads it as multipart to /audio/transcriptions with
 * `response_format=verbose_json` + `timestamp_granularities[]=segment`, so it
 * returns real per-segment start times — a better source for the clickable
 * transcript than the LLM-estimated Gemini timestamps.
 *
 *   OPEN_AI_API_KEY           OpenAI key
 *   OPEN_AI_TRANSCRIBE_MODEL  optional model override (default whisper-1)
 */
@Injectable()
export class OpenAiTranscriptionProvider implements TranscriptionProvider {
  private readonly logger = new Logger(OpenAiTranscriptionProvider.name);
  private readonly apiKey = process.env.OPEN_AI_API_KEY;
  readonly model = process.env.OPEN_AI_TRANSCRIBE_MODEL || DEFAULT_MODEL;

  get isConfigured(): boolean {
    return !!this.apiKey;
  }

  async transcribeSegments(
    audioUrl: string,
    _mimeType = 'audio/mpeg',
  ): Promise<TranscriptSegment[]> {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException(
        'Transcription is not configured (set OPEN_AI_API_KEY).',
      );
    }

    const blob = await this.fetchAsBlob(audioUrl);
    const form = new FormData();
    form.append('file', blob, 'audio.mp3');
    form.append('model', this.model);
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'segment');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey as string}` },
        body: form,
        signal: controller.signal,
      });
    } catch (err) {
      this.logger.error(
        `OpenAI transcription request failed: ${
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
        `OpenAI transcription returned ${res.status}: ${text.slice(0, 300)}`,
      );
      throw new ServiceUnavailableException(
        'Transcription service error. Please try again.',
      );
    }

    const json = (await res.json()) as {
      text?: string;
      segments?: Array<{ start?: number; text?: string }>;
    };
    const segs = Array.isArray(json.segments) ? json.segments : [];
    const out = segs
      .map((s) => {
        const start = Number(s?.start);
        return {
          start: Number.isFinite(start) && start >= 0 ? start : 0,
          text: (s?.text ?? '').trim(),
        };
      })
      .filter((s) => s.text.length > 0);

    // Model returned no segments (e.g. a non-verbose model) — fall back to the
    // whole text as one untimed segment so the transcript still survives.
    if (!out.length && typeof json.text === 'string' && json.text.trim()) {
      this.logger.warn(
        `OpenAI model ${this.model} returned no segments — storing untimed text`,
      );
      return [{ start: 0, text: json.text.trim() }];
    }
    return out;
  }

  async transcribeAudioUrl(
    audioUrl: string,
    mimeType = 'audio/mpeg',
  ): Promise<string> {
    const segs = await this.transcribeSegments(audioUrl, mimeType);
    return segs
      .map((s) => s.text)
      .join(' ')
      .trim();
  }

  private async fetchAsBlob(audioUrl: string): Promise<Blob> {
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
    return res.blob();
  }
}
