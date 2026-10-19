// Portal gun prop: hardware-independent logic (see portal_core.h).

#include "portal_core.h"

#include <math.h>
#include <stdio.h>
#include <string.h>

namespace portal {

namespace {

const char* const kCodes[] = {"C-137", "35-C", "J19-Z7", "D-716", "LAB-01", "HOME"};
constexpr int kCodeCount = sizeof(kCodes) / sizeof(kCodes[0]);
constexpr float kTwoPi = 6.28318530718f;

float clamp01(float x) { return x < 0.0f ? 0.0f : (x > 1.0f ? 1.0f : x); }

uint8_t to8(float x) {
  x = clamp01(x) * 255.0f + 0.5f;
  return static_cast<uint8_t>(x > 255.0f ? 255.0f : x);
}

RGB mix(RGB a, RGB b, float t) {
  t = clamp01(t);
  return RGB{static_cast<uint8_t>(a.r + (b.r - a.r) * t), static_cast<uint8_t>(a.g + (b.g - a.g) * t),
             static_cast<uint8_t>(a.b + (b.b - a.b) * t)};
}

RGB scale(RGB c, float k) {
  return RGB{to8(c.r / 255.0f * k), to8(c.g / 255.0f * k), to8(c.b / 255.0f * k)};
}

// Palette: portal greens, a teal highlight, and amber for warnings (never saturated red).
const RGB kDeep{0, 70, 18};
const RGB kGreen{40, 255, 70};
const RGB kTeal{90, 255, 170};
const RGB kAmber{255, 150, 30};

// Per-pixel limiters.
//
// Show mode (fast animation): a reversal governor. A pixel's luminance may not turn round
// (move more than kReversalEps back from its running extreme) sooner than min_leg_ms after
// its previous turning point. Every flash needs two opposing changes, so with 180 ms each
// pixel is capped at 1000 / (2 * 180) = 2.8 flashes per second, with flash leading edges
// >= 360 ms apart. Wiggles smaller than kReversalEps (0.04) are below the 0.1 threshold.
//
// Everything else (all of Steady mode, and Show mode outside its fast runs): a slew
// limiter. Luminance may change by at most steady_slew_per_s per second, so any change of
// 0.1 or more takes over a second and two opposing ones can never share a one-second
// window: no flashes at all, whatever the pattern asks for.
constexpr float kReversalEps = 0.04f;

struct PixelGovernor {
  float ext = 0.0f;       // running extreme of the current leg
  int8_t dir = 0;         // +1 rising, -1 falling, 0 not yet moving
  uint32_t t_turn = 0;    // when the current leg started
  float slewL = 0.0f;     // slew-limited luminance (kept in step with the output)
  RGB last{0, 0, 0};
};

PixelGovernor g_gov[TOTAL_PIXELS];

RGB withLuminance(RGB c, float L, RGB fallback) {
  float have = luminance(c);
  if (have < 1e-4f) {
    c = fallback;
    have = luminance(c);
    if (have < 1e-4f) return RGB{0, 0, 0};
  }
  const float k = L / have;
  auto ch = [k](uint8_t v) { float x = v * k + 0.5f; return static_cast<uint8_t>(x > 255.0f ? 255.0f : (x < 0.0f ? 0.0f : x)); };
  return RGB{ch(c.r), ch(c.g), ch(c.b)};
}

RGB governPixel(int i, RGB want, uint32_t now, uint32_t min_leg_ms) {
  PixelGovernor& g = g_gov[i];
  const float L = luminance(want);
  float out = L;
  if (g.dir == 0) {
    if (L > g.ext + kReversalEps) { g.dir = 1; g.t_turn = now; g.ext = L; }
    else if (L < g.ext - kReversalEps) { g.dir = -1; g.t_turn = now; g.ext = L; }
  } else if (g.dir > 0) {
    if (L >= g.ext) {
      g.ext = L;
    } else if (g.ext - L > kReversalEps) {
      if (now - g.t_turn < min_leg_ms) out = g.ext - kReversalEps;   // too soon: hold up
      else { g.dir = -1; g.t_turn = now; g.ext = L; }
    }
  } else {
    if (L <= g.ext) {
      g.ext = L;
    } else if (L - g.ext > kReversalEps) {
      if (now - g.t_turn < min_leg_ms) out = g.ext + kReversalEps;   // too soon: hold down
      else { g.dir = 1; g.t_turn = now; g.ext = L; }
    }
  }
  RGB res = out == L ? want : withLuminance(want, out, g.last);
  g.last = res;
  g.slewL = luminance(res);
  return res;
}

RGB slewPixel(int i, RGB want, float max_step) {
  PixelGovernor& g = g_gov[i];
  const float L = luminance(want);
  float d = L - g.slewL;
  if (d > max_step) d = max_step;
  if (d < -max_step) d = -max_step;
  g.slewL += d;
  RGB res = fabsf(g.slewL - L) < 1e-6f ? want : withLuminance(want, g.slewL, g.last);
  g.last = res;
  // keep the reversal governor's view consistent for a later switch to fast animation
  g.ext = g.slewL;
  g.dir = 0;
  return res;
}

// Turning-point times of a series, using the WCAG flash rule: legs of >= 0.1 whose darker
// end is below 0.8. Shared by the flash counters below.
int flashChangeTimes(const float* x, int n, float dt, float* t_change, int cap) {
  if (n < 2) return 0;
  const float h = 0.1f;
  int nc = 0;
  int dir = 0;
  float lo = x[0], hi = x[0], ext = x[0], pivot = x[0];
  int ext_i = 0;
  auto record = [&](float from, float to, int at) {
    float darker = from < to ? from : to;
    if (fabsf(to - from) >= h && darker < 0.8f && nc < cap) t_change[nc++] = at * dt;
  };
  for (int i = 1; i < n; ++i) {
    const float v = x[i];
    if (dir == 0) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
      if (v - lo >= h) { dir = 1; pivot = lo; ext = v; ext_i = i; }
      else if (hi - v >= h) { dir = -1; pivot = hi; ext = v; ext_i = i; }
    } else if (dir > 0) {
      if (v > ext) { ext = v; ext_i = i; }
      else if (ext - v >= h) { record(pivot, ext, ext_i); pivot = ext; dir = -1; ext = v; ext_i = i; }
    } else {
      if (v < ext) { ext = v; ext_i = i; }
      else if (v - ext >= h) { record(pivot, ext, ext_i); pivot = ext; dir = 1; ext = v; ext_i = i; }
    }
  }
  if (dir != 0) record(pivot, ext, ext_i);
  return nc;
}

float g_changes[8192];

}  // namespace

// ---------------------------------------------------------------------- helpers
float estimateCurrentMa(const RGB* px, int n, float ma_per_channel) {
  float sum = 0.0f;
  for (int i = 0; i < n; ++i) sum += (px[i].r + px[i].g + px[i].b) / 255.0f;
  return sum * ma_per_channel;
}

float limitPower(RGB* px, int n, float budget_ma, float ma_per_channel) {
  float ma = estimateCurrentMa(px, n, ma_per_channel);
  if (ma <= budget_ma || ma <= 0.0f) return 1.0f;
  float k = budget_ma / ma;
  for (int i = 0; i < n; ++i) {
    // floor (not round) so the scaled frame never exceeds the budget
    px[i].r = static_cast<uint8_t>(px[i].r * k);
    px[i].g = static_cast<uint8_t>(px[i].g * k);
    px[i].b = static_cast<uint8_t>(px[i].b * k);
  }
  return k;
}

float luminance(const RGB& c) {
  // NeoPixel values are PWM duty cycles, i.e. already linear light.
  return (0.2126f * c.r + 0.7152f * c.g + 0.0722f * c.b) / 255.0f;
}

float meanLuminance(const RGB* px, int n) {
  float s = 0.0f;
  for (int i = 0; i < n; ++i) s += luminance(px[i]);
  return n > 0 ? s / n : 0.0f;
}

bool isSaturatedRed(const RGB& c) {
  int sum = c.r + c.g + c.b;
  return sum > 30 && c.r >= 0.8f * sum;
}

int batteryPercent(float v) {
  if (v < 0.0f) return -1;
  // Coarse resting-voltage map for a single LiPo cell (illustrative, not a fuel gauge).
  const float pts[][2] = {{3.30f, 0}, {3.50f, 5}, {3.65f, 20}, {3.75f, 40}, {3.85f, 60}, {3.95f, 75}, {4.05f, 88}, {4.20f, 100}};
  if (v <= pts[0][0]) return 0;
  for (size_t i = 1; i < sizeof(pts) / sizeof(pts[0]); ++i) {
    if (v <= pts[i][0]) {
      float t = (v - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]);
      return static_cast<int>(pts[i - 1][1] + t * (pts[i][1] - pts[i - 1][1]) + 0.5f);
    }
  }
  return 100;
}

int maxFlashesPerSecond(const float* x, int n, float dt) {
  // Zig-zag turning points with a 0.1 hysteresis: each leg is a luminance change of at
  // least 0.1. A leg counts when its darker end is below 0.8 (WCAG general flash). A flash
  // is a pair of opposing changes, so flashes in a window = changes / 2.
  const int nc = flashChangeTimes(x, n, dt, g_changes, 8192);
  int best = 0;
  int j = 0;
  for (int i = 0; i < nc; ++i) {
    while (g_changes[i] - g_changes[j] >= 1.0f) ++j;
    const int flashes = (i - j + 1) / 2;
    if (flashes > best) best = flashes;
  }
  return best;
}

float longestFlashSequenceS(const float* x, int n, float dt) {
  const int nc = flashChangeTimes(x, n, dt, g_changes, 8192);
  float best = 0.0f;
  int start = 0;
  for (int i = 1; i <= nc; ++i) {
    if (i == nc || g_changes[i] - g_changes[i - 1] >= 1.0f) {
      if (i - start >= 2) {
        const float len = g_changes[i - 1] - g_changes[start];
        if (len > best) best = len;
      }
      start = i;
    }
  }
  return best;
}

// ---------------------------------------------------------------------- Gun
Gun::Gun(const Config& cfg) : cfg_(cfg) { reset(0); }

int Gun::dimensionCount() { return kCodeCount; }

const char* Gun::dimensionCode() const { return kCodes[dim_]; }

void Gun::reset(uint32_t now_ms) {
  state_ = State::Boot;
  mode_ = Mode::Steady;
  t_state_ = t_last_ = now_ms;
  trigger_prev_ = false;
  locked_ = false;
  range_mm_ = -1;
  nsamples_ = 0;
  dim_ = 0;
  battery_v_ = -1.0f;
  bright_ = 0.0f;
  phase_ = jphase_ = 0.0f;
  power_k_ = 1.0f;
  fast_ms_ = 0.0f;
  fast_rest_ = false;
  t_render_ = now_ms;
  pending_ = Sound::Boot;
  for (auto& g : g_gov) g = PixelGovernor{};
}

void Gun::enter(State s, uint32_t now_ms) {
  state_ = s;
  t_state_ = now_ms;
}

void Gun::feedRange(int16_t mm) {
  range_mm_ = mm;
  for (int i = (sizeof(samples_) / sizeof(samples_[0])) - 1; i > 0; --i) samples_[i] = samples_[i - 1];
  samples_[0] = mm;
  if (nsamples_ < sizeof(samples_) / sizeof(samples_[0])) ++nsamples_;
  bool ok = nsamples_ >= cfg_.lock_samples;
  float lo = 1e9f, hi = -1e9f, sum = 0.0f;
  for (int i = 0; ok && i < cfg_.lock_samples; ++i) {
    int16_t s = samples_[i];
    if (s < static_cast<int>(cfg_.range_min_mm) || s > static_cast<int>(cfg_.range_max_mm)) ok = false;
    lo = s < lo ? s : lo;
    hi = s > hi ? s : hi;
    sum += s;
  }
  if (ok) {
    float mean = sum / cfg_.lock_samples;
    ok = (hi - lo) <= cfg_.lock_tolerance * mean;
  }
  if (ok && !locked_ && state_ == State::Aim) pending_ = Sound::Lock;
  locked_ = ok;
}

void Gun::update(uint32_t now, const Inputs& in) {
  t_last_ = now;
  const uint32_t age = now - t_state_;
  if (in.range_new) feedRange(in.range_mm);
  if (in.battery_v >= 0.0f) {
    battery_v_ = battery_v_ < 0.0f ? in.battery_v : battery_v_ + 0.2f * (in.battery_v - battery_v_);
  }
  if (in.encoder_delta != 0) {
    dim_ = ((dim_ + in.encoder_delta) % kCodeCount + kCodeCount) % kCodeCount;
    pending_ = Sound::Click;
  }
  if (in.encoder_click) {
    mode_ = mode_ == Mode::Steady ? Mode::Show : Mode::Steady;
    pending_ = Sound::Click;
  }
  const bool pressed = in.trigger && !trigger_prev_;
  const bool released = !in.trigger && trigger_prev_;
  trigger_prev_ = in.trigger;

  // battery supervision overrides everything
  if (battery_v_ >= 0.0f) {
    if (battery_v_ < cfg_.cutoff_v) {
      if (state_ != State::Shutdown) { enter(State::Shutdown, now); pending_ = Sound::None; }
      return;
    }
    if (state_ == State::Shutdown || state_ == State::LowBattery) {
      if (battery_v_ >= cfg_.recover_v) enter(State::Idle, now);
      else if (state_ == State::Shutdown) return;
    } else if (battery_v_ < cfg_.low_batt_v) {
      enter(State::LowBattery, now);
      pending_ = Sound::LowBattery;
      return;
    }
  }

  switch (state_) {
    case State::Boot:
      if (age >= cfg_.boot_ms) enter(State::Idle, now);
      break;
    case State::Idle:
      if (pressed) {
        enter(State::Aim, now);
        if (locked_) pending_ = Sound::Lock;   // already locked: chime as aiming starts
      }
      break;
    case State::Aim:
      if (released) {
        if (locked_) { enter(State::Opening, now); pending_ = Sound::Open; }
        else { enter(State::NoTarget, now); pending_ = Sound::Error; }
      }
      break;
    case State::Opening:
      if (age >= cfg_.opening_ms) enter(State::Open, now);
      break;
    case State::Open:
      if (age >= cfg_.open_ms || in.double_tap || pressed) { enter(State::Closing, now); pending_ = Sound::Close; }
      break;
    case State::Closing:
      if (age >= cfg_.closing_ms) enter(State::Cooldown, now);
      break;
    case State::Cooldown:
      if (age >= cfg_.cooldown_ms) enter(State::Idle, now);
      break;
    case State::NoTarget:
      if (age >= cfg_.notarget_ms) enter(State::Idle, now);
      break;
    case State::LowBattery:
      if (pressed) pending_ = Sound::Error;
      break;
    case State::Shutdown:
      break;
  }
}

float Gun::targetBrightness() const {
  const float age = static_cast<float>(t_last_ - t_state_);
  const float show = mode_ == Mode::Show ? 1.0f : 0.8f;
  switch (state_) {
    case State::Boot: return 0.35f * clamp01(age / cfg_.boot_ms) * show;
    case State::Idle: return cfg_.idle_level * show;
    case State::Aim: return 0.45f * show;
    case State::Opening: return (0.45f + 0.5f * clamp01(age / cfg_.opening_ms)) * show;
    case State::Open: return 0.85f * show;
    case State::Closing: return (0.85f - 0.65f * clamp01(age / cfg_.closing_ms)) * show;
    case State::Cooldown: return 0.2f * show;
    case State::NoTarget: return 0.35f * show;
    case State::LowBattery: return 0.10f;
    case State::Shutdown: return 0.0f;
  }
  return 0.0f;
}

bool Gun::fastAllowed(float dt_s) {
  // Show mode only, in the active states, and for at most show_fast_ms at a time: the
  // budget fills while fast animation runs and must drain completely (1:1) before the
  // next fast run, so flashing sequences stay under 5 s with rests in between.
  const bool active = state_ == State::Aim || state_ == State::Opening || state_ == State::Open || state_ == State::Closing;
  const bool wants = mode_ == Mode::Show && active;
  if (wants && !fast_rest_) {
    fast_ms_ += dt_s * 1000.0f;
    if (fast_ms_ >= static_cast<float>(cfg_.show_fast_ms)) fast_rest_ = true;
  } else {
    fast_ms_ -= dt_s * 1000.0f;
    if (fast_ms_ <= 0.0f) { fast_ms_ = 0.0f; fast_rest_ = false; }
  }
  return wants && !fast_rest_;
}

void Gun::render(uint32_t now, RGB* out) {
  float dt = (now - t_render_) / 1000.0f;
  if (dt <= 0.0f || dt > 0.25f) dt = 0.02f;
  t_render_ = now;

  // global brightness follows its target through a first-order low-pass
  const float a = 1.0f - expf(-dt / cfg_.brightness_tau_s);
  bright_ += (targetBrightness() - bright_) * a;

  // pattern rotation speed (turns/s); per-pixel modulation frequency = lobes * speed <= cap
  const bool fast = fastAllowed(dt);
  const float cap = fast ? cfg_.max_pixel_hz_show : cfg_.max_pixel_hz_steady;
  const float age = static_cast<float>(now - t_state_);
  float speed = 0.12f;
  const int lobes = 1;
  switch (state_) {
    case State::Aim: speed = 0.6f * cap; break;
    case State::Opening: speed = cap * (0.4f + 0.6f * clamp01(age / cfg_.opening_ms)); break;
    case State::Open: speed = cap; break;
    case State::Closing: speed = cap * (1.0f - 0.7f * clamp01(age / cfg_.closing_ms)); break;
    default: speed = 0.12f; break;
  }
  if (speed * lobes > cap) speed = cap / lobes;
  phase_ += speed * dt;
  phase_ -= floorf(phase_);
  jphase_ += 0.25f * dt;
  jphase_ -= floorf(jphase_);

  RGB px[TOTAL_PIXELS];
  for (int i = 0; i < RING_PIXELS; ++i) {
    const float th = static_cast<float>(i) / RING_PIXELS;
    const float s = 0.5f + 0.5f * cosf(kTwoPi * lobes * (th - phase_));
    RGB c;
    switch (state_) {
      case State::Aim: {
        // soft comet; amber while searching, green once the range is locked. Without fast
        // animation the comet is a gentle brightening (the slew limiter would flatten more)
        RGB head = locked_ ? kGreen : kAmber;
        c = fast ? mix(scale(head, 0.15f), head, s * s) : mix(scale(head, 0.8f), head, s * s);
        break;
      }
      case State::NoTarget:
        c = mix(scale(kAmber, 0.4f), kAmber, 0.5f + 0.2f * s);
        break;
      case State::LowBattery:
        c = scale(kGreen, 0.5f);
        break;
      case State::Shutdown:
        c = RGB{0, 0, 0};
        break;
      default:
        // fast: deep-to-bright swirl; otherwise the swirl moves in hue (green to teal) at
        // almost constant luminance, so it reads as motion without brightness flicker
        c = fast ? mix(kDeep, mix(kGreen, kTeal, s), 0.35f + 0.65f * s) : mix(kGreen, kTeal, s);
        break;
    }
    px[i] = scale(c, bright_);
  }
  for (int j = 0; j < JEWEL_PIXELS; ++j) {
    // jewel: centre pixel then six around it; a slow "fluid" swirl
    float s = j == 0 ? 0.7f : 0.5f + 0.5f * cosf(kTwoPi * ((j - 1) / 6.0f - jphase_));
    RGB c = fast ? mix(kDeep, kGreen, 0.3f + 0.7f * s) : mix(kGreen, kTeal, s);
    if (state_ == State::LowBattery) c = j == 0 ? kAmber : scale(kGreen, 0.3f);
    if (state_ == State::Shutdown) c = RGB{0, 0, 0};
    float jb = state_ == State::Open || state_ == State::Opening ? bright_ : 0.6f * bright_ + 0.05f;
    if (state_ == State::Shutdown) jb = 0.0f;
    px[RING_PIXELS + j] = scale(c, jb);
  }
  auto caps = [this](RGB* p) {
    for (int i = 0; i < TOTAL_PIXELS; ++i) {
      if (p[i].r > cfg_.max_channel) p[i].r = cfg_.max_channel;
      if (p[i].g > cfg_.max_green) p[i].g = cfg_.max_green;
      if (p[i].b > cfg_.max_blue) p[i].b = cfg_.max_blue;
    }
  };
  caps(px);
  // power: a smoothed scale keeps the frame inside the budget without fast pumping
  const float ma = estimateCurrentMa(px, TOTAL_PIXELS, cfg_.ma_per_channel);
  const float want_k = ma > cfg_.led_budget_ma ? cfg_.led_budget_ma / ma : 1.0f;
  power_k_ = want_k < power_k_ ? want_k : power_k_ + (want_k - power_k_) * a;
  for (int i = 0; i < TOTAL_PIXELS; ++i) px[i] = scale(px[i], power_k_);
  const float max_step = cfg_.steady_slew_per_s * dt;
  for (int i = 0; i < TOTAL_PIXELS; ++i) {
    if (state_ == State::Shutdown) { g_gov[i].slewL = 0.0f; g_gov[i].last = px[i]; continue; }   // cut at once
    px[i] = fast ? governPixel(i, px[i], now, cfg_.show_min_leg_ms) : slewPixel(i, px[i], max_step);
  }
  caps(px);
  limitPower(px, TOTAL_PIXELS, cfg_.led_budget_ma, cfg_.ma_per_channel);  // hard backstop
  last_ma_ = estimateCurrentMa(px, TOTAL_PIXELS, cfg_.ma_per_channel);
  memcpy(out, px, sizeof(px));
}

Sound Gun::takeSound() {
  Sound s = pending_;
  pending_ = Sound::None;
  return s;
}

DisplayModel Gun::display() const {
  DisplayModel d{};
  switch (state_) {
    case State::Boot: d.status = "BOOT"; break;
    case State::Idle: d.status = "READY"; break;
    case State::Aim: d.status = locked_ ? "LOCK" : "AIM"; break;
    case State::Opening: d.status = "OPENING"; break;
    case State::Open: d.status = "OPEN"; break;
    case State::Closing: d.status = "CLOSING"; break;
    case State::Cooldown: d.status = "COOLDOWN"; break;
    case State::NoTarget: d.status = "NO TARGET"; break;
    case State::LowBattery: d.status = "LOW BATT"; break;
    case State::Shutdown: d.status = "CHARGE"; break;
  }
  if (range_mm_ >= static_cast<int>(cfg_.range_min_mm) && range_mm_ <= static_cast<int>(cfg_.range_max_mm)) {
    snprintf(d.range, sizeof(d.range), "%d.%02d m", range_mm_ / 1000, (range_mm_ % 1000) / 10);
  } else {
    snprintf(d.range, sizeof(d.range), "-- m");
  }
  d.locked = locked_;
  d.code = kCodes[dim_];
  d.battery_pct = batteryPercent(battery_v_);
  d.show_mode = mode_ == Mode::Show;
  return d;
}

// ---------------------------------------------------------------------- Synth
Synth::Synth(float sample_rate, float peak) : sr_(sample_rate), peak_(peak) {}

float Synth::noise() {
  rng_ = rng_ * 1664525u + 1013904223u;
  return (static_cast<int32_t>(rng_ >> 8) & 0xFFFF) / 32768.0f - 1.0f;
}

void Synth::trigger(Sound s) {
  if (s == Sound::None) return;
  cur_ = s;
  n_ = 0;
  ph1_ = ph2_ = 0.0f;
  lp_ = 0.0f;
  float seconds = 0.0f;
  switch (s) {
    case Sound::Boot: seconds = 0.6f; break;
    case Sound::Click: seconds = 0.012f; break;
    case Sound::Lock: seconds = 0.22f; break;
    case Sound::Open: seconds = 1.6f; break;
    case Sound::Close: seconds = 0.9f; break;
    case Sound::Error: seconds = 0.38f; break;
    case Sound::LowBattery: seconds = 0.75f; break;
    case Sound::None: break;
  }
  len_ = remaining_ = static_cast<uint32_t>(seconds * sr_);
}

int16_t Synth::next() {
  float out = 0.0f;
  if (remaining_ > 0) {
    const float t = n_ / sr_;
    const float T = len_ / sr_;
    const float u = t / T;  // 0..1 through the sound
    // attack/release envelope shared by all one-shots
    float env = clamp01(t / 0.01f) * clamp01((T - t) / 0.06f);
    switch (cur_) {
      case Sound::Boot: {
        const float f = 220.0f + 220.0f * u;
        ph1_ += f / sr_;
        out = 0.6f * sinf(kTwoPi * ph1_) * env;
        break;
      }
      case Sound::Click:
        out = noise() * clamp01(1.0f - u) * 0.5f;
        break;
      case Sound::Lock: {
        const float f = u < 0.45f ? 660.0f : 880.0f;
        ph1_ += f / sr_;
        out = 0.5f * sinf(kTwoPi * ph1_) * env;
        break;
      }
      case Sound::Open:
      case Sound::Close: {
        const bool open = cur_ == Sound::Open;
        const float sweep = open ? u : 1.0f - u;
        const float fc = 200.0f * powf(15.0f, sweep);                   // 200 Hz .. 3 kHz
        const float alpha = 1.0f - expf(-kTwoPi * fc / sr_);
        lp_ += alpha * (noise() - lp_);
        const float f = 110.0f * powf(4.0f, sweep);                      // 110 .. 440 Hz chirp
        ph1_ += f / sr_;
        const float swell = open ? clamp01(t / 0.08f) * (1.0f - 0.6f * u) : (1.0f - u);
        out = (0.7f * lp_ * 2.5f + 0.35f * sinf(kTwoPi * ph1_)) * swell * env;
        break;
      }
      case Sound::Error: {
        const bool second = u > 0.45f;
        const bool gap = u > 0.32f && u <= 0.45f;
        ph1_ += (second ? 262.0f : 330.0f) / sr_;
        out = gap ? 0.0f : 0.45f * sinf(kTwoPi * ph1_) * env;
        break;
      }
      case Sound::LowBattery: {
        const int step = static_cast<int>(u * 3.0f);
        const float f = step == 0 ? 523.0f : (step == 1 ? 440.0f : 349.0f);
        ph1_ += f / sr_;
        out = 0.4f * sinf(kTwoPi * ph1_) * env;
        break;
      }
      case Sound::None:
        break;
    }
    ++n_;
    --remaining_;
  }
  // background hum while a portal is open (fades in and out)
  hum_level_ += ((hum_ ? 1.0f : 0.0f) - hum_level_) * (1.0f / (0.25f * sr_));
  if (hum_level_ > 1e-4f) {
    phh_ += 55.0f / sr_;
    phh2_ += 0.7f / sr_;
    phh_ -= floorf(phh_);
    phh2_ -= floorf(phh2_);
    out += hum_level_ * 0.25f * (0.7f * sinf(kTwoPi * phh_) + 0.3f * sinf(2.0f * kTwoPi * phh_)) * (0.8f + 0.2f * sinf(kTwoPi * phh2_));
  }
  if (out > 1.0f) out = 1.0f;
  if (out < -1.0f) out = -1.0f;
  return static_cast<int16_t>(out * peak_ * 32767.0f);
}

}  // namespace portal
