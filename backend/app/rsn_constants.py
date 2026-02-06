from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path


PHENOTYPICS_FILE_PATH = Path(__file__).parent.parent.parent / "data" / "phenotypics.csv"


@dataclass(frozen=True)
class RSN:
    index: int  # ICA component index (1-indexed)
    long_name: str
    short_name: str
    nicknames: tuple[str, ...] = field(default_factory=tuple)


# The 14 RSNs used in analysis, in display order (position 0-13)
RSNS = [
    RSN(1, "Anterior Default Mode Network", "aDMN"),
    RSN(2, "Primary Visual Network", "V1"),
    RSN(5, "Salience Network", "SAL"),
    RSN(6, "Posterior Default Mode Network", "pDMN"),
    RSN(7, "Auditory Network", "AUD", ("AUDI",)),
    RSN(9, "Left Frontoparietal Network", "lFPN", ("FPL",)),
    RSN(12, "Right Frontoparietal Network", "rFPN", ("FPR",)),
    RSN(13, "Lateral Visual Network", "latVIS"),
    RSN(14, "Lateral Sensorimotor Network", "latSM"),
    RSN(15, "Cerebellum Network", "CER", ("Cereb", "CEREB")),
    RSN(18, "Primary Sensorimotor Network", "SM1", ("SMN",)),
    RSN(19, "Dorsal Attention Network", "DAN"),
    RSN(21, "Language Network", "LANG"),
    RSN(27, "Occipital Visual Network", "occVIS"),
]

# Derived constants
RSN_INDICES = [rsn.index for rsn in RSNS]
RSN_NAMES = {rsn.index: rsn.long_name for rsn in RSNS}
RSN_SHORT = {rsn.index: rsn.short_name for rsn in RSNS}

# Lookup: any name (short, long, or nickname) -> position (0-13)
RSN_NAME_TO_POSITION = {}
for pos, rsn in enumerate(RSNS):
    RSN_NAME_TO_POSITION[rsn.short_name] = pos
    for nickname in rsn.nicknames:
        RSN_NAME_TO_POSITION[nickname] = pos


class CorrelationMethod(str, Enum):
    PEARSON = "pearson"
    SPEARMAN = "spearman"
    WAVELET = "wavelet"


@dataclass
class CorrelationParams:
    method: CorrelationMethod = CorrelationMethod.PEARSON
    window_size: int = 30
    step: int = 1
