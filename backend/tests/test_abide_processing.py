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
    get_rsn_labels,
    parse_dr_file,
    pearson_matrix,
    spearman_matrix,
    windowed_correlation,
)

from tests.utils import generate_abide_timeseries


# --- RSN Constants ---

def test_rsn_indices_has_14_elements():
    assert len(RSN_INDICES) == 14


def test_rsn_names_matches_indices():
    for idx in RSN_INDICES:
        assert idx in RSN_NAMES
        assert idx in RSN_SHORT


def test_rsn_indices_are_valid():
    for idx in RSN_INDICES:
        assert 1 <= idx <= 32


# --- Parsers ---

def test_parse_dr_file(single_abide_file: Path):
    data = parse_dr_file(single_abide_file)

    assert isinstance(data, np.ndarray)
    assert data.ndim == 2
    assert data.shape[1] == 32


def test_filter_rsn_columns():
    data = np.random.randn(100, 32)
    filtered = filter_rsn_columns(data)

    assert filtered.shape == (100, 14)


def test_get_rsn_labels_short():
    labels = get_rsn_labels(short=True)

    assert len(labels) == 14
    assert labels[0] == "aDMN"
    assert all(isinstance(label, str) for label in labels)


def test_get_rsn_labels_long():
    labels = get_rsn_labels(short=False)

    assert len(labels) == 14
    assert "Default Mode" in labels[0]


# --- Correlation Methods ---

@pytest.fixture
def sample_data_14():
    return generate_abide_timeseries(n_timepoints=50, n_components=14, seed=42)


@pytest.fixture
def sample_data_100():
    return generate_abide_timeseries(n_timepoints=100, n_components=14, seed=42)


def test_pearson_matrix_shape(sample_data_14):
    matrix = pearson_matrix(sample_data_14)
    assert matrix.shape == (14, 14)


def test_pearson_matrix_symmetric(sample_data_14):
    matrix = pearson_matrix(sample_data_14)
    np.testing.assert_array_almost_equal(matrix, matrix.T)


def test_pearson_matrix_diagonal_ones(sample_data_14):
    matrix = pearson_matrix(sample_data_14)
    np.testing.assert_array_almost_equal(np.diag(matrix), np.ones(14))


def test_pearson_matrix_range(sample_data_14):
    matrix = pearson_matrix(sample_data_14)
    assert -1.0 <= matrix.min() <= matrix.max() <= 1.0


def test_spearman_matrix_shape(sample_data_14):
    matrix = spearman_matrix(sample_data_14)
    assert matrix.shape == (14, 14)


def test_spearman_matrix_symmetric(sample_data_14):
    matrix = spearman_matrix(sample_data_14)
    np.testing.assert_array_almost_equal(matrix, matrix.T)


def test_compute_correlation_dispatches_to_pearson(sample_data_14):
    matrix = compute_correlation(sample_data_14, CorrelationMethod.PEARSON)
    expected = pearson_matrix(sample_data_14)
    np.testing.assert_array_almost_equal(matrix, expected)


def test_compute_correlation_dispatches_to_spearman(sample_data_14):
    matrix = compute_correlation(sample_data_14, CorrelationMethod.SPEARMAN)
    expected = spearman_matrix(sample_data_14)
    np.testing.assert_array_almost_equal(matrix, expected)


# --- Windowed Correlation ---

def test_windowed_correlation_output_shape(sample_data_100):
    matrices = windowed_correlation(
        sample_data_100, CorrelationMethod.PEARSON, window_size=30, step=1
    )
    expected_frames = (100 - 30) // 1 + 1
    assert matrices.shape == (expected_frames, 14, 14)


def test_windowed_correlation_larger_step_produces_fewer_frames(sample_data_100):
    matrices_step1 = windowed_correlation(
        sample_data_100, CorrelationMethod.PEARSON, window_size=30, step=1
    )
    matrices_step5 = windowed_correlation(
        sample_data_100, CorrelationMethod.PEARSON, window_size=30, step=5
    )
    assert matrices_step1.shape[0] > matrices_step5.shape[0]


def test_windowed_correlation_raises_when_window_exceeds_data(sample_data_100):
    with pytest.raises(ValueError, match="too large"):
        windowed_correlation(
            sample_data_100, CorrelationMethod.PEARSON, window_size=150, step=1
        )


# --- Main API Function ---

def test_compute_correlation_matrices_returns_list(single_abide_file: Path):
    params = CorrelationParams(
        method=CorrelationMethod.PEARSON,
        window_size=30,
        step=5,
    )
    matrices = compute_correlation_matrices(single_abide_file, params)

    assert isinstance(matrices, list)
    assert len(matrices) > 0
    assert matrices[0].shape == (14, 14)


def test_compute_correlation_matrices_values_in_range(single_abide_file: Path):
    params = CorrelationParams(
        method=CorrelationMethod.PEARSON,
        window_size=30,
        step=5,
    )
    matrices = compute_correlation_matrices(single_abide_file, params)
    arr = np.array(matrices)

    assert -1.0 <= arr.min() <= arr.max() <= 1.0


