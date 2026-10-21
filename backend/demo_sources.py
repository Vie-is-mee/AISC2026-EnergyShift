"""Read-only source inspection. Source schedules are evidence, never trusted plans."""
from collections import Counter, OrderedDict
from copy import deepcopy
from functools import lru_cache
import hashlib
import json
from pathlib import Path
import zipfile
from threading import Lock
from math import isfinite

ROOT = Path(__file__).resolve().parents[1]
INPUT = "Input_JSON_Schedule_Optimization.json"
OUTPUT = "Output_JSON_Schedule_Optimization.json"
ARCHIVE = "S-I-JSP.zip"
_uploads = OrderedDict()
_uploads_lock = Lock()
MAX_SOURCE_BYTES = 4 * 1024 * 1024


def digest(data):
    return "sha256:" + hashlib.sha256(data).hexdigest()


def unique_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate source JSON key")
        result[key] = value
    return result


def finite_constant(value):
    raise ValueError("Nonfinite source JSON value")


def _fingerprint(files):
    return digest(json.dumps(files, sort_keys=True).encode())


def load_pair(source_hash=None):
    if source_hash:
        with _uploads_lock:
            if source_hash in _uploads:
                _uploads.move_to_end(source_hash)
                return deepcopy(_uploads[source_hash])
    files = {}
    for name in (INPUT, OUTPUT):
        path = ROOT / name
        if not path.is_file():
            raise ValueError(f"Thiếu {name}. Đặt tệp nguồn tại thư mục dự án rồi thử lại.")
        raw = path.read_bytes()
        if len(raw) > 4 * 1024 * 1024:
            raise ValueError("Tệp nguồn vượt giới hạn 4 MiB.")
        files[name] = (json.loads(raw.decode("utf-8-sig"), object_pairs_hook=unique_keys, parse_constant=finite_constant), digest(raw))
    metadata = {k: {"file": k, "sha256": v[1]} for k, v in files.items()}
    if source_hash and _fingerprint(metadata) != source_hash:
        raise ValueError("Tệp nguồn đã đổi hoặc đã hết phiên. Nhập lại hai tệp trước khi tính.")
    return files[INPUT][0], files[OUTPUT][0], metadata


def upload_pair(input_text, output_text, input_name=INPUT, output_name=OUTPUT):
    """Validate browser-uploaded bytes without changing repository files or another source pair."""
    values, files = [], {}
    for slot, text, name in ((INPUT, input_text, input_name), (OUTPUT, output_text, output_name)):
        raw = text.encode('utf-8')
        if not raw or len(raw) > MAX_SOURCE_BYTES:
            raise ValueError("Mỗi tệp JSON phải có dữ liệu và không vượt 4 MiB.")
        value = json.loads(raw.decode('utf-8-sig'), object_pairs_hook=unique_keys, parse_constant=finite_constant)
        if not isinstance(value, dict):
            raise ValueError("Tệp JSON phải chứa một đối tượng.")
        values.append(value)
        files[slot] = {"file": Path(name.replace('\\', '/')).name[:160], "sha256": digest(raw)}
    inp, out = values
    try:
        horizon = inp['configuration']['time_window']
        if type(horizon) is not int or not 1 <= horizon <= 2000:
            raise ValueError("Khoảng lập lịch phải từ 1 đến 2000 ô.")
        modes, machines, cells = inp['task_modes'], inp['machines'], out['cell_schedules']
        if not isinstance(modes, list) or not 1 <= len(modes) <= 2048 or not isinstance(machines, list) or not 1 <= len(machines) <= 64 or not isinstance(cells, list) or not 1 <= len(cells) <= 64:
            raise ValueError("Danh sách máy, chế độ hoặc lịch không hợp lệ.")
        def series(values, length=None):
            return isinstance(values, list) and 1 <= len(values) <= 2000 and (length is None or len(values) == length) and all(type(v) in (int, float) and isfinite(v) and v >= 0 for v in values)
        for mode in modes:
            if not isinstance(mode['id'], str) or not mode['id'] or not series(mode['power']):
                raise ValueError("Chế độ cần mã và chuỗi công suất không âm.")
        if len({m['id'] for m in modes}) != len(modes) or len({m['id'] for m in machines}) != len(machines):
            raise ValueError("Mã máy và chế độ không được trùng.")
        for machine in machines:
            if not isinstance(machine['id'], str) or not isinstance(machine['task_modes'], list) or not all(isinstance(x, str) for x in machine['task_modes']):
                raise ValueError("Máy cần mã và danh sách chế độ hợp lệ.")
        prices = [s['price'] for s in inp['energy_sources'] if 'price' in s]
        solar = [s['availability'] for s in inp['energy_sources'] if 'availability' in s]
        if len(prices) != 1 or len(solar) != 1 or not series(prices[0], horizon) or not series(solar[0], horizon):
            raise ValueError("Input cần một chuỗi giá và một chuỗi điện mặt trời đủ khoảng lập lịch.")
        count = 0
        for cell in cells:
            for machine in cell['machines']:
                if not isinstance(machine['machine'], str): raise ValueError("Mã máy trong output không hợp lệ.")
                for row in machine['assignments']:
                    count += 1
                    if count > 20000 or type(row['start']) is not int or row['start'] < 0 or not all(isinstance(row[k], str) for k in ('task', 'task_mode')):
                        raise ValueError("Dòng lịch nguồn không hợp lệ hoặc vượt giới hạn.")
        if not count: raise ValueError("Output chưa có công việc.")
        for rule in inp.get('constraints', []):
            required = ('first_task', 'second_task') if rule['type'] == 'Order' else ('task1', 'task2') if rule['type'] == 'Collision' else None
            if required is None or not all(isinstance(rule['parameter'][key], str) for key in required):
                raise ValueError("Có ràng buộc chưa được hỗ trợ.")
        inp['tasks']
    except (KeyError, TypeError, AttributeError):
        raise ValueError("Hai tệp không đúng cấu trúc Input/Output. Kiểm tra đúng vị trí tệp.") from None
    fingerprint = _fingerprint(files)
    with _uploads_lock:
        _uploads[fingerprint] = deepcopy((inp, out, files))
        _uploads.move_to_end(fingerprint)
        while len(_uploads) > 8:
            _uploads.popitem(last=False)
    return source_audit(fingerprint)


@lru_cache(maxsize=2)
def _archive_summary(size, modified):
    path = ROOT / ARCHIVE
    counts = Counter()
    with zipfile.ZipFile(path) as archive:
        names = [i for i in archive.infolist() if i.filename.endswith(".json")]
        for item in names:
            counts[item.filename.split("/")[-1].split("_")[1]] += 1
        readme = next((i for i in archive.infolist() if i.filename.endswith("README.md")), None)
        if readme and readme.file_size > 128 * 1024:
            raise ValueError("README trong ZIP quá lớn.")
    return {"file": ARCHIVE, "sha256": digest(path.read_bytes()), "instance_count": len(names),
            "job_count_distribution": dict(counts), "schema": ["nbJobs", "nbMchs", "timeEnergy", "drDate", "predSucc"],
            "role": "SEPARATE_BENCHMARK", "note": "Bộ benchmark riêng; không ghép với hai JSON ngành dệt. README ghi đơn vị năng lượng chưa rõ, cần xác minh trước chuyển đổi."}


def source_audit(source_hash=None):
    inp, out, files = load_pair(source_hash)
    modes = {m["id"]: m for m in inp["task_modes"]}
    machines = {m["id"]: set(m["task_modes"]) for m in inp["machines"]}
    rows = []
    for ci, cell in enumerate(out["cell_schedules"]):
        for mi, machine in enumerate(cell["machines"]):
            for ai, item in enumerate(machine["assignments"]):
                mode = modes.get(item.get("task_mode"))
                reason = "UNKNOWN_MODE" if mode is None else (
                    "INCOMPATIBLE_MACHINE" if item["task_mode"] not in machines.get(machine["machine"], set()) else "COMPATIBLE_CANDIDATE")
                rows.append({"id": f"c{ci}-m{mi}-a{ai}", "pointer": f"/cell_schedules/{ci}/machines/{mi}/assignments/{ai}",
                             "machine": machine["machine"], "start": item["start"], "task": item["task"],
                             "task_mode": item["task_mode"], "duration_slots": len(mode["power"]) if mode else None,
                             "product_finished": item.get("product_finished"), "classification": reason})
    counts = Counter(row["classification"] for row in rows)
    fingerprint = _fingerprint(files)
    path = ROOT / ARCHIVE
    archive = _archive_summary(path.stat().st_size, path.stat().st_mtime_ns) if source_hash is None and path.is_file() else None
    return {"status": "AUDITED_NOT_VALIDATED", "source_hash": fingerprint, "files": files,
            "counts": {"total": len(rows), "known_mode": len(rows) - counts["UNKNOWN_MODE"],
                       "compatible": counts["COMPATIBLE_CANDIDATE"], "unknown_mode": counts["UNKNOWN_MODE"],
                       "incompatible_machine": counts["INCOMPATIBLE_MACHINE"]},
            "machines": list(machines), "task_count": len(inp["tasks"]), "mode_count": len(modes),
            "horizon_slots": inp["configuration"]["time_window"], "constraints": inp.get("constraints", []),
            "rows": rows, "archive": archive,
            "original_reported_cost": out.get("statistics", {}).get("cost"),
            "warnings": [f"{len(rows) - counts['UNKNOWN_MODE']} dòng có chế độ và {counts['COMPATIBLE_CANDIDATE']} dòng đúng máy chỉ là kết quả kiểm tra mã; chưa chứng minh lịch khả thi.",
                         f"Input/output có {counts['UNKNOWN_MODE']} dòng thiếu mã chế độ nguồn; không suy đoán mã thay thế hoặc thời lượng.",
                         "Chưa xác minh đơn vị, ngày gốc, tiền tệ và mã bản ghi Zenodo từ nội dung tệp.",
                         "Kết quả chỉ áp dụng cho dữ liệu nguồn và nhóm công việc đã chọn."]}


def default_selection(audit):
    """Stable, explicitly isolated subset; original rows and order remain identifiable."""
    candidates = [r for r in audit["rows"] if r["classification"] == "COMPATIBLE_CANDIDATE"]
    grouped = {mid: sorted([r for r in candidates if r["machine"] == mid], key=lambda r: (r["start"], r["id"]))
               for mid in audit["machines"]}
    # Showcase a readable, multi-machine Gantt rather than eight bars in one lane.
    # Keep selections deterministic and spread each lane across its time horizon.
    target = min(18, sum(len(group) for group in grouped.values()))
    counts = {mid: 0 for mid in grouped}
    available = [mid for mid in audit["machines"] if grouped[mid]]
    while sum(counts.values()) < target:
        progressed = False
        for mid in available:
            if sum(counts.values()) >= target:
                break
            if counts[mid] < len(grouped[mid]):
                counts[mid] += 1
                progressed = True
        if not progressed:
            break
    picked = []
    for mid in available:
        group, n = grouped[mid], counts[mid]
        indices = [round(i * (len(group) - 1) / (n - 1)) for i in range(n)] if n > 1 else [0]
        picked.extend(group[i] for i in indices)
    return [row["id"] for row in sorted(picked, key=lambda row: (row["start"], row["machine"], row["id"]))]
