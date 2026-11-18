"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const $ = id => document.getElementById(id);
  const form = $("retirementForm");

  if (!form) {
    console.error("은퇴설계 입력폼을 찾을 수 없습니다.");
    return;
  }

  let assetChart = null;
  let cashChart = null;
  let lastResult = null;

  const num = id => {
    const el = $(id);
    if (!el) throw new Error(`입력 항목 누락: ${id}`);
    const raw = String(el.value ?? "").replace(/,/g, "").trim();
    if (raw === "") return 0;
    const value = Number(raw);
    return Number.isFinite(value) ? value : NaN;
  };

  const won = value =>
    Math.round(value).toLocaleString("ko-KR");

  const money = value => `${won(value)}만원`;

  const strategy = () =>
    document.querySelector('input[name="propertyStrategy"]:checked')?.value || "none";

  function readInputs() {
    return {
      currentAge: num("currentAge"),
      retireAge: num("retireAge"),
      endAge: num("endAge"),
      monthlyExpense: num("monthlyExpense"),

      financialAssets: num("financialAssets"),
      propertyValue: num("propertyValue"),

      mortgageDebt: num("mortgageDebt"),
      creditDebt: num("creditDebt"),
      otherDebt: num("otherDebt"),
      debtRate: num("debtRate"),
      monthlyDebtPayment: num("monthlyDebtPayment"),

      nationalStartAge: num("nationalStartAge"),
      nationalPension: num("nationalPension"),

      retirementPensionStartAge: num("retirementPensionStartAge"),
      retirementPension: num("retirementPension"),

      privateStartAge: num("privateStartAge"),
      privatePension: num("privatePension"),
      privateEndAge: num("privateEndAge"),

      propertyStrategy: strategy(),
      saleAmount: num("saleAmount"),
      saleCostRate: num("saleCostRate"),

      reverseStartAge: num("reverseStartAge"),
      reverseMonthly: num("reverseMonthly"),

      inflationRate: num("inflationRate") / 100,
      returnRate: num("returnRate") / 100
    };
  }

  function validate(d) {
    const errors = [];

    for (const [key, value] of Object.entries(d)) {
      if (key === "propertyStrategy") continue;
      if (!Number.isFinite(value)) {
        errors.push("숫자 입력란을 확인해 주세요.");
        return errors;
      }
    }

    if (d.currentAge < 20 || d.currentAge > 100)
      errors.push("현재 나이는 20~100세로 입력해 주세요.");

    if (d.retireAge < d.currentAge || d.retireAge > 105)
      errors.push("은퇴 나이는 현재 나이 이상이어야 합니다.");

    if (d.endAge <= d.retireAge || d.endAge > 110)
      errors.push("종료 나이는 은퇴 나이보다 크고 110세 이하여야 합니다.");

    if (d.monthlyExpense <= 0)
      errors.push("월 생활비는 0보다 커야 합니다.");

    const nonnegative = [
      d.financialAssets, d.propertyValue,
      d.mortgageDebt, d.creditDebt, d.otherDebt,
      d.monthlyDebtPayment, d.nationalPension,
      d.retirementPension, d.privatePension,
      d.reverseMonthly
    ];

    if (nonnegative.some(v => v < 0))
      errors.push("자산·부채·연금·상환액은 음수로 입력할 수 없습니다.");

    if (d.debtRate < 0 || d.debtRate > 30)
      errors.push("대출금리는 0~30%로 입력해 주세요.");

    if (d.nationalStartAge < 50 || d.nationalStartAge > 110)
      errors.push("국민연금 개시 나이를 확인해 주세요.");

    if (
      d.retirementPensionStartAge < 30 ||
      d.retirementPensionStartAge > 110
    ) errors.push("퇴직연금 개시 나이를 확인해 주세요.");

    if (
      d.privateStartAge < 30 ||
      d.privateStartAge > 110 ||
      d.privateEndAge < d.privateStartAge ||
      d.privateEndAge > 110
    ) errors.push("개인연금 개시 및 종료 나이를 확인해 주세요.");

    if (d.inflationRate < 0 || d.inflationRate > .20)
      errors.push("물가상승률은 0~20%로 입력해 주세요.");

    if (d.returnRate < -.30 || d.returnRate > .30)
      errors.push("금융자산 수익률은 -30~30%로 입력해 주세요.");

    if (d.propertyStrategy === "sell") {
      if (d.saleAmount <= 0 || d.saleAmount > d.propertyValue)
        errors.push("매각금액은 0보다 크고 현재 부동산 평가액 이하여야 합니다.");

      if (d.saleCostRate < 0 || d.saleCostRate > 100)
        errors.push("매각비용률은 0~100%로 입력해 주세요.");
    }

    if (d.propertyStrategy === "reverse") {
      if (
        d.reverseStartAge < d.currentAge ||
        d.reverseStartAge > 110 ||
        d.reverseMonthly < 0
      ) errors.push("주택연금 개시 나이와 월 수령액을 확인해 주세요.");
    }

    return errors;
  }

  function simulate(d) {
    const startMonth = Math.round(d.currentAge * 12);
    const retireMonth = Math.round(d.retireAge * 12);
    const endMonth = Math.round(d.endAge * 12);

    const rMonth = Math.pow(1 + d.returnRate, 1 / 12) - 1;
    const iMonth = Math.pow(1 + d.inflationRate, 1 / 12) - 1;
    const debtMonth = Math.pow(1 + d.debtRate / 100, 1 / 12) - 1;

    let assets = d.financialAssets;
    let debt = d.mortgageDebt + d.creditDebt + d.otherDebt;

    const initialDebt = debt;
    const initialNetWorth =
      d.financialAssets + d.propertyValue - initialDebt;

    const saleGross =
      d.propertyStrategy === "sell" ? d.saleAmount : 0;

    const saleCost = saleGross * d.saleCostRate / 100;
    const saleNet = saleGross - saleCost;

    let saleAdded = false;
    let retirementAssets = null;
    let retirementDebt = null;
    let depletionMonth = null;

    let cumulativeWithdrawal = 0;
    let cumulativeUnfunded = 0;
    let cumulativeDebtPaid = 0;
    let cumulativeSaleAdded = 0;

    let firstPension = null;
    let firstGap = null;
    let firstRetirementExpense = 0;

    let bridgeMonths = 0;
    let bridgeWithdrawal = 0;

    const monthly = [];
    const annualMap = new Map();

    for (let month = startMonth; month < endMonth; month++) {
      const age = month / 12;
      const retired = month >= retireMonth;

      // 1. 은퇴 시점에 매각 순유입액을 한 번만 반영
      let saleInflow = 0;

      if (month === retireMonth && !saleAdded) {
        saleInflow = saleNet;
        assets += saleNet;
        cumulativeSaleAdded += saleNet;
        saleAdded = true;
      }

      // 2. 은퇴 시점 자산과 부채는 첫 은퇴월 현금흐름 전 기준
      if (month === retireMonth) {
        retirementAssets = assets;
        retirementDebt = debt;
      }

      // 3. 금융자산 월 운용수익
      assets *= 1 + rMonth;

      // 4. 부채 월 이자
      const interest = debt * debtMonth;
      debt += interest;

      // 5. 현재부터 매월 대출상환액 적용
      const scheduledPayment = Math.min(
        d.monthlyDebtPayment,
        debt
      );

      debt = Math.max(0, debt - scheduledPayment);
      cumulativeDebtPaid += scheduledPayment;

      // 6. 은퇴 전 대출상환은 금융자산에서 지급
      if (!retired && scheduledPayment > 0) {
        const preRetirementPayment = Math.min(
          assets,
          scheduledPayment
        );

        assets -= preRetirementPayment;
      }

      // 7. 은퇴 후 생활비 물가연동
      const expense = retired
        ? d.monthlyExpense *
          Math.pow(1 + iMonth, month - retireMonth)
        : 0;

      // 8. 국민연금: 개시일부터 물가연동
      const nationalMonth = d.nationalStartAge * 12;
      const national = month >= nationalMonth
        ? d.nationalPension *
          Math.pow(1 + iMonth, month - nationalMonth)
        : 0;

      // 9. 퇴직연금: 명목 수령액 유지
      const retirementIncome =
        month >= d.retirementPensionStartAge * 12
          ? d.retirementPension : 0;

      // 10. 개인연금: 명목 수령액 유지
      const privateIncome =
        month >= d.privateStartAge * 12 &&
        month < d.privateEndAge * 12
          ? d.privatePension : 0;

      // 11. 주택연금: 선택 시에만 반영
      const reverseIncome =
        d.propertyStrategy === "reverse" &&
        month >= d.reverseStartAge * 12
          ? d.reverseMonthly : 0;

      const pension =
        national +
        retirementIncome +
        privateIncome +
        reverseIncome;

      // 은퇴 후 대출상환은 생활비와 함께 현금흐름에 포함
      const debtPaymentForCashflow = retired
        ? scheduledPayment : 0;

      const totalOutflow = expense + debtPaymentForCashflow;
      const gap = Math.max(0, totalOutflow - pension);
      const surplus = Math.max(0, pension - totalOutflow);

      const withdrawal = Math.min(assets, gap);
      const unfunded = Math.max(0, gap - withdrawal);

      assets = Math.max(0, assets - withdrawal + surplus);

      cumulativeWithdrawal += withdrawal;
      cumulativeUnfunded += unfunded;

      if (retired && firstPension === null) {
        firstPension = pension;
        firstGap = gap;
        firstRetirementExpense = expense;
      }

      // 연금 공백기간: 은퇴 후 국민연금 개시 전
      if (retired && month < nationalMonth) {
        bridgeMonths++;
        bridgeWithdrawal += withdrawal;
      }

      // 첫 자산 소진 월
      if (
        retired &&
        gap > 0 &&
        assets <= 0 &&
        depletionMonth === null
      ) {
        depletionMonth = month + 1;
      }

      const yearAge = Math.floor(month / 12);

      const row = {
        age: yearAge,
        expense,
        pension,
        gap,
        debtPayment: debtPaymentForCashflow,
        withdrawal,
        unfunded,
        saleInflow,
        endingAssets: assets,
        endingDebt: debt,
        interest
      };

      monthly.push(row);

      if (!annualMap.has(yearAge)) {
        annualMap.set(yearAge, {
          age: yearAge,
          expense: 0,
          pension: 0,
          gap: 0,
          debtPayment: 0,
          withdrawal: 0,
          unfunded: 0,
          saleInflow: 0,
          endingAssets: 0,
          endingDebt: 0,
          months: 0
        });
      }

      const annual = annualMap.get(yearAge);
      annual.expense += expense;
      annual.pension += pension;
      annual.gap += gap;
      annual.debtPayment += debtPaymentForCashflow;
      annual.withdrawal += withdrawal;
      annual.unfunded += unfunded;
      annual.saleInflow += saleInflow;
      annual.endingAssets = assets;
      annual.endingDebt = debt;
      annual.months++;
    }

    const annualRows = [...annualMap.values()]
      .sort((a, b) => a.age - b.age);

    const finalAssets = assets;
    const finalDebt = debt;

    function balanceAtAge(targetAge) {
      const targetMonth = Math.round(targetAge * 12);

      if (targetMonth <= startMonth) return d.financialAssets;
      if (targetMonth >= endMonth) return finalAssets;

      const row = monthly[targetMonth - startMonth - 1];
      return row ? row.endingAssets : retirementAssets;
    }

    function debtAtAge(targetAge) {
      const targetMonth = Math.round(targetAge * 12);

      if (targetMonth <= startMonth) return initialDebt;
      if (targetMonth >= endMonth) return finalDebt;

      const row = monthly[targetMonth - startMonth - 1];
      return row ? row.endingDebt : retirementDebt;
    }

    const propertyAtEnd =
      d.propertyStrategy === "sell" ? 0 : d.propertyValue;

    const finalNetWorth =
      finalAssets + propertyAtEnd - finalDebt;

    return {
      startMonth,
      retireMonth,
      endMonth,
      initialDebt,
      initialNetWorth,
      retirementAssets,
      retirementDebt,
      saleGross,
      saleCost,
      saleNet,
      cumulativeSaleAdded,
      cumulativeWithdrawal,
      cumulativeUnfunded,
      cumulativeDebtPaid,
      finalAssets,
      finalDebt,
      finalNetWorth,
      propertyAtEnd,
      firstPension: firstPension ?? 0,
      firstGap: firstGap ?? 0,
      firstRetirementExpense,
      depletionMonth,
      bridgeMonths,
      bridgeWithdrawal,
      monthly,
      annualRows,
      balanceAtAge,
      debtAtAge
    };
  }

  function addLineChart(canvasId, oldChart, labels, datasets) {
    const canvas = $(canvasId);
    if (!canvas || typeof Chart === "undefined") {
      throw new Error("그래프 라이브러리 또는 그래프 영역을 찾을 수 없습니다.");
    }

    if (oldChart) oldChart.destroy();

    return new Chart(canvas, {
      type: "line",
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: "index" },
        plugins: {
          legend: { position: "bottom" },
          tooltip: {
            callbacks: {
              label: context =>
                `${context.dataset.label}: ${won(context.parsed.y)}만원`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: value => Number(value).toLocaleString("ko-KR")
            }
          },
          x: {
            ticks: { maxTicksLimit: 8 }
          }
        }
      }
    });
  }

  function renderCharts(result) {
    const rows = result.annualRows;
    const labels = rows.map(row => `${row.age}세`);

    assetChart = addLineChart(
      "assetChart",
      assetChart,
      labels,
      [
        {
          label: "금융자산",
          data: rows.map(row => Math.round(row.endingAssets)),
          borderColor: "#4165dc",
          backgroundColor: "rgba(65,101,220,.12)",
          borderWidth: 3,
          fill: true,
          tension: .2,
          pointRadius: 0
        },
        {
          label: "부채",
          data: rows.map(row => Math.round(row.endingDebt)),
          borderColor: "#d68b6d",
          backgroundColor: "rgba(214,139,109,.08)",
          borderWidth: 2,
          fill: false,
          tension: .2,
          pointRadius: 0
        }
      ]
    );

    cashChart = addLineChart(
      "cashChart",
      cashChart,
      labels,
      [
        {
          label: "월평균 부족 생활비",
          data: rows.map(row =>
            row.months ? Math.round(row.gap / row.months) : 0
          ),
          borderColor: "#e19a4c",
          backgroundColor: "rgba(225,154,76,.10)",
          borderWidth: 2,
          fill: false,
          tension: .2,
          pointRadius: 0
        },
        {
          label: "연간 금융자산 인출액",
          data: rows.map(row => Math.round(row.withdrawal)),
          borderColor: "#4165dc",
          backgroundColor: "rgba(65,101,220,.10)",
          borderWidth: 2,
          fill: false,
          tension: .2,
          pointRadius: 0
        }
      ]
    );
  }

  function appendMilestone(container, label, value) {
    const row = document.createElement("div");
    row.className = "milestone-row";

    const name = document.createElement("span");
    name.textContent = label;

    const amount = document.createElement("strong");
    amount.textContent = value;

    row.append(name, amount);
    container.append(row);
  }

  function renderCurrentPosition(d, result) {
    const box = $("currentPosition");
    box.replaceChildren();

    const currentDebt = result.initialDebt;
    const currentNetWorth = result.initialNetWorth;

    [
      ["현재 금융자산", money(d.financialAssets)],
      ["현재 부동산 평가액", money(d.propertyValue)],
      ["현재 총부채", money(currentDebt)],
      ["현재 총자산", money(d.financialAssets + d.propertyValue)],
      ["현재 순자산", money(currentNetWorth)]
    ].forEach(item => appendMilestone(box, ...item));
  }

  function renderMilestones(d, result) {
    const box = $("milestoneList");
    box.replaceChildren();

    const retirementProperty =
      d.propertyStrategy === "sell" ? 0 : d.propertyValue;

    const retirementNetWorth =
      result.retirementAssets +
      retirementProperty -
      result.retirementDebt;

    const rows = [
      ["은퇴 시점 예상 금융자산", money(result.retirementAssets)],
      ["은퇴 시점 예상 부채", money(result.retirementDebt)],
      ["은퇴 시점 순자산", money(retirementNetWorth)],
      ["부동산 매각 순유입액", money(result.saleNet)],
      ["국민연금 개시", `${d.nationalStartAge}세`],
      ["퇴직연금 개시", `${d.retirementPensionStartAge}세`],
      ["개인연금 개시", `${d.privateStartAge}세`],
      ["누적 금융자산 인출액", money(result.cumulativeWithdrawal)],
      ["누적 미충당 생활비", money(result.cumulativeUnfunded)],
      ["누적 대출상환액", money(result.cumulativeDebtPaid)],
      ["90세 잔여 금융자산", money(result.balanceAtAge(90))],
      ["90세 부채 잔액", money(result.debtAtAge(90))],
      ["100세 잔여 금융자산", money(result.balanceAtAge(100))],
      ["100세 부채 잔액", money(result.debtAtAge(100))],
      ["분석 종료 시 금융자산", money(result.finalAssets)],
      ["분석 종료 시 부채", money(result.finalDebt)],
      ["분석 종료 시 순자산", money(result.finalNetWorth)]
    ];

    rows.forEach(item => appendMilestone(box, ...item));
  }

  function renderBridge(d, result) {
    const box = $("bridgeAnalysis");
    box.replaceChildren();

    const nationalStartMonth = d.nationalStartAge * 12;
    const bridgeStartMonth = result.retireMonth;
    const bridgeEndMonth = Math.min(
      nationalStartMonth,
      result.endMonth
    );

    const months = Math.max(0, bridgeEndMonth - bridgeStartMonth);
    const years = months / 12;

    const heading = document.createElement("p");
    heading.innerHTML =
      `<strong>${d.retireAge}세 은퇴 후 국민연금 ${d.nationalStartAge}세 개시까지</strong>`;

    const period = document.createElement("p");
    period.textContent =
      `연금 공백기간은 약 ${years.toFixed(1)}년(${months}개월)입니다.`;

    const withdrawal = document.createElement("p");
    withdrawal.textContent =
      `이 기간에 금융자산에서 인출되는 부족 생활비는 약 ${money(result.bridgeWithdrawal)}입니다.`;

    const note = document.createElement("p");
    note.textContent =
      "공백기간에도 남은 금융자산은 입력한 운용수익률로 월별 운용되는 것으로 가정했습니다. 실제 수익률은 매월 일정하지 않을 수 있습니다.";

    box.append(heading, period, withdrawal, note);
  }

  function renderAdvice(d, result) {
    const box = $("expertAdvice");
    box.replaceChildren();

    const advice = [];

    if (result.bridgeMonths > 0) {
      advice.push([
        "연금 공백기간 관리",
        `은퇴 후 국민연금 개시 전까지 약 ${(result.bridgeMonths / 12).toFixed(1)}년입니다. 이 기간의 생활비와 대출상환액을 별도 현금성 자산으로 준비하고, 투자자산을 급하게 매도하지 않도록 인출 순서를 정하는 것이 좋습니다.`
      ]);
    }

    if (result.firstGap > 0) {
      advice.push([
        "월 부족 생활비 관리",
        `은퇴 첫 달 예상 부족액은 ${money(result.firstGap)}입니다. 연금으로 충당되지 않는 부분은 금융자산 인출로 연결되므로, 월별 인출계획을 정기적으로 점검해야 합니다.`
      ]);
    }

    if (result.finalDebt > 0) {
      advice.push([
        "부채 관리",
        `분석 종료 시 예상 부채가 ${money(result.finalDebt)} 남습니다. 대출금리와 투자수익률을 비교하고, 은퇴 전 상환과 은퇴 후 현금흐름 부담을 함께 검토해야 합니다.`
      ]);
    } else {
      advice.push([
        "부채 관리",
        "입력한 상환액과 금리 가정에서는 분석 종료 전 부채가 상환되는 것으로 계산됩니다. 실제 대출의 상환 방식과 중도상환수수료를 확인하세요."
      ]);
    }

    if (result.depletionMonth !== null) {
      advice.push([
        "자산 소진 위험",
        `금융자산은 약 ${(result.depletionMonth / 12).toFixed(1)}세에 소진되는 것으로 계산됩니다. 생활비 조정, 연금 개시 시점, 은퇴 시점 및 투자위험을 함께 재검토해야 합니다.`
      ]);
    } else {
      advice.push([
        "장기 자산관리",
        "가정한 분석기간에는 금융자산이 소진되지 않습니다. 다만 장기 물가상승, 수익률 하락, 의료비와 간병비 등 예상 밖 지출에 대비한 별도 여유자금이 필요합니다."
      ]);
    }

    if (d.propertyStrategy === "sell") {
      advice.push([
        "부동산 매각자금 활용",
        `매각 순유입액 ${money(result.saleNet)}을 은퇴 시점 금융자산에 반영했습니다. 매각대금은 생활비 계좌와 장기 운용계좌로 나누어 관리하는 방안을 검토할 수 있습니다.`
      ]);
    }

    advice.forEach(([title, body]) => {
      const item = document.createElement("div");
      item.className = "advice-item";

      const strong = document.createElement("strong");
      strong.textContent = title;

      const paragraph = document.createElement("div");
      paragraph.textContent = body;

      item.append(strong, paragraph);
      box.append(item);
    });
  }

  function renderCashflow(result) {
    const body = $("cashflowRows");
    body.replaceChildren();

    result.annualRows.forEach(row => {
      const tr = document.createElement("tr");

      [
        `${row.age}세`,
        won(row.expense),
        won(row.pension),
        won(row.gap),
        won(row.debtPayment),
        won(row.withdrawal),
        won(row.saleInflow),
        won(row.endingAssets),
        won(row.endingDebt)
      ].forEach(value => {
        const td = document.createElement("td");
        td.textContent = value;
        tr.append(td);
      });

      body.append(tr);
    });
  }

  function render(d, result) {
    $("retirementAsset").textContent =
      won(result.retirementAssets);

    $("firstPension").textContent =
      won(result.firstPension);

    $("firstGap").textContent =
      won(result.firstGap);

    $("depletionAge").textContent =
      result.depletionMonth === null
        ? "미소진"
        : `${(result.depletionMonth / 12).toFixed(1)}세`;

    $("depletionNote").textContent =
      result.depletionMonth === null
        ? "분석 기간 내 소진되지 않음"
        : "예상 금융자산 소진 시점";

    renderCurrentPosition(d, result);
    renderMilestones(d, result);
    renderBridge(d, result);
    renderAdvice(d, result);
    renderCashflow(result);
    renderCharts(result);

    $("results").hidden = false;
    lastResult = result;
    window.moneyDocentLastResult = result;

    $("results").scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  function showError(message) {
    $("formError").textContent = message;
    $("formError").scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }

  // 부동산 전략에 따른 입력 영역 표시
  document.querySelectorAll(
    'input[name="propertyStrategy"]'
  ).forEach(radio => {
    radio.addEventListener("change", () => {
      const selected = strategy();
      $("saleFields").hidden = selected !== "sell";
      $("reverseFields").hidden = selected !== "reverse";
    });
  });

  // 부동산 평가액을 매각금액 기본값으로 연결
  // 매각금액을 직접 수정하면 자동 덮어쓰기 중단
  let saleAmountManual = false;

  $("saleAmount").addEventListener("input", () => {
    saleAmountManual = true;
  });

  $("propertyValue").addEventListener("input", () => {
    if (!saleAmountManual) {
      $("saleAmount").value = $("propertyValue").value;
    }
  });

  // 폼 계산
  form.addEventListener("submit", event => {
    event.preventDefault();
    $("formError").textContent = "";

    try {
      const data = readInputs();
      const errors = validate(data);

      if (errors.length) {
        showError(errors[0]);
        return;
      }

      const result = simulate(data);

      const numericResults = [
        result.retirementAssets,
        result.finalAssets,
        result.finalDebt,
        result.cumulativeWithdrawal,
        result.cumulativeUnfunded
      ];

      if (numericResults.some(v => !Number.isFinite(v))) {
        showError("계산 결과에 오류가 발생했습니다. 입력값을 확인해 주세요.");
        return;
      }

      render(data, result);

    } catch (error) {
      console.error(error);
      showError("계산 중 오류가 발생했습니다. 입력값과 페이지 구성을 확인해 주세요.");
    }
  });

  // 첫 화면 초기화
  $("saleFields").hidden = true;
  $("reverseFields").hidden = true;

  console.info("머니도슨트 은퇴설계 계산기 로드 완료");
});
