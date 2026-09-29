// BEAM LAB 版面调试保存的配置（由「版面调试」窗口自动生成，2026-09-28 13:41:31）
// 放在 static 文件夹里，teacher.html 和 student.html 会自动读取。
// "wide" "medium" "narrow" 是教师版（按宽度分档），"phone" 是学生页的手机版面。
// 想恢复默认版面：把 "regimes" 后面的内容改成 {}，或在版面调试里重置后再保存。
window.BEAM_LAYOUT_OVERRIDES = {
  "regimes": {
    "wide": {
      "A1-2": {
        "arrow": {
          "kind": "arrow",
          "label": "过渡箭头",
          "props": {
            "h": 10
          },
          "sel": "#app .force-free-canvas > .force-transition-arrow"
        },
        "captionTop": {
          "kind": "abstext",
          "label": "上方图注",
          "props": {
            "text": 159
          },
          "sel": "#app .force-free-canvas > .structure-caption.top-caption"
        }
      },
      "A2-4": {
        "slot:basicStructure": {
          "kind": "abs",
          "label": "07 基本体系图",
          "props": {
            "left": 53.1,
            "top": 48.1
          },
          "sel": "#app .force-free-canvas > [data-element-slot=\"basicStructure\"]"
        },
        "slot:originalStructure": {
          "kind": "abs",
          "label": "02 原结构图",
          "props": {
            "left": 37.4,
            "top": 6,
            "width": 62.3
          },
          "sel": "#app .force-free-canvas > [data-element-slot=\"originalStructure\"]"
        }
      },
      "E": {
        "leftPanel": {
          "kind": "panel",
          "label": "左栏面板",
          "props": {
            "wpx": 688
          },
          "sel": "#app .hero > article.panel"
        },
        "main": {
          "kind": "main",
          "label": "页面主体",
          "props": {
            "mt": -6
          },
          "sel": "#app"
        }
      },
      "G:E": {
        "main": {
          "kind": "main",
          "label": "页面主体",
          "props": {
            "width": 103.9
          },
          "sel": "#app"
        }
      }
    }
  },
  "savedAt": "2026-09-28 13:41:31",
  "version": 3
};
