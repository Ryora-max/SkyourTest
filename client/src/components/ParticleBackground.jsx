import { useEffect, useRef } from 'react';

function ParticleBackground({ darkMode }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationId;
    let time = 0;
    let lastFrame = 0;
    const FPS_CAP = 30;
    const FRAME_INTERVAL = 1000 / FPS_CAP;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    const isDark = darkMode;

    const waveLayers = isDark
      ? [
          { amp: 80, freq: 0.004, speed: 0.015, yOffset: 0.55, color: 'rgba(37, 99, 235, 0.08)', lineColor: 'rgba(59, 130, 246, 0.15)', lineWidth: 1.5 },
          { amp: 60, freq: 0.006, speed: 0.02, yOffset: 0.62, color: 'rgba(56, 189, 248, 0.06)', lineColor: 'rgba(56, 189, 248, 0.12)', lineWidth: 1.2 },
          { amp: 100, freq: 0.003, speed: 0.012, yOffset: 0.7, color: 'rgba(96, 165, 250, 0.05)', lineColor: 'rgba(96, 165, 250, 0.1)', lineWidth: 1 },
          { amp: 50, freq: 0.008, speed: 0.025, yOffset: 0.78, color: 'rgba(37, 99, 235, 0.04)', lineColor: 'rgba(147, 197, 253, 0.08)', lineWidth: 0.8 },
        ]
      : [
          { amp: 80, freq: 0.004, speed: 0.015, yOffset: 0.55, color: 'rgba(59, 130, 246, 0.06)', lineColor: 'rgba(59, 130, 246, 0.12)', lineWidth: 1.5 },
          { amp: 60, freq: 0.006, speed: 0.02, yOffset: 0.62, color: 'rgba(56, 189, 248, 0.05)', lineColor: 'rgba(56, 189, 248, 0.1)', lineWidth: 1.2 },
          { amp: 100, freq: 0.003, speed: 0.012, yOffset: 0.7, color: 'rgba(96, 165, 250, 0.04)', lineColor: 'rgba(96, 165, 250, 0.08)', lineWidth: 1 },
          { amp: 50, freq: 0.008, speed: 0.025, yOffset: 0.78, color: 'rgba(37, 99, 235, 0.03)', lineColor: 'rgba(147, 197, 253, 0.06)', lineWidth: 0.8 },
        ];

    const w = () => window.innerWidth;
    const h = () => window.innerHeight;

    const animate = (timestamp) => {
      animationId = requestAnimationFrame(animate);
      // FPS cap
      if (timestamp - lastFrame < FRAME_INTERVAL) return;
      lastFrame = timestamp;

      ctx.clearRect(0, 0, w(), h());

      // Adaptive step: fewer points on large screens
      const step = w() > 1920 ? 4 : 2;

      waveLayers.forEach((wave) => {
        const baseY = h() * wave.yOffset;

        ctx.beginPath();
        ctx.moveTo(0, h());
        for (let x = 0; x <= w(); x += step) {
          const y = baseY
            + Math.sin(x * wave.freq + time * wave.speed) * wave.amp
            + Math.sin(x * wave.freq * 2.3 + time * wave.speed * 1.5) * wave.amp * 0.3;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w(), h());
        ctx.closePath();
        ctx.fillStyle = wave.color;
        ctx.fill();

        ctx.beginPath();
        for (let x = 0; x <= w(); x += step) {
          const y = baseY
            + Math.sin(x * wave.freq + time * wave.speed) * wave.amp
            + Math.sin(x * wave.freq * 2.3 + time * wave.speed * 1.5) * wave.amp * 0.3;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = wave.lineColor;
        ctx.lineWidth = wave.lineWidth;
        ctx.stroke();
      });

      time += 1;
    };
    animationId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
    };
  }, [darkMode]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}

export default ParticleBackground;
