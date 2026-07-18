// Output-volume gain for G.711 μ-law audio (OpenAI → Twilio direction).
// Callers reported the agent's voice too quiet; there is no volume knob on
// either the OpenAI or Twilio side, so we boost in the bridge. Implemented as
// a precomputed 256-entry byte map (decode μ-law → scale PCM → re-encode), so
// per-frame cost is a single table lookup per byte.

const BIAS = 0x84;
const CLIP = 32635;

function ulawToPcm(byte: number): number {
  const u = ~byte & 0xff;
  const sign = u & 0x80;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;
  let sample = (((mantissa << 3) + BIAS) << exponent) - BIAS;
  return sign ? -sample : sample;
}

function pcmToUlaw(sample: number): number {
  let sign = 0;
  if (sample < 0) {
    sign = 0x80;
    sample = -sample;
  }
  if (sample > CLIP) sample = CLIP;
  sample += BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (sample & mask) === 0 && exponent > 0; mask >>= 1) exponent--;
  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

function buildGainTable(gain: number): Uint8Array {
  const table = new Uint8Array(256);
  for (let b = 0; b < 256; b++) {
    table[b] = pcmToUlaw(Math.round(ulawToPcm(b) * gain));
  }
  return table;
}

const gainEnv = Number(process.env.OUTPUT_GAIN ?? '2');
const GAIN = Number.isFinite(gainEnv) && gainEnv > 0 ? Math.min(gainEnv, 4) : 2;
const GAIN_TABLE = GAIN === 1 ? null : buildGainTable(GAIN);

if (GAIN_TABLE) console.log(`[audio] output gain ${GAIN}x enabled (OUTPUT_GAIN to change)`);

/** Boost a base64 μ-law frame by the configured gain. */
export function boostOutputAudio(base64: string): string {
  if (!GAIN_TABLE) return base64;
  const buf = Buffer.from(base64, 'base64');
  for (let i = 0; i < buf.length; i++) buf[i] = GAIN_TABLE[buf[i] as number] as number;
  return buf.toString('base64');
}
