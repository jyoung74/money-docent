"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const $ = id => document.getElementById(id);
  const form = $("retirementForm");

  if (!form) {
    console.error("retirementForm을 찾을 수 없습니다.");
    return;
  }

  let assetChart = null;
  let lastResult = null;

  const number = (id, fallback = 0) => {
    const el = $(id);
    if (!el) throw new Error(`입력 항목 누락: ${id}`);

    const raw = String(el.value ?? "").replace(/,/g, "").trim();
    if (raw === "") return fallback;

    const value = Number(raw);
    return Number.isFinite(value) ? value : NaN;
  };

  const won = value =>
    Math.round(value).toLocaleString("ko-KR");

  const moneyText = value => `${won(value)}만원`;

  const selectedStrategy = () =>
    document.querySelector('input[name="propertyStrategy"]:checked')?.value || "none";

  function readInputs() {
    return {
      currentAge: number("currentAge"),
      retireAge: number("retireAge"),
      endAge: number("endAge"),
      monthlyExpense: number("monthlyExpense"),

      financialAssets: number("financialAssets"),
      propertyValue: number("propertyValue"),

      mortgageDebt: number("mortgageDebt"),
      creditDebt: number("creditDebt"),
      otherDebt: number("otherDebt"),
      debtRate: number("debtRate"),
      monthlyDebtPayment: number("monthlyDebtPayment"),

      nationalStartAge: number("nationalStartAge"),
      nationalPension: number("nationalPension"),

      retirementPensionStartAge: number("retirementPensionStartAge"),
      retirementPension: number("retirementPension"),

      privateStartAge: number("privateStartAge"),
      privatePension: number("privatePension"),
      privateEndAge: number("privateEndAge"),

      propertyStrategy: selectedStrategy(),
      saleAmount: number("saleAmount"),
      saleCostRate: number("saleCostRate"),

      reverseStartAge: number("reverseStartAge"),
      reverseMonthly: number("reverseMonthly"),

      inflationRate: number("inflationRate") / 100,
      returnRate: number("returnRate") / 100
    };
  }

  function validate(d) {
    const errors = [];

    const requiredNumbers = Object.entries(d).filter(
      ([key]) => ![
        "propertyStrategy",
        "inflationRate",
        "returnRate"
      ].includes(key)
    );

    for (const [key, value] of requiredNumbers) {
      if (!Number.isFinite(value)) {
        errors.push(`${key}: 숫자를 확인해 주세요.`);
      }
    }

    if (errors.length) return errors;

    if (d.currentAge < 20 || d.currentAge > 100) {
      errors.push("현재 나이는 20~100세로 입력해 주세요.");
    }

    if (
      d.retireAge < d.currentAge ||
      d.retireAge > 105
    ) {
      errors.push("은퇴 나이는 현재 나이 이상, 105세 이하로 입력해 주세요.");
    }

    if (
      d.endAge <= d.retireAge ||
      d.endAge > 110
    ) {
      errors.push("종료 나이는 은퇴 나이보다 크고 110세 이하여야 합니다.");
    }

    if (d.monthlyExpense <= 0) {
      errors.push("월 생활비는 0보다 커야 합니다.");
    }

    const nonnegative = [
      ["금융자산", d.financialAssets],
      ["부동산 평가액", d.propertyValue],
      ["주택담보대출", d.mortgageDebt],
      ["신용대출", d.creditDebt],
      ["기타 부채", d.otherDebt],
      ["대출 상환액", d.monthlyDebtPayment],
      ["국민연금", d.nationalPension],
      ["퇴직연금", d.retirementPension],
      ["개인연금", d.privatePension]
    ];

    nonnegative.forEach(([name, value]) => {
      if (value < 0) errors.push(`${name}은 음수일 수 없습니다.`);
    });

    if (d.debtRate < 0 || d.debtRate > 30) {
      errors.push("대출 금리는 0~30%로 입력해 주세요.");
    }

    if (
      d.nationalStartAge < 50 ||
      d.nationalStartAge > 110
    ) {
      errors.push("국민연금 개시 나이를 확인해 주세요.");
    }

    if (
      d.retirementPensionStartAge < 30 ||
      d.retirementPensionStartAge > 110
    ) {
      errors.push("퇴직연금 개시 나이를 확인해 주세요.");
    }

    if (
      d.privateStartAge < 30 ||
      d.privateStartAge > 110 ||
      d.privateEndAge < d.privateStartAge ||
      d.privateEndAge > 110
    ) {
      errors.push("개인연금 개시 및 종료 나이를 확인해 주세요.");
    }

    if (d.inflationRate < 0 || d.inflationRate > 0.20) {
      errors.push("물가상승률은 0~20%로 입력해 주세요.");
    }

    if (d.returnRate < -0.30 || d.returnRate > 0.30) {
      errors.push("수익률은 -30~30%로 입력해 주세요.");
    }

    if (d.propertyStrategy === "sell") {
      if (
        d.saleAmount < 0 ||
        d.saleAmount > d.propertyValue
      ) {
        errors.push("매각금액은 0 이상 부동산 평가액 이하로 입력해 주세요.");
      }

      if (d.saleCostRate < 0 || d.saleCostRate > 100) {
        errors.push("매각비용률은 0~100%로 입력해 주세요.");
      }
    }

    if (d.propertyStrategy === "reverse") {
      if (
        d.reverseStartAge < 30 ||
        d.reverseStartAge > 110 ||
        d.reverseMonthly < 0
      ) {
        errors.push("주택연금 개시 나이와 월 수령액을 확인해 주세요.");
      }
    }

    return errors;
  }

  function simulate(d) {
    const monthRate =
      Math.pow(1 + d.returnRate, 1 / 12) - 1;

    const inflationMonthRate =
      Math.pow(1 + d.inflationRate, 1 / 12) - 1;

    const debtMonthRate =
      Math.pow(1 + d.debtRate / 100, 1 / 12) - 1;

    const startMonth = d.currentAge * 12;
    const retirementMonth = d.retireAge * 12;
    const endMonth = d.endAge * 12;

    let assets = d.financialAssets;
    let debt = d.mortgageDebt + d.creditDebt + d.otherDebt;

    const initialDebt = debt;

    const grossSale =
      d.propertyStrategy === "sell" ? d.saleAmount : 0;

    const saleCost =
      grossSale * d.saleCostRate / 100;

    const saleProceeds = grossSale - saleCost;

    let saleApplied = false;
    let retirementAssets = null;
    let depletionMonth = null;

    let cumulativeWithdrawal = 0;
    let cumulativeUnfunded = 0;
    let cumulativeDebtPaid = 0;

    let firstPension = 0;
    let firstGap = 0;

    const annual = new Map();
    const monthly = [];

    function addAnnual(year, data) {
      if (!annual.has(year)) {
        annual.set(year, {
          age: year,
          expense: 0,
          pension: 0,
          debtPayment: 0,
          withdrawal: 0,
          unfunded: 0,
          endingAssets: 0,
          endingDebt: 0
        });
      }

      const row = annual.get(year);
      row.expense += data.expense;
      row.pension += data.pension;
      row.debtPayment += data.debtPayment;
      row.withdrawal += data.withdrawal;
      row.unfunded += data.unfunded;
      row.endingAssets = data.endingAssets;
      row.endingDebt = data.endingDebt;
    }

    for (let month = startMonth; month < endMonth; month++) {
      const age = month / 12;

      // 은퇴 첫 달 시작 시 매각 순유입액을 한 번만 반영
      if (
        month === retirementMonth &&
        !saleApplied
      ) {
        assets += saleProceeds;
        saleApplied = true;
      }

      // 은퇴 시작 시점의 금융자산: 첫 은퇴월 수익·지출 전
      if (month === retirementMonth) {
        retirementAssets = assets;
      }

      // 월초 금융자산 운용수익
      assets *= (1 + monthRate);

      const retired = month >= retirementMonth;

      // 생활비: 은퇴 시점부터 물가상승률 반영
      let expense = retired
        ? d.monthlyExpense *
          Math.pow(1 + inflationMonthRate, month - retirementMonth)
        : 0;

      // 국민연금: 개시 이후 물가연동
      let national = 0;
      const nationalMonth = d.nationalStartAge * 12;

      if (month >= nationalMonth) {
        national =
          d.nationalPension *
          Math.pow(1 + inflationMonthRate, month - nationalMonth);
      }

      // 퇴직연금: 입력한 명목 월 수령액
      const retirementIncome =
        month >= d.retirementPensionStartAge * 12
          ? d.retirementPension
          : 0;

      // 개인연금: 입력한 명목 월 수령액, 종료 나이 전까지
      const privateIncome =
        month >= d.privateStartAge * 12 &&
        month < d.privateEndAge * 12
          ? d.privatePension
          : 0;

      // 주택연금: 선택한 경우만 반영
      const reverseIncome =
        d.propertyStrategy === "reverse" &&
        month >= d.reverseStartAge * 12
          ? d.reverseMonthly
          : 0;

      const pension =
        national +
        retirementIncome +
        privateIncome +
        reverseIncome;

      // 대출 이자 및 원금 상환
      const debtInterest = debt * debtMonthRate;

      let debtPayment = 0;

      if (retired && debt > 0 && d.monthlyDebtPayment > 0) {
        debtPayment = Math.min(
          d.monthlyDebtPayment,
          debt + debtInterest
        );
      }

      // 부채 잔액 갱신: 이자 발생 후 상환액 차감
      if (debt > 0) {
        debt = Math.max(
          0,
          debt + debtInterest - debtPayment
        );
      }

      cumulativeDebtPaid += debtPayment;

      const totalExpense = expense + debtPayment;
      const gap = Math.max(0, totalExpense - pension);
      const surplus = Math.max(0, pension - totalExpense);

      const availableAssets = Math.max(0, assets);

      const withdrawal = Math.min(gap, availableAssets);
      const unfunded = Math.max(0, gap - withdrawal);

      assets = Math.max(
        0,
        availableAssets - withdrawal + surplus
      );

      cumulativeWithdrawal += withdrawal;
      cumulativeUnfunded += unfunded;

      if (
        retired &&
        firstPension === 0 &&
        month === retirementMonth
      ) {
        firstPension = pension;
        firstGap = gap;
      }

      // 첫 자산 소진 월 기록
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
        debtPayment,
        withdrawal,
        unfunded,
        endingAssets: assets,
        endingDebt: debt
      };

      monthly.push(row);
      addAnnual(yearAge, row);
    }

    const annualRows = [...annual.values()].sort(
      (a, b) => a.age - b.age
    );

    const finalAssets = assets;
    const finalDebt = debt;

    const netWorthAtRetirement =
      retirementAssets - (
        d.propertyStrategy === "sell"
          ? initialDebt
          : initialDebt
      );

    function balanceAtAge(targetAge) {
      if (targetAge <= d.retireAge) {
        const months = Math.max(
          0,
          targetAge * 12 - startMonth
        );

        return d.financialAssets *
          Math.pow(1 + monthRate, months);
      }

      if (targetAge >= d.endAge) {
        return finalAssets;
      }

      const row = [...monthly].reverse().find(
        item => item.age < targetAge
      );

      return row ? row.endingAssets : retirementAssets;
    }

    function debtAtAge(targetAge) {
      if (targetAge <= d.retireAge) return initialDebt;

      if (targetAge >= d.endAge) return finalDebt;

      const row = [...monthly].reverse().find(
        item => item.age < targetAge
      );

      return row ? row.endingDebt : initialDebt;
    }

    return {
      retirementAssets,
      saleProceeds,
      saleCost,
      firstPension,
      firstGap,
      cumulativeWithdrawal,
      cumulativeUnfunded,
      cumulativeDebtPaid,
      finalAssets,
      finalDebt,
      initialDebt,
      netWorthAtRetirement,
      depletionMonth,
      annualRows,
      monthly,
      balanceAtAge,
      debtAtAge
    };
  }

  function renderChart(d, result) {
    const canvas = $("assetChart");

    if (!canvas || typeof Chart === "undefined") {
      console.error("Chart.js 또는 그래프 영역을 찾을 수 없습니다.");
      return;
    }

    const labels = result.annualRows.map(row => `${row.age}세`);
    const assetData = result.annualRows.map(row => Math.round(row.endingAssets));
    const debtData = result.annualRows.map(row => Math.round(row.endingDebt));

    if (assetChart) {
      assetChart.destroy();
      assetChart = null;
    }

    assetChart = new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "금융자산",
            data: assetData,
            borderColor: "#4165dc",
            backgroundColor: "rgba(65,101,220,.12)",
            borderWidth: 3,
            fill: true,
            tension: 0.25,
            pointRadius: 0,
            pointHitRadius: 12
          },
          {
            label: "부채",
            data: debtData,
            borderColor: "#e18b62",
            backgroundColor: "rgba(225,139,98,.08)",
            borderWidth: 2,
            fill: false,
            tension: 0.2,
            pointRadius: 0,
            pointHitRadius: 12
          }
        ]
      },
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
              callback: value => Number(value).toLocaleString("ko-KR")
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

  function renderMilestones(d, result) {
    const list = $("milestoneList");
    const items = [
      ["은퇴 시점 예상 금융자산", moneyText(result.retirementAssets)],
      ["은퇴 시점 예상 부채", moneyText(result.initialDebt)],
      ["은퇴 시점 순자산(금융자산 기준)", moneyText(result.netWorthAtRetirement)],
      ["부동산 매각 순유입액", moneyText(result.saleProceeds)],
      ["국민연금 개시", `${d.nationalStartAge}세`],
      ["퇴직연금 개시", `${d.retirementPensionStartAge}세`],
      ["개인연금 개시", `${d.privateStartAge}세`],
      ["누적 금융자산 인출액", moneyText(result.cumulativeWithdrawal)],
      ["누적 미충당 생활비", moneyText(result.cumulativeUnfunded)],
      ["누적 대출상환액", moneyText(result.cumulativeDebtPaid)],
      ["90세 잔여 금융자산", moneyText(result.balanceAtAge(90))],
      ["100세 잔여 금융자산", moneyText(result.balanceAtAge(100))],
      ["분석 종료 시 금융자산", moneyText(result.finalAssets)],
      ["분석 종료 시 부채", moneyText(result.finalDebt)]
    ];

    if (d.propertyStrategy === "reverse") {
      items.push([
        "주택연금 월 수령액",
        moneyText(d.reverseMonthly)
      ]);
    }

    list.replaceChildren();

    items.forEach(([label, value]) => {
      const row = document.createElement("div");
      row.className = "milestone-row";

      const name = document.createElement("span");
      name.textContent = label;

      const amount = document.createElement("strong");
      amount.textContent = value;

      row.append(name, amount);
      list.append(row);
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
        won(row.debtPayment),
        won(row.withdrawal),
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

    renderChart(d, result);
    renderMilestones(d, result);
    renderCashflow(result);

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

  // 매각·주택연금 입력 영역 표시
  document.querySelectorAll(
    'input[name="propertyStrategy"]'
  ).forEach(radio => {
    radio.addEventListener("change", () => {
      const strategy = selectedStrategy();

      $("saleFields").hidden = strategy !== "sell";
      $("reverseFields").hidden = strategy !== "reverse";
    });
  });

  // 부동산 평가액이 바뀌면 매각금액을 자동 갱신
  // 단, 사용자가 매각금액을 직접 수정한 경우에는 덮어쓰지 않음
  let saleAmountManuallyChanged = false;

  $("saleAmount").addEventListener("input", () => {
    saleAmountManuallyChanged = true;
  });

  $("propertyValue").addEventListener("input", () => {
    if (!saleAmountManuallyChanged) {
      $("saleAmount").value = $("propertyValue").value;
    }
  });

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

      if (
        !Number.isFinite(result.finalAssets) ||
        !Number.isFinite(result.retirementAssets)
      ) {
        showError("계산 결과가 유효하지 않습니다. 입력값을 확인해 주세요.");
        return;
      }

      render(data, result);

    } catch (error) {
      console.error(error);
      showError("계산 중 오류가 발생했습니다. 입력 항목과 페이지 연결을 확인해 주세요.");
    }
  });

  // 최초 화면의 부동산 선택 영역 초기화
  $("saleFields").hidden = true;
  $("reverseFields").hidden = true;

  // 첫 진입 시 자동 계산하지 않음
  // 사용자가 입력을 확인한 뒤 계산 버튼을 누르도록 함
  console.info("머니도슨트 은퇴설계 계산기 준비 완료");
});
