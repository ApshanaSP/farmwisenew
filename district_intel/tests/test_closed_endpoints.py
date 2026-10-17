"""Endpoints closed to the project by their owner do not make a feed 'degraded'; real failures still do."""
import re

from dintel.agents.steward import CLOSED_TO_US


def test_closed_endpoints_match():
    for s in ["access_restricted", "http_401", "http_403", "not_needed", "no_observation_time", "ok_unparsed",
              "no-api-key", "captcha-gated", "200 rejected: US-AQI scale"]:
        assert re.search(CLOSED_TO_US, s), s


def test_real_failures_do_not_match():
    for s in ["parse_error", "network_error", "http_500", "http_404", "failed", "playwright-error (stale)", "ok"]:
        assert not re.search(CLOSED_TO_US, s), s
