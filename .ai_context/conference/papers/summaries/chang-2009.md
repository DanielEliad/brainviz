# Time–frequency dynamics of resting-state brain connectivity measured with fMRI (Catie Chang & Gary H. Glover, 2010)

*NeuroImage 50 (2010) 81–98. Department of Electrical Engineering & Department of Radiology, Stanford University.*

## Overview

**The problem.** Most resting-state functional connectivity (FC) studies treat connectivity as **static** — they compute a single correlation (or ICA decomposition) over the entire scan, implicitly assuming the relationship between regions is **temporally stationary**. Chang & Glover challenge this assumption: "Most studies of resting-state functional connectivity using fMRI employ methods that assume temporal stationarity, such as correlation and data-driven decompositions computed across the duration of the scan. However, evidence from both task-based fMRI studies and animal electrophysiology suggests that functional connectivity may exhibit dynamic changes within time scales of seconds to minutes." The central question is whether resting-state FC is genuinely constant across a scan, or whether its strength *and direction* fluctuate over time.

**What they did.** They applied a **time–frequency coherence analysis based on the wavelet transform (wavelet transform coherence, WTC)** to resting-state fMRI from 12 healthy adults (12–15 min scans). The analysis centered on the **posterior cingulate cortex (PCC)**, a primary node of the default-mode network (DMN), examining its relationship both with the "anticorrelated"/"task-positive" network and with other DMN nodes. They complemented WTC with a whole-brain **sliding-window correlation** analysis to find regions whose connectivity to the PCC varied most over the scan, and used **Monte Carlo significance testing** (VAR/AR bootstrap surrogates) to ask whether the observed variability exceeds what a stationary model would produce.

**Key findings.**
- Coherence and phase between the PCC and the anticorrelated network were **variable in both time and frequency**; significant coherence was often **focal in time** — information that a single stationary analysis would average away.
- Statistical testing revealed **significant scale-dependent temporal variability** beyond that expected from a stationary VAR model — i.e., resting-state connectivity is **not static**.
- Negative (anticorrelated) coupling appeared as **temporally-localized periods of strong negative correlation** rather than a steady weak negative correlation. Across the scan, sliding-window correlations for some regions/subjects swung **from positive to negative** over time.
- Variability was greatest in regions tied to **attention and salience processing** (e.g., ACC, inferior parietal, orbitofrontal). Time-averaged coherence with the anticorrelated network peaked around a period of **T ≈ 32 s (~0.03 Hz)**.
- Variability was **not explained by head motion, scanner, or breath-holding** confounds, though the authors cannot definitively attribute it to cognitive-state modulation versus residual noise.

The takeaway for the field: measures of **variability**, not just average connectivity, are valuable when characterizing resting-state networks.

## Method — how wavelet transform coherence (WTC) is applied to fMRI

**Why wavelets.** A standard correlation gives one number for an entire time series; a Fourier coherence gives one value per frequency but assumes stationarity. Wavelets instead **decompose a single time series into time–frequency space** so connectivity can be tracked simultaneously across *when* and *at what frequency* it occurs. As the authors put it, WTC analyzes "the coherence and phase lag between two time series **as a function of both time and frequency**."

**Wavelet decomposition.** The continuous wavelet transform convolves the time series with **scaled and translated copies of a mother wavelet**. They use the **complex Morlet wavelet** with parameter ω₀ = 6, "which has been shown to provide a good trade-off between time and frequency localization." Each wavelet **scale** maps to a Fourier **period/frequency** (for Morlet ω₀=6, period T ≈ scale s). The transform W_X(n,s) is complex: its **modulus** is the signal's power at that time and frequency, and its **angle** is the local phase.

**Cross-wavelet and coherence.** For two regions x and y, the **cross-wavelet transform** W_XY = W_X · W_Y\* has a modulus (cross-wavelet power = joint power between the two signals at each time/frequency) and an angle (the **cross-wavelet phase**, the relative phase between the two signals). The **wavelet transform coherence** R²(n,s) normalizes the smoothed cross-wavelet power by the smoothed individual powers. Crucially, "R² ranges between 0 and 1, and can be conceptualized as **a localized correlation coefficient in time and frequency space**." It reveals "localized regions of phase-locked behavior."

**Phase → lead/lag (directionality).** The phase angle ϕ at each point of the time–frequency plane encodes the *directional* relationship between regions:
- ϕ = 0 → signals **in phase** (positive correlation).
- ϕ = π → **anticorrelation** (negative correlation).
- ϕ = +π/2 → the **PCC (seed) leads** the other region.
- ϕ = −π/2 → the **other region leads the PCC**.

In their figures, phase is shown as an arrow on the time–frequency map (rightward = in phase, leftward = anticorrelated, up/down = the ±π/2 lead/lag cases) and later color-coded into discrete phase ranges (ϕ ± π/4). This phase-as-lead/lag is exactly the directional connectivity signal.

**Seed region.** Connectivity is computed **pairwise** between a **seed** and target regions. The seed here is a 3-mm-radius sphere in the **posterior cingulate cortex (PCC)** at MNI (−6, −58, 28), a primary DMN node. WTC was computed between the PCC and 6 anticorrelated ROIs (SMG, DLPFC, insula) and 3 DMN ROIs (MPFC, L/R angular gyrus).

**Smoothing in time and scale.** Coherence requires smoothing, otherwise R² would trivially equal 1 everywhere. The angle brackets in the coherence formula "indicate smoothing in both time and scale: the filter for **temporal smoothing is a Gaussian function**, matched to the Morlet wavelet; the **scale smoothing is a boxcar filter**." This smoothing is why WTC has poorer time/frequency resolution than the raw cross-wavelet power.

**Cone of influence.** Near the start/end of the record, and especially at long periods (large scales), edge effects reduce confidence; these regions form the **"cone of influence" (COI)** and are excluded or down-weighted. Larger scales pull more time points into the COI because broad wavelets span nearly the whole record.

**Significance testing.** Two Monte Carlo tests using bootstrapped surrogate time series:
1. **Coherence magnitude** — fit an autoregressive (AR) model to each signal, generate ~300 independent surrogate pairs, and threshold R² at the 95% level (figures show only pixels exceeding this).
2. **Temporal variability** — fit a **stationary vector autoregressive (VAR)** model jointly to the pair (capturing their stationary relationship), generate 1000 surrogate pairs with the *same* VAR coefficients, and compute a null distribution of the WTC's complex variance **per scale**. Real-data variability exceeding this null implies genuine **non-stationarity** beyond a stationary relationship. Scales are treated independently because WTC smoothness is scale-dependent; only points outside the COI are used.

**Summarizing the maps.** Because full WTC maps are information-rich, they summarize along reduced dimensions: **time-averaged coherence** c(s,ϕ) (how much significant coherence falls in each phase range at each scale), **scale-dependent variability**, and the **standard deviation of sliding-window correlations**.

## Key facts & quotes

- *"Wavelet transform coherence (WTC) is a method for analyzing the coherence and phase lag between two time series **as a function of both time and frequency**."* — Establishes WTC's core advantage over static correlation/Fourier coherence: it localizes connectivity jointly in time and frequency.

- *"R² ranges between 0 and 1, and can be conceptualized as a **localized correlation coefficient in time and frequency space**."* — The single most useful framing for a general audience: wavelet coherence ≈ a correlation coefficient computed locally at each moment and frequency.

- *"...functional connectivity may exhibit dynamic changes within **time scales of seconds to minutes**."* — Motivates the whole enterprise: connectivity changes on sub-scan timescales, so a scan-long average can mislead. (Their sliding windows of 2 and 4 min operationalize this.)

- *"A phase difference of 0 indicates positive correlation; π indicates negative correlation; **π/2 indicates that the PCC ROI leads the anticorrelated ROI; −π/2 indicates that the anticorrelated ROI leads the PCC**."* — The explicit definition of phase as directional **lead/lag** between regions.

- *"...significant coherence was often **focal in time**, information that would be lost if performing a single (stationary) Fourier coherence analysis across the entire time series."* — Empirical justification that the dynamics are real and that stationary methods discard them.

- *"...the present results illustrate that **resting-state functional connectivity is not static**, and it may therefore prove valuable to consider measures of variability, in addition to average quantities, when characterizing resting-state networks."* — The paper's headline conclusion.

## Relevance to our tool

This paper is the **closest published precedent** for what our visualization does: applying **wavelet transform coherence and phase lead/lag to resting-state fMRI to obtain time-varying, directional connectivity between brain networks.**

- **Same core method.** Our wavelet pipeline (Morlet wavelet, cross-wavelet phase, coherence R², cone of influence, significance masking via Monte Carlo surrogates) is the same WTC machinery Chang & Glover use. Our `data/wavelet_new/` MATLAB scripts and the phase classifications stored in `wavelet.h5` (PHASE_LEAD/PHASE_LAG/PHASE_IN_PHASE/PHASE_ANTI/PHASE_NONE) are a direct, discretized realization of their phase-angle scheme — their continuous ϕ binned into ranges of ϕ ± π/4 (in-phase, lead, lag, anti) is precisely our five-way phase coding, and their Rsq < 0.5 / outside-COI / not-significant masking is our PHASE_NONE.

- **Directionality is the selling point.** Their definition of **+π/2 = seed leads, −π/2 = target leads** is exactly the **leader → follower** edge semantics our tool renders (asymmetric edges; "leadership proportion" weights). They show this lead/lag is *variable over time* — which is the entire reason an animated, frame-by-frame visualization is more faithful than a static graph.

- **Validates dynamic over static.** Their central result — connectivity varies on **seconds-to-minutes** scales and stationary analyses lose "focal in time" coherence — is the scientific rationale for our sliding-window, animated approach. We can cite them for: (1) the "localized correlation coefficient in time and frequency" framing of coherence, (2) phase as directional lead/lag, and (3) the seconds-to-minutes non-stationarity that motivates visualizing dynamics rather than a single averaged matrix.

- **Differences worth noting.** Chang & Glover analyze a **single seed (PCC) paired against a handful of ROIs** and summarize the rich WTC maps into reduced metrics (time-averaged coherence, scale-dependent variability). Our tool generalizes this to **all 14 RSN pairs simultaneously** and presents the dynamics directly as an animated network rather than as static summary plots — addressing exactly the challenge they flag: *"the wealth of information provided by a time–frequency analysis of connectivity ... presents additional challenges when studying multiple subjects and spatial locations."* A network visualization is one answer to that challenge.
