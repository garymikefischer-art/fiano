/**
 * LUT-Live-Preview via WebGL2 3D-Texture.
 *
 * Workflow:
 *  1. parseCubeLut() — .cube file content → { size, data } (Float32Array sizeˆ3 * 4 RGBA)
 *  2. createLutGl() — initialisiert WebGL2-Context: shader-program, 3D-LUT-texture, video-texture, full-screen-quad
 *  3. drawFrame(video) — kopiert das aktuelle video-frame in eine 2D-Texture, sampled Color, 3D-LUT-lookup im fragment-shader
 *
 * Performance: WebGL2 ist Hardware-beschleunigt. 33×33×33 LUT ist <100KB Texture, render ist sub-1ms pro Frame.
 */

export interface ParsedCube {
  size: number;
  data: Float32Array;  // size³ × 4 (RGBA, alpha=1)
}

/** Parse .cube-Datei. Erwartet LUT_3D_SIZE + sizeˆ3 RGB-triples in Order R-fastest, B-slowest. */
export function parseCubeLut(text: string): ParsedCube | null {
  const lines = text.split(/\r?\n/);
  let size = 0;
  const values: number[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    if (line.startsWith('TITLE')) continue;
    if (line.startsWith('DOMAIN_MIN') || line.startsWith('DOMAIN_MAX')) continue;
    if (line.startsWith('LUT_3D_SIZE')) {
      const parts = line.split(/\s+/);
      size = parseInt(parts[1], 10);
      continue;
    }
    if (line.startsWith('LUT_1D_SIZE')) {
      console.warn('[lut] 1D LUTs not supported, skipping');
      return null;
    }
    // Daten-Zeile: "r g b" (gleitkomma)
    const parts = line.split(/\s+/).filter(Boolean);
    if (parts.length === 3) {
      const r = parseFloat(parts[0]);
      const g = parseFloat(parts[1]);
      const b = parseFloat(parts[2]);
      if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
        values.push(r, g, b);
      }
    }
  }
  if (size <= 0 || values.length !== size * size * size * 3) {
    console.warn(`[lut] parse failed: size=${size}, values=${values.length}, expected=${size * size * size * 3}`);
    return null;
  }
  // Rebuild als RGBA float32-array (WebGL2 RGBA-Format)
  const data = new Float32Array(size * size * size * 4);
  for (let i = 0; i < size * size * size; i++) {
    data[i * 4 + 0] = values[i * 3 + 0];
    data[i * 4 + 1] = values[i * 3 + 1];
    data[i * 4 + 2] = values[i * 3 + 2];
    data[i * 4 + 3] = 1.0;
  }
  return { size, data };
}

/** WebGL2-Context-Wrapper für LUT-Render. */
export interface LutGl {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  videoTex: WebGLTexture;
  lutTex: WebGLTexture;
  vao: WebGLVertexArrayObject;
  uVideoSampler: WebGLUniformLocation | null;
  uLutSampler: WebGLUniformLocation | null;
  uLutSize: WebGLUniformLocation | null;
  lutSize: number;
  /** Wendet die LUT auf das aktuelle video-frame an und rendert ins canvas. */
  drawFrame: (video: HTMLVideoElement) => void;
  /** Lädt eine neue LUT (z.B. wenn lutPath wechselt). */
  setLut: (lut: ParsedCube) => void;
  /** Cleanup beim unmount. */
  dispose: () => void;
}

const VERT_SRC = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 1.0 - (a_pos.y * 0.5 + 0.5));
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG_SRC = `#version 300 es
precision highp float;
precision highp sampler3D;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_video;
uniform sampler3D u_lut;
uniform float u_lutSize;
void main() {
  vec3 color = texture(u_video, v_uv).rgb;
  // Sample 3D-LUT — clamp + offset für linear interpolation auf cube-grid
  float scale = (u_lutSize - 1.0) / u_lutSize;
  float offset = 0.5 / u_lutSize;
  vec3 lutCoord = clamp(color, 0.0, 1.0) * scale + offset;
  vec3 graded = texture(u_lut, lutCoord).rgb;
  fragColor = vec4(graded, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('shader compile failed: ' + log);
  }
  return sh;
}

export function createLutGl(canvas: HTMLCanvasElement, initialLut: ParsedCube): LutGl | null {
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: false, antialias: false });
  if (!gl) {
    console.warn('[lut] webgl2 not supported');
    return null;
  }
  // Float-LUT-Texture braucht EXT_color_buffer_float für Linear-Sampling
  if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('OES_texture_float_linear')) {
    console.warn('[lut] float texture filter ext missing — LUT may look chunky');
  }

  // Program
  const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error('program link failed: ' + log);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  // Full-screen quad VAO
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,  1, -1,  -1, 1,
    -1,  1,  1, -1,   1, 1,
  ]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  // Video texture (2D, gets uploaded each frame)
  const videoTex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, videoTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // LUT 3D texture
  const lutTex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_3D, lutTex);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);

  const uVideoSampler = gl.getUniformLocation(program, 'u_video');
  const uLutSampler = gl.getUniformLocation(program, 'u_lut');
  const uLutSize = gl.getUniformLocation(program, 'u_lutSize');

  let currentLutSize = 0;
  const setLut = (lut: ParsedCube) => {
    gl.bindTexture(gl.TEXTURE_3D, lutTex);
    // RGBA8 statt RGBA32F: kein OES_texture_float_linear-Extension nötig, universally supported.
    // 8-bit reicht für visuelle Preview-Genauigkeit. LUT-floats (0..1) → 0..255 quantizing.
    const bytes = new Uint8Array(lut.data.length);
    for (let i = 0; i < lut.data.length; i++) {
      bytes[i] = Math.max(0, Math.min(255, Math.round(lut.data[i] * 255)));
    }
    gl.texImage3D(
      gl.TEXTURE_3D, 0, gl.RGBA8,
      lut.size, lut.size, lut.size, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, bytes,
    );
    currentLutSize = lut.size;
  };

  setLut(initialLut);

  const drawFrame = (video: HTMLVideoElement) => {
    // Defensive: video muss ready + frame-data geladen sein, sonst tainted/empty texture
    if (!video.videoWidth || !video.videoHeight) return;
    if (video.readyState < 2) return;  // HAVE_CURRENT_DATA
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(program);
    gl.bindVertexArray(vao);

    // Upload video frame
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, videoTex);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    } catch (e) {
      // Some video formats may throw during upload (e.g. before metadata ready) — silent skip
      return;
    }
    gl.uniform1i(uVideoSampler, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, lutTex);
    gl.uniform1i(uLutSampler, 1);
    gl.uniform1f(uLutSize, currentLutSize);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  const dispose = () => {
    gl.deleteTexture(videoTex);
    gl.deleteTexture(lutTex);
    gl.deleteVertexArray(vao);
    gl.deleteBuffer(vbo);
    gl.deleteProgram(program);
  };

  return { gl, program, videoTex, lutTex, vao, uVideoSampler, uLutSampler, uLutSize, lutSize: initialLut.size, drawFrame, setLut, dispose };
}

/** Helper: lädt .cube-File via IPC (file.readAsBase64) und parsed sie. */
export async function loadCubeFile(path: string): Promise<ParsedCube | null> {
  try {
    const res = await window.api.invoke<{ base64: string; mime: string; size: number }>('file.readAsBase64', { path });
    if (!res.ok || !res.data) return null;
    const text = atob(res.data.base64);
    return parseCubeLut(text);
  } catch (err) {
    console.warn('[lut] load failed:', err);
    return null;
  }
}
