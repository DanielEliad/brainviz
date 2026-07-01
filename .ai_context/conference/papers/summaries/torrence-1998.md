# A Practical Guide to Wavelet Analysis (Christopher Torrence & Gilbert P. Compo, 1998)

*Bulletin of the American Meteorological Society, Vol. 79, No. 1, pp. 61–78.*

## Overview

This paper is a step-by-step practical guide to the **continuous wavelet transform (CWT)**, written for working scientists rather than mathematicians. Using time series of the El Niño–Southern Oscillation (ENSO) as a running example, it covers the entire workflow: choosing a wavelet basis function, handling edge effects in finite-length data, converting wavelet scale to a physically meaningful Fourier period, and — its central original contribution — a rigorous **statistical significance test** for wavelet power spectra against a white- or red-noise background.

Its lasting importance is that contribution. Before this paper, wavelet analysis was widely seen as producing "colorful pictures, yet purely qualitative results." Torrence and Compo derived the theoretical white- and red-noise wavelet spectra, validated them against Monte Carlo simulations (100,000 surrogate series), and showed that wavelet power is chi-square distributed, so peaks can be tested for significance at a given confidence level. This turned wavelet analysis into a quantitative tool. The paper also sketches extensions — filtering, the power Hovmöller, the **cross-wavelet spectrum**, and **wavelet coherence and phase** — that are exactly the tools used for relating two signals. Because it pairs accessible exposition with freely distributed software, it has become the standard, near-universally cited reference for applied continuous wavelet analysis across geophysics, neuroscience, and beyond.

## Method

**The core idea.** The continuous wavelet transform decomposes a one-dimensional time series into a two-dimensional **time–frequency** (more precisely time–scale) picture. This lets you see not only *which* oscillation periods dominate a signal, but *when in time* each period is active — something a plain Fourier transform cannot show, because Fourier gives only a single global spectrum with no time information.

**How it works.** You take a *wavelet* — a short, wave-like, zero-mean function localized in both time and frequency — and slide it along the time series. At each position you also **stretch or compress** it (this is the *scale*, `s`): a small scale captures rapid, high-frequency wiggles; a large scale captures slow, low-frequency variation. The wavelet transform `W_n(s)` is the convolution of the data with this scaled, shifted wavelet (computed efficiently in Fourier space). Its squared magnitude, `|W_n(s)|²`, is the **wavelet power spectrum**: a map of how much energy sits at each time `n` and each scale `s`.

**The Morlet wavelet.** The paper's default choice is the **Morlet wavelet** — a plane wave (a complex sinusoid) modulated by a Gaussian envelope (equation 1), with nondimensional frequency `ω₀ = 6`. Being *complex*, it returns both **amplitude and phase**, which makes it well suited to oscillatory signals and is what makes cross-wavelet phase and coherence possible. To be admissible, a wavelet must have zero mean and be localized in both time and frequency.

**Scale vs. Fourier period.** Wavelet scale is not directly a frequency, so the paper derives the conversion between scale and the equivalent **Fourier period** for each wavelet (analytically, by feeding in a cosine of known frequency). For the Morlet with `ω₀ = 6` the relationship is almost one-to-one: `λ = 1.03 s`, so scale and Fourier period are nearly interchangeable. The authors stress converting scale to period before plotting so that wavelet power can be equated with a familiar oscillation period.

**Cone of influence (COI).** Because real time series are finite, the transform (which treats data as cyclic, and is typically zero-padded) is distorted near the start and end, increasingly so at larger scales where the wavelet is wider. The **cone of influence** marks the region where these edge effects matter — defined as the e-folding time over which the power from an edge discontinuity decays by `e⁻²`. Features inside the COI should be interpreted with caution.

**Significance testing against red noise.** Many geophysical (and physiological) signals resemble **red noise**: power rising toward lower frequencies, modeled by a lag-1 autoregressive **AR(1)** process whose single parameter is the lag-1 autocorrelation `α` (`α = 0` reduces to flat white noise). The authors show the local wavelet power spectrum of such a process follows the theoretical AR(1) Fourier spectrum, and that wavelet power is **chi-square distributed** (two degrees of freedom for a complex wavelet like the Morlet, one for a real wavelet). Multiplying the background spectrum by the appropriate chi-square percentile yields, e.g., a **95% confidence contour**: power enclosed by it is unlikely to be noise. Smoothing in time or scale raises the degrees of freedom and so increases confidence.

## Key facts & quotes

- **Time–frequency decomposition (the central concept):** "By decomposing a time series into time–frequency space, one is able to determine both the dominant modes of variability and how those modes vary in time." — the one-sentence definition of what the CWT delivers.

- **Why not Fourier / windowed Fourier:** the WFT "imposes a scale or 'response interval' T into the analysis," whereas wavelet analysis is "a method of time–frequency localization that is scale independent" — the motivation for using wavelets when many timescales coexist.

- **Localization in both time and frequency:** to be admissible "this function must have zero mean and be localized in both time and frequency space" — the defining property that gives wavelets simultaneous time and frequency resolution.

- **The time/frequency resolution trade-off:** "A narrow (in time) function will have good time resolution but poor frequency resolution, while a broad function will have poor time resolution, yet good frequency resolution." — supports why wavelet choice (Morlet vs. Paul vs. DOG) matters.

- **Scale vs. Fourier period:** "For the Morlet wavelet with ω₀ = 6, this gives a value of λ = 1.03s, where λ is the Fourier period, indicating that for the Morlet wavelet the wavelet scale is almost equal to the Fourier period." — justifies labeling Morlet wavelet axes directly in period/frequency.

- **The cone of influence:** "The cone of influence (COI) is the region of the wavelet spectrum in which edge effects become important and is defined here as the e-folding time for the autocorrelation of wavelet power at each scale." — supports masking/de-emphasizing edge regions in any wavelet plot.

- **Coherence needs smoothing:** for wavelet coherence, the un-smoothed "coherence is identically one at all times and scales... this problem is circumvented by smoothing the cross-spectrum before normalizing." — the key caveat behind every wavelet-coherence pipeline.

## Relevance to our tool

Our brain-network visualization uses **wavelet coherence** to measure dynamic functional connectivity between resting-state networks, and this paper is the methodological bedrock for that choice:

- **Time-resolved connectivity.** The whole reason we use wavelets rather than a single static correlation is exactly the paper's headline: decomposing each RSN time series into time–frequency space lets us see *how connectivity changes over time*, frame by frame, instead of one global number.

- **Morlet wavelet and phase.** Our pipeline computes wavelet coherence with the **Morlet wavelet**, and our phase classification (lead / lag / in-phase / anti-phase, the `PHASE_*` codes in the wavelet HDF5 data) depends directly on the **complex** wavelet's phase angle. The paper explains why a complex wavelet is required to recover that phase information at all.

- **Scale ≈ period.** Because Morlet scale maps almost 1:1 to Fourier period, the wavelet scales in our `wavelet.h5` data correspond directly to interpretable oscillation periods of the BOLD signal — useful when describing which timescale a connectivity event lives at.

- **Cone of influence.** The COI concept carries straight into our data (the `coi_per_sub` / `incoi` masking in the MATLAB pipeline): coherence values near the start and end of each scan are edge-affected and are masked to `PHASE_NONE`, exactly as Torrence & Compo prescribe.

- **Significance against a noise background.** Our upstream MATLAB coherence computation masks insignificant regions (`Rsq < 0.5`, outside COI, not significant) — the practical descendant of this paper's red-noise / Monte Carlo significance framework, ensuring that the connectivity edges we visualize reflect real coherence rather than noise.

- **Coherence requires smoothing.** The paper's warning that raw wavelet coherence is trivially 1 everywhere unless smoothed underlies the smoothing step in any coherence toolbox (including the Grinsted-derived code our data is built on), which is worth stating in a methods section.

In short, citing Torrence & Compo (1998) establishes that our connectivity measure rests on the standard, statistically grounded formulation of the continuous wavelet transform and wavelet coherence.
