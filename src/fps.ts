/**
 * Always-on frame counter, timed with the browser's own frame timestamps (the same clock the display uses),
 * not with our own clock reads. Shows frames per second over the last second, the average frame time,
 * and the "1% low": the average speed of the slowest 1% of frames in the last two seconds, which is what stutter looks like.
 */
export function createFpsCounter(): { frame(now: number): void } {
  const el = document.createElement("div");
  el.id = "fps";
  el.setAttribute("aria-hidden", "true");
  const main = document.createElement("span");
  main.className = "fps-main";
  const sub = document.createElement("span");
  sub.className = "fps-sub";
  el.append(main, sub);
  document.body.append(el);

  const times: number[] = [];
  const spans: number[] = [];
  let last = 0;
  let shown = 0;

  return {
    frame(now: number): void {
      if (last > 0) {
        const dt = now - last;
        // Ignore the gap from a hidden tab or a debugger pause.
        if (dt > 0 && dt < 1000) {
          times.push(now);
          spans.push(dt);
        }
      }
      last = now;
      while (times.length > 0 && now - times[0]! > 2000) {
        times.shift();
        spans.shift();
      }
      if (now - shown < 250 || spans.length < 3) return;
      shown = now;

      let count = 0;
      let total = 0;
      for (let i = spans.length - 1; i >= 0 && now - times[i]! <= 1000; i -= 1) {
        total += spans[i]!;
        count += 1;
      }
      const fps = count > 0 && total > 0 ? (count * 1000) / total : 0;
      const sorted = spans.slice().sort((a, b) => b - a);
      const worst = Math.max(1, Math.ceil(sorted.length * 0.01));
      let worstTotal = 0;
      for (let i = 0; i < worst; i += 1) worstTotal += sorted[i]!;
      const low = 1000 / (worstTotal / worst);

      main.textContent = `${Math.round(fps)} FPS`;
      sub.textContent = `${(total / Math.max(1, count)).toFixed(1)} ms · 1% low ${Math.round(low)}`;
      el.dataset.level = fps >= 55 ? "good" : fps >= 30 ? "ok" : "bad";
    }
  };
}
