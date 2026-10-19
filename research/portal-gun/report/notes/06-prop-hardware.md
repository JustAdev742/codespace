# 06 - Portal-gun-style prop: verified hardware, prices and safety sources

Research date: **2026-10-19**. Every page cited below was fetched on this date.
Prices are USD list prices as shown on the retailer page that day, before shipping and tax. They change, so re-check before publishing.

## How to read these notes

| Label | Meaning |
|---|---|
| **VERIFIED 2026-10-19** | Price/stock read from the retailer's own product page today. For Adafruit, SparkFun, DFRobot, Seeed, PiShop and MatterHackers I cross-checked the price two ways: (1) the rendered page (WebFetch) and (2) the page's own machine-readable data in the raw HTML (schema.org JSON-LD `offers.price`, `product:price:amount` meta tag, or embedded product JSON). For Pololu I read the price-break table from the raw HTML and via WebFetch. For DigiKey I only had WebFetch, because a direct fetch returned HTTP 403. |
| **CALCULATED** | Arithmetic on verified figures, such as a power budget or BOM sum. |
| **ILLUSTRATIVE / NOT VERIFIED** | Anything I could not confirm on a page today. The tutorial must label it "illustrative". |
| **GUIDANCE (derived)** | My design recommendation, drawn from the cited sources. It does not quote any standard. |

Stock status is a snapshot. "In stock" means the page says in stock and shows no count. "N in stock" means the page showed that count.

### Sources that could not be fetched today (do not cite their content without re-checking)

| Site | Result today | What I used instead |
|---|---|---|
| st.com (VL53L1X/VL53L0X pages and datasheets) | HTTP 503 / empty reply | ST's own datasheets as hosted by Pololu: https://www.pololu.com/file/0J1506/vl53l1x.pdf and https://www.pololu.com/file/0J1187/vl53l0x.pdf |
| epilepsy.com (Epilepsy Foundation) | HTTP 403 on every URL tried | Epilepsy Society (UK charity) page, see 2.3 |
| ofcom.org.uk (flashing-images guidance, incl. legacy gn_flash.pdf) | HTTP 403 | ITU-R BT.1702-3 primary text from itu.int, plus the W3C WCAG Understanding doc |
| blog.adafruit.com (portal-gun posts dated 2015-11-05, 2016-06-22, 2018-06-16 in search results) | HTTP 403 | Not cited for content |
| printables.com model pages | HTTP 403 | Printables' public GraphQL API (`https://api.printables.com/graphql/`), which returned license, author, date and description |
| thingiverse.com | HTTP 403 | Nothing. **Thingiverse licenses are NOT verified.** |
| digikey.com | Direct fetch 403. WebFetch worked. | WebFetch summary only |
| web.archive.org | Fetch tool not permitted | None |

---

## Part 1 - Components (all prices VERIFIED 2026-10-19 unless marked)

### 1. Microcontroller

| Retailer | Product | ID / SKU | URL | Price | Stock | Key specs (as stated on page) |
|---|---|---|---|---|---|---|
| Adafruit | Adafruit RP2040 Prop-Maker Feather with I2S Audio Amplifier | 5768 | https://www.adafruit.com/product/5768 | **$19.95** | In stock | RP2040 at 133 MHz, 3.3 V logic, 8 MB QSPI flash, 264 KB RAM. Has a "3.3V regulator with 500mA peak current output and power enable pin" and a "Built-in 200mA+ lipoly charger", with USB-C. Amp: "MAX98357 I2S 3 Watt Class D Audio Amplifier - Drive any 4-8Ω speaker, up to 3 Watts". NeoPixel screw-terminal port: "high current drive from either the Feather Lipoly or USB port, whichever is higher", with a 5 V level up-shifter and a transistor that cuts strip power. Also an LIS3DH accelerometer with tap detection, a servo header and STEMMA QT. A pin cuts power to the NeoPixels and amp for sleep. 52.1 × 22.8 × 12.2 mm, 6.9 g. Current draw not stated. |
| Adafruit | Adafruit ItsyBitsy RP2040 | 4888 | https://www.adafruit.com/product/4888 | **$9.95** | 64 in stock | RP2040, 8 MB flash, 264 KB SRAM, 23 GPIO, 3.3 V logic and power, 3.3 V regulator 500 mA peak. "Power with either USB or external output (such as a battery) - it'll automatically switch over". The "Vhigh output pin gives you the higher voltage from VBAT or VUSB, for driving NeoPixels", and "Digital 5 level-shifted output for high-voltage logic". 36 × 18 × 4 mm without headers. Clock is ~125 MHz in the description and 133 MHz in the tech details. Current draw not stated. |
| Adafruit | Adafruit Feather RP2040 | 4884 | https://www.adafruit.com/product/4884 | **$11.95** | 64 in stock | 8 MB flash, 264 KB RAM, LiPo charger "200mA+", STEMMA QT, onboard NeoPixel, 3.3 V regulator 500 mA peak. 50.8 × 22.8 × 7 mm, about 5 g. |
| PiShop.us | Raspberry Pi Pico 2 | SKU 65-1 | https://www.pishop.us/product/raspberry-pi-pico-2/ | **$5.00** | IN STOCK (page data: 796 available) | RP2350, dual Cortex-M33 or Hazard3 RISC-V, 150 MHz, 520 KB SRAM, input 1.8-5.5 V DC. Ships without headers. The page shows an approved-reseller logo but no text says so. |
| Adafruit | Raspberry Pi Pico 2 - RP2350 | 6006 | https://www.adafruit.com/product/6006 | **$6.25** | **Out of stock** | 4 MB QSPI flash, 26 GPIO (4 ADC-capable), "Input power 1.8–5.5V DC", -20 to +85 °C, 21 × 51 mm. |
| DigiKey | RP2350 Raspberry Pi Pico 2 | MPN SC1631; DK 2648-SC1631CT-ND (cut tape) | https://www.digikey.com/en/products/detail/raspberry-pi/SC1631/24627142 | **$6.12** (qty 1, cut tape) | 20,367 in stock | WebFetch only. A direct fetch was blocked. |
| Adafruit | Raspberry Pi Pico RP2040 | 4864 | https://www.adafruit.com/product/4864 | **$4.00** | **Out of stock** | 133 MHz, 264 kB SRAM, 2 MB flash, 25 usable GPIO (3 analog). GPIO is 3.3 V and "not 5V-safe". 51.3 × 21.0 × 3.9 mm. |
| Seeed Studio | Seeed Studio XIAO RP2040 | 102010428 | https://www.seeedstudio.com/XIAO-RP2040-v1-0-p-5026.html | **$3.99** (10+: $3.50) | In stock | From the Seeed wiki (https://wiki.seeedstudio.com/XIAO-RP2040/): "Dual Cortex-M0+ up to 133 MHz", 264 KB SRAM, 2 MB flash, 11 digital and 4 analog pins, 11 PWM, one each of I2C, UART and SPI, an RGB LED, 5 V input over USB-C, 3.3 V I/O, 21 × 17.8 mm. Power consumption not specified. |
| Seeed Studio | Seeed Studio XIAO ESP32-S3 | 113991114 | https://www.seeedstudio.com/XIAO-ESP32S3-p-5627.html | **$7.49** | In stock | "240MHz Xtensa 32-bit LX7 dual-core", Wi-Fi and BLE 5.0. The product page does not show the other specs (not verified). |

**GUIDANCE (derived):** The Prop-Maker Feather puts the amp, NeoPixel level shifting, an accelerometer and LiPo charging on one board, which removes most hand-wired power connections. For a build with **no lithium cell in the prop**, the ItsyBitsy RP2040 has a level-shifted D5 output for NeoPixel data. The Pico 2 accepts 1.8-5.5 V, which suits AA/NiMH packs. Never plug an AA pack into a LiPo charger's battery port (see 8a).

### 2. Addressable LEDs (Adafruit NeoPixel)

| Product | ID | URL | Price | Stock | Specs (page) |
|---|---|---|---|---|---|
| NeoPixel Ring - 24 x 5050 RGB LED with Integrated Drivers | 1586 | https://www.adafruit.com/product/1586 | **$16.95** | In stock | 5 VDC. OD 65.5 mm, ID 52.3 mm, 3.2 mm thick, 6.5 g. WS2812B or SK6812. |
| NeoPixel Ring - 16 x 5050 RGB LED with Integrated Drivers | 1463 | https://www.adafruit.com/product/1463 | **$9.95** (10-99: $8.96; 100+: $7.96) | In stock | "5VDC (4-7V works)". OD 44.5 mm, ID 31.7 mm, listed thickness 6.7 mm, 3.03 g. WS2812B or SKC6812. |
| NeoPixel Ring - 12 x 5050 RGB LED with Integrated Drivers | 1643 | https://www.adafruit.com/product/1643 | **$8.95** | In stock | 5 VDC. OD 36.8 mm, ID 23.3 mm, 3.3 g. |
| NeoPixel Jewel - 7 x 5050 RGB LED with Integrated Drivers | 2226 | https://www.adafruit.com/product/2226 | **$5.95** | In stock | 5 VDC, 23 mm diameter, 2 mm thick, 1.5 g. |

All four pages say "Each one has ~18mA constant current drive so the color will be very consistent even if the voltage varies". **Do not budget power from the 18 mA figure.** Use the Uberguide numbers below. My reading is that 18 mA is the constant-current drive of the LED elements, not the total per-pixel draw. That is an interpretation, consistent with the 60 mA (R+G+B) figure.

None of these Adafruit pages states an IEC 62471 risk group (I searched each one for "62471", "risk group", "eye" and "blue light").

**Power figures. Adafruit NeoPixel Überguide, "Powering NeoPixels"** (Phillip Burgess; https://learn.adafruit.com/adafruit-neopixel-uberguide/powering-neopixels):
- "Each individual NeoPixel draws up to 60 milliamps at maximum brightness white (red + green + blue)."
- "we've been using 1/3 this (20 mA per pixel) as a gross rule of thumb with no ill effects. But if you know for a fact that you need every pixel on at maximum brightness, use the full 60 mA figure."
- "Keep in mind, 60 mA is a worst case estimate!"

**CALCULATED power budget** (pixels × 60 mA worst case / × 20 mA rule of thumb):

| LED set | Pixels | Worst case (full white) | Rule of thumb |
|---|---|---|---|
| Ring 24 | 24 | 1.44 A | 0.48 A |
| Ring 16 | 16 | 0.96 A | 0.32 A |
| Ring 12 | 12 | 0.72 A | 0.24 A |
| Jewel 7 | 7 | 0.42 A | 0.14 A |
| Ring 16 + Jewel | 23 | 1.38 A | 0.46 A |

ILLUSTRATIVE runtime: 1200 mAh ÷ ~0.5 A is about 2.4 h, ignoring converter losses. The Uberguide warns that runtime is "not quite linear" and that batteries should "take at least a couple hours to run down".

### 3. Small display

| Product | ID | URL | Price | Stock | Specs (page) |
|---|---|---|---|---|---|
| Monochrome 1.3" 128x64 OLED graphic display - STEMMA QT / Qwiic | 938 | https://www.adafruit.com/product/938 | **$19.95** | In stock | SSD1306 driver, I2C by default (SPI by cutting jumpers), 3.3 V regulator, all pins level-shifted for 3 V or 5 V. "on average the display uses about 40mA from the 3.3V supply", and the tech details say "~25mA or so in practice". I2C 0x3C/0x3D. PCB 35.6 × 33 × 6.2 mm, 6 g. Has 2 STEMMA QT connectors. |
| Monochrome 0.96" 128x64 OLED Graphic Display - STEMMA QT | 326 | https://www.adafruit.com/product/326 | **$17.50** | In stock | I2C by default or SPI. "completely 5V-ready". "~20mA or so in practice". I2C 0x3C/0x3D. PCB 29.2 × 26.7 mm, 6.2 mm thick, 4.5 g. |
| Adafruit 1.28" 240x240 Round TFT LCD Display with MicroSD (GC9A01A, EYESPI) | 6178 | https://www.adafruit.com/product/6178 | **$17.50** | 75 in stock | 4-wire SPI, IPS, 16-bit colour. Ultra-low-dropout 3.3 V regulator and a 3/5 V level shifter. microSD slot and 18-pin EYESPI FPC. Overall 42.4 × 36.2 × 5.4 mm, 8.3 g. Current draw not stated. |

Both OLED pages say each pixel "if it's kept on for over 1000 hours it'll start to dim", so turn it off when idle.

### 4. Audio

| Retailer | Product | ID / SKU | URL | Price | Stock | Specs (page) |
|---|---|---|---|---|---|---|
| DFRobot | DFPlayer - Mini MP3 Player | DFR0299 | https://www.dfrobot.com/product-1121.html | **$5.90** (3+: $5.80; 5+: $5.70; 10+: $5.40) | Page JSON-LD says InStock; the rendered page shows "Add to Cart" | "Operating Voltage: 3.2V to 5.0V DC", "Direct 3W Speaker Drive (Mono)", "Supports up to 32GB TF/MicroSD Card (FAT16/FAT32)", MP3/WAV/WMA, serial UART control, "Dimensions: 20mm x 20mm". Current and baud rate are **not listed**. |
| Adafruit | Adafruit I2S 3W Class D Amplifier Breakout - MAX98357A | 3006 | https://www.adafruit.com/product/3006 | **$5.95** | In stock | "able to run from 2.7V-5.5VDC". "Output Power: 3.2W at 4Ω, 10% THD, 1.8W at 8Ω, 10% THD, with 5V supply". I2S 8-96 kHz, no MCLK, gain 3/6/9/12/15 dB (default 9 dB), thermal and over-current protection. 19.4 × 17.8 × 3.0 mm, 1.2 g. |
| Adafruit | Adafruit Audio FX Sound Board - WAV/OGG Trigger with 2MB Flash | 2133 | https://www.adafruit.com/product/2133 | **$19.95** | 26 in stock | Stand-alone, "just needs a 3 to 5.5VDC battery". 11 triggers, stereo line out, USB mass storage. 22 × 48 × 6 mm, 4.6 g. Variants: 2210 (+2x2W amp, 2 MB) $24.95 (10 in stock); 2217 (+2x2W amp, 16 MB) $29.95 (96 in stock); 2220 (16 MB) $24.95 (43 in stock). |
| Adafruit | Thin Plastic Speaker w/Wires - 8 ohm 0.25W | 1891 | https://www.adafruit.com/product/1891 | **$1.75** | In stock | 39 mm diameter, 8 Ω, rated 0.25 W, maximum 0.5 W, 440 Hz-20 kHz, 4.6 g. |
| SparkFun | Speaker - 0.5W (8 Ohm) | COM-09151 | https://www.sparkfun.com/speaker-0-5w-8-ohm.html | **$1.50** | In stock | 0.5 W, 8 Ω, 50 mm diameter, 16 mm high. |
| Adafruit | Adafruit STEMMA Speaker - Plug and Play Audio Amplifier | 3885 | https://www.adafruit.com/product/3885 | **$5.95** | In stock | Class D amp with a "1 Watt 8 ohm speaker", 3-5 V, volume trim. 37 × 30.5 × 7.2 mm, 7.5 g. |
| Adafruit | Mono Enclosed Speaker - 3W 4 Ohm | 3351 | https://www.adafruit.com/product/3351 | $3.95 | **Out of stock** | (Also out of stock: 4227 Mini Oval 8 Ω 1 W at $1.95, and 3968 40 mm 4 Ω 5 W at $4.95.) |

**GUIDANCE (derived):** The MAX98357A can put 1.8 W into 8 Ω at 5 V, which is more than a 0.25-0.5 W speaker is rated for. Adafruit's 1891 page warns: "be careful not to overdrive the speaker as high volumes can blow it out! Start with lower volume and increase carefully." Cap volume or gain in firmware.

### 5. Time-of-flight distance sensor (the "targeting" readout)

| Retailer | Product | ID | URL | Price | Stock | Specs (page) |
|---|---|---|---|---|---|---|
| Adafruit | Adafruit VL53L1X Time of Flight Distance Sensor - ~30 to 4000mm | 3967 | https://www.adafruit.com/product/3967 | **$14.95** | In stock | "Emitter: 940 nm invisible laser (Class1)", "Up to 400 cm", up to 50 Hz, typical full FoV 27°, I2C up to 400 kHz, default address 0x29. The sensor needs 2.8 V, so the board adds a regulator and level shifting and works with "any 3-5V power or logic". STEMMA QT. 25.5 × 17.5 × 4.6 mm, 1.8 g. |
| Adafruit | Adafruit VL53L0X Time of Flight Distance Sensor - ~30 to 1000mm | 3317 | https://www.adafruit.com/product/3317 | **$14.95** | In stock | "approximately 30mm to 1.2 meter in default mode", and "In 'long range' mode ... 1.5 to 2 meters on a nice white reflective surface". 35° cone, 3-12 % ranging accuracy, 3-5 V. 21.0 × 18.0 × 2.8 mm, 1.3 g. |
| Pololu | VL53L1X Time-of-Flight Distance Sensor Carrier with Voltage Regulator, 400cm Max | item #3415 | https://www.pololu.com/product/3415 | **$22.95** (5: $21.11; 25: $19.42; 100: $17.87) | Quantity not shown; page says "backorders allowed" | 2.6-5.5 V. "Typical active-ranging supply current: 20 mA", and peak "can reach 40 mA". I2C, up to 4 m. 13 × 18 × 2 mm, 0.5 g. "940 nm Class 1 laser, which is invisible and eye-safe". |
| Pololu | VL53L0X Time-of-Flight Distance Sensor Carrier with Voltage Regulator, 200cm Max | item #2490 | https://www.pololu.com/product/2490 | **$19.95** (5: $18.35; 25: $16.89; 100: $15.54) | Quantity not shown; "backorders allowed" | 2.6-5.5 V, 20 mA typical and 40 mA peak, I2C, up to 2 m. 13 × 18 × 2 mm, 0.5 g. |

**ST datasheets** (as hosted by Pololu; st.com was unreachable):
- VL53L1X, DocID031281 Rev 3 (November 2018). Features list "Emitter: 940 nm invisible laser (Class1)", "Up to 400 cm distance measurement" and "Up to 50 Hz ranging frequency". The chip's operating voltage is 2.6-3.5 V, the package is 4.9 × 2.5 × 1.56 mm, ranging average current is 16 mA typical and 18 mA max, and "Peak current (including VCSEL) can reach 40 mA". **Section 7, Laser safety:** "The laser output is designed to remain within Class 1 laser safety limits under all reasonably foreseeable conditions including single faults in compliance with IEC 60825-1:2014 (third edition)", "as long as the STMicroelectronic's recommended device settings are used and the operating conditions specified are respected (particularly the maximum timing budget...)", and "The laser output power must not be increased by any means and no optics should be used with the intention of focusing the laser beam."
- VL53L0X, DocID029104 Rev 2 (April 2018). "Measures absolute range up to 2 m". "Eye safe - Class 1 laser device compliant with latest standard IEC 60825-1:2014 - 3rd edition". Section 7 contains the same Class 1, no-focusing-optics language.
- Note that ST may have newer datasheet revisions. I could not reach st.com to check.

**GUIDANCE (derived):** The VL53 emitter is invisible 940 nm, so it cannot draw a visible "targeting dot". Show the range on the display instead. Do not add lenses in front of the sensor, and do not add a visible laser.

### 6. IMU (optional)

| Product | ID | URL | Price | Stock | Specs |
|---|---|---|---|---|---|
| Adafruit LSM6DSOX 6 DoF Accelerometer and Gyroscope | 4438 | https://www.adafruit.com/product/4438 | **$11.95** | In stock | ±2/±4/±8/±16 g and ±125 to ±2000 dps. I2C or SPI, regulated and level-shifted for 3 V or 5 V, STEMMA QT, tap detection. 25.6 × 17.8 × 4.6 mm, 1.7 g. |
| Adafruit LSM6DSOX + LIS3MDL - Precision 9 DoF IMU | 4517 | https://www.adafruit.com/product/4517 | **$19.95** | In stock | (Specs not extracted.) |

The Prop-Maker Feather (5768) already includes an LIS3DH accelerometer.

### 7. Dial, trigger, power switch

| Retailer | Product | ID / SKU | URL | Price | Stock | Notes (page) |
|---|---|---|---|---|---|---|
| Adafruit | Adafruit I2C Stemma QT Rotary Encoder Breakout with Encoder | 5880 | https://www.adafruit.com/product/5880 | **$7.95** | In stock | "pre-soldered 'standard' PEC11-pinout rotary encoder with a push-switch". seesaw I2C firmware, onboard NeoPixel, "Power with 3 to 5V DC". |
| Adafruit | Adafruit I2C Stemma QT Rotary Encoder Breakout with NeoPixel | 4991 | https://www.adafruit.com/product/4991 | $5.95 | In stock | The encoder is not soldered in, so you need a separate one. |
| Adafruit | Rotary Encoder + Extras | 377 | https://www.adafruit.com/product/377 | $4.50 | **Out of stock** | |
| SparkFun | Rotary Encoder | COM-09117 | https://www.sparkfun.com/rotary-encoder.html | **$4.50** | In stock | "12-step rotary encoder" with "a pretty handy select switch (by pushing in on the knob)". Breadboard-friendly, no knob included. |
| Adafruit | Tactile Switch Buttons (12mm square, 6mm tall) x 10 pack | 1119 | https://www.adafruit.com/product/1119 | **$2.50** | In stock | Momentary, normally open. |
| Adafruit | Tactile Button switch (6mm) x 20 pack | 367 | https://www.adafruit.com/product/367 | $2.50 | In stock | |
| Adafruit | Micro Switch w/Roller Lever - Three Terminal | 819 | https://www.adafruit.com/product/819 | **$1.95** | 20 in stock | Lever-style trigger option. |
| Adafruit | Breadboard-friendly SPDT Slide Switch | 805 | https://www.adafruit.com/product/805 | **$0.95** | In stock | The linked datasheet (SS-12E17G2, https://cdn-shop.adafruit.com/product-files/805/SS-12E17G2-revised.pdf) gives a rating of **DC 50 V 0.5 A**. |

**GUIDANCE (derived):** The 805 switch's 0.5 A rating is below the **CALCULATED** 1.38 A worst-case draw of a Ring 16 plus a Jewel. Use it to switch a board's EN/enable pin, which the Prop-Maker Feather and PowerBoost have. Do not put it in line with the LED current.

### 8. Power

#### (a) Safest options: no loose lithium cell inside the prop

| Product | ID | URL | Price | Stock | Notes (page) |
|---|---|---|---|---|---|
| 4 x AA Battery Holder with On/Off Switch | 830 | https://www.adafruit.com/product/830 | **$2.95** | In stock | Nominal "6V DC for alkaline (6.4V when fresh, 4V when dead), and 4.8V DC for rechargeables (5.2V when fully charged, 4.4V when discharged)". 2.5 × 2.75 × 0.75 in, 34.9 g. The switch rating is not stated, so it is **not verified**. |
| 3 x AA Battery Holder with 2.1mm Plug | 3842 | https://www.adafruit.com/product/3842 | **$2.95** | 79 in stock | "Three AA's add up to about 3.6-4.5V". **The page warns: "you can't recharge them like Li-Ion/Polys, so don't try to plug this into one of our Li-Ion/Poly charger boards!"** 58 × 48 × 14.5 mm. |
| Waterproof 3xAA Battery Holder with On/Off Switch | 771 | https://www.adafruit.com/product/771 | **$3.95** | 32 in stock | About 4.5 V. The wires are not polarity-marked, so check with a meter. |
| 3 x AAA Battery Holder with On/Off Switch and 2-Pin JST | 727 | https://www.adafruit.com/product/727 | $1.95 | In stock | AAA, not AA. |
| USB Li-Ion Power Bank with 2 x 5V Outputs @ 2.1A - 5000mAh | 4288 | https://www.adafruit.com/product/4288 | **$26.95** | In stock | The page notes: "If using it with a low current load, say under 100mA, the pack may 'fall asleep'". Charging start/stop "will flicker the output". 90 × 63 × 12.5 mm, 101 g. |
| USB Battery Pack for Raspberry Pi - 10000mAh - 2 x 5V outputs | 1566 | https://www.adafruit.com/product/1566 | $39.95 | In stock | (The older 2200 mAh pack, 1959, is **Discontinued**.) |

The Uberguide covers AA packs: "Four nickel-metal hydride (NiMH) rechargeable cells can similarly be used in a 4-cell battery holder to provide 4.8 Volts. Make sure you only use NiMH cells in this configuration. Four alkaline cells (the disposable type) will output 6V total — that's too high for some NeoPixels, and definitely too much for the microcontroller!" It adds: "Three alkaline cells (such as AA batteries) can be installed in a battery holder to provide 4.5 Volts."

A power bank also contains Li-ion cells, but they sit inside a finished product with its own electronics. I did **not** verify whether any particular bank is certified.

#### (b) LiPo / Li-ion: all three Adafruit cells below state protection circuitry

| Product | ID | URL | Price | Stock | Protection and charge notes (page) |
|---|---|---|---|---|---|
| Lithium Ion Polymer Battery - 3.7v 1200mAh | 258 | https://www.adafruit.com/product/258 | **$9.95** | In stock | "include the necessary protection circuitry". It cuts out at 3.0 V and protects against output shorts. Charge "at a rate of 500mA or less". There is **no thermistor** ("the batteries we sell do not have thermistors built-in"). JST-PH 2-pin, and "The cables are rated for 2A". About 4.5 Wh, 34 × 62 × 5 mm, 23 g. |
| Lithium Ion Polymer Battery - 3.7v 2500mAh | 328 | https://www.adafruit.com/product/328 | **$14.95** | In stock | Protection circuitry, cut-out ~2.8 V. Charge at "1200mA or less", and "Even 500mA is a good charge rate". About 10 Wh, 50 × 60 × 7.3 mm, 50 g. |
| Lithium Ion Battery - 3.7V 2000mAh | 2011 | https://www.adafruit.com/product/2011 | $12.50 | **Out of stock** | Protection circuitry, cut-out 3.0 V. "Standard Charge Current: ~0.2C / 0.5A". 60 × 36 × 7 mm, 34 g. |
| Adafruit Micro-Lipo Charger for LiPoly Batt with USB Type C Jack | 4410 | https://www.adafruit.com/product/4410 | **$5.95** | In stock | "100mA charge current, adjustable to 500mA by soldering a jumper closed". For single 3.7/4.2 V cells. "For use with Adafruit LiPoly/LiIon batteries only!" 24 × 19 × 7.2 mm. |
| Adafruit Micro-Lipo Charger for LiPo/LiIon Batt w/MicroUSB Jack | 1904 | https://www.adafruit.com/product/1904 | **$6.95** | In stock | Same 100 mA default, 500 mA by jumper. 21 × 19 × 2 mm, 2 g. |
| Adafruit Universal USB / DC / Solar Lithium Ion/Polymer charger - bq24074 | 4755 | https://www.adafruit.com/product/4755 | **$14.95** | In stock | 5-10 V input ("28V protected"), "Up to 1.5A charge rate", load output "never go above 4.4V", load sharing. |
| PowerBoost 1000 Charger - Rechargeable 5V Lipo USB Boost @ 1A (1000C) | 2465 | https://www.adafruit.com/product/2465 | $19.95 | **Out of stock** | 5.2 V out (TPS61090), 1000 mA load-sharing charger, low-battery LED below 3.2 V, EN pin. 23 × 45 × 10 mm. |
| PowerBoost 1000 Basic - 5V USB Boost @ 1000mA from 1.8V+ | 2030 | https://www.adafruit.com/product/2030 | **$14.95** | 86 in stock | Boost only, no charger. 5.2 V out (TPS61030), EN pin. "the connector is only rated for 2A". |

**GUIDANCE (derived), CALCULATED:** At a 1.38 A worst case, a 1200 mAh cell discharges at about 1.15C. Adafruit's guide says "Do not draw more current than the battery can provide (say about 1-2 C)", and the Uberguide says a battery should last "at least a couple hours". So limit LED brightness in firmware, or use the 2500 mAh cell (328).

### 9. Diffuser and enclosure materials

| Retailer | Product | ID / SKU | URL | Price | Stock | Notes |
|---|---|---|---|---|---|---|
| MatterHackers | Clear Translucent MH Build Series PETG Filament - 1.75mm (1kg) | M-AMP-JD1G (URL SKU MAMPJD1G) | https://www.matterhackers.com/store/l/petg-clear-translucent-filament-1.75mm/sk/MAMPJD1G | **$20.99 per 1 kg spool**. Bulk: 2-3 $20.15, 4-5 $19.31, 6-7 $18.47, 8-9 $17.63, 10-11 $16.79, 12+ $15.74 | Page JSON-LD says InStock; the rendered page shows "Ships calculating..." | Nozzle 245 ±10 °C, bed 60 ±10 °C, ±0.03 mm. |
| Adafruit | Black LED Diffusion Acrylic Panel 12" x 12" - 0.1" / 2.6mm thick | 4594 | https://www.adafruit.com/product/4594 | **$9.95** | In stock | Adafruit's guide says this material "sharpens the pixels and reduces the glare", which suits a display or matrix window. For the glowing tube, the white or translucent materials in the guide fit better (GUIDANCE). |
| Acrylic tube | - | - | - | **ILLUSTRATIVE / NOT VERIFIED** | - | No acrylic-tube listing was checked today. |

Adafruit's diffusion guide is "Make it Glow: NeoPixel and LED Diffusion Tips & Tricks" by Erin St Blaine (published April 04, 2023, last edited March 08, 2024; https://learn.adafruit.com/make-it-glow-neopixel-and-led-diffusion-tips-tricks):
- "For diffusion, the material matters a lot, but the distance at which you place the diffusing material matters even more."
- "The amount of diffusion depends on the degree of irregularities in the diffusing material, as well as its thickness and distance from the light source."
- Diffusion "can help to reduce the harshness of the light, make it easier on the eyes".
- From the Plastics page (https://learn.adafruit.com/make-it-glow-neopixel-and-led-diffusion-tips-tricks/plastics): textured acrylic "doesn't do a great job up close but looks lovely a few inches away", and 1/4" acrylic "does a good job of diffusing the lights, but it's thick enough that it dims the light strips noticeably."

### 10. Wire, connectors, capacitor, resistor

| Retailer | Product | ID / SKU | URL | Price | Stock |
|---|---|---|---|---|---|
| SparkFun | Electrolytic Decoupling Capacitors - 1000uF/25V | COM-08982 | https://www.sparkfun.com/electrolytic-decoupling-capacitors-1000uf-25v.html | **$0.50** (25+: $0.48; 100+: $0.45) | In stock |
| Adafruit | 4700uF 10v Electrolytic Capacitor (larger than the Uberguide's 500-1000 µF range) | 1589 | https://www.adafruit.com/product/1589 | $1.95 | In stock |
| SparkFun | Resistor 330 Ohm 1/4 Watt PTH - 20 pack (Thick Leads), ±5 % | PRT-14490 | https://www.sparkfun.com/resistor-330-ohm-1-4-watt-pth-20-pack-thick-leads.html | **$1.25** (25+: $1.19; 100+: $1.13) | In stock |
| Adafruit | Through-Hole Resistors - 470 ohm 5% 1/4W - Pack of 25 | 2781 | https://www.adafruit.com/product/2781 | $0.75 | **Out of stock** |
| SparkFun | Resistor Kit - 1/4W (500 total) | COM-10969 | https://www.sparkfun.com/resistor-kit-1-4w-500-total.html | $9.95 | Contents **not verified** on the page (a search summary claims it includes 470 Ω) |
| Adafruit | JST PH 2-Pin Cable - Female Connector 100mm | 261 | https://www.adafruit.com/product/261 | **$0.75** | In stock |
| Adafruit | JST-PH Battery Extension Cable - 500mm | 1131 | https://www.adafruit.com/product/1131 | **$1.95** | In stock |
| Adafruit | JST PH 2mm 3-pin Plug-Plug Cable - 100mm long | 4336 | https://www.adafruit.com/product/4336 | $0.75 | In stock |
| Adafruit | 3-pin JST SM Plug + Receptacle Cable Set | 1663 | https://www.adafruit.com/product/1663 | $1.50 | **Out of stock** |
| Adafruit | STEMMA QT / Qwiic JST SH 4-pin Cable - 100mm Long | 4210 | https://www.adafruit.com/product/4210 | **$0.95** | In stock |
| Adafruit | STEMMA QT / Qwiic JST SH 4-pin to Premium Male Headers Cable | 4209 | https://www.adafruit.com/product/4209 | $0.95 | In stock |
| Adafruit | Silicone Cover Stranded-Core Wire - 2m 26AWG Black | 1881 | https://www.adafruit.com/product/1881 | **$0.95** | 25 in stock |
| Adafruit | Silicone Cover Stranded-Core Wire - 2m 26AWG White | 1882 | https://www.adafruit.com/product/1882 | $0.95 | 52 in stock |
| Adafruit | Silicone Cover Stranded-Core Wire - 25ft 26AWG - Red | 2513 | https://www.adafruit.com/product/2513 | $4.95 | In stock (the 2 m red, 1877, is out of stock) |
| Adafruit | Hook-up Wire Spool Set - 22AWG Stranded-Core - 6 x 25ft | 3111 | https://www.adafruit.com/product/3111 | $19.95 | 58 in stock |

I did not check wire current ratings, so do not state any.

The Uberguide **Best Practices** page (https://learn.adafruit.com/adafruit-neopixel-uberguide/best-practices, Phillip Burgess, published Aug 30 2013, last edited Oct 06 2026) says verbatim:
- "add a capacitor (500–1000 µF at 6.3V or higher) across the + and – terminals". The Powering page adds that this goes "Before connecting a NeoPixel strip to ANY source of power" and that "the negative (–) lead is usually indicated by a stripe".
- "Place a 300 to 500 Ohm resistor between the Arduino data output pin and the input to the first NeoPixel. The resistor should be at the end of the wire closest to the NeoPixel(s), not the microcontroller." It also says "Some products already incorporate this resistor…if you're not sure, add one…there's no harm in doubling up!"

### CALCULATED example BOM totals (sums of the verified prices above; exclude shipping, tax, cells, paint, fasteners and cables not listed)

- **Variant A, LiPo (Prop-Maker Feather): $119.89.** 5768 $19.95, 1463 $9.95, 2226 $5.95, 6178 $17.50, 3967 $14.95, 5880 $7.95, 2× 4210 $1.90, 1119 $2.50, 805 $0.95, 1891 $1.75, 258 $9.95, COM-08982 $0.50, PRT-14490 $1.25, 1881 + 1882 $1.90, 1131 $1.95, MatterHackers PETG $20.99.
- **Variant B, no lithium cell (4xAA NiMH): $105.94** before NiMH cells and a NiMH charger. 4888 $9.95, 3006 $5.95, 1463 $9.95, 2226 $5.95, 6178 $17.50, 3967 $14.95, 5880 $7.95, 4209 $0.95, 4210 $0.95, 1119 $2.50, 1891 $1.75, 830 $2.95, COM-08982 $0.50, PRT-14490 $1.25, 1881 + 1882 $1.90, PETG $20.99.

---

## Part 2 - Safety guidance (sources fetched 2026-10-19)

### 2.1 Lithium batteries

**Adafruit, "Li-Ion & LiPoly Batteries"** (lady ada; "published July 29, 2012, last edited July 08, 2025"; https://learn.adafruit.com/li-ion-and-lipoly-batteries)
- From Protection Circuitry (https://learn.adafruit.com/li-ion-and-lipoly-batteries/protection-circuitry, page last edited March 08, 2024): "they are not 'safe' batteries and require extra care. Charging or using the batteries incorrectly can cause explosion or fire". The page lists five things to watch for:
  - "Do not charge them above their maximum safe voltage (say 4.2V)"
  - "Do not discharge them below their minimum safe voltage (say 3.0V)"
  - "Do not draw more current than the battery can provide (say about 1-2 C)"
  - "Do not charge them with more current than the battery can take (say about 1 C)"
  - "Do not charge the batteries above or below certain temperatures (usually about 0-50 degrees C)"
- The same page adds: "If you don't see any taped circuit board, the cell may be 'raw' - these raw cells are not protected!" and "We suggest that you should never use lithium ion/polymer batteries without protection cells."
- From Proper Charging (https://learn.adafruit.com/li-ion-and-lipoly-batteries/proper-charging): "you must use a proper lithium ion/polymer battery charger" and "Never charge a battery faster than 1C (so a 1300mAh battery should be charged at under 1300 mA) and we suggest staying at or below 0.5C".
- From Conclusion (https://learn.adafruit.com/li-ion-and-lipoly-batteries/conclusion), quoting the manufacturer's cautions: "Do NOT strike, crush, puncture, disassemble, or throw the battery. Do NOT directly solder the battery or battery terminals. Do NOT pierce the battery." It also says not to short-circuit the cell, not to store it with metal objects, and "Keep or store the battery in a cool and dry place".
- The Adafruit LiPo product pages (258/328/2011) say: "Do not use a NiMH/NiCad/lead-acid charger! ... do not short, bend, crush, or puncture. Never charge or use unattended. ... Polarity matches all Adafruit LiPoly/LiIon chargers and boards, other brands may have reverse polarity and can destroy your battery."

**US CPSC, "Micromobility: E-Bikes, E-Scooters and Hoverboards"** (https://www.cpsc.gov/Safety-Education/Safety-Education-Centers/Micromobility-Information-Center; page shows no date). I read this page via WebFetch only, because a direct fetch returned HTTP 403; a separate search summary of the same page matched the wording. This guidance is about e-bikes, but its charging rules apply generally:
- "Always be present when charging micromobility products."
- "Never charge them while sleeping or when you are not at home."
- "Only use the charger provided with or recommended by the manufacturer"
- "Never throw lithium batteries into the trash or general recycling. Instead, take them to your local battery recycler or hazardous waste collection center."
- Do not use packs "modified or reworked by unqualified personnel" or packs "with repurposed or used cells".
- It recommends products "designed, manufactured, and certified for compliance with the applicable voluntary safety standards".
- I found no general (non-micromobility) CPSC lithium tips page today.

**UL Research Institutes, Fire Safety Research Institute, "Take C.H.A.R.G.E. of Battery Safety"** (https://batteryfiresafety.org/):
- "look for products that are listed or safety certified by a nationally recognized testing laboratory"
- "Only use the charging equipment that comes with the product."
- "Check battery-powered devices often for damage or abuse such as swelling or punctures."
- "Listen for unusual hissing or popping sounds."
- "Watch out for excessive heat or a strange odor."
- "If you notice any of these warning signs, stop using the lithium-ion battery-powered device immediately."
- "White or gray wispy smoke indicates there is immediate danger of fire."
- "Never discard batteries, chargers, or battery-powered devices in regular trash bins."
- "Follow your home fire escape plan to leave immediately and call 9-1-1."

### 2.2 NeoPixel power and wiring (Adafruit NeoPixel Überguide)

Pages: https://learn.adafruit.com/adafruit-neopixel-uberguide/powering-neopixels and /best-practices. All quotes are verbatim.
- "When connecting NeoPixels to any live power source or microcontroller, ALWAYS CONNECT GROUND (–) BEFORE ANYTHING ELSE. Conversely, disconnect ground last when separating."
- "Avoid connecting NeoPixels to a live circuit. If you simply must, always connect ground first, then +5V, then data. Disconnect in the reverse order."
- "If powering the pixels with a separate supply, apply power to the pixels before applying power to the microcontroller."
- "If your microcontroller and NeoPixels are powered from two different sources (e.g. separate batteries for each), there must be a ground connection between the two."
- "NeoPixels powered by 5v ideally need a 5V data signal. If using a 3.3V microcontroller you must use a logic level shifter such as a 74AHCT125 or 74HCT245 ... If you are powering your NeoPixels with 3.7v directly from a LiPoly cell, a 3.3v data signal is OK."
- "Try to minimize the distance between the Arduino and first pixel ... A meter or two is usually no problem."
- "Be extremely cautious with bench power supplies. Some ... can produce a large voltage spike when initially switched on, instantly destroying your NeoPixels!"
- "When in doubt, aim for 5 Volts." and "Excessive voltage, however, will definitely kill your LEDs."
- "Select a battery sufficiently large that it will take at least a couple hours to run down. It's both safer for you and better for the longevity of the battery." The same page warns that discharging in an hour "can even be dangerous!"
- "Some of our projects don't make the above precautions…these are typically small battery-powered devices and power spikes aren't a big concern. Any project with a lot pixels or a large power source should definitely include the power capacitor and data line resistor."
- "Observe the same precautions as you would for any static-sensitive part"
- The capacitor, resistor and 60 mA / 20 mA figures are given in Part 1 sections 2 and 10.

### 2.3 Photosensitive seizure safety

These are screen and broadcast standards. Applying them to a handheld LED prop is a conservative **design heuristic, not a legal requirement**. Say so in the tutorial.

**W3C WCAG 2.2, Success Criterion 2.3.1 Three Flashes or Below Threshold (Level A)** (W3C Recommendation 12 December 2024; https://www.w3.org/TR/WCAG22/#three-flashes-or-below-threshold):
- "Web pages do not contain anything that flashes more than three times in any one second period, or the flash is below the general flash and red flash thresholds."
- Definition of **general flash and red flash thresholds** (https://www.w3.org/TR/WCAG22/#dfn-general-flash-and-red-flash-thresholds). Content passes if "there are no more than three general flashes and / or no more than three red flashes within any one-second period; or the combined area of flashes occurring concurrently occupies no more than a total of .006 steradians within any 10 degree visual field on the screen (25% of any 10 degree visual field on the screen) at typical viewing distance". The terms are defined as:
  - A **general flash** is "a pair of opposing changes in relative luminance of 10% or more of the maximum relative luminance (1.0) where the relative luminance of the darker image is below 0.80".
  - A **red flash** is "any pair of opposing transitions involving a saturated red". Note 3 gives the WCAG 2.2 working definition: one state has "R/(R + G + B) that is greater than or equal to 0.8, and the difference between states is more than 0.2 (unitless) in the CIE 1976 UCS chromaticity diagram".
  - Note 1: "using a 341 x 256 pixel rectangle anywhere on the displayed screen area when the content is viewed at 1024 x 768 pixels will provide a good estimate of a 10 degree visual field".
  - "Flash": "a pair of opposing changes in relative luminance that can cause seizures in some people if it is large enough and in the right frequency range".
- **Understanding SC 2.3.1** (https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html):
  - "People are even more sensitive to red flashing than to other colors".
  - The 10° field "represents the central vision portion of the eye, where people are most susceptible to photo stimuli".
  - In CSS pixels the combined flashing area works out to "341 x 256 CSS pixels, or a flashing area of 87,296 CSS pixels".
  - For non-sRGB video, citing ITU-R BT.1702, "a general flash is a change in luminance of 20 cd/m2 or more where the darker image is below 160 cd/m2".
  - "Users that are closer to their screens than the idealized viewing distance will be affected by flashing areas that normatively pass." A handheld prop is viewed close up.
  - On flashing (as opposed to blinking): "This cannot be allowed even for a second or it could cause a seizure. And turning the flash off is also not an option since the seizure could occur faster than most users could turn it off."

**ITU-R BT.1702-3 (11/2023), "Guidance for the reduction of photosensitive epileptic seizures caused by television"** (status page https://www.itu.int/rec/R-REC-BT.1702 lists -3 as in force, and -2 10/2019, -1 07/2018 and -0 02/2005 as superseded; PDF https://www.itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.1702-3-202311-I!!PDF-E.pdf). From Annex 1:
- Guideline 1. "When screen luminance of the darker image is below 160 cd/m2, a potentially harmful sequence of flashes occurs where there is a difference of 20 cd/m2 or more between the screen luminance of the darker and the brighter images". If the darker image is 160 cd/m² or more, the trigger is "more than 1/17 Michelson contrast" (HDR only). "Irrespective of luminance, a transition to or from a saturated red is also potentially harmful."
- "Isolated single, double, or triple flashes are acceptable, but a sequence of flashes is not permitted when both the following occur: the combined area of flashes occurring concurrently occupies more than 25% of the displayed screen area; and there are more than three flashes (i.e. six changes in luminance ...) within any one-second period."
- "successive flashes for which the leading edges are separated by 360 ms or more are acceptable in a 50 Hz environment or separated by 334 ms or more are acceptable in a 60 Hz environment, irrespective of their brightness or screen area."
- "a sequence of flashing images lasting more than five seconds might constitute a risk even when it complies with the guidelines above."
- Guideline 2 covers patterns. "Potentially harmful regular patterns occur when an image contains light and dark pairs of clearly discernible stripes". Attachment 1 (informative) applies this to "more than five light and dark pairs" of stripes when they are stationary and cover >40 % of the screen, or when they move or flash and cover >25 %.

**Ofcom**: blocked today (HTTP 403), so I am not citing it. WCAG's Understanding doc says SC 2.3.1 "is based on existing specifications in use in the UK and by others for television broadcast".

**Epilepsy Society (UK charity), "Photosensitive epilepsy"** (https://epilepsysociety.org.uk/about-epilepsy/epileptic-seizures/seizure-triggers/photosensitive-epilepsy; published 23 Feb 2020, updated 8 Sep 2026, review date April 2027). I used this because the Epilepsy Foundation site returned 403.
- Of the roughly 1 in 100 people who have epilepsy, "around 3% have photosensitive epilepsy".
- "Between 3-30 hertz (flashes per second) are the common rates to trigger seizures but this varies from person to person. While some people are sensitive at frequencies up to 60 hertz, sensitivity under 3 hertz is not common."
- "Lights that flash or flicker between 16 and 25 times a second are the most likely to trigger seizures."
- "Patterns are more likely to be a trigger if they are changing direction or flashing, rather than if they are still, or moving slowly in one direction."
- "Some people are sensitive to geometric patterns with contrasts of light and dark such as stripes or bars."
- Tips: "Covering one eye completely with your hand can reduce the photosensitive effect", "Turn away from the possible trigger", and "Don't close your eyes as this might cause a flicker effect."

**GUIDANCE (derived), for the tutorial:**
- Keep any blink or flash at ≤3 per second, with leading edges ≥360 ms apart (the ITU 50 Hz figure; 334 ms covers 60 Hz).
- Prefer smooth fades or "breathing" over hard on/off strobes.
- Avoid full-brightness saturated-red flashing.
- Do not run flashing sequences longer than 5 s.
- Ship a "no-flash" mode and make it the default.
- Never aim the prop's lights at people's faces.

### 2.4 Photobiological safety of LEDs (IEC 62471)

**IEC 62471:2006, "Photobiological safety of lamps and lamp systems"** (IEC webstore: https://webstore.iec.ch/en/publication/7076). Edition 1.0, published 2006-07-26, stability date 2026 as listed. The abstract "Gives guidance for evaluating the photobiological safety of lamps and lamp systems including luminaires" and sets out "the exposure limits, reference measurement technique and classification scheme". It covers non-coherent broadband sources, including LEDs but not lasers, from 200 to 3000 nm.

**Risk-group summary. US DOE Solid-State Lighting fact sheet "Optical Safety of LEDs"** (PNNL-SA-96340, June 2013; copy hosted by Lighting Global, https://www.lightingglobal.org/wp-content/uploads/2013/06/82_opticalsafety_fact-sheet.pdf):
- "The exempt group, RG0, is established on the principle that the lamp poses no photobiological hazard, with maximum exposure times greater than 10,000 seconds (about 2.8 hours)."
- "The RG1 classification is based on behavioral limitations to exposure ... The maximum exposure times are between 100 and 10,000 seconds."
- "The RG2 classification is for maximum exposure times between 0.25 seconds and 100 seconds. Optical radiation at this level is not dangerous due to humans' natural aversion response." Products must carry the label "CAUTION. Do not stare at exposed lamp in operation. May be harmful to the eyes."
- "Lamps classified as RG3 may pose a risk with even momentary exposure (< 0.25 seconds)", with the label "WARNING. Do not look at exposed lamp in operation. Eye injury can result."
- "the baseline method uses a worst-case 0.2 m (about 8 inches) viewing distance".
- "colored light sources—which may be classified as Risk Group 2 or higher and require a label to meet accepted standards—should be evaluated on a case-by-case basis."

**ams-OSRAM Application Note AN002, "Details on photobiological safety of LED light sources"** (dated 2025-09-16; https://look.ams-osram.com/m/1d720a7b18ab3fce/original/Details-on-photobiological-safety-of-LED-light-sources.pdf). This is a manufacturer source.
- It describes Table 1 safety messages per IEC/EN 62471: RG0 "No photobiological hazard"; RG1 "No hazard due to normal behavioral limitations on exposure"; RG2 "No hazard due to the aversion response to very bright light sources or due to thermal discomfort".
- "A blue LED with a luminous intensity of 5 cd or 20 cd and a dominant wavelength of 470 nm, for example, falls into Risk Group 2."
- "blue and green high-power LEDs (450 nm ≤ λdom ≤ 510 nm), which pose a risk of photochemical damage to the retina, can produce radiation parameters sufficiently hight to qualify for Risk Group 2". The "hight" typo is in the original.

**EU SCHEER, "Opinion on Potential risks to human health of Light Emitting Diodes (LEDs)"** (adopted 5-6 June 2018; https://health.ec.europa.eu/system/files/2019-02/scheer_o_011_0.pdf):
- "Children have a higher sensitivity to blue light and although emissions may not be harmful, blue LEDs (between 400 nm and 500 nm) including those in toys may be very dazzling and may induce photochemical retinopathy, which is a concern especially for children below three years of age."
- "The European standard EN 62115 for electronic toys limits the emission of optical radiation from toys."
- "The worst-case viewing condition is generally on axis viewing of an LED source ... If a source is safe for viewing on axis it will be safe under all other viewing conditions at the same distance."
- "The current EN 62471 standard does not take account of population groups particularly sensitive to blue light".

**GUIDANCE (derived):** Adafruit publishes no risk group for NeoPixels. Do not stare into the LEDs. Put a diffuser between the LEDs and eyes, limit brightness in firmware (especially blue and green), and keep the prop away from infants.

### 2.5 Lasers. The tutorial should recommend **not** using a laser pointer for "targeting".

**FDA, "Important Information for Laser Pointer Manufacturers"** (content current as of 12/04/2017; https://www.fda.gov/radiation-emitting-products/laser-products-and-instruments/important-information-laser-pointer-manufacturers):
- "Laser products promoted for pointing and demonstration purposes are limited to hazard Class IIIa by FDA regulation."
- "This means that pointers are limited to 5 milliwatts output power in the visible wavelength range from 400 to 710 nanometers."
- "Class IIIa or IEC Class 3R lasers can be dangerous. Class IIIa lasers can cause temporary visual effects such as flash blinding".
- "Lasers that emit between 5mW and 500mW output power are in Class IIIb or IEC Class 3B ... Class IIIb hand-held lasers are too dangerous for use as pointers or amusement articles."

**FDA, "Laser Products and Instruments"** (content current as of 11/13/2024; https://www.fda.gov/radiation-emitting-products/home-business-and-entertainment-products/laser-products-and-instruments):
- The hazard-class table maps FDA I → IEC 1/1M ("Considered non-hazardous"), IIa/II → 2/2M, IIIa → 3R ("can be momentarily hazardous when directly viewed"), IIIb → 3B and IV → 4.
- "LEDs (Light Emitting Diodes) are different from laser diodes and are not subject to the Federal laser product performance standard."

**FDA Consumer Update, "Laser Toys: How to Keep Kids Safe"** (content current as of 12/11/2023; https://www.fda.gov/consumers/consumer-updates/laser-toys-how-keep-kids-safe):
- The update lists laser-toy examples including "lasers mounted on toy guns that can be used for 'aiming'".
- "For toys to be considered minimal risk, the FDA recommends that the levels of radiation and light not exceed the limits for Class 1".
- Its tips include: "Never aim or shine a laser directly at any person or animal." "Pointing a laser at an aircraft is a federal crime." "Do not buy laser pointers for children or allow children to use them as toys." "Do not buy or use any laser that emits more than 5mW power".
- "eye injuries caused by laser light often do not cause immediate pain. Vision can deteriorate slowly".

**OSHA Technical Manual, Section III Chapter 6, "Laser Hazards"** (https://www.osha.gov/otm/section-3-health-hazards/chapter-6), for the power limits:
- "Class II : low-power visible lasers that emit above Class I levels but at a radiant power not above 1 mW."
- "Class IIIA : intermediate power lasers (cw: 1-5 mW)."
- "Class IIIB : moderate power lasers (cw: 5-500 mW ...)."
- Class IV is listed as "High power lasers (cw: 500 mW ...)", "a potential fire hazard and a skin hazard".

**FAA, "Laser Safety"** (last updated August 12, 2026; https://www.faa.gov/about/initiatives/lasers):
- "Pilots reported 10,993 laser strikes to the FAA in 2025."
- "Pointing a laser at an aircraft is a federal crime."
- "People who shine lasers at aircraft face FAA fines of up to $32,646 per violation."

The VL53L1X/VL53L0X are Class 1 under IEC 60825-1:2014 with ST's settings, with no focusing optics (see Part 1, section 5).

### 2.6 Convention prop and weapon policies

**San Diego Comic-Con, Convention Policies, "Costume Props Policy"** (https://www.comic-con.org/cc/plan-your-visit/convention-policies/, fetched 2026-10-19):
- "All costume props must be inspected daily at one of the Costume Props Desks." Approved props get a tag that "must remain visible".
- "No functional or sharp-edged props or weapons are allowed at Comic-Con."
- "All costume props must conform to state and federal law."
- "Replica projectile costume props must be rendered inoperable and covered with brightly-colored caps." The page does not say "orange".
- "Certain props may need to be tied to your costume in such a way that they can't be drawn."
- "Only active on-duty police officers may carry firearms within the Convention Center."
- The 2026 Toucan cosplay tip (https://www.comic-con.org/toucan/toucan-tip-4-gear-up-your-comic-con-2026-cosplay-guide-starts-now/) adds: "Realistic cosplay of first responders and/or security is not permitted."
- Neither page mentions lights or lasers.

**Dragon Con, "Dragon Con Policies"** (https://www.dragoncon.org/about/dragon-con-policies/; no date shown):
- "Dragon Con has a clear *no weapons* policy for the entire Convention that will be enforced. All weapons must be non-working and peace bonded. No functioning projectile weapons – including water pistols, silly-string guns, and ping-pong pistols."
- "No clowning around or showing off in the common areas."
- "Real firearms are not allowed at Dragon Con ... Dragon Con Safety, hotel security, and local law enforcement officials will treat anything that looks like a real weapon as a weapon."

**New York Comic Con, "Cosplay & Prop Rules"** (Last Updated: July 9, 2025; https://www.newyorkcomiccon.com/en-us/plan-your-show/cosplay-and-prop-rules.html):
- Banned items include "Laser pointers, vuvuzelas, silly string (even if not part of a costume)".
- "New York Comic Con will require every blaster and prop gun worn by attendees to display a distinctive marking that will be applied at the show by Security", and "A different marking will be required each day".
- Toys "that are clearly science fiction based (phasers, plasma guns, blasters) are permitted; maximum size is 150cm".
- Realistic imitation firearms of lightweight materials need "a brightly coloured tip on the end of the muzzle".
- "Compressed air chambers and batteries for weapons are similarly not permitted." This line is ambiguous for a battery-lit prop, so **ask the con's prop desk in advance**.
- "Any sensible material is permitted e.g. lightweight wood, foam, card, PLA/3D printing". It also bans props containing glass.
- "Regardless of how realistic it looks, ensure it is completely hidden while travelling ... Don't assume a costume reassures people that the weapon is a prop."

**GUIDANCE (derived):** Use bright, obviously sci-fi colours. Do not fit a laser. Expect inspection, tagging or peace-bonding. Carry the prop covered when outside the venue. Check each event's current policy, because all three pages say policies change.

### 2.7 Workshop safety

**Hot glue. UC ANR Environmental Health & Safety, Clover Safe #56 "Hot Glue-Gun Safety"** (June 2008; https://ucanr.edu/sites/Test1/files/207106.pdf):
- Citing CPSC data: "most hot glue-gun injuries that resulted in hospital treatment during 2006 were burns to the fingers and hands".
- "Always wear leather or heat resistant gloves and safety glasses or goggles when using a hot glue gun."
- "Use a wire or metal safety stand ... Never lay a hot glue gun on its side."
- "Never leave a plugged in hot glue gun unattended."
- "Skin that comes in contact with hot glue should be immediately plunged into cold water."
- "If hot glue contacts an eye, irrigate the eye with cold water and seek medical attention immediately."
- "Prevent inhalation of hot-glue vapors by using the glue gun in well ventilated areas."

**Soldering. UK HSE INDG249(rev1), "Controlling health risks from rosin (colophony)-based solder flux fume"** (published 09/15; https://www.hse.gov.uk/pubns/indg249.htm and the PDF at https://www.hse.gov.uk/pubns/indg249.pdf):
- The fume is "hazardous to health, being a common cause of occupational asthma. Contact with this solder fume and its residues can also cause skin problems such as dermatitis."
- Controls: "good general ventilation in the work area, temperature-controlled soldering irons, good worker posture, local exhaust ventilation (LEV)". Position the work "so the person can keep their head out of the fume".
- The guidance also suggests rosin-free or rosin-reduced fluxes.

**Soldering. RPI EHS "Soldering Safety Guidelines"** (https://ehs.rpi.edu/lab-research-shop-safety/soldering-safety-guidelines):
- "Soldering irons typically operate between 600–800°F (315–425°C)."
- "Do not eat or drink in areas where soldering is performed."
- "Wash your hands thoroughly with soap and water after completing soldering tasks."
- "Always place the soldering iron in its designated stand".
- "Never leave a powered soldering iron unattended."
- "Lead is a well‑recognized neurotoxin".
- Eye risk: "Molten solder can occasionally splatter, and flux can bubble or spit".

**3D-printing emissions. UL Chemical Insights Research Institute (CIRI)**:
- Technical Brief TB 540 (© 2023; https://chemicalinsights.ul.org/wp-content/uploads/2023/06/TB-540_3D-Printers_fin.pdf): "high levels of ultrafine particles (UFPs) and numerous hazardous VOCs are emitted during normal operation of 3D printers, which may pose a health hazard to the users when inhaled". It also says "UFPs can transport deep into the lungs, bloodstream, and even brain", and that the "second edition of [ANSI/CAN/UL 2904] was published in May 2023".
- UL news item, December 7, 2023 (https://ul.org/news/comprehensive-emissions-data-material-extrusion-3d-printing-now-available): "High emitting filament materials include nylon (particle)", followed by ASA, ABS and HIPS. It covers data from over 500 exposure studies. The paper is Zhang Q. et al., *Environment International*, https://doi.org/10.1016/j.envint.2023.108316.
- **GUIDANCE (derived):** Print in a ventilated room, ideally with an enclosure or filtration, and do not sit beside the printer for long prints. PETG and PLA are not on CIRI's "high emitting" list in that news item. That only means they were not listed there, not that they emit nothing.

---

## Part 3 - Published portal-gun builds (reference only; do not copy files)

**No Adafruit Learning System guide for a Rick and Morty portal gun was found.** Searches of learn.adafruit.com found none, and the Learn site search is JavaScript-only. The only Learn mention is in "Costume Triggers & Actuators" (Becky Stern, published Sept 23, 2014; https://learn.adafruit.com/costume-triggers-and-switches/switches): "Simple momentary pushbuttons and tactile switches can be added to any part of your costume, like the trigger on your Portal gun". Adafruit **blog** posts about community builds exist in search results (2015-11-05, 2016-06-22, 2018-06-16), but the blog returned 403, so their content is unverified. Do not claim an official Adafruit portal-gun guide exists.

| Build | Author | Date | License (as verified) | Electronics (from author's text) | URL |
|---|---|---|---|---|---|
| "Ricks Portal Gun (Rick & Morty)" (Printables 606725) | Bannerz | published 2024-03-20 | **CC BY-NC** ("Creative Commons — Attribution — Noncommercial"), via the Printables API | Raspberry Pi Pico (Pimoroni Pico LiPo), 5 green 5 mm LEDs, a 500 mAh LiPo, an EC11 rotary encoder module, and the Adafruit 0.56" 4-digit 7-segment I2C display. An update added a custom PCB and moved to CircuitPython for I2S audio. Body is PLA; lenses and plasma tube are clear resin. | https://www.printables.com/model/606725-ricks-portal-gun-rick-morty |
| Its code repo, "RMPicoPortalGun" | Bannerz | - | **No license file shown**, so default copyright applies | MicroPython, HT16K33 display driver | https://github.com/Bannerz/RMPicoPortalGun |
| "Rick and Morty Portal Gun (Arduino and 3D Printer Project)" (Instructables) | JackSoldano | 2018-05-29 | **CC BY-NC-SA 4.0** ("Attribution-NonCommercial-ShareAlike"), via the Instructables JSON API | Arduino Nano, TM1637 4-digit display, KY-040 rotary encoder, tactile button, slide switch, TP4056 charger module, MT3608 boost, 3.7 V 1600 mAh LiPo, 10 mm diffused green LEDs. The 3D files are on Thingiverse thing:2935246, **license not verified** because Thingiverse returned 403. | https://www.instructables.com/Rick-Morty-Portal-Gun-Arduino-3D-Printer-Project/ |
| "Portal Gun From Rick and Morty" (Instructables) | korv | 2015-10-24 | **CC BY-NC-SA 4.0**, via the Instructables JSON API | "3 parallel sets of 3 leds in series wired to a 9 volt battery" and a momentary tact switch. Body is foam core and styrofoam. No current-limiting resistor is mentioned, so it is not a wiring model to copy. | https://www.instructables.com/Portal-Gun-from-Rick-and-Morty/ |
| "PortalGun" firmware (GitHub) | pomeroyb | - | **No license file**, so default copyright applies | Adafruit Trinket Pro, I2C LED backpack display, rotary encoder with click, 4 LEDs. The README says the speaker "inside the case was too quiet to hear". | https://github.com/pomeroyb/PortalGun |
| Make: article "This Rick and Morty Portal Gun Actually Projects Portals on the Wall" | Caleb Kraft (writer); build by Dave Dalton, Hammerspace (Kansas City) | Oct 30 / Nov 2, 2015 (both shown) | No build files or license linked | Pico projector with microSD loop, an LCD shutter from 3D glasses, an Adafruit mono audio amp, and a LiPo with an Adafruit charger | https://makezine.com/article/craft/rick-morty-cosplay-prop/ |
| *Not Rick and Morty:* "Arduino powered Portal Gun" (Printables 172096), a remix of Thingiverse thing:3579224 | Lunchbox | 2022-04-15 | **CC BY** (Printables API). The code repo https://github.com/Lunchbox7985/Portal-Gun is **Apache-2.0** (sidebar). | This is the Valve *Portal* game gun ("Still Alive"). It is useful for its power design: Arduino Nano, Adafruit Audio FX 2 MB, 2 NeoPixel Jewels, a 16-LED ring, a 5 V amp, 2-inch speakers, and a **USB battery bank** power supply. | https://www.printables.com/model/172096-arduino-powered-portal-gun |

Note on IP: the portal gun is a design from the Rick and Morty TV show. Fan-build licenses (CC BY-NC, BY-NC-SA) cover only the authors' own files. The tutorial should credit any inspiration and should not redistribute others' files. I did not research trademark questions.

---

## Quick reference: key safety numbers

| Topic | Number | Source |
|---|---|---|
| NeoPixel current | up to 60 mA per pixel at full white; 20 mA per pixel rule of thumb | Adafruit Uberguide, Powering NeoPixels |
| NeoPixel cap / resistor | 500-1000 µF, ≥6.3 V across +/-; 300-500 Ω on data, at the pixel end | Adafruit Uberguide, Best Practices |
| NeoPixel supply | aim for 5 V; 4×AA must be NiMH (4.8 V); 4× alkaline = 6 V "too high" | Adafruit Uberguide |
| LiPo limits | charge ≤4.2 V; discharge ≥3.0 V; draw ≤1-2C; charge ≤1C, "at or below 0.5C" suggested; charge temperature about 0-50 °C | Adafruit Li-Ion & LiPoly guide |
| Flash rate | ≤3 flashes in any 1 s; leading edges ≥360 ms (50 Hz) / ≥334 ms (60 Hz) apart; sequences >5 s may be risky | WCAG 2.2 SC 2.3.1; ITU-R BT.1702-3 |
| Flash size / luminance | ≤0.006 sr (25 %) of any 10° field; general flash = ≥10 % relative-luminance change with darker state <0.80; TV: ≥20 cd/m² with darker state <160 cd/m²; >25 % of screen; saturated red counts at any luminance | WCAG 2.2 glossary; ITU-R BT.1702-3 |
| Trigger frequencies | 3-30 Hz common; 16-25 Hz most likely; about 3 % of people with epilepsy are photosensitive | Epilepsy Society (UK) |
| LED risk groups | RG0 >10,000 s; RG1 100-10,000 s; RG2 0.25-100 s ("Do not stare"); RG3 <0.25 s; assessed at 0.2 m worst case | US DOE / PNNL fact sheet (IEC 62471) |
| Lasers | pointers limited to Class IIIa / 3R, 5 mW (400-710 nm); Class II ≤1 mW; IIIa 1-5 mW; IIIb 5-500 mW; FDA recommends toys stay within IEC Class 1 | FDA; OSHA Technical Manual |
| Aircraft | 10,993 laser strikes reported in 2025; fines up to $32,646 per violation; a federal crime | FAA |
| VL53L1X / VL53L0X | 940 nm, Class 1 (IEC 60825-1:2014) with ST settings; no focusing optics; 4 m / 2 m max range | ST datasheets (Pololu-hosted) |
| Slide switch 805 | rated DC 50 V 0.5 A, so do not switch LED current with it | Adafruit 805 datasheet |
| Soldering iron temperature | 600-800 °F (315-425 °C) | RPI EHS |
