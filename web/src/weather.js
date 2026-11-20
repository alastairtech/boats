// Weather: a simple Markov chain of weather fronts that sweep the archipelago.
// The simulation owns the state (it slows sea-going boats and wears them in storms);
// the view reads it to drive clouds, rain, fog, light and the sea state.

export const WEATHER = {
  clear: { label: 'Clear', icon: '☀️', cloud: 0.06, dark: 0, rain: 0, fog: 0, wind: [0.15, 0.5], speed: 1, wear: 1 },
  fair: { label: 'Fair', icon: '🌤️', cloud: 0.32, dark: 0.04, rain: 0, fog: 0, wind: [0.3, 0.75], speed: 1, wear: 1 },
  cloudy: { label: 'Overcast', icon: '☁️', cloud: 0.72, dark: 0.25, rain: 0, fog: 0.12, wind: [0.45, 1], speed: 1, wear: 1 },
  rain: { label: 'Rain', icon: '🌧️', cloud: 0.88, dark: 0.4, rain: 0.55, fog: 0.3, wind: [0.7, 1.2], speed: 0.92, wear: 1.15 },
  storm: { label: 'Storm', icon: '⛈️', cloud: 1, dark: 0.68, rain: 1, fog: 0.42, wind: [1.4, 1.9], speed: 0.72, wear: 1.7 },
  fog: { label: 'Fog', icon: '🌫️', cloud: 0.45, dark: 0.18, rain: 0, fog: 1, wind: [0.02, 0.2], speed: 0.82, wear: 1 },
};

// Where each kind of weather tends to go next.
const NEXT = {
  clear: { clear: 2, fair: 4, cloudy: 1, fog: 1 },
  fair: { clear: 3, fair: 1, cloudy: 3, fog: 0.6 },
  cloudy: { fair: 2.5, cloudy: 0.6, rain: 3, storm: 0.8, fog: 0.6 },
  rain: { cloudy: 2.5, rain: 0.6, storm: 1.2, fair: 1 },
  storm: { rain: 3, cloudy: 1.5 },
  fog: { clear: 2, fair: 2, cloudy: 1 },
};

const DAYS = { clear: [6, 16], fair: [5, 14], cloudy: [4, 10], rain: [3, 8], storm: [2, 5], fog: [2, 5] };

export class Weather {
  constructor() { this.reset(); }

  reset() {
    this.kind = 'fair';
    this.left = 8;
    this.wind = 0.5;
    this.windDir = Math.random() * Math.PI * 2;
  }

  get info() { return WEATHER[this.kind]; }

  // Called once per in-game day. Returns the new kind when the weather changes.
  day() {
    this.windDir += (Math.random() - 0.5) * 0.35;
    const w = this.info.wind;
    const target = w[0] + Math.random() * (w[1] - w[0]);
    this.wind += (target - this.wind) * 0.5;
    if (--this.left > 0) return null;
    const opts = Object.entries(NEXT[this.kind]);
    let r = Math.random() * opts.reduce((s, [, p]) => s + p, 0);
    let next = opts[0][0];
    for (const [k, p] of opts) { r -= p; if (r <= 0) { next = k; break; } }
    const d = DAYS[next];
    this.left = Math.round(d[0] + Math.random() * (d[1] - d[0]));
    const changed = next !== this.kind;
    this.kind = next;
    if (next === 'storm') this.windDir += (Math.random() - 0.5) * 1.5;
    return changed ? next : null;
  }

  windKmh() { return Math.round(this.wind * 40); }

  serialize() { return { kind: this.kind, left: this.left, wind: this.wind, windDir: this.windDir }; }
  restore(s) { if (s && WEATHER[s.kind]) Object.assign(this, s); }
}
