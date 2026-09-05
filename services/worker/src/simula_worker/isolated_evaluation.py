"""Compatibility import for existing worker processes during process-boundary upgrades."""

from simula_core.isolated_evaluation import (
    EvaluationLeaseLost as EvaluationLeaseLost,
)
from simula_core.isolated_evaluation import (
    _evaluate as _evaluate,
)
from simula_core.isolated_evaluation import (
    evaluate_isolated as evaluate_isolated,
)
from simula_core.isolated_evaluation import (
    evaluate_with_lease as evaluate_with_lease,
)
