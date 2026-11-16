<script lang="ts">
  import type { AudioVisualization } from "../../types";
  import { connectAudioAnalyser } from "../../stores/audioStore";

  interface Props {
    mode: Exclude<AudioVisualization, "off">;
    active: boolean;
    reducedMotion: boolean;
    expanded: boolean;
  }

  let { mode, active, reducedMotion, expanded }: Props = $props();
  let canvas: HTMLCanvasElement;
  const labels = {
    spectrum: "Audio spectrum",
    oscilloscope: "Audio oscilloscope",
    levels: "Audio level meter",
  };

  $effect(() => {
    const kind = mode;
    const reduce = reducedMotion;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const connection = active ? connectAudioAnalyser() : null;
    const analyser = connection?.analyser;
    const samples = new Uint8Array(analyser?.fftSize ?? 0);
    const spectrum = new Uint8Array(analyser?.frequencyBinCount ?? 0);
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let last = -Infinity;

    function draw() {
      if (!ctx) return;
      const { width, height } = canvas;
      const color = getComputedStyle(canvas).color;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.globalAlpha = 1;

      if (kind === "spectrum") {
        analyser?.getByteFrequencyData(spectrum);
        const bars = 32;
        const step = width / bars;
        const highestBin = analyser
          ? Math.min(spectrum.length, Math.floor(12_000 * analyser.fftSize / analyser.context.sampleRate))
          : 1;
        for (let i = 0; i < bars; i++) {
          const start = Math.floor(highestBin ** (i / bars));
          const end = Math.min(highestBin, Math.max(start + 1, Math.floor(highestBin ** ((i + 1) / bars))));
          let peak = 0;
          for (let bin = start; bin < end; bin++) peak = Math.max(peak, spectrum[bin]);
          const barHeight = Math.max(height * 0.04, height * 0.92 * peak / 255);
          ctx.globalAlpha = peak > 0 ? 0.35 + 0.65 * peak / 255 : 0.24;
          ctx.fillRect(i * step, height - barHeight, step * 0.72, barHeight);
        }
        return;
      }

      analyser?.getByteTimeDomainData(samples);
      if (kind === "oscilloscope") {
        ctx.globalAlpha = analyser ? 1 : 0.24;
        ctx.lineWidth = Math.max(1, height * 0.025);
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        const points = Math.max(1, Math.min(256, samples.length));
        for (let i = 0; i <= points; i++) {
          const sample = samples[Math.floor(i * (samples.length - 1) / points)] ?? 128;
          ctx.lineTo(width * i / points, height * (0.5 - 0.44 * (sample - 128) / 128));
        }
        ctx.stroke();
        return;
      }

      let squares = 0;
      let peak = 0;
      for (const sample of samples) {
        const amplitude = Math.abs(sample - 128) / 128;
        squares += amplitude * amplitude;
        peak = Math.max(peak, amplitude);
      }
      const rms = samples.length ? Math.sqrt(squares / samples.length) : 0;
      const segments = 32;
      const step = width / segments;
      const lit = Math.round(Math.sqrt(rms) * segments);
      const peakSegment = Math.round(Math.sqrt(peak) * segments) - 1;
      for (let i = 0; i < segments; i++) {
        ctx.globalAlpha = i < lit ? 0.85 : i === peakSegment ? 1 : 0.18;
        ctx.fillRect(i * step, height * 0.24, step * 0.75, height * 0.52);
      }
    }

    function tick(now: number) {
      if (now - last >= (reduce || motion.matches ? 250 : 1000 / 30)) {
        draw();
        last = now;
      }
      frame = requestAnimationFrame(tick);
    }

    const resize = new ResizeObserver(([entry]) => {
      const scale = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(entry.contentRect.width * scale));
      canvas.height = Math.max(1, Math.round(entry.contentRect.height * scale));
      draw();
    });
    resize.observe(canvas);
    if (analyser) frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      connection?.disconnect();
    };
  });
</script>

<canvas bind:this={canvas} class:expanded aria-label={labels[mode]}></canvas>

<style>
  canvas {
    display: block;
    flex: none;
    width: 100%;
    height: 2.7rem;
    color: var(--color-primary);
  }

  canvas.expanded { height: 4.5rem; }
</style>
