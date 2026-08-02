from pathlib import Path

from tests.integration.test_restore_drill import _repository_migration_head

ROOT = Path(__file__).resolve().parents[1]


def test_restore_drill_tracks_the_exact_repository_migration_head() -> None:
    expected = max(
        path.name.split("_", maxsplit=1)[0]
        for path in (ROOT / "supabase" / "migrations").glob("*.sql")
    )

    assert _repository_migration_head() == expected
    assert expected == "20260802063625"


def test_restore_drill_counts_every_current_application_table() -> None:
    source = (ROOT / "tests" / "integration" / "test_restore_drill.py").read_text(encoding="utf-8")

    assert "from pg_catalog.pg_tables" in source
    assert "schemaname in ('api', 'private')" in source
    assert "for table in tables" in source
    assert "_APP_COUNT_QUERY" not in source
