import pandas as pd

from chronobench.templates import assign_templates, mask_message


def test_mask_replaces_numbers_ids_and_addresses():
    assert mask_message("user 123 from 10.0.0.5:8080") == "user <*> from <*>"
    assert mask_message("trace 3f2a9c1b8d7e6f50 done") == "trace <*> done"
    assert mask_message("id 123e4567-e89b-12d3-a456-426614174000") == "id <*>"
    assert mask_message("addr 0xdeadbeef") == "addr <*>"
    assert mask_message("took=1.65ms at 2024-01-19T11:32:55.789Z") == "took=<*>ms at <*>"


def test_spring_header_is_stripped_to_logger_and_text():
    line = "2024-01-24 03:43:56.336  INFO 1 --- [io-1-exec-5] auth.TokenService  : LOGIN USER :x"
    assert mask_message(line) == "auth.TokenService : LOGIN USER :x"


def test_long_messages_are_capped():
    assert len(mask_message("word " * 500).split()) == 40


def test_same_shape_shares_a_template_and_different_shape_does_not():
    messages = pd.Series(
        [
            "user 12 logged in",
            "user 99 logged in",
            "connection to db refused",
            "user 7 logged in",
            "connection to cache refused",
        ]
    )
    ids, templates = assign_templates(messages)
    assert ids[0] == ids[1] == ids[3]
    assert ids[2] != ids[0]
    assert set(ids) <= set(templates)


def test_template_ids_are_deterministic_and_keep_the_index():
    messages = pd.Series(["a 1 b", "c d e", "a 2 b"], index=[10, 11, 12])
    first, _ = assign_templates(messages)
    second, _ = assign_templates(messages)
    assert first.equals(second)
    assert list(first.index) == [10, 11, 12]
