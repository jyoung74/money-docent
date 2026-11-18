(() => {
"use strict";

const $ = id => document.getElementById(id);
const num = id => Number($(id).value || 0);
const fmt = n => `${Math.round(n).toLocaleString("ko-KR")}만원`;
const fmtSigned = n => `${n < 0 ? "-" : ""}${fmt(Math.abs(n))}`;

function esc(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

$("menuButton").addEventListener("click", () => {
  $("nav").classList.toggle("open");
});

document.querySelectorAll("#nav a").forEach(a => {
  a.addEventListener("click", () => $("nav").classList.remove("open"));
});

/* =================================
   은퇴설계 입력 검증
================================= */

function validateRetirement() {
  const age = num("age");
  const retire = num("retireAge");
  const end = num("endAge");

  if (age < 18 || age > 100 || retire < age || retire > 100 || end <= retire || end > 110) {
    throw Error("나이 조건을 확인해 주세요. 은퇴 나이는 현재 나이 이상, 종료 나이는 은퇴 나이보다 커야 합니다.");
  }

  const amountIds = [
    "monthlyCost","assets","propertyValue",
    "nationalAmount","retirePensionAmount","personalAmount",
    "reverseAmount","mortgageBalance","creditBalance","otherBalance",
    "mortgagePayment","creditPayment","otherPayment"
  ];

  amountIds.forEach(id => {
    if (!Number.isFinite(num(id)) || num(id) < 0) {
      throw Error("금액 입력값을 확인해 주세요. 금액은 0 이상이어야 합니다.");
    }
  });

  ["mortgageRate","creditRate","otherRate"].forEach(id => {
    if (num(id) < 0 || num(id) > 50) {
      throw Error("대출금리는 0~50% 범위로 입력해 주세요.");
    }
  });

  if (num("personalEndAge") < num("personalAge")) {
    throw Error("개인연금 종료 나이는 개시 나이보다 빠를 수 없습니다.");
  }

  ["nationalAge","retirePensionAge","personalAge","reverseAge"].forEach(id => {
    if (num(id) < 18 || num(id) > 110) {
      throw Error("연금 개시 나이를 확인해 주세요.");
    }
  });

  if (num("inflation") <= -100) {
    throw Error("물가상승률 입력값을 확인해 주세요.");
  }

  if (num("returnRate") <= -100) {
    throw Error("금융자산 수익률 입력값을 확인해 주세요.");
  }

  if ($("propertyStrategy").value === "sell" &&
      (num("saleCostRate") < 0 || num("saleCostRate") > 100)) {
    throw Error("부동산 매각비용률을 확인해 주세요.");
  }
}

/* =================================
   대출 계산
================================= */

function loanSetup(prefix) {
  return {
    balance: num(prefix + "Balance"),
    rate: num(prefix + "Rate") / 1200,
    payment: num(prefix + "Payment"),
    type: $(prefix + "Type").value,
    months: Math.max(0, Math.round(num(prefix + "Years") * 12))
  };
}

function monthlyLoanPayment(loan) {
  if (loan.balance <= 0 || loan.months <= 0) return 0;

  if (loan.payment > 0) return loan.payment;

  if (loan.type === "interest") {
    return loan.balance * loan.rate;
  }

  if (loan.type === "principal") {
    return loan.balance / loan.months + loan.balance * loan.rate;
  }

  if (loan.rate === 0) {
    return loan.balance / loan.months;
  }

  const r = loan.rate;
  const n = loan.months;

  return loan.balance * r * Math.pow(1 + r, n) /
    (Math.pow(1 + r, n) - 1);
}

function stepLoan(loan) {
  if (loan.balance <= 0) {
    return {payment:0, interest:0, principal:0};
  }

  const interest = loan.balance * loan.rate;

  if (loan.months <= 0) {
    return {payment:0, interest:0, principal:0};
  }

  let payment = monthlyLoanPayment(loan);

  if (loan.type === "interest" && loan.months === 1) {
    payment = loan.balance + interest;
  }

  payment = Math.min(loan.balance + interest, payment);

  let principal = Math.max(0, payment - interest);

  if (loan.type === "principal" && loan.payment === 0) {
    principal = Math.min(loan.balance, loan.balance / loan.months);
  }

  principal = Math.min(loan.balance, principal);

  loan.balance = Math.max(0, loan.balance - principal);
  loan.months--;

  return {
    payment: interest + principal,
    interest,
    principal
  };
}

/* =================================
   연금 계산
================================= */

function pensionAt(age, inflation) {
  let total = 0;

  if (age >= num("nationalAge")) {
    const years = Math.floor(age - num("nationalAge"));
    total += num("nationalAmount") * Math.pow(1 + inflation, years);
  }

  if (age >= num("retirePensionAge")) {
    total += num("retirePensionAmount");
  }

  if (age >= num("personalAge") && age < num("personalEndAge")) {
    total += num("personalAmount");
  }

  if ($("propertyStrategy").value === "reverse" &&
      age >= num("reverseAge")) {
    total += num("reverseAmount");
  }

  return total;
}

/* =================================
   은퇴설계 월별 시뮬레이션
================================= */

function runRetirement() {
  validateRetirement();

  const startAge = num("age");
  const retireAge = num("retireAge");
  const endAge = num("endAge");

  const inflation = num("inflation") / 100;
  const monthlyReturn = Math.pow(1 + num("returnRate") / 100, 1 / 12) - 1;

  let assets = num("assets");
  let propertyAdded = false;
  const property = num("propertyValue");
  const strategy = $("propertyStrategy").value;

  const loans = [
    loanSetup("mortgage"),
    loanSetup("credit"),
    loanSetup("other")
  ];

  const totalMonths = Math.round((endAge - startAge) * 12);
  const annual = {};

  let depletionAge = null;
  let cumulativeUnfunded = 0;
  let retirementSnapshot = null;
  let firstRetirementGap = null;

  for (let m = 0; m < totalMonths; m++) {
    const age = startAge + m / 12;
    const yearIndex = Math.floor(m / 12);
    const monthInYear = m % 12;
    const isRetired = age >= retireAge;

    assets = Math.max(0, assets * (1 + monthlyReturn));

    if (strategy === "sell" && !propertyAdded && age >= retireAge) {
      assets += property * (1 - num("saleCostRate") / 100);
      propertyAdded = true;
    }

    const pension = isRetired ? pensionAt(age, inflation) : 0;

    const yearsSinceRetirement = Math.max(
      0, Math.floor(age - retireAge)
    );

    const cost = isRetired
      ? num("monthlyCost") * Math.pow(1 + inflation, yearsSinceRetirement)
      : 0;

    const loanResults = loans.map(stepLoan);
    const debtPayment = loanResults.reduce((sum, item) => sum + item.payment, 0);

    const livingGap = Math.max(0, cost - pension);
    const totalGap = livingGap + debtPayment;

    const withdrawal = Math.min(assets, totalGap);
    assets = Math.max(0, assets - withdrawal);

    const debtFunded = Math.min(withdrawal, debtPayment);
    const livingFunded = Math.min(
      livingGap,
      Math.max(0, withdrawal - debtFunded)
    );

    const unfundedLiving = Math.max(0, livingGap - livingFunded);
    cumulativeUnfunded += unfundedLiving;

    if (isRetired && livingGap > 0 && firstRetirementGap === null) {
      firstRetirementGap = {
        age: Math.floor(age),
        gap: livingGap,
        pension,
        cost
      };
    }

    if (depletionAge === null && assets <= 0 && isRetired && totalGap > 0) {
      depletionAge = Math.floor(age);
    }

    const debt = loans.reduce((sum, loan) => sum + loan.balance, 0);

    const propertyValue =
      strategy === "none" || strategy === "reverse" ? property : 0;

    const net = assets + propertyValue - debt;

    if (isRetired && retirementSnapshot === null) {
      retirementSnapshot = {assets, debt, net};
    }

    if (!annual[yearIndex]) {
      annual[yearIndex] = {
        age: Math.floor(age),
        cost:0,
        pension:0,
        gap:0,
        withdrawal:0,
        unfunded:0,
        assets:0,
        debt:0,
        net:0,
        months:0
      };
    }

    const row = annual[yearIndex];

    row.cost += cost;
    row.pension += pension;
    row.gap += livingGap;
    row.withdrawal += withdrawal;
    row.unfunded += unfundedLiving;
    row.assets = assets;
    row.debt = debt;
    row.net = net;
    row.months++;

    if (monthInYear === 11 || m === totalMonths - 1) {
      row.cost /= row.months;
      row.pension /= row.months;
      row.gap /= row.months;
      row.withdrawal /= row.months;
      row.age = Math.floor(age);
    }
  }

  const rows = Object.values(annual);
  const finalDebt = loans.reduce((sum, loan) => sum + loan.balance, 0);
  const finalProperty =
    strategy === "none" || strategy === "reverse" ? property : 0;

  return {
    rows,
    retirementSnapshot: retirementSnapshot || {
      assets,
      debt:finalDebt,
      net:assets + finalProperty - finalDebt
    },
    finalAssets:assets,
    finalDebt,
    finalNet:assets + finalProperty - finalDebt,
    finalUnfunded:cumulativeUnfunded,
    depletionAge,
    firstRetirementGap,
    propertyAdded
  };
}

/* =================================
   그래프
================================= */

function renderChart(rows) {
  const canvas = $("assetChart");
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 700;
  const h = 280;

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  const pad = {l:58,r:15,t:22,b:32};
  const pw = w - pad.l - pad.r;
  const ph = h - pad.t - pad.b;

  const values = rows.flatMap(r => [r.assets,r.debt,r.net]);
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);

  const x = i => pad.l + (rows.length <= 1 ? 0 : i / (rows.length - 1) * pw);
  const y = v => pad.t + (max - v) / (max - min || 1) * ph;

  ctx.font = "11px sans-serif";
  ctx.strokeStyle = "#e9edf4";
  ctx.fillStyle = "#81899a";

  for (let i = 0; i <= 4; i++) {
    const value = min + (max - min) * i / 4;
    const yy = y(value);

    ctx.beginPath();
    ctx.moveTo(pad.l, yy);
    ctx.lineTo(w - pad.r, yy);
    ctx.stroke();

    ctx.fillText(Math.round(value).toLocaleString("ko-KR"), 2, yy + 4);
  }

  const series = [
    ["assets","#4165dc"],
    ["debt","#e29b43"],
    ["net","#269b78"]
  ];

  series.forEach(([key,color]) => {
    ctx.beginPath();

    rows.forEach((r,i) => {
      if (i === 0) ctx.moveTo(x(i),y(r[key]));
      else ctx.lineTo(x(i),y(r[key]));
    });

    ctx.strokeStyle = color;
    ctx.lineWidth = 2.3;
    ctx.stroke();
  });

  ctx.fillStyle = "#657087";
  ctx.fillText(String(rows[0]?.age ?? ""),pad.l,h - 7);
  ctx.fillText(String(rows[rows.length - 1]?.age ?? ""),w - pad.r - 22,h - 7);

  const legend = [
    ["금융자산","#4165dc"],
    ["부채","#e29b43"],
    ["순자산","#269b78"]
  ];

  let lx = pad.l;

  legend.forEach(([label,color]) => {
    ctx.fillStyle = color;
    ctx.fillRect(lx,5,12,3);
    ctx.fillStyle = "#596174";
    ctx.fillText(label,lx + 17,11);
    lx += 78;
  });
}

/* =================================
   은퇴설계 결과 표시
================================= */

function strategyLabel(value) {
  if (value === "sell") return "은퇴 시 부동산 매각";
  if (value === "reverse") return "주택연금 활용";
  return "부동산 미활용";
}

function renderRetirement(result) {
  $("retirementResults").hidden = false;

  const snap = result.retirementSnapshot;

  $("kpiAssets").textContent = fmt(snap.assets);
  $("kpiDebt").textContent = fmt(snap.debt);
  $("kpiNet").textContent = fmtSigned(snap.net);

  $("kpiDepletion").textContent =
    result.depletionAge === null
      ? "분석기간 내 미소진"
      : `${result.depletionAge}세 전후`;

  const gap = result.firstRetirementGap;

  $("diagnosis").innerHTML = `
    <div>은퇴 시점 금융자산은 <b>${fmt(snap.assets)}</b>, 부채는 <b>${fmt(snap.debt)}</b>, 순자산은 <b>${fmtSigned(snap.net)}</b>입니다.</div>
    <div>분석기간 중 누적 미충당 생활비는 <b>${fmt(result.finalUnfunded)}</b>입니다.</div>
    <div>${result.depletionAge === null
      ? "분석 종료 나이까지 금융자산이 소진되지 않는 것으로 계산됩니다."
      : `금융자산은 약 ${result.depletionAge}세 전후 소진될 수 있습니다.`}</div>
    <div>${gap
      ? `${gap.age}세 전후 월 생활비 부족액은 ${fmt(gap.gap)}입니다.`
      : "은퇴 후 첫 분석 시점에 생활비 부족액이 발생하지 않았습니다."}</div>
    <div>부동산 활용: <b>${strategyLabel($("propertyStrategy").value)}</b></div>
  `;

  $("cashflowBody").innerHTML = result.rows.map(row => `
    <tr>
      <td>${row.age}세</td>
      <td>${fmt(row.cost)}</td>
      <td>${fmt(row.pension)}</td>
      <td>${fmt(row.gap)}</td>
      <td>${fmt(row.withdrawal)}</td>
      <td>${fmt(row.unfunded)}</td>
      <td>${fmt(row.assets)}</td>
      <td>${fmt(row.debt)}</td>
      <td>${fmtSigned(row.net)}</td>
    </tr>
  `).join("");

  const ages = [70,80,90,100].filter(
    age => age <= num("endAge") && age >= num("retireAge")
  );

  $("milestones").innerHTML = ages.map(age => {
    const row = result.rows.find(r => r.age >= age) || result.rows[result.rows.length - 1];

    return `
      <div class="milestone">
        <b>${age}세 전후</b>
        <span>
          금융자산 ${fmt(row.assets)}<br>
          부채 ${fmt(row.debt)}<br>
          순자산 ${fmtSigned(row.net)}
        </span>
      </div>
    `;
  }).join("");

  const advice = [];

  if (result.depletionAge !== null) {
    advice.push("금융자산 소진 위험이 예상됩니다. 은퇴시점, 생활비, 연금 개시 전략과 부동산 활용을 함께 검토해야 합니다.");
  }

  if (result.firstRetirementGap) {
    advice.push("연금 개시 전후 공백기간에 필요한 생활비를 별도로 준비하는 것이 좋습니다.");
  }

  if (result.finalDebt > 0) {
    advice.push("분석 종료 시점에도 대출잔액이 남습니다. 은퇴 전 상환계획을 점검해야 합니다.");
  }

  if (result.finalUnfunded > 0) {
    advice.push("금융자산으로 충당하지 못하는 생활비가 발생합니다. 지출 조정과 추가 현금흐름 마련이 필요합니다.");
  }

  if (advice.length === 0) {
    advice.push("입력한 가정에서는 분석기간 중 금융자산 소진이나 미충당 생활비가 발생하지 않았습니다. 가정값 변화에 대비해 정기적으로 재점검하세요.");
  }

  $("expertAdvice").innerHTML = advice.map(text => `<p>${esc(text)}</p>`).join("");

  renderChart(result.rows);
  $("retirementResults").scrollIntoView({behavior:"smooth",block:"start"});
}

$("retirementForm").addEventListener("submit", event => {
  event.preventDefault();
  $("retirementError").textContent = "";

  try {
    const result = runRetirement();
    renderRetirement(result);
  } catch (error) {
    $("retirementError").textContent = error.message;
  }
});

window.addEventListener("resize", () => {
  if (!$("retirementResults").hidden) {
    try {
      renderChart(runRetirement().rows);
    } catch (error) {}
  }
});

/* =================================
   보험보장 분석 기준
================================= */

const insuranceRules = [
  {
    id:"cancer",
    name:"암 진단비",
    limit:5000
  },
  {
    id:"cancerTreatment",
    name:"암 주요치료비",
    limit:10000
  },
  {
    id:"brain",
    name:"뇌혈관질환 진단비",
    limit:3000
  },
  {
    id:"heart",
    name:"허혈성심장질환 진단비",
    limit:3000
  },
  {
    id:"circulation",
    name:"순환계 주요치료비",
    limit:1000
  },
  {
    id:"surgery5",
    name:"5종 수술비",
    limit:1000
  }
];

/* =================================
   보험보장 판정
   미입력 또는 기준 이하 = 추가가입
================================= */

$("insuranceForm").addEventListener("submit", event => {
  event.preventDefault();

  $("insuranceError").textContent = "";

  const results = [];
  let addCount = 0;
  let sufficientCount = 0;

  for (const rule of insuranceRules) {
    const raw = $(rule.id).value.trim();

    let value = null;
    let status = "";

    if (raw === "") {
      status = "추가가입";
      addCount++;
    } else {
      value = Number(raw);

      if (!Number.isFinite(value) || value < 0) {
        $("insuranceError").textContent =
          "가입금액은 0 이상의 숫자로 입력해 주세요.";
        return;
      }

      if (value <= rule.limit) {
        status = "추가가입";
        addCount++;
      } else {
        status = "기준 충족";
        sufficientCount++;
      }
    }

    results.push({
      name:rule.name,
      value,
      limit:rule.limit,
      status
    });
  }

  $("insuranceSummary").innerHTML = `
    보험보장 점검 결과
    <br>
    추가가입 검토 <b>${addCount}개</b>
    &nbsp;·&nbsp;
    기준 충족 <b>${sufficientCount}개</b>
  `;

  $("insuranceRows").innerHTML = results.map(item => `
    <div class="result-row">
      <div>
        <div class="result-name">${esc(item.name)}</div>
        <div class="result-amount">
          ${item.value === null
            ? "가입금액 미입력"
            : `현재 ${fmt(item.value)} · 기준 ${fmt(item.limit)}`}
        </div>
      </div>
      <span class="badge ${item.status === "추가가입" ? "bad" : "good"}">
        ${item.status}
      </span>
    </div>
  `).join("");

  $("insuranceResults").hidden = false;

  $("insuranceResults").scrollIntoView({
    behavior:"smooth",
    block:"start"
  });
});

})();
