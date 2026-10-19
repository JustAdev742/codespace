// Portal gun prop firmware for the Adafruit RP2040 Prop-Maker Feather (product 5768).
//
// This file only moves data between the hardware and portal_core (which holds every
// decision and is unit-tested on a desktop compiler). Core 0 runs inputs and LEDs at
// 100 Hz and redraws the display at 5 Hz; core 1 synthesises audio and streams it to the
// onboard I2S amplifier.
//
// It is a light-and-sound prop. It does not emit anything that could harm anyone: the
// range sensor is a Class 1 (eye-safe, invisible 940 nm) time-of-flight module, and the
// default Steady mode does not flash at all (see portal_core.h).
//
// Libraries (Arduino Library Manager): Adafruit NeoPixel, Adafruit GC9A01A, Adafruit GFX,
// Adafruit VL53L1X, Adafruit LIS3DH, Adafruit seesaw. Board package: "Raspberry Pi Pico/RP2040"
// by Earle Philhower, board "Adafruit Feather RP2040 Prop-Maker".

#include <Adafruit_GC9A01A.h>
#include <Adafruit_GFX.h>
#include <Adafruit_LIS3DH.h>
#include <Adafruit_NeoPixel.h>
#include <Adafruit_VL53L1X.h>
#include <Adafruit_seesaw.h>
#include <I2S.h>
#include <SPI.h>
#include <Wire.h>

#include "portal_core.h"

// ---- wiring (report/04-prop-tutorial.md, section 3.1) ----------------------------
constexpr uint8_t TFT_CS = 10;       // round 1.28" GC9A01A display on the hardware SPI pins
constexpr uint8_t TFT_DC = 11;
constexpr uint8_t TFT_RST = 12;
constexpr uint8_t TFT_LITE = 9;      // backlight PWM
constexpr uint8_t ENCODER_ADDR = 0x36;   // STEMMA QT rotary encoder (seesaw)
constexpr uint8_t ENCODER_SWITCH = 24;   // seesaw pin of the encoder's push switch
constexpr uint8_t TOF_ADDR = 0x29;       // VL53L1X default address
constexpr uint8_t LIS3DH_ADDR = 0x18;    // accelerometer on the Prop-Maker Feather
// Battery gauge, off by default: fit a divider of two 100k resistors from BAT to A3 to GND,
// then uncomment the next line. Without the divider A3 floats and would read nonsense.
// #define BATTERY_SENSE_PIN A3
constexpr float BATTERY_DIVIDER = 2.0f;
constexpr uint32_t SAMPLE_RATE = 22050;
constexpr uint32_t FRAME_MS = 10;        // 100 Hz logic and LED frame rate

Adafruit_NeoPixel pixels(portal::TOTAL_PIXELS, PIN_EXTERNAL_NEOPIXELS, NEO_GRB + NEO_KHZ800);
Adafruit_GC9A01A tft(TFT_CS, TFT_DC, TFT_RST);
Adafruit_VL53L1X tof;
Adafruit_LIS3DH lis;
Adafruit_seesaw encoder;
I2S i2s(OUTPUT);

portal::Gun gun;
portal::Synth synth(static_cast<float>(SAMPLE_RATE), 0.35f);

bool haveTof = false, haveLis = false, haveEncoder = false;
int32_t encoderLast = 0;
bool switchLast = false;
bool humOn = false;
bool powerOn = true;
float batteryVolts = -1.0f;

// Messages to the audio core: sound ids, or HUM_ON / HUM_OFF.
constexpr uint32_t HUM_ON = 101, HUM_OFF = 100;

// ------------------------------------------------------------------ display
const uint16_t COL_BG = GC9A01A_BLACK;
uint16_t colGreen, colAmber, colMuted, colText;
portal::DisplayModel shown{};
char shownStatus[16] = "";
char shownCode[12] = "";
char shownRange[16] = "";
int shownBattery = -2;
bool shownLock = false, shownShow = false;

void drawCentered(const char* text, int y, uint8_t size, uint16_t color) {
  int16_t x1, y1;
  uint16_t w, h;
  tft.setTextSize(size);
  tft.getTextBounds(text, 0, y, &x1, &y1, &w, &h);
  tft.setCursor((240 - w) / 2, y);
  tft.setTextColor(color, COL_BG);
  tft.print(text);
}

void drawDisplay(const portal::DisplayModel& d) {
  if (strcmp(d.status, shownStatus) != 0 || d.locked != shownLock) {
    tft.fillRect(30, 46, 180, 22, COL_BG);
    drawCentered(d.status, 50, 2, d.locked ? colGreen : (strcmp(d.status, "NO TARGET") == 0 || strcmp(d.status, "LOW BATT") == 0 ? colAmber : colText));
    strncpy(shownStatus, d.status, sizeof(shownStatus) - 1);
    shownLock = d.locked;
  }
  if (strcmp(d.code, shownCode) != 0) {
    tft.fillRect(10, 92, 220, 36, COL_BG);
    drawCentered(d.code, 96, 4, colGreen);
    strncpy(shownCode, d.code, sizeof(shownCode) - 1);
  }
  if (strcmp(d.range, shownRange) != 0) {
    tft.fillRect(40, 146, 160, 22, COL_BG);
    drawCentered(d.range, 150, 2, colText);
    strncpy(shownRange, d.range, sizeof(shownRange) - 1);
  }
  if (d.battery_pct != shownBattery || d.show_mode != shownShow) {
    char line[24];
    if (d.battery_pct >= 0) snprintf(line, sizeof line, "%s  BAT %d%%", d.show_mode ? "SHOW" : "STEADY", d.battery_pct);
    else snprintf(line, sizeof line, "%s", d.show_mode ? "SHOW" : "STEADY");
    tft.fillRect(40, 186, 160, 14, COL_BG);
    drawCentered(line, 188, 1, colMuted);
    shownBattery = d.battery_pct;
    shownShow = d.show_mode;
  }
}

// ------------------------------------------------------------------ core 0
void setup() {
  pinMode(PIN_EXTERNAL_POWER, OUTPUT);
  digitalWrite(PIN_EXTERNAL_POWER, HIGH);     // powers the NeoPixel port and the amplifier
  pinMode(PIN_EXTERNAL_BUTTON, INPUT_PULLUP); // trigger switch between the terminal and GND
  pixels.begin();
  pixels.clear();
  pixels.show();
#ifdef BATTERY_SENSE_PIN
  analogReadResolution(12);
#endif
  Wire.begin();
  haveTof = tof.begin(TOF_ADDR, &Wire);
  if (haveTof) {
    tof.setTimingBudget(50);
    tof.startRanging();
  }
  haveLis = lis.begin(LIS3DH_ADDR);
  if (haveLis) {
    lis.setRange(LIS3DH_RANGE_4_G);
    lis.setClick(2, 60);                       // 2 = double tap
  }
  haveEncoder = encoder.begin(ENCODER_ADDR);
  if (haveEncoder) {
    encoder.pinMode(ENCODER_SWITCH, INPUT_PULLUP);
    encoderLast = encoder.getEncoderPosition();
  }
  tft.begin();
  tft.setRotation(0);
  tft.fillScreen(COL_BG);
  colGreen = tft.color565(60, 255, 110);
  colAmber = tft.color565(255, 170, 60);
  colMuted = tft.color565(120, 140, 130);
  colText = tft.color565(225, 235, 230);
  tft.drawCircle(120, 120, 118, colMuted);
  pinMode(TFT_LITE, OUTPUT);
  analogWrite(TFT_LITE, 200);
  gun.reset(millis());
}

void readInputs(portal::Inputs& in, uint32_t now) {
  in.trigger = digitalRead(PIN_EXTERNAL_BUTTON) == LOW;
  if (haveEncoder) {
    const int32_t pos = encoder.getEncoderPosition();
    in.encoder_delta = static_cast<int>(pos - encoderLast);
    encoderLast = pos;
    const bool sw = !encoder.digitalRead(ENCODER_SWITCH);
    in.encoder_click = sw && !switchLast;
    switchLast = sw;
  }
  if (haveTof && tof.dataReady()) {
    in.range_mm = tof.distance();               // -1 on a failed measurement
    in.range_new = true;
    tof.clearInterrupt();
  }
  if (haveLis) in.double_tap = (lis.getClick() & 0x20) != 0;
#ifdef BATTERY_SENSE_PIN
  static uint32_t lastBattery = 0;
  if (now - lastBattery >= 500) {
    lastBattery = now;
    batteryVolts = analogRead(BATTERY_SENSE_PIN) * (3.3f / 4095.0f) * BATTERY_DIVIDER;
    in.battery_v = batteryVolts;
  }
#else
  (void)now;
#endif
}

void loop() {
  static uint32_t lastFrame = 0, lastDisplay = 0;
  const uint32_t now = millis();
  if (now - lastFrame < FRAME_MS) return;
  lastFrame = now;

  portal::Inputs in;
  readInputs(in, now);
  gun.update(now, in);

  const portal::Sound s = gun.takeSound();
  if (s != portal::Sound::None) rp2040.fifo.push_nb(static_cast<uint32_t>(s));
  const bool wantHum = gun.state() == portal::State::Open || gun.state() == portal::State::Opening;
  if (wantHum != humOn) {
    humOn = wantHum;
    rp2040.fifo.push_nb(humOn ? HUM_ON : HUM_OFF);
  }

  // in shutdown, cut power to the LEDs and amplifier and dim the screen
  const bool wantPower = gun.state() != portal::State::Shutdown;
  if (wantPower != powerOn) {
    powerOn = wantPower;
    digitalWrite(PIN_EXTERNAL_POWER, powerOn ? HIGH : LOW);
    analogWrite(TFT_LITE, powerOn ? 200 : 20);
  }

  portal::RGB px[portal::TOTAL_PIXELS];
  gun.render(now, px);
  for (int i = 0; i < portal::TOTAL_PIXELS; ++i) pixels.setPixelColor(i, px[i].r, px[i].g, px[i].b);
  pixels.show();

  if (now - lastDisplay >= 200) {
    lastDisplay = now;
    drawDisplay(gun.display());
  }
}

// ------------------------------------------------------------------ core 1: audio
void setup1() {
  i2s.setBCLK(PIN_I2S_BIT_CLOCK);   // word select is BCLK + 1 (pin 18) on this board
  i2s.setDATA(PIN_I2S_DATA);
  i2s.setBitsPerSample(16);
  i2s.begin(SAMPLE_RATE);
}

void loop1() {
  uint32_t msg;
  while (rp2040.fifo.pop_nb(&msg)) {
    if (msg == HUM_ON) synth.setHum(true);
    else if (msg == HUM_OFF) synth.setHum(false);
    else synth.trigger(static_cast<portal::Sound>(msg));
  }
  const int16_t sample = synth.next();
  i2s.write16(sample, sample);      // blocks while the DMA buffers are full, which paces the loop
}
