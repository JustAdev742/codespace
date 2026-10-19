# Project Portal: mathematical and computational appendix

*Deliverable 3 of 8. Part A works through the key calculations step by step. Part B documents the
computational models, how they were checked, and what the tests found, including the faults found
during the verification pass.*

All values use SI units and CODATA 2018 constants (`models/portalphys/constants.py`):
$c = 2.998\times10^8$ m/s, $G = 6.674\times10^{-11}$ m³ kg⁻¹ s⁻², $\hbar = 1.055\times10^{-34}$ J s,
Planck length $\ell_P = \sqrt{\hbar G/c^3} = 1.616\times10^{-35}$ m, $g_0 = 9.807$ m/s². Two combinations
recur: $c^4/G = 1.21\times10^{44}$ N and $c^2/G = 1.35\times10^{27}$ kg/m. Results are given to two or
three significant figures; the models are idealisations whose own uncertainty dwarfs that precision.

---

## Part A. Worked calculations

Each calculation follows the same ten steps: (1) question, (2) variables and units, (3) model and
assumptions, (4) governing equation, (5) derivation, (6) substitution, (7) result, (8) dimensional check,
(9) meaning, (10) uncertainties and limits.

### A1. Tension at the throat

1. **Question.** What radial tension must the matter at the throat of a 1 m static portal sustain?
2. **Variables.** Throat radius $b_0$ [m]; tension $\tau_0$ [Pa]; shape function $b(r)$ [m]; redshift
   function $\Phi(r)$ [dimensionless].
3. **Model.** Static, spherically symmetric Morris–Thorne wormhole (MT88 eq. 1); $\Phi$ finite (no horizon).
4. **Equation.** In the static orthonormal frame, $G_{\hat r\hat r} = -b/r^3 + 2(1-b/r)\Phi'/r$ (MT88 eq. 12),
   and $T_{\hat r\hat r} = -\tau$.
5. **Derivation.** From $G_{\hat r\hat r} = (8\pi G/c^4)T_{\hat r\hat r}$:
   $\tau = \dfrac{c^4}{8\pi G}\left[\dfrac{b}{r^3} - \dfrac{2(1-b/r)\Phi'}{r}\right]$. At the throat $b = r = b_0$, so
   the second term vanishes: $\tau_0 = c^4/(8\pi G b_0^2)$. (Re-derived symbolically in `symbolic_gr.py`.)
6. **Substitution.** $c^4/(8\pi G) = (2.998\times10^8)^4 / (8\pi \times 6.674\times10^{-11}) = 4.82\times10^{42}$ N;
   divide by $(1\ \text{m})^2$.
7. **Result.** $\tau_0 = 4.8\times10^{42}$ Pa for $b_0$ = 1 m (equivalently $4.8\times10^{41}$ dyn/cm² at
   10 m, MT88's "5 × 10⁴¹").
8. **Dimensions.** $c^4/G$ is a force (N); force per area is Pa. ✓
9. **Meaning.** About $4\times10^{31}$ times the breaking stress of graphene ($1.3\times10^{11}$ Pa). The
   tension falls to graphene's strength only for a throat 0.64 light-years in radius, and it must also
   exceed the energy density, which no material does (graphene's ratio is $7\times10^{-10}$).
10. **Limits.** Exact for any static spherical throat. Non-spherical throats obey a generalised version
    (Hochberg and Visser 1997) with the same scaling. $G$ is known to 2 parts in 10⁵, irrelevant here.

### A2. Negative mass-energy of an Ellis throat

1. **Question.** How much negative mass-energy does a 1 m Ellis portal contain?
2. **Variables.** Throat radius $r_0$ [m]; areal radius $r$ [m]; density $\rho$ [kg/m³]; mass $M$ [kg].
3. **Model.** Massless Ellis–Bronnikov wormhole: $\Phi = 0$, $b = r_0^2/r$. Integrate $\rho$ over *proper*
   volume on both sides of the throat.
4. **Equation.** $\rho = b'/(8\pi G c^{-2} r^2)$; proper volume element $dV = 4\pi r^2\,dr/\sqrt{1 - b/r}$.
5. **Derivation.** $b' = -r_0^2/r^2$ gives $\rho = -c^2 r_0^2/(8\pi G r^4)$. Then

   $$M = 2\int_{r_0}^\infty \rho\,\frac{4\pi r^2\,dr}{\sqrt{1-r_0^2/r^2}} = -\frac{c^2 r_0^2}{G}\int_{r_0}^\infty \frac{dr}{r\sqrt{r^2-r_0^2}} = -\frac{c^2 r_0^2}{G}\cdot\frac{\pi}{2r_0} = -\frac{\pi}{2}\,\frac{r_0 c^2}{G}.$$

6. **Substitution.** $(\pi/2)\times1\ \text{m}\times1.347\times10^{27}$ kg/m.
7. **Result.** $M = -2.1\times10^{27}$ kg, i.e. $-1.1$ Jupiter masses, or $-1.9\times10^{44}$ J.
   Quadrature of the same integral agrees with the closed form to $5\times10^{-15}$ (`test_ellis_mass_closed_form_matches_quadrature`).
8. **Dimensions.** $(c^2/G)\times r_0$: (kg/m) × m = kg. ✓
9. **Meaning.** $1.9\times10^{44}$ J is 16 billion years of the Sun's total output. It is not a fuel bill:
   the massless Ellis wormhole's mass seen from outside is zero, because the throat's own positive mass
   function cancels it. It is the amount of exotic matter that must be present.
10. **Limits.** Measure-dependent. Coordinate volume gives $-r_0c^2/G = -1.35\times10^{27}$ kg; the
    Visser–Kar–Dadhich volume quantifier $\int(\rho+p_r)\,dV$ gives $-2.7\times10^{27}$ kg; the flat thin
    shell needs $-2.7\times10^{27}$ kg; the flat-face rim $-2.1\times10^{27}$ kg (A3). "About a Jupiter mass
    per metre of radius" is robust to a factor of two across models.

### A3. Mass of a flat-face portal's rim

1. **Question.** What must the rim of a door-sized flat-face portal pair weigh?
2. **Variables.** Rim radius $R$ [m]; mass per length $\mu$ [kg/m]; excess angle $E$ [rad]; Visser bending
   angle $\phi$ [rad].
3. **Model.** The rim is a thin straight string locally (valid if its thickness ≪ $R$), with tension equal
   to energy density (Nambu–Goto), so outside it space is a cone.
4. **Equation.** A straight Nambu–Goto string produces a deficit angle $\Delta = 8\pi G\mu/c^2$.
5. **Derivation.** Around the rim of a disc pair the total angle is $4\pi$ (pass the rim once on each disc:
   section 3.2 of the report), an *excess* $E = 2\pi$, so $\mu = -Ec^2/(8\pi G) = -c^2/(4G)$. The same
   follows from Visser's edge rule $\mu = -\phi c^2/(4\pi G)$ with bending angle $\phi = \pi$; his cube edge
   ($\phi = \pi/2$) gives $-c^2/(8G)$ (both checked in `test_energy.py`). Total: $2\pi R\mu = -(\pi/2)Rc^2/G$.
6. **Substitution.** $\mu = -1.347\times10^{27}/4$ kg/m; times $2\pi\times1$ m.
7. **Result.** $\mu = -3.4\times10^{26}$ kg/m; rim total $-2.1\times10^{27}$ kg for $R$ = 1 m (the cube
   edge: $-1.7\times10^{26}$ kg/m $= -1.5\times10^{43}$ J/m, Visser's number).
8. **Dimensions.** $c^2/G$ is kg/m. ✓
9. **Meaning.** A cartoon portal's rim would weigh minus one Jupiter. The equality with A2 is a
   coincidence of these two models.
10. **Limits.** Thin-string and straight-string approximations; a free circular loop is not static (A11).

### A4. Casimir plate gap that would supply the throat

1. **Question.** How close would ideal Casimir plates have to be for their negative energy density to
   match the throat tension of a 1 m portal?
2. **Variables.** Plate gap $a$ [m]; energy density $\rho_C$ [J/m³].
3. **Model.** Ideal parallel conducting plates: $\rho_C = -\pi^2\hbar c/(720a^4)$ (Casimir 1948; Brown and
   Maclay 1969). Match $|\rho_C|$ to $\tau_0$ (an order-of-magnitude criterion).
4. **Equation.** $\pi^2\hbar c/(720a^4) = c^4/(8\pi G r_0^2)$.
5. **Derivation.** $a^4 = 8\pi^3\hbar G r_0^2/(720c^3) = (\pi^3/90)\,\ell_P^2 r_0^2$, so
   $a = (\pi^3/90)^{1/4}\sqrt{\ell_P r_0} = 0.766\sqrt{\ell_P r_0}$.
6. **Substitution.** $\sqrt{1.616\times10^{-35}\times1} = 4.02\times10^{-18}$ m; times 0.766.
7. **Result.** $a = 3.1\times10^{-18}$ m, 1/270 of a proton radius. For a throat 1 AU in radius,
   $a = 1.2\times10^{-12}$ m.
8. **Dimensions.** $(\ell_P r_0)^{1/2}$ is a length. ✓
9. **Meaning.** At achievable gaps (1 µm) the Casimir energy density is $-4.3\times10^{-4}$ J/m³, short by
   a factor of $1.1\times10^{46}$.
10. **Limits.** Morris, Thorne and Yurtsever (1988) matched the plates' *tension* ($3|\rho_C|$) instead,
    which multiplies $a$ by $3^{1/4} = 1.32$: their $\sim1.6\times10^{-10}$ cm for 1 AU against my
    $1.2\times10^{-10}$ cm. Real plates are not ideal at sub-nuclear gaps, and the plates restore ANEC.

### A5. How thin the negative energy must be: quantum inequalities

1. **Question.** Over what length could an inertial observer see the negative energy density a 1 m throat
   needs, and how thick may the exotic band be?
2. **Variables.** Sampling time $t_0$ [s]; length $L = ct_0$ [m]; band thickness $a_0$ [m]; fraction $f$.
3. **Model.** Ford–Roman (1995) quantum inequality for a free massless scalar field, Lorentzian sampling,
   flat spacetime; applied in curved spacetime over $t_0 = f\times$(smallest length scale) with $f$ = 0.01
   (Ford and Roman 1996) — an argument, not a theorem.
4. **Equation.** $\hat\rho \ge -3\hbar/(32\pi^2c^3t_0^4)$.
5. **Derivation.** A density $-|\rho|$ held over $t_0$ requires $|\rho| \le 3\hbar/(32\pi^2c^3t_0^4)$, so
   $L \le (3\hbar c/(32\pi^2|\rho|))^{1/4}$. For the band, Ford and Roman's eq. 69 is
   $a_0 \lesssim (r_0/(8f^4\ell_P))^{1/3}\,\ell_P$; for an Ellis-type throat, eq. 51, $r_0 \lesssim \ell_P/(2f^2)$.
6. **Substitution.** $|\rho| = 4.8\times10^{42}$ J/m³: $(9.49\times10^{-26}/(315.8\times4.82\times10^{42}))^{1/4}$.
   Band: $(1/(8\times10^{-8}\times1.616\times10^{-35}))^{1/3}\times1.616\times10^{-35}$.
7. **Result.** $L = 2.8\times10^{-18}$ m; $a_0 \lesssim 1.5\times10^{-21}$ m ($9\times10^{13}\,\ell_P$;
   Ford and Roman: "approximately a millionth of the proton radius"); Ellis-type throat
   $r_0 \lesssim 8\times10^{-32}$ m.
8. **Dimensions.** $\hbar c/(\text{J/m}^3)$ is m⁴. ✓
9. **Meaning.** Free quantum fields can only supply the needed density in bands far thinner than a nucleus,
   around a macroscopic throat.
10. **Limits.** Results scale as powers of the arbitrary $f$. Rigorous only for free fields in flat space;
    interacting fields need not obey state-independent bounds (Fewster 2012).

### A6. Speed limit for walking through an Ellis throat

1. **Question.** How fast may a person cross a 1 m Ellis throat before the tidal stretch exceeds 1 g?
2. **Variables.** Speed $v$ [m/s]; $\gamma = (1-v^2/c^2)^{-1/2}$; body length $\xi$ [m]; tolerance $a_{\max}$
   [m/s²].
3. **Model.** Ellis metric; geodesic deviation in the traveller's frame; MT88's tolerance of one Earth
   gravity across 2 m.
4. **Equation.** $R_{\hat0'\hat2'\hat0'\hat2'} = -\beta^2\gamma^2 r_0^2/r^4$ (verified symbolically), and
   $\Delta a = -c^2 R_{\hat0'\hat2'\hat0'\hat2'}\,\xi$.
5. **Derivation.** At the throat $\Delta a = \gamma^2v^2\xi/r_0^2$. Setting $\Delta a = a_{\max}$:
   $\gamma^2\beta^2 = k \equiv a_{\max}r_0^2/(\xi c^2)$, so $v = c\sqrt{k/(1+k)} \approx r_0\sqrt{a_{\max}/\xi}$.
6. **Substitution.** $1\ \text{m}\times\sqrt{9.807/2}$.
7. **Result.** $v_{\max} = 2.2$ m/s for $r_0$ = 1 m; 22 m/s for 10 m.
8. **Dimensions.** $\text{m}\sqrt{(\text{m/s}^2)/\text{m}}$ = m/s. ✓
9. **Meaning.** A slow walk. The radial tidal force is zero for this geometry.
10. **Limits.** The tolerance is MT's convention. For a general $\Phi = 0$ throat the lateral term is
    $\gamma^2v^2(1-b_0')\xi/(2r_0^2)$; MT's example $b = \sqrt{b_0r}$ ($b_0' = 1/2$) gives 44 m/s for 10 m with
    the exact bound, and MT's 60 m/s with their rounded bound $1/(10^8\ \text{m})^2$ (`test_tidal.py`).

### A7. Air through a portal onto vacuum

1. **Question.** How fast does air leave a sea-level room through a 1 m-radius portal to vacuum, and how
   quickly does a 50 m³ room lose pressure?
2. **Variables.** Stagnation pressure $p_0$ = 101,325 Pa; temperature $T_0$ = 288.15 K; $\gamma$ = 1.4;
   gas constant $R$ = 287.05 J kg⁻¹ K⁻¹; area $A$ [m²]; discharge coefficient $C_d$; room volume $V$ [m³].
3. **Model.** Isentropic flow through an orifice. Choked when the pressure ratio is below
   $(2/(\gamma+1))^{\gamma/(\gamma-1)} = 0.528$, which a vacuum always is. The room expands isentropically.
4. **Equation.** $\dot m = C_d A\,p_0\sqrt{\gamma/(RT_0)}\;\Gamma$, with $\Gamma = (2/(\gamma+1))^{(\gamma+1)/(2(\gamma-1))} = 0.579$.
5. **Derivation.** With $p = p_0(m/m_0)^\gamma$ and $T = T_0(p/p_0)^{(\gamma-1)/\gamma}$, the mass balance
   $dm/dt = -\dot m$ integrates to $p/p_0 = (1+kt)^{-2\gamma/(\gamma-1)}$, with
   $k = (\gamma-1)C_dA\Gamma c_0/(2V)$ and $c_0 = \sqrt{\gamma RT_0} = 340$ m/s. Half pressure is reached at
   $t_{1/2} = (2^{(\gamma-1)/(2\gamma)} - 1)/k$.
6. **Substitution.** $\dot m = 1\times\pi\times101{,}325\times\sqrt{1.4/(287.05\times288.15)}\times0.579$.
   For the room: $C_d$ = 0.8, $V$ = 50 m³, $A = \pi$ m² gives $k = 1.98$ s⁻¹.
7. **Result.** 760 kg/s ($C_d$ = 1); sonic speed at the throat 311 m/s; force on a body in the aperture
   $p_0A = 3.2\times10^5$ N. Half pressure after 0.053 s (1 m radius), 5.3 s (10 cm), 526 s (1 cm).
8. **Dimensions.** $p_0\sqrt{1/(RT)}$: Pa × s/m = kg m⁻² s⁻¹; times area gives kg/s. $k$: (m²·m/s)/m³ = s⁻¹. ✓
9. **Meaning.** A portal to vacuum is a catastrophic decompression at door size and a slow leak at coin size.
10. **Limits.** Ideal gas, uniform room, no heat transfer, $C_d$ assumed. The numerical solver reproduces
    the closed form; see B.4 for the error this check exposed in the half-pressure times first reported.

### A8. The floor/ceiling pair: free energy, or a time machine

1. **Question.** In the naive model, how much energy does an object gain per loop through a floor portal
   that exits from the ceiling, and how long would the same pair take to become a time machine?
2. **Variables.** Height difference $h$ [m]; gravity $g$; loop energy $\Delta E/m$ [J/kg]; drift rate $\epsilon$;
   time to closed timelike curves $T$ [s].
3. **Model.** Naive: uniform field, speed preserved through the portal. Time machine: weak-field clocks,
   short throat that keeps the mouths' proper times identified (section 2.11).
4. **Equations.** $\Delta E/m = gh$ per loop. $\epsilon = \Delta\Phi/c^2 = gh/c^2$; $T = (L/c)/\epsilon$.
5. **Derivation.** Each loop falls through $h$ outside and re-enters at the top through the throat, which
   (by assumption) changes nothing. For the clocks, the offset grows at $\epsilon$ and must exceed the
   external light time $L/c$; for stacked mouths $L = h$, so $T = (h/c)/(gh/c^2) = c/g$.
6. **Substitution.** $h$ = 4 m: $9.81\times4$. $T = 2.998\times10^8/9.807$.
7. **Result.** 39 J/kg per loop (a ball dropped from 3 m is moving at 59 m/s after 6 s). $T = 3.06\times10^7$
   s = 354 days, for any height.
8. **Dimensions.** $gh$: m²/s² = J/kg. $c/g$: (m/s)/(m/s²) = s. ✓
9. **Meaning.** The game's free energy and the time-machine drift come from the same assumption: that the
   potential does not return to its starting value around the loop. The static self-consistent field
   (B.2, report section 3.10) removes both.
10. **Limits.** Weak field, static mouths, negligible throat length; quantum back-reaction near the
    chronology horizon is not included.

### A9. A mouth in orbit

1. **Question.** How soon would a mouth in low Earth orbit, linked to one on the ground directly below,
   become a time machine?
2. **Variables.** Orbital speed $v$ = 7.8 km/s; altitude 400 km; $GM_\oplus = 3.986\times10^{14}$ m³/s²;
   $R_\oplus$ = 6371 km.
3. **Model.** Weak field; drift rate = velocity time dilation minus the gravitational rate difference;
   separation fixed at 400 km (an idealisation: a real orbit moves the mouth around the Earth).
4. **Equation.** $\epsilon = v^2/(2c^2) - GM_\oplus(1/R_\oplus - 1/(R_\oplus+h))/c^2$; $T = (L/c)/\epsilon$.
5. **Derivation.** The orbiting clock runs slow by $v^2/2c^2$ and fast by the potential difference.
6. **Substitution.** $3.38\times10^{-10} - 4.1\times10^{-11} = 2.97\times10^{-10}$; $L/c = 1.33\times10^{-3}$ s.
7. **Result.** $T = 4.5\times10^6$ s ≈ 52 days.
8. **Dimensions.** $\epsilon$ dimensionless; $T$ in s. ✓
9. **Meaning.** Satellite-linked portals would cross into time-machine territory within two months.
10. **Limits.** As A8; and the geometry of a real orbit.

### A10. What an Ellis mouth looks like

1. **Question.** How large does the far side appear as you approach an Ellis mouth, and how much does it
   bend light that passes by?
2. **Variables.** Proper distance $\ell$ from the throat [m]; angular radius $\delta$; impact parameter $b$;
   deflection $\alpha$ [rad].
3. **Model.** Null geodesics of the massless Ellis metric (Perlick 2004; Nakajima and Asada 2012).
4. **Equations.** $\sin\delta = r_0/\sqrt{\ell^2+r_0^2}$; $\alpha(b) = 2K(r_0/b) - \pi$ (modulus convention).
5. **Derivation.** The disc rim corresponds to rays that spiral onto the photon sphere at the throat, whose
   impact parameter is $r_0$; an observer at areal radius $r = \sqrt{\ell^2+r_0^2}$ sees them at
   $\sin\delta = r_0/r$. Expanding $K$: $\alpha = (\pi/4)(r_0/b)^2 + (9\pi/64)(r_0/b)^4 + \dots$
6. **Substitution.** $\ell = 8r_0$: $1/\sqrt{65}$. $b = 10r_0$: $\pi/400 + 9\pi/640{,}000$.
7. **Result.** $\delta$ = 7.1° (8 $r_0$), 18° (3 $r_0$), 45° ($r_0$), 90° (throat).
   $\alpha(10r_0) = 7.90\times10^{-3}$ rad exactly; the two-term series gives $7.898\times10^{-3}$.
8. **Dimensions.** Ratios of lengths. ✓
9. **Meaning.** The far side looks exactly like a sphere of the throat's size; a massless wormhole still
   bends light, as $1/b^2$ rather than a mass's $1/b$.
10. **Limits.** Static, massless Ellis geometry; no wave optics.

### A11. How fast things fail

1. **Question.** How long do the unsupported or perturbed structures last?
2. **Variables.** Rim radius $R$; throat radius $r_0$; time $t$.
3. **Models.** (a) A circular Nambu–Goto loop released from rest. (b) The unstable mode of the Ellis
   wormhole (Gonzalez, Guzmán and Sarbach 2009).
4. **Equations.** (a) $\ddot r = -(c^2/r)(1-\dot r^2/c^2)$. (b) Growth $\propto e^{t/\tau}$, $\tau = 0.846\,r_0/c$.
5. **Derivation.** (a) $r = R\cos(ct/R)$ satisfies (a): $\ddot r = -(c^2/R)\cos(ct/R)$ and
   $(c^2/r)(1-\sin^2) = (c^2/R)\cos(ct/R)$. It reaches zero at $t = \pi R/2c$, whatever the sign of the
   tension, because $\mu$ cancels from the equation of motion.
6. **Substitution.** $\pi\times1/(2\times2.998\times10^8)$; $0.846\times1/2.998\times10^8$.
7. **Result.** (a) 5.2 ns. (b) 2.8 ns per e-fold.
8. **Dimensions.** $R/c$ is a time. ✓
9. **Meaning.** A metre-sized portal fails in nanoseconds unless actively held.
10. **Limits.** (a) Neglects gravitational self-interaction. (b) A specific matter model.

### A12. The prop's LED power budget

1. **Question.** What current can the prop's 23 LEDs draw, and how long does a 1200 mAh cell last?
2. **Variables.** Pixels $N$ = 23 (Ring 16 + Jewel 7); 60 mA per full-white pixel; channel caps; budget.
3. **Model.** Adafruit's NeoPixel figure of 60 mA per pixel at full white (20 mA per channel), scaled
   linearly with the 8-bit channel values; the firmware caps channels at 200/255 (blue 110/255) and scales
   whole frames to a 500 mA budget.
4. **Equation.** $I = \sum_i 20\ \text{mA}\times(r_i+g_i+b_i)/255$.
5. **Derivation.** Worst case uncapped: $23\times60$ mA. With caps: $23\times20\times(200+200+110)/255$ mA.
6. **Substitution.** $1.38$ A; $920$ mA, which the limiter scales to 500 mA.
7. **Result.** Peak estimated LED current in the host tests: 388 mA (Steady mode), 472 mA (Show mode). At
   the 500 mA budget the LEDs alone draw 0.42C from a 1200 mAh cell: about 2.4 h, or longer at typical
   patterns. (Illustrative; the board's own draw is not on the retailer page, so total runtime is not
   claimed.)
8. **Dimensions.** mA × dimensionless. ✓
9. **Meaning.** The budget keeps the discharge rate inside the guide's 1–2C limit and below the 0.5 A
   slide-switch rating, though the switch is wired to the enable pin anyway (tutorial 04).
10. **Limits.** The 60 mA figure is Adafruit's worst-case rule; actual draw varies by LED batch and voltage.

### A13. The flash limit

1. **Question.** Can the prop's animations exceed three flashes per second?
2. **Variables.** Modulation frequency $f$ [Hz]; relative luminance $Y \in [0,1]$.
3. **Model.** WCAG 2.2 SC 2.3.1: a flash is a pair of opposing changes in relative luminance of at least
   0.1 where the darker state is below 0.8; no more than three in any one-second window. Saturated red is
   counted separately.
4. **Equation.** A periodic modulation at $f$ produces at most $f$ opposing pairs per second.
5. **Derivation.** Each cycle contains one rise and one fall, which is one flash at most.
6. **Substitution.** Per-pixel caps of 1.5 Hz (Steady) and 2.5 Hz (Show).
7. **Result.** At most 1.5 and 2.5 flashes per second from modulation; the host tests count actual flashes,
   including state changes, over scripted and randomised sessions: worst pixel 2 (Steady) and 3 (Show)
   flashes in any second, ring average at most 1.
8. **Dimensions.** Counts per second. ✓
9. **Meaning.** The default mode stays below the threshold, with margin.
10. **Limits.** WCAG and ITU-R BT.1702 are screen standards; using them for a handheld light is a
    conservative heuristic, not a legal requirement.

---

## Part B. Computational models and how they were checked

### B.1 Inventory

| Module (`models/portalphys/`) | What it computes | Method | Independent check |
|---|---|---|---|
| `symbolic_gr.py` | Curvature and field equations of the MT metric; boosted frame; Schwarzschild and Ellis cases; thin-shell junction; Poisson–Visser stability | sympy, from the metric | Exact equality with MT88 eqs. 47a, 47b and their ρ, τ, p; Schwarzschild components (MTW 31.4); Visser 1989 shell stresses |
| `energy.py` | Tensions, exotic masses, Casimir gaps, quantum-inequality lengths | Closed forms; quadrature | Quadrature vs closed form; MT88, MTY88, Visser and Ford–Roman numbers |
| `tidal.py` | Tidal accelerations and speed limits | Closed forms | Hand-coded formula vs sympy boosted Riemann; Schwarzschild limit; MT appendix |
| `raytrace.py` | Light bending and rendered views of an Ellis mouth | Elliptic integrals, quadrature, ODE | Three routes agree; weak-field series to second order |
| `dynamics.py` | Thin-shell motion; loop collapse | `solve_ivp` | Linear stability sign vs non-linear evolution; Poisson–Visser thresholds; $\pi R/2c$ |
| `newtonian_portal.py` | Static gravity on the portal topology; dropped-ball motion | Finite volumes, sparse direct solve; velocity Verlet | Uniform field recovered without portals; grid and padding convergence (B.2) |
| `environment.py` | Air and water flow; blow-down; radiation | Isentropic orifice; Bernoulli | Analytic choked solution; Torricelli; branch continuity |
| `kinematics.py` | Portal transforms; relativistic and Galilean exit velocities; ledger | Linear algebra | Proper rigid motion; inverse; Galilean limit; four-momentum conservation |
| `timeshift.py` | Clock drift and time-machine times | Closed forms | Height independence of $c/g$; no drift means no time machine |

### B.2 The static floor/ceiling gravity model

Laplace's equation $\nabla^2\phi = 0$ is solved on an axisymmetric $(s, z)$ grid with cell-centred finite
volumes. The two discs lie on cell faces. The portal identification is imposed by rewiring the face
neighbours of the four rows of cells that touch the discs: the row above A connects to the row below B,
and the row below A to the row above B. Far boundaries carry $\phi = gz$. The linear system is solved
directly (`scipy.sparse.linalg.spsolve`). A dropped ball is integrated with velocity Verlet on a periodic
cubic spline of the axis potential, so force and potential are consistent and energy drift measures only
the integrator.

**Convergence** (`models/checks/grid_convergence.py`, output in `results/grid_convergence.log`;
$R$ = 1 m, $h$ = 4 m):

| Grid spacing | Mid-room field | 0.5 m above A | 0.5 m behind A | $\phi$ at A / B faces | Ball's top speed |
|---|---|---|---|---|---|
| 0.1 m | −0.415 g | +0.333 g | −2.159 g | 19.30 / 19.94 J/kg | 3.55 m/s |
| 0.05 m | −0.407 g | +0.328 g | −2.150 g | 19.47 / 19.77 J/kg | 3.51 m/s |
| 0.025 m | −0.403 g | +0.325 g | −2.145 g | 19.54 / 19.70 J/kg | 3.49 m/s |

Convergence is first order (each halving roughly halves the change), as expected with the singular rim;
Richardson extrapolation gives about −0.40 g at mid-room. The two face potentials converge towards each
other and towards $gh/2$ = 19.62 J/kg: the residual difference is the half-cell offset of the grid rows,
not physics. Changing the padding from 3 to 9 times the portal scale moves every value by under 0.2%.

### B.3 The test suites

| Suite | Command | Result on 2026-10-19 |
|---|---|---|
| Python models | `python -m pytest -q tests` (in `models/`) | 70 passed |
| Simulator unit tests | `npm test` (in `simulator/`) | 19 passed |
| Simulator end-to-end | `npm run test:browser` | 14 of 14 checks passed |
| Prop firmware host tests | `make` (in `prop/firmware/test/`) | 105 passed, 0 failed |
| Enclosure fit checks | `python -m pytest -q` (in `prop/enclosure/`) | 7 passed |
| Firmware compile for the real board | `arduino-cli compile` (tutorial 04) | 96,276 bytes flash (1%), 11,092 bytes RAM (4%), no warnings from the project's files |

The Python tests, grouped by what they establish:

- **Against published results:** MT88 field equations and tidal components (exact, symbolic); MT88's
  "5 × 10⁴¹ dyn/cm²"; MT88's appendix speed limit; MTY88's Casimir separation; Visser's cube-edge tension
  and bending-angle rule; Poisson–Visser thresholds $3/2+\sqrt3$ and $-1/2$; Ford–Roman's band and Ellis
  bounds; Nakajima–Asada's second-order deflection term.
- **Against closed forms:** Ellis mass (quadrature), deflection (quadrature and ODE), choked blow-down,
  half-pressure times, Torricelli, sonic exit speed, $\pi R/2c$, Galilean limit of the relativistic map.
- **Internal consistency:** a proper rigid transform and its inverse; mass-shell and ledger conservation;
  choked and subsonic branches meeting; flow monotonic in back pressure; the uniform field recovered
  without portals; a single-valued potential (no perpetual fall); height independence of $c/g$.

### B.4 What the verification pass found

These faults were found by re-deriving results independently while writing this appendix. All are fixed
and covered by tests.

1. **Half-pressure times were overestimated by 5–10%.** `time_to_pressure` returned the first solver
   sample below the target pressure; with coarse output steps that overshot the crossing (0.058 s instead
   of 0.053 s; 5.5 s instead of 5.3 s; 554 s instead of 526 s). It now locates the crossing with an event
   (root-finding on the dense output), and a new test compares all three cases with the exact inversion of
   the choked solution to one part in a million. The pressure *curves* in figure 11 were always correct.
2. **Grid dependence of the Newtonian model** had not been quantified; B.2 now does.
3. **Ray tracer warnings.** Regenerating figure 6 prints `scipy` integration warnings (round-off and
   subdivision limits) for rays very close to the photon sphere, where light circles the throat many times.
   They affect only pixels on the thin rim of the far-side disc. The disc's size, the quantity used in the
   report, comes from the closed form and is unaffected.
4. **An earlier sign error** in my reading of MT88's radial tidal component was caught before this pass by
   comparing with the scanned equation; the code now checks exact equality with the printed eq. 47a.

### B.5 Figures

| File | Content |
|---|---|
| `fig01_embedding.png` | Embedding diagrams: Ellis, Morris–Thorne, Schwarzschild |
| `fig02_tension.png` | Required throat tension vs radius, with reference pressures |
| `fig03_exotic_mass.png` | Negative mass-energy vs portal radius |
| `fig04_casimir_qi.png` | Casimir gap, quantum-inequality length and Ford–Roman band vs throat radius |
| `fig05_tidal.png` | Ellis tidal stretch and speed limit |
| `fig06_wormhole_views.png` | Ray-traced views toward an Ellis mouth from five distances |
| `fig07_deflection_check.png` | Light bending: quadrature vs closed form, with residuals |
| `fig08_thin_shell_stability.png` | Thin-shell stability region and non-linear check |
| `fig09_newtonian_portal.png` | Static gravity with a floor/ceiling pair; dropped-ball speed |
| `fig10_time_machine.png` | Clock drift and time-machine times for several mouth placements |
| `fig11_environment.png` | Blow-down of a 50 m³ room through portals of three sizes |
| `fig12_identification.png` | Flat-face identification and the rim's excess angle |

### B.6 Reproducing everything

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r research/portal-gun/requirements.txt
cd research/portal-gun/models
python -m pytest -q tests            # 70 tests
python run_all.py                    # figures/ and results/summary.json, ~100 s
python checks/grid_convergence.py    # B.2 table, ~15 s
```

The simulator, firmware and enclosure have their own instructions in tutorials 04 and 05.
