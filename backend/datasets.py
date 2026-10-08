"""Registry of pretrained CSDI checkpoint outputs available to the API.

Add a new entry here (and nothing else) to expose another dataset/checkpoint
through the same endpoints in main.py.
"""
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CHECKPOINT_ROOT = PROJECT_ROOT / "Checkpoint_PE_CSDI" / "save"

# Real PhysioNet 2012 clinical attribute names, in the same order used by
# dataset_physio.py (`attributes` list) when the tensors were built, so
# feature_id N always maps to the same real-world variable.
PHYSIO_FEATURES = [
    "DiasABP", "HR", "Na", "Lactate", "NIDiasABP", "PaO2", "WBC", "pH",
    "Albumin", "ALT", "Glucose", "SaO2", "Temp", "AST", "Bilirubin", "HCO3",
    "BUN", "RespRate", "Mg", "HCT", "SysABP", "FiO2", "K", "GCS",
    "Cholesterol", "NISysABP", "TroponinT", "MAP", "TroponinI", "PaCO2",
    "Platelets", "Urine", "NIMAP", "Creatinine", "ALP",
]

DATASET_REGISTRY = {
    "pm25": {
        "output_pk": CHECKPOINT_ROOT
        / "pm25_validationindex0_20260702_024209"
        / "generated_outputs_nsample100.pk",
        "feature_prefix": "Station",
    },
    "physio": {
        "output_pk": CHECKPOINT_ROOT
        / "physio_fold0_20260701_215113"
        / "generated_outputs_nsample100.pk",
        "feature_names": PHYSIO_FEATURES,
    },
    "electricity": {
        "output_pk": CHECKPOINT_ROOT
        / "forecasting_electricity_20260707_155637"
        / "generated_outputs_nsample100.pk",
        "feature_prefix": "Client",
    },
}
