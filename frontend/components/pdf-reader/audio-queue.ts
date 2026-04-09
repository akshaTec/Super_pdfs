function createAudioContext(): AudioContext {
  const Ctor =
    typeof window !== 'undefined' &&
    (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!Ctor) {
    throw new Error('Web Audio API is not supported in this browser.');
  }
  return new Ctor();
}

export class AudioQueue {
  private ctx: AudioContext;
  private queue: Array<{ buffer: AudioBuffer; sentenceId: number }> = [];
  private isPlaying = false;
  private currentSource: AudioBufferSourceNode | null = null;
  private onSentenceChange: (id: number | null) => void;
  private onComplete: () => void;
  private cancelled = false;
  /** Set when the server signals no more audio; only then may we fire onComplete when the queue drains. */
  private streamEnded = false;

  constructor(onSentenceChange: (id: number | null) => void, onComplete: () => void) {
    this.ctx = createAudioContext();
    this.onSentenceChange = onSentenceChange;
    this.onComplete = onComplete;
  }

  /** Must run during / right after a user gesture, before other long `await`s, or playback stays silent. */
  async resumeAudioContext(): Promise<void> {
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  async enqueue(base64: string, sentenceId: number): Promise<void> {
    if (this.cancelled) return;
    const binary = atob(base64);
    const buf = new ArrayBuffer(binary.length);
    const view = new Uint8Array(buf);
    for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
    const audioBuffer = await this.ctx.decodeAudioData(buf);
    if (this.cancelled) return;
    this.queue.push({ buffer: audioBuffer, sentenceId });
    if (!this.isPlaying) this.playNext();
  }

  /** Call when the server has finished sending all chunks for this page. */
  markStreamEnded(): void {
    if (this.cancelled) return;
    this.streamEnded = true;
    if (!this.isPlaying && this.queue.length === 0) {
      this.onSentenceChange(null);
      this.onComplete();
    }
  }

  private playNext(): void {
    if (this.cancelled) {
      this.isPlaying = false;
      return;
    }

    if (this.queue.length === 0) {
      this.isPlaying = false;
      if (this.streamEnded) {
        this.onSentenceChange(null);
        this.onComplete();
      }
      return;
    }
    this.isPlaying = true;
    const { buffer, sentenceId } = this.queue.shift()!;
    this.onSentenceChange(sentenceId);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ctx.destination);
    source.onended = () => this.playNext();
    this.currentSource = source;
    source.start();
  }

  stop(): void {
    this.cancelled = true;
    this.streamEnded = false;
    this.queue = [];
    this.isPlaying = false;
    try {
      this.currentSource?.stop();
    } catch {}
    this.onSentenceChange(null);
    try {
      this.ctx.close();
    } catch {}
  }
}
