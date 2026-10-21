"use strict";
// One active report drives every tab; external units never enter the mold/VND renderer.
document.addEventListener("DOMContentLoaded", () => {
  const byId=id=>document.getElementById(id), VM=window.DemoViewModel;
  const fileEntry=document.body.dataset.entryMode==="source-files";
  const tabs=["dispatch","overview","gantt","loadcurve","validation","sensitivity"];
  const viewInfo={
    dispatch:["Nhập dữ liệu","Nhập tệp cấu hình và lịch sản xuất hiện tại để phân tích chi phí, phụ tải và điện mặt trời."],
    overview:["Quyết định & so sánh","Đọc đề xuất và chi phí; kiểm tra điều kiện trước khi đổi lịch.","Chưa có quyết định để so sánh"],
    gantt:["Thử điều chỉnh lịch","Chọn công việc và thời gian. Mọi thay đổi đều cần kiểm chứng trước khi so sánh.","Chưa có lịch để điều chỉnh"],
    loadcurve:["Phụ tải & biểu giá","Xem khi nào dùng điện và chi phí thay đổi giữa các phương án.","Chưa có phụ tải từ lịch đã tính"],
    validation:["Kiểm chứng lịch","Đối chiếu ràng buộc và ghi nhận rà soát. Đạt trong mô hình chưa phải phê duyệt hiện trường.","Chưa có lịch để kiểm chứng"],
    sensitivity:["Độ nhạy & rủi ro","Xem giả định nào có thể thay đổi lợi ích và cần xác nhận thêm điều gì.","Chưa có kết quả để phân tích độ nhạy"]
  };
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const fmt=n=>n===null||n===undefined ? "Chưa tính" : Number(n).toLocaleString("vi-VN",{maximumFractionDigits:6});
  const colour=["#94a3b8","#38bdf8","#34d399"];
  let nativeReport=null,textileReport=null,scene=null,audit=null,busy=false,externalBusy=false,hydrating=false,viewPlan="B1",ganttZoom=3,aiVersion=0,mode="native";
  const reviews=new Map(), explanations=new Map();
  for(const name of tabs){
    const pane=byId("tab-"+name);
    [...pane.children].forEach(n=>n.classList.add("demo-original-content"));
    const mount=el("section",undefined,"demo-native-view studio");mount.id="demo-view-"+name;pane.append(mount);
  }
  // Composition belongs here: producers name a section, never another producer's DOM.
  const sectionOwners = Object.freeze({
    welcome: ["tab-dispatch", "prepend"],
    setup: ["tab-dispatch", "prepend"],
    journey: ["tab-overview", "after", "verdictHeroCard"],
    context: ["tab-dispatch", "append"],
    factory: ["tab-dispatch", "append"],
    editor: ["tab-gantt", "prepend"],
    memo: ["tab-overview", "append"],
    source: ["tab-sensitivity", "append"],
    studioSource: ["tab-dispatch", "append"],
    studioTextile: ["tab-dispatch", "append"],
    studioSynthetic: ["tab-overview", "append"],
    studioExplain: ["tab-overview", "append"],
    energy: ["tab-loadcurve", "append"]
  });
  const sections = new Map();
  function mountSection(role, section) {
    const owner = sectionOwners[role];
    if (!owner || !section) throw Error("Unknown workspace section: " + role);
    const previous = sections.get(role);
    if (previous && previous !== section) throw Error("Workspace section already mounted: " + role);
    section.dataset.workspaceSection = role;
    section.dataset.ownerTab = owner[0];
    section.classList.remove("demo-original-content");
    if(owner[1]==="after")byId(owner[2]).insertAdjacentElement("afterend",section);
    else byId(owner[0])[owner[1]](section);
    const pageHeading=byId(owner[0]).querySelector(":scope > .demo-view-heading");
    if(pageHeading)byId(owner[0]).prepend(pageHeading);
    sections.set(role, section);
    if(fileEntry&&["welcome","setup","studioSynthetic","factory"].includes(role))section.hidden=true;
    if(fileEntry&&role==="context")section.hidden=!scene;
    return section;
  }
  function openSection(role) {
    const section = sections.get(role);
    if (!section) return;
    window.Workspace.show(sectionOwners[role][0]);
    if (section.tagName === "DETAILS") section.open = true;
    section.scrollIntoView({block:"start", behavior:"instant"});
    section.querySelector("summary, button, input, textarea")?.focus({preventScroll:true});
  }
  function goToView(id){
    window.Workspace.show(id);
    const heading=byId(id).querySelector("h2, h3");
    if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}
  }
  const advancedSetup=el("details",undefined,"studio demo-disclosure");
  advancedSetup.id="demoAdvancedSetup";
  advancedSetup.append(el("summary","Thiết lập kịch bản & xuất kết quả"),byId("demoWorkspaceBar"));
  mountSection("setup",advancedSetup);
  const welcome=mountSection("welcome",byId("demoWelcome"));
  for(const name of ["source","textile","synthetic","explain"]){
    const role="studio"+name[0].toUpperCase()+name.slice(1);
    mountSection(role,byId("studioPanel-"+name));
  }
  try{welcome.open=localStorage.getItem("energyshift_demo_guide_v1")!=="closed";}catch{/* Optional preference. */}
  welcome.addEventListener("toggle",()=>{try{localStorage.setItem("energyshift_demo_guide_v1",welcome.open?"open":"closed");}catch{/* Optional preference. */}});
  const sourceSchedule=el("details",undefined,"studio demo-source-schedule demo-original-content");
  sourceSchedule.id="demoSourceSchedule";
  sourceSchedule.append(el("summary","So sánh B0/B1/B2 hoặc chỉnh lịch gốc"),el("p","Chỉnh lịch gốc tạo thay đổi đầu vào. Sau khi lưu, cần tính lại chi phí và kiểm chứng; khác với bản MANUAL đã kiểm chứng ở phía trên."));
  // Native input editing is a separate commitment from the verified what-if editor.
  for(const child of [...byId("tab-gantt").children].filter(n=>n.classList.contains("demo-original-content")))sourceSchedule.append(child);
  byId("tab-gantt").append(sourceSchedule);
  const journey=el("nav",undefined,"studio demo-nextsteps");journey.id="demoNextSteps";journey.setAttribute("aria-label","Tiếp tục kiểm tra phương án");
  const journeyStatus=el("p");journeyStatus.id="demoNextStatus";
  const journeyActions=el("div",undefined,"studio-actions");
  journey.append(journeyStatus,journeyActions);mountSection("journey",journey);
  for(const [label,action] of [["Xem lịch Gantt",()=>goToView("tab-gantt")],["Kiểm chứng",()=>goToView("tab-validation")],["Xuất bằng chứng",()=>byId("demoWorkspaceExport").click()]])journeyActions.append(button(label,action));
  mountSection("memo", byId("demoWorkspaceMemo"));
  const eda=el("section",undefined,"studio demo-native-enhancement"), source=el("section",undefined,"studio demo-native-enhancement");
  eda.id="demoNativeEDA";source.id="demoNativeSource";mountSection("energy",eda);mountSection("source",source);
  const viewGuidance=new Map();
  for(const name of tabs){
    const [title,description,emptyTitle]=viewInfo[name],pane=byId("tab-"+name);
    const header=el("header",undefined,"demo-view-heading"),titleNode=el("h2",title),descriptionNode=el("p",description),state=el("p",undefined,"demo-view-state");
    titleNode.id="demoTitle-"+name;pane.setAttribute("aria-labelledby",titleNode.id);
    header.append(titleNode,descriptionNode,state);pane.prepend(header);
    let empty=null,run=null;
    if(emptyTitle){
      empty=el("section",undefined,"studio demo-page-empty");empty.id="demoEmpty-"+name;
      run=button("Nhập hai tệp JSON",()=>openSection("studioSource"));
      const actions=el("div",undefined,"studio-actions");actions.append(run);
      empty.append(el("h3",emptyTitle),el("p","Nhập tệp cấu hình và lịch hiện tại trong Nhập dữ liệu, sau đó phân tích. Kết quả xuất hiện sau khi kiểm chứng."),actions);
      header.insertAdjacentElement("afterend",empty);
    }
    viewGuidance.set(name,{state,empty,run});
  }
  const plantContext=byId("tab-overview").querySelector(".plant-context-ribbon");
  if(plantContext)byId("verdictHeroCard").insertAdjacentElement("afterend",plantContext);
  async function api(path,body){const r=await apiFetch("/api/demo/"+path,body===undefined?undefined:{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.message||d.detail||"Không thể hoàn tất yêu cầu.");return d;}
  const message=(text,error=false)=>{byId("demoWorkspaceStatus").textContent=text;byId("demoWorkspaceStatus").dataset.error=String(error);};
  const displayCurrency=()=>EnergyChart.shortCurrency(scene?.currency||"");
  const costUnit=()=>EnergyChart.sourceCurrency(scene?.currency||"");
  const cash=value=>fmt(value)+" "+displayCurrency();
  function table(headers,rows){const box=el("div",undefined,"studio-table-wrap");box.tabIndex=0;const t=el("table"),head=el("thead"),tr=el("tr"),body=el("tbody");for(const h of headers){const th=el("th",h);th.scope="col";tr.append(th);}head.append(tr);for(const row of rows){const tr=el("tr");for(const v of row)tr.append(el("td",v));body.append(tr);}t.append(head,body);box.append(t);return box;}
  function button(text,action){const n=el("button",text);n.type="button";n.addEventListener("click",action);return n;}
  function heading(text,description){const fragment=document.createDocumentFragment();fragment.append(el("h3",text));if(description)fragment.append(el("p",description));return fragment;}
  function slotLabel(slot){return scene.textile ? `${Math.round(slot)} ô / ${fmt(slot*scene.stepMinutes/60)}h` : new Date(scene.horizonStart+slot*scene.stepMinutes*60000).toLocaleTimeString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit"});}
  function scope(){return scene.textile?"Phân tích nhóm độc lập · áp dụng giả định tính toán · cần rà soát trước áp dụng":"Dữ liệu "+scene.sourceType+" · phạm vi mô hình đã khai báo · chưa phải ROI nhà máy đã đo";}
  function svgNode(tag,attrs,text){const n=document.createElementNS("http://www.w3.org/2000/svg",tag);for(const [k,v]of Object.entries(attrs||{}))n.setAttribute(k,String(v));if(text!==undefined)n.textContent=text;return n;}
  function plot(title,series,unit){
    return EnergyChart.create({title,series,unit,stepMinutes:scene.stepMinutes,
      horizonSlots:scene.horizon,group:"workspace",sourceHash:scene.hash});
  }
  function bars(title,rows,unit){const box=el("div",undefined,"demo-chart-block");box.append(el("h4",title));const max=Math.max(1,...rows.map(r=>r.value||0));const list=el("dl",undefined,"demo-bar-list");rows.forEach((row,i)=>{list.append(el("dt",row.code));const dd=el("dd"),track=el("span",undefined,"demo-bar-track"),bar=el("span");bar.style.width=`${Math.max(0,(row.value||0)/max*100)}%`;bar.style.background=colour[i];track.append(bar);dd.append(track,el("strong",`${fmt(row.value)} ${unit}`));list.append(dd);});box.append(list);return box;}
  function heatmap(){
    const plan=scene.plans[viewPlan]||scene.plans.B0, bins=Math.min(48,scene.horizon), span=scene.horizon/bins;
    const values=plan.jobs.map(j=>Array.from({length:bins},(_,i)=>VM.loadForJob(scene,plan.code,j,Math.floor(i*span),Math.max(Math.floor(i*span)+1,Math.floor((i+1)*span)))));
    const max=Math.max(.001,...values.flat()),box=el("div",undefined,"demo-chart-block");box.append(el("h4",`Phân bố phụ tải ${plan.code} theo công việc · kW trung bình/ô biểu đồ`));
    const height=65+plan.jobs.length*26, svg=svgNode("svg",{viewBox:`0 0 900 ${height}`,class:"demo-heatmap",role:"img","aria-label":"Phân bố phụ tải từng công việc. Bảng giá trị tương đương ở bên dưới."});
    plan.jobs.forEach((job,j)=>{svg.append(svgNode("text",{x:4,y:48+j*26},job.id+" · "+job.machine));values[j].forEach((kw,i)=>{const r=kw/max;const c=`rgb(${Math.round(15+41*r)},${Math.round(23+166*r)},${Math.round(42+206*r)})`;const rect=svgNode("rect",{x:150+i*730/bins,y:30+j*26,width:730/bins-1,height:23,fill:c});rect.append(svgNode("title",{},`${job.id} · ${slotLabel(i*span)}: ${fmt(kw)} kW`));svg.append(rect);});});
    for(let i=0;i<=4;i++)svg.append(svgNode("text",{x:150+i*182.5,y:height-6,"text-anchor":i===4?"end":"start"},slotLabel(i*scene.horizon/4)));
    box.append(svg);const details=el("details");details.append(el("summary","Bảng giá trị phụ tải thay thế biểu đồ"),table(["Công việc","Máy","Các khoảng có phụ tải / kW"],plan.jobs.map((j,i)=>[j.id,j.machine,values[i].map((v,k)=>v>0?`${slotLabel(k*span)}: ${fmt(v)}`:null).filter(Boolean).join(" · ")])));box.append(details);return box;
  }
  function planControls(render){const controls=el("div",undefined,"studio-actions");for(const code of Object.keys(scene.plans)){const b=button(code,()=>{viewPlan=code;render();});b.setAttribute("aria-pressed",String(viewPlan===code));controls.append(b);}return controls;}
  function summary(){const box=el("div",undefined,"studio-plan-summary");for(const p of Object.values(scene.plans)){const n=el("div");n.append(el("span",p.code+(p.code===scene.selected?" · Phương án đang xem":"")),el("strong",cash(p.total)),el("p",`${p.verification.status} · ${p.jobs.length} công việc · ${p.changed} đổi lịch`));box.append(n);}return box;}
  function modelCostExplanation(){
    const wrap=el("section",undefined,"demo-cost-explanation");
    wrap.append(el("h4","Ý nghĩa chi phí và chỉ số B0 = 100"));
    wrap.append(el("p","Tổng chi phí mô hình = chi phí điện lưới đã trừ phần điện mặt trời sử dụng + phí đổi lịch giả định. Chỉ số B0 = 100 nghĩa là lấy B0 làm mốc: chi phí phương án / chi phí B0 × 100; không phải tỷ lệ sản lượng hay chi phí toàn nhà máy."));
    if(scene.textile){
      const charge=scene.report.manifest?.cost_policy?.effective_cost_per_move ?? scene.report.manifest?.mapping?.extra_cost_per_move;
      const mapping=scene.report.manifest?.mapping||{};
      const costPolicy=scene.report.manifest?.cost_policy||{};
      if(costPolicy.move_cost_mode==="SOURCE_DERIVED_ONE_MINUTE_PROXY"){
        wrap.append(el("p",`Phí đổi lịch giả định: ${fmt(charge)} ${displayCurrency()} / công việc dịch chuyển = công suất trung vị ${fmt(costPolicy.reference_power_kw)} kW × giá điện nguồn trung vị ${fmt(costPolicy.reference_tariff_per_kwh)} ${displayCurrency()}/kWh × 1/60 giờ. Đây chỉ là quy ước mô phỏng lấy từ nguồn, không phải giá nhân công hoặc hao mòn đã được xác minh.`));
      }else wrap.append(el("p",`Phí đổi lịch do người dùng nhập: ${fmt(charge)} ${displayCurrency()}/công việc. Cần xác minh giá trị với nhà máy.`));
      wrap.append(el("p","Chưa tính đủ nhân công, khởi động máy, hao mòn, đầu tư điện mặt trời, thời hạn đơn hàng thực tế và các ràng buộc vận hành ngoài dữ liệu."));
      const b2=scene.plans.B2;
      if(b2?.total!==null && b2.energy>0 && b2.grid===0){
        wrap.append(el("p",`B2 có chi phí mua điện lưới = 0 vì cả ${fmt(b2.energy)} kWh chạy việc đều dùng điện mặt trời. Tuy nhiên ${b2.changed} công việc đổi thời điểm phát sinh ${cash(b2.extra)} phí điều phối giả định, nên tổng chi phí mô hình B2 = ${cash(b2.total)}. Không coi đây là chi phí thực tế hay tiết kiệm đã đo.`,"demo-cost-zero-reason"));
      }
      if(scene.currency==="SOURCE")wrap.append(el("p","* đv nguồn = đơn vị chi phí của dữ liệu gốc chưa được xác minh; không quy đổi thành VND."));
    }
    return wrap;
  }
  function renderEDA(target){
    target.replaceChildren();if(!scene)return;
    if(scene.plans.B0.total===null){
      const valid=Object.values(scene.plans).filter(p=>p.total!==null);
      target.append(heading("Phụ tải các lịch sửa hợp lệ","B0 FAIL: chỉ xem phụ tải và điện của B1/B2 đã PASS; không tính tiết kiệm so với lịch nguồn."));
      if(scene.currency==="SOURCE")target.append(el("p","* Đơn vị chi phí nguồn chưa xác minh; không phải VNĐ hoặc giá điện EVN đã xác nhận.","energy-source-warning"));
      if(valid.length){
        target.append(plot("Giá nguồn theo ô thời gian",[{label:"Giá nguồn",values:scene.tariff}],costUnit()+"/kWh"));
        target.append(plot("Phụ tải theo phương án sửa",valid.map(p=>({label:p.code,values:p.power})),"kW"));
        target.append(table(["Phương án","Trạng thái","Điện dùng (kWh)","Điện lưới (kWh)","Mặt trời (kWh)"],valid.map(p=>[p.code,p.verification.status,fmt(p.energy),fmt(p.grid),fmt(p.solar)])));
      }
      return;
    }
    target.append(heading("Khám phá dữ liệu và so sánh ba phương án",scope()));
    if(scene.currency==="SOURCE")target.append(el("p","* Đơn vị chi phí nguồn chưa xác minh; không phải VNĐ hoặc giá điện EVN đã xác nhận.","energy-source-warning"));
    const grid=el("div",undefined,"demo-chart-grid");grid.append(plot("Giá điện theo thời gian",[{label:"Giá được khai báo",values:scene.tariff}],costUnit()+" / kWh"),bars("Điện năng chạy việc B0 / B1 / B2",Object.values(scene.plans).map(p=>({code:p.code,value:p.energy})),"kWh"),bars("Chỉ số tổng chi phí mô hình · B0 = 100",Object.values(scene.plans).map(p=>({code:p.code,value:scene.index(p.code)})),""),plot("Phụ tải theo lịch",Object.values(scene.plans).map(p=>({label:p.code,values:p.power})),"kW"));
    target.append(grid,modelCostExplanation(),planControls(()=>renderAll()),heatmap(),el("p",`Cùng ${scene.count} công việc, ${scene.machines.length} máy. Tiết kiệm chi phí không đồng nghĩa giảm kWh. B2 là dịch phối hợp với cùng ràng buộc đã khai báo.`,"studio-muted"));
    if(scene.textile&&scene.report.manifest.mapping.solar_enabled){
      const selected=scene.report.plans[viewPlan]||scene.report.plans.B0;
      target.prepend(table(["Phương án","Tiêu thụ (kWh)","Điện mặt trời dùng (kWh)","Điện lưới (kWh)"],Object.values(scene.plans).map(p=>[p.code,fmt(p.energy),fmt(p.solar),fmt(p.grid)])));
      target.append(plot("Điện mặt trời sử dụng và điện lưới · "+viewPlan,[{label:"Nhu cầu nhóm",values:selected.cost.series.load_kw},{label:"Điện mặt trời sử dụng",values:selected.cost.series.solar_used_kw},{label:"Điện lưới",values:selected.cost.series.grid_kw}],"kW"),el("p","Điện mặt trời chỉ cấp cho nhóm được chọn; phần dư không lưu trữ hoặc bán điện. Điện lưới bằng phần nhu cầu còn thiếu.","studio-muted"));
    }
  }
  function renderSource(target){target.replaceChildren();if(!audit)return;target.append(heading("Dấu vết nguồn ngành dệt", "Bộ nguồn riêng với kịch bản ép nhựa SYNTHETIC đang nhập bên dưới."),table(["Trong lịch nguồn","Có chế độ","Đúng chế độ và máy","Thiếu chế độ","Sai máy"],[[audit.counts.total,audit.counts.known_mode,audit.counts.compatible,audit.counts.unknown_mode,audit.counts.incompatible_machine]]),button("Rà soát nguồn và chọn nhóm",()=>window.DemoStudio.showStep("source")));}
  function renderInput(target){
    target.append(heading("Nhóm ngành dệt đang dùng trong mọi tab",scope()),el("p",`${scene.count} công việc · ${scene.machines.join(", ")} · ${scene.stepMinutes} phút/ô · ${displayCurrency()}`),
      table(["Dòng nguồn","Máy","Chế độ","JSON pointer"],scene.report.manifest.selected.map(row=>[row.id,row.machine,row.task_mode,row.pointer])),
      button("Chỉnh nhóm, đơn vị và giả định",()=>window.DemoStudio.showStep("textile")));
    const details=el("details");details.append(el("summary","Đơn vị và giả định đã xác nhận"));for(const text of scene.report.manifest.assumptions)details.append(el("p",text));target.append(details);
  }
  function renderOverview(target){
    const invalid=scene.plans.B0.total===null;
    target.append(heading("Quyết định và so sánh nhóm nguồn",scope()));
    if(invalid)target.append(el("p",`B0 là lịch nguồn và không hợp lệ (${scene.plans.B0.verification.issues.length} vi phạm). B1/B2 nếu PASS chỉ là phương án sửa khả thi; không công bố tiết kiệm so B0.`,"demo-baseline-warning"));
    else target.append(el("p",`${scene.decision} · Phương án đang xem: ${scene.selected}. Chưa phê duyệt áp dụng nhà máy.`));
    target.append(summary(),modelCostExplanation(),table(["Phương án","Điện","Chi phí đổi lịch giả định","Tổng","Lợi ích so B0"],Object.values(scene.plans).map(p=>[p.code,cash(p.electricity),cash(p.extra),cash(p.total),invalid||p.total===null?"Không so sánh B0 không hợp lệ":cash(scene.plans.B0.total-p.total)])),button("Xem tờ trình và giải thích",openMemo));
  }
  function renderGantt(target){
    const p=scene.plans[viewPlan]||scene.plans.B0;
    target.append(heading("Gantt · toàn bộ công việc đã chọn",scope()),planControls(renderAll),
      el("p",`${p.code} · ${p.verification.status} · hiển thị đủ ${p.jobs.length}/${scene.count} công việc trên ${scene.machines.length} máy · 0–${scene.horizon} ô, ${scene.stepMinutes} phút/ô.`));
    if(scene.plans.B0.total===null)target.append(el("p",`B0 nguồn có ${scene.plans.B0.verification.issues.length} vi phạm; màu sắc trên Gantt không chứng minh lịch gốc khả thi. Xem Kiểm chứng lịch.`,"demo-baseline-warning"));
    const b1Starts=new Map((scene.plans.B1?.jobs||[]).map(job=>[job.id,job.start]));
    const changedFromB1=job=>p.code==="B2" && b1Starts.has(job.id) && b1Starts.get(job.id)!==job.start;
    if(p.code==="B2"){
      const moved=p.jobs.filter(changedFromB1).length;
      const delta=scene.plans.B1?.total!==null&&p.total!==null?scene.plans.B1.total-p.total:null;
      const method=scene.report.solver?.algorithm==="SOLAR_AWARE_COORDINATED_LOCAL_SEARCH"?"tìm kiếm phối hợp có kiểm chứng":"CP-SAT";
      target.append(el("p",`B2 so với B1: ${moved} công việc đổi thời điểm; ${delta===null?"chưa có so sánh chi phí hợp lệ":`chi phí giảm ${fmt(Math.max(0,delta))} ${displayCurrency()}`}. ${method}, chưa chứng minh tối ưu toàn cục. Thanh nổi bật là việc thay đổi so với B1.`,"demo-b2-comparison"));
    }
    const control=el("label",undefined,"demo-gantt-zoom"),slider=el("input");
    control.append(document.createTextNode("Phóng to trục thời gian "),slider);
    slider.type="range";slider.min="1";slider.max="8";slider.step="1";slider.value=ganttZoom;
    slider.setAttribute("aria-label","Phóng to biểu đồ Gantt");
    const readout=el("span",ganttZoom+"×");
    control.append(readout);target.append(control);
    const holder=el("div",undefined,"demo-gantt-scroll"),mount=el("div",undefined,"demo-gantt-rows");
    function zoom(){ganttZoom=Number(slider.value);mount.style.width=(ganttZoom*100)+"%";readout.textContent=ganttZoom+"×";}
    slider.addEventListener("input",zoom);zoom();
    const ruler=el("div",undefined,"demo-gantt-ruler");
    for(let i=0;i<=4;i++){
      const tick=i/4,slot=Math.round(scene.horizon*tick),mark=el("span",`${slot} ô · ${fmt(slot*scene.stepMinutes/60)}h`);
      mark.style.left=(tick*100)+"%";ruler.append(mark);
    }
    mount.append(ruler);
    for(const machine of scene.machines){
      const jobs=p.jobs.filter(j=>j.machine===machine),row=el("div",undefined,"demo-machine-row"),track=el("div",undefined,"demo-machine-track");
      row.append(el("strong",machine+" · "+jobs.length));
      for(const j of jobs){
        const bar=el("span",undefined,"demo-operation-bar");
        bar.style.left=`${j.start/scene.horizon*100}%`;bar.style.width=`${(j.end-j.start)/scene.horizon*100}%`;
        bar.title=`${j.id}: ${j.start}–${j.end}, ${j.task}`;bar.setAttribute("aria-label",bar.title);
        bar.dataset.jobId=j.id;
        if(changedFromB1(j))bar.classList.add("demo-operation-bar--b2-changed");
        bar.textContent=j.id.split("-").pop();
        bar.tabIndex=0;track.append(bar);
      }
      row.append(track);mount.append(row);
    }
    holder.append(mount);target.append(holder,table(["Công việc","Máy","Bắt đầu / ô","Kết thúc / ô","Giờ tương đối từ mốc nguồn","So với B1"],p.jobs.map(j=>[j.id,j.machine,j.start,j.end,`${fmt(j.start*scene.stepMinutes/60)}–${fmt(j.end*scene.stepMinutes/60)}`,changedFromB1(j)?`${b1Starts.get(j.id)} → ${j.start}`:"—"])));
  }
  function renderVerifier(target){
    const p=scene.plans[viewPlan]||scene.plans.B0;target.append(heading("Kiểm chứng độc lập của nhóm nguồn",`${p.code}: ${p.verification.status} · ${p.jobs.length}/${scene.count} công việc. Không kiểm tra công việc đã loại.`),planControls(renderAll));
    const labels={coverage:"Đủ công việc",machines:"Lịch máy không chồng lấn",timing:"Giới hạn thời gian thí nghiệm",precedence:"Thứ tự nhóm công việc đã khai báo",collisions:"Xung đột loại công việc"};
    const key=scene.hash+":"+p.code,checked=reviews.get(key)||{};reviews.set(key,checked);
    const groups=el("div",undefined,"demo-verifier-groups");
    for(const group of p.verification.groups){const row=el("div");row.append(el("strong",labels[group.id]),el("span",group.status,"studio-tag"));const label=el("label",undefined,"studio-check"),box=el("input");box.type="checkbox";box.checked=Boolean(checked[group.id]);box.addEventListener("change",()=>{checked[group.id]=box.checked;});label.append(box,document.createTextNode("Đã rà soát thủ công; không thay đổi PASS/FAIL tự động."));row.append(label);groups.append(row);}target.append(groups);
    if(p.verification.issues.length)target.append(table(["Nhóm","Lỗi","Công việc"],p.verification.issues.map(i=>[i.group,i.code,(i.jobs||[i.job]).join(", ")])));
    target.append(el("p","Không gán khuôn vật lý cho dữ liệu ngành dệt. Release và due ở đây là giới hạn thí nghiệm đã duyệt."));
  }
  function renderRisk(target){
    if(scene.plans.B0.total===null){
      target.append(heading("Độ nhạy · không so sánh B0 chưa hợp lệ"),el("p","Lịch gốc B0 không có chi phí đã kiểm chứng. Không tính hòa vốn hoặc tiết kiệm so B0; chỉ tham khảo B1/B2 PASS."));
      return;
    }
    target.append(heading("Độ nhạy chi phí của nhóm nguồn", "Kiểm tra giả định chi phí đổi lịch trên những lịch đã tính; không phải một lần tối ưu mới."));
    const label=el("label","Chi phí giả định / công việc đổi lịch ("+displayCurrency()+")"),input=el("input");input.type="number";input.min="0";input.max="1000000";input.step="any";input.value=scene.report.manifest.mapping.extra_cost_per_move;label.append(input);const output=el("div");
    function update(){const value=Number(input.value);if(!Number.isFinite(value)||value<0||value>1000000){output.textContent="Nhập chi phí từ 0 đến 1.000.000.";return;}output.replaceChildren(table(["Phương án","Công việc đổi","Tổng chi phí giả định","Lợi ích so B0","Hòa vốn / công việc đổi"],VM.moveSensitivity(scene,value).map(r=>[r.code,r.changed,cash(r.total),cash(r.saving),r.breakEven===null?"Không áp dụng":cash(r.breakEven)])));}
    input.addEventListener("input",update);update();target.append(label,output,el("p","Chưa khai báo bounds sai số công suất, nhân lực, tồn kho, chi phí dừng/mở máy và công việc ngoài nhóm. Kết luận giữ REVIEW_REQUIRED; không giả vờ có khoảng tin cậy thống kê."));
  }
  function renderMemo(){const box=byId("demoWorkspaceMemoContent");box.replaceChildren();if(!scene){box.append(el("p","Chạy phân tích trước khi lập tờ trình."));return;}box.append(heading("Tờ trình từ kết quả engine · không phải văn bản AI",scope()),summary(),el("p",`Kết luận ${scene.decision}. Bằng chứng của ${scene.count} công việc, ${scene.machines.length} máy.`));if(scene.plans.B0.total!==null&&scene.plans.B1?.total!==null&&scene.plans.B1)box.append(el("p",`B1 thay đổi ${scene.plans.B1.changed} công việc; giảm ${cash(scene.plans.B0.total-scene.plans.B1.total)} so với B0.`));if(!scene.textile){for(const c of scene.report.plans.B1.changes||[])box.append(el("p",`${c.job_id} trên ${c.to.machine_id}: ${timeLabel(c.from.start)} → ${timeLabel(c.to.start)}.`));box.append(el("p","B2 cần xác nhận các chi phí phối hợp/ngoài mô hình được nêu trong Độ nhạy & Rủi ro."));}else box.append(el("p","Nhóm độc lập không đủ bằng chứng để xác nhận lịch toàn nhà máy. Phần ràng buộc và đơn vị nằm trong manifest."));box.append(el("code",scene.hash));}
  function openMemo(){renderMemo();openSection("memo");const evidence=byId("demoWorkspaceMemo").querySelector(".ai-live-evidence");if(evidence)evidence.open=true;}
  function renderNativeManual(){
    if(mode!=="native" || !scene?.plans.MANUAL) return;
    const manual=scene.plans.MANUAL;
    const view=byId("demo-view-overview"), gantt=byId("demo-view-gantt"), validation=byId("demo-view-validation");
    const baseline=scene.plans.B0;
    view.append(heading("MANUAL · phương án kéo thả đã kiểm chứng", "Chưa phê duyệt xưởng · chỉ là chi phí trong mô hình · không thay thế kết luận B0/B1/B2"),
      summary(), table(["Kịch bản","Trạng thái","Chi phí mô hình","Chênh lệch so B0"], Object.values(scene.plans).map(p=>
        [p.code,p.verification.status,p.total===null?"Không xuất":cash(p.total),
        p.total===null||baseline.total===null?"Không xuất":cash(baseline.total-p.total)])));
    gantt.append(heading("MANUAL · lịch đã xác minh", "Tạo tại Gantt kéo thả phía trên. Thời điểm thể hiện theo ô từ mốc lịch của kịch bản."));
    const plot=el("div",undefined,"demo-gantt-rows");
    for(const machine of [...new Set([...scene.machines,...manual.jobs.map(j=>j.machine)])]){
      const lane=el("div",undefined,"demo-machine-row"), track=el("div",undefined,"demo-machine-track");
      lane.append(el("strong",machine));
      for(const job of manual.jobs.filter(j=>j.machine===machine)){
        const bar=el("span",undefined,"demo-operation-bar");
        bar.style.left=job.start/scene.horizon*100+"%";
        bar.style.width=(job.end-job.start)/scene.horizon*100+"%";
        bar.title=job.id+" · ô "+fmt(job.start)+" → "+fmt(job.end);
        bar.setAttribute("aria-label",bar.title);track.append(bar);
      }
      lane.append(track);plot.append(lane);
    }
    gantt.append(plot,table(["Công việc","Máy","Bắt đầu / ô","Kết thúc / ô"],manual.jobs.map(j=>[j.id,j.machine,fmt(j.start),fmt(j.end)])));
    validation.append(heading("MANUAL · kiểm chứng độc lập",manual.verification.status+
      " · "+manual.jobs.length+"/"+scene.count+" công việc · bằng chứng "+scene.hash),
      el("p","Trạng thái PASS chỉ áp dụng các giới hạn trong mô hình. Cần rà soát nhân lực, tồn kho và giới hạn ngoài mô hình."));
    if(manual.verification.issues?.length)validation.append(table(["Nhóm","Mã lỗi","Công việc"],manual.verification.issues.map(i=>
      [i.group||"—",i.code||"—",(i.jobs||[i.job||"—"]).join(", ")])));
    validation.append(table(["Công việc","Máy","Giờ bắt đầu","Giờ kết thúc"],manual.jobs.map(j=>
      [j.id,j.machine,slotLabel(j.start),slotLabel(j.end)])));
  }

  let factorySnapshot = null, factoryPlan = "B2";
  const contextBar = el("section",undefined,"studio demo-active-dataset");
  contextBar.id = "demoActiveDataset";
  contextBar.setAttribute("aria-label","Dữ liệu và lịch đang hiển thị");
  const contextText = el("div"), contextName = el("strong"), contextInfo = el("p");
  contextText.append(contextName,contextInfo);
  const contextActions = el("div",undefined,"studio-actions");
  const factoryPlanLabel = el("label","Lịch đang xem ");
  const factoryPlanSelect = el("select");factoryPlanSelect.id="demoFactoryPlan";
  for(const id of ["B0","B1","B2"]){const option=el("option",id);option.value=id;factoryPlanSelect.append(option);}
  factoryPlanLabel.append(factoryPlanSelect);
  factoryPlanLabel.hidden=true;
  factoryPlanSelect.addEventListener("change",()=>{factoryPlan=factoryPlanSelect.value;renderAll();});
  contextActions.append(factoryPlanLabel,
    button("Đổi dữ liệu",()=>openSection(fileEntry?"studioSource":"setup")));
  if(!fileEntry)contextActions.append(button("Nhập / chạy Factory Lab",()=>openSection("factory")));
  contextBar.append(contextText,contextActions);
  byId("workspaceMain").prepend(contextBar);
  function activateFactory(report,factory) {
    if(report?.status!=="COMPLETED" || !factory || !report.input_hash) return;
    factorySnapshot={report:structuredClone(report),factory:structuredClone(factory)};
    mode="factory";scene=null;factoryPlan=report.decision?.selected_plan in report.plans ? report.decision.selected_plan:"B2";
    resetAI();renderAll();
    message("Factory Lab · "+factory.metadata.industry+" · "+factory.metadata.plant_alias+
      " · "+report.input_hash+". Mọi tab đang dùng cùng kết quả CP-SAT.");
    window.dispatchEvent(new CustomEvent("energyshift:scene-updated"));
  }
  function invalidateFactory(){
    factorySnapshot=null;
    if(mode!=="factory")return;
    scene=null;resetAI();renderAll();
    message("Đầu vào Factory Lab đã đổi; lịch cũ bị ẩn. Chạy phân tích lại để cập nhật mọi tab.");
    window.dispatchEvent(new CustomEvent("energyshift:scene-updated"));
  }
  function factoryHeading() {
    const {report,factory}=factorySnapshot;
    return factory.metadata.industry+" · "+factory.metadata.plant_alias+" · "+
      report.schema_version+" · "+report.objective_mode;
  }
  function renderFactory(name,target){
    if(!factorySnapshot)return;
    const {report,factory}=factorySnapshot,plan=report.plans[factoryPlan]||report.plans.B0;
    const pretty=v=>fmt(v)+" VND",when=v=>new Date(v).toLocaleString("vi-VN",
      {timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit",day:"2-digit",month:"2-digit"});
    const edit=button("Mở dữ liệu / đổi mục tiêu",()=>openSection("factory"));
    if(name==="dispatch"){
      target.append(heading("Nguồn dữ liệu đang dùng · Factory Lab",factoryHeading()),
        el("p","Nguồn: "+report.source_type+" · hash "+report.input_hash+
        ". Hồ sơ máy, đơn hàng, công suất và biểu giá theo đúng JSON đã xác nhận."),
        edit);
      return;
    }
    if(name==="overview"){
      target.append(heading("Quyết định & so sánh lịch",factoryHeading()),
        el("p","Đề xuất "+report.decision.selected_plan+
          " theo mục tiêu "+report.objective_mode+
          ". B0 là lịch gốc; B1 thay tối đa một công việc/công đoạn; B2 tối ưu phối hợp. Cần người duyệt."),
        table(["Lịch","Verifier","Hoàn thành (phút)","Tổng mô hình (VND)","Điện (kWh)","Chênh lệch B0 (VND)"],
          ["B0","B1","B2"].map(code=>{
            const p=report.plans[code],b=report.plans.B0.cost;
            return [code,p.verification.status,fmt(p.production.makespan_minutes),
              fmt(p.cost.total_vnd),fmt(p.cost.energy_kwh),fmt(b.total_vnd-p.cost.total_vnd)];
          })),
        el("p",report.search.global_optimum_proven?
          "CP-SAT đã chứng minh tối ưu cho mục tiêu rời rạc khai báo; không phải tối ưu mọi hoạt động nhà máy.":
          "CP-SAT chưa chứng minh tối ưu toàn cục trong giới hạn tìm kiếm."),edit);
      return;
    }
    if(name==="gantt"){
      target.append(heading("Gantt · "+factoryPlan+" · "+factoryHeading(),
        "Chỉ đọc · lịch đã kiểm chứng. Thay đổi tại Factory Lab rồi chạy lại CP-SAT; không dùng trình kéo thả ép nhựa."),
        el("p",factoryPlan+" · "+plan.verification.status+" · "+
          plan.verification.jobs.length+" công việc/công đoạn · hash "+report.input_hash));
      const start=Date.parse(factory.horizon.start),span=Date.parse(factory.horizon.end)-start;
      const lanes=el("div",undefined,"demo-gantt-rows");
      for(const machine of factory.machines){
        const lane=el("div",undefined,"demo-machine-row"),track=el("div",undefined,"demo-machine-track");
        lane.append(el("strong",machine.id));
        for(const change of (plan.verification.changeovers||[]).filter(c=>c.machine_id===machine.id&&c.duration_minutes>0)){
          const b=el("span","S","factory-lab-setup");
          b.style.left=((Date.parse(change.start)-start)/span*100)+"%";
          b.style.width=((Date.parse(change.end)-Date.parse(change.start))/span*100)+"%";
          b.title="Setup "+change.from_family+" → "+change.to_family;
          track.append(b);
        }
        for(const job of plan.verification.jobs.filter(j=>j.machine_id===machine.id)){
          const b=el("span",job.job_id,"demo-operation-bar");
          b.style.left=((Date.parse(job.start)-start)/span*100)+"%";
          b.style.width=((Date.parse(job.end)-Date.parse(job.start))/span*100)+"%";
          b.title=(job.work_order_id?job.work_order_id+" / ":"")+job.job_id+" · "+when(job.start)+" → "+when(job.end);
          b.setAttribute("aria-label",b.title);track.append(b);
        }
        lane.append(track);lanes.append(lane);
      }
      target.append(lanes,table(["Công việc","Máy","Bắt đầu","Kết thúc"],
        plan.verification.jobs.map(j=>[j.job_id,j.machine_id,when(j.start),when(j.end)])),edit);
      return;
    }
    if(name==="loadcurve"){
      target.append(heading("Điện năng & biểu giá theo lịch "+factoryPlan,factoryHeading()),
        el("p","Điện chạy máy: "+fmt(plan.cost.energy_kwh)+" kWh · Tổng chi phí mô hình: "+
          pretty(plan.cost.total_vnd)+" · Phí setup khai báo: "+
          pretty(plan.cost.changeover_total_vnd)+". Không suy diễn biểu đồ công suất đo từ dữ liệu thiếu."),
        table(["Khung biểu giá","Bắt đầu","Kết thúc","Giá (VND/kWh)"],
          factory.tariffs.map(t=>[t.band,when(t.start),when(t.end),fmt(t.vnd_per_kwh)])),edit);
      return;
    }
    if(name==="validation"){
      target.append(heading("Kiểm chứng độc lập · "+factoryPlan,factoryHeading()),
        el("p",plan.verification.status+" · "+
          plan.verification.jobs.length+" công việc/công đoạn đã được kiểm tra. Chỉ xác minh các ràng buộc đã khai báo."),
        el("p","Ràng buộc thực thi: "+report.enforced_constraints.join(", ")+"."),
        table(["Công việc","Máy","Bắt đầu","Kết thúc"],
          plan.verification.jobs.map(j=>[j.job_id,j.machine_id,when(j.start),when(j.end)])));
      if(report.limitations?.length){
        const list=el("ul");for(const note of report.limitations)list.append(el("li",note));
        target.append(el("h3","Cần xác nhận ngoài mô hình"),list);
      }
      return;
    }
    if(name==="sensitivity"){
      target.append(heading("Giả định & rủi ro cần rà soát",factoryHeading()),
        el("p","Mục tiêu: "+report.objective_mode+
          (report.objective_mode==="COMBINED"?
            " · Giới hạn hoàn thành B0 + "+report.max_makespan_slack_minutes+" phút.":"")+
          " Thay đổi mục tiêu hoặc dữ liệu sẽ làm mất hiệu lực kết quả cũ."),
        el("p","Chưa đánh giá độ nhạy công suất hoặc chi phí chưa khai báo; không được gọi đây là số liệu ROI đo tại xưởng."));
      if(report.limitations?.length){const l=el("ul");for(const x of report.limitations)l.append(el("li",x));target.append(l);}
      target.append(edit);
    }
  }
  function renderAll(){
    document.body.dataset.demoScenario=mode;
    document.body.dataset.demoReady=String(!!scene || (mode==="factory" && !!factorySnapshot));
    contextName.textContent=mode==="factory"?(factorySnapshot?"Factory Lab · "+factoryHeading():"Factory Lab · cần phân tích lại"):
      mode==="textile"?"Dữ liệu sản xuất đã nhập":fileEntry?"Nhập dữ liệu sản xuất":"Kịch bản slide · ép nhựa SYNTHETIC";
    contextInfo.textContent=mode==="factory"?(factorySnapshot?"Lịch "+factoryPlan+" · "+factorySnapshot.report.input_hash:"Dữ liệu đã thay đổi; chưa có lịch hợp lệ."):
      scene?"Lịch "+scene.selected+" · "+scene.count+" công việc · "+displayCurrency()+(scene.textile?" · Có điện mặt trời":""):fileEntry?"Chọn đủ hai tệp Input và Output để bắt đầu.":"Chọn ví dụ hoặc nhập dữ liệu để tạo bằng chứng.";
    if(fileEntry)byId("demoContextSection")?.toggleAttribute("hidden",!scene);
    factoryPlanLabel.hidden=mode!=="factory"||!factorySnapshot;
    factoryPlanSelect.value=factoryPlan;
    for(const {state,empty,run} of viewGuidance.values()){
      state.textContent=busy||externalBusy?"Đang xử lý lịch…":mode==="factory"?(factorySnapshot?
        `Factory Lab · ${factorySnapshot.factory.metadata.industry} · lịch ${factoryPlan} · ${factorySnapshot.report.input_hash}`:
        "Factory Lab · dữ liệu đã đổi; cần chạy lại."):!scene?(mode==="textile"?"Nhóm dữ liệu cần tính lại.":"Chưa có kết quả đã tính."):
        `${scene.textile?"Nhóm phân tích":scene.sourceType==="SYNTHETIC"?"Dữ liệu mô phỏng":"Dữ liệu hiện tại"} · ${scene.count} công việc · ${displayCurrency()} · Phương án ${scene.selected}`;
      if(empty)empty.hidden=!!scene||mode!=="native";
      if(run){run.disabled=busy||externalBusy;run.textContent=busy||externalBusy?"Đang tính…":"Nhập hai tệp JSON";}
    }
    for(const name of tabs){const target=byId("demo-view-"+name);target.replaceChildren();
      if(mode==="factory"){if(factorySnapshot)renderFactory(name,target);
        else target.append(heading("Factory Lab · dữ liệu đã đổi","Chạy lại tại Factory Lab trước khi xem lịch mới."),button("Mở Factory Lab",()=>openSection("factory")));
        continue;}
      if(mode!=="textile")continue;
      if(!scene){target.append(heading("Dữ liệu cần phân tích lại", "Nhập lại hai tệp và tính phương án trong Nhập dữ liệu."),button("Mở dữ liệu nguồn",()=>openSection("studioSource")));continue;}
      if(!["COMPLETED","REPAIRED_WITH_INVALID_BASELINE"].includes(scene.report.status)&&!["dispatch","validation","gantt"].includes(name)){target.append(heading("B0 nguồn chưa qua kiểm chứng",scene.report.message));continue;}
      ({dispatch:renderInput,overview:renderOverview,gantt:renderGantt,loadcurve:renderEDA,validation:renderVerifier,sensitivity:renderRisk})[name](target);
    }
    renderNativeManual();
    eda.hidden=!scene||mode==="textile"||mode==="factory";if(!eda.hidden)renderEDA(eda);
    if(mode!=="factory")renderSource(source);else source.replaceChildren();source.hidden=!audit||mode==="textile"||mode==="factory";
    byId("demoWorkspaceScenario").options[0].textContent=nativeReport?`Đầu vào hiện tại · ${nativeReport.source_type}`:"Kịch bản slide · SYNTHETIC";
    const option=byId("demoWorkspaceScenario").options[1];option.disabled=!textileReport;option.textContent=textileReport?"Nhóm nguồn ngành dệt · EXTERNAL":"Nhóm nguồn ngành dệt · chưa tính";
    const factoryOption=byId("demoWorkspaceScenario").options[2];factoryOption.disabled=!factorySnapshot;
    factoryOption.textContent=factorySnapshot?"Factory Lab · "+factorySnapshot.factory.metadata.industry+" · "+factorySnapshot.report.source_type:"Factory Lab · chưa tính";
    byId("demoWorkspaceScenario").value=mode==="factory"?"factory":mode==="textile"?"textile":"native";
    byId("demoWorkspaceBar").dataset.inputHash=mode==="factory"?factorySnapshot?.report.input_hash||"":scene?.hash||"";
    byId("demoWorkspaceExport").disabled=busy||externalBusy||!(scene||factorySnapshot&&mode==="factory");
    byId("demoWorkspaceMemoButton").disabled=!scene||mode==="factory";
    byId("demoWorkspaceReplay").disabled=busy||externalBusy;byId("demoWorkspaceScenario").disabled=busy||externalBusy;byId("demoWorkspaceCase").disabled=busy||externalBusy;
    byId("demoWelcomeRun").disabled=busy||externalBusy; byId("studioReplay").disabled=busy||externalBusy;
    byId("demoWelcomeRun").setAttribute("aria-busy",String(busy||externalBusy));
    byId("demoWelcomeRun").textContent=busy||externalBusy?"Đang xử lý…":"Chạy ví dụ & xem quyết định";
    journey.hidden=!scene||mode==="factory";
    if(scene)journeyStatus.textContent=`${scene.selected} · ${scene.plans[scene.selected]?.verification.status||"Cần kiểm tra"} trong mô hình. Xem lịch và rà soát trước khi áp dụng.`;
    journey.querySelectorAll("button").forEach(b=>{b.disabled=busy||externalBusy||!scene;});
    const consent=byId("demoWorkspaceConsent").checked;
    byId("demoWorkspaceContextAI").disabled=busy||externalBusy||!scene||mode==="factory"||!consent;
    byId("demoWorkspaceReportAI").disabled=busy||externalBusy||!scene||mode==="factory"||!consent;
    if(byId("demoWorkspaceMemo").open)renderMemo();
  }
  function visualAI(state,label){
    const panel=byId("demoWorkspaceAILivePanel");
    if(!panel)return;
    panel.dataset.aiState=state;
    panel.setAttribute("aria-busy",String(state==="loading"));
    const labelNode=panel.querySelector(".ai-live-state");
    if(labelNode)labelNode.textContent=label;
  }
  function resetAI(){
    aiVersion++;
    byId("demoWorkspaceAIAnswer").replaceChildren(el("p","Câu trả lời API sẽ xuất hiện ở đây khi bạn gửi câu hỏi mới.","ai-live-empty"));
    byId("demoWorkspaceAIRecovery").replaceChildren();
    byId("demoWorkspaceAIStatus").textContent="Giải thích AI cần khớp với lịch hiện tại. Kết quả cũ đã ẩn.";
    visualAI("idle","Chờ câu hỏi");
  }
  function activate(report,hydrate){
    const next=VM.fromReport(report);if(!next)return;
    if(hydrate&&!next.textile){hydrating=true;const tab=document.body.dataset.view;try{setDataset(structuredClone(report.input_snapshot));renderReport(structuredClone(report));window.Workspace.show(tab);}finally{hydrating=false;}}
    scene=next;mode=next.textile?"textile":"native";viewPlan=next.plans.MANUAL?"MANUAL":next.plans[report.decision.selected_plan]?.total!==null ? report.decision.selected_plan : next.plans.B1?.total!==null && next.plans.B1?"B1":"B0";resetAI();renderAll();message(`${scope()} · ${scene.count} công việc · ${displayCurrency()}. Cùng hash được dùng trong tất cả các tab.`);window.dispatchEvent(new CustomEvent("energyshift:scene-updated"));
  }
  function publish(report){
    const previous={nativeReport,textileReport,scene,mode,viewPlan};
    try {
      if(report.schema_version==="textile-demo-1")textileReport=structuredClone(report);
      else nativeReport=structuredClone(report);
      activate(report,report.schema_version!=="textile-demo-1");
      globalThis.DemoStudio?.onSharedReport?.(report);
    } catch(error) {
      // Hydration may update the legacy native report before it throws.
      // Restore the previously verified report rather than leaving two incompatible hashes onscreen.
      nativeReport=previous.nativeReport;textileReport=previous.textileReport;
      scene=previous.scene;mode=previous.mode;viewPlan=previous.viewPlan;
      if(report.schema_version!=="textile-demo-1"){
        hydrating=true;
        try {
          if(previous.nativeReport?.input_snapshot){
            setDataset(structuredClone(previous.nativeReport.input_snapshot));
            renderReport(structuredClone(previous.nativeReport));
          }else clearResult();
        }catch(recoveryError){
          clearResult();
          scene=null;
          message("Không thể khôi phục lịch cũ; cần chạy lại phân tích.",true);
        }finally { hydrating=false; }
      }
      renderAll();
      window.dispatchEvent(new CustomEvent("energyshift:scene-updated"));
      throw error;
    }
  }
  function onNativeReport(report){if(hydrating)return;nativeReport=structuredClone(report);activate(report,false);}
  function onNativeClear(){if(hydrating)return;const hadReport=!!nativeReport;nativeReport=null;if(mode!=="textile"){scene=null;resetAI();renderAll();message(hadReport?"Đầu vào đã đổi. Kết quả cũ đã xóa khỏi tất cả các tab; hãy tính lại.":"Chọn ví dụ để xem một quyết định có kiểm chứng, hoặc bắt đầu với dữ liệu của bạn.");window.dispatchEvent(new CustomEvent("energyshift:scene-updated"));}}
  function invalidateTextile(){textileReport=null;if(mode==="textile"){scene=null;resetAI();renderAll();message("Nhóm nguồn hoặc đơn vị đã đổi. Kết quả cũ đã xóa khỏi mọi tab; tính lại ở Độ nhạy & rủi ro.");window.dispatchEvent(new CustomEvent("energyshift:scene-updated"));}}
  async function replay(){if(busy||externalBusy)return false;const selectedCase=byId("demoWorkspaceCase").value;busy=true;renderAll();message("Engine đang tính kịch bản slide cho mọi tab…");try{publish(await api("studio/replay",{case:selectedCase}));return true;}catch(e){message(e.message,true);return false;}finally{busy=false;renderAll();}}
  let decisionMotion=null;
  function emphasizeDecision(){
    if(decisionMotion)decisionMotion.cancel();
    const target=scene?.textile?byId("demo-view-overview"):byId("verdictHeroCard");
    if(!target?.animate)return;
    const reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;
    decisionMotion=target.animate(reduced?[{opacity:.88},{opacity:1}]:[{clipPath:"inset(0 100% 0 0)",opacity:.8},{clipPath:"inset(0 0 0 0)",opacity:1}],{duration:reduced?100:360,easing:"cubic-bezier(.16,1,.3,1)"});
    decisionMotion.onfinish=()=>{decisionMotion=null;};
  }
  byId("demoWelcomeRun").addEventListener("click",async()=>{
    byId("demoWelcomeStatus").textContent="Đang tính ví dụ. Kết quả chỉ xuất hiện sau khi engine kiểm chứng.";
    const completed=await replay();
    if(!completed){byId("demoWelcomeStatus").textContent=byId("demoWorkspaceStatus").textContent;return;}
    byId("demoWelcomeStatus").textContent="Đã có quyết định. Tiếp tục xem lịch, kiểm chứng hoặc xuất bằng chứng.";
    welcome.open=false;
    goToView("tab-overview");
    emphasizeDecision();
  });
  byId("demoWelcomeImport").addEventListener("click",()=>{
    openSection("factory");
    const tools=byId("factoryImportTools");if(tools)tools.open=true;
    byId("factorySpreadsheet")?.focus({preventScroll:true});
  });
  byId("demoWelcomeTextile").addEventListener("click",()=>window.DemoStudio.showStep("source"));
  byId("demoWelcomeDismiss").addEventListener("click",()=>{welcome.open=false;welcome.querySelector("summary").focus();});
  function showRecovery(result){const target=byId("demoWorkspaceAIRecovery");target.replaceChildren();const failure=result.last_failure||result;if(failure.rate_limit_scope==="UPSTREAM_PROVIDER"){
    target.append(el("p",`HTTP 429 từ pool miễn phí của ${failure.provider_name||"nhà cung cấp"}. Các model đã thử: ${(failure.attempted_models||[]).join(" → ")||"MiniMax Free"}. Đây là giới hạn upstream; quota tài khoản OpenRouter là giới hạn riêng.`));
    const list=el("ul");list.append(el("li","Chờ nhà cung cấp có lượt khả dụng rồi bấm gọi lại chủ động."),el("li","MiniMax Free và XingChen Free đều có quota; nếu hai endpoint cùng lỗi, đợi provider phục hồi và thử lại chủ động."),el("li","Không tăng tốc bằng cách tạo thêm khóa OpenRouter. Không tự đổi sang model trả phí."));target.append(list);
    const link=el("a","Xem trạng thái và giới hạn OpenRouter");link.href="https://openrouter.ai/settings/limits";link.target="_blank";link.rel="noopener noreferrer";target.append(link);
  }if(failure.http_status===404){
    target.append(el("p",`OpenRouter HTTP 404: model Free chưa có endpoint tương thích. Đã thử: ${(failure.attempted_models||[]).join(" → ")||"MiniMax Free"}. Không phải lỗi của bộ tối ưu.`));
  }if(result.free_endpoints){
    const entries=result.free_endpoints.models||[];
    for(const item of entries)target.append(el("p",`${item.model}: ${item.status==="NO_ENDPOINTS"?"0 endpoint được công bố":item.status==="LISTED"?item.endpoints+" endpoint được công bố":"chưa đọc được trạng thái"}.`));
    target.append(el("p","Số endpoint công bố chỉ để chẩn đoán. Provider vẫn có thể từ chối vì tham số JSON hoặc giới hạn lượt."));
  }if(result.account){const limits=result.account.free_model_daily_requests;target.append(el("p",limits?`Quota Free tài khoản hôm nay: đã dùng ${limits.used??"—"}, còn ${limits.remaining??"—"}/${limits.limit??"—"}. Đây không phải số lượt còn lại của từng provider.`:`Kiểm tra quota: ${result.account.status}.`));}}
  async function diagnostics(){byId("demoWorkspaceAICheck").disabled=true;try{const d=await api("studio/ai/diagnostics");showRecovery(d);byId("demoWorkspaceAIStatus").textContent=`${d.model} · còn ${d.requests_remaining}/${d.request_budget} lượt trong phiên ứng dụng. Không gọi model khi kiểm tra quota.`;}catch(e){byId("demoWorkspaceAIStatus").textContent=e.message;}finally{byId("demoWorkspaceAICheck").disabled=false;}}
  async function ask(kind){
    if(!scene||busy||externalBusy||!byId("demoWorkspaceConsent").checked)return;
    const token=aiVersion,hash=scene.hash,question=byId("demoWorkspaceQuestion").value;busy=true;renderAll();
    visualAI("loading","Đang kết nối…");
    byId("demoWorkspaceAIRecovery").replaceChildren();
    byId("demoWorkspaceAIAnswer").replaceChildren(el("p","Đang đợi phản hồi từ OpenRouter. Lịch đã kiểm chứng vẫn được giữ nguyên.","ai-live-empty"));
    byId("demoWorkspaceAIStatus").textContent="Đang gọi MiniMax M3.1 Free; có thể thử XingChen Free nếu provider lỗi. Bằng chứng engine không thay đổi…";
    try{const result=await api("studio/ai",{kind,scenario:scene.kind,input_hash:hash,message:question,consent:true});
      if(token!==aiVersion||scene?.hash!==hash||!byId("demoWorkspaceConsent").checked)return;
      showRecovery(result);
      if(result.status!=="OK"){
        const safeReasons={
          OUTPUT_TRUNCATED:"Provider cắt phản hồi khi hết giới hạn sinh",
          EMPTY_CONTENT:"Provider trả về nội dung rỗng",
          MALFORMED_JSON:"Provider trả JSON không hợp lệ",
          NON_OBJECT_JSON:"Provider không trả về JSON object",
          NARRATIVE_SCHEMA_INVALID:"Phản hồi AI không đạt định dạng yêu cầu",
          FACTS_CHANGED:"Provider thay đổi facts gốc nên hệ thống từ chối"
        };
        const reason=safeReasons[result.error_category]||result.error_category||result.status;
        visualAI("error","Phản hồi chưa hợp lệ");
        byId("demoWorkspaceAIAnswer").replaceChildren(el("p","AI không cung cấp câu trả lời hợp lệ. Bằng chứng và lịch đã kiểm chứng không thay đổi.","ai-live-empty"));
        byId("demoWorkspaceAIStatus").textContent=`${reason}. ${(result.attempted_models||[]).length?"Đã thử: "+result.attempted_models.join(" → ")+". ":""}${result.http_status?"HTTP "+result.http_status+". ":""}Kiểm tra endpoint/quota rồi thử lại.`;
        return;
      }
      const box=byId("demoWorkspaceAIAnswer");
      box.replaceChildren(el("p",result.narrative.summary,"ai-live-lede"));
      const grid=el("div",undefined,"ai-live-answer-grid");
      for(const [title,items] of [["Nhận định theo bằng chứng",result.narrative.findings],["Cần kiểm tra tiếp",result.narrative.next_steps]]){
        const block=el("section",undefined,"ai-live-answer-panel");
        block.append(el("h4",title));
        const list=el("ul");
        for(const item of items)list.append(el("li",item));
        if(!items.length)list.append(el("li","Không có mục bổ sung trong phản hồi hiện tại."));
        block.append(list);grid.append(block);
      }
      box.append(grid);
      const proof=el("dl",undefined,"ai-live-proof");
      for(const [title,value] of [["Model",result.served_model||result.model],["Thời gian",String(result.latency_seconds??"—")+" giây"],["Provider response ID",result.response_id||"Không được cung cấp"],["Hash bằng chứng",hash]]){
        const cell=el("div");cell.append(el("dt",title),el("dd",String(value)));proof.append(cell);
      }
      box.append(proof);
      const entry={...result,kind,input_hash:hash,question,reviewed:false};explanations.set(hash+kind+question,entry);const label=el("label",undefined,"studio-check"),check=el("input");check.type="checkbox";check.addEventListener("change",()=>{entry.reviewed=check.checked;});label.append(check,document.createTextNode("Đã đối chiếu và rà soát phần giải thích AI."));box.append(label);visualAI("success","Đã nhận phản hồi");byId("demoWorkspaceAIStatus").textContent=`${result.model} · ${result.fallback_used?"XingChen Free dự phòng":"MiniMax Free"} · LIVE API · ${result.latency_seconds??"—"}s · ${result.response_id?"Provider ID "+result.response_id:"Provider không trả ID"} · ${hash}`;
    }catch(e){visualAI("error","Lỗi kết nối");byId("demoWorkspaceAIStatus").textContent=e.message;byId("demoWorkspaceAIAnswer").replaceChildren(el("p","Không thể nhận phản hồi. Hãy kiểm tra kết nối và thử lại khi provider sẵn sàng.","ai-live-empty"));}finally{busy=false;renderAll();}
  }
  byId("demoWorkspaceReplay").addEventListener("click",replay);
  byId("demoWorkspaceScenario").addEventListener("change",()=>{
    const value=byId("demoWorkspaceScenario").value;
    if(value==="factory"){
      if(factorySnapshot){scene=null;mode="factory";resetAI();renderAll();window.dispatchEvent(new CustomEvent("energyshift:scene-updated"));}
      else openSection("factory");return;
    }
    const report=value==="textile"?textileReport:nativeReport;
    if(report)activate(report,!VM.fromReport(report).textile);
    else if(value==="textile"){window.DemoStudio.showStep("textile");byId("demoWorkspaceScenario").value=mode==="factory"?"factory":"native";}
    else replay();
  });
  byId("demoWorkspaceSource").addEventListener("click",()=>window.DemoStudio.showStep("source"));
  byId("demoWorkspaceMemoButton").addEventListener("click",openMemo);
  byId("demoWorkspaceConsent").addEventListener("change",()=>{if(!byId("demoWorkspaceConsent").checked)resetAI();renderAll();});
  byId("demoWorkspaceQuestion").addEventListener("input",resetAI);
  byId("demoWorkspaceAICheck").addEventListener("click",diagnostics);
  byId("demoWorkspaceContextAI").addEventListener("click",()=>ask("context"));byId("demoWorkspaceReportAI").addEventListener("click",()=>ask("report"));
  byId("demoWorkspaceExport").addEventListener("click",()=>{
    if(mode==="factory"){
      if(!factorySnapshot)return;
      download("EnergyShift-factory-evidence.json",JSON.stringify(factorySnapshot,null,2),"application/json");return;
    }
    if(!scene)return;const reviewed=reviews.get(scene.hash+":"+viewPlan)||{};const evidence={artifact_version:"source-analysis-1",generated_at:new Date().toISOString(),input_hash:scene.hash,source_audit:audit,report:scene.report,manual_verifier_review:reviewed,ai_explanations:[...explanations.values()].filter(e=>e.input_hash===scene.hash)};download("EnergyShift-analysis.json",JSON.stringify(evidence,null,2),"application/json");});
  globalThis.DemoWorkspace={publish,onNativeReport,onNativeClear,publishFactory:activateFactory,invalidateFactory,
    getActiveDataset:()=>mode,isTextile:()=>mode==="textile",invalidateTextile,openMemo,mountSection,openSection,setAudit:value=>{audit=value;renderAll();},setWorking:value=>{externalBusy=value;renderAll();},onTab:()=>{if(scene)byId("demoWorkspaceBar").dataset.inputHash=scene.hash;},getReport:()=>mode==="factory"?factorySnapshot?.report||null:scene?.report||null,getScene:()=>mode==="factory"?null:scene,getStoredNativeReport:()=>nativeReport,publishManual:report=>publish(report)};
  renderAll();
  if(!fileEntry)api("studio/source").then(value=>{audit=value;renderAll();}).catch(()=>{});
});
