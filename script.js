(() => {
"use strict";
const $ = id => document.getElementById(id);
const num = id => Number($(id).value || 0);
const fmt = n => `${Math.round(n).toLocaleString("ko-KR")}만원`;
const fmtSigned = n => `${n < 0 ? "-" : ""}${fmt(Math.abs(n))}`;
const esc = s => String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
$("menuButton").addEventListener("click",()=>$("nav").classList.toggle("open"));
document.querySelectorAll("#nav a").forEach(a=>a.addEventListener("click",()=>$("nav").classList.remove("open")));

function validateRetirement(){
 const age=num("age"),retire=num("retireAge"),end=num("endAge");
 if(age<18||age>100||retire<age||retire>100||end<=retire||end>110) throw Error("나이 조건을 확인해 주세요. 은퇴 나이는 현재 나이 이상, 종료 나이는 은퇴 나이보다 커야 합니다.");
 const ids=["monthlyCost","assets","propertyValue","nationalAmount","retirePensionAmount","personalAmount","reverseAmount","mortgageBalance","creditBalance","otherBalance","mortgagePayment","creditPayment","otherPayment","inflation","returnRate"];
 for(const id of ids){if(!Number.isFinite(num(id)))throw Error("숫자 입력값을 확인해 주세요.");}
 for(const id of ids.slice(0,12)){if(num(id)<0)throw Error("금액은 0 이상으로 입력해 주세요.");}
 for(const id of ["mortgageRate","creditRate","otherRate"])if(num(id)<0||num(id)>50)throw Error("대출금리는 0~50% 범위로 입력해 주세요.");
 if(num("personalEndAge")<num("personalAge"))throw Error("개인연금 종료 나이는 개시 나이보다 빠를 수 없습니다.");
 if(num("nationalAge")>110||num("retirePensionAge")>110||num("personalAge")>110||num("reverseAge")>110)throw Error("연금 개시 나이를 확인해 주세요.");
}
function loanSetup(prefix){
 return {balance:num(prefix+"Balance"),rate:num(prefix+"Rate")/1200,payment:num(prefix+"Payment"),type:$(prefix+"Type").value,months:Math.max(0,Math.round(num(prefix+"Years")*12)),principalPaid:0};
}
function monthlyLoanPayment(loan){
 if(loan.balance<=0||loan.months<=0)return 0;
 if(loan.payment>0)return loan.payment;
 if(loan.type==="interest")return loan.balance*loan.rate;
 if(loan.type==="principal")return loan.balance/loan.months+loan.balance*loan.rate;
 if(loan.rate===0)return loan.balance/loan.months;
 const r=loan.rate,n=loan.months;
 return loan.balance*r*Math.pow(1+r,n)/(Math.pow(1+r,n)-1);
}
function stepLoan(loan){
 if(loan.balance<=0)return {payment:0,interest:0,principal:0};
 const interest=loan.balance*loan.rate;
 let payment=monthlyLoanPayment(loan);
 if(loan.type==="interest"&&loan.months>0&&loan.months<=1)payment=loan.balance+interest;
 if(loan.months===0&&loan.type==="interest")payment=interest;
 payment=Math.min(loan.balance+interest,payment);
 let principal=Math.max(0,payment-interest);
 if(loan.type==="principal"&&loan.payment===0&&loan.months>0)principal=Math.min(loan.balance,loan.balance/(loan.months));
 principal=Math.min(loan.balance,principal);
 loan.balance=Math.max(0,loan.balance-principal);
 if(loan.months>0)loan.months--;
 return {payment:interest+principal,interest,principal};
}
function pensionAt(age,month,retireAge,inflation){
 const nationalIndex=Math.pow(1+inflation,Math.max(0,Math.floor(age-num("nationalAge"))));
 let total=0;
 if(age>=num("nationalAge")) total+=num("nationalAmount")*nationalIndex;
 if(age>=num("retirePensionAge")) total+=num("retirePensionAmount");
 if(age>=num("personalAge")&&age<num("personalEndAge"))total+=num("personalAmount");
 if($("propertyStrategy").value==="reverse"&&age>=num("reverseAge"))total+=num("reverseAmount");
 return total;
}
function runRetirement(){
 validateRetirement();
 const startAge=num("age"),retireAge=num("retireAge"),endAge=num("endAge");
 const inflation=num("inflation")/100,monthlyReturn=Math.pow(1+num("returnRate")/100,1/12)-1;
 let assets=num("assets"),propertyAdded=false,property=num("propertyValue");
 const loans=[loanSetup("mortgage"),loanSetup("credit"),loanSetup("other")];
 const strategy=$("propertyStrategy").value;
 const saleAge=retireAge;
 const totalMonths=Math.round((endAge-startAge)*12);
 const rows=[],annual={};
 let depletionAge=null,cumulativeUnfunded=0,cumulativeShortage=0;
 let retirementSnapshot=null,firstRetirementGap=null;
 for(let m=1;m<=totalMonths;m++){
   const age=startAge+(m-1)/12;
   const monthInYear=(m-1)%12;
   const yearIndex=Math.floor((m-1)/12);
   const isRetired=age>=retireAge;
   const yearEnd=monthInYear===11||m===totalMonths;
   assets=Math.max(0,assets*(1+monthlyReturn));
   if(strategy==="sell"&&!propertyAdded&&age>=saleAge){
     assets+=property*(1-num("saleCostRate")/100);propertyAdded=true;
   }
   const pension=isRetired?pensionAt(age,m,retireAge,inflation):0;
   const cost=isRetired?num("monthlyCost")*Math.pow(1+inflation,Math.max(0,Math.floor((age-retireAge)))):0;
   const debtSteps=loans.map(stepLoan);
   const debtPayment=debtSteps.reduce((s,x)=>s+x.payment,0);
   const livingGap=Math.max(0,cost-pension);
   const totalCashGap=livingGap+debtPayment;
   const withdrawal=Math.min(assets,totalCashGap);
   assets=Math.max(0,assets-withdrawal);
   const debtFunded=Math.min(withdrawal,debtPayment);
   const livingFunded=Math.min(livingGap,Math.max(0,withdrawal-debtFunded));
   const livingUnfundedExact=Math.max(0,livingGap-livingFunded);
   cumulativeShortage+=livingGap;
   cumulativeUnfunded+=livingUnfundedExact;
   if(isRetired&&livingGap>0&&firstRetirementGap===null)firstRetirementGap={age:Math.floor(age),gap:livingGap,pension,cost};
   if(depletionAge===null&&assets<=0&&isRetired&&totalCashGap>0)depletionAge=Math.floor(age);
   const debt=loans.reduce((s,l)=>s+l.balance,0);
   const record={age:Math.floor(age),cost,pension,livingGap,withdrawal,unfundedLiving:livingUnfundedExact,assets,debt,net:assets+((strategy==="none"||strategy==="reverse")?property:0)-debt,yearIndex};
   if(isRetired&&retirementSnapshot===null)retirementSnapshot={assets,debt,net:record.net};
   if(!annual[yearIndex])annual[yearIndex]={age:Math.floor(age),cost:0,pension:0,gap:0,withdrawal:0,unfunded:0,assets:0,debt:0,net:0,months:0};
   const a=annual[yearIndex];a.cost+=cost;a.pension+=pension;a.gap+=livingGap;a.withdrawal+=withdrawal;a.unfunded+=livingUnfundedExact;a.assets=assets;a.debt=debt;a.net=record.net;a.months++;
   if(yearEnd)rows.push({...a,age:Math.floor(age),cost:a.cost/a.months,pension:a.pension/a.months,gap:a.gap/a.months,withdrawal:a.withdrawal/a.months,unfunded:a.unfunded});
 }
 const finalDebt=loans.reduce((s,l)=>s+l.balance,0);
 const finalProperty=(strategy==="none"||strategy==="reverse")?property:0;
 return {rows,retirementSnapshot:retirementSnapshot||{assets,debt:finalDebt,net:assets+finalProperty-finalDebt},finalAssets:assets,finalDebt,finalNet:assets+finalProperty-finalDebt,finalUnfunded:cumulativeUnfunded,depletionAge,firstRetirementGap,finalProperty,cumulativeShortage,propertyAdded};
}
function renderChart(rows){
 const canvas=$("assetChart"),ctx=canvas.getContext("2d"),dpr=window.devicePixelRatio||1,w=canvas.clientWidth||700,h=280;
 canvas.width=w*dpr;canvas.height=h*dpr;ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);
 const pad={l:58,r:15,t:20,b:35},pw=w-pad.l-pad.r,ph=h-pad.t-pad.b;
 const vals=rows.flatMap(r=>[r.assets,r.debt,r.net]);let max=Math.max(1,...vals),min=Math.min(0,...vals);
 const y=v=>pad.t+(max-v)/(max-min||1)*ph,x=i=>pad.l+(rows.length<=1?0:i/(rows.length-1)*pw);
 ctx.font="11px sans-serif";ctx.strokeStyle="#e9edf4";ctx.fillStyle="#81899a";ctx.lineWidth=1;
 for(let i=0;i<=4;i++){const v=min+(max-min)*i/4,yy=y(v);ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(w-pad.r,yy);ctx.stroke();ctx.fillText(Math.round(v).toLocaleString("ko-KR"),2,yy+4);}
 const series=[["assets","#4165dc"],["debt","#e29b43"],["net","#269b78"]];
 series.forEach(([key,color])=>{ctx.beginPath();rows.forEach((r,i)=>{const xx=x(i),yy=y(r[key]);if(i===0)ctx.moveTo(xx,yy);else ctx.lineTo(xx,yy)});ctx.strokeStyle=color;ctx.lineWidth=2.4;ctx.stroke();});
 ctx.fillStyle="#657087";ctx.fillText(String(rows[0]?.age??""),pad.l,h-8);ctx.fillText(String(rows[rows.length-1]?.age??""),w-pad.r-22,h-8);
 const legend=[["금융자산","#4165dc"],["부채","#e29b43"],["순자산","#269b78"]];
 let lx=pad.l;legend.forEach(([label,color])=>{ctx.fillStyle=color;ctx.fillRect(lx,4,12,3);ctx.fillStyle="#596174";ctx.fillText(label,lx+17,10);lx+=78;});
}
function renderRetirement(r){
 $("retirementResults").hidden=false;
 const snap=r.retirementSnapshot;
 $("kpiAssets").textContent=fmt(snap.assets);
 $("kpiDebt").textContent=fmt(snap.debt);
 $("kpiNet").textContent=fmtSigned(snap.net);
 $("kpiDepletion").textContent=r.depletionAge===null?"분석기간 내 미소진":`${r.depletionAge}세 전후`;
 const gap=r.firstRetirementGap;
 $("diagnosis").innerHTML=`<div>은퇴 시점 금융자산은 <b>${fmt(snap.assets)}</b>, 부채는 <b>${fmt(snap.debt)}</b>, 순자산은 <b>${fmtSigned(snap.net)}</b>로 추정됩니다.</div>
 <div>분석기간 중 누적 미충당 생활비는 <b>${fmt(r.finalUnfunded)}</b>입니다.</div>
 <div>${r.depletionAge===null?"분석 종료 나이까지 금융자산이 소진되지 않는 것으로 계산됩니다.":"금융자산은 약 "+r.depletionAge+"세 전후 소진될 수 있습니다. 이후 생활비 또는 부채상환 일부가 미충당될 수 있습니다."}</div>
 ${gap?`<div>은퇴 후 첫 생활비 부족은 약 ${gap.age}세부터 발생하며, 해당 시점의 월 부족액은 ${fmt(gap.gap)}입니다.</div>`:"<div>은퇴 후 첫 연금수입과 생활비 조건에서 월 생활비 부족액이 발생하지 않았습니다.</div>"}
 <div>부동산 전략: <b>${strategyLabel($("propertyStrategy").value)}</b>${r.propertyAdded?" · 매각대금은 은퇴 시 1회 반영":" · 매각대금은 금융자산에 합산하지 않음"}</div>`;
 $("cashflowBody").innerHTML=r.rows.map(x=>`<tr><td>${x.age}세</td><td>${fmt(x.cost)}</td><td>${fmt(x.pension)}</td><td>${fmt(x.gap)}</td><td>${fmt(x.withdrawal)}</td><td>${fmt(x.unfunded)}</td><td>${fmt(x.assets)}</td><td>${fmt(x.debt)}</td><td>${fmtSigned(x.net)}</td></tr>`).join("");
 const ages=[70,80,90,100].filter(a=>a<=num("endAge")&&a>=num("retireAge"));
 $("milestones").innerHTML=ages.map(a=>{const row=r.rows.find(x=>x.age>=a)||r.rows[r.rows.length-1];return `<div class="milestone"><b>${a}세 전후</b><span>금융자산 ${fmt(row.assets)}<br>부채 ${fmt(row.debt)}<br>순자산 ${fmtSigned(row.net)}</span></div>`}).join("")||"<p>선택한 분석기간에 해당 연령대가 없습니다.</p>";
 const advice=[];
 if(r.depletionAge!==null)advice.push(`금융자산 소진 위험이 예상되므로 은퇴시점 조정, 생활비 조정, 연금 개시 전략 및 부동산 활용을 함께 검토해야 합니다.`);
 if(r.firstRetirementGap)advice.push(`연금 개시 전후 공백기간의 현금흐름을 별도로 준비하고, 공백기간에 필요한 안전자산 규모를 점검하세요.`);
 if(r.finalDebt>0)advice.push(`분석 종료 시점에도 대출잔액이 남습니다. 은퇴 전 상환과 은퇴 후 현금흐름을 비교해 상환 우선순위를 검토하세요.`);
 if(r.finalUnfunded>0)advice.push(`금융자산으로 충당하지 못한 누적 생활비가 발생합니다. 미충당액은 자산 인출로 처리하지 않았습니다.`);
 if(!advice.length)advice.push("입력한 가정에서는 분석기간 중 금융자산 소진이나 미충당 생활비가 발생하지 않았습니다. 다만 수익률·물가·의료비 변동에 대비한 여유자금과 정기적인 재점검이 필요합니다.");
 $("expertAdvice").innerHTML=advice.map(x=>`<p>${esc(x)}</p>`).join("");
 renderChart(r.rows);
 $("retirementResults").scrollIntoView({behavior:"smooth",block:"start"});
}
function strategyLabel(v){return v==="sell"?"은퇴 시 부동산 매각":v==="reverse"?"주택연금 활용":"부동산 미활용";}
$("retirementForm").addEventListener("submit",e=>{e.preventDefault();$("retirementError").textContent="";try{renderRetirement(runRetirement())}catch(err){$("retirementError").textContent=err.message}});
window.addEventListener("resize",()=>{if(!$("retirementResults").hidden){try{renderChart(runRetirement().rows)}catch(e){}}});

const insuranceRules=[
 {id:"cancer",name:"암 진단비",limit:5000,reason:"암 진단 후 치료비 외에도 휴직·소득 감소·간병 및 생활비 부담이 발생할 수 있습니다. 초기 목돈이 부족하면 치료 기간 가계 지출에 부담이 될 수 있습니다.",advice:"일반암과 유사암의 구분, 진단 범위, 면책·감액기간을 확인하고 기존 보장과 합산해 검토하세요."},
 {id:"cancerTreatment",name:"암 주요치료비",limit:10000,reason:"수술·항암약물·방사선 등 치료 과정에서 비용이 발생할 수 있으며, 진단비와 치료비는 지급 조건이 다릅니다.",advice:"치료행위별 지급조건, 연간 한도, 반복 지급 여부, 보장기간 및 비급여 보장 여부를 확인하세요."},
 {id:"brain",name:"뇌혈관질환 진단비",limit:3000,reason:"진단 후 재활과 장기간 회복이 필요할 수 있고 후유장해·소득감소·간병 부담이 발생할 수 있습니다.",advice:"뇌출혈·뇌졸중에 한정되는지 뇌혈관질환 전체를 보장하는지 약관상 질병분류를 확인하세요."},
 {id:"heart",name:"허혈성심장질환 진단비",limit:3000,reason:"협심증·심근경색 등 질환은 검사·시술·수술과 지속적인 치료 및 회복기간의 생활비 부담으로 이어질 수 있습니다.",advice:"급성심근경색만 보장하는 담보인지 허혈성심장질환 범위까지 보장하는지 확인하세요."},
 {id:"circulation",name:"순환계 주요치료비",limit:1000,reason:"진단비와 달리 실제 치료행위와 약관상 지급요건을 충족해야 보험금이 지급될 수 있어 치료 시점의 보장 공백을 점검해야 합니다.",advice:"대상 질환, 치료행위, 연간 지급한도, 지급횟수 및 다른 치료비 담보와의 관계를 확인하세요."},
 {id:"surgery5",name:"5종 수술비",limit:1000,reason:"5종으로 분류되는 수술에 대한 보장금액이 기준 이하이면 약관상 해당 고액 수술 위험에 대비하는 수준이 제한적일 수 있습니다.",advice:"1~4종 금액과 합산하지 않습니다. 상품 약관의 수술분류표에서 실제 5종 해당 여부와 지급조건을 확인하세요."}
];
$("insuranceForm").addEventListener("submit",e=>{
 e.preventDefault();$("insuranceError").textContent="";
 const missing=[],short=[],rows=[];
 for(const rule of insuranceRules){
  const raw=$(rule.id).value.trim();
  if(raw===""){missing.push(rule.name);rows.push({...rule,value:null,status:"미입력"});continue;}
  const value=Number(raw);
  if(!Number.isFinite(value)||value<0){$("insuranceError").textContent="가입금액은 0 이상의 숫자로 입력해 주세요.";return;}
  const insufficient=value<=rule.limit;
  if(insufficient)short.push(rule.name);
  rows.push({...rule,value,status:insufficient?"부족":"기준 충족",difference:Math.max(0,rule.limit-value)});
 }
 $("insuranceSummary").innerHTML=`<div class="summary-box"><b>부족 판정 ${short.length}개</b><br>${short.length?esc(short.join(" · ")):"입력된 항목 중 기준 이하 항목은 없습니다."}</div>${missing.length?`<p class="hint">미입력 항목: ${esc(missing.join(", "))}. 미입력은 0원으로 간주하지 않습니다.</p>`:""}`;
 $("insuranceRows").innerHTML=rows.map(r=>`<div class="result-row"><div class="row-top"><strong>${r.name}</strong><span class="badge ${r.status==="부족"?"bad":r.status==="기준 충족"?"good":"pending"}">${r.status}</span></div><div class="amount">${r.value===null?"가입금액 미입력":`현재 ${fmt(r.value)} · 기준 ${fmt(r.limit)}`}</div>${r.status==="부족"?`<p class="reason"><b>부족 이유</b><br>${r.reason}</p><div class="recommend">전문가 보완 의견: ${r.advice}<br>기준까지 차액: ${fmt(r.difference)} (적정 가입금액을 확정하는 값은 아닙니다.)</div>`:r.status==="기준 충족"?`<p class="reason">자체 진단 기준을 초과합니다. 실제 보장범위와 지급조건은 약관을 확인해야 합니다.</p>`:`<p class="reason">자료 확인 후 가입금액을 입력해야 판정할 수 있습니다.</p>`}</div>`).join("");
 $("insuranceAdvice").textContent=short.length?`자체 기준상 ${short.join(", ")} 항목을 우선 검토할 필요가 있습니다. 다만 실제 보완 여부와 금액은 연령, 소득, 가족구성, 자산, 기존 보험료, 가입 가능 여부와 약관을 함께 확인한 뒤 결정해야 합니다.`:"입력된 금액은 자체 기준을 충족합니다. 기준 충족이 모든 위험에 대한 충분한 보장이나 보험금 지급을 보장하지는 않으므로 약관과 보장 공백을 확인하세요.";
 $("insuranceResults").hidden=false;$("insuranceResults").scrollIntoView({behavior:"smooth",block:"start"});
});
})();
