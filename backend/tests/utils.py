import numpy as np


def generate_abide_timeseries(
    n_timepoints: int = 100,
    n_components: int = 32,
    seed: int = 42,
) -> np.ndarray:
    """Generate synthetic ABIDE data with some correlated component pairs."""
    rng = np.random.default_rng(seed)

    # Base random data
    data = rng.standard_normal((n_timepoints, n_components))

    # Add correlations between component pairs (only if indices exist)
    # Pair 1: DMN-like correlation between first two components
    if n_components >= 2:
        signal = rng.standard_normal(n_timepoints)
        data[:, 0] += 0.6 * signal
        data[:, 1] += 0.6 * signal

    # Pair 2: Visual-like correlation between components 2-4
    if n_components >= 4:
        signal = rng.standard_normal(n_timepoints)
        data[:, 2] += 0.5 * signal
        data[:, 3] += 0.5 * signal

    # Pair 3: FPN-like correlation between components 5-6
    if n_components >= 7:
        signal = rng.standard_normal(n_timepoints)
        data[:, 5] += 0.4 * signal
        data[:, 6] += 0.4 * signal

    # Scale to realistic BOLD-like values
    data = data * 50 + 100

    return data
