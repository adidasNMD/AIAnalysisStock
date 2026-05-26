import importlib.util
import json
import sys
import types
from pathlib import Path
import pytest

_FILTER_PATH = Path(__file__).parent / "filter.py"


def _load_filter_module():
    stub_client = types.ModuleType("trendradar.ai.client")

    class _Stub:
        def __init__(self, *a, **kw):
            pass

    stub_client.AIClient = _Stub
    sys.modules.setdefault("trendradar.ai.client", stub_client)

    stub_loader = types.ModuleType("trendradar.ai.prompt_loader")

    def _load_prompt(*a, **kw):
        return ("", "")

    stub_loader.load_prompt_template = _load_prompt
    sys.modules.setdefault("trendradar.ai.prompt_loader", stub_loader)

    spec = importlib.util.spec_from_file_location("trendradar.ai.filter", _FILTER_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_mod = _load_filter_module()
AIFilter = _mod.AIFilter


def make_filter():
    f = object.__new__(AIFilter)
    f.debug = False
    return f


TITLES = [{"id": 1, "title": "news one"}, {"id": 2, "title": "news two"}, {"id": 3, "title": "news three"}]
TAGS = [{"id": 10, "tag": "tech"}, {"id": 20, "tag": "finance"}]


def call_parse(filter_obj, data):
    response = json.dumps(data)
    return filter_obj._parse_classify_response(response, TITLES, TAGS)


def test_zero_score_filtered():
    f = make_filter()
    data = [{"id": 1, "tag_id": 10, "score": 0.0}]
    results = call_parse(f, data)
    news_ids = [r["news_item_id"] for r in results]
    assert 1 not in news_ids


def test_positive_score_passes():
    f = make_filter()
    data = [
        {"id": 1, "tag_id": 10, "score": 0.3},
        {"id": 2, "tag_id": 20, "score": 0.8},
    ]
    results = call_parse(f, data)
    news_ids = [r["news_item_id"] for r in results]
    assert 1 in news_ids
    assert 2 in news_ids


def test_parse_failure_defaults_to_zero():
    f = make_filter()
    data = [
        {"id": 1, "tag_id": 10, "score": "invalid"},
        {"id": 2, "tags": [{"tag_id": 20}]},
    ]
    results = call_parse(f, data)
    news_ids = [r["news_item_id"] for r in results]
    assert 1 not in news_ids
    assert 2 not in news_ids


def test_best_score_selected():
    f = make_filter()
    data = [
        {"id": 1, "tags": [
            {"tag_id": 10, "score": 0.3},
            {"tag_id": 20, "score": 0.9},
        ]},
    ]
    results = call_parse(f, data)
    assert len(results) == 1
    assert results[0]["news_item_id"] == 1
    assert results[0]["tag_id"] == 20
    assert results[0]["relevance_score"] == pytest.approx(0.9)
