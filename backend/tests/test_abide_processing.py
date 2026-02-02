"""
Tests for ABIDE processing module functions.
"""

from pathlib import Path

import numpy as np
import pytest

from app.abide_processing import (
    CorrelationMethod,
    CorrelationParams,
    RSN_INDICES,
    RSN_NAMES,
    RSN_SHORT,
    compute_correlation,
    compute_correlation_matrices,
    filter_rsn_columns,
    fisher_z,
    get_method_info,
    get_rsn_labels,
    parse_dr_file,
    pearson_matrix,
    spearman_matrix,
    windowed_correlation,
)


def generate_abide_timeseries(
    n_timepoints: int = 100,
    n_components: int = 32,
    seed: int = 42,
) -> np.ndarray:
    """Generate synthetic ABIDE time series data for testing."""
    rng = np.random.default_rng(seed)
    data = rng.standard_normal((n_timepoints, n_components))
    # Add correlations between DMN components
    dmn_signal = rng.standard_normal(n_timepoints)
    data[:, 0] += 0.6 * dmn_signal
    data[:, 5] += 0.6 * dmn_signal
    return data * 50 + 100


class TestConstants:
    """Tests for RSN constants."""

    def test_rsn_indices_has_14_elements(self):
        """There should be 14 RSN components."""
        assert len(RSN_INDICES) == 14

    def test_rsn_names_matches_indices(self):
        """All RSN indices should have names."""
        for idx in RSN_INDICES:
            assert idx in RSN_NAMES
            assert idx in RSN_SHORT

    def test_rsn_indices_are_valid(self):
        """RSN indices should be in 1-32 range."""
        for idx in RSN_INDICES:
            assert 1 <= idx <= 32


class TestParsers:
    """Tests for parsing functions."""

    def test_parse_dr_file(self, single_abide_file: Path):
        """Test parsing a DR file."""
        data = parse_dr_file(single_abide_file)

        assert isinstance(data, np.ndarray)
        assert data.ndim == 2
        assert data.shape[1] == 32  # 32 ICA components

    def test_filter_rsn_columns(self):
        """Test RSN column filtering."""
        data = np.random.randn(100, 32)
        filtered = filter_rsn_columns(data)

        assert filtered.shape == (100, 14)

    def test_get_rsn_labels_short(self):
        """Test getting short RSN labels."""
        labels = get_rsn_labels(short=True)

        assert len(labels) == 14
        assert labels[0] == "aDMN"
        assert all(isinstance(label, str) for label in labels)

    def test_get_rsn_labels_long(self):
        """Test getting full RSN names."""
        labels = get_rsn_labels(short=False)

        assert len(labels) == 14
        assert "Default Mode" in labels[0]


class TestCorrelationMethods:
    """Tests for correlation computation functions."""

    @pytest.fixture
    def sample_data(self):
        """Generate sample time series data."""
        return generate_abide_timeseries(n_timepoints=50, n_components=14, seed=42)

    def test_pearson_matrix_shape(self, sample_data):
        """Test Pearson correlation matrix shape."""
        matrix = pearson_matrix(sample_data)

        assert matrix.shape == (14, 14)

    def test_pearson_matrix_symmetric(self, sample_data):
        """Test Pearson matrix is symmetric."""
        matrix = pearson_matrix(sample_data)

        np.testing.assert_array_almost_equal(matrix, matrix.T)

    def test_pearson_matrix_diagonal_ones(self, sample_data):
        """Test Pearson matrix diagonal is 1."""
        matrix = pearson_matrix(sample_data)

        np.testing.assert_array_almost_equal(np.diag(matrix), np.ones(14))

    def test_pearson_matrix_range(self, sample_data):
        """Test Pearson values are in [-1, 1]."""
        matrix = pearson_matrix(sample_data)

        assert matrix.min() >= -1.0
        assert matrix.max() <= 1.0

    def test_spearman_matrix_shape(self, sample_data):
        """Test Spearman correlation matrix shape."""
        matrix = spearman_matrix(sample_data)

        assert matrix.shape == (14, 14)

    def test_spearman_matrix_symmetric(self, sample_data):
        """Test Spearman matrix is symmetric."""
        matrix = spearman_matrix(sample_data)

        np.testing.assert_array_almost_equal(matrix, matrix.T)

    def test_compute_correlation_pearson(self, sample_data):
        """Test compute_correlation with Pearson."""
        matrix = compute_correlation(sample_data, CorrelationMethod.PEARSON)
        expected = pearson_matrix(sample_data)

        np.testing.assert_array_almost_equal(matrix, expected)

    def test_compute_correlation_spearman(self, sample_data):
        """Test compute_correlation with Spearman."""
        matrix = compute_correlation(sample_data, CorrelationMethod.SPEARMAN)
        expected = spearman_matrix(sample_data)

        np.testing.assert_array_almost_equal(matrix, expected)

class TestWindowedCorrelation:
    """Tests for windowed correlation computation."""

    @pytest.fixture
    def sample_data(self):
        """Generate sample time series data."""
        return generate_abide_timeseries(n_timepoints=100, n_components=14, seed=42)

    def test_windowed_correlation_shape(self, sample_data):
        """Test windowed correlation output shape."""
        matrices = windowed_correlation(
            sample_data, CorrelationMethod.PEARSON, window_size=30, step=1
        )

        # 100 timepoints - 30 window + 1 = 71 frames
        expected_frames = (100 - 30) // 1 + 1
        assert matrices.shape == (expected_frames, 14, 14)

    def test_windowed_correlation_step(self, sample_data):
        """Test that step affects number of frames."""
        matrices_step1 = windowed_correlation(
            sample_data, CorrelationMethod.PEARSON, window_size=30, step=1
        )
        matrices_step5 = windowed_correlation(
            sample_data, CorrelationMethod.PEARSON, window_size=30, step=5
        )

        assert matrices_step1.shape[0] > matrices_step5.shape[0]

    def test_windowed_correlation_window_too_large(self, sample_data):
        """Test error when window exceeds data length."""
        with pytest.raises(ValueError, match="too large"):
            windowed_correlation(
                sample_data, CorrelationMethod.PEARSON, window_size=150, step=1
            )


class TestTransforms:
    """Tests for transformation functions."""

    def test_fisher_z_range(self):
        """Test Fisher z-transform output range."""
        correlations = np.array([[-0.9, 0.0, 0.5], [0.0, 1.0, 0.8], [0.5, 0.8, 1.0]])
        transformed = fisher_z(correlations)

        # Non-diagonal values should be transformed
        assert transformed[0, 0] != correlations[0, 0]

    def test_fisher_z_clipping(self):
        """Test Fisher z handles edge values."""
        correlations = np.array([[-1.0, 1.0], [1.0, -1.0]])
        transformed = fisher_z(correlations)

        # Should not produce inf
        assert np.isfinite(transformed).all()

class TestAPIFunction:
    """Tests for the main API function."""

    def test_compute_correlation_matrices(self, single_abide_file: Path):
        """Test main API function."""
        params = CorrelationParams(
            method=CorrelationMethod.PEARSON,
            window_size=30,
            step=5,
        )

        matrices = compute_correlation_matrices(single_abide_file, params)

        assert isinstance(matrices, list)
        assert len(matrices) > 0
        assert matrices[0].shape == (14, 14)  # RSN nodes

    def test_compute_correlation_matrices_range(self, single_abide_file: Path):
        """Test that output contains raw correlation values in [-1, 1] range."""
        params = CorrelationParams(
            method=CorrelationMethod.PEARSON,
            window_size=30,
            step=5,
        )

        matrices = compute_correlation_matrices(single_abide_file, params)
        arr = np.array(matrices)

        # Raw correlation values should be in [-1, 1]
        assert arr.min() >= -1.0
        assert arr.max() <= 1.0


class TestMethodInfo:
    """Tests for method info function."""

    def test_get_method_info_returns_list(self):
        """Test that method info returns a list."""
        info = get_method_info()

        assert isinstance(info, list)
        assert len(info) == 2  # pearson, spearman

    def test_get_method_info_structure(self):
        """Test method info structure."""
        info = get_method_info()

        for method in info:
            assert "id" in method
            assert "name" in method
            assert "description" in method
            assert "params" in method
            assert isinstance(method["params"], list)
