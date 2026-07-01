# Wavelet coherence-based classifier: A resting-state functional MRI study on neurodynamics in adolescents with high-functioning autism (Antoine Bernas, Albert P. Aldenkamp, Svitlana Zinger, 2018)

*Computer Methods and Programs in Biomedicine 154 (2018) 143–151. https://doi.org/10.1016/j.cmpb.2017.11.017*

## Overview

The paper proposes a novel MRI-based biomarker for autism spectrum disorder (ASD) built on the **temporal dynamics** of resting-state brain networks rather than their static topology. The authors argue that "not the topology of networks, but their temporal dynamics is a key feature in ASD," and they operationalize this by measuring synchronicity between pairs of resting-state networks (RSNs) over time using **wavelet coherence**.

- **Problem:** ASD diagnosis is long, subjective, and behavior-based; prior fMRI/functional-connectivity classifiers barely reach ~80% accuracy and rarely replicate across sites.
- **Contribution:** A new dynamics metric — **"time of in-phase coherence"** — extracted from wavelet coherence maps between RSN time series, used as features for ASD classifiers (LDA, polynomial-SVM, RBF-SVM). They state this is "the first study of temporal dynamics between brain networks evaluating pairwise synchronicity using wavelet coherence."
- **Data:** Two independent adolescent datasets — in-house (12 ASD, 12 controls) and the Leuven dataset from ABIDE (12 ASD, 18 controls).
- **Key results:** 86.7% accuracy distinguishing ASD from controls on the in-house data (91.7% sensitivity, 83.3% specificity) and 86.7% on Leuven; cross-site generalization (train in-house, test Leuven) reached 80% accuracy (100% sensitivity, 66.7% specificity). Discriminative dynamics concentrated around **~10 s periods**, especially for ventral-stream pairings (VENT–FPR, VENT–FPL). Notably, the **spatial** RSN maps showed no significant ASD-vs-control differences in either dataset — only the **temporal** between-network dynamics separated the groups, reinforcing that the effect is about dynamics, not topology.

The work is explicitly about ASD and about characterizing temporal dynamics (synchronicity, lead/lag) between large-scale resting-state networks.

## Method

**1. From rs-fMRI to RSN time series (group ICA + dual regression).**
After standard preprocessing (FSL FEAT: motion correction, MNI registration, 4 mm FWHM smoothing, high-pass filtering at 100 s / 0.01 Hz), the authors run a **temporally concatenated group Independent Component Analysis** (FSL MELODIC, 34 components) to obtain spatial RSN maps shared across subjects. Relevant networks are selected by discarding high-frequency (>0.1 Hz) noise components and matching against the Smith et al. (2009) 10-network templates via a goodness-of-fit measure, plus visual validation. They focus on **seven socio-executive networks**: ventral stream (VENT), central-executive (EXE), fronto-parietal left/right (FPL, FPR), auditory (AUDI), visual (VISU), and default mode (DMN). A **dual regression** then projects the group maps back into each subject's data to recover **subject-specific RSN time series** (the first dual-regression output), which feed the wavelet analysis.

**2. Wavelet coherence between network pairs.**
For each subject, wavelet coherence is computed between every pair of RSN time series (21 pairs from 7 networks). Following Torrence & Compo and the Grinsted wavelet coherence toolbox, wavelet coherence defines R²(s, τ) as a **local correlation coefficient in time (τ) and wavelet scale (s)** between two signals, derived from the wavelet cross-spectrum (common power across scales and time). A **complex Morlet wavelet** is used (chosen for its ~1.03 Fourier-period-to-scale ratio, which makes frequency interpretation clean). The result is a per-pair, per-subject **scalogram** with time on the x-axis and wavelet scale / Fourier period on the y-axis. Significance is established by Monte Carlo testing against 1000 red-noise (AR1) surrogate pairs to define a 5% significance contour (the threshold a95); only coherence above this is counted.

**3. Phase information → directionality.**
Because the Morlet wavelet is complex, the cross-spectrum carries **phase**: the phase difference between signals X and Y is arg(R²(t, s)). This phase classifies each significant time-scale point into one of four relationships — **in-phase, anti-phase, X-leads-Y (leading), or Y-leads-X (lagging)** — giving directionality to the dynamics between two networks. In their example figure the coherence map is colored by phase: red = in phase, green = anti-phase, orange = DMN leads AUDI, light blue = AUDI leads DMN, dark blue = no coherence.

**4. "Time of in-phase coherence" metric.**
For each wavelet scale (Fourier period), they compute the percentage of time points that are both **significant** (R² > a95) and **in-phase** (phase within ±π/4, i.e. −45° to +45°). Concretely it is the ratio of the in-phase "red area" over the full 7-minute scan length for a given row (period) of the scalogram, expressed as a percentage — "the level/density of coherent synchronicity between two RSNs over time." This is computed **per scale/period within the scan**, so the dynamics are characterized across wavelet scales (periods spanning roughly 4 s to 128 s, with 12 subscales per octave across 5 octaves), not as a single scalar.

**5. Classification.**
The per-pair, per-period in-phase coherence values become feature vectors for LDA and SVM (polynomial and RBF) classifiers, validated with leave-one-out cross-validation and cross-site testing. The most discriminative features were ventral-stream pairings around ~10 s periods.

## Key facts & quotes

- **Temporal dynamics over topology (motivation):** *"There is, nevertheless, evidence that not the topology of networks, but their temporal dynamics is a key feature in ASD. We therefore propose a novel MRI-based ASD biomarker by analyzing temporal brain dynamics in resting-state fMRI."* — frames why dynamic, directional connectivity matters.

- **Applying wavelet coherence between RSNs (novelty):** *"Using the aforementioned selected RSN time series, wavelet coherence maps between pairs of brain networks can be drawn."* and *"To our knowledge, this is the first study of temporal dynamics between brain networks evaluating pairwise synchronicity using wavelet coherence."* — supports computing wavelet coherence between resting-state-network time series.

- **Phase gives directionality (core for our pipeline):** *"Also as we used a complex wavelet (Morlet) it provided us with phase information, allowing visualization of directionality in the dynamics between signals (in-phase, leading, lagging, or anti-phase)."* — the four-way phase classification our tool reproduces.

- **Phase coloring / lead-lag interpretation:** *"Colors within the areas determined the phase difference between the two networks (DMN and AUDI): signals are in phase (red), anti-phased (green); DMN leads AUDI (orange), and AUDI leads DMN (light blue). Outside the delineated area, there is no coherence (dark blue)."* — explicit mapping from phase to directional lead/lag, including the "no coherence" state.

- **The metric definition:** *"By combining the wavelet coherence coefficients R²(s, τ) and their phase information arg(R²(t, s)), we measured the average of time of in-phase coherence, per wavelet scale (Fourier period) ... which can be seen as the level/density of coherent synchronicity between two RSNs over time."* — defines the in-phase coherence metric across scales.

- **Coherence is local in time and scale:** *"Cross-wavelet transform provides information of localized (in time and frequency) correlations between temporal signals. It is also possible to derive from the wavelet transforms the phase shift between two signals."* — justifies wavelet coherence as a time-resolved (non-stationary) connectivity measure.

## Relevance to our tool

This paper is the **methodological source** for the phase classification used in our wavelet pipeline. Our HDF5 `angle_maps` encode exactly the four phase relationships described here — in-phase, leading, lagging, anti-phase — derived from the complex Morlet cross-wavelet phase angle arg(Wxy), with masking outside the cone of influence / below the significance (R²) threshold corresponding to their "no coherence (dark blue)" state. Specifically:

- Their phase categories map directly to our `PHASE_IN_PHASE`, `PHASE_LEAD`, `PHASE_LAG`, `PHASE_ANTI`, and `PHASE_NONE` constants and the ±45°/±135° angle boundaries used in `my_wtc_MORLET_pSJC.m`.
- Their "X leads Y / Y leads X" directionality is the basis for our **asymmetric, directional edges** (leader → follower) that distinguish wavelet from the symmetric Pearson/Spearman methods.
- Their "time of in-phase coherence" (ratio of in-phase points over the scan, per scale) is the conceptual ancestor of our **leading-ratio** metric (`n_lead / n_all` counted in a sliding window), though our runtime metric counts lead events rather than in-phase events.
- The pipeline they describe — group ICA + dual regression to extract RSN time series, then Morlet wavelet coherence between network pairs — is the same upstream chain that produces the data our visualization consumes.

When citing this work, it supports: (a) using wavelet coherence to measure time-resolved connectivity between resting-state networks, (b) extracting phase-based directionality (lead/lag/in-phase/anti-phase) from a complex Morlet wavelet, and (c) the relevance of between-network temporal dynamics specifically to autism.
