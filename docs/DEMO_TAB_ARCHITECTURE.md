# Demo tab composition

Updated 21 October 2026.

The demo previously mounted setup, context, the interactive editor, Factory Lab, and the AI memo before all tab panes. Switching tabs left that entire stack visible. Each substantial section now belongs to one tab.

| Tab | Primary content |
| --- | --- |
| Nhập dữ liệu | Sample guidance, scenario setup/replay/export, input preparation, source audit and textile experiment, operating context, Factory Lab inputs/results |
| Quyết Định & So Sánh | B0/B1/B2 decision comparison, engine memo, optional AI explanation, source/scenario AI tools and synthetic presentation evidence |
| Tiến Độ Gantt | Interactive what-if editor, undo/reset, schedule comparison |
| Phụ Tải & Biểu Giá | Tariff, energy, power, cost index, job heatmap |
| 5 Ràng Buộc Vật Lý | Independent verification, issues, human review |
| Độ Nhạy & Rủi Ro | Cost assumptions, uncertainty, conditions for changing the decision, source provenance summary |

There are exactly six navigation destinations. No separate Demo tab remains. Legacy `?demo=1` URLs open Input. A compact active-dataset strip identifies the shared report across tabs; substantial tools belong to their functional tabs.

Source audit and textile mapping are independent disclosures in Input. Synthetic replay evidence and source/scenario AI explanation are independent disclosures in Decision. `DemoStudio.showStep(name)` opens the owning tab and disclosure rather than hiding stages in a separate wizard. Persistent fields and report hashes retain their existing lifecycle.

## Module and interface

`demo-workspace.js` owns section composition alongside its existing shared-report lifecycle. Producers use `DemoWorkspace.mountSection(role, node)` and `DemoWorkspace.openSection(role)`; section ownership is declared once in `sectionOwners`.

The module validates roles, prevents a second node from claiming the same role, mounts the existing node into its assigned pane, preserves its listeners, and navigates to its owner before scrolling. Sections carry `data-workspace-section` and `data-owner-tab` for browser verification. They are mounted after native-only children are classified, so textile mode does not hide the shared editor or memo.

`demo-interactive-gantt.js` produces separate context and editor sections. `factory-lab.js` names its section instead of locating the editor's DOM and inserting beside it. Native and textile report adapters continue to use their existing calculation and provenance contracts. Factory Lab remains an independent experiment.

The seam is section composition. Its depth comes from hiding mounting order, ownership, duplicate registration, and navigation from producers. This improves locality without adding a pass-through file for every rendering helper. No change was made to scheduling, costing, source mappings, or verification rules.

## Navigation and regression fixes

- Changing tabs resets the previous pane's scroll position so its first relevant content is visible.
- AI handoff opens the memo in Overview rather than scrolling toward a panel hidden in another tab.
- Input guidance starts a sample or opens own-data/source preparation inside the six functional tabs.
- The native verifier disables absent plans and falls back to the current selected plan. Selecting MANUAL without a draft no longer crashes, including after undo/reset.
- Loading a new report clears the editor's stale empty-state message.

## Validation

The frontend syntax checks and all **63 Node tests** passed. The local browser walkthrough checks ownership, absence of heavy global panels, distinct active function tabs, report synchronization, pointer/touch/keyboard interaction, export, undo/reset, and the existing Factory Lab workflows. The extra browser probes also confirm all six textile views, native memo rendering, forced render rollback, and the absent-MANUAL selection.

Current machine-readable results live in ignored `work/demo-evidence/browser-checks.json` and `extra-probes-summary.json`. Screenshots `tab-*-desktop.png` show the separate views. Touch was emulated; live AI and public deployment were not exercised.

A visual architecture report was written and opened at `C:\Users\MODERN15\AppData\Local\Temp\architecture-review-20261021-081619.html`. The user had already selected the tab-composition problem, so this change implements that direction. Rendering only the active textile view while preserving tab-local form state is a separate deferred improvement.
