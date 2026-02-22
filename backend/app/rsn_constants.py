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
    RSN(1, "Anterior Default Mode", "aDMN", ("DMNa",)),
    RSN(2, "Primary Visual", "V1", ("VISUp",)),
    RSN(5, "Salience", "SAL", ("SN",)),
    RSN(6, "Posterior Default Mode", "pDMN", ("DMNp",)),
    RSN(7, "Auditory", "AUD", ("AUDI",)),
    RSN(9, "Left Frontoparietal", "lFPN", ("FPL",)),
    RSN(12, "Right Frontoparietal", "rFPN", ("FPR",)),
    RSN(13, "Lateral Visual", "latVIS", ("VISUl",)),
    RSN(14, "Lateral Sensorimotor", "latSM", ("SMNl",)),
    RSN(15, "Cerebellum", "CER", ("Cereb", "CEREB")),
    RSN(18, "Primary Sensorimotor", "SM1", ("SMNp",)),
    RSN(19, "Dorsal Attention", "DAN"),
    RSN(21, "Language", "LANG", ("LN",)),
    RSN(27, "Occipital Visual", "occVIS", ("VISUo",)),
]

# Derived constants
NUM_RSNS = len(RSNS)
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
    window_size: int | None = None
    step: int | None = None
