// Portal gun prop: hardware-independent logic.
//
// Everything that decides what the prop does lives here, so it can be unit-tested on a
// desktop compiler (see ../test). The Arduino sketch only moves data between this code
// and the hardware. No heap allocation, no Arduino headers.
//
// Safety properties enforced here (and checked by the host tests):
//   * Flash limit: in the default Steady mode no pixel, and not the ring as a whole,
//     changes luminance in a way that counts as more than 3 flashes in any one-second
//     window (WCAG 2.2 SC 2.3.1 / ITU-R BT.1702 heuristics), and no saturated-red flashes.
//   * LED current budget: frames are scaled so the estimated LED draw (60 mA per full-white
//     pixel, Adafruit NeoPixel Uberguide) stays within Config::led_budget_ma.
//   * Brightness caps per channel, with a lower cap on blue (blue-light hazard).
//   * Audio peak cap so a 0.25 W speaker is not overdriven by the 3 W amplifier.

#pragma once
#include <stddef.h>
#include <stdint.h>

namespace portal {

constexpr int RING_PIXELS = 16;   // NeoPixel Ring 16 (front emitter)
constexpr int JEWEL_PIXELS = 7;   // NeoPixel Jewel (fluid canister), chained after the ring
constexpr int TOTAL_PIXELS = RING_PIXELS + JEWEL_PIXELS;

struct RGB {
  uint8_t r, g, b;
};

enum class State : uint8_t { Boot, Idle, Aim, Opening, Open, Closing, Cooldown, NoTarget, LowBattery, Shutdown };
enum class Mode : uint8_t { Steady, Show };
enum class Sound : uint8_t { None, Boot, Click, Lock, Open, Close, Error, LowBattery };

struct Config {
  uint32_t boot_ms = 1500;
  uint32_t opening_ms = 1600;
  uint32_t open_ms = 8000;
  uint32_t closing_ms = 900;
  uint32_t cooldown_ms = 1200;
  uint32_t notarget_ms = 900;
  uint16_t range_min_mm = 40;      // VL53L1X: ~30 mm to 4 m
  uint16_t range_max_mm = 4000;
  uint8_t lock_samples = 3;        // consecutive consistent readings needed for a lock
  float lock_tolerance = 0.06f;    // relative spread allowed between them
  float led_budget_ma = 500.0f;    // keeps total draw near 0.5C of a 1200 mAh cell
  float ma_per_channel = 20.0f;    // 60 mA per full-white pixel = 20 mA per channel
  uint8_t max_channel = 200;
  uint8_t max_blue = 110;
  float low_batt_v = 3.50f;        // warn and dim
  float cutoff_v = 3.30f;          // stop (cell protection trips at ~3.0 V)
  float recover_v = 3.70f;         // hysteresis to leave LowBattery
  float brightness_tau_s = 0.35f;  // global brightness low-pass time constant
  float max_pixel_hz_steady = 1.5f;  // per-pixel modulation frequency caps
  float max_pixel_hz_show = 2.5f;
};

struct Inputs {
  bool trigger = false;       // true while held
  int encoder_delta = 0;      // detents since last update
  bool encoder_click = false; // edge: pressed since last update
  bool double_tap = false;    // edge: accelerometer double tap
  int16_t range_mm = -1;      // latest ToF reading, -1 if none
  bool range_new = false;     // a new reading arrived this update
  float battery_v = -1.0f;    // < 0 means not measured
};

struct DisplayModel {
  const char* status;   // one word, upper case
  char range[16];       // "2.43 m" or "-- m"
  bool locked;
  const char* code;     // selected dimension code
  int battery_pct;      // -1 if unknown
  bool show_mode;
};

// ---- pure helpers (exposed for tests) ------------------------------------
float estimateCurrentMa(const RGB* px, int n, float ma_per_channel);
float limitPower(RGB* px, int n, float budget_ma, float ma_per_channel);  // returns scale applied
float luminance(const RGB& c);   // relative luminance 0..1 of a linear-PWM pixel
float meanLuminance(const RGB* px, int n);
bool isSaturatedRed(const RGB& c);
int batteryPercent(float volts); // rough LiPo resting-voltage curve
// Max number of WCAG-style flashes (pairs of opposing luminance changes of >= 0.1 with
// the darker state < 0.8) inside any 1 s window of a uniformly sampled series.
int maxFlashesPerSecond(const float* series, int n, float dt_s);

class Gun {
 public:
  explicit Gun(const Config& cfg = Config());
  void reset(uint32_t now_ms);
  void update(uint32_t now_ms, const Inputs& in);
  // Writes TOTAL_PIXELS colours (ring first, then jewel). Applies caps and power limit.
  void render(uint32_t now_ms, RGB* out);
  Sound takeSound();
  DisplayModel display() const;

  State state() const { return state_; }
  Mode mode() const { return mode_; }
  bool locked() const { return locked_; }
  int dimensionIndex() const { return dim_; }
  const char* dimensionCode() const;
  float lastCurrentMa() const { return last_ma_; }
  float brightness() const { return bright_; }
  static int dimensionCount();

 private:
  void enter(State s, uint32_t now_ms);
  void feedRange(int16_t mm);
  float targetBrightness() const;
  float pixelHzCap() const;

  Config cfg_;
  State state_ = State::Boot;
  Mode mode_ = Mode::Steady;
  uint32_t t_state_ = 0;
  uint32_t t_last_ = 0;
  bool trigger_prev_ = false;
  bool locked_ = false;
  int16_t range_mm_ = -1;
  int16_t samples_[8] = {0};
  uint8_t nsamples_ = 0;
  int dim_ = 0;
  float battery_v_ = -1.0f;
  float bright_ = 0.0f;
  float last_ma_ = 0.0f;
  float power_k_ = 1.0f;    // smoothed power-limit scale
  uint32_t t_render_ = 0;
  float phase_ = 0.0f;      // ring pattern phase, turns
  float jphase_ = 0.0f;     // jewel pattern phase, turns
  Sound pending_ = Sound::None;
};

// Procedural sound effects at a fixed sample rate (no audio files needed).
class Synth {
 public:
  explicit Synth(float sample_rate = 22050.0f, float peak = 0.35f);
  void trigger(Sound s);
  void setHum(bool on) { hum_ = on; }
  int16_t next();             // one mono sample
  bool busy() const { return remaining_ > 0; }
  float peak() const { return peak_; }

 private:
  float noise();
  float sr_, peak_;
  Sound cur_ = Sound::None;
  uint32_t n_ = 0, remaining_ = 0, len_ = 0;
  float ph1_ = 0, ph2_ = 0, phh_ = 0, phh2_ = 0, lp_ = 0, hum_level_ = 0;
  bool hum_ = false;
  uint32_t rng_ = 0x12345678u;
};

}  // namespace portal
