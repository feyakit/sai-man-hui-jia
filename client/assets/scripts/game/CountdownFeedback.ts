export interface CountdownFrame {
  label: string;
  warning: boolean;
  tick: boolean;
  bounce: boolean;
}

export function countdownFrame(seconds: number, previous: number): CountdownFrame {
  const finite=Number.isFinite(seconds);
  const warning=finite && seconds <= 10;
  const tick=seconds !== previous && previous >= 0 && seconds > 0 && seconds <= 10;
  return {
    label:finite ? `距出发 ${seconds} 秒` : '慢慢装，不限时',
    warning,
    tick,
    bounce:tick,
  };
}
