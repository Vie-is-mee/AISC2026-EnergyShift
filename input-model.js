/* Pure input preparation. No network, storage, evaluation or guessed production facts. */
"use strict";
const InputModel = (() => {
  const copy = (v) => JSON.parse(JSON.stringify(v));
  const fields = [
    "job_id",
    "template_id",
    "quantity",
    "machine_id",
    "start",
    "release",
    "due",
  ];
  const titles = [
    "Mã lô",
    "Định mức",
    "Số lượng",
    "Máy",
    "Bắt đầu",
    "Sẵn sàng từ",
    "Hạn xong",
  ];
  const aliases = [
    ["job_id", "ma lo", "ma lenh", "lenh san xuat"],
    ["template_id", "dinh muc", "ma dinh muc"],
    ["quantity", "so luong", "san luong"],
    ["machine_id", "may", "ma may"],
    ["start", "bat dau", "gio bat dau"],
    ["release", "san sang tu", "release time"],
    ["due", "han xong", "han hoan thanh", "deadline"],
  ];
  const norm = (v) =>
    v
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/[_-]/g, " ")
      .replace(/\s+/g, " ");
  function parseTable(text, { maxRows = 8 } = {}) {
    if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > 500)
      throw Error("Giới hạn dòng phải từ 1 đến 500.");
    if (new TextEncoder().encode(text).length > 128 * 1024)
      throw Error("Bảng vượt 128 KiB.");
    text = text.replace(/^\uFEFF/, "");
    const counts = { "\t": 0, ";": 0, ",": 0 };
    let inHeaderQuote = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (inHeaderQuote && text[i + 1] === '"') i++;
        else inHeaderQuote = !inHeaderQuote;
      } else if (!inHeaderQuote) {
        if (c === "\r" || c === "\n") break;
        if (Object.hasOwn(counts, c)) counts[c]++;
      }
    }
    const delimiter = Object.keys(counts).sort(
      (a, b) => counts[b] - counts[a],
    )[0];
    const grid = [];
    let row = [],
      cell = "",
      quoted = false,
      closed = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') {
          cell += '"';
          i++;
        } else if (c === '"') {
          quoted = false;
          closed = true;
        } else cell += c;
      } else if (c === '"') {
        if (cell || closed) throw Error("Dấu nháy CSV không hợp lệ.");
        quoted = true;
      } else if (c === delimiter || c === "\n" || c === "\r") {
        row.push(cell);
        cell = "";
        closed = false;
        if (c !== delimiter) {
          if (row.some((v) => v.trim())) grid.push(row);
          row = [];
          if (c === "\r" && text[i + 1] === "\n") i++;
        }
      } else {
        if (closed) throw Error("Ký tự sau dấu nháy CSV đóng không hợp lệ.");
        cell += c;
      }
    }
    if (quoted) throw Error("CSV còn dấu nháy chưa đóng.");
    row.push(cell);
    if (row.some((v) => v.trim())) grid.push(row);
    if (grid.length < 2 || grid.length > maxRows + 1)
      throw Error(
        `Cần dòng tiêu đề và 1–${maxRows} dòng; không tự cắt bỏ dòng.`,
      );
    const headers = grid[0].map((v) => v.trim());
    if (headers.length > 32 || grid.some((r) => r.some((c) => c.length > 4096)))
      throw Error("Bảng tối đa 32 cột; mỗi ô tối đa 4096 ký tự.");
    if (
      headers.some((v) => !v) ||
      new Set(headers.map(norm)).size !== headers.length
    )
      throw Error("Tên cột trống hoặc trùng nhau.");
    if (grid.some((r) => r.length !== headers.length))
      throw Error("Số ô không khớp tiêu đề. Kiểm tra dấu phân cách/nháy.");
    return { headers, rows: grid.slice(1), delimiter };
  }
  function suggest(headers) {
    return headers.map((h) => {
      const n = aliases.findIndex((a) => a.some((s) => norm(s) === norm(h)));
      return n < 0 ? "" : fields[n];
    });
  }
  function mapRows(parsed, mapping, acknowledgeExtras = false) {
    if (mapping.length !== parsed.headers.length)
      throw Error("Ghép cột không khớp bảng.");
    const used = mapping.filter(Boolean);
    if (
      used.some((f) => !fields.includes(f)) ||
      new Set(used).size !== used.length
    )
      throw Error("Một trường bị ghép nhiều lần hoặc không hợp lệ.");
    const missing = fields.filter((f) => !used.includes(f));
    if (missing.length)
      throw Error(
        "Cần ghép cột: " +
          missing.map((f) => titles[fields.indexOf(f)]).join(", "),
      );
    if (used.length !== mapping.length && !acknowledgeExtras)
      throw Error(
        "Có cột ngoài mô hình. Xem lại và xác nhận lưu kèm, không dùng tính toán.",
      );
    return parsed.rows.map((r) =>
      Object.fromEntries(
        mapping.flatMap((f, i) => (f ? [[f, r[i].trim()]] : [])),
      ),
    );
  }
  function rowsFrom(data) {
    return data.current_schedule.map((a) => {
      const j = data.jobs.find((j) => j.id === a.job_id);
      return {
        job_id: j.id,
        template_id: j.id,
        quantity: String(j.quantity),
        machine_id: a.machine_id,
        start: local(jDate(a.start)),
        release: local(jDate(j.release)),
        due: local(jDate(j.due)),
      };
    });
  }
  const jDate = (s) => new Date(s);
  function local(date) {
    return new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 16);
  }
  function timestamp(s) {
    if (!/^\d{4}-\d\d-\d\d[T ]\d\d:\d\d(?:\+07:00)?$/.test(s))
      throw Error(
        "Ngày giờ phải là YYYY-MM-DD HH:mm (giờ Việt Nam), không dùng ngày mơ hồ.",
      );
    const t = s.replace(" ", "T").replace(/\+07:00$/, "");
    const d = new Date(t + "+07:00");
    if (!Number.isFinite(d.getTime()) || local(d) !== t)
      throw Error("Ngày giờ không tồn tại: " + s);
    return t + "+07:00";
  }
  function compile(base, rows, options = {}) {
    if (!rows.length || rows.length > 8) throw Error("Cần 1–8 lô.");
    const data = copy(base),
      ids = new Set();
    data.jobs = [];
    data.current_schedule = [];
    rows.forEach((r, i) => {
      const fail = (why) => {
        throw Error("Dòng " + (i + 1) + ": " + why);
      };
      if (!/^[A-Za-z0-9_-]+$/.test(r.job_id) || ids.has(r.job_id))
        fail("Mã lô trống, sai định dạng hoặc trùng.");
      ids.add(r.job_id);
      const template = base.jobs.find((j) => j.id === r.template_id);
      if (!template)
        fail("Định mức chưa có trong hồ sơ. Chọn định mức hoặc bổ sung hồ sơ.");
      if (
        !/^\d+$/.test(String(r.quantity)) ||
        Number(r.quantity) !== template.quantity
      )
        fail(
          "Số lượng khác định mức đã xác nhận (" +
            template.quantity +
            "). Cập nhật số lượng và thời lượng từng máy ở mục Định mức; không tự nhân tỷ lệ.",
        );
      if (!Object.hasOwn(template.eligible, r.machine_id))
        fail("Máy không thuộc danh sách tương thích đã khai báo.");
      const job = copy(template);
      job.id = r.job_id;
      job.release = timestamp(r.release);
      job.due = timestamp(r.due);
      data.jobs.push(job);
      data.current_schedule.push({
        job_id: job.id,
        machine_id: r.machine_id,
        start: timestamp(r.start),
      });
    });
    // The profile is a reusable catalog; the submitted snapshot only declares
    // families in this plan or the initial machine state. Keep the full catalog in base.
    const activeFamilies = new Set([
      ...data.jobs.map(j => j.family),
      ...Object.values(data.setup.initial_family_by_machine),
    ]);
    const catalogFamilies = new Set([
      ...base.jobs.map(j => j.family),
      ...Object.values(base.setup.initial_family_by_machine),
    ]);
    const catalogMachines = new Set(base.machines.map(m => m.id));
    data.setup.transitions = data.setup.transitions.filter(t =>
      !catalogMachines.has(t.machine_id) || !catalogFamilies.has(t.from_family) ||
      !catalogFamilies.has(t.to_family) ||
      (activeFamilies.has(t.from_family) && activeFamilies.has(t.to_family)));
    if (!options.reconfirmCosts) {
      for (const k of data.cost_scope.excluded)
        data.cost_scope.excluded_review[k] = {
          status: "UNKNOWN",
          incremental_min_vnd: null,
          incremental_max_vnd: null,
          source_type:
            base.metadata.source_type === "SYNTHETIC"
              ? "SYNTHETIC"
              : "ESTIMATED",
          reference: "input-desk: new plan requires cost review",
        };
    }
    return data;
  }
  function shift(base, date) {
    const target = timestamp(date + "T00:00");
    const origin =
      local(jDate(base.horizon.start)).slice(0, 10) + "T00:00+07:00";
    const delta = Date.parse(target) - Date.parse(origin);
    const data = copy(base),
      move = (s) => local(new Date(Date.parse(s) + delta)) + "+07:00";
    const win = (w) => {
      w.start = move(w.start);
      w.end = move(w.end);
    };
    win(data.horizon);
    data.machines.forEach((m) => m.available.forEach(win));
    data.tariff.windows.forEach(win);
    data.jobs.forEach((j) => {
      j.release = move(j.release);
      j.due = move(j.due);
    });
    data.current_schedule.forEach((a) => {
      a.start = move(a.start);
    });
    return data;
  }
  function csv(rows) {
    const quote = (v) => '"' + String(v).replaceAll('"', '""') + '"';
    // IDs and template IDs are restricted by the data gate. No arbitrary user text is exported to cells.
    return [fields, ...rows.map((r) => fields.map((f) => r[f]))]
      .map((r) => r.map(quote).join(","))
      .join("\r\n");
  }
  return {
    copy,
    fields,
    titles,
    parseTable,
    suggest,
    mapRows,
    rowsFrom,
    compile,
    timestamp,
    local,
    shift,
    csv,
  };
})();
if (typeof module !== "undefined") module.exports = InputModel;
