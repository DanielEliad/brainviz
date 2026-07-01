# Objective biomarkers of depression: A study of Granger causality and wavelet coherence in resting-state fMRI (Cîrstian, Pilmeyer, Bernas, Jansen, Breeuwer, Aldenkamp & Zinger, 2023)

*Journal of Neuroimaging, 2023;1–11. DOI: 10.1111/jon.13085*

## Overview

The paper tackles the lack of an **objective diagnostic biomarker for depression**. Diagnosis today rests on subjective symptomatic criteria, so the authors set out to derive image-based features from resting-state fMRI that can classify depressed vs. control subjects automatically and, importantly, in an *explainable* way.

They analyze resting-state network (RSN) time series with two families of methods — **wavelet coherence** and **Granger causality (G-causality)** — and introduce **three new wavelet-coherence features** plus one causality feature:

1. **Total wavelet coherence** — binarize the wavelet coherence map (any coherence type → 1), count the coherent elements and average over periods. Measures the *total duration/presence* of any coherence between two networks (non-directional).
2. **Wavelet lead coherence** — count only the time-frequency points where one network *leads* the other, averaged over Fourier periods. **Directional**, and explicitly framed as comparable to Granger causality.
3. **Wavelet coherence blob analysis** — count "blobs" (clusters of adjacent nonzero coherence) in the map, measuring how often coherence switches on/off (discontinuity). Non-directional, novel.
4. **Pairwise conditional Granger causality (PCGC)** — directed causal score per RSN pair from a vector-autoregression (MVGC) toolbox.

**Pipeline:** 72 subjects from OpenNeuro (ds002748; 50 depressed + 21 control after one discard), 4-min eyes-closed rs-fMRI, TR 2.5 s. FSL preprocessing + ICA denoising, group ICA, dual regression → **12 RSN time series** per subject. All RSN pair permutations (12×12 − identical = **132 pairs**). Features computed per pair, ranked with the **MRMR** feature-selection algorithm, classified with **SVM (degree-4 polynomial)** and **decision tree**, validated by leave-one-out cross-validation.

**Key results (decision tree, best):** wavelet lead coherence **86%** accuracy (AUC .83), wavelet coherence blob analysis **86%** (AUC .84), Granger causality **80%** (AUC .76), total wavelet coherence **80%** (AUC .76). Depression showed hyperconnectivity DAN–AUDI and DMN2(posterior)–DAN, hypoconnectivity DMN1(anterior)–AUDI and FPR–VISU2, and abnormal CEREB–LMN co-activation (blob analysis). Top lead-coherence pairs: **DAN–AUDI** and **DMN1–DAN**.

## Method

**Wavelet coherence between RSN pairs.** Wavelet analysis decomposes a time series jointly in time and frequency (here using the **Morlet** wavelet, chosen for its frequency/time resolution). For a pair of RSN time series, the **cross-wavelet transform** gives common power and **phase** at every point in time (x-axis) and every period/scale (y-axis), producing a 2-D wavelet coherence map. The faded margins of the map are the *cone of influence* where edge effects may corrupt values. There are **50 Fourier periods** (scales) in each map.

**Phase → directionality.** From the cross-wavelet **phase angle** at each time-frequency point, the relationship between the two signals is classified into one of several types: **in-phase** (synchronous activation), **antiphase** (anticorrelated activation), **lead**, or **lag** — or no significant coherence. Lead/lag patterns are interpreted as *potential causality*: one network's activation precedes (leads) or follows (lags) the other's. This is the directional information the lead-coherence feature exploits.

**Wavelet lead coherence (the directional measure).** From the same coherence map, take only the elements whose phase indicates that **RSN1 leads RSN2** — i.e., sum/count the time-frequency points where signal X leads signal Y. This counts *how much time signal X spent leading signal Y*, which the authors state is "comparable to the G-causality since it is an indicator that network Y causes X." Because wavelet coherence also carries frequency information, the count is performed **for each of the 50 Fourier periods and then averaged across all 50 periods** to give a single number per RSN pair per participant — the **average lead time** between RSN1 and RSN2. The resulting feature matrix is participants × pairs (71 × 132). Unlike total coherence and blob analysis, this feature is **directional** (RSN1→RSN2 differs from RSN2→RSN1), which is why its summary diagram (Figure 6) uses arrows, exactly like the Granger-causality diagram.

**Granger causality (for comparison).** PCGC is computed with the MVGC MATLAB toolbox (vector-autoregression). Each matrix element is a directed pairwise causal score; the matrix serves directly as a classifier feature vector. It is the established directional benchmark against which wavelet lead coherence is positioned.

## Key facts & quotes

- **Definition of wavelet lead coherence (verbatim):** "The lead coherence was extracted from the wavelet coherence map obtained in the previous stage (sum of elements indicating a lead of activation of RSN1 with regard to RSN2)." — the precise operational definition: a sum/count over time-frequency map elements flagged as "RSN1 leads RSN2."

- **Directionality + comparison to Granger causality (verbatim):** "Lead coherence tells us how much time signal X spent leading signal Y and is therefore comparable to the G-causality since it is an indicator that network Y causes X." — establishes that lead coherence is a *directional* connectivity measure on par with G-causality.

- **Averaging over periods (verbatim):** "In this case, we have obtained 50 separate Fourier periods that we have averaged to simplify the interpretation of the results of this metric. Therefore, for each participant the wavelet lead coherence algorithm counts the time RSN1 leads RSN2 for each period and then averages over all 50 periods to obtain a matrix where each participant is assigned one number—the average lead time between RSN1 and RSN2." — supports the per-period count → average-over-periods construction.

- **Phase gives the four directional types (verbatim):** "Based on the cross-wavelet phase, we can deduce a directionality in the coherence between time series (in-phase, antiphase, lead, and lag)... Lead and lag patterns reflect potential causality (one network activates another network or vice versa)." — supports the in-phase/antiphase/lead/lag classification and its causal interpretation.

- **Map content (verbatim):** "The map of the wavelet lead coherence contains only nonzero values for the elements of the coherence map that correspond to the time when RSN1 leads RSN2." — confirms the lead map is the coherence map masked to lead-only elements (Figure 4C).

- **Performance / standing (verbatim):** "The highest performing metrics involved in depression were the wavelet lead coherence, G-causality, and wavelet coherence blob analysis (86%, 80%, and 86% accuracy, respectively)... The first two metrics measure the amount of causality between brain regions." — wavelet lead coherence is a top performer and is explicitly grouped with G-causality as a causality/directional metric.

## Relevance to our tool

This paper is the **direct source and namesake** for our per-window "wavelet lead coherence" directional connectivity measure. Our tool computes, for each RSN pair and each time window, the **fraction of time-frequency points where one network leads the other** — exactly the "sum of elements indicating a lead of activation of RSN1 with regard to RSN2," with our windowing playing the role of their global count and our per-pair directional value mirroring their average lead time. Key correspondences:

- Their **lead/lag/in-phase/antiphase** phase classification is the same scheme encoded in our wavelet HDF5 `angle_maps` (PHASE_LEAD = +1, PHASE_LAG = −1, PHASE_IN_PHASE = +2, PHASE_ANTI = −2, PHASE_NONE = 0).
- Their measure is **directional and asymmetric** (RSN1→RSN2 ≠ RSN2→RSN1), matching our asymmetric wavelet matrices where both `matrix[i,j]` and `matrix[j,i]` are populated and edges are drawn leader→follower.
- Their framing of lead coherence as "comparable to G-causality" is the justification for treating our directional edges as a lightweight, explainable effective-connectivity / leadership indicator.
- Note one difference: they average the lead count over all 50 Fourier periods to a single scalar per pair per subject (no time dimension), whereas our tool retains **time via sliding windows** to drive a dynamic visualization. The per-element lead definition is identical; we just preserve the temporal axis they collapse.

---

### Plain-language essence of "wavelet lead coherence"

Wavelet lead coherence measures, for a pair of brain networks, **how much of the time one network's activity consistently runs slightly ahead of (leads) the other's**, looked at across all timescales at once. It is built by taking the wavelet coherence map — which labels every moment and frequency as the two signals being in-phase, anti-phase, or one leading/lagging the other — and simply counting up the lead points for that network, then averaging across frequencies. Because "A leads B" is not the same as "B leads A," it is a **directional** connectivity measure, giving a directionality estimate comparable to Granger causality but derived straight from the time-frequency phase rather than from a predictive statistical model.
