/**
 * Step 4 architecture validator.
 * Reads accepted Step 3R contract + Step 4 architecture document.
 * Derives Metric ID and Test ID inventories from the contract.
 */
const fs = require("fs");

const CONTRACT =
  process.argv[2] ||
  "c:/Users/josho/OneDrive/Desktop/supermarket-pos/docs/reporting/STEP_3R_4R_UNIVERSAL_REPORTING_CONTRACT.md";
const ARCH =
  process.argv[3] ||
  "c:/Users/josho/OneDrive/Desktop/supermarket-pos/docs/reporting/STEP_4_PRODUCT_ARCHITECTURE_AND_CAPABILITY_ALLOCATION.md";

const REQUIRED = [
  "Architecture verdict",
  "Accepted contract baseline",
  "Evidence boundary and repository findings",
  "Architectural principles and invariants",
  "Present TillFlow reporting architecture",
  "Target architecture",
  "Architecture component register",
  "Metric architecture allocation register",
  "Conformance test allocation register",
  "Product surface architecture",
  "Role and entitlement architecture",
  "Traceability, reconciliation and data-quality architecture",
  "Snapshot, cache and export architecture",
  "Performance and scale architecture",
  "Dependency register",
  "Product and accounting decision register",
  "Delivery phases",
  "First implementation phase",
  "Architecture risks and failure modes",
  "Residual gates",
  "Final architecture readiness verdict",
];

const VERDICTS = new Set([
  "ARCHITECTURE ACCEPTED — proceed to the bounded first implementation phase.",
  "ARCHITECTURE ACCEPTED WITH RESERVED GATES — proceed only within the stated dependency boundaries.",
  "ARCHITECTURE NOT READY — resolve the specified blocking decisions first.",
]);

const PROHIBITED = /\bTBD\b|same as above|if available|unnamed future work|\bfuture work\b/i;

function load(p) {
  let t = fs.readFileSync(p, "utf8");
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  return t.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function section(text, n) {
  const re = new RegExp("^# " + n + "\\. .+$", "m");
  const m = text.match(re);
  if (!m) return "";
  const start = m.index;
  const next = text.slice(start + 1).match(/^# \d+\. /m);
  const end = next ? start + 1 + next.index : text.length;
  return text.slice(start, end);
}

function splitCells(row) {
  let s = row.trim();
  if (!s.startsWith("|") || !s.endsWith("|")) return null;
  s = s.slice(1, -1);
  const cells = [];
  let cur = "";
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escaped) {
      cur += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      cur += ch;
      continue;
    }
    if (ch === "|") {
      cells.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function isSep(c) {
  return /^:?-{3,}:?$/.test(c);
}

function contractInventories(text) {
  const s5 = section(text, 5);
  const s21 = section(text, 21);
  const metrics = [...s5.matchAll(/^## 5\.\d+ ([a-z][a-z0-9_]*) — /gm)].map((m) => m[1]);
  const tests = [...s21.matchAll(/^## 21\.\d+ (CT[0-9A-Z]+) — /gm)].map((m) => m[1]);
  return { metrics, tests };
}

function findRegisterTable(secText, idHeader) {
  const lines = secText.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!/^\|/.test(lines[i])) continue;
    const header = splitCells(lines[i]);
    if (!header || header[0] !== idHeader) continue;
    const block = [];
    let j = i;
    while (j < lines.length && /^\|/.test(lines[j])) {
      block.push(lines[j]);
      j++;
    }
    return { start: i, header, block };
  }
  return null;
}

function main() {
  const failures = [];
  const contract = load(CONTRACT);
  const arch = load(ARCH);
  const { metrics: contractMetrics, tests: contractTests } = contractInventories(contract);
  const lines = arch.split("\n");

  if (lines[0] !== "# 1. Architecture verdict") {
    failures.push("First line must be exactly # 1. Architecture verdict");
  }
  if (/^\s*```/.test(arch) || /```\s*$/.test(arch.trimEnd())) {
    failures.push("Document must not be enclosed in a code fence");
  }
  // also fail if whole doc wrapped; allow none at start/end already

  const top = [...arch.matchAll(/^# (\d+)\. (.+)$/gm)];
  if (top.length !== 21) failures.push("Expected 21 top-level sections, found " + top.length);
  top.forEach((m, i) => {
    if (Number(m[1]) !== i + 1) failures.push("Section order broken at " + m[0]);
    if (m[2] !== REQUIRED[i]) failures.push("Section " + (i + 1) + " name mismatch: " + m[2]);
  });
  if (top.length && Number(top[top.length - 1][1]) !== 21) {
    failures.push("Section 21 is not final");
  }

  const trimmed = arch.replace(/\s+$/, "");
  const last = trimmed.split("\n").pop();
  if (!VERDICTS.has(last)) failures.push("Final line not permitted verdict: " + JSON.stringify(last));
  const after = arch.slice(arch.lastIndexOf(last) + last.length);
  if (after.replace(/\s/g, "") !== "") failures.push("Content follows verdict");

  // tables
  for (let i = 0; i < lines.length; i++) {
    if (!/^\|/.test(lines[i])) continue;
    if (i + 1 >= lines.length || !/^\|/.test(lines[i + 1])) continue;
    const block = [];
    let j = i;
    while (j < lines.length && /^\|/.test(lines[j])) {
      block.push(lines[j]);
      j++;
    }
    if (block.length < 3) {
      failures.push("Table at L" + (i + 1) + " lacks header/separator/data");
      i = j - 1;
      continue;
    }
    const header = splitCells(block[0]);
    const sep = splitCells(block[1]);
    if (!header || !sep) {
      failures.push("Table at L" + (i + 1) + " missing pipes");
      i = j - 1;
      continue;
    }
    if (header.length !== sep.length || !sep.every(isSep)) {
      failures.push("Table at L" + (i + 1) + " separator invalid or mismatched");
    }
    for (let r = 0; r < block.length; r++) {
      const cells = splitCells(block[r]);
      if (!cells || cells.length !== header.length) {
        failures.push("Table at L" + (i + 1 + r) + " cell count mismatch");
      }
    }
    i = j - 1;
  }

  if (PROHIBITED.test(arch)) {
    failures.push("Prohibited placeholder wording present");
  }
  if (/\bimplement(?:ed|ation) (?:was|has been) (?:completed|performed)\b/i.test(arch) && /application code/i.test(arch)) {
    // soft: claim of app implementation
  }
  if (/\bmodified application code\b/i.test(arch) || /\bschema migration applied\b/i.test(arch)) {
    failures.push("Claims application implementation occurred");
  }

  // Metric register
  const s8 = section(arch, 8);
  const metricTable = findRegisterTable(s8, "Metric ID");
  if (!metricTable) {
    failures.push("Metric architecture allocation register table not found");
  } else {
    const header = metricTable.header;
    const idx = Object.fromEntries(header.map((h, i) => [h, i]));
    const requiredCols = [
      "Metric ID",
      "Computation owner",
      "Quality owner",
      "Reconciliation owner",
      "Drill-down owner",
      "Delivery phase",
      "Required dependency",
    ];
    for (const c of requiredCols) {
      if (idx[c] == null) failures.push("Metric register missing column " + c);
    }
    const seen = [];
    for (let r = 2; r < metricTable.block.length; r++) {
      const cells = splitCells(metricTable.block[r]);
      if (!cells) continue;
      const id = cells[idx["Metric ID"]];
      seen.push(id);
      const comp = cells[idx["Computation owner"]];
      const qual = cells[idx["Quality owner"]];
      const recon = cells[idx["Reconciliation owner"]];
      const drill = cells[idx["Drill-down owner"]];
      const phase = cells[idx["Delivery phase"]];
      const dep = cells[idx["Required dependency"]];
      if (!comp || comp === "backend" || comp === "database" || comp === "reporting module") {
        failures.push("Metric " + id + " missing named computation owner");
      }
      if (!qual) failures.push("Metric " + id + " missing quality owner");
      if (!recon) failures.push("Metric " + id + " missing reconciliation owner");
      if (!drill) failures.push("Metric " + id + " missing drill-down owner");
      if (!phase) failures.push("Metric " + id + " missing delivery phase");
      // dependency-gated support row should name dependency — check Present support column if present
      const support = idx["Present support"] != null ? cells[idx["Present support"]] : "";
      if (support === "UNAVAILABLE UNTIL DEPENDENCY RESOLVED") {
        if (!dep || dep === "NONE" || !dep.trim()) {
          failures.push("Dependency-gated metric " + id + " must name exact dependency");
        }
      }
    }
    if (seen.length !== new Set(seen).size) failures.push("Duplicate Metric IDs in register");
    for (const id of contractMetrics) {
      if (seen.filter((x) => x === id).length !== 1) {
        failures.push("Contract Metric ID " + id + " count in register " + seen.filter((x) => x === id).length);
      }
    }
    for (const id of seen) {
      if (!contractMetrics.includes(id)) failures.push("Unrecognised Metric ID in register: " + id);
    }
  }

  // Test register
  const s9 = section(arch, 9);
  const testTable = findRegisterTable(s9, "Test ID");
  if (!testTable) {
    failures.push("Conformance test allocation register table not found");
  } else {
    const header = testTable.header;
    const idx = Object.fromEntries(header.map((h, i) => [h, i]));
    const seen = [];
    for (let r = 2; r < testTable.block.length; r++) {
      const cells = splitCells(testTable.block[r]);
      if (!cells) continue;
      const id = cells[idx["Test ID"]];
      seen.push(id);
      const exec = cells[idx["Present executability"]];
      const dep = cells[idx["Missing dependency"]];
      if (!exec) failures.push("Test " + id + " missing present-executability");
      if (/dependency-gated/i.test(exec || "")) {
        if (!dep || dep === "NONE") {
          failures.push("Dependency-gated test " + id + " must name exact dependency");
        }
      }
    }
    if (seen.length !== new Set(seen).size) failures.push("Duplicate Test IDs in register");
    for (const id of contractTests) {
      if (seen.filter((x) => x === id).length !== 1) {
        failures.push("Contract Test ID " + id + " count in register " + seen.filter((x) => x === id).length);
      }
    }
    for (const id of seen) {
      if (!contractTests.includes(id)) failures.push("Unrecognised Test ID in register: " + id);
    }
  }

  // Components: inputs outputs consumers invariants
  const s7 = section(arch, 7);
  for (const col of ["Authoritative inputs", "Outputs", "Consumers", "Invariants"]) {
    if (!s7.includes(col)) failures.push("Component register missing " + col);
  }

  // Delivery phases acceptance gates and exclusions
  const s17 = section(arch, 17);
  if (!/Acceptance gates/i.test(s17) || !/Explicit exclusions/i.test(s17)) {
    failures.push("Delivery phases must include acceptance gates and exclusions");
  }

  // First phase scope and exclusions
  const s18 = section(arch, 18);
  if (!/Exact included scope/i.test(s18) || !/Exact exclusions/i.test(s18)) {
    failures.push("First implementation phase must state included scope and exclusions");
  }

  // --- Step 4R semantic gates ---
  const includeBlock = (s18.match(/## Exact included scope([\s\S]*?)## Exact exclusions/) || [])[1] || "";
  const excludeBlock = (s18.match(/## Exact exclusions([\s\S]*?)(?:## |$)/) || [])[1] || s18.split(/Exact exclusions/i)[1] || "";

  const phase1MetricIds = [
    ...new Set(
      [...includeBlock.matchAll(/\b(money_received(?:_[a-z]+)?|unverified_legacy_receipts|refund_outflows|receipts_credit_collections|paid_at_sale_value_incl_tax|credit_originated_sale_value_incl_tax|payment_reversal_outflows|customer_collections|pending_payments_value|failed_payments_count)\b/g)].map(
        (m) => m[1]
      )
    ),
  ];
  // Prefer explicit Metric IDs table/list line
  const metricListLine = includeBlock.match(/Metric IDs\s*\|\s*([^|\n]+)/);
  const listedPhase1Metrics = metricListLine
    ? metricListLine[1]
        .split(/;/)
        .map((s) => s.trim())
        .filter((s) => /^[a-z][a-z0-9_]*$/.test(s))
    : phase1MetricIds.filter((id) =>
        /money_received|unverified_legacy_receipts|refund_outflows/.test(id)
      );

  for (const id of listedPhase1Metrics) {
    if (new RegExp("\\b" + id + "\\b").test(excludeBlock)) {
      failures.push("Metric ID " + id + " appears in both Phase 1 included scope and exact exclusions");
    }
  }
  if (
    listedPhase1Metrics.includes("receipts_credit_collections") &&
    /receipts_credit_collections/.test(excludeBlock)
  ) {
    failures.push("receipts_credit_collections is both included and excluded in Phase 1");
  }
  // receipts_credit_collections must not be in Phase 1 inclusion list
  if (listedPhase1Metrics.includes("receipts_credit_collections")) {
    failures.push("receipts_credit_collections must not be a Phase 1 included Metric ID");
  }

  // Capability both include and exclude
  const capabilities = [
    "Owner Home",
    "Command Center",
    "Sales reporting",
    "Data-quality centre",
    "entitlement redesign",
    "exports hub",
    "cash-drawer",
    "inventory reporting",
  ];
  for (const cap of capabilities) {
    const re = new RegExp(cap.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    if (re.test(includeBlock) && re.test(excludeBlock)) {
      failures.push("Capability '" + cap + "' appears in both Phase 1 inclusion and exclusions");
    }
  }

  // Section 8: Phase 1 metrics must have Phase 1 delivery phase
  if (metricTable) {
    const header = metricTable.header;
    const idx = Object.fromEntries(header.map((h, i) => [h, i]));
    const phase1NameFragment = "Phase 1";
    for (let r = 2; r < metricTable.block.length; r++) {
      const cells = splitCells(metricTable.block[r]);
      if (!cells) continue;
      const id = cells[idx["Metric ID"]];
      const phase = cells[idx["Delivery phase"]] || "";
      const surface = cells[idx["Primary product surface"]] || "";
      if (listedPhase1Metrics.includes(id)) {
        if (!phase.includes(phase1NameFragment)) {
          failures.push("Phase 1 Metric ID " + id + " allocated to later delivery phase in Section 8: " + phase);
        }
        if (/DEPENDENCY-GATED/i.test(surface) && id !== "receipts_credit_collections") {
          // Phase 1 delivered metrics must not be dependency-gated surfaces
          failures.push("Phase 1 Metric ID " + id + " has dependency-gated surface in Section 8");
        }
      }
      if (id === "receipts_credit_collections") {
        if (phase.includes("Phase 1")) {
          failures.push("receipts_credit_collections must not be Phase 1 in Section 8");
        }
        const phases = [...arch.matchAll(/receipts_credit_collections[^\n]*/g)].map((x) => x[0]);
        const phaseMentions = phases.filter((p) => /Phase 1 —/.test(p) && /Delivery phase|allocated only to Phase 3|Absent from Phase 1/i.test(s18) === false);
        // count Section 8 delivery only - already checked
      }
    }
  }

  // Section 10: Phase 1 surface must be marked Yes for first phase
  const s10 = section(arch, 10);
  const moneySurfaceRow = s10
    .split("\n")
    .find((l) => /^\| Payments and Money Received \|/.test(l));
  if (!moneySurfaceRow) {
    failures.push("Payments and Money Received surface missing from Section 10");
  } else {
    const cells = splitCells(moneySurfaceRow);
    const firstPhaseCell = cells && cells[cells.length - 1];
    if (!firstPhaseCell || !/^Yes$/i.test(firstPhaseCell.trim())) {
      failures.push("Phase 1 surface is marked as later or dependency-gated in Section 10");
    }
  }

  // More than one substantive reporting vertical in Phase 1?
  const verticalMentions = [
    /Sales reporting surface/i.test(includeBlock),
    /Command Center/i.test(includeBlock),
    /Owner Home/i.test(includeBlock),
    /inventory reporting/i.test(includeBlock),
    /expense reporting/i.test(includeBlock),
    /cash-drawer reporting/i.test(includeBlock),
    /purchases or AP/i.test(includeBlock),
  ].filter(Boolean).length;
  if (verticalMentions > 0) {
    failures.push("Phase 1 included scope contains more than one substantive reporting vertical");
  }
  if (!/Payments and Money Received/i.test(includeBlock) && !/Money Received vertical/i.test(s18)) {
    failures.push("Phase 1 must centre on the Money Received vertical");
  }

  // scaffolding as acceptance deliverable
  if (/scaffolding/i.test(s18) && /acceptance/i.test(s18)) {
    failures.push("scaffolding is used as a Phase 1 acceptance deliverable");
  }
  if (/\bscaffolding\b/i.test(includeBlock)) {
    failures.push("scaffolding appears in Phase 1 included scope");
  }

  // Gate test unlocking gated metric
  if (/unlocks receipts_credit_collections|unlock receipts_credit_collections|Phase 1[^\n]{0,80}unlocks[^\n]{0,40}receipts_credit_collections/i.test(arch)) {
    failures.push("Phase 1 claims to unlock a dependency-gated metric via gate test");
  }
  if (/CT11G[^\n]{0,120}unlocks receipts_credit_collections/i.test(arch)) {
    failures.push("CT11G must not unlock receipts_credit_collections");
  }

  // Component marked Not in Phase 1 but required for Phase 1 canonical metric computation owners
  if (metricTable) {
    const header = metricTable.header;
    const idx = Object.fromEntries(header.map((h, i) => [h, i]));
    const phase1Owners = new Set();
    for (let r = 2; r < metricTable.block.length; r++) {
      const cells = splitCells(metricTable.block[r]);
      if (!cells) continue;
      const id = cells[idx["Metric ID"]];
      if (!listedPhase1Metrics.includes(id)) continue;
      phase1Owners.add(cells[idx["Computation owner"]]);
    }
    // parse component inclusion column
    const compTable = findRegisterTable(s7, "Component");
    if (compTable) {
      const ch = compTable.header;
      const cidx = Object.fromEntries(ch.map((h, i) => [h, i]));
      for (let r = 2; r < compTable.block.length; r++) {
        const cells = splitCells(compTable.block[r]);
        if (!cells) continue;
        const name = cells[cidx["Component"]];
        const inclusion = cells[cidx["First-phase inclusion"]] || "";
        if (phase1Owners.has(name) && /Not in Phase 1/i.test(inclusion)) {
          failures.push(
            "Component " + name + " marked Not in Phase 1 but required to deliver a Phase 1 canonical metric"
          );
        }
      }
    }
  }

  // Phase 1 post-dependency tests relying on later deps (exclude gate-only)
  if (testTable) {
    const header = testTable.header;
    const idx = Object.fromEntries(header.map((h, i) => [h, i]));
    for (let r = 2; r < testTable.block.length; r++) {
      const cells = splitCells(testTable.block[r]);
      if (!cells) continue;
      const id = cells[idx["Test ID"]];
      const phase = cells[idx["Primary acceptance gate"]] || "";
      const exec = cells[idx["Present executability"]] || "";
      const dep = cells[idx["Missing dependency"]] || "";
      if (!phase.includes("Phase 1")) continue;
      if (/gate only/i.test(exec)) continue; // allowed
      if (/dependency-gated/i.test(exec) && /DEP-(SALE|CN|RET|COST|EXP|PAY-3|SNAP)/i.test(dep)) {
        failures.push(
          "Phase 1 post-dependency test " + id + " relies on a dependency scheduled after Phase 1"
        );
      }
    }
  }

  // Single allocation for receipts_credit_collections delivery phase in Section 8
  if (metricTable) {
    const header = metricTable.header;
    const idx = Object.fromEntries(header.map((h, i) => [h, i]));
    for (let r = 2; r < metricTable.block.length; r++) {
      const cells = splitCells(metricTable.block[r]);
      if (!cells) continue;
      if (cells[idx["Metric ID"]] !== "receipts_credit_collections") continue;
      const phase = cells[idx["Delivery phase"]] || "";
      if (!/Phase 3/i.test(phase) || /Phase 1/i.test(phase)) {
        failures.push("receipts_credit_collections must have exactly Phase 3 delivery allocation");
      }
    }
  }

  if (failures.length) {
    for (const f of failures) console.error("FAIL:", f);
    process.exit(1);
  }
  process.stdout.write("VALIDATION PASSED\n");
}

main();
