(function (root) {
  "use strict";

  if (typeof root.structuredClone !== "function") {
    root.structuredClone = function (value) {
      if (typeof value === "undefined") return undefined;
      return JSON.parse(JSON.stringify(value));
    };
  }

  var bootStarted = false;
  var failureShown = false;

  function showStartupFailure(detail) {
    if (failureShown) return;
    failureShown = true;

    var pill = document.getElementById("sessionPill");
    var app = document.getElementById("app");
    var message = "页面未能正常载入。请确认 static 文件夹完整，并使用 Chrome 或 Edge 90 以上版本。";
    if (detail) message += "\n错误信息：" + detail;

    if (pill) pill.textContent = "载入失败";
    if (app) {
      app.style.maxWidth = "760px";
      app.style.margin = "48px auto";
      app.style.padding = "24px";
      app.style.border = "1px solid #efc4b3";
      app.style.borderRadius = "16px";
      app.style.background = "#fff8f5";
      app.style.color = "#8b2f19";
      app.style.fontSize = "18px";
      app.style.lineHeight = "1.7";
      app.style.whiteSpace = "pre-wrap";
      app.textContent = message;
    }
  }

  root.BEAM_COMPAT_BOOT_STARTED = function () {
    bootStarted = true;
  };

  root.addEventListener("error", function (event) {
    var app = document.getElementById("app");
    if (!bootStarted || !app || !app.children.length) {
      showStartupFailure(event.message || "脚本执行失败");
    }
  });

  root.setTimeout(function () {
    if (!bootStarted) showStartupFailure("主程序未启动，可能有脚本文件缺失或被安全软件拦截。");
  }, 2500);
})(window);
