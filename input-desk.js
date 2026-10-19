"use strict";
window.InputDesk = (() => {
  const M = InputModel,
    el = (id) => document.getElementById(id);
  const KEYS = {
    profiles: "energyshift.profiles.v1",
    draft: "energyshift.draft.v1",
    mappings: "energyshift.mappings.v1",
  };
  let base = null,
    rows = [],
    dirty = false,
    external = false,
    serial = 0,
    applying = false;
  let importSource = null,
    parsed = null,
    trace = null,
    timer,
    templateDirty = false,
    workshopDirty = false,
    selectedTemplate = "",
    fileTableText = null,
    fileLoading = false,
    fileError = false;
  const msg = (text) => {
    el("deskStatus").textContent = text;
  };
  const issue = (items) => {
    const box = el("deskIssues");
    box.replaceChildren();
    box.hidden = !items.length;
    items.forEach((s) => box.append(node("li", s)));
    if (items.length) {
      window.Workspace?.show("tab-dispatch");
      box.scrollIntoView({ block: "center" });
    }
  };
  function read(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch {
      el("memoryStatus").textContent =
        "Không đọc được bộ nhớ. Dữ liệu trên màn hình vẫn dùng được; hãy tải bản sao.";
      return fallback;
    }
  }
  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      el("memoryStatus").textContent =
        "Không lưu được trên trình duyệt (bộ nhớ đầy/bị chặn). Hãy tải bản sao.";
      return false;
    }
  }
  function download(name, value, type = "application/json") {
    const url = URL.createObjectURL(
      new Blob(
        [typeof value === "string" ? value : JSON.stringify(value, null, 2)],
        { type },
      ),
    );
    const a = node("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function input(value, type = "text") {
    const x = node("input");
    x.type = type;
    x.value = value ?? "";
    return x;
  }
  function select(values, value) {
    const s = node("select");
    values.forEach(([id, label]) => {
      const o = node("option", label);
      o.value = id;
      s.append(o);
    });
    s.value = value;
    return s;
  }
  function stamp() {
    serial++;
    trace = null;
    dirty = true;
    clearResult();
    el("confirmCosts").checked = false;
    el("confirmCalendar").checked = false;
    msg("Đã ghi nhận chỉnh sửa. Bấm Phân tích kế hoạch khi sẵn sàng.");
    scheduleDraft();
  }
  function packet() {
    return {
      version: 1,
      saved_at: new Date().toISOString(),
      base,
      rows,
      import_source: importSource,
    };
  }
  function scheduleDraft() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (base && write(KEYS.draft, packet()))
        el("memoryStatus").textContent = dirty
          ? "Đã lưu bản nháp. Bấm Phân tích kế hoạch để xem kết quả mới."
          : "Đã lưu bản nháp trên trình duyệt này.";
    }, 350);
  }
  function summary() {
    if (!base) return;
    el("profileSummary").textContent =
      `${base.metadata.plant_alias} · ${base.metadata.source_type} · ${base.machines.length} máy · ${base.molds.length} khuôn · ${base.jobs.length} định mức · ${base.horizon.start} → ${base.horizon.end}`;
    el("readinessSummary").textContent =
      "Nguồn: " +
      base.metadata.source_type +
      ". Kiểm tra: lịch máy sẵn sàng, khuôn ban đầu, tương thích và định mức; biểu giá: " +
      base.tariff.provenance +
      ". Các thông tin này được giữ nguyên từ hồ sơ, chưa được xác minh ngoài thực tế.";
    const t = node("table"),
      head = node("tr");
    [
      "Khoản",
      "Trạng thái",
      "Khoảng phát sinh VND",
      "Nguồn / tham chiếu",
    ].forEach((s) => head.append(node("th", s)));
    t.append(head);
    Object.entries(base.cost_scope.excluded_review).forEach(([k, v]) => {
      const r = node("tr");
      [
        k,
        v.status,
        v.status === "UNKNOWN"
          ? "Chưa biết"
          : `${v.incremental_min_vnd} → ${v.incremental_max_vnd}`,
        `${v.source_type} · ${v.reference}`,
      ].forEach((s) => r.append(node("td", s)));
      t.append(r);
    });
    el("costReviewSummary").replaceChildren(t);
  }
  function showTemplate() {
    const j = base?.jobs.find((j) => j.id === el("templatePick").value);
    if (!j) return;
    selectedTemplate = j.id;
    el("templateQuantity").value = j.quantity;
    el("templateReference").value = "";
    templateDirty = false;
    el("templateSource").value =
      base.metadata.source_type === "SYNTHETIC" ? "SYNTHETIC" : "ESTIMATED";
    const body = el("templateRows");
    body.replaceChildren();
    Object.entries(j.eligible).forEach(([id, p]) => {
      const r = node("tr");
      r.dataset.machine = id;
      r.append(node("td", id));
      const controls = [
        input(p.duration_min, "number"),
        input(p.avg_kw, "number"),
        select(
          [
            ["SYNTHETIC", "Giả lập"],
            ["MEASURED", "Đã đo"],
            ["ESTIMATED", "Ước tính"],
          ],
          p.power_source,
        ),
        input(p.power_uncertainty_pct, "number"),
      ];
      controls.forEach((c, i) => {
        c.dataset.field = [
          "duration_min",
          "avg_kw",
          "power_source",
          "power_uncertainty_pct",
        ][i];
        c.setAttribute("aria-label", id + " " + c.dataset.field);
        if (c.type === "number") {
          c.min = i === 0 ? "1" : "0";
          c.step = i === 0 ? "1" : "any";
        }
        const td = node("td");
        td.append(c);
        r.append(td);
      });
      body.append(r);
    });
  }
  function showWorkshop() {
    workshopDirty = false;
    const mount = (bodyId, data) => {
      el(bodyId).replaceChildren(
        ...data.map(({ id, controls }) => {
          const tr = node("tr");
          tr.dataset.id = id;
          controls.forEach((c, i) => {
            c.dataset.col = i;
            const td = node("td");
            td.append(c);
            tr.append(td);
          });
          return tr;
        }),
      );
    };
    const sources = [
      ["SYNTHETIC", "Giả lập"],
      ["MEASURED", "Đã đo"],
      ["ESTIMATED", "Ước tính"],
      ["PARTNER_CONFIRMED", "Đối tác xác nhận"],
    ];
    mount(
      "machineConfigRows",
      base.machines.map((m) => {
        const change = base.setup.mold_change_by_machine[m.id],
          calendar = node("textarea");
        calendar.rows = 2;
        calendar.value = m.available
          .map(
            (w) =>
              M.local(new Date(w.start)) + " | " + M.local(new Date(w.end)),
          )
          .join("\n");
        return {
          id: m.id,
          controls: [
            node("span", m.id),
            calendar,
            input(base.setup.initial_mold_by_machine[m.id]),
            input(base.setup.initial_family_by_machine[m.id]),
            input(change.minutes, "number"),
            input(change.incremental_cost_vnd, "number"),
            (() => {
              const box = node("div");
              box.append(
                select(sources, change.source_type),
                input(change.reference),
              );
              return box;
            })(),
          ],
        };
      }),
    );
    el("tariffReference").value = base.tariff.provenance;
    mount(
      "tariffConfigRows",
      base.tariff.windows.map((w, i) => ({
        id: String(i),
        controls: [
          input(M.local(new Date(w.start)), "datetime-local"),
          input(M.local(new Date(w.end)), "datetime-local"),
          select(
            [
              ["NORMAL", "Bình thường"],
              ["PEAK", "Cao điểm"],
              ["OFF_PEAK", "Thấp điểm"],
            ],
            w.band,
          ),
          input(w.vnd_per_kwh, "number"),
        ],
      })),
    );
    mount(
      "costConfigRows",
      Object.entries(base.cost_scope.excluded_review).map(([id, v]) => ({
        id,
        controls: [
          node("span", id),
          select(
            [
              ["UNKNOWN", "Chưa biết"],
              ["BOUNDED", "Có khoảng xác nhận"],
            ],
            v.status,
          ),
          input(v.incremental_min_vnd, "number"),
          input(v.incremental_max_vnd, "number"),
          select(sources, v.source_type),
          input(v.reference),
        ],
      })),
    );
    for (const body of [
      "machineConfigRows",
      "tariffConfigRows",
      "costConfigRows",
    ]) {
      el(body)
        .querySelectorAll("input,select,textarea")
        .forEach((c, i) => c.setAttribute("aria-label", body + " " + (i + 1)));
    }
  }
  function showRows() {
    const body = el("planInputRows");
    body.replaceChildren();
    rows.forEach((r, i) => {
      const tr = node("tr");
      M.fields.forEach((f, n) => {
        let c;
        if (f === "template_id")
          c = select(
            base.jobs.map((j) => [
              j.id,
              `${j.id} · ${j.family}/${j.mold_id} · ${j.quantity} sp`,
            ]),
            r[f],
          );
        else if (f === "machine_id") {
          const j = base.jobs.find((j) => j.id === r.template_id);
          const machines = Object.keys(j?.eligible || {});
          c = select(
            [...new Set([r.machine_id, ...machines])]
              .filter(Boolean)
              .map((id) => [
                id,
                machines.includes(id) ? id : id + " (chưa tương thích)",
              ]),
            r[f],
          );
        } else
          c = input(
            r[f],
            ["start", "release", "due"].includes(f)
              ? "datetime-local"
              : f === "quantity"
                ? "number"
                : "text",
          );
        c.setAttribute("aria-label", `Lô ${i + 1}: ${M.titles[n]}`);
        c.dataset.field = f;
        c.addEventListener("input", () => {
          r[f] = c.value;
          stamp();
        });
        if (f === "template_id")
          c.addEventListener("change", () => {
            const j = base.jobs.find((j) => j.id === c.value);
            r.quantity = String(j.quantity);
            if (!Object.hasOwn(j.eligible, r.machine_id))
              r.machine_id = Object.keys(j.eligible)[0];
            showRows();
          });
        const td = node("td");
        td.dataset.field = f;
        td.append(c);
        tr.append(td);
      });
      const td = node("td"),
        remove = node("button", "Xóa");
      remove.type = "button";
      remove.setAttribute("aria-label", "Xóa lô " + r.job_id);
      remove.onclick = () => {
        rows.splice(i, 1);
        stamp();
        showRows();
      };
      td.append(remove);
      tr.append(td);
      body.append(tr);
    });
  }
  function load(data) {
    base = M.copy(data);
    rows = M.rowsFrom(base);
    external = false;
    dirty = false;
    trace = null;
    serial++;
    templateDirty = false;
    workshopDirty = false;
    importSource = null;
    parsed = null;
    el("importPreview").hidden = true;
    el("confirmCosts").checked = false;
    el("templatePick").replaceChildren(
      ...base.jobs.map((j) => {
        const o = node("option", j.id + " · " + j.mold_id);
        o.value = j.id;
        return o;
      }),
    );
    el("planDate").value = M.local(new Date(base.horizon.start)).slice(0, 10);
    showRows();
    showTemplate();
    showWorkshop();
    summary();
    issue([]);
    msg("Đã nạp kế hoạch. Bạn có thể sửa bảng hoặc phân tích ngay.");
    el("deskApplied").textContent =
      "Đầu vào engine giữ nguyên; chỉnh bảng rồi áp dụng khi cần.";
  }
  async function validate(data) {
    const r = await apiFetch("/api/demo/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await r.json();
    if (!r.ok)
      throw Error(
        (result.errors || [])
          .map((e) => [e.field, e.code, e.why].join(" · "))
          .join("\n") || "Không kiểm tra được dữ liệu.",
      );
    return result;
  }
  async function apply() {
    if (external)
      throw Error(
        "JSON vừa thay đổi. Bấm Đọc lại từ đầu vào hiện tại trước khi dùng bảng.",
      );
    if (templateDirty || workshopDirty)
      throw Error(
        "Có thiết lập/định mức đang sửa chưa xác nhận cập nhật. Cập nhật trước khi áp dụng kế hoạch.",
      );
    const stampId = serial,
      costConfirmed = el("confirmCosts").checked;
    const data = M.compile(base, rows, { reconfirmCosts: costConfirmed });
    if (costConfirmed)
      data.cost_scope.review_scope = "ALL_CANDIDATE_SCHEDULES_IN_HORIZON";
    const gate = await validate(data);
    if (stampId !== serial)
      throw Error("Bảng đã đổi trong lúc kiểm tra. Hãy áp dụng lại.");
    applying = true;
    try {
      setDataset(gate.snapshot);
    } finally {
      applying = false;
    }
    dirty = false;
    trace = {
      version: "input-desk-1",
      prepared_at: new Date().toISOString(),
      input_hash: gate.input_hash,
      profile_name: el("profileName").value.trim() || null,
      profile_snapshot: M.copy(base),
      rows: M.copy(rows),
      import_source: M.copy(importSource),
      excluded_costs_reconfirmed: costConfirmed,
      note: "User-supplied preparation; not independently authenticated. Unmapped columns are retained, not modeled.",
    };
    issue([]);
    msg("Đầu vào đủ cấu trúc. Sẵn sàng tính chi phí và kiểm định lịch.");
    el("deskApplied").textContent =
      `${rows.length} lô · dùng lại định mức và hồ sơ · chi phí ngoài mô hình: ${costConfirmed ? "giữ review đã xác nhận" : "UNKNOWN — cần rà soát"}.`;
    scheduleDraft();
  }
  function profiles() {
    const p = read(KEYS.profiles, []);
    return Array.isArray(p)
      ? p.filter(
          (v) =>
            v &&
            v.version === 1 &&
            typeof v.name === "string" &&
            v.dataset &&
            typeof v.saved_at === "string",
        )
      : [];
  }
  function refreshProfiles() {
    const previous = el("profileList").value;
    el("profileList").replaceChildren();
    const o = node("option", "Chọn hồ sơ…");
    o.value = "";
    el("profileList").append(o);
    profiles().forEach((p) => {
      const o = node("option", p.name);
      o.title = "Lưu lúc: " + p.saved_at;
      o.value = p.name;
      el("profileList").append(o);
    });
    el("profileList").value = previous;
  }
  function action(id, fn) {
    el(id).addEventListener("click", async () => {
      issue([]);
      try {
        await fn();
      } catch (e) {
        issue(String(e.message).split("\n"));
        msg("Chưa áp dụng. Xử lý các mục cần bổ sung bên trên.");
      }
    });
  }
  action("fromJson", async () => {
    const gate = await validate(JSON.parse(el("dataset").value));
    load(gate.snapshot);
  });
  action("applyPlan", apply);
  action("addPlanRow", () => {
    if (!base) throw Error("Chưa có hồ sơ.");
    if (rows.length >= 8)
      throw Error("Demo giới hạn 8 lô; không tự xóa lô cũ.");
    const j = base.jobs[0];
    let n = 1;
    while (rows.some((r) => r.job_id === "NEW_" + n)) n++;
    rows.push({
      job_id: "NEW_" + n,
      template_id: j.id,
      quantity: String(j.quantity),
      machine_id: Object.keys(j.eligible)[0],
      start: M.local(new Date(base.horizon.start)),
      release: M.local(new Date(j.release)),
      due: M.local(new Date(j.due)),
    });
    stamp();
    showRows();
  });
  action("downloadPlan", () => {
    if (!base) throw Error("Chưa có dữ liệu.");
    M.compile(base, rows);
    download(
      "EnergyShift_ke_hoach.csv",
      "\uFEFF" + M.csv(rows),
      "text/csv;charset=utf-8",
    );
  });
  el("templatePick").onchange = () => {
    if (templateDirty) {
      el("templatePick").value = selectedTemplate;
      issue([
        "Xác nhận cập nhật định mức đang sửa trước khi chọn định mức khác.",
      ]);
      return;
    }
    showTemplate();
  };
  for (const id of [
    "templateQuantity",
    "templateSource",
    "templateReference",
    "templateRows",
  ])
    el(id).addEventListener("input", () => {
      templateDirty = true;
      stamp();
    });
  for (const id of [
    "machineConfigRows",
    "tariffConfigRows",
    "costConfigRows",
    "tariffReference",
  ])
    el(id).addEventListener("input", () => {
      workshopDirty = true;
      stamp();
    });
  action("updateWorkshop", async () => {
    if (!base || external)
      throw Error("Đọc lại đầu vào trước khi sửa thiết lập.");
    const data = M.copy(base),
      stampId = serial;
    const value = (r, i) => r.querySelector(`[data-col="${i}"]`).value;
    const number = (s, integer = true) => {
      if (
        !s.trim() ||
        !Number.isFinite(Number(s)) ||
        (integer && !Number.isSafeInteger(Number(s)))
      )
        throw Error("Cần nhập số hợp lệ; không coi ô trống là 0.");
      return Number(s);
    };
    for (const r of el("machineConfigRows").children) {
      const id = r.dataset.id;
      data.machines.find((m) => m.id === id).available = value(r, 1)
        .split("\n")
        .filter((s) => s.trim())
        .map((s) => {
          const parts = s.split("|").map((s) => s.trim());
          if (parts.length !== 2)
            throw Error("Lịch máy cần định dạng bắt đầu | kết thúc.");
          return { start: M.timestamp(parts[0]), end: M.timestamp(parts[1]) };
        });
      data.setup.initial_mold_by_machine[id] = value(r, 2).trim() || null;
      data.setup.initial_family_by_machine[id] = value(r, 3).trim();
      const evidence = r.querySelector('[data-col="6"]');
      data.setup.mold_change_by_machine[id] = {
        minutes: number(value(r, 4)),
        incremental_cost_vnd: number(value(r, 5)),
        source_type: evidence.querySelector("select").value,
        reference: evidence.querySelector("input").value.trim(),
      };
    }
    data.tariff.provenance = el("tariffReference").value.trim();
    data.tariff.windows = [...el("tariffConfigRows").children].map((r) => ({
      start: M.timestamp(value(r, 0)),
      end: M.timestamp(value(r, 1)),
      band: value(r, 2),
      vnd_per_kwh: number(value(r, 3), false),
    }));
    for (const r of el("costConfigRows").children) {
      const unknown = value(r, 1) === "UNKNOWN";
      data.cost_scope.excluded_review[r.dataset.id] = {
        status: value(r, 1),
        incremental_min_vnd: unknown ? null : number(value(r, 2)),
        incremental_max_vnd: unknown ? null : number(value(r, 3)),
        source_type: value(r, 4),
        reference: value(r, 5).trim(),
      };
    }
    await validate(data);
    if (stampId !== serial)
      throw Error("Thiết lập đã đổi khi kiểm tra. Cập nhật lại.");
    base = data;
    workshopDirty = false;
    stamp();
    showWorkshop();
    summary();
    msg(
      "Đã kiểm tra cấu trúc thiết lập. Áp dụng kế hoạch rồi chạy để kiểm định lịch.",
    );
  });
  action("updateTemplate", () => {
    if (!base) throw Error("Chưa có dữ liệu.");
    if (external) throw Error("Đọc lại JSON trước khi sửa định mức.");
    const j = base.jobs.find((j) => j.id === el("templatePick").value),
      reference = el("templateReference").value.trim(),
      q = Number(el("templateQuantity").value);
    if (!Number.isSafeInteger(q) || q <= 0 || !reference)
      throw Error("Cần số lượng nguyên dương và tham chiếu xác nhận mới.");
    const updated = M.copy(j);
    for (const r of el("templateRows").children) {
      const p = updated.eligible[r.dataset.machine],
        get = (f) => r.querySelector(`[data-field="${f}"]`).value;
      const duration = Number(get("duration_min")),
        kwText = get("avg_kw"),
        kw = Number(kwText),
        radius = get("power_uncertainty_pct");
      if (
        !Number.isSafeInteger(duration) ||
        duration <= 0 ||
        !kwText ||
        !Number.isFinite(kw) ||
        kw < 0 ||
        (radius !== "" &&
          (!Number.isFinite(Number(radius)) ||
            Number(radius) < 0 ||
            Number(radius) > 1))
      )
        throw Error(
          "Thời lượng/công suất/sai số không hợp lệ trên " + r.dataset.machine,
        );
      Object.assign(p, {
        duration_min: duration,
        avg_kw: kw,
        power_source: get("power_source"),
        power_uncertainty_pct: radius === "" ? null : Number(radius),
        lot_confirmation: {
          quantity: q,
          duration_min: duration,
          source_type: el("templateSource").value,
          reference,
        },
      });
    }
    updated.quantity = q;
    Object.assign(j, updated);
    templateDirty = false;
    stamp();
    summary();
    msg(
      "Đã cập nhật định mức. Số lượng trên bảng lô phải khớp; lưu hồ sơ để nhớ cho lần sau.",
    );
  });
  action("shiftPlan", () => {
    if (templateDirty || workshopDirty || external)
      throw Error(
        "Cập nhật thiết lập/định mức hoặc đọc lại JSON trước khi dời ngày.",
      );
    if (!el("confirmCalendar").checked)
      throw Error(
        "Cần xác nhận lịch máy/giá điện/trạng thái khuôn phù hợp trước khi dời.",
      );
    const original = M.compile(base, rows, { reconfirmCosts: true });
    const shifted = M.shift(original, el("planDate").value);
    // Shift the full template library as well, retaining unused templates for future orders.
    base = M.shift(base, el("planDate").value);
    const templates = rows.map((r) => r.template_id);
    rows = M.rowsFrom(shifted).map((r, i) => ({
      ...r,
      template_id: templates[i],
    }));
    stamp();
    showRows();
    showWorkshop();
    summary();
    msg("Đã dời mốc thời gian. Rà soát ngoại lệ ngày mới rồi áp dụng.");
  });
  action("saveProfile", async () => {
    if (!base || external) throw Error("Đọc lại đầu vào trước khi lưu.");
    if (templateDirty || workshopDirty)
      throw Error("Xác nhận cập nhật thiết lập/định mức trước khi lưu hồ sơ.");
    const name = el("profileName").value.trim();
    if (!name) throw Error("Đặt tên hồ sơ để lưu.");
    // Save the whole library, never infer a permanent template from a partial imported plan.
    const candidate = M.copy(base),
      stampId = serial;
    await validate(candidate);
    if (stampId !== serial) throw Error("Hồ sơ đã đổi lúc kiểm tra. Lưu lại.");
    const list = profiles(),
      p = {
        version: 1,
        name,
        saved_at: new Date().toISOString(),
        dataset: candidate,
      };
    const i = list.findIndex((p) => p.name === name);
    if (i < 0 && list.length >= 5)
      throw Error("Tối đa 5 hồ sơ; xóa hồ sơ không cần hoặc tải bản sao.");
    if (i < 0) list.push(p);
    else list[i] = p;
    if (write(KEYS.profiles, list)) {
      refreshProfiles();
      el("profileList").value = name;
      el("memoryStatus").textContent =
        "Đã lưu hồ sơ “" +
        name +
        "”. Kế hoạch trên bảng được lưu riêng ở bản nháp.";
    }
  });
  action("loadProfile", async () => {
    const p = profiles().find((p) => p.name === el("profileList").value);
    if (!p) throw Error("Chọn hồ sơ đã lưu.");
    const stampId = serial;
    await validate(p.dataset);
    if (stampId !== serial) throw Error("Dữ liệu đã đổi; chọn hồ sơ lại.");
    clearResult();
    load(p.dataset);
    el("profileName").value = p.name;
    stamp();
  });
  action("deleteProfile", () => {
    const name = el("profileList").value;
    if (!name) throw Error("Chọn hồ sơ cần xóa.");
    if (
      write(
        KEYS.profiles,
        profiles().filter((p) => p.name !== name),
      )
    ) {
      refreshProfiles();
      el("memoryStatus").textContent =
        "Đã xóa hồ sơ khỏi trình duyệt. Dữ liệu đang mở vẫn giữ nguyên.";
    }
  });
  action("downloadProfile", () => {
    if (!base) throw Error("Chưa có hồ sơ.");
    if (templateDirty || workshopDirty || external)
      throw Error(
        "Cập nhật thiết lập/định mức hoặc đọc lại JSON trước khi tải bản sao đầy đủ.",
      );
    download("EnergyShift_input_workspace.json", {
      ...packet(),
      name: el("profileName").value,
      applied_input: JSON.parse(el("dataset").value),
    });
  });
  async function restore(p) {
    if (
      !p ||
      p.version !== 1 ||
      !Array.isArray(p.rows) ||
      p.rows.length > 8 ||
      !p.rows.length ||
      p.rows.some((r) => M.fields.some((f) => typeof r[f] !== "string"))
    )
      throw Error("Bản sao/nháp sai cấu trúc hoặc phiên bản.");
    const stampId = serial;
    await validate(p.base);
    if (stampId !== serial)
      throw Error("Dữ liệu đã đổi lúc khôi phục; hãy khôi phục lại.");
    clearResult();
    load(p.base);
    rows = M.copy(p.rows);
    importSource = p.import_source || null;
    el("profileName").value = typeof p.name === "string" ? p.name : "";
    stamp();
    showRows();
    msg(
      "Đã khôi phục kế hoạch. Kiểm tra bảng rồi bấm Phân tích kế hoạch; kết quả cũ không được khôi phục.",
    );
  }
  action("restoreDraft", async () => {
    const d = read(KEYS.draft, null);
    if (!d) throw Error("Chưa có bản nháp.");
    await restore(d);
  });
  action("deleteDraft", () => {
    clearTimeout(timer);
    try {
      localStorage.removeItem(KEYS.draft);
      el("memoryStatus").textContent =
        "Đã xóa bản nháp. Chỉ khi sửa tiếp mới lưu bản mới.";
    } catch {
      throw Error("Không xóa được bộ nhớ.");
    }
  });
  el("restoreProfileFile").onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      if (f.size > 512 * 1024) throw Error("Bản sao tối đa 512 KiB.");
      await restore(JSON.parse(await f.text()));
    } catch (e) {
      issue([e.message]);
    }
    e.target.value = "";
  };
  el("tableFile").onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    fileLoading = true;
    fileError = false;
    try {
      if (!/\.(csv|tsv)$/i.test(f.name))
        throw Error("Chỉ nhận CSV/TSV. Với Excel, sao chép bảng rồi dán.");
      if (f.size > 128 * 1024) throw Error("Bảng tối đa 128 KiB.");
      fileTableText = new TextDecoder("utf-8", {
        fatal: true,
        ignoreBOM: true,
      }).decode(await f.arrayBuffer());
      el("tablePaste").value = fileTableText;
      el("importPreview").hidden = true;
      parsed = null;
      msg("Đã đọc bảng. Bấm Xem trước & ghép cột.");
    } catch (e) {
      fileError = true;
      issue([e.message]);
    } finally {
      fileLoading = false;
    }
    e.target.value = "";
  };
  el("tablePaste").oninput = () => {
    fileError = false;
    fileTableText = null;
    parsed = null;
    el("importPreview").hidden = true;
  };
  action("previewImport", () => {
    parsed = null;
    el("importPreview").hidden = true;
    parsed = M.parseTable(el("tablePaste").value);
    const mappings = read(KEYS.mappings, {}),
      signature = JSON.stringify(parsed.headers);
    const remembered =
      mappings && typeof mappings === "object" ? mappings[signature] : null;
    const guessed =
      Array.isArray(remembered) && remembered.length === parsed.headers.length
        ? remembered
        : M.suggest(parsed.headers);
    el("mappingFields").replaceChildren();
    parsed.headers.forEach((h, i) => {
      const label = node("label", h),
        s = select(
          [
            ["", "Lưu kèm / không dùng tính"],
            ...M.fields.map((f, n) => [f, M.titles[n]]),
          ],
          guessed[i],
        );
      label.append(s);
      el("mappingFields").append(label);
    });
    const head = node("tr");
    parsed.headers.forEach((h) => head.append(node("th", h)));
    el("importHead").replaceChildren(head);
    el("importBody").replaceChildren(
      ...parsed.rows.map((r) => {
        const tr = node("tr");
        r.forEach((s) => tr.append(node("td", s)));
        return tr;
      }),
    );
    el("keepExtras").checked = false;
    el("importPreview").hidden = false;
    msg(
      `${parsed.rows.length} dòng. Kiểm tra ghép cột và nội dung trước khi nhận.`,
    );
  });
  action("acceptImport", () => {
    if (!parsed || !base) throw Error("Cần hồ sơ và xem trước bảng.");
    const mapping = [...el("mappingFields").querySelectorAll("select")].map(
      (s) => s.value,
    );
    const next = M.mapRows(parsed, mapping, el("keepExtras").checked);
    // Keep invalid/missing production facts visible in the editor; compile blocks application.
    rows = next.map((r) => ({
      ...r,
      start: r.start.replace(" ", "T").replace(/\+07:00$/, ""),
      release: r.release.replace(" ", "T").replace(/\+07:00$/, ""),
      due: r.due.replace(" ", "T").replace(/\+07:00$/, ""),
    }));
    importSource = {
      raw_text: fileTableText ?? el("tablePaste").value,
      headers: parsed.headers,
      rows: parsed.rows,
      mapping,
      retained_unmodeled_columns: parsed.headers.filter((_, i) => !mapping[i]),
    };
    const mappings = read(KEYS.mappings, {}),
      safe =
        mappings && !Array.isArray(mappings) && typeof mappings === "object"
          ? mappings
          : {};
    safe[JSON.stringify(parsed.headers)] = mapping;
    const entries = Object.entries(safe).slice(-10);
    write(KEYS.mappings, Object.fromEntries(entries));
    stamp();
    showRows();
    msg(
      "Đã đưa bảng vào bản chuẩn bị và nhớ ghép cột. Chưa áp dụng; dữ liệu gốc được lưu kèm bản sao/báo cáo.",
    );
  });
  el("confirmCosts").onchange = () => {
    serial++;
    trace = null;
    dirty = true;
    clearResult();
    scheduleDraft();
    msg("Xác nhận chi phí đã đổi; áp dụng lại để dùng.");
  };
  document.addEventListener("energyshift:dataset", (e) => {
    if (!applying) load(e.detail);
  });
  refreshProfiles();
  if (read(KEYS.draft, null))
    el("memoryStatus").textContent =
      "Có bản nháp trên máy này. Bấm Khôi phục bản nháp nếu muốn tiếp tục.";
  // Fixture fetch can finish before deferred scripts run.
  try {
    if (el("dataset").value) load(JSON.parse(el("dataset").value));
  } catch {
    /* Wait for canonical data. */
  }
  return {
    csvContext() {
      if (fileLoading) throw Error("Đang đọc file; chờ hoàn tất trước khi gửi AI.");
      if (fileError) throw Error("File mới chưa đọc hợp lệ. Chọn lại file hoặc sửa vùng dán trước khi dùng AI.");
      if (!base || external) throw Error("Mở hồ sơ hoặc đọc lại đầu vào hiện tại trước khi dùng AI cho CSV.");
      if (templateDirty || workshopDirty) throw Error("Cập nhật thiết lập/định mức đang sửa trước khi gửi CSV cho AI.");
      return {snapshot:M.copy(base), version:JSON.stringify({base,rows,serial}), raw_text:fileTableText ?? el("tablePaste").value};
    },
    acceptCSVReview(record, expectedVersion) {
      const context = this.csvContext();
      if (context.version !== expectedVersion || record.csv_source?.raw_text !== context.raw_text)
        throw Error("Hồ sơ, bảng hoặc file nguồn đã đổi; không áp dụng bản duyệt cũ.");
      const result = record.review?.result;
      if (record.kind !== "CSV" || record.status !== "ACCEPTED" || !result?.prepared_input_hash)
        throw Error("Cần bản duyệt CSV đã qua backend trước khi đưa vào bảng.");
      parsed = null;
      el("importPreview").hidden = true;
      rows = result.rows.map(r => ({...r,start:r.start.replace(" ","T").replace(/\+07:00$/,""),release:r.release.replace(" ","T").replace(/\+07:00$/,""),due:r.due.replace(" ","T").replace(/\+07:00$/,"")}));
      importSource = {raw_text:record.csv_source.raw_text,headers:record.csv_source.headers,rows:record.csv_source.rows,mapping:result.mapping,retained_unmodeled_columns:result.retained_unmodeled_columns,
        ai_review:{id:record.id,input_hash:record.input_hash,request_hash:record.request_hash,raw_hash:record.csv_source.raw_hash,prepared_input_hash:result.prepared_input_hash,api:record.api,reviewed_summary:record.review.reviewed_summary,at:record.review.at,identity_verified:false,scope:record.review.scope,reviewed_rows:result.rows,changes:result.changes,questions:record.proposal.questions,questions_acknowledged:record.review.questions_acknowledged,scoped_out_reference_transitions:result.scoped_out_reference_transitions}};
      stamp();showRows();issue([]);
      msg("Đã đưa CSV được rà soát vào bảng chuẩn bị. Chưa tính lịch; bấm Phân tích kế hoạch để kiểm định và tính chi phí. Chi phí ngoài mô hình cần rà soát lại.");
    },
    async prepareForAnalysis() {
      if (!dirty) return true;
      try {
        await apply();
        return true;
      } catch (e) {
        issue(String(e.message).split("\n"));
        msg("Chưa thể phân tích. Sửa các mục được chỉ ra rồi thử lại.");
        return false;
      }
    },
    beforeAnalyze() {
      if (dirty) {
        issue([
          "Bảng chuẩn bị chưa áp dụng. Bấm Kiểm tra & áp dụng kế hoạch trước.",
        ]);
        return false;
      }
      return true;
    },
    externalEdit() {
      external = true;
      dirty = false;
      trace = null;
      serial++;
      msg(
        "JSON đã đổi. Bảng đang cũ; Đọc lại từ đầu vào hiện tại trước khi sửa bảng.",
      );
    },
    evidence() {
      return trace ? M.copy(trace) : null;
    },
  };
})();
