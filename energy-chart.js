/* EnergyShift 24-hour chart explorer; strictly a view over immutable engine series. */
(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;root.EnergyChart=api;})(typeof globalThis!=="undefined"?globalThis:this,function(){
"use strict";
const DAY=1440,RES=[60,15,5],states=new Map();
const good=x=>typeof x==="number"&&Number.isFinite(x);
const fmt=x=>good(x)?new Intl.NumberFormat("vi-VN",{maximumFractionDigits:3}).format(x):"—";
const sourceCurrency=code=>code==="SOURCE"?"Đơn vị chi phí nguồn (chưa xác minh)":code;
const shortCurrency=code=>code==="SOURCE"?"đv nguồn*":code;
function bucketSeries(values,step,start,end,resolution){
  if(!Array.isArray(values)||!Number.isInteger(step)||step<=0||!Number.isInteger(resolution)||resolution<step||resolution%step)throw Error("Invalid resolution");
  const bins=[];
  for(let left=start;left<end;left+=resolution){
    const right=Math.min(end,left+resolution);let area=0,covered=0,peak=-Infinity;
    for(let i=Math.floor(left/step);i<Math.ceil(right/step);i++){
      const overlap=Math.max(0,Math.min(right,(i+1)*step)-Math.max(left,i*step));
      if(overlap&&good(values[i])){area+=values[i]*overlap;covered+=overlap;peak=Math.max(peak,values[i]);}
    }
    const complete=covered>=right-left-1e-8;
    bins.push({startMinute:left,endMinute:right,average:complete?area/covered:null,peak:covered?peak:null,complete,coveredMinutes:covered});
  }
  return bins;
}
const el=(tag,cls,label)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(label!==undefined)node.textContent=label;return node;};
const svg=(tag,attrs,label)=>{const node=document.createElementNS("http://www.w3.org/2000/svg",tag);for(const k in attrs)node.setAttribute(k,String(attrs[k]));if(label!==undefined)node.textContent=label;return node;};
function create(params){
  const {title,series,unit,stepMinutes,horizonSlots,group="energy",sourceHash=""}=params;
  const nMinutes=Number(horizonSlots)*stepMinutes,dayCount=Math.max(1,Math.ceil(nMinutes/DAY));
  const key=group+"|"+sourceHash+"|"+horizonSlots+"|"+stepMinutes;
  const allowed=RES.filter(n=>n>=stepMinutes&&n%stepMinutes===0);
  if(!allowed.length||!allowed.includes(stepMinutes))allowed.push(stepMinutes);
  allowed.sort((a,b)=>b-a);
  let state=states.get(key);
  if(!state){state={day:0,resolution:allowed.includes(15)?15:allowed[0]};states.set(key,state);}
  const box=el("section","energy-explorer demo-chart-block");box.dataset.energySignature=key;
  const head=el("div","energy-explorer-title");
  head.append(el("h4","",title),el("p","energy-explorer-unit",unit));box.append(head);
  const controls=el("div","energy-explorer-toolbar"),nav=el("div","energy-explorer-nav");
  const prev=el("button","energy-explorer-nav-button","← Trước"),next=el("button","energy-explorer-nav-button","Tiếp →");
  prev.type=next.type="button";
  const page=el("output","energy-explorer-period");page.setAttribute("aria-live","polite");
  nav.append(prev,page,next);controls.append(nav);
  const choose=el("label","energy-explorer-resolution");
  choose.append(el("span","","Mức chi tiết"));
  const select=el("select");select.setAttribute("aria-label","Mức chi tiết biểu đồ "+title);
  allowed.forEach(n=>{const label=n===60?"Trung bình 1 giờ":n===15?"Trung bình 15 phút":n===5?"Chi tiết 5 phút":"Nguồn "+n+" phút";const opt=el("option","",label);opt.value=n;select.append(opt);});
  choose.append(select);controls.append(choose);box.append(controls);
  const dayTabs=el("div","energy-explorer-days");dayTabs.setAttribute("aria-label","Chọn khung 24 giờ");box.append(dayTabs);
  const canvas=svg("svg",{class:"studio-plot energy-explorer-svg",viewBox:"0 0 1100 410",role:"img","aria-label":title+"; khung 24 giờ; "+unit});
  const scroll=el("div","energy-explorer-plot-scroll");
  scroll.tabIndex=0;scroll.setAttribute("role","region");scroll.setAttribute("aria-label","Biểu đồ "+title+"; vuốt ngang để xem dữ liệu chi tiết");
  scroll.append(canvas);box.append(scroll);
  const legend=el("div","energy-explorer-legend");box.append(legend);
  const inspect=el("p","energy-explorer-inspect","Rê chuột, chạm hoặc dùng Tab trên biểu đồ để xem trung bình và đỉnh từng khoảng.");
  inspect.setAttribute("aria-live","polite");box.append(inspect);
  box.append(el("p","energy-explorer-caption","Chỉ thay đổi cách xem: trung bình có trọng số thời gian; giá trị đỉnh giữ nguyên từ dữ liệu gốc. Trên màn hình nhỏ, vuốt ngang để xem đồ thị. Phép tính kWh và chi phí backend không đổi."));
  const palette=["#aabbd3","#38bcff","#27ceae","#edaa52"];
  function refreshGroup(){
    document.querySelectorAll(".energy-explorer").forEach(node=>{if(node.dataset.energySignature===key&&typeof node._refreshEnergy==="function")node._refreshEnergy(true);});
  }
  prev.addEventListener("click",()=>{if(state.day>0){state.day--;refreshGroup();}});
  next.addEventListener("click",()=>{if(state.day+1<dayCount){state.day++;refreshGroup();}});
  select.addEventListener("change",()=>{const v=Number(select.value);if(allowed.includes(v)){state.resolution=v;refreshGroup();}});
  function draw(){
    state.day=Math.max(0,Math.min(dayCount-1,state.day));
    if(!allowed.includes(state.resolution))state.resolution=allowed[0];
    const start=state.day*DAY,end=Math.min(nMinutes,start+DAY),span=end-start;
    page.textContent="Ngày "+(state.day+1)+" / "+dayCount;prev.disabled=state.day===0;next.disabled=state.day===dayCount-1;
    select.value=state.resolution;
    dayTabs.replaceChildren();for(let i=0;i<dayCount;i++){const b=el("button","energy-explorer-day",String(i+1));b.type="button";b.setAttribute("aria-label","Xem ngày "+(i+1));b.setAttribute("aria-pressed",String(i===state.day));if(i===state.day)b.classList.add("is-active");b.addEventListener("click",()=>{state.day=i;refreshGroup();});dayTabs.append(b);}
    canvas.replaceChildren();legend.replaceChildren();
    const plotted=series.map((s,i)=>({label:s.label,color:s.color||palette[i%palette.length],bins:bucketSeries(s.values,stepMinutes,start,end,state.resolution)}));
    const vals=plotted.flatMap(s=>s.bins.filter(b=>good(b.average)).map(b=>b.average));
    const priceAxis=unit.includes("/kWh");
    const floor=priceAxis && vals.length?Math.max(0,Math.min(...vals)*.92):0;
    const upper=Math.max(floor+.000001,...vals);
    const max=priceAxis?upper+(upper-floor)*.08:Math.max(.001,upper);
    const range=max-floor,left=100,right=1060,top=85,bottom=331,height=bottom-top;
    for(let i=0;i<=4;i++){
      const y=bottom-height*i/4;
      canvas.append(svg("line",{x1:left,x2:right,y1:y,y2:y,class:"energy-explorer-gridline"}),svg("text",{x:12,y:y+6,class:"energy-explorer-tick"},fmt(floor+range*i/4)));
      const tick=start+span*i/4,x=left+(right-left)*i/4;
      canvas.append(svg("text",{x,y:389,"text-anchor":i===0?"start":i===4?"end":"middle",class:"energy-explorer-tick"},fmt(tick/60)+"h"));
    }
    plotted.forEach(s=>{
      let part=[];const flush=()=>{if(part.length)canvas.append(svg("polyline",{points:part.join(" "),fill:"none",stroke:s.color,"stroke-width":3.5,"stroke-linejoin":"round","stroke-linecap":"round",class:"energy-explorer-line"}));part=[];};
      s.bins.forEach(b=>{if(!good(b.average)){flush();return;}const x=left+((b.startMinute+b.endMinute)/2-start)/span*(right-left),y=bottom-(b.average-floor)/range*height;part.push(x.toFixed(2)+","+y.toFixed(2));});flush();
      const item=el("span","energy-explorer-key");item.style.setProperty("--series-colour",s.color);
      const dayPeaks=s.bins.map(b=>b.peak).filter(good);
      item.append(el("span","energy-explorer-key-line"),el("span","",s.label),el("small","energy-explorer-peak",dayPeaks.length?"Đỉnh "+fmt(Math.max(...dayPeaks))+" "+unit:"Chưa có dữ liệu"));legend.append(item);
    });
    const bins=plotted[0]?.bins||[];
    bins.forEach((b,i)=>{
      const x=left+(b.startMinute-start)/span*(right-left),width=(b.endMinute-b.startMinute)/span*(right-left);
      const label=fmt(b.startMinute/60)+"–"+fmt(b.endMinute/60)+"h · "+plotted.map(s=>{const p=s.bins[i];return s.label+": TB "+fmt(p.average)+" "+unit+"; đỉnh "+fmt(p.peak)+" "+unit+(p.complete?"":" (thiếu dữ liệu)");}).join(" | ");
      const rect=svg("rect",{x,y:top,width,height:bottom-top,fill:"transparent",tabindex:"0",role:"group","aria-label":label});
      rect.append(svg("title",{},label));
      for(const ev of ["focus","pointerenter","click"])rect.addEventListener(ev,()=>{inspect.textContent=label;});
      canvas.append(rect);
    });
    box.dataset.energyDay=String(state.day+1);box.dataset.energyResolution=String(state.resolution);
    box.dataset.energyOriginalSamples=String(series[0]?.values?.length||0);
    box.dataset.energyDisplayedBuckets=String(bins.length);
    if(arguments[0] && typeof canvas.animate==="function" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches)canvas.animate([{opacity:.7},{opacity:1}],{duration:220,easing:"cubic-bezier(.16,1,.3,1)"});
  }
  box._refreshEnergy=draw;draw();return box;
}
return {bucketSeries,create,sourceCurrency,shortCurrency};
});