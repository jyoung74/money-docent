
"use strict";

/* =========================================================
   머니도슨트 정밀 은퇴설계 엔진 v2
   금액 단위: 만원
   월별 현금흐름
   연 수익률/물가상승률: 유효 연율
   월 수익률: (1 + 연율)^(1/12) - 1

   계산 원칙
   1. 현재 자산은 현재 시점 잔액
   2. 은퇴 전 운용기간은 실제 경과 월 수만큼
   3. 은퇴 시점에 부동산 매각대금 한 번 반영
   4. 개인연금은 고정 명목금액
   5. 국민연금과 생활비는 물가연동
   6. 월별 투자수익 후 월말 현금흐름 처리
   7. 그래프와 결과표는 동일한 월별 데이터 사용
   ========================================================= */

const $ = (id) => document.getElementById(id);

const form = $("retirementForm");
const results = $("results");

/* ---------- 공통 함수 ---------- */

const num = (id, fallback = 0) => {
  const element = $(id);
  if (!element) return fallback;

  const value = Number(element.value);
  return Number.isFinite(value) ? value : fallback;
};

const won = (value) => {
  if (!Number.isFinite(value)) return "-";
  return Math.round(value).toLocaleString("ko-KR");
};

const moneyLabel = (value) => `${won(value)}만원`;

const monthlyRate = (annualRate) =>
  Math.pow(1 + annualRate, 1 / 12) - 1;

const ageLabel = (ageMonths) => {
  const years = Math.floor(ageMonths / 12);
  const months = ageMonths % 12;
  return `${years}세 ${months}개월`;
};

/* ---------- 매각금액 자동 연동 ---------- */

let saleAmountManuallyEdited = false;

const saleAmountInput = $("saleAmount");
const propertyValueInput = $("propertyValue");
const saleCostInput = $("saleCostRate");

if (saleAmountInput && propertyValueInput) {
  // 최초 기본값은 부동산 평가액과 연동
  saleAmountInput.value =
    propertyValueInput.value || 0;

  saleAmountInput.addEventListener("input", () => {
    saleAmountManuallyEdited = true;
  });

  propertyValueInput.addEventListener("input", () => {
    if (!saleAmountManuallyEdited) {
      saleAmountInput.value =
        propertyValueInput.value;
    }
  });
}

// 기존 화면의 임의 5% 기본값을 0%로 변경
// 사용자가 직접 입력한 값은 계산 시 그대로 사용
if (saleCostInput && Number(saleCostInput.value) === 5) {
  saleCostInput.value = 0;
}

/* ---------- 부동산 선택 ---------- */

function selectedPropertyStrategy() {
  return document.querySelector(
    'input[name="propertyStrategy"]:checked'
  )?.value || "none";
}

function togglePropertyFields() {
  const strategy = selectedPropertyStrategy();

  if ($("saleFields")) {
    $("saleFields").hidden = strategy !== "sell";
  }

  if ($("reverseFields")) {
    $("reverseFields").hidden = strategy !== "reverse";
  }
}

document.querySelectorAll(
  'input[name="propertyStrategy"]'
).forEach((radio) => {
  radio.addEventListener("change", togglePropertyFields);
});

togglePropertyFields();

/* ---------- 입력값 ---------- */

function readInputs() {
  return {
    currentAge: num("currentAge"),
    retireAge: num("retireAge"),
    endAge: num("endAge"),
    monthlyExpense: num("monthlyExpense"),

    nationalStartAge: num("nationalStartAge"),
    nationalPension: num("nationalPension"),

    privateStartAge: num("privateStartAge"),
    privatePension: num("privatePension"),
    privateEndAge: num("privateEndAge"),

    financialAssets: num("financialAssets"),
    propertyValue: num("propertyValue"),

    propertyStrategy: selectedPropertyStrategy(),

    saleAmount: num("saleAmount"),
    saleCostRate: num("saleCostRate"),

    reverseStartAge: num("reverseStartAge"),
    reverseMonthly: num("reverseMonthly"),

    inflationRate: num("inflationRate") / 100,
    returnRate: num("returnRate") / 100
  };
}

/* ---------- 입력 검증 ---------- */

function validateInputs(d) {
  const checks = [
    [
      d.currentAge >= 20 &&
      d.currentAge <= 100,
      "현재 나이는 20~100세로 입력해 주세요."
    ],
    [
      d.retireAge >= d.currentAge &&
      d.retireAge < d.endAge,
      "은퇴 나이는 현재 나이 이상, 분석 종료 나이 미만이어야 합니다."
    ],
    [
      d.endAge <= 110 &&
      d.endAge > d.retireAge,
      "분석 종료 나이를 확인해 주세요."
    ],
    [
      d.monthlyExpense >= 0,
      "생활비는 0 이상이어야 합니다."
    ],
    [
      d.nationalPension >= 0 &&
      d.privatePension >= 0,
      "연금액은 0 이상이어야 합니다."
    ],
    [
      d.nationalStartAge >= 50 &&
      d.nationalStartAge <= 110,
      "국민연금 개시 나이를 확인해 주세요."
    ],
    [
      d.privateStartAge >= 30 &&
      d.privateStartAge <= 110,
      "개인연금 개시 나이를 확인해 주세요."
    ],
    [
      d.privateEndAge >= d.privateStartAge,
      "개인연금 종료 나이는 개시 나이보다 커야 합니다."
    ],
    [
      d.financialAssets >= 0 &&
      d.propertyValue >= 0,
      "자산 금액은 0 이상이어야 합니다."
    ],
    [
      d.saleAmount >= 0 &&
      d.saleCostRate >= 0 &&
      d.saleCostRate <= 100,
      "매각금액과 매각비용 비율을 확인해 주세요."
    ],
    [
      d.reverseStartAge >= 30 &&
      d.reverseStartAge <= 110 &&
      d.reverseMonthly >= 0,
      "주택연금 입력값을 확인해 주세요."
    ],
    [
      d.inflationRate >= 0 &&
      d.inflationRate <= 0.2,
      "물가상승률은 0~20% 사이로 입력해 주세요."
    ],
    [
      d.returnRate >= -0.3 &&
      d.returnRate <= 0.3,
      "투자수익률은 -30~30% 사이로 입력해 주세요."
    ]
  ];

  const failed = checks.find((item) => !item[0]);
  return failed ? failed[1] : "";
}

/* =========================================================
   월별 시뮬레이션
   ========================================================= */

function runSimulation(d) {
  const rMonth = monthlyRate(d.returnRate);
  const iMonth = monthlyRate(d.inflationRate);

  const currentMonth = Math.round(d.currentAge * 12);
  const retirementMonth = Math.round(d.retireAge * 12);
  const endMonth = Math.round(d.endAge * 12);

  let assets = d.financialAssets;

  let saleProceeds = 0;
  let saleCost = 0;

  if (d.propertyStrategy === "sell") {
    saleCost = d.saleAmount * d.saleCostRate / 100;
    saleProceeds = Math.max(
      0,
      d.saleAmount - saleCost
    );
  }

  const rows = [];
  const annualRows = [];

  let depletionMonth = null;

  let cumulativeUnfunded = 0;
  let cumulativeWithdrawals = 0;
  let cumulativePension = 0;
  let cumulativeExpenses = 0;
  let totalInvestmentGain = 0;

  let assetAtRetirement = null;
  let firstRetirementExpense = null;
  let firstRetirementPension = null;
  let firstRetirementGap = null;

  let propertyAdded = false;

  let yearly = null;
  let lastYearKey = null;

  // 월별 시점별 잔액을 기록
  const boundaryBalances = new Map();

  boundaryBalances.set(currentMonth, assets);

  for (
    let month = currentMonth;
    month < endMonth;
    month++
  ) {
    const isRetired = month >= retirementMonth;

    // 1. 은퇴 시점 부동산 매각대금 반영
    // 은퇴 시작 시점에 한 번만 유입
    if (
      isRetired &&
      d.propertyStrategy === "sell" &&
      !propertyAdded
    ) {
      assets += saleProceeds;
      propertyAdded = true;
    }

    // 2. 은퇴 시작 시점 자산 기록
    // 첫 은퇴 월의 투자수익과 생활비 반영 전 잔액
    if (month === retirementMonth) {
      assetAtRetirement = assets;
    }

    // 3. 월초 운용자산 및 월 수익
    const openingAssets = assets;
    const monthlyGain = openingAssets * rMonth;

    assets = openingAssets + monthlyGain;
    totalInvestmentGain += monthlyGain;

    // 은퇴 전에는 생활비와 연금 현금흐름 없음
    if (!isRetired) {
      boundaryBalances.set(month + 1, assets);
      continue;
    }

    // 4. 생활비 물가 반영
    // 현재 나이를 기준으로 매월 물가상승
    const monthlyExpense =
      d.monthlyExpense *
      Math.pow(
        1 + iMonth,
        month - currentMonth
      );

    // 5. 국민연금
    // 국민연금 개시 시점부터 물가연동
    const nationalStartMonth =
      Math.round(d.nationalStartAge * 12);

    let nationalIncome = 0;

    if (month >= nationalStartMonth) {
      const monthsReceiving =
        month - nationalStartMonth;

      nationalIncome =
        d.nationalPension *
        Math.pow(
          1 + iMonth,
          monthsReceiving
        );
    }

    // 6. 개인연금
    // 물가상승률 미적용, 고정 명목금액
    const privateStartMonth =
      Math.round(d.privateStartAge * 12);

    const privateEndMonth =
      Math.round(d.privateEndAge * 12);

    const privateIncome =
      month >= privateStartMonth &&
      month < privateEndMonth
        ? d.privatePension
        : 0;

    // 7. 주택연금
    // 입력한 월 수령액 고정
    const reverseStartMonth =
      Math.round(d.reverseStartAge * 12);

    const reverseIncome =
      d.propertyStrategy === "reverse" &&
      month >= reverseStartMonth
        ? d.reverseMonthly
        : 0;

    const totalPension =
      nationalIncome +
      privateIncome +
      reverseIncome;

    // 8. 월 생활비와 연금 비교
    const gap = Math.max(
      0,
      monthlyExpense - totalPension
    );

    const surplus = Math.max(
      0,
      totalPension - monthlyExpense
    );

    // 9. 자산 인출
    const availableAssets = assets;

    const withdrawal = Math.min(
      gap,
      availableAssets
    );

    const unfunded = Math.max(
      0,
      gap - availableAssets
    );

    assets = Math.max(
      0,
      availableAssets - withdrawal + surplus
    );

    // 10. 자산 소진 시점
    // 월말 잔액이 처음 0원이 되는 시점으로 기록
    if (
      depletionMonth === null &&
      gap > 0 &&
      assets <= 0
    ) {
      depletionMonth = month + 1;
    }

    cumulativeUnfunded += unfunded;
    cumulativeWithdrawals += withdrawal;
    cumulativePension += totalPension;
    cumulativeExpenses += monthlyExpense;

    // 첫 은퇴 월의 정보
    if (month === retirementMonth) {
      firstRetirementExpense = monthlyExpense;
      firstRetirementPension = totalPension;
      firstRetirementGap = gap;
    }

    const row = {
      month,
      age: month / 12,
      ageLabel: ageLabel(month),

      monthlyExpense,
      nationalIncome,
      privateIncome,
      reverseIncome,
      totalPension,

      gap,
      withdrawal,
      unfunded,

      openingAssets,
      monthlyGain,
      endingAssets: assets,

      cumulativeUnfunded
    };

    rows.push(row);

    // 월말 잔액을 연령 경계에 저장
    boundaryBalances.set(month + 1, assets);

    // 11. 연도별 요약
    const yearKey = Math.floor(month / 12);

    if (lastYearKey !== yearKey) {
      if (yearly) {
        annualRows.push(yearly);
      }

      yearly = {
        age: Math.floor(month / 12),
        annualExpense: 0,
        annualPension: 0,
        withdrawal: 0,
        unfunded: 0,
        endingAssets: assets
      };

      lastYearKey = yearKey;
    }

    yearly.annualExpense += monthlyExpense;
    yearly.annualPension += totalPension;
    yearly.withdrawal += withdrawal;
    yearly.unfunded += unfunded;
    yearly.endingAssets = assets;
  }

  if (yearly) {
    annualRows.push(yearly);
  }

  if (assetAtRetirement === null) {
    assetAtRetirement = assets;
  }

  const finalAssets = assets;

  // 12. 자산 소진 표시
  const depletionText =
    depletionMonth === null
      ? "분석 기간 내 미소진"
      : ageLabel(depletionMonth);

  // 13. 특정 나이의 잔여자산 조회
  function balanceAtAge(targetAge) {
    const targetMonth = Math.round(targetAge * 12);

    if (targetMonth < currentMonth) {
      return null;
    }

    if (targetMonth === currentMonth) {
      return d.financialAssets;
    }

    if (targetMonth < retirementMonth) {
      const elapsedMonths =
        targetMonth - currentMonth;

      return d.financialAssets *
        Math.pow(1 + rMonth, elapsedMonths);
    }

    if (targetMonth === retirementMonth) {
      return assetAtRetirement;
    }

    if (targetMonth >= endMonth) {
      return targetMonth === endMonth
        ? finalAssets
        : null;
    }

    return boundaryBalances.has(targetMonth)
      ? boundaryBalances.get(targetMonth)
      : null;
  }

  return {
    rows,
    annualRows,

    currentMonth,
    retirementMonth,
    endMonth,

    assetAtRetirement,

    firstRetirementExpense,
    firstRetirementPension,
    firstRetirementGap,

    saleProceeds,
    saleCost,

    depletionMonth,
    depletionText,

    cumulativeUnfunded,
    cumulativeWithdrawals,
    cumulativePension,
    cumulativeExpenses,

    totalInvestmentGain,
    finalAssets,

    balanceAtAge,
    boundaryBalances
  };
}

/* =========================================================
   결과 표시
   ========================================================= */

function renderSummary(d, s) {
  $("retirementAsset").textContent =
    won(s.assetAtRetirement);

  $("firstPension").textContent =
    won(s.firstRetirementPension || 0);

  $("firstGap").textContent =
    won(s.firstRetirementGap || 0);

  $("depletionAge").textContent =
    s.depletionMonth === null
      ? "미소진"
      : ageLabel(s.depletionMonth);

  const milestones = [
    {
      label: "은퇴 시점 예상 금융자산",
      value: moneyLabel(s.assetAtRetirement)
    },
    {
      label: "국민연금 개시",
      value: `${d.nationalStartAge}세`
    },
    {
      label: "개인연금 개시",
      value: `${d.privateStartAge}세`
    },
    {
      label: "월별 누적 금융자산 인출액",
      value: moneyLabel(s.cumulativeWithdrawals)
    },
    {
      label: "분석 기간 내 누적 미충당 생활비",
      value: moneyLabel(s.cumulativeUnfunded)
    },
    {
      label: `${d.endAge}세 분석 종료 시 잔여 금융자산`,
      value: moneyLabel(s.finalAssets)
    }
  ];

  if (d.endAge >= 90) {
    milestones.push({
      label: "90세 잔여 금융자산",
      value: moneyLabel(s.balanceAtAge(90))
    });
  }

  if (d.endAge >= 100) {
    milestones.push({
      label: "100세 잔여 금융자산",
      value: moneyLabel(s.balanceAtAge(100))
    });
  }

  if (d.propertyStrategy === "sell") {
    milestones.splice(1, 0, {
      label: "부동산 매각 순유입액",
      value: moneyLabel(s.saleProceeds)
    });
  }

  if (d.propertyStrategy === "reverse") {
    milestones.splice(1, 0, {
      label: "주택연금 월 수령 가정액",
      value: `${won(d.reverseMonthly)}만원`
    });
  }

  $("milestoneList").innerHTML =
    milestones.map((item) => `
      <div class="milestone-row">
        <span>${item.label}</span>
        <strong>${item.value}</strong>
      </div>
    `).join("");
}

function renderCashflow(annualRows) {
  $("cashflowRows").innerHTML =
    annualRows.map((row) => `
      <tr>
        <td>${row.age}세</td>
        <td>${won(row.annualExpense)}</td>
        <td>${won(row.annualPension)}</td>
        <td>${won(row.withdrawal)}</td>
        <td>${won(row.endingAssets)}</td>
      </tr>
    `).join("");
}

/* =========================================================
   그래프
   - 은퇴 시점 잔액을 첫 점으로 표시
   - 월별 데이터에서 연말 잔액 추출
   - 자산 소진 시점은 월말 기준
   ========================================================= */

function drawAssetChart(simulation) {
  const canvas = $("assetChart");
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const width = Math.max(280, rect.width);
  const height = 220;
  const ratio = window.devicePixelRatio || 1;

  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);

  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  const rows = simulation.rows;

  const points = [];

  // 은퇴 시점 잔액
  points.push({
    age: simulation.retirementMonth / 12,
    assets: simulation.assetAtRetirement
  });

  // 매년 말 잔액
  rows.forEach((row) => {
    const monthOfYear = (row.month + 1) % 12;

    if (
      monthOfYear === 0 ||
      row.month === rows[rows.length - 1]?.month
    ) {
      points.push({
        age: (row.month + 1) / 12,
        assets: row.endingAssets
      });
    }
  });

  // 자산 소진 시점
  if (simulation.depletionMonth !== null) {
    points.push({
      age: simulation.depletionMonth / 12,
      assets: 0
    });
  }

  points.sort((a, b) => a.age - b.age);

  // 동일 나이 중복 점 제거
  const uniquePoints = points.filter(
    (point, index, arr) =>
      index === 0 ||
      point.age !== arr[index - 1].age
  );

  const values = uniquePoints.map((p) => p.assets);
  const maxValue = Math.max(1, ...values);
  const yMax = maxValue * 1.12;

  const padding = {
    top: 15,
    right: 12,
    bottom: 30,
    left: 60
  };

  const chartWidth =
    width - padding.left - padding.right;

  const chartHeight =
    height - padding.top - padding.bottom;

  const minAge = simulation.retirementMonth / 12;
  const maxAge = simulation.endMonth / 12;

  const xFor = (age) =>
    padding.left +
    chartWidth *
      (age - minAge) /
      Math.max(1, maxAge - minAge);

  const yFor = (value) =>
    padding.top +
    chartHeight * (1 - value / yMax);

  ctx.clearRect(0, 0, width, height);

  // Y축 눈금
  ctx.font = "10px sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  for (let i = 0; i <= 4; i++) {
    const value = yMax * (1 - i / 4);
    const y = yFor(value);

    ctx.beginPath();
    ctx.strokeStyle = "#edf0f5";
    ctx.lineWidth = 1;
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();

    ctx.fillStyle = "#858c98";
    ctx.fillText(
      Math.round(value).toLocaleString("ko-KR"),
      padding.left - 7,
      y
    );
  }

  // 0원 기준선
  ctx.beginPath();
  ctx.strokeStyle = "#c6cbd4";
  ctx.moveTo(padding.left, yFor(0));
  ctx.lineTo(width - padding.right, yFor(0));
  ctx.stroke();

  // 그래프 영역
  ctx.beginPath();

  uniquePoints.forEach((point, index) => {
    const x = xFor(point.age);
    const y = yFor(point.assets);

    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.lineTo(
    xFor(uniquePoints[uniquePoints.length - 1].age),
    yFor(0)
  );

  ctx.lineTo(
    xFor(uniquePoints[0].age),
    yFor(0)
  );

  ctx.closePath();
  ctx.fillStyle = "rgba(66,101,223,.10)";
  ctx.fill();

  // 자산 잔액 선
  ctx.beginPath();

  uniquePoints.forEach((point, index) => {
    const x = xFor(point.age);
    const y = yFor(point.assets);

    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.strokeStyle = "#4265df";
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();

  // 은퇴 시작점
  ctx.beginPath();
  ctx.arc(
    xFor(minAge),
    yFor(simulation.assetAtRetirement),
    4,
    0,
    Math.PI * 2
  );

  ctx.fillStyle = "#4265df";
  ctx.fill();

  // 소진 시점
  if (simulation.depletionMonth !== null) {
    const depletionAge =
      simulation.depletionMonth / 12;

    ctx.beginPath();
    ctx.arc(
      xFor(depletionAge),
      yFor(0),
      4,
      0,
      Math.PI * 2
    );

    ctx.fillStyle = "#dc5a5a";
    ctx.fill();
  }

  // X축 나이 표시
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#858c98";

  const ticks = [
    minAge,
    minAge + (maxAge - minAge) / 2,
    maxAge
  ];

  ticks.forEach((age) => {
    ctx.fillText(
      `${Math.round(age)}세`,
      xFor(age),
      height - 21
    );
  });
}

/* =========================================================
   계산 실행
   ========================================================= */

function calculateAndRender() {
  const data = readInputs();
  const error = validateInputs(data);

  if (error) {
    alert(error);
    return;
  }

  const simulation = runSimulation(data);

  renderSummary(data, simulation);
  renderCashflow(simulation.annualRows);

  if (results) {
    results.hidden = false;
  }

  requestAnimationFrame(() => {
    drawAssetChart(simulation);

    if (results) {
      results.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  });

  // 개발자 도구 검증용
  window.moneyDocentLastResult = {
    inputs: data,
    result: simulation
  };

  console.table({
    은퇴시점금융자산: simulation.assetAtRetirement,
    누적생활비: simulation.cumulativeExpenses,
    누적연금: simulation.cumulativePension,
    누적인출액: simulation.cumulativeWithdrawals,
    미충당생활비: simulation.cumulativeUnfunded,
    최종잔여자산: simulation.finalAssets,
    자산소진시점: simulation.depletionText,
    90세잔여자산: simulation.balanceAtAge(90),
    100세잔여자산: simulation.balanceAtAge(100)
  });
}

if (form) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    calculateAndRender();
  });
}

/* ---------- 그래프 반응형 처리 ---------- */

window.addEventListener("resize", () => {
  if (!results || results.hidden) return;

  const last = window.moneyDocentLastResult;

  if (last) {
    drawAssetChart(last.result);
  }
});

/* ---------- 이용안내 ---------- */

const helpDialog = $("helpDialog");

function openHelp() {
  if (
    helpDialog &&
    typeof helpDialog.showModal === "function"
  ) {
    helpDialog.showModal();
  } else {
    alert(
      "입력한 생활비와 연금액을 기준으로 월별 현금흐름을 분석합니다. " +
      "부동산 매각과 주택연금은 선택한 방식에 따라 별도로 반영됩니다."
    );
  }
}

if ($("helpButton")) {
  $("helpButton").addEventListener("click", openHelp);
}

if ($("navHelp")) {
  $("navHelp").addEventListener("click", openHelp);
}

if ($("closeHelp")) {
  $("closeHelp").addEventListener("click", () => {
    if (helpDialog) helpDialog.close();
  });
}

if ($("confirmHelp")) {
  $("confirmHelp").addEventListener("click", () => {
    if (helpDialog) helpDialog.close();
  });
}

if (helpDialog) {
  helpDialog.addEventListener("click", (event) => {
    if (event.target === helpDialog) {
      helpDialog.close();
    }
  });
}

/* ---------- 하단 메뉴 ---------- */

function updateActiveNav() {
  const currentHash = window.location.hash || "#home";

  document.querySelectorAll(".nav-item").forEach((item) => {
    const href = item.getAttribute("href");

    item.classList.toggle(
      "active",
      Boolean(href) && href === currentHash
    );
  });
}

window.addEventListener("hashchange", updateActiveNav);
updateActiveNav();

console.log(
  "머니도슨트 정밀 은퇴설계 엔진 v2 로드 완료"
);
