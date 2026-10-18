from pathlib import Path

from cardeal.cli import _build_hunter
from cardeal.config import load_config

CONFIG = """
database: data/test.sqlite3
searches:
  - name: Alle Autos
    max_price: 3000
"""


def build(tmp_path: Path):
    path = tmp_path / "config.yaml"
    path.write_text(CONFIG, encoding="utf-8")
    return _build_hunter(load_config(path), path, use_ai=True, notify=False)


def test_ai_is_disabled_without_api_key(tmp_path, monkeypatch):
    for name in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_PROFILE"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("HOME", str(tmp_path))  # no `ant auth login` profile either
    assert build(tmp_path).analyzer is None


def test_ai_is_enabled_with_api_key(tmp_path, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
    hunter = build(tmp_path)
    assert hunter.analyzer is not None
    assert (tmp_path / "data").is_dir()  # database path is relative to the config file
