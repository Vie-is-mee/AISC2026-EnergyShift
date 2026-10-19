/* CSV proposals are reviewed data, never executable model actions. */
window.AICSVImport = (() => {
  const $ = id => document.getElementById(id);
  const active = new Set(["QUEUED", "RUNNING"]);
  let current = null, context = null, view = null, epoch = 0, previewEpoch = 0;
  let busy = false, applying = false, applied = false, timer = null, viewMapping = null;
  const status = text => {
    $("aiCSVStatus").textContent = text;
    const local = $("aiCSVReviewStatus");
    if (local) { local.textContent = text; local.hidden = false; }
  };
  const request = (suffix, body) => AssistantIntake.request(suffix, body);
  function fresh() {
    if (!context) return false;
    try {
      const now = InputDesk.csvContext();
      return now.version === context.version && now.raw_text === context.raw_text && $("aiCSVNotes").value === context.notes;
    } catch { return false; }
  }
  function mapping() {return [...$("aiCSVMapping").querySelectorAll("select")].map(s => s.value);}
  function buttons() {
    if (!$("aiCSVStart")) return;
    const reviewing = current?.status === "AWAITING_REVIEW" && fresh();
    const acknowledged = $("aiCSVAck").checked && $("aiCSVReviewNote").value.trim().length > 0;
    const extras = !view?.unmodeled_columns.length || $("aiCSVExtras").checked;
    const questions = !current?.proposal?.questions.length || $("aiCSVQuestionsAck").checked;
    $("aiCSVStart").disabled = busy;
    $("aiCSVCancel").disabled = !current || busy && !active.has(current.status) || !["QUEUED","RUNNING","AWAITING_REVIEW"].includes(current.status);
    $("aiCSVPreview").disabled = busy || !reviewing;
    $("aiCSVReload").disabled = busy || !current || !fresh();
    $("aiCSVAccept").disabled = busy || !reviewing || !view || JSON.stringify(mapping()) !== viewMapping || !acknowledged || !extras || !questions;
    $("aiCSVReject").disabled = busy || !reviewing || !acknowledged;
    $("aiCSVApply").disabled = busy || current?.status !== "ACCEPTED" || !fresh() || applied;
    $("aiCSVExport").disabled = !current || !["ACCEPTED","REJECTED"].includes(current.status);
    $("aiCSVApply").hidden = current?.status !== "ACCEPTED" || applied;
    $("aiCSVExport").hidden = $("aiCSVExport").disabled;
    $("aiCSVCancel").hidden = !current || !["QUEUED","RUNNING","AWAITING_REVIEW"].includes(current.status);
    $("aiCSVReload").hidden = !current || applied;
    const decided = ["ACCEPTED", "REJECTED"].includes(current?.status);
    $("aiCSVAccept").hidden = decided;
    $("aiCSVReject").hidden = decided;
    $("aiCSVPreview").hidden = decided;
    $("aiCSVStart").textContent = busy ? "Đang xử lý…" : current ? "Đọc lại bảng bằng AI" : "Nhờ AI ghép cột";
    $("aiCSVAccept").textContent = busy && reviewing ? "Đang kiểm tra bảng…" : "Duyệt và đưa vào bảng";
    $("aiCSVResult").setAttribute("aria-busy", String(busy));
    const help = $("aiCSVReviewHelp");
    if (help) {
      const missing = [];
      if (!view || JSON.stringify(mapping()) !== viewMapping) missing.push("cập nhật bản xem trước");
      if (!extras) missing.push("xác nhận cột ngoài mô hình");
      if (!questions) missing.push("xác nhận đã xem câu hỏi/cảnh báo");
      if (!$("aiCSVReviewNote").value.trim()) missing.push("nhập ghi chú rà soát");
      if (!$("aiCSVAck").checked) missing.push("tích xác nhận rà soát cuối cùng");
      help.textContent = reviewing ? (missing.length ? "Để duyệt: " + missing.join("; ") + "." : "Đã đủ xác nhận. Bấm Duyệt và đưa vào bảng; backend sẽ kiểm tra dữ liệu.") : "";
    }
  }
  function steps(id) {
    for (const name of ["Source","Model","Review","Done"]) {
      if (name === id) $("aiCSVStep"+name).setAttribute("aria-current","step");
      else $("aiCSVStep"+name).removeAttribute("aria-current");
    }
  }
  function invalidate() {
    if (applying) return;
    epoch++;previewEpoch++;clearTimeout(timer);
    if (!$("aiCSVStatus")) return;
    if (current) status("Nguồn, ghi chú hoặc hồ sơ/bảng đã đổi. Bản đề xuất/duyệt cũ không áp dụng cho phiên bản mới; gửi lại khi sẵn sàng.");
    current = null;context = null;view = null;viewMapping = null;busy = false;applied = false;
    $("aiCSVResult").hidden = true;$("aiCSVAck").checked = false;
    steps("Source");buttons();
  }
  function unacknowledge() {
    $("aiCSVAck").checked=false;
    if (current?.status === "AWAITING_REVIEW") status("Bạn vừa sửa nội dung. Kiểm tra lại rồi tích xác nhận rà soát cuối cùng.");
    buttons();
  }
  function list(id, values) {
    $(id).replaceChildren(...values.map(text=>{const e=document.createElement("li");e.textContent=text;return e;}));
  }
  function showTrace(value) {
    const a=value.api;
    $("aiCSVTrace").textContent=`Lượt ${value.id} · nguồn ${value.csv_source?.raw_hash || "?"} · hồ sơ ${value.input_hash} · yêu cầu ${value.request_hash}. `+
      (a?`API ${a.status}${a.http_status?" HTTP "+a.http_status:""}; model ${a.model || a.requested_model || "không báo"}; mã provider ${a.response_id || "không có"}; ${a.latency_seconds ?? "?"} giây; token ${a.usage?.total_tokens ?? "không báo"}.`:"Chưa có phản hồi API.");
  }
  function showProposal(value) {
    current=value;busy=active.has(value.status);showTrace(value);buttons();
    if (active.has(value.status)) {steps("Model");status(value.status==="QUEUED"?"Đang chờ gọi model…":"Model đang đọc bảng gốc và hồ sơ tham chiếu…");return;}
    if (value.status==="ERROR" || value.status==="INTERRUPTED" || value.status==="CANCELLED") {
      status((value.error || "Lượt đã dừng; không áp dụng đề xuất.")+(value.api?.http_status?` HTTP ${value.api.http_status}.`:""));steps("Source");return;
    }
    if (value.status!=="AWAITING_REVIEW") {
      $("aiCSVResult").querySelectorAll("input,select,textarea").forEach(input=>{input.disabled=true;});
      $("aiCSVResult").querySelectorAll(".ai-csv-review-table button").forEach(button=>{button.disabled=true;});
      status(value.status==="ACCEPTED"?"Backend đã duyệt bảng. Chọn Đưa bản đã duyệt vào bảng nếu chưa chuyển sang bản chuẩn bị.":"Đã ghi nhận từ chối; kế hoạch không thay đổi.");steps(value.status==="ACCEPTED"?"Done":"Source");return;
    }
    const proposal=value.proposal;
    $("aiCSVResult").hidden=false;$("aiCSVSummary").textContent=proposal.summary;
    ["aiCSVExtras","aiCSVQuestionsAck","aiCSVAck","aiCSVReviewNote"].forEach(id=>{$(id).disabled=false;});
    list("aiCSVIssues",proposal.issues.map(i=>`AI nghi vấn dòng dữ liệu ${i.row_index+1}, cột “${value.csv_source.headers[i.column_index]}”: ${i.explanation}`));
    list("aiCSVQuestions",proposal.questions.length?proposal.questions:["AI chưa nêu câu hỏi thêm; bạn vẫn cần rà soát bảng và hồ sơ."]);
    const suggested=new Map(proposal.columns.map(c=>[c.column_index,c]));
    $("aiCSVMapping").replaceChildren();
    value.csv_source.headers.forEach((header,index)=>{
      const tr=document.createElement("tr"),original=document.createElement("td"),target=document.createElement("td"),why=document.createElement("td"),select=document.createElement("select");
      original.textContent=header;why.textContent=suggested.get(index).rationale;
      [["UNMODELED","Giữ kèm / ngoài mô hình"],...InputModel.fields.map((f,i)=>[f,InputModel.titles[i]])].forEach(([id,title])=>{const option=document.createElement("option");option.value=id;option.textContent=title;select.append(option);});
      select.value=suggested.get(index).field;select.setAttribute("aria-label","Ghép cột "+header);
      select.onchange=()=>{previewEpoch++;busy=false;view=null;viewMapping=null;$("aiCSVReviewRows").replaceChildren();unacknowledge();status("Ghép cột đã đổi. Cập nhật bản xem trước để rà soát lại; các ô sửa ở bản xem trước cũ sẽ không được giữ.");};
      target.append(select);tr.append(original,target,why);$("aiCSVMapping").append(tr);
    });
    $("aiCSVReviewNote").value=proposal.summary;$("aiCSVAck").checked=false;$("aiCSVExtras").checked=false;$("aiCSVQuestionsAck").checked=false;
    steps("Review");status("AI đã đề xuất. Kiểm tra ghép cột, cập nhật bản xem trước và rà soát từng ô trước khi duyệt.");buttons();
  }
  async function preview() {
    if (!current || current.status!=="AWAITING_REVIEW" || !fresh()) return;
    const expected=epoch, sequence=++previewEpoch, selected=mapping();
    busy=true;view=null;viewMapping=null;unacknowledge();buttons();
    try {
      const value=await request("/"+current.id+"/csv-preview",{input_hash:current.input_hash,request_hash:current.request_hash,mapping:selected});
      if (expected!==epoch || sequence!==previewEpoch || !fresh()) return;
      view=value;viewMapping=JSON.stringify(selected);busy=false;
      const head=document.createElement("tr");InputModel.titles.forEach(title=>{const th=document.createElement("th");th.textContent=title;head.append(th);});$("aiCSVReviewHead").replaceChildren(head);
      $("aiCSVReviewRows").replaceChildren(...value.cells.map((cells,index)=>{
        const row=document.createElement("tr");
        cells.forEach(cell=>{
          const td=document.createElement("td"),original=document.createElement("small"),input=document.createElement("input");
          original.textContent=cell.column_index===null?"Không có cột nguồn":"Gốc: "+(cell.original || "(trống)");
          input.type="text";input.value=cell.value;input.maxLength=4096;input.dataset.field=cell.field;input.setAttribute("aria-label",`CSV dòng ${index+1} ${cell.field}`);input.oninput=unacknowledge;
          td.append(original,input);
          if (cell.suggestion) {
            const reference=document.createElement("small"),button=document.createElement("button");
            const template=cell.suggestion.reference.split(".")[1];
            reference.textContent=`Định mức ${template} · ${cell.suggestion.source_type==="SYNTHETIC"?"Giả lập":cell.suggestion.source_type}`;
            reference.title=cell.suggestion.reference;
            button.type="button";button.textContent="Dùng hồ sơ: "+cell.suggestion.value.replace("T"," ").replace(/\+07:00$/,"");
            button.onclick=()=>{input.value=cell.suggestion.value;unacknowledge();};td.append(reference,button);
          } else if (!cell.value) {const missing=document.createElement("small");missing.textContent="Cần bạn bổ sung; không tự đoán.";td.append(missing);}
          row.append(td);
        });return row;
      }));
      $("aiCSVPreviewNote").textContent=`${value.rows.length} dòng, giữ nguyên thứ tự nguồn. Cuộn ngang để xem đủ cột. Ô nhập là giá trị sẽ dùng; gợi ý hồ sơ chỉ điền khi bạn bấm chọn. Cột ngoài mô hình: ${value.unmodeled_columns.join(", ") || "không có"}. Không tự chuyển đơn vị hoặc đoán ngày giờ.`;
      status("Đã có bản xem trước. Sửa các ô cần thiết, chọn gợi ý phù hợp và xác nhận rà soát.");buttons();
    } catch(e) {if(expected===epoch && sequence===previewEpoch){busy=false;status(e.message);buttons();}}
  }
  async function poll(expected) {
    if(expected!==epoch || !current) return;
    try {
      const value=await request("/"+current.id);
      if(expected!==epoch || !fresh()) return;
      showProposal(value);
      if(active.has(value.status))timer=setTimeout(()=>poll(expected),1300);
      else if(value.status==="AWAITING_REVIEW")await preview();
    } catch(e){if(expected===epoch){busy=false;status(e.message+" Chưa tự gửi lại API.");buttons();}}
  }
  async function start() {
    if(!$("aiCSVConsent").checked){status("Chọn đồng ý gửi bảng và hồ sơ tới model trước khi tiếp tục.");return;}
    if(preparing || pending || fixtureLoading){status("Chờ tác vụ hiện tại hoàn tất.");return;}
    let next;
    try {next=InputDesk.csvContext();if(!next.raw_text.trim())throw Error("Mở CSV/TSV hoặc dán bảng trước khi gọi AI.");}
    catch(e){status(e.message);return;}
    invalidate();context={...next,notes:$("aiCSVNotes").value};const expected=epoch;
    busy=true;buttons();steps("Model");status("Đang kiểm tra nguồn và gửi bảng tới AI…");
    try {
      await AssistantIntake.ensureSession();if(expected!==epoch || !fresh())return;
      const value=await request("",{kind:"CSV",snapshot:context.snapshot,raw_text:context.raw_text,message:context.notes,consent:true});
      if(expected!==epoch || !fresh()){request("/"+value.id+"/cancel",{}).catch(()=>{});return;}
      showProposal(value);if(active.has(value.status))timer=setTimeout(()=>poll(expected),500);else if(value.status==="AWAITING_REVIEW")await preview();
    } catch(e){if(expected===epoch){busy=false;status(e.message+" Không tự gửi lại API.");buttons();}}
  }
  function canonicalRows() {
    return [...$("aiCSVReviewRows").querySelectorAll("tr")].map(tr=>Object.fromEntries([...tr.querySelectorAll("input[data-field]")].map(input=>[input.dataset.field,input.value])));
  }
  function applyAccepted() {
    if(!current || !fresh() || applied)return;
    applying=true;
    try {
      InputDesk.acceptCSVReview(current,context.version);applied=true;steps("Done");
      status("Đã đưa bảng được duyệt vào bản chuẩn bị. Chưa chạy lịch; rà soát chi phí rồi bấm Phân tích kế hoạch khi sẵn sàng.");
    } catch(e){status(e.message);}
    finally{applying=false;buttons();}
  }
  async function review(decision) {
    if(busy || !current || current.status!=="AWAITING_REVIEW" || !fresh() || !$("aiCSVAck").checked)return;
    const expected=epoch;busy=true;buttons();
    status(decision === "ACCEPTED" ? "Đang kiểm tra dữ liệu và đưa vào bảng…" : "Đang ghi nhận từ chối…");
    try {
      const value=await request("/"+current.id+"/csv-review",{input_hash:current.input_hash,request_hash:current.request_hash,mapping:mapping(),decision,reviewed_summary:$("aiCSVReviewNote").value.trim(),acknowledged:true,rows:canonicalRows(),extras_acknowledged:$("aiCSVExtras").checked,questions_acknowledged:$("aiCSVQuestionsAck").checked});
      if(expected!==epoch || !fresh())return;
      showProposal(value);if(decision==="ACCEPTED")applyAccepted();
    } catch(e){if(expected===epoch){busy=false;status(e.message+" Nếu kết nối bị mất, kiểm tra lại lượt trước khi gửi duyệt lần nữa.");buttons();$("aiCSVReviewStatus")?.scrollIntoView?.({block:"center",behavior:"smooth"});}}
  }
  document.addEventListener("DOMContentLoaded",()=>{
    $("aiCSVStart").onclick=start;$("aiCSVPreview").onclick=preview;
    $("aiCSVReload").onclick=async()=>{if(current && fresh())await poll(epoch);};
    $("aiCSVAccept").onclick=()=>review("ACCEPTED");$("aiCSVReject").onclick=()=>review("REJECTED");$("aiCSVApply").onclick=applyAccepted;
    $("aiCSVCancel").onclick=async()=>{
      if(!current)return;const id=current.id;const expected=++epoch;clearTimeout(timer);busy=true;buttons();
      try {const value=await request("/"+id+"/cancel",{});if(epoch===expected){showProposal(value);busy=false;buttons();}}
      catch(e){if(epoch===expected){busy=false;status(e.message);buttons();}}
    };
    $("tablePaste").addEventListener("input",invalidate);$("tableFile").addEventListener("change",invalidate);$("aiCSVNotes").addEventListener("input",invalidate);
    for(const event of ["input","change"])$("inputDesk").addEventListener(event,e=>{
      if(e.target.id==="showPlanDetails" || e.target.name==="inputMethod")return;
      if(!$("aiCSVPanel").contains(e.target))invalidate();
    });
    $("aiCSVConsent").addEventListener("change",()=>{if(!$("aiCSVConsent").checked)invalidate();});
    $("aiCSVAck").addEventListener("change",buttons);
    ["aiCSVExtras","aiCSVQuestionsAck"].forEach(id=>$(id).addEventListener("change",unacknowledge));$("aiCSVReviewNote").addEventListener("input",unacknowledge);
    $("aiCSVExport").onclick=()=>{if(current?.review)download("EnergyShift_CSV_review.json",JSON.stringify(current,null,2),"application/json");};
    $("aiCSVDownloadSource").onclick=()=>{try{const raw=current?.csv_source?.raw_text ?? InputDesk.csvContext().raw_text;download("EnergyShift_source.csv",raw,"text/csv;charset=utf-8");}catch(e){status(e.message);}};
  });
  return {invalidate};
})();
