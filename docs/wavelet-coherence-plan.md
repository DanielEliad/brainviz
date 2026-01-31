# Wavelet Coherence Correlation - Implementation Plan

## Overview

Wavelet Transform Coherence (WTC) is a method for analyzing the coherence and phase lag between two time series as a function of **both time and frequency**. Unlike traditional correlation methods (Pearson, Spearman) that produce a single value per node pair, wavelet coherence produces a **2D time-frequency map** showing how the relationship between signals varies across different frequency bands over time.

This makes it particularly valuable for fMRI/brain connectivity analysis where:
- Different brain processes operate at different frequencies
- Connectivity patterns are dynamic and change over time
- Phase relationships (lead/lag) between regions provide directional information

## Key Concepts

### What Wavelet Coherence Measures

1. **Coherence Magnitude (0-1)**: How strongly two signals are correlated at a specific frequency and time
2. **Phase Angle**: The relative timing/phase relationship between the signals
   - **In-phase (0°)**: Signals rise and fall together
   - **Anti-phase (180°)**: Signals are inversely related
   - **Lead/Lag (±90°)**: One signal leads or lags the other

### Phase Arrow Interpretation

| Arrow Direction | Meaning |
|----------------|---------|
| → Right | In-phase (positively correlated) |
| ← Left | Anti-phase (negatively correlated) |
| ↓ Down | Signal X leads Signal Y by 90° |
| ↑ Up | Signal Y leads Signal X by 90° |

Reference: [Grinsted Wavelet Coherence FAQ](http://grinsted.github.io/wavelet-coherence/faq/phase-arrows)

## Frequency Bands for fMRI

For resting-state fMRI, the relevant frequency range is typically **0.01-0.1 Hz**. Common sub-bands used in research:

| Band Name | Frequency Range | Description |
|-----------|-----------------|-------------|
| Slow-5 | 0.01-0.027 Hz | Very slow fluctuations |
| Slow-4 | 0.027-0.074 Hz | Primary resting-state band |
| Slow-3 | 0.074-0.199 Hz | Higher frequency (may include noise) |

The choice of bands depends on the **TR (repetition time)** of the fMRI acquisition, which determines the Nyquist frequency (maximum detectable frequency = 1/(2*TR)).

Reference: [Frontiers - Wavelet-Based Amplitude of Resting-State fMRI](https://www.frontiersin.org/journals/neuroscience/articles/10.3389/fnins.2020.00224/full)

## Mathematical Background

### Continuous Wavelet Transform (CWT)

The CWT decomposes a signal into time-frequency space using a mother wavelet (typically Morlet):

```
W(s,τ) = ∫ x(t) * ψ*((t-τ)/s) dt
```

Where:
- `s` = scale (inversely related to frequency)
- `τ` = translation (time position)
- `ψ` = mother wavelet function
- `*` = complex conjugate

### Cross-Wavelet Transform

For two signals X and Y:
```
W_XY(s,τ) = W_X(s,τ) * W_Y*(s,τ)
```

### Wavelet Coherence

```
WTC(s,τ) = |S(W_XY)|² / (S(|W_X|²) * S(|W_Y|²))
```

Where `S` is a smoothing operator in both time and scale.

### Phase Angle

```
φ(s,τ) = arctan(Im(W_XY) / Re(W_XY))
```

Reference: [PyCWT Documentation](https://pycwt.readthedocs.io/)

## Python Implementation Options

### Recommended: PyCWT

```python
import pycwt as wavelet

# Compute wavelet coherence
WCT, aWCT, coi, freq, sig = wavelet.wct(
    signal1, signal2,
    dt=TR,           # Sampling period (e.g., 2.0 seconds)
    dj=1/12,         # Scale spacing (smaller = finer frequency resolution)
    s0=2*TR,         # Smallest scale
    J=-1,            # Number of scales (auto-calculate)
    mother=wavelet.Morlet(6)  # Mother wavelet
)
```

**Returns:**
- `WCT`: Coherence magnitude matrix (scales × time)
- `aWCT`: Phase angle matrix (scales × time)
- `coi`: Cone of influence (edge effects boundary)
- `freq`: Frequency array for each scale

**Dependencies:** `numpy`, `scipy`, `pycwt`

### Alternative: Custom Implementation with PyWavelets

```python
import pywt
import numpy as np

# Using PyWavelets CWT
scales = np.arange(1, 128)
coef1, freqs = pywt.cwt(signal1, scales, 'cmor1.5-1.0', sampling_period=TR)
coef2, freqs = pywt.cwt(signal2, scales, 'cmor1.5-1.0', sampling_period=TR)

# Cross-spectrum
cross_spectrum = coef1 * np.conj(coef2)

# Coherence requires smoothing (more complex to implement correctly)
```

Reference: [PyWavelets CWT Documentation](https://pywavelets.readthedocs.io/en/latest/ref/cwt.html)

## Configuration Parameters

### Required Parameters

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `mother_wavelet` | string | Wavelet type | `"morlet"` |
| `omega0` | float | Morlet wavelet frequency parameter | `6` |
| `dt` | float | Sampling period (TR) in seconds | **Required** |

### Optional Parameters

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `dj` | float | Scale spacing (1/12 = fine, 1/4 = coarse) | `1/12` |
| `s0` | float | Smallest scale | `2*dt` |
| `J` | int | Number of scales (-1 = auto) | `-1` |
| `freq_min` | float | Minimum frequency of interest (Hz) | `0.01` |
| `freq_max` | float | Maximum frequency of interest (Hz) | `0.1` |
| `significance_level` | float | For statistical testing | `0.95` |

### Frequency Band Presets

```python
FREQ_BAND_PRESETS = {
    "full": (0.01, 0.1),      # Full resting-state range
    "slow-5": (0.01, 0.027),  # Very slow
    "slow-4": (0.027, 0.074), # Primary RS band
    "slow-3": (0.074, 0.199), # Higher frequency
}
```

## Output Data Structure

### Per Window/Timestep Output

For each time window, for each pair of nodes (i, j where i < j), we compute:

```python
@dataclass
class WaveletCoherenceResult:
    # Mean coherence across all frequencies (0-1)
    mean_coherence: float

    # Leading value: proportion of frequencies showing lead/lag (0-1)
    leading_value: float

    # Optional: coherence at each frequency for detailed analysis
    coherence_spectrum: np.ndarray  # shape: (num_frequencies,)

    # Optional: phase angles at each frequency
    phase_spectrum: np.ndarray  # shape: (num_frequencies,)
```

### Edge Weight Calculation

The edge weight combines coherence and leading:

```python
def compute_edge_weight(mean_coherence: float, leading_value: float) -> float:
    """
    Combine coherence and leading into a single edge weight.

    Options:
    1. Use mean coherence only (ignore leading)
    2. Use leading value only
    3. Weighted combination: α * coherence + (1-α) * leading
    4. Product: coherence * leading (high only when both high)
    """
    # Option 4: Product approach - edge is strong only when
    # there's both high coherence AND significant phase leading
    return mean_coherence * leading_value
```

### Symmetric Matrix Output

Since this is symmetric like Pearson:

```python
def compute_wavelet_coherence_matrix(
    time_series: np.ndarray,  # shape: (num_timepoints, num_nodes)
    frequencies: np.ndarray,  # hardcoded frequency spectrum
    dt: float,  # sampling period (TR)
    phase_threshold: float = np.pi/4,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Compute symmetric wavelet coherence matrices.

    Returns:
        coherence_matrix: shape (num_nodes, num_nodes), symmetric
        leading_matrix: shape (num_nodes, num_nodes), symmetric
    """
    num_nodes = time_series.shape[1]
    coherence_matrix = np.zeros((num_nodes, num_nodes))
    leading_matrix = np.zeros((num_nodes, num_nodes))

    for i in range(num_nodes):
        for j in range(i + 1, num_nodes):
            # Compute wavelet coherence between node i and j
            coherence_spectrum, phase_spectrum = wavelet_coherence(
                time_series[:, i],
                time_series[:, j],
                frequencies,
                dt
            )

            # Mean coherence across frequencies
            mean_coh = np.mean(coherence_spectrum)

            # Leading value
            leading_val = compute_leading_value(phase_spectrum, phase_threshold)

            # Fill symmetric matrix
            coherence_matrix[i, j] = mean_coh
            coherence_matrix[j, i] = mean_coh
            leading_matrix[i, j] = leading_val
            leading_matrix[j, i] = leading_val

    return coherence_matrix, leading_matrix
```

## User's Requirement: Symmetric Leading Value

The wavelet coherence output should be **symmetric** (like Pearson), providing a single "leading value" per node pair per time window.

**Specification:**
1. Use a **hardcoded frequency spectrum** (fixed set of frequencies to analyze)
2. Per window, for each node pair, compute phase angles at all frequencies
3. For each frequency, determine if phase indicates "leading" (not in-phase/anti-phase)
4. Calculate: `leading_value = num_leading_frequencies / total_frequencies`

**Result:**
- Value between 0 and 1
- 0 = no leading at any frequency (all in-phase or anti-phase)
- 1 = leading at all frequencies
- Symmetric: A→B same as B→A

**Implementation:**

```python
# Hardcoded frequency spectrum for fMRI (0.01-0.1 Hz range)
FREQUENCY_SPECTRUM = np.array([
    0.010,  # 100s period
    0.015,  # 67s period
    0.020,  # 50s period
    0.027,  # 37s period (slow-5/slow-4 boundary)
    0.035,  # 29s period
    0.045,  # 22s period
    0.055,  # 18s period
    0.065,  # 15s period
    0.074,  # 14s period (slow-4/slow-3 boundary)
    0.085,  # 12s period
    0.100,  # 10s period
])  # 11 frequencies


def is_leading(phase_angle: float, threshold: float = np.pi/4) -> bool:
    """
    Determine if phase angle indicates leading (not in-phase or anti-phase).

    Args:
        phase_angle: Phase in radians (-π to π)
        threshold: Angle threshold for in-phase/anti-phase (default π/4 = 45°)

    Returns:
        True if leading (phase not near 0° or 180°), False otherwise
    """
    # Normalize to -π to π
    phase = np.arctan2(np.sin(phase_angle), np.cos(phase_angle))

    # Check if in-phase (near 0) or anti-phase (near ±π)
    is_in_phase = abs(phase) < threshold
    is_anti_phase = abs(abs(phase) - np.pi) < threshold

    # Leading = not in-phase and not anti-phase
    return not (is_in_phase or is_anti_phase)


def compute_leading_value(phase_angles: np.ndarray, threshold: float = np.pi/4) -> float:
    """
    Compute the leading value for a node pair.

    Args:
        phase_angles: Array of phase angles at each frequency (shape: num_frequencies)
        threshold: Angle threshold for determining leading

    Returns:
        Leading value between 0 and 1
    """
    num_frequencies = len(phase_angles)
    num_leading = sum(1 for phase in phase_angles if is_leading(phase, threshold))
    return num_leading / num_frequencies
```

**Example:**
- If phase angles at 11 frequencies are: [0.1, 0.2, 1.5, -1.3, 0.05, 2.9, 0.8, -0.7, 0.15, 1.1, -1.0]
- With threshold π/4 ≈ 0.785:
  - In-phase (|phase| < 0.785): 0.1, 0.2, 0.05, 0.15 → 4 frequencies
  - Anti-phase (|phase| near π): 2.9 → 1 frequency
  - Leading: 1.5, -1.3, 0.8, -0.7, 1.1, -1.0 → 6 frequencies
- Leading value = 6/11 ≈ 0.545

## Integration with Existing Codebase

### Backend Changes

1. **New file:** `backend/app/wavelet_coherence.py`
   - Wavelet coherence computation functions
   - Frequency band definitions
   - Phase/lead determination

2. **Update:** `backend/app/abide_processing.py`
   - Add `CorrelationMethod.WAVELET_COHERENCE`
   - Integrate wavelet coherence into pipeline

3. **Update:** `backend/app/main.py`
   - Add wavelet-specific parameters to `/abide/data` endpoint
   - Return frequency band information in response

### Frontend Changes

1. **Update:** `frontend/src/vis/useGraphData.ts`
   - Add wavelet coherence parameters (TR, phase threshold)
   - Handle wavelet-specific response data

2. **Update:** `frontend/src/App.tsx`
   - Add TR input field (when wavelet coherence selected)
   - Add phase threshold input (optional)

3. **Update:** `frontend/src/vis/drawFrame.ts`
   - No changes needed (symmetric = straight lines, already supported)

### API Response Extension

```typescript
interface WaveletCoherenceResponse {
  frames: GraphFrame[];
  meta: GraphMeta;
  symmetric: true;  // Wavelet coherence IS symmetric (leading value, not direction)

  // Wavelet-specific metadata
  wavelet_info: {
    frequencies: number[];  // The hardcoded frequency spectrum used
    tr: number;
    phase_threshold: number;  // Threshold used for leading classification
  };
}
```

## Visualization Approach

### Edge Rendering for Wavelet Coherence

Since wavelet coherence is **symmetric** (like Pearson):

1. **Use straight lines** (same as Pearson/Spearman)
2. **Color coding** by combined weight (coherence × leading)
3. **Edge thickness** could represent leading value
4. Rendered the same way as other symmetric correlations

### UI Controls

```
┌─────────────────────────────────────┐
│ Correlation                         │
├─────────────────────────────────────┤
│ Method: [Wavelet Coherence ▼]       │
│                                     │
│ TR (seconds): [2.0    ]             │
│                                     │
│ Phase Threshold: [45°  ]            │
│ (angle to classify as leading)      │
└─────────────────────────────────────┘
```

### Edge Weight Options

The user can choose how to combine coherence and leading:

1. **Coherence only**: Show mean coherence (ignore phase)
2. **Leading only**: Show leading value (ignore coherence magnitude)
3. **Combined** (default): coherence × leading (strong only when both high)

## Dependencies to Add

```toml
# backend/pyproject.toml
dependencies = [
    # ... existing ...
    "pycwt>=0.3.0a22",  # Wavelet coherence
]
```

## Implementation Phases

### Phase 1: Core Wavelet Coherence Computation
1. Add `pycwt` dependency to `pyproject.toml`
2. Create `backend/app/wavelet_coherence.py` module with:
   - Hardcoded `FREQUENCY_SPECTRUM` array
   - `compute_wavelet_coherence(signal1, signal2, dt, frequencies)` function
   - `is_leading(phase_angle, threshold)` helper
   - `compute_leading_value(phase_angles, threshold)` function
3. Add unit tests for wavelet coherence functions

### Phase 2: Integration with Processing Pipeline
1. Add `WAVELET_COHERENCE = "wavelet_coherence"` to `CorrelationMethod` enum
2. Add `is_symmetric()` return `True` for wavelet coherence
3. Implement windowed wavelet coherence matrix computation
4. Return symmetric matrix (like Pearson)

### Phase 3: API Updates
1. Add `tr` query parameter (required when method=wavelet_coherence)
2. Add `phase_threshold` query parameter (optional, default=π/4)
3. Update `/abide/methods` to include wavelet_coherence with its params

### Phase 4: Frontend Updates
1. Add TR input field (shown when wavelet_coherence selected)
2. Handle new method in useGraphData

### Phase 5: Testing & Refinement
1. Integration tests with ABIDE data
2. Performance optimization if needed
3. Verify symmetric rendering works correctly

## Open Questions

Before implementation, please clarify:

1. **TR Value:** What is the TR (repetition time) of the ABIDE data in seconds? This is critical for correct frequency calculation.

2. **Windowing:** Should wavelet coherence be computed in sliding windows (like current methods) or over the entire time series?

3. **Performance:** Wavelet coherence is more computationally intensive. Is server-side caching acceptable?

## Resolved Design Decisions

- **Frequency spectrum:** Hardcoded (11 frequencies from 0.01-0.1 Hz)
- **Output type:** Symmetric (leading value = ratio of frequencies showing lead)
- **Edge rendering:** Straight lines (same as Pearson since symmetric)
- **Edge weight:** Combines coherence magnitude with leading value

## References

- [PyCWT Documentation](https://pycwt.readthedocs.io/)
- [Grinsted et al. 2004 - Application of cross wavelet transform](http://grinsted.github.io/wavelet-coherence/)
- [Chang & Glover 2010 - Time-frequency dynamics of resting-state brain connectivity](https://pmc.ncbi.nlm.nih.gov/articles/PMC2827259/)
- [PLOS One - Choosing Wavelet Methods for Functional Brain Network Construction](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0157243)
- [Nature - Measuring Frequency-Specific Functional Connectivity Using Wavelet Coherence](https://www.nature.com/articles/s41598-020-66246-9)
- [MATLAB wcoherence Documentation](https://www.mathworks.com/help/wavelet/ref/wcoherence.html)
