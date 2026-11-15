/** Milliseconds from the last legal drop. Shared by rendering and tests. */
export const FINISH_DURATION = 2500;
export const MAX_CONFETTI = 120;
export interface FinishState {
  time: number; lidVisible: boolean; lidProgress: number; bodySink: number;
  tailLights: boolean; celebration: boolean; buttons: boolean; particleCount: number;
}
export function finishTimeline(tMs: number, out: FinishState = {} as FinishState): FinishState {
  const t = Math.max(0,Math.min(FINISH_DURATION,Number.isNaN(tMs) ? 0 : tMs));
  out.time=t;
  out.lidVisible=t >= 300;
  out.lidProgress=Math.max(0,Math.min(1,(t-300)/400));
  out.bodySink=t < 700 ? 0 : t < 850 ? (t-700)/150*12 : t < 1000 ? 12-(t-850)/150*6 : 6;
  out.tailLights=(t >= 1000 && t < 1150) || (t >= 1300 && t < 1450);
  out.celebration=t >= 1200;
  out.buttons=t >= FINISH_DURATION;
  out.particleCount=t >= 1200 && t < FINISH_DURATION ? MAX_CONFETTI : 0;
  return out;
}
export const FINISH_CUES = [
  {time:700,sound:'trunk_slam',vibration:40},
  {time:1000,sound:'horn',vibration:0},
  {time:1200,sound:'cheer',vibration:0},
  {time:1300,sound:'horn',vibration:0},
] as const;
/** No timer callbacks: dropping frames crosses each cue once; skip suppresses stale audio. */
export class FinishPlayback {
  readonly state=finishTimeline(0);
  private nextCue=0;
  constructor(private readonly emit: (cue: typeof FINISH_CUES[number]) => void) {}
  advance(tMs: number): FinishState {
    finishTimeline(Math.max(this.state.time,tMs),this.state);
    while (this.nextCue < FINISH_CUES.length && FINISH_CUES[this.nextCue].time <= this.state.time) {
      this.emit(FINISH_CUES[this.nextCue++]);
    }
    return this.state;
  }
  skip(): FinishState {
    this.nextCue=FINISH_CUES.length;
    return finishTimeline(FINISH_DURATION,this.state);
  }
}
export interface ConfettiParticle { active: boolean; x: number; y: number; angle: number; variant: number }
/** Fixed pool; no random values or allocations while animating. */
export function createConfettiPool(): ConfettiParticle[] {
  return Array.from({length:MAX_CONFETTI},(_,i) => ({active:false,x:0,y:0,angle:0,variant:i%4}));
}
export function updateConfetti(pool: ConfettiParticle[], tMs: number, width: number, height: number): void {
  const active=tMs >= 1200 && tMs < FINISH_DURATION;
  for (let i=0;i<pool.length;i++) {
    const p=pool[i]; p.active=active && i < MAX_CONFETTI;
    if (!p.active) { p.x=0; p.y=0; p.angle=0; continue; }
    const age=Math.max(0,tMs-1200-(i%12)*22);
    p.x=((i*193)%width)+Math.sin(age/260+i)*28;
    p.y=-45+age/1300*(height+140);
    p.angle=(i*47+age*.22)%360;
  }
}
export type FinishAction = 'next' | 'replay' | 'mom' | 'first' | 'home';
export function finishButtons(stage: number): readonly {title: string; action: FinishAction}[] {
  return stage === 1 ? [{title:'下一关',action:'next'}] :
    stage === 3 ? [{title:'再来一次',action:'replay'},{title:'回第 1 关',action:'first'}] :
    [{title:'再来一次',action:'replay'},{title:'试试妈妈模式',action:'mom'}];
}
