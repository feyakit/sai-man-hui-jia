import { AudioClip, AudioSource, Node } from 'cc';
import { AUDIO_NAMES, loadAudio, type AudioName } from './OptionalResources';

/** Optional effects never block input or replay an old action after a slow load. */
export class SoundEffects {
  private readonly clips = new Map<AudioName,AudioClip>();
  private readonly source: AudioSource;
  private enabled = true;
  constructor(private readonly owner: Node) {
    // Keep the source on the persistent page parent so a clear sound survives a stage switch.
    this.source=owner.getComponent(AudioSource) ?? owner.addComponent(AudioSource);
    this.source.playOnAwake=false;
    for (const name of AUDIO_NAMES) {
      void loadAudio(name).then(clip => {
        if (clip && owner.isValid) this.clips.set(name,clip);
      });
    }
  }
  setEnabled(enabled: boolean): void {
    this.enabled=enabled;
    if (!enabled) {
      try { this.source.stop(); } catch { /* Audio is optional; stopping is best-effort. */ }
    }
  }
  play(name: AudioName): void {
    if (!this.enabled) return;
    const clip=this.clips.get(name);
    if (!clip || !this.owner.isValid) return;
    try { this.source.playOneShot(clip,1); } catch { /* Decoder/device/browser failure: silence. */ }
  }
}
