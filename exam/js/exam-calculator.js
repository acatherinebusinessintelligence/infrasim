(function calculatorModule(global) {
  class CalculatorEngine {
    constructor() {
      this.clear();
    }

    clear() {
      this.display = "0";
      this.left = null;
      this.operator = null;
      this.waitingForRight = false;
      this.error = false;
      return this.display;
    }

    press(key) {
      if (key === "C") return this.clear();
      if (key === "backspace") return this.backspace();
      if (key === "=" || key === "Enter") return this.equals();
      if (key === "%") return this.percent();
      if (["+", "-", "*", "/"].includes(key)) return this.setOperator(key);
      if (key === "," || key === ".") return this.decimal();
      if (/^[0-9]$/.test(key)) return this.digit(key);
      return this.display;
    }

    digit(value) {
      if (this.error || this.waitingForRight) {
        this.display = value;
        this.waitingForRight = false;
        this.error = false;
        return this.display;
      }
      this.display = this.display === "0" ? value : `${this.display}${value}`;
      return this.display;
    }

    decimal() {
      if (this.error || this.waitingForRight) {
        this.display = "0.";
        this.waitingForRight = false;
        this.error = false;
        return this.display;
      }
      if (!this.display.includes(".")) this.display += ".";
      return this.display;
    }

    backspace() {
      if (this.error) return this.clear();
      if (this.waitingForRight) return this.display;
      this.display = this.display.length > 1 ? this.display.slice(0, -1) : "0";
      return this.display;
    }

    percent() {
      if (this.error) return this.clear();
      this.display = formatNumber(readNumber(this.display) / 100);
      return this.display;
    }

    setOperator(operator) {
      if (this.error) this.clear();
      if (this.operator && !this.waitingForRight) {
        const result = operate(this.left, readNumber(this.display), this.operator);
        if (result === null) return this.showError();
        this.left = result;
        this.display = formatNumber(result);
      } else {
        this.left = readNumber(this.display);
      }
      this.operator = operator;
      this.waitingForRight = true;
      return this.display;
    }

    equals() {
      if (this.error) return this.clear();
      if (!this.operator || this.left === null || this.waitingForRight) return this.display;
      const result = operate(this.left, readNumber(this.display), this.operator);
      if (result === null) return this.showError();
      this.display = formatNumber(result);
      this.left = null;
      this.operator = null;
      this.waitingForRight = true;
      return this.display;
    }

    showError() {
      this.display = "Error";
      this.left = null;
      this.operator = null;
      this.waitingForRight = true;
      this.error = true;
      return this.display;
    }
  }

  function operate(left, right, operator) {
    if (operator === "+") return left + right;
    if (operator === "-") return left - right;
    if (operator === "*") return left * right;
    if (operator === "/") return right === 0 ? null : left / right;
    return right;
  }

  function readNumber(value) {
    const parsed = Number(String(value).replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatNumber(value) {
    if (!Number.isFinite(value)) return "Error";
    const rounded = Math.round((value + Number.EPSILON) * 10000000000) / 10000000000;
    return String(rounded);
  }

  function installCalculator() {
    const openButton = document.getElementById("openCalculator");
    if (!openButton) return null;
    if (openButton.dataset.calculatorInstalled === "true") return null;
    const panel = document.getElementById("examCalculator");
    const closeButton = document.getElementById("closeCalculator");
    const display = document.getElementById("calculatorDisplay");
    if (!panel || !closeButton || !display) return null;
    openButton.dataset.calculatorInstalled = "true";

    const engine = new CalculatorEngine();

    function render() {
      display.textContent = engine.display;
    }

    function open() {
      panel.hidden = false;
      panel.setAttribute("tabindex", "-1");
      panel.focus();
      render();
    }

    function close() {
      panel.hidden = true;
      openButton.focus();
    }

    openButton.addEventListener("click", open);
    closeButton.addEventListener("click", close);
    panel.querySelectorAll("[data-calc-key]").forEach((button) => {
      button.addEventListener("click", () => {
        engine.press(button.dataset.calcKey);
        render();
      });
    });

    document.addEventListener("keydown", (event) => {
      if (panel.hidden || !panel.contains(document.activeElement)) return;
      const key = normalizeKeyboardKey(event);
      if (!key) return;
      event.preventDefault();
      if (key === "Escape") {
        close();
        return;
      }
      engine.press(key);
      render();
    });

    return {engine, open, close};
  }

  function normalizeKeyboardKey(event) {
    const key = event.key;
    if (/^[0-9]$/.test(key)) return key;
    if (["+", "-", "*", "/", ".", ",", "%"].includes(key)) return key;
    if (key === "Enter") return "=";
    if (key === "Backspace") return "backspace";
    if (key === "Escape") return "Escape";
    return null;
  }

  const api = {CalculatorEngine, formatNumber, installCalculator};
  global.ExamCalculator = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
