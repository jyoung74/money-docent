
"use strict";

const $ = (id) => document.getElementById(id);
const form = $("retirementForm");
const results = $("results");

const numberValue = (id) => {
  const value = Number($(id).value);
  return Number.isFinite(value) ? value : 0;
};

const won = (value) => {
  if (!Number.isFinite(value)) return "-";
  return Math.round(value).toLocaleString("ko-KR");
};

const moneyLabel = (value) => `${won(value)}만원`;

function selectedPropertyStrategy() {
  return document.querySelector('input[name="propertyStrategy"]:checked')?.value || "none";
}

function togglePropertyFields() {
  const strategy = selectedPropertyStrategy();
  $("saleFields").hidden = strategy !== "sell";
  $("reverseFields").hidden = strategy !== "reverse";
}

document.querySelectorAll('input[name="propertyStrategy"]').forEach((radio) => {
  radio.addEventListener("change", togglePropertyFields);
});

togglePropertyFields();

function readInputs() {
  return {
    currentAge: numberValue("currentAge"),
    retireAge: numberValue("retireAge"),
    endAge: numberValue("endAge"),
    monthlyExpense: numberValue("monthlyExpense"),

    nationalStartAge: numberValue("nationalStartAge"),
    nationalPension: numberValue("nationalPension"),

    privateStartAge: numberValue("privateStartAge"),
    privatePension: numberValue("privatePension"),
    privateEndAge: numberValue("privateEndAge"),

    financialAssets: numberValue("financialAssets"),
    propertyValue: numberValue("propertyValue"),

    propertyStrategy: selectedPropertyStrategy(),
    saleAmount: numberValue("saleAmount"),
    saleCostRate: numberValue("saleCostRate"),

    reverseStartAge: numberValue("reverseStartAge"),
    reverseMonthly: numberValue("reverseMonthly"),

    inflationRate: numberValue("inflationRate") / 100,
    returnRate: numberValue("returnRate") / 100
  };
}

function validateInputs(data) {
  if (data.currentAge < 20 || data.currentAge > 100) {
    return "현재 나이는 20세부터 100세까지 입력해 주세요.";
  }

  if (data.retireAge < data.currentAge || data.retireAge > 100) {
    return "은퇴 나이는 현재 나이 이상, 100세 이하로 입력해 주세요.";
  }

  if (data.endAge <= data.retireAge || data.endAge > 110) {
    return "분석 종료 나이는 은퇴 나이보다 커야 합니다.";
  }

  if (data.privateEndAge < data.privateStartAge) {
    return "개인연금 종료 나이는 개시 나이보다 커야 합니다.";
  }

  if (data.nationalStartAge < 50 || data.privateStartAge < 30) {
    return "연금 개시 나이를 확인해 주세요.";
  }

  if (data.saleCostRate < 0 || data.saleCostRate > 100) {
    return "매각 비용·세금 비율은 0~100% 사이로 입력해 주세요.";
  }

  if (data.inflationRate < 0 || data.inflationRate > 0.2) {
    return "물가상승률은 0~20% 사이로 입력해 주세요.";
  }

  if (data.returnRate < -0.3 || data.returnRate > 0.3) {
    return "투자수익률은 -30~30% 사이로 입력해 주세요.";
  }

  const numericFields = [
    "monthlyExpense", "nationalPension", "privatePension",
    "financialAssets", "propertyValue", "saleAmount",
    "reverseMonthly"
  ];

  if (numericFields.some((key) => data[key] < 0)) {
    return "금액은 음수로 입력할 수 없습니다.";
  }

  return "";
}

/*
 * 금액 단위: 만원
 *
 * 입력한 생활비·연금액은 현재 가치 기준입니다.
 * 물가상승률을 매년 적용해 미래 명목금액으로 환산합니다.
 *
 * 금융자산은 현재 보유액을 은퇴 전까지 투자수익률로 성장시킵니다.
 * 은퇴 후에는 매년 자산수익을 반영하고 연금으로 충당하지 못한
 * 생활비를 금융자산에서 인출합니다.
 */
function runSimulation(data) {
  const inflation = data.inflationRate;
  const investmentReturn = data.returnRate;

  const yearsUntilRetirement = data.retireAge - data.currentAge;

  let assets = data.financialAssets *
    Math.pow(1 + investmentReturn, yearsUntilRetirement);

  const retirementAssetBeforeProperty = assets;

  let propertyIncomeAdded = 0;

  if (data.propertyStrategy === "sell") {
    const grossSaleAmount = data.saleAmount || data.propertyValue;
    propertyIncomeAdded = grossSaleAmount *
      (1 - data.saleCostRate / 100);
    assets += propertyIncomeAdded;
  }

  const retirementAsset = assets;
  const rows = [];
  let depletionAge = null;
  let totalShortfall = 0;

  for (let age = data.retireAge; age <= data.endAge; age++) {
    const yearsFromNow = age - data.currentAge;
    const yearsFromRetirement = age - data.retireAge;

    // 은퇴 후 매년 초 금융자산 운용수익을 반영
    const openingAssets = assets;
    const investmentGain = openingAssets * investmentReturn;
    const availableAssets = Math.max(0, openingAssets + investmentGain);

    // 현재가치로 입력한 생활비를 해당 연도 명목금액으로 환산
    const annualExpense = data.monthlyExpense * 12 *
      Math.pow(1 + inflation, yearsFromNow);

    // 국민연금: 개시 나이부터 반영
    const nationalMonthly = age >= data.nationalStartAge
      ? data.nationalPension * Math.pow(1 + inflation, yearsFromNow)
      : 0;

    // 개인연금: 개시 나이부터 종료 나이까지 반영
    const privateMonthly =
      age >= data.privateStartAge && age <= data.privateEndAge
        ? data.privatePension * Math.pow(1 + inflation, yearsFromNow)
        : 0;

    // 주택연금: 사용자가 입력한 월 수령액을 개시 나이부터 반영
    // 실제 주택연금의 지급 방식과 동일하다는 뜻은 아님
    const reverseMonthly =
      data.propertyStrategy === "reverse" &&
      age >= data.reverseStartAge
        ? data.reverseMonthly
        : 0;

    const totalMonthlyPension =
      nationalMonthly + privateMonthly + reverseMonthly;

    const annualPension = totalMonthlyPension * 12;
    const gap = Math.max(0, annualExpense - annualPension);
    const surplus = Math.max(0, annualPension - annualExpense);

    // 연금이 생활비보다 많은 경우 금융자산에 남는 금액을 더함
    const availableAfterCashflow = Math.max(0, availableAssets - gap + surplus);
    const unfundedGap = Math.max(0, gap - availableAssets);

    if (unfundedGap > 0) {
      totalShortfall += unfundedGap;
      if (depletionAge === null) depletionAge = age;
    }

    assets = availableAfterCashflow;

    rows.push({
      age,
      annualExpense,
      annualPension,
      nationalMonthly,
      privateMonthly,
      reverseMonthly,
      gap,
      withdrawal: Math.min(gap, availableAssets),
      unfundedGap,
      investmentGain,
      endingAssets: assets,
      openingAssets,
      yearsFromRetirement
    });
  }

  return {
    rows,
    retirementAsset,
    retirementAssetBeforeProperty,
    propertyIncomeAdded,
    depletionAge,
    totalShortfall,
    finalAssets: assets
  };
}

function findRowAtAge(rows, age) {
  return rows.find((row) => row.age === age);
}

function renderSummary(data, simulation) {
  const first = simulation.rows[0];

  const firstMonthlyPension = first.annualPension / 12;
  const firstMonthlyGap = first.gap / 12;

  $("retirementAsset").textContent = won(simulation.retirementAsset);
  $("firstPension").textContent = won(firstMonthlyPension);
  $("firstGap").textContent = won(firstMonthlyGap);

  $("depletionAge").textContent = simulation.depletionAge === null
    ? "미소진"
    : `${simulation.depletionAge}세`;

  const milestones = [
    {
      label: `${data.retireAge}세 · 은퇴 시점`,
      value: moneyLabel(simulation.retirementAsset)
    },
    {
      label: "국민연금 개시",
      value: data.nationalStartAge > data.endAge
        ? "분석 기간 이후"
        : `${data.nationalStartAge}세`
    },
    {
      label: "개인연금 개시",
      value: data.privateStartAge > data.endAge
        ? "분석 기간 이후"
        : `${data.privateStartAge}세`
    },
    {
      label: `${data.endAge}세 · 최종 잔여자산`,
      value: moneyLabel(simulation.finalAssets)
    },
    {
      label: "분석 기간 내 충당하지 못한 생활비",
      value: moneyLabel(simulation.totalShortfall)
    }
  ];

  if (data.propertyStrategy === "sell") {
    milestones.splice(1, 0, {
      label: "부동산 매각 후 금융자산 편입액",
      value: moneyLabel(simulation.propertyIncomeAdded)
    });
  }

  if (data.propertyStrategy === "reverse") {
    milestones.splice(1, 0, {
      label: "주택연금 가정 수령액",
      value: `${won(data.reverseMonthly)}만원 / 월`
    });
  }

  $("milestoneList").innerHTML = milestones.map((item) => `
    <div class="milestone-row">
      <span>${item.label}</span>
      <strong>${item.value}</strong>
    </div>
  `).join("");
}

function renderCashflow(rows) {
  $("cashflowRows").innerHTML = rows.map((row) => `
    <tr>
      <td>${row.age}세</td>
      <td>${won(row.annualExpense)}</td>
      <td>${won(row.annualPension)}</td>
      <td>${won(row.withdrawal)}</td>
      <td>${won(row.endingAssets)}</td>
    </tr>
  `).join("");
}

function drawAssetChart(rows) {
  const canvas = $("assetChart");
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(280, rect.width);
  const height = 220;
  const ratio = window.devicePixelRatio || 1;

  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);

  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);

  const padding = { top: 17, right: 12, bottom: 30, left: 52 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const values = rows.map((row) => row.endingAssets);
  const maxValue = Math.max(1, ...values);
  const minValue = 0;

  ctx.clearRect(0, 0, width, height);

  ctx.font = "10px sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  // 가로 기준선과 금액 눈금
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + chartHeight * (i / 4);
    const value = maxValue * (1 - i / 4);

    ctx.beginPath();
    ctx.strokeStyle = "#edf0f5";
    ctx.lineWidth = 1;
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();

    ctx.fillStyle = "#89909c";
    ctx.fillText(
      value.toLocaleString("ko-KR", { maximumFractionDigits: 0 }),
      padding.left - 7,
      y
    );
  }

  const xFor = (index) => padding.left +
    (rows.length <= 1 ? 0 : chartWidth * index / (rows.length - 1));

  const yFor = (value) => padding.top +
    chartHeight * (1 - (value - minValue) / (maxValue - minValue || 1));

  // 영역 채우기
  ctx.beginPath();
  rows.forEach((row, index) => {
    const x = xFor(index);
    const y = yFor(row.endingAssets);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineTo(xFor(rows.length - 1), padding.top + chartHeight);
  ctx.lineTo(xFor(0), padding.top + chartHeight);
  ctx.closePath();
  ctx.fillStyle = "rgba(66, 101, 223, .10)";
  ctx.fill();

  // 자산 잔액 선
  ctx.beginPath();
  rows.forEach((row, index) => {
    const x = xFor(index);
    const y = yFor(row.endingAssets);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.strokeStyle = "#4265df";
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();

  // 시작점과 종료점
  [0, rows.length - 1].forEach((index) => {
    ctx.beginPath();
    ctx.arc(xFor(index), yFor(rows[index].endingAssets), 4, 0, Math.PI * 2);
    ctx.fillStyle = "#4265df";
    ctx.fill();
  });

  // 나이 눈금
  ctx.fillStyle = "#89909c";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const tickIndices = [...new Set([
    0,
    Math.floor((rows.length - 1) / 2),
    rows.length - 1
  ])];

  tickIndices.forEach((index) => {
    ctx.fillText(`${rows[index].age}세`, xFor(index), height - 21);
  });
}

function updateActiveNav() {
  const currentHash = window.location.hash || "#home";
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle(
      "active",
      item.getAttribute("href") === currentHash
    );
  });
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const data = readInputs();
  const error = validateInputs(data);

  if (error) {
    alert(error);
    return;
  }

  const simulation = runSimulation(data);

  renderSummary(data, simulation);
  renderCashflow(simulation.rows);

  results.hidden = false;

  requestAnimationFrame(() => {
    drawAssetChart(simulation.rows);
    results.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

window.addEventListener("resize", () => {
  if (results.hidden) return;

  const data = readInputs();
  const error = validateInputs(data);
  if (error) return;

  const simulation = runSimulation(data);
  drawAssetChart(simulation.rows);
});

window.addEventListener("hashchange", updateActiveNav);
updateActiveNav();

// 이용안내 팝업
const helpDialog = $("helpDialog");

function openHelp() {
  if (typeof helpDialog.showModal === "function") {
    helpDialog.showModal();
  } else {
    alert(
      "현재 가치 기준으로 생활비와 연금액을 입력하세요. " +
      "금융자산은 은퇴 전까지 수익률로 성장하며, " +
      "은퇴 후 부족 생활비는 금융자산에서 충당하는 방식으로 계산합니다."
    );
  }
}

$("helpButton").addEventListener("click", openHelp);
$("navHelp").addEventListener("click", openHelp);
$("closeHelp").addEventListener("click", () => helpDialog.close());
$("confirmHelp").addEventListener("click", () => helpDialog.close());

helpDialog.addEventListener("click", (event) => {
  if (event.target === helpDialog) helpDialog.close();
});
