/**
 * Canvas-Renderer für Text-Clips → PNG (base64).
 *
 * Spiegelt die DOM-Render-Logik aus EditorTab (LayeredTextDom + textOverlayStyle)
 * 1:1 in <canvas>, damit Export visuell identisch zur Live-Preview ist.
 *
 * Output: full-canvas PNG mit transparenten Pixeln drum → FFmpeg overlay=0:0.
 * (Damit muss FFmpeg keine Position berechnen, der Renderer hat sie schon eingebacken.)
 *
 * Position-Mapping: posX/posY ∈ [-1, 1] → centerX = canvasW * (0.5 + posX*0.4),
 * gleiche Editor-Convention wie im Live-Preview.
 */
export interface TextClipRenderSpec {
  text?: string;
  textFont?: string;
  textSize?: number;
  textColor?: string;
  textWeight?: 'normal' | 'bold' | '900';
  textItalic?: boolean;
  textBgColor?: string;
  textBgOpacity?: number;
  textGlowColor?: string;
  textGlowBlur?: number;
  textShadowColor?: string;
  textShadowOffsetX?: number;
  textShadowOffsetY?: number;
  textShadowBlur?: number;
  textStyle?: 'simple' | 'layered';
  textLayeredSecond?: string;
  textLayeredScale?: number;
  textLayeredUseGradient?: boolean;
  textLayeredGradientFrom?: string;
  textLayeredGradientTo?: string;
  textLayeredMetallic?: boolean;
  textLayeredGlow?: boolean;
  textLayeredGlowColor?: string;
  textLayeredGlowStrength?: number;
  textLayeredDropShadow?: number;
  posX?: number;
  posY?: number;
  scale?: number;
  rotation?: number;
  opacity?: number;
}

/** Render text clip to PNG → returns base64 (no data: prefix).
 *
 * @param sizeScale Multiplier auf alle px-Werte (textSize, glow-blur, drop-shadow,
 *   stroke-width). Bridge zwischen DOM-Live-Preview-Höhe und Output-Auflösung —
 *   wenn der Preview-Container 540px hoch ist und Output 1080p, dann sizeScale=2.
 *   Default 1 = unscaled (für Tests / wenn DOM-Größe == Output).
 */
export function renderTextClipToPng(
  clip: TextClipRenderSpec,
  canvasW: number,
  canvasH: number,
  sizeScale: number = 1,
): string {
  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Pre-scale clip's px-values so all downstream code can stay unchanged.
  const scaled: TextClipRenderSpec = sizeScale === 1 ? clip : {
    ...clip,
    textSize: (clip.textSize ?? 48) * sizeScale,
    textGlowBlur: clip.textGlowBlur != null ? clip.textGlowBlur * sizeScale : undefined,
    textShadowOffsetX: clip.textShadowOffsetX != null ? clip.textShadowOffsetX * sizeScale : undefined,
    textShadowOffsetY: clip.textShadowOffsetY != null ? clip.textShadowOffsetY * sizeScale : undefined,
    textShadowBlur: clip.textShadowBlur != null ? clip.textShadowBlur * sizeScale : undefined,
    textLayeredDropShadow: clip.textLayeredDropShadow != null ? clip.textLayeredDropShadow * sizeScale : undefined,
  };

  // Position (gleiche Convention wie Live-Preview: 50% + posX*40%)
  const centerX = canvasW * (0.5 + (scaled.posX ?? 0) * 0.4);
  const centerY = canvasH * (0.5 + (scaled.posY ?? 0) * 0.4);

  ctx.save();
  ctx.translate(centerX, centerY);
  if (scaled.rotation) ctx.rotate((scaled.rotation * Math.PI) / 180);
  ctx.globalAlpha = scaled.opacity ?? 1;

  if (scaled.textStyle === 'layered') {
    drawLayered(ctx, scaled);
  } else {
    drawSimple(ctx, scaled);
  }

  ctx.restore();

  return canvas.toDataURL('image/png').split(',')[1] ?? '';
}

function drawSimple(ctx: CanvasRenderingContext2D, c: TextClipRenderSpec): void {
  const text = c.text ?? '';
  if (!text) return;
  const family = c.textFont ?? 'Arial';
  const size = c.textSize ?? 48;
  const weight = c.textWeight === '900' ? 900 : c.textWeight === 'bold' ? 700 : 400;
  const italic = c.textItalic ? 'italic ' : '';
  ctx.font = `${italic}${weight} ${size}px ${family}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Background (rounded rect behind text)
  if (c.textBgColor) {
    const opacity = c.textBgOpacity ?? 0.7;
    const m = c.textBgColor.replace('#', '');
    if (m.length === 6) {
      const r = parseInt(m.slice(0, 2), 16);
      const g = parseInt(m.slice(2, 4), 16);
      const b = parseInt(m.slice(4, 6), 16);
      const padX = size * 0.5;
      const padY = size * 0.2;
      const tw = ctx.measureText(text).width;
      const th = size;
      const radius = size * 0.2;
      ctx.fillStyle = `rgba(${r},${g},${b},${opacity})`;
      drawRoundedRect(ctx, -tw / 2 - padX, -th / 2 - padY, tw + padX * 2, th + padY * 2, radius);
      ctx.fill();
    }
  }

  // Glow pass (multiple shadow blurs für intensiveren Halo)
  if (c.textGlowColor && c.textGlowBlur && c.textGlowBlur > 0) {
    ctx.save();
    ctx.shadowColor = c.textGlowColor;
    for (const b of [c.textGlowBlur, c.textGlowBlur * 0.6]) {
      ctx.shadowBlur = b;
      ctx.fillStyle = c.textColor ?? '#ffffff';
      ctx.fillText(text, 0, 0);
    }
    ctx.restore();
  }

  // Drop-Shadow pass
  if (c.textShadowColor) {
    ctx.save();
    ctx.shadowColor = c.textShadowColor;
    ctx.shadowOffsetX = c.textShadowOffsetX ?? 2;
    ctx.shadowOffsetY = c.textShadowOffsetY ?? 4;
    ctx.shadowBlur = c.textShadowBlur ?? 8;
    ctx.fillStyle = c.textColor ?? '#ffffff';
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  // Final fill (clean, ohne shadow)
  ctx.fillStyle = c.textColor ?? '#ffffff';
  ctx.fillText(text, 0, 0);
}

function drawLayered(ctx: CanvasRenderingContext2D, c: TextClipRenderSpec): void {
  const family = c.textFont ?? '"Arial Black", sans-serif';
  const baseSize = c.textSize ?? 48;
  const scale = c.textLayeredScale ?? 2.0;
  const bigSize = Math.round(baseSize * scale);
  const bigText = c.text ?? 'EPIC';
  const small = c.textLayeredSecond ?? '';

  // Layout: big-word zentriert (origin), small-word darunter mit overlap.
  // DOM: marginTop=-bigSize*0.42 → small startet 42% in big rein.
  // Mit baseline=middle und small-height ≈ baseSize: smallY = bigSize*0.5 - bigSize*0.42 + baseSize*0.5
  //                                                       ≈ bigSize*0.08 + baseSize*0.5
  const bigY = 0;
  const smallY = bigSize * 0.5 - bigSize * 0.42 + baseSize * 0.5;

  // Build big-fill: solid / gradient / metallic / glow-only
  const buildBigFill = (): string | CanvasGradient => {
    const glowOnly = c.textLayeredGlow && !c.textLayeredMetallic && !c.textLayeredUseGradient;
    if (glowOnly) return c.textLayeredGlowColor ?? '#ffffff';

    if (c.textLayeredMetallic) {
      const from = c.textLayeredGradientFrom ?? '#ffffff';
      const to = c.textLayeredGradientTo ?? '#7a7a7a';
      const grad = ctx.createLinearGradient(0, -bigSize / 2, 0, bigSize / 2);
      // 7-Stop metallic — gleiche Stops wie LayeredTextDom (DOM-Live-Preview).
      grad.addColorStop(0, darkenHex(from, 0.4));
      grad.addColorStop(0.18, lightenHex(from, 0.55));
      grad.addColorStop(0.32, lightenHex(from, 0.10));
      grad.addColorStop(0.48, darkenHex(to, 0.10));
      grad.addColorStop(0.66, lightenHex(to, 0.20));
      grad.addColorStop(0.85, darkenHex(to, 0.20));
      grad.addColorStop(1, darkenHex(to, 0.55));
      return grad;
    }
    if (c.textLayeredUseGradient && c.textLayeredGradientFrom && c.textLayeredGradientTo) {
      const grad = ctx.createLinearGradient(0, -bigSize / 2, 0, bigSize / 2);
      grad.addColorStop(0, c.textLayeredGradientFrom);
      grad.addColorStop(1, c.textLayeredGradientTo);
      return grad;
    }
    return c.textColor ?? '#ff1039';
  };
  const bigFill = buildBigFill();

  // Drop-shadow PASS: separate, hinter allem
  const dropOffset = c.textLayeredDropShadow ?? 0;
  if (dropOffset > 0) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.font = `900 ${bigSize}px ${family}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(bigText, dropOffset * 0.4, bigY + dropOffset);
    if (small) {
      ctx.font = `700 ${baseSize}px ${family}`;
      ctx.fillText(small, dropOffset * 0.4, smallY + dropOffset);
    }
    ctx.restore();
  }

  // Glow PASS: mehrere shadowBlur-Stufen für satten Halo (4 Layers wie DOM)
  if (c.textLayeredGlow) {
    const strength = c.textLayeredGlowStrength ?? 0.6;
    const blur = strength * 50;
    const glowColor = c.textLayeredGlowColor ?? '#ffffff';
    ctx.save();
    ctx.shadowColor = glowColor;
    ctx.font = `900 ${bigSize}px ${family}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const b of [blur * 1.5, blur, blur * 0.6, blur * 0.3]) {
      ctx.shadowBlur = b;
      // Wenn glow-only: glowColor selbst, sonst die "innen-Farbe" durchschimmern
      ctx.fillStyle = typeof bigFill === 'string' ? bigFill : glowColor;
      ctx.fillText(bigText, 0, bigY);
    }
    ctx.restore();
  }

  // Big-word: black stroke + final fill (gradient ODER solid)
  ctx.font = `900 ${bigSize}px ${family}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(2, bigSize * 0.04);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#000000';
  ctx.strokeText(bigText, 0, bigY);
  ctx.fillStyle = bigFill;
  ctx.fillText(bigText, 0, bigY);

  // Small-word: weiß + black stroke + soft drop-shadow
  if (small) {
    ctx.font = `700 ${baseSize}px ${family}`;
    ctx.lineWidth = Math.max(1.5, baseSize * 0.04);
    ctx.strokeStyle = '#000000';
    ctx.strokeText(small, 0, smallY);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(small, 0, smallY);
    ctx.restore();
  }
}

/* ─── Helpers ─────────────────────────────────────────────────── */

function lightenHex(hex: string, amount: number): string {
  const m = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return hex;
  const r = Math.min(255, Math.round(parseInt(m.slice(0, 2), 16) + (255 - parseInt(m.slice(0, 2), 16)) * amount));
  const g = Math.min(255, Math.round(parseInt(m.slice(2, 4), 16) + (255 - parseInt(m.slice(2, 4), 16)) * amount));
  const b = Math.min(255, Math.round(parseInt(m.slice(4, 6), 16) + (255 - parseInt(m.slice(4, 6), 16)) * amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function darkenHex(hex: string, amount: number): string {
  const m = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return hex;
  const r = Math.max(0, Math.round(parseInt(m.slice(0, 2), 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(m.slice(2, 4), 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(m.slice(4, 6), 16) * (1 - amount)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}
