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

For each time window (or continuous time), for each pair of nodes, we get:

```python
@dataclass
class WaveletCoherenceResult:
    # Coherence values per frequency band
    coherence: Dict[str, float]  # {"slow-5": 0.75, "slow-4": 0.82, ...}

    # Phase angle per frequency band (radians, -π to π)
    phase: Dict[str, float]  # {"slow-5": 0.3, "slow-4": -1.2, ...}

    # Dominant frequency band (highest coherence)
    dominant_band: str  # "slow-4"

    # Lead/lag direction at dominant frequency
    lead_direction: str  # "source_leads" | "target_leads" | "in_phase" | "anti_phase"
```

### Simplified Edge Representation

For visualization, we need to collapse the frequency dimension. Proposed approach:

```python
@dataclass
class WaveletEdge:
    source: str
    target: str

    # Primary coherence (from dominant frequency band)
    weight: float  # 0-255 normalized

    # Which node leads (based on phase at dominant frequency)
    leader: str | None  # node_id or None if in-phase/anti-phase

    # Dominant frequency band
    frequency_band: str

    # Full coherence spectrum (for detailed view)
    coherence_spectrum: Dict[str, float]
```

## User's Requirement: Lead Assumption

> "Let's show the lead and assume that they can't lead and lag in different frequencies at the same time."

**Interpretation:**
- For each node pair, determine the **dominant frequency band** (highest coherence)
- Use the phase at that frequency to determine lead/lag
- If phase is near 0° or 180°, there's no clear leader
- If phase is near ±90°, one node leads the other

**Implementation:**

```python
def determine_lead(phase_angle: float, threshold: float = np.pi/4) -> str:
    """
    Determine lead/lag from phase angle.

    Args:
        phase_angle: Phase in radians (-π to π)
        threshold: Angle threshold for determining lead (default π/4 = 45°)

    Returns:
        "source_leads" | "target_leads" | "in_phase" | "anti_phase"
    """
    # Normalize to -π to π
    phase = np.arctan2(np.sin(phase_angle), np.cos(phase_angle))

    if abs(phase) < threshold:
        return "in_phase"
    elif abs(phase - np.pi) < threshold or abs(phase + np.pi) < threshold:
        return "anti_phase"
    elif phase > 0:
        return "target_leads"  # Y leads X (arrow up)
    else:
        return "source_leads"  # X leads Y (arrow down)
```

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
   - Add wavelet coherence parameters
   - Handle frequency band data

2. **Update:** `frontend/src/App.tsx`
   - Add frequency band selector (when wavelet coherence selected)
   - Add TR input field

3. **Update:** `frontend/src/vis/drawFrame.ts`
   - Draw edges with lead/lag indicators (arrows showing direction)
   - Color coding by frequency band (optional)

### API Response Extension

```typescript
interface WaveletCoherenceResponse {
  frames: GraphFrame[];
  meta: GraphMeta;
  symmetric: false;  // Wavelet coherence is directional

  // Wavelet-specific metadata
  wavelet_info: {
    frequency_bands: Array<{
      name: string;
      min_freq: number;
      max_freq: number;
    }>;
    tr: number;
    dominant_band: string;  // Most commonly dominant across all edges
  };
}
```

## Visualization Approach

### Edge Rendering for Wavelet Coherence

Since wavelet coherence provides directional (lead/lag) information:

1. **Always use curved arrows** (not straight lines like symmetric correlations)
2. **Arrow direction** indicates which node leads:
   - Arrow from A→B means A leads B
   - For in-phase/anti-phase, show bidirectional or straight line
3. **Color coding options:**
   - By coherence strength (current approach)
   - By frequency band (new option)
4. **Optional frequency band indicator** on edges

### UI Controls

```
┌─────────────────────────────────────┐
│ Correlation                         │
├─────────────────────────────────────┤
│ Method: [Wavelet Coherence ▼]       │
│                                     │
│ TR (seconds): [2.0    ]             │
│                                     │
│ Frequency Band: [Slow-4 (0.027-0.074 Hz) ▼] │
│   ○ Full (0.01-0.1 Hz)              │
│   ○ Slow-5 (0.01-0.027 Hz)          │
│   ● Slow-4 (0.027-0.074 Hz)         │
│   ○ Slow-3 (0.074-0.199 Hz)         │
│   ○ Auto (dominant per edge)        │
│                                     │
│ Show Lead/Lag: [✓]                  │
└─────────────────────────────────────┘
```

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
1. Add `pycwt` dependency
2. Create `wavelet_coherence.py` module
3. Implement coherence computation for a single node pair
4. Add unit tests

### Phase 2: Integration with Processing Pipeline
1. Add `WAVELET_COHERENCE` to `CorrelationMethod` enum
2. Implement windowed wavelet coherence (or continuous)
3. Compute coherence for all node pairs
4. Return results in expected format

### Phase 3: API Updates
1. Add wavelet-specific query parameters
2. Update response format for wavelet data
3. Add frequency band endpoint/info

### Phase 4: Frontend Updates
1. Add TR input field
2. Add frequency band selector
3. Update edge rendering for lead/lag
4. Handle wavelet-specific response data

### Phase 5: Testing & Refinement
1. Integration tests with real ABIDE data
2. Performance optimization (wavelet computation can be slow)
3. UI/UX refinement based on feedback

## Open Questions

Before implementation, please clarify:

1. **TR Value:** What is the TR (repetition time) of the ABIDE dual-regression data? This is critical for correct frequency band calculation.

2. **Windowing:** Should wavelet coherence be computed:
   - Over the entire time series (producing a time-frequency map)?
   - In sliding windows (like current correlation methods)?
   - Both options available?

3. **Frequency Display:** When multiple frequency bands have high coherence, how should this be visualized?
   - Show only dominant band?
   - Allow switching between bands?
   - Show all bands with different visual encodings?

4. **Performance:** Wavelet coherence is more computationally intensive than Pearson/Spearman. Is server-side caching acceptable, or should we optimize for real-time computation?

5. **Statistical Significance:** Should we implement significance testing (Monte Carlo) for wavelet coherence, or just show raw coherence values?

## References

- [PyCWT Documentation](https://pycwt.readthedocs.io/)
- [Grinsted et al. 2004 - Application of cross wavelet transform](http://grinsted.github.io/wavelet-coherence/)
- [Chang & Glover 2010 - Time-frequency dynamics of resting-state brain connectivity](https://pmc.ncbi.nlm.nih.gov/articles/PMC2827259/)
- [PLOS One - Choosing Wavelet Methods for Functional Brain Network Construction](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0157243)
- [Nature - Measuring Frequency-Specific Functional Connectivity Using Wavelet Coherence](https://www.nature.com/articles/s41598-020-66246-9)
- [MATLAB wcoherence Documentation](https://www.mathworks.com/help/wavelet/ref/wcoherence.html)
