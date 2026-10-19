# 01 - Classical GR wormhole geometry and stability: primary-literature verification notes

Compiled 2026-10-19 for the report "Could a Rick-and-Morty portal gun exist?".
Scope: classical general-relativity wormhole geometry, energy conditions, traversability, stability.

**Ground rules used in these notes**

- ACCESS STATUS is stated per source: "full text read" (I read the paper itself, page images or
  text), "abstract only", or "bibliographic only / not accessed".
- Equations are my own LaTeX transcriptions. Equation numbers are the paper's own, given only
  where I saw them on the page. Conventions (units, signature) are stated per source.
- Direct quotes are marked as quotes and kept under 25 words.
- Numbers I re-derived myself (with CODATA-ish constants in a Python check) are labelled
  "my check", so they are not mistaken for the paper's statements.
- Section numbers follow the numbering of the brief (sources 4 and 5 come first because they matter
  most). Extra sources I judged important are at the end, followed by "Discrepancies and open questions".

## Access-status summary

| # | Source | Access | Route |
|---|---|---|---|
| 1 | Einstein & Rosen 1935, Phys. Rev. 48, 73 | abstract only | INSPIRE (APS 403) |
| 2 | Fuller & Wheeler 1962, Phys. Rev. 128, 919 | abstract only | INSPIRE (APS 403) |
| 3a | Ellis 1973, J. Math. Phys. 14, 104 | abstract only | AIP landing page |
| 3b | Bronnikov 1973, Acta Phys. Polon. B 4, 251 | bibliographic only / not accessed | INSPIRE; journal site down |
| 4 | Morris & Thorne 1988, Am. J. Phys. 56, 395 | **full text read** | Internet Archive scan (page images) |
| 5 | Morris, Thorne & Yurtsever 1988, PRL 61, 1446 | **full text read** | CaltechAUTHORS scan |
| 6 | Visser 1989, PRD 39, 3182 | **full text read** | arXiv:0809.0907 (author re-typeset) |
| 7 | Visser 1989, Nucl. Phys. B 328, 203 | **full text read** | arXiv:0809.0927 (author re-typeset) |
| 8 | Poisson & Visser 1995, PRD 52, 7318 | **full text read** | arXiv:gr-qc/9506083 |
| 9 | Visser 1995 book | bibliographic only | Open Library records |
| 10a | Hochberg & Visser 1997, PRD 56, 4745 | **full text read** | arXiv:gr-qc/9704082 |
| 10b | Hochberg & Visser 1998, PRL 81, 746 | **full text read** | arXiv:gr-qc/9802048 |
| 11 | Visser, Kar & Dadhich 2003, PRL 90, 201102 | **full text read** | arXiv:gr-qc/0301003 |
| 12 | Shinkai & Hayward 2002, PRD 66, 044005 | **full text read** (text; figures not inspected) | arXiv:gr-qc/0205041 |
| 13a | Gonzalez, Guzman & Sarbach 2009-I, CQG 26, 015010 | **full text read** (key sections) | arXiv:0806.0608 |
| 13b | Gonzalez, Guzman & Sarbach 2009-II, CQG 26, 015011 | abstract + introduction | arXiv:0806.1370 |
| 14 | James et al. 2015, Am. J. Phys. 83, 486 | **full text read** | arXiv:1502.03809 |
| 15a | Chetouani & Clement 1984, GRG 16, 111 | abstract only | INSPIRE |
| 15b | Perlick 2004, PRD 69, 064017 | **full text read** (Ellis section) | arXiv:gr-qc/0307072 |
| 15c | Nandi, Zhang & Zakharov 2006, PRD 74, 024020 | full text (Ellis section) | arXiv:gr-qc/0602062 |
| 15d | Nakajima & Asada 2012, PRD 85, 107501 | **full text read** | arXiv:1204.3710 |
| 16 | Teo 1998, PRD 58, 024014 | **full text read** (key sections) | arXiv:gr-qc/9803098 |
| 18a | Hayward & Koyama 2004, PRD 70, 101502 | **full text read** | arXiv:gr-qc/0406080 |
| 18b | Hayward 2009, PRD 79, 124001 | partially read | arXiv:0903.5438 |
| extra | Friedman-Schleich-Witt 1993; Geroch 1967; Tipler 1977; Armendariz-Picon 2002; Ford-Roman 1996; Fewster-Roman 2005; Lobo 2016 | abstract only | arXiv / INSPIRE |

All DOIs, volumes and pages above were cross-checked against Crossref (or INSPIRE where Crossref has
no record, i.e. Bronnikov); the book's ISBNs come from Open Library.

---

## 4. Morris & Thorne 1988 (AJP) - MOST IMPORTANT

**Citation.** Michael S. Morris and Kip S. Thorne, "Wormholes in spacetime and their use for
interstellar travel: A tool for teaching general relativity", *American Journal of Physics*
**56**(5), 395-412 (May 1988). Received 16 March 1987, accepted 17 July 1987.

- DOI: 10.1119/1.15620 - https://doi.org/10.1119/1.15620
  (publisher page: https://pubs.aip.org/ajp/article/56/5/395/1044276/ ; paywalled, OpenAlex lists it
  as closed access). No arXiv version (predates arXiv).
- **ACCESS STATUS: full text read.** The publisher PDF is paywalled. I read an Internet Archive
  copy of the 18-page scanned article (item `pdfy--5NLGQyfpB61dmyG`, a 2014 "PDFy mirror"
  upload titled with this DOI): https://archive.org/details/pdfy--5NLGQyfpB61dmyG .
  I rendered the page images and read every equation quoted below directly from the scans
  (the archive's OCR text was used only to navigate). Page footers read
  "Am. J. Phys., Vol. 56, No. 5, May 1988" and run 395-412, so it is the published version.
  Provenance caveat: this is a third-party upload, not the publisher's copy; for citation,
  cite the journal.

**Conventions.** The paper explicitly uses Price's / MTW conventions (signature -+++) **but with
cgs units, c and G NOT set to 1** (stated on p. 398). Stresses in dyn/cm^2, densities in g/cm^3.
Hatted indices = orthonormal frame of static observers.

### 4.1 Metric and definitions (Box 3 and Sec. III A, Eq. (1))

$$ds^2 = -e^{2\Phi(r)}c^2\,dt^2 + \frac{dr^2}{1-b(r)/r} + r^2\left(d\theta^2+\sin^2\theta\,d\phi^2\right) \qquad (1)$$

- $b(r)$ = "shape function"; $\Phi(r)$ = "redshift function" ($g_{tt}=-e^{2\Phi}$).
- $2\pi r$ = circumference; $r$ is non-monotonic, minimum $b_0$ at the throat, where $b(b_0)=b_0$
  (Eq. 31). Proper radial distance $l(r)=\pm\int_{b_0}^{r}dr/[1-b(r)/r]^{1/2}$ (Eq. 32) must be
  finite everywhere (Eq. 33), which implies $1-b/r\ge 0$ (Eq. 34).
- Asymptotic flatness: $b/r\to0$ and $\Phi\to0$ as $l\to\pm\infty$ (Eqs. 23, 35).
- No horizon: $\Phi(r)$ everywhere finite (Eq. 37). (Horizons are where $g_{00}=-e^{2\Phi}\to0$.)
- Embedding of the equatorial slice $t$=const, $\theta=\pi/2$ in flat 3-space with cylindrical
  $(z,r,\phi)$: $dz/dr=\pm(r/b-1)^{-1/2}$ (Eq. 27; inverted form Eq. 53: $dr/dz=\pm(r/b-1)^{1/2}$).
- Schwarzschild special case $b=B$=const, $\Phi=\tfrac12\ln(1-B/r)$: Flamm paraboloid
  $z=\pm2B(r/B-1)^{1/2}$ (Eq. 28); horizon sits exactly at the throat $r=B$.

### 4.2 Stress-energy and field equations (Eqs. 13, 14-19; Box 3)

Static-observer frame: $T_{\hat t\hat t}=\rho c^2$, $T_{\hat r\hat r}=-\tau$, $T_{\hat\theta\hat\theta}=T_{\hat\phi\hat\phi}=p$ (Eq. 13),
with $\rho$ the mass-energy density (g/cm^3), $\tau$ the radial **tension** per unit area
(= minus radial pressure, dyn/cm^2), $p$ the lateral pressure. Einstein equations
$G_{\hat\alpha\hat\beta}=8\pi G c^{-4}T_{\hat\alpha\hat\beta}$ give (Eqs. 17-19, also Box 3(6b);
prime = $d/dr = (1-b/r)^{-1/2}d/dl$):

$$\rho=\frac{b'}{8\pi G c^{-2} r^2},\qquad
\tau=\frac{b/r-2(r-b)\Phi'}{8\pi G c^{-4} r^2},\qquad
p=\frac{r}{2}\left[(\rho c^2-\tau)\Phi'-\tau'\right]-\tau .$$

(Eq. 16/19 is the hydrostatic-equilibrium equation; the paper calls the lateral term the
"Roman arch" pressure.) Exterior vacuum: Schwarzschild with $b=B$=const (Eqs. 21-22); with a
cut-off at $r=R_s$, $\tau$ must go continuously to 0 but $\rho$, $p$ may jump (Eq. 20).

Einstein-tensor components (Eq. 12, orthonormal frame): $G_{\hat t\hat t}=b'/r^2$,
$G_{\hat r\hat r}=-b/r^3+2(1-b/r)\Phi'/r$ (the $\hat\theta\hat\theta$ component is longer;
not transcribed).

### 4.3 Throat tension - VERIFIED exact form (Eq. 51)

At the throat $r=b=b_0$, using $(r-b)\Phi'\to0$:

$$\tau_0 \equiv (\text{tension in throat}) = \frac{1}{8\pi G c^{-4} b_0^{2}}
\sim 5\times10^{41}\,\frac{\text{dyn}}{\text{cm}^2}\left(\frac{10\ \text{m}}{b_0}\right)^{2}
\sim 5\times10^{11}\,\frac{\text{dyn}}{\text{cm}^2}\left(\frac{1\ \text{l.yr.}}{b_0}\right)^{2}\qquad(51)$$

- Box 3 states the same with "≃": $\tau=(8\pi G c^{-4}b_0^2)^{-1}\simeq5\times10^{41}$ dyn cm$^{-2}(10\,\text{m}/b_0)^2$.
- Text after Eq. 51: for $b_0\sim3$ km, $\tau_0\sim10^{37}$ dyn/cm^2, the same magnitude as the
  pressure at the centre of the most massive neutron stars. Even for $b_0=1$ light-year, a
  magnetic field would need $B\sim10^{6}$ Gauss to supply it.
- Abstract version: $\tau_0\sim$ (pressure at centre of most massive neutron stars) $\times$
  (20 km)$^2$/(circumference of throat)$^2$.
- My check: $c^4/(8\pi G)=4.82\times10^{47}$ dyn, so $\tau_0(b_0=10\,\text{m})=4.8\times10^{41}$
  dyn/cm^2; $\tau_0(1\,\text{ly})=5.4\times10^{11}$; $\tau_0(3\,\text{km})=5.4\times10^{36}$;
  $B=\sqrt{8\pi\tau_0(1\,\text{ly})}=3.7\times10^6$ G. All consistent with the paper.
  (Your recollection "τ0 ~ 5×10^41 dyn/cm^2 (10 m/b0)^2" is exactly right. Note: one
  web-search summary I saw claimed the arithmetic gives 4.8×10^40; that is wrong - the paper's
  10^41 is correct.)

### 4.4 Exotic matter, flare-out (Eqs. 52-58)

- Exoticity function (Eq. 52):
  $$\zeta\equiv\frac{\tau-\rho c^2}{|\rho c^2|}=\frac{b/r-b'-2(r-b)\Phi'}{|b'|}.$$
- Flare-out, first version (Eq. 54): $\dfrac{d^2r}{dz^2}=\dfrac{b-b'r}{2b^2}>0$ at or near the throat.
- Rewritten (Eq. 55): $\zeta=\dfrac{2b^2}{r|b'|}\dfrac{d^2r}{dz^2}-2(r-b)\dfrac{\Phi'}{|b'|}$; hence
  flare-out at the throat is equivalent to (Eq. 56)
  $$\zeta_0=\frac{\tau_0-\rho_0c^2}{|\rho_0c^2|}>0 .$$
- **Definition of "exotic" (Sec. III F 2):** material with $\tau>\rho c^2>0$ is called "exotic".
  Quote: "We shall call material with this property, τ>ρc²>0, 'exotic.'" (Note: the paper's
  definition literally includes $\rho c^2>0$; materials with $\rho<0$ are a further step.)
- Boosted observer (Eq. 57): an observer crossing the throat radially at speed $v$ measures
  $T_{\hat0'\hat0'}=\gamma^2(\rho_0c^2-\tau_0)+\tau_0$, which is negative for large enough $\gamma$
  when $\tau_0>\rho_0c^2$. Box 3(6c): this means violation of the weak, strong and dominant
  energy conditions in the throat.
- Optional constraint $\rho c^2\ge0$ everywhere (Eq. 58), which implies $b'\ge0$ (Box 3(6d)).
- **"Note added in proof" (Don Page):** the requirement of exotic matter is not special to the
  static spherical case - it holds for any traversable non-spherical, non-static wormhole,
  because light-ray bundles through the wormhole must first converge then diverge; rigorously,
  a sphere around one mouth is an "outer trapped surface" seen from the other side, which by
  Hawking & Ellis Prop. 9.2.8 requires WEC violation.
- They note a radial electric/magnetic field ($\tau=p=\rho c^2=E^2/8\pi$) is "right on the
  borderline" of exotic.
- Sec. III F 2 lists QFT hints: Hawking-evaporation near-horizon negative energy, squeezed
  vacuum states (negative energy density oscillating in time), Zel'dovich 1961 stiff matter as a
  historical precedent for overturned prejudices. The authors know of no proof that exotic matter
  is forbidden and "would not be extremely surprised" (short quote) if a quantum-field-theoretic
  example were found in the near future.
- Ways to minimise exotic material (Sec. III F 3): (a) exotic everywhere but falling off fast;
  (b) exotic only, cut off at $R_s$; (c) exotic confined to a small region $|l|<l_c$, normal matter
  outside. NB: in Sec. III F 3 the paper re-defines the exoticity WITHOUT the absolute value,
  $\zeta(r)=(\tau-\rho c^2)/\rho c^2$, whereas Eq. (52) has $|\rho c^2|$. The two agree only for $\rho>0$.
  (This matters for the Casimir "note added in proof" below, which says $\zeta<0$.)
- Coupling to the traveler (Sec. III F 4): material with $\tau_0\sim5\times10^{41}$ dyn/cm$^2(10\,\text{m}/b_0)^2$
  could be "extremely uncomfortable"; remedies: (a) a vacuum tube of diameter $\ll b_0$ threaded
  through the wormhole, its walls holding the exotic matter out (they say this seems to be Sagan's
  method; needs non-spherical solutions to check), or (b) exotic material that couples only weakly
  to ordinary matter (like neutrinos).

### 4.5 Traversal: acceleration and TIDAL constraints (Sec. III E, Eqs. 38-50; Box 3(5b))

Set-up: traveler moves radially from a station at $l=-l_1$ to one at $l=+l_2$, speed $v(r)$
measured by static observers, $\gamma=[1-(v/c)^2]^{-1/2}$. Stations must be in weak gravity
(Eq. 40): $b/r\ll1$, $|\Phi|\ll1$, $|\Phi'c^2|\lesssim g_\oplus$ with $g_\oplus=980$ cm/s$^2$.

Usability demands (Sec. III E): (i) trip $\lesssim1$ yr for traveler and station clocks (Eqs. 41a,b):
$\Delta\tau=\int_{-l_1}^{+l_2}dl/(v\gamma)\lesssim1$ yr, $\Delta t=\int_{-l_1}^{+l_2}dl/(v e^{\Phi})\lesssim1$ yr;
(ii) felt acceleration not much above 1 Earth gravity; (iii) tidal accelerations between parts of
the body $\le$ 1 Earth gravity.

- Traveler's frame = Lorentz boost of static frame (Eq. 42):
  $e_{\hat0'}=\gamma e_{\hat t}\mp\gamma(v/c)e_{\hat r}$, $e_{\hat1'}=\mp\gamma e_{\hat r}+\gamma(v/c)e_{\hat t}$,
  $e_{\hat2'}=e_{\hat\theta}$, $e_{\hat3'}=e_{\hat\phi}$.
- Felt acceleration (Eq. 43): $a=\mp(1-b/r)^{1/2}e^{-\Phi}(\gamma e^{\Phi})'c^2=e^{-\Phi}\frac{d}{dl}(\gamma e^{\Phi})c^2$.
- **Acceleration constraint (Eq. 44):**
  $$\left|e^{-\Phi}\frac{d(\gamma e^{\Phi})}{dl}\right|\lesssim\frac{g_\oplus}{c^2}\simeq\frac{1}{0.97\ \text{l.yr.}}$$
- Tidal acceleration (Eqs. 45-46): $\Delta a^{\hat j'}=-c^2R^{\hat j'}{}_{\hat0'\hat k'\hat0'}\xi^{\hat k'}$, $\xi$ = separation
  between body parts.
- Riemann components in traveler frame (Eqs. 47a,b):
  $$R_{\hat1'\hat0'\hat1'\hat0'}=R_{\hat r\hat t\hat r\hat t}=-\left(1-\frac{b}{r}\right)\left[-\Phi''+\frac{b'r-b}{2r(r-b)}\Phi'-(\Phi')^2\right]$$
  $$R_{\hat2'\hat0'\hat2'\hat0'}=R_{\hat3'\hat0'\hat3'\hat0'}=\gamma^2R_{\hat\theta\hat t\hat\theta\hat t}+\gamma^2\left(\frac{v}{c}\right)^2R_{\hat\theta\hat r\hat\theta\hat r}
  =\frac{\gamma^2}{2r^2}\left[\left(\frac{v}{c}\right)^2\left(b'-\frac{b}{r}\right)+2(r-b)\Phi'\right]$$
- **Body size and limit:** "for $|\xi|\sim2$ m (the size of the traveler's body)" and any orientation,
  $|\Delta a|\lesssim g_\oplus$ (1 Earth gravity). Hence:
  - **Radial tidal constraint (Eq. 49):**
  $$\left|\left(1-\frac{b}{r}\right)\left[-\Phi''+\frac{b'r-b}{2r(r-b)}\Phi'-(\Phi')^2\right]\right|\lesssim\frac{g_\oplus}{c^2\times2\,\text{m}}\simeq\frac{1}{(10^{10}\ \text{cm})^2}$$
  - **Lateral tidal constraint (Eq. 50):**
  $$\left|\frac{\gamma^2}{2r^2}\left[\left(\frac{v}{c}\right)^2\left(b'-\frac{b}{r}\right)+2(r-b)\Phi'\right]\right|\lesssim\frac{g_\oplus}{c^2\times2\,\text{m}}\simeq\frac{1}{(10^{10}\ \text{cm})^2}$$
  - The radial constraint is read as constraining $\Phi$ (simplest: $\Phi'=0$); the lateral one as
    constraining the crossing speed $v$.
  - My check: $g_\oplus/(c^2\cdot2\,\text{m})=5.5\times10^{-21}$ cm$^{-2}$ = 1/(1.35×10^10 cm)^2, which the
    paper rounds to 1/(10^10 cm)^2 = 1/(10^8 m)^2 (the Appendix writes the RHS as 1/(10^8 m)^2).
- Box 3 additionally requires that the traveler not couple strongly to the wormhole material
  (vacuum tube through the material, or weakly coupling material).

### 4.6 Worked traversal examples (Appendix) - all verified on the page scans

**A.1 Zero-tidal-force solutions** ($\Phi=0$): $\rho=b'/(8\pi Gc^{-2}r^2)$, $\tau=b/(8\pi Gc^{-4}r^3)$,
$p=(b-b'r)/(16\pi Gc^{-4}r^3)$ (Eqs. A1b-d). Unpowered ship moves at constant $v=dl/dt$ (A2).
Example $b(r)=(b_0r)^{1/2}$ (A3), equation of state $\tau/2=2p=\rho c^2$, $\rho>0$ everywhere (A4);
stations at $r_1=r_2=10^4b_0$ ($l_1=l_2\simeq10^4b_0$), where $1-b/r$ differs from 1 by 1%.
Lateral tidal constraint (A8) is worst at the throat:
$$\gamma v/c\lesssim2\times10^{-7}(b_0/10\,\text{m})\ \ (\text{A9}),\qquad v\lesssim60\ \text{m/s}\,(b_0/10\,\text{m})\ \ (\text{A10})$$
$$\Delta\tau_T\simeq\Delta t\simeq\int_{-l_1}^{l_2}\frac{dl}{v}\simeq2\times10^4\frac{b_0}{v}\simeq3\times10^3\ \text{s}\,(v/60\ \text{m/s})^{-1}\ \ (\text{A11})$$
Quote: the trip "can be made a comfortable hour with maximum tidal force of 1 Earth gravity at the
midpoint of the journey" (20 words).
My check: $2\times10^4\times10\,\text{m}/(60\,\text{m/s})=3.3\times10^3$ s. Note that with $v$ at
its tidal limit, $\Delta t$ is ~1 hour independent of $b_0$.

**A.2 Finite radial cut-off** ($b=b_0(r/b_0)^{1-\eta}$, $\Phi=\Phi_0$, $\eta=1/2$; exoticity
$\zeta=\eta/(1-\eta)$ constant (A14); thin transition layer to exterior Schwarzschild of mass
parameter $B$). Requiring $\lesssim g_\oplus$ on the stations just outside the layer:
$|\Phi'(R_s+\Delta R)|=B/2R_s^2\lesssim(9.2\times10^{15}\ \text{m})^{-1}$ (A17), giving
$R_s\gtrsim1\times10^{11}\ \text{m}\,(b_0/10\,\text{m})^{1/3}\simeq0.6$ AU$\,(b_0/10\,\text{m})^{1/3}$ (A18) and
$B\simeq1.9\times10^{6}$ m$\,(b_0/10\,\text{m})^{2/3}$ (A19). Travel: still $v\lesssim60$ m/s
$(b_0/10\,\text{m})$ at the throat; accelerate/decelerate at $g_\oplus$ (A24):
$v_{\max}=(\tfrac12g_\oplus R_s)^{1/2}=7\times10^{5}$ m/s$\,(R_s/10^{11}\,\text{m})^{1/2}$ (A25), valid
($\gamma\simeq1$) for $R_s\ll10^{16}$ m (A26); total trip
$$\Delta\tau_T=\Delta t=(32R_s/g_\oplus)^{1/2}\simeq(7\ \text{days})(R_s/10^{11}\ \text{m})^{1/2}\qquad(\text{A27})$$
My check: 6.6 days for $R_s=10^{11}$ m; $v_{\max}=7.0\times10^5$ m/s; $R_s$ bound 0.63 AU, $B=1.9\times10^6$ m.

**A.3 Exotic matter confined to throat vicinity.** If $\rho<0$ (as seen by static observers) is
allowed: $b(r)=b_0[1-(r-b_0)/a_0]^2$, $\Phi=0$ for $b_0\le r\le b_0+a_0$; flat outside (A28a,b);
$\rho=[(-b_0/a_0)/(4\pi Gc^{-2}r^2)][1-(r-b_0)/a_0]<0$ (A28c). Tidal constraint
$(v/c)^2\lesssim a_0b_0/(10^8\,\text{m})^2$ (A30); traversal time
$\Delta\tau_T\simeq\Delta t\simeq\pi a/v\gtrsim1\ \text{s}\,\sqrt{a_0/b_0}$ (A31). Exotic matter in a shell
of thickness $\Delta l=\pi a_0$, volume $4\pi^2b_0^2a_0$ - an "absurdly benign wormhole" (their phrase).
But if $\rho c^2\ge0$ is imposed, exotic matter cannot be confined to a region small compared
with $b_0$ (shown via Eqs. A32-A33: need $\Delta r\gtrsim b_0$). Their $\rho\ge0$ example
(A36a-c): exotic core out to $r_c=10^4b_0$, then $b=r/100$ with $\tau=\rho c^2$, surface
radius $R_s\gtrsim9.2\times10^{13}$ m $\sim600$ AU independent of $b_0$ (A35), $B=R_s/50$,
$\Phi_0\simeq-0.01$; trip "about 200 days" with the same $g_\oplus$ accelerate/decelerate scheme.
My check: $c^2/(100g_\oplus)=9.2\times10^{13}$ m = 613 AU; $(32R_s/g_\oplus)^{1/2}=200$ days.

### 4.7 Box 2 - the simplest example is the Ellis/Bronnikov metric (not attributed)

Box 2 (an exam problem from Thorne's autumn-1985 Caltech course):
$$ds^2=-c^2dt^2+dl^2+(b_0^2+l^2)(d\theta^2+\sin^2\theta\,d\phi^2)\qquad(\text{B2a})$$
i.e. $\Phi=0$, $b=b_0^2/r$, $l=\pm(r^2-b_0^2)^{1/2}$. Embedding $z(r)=\pm b_0\ln[r/b_0+\sqrt{(r/b_0)^2-1}]$ (a catenoid).
Riemann (static frame): $R_{\hat\theta\hat\phi\hat\theta\hat\phi}=-R_{\hat l\hat\theta\hat l\hat\theta}=-R_{\hat l\hat\phi\hat l\hat\phi}=b_0^2/(b_0^2+l^2)^2$.
Stress-energy: $-T^{\hat t\hat t}=-T^{\hat l\hat l}=T^{\hat\theta\hat\theta}=T^{\hat\phi\hat\phi}=(c^4/8\pi G)\,b_0^2/(b_0^2+l^2)^2$,
i.e. **negative energy density**, tension = lateral pressure = |energy density| ("the energy density is
negative"; they add that negative density is *not* generic for traversable wormholes).
A radial free-faller moves at constant $v=dl/dt$; tidal components
$R_{\hat2'\hat0'\hat2'\hat0'}=R_{\hat3'\hat0'\hat3'\hat0'}=-(v/c)^2\gamma^2b_0^2/(b_0^2+l^2)^2$, vanishing as $v\to0$.
Caveat: MT say "we know of no previous studies" of these solutions (p. 398). In fact this exact
metric is the massless Ellis (1973) / Bronnikov (1973) wormhole - see Source 3.

### 4.8 Other relevant content

- **Sec. I B "Schwarzschild wormholes: not traversible"**: (1) tidal forces at the throat equal
  those at a BH horizon - lethal unless $M\gtrsim10^4M_\odot$ (throat circumference
  $\gtrsim10^5$ km); (2) the Schwarzschild wormhole is dynamic, expanding from zero to a maximum
  circumference and recontracting "so rapid that even moving at the speed of light one cannot
  pass all the way through" (refs: Kruskal 1960; Fuller & Wheeler 1962; MTW ch. 31; Wheeler
  1962); (3) its past horizon (antihorizon) is unstable (Eardley 1974; Redmount 1985).
  Black-hole tidal estimate (p. 395): $\sim L(2GM/c^3)^{-2}\sim(10\,g_\oplus)(L/1\,\text{m})(M/10^4M_\odot)^{-2}$
  (my check: 10.5 $g_\oplus$).
- **Desired properties (Sec. II)**: 1-4 "basic wormhole criteria" (static spherical; Einstein eqs;
  throat joining two asymptotically flat regions; no horizon); 5-6 "usability criteria"
  (bearable tides; trip $\lesssim$ 1 yr); 7 reasonable stress-energy; 8 stability; 9 assembly.
- **Stability (Sec. III G)**: "impossible to say anything concrete" without a theory of the exotic
  matter; an advanced civilization might use feedback to suppress instabilities; a wormhole is
  a timelike entity, unlike a white-hole antihorizon or Kerr Cauchy horizon (lightlike), which may
  make it easier to stabilize. (Paraphrase.) No stability analysis is done.
- **Creation / assembly (Sec. III H) - quantum foam:** topology change in classical GR probably
  entails singularities (Geroch 1967; Tipler 1977); but on the Planck-Wheeler length
  $l_{PW}=(G\hbar/c^3)^{1/2}=1.6\times10^{-33}$ cm spacetime is expected to be foamlike and multiply
  connected (Wheeler 1957). Quote: "One could imagine an exceedingly advanced civilization pulling a
  wormhole out of this submicroscopic, quantum mechanical, spacetime foam" - then enlarging it.
  They stress "imagine": far beyond current theory; needs quantum gravity.
- **Time travel (Sec. III I)**: two wormholes with relative motion -> backward time travel;
  "Note added in proof": a single wormhole suffices (-> MTY 1988).
- **Conclusion (Sec. IV)**: construction relies on future discovery of exotic fields/states with
  tension exceeding energy density on macroscopic scales; topology change may be forbidden;
  wormholes "might be unstable and even unstabilizable" (quote, 7 words).
- **Casimir effect: NOT in this paper's main text.** The only mention is a "Note added in proof"
  at the end of the Appendix pointing to "Ref. 41" (= "M. S. Morris and K. S. Thorne, Phys. Rev.
  Lett., submitted", which became Morris, Thorne & Yurtsever 1988) for "yet another solution with
  exotic matter confined to the immediate vicinity of the throat - one whose exoticity ζ<0
  is produced by the Casimir effect" (as printed; consistent with the no-absolute-value
  definition of ζ in Sec. III F 3 when ρ<0, but not with Eq. 52). The Casimir plate-separation
  estimate is in MTY (Source 5), not here.

**Caveats.** Static, spherically symmetric analysis only; stability explicitly not addressed;
numerical "comfort" limits ($g_\oplus$, 2 m, 1 yr) are the authors' choices; the whole construction
assumes exotic matter exists and couples weakly to the traveler.

---

## 5. Morris, Thorne & Yurtsever 1988 (PRL)

**Citation.** Michael S. Morris, Kip S. Thorne, Ulvi Yurtsever, "Wormholes, Time Machines, and the
Weak Energy Condition", *Physical Review Letters* **61**(13), 1446-1449 (26 September 1988);
received 21 June 1988.

- DOI: 10.1103/PhysRevLett.61.1446 - https://doi.org/10.1103/PhysRevLett.61.1446
- Caltech repository copy: https://authors.library.caltech.edu/records/m644f-tbz27 (file MORprl88.pdf)
- **ACCESS STATUS: full text read** (scanned PDF from CaltechAUTHORS; all 4 pages read as images).

**Conventions.** "Our conventions are those of Ref. 2" (MTW); geometrized units $G=c=1$ with
$\hbar$ kept explicit (so $\sqrt\hbar$ = Planck length); signature -+++.

**Claims relevant here.**
- Schwarzschild wormhole: "its throat pinches off so quickly that it cannot be traversed in even
  one direction" (quote) - citing MTW and Kruskal 1960 (refs 2, 3). Horizon also prevents two-way travel.
- **Creation:** creating a wormhole with mild curvature (classical GR valid everywhere) must be
  accompanied by closed timelike curves and/or a non-continuous choice of future light cone
  (Geroch 1967), plus WEC violation (Tipler 1976/77). Alternatively, quantum gravity: "One can
  imagine an advanced civilization pulling a wormhole out of the quantum foam and enlarging it to
  classical size" (quote, 20 words); Planck-Wheeler length $(G\hbar/c^3)^{1/2}=1.3\times10^{-33}$ cm
  as printed (note: the AJP paper prints 1.6×10^-33 cm; the standard value is 1.6×10^-33 cm).
- **Maintenance -> AWEC violation:** a two-sphere around one mouth, seen through the wormhole from
  the other mouth, is an outer trapped surface; with no event horizon, this implies (Hawking-Ellis
  Prop. 9.2.8 adapted, via Deutsch & Candelas) that the **averaged** weak energy condition is
  violated: there are null geodesics through the wormhole with
  $\int_0^\infty T_{\alpha\beta}k^\alpha k^\beta\,d\zeta<0$, $k^\alpha=dx^\alpha/d\zeta$.
- Static spherical metric used: $ds^2=-e^{2\Phi}dt^2+dl^2+r^2(d\theta^2+\sin^2\theta\,d\phi^2)$; far from
  the throat $r\simeq|l|-M\ln(|l|/r_0)$, $\Phi\simeq-2M/|l|$ ($M$ = wormhole mass) [as printed].
  AWEC violation on radial null geodesics: $\int_{l_1}^{\infty}(\tau-\rho)e^{-\Phi}dl>0$ for any $l_1<0$,
  with $\rho=e^{2\Phi}T^{tt}$, $\tau=-T^{ll}$, affine parameter $\zeta=\int e^{\Phi}dl$.
- **Casimir model (the numbers you remembered come from HERE, not from MT-AJP):** two identical
  perfectly conducting spherical plates at $l=\pm s/2$ with equal charges $Q$, $s\ll r_0$. Between the
  plates (Casimir vacuum):
  $$\tau=3p=-3\rho=\frac{3\pi^2}{720}\frac{\hbar}{s^4}\equiv\tau_C .$$
  Outside: radial Coulomb field $\tau=\rho=p=Q^2/8\pi r^4$ (Reissner-Nordstrom). Force balance
  needs $Q=(8\pi r_0^4\tau_C)^{1/2}$. Field equations satisfied if (i) $\tau_C=(8\pi r_0^2)^{-1}$, so
  $$s=\left(\frac{\pi^3}{30}\right)^{1/4}\left(r_0\sqrt\hbar\right)^{1/2}\quad[s\sim10^{-10}\ \text{cm for } r_0=\text{(distance from Sun to Earth)}];$$
  (ii) charge $Q$ and mass $M$ both $\simeq r_0$; (iii) plate energy per unit area $\sigma$ satisfies
  $2\sigma<\tfrac43\tau_Cs$ (more precisely $\tfrac43\tau_Cs-2\sigma>O(\tau_Cs^2/r_0)$) to violate AWEC.
  Total energy of plates + Casimir field $2\sigma+\rho s=2\sigma-\tfrac13\tau_Cs\ge0$ is compatible.
  But if plates' mass-to-charge ratio must exceed the electron's, $2\sigma<\tfrac43\tau_Cs$ requires
  $$s<\left[(\pi^3/270)e^2/\hbar\right]^{1/2}\hbar/m=0.029\,\hbar/m ,$$
  i.e. plate separation below the electron Compton wavelength - "which might well be forbidden".
  My check: $(\pi^3/30)^{1/4}(1\,\text{AU}\times l_P)^{1/2}=1.6\times10^{-10}$ cm; $\sqrt{(\pi^3/270)\alpha}=0.0289$.
  So: **$s\sim10^{-10}$ cm for $r_0$ = 1 AU is confirmed**, with $r_0$ the throat radius.
- **Time machine:** keep left mouth at rest, accelerate the right mouth to near light speed and
  back; right mouth ages less; at late times traversing right-to-left goes backward in time. Metric
  near accelerating mouths $ds^2=-(1+glF\cos\theta)^2e^{2\Phi}dt^2+dl^2+r^2d\Omega^2$; Cauchy horizon
  discussed; they argue a Misner-space-type instability is defocused by the wormhole acting as a
  diverging lens with focal length $f\simeq r_0/2$.

**Caveats.** Casimir plates idealised (perfect conductors; renormalised stresses assumed as in
flat space, corrections $\lesssim s/r_0$); whether $\sigma<\tfrac43\tau_Cs$ is allowed was "not
attempted". Footnote 13 notes plate curvature corrections diverge at the plates unless given a
finite skin depth.

---

## 1. Einstein & Rosen 1935

**Citation.** A. Einstein and N. Rosen, "The Particle Problem in the General Theory of Relativity",
*Physical Review* **48**(1), 73-77 (1 July 1935).

- DOI: 10.1103/PhysRev.48.73 - https://doi.org/10.1103/PhysRev.48.73 ; INSPIRE record (full abstract):
  https://inspirehep.net/api/literature?q=t%20%22particle%20problem%20in%20the%20general%20theory%20of%20relativity%22
- **ACCESS STATUS: abstract only.** APS returned HTTP 403; no legitimate free full text found
  (archive.org has no copy). Abstract read via the INSPIRE API (it reproduces the APS abstract).

**Claims (from the abstract).** Goal: an atomistic theory of matter and electricity without field
singularities, using only $g_{\mu\nu}$ and the Maxwell $\phi_\mu$. They "modify slightly the gravitational
equations", which then admit regular static spherically symmetric solutions in which physical space is
two identical sheets and "a particle being represented by a 'bridge' connecting these sheets" (quote,
abstract). Claims: explains why no neutral negative-mass particles exist; most natural elementary
charged particle has zero mass; many-particle (many-bridge) problem "not yet been treated".

**Equations.** Not seen in the primary text. Secondary source (G. Weinstein, "Unveiling the Connection:
ER Bridges and EPR in Einstein's Research", arXiv:2307.05548, full text read) states that ER used the
substitution $u^2=r-2m$. My own algebra (G=c=1, signature -+++; ER themselves used the opposite
signature): with $r=u^2+2m$ the Schwarzschild metric becomes
$$ds^2=-\frac{u^2}{u^2+2m}dt^2+4(u^2+2m)\,du^2+(u^2+2m)^2d\Omega^2 ,\qquad -\infty<u<\infty,$$
i.e. two copies ($u>0$, $u<0$) of the exterior joined at $u=0$ ($r=2m$), where $g_{tt}\to0$.
**This form is my derivation, not a transcription from ER.**

**Caveats.** ER intended a particle model, not a travel route. The ER bridge is the (non-traversable)
Schwarzschild wormhole: MT 1988 (Sec. I B) credits Flamm (Physik. Z. 17, 448, 1916) with first
recognising the wormhole character of Schwarzschild and lists Einstein-Rosen 1935 among early
speculations; see Fuller & Wheeler for non-traversability.

---

## 2. Fuller & Wheeler 1962

**Citation.** Robert W. Fuller and John A. Wheeler, "Causality and Multiply Connected Space-Time",
*Physical Review* **128**(2), 919-929 (15 October 1962).

- DOI: 10.1103/PhysRev.128.919 - https://doi.org/10.1103/PhysRev.128.919
- **ACCESS STATUS: abstract only** (APS 403; full abstract read via INSPIRE API).

**Claims (from the abstract).**
- Question posed: can a signal through a wormhole "handle" outpace a light signal going the long way?
  In their (Schwarzschild) example causality is preserved.
- Key mechanism, quote: "The (Schwarzschild) throat of the wormhole pinches off in a finite time and
  traps the signal in a region of infinite curvature." (22 words)
- They define "catastrophic" points (every timelike geodesic through them hits infinite curvature in
  the future and/or past); two non-catastrophic regions exist and no signal can pass between them.
- Radial spacelike geodesics through the throat computed; some regions are unreachable by radial
  geodesics from a given point.

**Corroboration in full-text sources.** MT 1988 Sec. I B (2): the Schwarzschild wormhole expands from
zero throat circumference to a maximum and recontracts "so rapid that even moving at the speed of
light one cannot pass all the way through" (cites Kruskal 1960 [misprinted there as Phys. Rev. 116, 1743; correct: 119, 1743],
Fuller & Wheeler 1962, MTW ch. 31). MTY 1988: the throat "pinches off so quickly that it cannot be
traversed in even one direction" (cites MTW and Kruskal). Your paraphrase ("pinches off before light
can cross") is consistent.

**Caveat.** I did not see the paper's equations (e.g. the maximal throat size or pinch-off time).

---

## 3. Ellis 1973 and Bronnikov 1973 - the Ellis-Bronnikov wormhole

**Ellis citation.** Homer G. Ellis, "Ether flow through a drainhole: A particle model in general
relativity", *Journal of Mathematical Physics* **14**(1), 104-118 (January 1973); received
2 December 1969 (per the AIP landing page). Erratum: J. Math. Phys. **15**(4), 520 (1974) (listed on the
AIP page; also cited by Nandi et al. 2006 as "15, 520(E) (1974)").
- DOI: 10.1063/1.1666161 - https://doi.org/10.1063/1.1666161 (verified via Crossref and INSPIRE).
- **ACCESS STATUS: abstract only** (AIP page; full text paywalled; verbatim abstract read via the
  INSPIRE and Crossref APIs).

**Bronnikov citation.** K. A. Bronnikov, "Scalar-tensor theory and scalar charge", *Acta Physica
Polonica B* **4**, 251-266 (1973). No DOI.
- **ACCESS STATUS: bibliographic only / not accessed.** Title and pages confirmed via INSPIRE and via
  the reference list of Gonzalez-Guzman-Sarbach 2009. The journal archive (actaphys.uj.edu.pl) was
  unreachable (expired TLS certificate; WebFetch got HTTP 503). I did not bypass TLS.

**Claims (Ellis abstract, read verbatim).** The Schwarzschild manifold is unsatisfactory as a particle
model (singularity => geodesically incomplete). Coupling geometry to a scalar field gives a "static,
spherically symmetric, geodesically complete, horizonless space-time manifold with a topological
hole, termed a drainhole" (quote). Field equations $R_{\mu\nu}=2\phi_{,\mu}\phi_{,\nu}$ with polarity "reversed from the
usual" (i.e. a ghost/phantom scalar in modern terms), $\Box\phi=0$; finite scalar-field energy comparable
(as a length) to the drainhole radius. One side asymptotes to Schwarzschild with mass $m>0$, the
other to Schwarzschild with negative mass $\bar m$, with $-\bar m>m$ (repels more strongly than it attracts).
For $m$ = one proton mass, $-\bar m/m\approx1+10^{-19}$ or $1+10^{-39}$ for drainhole radius ~$10^{-33}$ or
~$10^{-13}$ cm. When the "ether" is at rest the particle is massless on both sides, but "the drainhole
remains open" and can trap test particles (quote fragment). Note: Ellis's units (lengths for
masses) are not stated in the abstract.

**Metric (verified from later full-text sources, not from Ellis/Bronnikov directly).**
- Massless case (G=c=1): $ds^2=-dt^2+dl^2+(l^2+a^2)(d\theta^2+\sin^2\theta\,d\phi^2)$, i.e.
  $r(l)^2=l^2+a^2$ with throat radius $a$ (= your $b_0$). Same as MT Box 2 (with $c$), James et al.
  2015 Eqs. (1)-(2), Nakajima & Asada 2012 Eq. (1), Shinkai & Hayward 2002 Eq. (2.25).
- Source: massless ghost scalar, $\phi=\tan^{-1}(l/a)$ (Shinkai-Hayward normalisation, Eq. 2.27),
  energy density $T_{tt}=-a^2/[8\pi(a^2+l^2)^2]$ (G=1; Shinkai-Hayward Eq. 2.33), consistent with MT Box 2.
- General two-parameter family (Gonzalez, Guzman & Sarbach 2009-I, Eq. 13; obtained "in [14,15]" =
  Ellis 1973 and Bronnikov 1973):
  $$ds^2=-e^{2\gamma_1\arctan(x/b)+2\gamma_0}dt^2+e^{-2\gamma_1\arctan(x/b)-2\gamma_0}\left[dx^2+(x^2+b^2)d\Omega^2\right],$$
  ghost field $\Phi=\Phi_1\arctan(x/b)+\Phi_0$ with $-\kappa\Phi_1^2=2(1+\gamma_1^2)$, $\kappa=-8\pi G$.
  ADM masses $m_{+\infty}=B\gamma_1e^{-\gamma_1\pi/2}$, $m_{-\infty}=-B\gamma_1e^{\gamma_1\pi/2}$ (opposite signs
  unless $\gamma_1=0$), throat areal radius $r_{\rm throat}=B\sqrt{1+\gamma_1^2}\,e^{-\gamma_1\arctan\gamma_1}$,
  $B=be^{-\gamma_0}$. This matches Ellis's "positive mass one side, negative the other".

**Caveat.** I could not read either original paper; the attribution of the explicit formulas to
Ellis/Bronnikov rests on later authors.

---

## 6. Visser 1989 (PRD) - polyhedral / "flat-face" wormholes

**Citation.** Matt Visser, "Traversable wormholes: Some simple examples", *Physical Review D*
**39**(10), 3182-3184 (15 May 1989).
- DOI: 10.1103/PhysRevD.39.3182 ; arXiv:0809.0907 (pre-arXiv article uploaded by the author in 2008,
  re-typeset in LaTeX): https://arxiv.org/abs/0809.0907
- **ACCESS STATUS: full text read** (arXiv re-typeset version; equation numbers below are those of
  the reprint; I did not see the journal-typeset pages).

**Conventions.** "Factors of c have been suppressed"; G explicit. Ultrastatic geometry
("g00 ≡ 1" as written, i.e. no redshift function). Thin-shell (junction-condition) formalism (MTW §21.13).

**Construction.** Take two copies of Minkowski space, remove identical regions $\Omega\times\mathbb R$
($\Omega$ a compact 3-region, $\mathbb R$ the time axis), identify the boundaries $\partial\Omega\times\mathbb R$.
Riemann-flat everywhere except the throat $\partial\Omega$, where stress-energy is a delta function.

**Equations.** $K^i{}_j={\rm diag}(0,1/\rho_1,1/\rho_2)$ (2.1), $\rho_{1,2}$ = principal radii of curvature of $\partial\Omega$;
$$S^i{}_j=-\frac{1}{4\pi G}\left(K^i{}_j-\delta^i{}_jK^k{}_k\right)\ (2.2),\quad S^i{}_j={\rm diag}(-\sigma,-\vartheta_1,-\vartheta_2)\ (2.3),$$
$$\sigma=-\frac{1}{4\pi G}\left(\frac1{\rho_1}+\frac1{\rho_2}\right),\quad \vartheta_1=-\frac{1}{4\pi G}\frac1{\rho_2},\quad \vartheta_2=-\frac{1}{4\pi G}\frac1{\rho_1}\qquad(2.4)$$
Convex throat => negative surface energy density and negative tensions (WEC violated).

**Flat face (key claim for a "portal").** Choose $\Omega$ with a flat face: there both radii are
infinite and the stress-energy vanishes. Quote: a traveller encountering such a face "will feel no
tidal forces and see no matter, exotic or otherwise" and "will simply be shunted into the other
universe" (two short quotes). The throat acts like a "perfect mirror" whose reflected light goes to
the other universe; convex parts defocus light, so by the focusing theorem they violate the WEC and
the averaged WEC.

**Cube / polyhedron numbers (verified on page images).** Cube of edge $L$ with edges/corners rounded
to radius $r\ll L$: faces carry nothing; edges $S^i{}_j=\frac{1}{4\pi Gr}{\rm diag}(1,1,0)$ (3.1); energy per
unit length $\mu=\sigma\cdot2\pi r/4=-1/(8G)$ and tension $T=\vartheta_1\cdot2\pi r/4=\mu$; each corner
$E=-r/(4G)\to0$. Sharp cube ($r\to0$):
$$\mu=T=-\frac{1}{8G}=-1.52\times10^{43}\ \text{J/m}=-\tfrac18\,(\text{Planck mass}/\text{Planck length}),$$
independent of $L$ and of $\hbar$. Edge stress tensor = that of a **negative-tension** Nambu-Goto string
(3.2)-(3.4): $\Theta^\mu{}_\nu=-T\delta(y)\delta(z)\,{\rm diag}(1,1,0,0)$. Quote: "No natural mechanism for
generating negative string tension is currently known." General polyhedron, bending angle $\phi$ at an
edge: $\mu=T=-\phi/(4\pi G)$; deficit angle $\varphi=-2\phi$, so $\mu=T=\varphi/(8\pi G)$ (usual string relation);
convex edges have negative tension.
- My conversions: $c^4/(8G)=1.51\times10^{43}$ J/m <=> mass per length $c^2/(8G)=1.68\times10^{26}$ kg/m
  (~28 Earth masses per metre, negative). For a cube of side 2 m: 12 edges x 2 m x (-1.68e26 kg/m)
  = -4.0e27 kg ~ -2 Jupiter masses (my arithmetic, not in the paper).

**Caveats / conclusions in paper.** Still requires exotic matter (on edges); stability and causal
constraints on construction are open; Visser could not obtain the needed stress-energy from string
Casimir energy; "technological problems seem completely beyond our reach" (quote).

---

## 7. Visser 1989 (Nucl. Phys. B) - thin-shell Schwarzschild wormholes

**Citation.** Matt Visser, "Traversable wormholes from surgically modified Schwarzschild spacetimes",
*Nuclear Physics B* **328**(1), 203-212 (December 1989).
- DOI: 10.1016/0550-3213(89)90100-4 ; arXiv:0809.0927 (author's 2008 re-typeset upload):
  https://arxiv.org/abs/0809.0927
- **ACCESS STATUS: full text read** (arXiv reprint; equation numbers as in reprint).

**Conventions.** Signature -+++; junction formula with $c^4/8\pi G$ (Eq. 3.4), then "Geometrodynamic
units" $G=c=1$. $\vartheta$ here is a surface **tension** (later papers use pressure $p=-\vartheta$).

**Construction.** Two copies of Schwarzschild with $r\le a$ removed, $a>2M$ ("necessary to prevent the
formation of an event horizon"), glued along $r=a$. A subclass of MT's "absurdly benign" wormholes in
the zero-thickness limit. Lanczos-Sen-Israel junction:
$S^i{}_j=-\frac{c^4}{8\pi G}(\kappa^i{}_j-\delta^i{}_j\kappa^k{}_k)$ (3.4), $\kappa$ = jump in extrinsic curvature;
spherical: $S^i{}_j={\rm diag}(-\sigma,-\vartheta,-\vartheta)$, $\sigma=-\kappa^\theta{}_\theta/4\pi$, $\vartheta=-(\kappa^\tau{}_\tau+\kappa^\theta{}_\theta)/8\pi$ (3.7).

**Static (4.3):** $\displaystyle\sigma=-\frac{1}{2\pi a}\sqrt{1-\frac{2M}{a}},\qquad \vartheta=-\frac{1}{4\pi a}\frac{1-M/a}{\sqrt{1-2M/a}}$.

**Dynamic (5.8)** ($a=a(\tau)$, $\tau$ = proper time on the throat):
$$\sigma=-\frac{1}{2\pi a}\sqrt{1-\frac{2M}{a}+\dot a^2},\qquad
\vartheta=-\frac{1}{4\pi a}\,\frac{1-M/a+\dot a^2+a\ddot a}{\sqrt{1-2M/a+\dot a^2}} .$$
Throat four-acceleration $A=(\ddot a+M/a^2)/\sqrt{1-2M/a+\dot a^2}$ (5.7); conservation
$\dot\sigma=-2(\sigma-\vartheta)\dot a/a$ (5.9); equation of motion $\dot a^2-2M/a-(2\pi\sigma a)^2=-1$ (6.1).
**Your expected expression $\sigma=-(1/2\pi a)\sqrt{1-2M/a+\dot a^2}$ is exactly Eq. (5.8).**

**Results.**
- Energy density negative (exotic); Visser stresses the observed Casimir effect already violates the
  unaveraged WEC/SEC/DEC; AWEC status open (1989).
- Nambu-Goto membrane ($\sigma=\vartheta$): static only at $a=3M$ with $\sigma=\vartheta=-1/(2\pi a\sqrt3)$ (4.4), and
  dynamically unstable (potential unbounded below: collapse or blow-up; for $a\gg M$,
  $a(\tau)\approx\cosh(2\pi\sigma\tau)/(2\pi\sigma)$).
- Traceless surface matter ($\sigma+2\vartheta=0$, as for massless-field Casimir stress): no solution
  ($\sigma,\vartheta$ imaginary) - so massless Casimir stress is "rather less useful than expected" (quote).
- Stability: for $M>0$ the potential near $a=0$ is unbounded below, so at best metastable against
  collapse; if $a<2M$, runaway collapse. Stable against explosion iff $2\pi a\sigma(a)\to k_\infty<1$.
  With $\vartheta(\sigma)=k^2\sigma+o(\sigma^2)$, stability against explosion gives $k\in[0,1/\sqrt2]$ (7.4). Stability against
  collapse as well needs (i) $M=0$ and $k\ge\sqrt{1/2}$ - hence uniquely $k=1/\sqrt2$, $\vartheta=\sigma/2$, $\sigma=\sigma_0a_0/a$; or
  (ii) $M<0$ and $k>1/2$ - i.e. "semi-soft" equations of state between $\vartheta=\sigma/4$ and $\vartheta=\sigma/2$; or
  (iii) $M<0$, $k=1/2$ and $2\pi\sigma_0a_0^{3/2}<\sqrt{2|M|}$ (verified on the page image). Conclusion: global
  stability against collapse requires non-positive gravitational mass seen from infinity
  (paraphrase); Visser calls this "alarming, but not necessarily fatal" (quote).

---

## 8. Poisson & Visser 1995 - linearised stability of thin-shell wormholes

**Citation.** Eric Poisson and Matt Visser, "Thin-shell wormholes: Linearization stability",
*Physical Review D* **52**(12), 7318-7321 (15 December 1995).
- DOI: 10.1103/PhysRevD.52.7318 ; arXiv:gr-qc/9506083 - https://arxiv.org/abs/gr-qc/9506083
- **ACCESS STATUS: full text read** (arXiv v1; equations checked on rendered pages; Fig. 1 itself is
  not in the arXiv PDF, only its caption).

**Conventions.** $G=c=1$. $S^i{}_j={\rm diag}(-\sigma,p,p)$ (7): $\sigma$ surface energy density, $p$ surface
**pressure** (= $-\vartheta$ of Visser 1989). Schwarzschild surgery as in Source 7, $a>2M$.

**Equations.** $\sigma=-[K^\theta{}_\theta]/4\pi$, $p=([K^\tau{}_\tau]+[K^\theta{}_\theta])/8\pi$ (8);
$[K^\theta{}_\theta]=(2/a)\sqrt{1-2M/a+\dot a^2}$ (9), $[K^\tau{}_\tau]=(\ddot a+M/a^2)/\sqrt{1-2M/a+\dot a^2}$ (10);
$$\sigma=-\frac{1}{2\pi a}\sqrt{1-\frac{2M}{a}+\dot a^2}\ (11),\qquad p=+\frac{1}{4\pi a}\frac{1-M/a+\dot a^2+a\ddot a}{\sqrt{1-2M/a+\dot a^2}}\ (12)$$
$\frac{d}{d\tau}(\sigma\mathcal A)+p\frac{d\mathcal A}{d\tau}=0$, $\mathcal A=4\pi a^2$ (13); $\dot a^2-2M/a-(2\pi\sigma a)^2=-1$ (14);
$\dot\sigma=-2(\sigma+p)\dot a/a$ (15); $\dot a^2=-V(a)$, $V(a)=1-2M/a-[2\pi\sigma(a)a]^2$ (17).
Static solution: $\sigma_0=-\frac{1}{2\pi a_0}\sqrt{1-2M/a_0}$ (18), $p_0=\frac{1}{4\pi a_0}\frac{1-M/a_0}{\sqrt{1-2M/a_0}}$ (19).
Definition (23): $\beta^2(\sigma)\equiv\partial p/\partial\sigma$.
$$V''(a_0)=-\frac{2}{a_0^2}\left[\frac{2M}{a_0}+\frac{M^2/a_0^2}{1-2M/a_0}+(1+2\beta_0^2)\left(1-\frac{3M}{a_0}\right)\right]\qquad(27)$$
**Exact stability condition** ($V''(a_0)>0$), Eq. (29):
$$\frac{2M}{a_0}+\frac{M^2/a_0^2}{1-2M/a_0}+(1+2\beta_0^2)\left(1-\frac{3M}{a_0}\right)<0 ,$$
equivalently (30) $\beta_0^2(1-3M/a_0)<-\frac{1-3M/a_0+3(M/a_0)^2}{2(1-2M/a_0)}$, i.e.
(31) $\beta_0^2<-\frac{1-3M/a_0+3(M/a_0)^2}{2(1-2M/a_0)(1-3M/a_0)}$ for $a_0>3M$;
(32) $\beta_0^2>-\frac{1-3M/a_0+3(M/a_0)^2}{2(1-2M/a_0)(1-3M/a_0)}$ for $a_0<3M$.
Boundary (33): $3(1+4\beta_0^2)(M/a_0)^2-(3+10\beta_0^2)(M/a_0)+1+2\beta_0^2=0$, roots (34)
$a_0^\pm=6(1+4\beta_0^2)M/[3+10\beta_0^2\mp\sqrt{4\beta_0^4-12\beta_0^2-3}]$, real only for
$\beta_0^2\ge\tfrac32+\sqrt3\approx3.23205$ or $\beta_0^2\le\tfrac32-\sqrt3\approx-0.23205$.
**Stability regions:** I: $\beta_0^2\ge\tfrac32+\sqrt3$, $a_0^-<a_0<a_0^+$ (35); II: $\beta_0^2\le-\tfrac12$, $a_0>a_0^-$ (36);
for $-\tfrac12<\beta_0^2<\tfrac32+\sqrt3$ unstable for all $a_0$.

**Conclusion.** If $\beta_0$ is read as a sound speed in $(0,1]$, "spherically-symmetric thin-shell
wormholes are always unstable to linearized radial perturbations" (quote). Large wormholes
($a_0>3M$) are stable only for $\beta_0^2<0$. Caveats given by the authors: $\sigma_0<0$ already, so
usual arguments for $\beta_0>0$ are sidestepped; $\beta_0$ need not be the sound speed without a
microphysical model; $|\beta_0^2|>1$ "should not be ruled out a priori". Examples with $\beta^2=-1$:
Casimir vacuum between plates ($T^{\mu\nu}\propto{\rm diag}(-1,1,1,-3)$ -> surface ${\rm diag}(-1,1,1)$) and false
vacuum. So yes: stable configurations require an exotic equation of state (negative $\beta^2$ for
$a_0>3M$, or "superluminal" $\beta_0^2\gtrsim3.23$ for $2M<a_0<3M$) on top of $\sigma<0$.
- My numerical check of (29): $\beta_0^2=-1$ stable for $a_0>5.30M$; $\beta_0^2=-0.6$: $a_0>13.4M$;
  $\beta_0^2=5$: $2.13M<a_0<2.69M$; no stable $a_0$ for any $\beta_0^2\in[-0.5,3.23)$ (at exactly $-1/2$ the
  stable range recedes to infinity).

**Caveats.** Linear, spherically symmetric (radial) perturbations of thin shells only.

---

## 9. Visser 1995 - the monograph

**Citation.** Matt Visser, *Lorentzian Wormholes: From Einstein to Hawking*, AIP Series in
Computational and Applied Mathematical Physics (American Institute of Physics / AIP Press,
Woodbury, NY, 1995), 412 pp.
- ISBN 1-56396-394-9 (hardcover, 1995; ISBN-13 978-1-56396-394-0); paperback 1996:
  ISBN 1-56396-653-0 (978-1-56396-653-8). LC call no. QC173.6 .V57 1995. (Open Library records:
  https://openlibrary.org/isbn/1563963949 and https://openlibrary.org/isbn/1563966530)
- Cited as "AIP Press (1995)" by Visser-Kar-Dadhich 2003 and as "American Institute of Physics,
  New York, 1995" by Poisson-Visser 1995 and Hochberg-Visser 1998.
- **ACCESS STATUS: bibliographic only / not accessed** (book not read). I could not confirm a
  Springer reprint ISBN, so none is given.

---

## 10. Hochberg & Visser 1997 and 1998 - generic throats and the flare-out => NEC link

### 10a. Hochberg & Visser 1997
**Citation.** David Hochberg and Matt Visser, "Geometric structure of the generic static traversable
wormhole throat", *Physical Review D* **56**(8), 4745-4755 (15 October 1997).
- DOI: 10.1103/PhysRevD.56.4745 ; arXiv:gr-qc/9704082 - https://arxiv.org/abs/gr-qc/9704082
- **ACCESS STATUS: full text read** (arXiv v1, text extraction; key equations read).

**Conventions.** Static metric $ds^2=-e^{2\phi}dt^2+g_{ij}dx^idx^j$; MTW sign conventions; $G$ explicit, $c=1$.
**Definition.** Throat $\Sigma$ = 2-surface of **minimal area** in a constant-time slice. In Gaussian
normal coordinates, $K_{ab}=-\frac12\partial g_{ab}/\partial n$ (22); extremal: ${\rm tr}(K)=0$; minimality requires
$$\frac{\partial\,{\rm tr}(K)}{\partial n}\le0\qquad(26)$$
- "the generalization of the Morris-Thorne 'flare-out' condition" (quote). Variants defined:
"simple" (26), "strong" (strict at some point, 29), "weak" (integrated over throat < 0, 30).
**Results (G explicit).**
- $\tau=\frac{1}{16\pi G}[{}^{(2)}R+{\rm tr}(K^2)-2g^{cd}(\phi_{:cd}+\phi_{:c}\phi_{:d})]$ (67), generalising MT's $\tau=1/(8\pi G r_0^2)$ (68).
- $\rho=\frac{1}{16\pi G}[{}^{(2)}R+2\partial{\rm tr}K/\partial n-{\rm tr}(K^2)]$ (70) => $\rho\le{}^{(2)}R/(16\pi G)$ (71): throats of genus >= 2 must
  contain regions of negative energy density (WEC/DEC violated); torus throats generically violate too.
- $\rho-\tau=\frac{1}{16\pi G}[2\partial{\rm tr}K/\partial n-2{\rm tr}(K^2)+2g^{cd}(\phi_{:cd}+\phi_{:c}\phi_{:d})]$ (77); at maxima of $\phi$ on the throat
  $\rho-\tau\le0$ (78): generically the NEC is violated at some points on the throat.
- $\int\sqrt{{}^{(2)}g}\,e^{\phi}(\rho-\tau)\,d^2x<0$ under strong flare-out (83): the "transverse averaged NEC" is violated.
- Abstract quote: "the null energy condition (NEC), when suitably weighted and integrated over the
  wormhole throat, must be violated" (16 words).
**Caveat.** Static spacetimes only (removed in 1998).

### 10b. Hochberg & Visser 1998
**Citation.** David Hochberg and Matt Visser, "Null Energy Condition in Dynamic Wormholes",
*Physical Review Letters* **81**(4), 746-749 (27 July 1998). (arXiv title: "The null energy condition in
dynamic wormholes".)
- DOI: 10.1103/PhysRevLett.81.746 ; arXiv:gr-qc/9802048 (v3) - https://arxiv.org/abs/gr-qc/9802048
- **ACCESS STATUS: full text read** (arXiv v3).

**Claims.** For a compact 2-surface with two orthogonal null congruences $l_\pm$, a throat (for each
direction of travel) is where the cross-sectional area of a light bundle is at a strict local minimum:
$$\theta_\pm=0\ (4),\qquad \frac{d\theta_\pm}{du_\pm}\ge0\ (5)\ \text{(simple flare-out)}.$$
Raychaudhuri + Einstein equations => $R_{ab}l^a_\pm l^b_\pm\le0$ (7), $T_{ab}l^a_\pm l^b_\pm\le0$ (8); with the strict
version (area strictly increasing in some direction) there is an open region near the throat with
$T_{ab}l^a_\pm l^b_\pm<0$ (13). A time-dependent wormhole has **two throats** (one per direction), which
coalesce only when static. No assumptions on symmetry, asymptotic flatness or time dependence.
Quote: "NEC violations will occur at or near the throat of any spacetime configuration that deserves
to be called a (traversable) wormhole" (21 words). They classify claimed NEC-respecting wormholes as
semantic games (e.g. Brans-Dicke scalar counted as "not matter"), genuine ambiguities, or errors.
Builds on Page's argument (MT note added in proof).

---

## 11. Visser, Kar & Dadhich 2003 - "arbitrarily small" ANEC violation

**Citation.** Matt Visser, Sayan Kar, Naresh Dadhich, "Traversable Wormholes with Arbitrarily Small
Energy Condition Violations", *Physical Review Letters* **90**(20), 201102 (21 May 2003).
- DOI: 10.1103/PhysRevLett.90.201102 ; arXiv:gr-qc/0301003 (v2) - https://arxiv.org/abs/gr-qc/0301003
- **ACCESS STATUS: full text read** (arXiv v2, all 4 pages as images).

**Conventions.** $G=c=1$. Metric (2): $ds^2=-e^{2\phi(r)}dt^2+\frac{dr^2}{1-b(r)/r}+r^2d\Omega^2$;
$\rho=\frac{b'}{8\pi r^2}$, $p_r=\frac{1}{8\pi}\left[-\frac{b}{r^3}+2\left(1-\frac br\right)\frac{\phi'}{r}\right]$ (3).
They define "exotic matter" as ANEC violation (abstract).

**Key equations.**
- ANEC line integral on a radial null geodesic (6)-(7):
  $I=\oint[\rho+p_r]e^{-2\phi}d\lambda=\oint[\rho+p_r]e^{-\phi}d\eta=-\frac1{4\pi}\oint\frac{1}{r^2}e^{-\phi}\sqrt{1-b/r}\,dr<0$ - a line integral
  (dimension mass/area), so it says nothing about the "amount" of exotic matter.
- Mass: $m_\infty=\frac{r_0}{2}+\int_{r_0}^\infty4\pi r^2\rho\,dr$ (8); with $\oint dV=2\int_{r_0}^\infty4\pi r^2dr$ (both sides) (9):
  $\oint\rho\,dV=2m_\infty-r_0$ (10).
- **Volume-integral quantifier** (11)-(13):
  $$\oint[\rho+p_r]\,dV=-\int_{r_0}^{\infty}(1-b')\left[\ln\left(\frac{e^{2\phi}}{1-b/r}\right)\right]dr .$$
- Spatial-Schwarzschild example ($b=2m=r_0$, $\rho=0$): $\oint p_r\,dV=-\int_{r_0}^{a}\ln[e^{2\phi}/(1-2m/r)]dr$ (16)
  -> 0 as $a\to2m$ (21), while the ANEC line integral stays finite and negative, $I<-1/(2\pi a)$ (17).
- Explicit model (22)-(25): $e^{\phi}=\epsilon+\lambda\sqrt{1-2m/r}$ for $2m<r<a$, $e^{\phi}=\sqrt{1-2m/r}$ for $r>a$,
  $\lambda=1-\epsilon/\sqrt{1-2m/a}$; a thin shell of "quasi-normal" matter at $r=a$ (violates DEC only).
  $\oint[p_r+2p_t]dV=2\epsilon m/\sqrt{1-2m/a}=2(\epsilon/\epsilon_s)m$ (37), $\epsilon_s=\sqrt{1-2m/a}$ (36): both volume
  integrals can be made arbitrarily small (e.g. $\epsilon_s=\sqrt\epsilon\to0$).
- Key-result quote: "by appropriate choice of the wormhole geometry the total quantity of ANEC
  violating matter can be made infinitesimally small" (19 words).

**Caveats.** (1) Spherical symmetry essential (authors' own statement). (2) My observation, not in
the paper: in the explicit model $e^{\phi(r_0)}=\epsilon$, so as $\epsilon\to0$ the throat approaches a horizon
(huge redshift), with obvious consequences for traversal time/tides; the paper does not analyse
traversability comfort. (3) Fewster & Roman 2005 (PRD 72, 044023, arXiv:gr-qc/0507013; **abstract
read**) apply a quantum inequality and find the VKD models "are constrained to be either
submicroscopic or to have a large discrepancy between throat size and curvature radius" (quote).

---

## 12. Shinkai & Hayward 2002 - numerical (in)stability of the Ellis / MT Box-2 wormhole

**Citation.** Hisa-aki Shinkai and Sean A. Hayward, "Fate of the first traversible wormhole:
Black-hole collapse or inflationary expansion", *Physical Review D* **66**(4), 044005 (16 Aug 2002).
- DOI: 10.1103/PhysRevD.66.044005 ; arXiv:gr-qc/0205041 (v2) - https://arxiv.org/abs/gr-qc/0205041
- **ACCESS STATUS: full text read** (arXiv v2 via text extraction; figures not inspected).

**Set-up.** Static wormhole $ds^2=(a^2+l^2)dS^2+dl^2-dt^2$ (2.25) (MT Box 2 = Ellis), supported by a
massless ghost Klein-Gordon field; $T_{tt}=-a^2/[8\pi(a^2+l^2)^2]$ with $G=1$ (2.33); throat is a double
trapping horizon. Dual-null numerical code covering both universes ("first numerical study of
wormhole dynamics", their claim).

**Results.**
- Unstable against Gaussian pulses in either the ghost field or a normal massless KG field. Horizons
  bifurcate; negative net input energy -> explosive **inflationary** expansion (exponential growth of
  throat, Hubble constants $Ha\approx1.1$-$1.6$ in Table I); positive -> **collapse to a black hole**
  (final mass tends to $M\sim0.30a$ for small perturbations). Perturbations "down to 1% in energy"
  give dramatically different end states.
- Normal matter (e.g. a traveller) has positive energy, so "a black hole always results".
- A carefully balanced extra ghost pulse can maintain the wormhole "for a limited time"; requires
  fine-tuning, "may not be realistic"; continual adjustment would be "a never-ending project" (quotes).
- Speculation: inflation as a mechanism to enlarge a Planck-size wormhole from spacetime foam.

**Caveats.** They wrote (2002) "Accepting that the static wormhole is stable to linear
perturbations [Bronnikov et al. 1998; Armendariz-Picon 2002], we seem to have discovered a non-linear
instability" - superseded by Gonzalez-Guzman-Sarbach 2009, who proved linear instability.
Citation error in their reference list: Ellis is given as "J. Math. Phys. 14, 395 (1973)"; the
correct page is 104.

---

## 13. Gonzalez, Guzman & Sarbach 2009 (I and II) - ghost-scalar wormholes are unstable

### 13a. Paper I (linear)
**Citation.** J. A. Gonzalez, F. S. Guzman, O. Sarbach, "Instability of wormholes supported by a ghost
scalar field: I. Linear stability analysis", *Classical and Quantum Gravity* **26**(1), 015010 (2009;
online 16 Dec 2008).
- DOI: 10.1088/0264-9381/26/1/015010 ; arXiv:0806.0608 (v2) - https://arxiv.org/abs/0806.0608
- **ACCESS STATUS: full text read** (arXiv v2, key sections).

**Model.** $S=\frac{1}{16\pi G}\int(-R+\kappa\nabla_\mu\Phi\nabla^\mu\Phi)\sqrt{-g}\,d^4x$, $\kappa=-8\pi G<0$ (ghost). Static family =
Ellis-Bronnikov (see Source 3), parametrised by throat areal radius and the product of the two ADM masses.
**Results.** All static solutions are linearly unstable, with **exactly one** exponentially growing
mode. Time scale $\tau_{\rm unstable}=T\,r_{\rm throat}$ (units $c=1$, proper time at the throat): $T=0.846$ for the
massless case ($\gamma_1=0$), decreasing to $T\to0.590$ for large $\gamma_1$ (Table I). Quote: "a wormhole whose
throat has an areal radius smaller than 1km, say, decays in a few µs" (16 words). [My check:
$0.846\times1\,\text{km}/c=2.8\,\mu$s; for a 1 m throat 2.8 ns.]
They explain that Armendariz-Picon's 2002 stability claim only covered perturbations vanishing at the
throat ("placing a mirror at the throat"). ANEC volume integrals $I_\pm=\frac{8\pi}{|\kappa|}(2m_{\pm\infty}-r_{\rm throat})<0$
(15), which can be made small by shrinking $r_{\rm throat}$. Open options for stable wormholes: one-ended
topology, rotation (they expect slow rotation still unstable), other matter, modified gravity.

### 13b. Paper II (nonlinear)
**Citation.** Same authors, "... II. Nonlinear evolution", *Class. Quantum Grav.* **26**(1), 015011 (2009).
- DOI: 10.1088/0264-9381/26/1/015011 ; arXiv:0806.1370 (v2) - https://arxiv.org/abs/0806.1370
- **ACCESS STATUS: abstract + introduction read** (not studied in detail).
**Claims.** Depending on the perturbation the wormhole either expands (apparently exponentially, at
least during the runs) or collapses to a Schwarzschild black hole; time scales match linear theory for
small perturbations; in the collapsing case a light signal can still go from one universe to the other
and back before the black hole forms.

**Caveat (both).** Specific matter model (massless minimally coupled ghost scalar), spherical symmetry.

---

## 14. James, von Tunzelmann, Franklin & Thorne 2015 - "Visualizing Interstellar's Wormhole"

**Citation.** Oliver James, Eugénie von Tunzelmann, Paul Franklin, Kip S. Thorne, "Visualizing
Interstellar's Wormhole", *American Journal of Physics* **83**(6), 486-499 (June 2015).
- DOI: 10.1119/1.4916949 ; arXiv:1502.03809 (v3) - https://arxiv.org/abs/1502.03809 ; also on
  CaltechAUTHORS (record 103ed-m0n12).
- **ACCESS STATUS: full text read** (arXiv v3; equations read from rendered pages).

**Conventions.** Geometrized units $G=c=1$ (1 s = 2.998e8 m; 1 kg = 0.742e-27 m; $M_\odot$ = 1.476 km);
signature -+++.

**Metrics.**
- Ellis (1)-(2): $ds^2=-dt^2+d\ell^2+r^2(d\theta^2+\sin^2\theta\,d\phi^2)$, $r(\ell)=\sqrt{\rho^2+\ell^2}$ ($\rho$ = throat radius;
  credited to Homer Ellis 1973, "drainhole").
- Sharp-edged cylinder (3): $r=\rho$ for $|\ell|\le a$; $r=|\ell|-a+\rho$ for $|\ell|>a$.
- **Dneg wormhole (5a-c):**
  $$r=\rho+\frac{2}{\pi}\int_0^{|\ell|-a}\arctan\left(\frac{2\xi}{\pi\mathcal M}\right)d\xi=\rho+\mathcal M\left[x\arctan x-\tfrac12\ln(1+x^2)\right],\quad |\ell|>a,$$
  $$x\equiv\frac{2(|\ell|-a)}{\pi\mathcal M},\qquad r=\rho\ \ \text{for } |\ell|<a .$$
  Three parameters: $\rho$ (radius of cylindrical interior), $2a$ (its length), $\mathcal M$ (sets how gently the
  interior joins the flat exterior; for Schwarzschild $\rho=2\mathcal M$, but here independent). Mouths at
  $\ell=\pm a$, spheres of circumference $2\pi\rho$.
- Embedding $z(\ell)=\int_0^\ell\sqrt{1-(dr/d\ell')^2}\,d\ell'$ (6); "lensing width" $\mathcal W=1.42953\ldots\mathcal M$ (7) (lateral
  embedding distance over which the surface goes from vertical to 45 degrees).
- With weak gravity (8): $ds^2=-(1+2\Phi)dt^2+d\ell^2+r^2d\Omega^2$, $\mathbf g=-(d\Phi/d\ell)\,\mathbf e_{\hat\ell}$ (9); for
  $g\lesssim10$ m/s$^2$ and $\rho=1$ km, $|\Phi|\lesssim10^{-12}$ - negligible for the images.

**Ray-tracing (null geodesic) equations - Appendix, transcribed.** Super-Hamiltonian (A.4):
$$H=\tfrac12\left[-p_t^2+p_\ell^2+\frac{p_\theta^2}{r(\ell)^2}+\frac{p_\phi^2}{r(\ell)^2\sin^2\theta}\right].$$
Set $p_t=-1$ (so affine parameter = $t$); constants $b=p_\phi$ (A.5a) and $B^2=p_\theta^2+p_\phi^2/\sin^2\theta$ (A.5b)
($B$ = impact parameter relative to the centre). Ray equations (A.6)-(A.7):
$$\frac{dt}{d\zeta}=-p_t=1,\quad \frac{d\ell}{dt}=p_\ell,\quad \frac{d\theta}{dt}=\frac{p_\theta}{r^2},\quad \frac{d\phi}{dt}=\frac{b}{r^2\sin^2\theta},$$
$$\frac{dp_\ell}{dt}=B^2\frac{dr/d\ell}{r^3},\qquad \frac{dp_\theta}{dt}=\frac{b^2}{r^2}\frac{\cos\theta}{\sin^3\theta}.$$
Camera map: basis $\mathbf e_x=\mathbf e_{\hat\ell}$, $\mathbf e_y=\mathbf e_{\hat\phi}$, $\mathbf e_z=-\mathbf e_{\hat\theta}$ (A.8); sky direction
$N=(\sin\theta_{cs}\cos\phi_{cs},\sin\theta_{cs}\sin\phi_{cs},\cos\theta_{cs})$ (A.9a); incoming ray $n_{\hat\ell}=-N_x$, $n_{\hat\phi}=-N_y$,
$n_{\hat\theta}=+N_z$ (A.9b); $p_\ell=n_{\hat\ell}$, $p_\theta=r\,n_{\hat\theta}$, $p_\phi=r\sin\theta\,n_{\hat\phi}$ (A.9c); $b=r\sin\theta\,n_{\hat\phi}$,
$B^2=r^2(n_{\hat\theta}^2+n_{\hat\phi}^2)$ (A.9d). Integrate backward to $t\to-\infty$: $\ell<0$ -> lower celestial sphere
(Saturn side), $\ell>0$ -> upper (Gargantua side).

**What a wormhole looks like (their statements).** Through the mouth the camera sees a gravitationally
lensed image of the other universe (e.g. a large distorted primary image of Saturn), plus thin
lenticular secondary, tertiary... images near the mouth's edge that become visible as the wormhole is
lengthened; the external star field is lensed near the mouth (more for larger $\mathcal W$); an **Einstein
ring** just outside the mouth's edge, with paired star images moving in opposite directions on either
side. Travelling through: the view of the far side grows from the centre until it fills the frame;
to an audience it looks like a zoom. Interstellar's choices: $\rho=1$ km (its lensing of our galaxy
"can be seen from Earth, but barely so" - quote), $2a=0.01\rho$, $\mathcal W=0.05\rho$.
**The phrase "crystal ball" does not occur in this paper** (searched). The mouths are explicitly
spheres; the "sphere showing the other side" picture is consistent with the text and with Perlick 2004
(Source 15b), but I could not source the words "crystal ball".

**Status-of-wormholes statements (Sec. I B), quotes kept short.**
- No known mechanism for making wormholes; speculation that quantum-foam wormholes at
  $\sqrt{G\hbar/c^3}\sim10^{-35}$ m might be enlarged.
- Creation needs topology change, which classically entails negative energy and closed timelike curves
  (Tipler; Geroch). Quote: "It is likely the laws of physics forbid this. Likely but not certain."
- Quote: "A wormhole will pinch off so quickly that nothing can travel through it, unless it has
  'exotic matter' at its throat" (21 words).
- Quantum inequalities "appear to place severe limits on the sizes of traversable wormholes" (quote);
  likely, after strengthening, to prevent macroscopic wormholes like Interstellar's staying open long
  enough - "Likely, but not certain."
- A higher-dimensional bulk could in principle hold a wormhole open without exotic matter on our brane.
- Quote: "the prospects for highly advanced civilizations to make them artificially are also pretty dim".
**Caveat.** The geometry was chosen for visual/narrative reasons; they explicitly ignore physical
constraints on the required stress-energy.

---

## 15. Gravitational lensing by the Ellis wormhole - deflection angle

### 15a. Chetouani & Clément 1984
**Citation.** L. Chetouani and G. Clément, "Geometrical optics in the Ellis geometry", *General
Relativity and Gravitation* **16**(2), 111-119 (February 1984). DOI: 10.1007/BF00762440.
- **ACCESS STATUS: abstract only** (INSPIRE). Abstract: the cross section for scattering of light by the
  Ellis geometry, with the two asymptotically flat regions "observationally identified", is computed in
  the geometrical-optics approximation. I did not see their deflection formula. Perlick 2004 (full
  text) describes it as lensing "in a scattering formalism assuming that observer and light source
  are at infinity" (quote), and Nakajima & Asada 2012 cite it (with G. Clement, Int. J. Theor. Phys.
  23, 335 (1984), not checked) for the early scattering work and for the fact that the massless Ellis
  wormhole deflects light despite zero mass.

### 15b. Perlick 2004
**Citation.** Volker Perlick, "Exact gravitational lens equation in spherically symmetric and static
spacetimes", *Physical Review D* **69**(6), 064017 (17 March 2004) (arXiv title begins "On the exact
gravitational lens equation...").
- DOI: 10.1103/PhysRevD.69.064017 ; arXiv:gr-qc/0307072 (v2)
- **ACCESS STATUS: full text read** (Ellis section, Sec. V B, pp. 7-9).
**Content.** Metric (38): $g=dr^2+(r^2+a^2)(d\vartheta^2+\sin^2\vartheta\,d\varphi^2)-dt^2$, $r\in(-\infty,\infty)$; circular light
rays (photon sphere) at the neck $r=0$. Observer at $r_O<0$, sources at $r_S>0$ (opposite sides):
the sources "illuminate a disk of angular radius $\delta_I<\pi/2$" with
$$\sin^2\Theta<\sin^2\delta_I=\frac{a^2}{r_O^2+a^2}\qquad(40);$$
the disk rim corresponds to rays spiralling asymptotically to $r=0$; infinitely many Einstein rings
with radii converging to $\delta_I$. Exact lens equation (42):
$\Phi=\int_{r_O}^{r_S}\frac{\sqrt{r_O^2+a^2}\,\sin\Theta\,dr}{\sqrt{r^2+a^2}\sqrt{r^2+a^2\cos^2\Theta-r_O^2\sin^2\Theta}}$; travel time (44)
$T=\int_{r_O}^{r_S}\frac{\sqrt{r^2+a^2}\,dr}{\sqrt{r^2+a^2\cos^2\Theta-r_O^2\sin^2\Theta}}$; redshift $z=0$ (43).
*My reading:* $\sin\delta_I=a/R_O$ with $R_O=\sqrt{r_O^2+a^2}$ the observer's areal radius - i.e. the other universe
fills exactly the disk a sphere of radius $a$ would subtend: the mouth looks like a sphere/disk of the
throat's size (the "portal" image), plus ring images at its edge.

### 15c. Nandi, Zhang & Zakharov 2006
**Citation.** Kamal K. Nandi, Yuan-Zhong Zhang, Alexander V. Zakharov, "Gravitational lensing by
wormholes", *Physical Review D* **74**(2), 024020 (20 July 2006). DOI: 10.1103/PhysRevD.74.024020;
arXiv:gr-qc/0602062 (v4).
- **ACCESS STATUS: full text (Ellis section read via text extraction).**
- Exact Ellis deflection in terms of the closest approach $l_0=a$ (their $a$!) and throat $q'$ (units $q'=1$),
  Eq. (54): $\alpha(a)=-\pi+2\sqrt{1+a^2}\,{\rm EllipticK}[-q'^2/a^2]/a$ (Mathematica parameter convention);
  $\alpha\to\infty$ as $a\to0$. (Equivalent to 15d after the imaginary-modulus transformation - my check;
  Nakajima & Asada's footnote [18] likewise warns that NZZ's elliptic-integral argument is the square
  of the usual modulus.)
- Caveat: they state the zero-mass Ellis wormhole "is a stable configuration", citing
  Armendariz-Picon 2002 - superseded (Sources 12, 13).

### 15d. Nakajima & Asada 2012 - clean exact formula (VERIFIED)
**Citation.** Koki Nakajima and Hideki Asada, "Deflection angle of light in an Ellis wormhole
geometry", *Physical Review D* **85**, 107501 (2012). DOI: 10.1103/PhysRevD.85.107501;
arXiv:1204.3710. **ACCESS STATUS: full text read.**
- $G=c=1$; $ds^2=-dt^2+dr^2+(r^2+a^2)d\Omega^2$ (1); impact parameter $b=h/E$; closest approach $r_0=\sqrt{b^2-a^2}$ (6).
$$\alpha(b)=2\int_0^1\frac{dt}{\sqrt{(1-t^2)(1-k^2t^2)}}-\pi=2K(k)-\pi,\qquad k\equiv\frac ab\qquad(9)$$
$$\alpha(b)=\pi\sum_{n=1}^{\infty}\left[\frac{(2n-1)!!}{(2n)!!}\right]^2k^{2n}\ (10)=\frac\pi4\left(\frac ab\right)^2+\frac{9\pi}{64}\left(\frac ab\right)^4+O\!\left(\frac ab\right)^6\ (14).$$
  Log divergence as $b\to a$ (throat = photon sphere) (15). Dey & Sen's approximate formula (11),
  $\alpha=\pi\{\sqrt{2(r_0^2+a^2)/(2r_0^2+a^2)}-1\}$, is right only at leading order (gives $(3\pi/32)$ instead of
  $(9\pi/64)$ at 4th order in $a/b$, and a finite $\pi(\sqrt2-1)$ at $b\to a$).
- **Your expectation $\alpha(b)=2K(b_0/b)-\pi$, weak field $\pi b_0^2/(4b^2)$, is CONFIRMED**, with $K$ written in the
  *modulus* convention $K(k)=\int_0^{\pi/2}d\theta/\sqrt{1-k^2\sin^2\theta}$ (in the *parameter* convention used by
  scipy/Mathematica it is $K(m=b_0^2/b^2)$).
- My independent check (same integral, numerically): $a/b=0.5$: $\alpha=0.2299$ rad vs leading-order
  0.1963; $a/b=0.95$: 2.038 rad; $a/b=0.1$: 0.007898 vs 0.007854.
- Physics note: the massless Ellis wormhole has zero ADM mass yet deflects light toward it, with
  $\alpha\propto1/b^2$ at large $b$ (vs $4GM/(c^2b)$ for a mass).

---

## 16. Teo 1998 - rotating traversable wormholes

**Citation.** Edward Teo, "Rotating traversable wormholes", *Physical Review D* **58**(2), 024014
(24 June 1998). DOI: 10.1103/PhysRevD.58.024014 ; arXiv:gr-qc/9803098 (v2).
- **ACCESS STATUS: full text read** (key sections via text extraction).
**Metric.** Stationary axisymmetric (4),(7): $ds^2=-N^2dt^2+\frac{dr^2}{1-b/r}+r^2K^2\left[d\theta^2+\sin^2\theta\,(d\phi-\omega\,dt)^2\right]$
with $N,b,K,\omega$ functions of $(r,\theta)$; horizon where $N=0$ (so $N$ must be nonzero); throat at $r=b$, and
$\partial_\theta b=0$ there (else curvature singularity), so the throat is at constant $r$ but need not be
spherical. Reduces to MT for $N\to e^\Phi$, $K\to1$, $\omega\to0$ (8).
**Claims.** NEC is violated at some point on the throat (proved generally), but exotic matter can be
moved around the throat so that some infalling observers avoid it; quote: "one can never avoid the
use of exotic matter altogether". Example (26): $N=K=1+(4a\cos\theta)^2/r$, $b=1$, $\omega=2a/r^3$ ($a$ = angular
momentum, units $b_0=1$): throat proper radius $1+(4a\cos\theta)^2$ (dumbbell shape, narrowest at the equator);
for $a=1/4$, equatorial radial null geodesics see $R_{ab}k^ak^b=E^2/r^3>0$ and timelike ones with
$E\gtrsim1.75$ see $G_{ab}k^ak^b>0$ - they cross without meeting negative $T_{ab}k^ak^b$. Ergoregion if
$|a|>1/2$, a tube around the equator not reaching the poles.
**Caveats.** Illustrative model; no stability analysis; "engineering" (tidal) issues not addressed.

---

## 17. The flare-out condition and its link to NEC violation - synthesis of the verified statements

1. **Morris & Thorne 1988** (full text): flare-out $d^2r/dz^2=(b-b'r)/(2b^2)>0$ at/near the throat
   (Eq. 54), equivalent at the throat to $\zeta_0=(\tau_0-\rho_0c^2)/|\rho_0c^2|>0$, i.e. $\tau_0>\rho_0c^2$ (Eq. 56);
   then a fast radial observer measures $T_{\hat0'\hat0'}=\gamma^2(\rho_0c^2-\tau_0)+\tau_0<0$ (Eq. 57). In modern
   language, with $p_r=-\tau$: $\rho c^2+p_r<0$, a violation of the NEC along radial null directions (my
   restatement). Also from (54) at $r=b=b_0$: $b'(b_0)<1$ (my one-line consequence).
2. **Page (MT note added in proof)**: any traversable wormhole (non-spherical, non-static) needs WEC
   violation, because a sphere around one mouth is an outer trapped surface seen from the other side
   (Hawking & Ellis Prop. 9.2.8).
3. **MTY 1988**: AWEC violated along some null geodesics through the wormhole.
4. **Friedman, Schleich & Witt 1993** ("Topological censorship", PRL 71, 1486; erratum PRL 75, 1872
   (1995); arXiv:gr-qc/9305017; **abstract read**): in a globally hyperbolic, asymptotically flat
   spacetime satisfying the null energy condition (wording of the arXiv abstract), every causal curve
   from past to future null infinity is homotopic to a topologically trivial one - i.e. no probing of
   topology / no traversable wormhole without energy-condition violation. Hochberg & Visser 1997
   describe its conclusion as ANEC violation "along at least some (not all) null geodesics".
5. **Hochberg & Visser 1997** (static, arbitrary shape): flare-out $\partial\,{\rm tr}K/\partial n\le0$ at a minimal-area
   throat => NEC violated somewhere on the throat and in $e^\phi$-weighted average.
6. **Hochberg & Visser 1998** (dynamic, arbitrary): $\theta_\pm=0$, $d\theta_\pm/du_\pm\ge0$ (strict somewhere) =>
   $T_{ab}l^al^b<0$ in an open region at or near each of the two throats.
7. **Hayward 2009** (PRD 79, 124001; arXiv:0903.5438; partly read): at a static throat, surface gravity
   $\kappa\cong2\pi r(\tau-\rho)$ (Eq. 38, $G=c=1$), so $\tau>\rho$ (39); $\kappa>0$ "reduces to the flaring-out condition
   of Morris & Thorne, their equation (54)"; NEC necessarily violated on a wormhole mouth.
8. **Lobo 2016 review** (IJMPD 25, 1630017; arXiv:1604.02082; abstract only, secondary): "flaring-out
   condition of the throat, which through the Einstein field equation entails the violation of the
   null energy condition" (quote, secondary source).

---

## 18. Making a wormhole from a black hole - Hayward & Koyama 2004; Hayward 2009

### 18a. Hayward & Koyama 2004
**Citation.** Sean A. Hayward and Hiroko Koyama, "How to make a traversable wormhole from a
Schwarzschild black hole", *Physical Review D* **70**(10), 101502(R) (22 November 2004).
DOI: 10.1103/PhysRevD.70.101502 ; arXiv:gr-qc/0406080.
- **ACCESS STATUS: full text read** (arXiv v1).
**Method.** Matter = pure **phantom radiation** (null dust with negative energy density), idealised as
impulsive thin null shells, with Vaidya regions in between; matched with the Barrabès-Israel formalism.
Units $G=c=1$ (Schwarzschild energy $E=M$, horizon $r=2M$). Start with Schwarzschild (mass $M$) including
part of the black-hole interior; beam in symmetric impulses of phantom radiation (energy $\mu<0$),
followed by constant-profile phantom radiation; the region left after the impulses collide is a static
traversable wormhole (Hayward's wormhole supported by two opposing phantom streams - **not
asymptotically flat**, as they note). Energy jump gives the throat radius
$$\frac a2=M+\mu\quad(\text{requires }|\mu|<M,\ \text{so } a<2M),$$
timing $V_0=-a_*=2(M+\mu)+2M\ln(-\mu/M)$ (21). Enlargement: negative impulse $\mu_1$ then positive $\mu_2$:
$a_2-a_1=-2(\mu_1+\mu_2)$, $|\mu_1|>\mu_2$; reverse order shrinks it.
**Key caveat (their Remarks).** The construction uses the topology of the maximally extended
(two-sided) Schwarzschild solution, since classical topology change needs causal loops; quote:
"Black holes formed by gravitational collapse of supernova remnants would presumably not have the
appropriate topology." (16 words). They invoke Wheeler's foam (Planck-size virtual black holes) and
quote MT's "pulling a wormhole out of ... space-time foam". The white-hole region "could be excised".
Their closing claim that wormholes would be "as much a prediction of General Relativity as black
holes" is conditional on dark energy being phantom.

### 18b. Hayward 2009
**Citation.** Sean A. Hayward, "Wormhole dynamics in spherical symmetry", *Physical Review D* **79**,
124001 (2009). DOI: 10.1103/PhysRevD.79.124001 ; arXiv:0903.5438.
- **ACCESS STATUS: partially read** (abstract; Secs. IV-V via text extraction).
**Claims.** Wormhole = tunnel of trapped surfaces between two mouths (temporal outer trapping
horizons of opposite senses); static case: mouths coincide as the MT throat; $\kappa\cong2\pi r(\tau-\rho)$; NEC
violated at a mouth; zeroth/first/second laws for mouths; enlargement/reduction by negative-then-
positive energy (or reverse); some matter models give apparently stable processes, others collapse to
a black hole or inflate; mentions Maeda's construction from disjoint flat regions "albeit with a
singularity at the topology change".

---

## Additional sources found important (creation, stability history, quantum limits)

- **Geroch 1967** - Robert P. Geroch, "Topology in general relativity", *J. Math. Phys.* **8**, 782-786
  (1967), DOI 10.1063/1.1705276. **Abstract only** (INSPIRE): under certain conditions, changes in the
  topology of spacelike sections can occur if and only if the model is acausal. (Basis of the
  "creation needs CTCs" statements in MT, MTY, James et al.)
- **Tipler 1977** - F. J. Tipler, "Singularities and causality violation", *Ann. Phys.* **108**, 1-36 (1977),
  DOI 10.1016/0003-4916(77)90348-7. **Abstract only** (INSPIRE): with the Einstein equations and the
  WEC, topology change cannot occur on Geroch's spacetime; topology change in a finite region must be
  accompanied by singularities.
- **Armendariz-Picon 2002** - C. Armendariz-Picon, "On a class of stable, traversable Lorentzian
  wormholes in classical general relativity", *PRD* **65**, 104010 (2002), arXiv:gr-qc/0201027,
  DOI 10.1103/PhysRevD.65.104010. **Abstract only**: claimed analytic proof of stability of the
  zero-mass ghost-scalar (Ellis) wormhole - later shown incomplete (GGS 2009, Source 13).
- **Ford & Roman 1996** - L. H. Ford and T. A. Roman, "Quantum field theory constrains traversable
  wormhole geometries", *PRD* **53**, 5496-5507 (1996), arXiv:gr-qc/9510071, DOI 10.1103/PhysRevD.53.5496.
  **Abstract only**: applying a quantum inequality, the wormhole must be "only a little larger than
  Planck size" or have the negative energy in a band many orders of magnitude thinner than the
  throat (paraphrase + short quote). (Quantum, not classical - for cross-reference.)
- **Fewster & Roman 2005** - C. J. Fewster and T. A. Roman, "On wormholes with arbitrarily small
  quantities of exotic matter", *PRD* **72**, 044023 (2005), arXiv:gr-qc/0507013. **Abstract only**
  (see Source 11 caveat).

---

## My derived magnitudes (not in the papers; for the report, label as derived)

- Thin-shell Schwarzschild wormhole with $M=0$ (Poisson-Visser Eq. 18): $\sigma=-c^2/(2\pi Ga)$ =>
  $\sigma=-2.1\times10^{26}$ kg/m$^2$ for $a=1$ m; total shell mass-energy $4\pi a^2\sigma=-2ac^2/G=-2.7\times10^{27}$ kg
  (~ -1.4 Jupiter masses) for $a=1$ m, scaling linearly with $a$ (-1.35 $M_\odot$ for $a=1$ km).
- Massless Ellis wormhole: $\oint\rho\,dV=-r_0c^2/G$ (VKD Eq. 10 with $m_\infty=0$) = $-1.35\times10^{27}$ kg for $r_0=1$ m.
- Visser cube: $-1.68\times10^{26}$ kg per metre of edge.
- Ellis instability e-folding time (GGS): $0.846\,r_{\rm throat}/c$ = 2.8 ns (1 m), 2.8 µs (1 km), ~7 min (1 AU).
- MT throat tension in SI ($1$ dyn/cm$^2$ = 0.1 Pa): $\tau_0=c^4/(8\pi Gb_0^2)$ = $4.8\times10^{42}$ Pa ($b_0=1$ m),
  $4.8\times10^{40}$ Pa ($b_0=10$ m; = $4.8\times10^{41}$ dyn/cm$^2$, MT's "5e41"), $4.8\times10^{36}$ Pa ($b_0=1$ km).
- GGS time scale = e-folding time: their unstable mode is the ground state $E_0=-\beta^2$ of a Schrodinger-type
  operator (Sec. IV), so it grows like $e^{\beta t}$, and $\tau_{\rm unstable}\propto1/\beta$ (rescaled to proper time at the
  throat, in units of $r_{\rm throat}$). So 2.8 ns (1 m throat) is an e-folding time, not a total lifetime.

---

## Discrepancies and open questions

Things that contradicted, corrected or refined the expectations in the brief:

1. **Casimir estimate is not in Morris & Thorne (AJP 1988).** The plate-separation estimate
   ($s\sim10^{-10}$ cm for a throat radius $r_0$ = 1 AU) is in **Morris, Thorne & Yurtsever, PRL 61, 1446
   (1988)**: $s=(\pi^3/30)^{1/4}(r_0\sqrt\hbar)^{1/2}$ in $G=c=1$ units (my check: $1.6\times10^{-10}$ cm). The AJP paper
   only has a one-sentence "note added in proof" pointing to that Letter. Also in MTY: if the plates'
   mass-to-charge ratio must exceed the electron's, the separation must be $<0.029\,\hbar/m_e$ (below the
   electron Compton wavelength), "which might well be forbidden".
2. **Throat tension - confirmed exactly**: $\tau_0=1/(8\pi Gc^{-4}b_0^2)\sim5\times10^{41}$ dyn/cm$^2(10\,\text{m}/b_0)^2$
   (Eq. 51, written with "~"; Box 3 has "≃"); the same equation also gives $\sim5\times10^{11}$ dyn/cm$^2$(1 l.yr./$b_0$)$^2$.
   Note $b_0$ is the throat **radius** (circumference $2\pi b_0$).
3. **"Exotic" definition nuance.** MT define exotic material as $\tau>\rho c^2>0$ (positive density
   included); they separately discuss allowing $\rho<0$. Later papers (VKD 2003) define exotic matter
   as ANEC-violating; Hochberg-Visser use NEC. MT's own exoticity function appears in two versions
   (Eq. 52 with $|\rho c^2|$; Sec. III F 3 without the absolute value), which is why their Casimir
   note says "$\zeta<0$".
4. **Tidal constraints - confirmed, with detail you may not have expected**: the lateral constraint
   (Eq. 50) contains a $\Phi'$ term as well as the velocity term; the radial one (Eq. 49) has no velocity
   dependence. RHS is $g_\oplus/(c^2\times2\,\text{m})\simeq1/(10^{10}\,\text{cm})^2$ (exactly it is $1/(1.35\times10^{10}$ cm$)^2$).
   Acceleration limit Eq. (44): $|e^{-\Phi}d(\gamma e^\Phi)/dl|\lesssim g_\oplus/c^2\simeq1/(0.97$ l.yr.).
5. **Traversal examples**: the "comfortable hour" ($v\lesssim60$ m/s $(b_0/10$ m), $\Delta t\approx3\times10^3$ s) is for
   the zero-tidal-force $b=(b_0r)^{1/2}$ wormhole with stations at $r=10^4b_0$, where the exotic matter extends
   to infinity. With matter cut off and stations at bearable gravity: $R_s\gtrsim0.6$ AU$(b_0/10\,\text{m})^{1/3}$,
   trip ~7 days$(R_s/10^{11}$ m$)^{1/2}$; insisting on $\rho\ge0$: $R_s\gtrsim600$ AU, trip ~200 days. Only by
   allowing $\rho<0$ can the exotic matter be squeezed into a thin shell (traversal $\gtrsim1$ s$\sqrt{a_0/b_0}$).
6. **Ellis-Bronnikov attribution**: MT's Box 2 metric is exactly the massless Ellis (1973) /
   Bronnikov (1973) wormhole, though MT wrote "we know of no previous studies". Ellis's paper was
   received in 1969. A secondary paper (Shinkai & Hayward 2002) mis-cites Ellis as "14, 395" - the
   correct citation is J. Math. Phys. 14, 104-118 (1973), erratum 15, 520 (1974). Bronnikov's title is
   "Scalar-tensor theory and scalar charge", pp. 251-266.
7. **Thin-shell expressions - confirmed exactly** (Visser NPB 1989 Eq. 5.8 = Poisson-Visser Eq. 11).
   Sign-convention trap: Visser 1989 uses surface **tension** $\vartheta$, Poisson-Visser use surface
   **pressure** $p=-\vartheta$; $\beta^2\equiv\partial p/\partial\sigma$. Visser 1989's equation-of-state parameter $k^2$ ($\vartheta=k^2\sigma$)
   therefore corresponds to $\beta^2=-k^2$.
8. **Poisson-Visser conclusion (refined)**: stability is possible but only for $\beta_0^2\le-1/2$ (with
   $a_0>a_0^-$, large wormholes) or $\beta_0^2\ge3/2+\sqrt3\approx3.23$ (with $2M<a_0<3M$); never for $0<\beta_0^2\le1$.
   The authors do NOT declare stability impossible - they say $\beta_0$ need not be a sound speed and
   $|\beta_0^2|>1$ should not be ruled out a priori.
9. **Lensing formula - confirmed** ($\alpha=2K(k)-\pi$, $k=b_0/b$, modulus convention; weak field
   $\pi b_0^2/4b^2+9\pi b_0^4/64b^4$), but the clean statement is from **Nakajima & Asada 2012**, not from
   Chetouani & Clement 1984 (abstract only; formula not seen). Perlick 2004 and Nandi et al. 2006 give
   it in terms of closest approach. Dey & Sen's approximate formula fails beyond leading order.
10. **"Crystal ball"**: not found in James et al. 2015. What the paper does say: mouths are spheres;
    one sees a lensed image of the other side inside the mouth, extra lensed images at its edge, and an
    Einstein ring. Perlick 2004 quantifies it: the far side fills a disk with $\sin\delta_I=a/\sqrt{r_O^2+a^2}$.
11. **Stability history - beware outdated claims**: Armendariz-Picon 2002 claimed the massless Ellis
    wormhole is stable; Nandi et al. 2006 repeat "stable configuration"; Shinkai & Hayward 2002 (who
    still accepted linear stability) found nonlinear instability; Gonzalez-Guzman-Sarbach 2009 proved
    linear instability (one mode, e-folding $\approx0.6$-$0.85\,r_{\rm throat}/c$). Current status for this model:
    unstable.
12. **VKD "arbitrarily small" is a volume-integral statement**: the ANEC line integral stays finite and
    negative; in their explicit model the throat redshift $e^{\phi}=\epsilon\to0$ (near-horizon throat, my
    observation); Fewster & Roman 2005 argue quantum inequalities force such models to be
    submicroscopic or extremely thin-banded.
13. **MTY prints the Planck-Wheeler length as $1.3\times10^{-33}$ cm**; the AJP paper prints $1.6\times10^{-33}$ cm
    (the standard value is $1.6\times10^{-33}$ cm). Minor, but do not copy the PRL number.
14. **Hayward-Koyama 2004 is not a recipe for astrophysical black holes**: it needs the two-sided
    (eternal) Schwarzschild topology (they say collapse-formed holes presumably lack it), phantom
    radiation, and yields a non-asymptotically-flat wormhole with throat radius $a=2(M+\mu)<2M$.
15. **Visser's flat-face wormhole**: travellers through a flat face meet no matter and no tides, but
    the edges carry $\mu=T=-c^4/(8G)\approx-1.5\times10^{43}$ J/m (negative-tension strings), and stability was
    left open.
16. **Kruskal citation error in MT AJP**: MT's reference 17 prints "M. D. Kruskal, Phys. Rev. 116, 1743
    (1960)" (checked on the scan); the correct reference (Crossref) is M. D. Kruskal, "Maximal Extension
    of Schwarzschild Metric", Phys. Rev. **119**(5), 1743-1745 (1 Sept 1960), DOI 10.1103/PhysRev.119.1743,
    as MTY correctly cite it.

Open questions / not accessed (could not verify at primary level):
- Einstein & Rosen 1935 and Fuller & Wheeler 1962: full texts not read (APS paywall, HTTP 403); only
  abstracts (via INSPIRE). The ER substitution $u^2=r-2m$ is from a secondary source.
- Bronnikov 1973: not accessed at all (journal site down/expired certificate).
- Ellis 1973: abstract only.
- Chetouani & Clement 1984: abstract only.
- Visser 1995 book: bibliographic only.
- Gonzalez-Guzman-Sarbach II, Hayward 2009, Friedman-Schleich-Witt, Geroch, Tipler, Ford-Roman,
  Fewster-Roman, Armendariz-Picon: abstract-level (or partial) only.
- MT AJP full text was read from a third-party Internet Archive scan, not the publisher's PDF.
