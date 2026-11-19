import numpy as np
import pandas as pd

from chronobench.anomaly_eval import baseline_flags, score
from chronobench.loghub import Dataset, parse_bgl, parse_hdfs


def _dataset(times, alarms, units, truth):
    lines = pd.DataFrame(
        {"t": times, "source": "s", "severity": "info", "is_alarm": alarms}
    )
    pairs = pd.DataFrame({"line": range(len(times)), "unit": units})
    return Dataset("T", lines, pairs, pd.Series(truth))


def test_perfect_detector_scores_one_with_zero_delay_for_blocks():
    data = _dataset([10, 20, 30, 40], [False] * 4, ["a", "a", "b", "b"], {"a": True, "b": False})
    result = score(data, np.array([True, False, False, False]), windowed=False)
    assert (result["precision"], result["recall"], result["f1"]) == (1.0, 1.0, 1.0)
    assert result["median_delay_s"] == 0


def test_false_positive_and_miss_are_counted():
    data = _dataset([1, 2], [False, False], ["a", "b"], {"a": True, "b": False})
    result = score(data, np.array([False, True]), windowed=False)
    assert (result["tp"], result["fp"], result["fn"]) == (0, 1, 1)
    assert result["f1"] == 0.0 and result["median_delay_s"] is None


def test_windowed_episodes_merge_consecutive_windows():
    # windows 0,1 anomalous (one episode), window 3 anomalous (second episode)
    times = [5, 65, 125, 185]
    data = _dataset(times, [True, True, False, True], [0, 1, 2, 3], {0: True, 1: True, 2: False, 3: True})
    result = score(data, np.array([False, True, False, False]), windowed=True)
    assert result["episodes"] == 2 and result["episodes_detected"] == 1
    assert result["median_delay_s"] == 60  # first alarm at t=5, first flag at t=65


def test_baselines_flag_by_severity():
    lines = pd.DataFrame({"severity": ["info", "error", "critical", "warning"]})
    flags = baseline_flags(lines, np.zeros(4, dtype=bool))
    assert flags["severity_rule"].tolist() == [False, True, True, False]
    assert flags["always_anomalous"].all()


def test_parse_bgl_and_hdfs(tmp_path):
    bgl = tmp_path / "b.log"
    bgl.write_text(
        "- 1117838570 2005.06.03 N 2005-06-03-15.42.50.363779 N RAS KERNEL INFO all good\n"
        "KERNDTLB 1117838650 2005.06.03 N 2005-06-03-15.44.10.000000 N RAS KERNEL FATAL tlb error\n"
    )
    data = parse_bgl(bgl)
    assert data.lines["severity"].tolist() == ["info", "critical"]
    assert data.unit_is_anomalous.tolist() == [False, True]

    hdfs = tmp_path / "h.log"
    hdfs.write_text(
        "081109 203518 143 INFO dfs.DataNode$DataXceiver: Receiving block blk_-1 src: x\n"
        "081109 203520 35 WARN dfs.FSNamesystem: bad blk_2 and blk_-1\n"
    )
    labels = tmp_path / "l.csv"
    labels.write_text("BlockId,Label\nblk_-1,Anomaly\nblk_2,Normal\n")
    data = parse_hdfs(hdfs, labels)
    assert data.lines["severity"].tolist() == ["info", "warning"]
    assert data.unit_is_anomalous.to_dict() == {"blk_-1": True, "blk_2": False}
    assert len(data.pairs) == 3
