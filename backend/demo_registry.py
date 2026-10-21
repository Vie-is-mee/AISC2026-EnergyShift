"""Bounded server-generated report registry shared by native and presentation routes."""
from collections import OrderedDict
from threading import Lock

_reports = OrderedDict()
_lock = Lock()


def remember_report(report):
    with _lock:
        _reports[report["input_hash"]] = report
        _reports.move_to_end(report["input_hash"])
        while len(_reports) > 10:
            _reports.popitem(last=False)
    return report


def get_report(input_hash):
    with _lock:
        return _reports.get(input_hash)
