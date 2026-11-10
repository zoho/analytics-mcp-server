"""Unit tests for sql_limit_enforcer.enforcer.enforce_limit.

The enforcer caps the outermost LIMIT of a MySQL-compatible SELECT query
(it is what stands between an LLM-generated query and the Analytics API in
``src/tools/data_tools.py``), so its parsing edge cases matter: LIMITs inside
subqueries, strings and comments must not be touched, and the MySQL
``LIMIT offset, count`` form must cap the count, not the offset.
"""

import pytest

from sql_limit_enforcer import enforce_limit


CAP = 20


class TestNoOutermostLimit:
    def test_appends_limit_when_missing(self):
        assert enforce_limit("SELECT * FROM t", CAP) == "SELECT * FROM t LIMIT 20"

    def test_subquery_limit_is_not_the_outermost_limit(self):
        q = "SELECT * FROM (SELECT * FROM x LIMIT 100) y"
        assert enforce_limit(q, CAP) == q + " LIMIT 20"

    def test_limit_inside_string_literal_is_ignored(self):
        q = "SELECT * FROM t WHERE note = 'LIMIT 999'"
        assert enforce_limit(q, CAP) == q + " LIMIT 20"

    def test_limit_inside_line_comment_is_ignored(self):
        q = "SELECT * FROM t -- LIMIT 999\nWHERE a = 1"
        assert enforce_limit(q, CAP) == q + " LIMIT 20"

    def test_column_named_limit_is_not_a_limit_clause(self):
        q = "SELECT limit FROM t"
        assert enforce_limit(q, CAP) == q + " LIMIT 20"

    def test_trailing_semicolon_is_stripped_before_appending(self):
        assert enforce_limit("SELECT * FROM t;", CAP) == "SELECT * FROM t LIMIT 20"


class TestPlainLimit:
    def test_limit_within_cap_is_unchanged(self):
        assert enforce_limit("SELECT * FROM t LIMIT 10", CAP) == "SELECT * FROM t LIMIT 10"

    def test_limit_equal_to_cap_is_unchanged(self):
        assert enforce_limit("SELECT * FROM t LIMIT 20", CAP) == "SELECT * FROM t LIMIT 20"

    def test_limit_above_cap_is_capped(self):
        assert enforce_limit("SELECT * FROM t LIMIT 100", CAP) == "SELECT * FROM t LIMIT 20"

    def test_lowercase_limit_keyword_is_recognised(self):
        assert enforce_limit("select * from t limit 100", CAP) == "select * from t limit 20"

    def test_trailing_semicolon_is_stripped(self):
        assert enforce_limit("SELECT * FROM t LIMIT 10;", CAP) == "SELECT * FROM t LIMIT 10"

    def test_union_final_limit_is_capped(self):
        q = "SELECT * FROM t UNION SELECT * FROM u LIMIT 100"
        assert enforce_limit(q, CAP) == "SELECT * FROM t UNION SELECT * FROM u LIMIT 20"

    def test_subquery_limit_untouched_when_outer_limit_capped(self):
        q = "SELECT * FROM (SELECT * FROM x LIMIT 5) y LIMIT 100"
        assert enforce_limit(q, CAP) == "SELECT * FROM (SELECT * FROM x LIMIT 5) y LIMIT 20"


class TestOffsetForms:
    def test_limit_count_offset_within_cap(self):
        q = "SELECT * FROM t LIMIT 10 OFFSET 5"
        assert enforce_limit(q, CAP) == q

    def test_limit_count_offset_above_cap_caps_count_not_offset(self):
        q = "SELECT * FROM t LIMIT 100 OFFSET 5"
        assert enforce_limit(q, CAP) == "SELECT * FROM t LIMIT 20 OFFSET 5"

    def test_limit_offset_comma_within_cap(self):
        q = "SELECT * FROM t LIMIT 5, 10"
        assert enforce_limit(q, CAP) == q

    def test_limit_offset_comma_above_cap_caps_count_not_offset(self):
        q = "SELECT * FROM t LIMIT 5, 100"
        assert enforce_limit(q, CAP) == "SELECT * FROM t LIMIT 5, 20"


class TestInvalidInput:
    def test_negative_upper_limit_raises(self):
        with pytest.raises(ValueError):
            enforce_limit("SELECT * FROM t", -1)

    def test_decimal_limit_is_returned_unchanged(self):
        # Regression: a non-integer LIMIT used to crash with an unhandled
        # ValueError from int("10.5") instead of the module's usual
        # defensive "can't parse — return as-is" behaviour.
        q = "SELECT * FROM t LIMIT 10.5"
        assert enforce_limit(q, CAP) == q

    def test_decimal_count_in_comma_form_is_returned_unchanged(self):
        q = "SELECT * FROM t LIMIT 5, 10.5"
        assert enforce_limit(q, CAP) == q
