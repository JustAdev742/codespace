// Host unit tests for the prop's hardware-independent logic.
//   make -C research/portal-gun/prop/firmware/test        (or see Makefile)

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <vector>

#include "../PortalGunProp/portal_core.h"

using namespace portal;

static int g_fail = 0, g_pass = 0;
#define CHECK(cond, ...)                                                   \
  do {                                                                     \
    if (cond) { ++g_pass; }                                                \
    else { ++g_fail; printf("FAIL %s:%d: %s  ", __FILE__, __LINE__, #cond); printf(__VA_ARGS__); printf("\n"); } \
  } while (0)

// ------------------------------------------------------------------ helpers
static void test_helpers() {
  RGB white[TOTAL_PIXELS];
  for (auto& p : white) p = RGB{255, 255, 255};
  CHECK(fabsf(estimateCurrentMa(white, TOTAL_PIXELS, 20.0f) - 1380.0f) < 0.01f, "full white should be 23 x 60 mA");
  float k = limitPower(white, TOTAL_PIXELS, 500.0f, 20.0f);
  CHECK(k < 0.37f && estimateCurrentMa(white, TOTAL_PIXELS, 20.0f) <= 500.0f, "limitPower must respect the budget (k=%f)", k);
  CHECK(fabsf(luminance(RGB{255, 255, 255}) - 1.0f) < 1e-4f, "white luminance 1");
  CHECK(luminance(RGB{0, 255, 0}) > luminance(RGB{255, 0, 0}), "green brighter than red");
  CHECK(isSaturatedRed(RGB{255, 20, 10}) && !isSaturatedRed(RGB{255, 150, 30}) && !isSaturatedRed(RGB{3, 0, 0}), "red test");
  CHECK(batteryPercent(-1.0f) == -1 && batteryPercent(3.2f) == 0 && batteryPercent(4.2f) == 100, "battery ends");
  int prev = -1;
  bool mono = true;
  for (float v = 3.2f; v <= 4.25f; v += 0.01f) { int p = batteryPercent(v); if (p < prev) mono = false; prev = p; }
  CHECK(mono, "battery percent monotonic");
}

static std::vector<float> wave(float hz, float amp, float base, float seconds, float dt, bool square) {
  std::vector<float> v;
  for (float t = 0; t < seconds; t += dt) {
    float s = sinf(6.2831853f * hz * t);
    v.push_back(base + amp * (square ? (s >= 0 ? 1.0f : -1.0f) : s));
  }
  return v;
}

static void test_flash_counter() {
  const float dt = 0.01f;
  auto a = wave(5.0f, 0.5f, 0.5f, 4, dt, true);
  int f = maxFlashesPerSecond(a.data(), (int)a.size(), dt);
  CHECK(f >= 4 && f <= 6, "5 Hz full square wave ~5 flashes/s, got %d", f);
  auto b = wave(2.0f, 0.4f, 0.5f, 4, dt, false);
  f = maxFlashesPerSecond(b.data(), (int)b.size(), dt);
  CHECK(f == 2, "2 Hz sine 2 flashes/s, got %d", f);
  auto c = wave(12.0f, 0.03f, 0.5f, 4, dt, false);
  CHECK(maxFlashesPerSecond(c.data(), (int)c.size(), dt) == 0, "small wiggles are not flashes");
  auto d = wave(10.0f, 0.08f, 0.9f, 4, dt, true);   // swing 0.82..0.98: darker state >= 0.8
  CHECK(maxFlashesPerSecond(d.data(), (int)d.size(), dt) == 0, "flicker above 0.8 relative luminance is not a general flash");
  std::vector<float> e(300, 0.1f);
  for (int i = 100; i < 150; ++i) e[i] = 0.9f;
  CHECK(maxFlashesPerSecond(e.data(), (int)e.size(), dt) == 1, "a single on/off is one flash");
  // flashing-sequence length: a 2 Hz sine for 3 s inside 10 s of steady light lasts ~3 s
  std::vector<float> g(1000, 0.5f);
  for (int i = 300; i < 600; ++i) g[i] = 0.5f + 0.4f * sinf(6.2831853f * 2.0f * (i - 300) * dt);
  float len = longestFlashSequenceS(g.data(), (int)g.size(), dt);
  CHECK(len > 2.4f && len < 3.1f, "a 3 s burst is a ~3 s flashing sequence, got %.2f s", len);
  auto slow = wave(0.3f, 0.4f, 0.5f, 9.17f, dt, false);   // ends at a trough, so no truncated last leg
  CHECK(maxFlashesPerSecond(slow.data(), (int)slow.size(), dt) == 0 && longestFlashSequenceS(slow.data(), (int)slow.size(), dt) == 0.0f,
        "a 0.3 Hz swell (legs over 1 s) is not flashing");
}

// ------------------------------------------------------------------ state machine
struct Rig {
  Gun gun;
  uint32_t t = 0;
  std::vector<Sound> sounds;
  explicit Rig(const Config& c = Config()) : gun(c) { gun.reset(0); }
  void step(const Inputs& in, uint32_t dt = 10) {
    t += dt;
    gun.update(t, in);
    Sound s = gun.takeSound();
    if (s != Sound::None) sounds.push_back(s);
  }
  void hold(uint32_t ms, Inputs in = Inputs()) { for (uint32_t k = 0; k < ms; k += 10) step(in); }
  bool heard(Sound s) const { for (auto x : sounds) if (x == s) return true; return false; }
};

static Inputs rangeIn(int mm, bool trigger = false) {
  Inputs in;
  in.trigger = trigger;
  in.range_mm = (int16_t)mm;
  in.range_new = true;
  return in;
}

static void test_state_machine() {
  Rig r;
  r.hold(1600);
  CHECK(r.gun.state() == State::Idle, "boot -> idle");
  CHECK(r.heard(Sound::Boot), "boot sound");
  Inputs press; press.trigger = true;
  r.step(press);
  CHECK(r.gun.state() == State::Aim, "press -> aim");
  r.step(Inputs());
  CHECK(r.gun.state() == State::NoTarget, "release without lock -> no target");
  CHECK(r.heard(Sound::Error), "error tone");
  r.hold(1000);
  CHECK(r.gun.state() == State::Idle, "no target -> idle");
  // aim with a stable 2.4 m range
  r.step(press);
  for (int i = 0; i < 4; ++i) r.step(rangeIn(2400 + i * 10, true));
  CHECK(r.gun.locked(), "stable readings lock");
  CHECK(r.heard(Sound::Lock), "lock chime");
  r.step(Inputs());
  CHECK(r.gun.state() == State::Opening, "release with lock -> opening");
  CHECK(r.heard(Sound::Open), "open sound");
  r.hold(1700);
  CHECK(r.gun.state() == State::Open, "opening -> open");
  r.hold(8100);
  CHECK(r.gun.state() == State::Closing || r.gun.state() == State::Cooldown, "open times out");
  r.hold(2500);
  CHECK(r.gun.state() == State::Idle, "back to idle");
  // a range already locked while idle chimes as soon as aiming starts
  {
    Rig q;
    q.hold(1600);
    for (int i = 0; i < 4; ++i) q.step(rangeIn(1800));
    CHECK(q.gun.locked() && !q.heard(Sound::Lock), "idle lock is silent");
    Inputs p2; p2.trigger = true;
    q.step(p2);
    CHECK(q.gun.state() == State::Aim && q.heard(Sound::Lock), "entering aim with a lock chimes");
  }
  // trigger closes an open portal early; so does a double tap
  r.step(press);
  for (int i = 0; i < 4; ++i) r.step(rangeIn(1500, true));
  r.step(Inputs());
  r.hold(1700);
  r.step(press);
  CHECK(r.gun.state() == State::Closing, "trigger closes early");
  r.step(Inputs());
  r.hold(2500);
  r.step(press);
  for (int i = 0; i < 4; ++i) r.step(rangeIn(1500, true));
  r.step(Inputs());
  r.hold(1700);
  Inputs tap; tap.double_tap = true;
  r.step(tap);
  CHECK(r.gun.state() == State::Closing, "double tap closes");
}

static void test_range_lock() {
  Rig r;
  r.hold(1600);
  Inputs press; press.trigger = true;
  r.step(press);
  r.step(rangeIn(1000, true)); r.step(rangeIn(1300, true)); r.step(rangeIn(900, true));
  CHECK(!r.gun.locked(), "inconsistent readings do not lock");
  for (int i = 0; i < 4; ++i) r.step(rangeIn(4500, true));
  CHECK(!r.gun.locked(), "beyond 4 m does not lock");
  for (int i = 0; i < 4; ++i) r.step(rangeIn(20, true));
  CHECK(!r.gun.locked(), "below 40 mm does not lock");
  for (int i = 0; i < 4; ++i) r.step(rangeIn(-1, true));
  CHECK(!r.gun.locked(), "sensor errors do not lock");
  DisplayModel d = r.gun.display();
  CHECK(strcmp(d.range, "-- m") == 0 && strcmp(d.status, "AIM") == 0, "display shows no range (%s, %s)", d.range, d.status);
  for (int i = 0; i < 4; ++i) r.step(rangeIn(2437, true));
  d = r.gun.display();
  CHECK(strcmp(d.range, "2.43 m") == 0 && strcmp(d.status, "LOCK") == 0, "display shows range and lock (%s, %s)", d.range, d.status);
}

static void test_dial_and_mode() {
  Rig r;
  r.hold(1600);
  const int n = Gun::dimensionCount();
  Inputs in; in.encoder_delta = -1;
  r.step(in);
  CHECK(r.gun.dimensionIndex() == n - 1, "dial wraps backwards");
  in.encoder_delta = 2;
  r.step(in);
  CHECK(r.gun.dimensionIndex() == 1, "dial wraps forwards");
  CHECK(r.heard(Sound::Click), "dial click");
  Inputs click; click.encoder_click = true;
  CHECK(r.gun.mode() == Mode::Steady, "steady is the default mode");
  r.step(click);
  CHECK(r.gun.mode() == Mode::Show, "click toggles show mode");
  r.step(click);
  CHECK(r.gun.mode() == Mode::Steady, "and back");
}

static void test_battery() {
  Rig r;
  r.hold(1600);
  Inputs b; b.battery_v = 3.45f;
  r.hold(500, b);
  CHECK(r.gun.state() == State::LowBattery, "low battery state");
  CHECK(r.heard(Sound::LowBattery), "low battery tone");
  b.trigger = true;
  r.step(b);
  CHECK(r.gun.state() == State::LowBattery, "cannot fire on low battery");
  b.trigger = false;
  b.battery_v = 3.6f;
  r.hold(500, b);
  CHECK(r.gun.state() == State::LowBattery, "hysteresis: 3.6 V does not recover");
  b.battery_v = 3.2f;
  r.hold(800, b);
  CHECK(r.gun.state() == State::Shutdown, "cutoff -> shutdown");
  RGB px[TOTAL_PIXELS];
  for (int k = 0; k < 50; ++k) r.gun.render(r.t + k * 10, px);
  bool dark = true;
  for (auto& p : px) if (p.r || p.g || p.b) dark = false;
  CHECK(dark, "shutdown turns every LED off");
  b.battery_v = 3.9f;
  r.hold(1500, b);
  CHECK(r.gun.state() == State::Idle, "recovers after charging");
}

// ------------------------------------------------------------------ rendering safety
struct Trace {
  std::vector<std::vector<float>> per_pixel = std::vector<std::vector<float>>(TOTAL_PIXELS);
  std::vector<float> ring_mean, all_mean;
  float max_ma = 0;
  int over_cap = 0, sat_red = 0;
};

static void record(Trace& tr, const RGB* px, const Config& c, float ma) {
  for (int i = 0; i < TOTAL_PIXELS; ++i) {
    tr.per_pixel[i].push_back(luminance(px[i]));
    if (px[i].r > c.max_channel || px[i].g > c.max_green || px[i].b > c.max_blue) ++tr.over_cap;
    if (isSaturatedRed(px[i])) ++tr.sat_red;
  }
  tr.ring_mean.push_back(meanLuminance(px, RING_PIXELS));
  tr.all_mean.push_back(meanLuminance(px, TOTAL_PIXELS));
  if (ma > tr.max_ma) tr.max_ma = ma;
}

// steady_only: the session never left Steady mode, so it must contain no flash at all.
static void assertSafe(const Trace& tr, const Config& c, const char* label, bool steady_only) {
  const float dt = 0.01f;
  int worst = 0, worst_i = -1;
  float longest = 0.0f;
  for (int i = 0; i < TOTAL_PIXELS; ++i) {
    int f = maxFlashesPerSecond(tr.per_pixel[i].data(), (int)tr.per_pixel[i].size(), dt);
    if (f > worst) { worst = f; worst_i = i; }
    float len = longestFlashSequenceS(tr.per_pixel[i].data(), (int)tr.per_pixel[i].size(), dt);
    if (len > longest) longest = len;
  }
  int fm = maxFlashesPerSecond(tr.ring_mean.data(), (int)tr.ring_mean.size(), dt);
  int fa = maxFlashesPerSecond(tr.all_mean.data(), (int)tr.all_mean.size(), dt);
  if (steady_only) {
    CHECK(worst == 0 && fm == 0 && fa == 0, "[%s] Steady must not flash: pixel %d (%d/s), ring %d, all %d", label, worst_i, worst, fm, fa);
  } else {
    CHECK(worst <= 3, "[%s] per-pixel flashes/s %d (pixel %d)", label, worst, worst_i);
    CHECK(fm <= 3 && fa <= 3, "[%s] whole-ring flashes/s %d / all %d", label, fm, fa);
  }
  CHECK(longest <= 5.0f, "[%s] flashing sequence lasts %.2f s (> 5 s)", label, longest);
  CHECK(tr.max_ma <= c.led_budget_ma + 1.0f, "[%s] LED current %.1f mA over budget", label, tr.max_ma);
  CHECK(tr.over_cap == 0, "[%s] %d pixel-frames over the channel caps", label, tr.over_cap);
  CHECK(tr.sat_red == 0, "[%s] %d saturated-red pixel-frames", label, tr.sat_red);
  printf("  %-28s worst pixel %d flash/s, ring %d, all %d, longest sequence %.1f s, peak LED %.0f mA\n",
         label, worst, fm, fa, longest, tr.max_ma);
}

static void scripted(Mode mode) {
  Config c;
  Rig r(c);
  Trace tr;
  RGB px[TOTAL_PIXELS];
  auto frame = [&](const Inputs& in) { r.step(in); r.gun.render(r.t, px); record(tr, px, c, r.gun.lastCurrentMa()); };
  for (int k = 0; k < 160; ++k) frame(Inputs());
  if (mode == Mode::Show) { Inputs click; click.encoder_click = true; frame(click); }
  for (int k = 0; k < 400; ++k) frame(Inputs());                    // idle
  Inputs aim; aim.trigger = true;
  for (int k = 0; k < 200; ++k) frame(k % 5 == 0 ? rangeIn(2000 + (k % 3) * 5, true) : aim);   // aim + lock
  for (int k = 0; k < 1300; ++k) frame(Inputs());                   // opening, open
  for (int k = 0; k < 400; ++k) frame(Inputs());                    // closing, cooldown, idle
  assertSafe(tr, c, mode == Mode::Steady ? "scripted, steady mode" : "scripted, show mode", mode == Mode::Steady);
}

static uint32_t lcg(uint32_t& s) { s = s * 1664525u + 1013904223u; return s >> 8; }

enum class ModePolicy { Steady, Show, Flip };

static void fuzz(uint32_t seed, ModePolicy policy) {
  const uint32_t seed0 = seed;
  Config c;
  Rig r(c);
  Trace tr;
  RGB px[TOTAL_PIXELS];
  bool trig = false;
  uint32_t next_toggle = 0;
  for (int k = 0; k < 6000; ++k) {   // 60 s at 100 Hz
    Inputs in;
    if (r.t >= next_toggle) { trig = !trig; next_toggle = r.t + 20 + lcg(seed) % 400; }   // mash the trigger
    in.trigger = trig;
    const bool flip = lcg(seed) % 97 == 0;
    if (policy == ModePolicy::Flip && flip) in.encoder_click = true;                       // flip modes
    if (policy == ModePolicy::Show && k == 0) in.encoder_click = true;                     // Show throughout
    if (lcg(seed) % 53 == 0) in.encoder_delta = (int)(lcg(seed) % 5) - 2;
    if (lcg(seed) % 211 == 0) in.double_tap = true;
    if (lcg(seed) % 4 == 0) { in.range_new = true; in.range_mm = (int16_t)(lcg(seed) % 3 ? 1500 + lcg(seed) % 40 : lcg(seed) % 6000); }
    r.step(in);
    r.gun.render(r.t, px);
    record(tr, px, c, r.gun.lastCurrentMa());
  }
  char label[64];
  const char* tag = policy == ModePolicy::Steady ? "steady" : (policy == ModePolicy::Show ? "show" : "mixed");
  snprintf(label, sizeof label, "fuzz %s, seed %u", tag, seed0);
  assertSafe(tr, c, label, policy == ModePolicy::Steady);
}

// ------------------------------------------------------------------ audio
static void test_synth() {
  const float sr = 22050.0f;
  Synth s(sr, 0.35f);
  const int cap = (int)(0.35f * 32767.0f) + 1;
  Sound all[] = {Sound::Boot, Sound::Click, Sound::Lock, Sound::Open, Sound::Close, Sound::Error, Sound::LowBattery};
  for (Sound snd : all) {
    s.trigger(snd);
    int n = 0, peak = 0;
    double sum2 = 0;
    while (s.busy() && n < 5 * 22050) { int v = s.next(); peak = abs(v) > peak ? abs(v) : peak; sum2 += (double)v * v; ++n; }
    CHECK(!s.busy(), "sound %d ends", (int)snd);
    CHECK(peak <= cap, "sound %d peak %d over speaker cap %d", (int)snd, peak, cap);
    double rms = sqrt(sum2 / (n > 0 ? n : 1));
    CHECK(rms > 300, "sound %d audible (rms %.0f)", (int)snd, rms);
  }
  // hum plus a whoosh on top must still respect the cap
  s.setHum(true);
  s.trigger(Sound::Open);
  int peak = 0;
  for (int n = 0; n < 3 * 22050; ++n) { int v = s.next(); peak = abs(v) > peak ? abs(v) : peak; }
  CHECK(peak <= cap, "hum + open peak %d over cap", peak);
  s.setHum(false);
  for (int n = 0; n < 22050; ++n) s.next();
  int tail = 0;
  for (int n = 0; n < 2205; ++n) { int v = s.next(); tail = abs(v) > tail ? abs(v) : tail; }
  CHECK(tail < 50, "hum fades out (tail %d)", tail);
  // speaker protection arithmetic: 0.35 of full scale into 8 ohm at 1.8 W max -> <= 0.25 W
  CHECK(0.35f * 0.35f * 1.8f <= 0.25f, "peak cap keeps a 0.25 W speaker within rating");
}

int main() {
  test_helpers();
  test_flash_counter();
  test_state_machine();
  test_range_lock();
  test_dial_and_mode();
  test_battery();
  scripted(Mode::Steady);
  scripted(Mode::Show);
  for (uint32_t seed : {1u, 7u, 42u, 2026u, 99991u}) {
    fuzz(seed, ModePolicy::Steady);
    fuzz(seed, ModePolicy::Show);
    fuzz(seed, ModePolicy::Flip);
  }
  test_synth();
  printf("%d passed, %d failed\n", g_pass, g_fail);
  return g_fail ? 1 : 0;
}
