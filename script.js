
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

  const won = value =>
    Math.round(value).toLocaleString("ko-KR");

  const money = value => `${won(value)}만원`;

  function num(id) {
    const el = $(id);
    if (!el) throw new Error(`입력 항목 누락: ${id}`);

    const raw = String(el.value ?? "").replace(/,/g, "").trim();
    if (raw === "") return 0;

    const value = Number(raw);
    return Number.isFinite(value) ? value : NaN;
  }

  function strategy() {
    return document.querySelector(
      'input[name="propertyStrategy"]:checked'
    )?.value || "none";
  }

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
      d.financialAssets,
      d.propertyValue,
      d.mortgageDebt,
      d.creditDebt,
      d.otherDebt,
      d.monthlyDebtPayment,
      d.nationalPension,
      d.retirementPension,
      d.privatePension,
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

    if (d.inflationRate < 0 || d.inflationRate > 0.20)
      errors.push("물가상승률은 0~20%로 입력해 주세요.");

    if (d.returnRate < -0.30 || d.returnRate > 0.30)
      errors.push("금융자산 수익률은 -30~30%로 입력해 주세요.");

    if (d.propertyStrategy === "sell") {
      if (d.saleAmount <= 0 || d.saleAmount > d.propertyValue)
        errors.push("매각금액은 0보다 크고 부동산 평가액 이하여야 합니다.");

      if (d.saleCostRate < 0 || d.saleCostRate > 100)
        errors.push("매각비용률은 0~100%로 입력해 주세요.");
    }

    if (d.propertyStrategy === "reverse") {
      if (
        d.reverseStartAge < d.currentAge ||
        d.reverseStartAge > 110
      ) errors.push("주택연금 개시 나이를 확인해 주세요.");
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
    let cumulativeUnpaidDebt = 0;

    let firstPension = null;
    let firstGap = null;

    let bridgeMonths = 0;
    let bridgeWithdrawal = 0;

    const monthly = [];
    const annualMap = new Map();

    function addAnnual(monthAge) {
      if (!annualMap.has(monthAge)) {
        annualMap.set(monthAge, {
          age: monthAge,
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
      return annualMap.get(monthAge);
    }

    for (let month = startMonth; month < endMonth; month++) {
      const age = month / 12;
      const retired = month >= retireMonth;

      // 은퇴 시 부동산 매각대금을 한 번만 반영
      let saleInflow = 0;

      if (month === retireMonth && !saleAdded) {
        saleInflow = saleNet;
        assets += saleNet;
        saleAdded = true;
      }

      // 은퇴 시점 자산·부채 기록
      if (month === retireMonth) {
        retirementAssets = assets;
        retirementDebt = debt;
      }

      // 금융자산 월 운용수익
      assets *= 1 + rMonth;

      // 부채 월 이자 발생
      debt *= 1 + debtMonth;

      // 월 대출상환 예정액
      const scheduledPayment = Math.min(
        d.monthlyDebtPayment,
        debt
      );

      let actualDebtPayment = 0;
      let withdrawal = 0;
      let unfunded = 0;
      let gap = 0;
      let pension = 0;
      let expense = 0;

      // 연금 계산
      const nationalMonth = d.nationalStartAge * 12;

      const national =
        month >= nationalMonth
          ? d.nationalPension *
            Math.pow(1 + iMonth, month - nationalMonth)
          : 0;

      const retirementIncome =
        month >= d.retirementPensionStartAge * 12
          ? d.retirementPension
          : 0;

      const privateIncome =
        month >= d.privateStartAge * 12 &&
        month < d.privateEndAge * 12
          ? d.privatePension
          : 0;

      const reverseIncome =
        d.propertyStrategy === "reverse" &&
        month >= d.reverseStartAge * 12
          ? d.reverseMonthly
          : 0;

      pension =
        national +
        retirementIncome +
        privateIncome +
        reverseIncome;

      if (!retired) {
        // 은퇴 전에는 근로소득에서 대출상환
        actualDebtPayment = scheduledPayment;
        debt = Math.max(0, debt - actualDebtPayment);

        cumulativeDebtPaid += actualDebtPayment;

      } else {
        // 은퇴 후 생활비 물가연동
        expense =
          d.monthlyExpense *
          Math.pow(1 + iMonth, month - retireMonth);

        // 생활비를 먼저 충당
        const availableForLiving = assets + pension;

        const livingPaid = Math.min(
          expense,
          availableForLiving
        );

        const livingUnfunded = Math.max(
          0,
          expense - livingPaid
        );

        let remaining = Math.max(
          0,
          availableForLiving - livingPaid
        );

        // 생활비 이후 남은 자금으로 대출상환
        actualDebtPayment = Math.min(
          scheduledPayment,
          remaining
        );

        remaining -= actualDebtPayment;

        debt = Math.max(0, debt - actualDebtPayment);
        assets = remaining;

        gap = Math.max(
          0,
          expense + scheduledPayment - pension
        );

        withdrawal = Math.min(
          Math.max(0, assets + livingPaid - pension),
          Math.max(0, gap)
        );

        // 생활비 부족분 중 금융자산으로 충당하지 못한 부분
        unfunded = livingUnfunded;

        // 연금과 금융자산으로 상환하지 못한 대출은 부채로 남음
        const unpaidDebt = Math.max(
          0,
          scheduledPayment - actualDebtPayment
        );

        cumulativeUnpaidDebt += unpaidDebt;
        cumulativeDebtPaid += actualDebtPayment;

        cumulativeWithdrawal += withdrawal;
        cumulativeUnfunded += unfunded;

        if (firstPension === null) {
          firstPension = pension;
          firstGap = Math.max(0, expense - pension);
        }

        // 국민연금 개시 전 공백기간
        if (month < nationalMonth) {
          bridgeMonths++;
          bridgeWithdrawal += withdrawal;
        }

        if (
          gap > 0 &&
          assets <= 0 &&
          depletionMonth === null
        ) {
          depletionMonth = month + 1;
        }
      }

      const yearAge = Math.floor(month / 12);

      const row = {
        age: yearAge,
        expense,
        pension,
        gap,
        debtPayment: actualDebtPayment,
        withdrawal,
        unfunded,
        saleInflow,
        endingAssets: assets,
        endingDebt: debt
      };

      monthly.push(row);

      const annual = addAnnual(yearAge);

      annual.expense += expense;
      annual.pension += pension;
      annual.gap += gap;
      annual.debtPayment += actualDebtPayment;
      annual.withdrawal += withdrawal;
      annual.unfunded += unfunded;
      annual.saleInflow += saleInflow;
      annual.endingAssets = assets;
      annual.endingDebt = debt;
      annual.months++;
    }

    const finalAssets = assets;
    const finalDebt = debt;

    // 종료 나이의 경계 시점 잔액을 별도 행으로 추가
    const endSnapshot = {
      age: d.endAge,
      expense: 0,
      pension: 0,
      gap: 0,
      debtPayment: 0,
      withdrawal: 0,
      unfunded: 0,
      saleInflow: 0,
      endingAssets: finalAssets,
      endingDebt: finalDebt,
      months: 0
    };

    const annualRows = [...annualMap.values()]
      .sort((a, b) => a.age - b.age);

    annualRows.push(endSnapshot);

    function balanceAtAge(targetAge) {
      const targetMonth = Math.round(targetAge * 12);

      if (targetMonth <= startMonth) {
        return d.financialAssets;
      }

      if (targetMonth >= endMonth) {
        return finalAssets;
      }

      const index = targetMonth - startMonth - 1;
      const row = monthly[index];

      return row ? row.endingAssets : d.financialAssets;
    }

    function debtAtAge(targetAge) {
      const targetMonth = Math.round(targetAge * 12);

      if (targetMonth <= startMonth) {
        return initialDebt;
      }

      if (targetMonth >= endMonth) {
        return finalDebt;
      }

      const index = targetMonth - startMonth - 1;
      const row = monthly[index];

      return row ? row.endingDebt : initialDebt;
    }

    const propertyAtEnd =
      d.propertyStrategy === "sell" ? 0 : d.propertyValue;

    const finalNetWorth =
      finalAssets + propertyAtEnd - finalDebt;

    const retirementProperty =
      d.propertyStrategy === "sell" ? 0 : d.propertyValue;

    const retirementNetWorth =
      (retirementAssets ?? assets) +
      retirementProperty -
      (retirementDebt ?? debt);

    return {
      initialDebt,
      initialNetWorth,
      retirementAssets: retirementAssets ?? assets,
      retirementDebt: retirementDebt ?? debt,
      retirementNetWorth,
      saleGross,
      saleCost,
      saleNet,
      cumulativeWithdrawal,
      cumulativeUnfunded,
      cumulativeDebtPaid,
      cumulativeUnpaidDebt,
      finalAssets,
      finalDebt,
      finalNetWorth,
      propertyAtEnd,
      firstPension: firstPension ?? 0,
      firstGap: firstGap ?? 0,
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
        interaction: {
          intersect: false,
          mode: "index"
        },
        plugins: {
          legend: {
            position: "bottom"
          },
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
              callback: value =>
                Number(value).toLocaleString("ko-KR")
            }
          },
          x: {
            ticks: {
              maxTicksLimit: 8
            }
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
            row.months
              ? Math.round(row.gap / row.months)
              : 0
          ),
          borderColor: "#e19a4c",
          borderWidth: 3,
          fill: false,
          tension: .2,
          pointRadius: 0
        },
        {
          label: "월평균 금융자산 인출액",
          data: rows.map(row =>
            row.months
              ? Math.round(row.withdrawal / row.months)
              : 0
          ),
          borderColor: "#4165dc",
          borderWidth: 3,
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

    [
      ["현재 금융자산", money(d.financialAssets)],
      ["현재 부동산 평가액", money(d.propertyValue)],
      ["현재 총부채", money(result.initialDebt)],
      ["현재 총자산", money(d.financialAssets + d.propertyValue)],
      ["현재 순자산", money(result.initialNetWorth)]
    ].forEach(item => appendMilestone(box, ...item));
  }

  function renderMilestones(d, result) {
    const box = $("milestoneList");
    box.replaceChildren();

    [
      ["은퇴 시점 예상 금융자산", money(result.retirementAssets)],
      ["은퇴 시점 예상 부채", money(result.retirementDebt)],
      ["은퇴 시점 순자산", money(result.retirementNetWorth)],
      ["부동산 매각 순유입액", money(result.saleNet)],
      ["국민연금 개시", `${d.nationalStartAge}세`],
      ["퇴직연금 개시", `${d.retirementPensionStartAge}세`],
      ["개인연금 개시", `${d.privateStartAge}세`],
      ["누적 금융자산 인출액", money(result.cumulativeWithdrawal)],
      ["누적 미충당 생활비", money(result.cumulativeUnfunded)],
      ["누적 대출상환액", money(result.cumulativeDebtPaid)],
      ["누적 미납 대출상환액", money(result.cumulativeUnpaidDebt)],
      ["90세 잔여 금융자산", money(result.balanceAtAge(90))],
      ["90세 부채 잔액", money(result.debtAtAge(90))],
      ["100세 잔여 금융자산", money(result.balanceAtAge(100))],
      ["100세 부채 잔액", money(result.debtAtAge(100))],
      ["분석 종료 시 금융자산", money(result.finalAssets)],
      ["분석 종료 시 부채", money(result.finalDebt)],
      ["분석 종료 시 순자산", money(result.finalNetWorth)]
    ].forEach(item => appendMilestone(box, ...item));
  }

  function renderBridge(d, result) {
    const box = $("bridgeAnalysis");
    box.replaceChildren();

    const start = d.retireAge;
    const end = Math.min(d.nationalStartAge, d.endAge);
    const months = Math.max(0, Math.round((end - start) * 12));

    const items = [
      `<strong>${start}세 은퇴 후 국민연금 ${d.nationalStartAge}세 개시까지</strong>`,
      `국민연금 개시 전 공백기간은 약 ${(months / 12).toFixed(1)}년(${months}개월)입니다.`,
      `이 기간의 금융자산 인출액은 약 ${money(result.bridgeWithdrawal)}입니다.`,
      "남은 금융자산은 입력한 운용수익률로 매월 운용되는 것으로 가정합니다.",
      "공백기간에는 생활비를 위한 현금성 자산과 장기 운용자산을 구분해 관리하는 방안을 검토하세요."
    ];

    items.forEach((text, index) => {
      const p = document.createElement("p");
      if (index === 0) {
        p.innerHTML = text;
      } else {
        p.textContent = text;
      }
      box.append(p);
    });
  }

  function renderAdvice(d, result) {
    const box = $("expertAdvice");
    box.replaceChildren();

    const advice = [];

    advice.push([
      "연금 공백기간 관리",
      `은퇴 후 국민연금 개시 전까지 약 ${(result.bridgeMonths / 12).toFixed(1)}년입니다. 이 기간의 생활비를 별도로 준비하고 투자자산의 급격한 매도를 피할 수 있도록 인출 순서를 계획하는 것이 좋습니다.`
    ]);

    advice.push([
      "월 부족 생활비 관리",
      `은퇴 첫 달 예상 부족 생활비는 ${money(result.firstGap)}입니다. 연금으로 충당되지 않는 금액은 금융자산에서 인출됩니다.`
    ]);

    if (result.finalDebt > 0) {
      advice.push([
        "부채 관리",
        `분석 종료 시 예상 부채는 ${money(result.finalDebt)}입니다. 은퇴 후 대출상환액이 생활비와 함께 자산을 줄이므로 금리와 상환기간을 점검해야 합니다.`
      ]);
    }

    if (result.cumulativeUnpaidDebt > 0) {
      advice.push([
        "대출상환 부족 주의",
        `분석기간 중 상환하지 못한 대출 예정액이 누적 ${money(result.cumulativeUnpaidDebt)}입니다. 실제 대출 연체나 만기 조건을 별도로 확인해야 합니다.`
      ]);
    }

    if (result.depletionMonth !== null) {
      advice.push([
        "금융자산 소진 위험",
        "금융자산이 분석기간 중 소진되는 것으로 계산됩니다. 은퇴시점, 생활비, 연금개시 시점 및 투자수익률을 조정한 시나리오를 비교해 보세요."
      ]);
    } else {
      advice.push([
        "장기 자산관리",
        "입력한 가정에서는 분석기간 내 금융자산이 소진되지 않습니다. 다만 의료비, 간병비, 물가 및 투자수익 변동에 대비한 여유자금을 별도로 고려해야 합니다."
      ]);
    }

    if (d.propertyStrategy === "sell") {
      advice.push([
        "부동산 매각자금 활용",
        `부동산 매각 순유입액 ${money(result.saleNet)}을 은퇴 시점 금융자산에 반영했습니다. 매각대금은 단기 생활비와 장기 운용자산으로 나누어 관리하는 방안을 검토할 수 있습니다.`
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

    window.moneyDocentLastResult = result;
    window.moneyDocentLastInputs = d;

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

  // 부동산 선택에 따른 입력란 표시
  document.querySelectorAll(
    'input[name="propertyStrategy"]'
  ).forEach(radio => {
    radio.addEventListener("change", () => {
      const selected = strategy();

      $("saleFields").hidden = selected !== "sell";
      $("reverseFields").hidden = selected !== "reverse";
    });
  });

  // 매각금액 자동 연동
  let saleAmountManual = false;

  $("saleAmount").addEventListener("input", () => {
    saleAmountManual = true;
  });

  $("propertyValue").addEventListener("input", () => {
    if (!saleAmountManual) {
      $("saleAmount").value = $("propertyValue").value;
    }
  });

  // 계산 실행
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

      const values = [
        result.retirementAssets,
        result.retirementDebt,
        result.finalAssets,
        result.finalDebt,
        result.cumulativeWithdrawal,
        result.cumulativeUnfunded
      ];

      if (values.some(value => !Number.isFinite(value))) {
        showError("계산 결과에 오류가 발생했습니다. 입력값을 확인해 주세요.");
        return;
      }

      render(data, result);

    } catch (error) {
      console.error(error);
      showError(
        "계산 중 오류가 발생했습니다. 입력값과 페이지 구성을 확인해 주세요."
      );
    }
  });

  // 초기 입력 영역
  $("saleFields").hidden = true;
  $("reverseFields").hidden = true;

  console.info("머니도슨트 은퇴설계 계산엔진 로드 완료");
});
