/**
 * Step 3R.4R-V mechanical validator for the Universal Reporting Contract.
 * Prints only VALIDATION PASSED on success; otherwise FAIL lines and exit 1.
 */
const fs = require("fs");

const PATH =
  process.argv[2] ||
  "c:/Users/josho/OneDrive/Desktop/supermarket-pos/docs/reporting/STEP_3R_4R_UNIVERSAL_REPORTING_CONTRACT.md";

const REQUIRED_SECTIONS = [
  "Executive repair verdict",
  "Evidence boundary",
  "Universal reporting invariants",
  "Scope and business-clock contract",
  "Canonical metric dictionary",
  "Payment, refund and reversal contract",
  "Return contract",
  "Cost completeness and provenance contract",
  "Sales, revenue, discount and tax contract",
  "Expense, purchase, liability and outflow contract",
  "Status inclusion matrix",
  "Data-quality contract",
  "Traceability and reconciliation contract",
  "Corrections, restatements and snapshots",
  "Aggregation contract",
  "Entitlement and access invariants",
  "Data-model and workflow dependency register",
  "Contract-to-current-implementation conflict register",
  "Final policy decision register",
  "Worked examples",
  "Conformance test specification",
  "Residual blocking gaps",
  "Final readiness verdict",
];

const ATTRS = [
  "Metric ID",
  "Canonical name",
  "Business question",
  "Metric type",
  "Event or balance population",
  "Inclusion and exclusion rules",
  "Status treatment",
  "Exact canonical formula",
  "Authoritative timestamp or asOf rule",
  "Period attribution",
  "Restates originating transaction",
  "Reports action-period activity",
  "Money-movement effect",
  "Sales effect",
  "Receivable or customer-obligation effect",
  "Inventory effect",
  "COGS effect",
  "Gross Profit or expense effect",
  "Tax basis",
  "Currency and rounding rule",
  "Branch and business scope",
  "Aggregation class",
  "Data-quality requirement",
  "Correction and restatement treatment",
  "Drill-down grain",
  "Reconciliation relationship",
  "Current-support classification",
  "Exact unresolved dependency",
  "Material-claim classification",
];

const TEST_FIELDS = [
  "Test ID",
  "Fixed precondition",
  "Fixed dataset or state",
  "Action",
  "Exact metric result or blocked state",
  "Exact quality state",
  "Exact period treatment",
  "Exact drill-down result",
  "Exact reconciliation result",
  "Pass condition",
];

const TYPES = new Set([
  "FLOW",
  "POINT_IN_TIME_BALANCE",
  "RATIO",
  "COUNT",
  "QUALITY_INDICATOR",
  "IMMUTABLE_SNAPSHOT",
]);

const SUPPORTS = new Set([
  "CURRENTLY SUPPORTED",
  "PARTIALLY SUPPORTED — NON-CANONICAL",
  "UNAVAILABLE UNTIL DEPENDENCY RESOLVED",
]);

const CLAIMS = new Set([
  "Confirmed implementation fact",
  "Strong repository inference",
  "Proposed universal rule",
  "Requires product decision",
  "Requires accounting decision",
  "Requires runtime verification",
  "Requires customer evidence",
]);

const FUSED = [
  "ItemDetail",
  "IDInvariant",
  "Metric IDCanonical name",
  "Business questionMetric type",
  "Test IDScenario",
  "Required recordsExpected metrics",
  "Exact unanswered questionAffected metrics",
];

const PROHIBITED_SHORTHAND =
  /\b(Same as|As above|Per previous row|Per metric|Same pattern|Inherited|Where supported|If supported|Partial gated)\b/i;

const CONDITIONAL =
  /\b(if\s+supported|where\s+supported|depending\s+on|else\s+gate|use another test when)\b/i;

const VERDICTS = new Set([
  "CONTRACT REPAIRED — proceed to product architecture.",
  "CONTRACT REPAIRED WITH RESERVED DECISIONS — proceed while preserving named policy gates.",
  "CONTRACT STILL NOT READY — obtain the specified blocking evidence first.",
]);

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

function isSep(cell) {
  return /^:?-{3,}:?$/.test(cell);
}

function extractSection(text, n) {
  const re = new RegExp("^# " + n + "\\. .+$", "m");
  const m = text.match(re);
  if (!m) return "";
  const start = m.index;
  const next = text.slice(start + 1).match(/^# \d+\. /m);
  const end = next ? start + 1 + next.index : text.length;
  return text.slice(start, end);
}

function loadContract(path) {
  // Read UTF-8; strip BOM; normalise CRLF / standalone CR to LF for structural checks only.
  // Does not write a normalised substitute copy.
  let raw = fs.readFileSync(path, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) {
    raw = raw.slice(1);
  }
  return raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function main() {
  const failures = [];
  const text = loadContract(PATH);
  const lines = text.split("\n");

  if (lines[0] !== "# 1. Executive repair verdict") {
    failures.push("First line must be exactly # 1. Executive repair verdict");
  }
  if (/^\s*```/.test(text) || /```\s*$/.test(text.trimEnd())) {
    failures.push("Document must not be enclosed in a code fence");
  }

  const top = [...text.matchAll(/^# (\d+)\. (.+)$/gm)];
  if (top.length !== 23) {
    failures.push("Expected exactly 23 top-level sections, found " + top.length);
  }
  top.forEach((m, i) => {
    if (Number(m[1]) !== i + 1) failures.push("Section number order broken at " + m[0]);
    if (m[2] !== REQUIRED_SECTIONS[i]) {
      failures.push("Section " + (i + 1) + " name mismatch: got '" + m[2] + "'");
    }
  });
  if (top.length && Number(top[top.length - 1][1]) !== 23) {
    failures.push("Section 23 is not the final section");
  }

  const trimmed = text.replace(/\s+$/, "");
  const last = trimmed.split(/\n/).pop();
  if (!VERDICTS.has(last)) {
    failures.push("Final non-empty line is not a permitted verdict: " + JSON.stringify(last));
  }
  const afterIdx = text.lastIndexOf(last);
  const after = text.slice(afterIdx + last.length);
  if (after.replace(/\s/g, "") !== "") {
    failures.push("Content follows the verdict");
  }
  if (/Agent/i.test(after)) {
    failures.push("Agent label appears after the verdict");
  }

  // Tables
  for (let i = 0; i < lines.length; i++) {
    if (!/^\|/.test(lines[i])) continue;
    if (i + 1 >= lines.length || !/^\|/.test(lines[i + 1])) continue;
    const block = [];
    let j = i;
    while (j < lines.length && /^\|/.test(lines[j])) {
      block.push(lines[j]);
      j++;
    }
    const start = i + 1;
    if (block.length < 3) {
      failures.push("Table at L" + start + " lacks header/separator/data");
      i = j - 1;
      continue;
    }
    const header = splitCells(block[0]);
    const sep = splitCells(block[1]);
    if (!header || !sep) {
      failures.push("Table at L" + start + " row missing opening/closing |");
      i = j - 1;
      continue;
    }
    if (header.length !== sep.length) {
      failures.push("Table at L" + start + " header/separator cell count mismatch");
    }
    if (!sep.every(isSep)) {
      failures.push("Table at L" + start + " has invalid separator cells");
    }
    for (const f of FUSED) {
      if (header.some((h) => h.replace(/\s/g, "") === f.replace(/\s/g, "") || h === f)) {
        failures.push("Table at L" + start + " has fused heading " + f);
      }
    }
    for (let r = 0; r < block.length; r++) {
      const cells = splitCells(block[r]);
      if (!cells) {
        failures.push("Table at L" + (start + r) + " must begin and end with |");
        continue;
      }
      if (cells.length !== header.length) {
        failures.push(
          "Table at L" + (start + r) + " cell count " + cells.length + " != header " + header.length
        );
      }
    }
    i = j - 1;
  }

  // Section 5
  const s5 = extractSection(text, 5);
  if (PROHIBITED_SHORTHAND.test(s5)) {
    failures.push("Section 5 contains prohibited shorthand");
  }
  const metricHeads = [...s5.matchAll(/^## 5\.\d+ ([a-z][a-z0-9_]*) — /gm)].map((m) => m[1]);
  if (metricHeads.length !== new Set(metricHeads).size) {
    failures.push("Duplicate Metric ID headings in Section 5");
  }
  if (metricHeads.length !== 116) {
    failures.push("Expected 116 Metric ID headings, found " + metricHeads.length);
  }

  const metricChunks = s5.split(/^## 5\.\d+ /m).slice(1);
  for (const chunk of metricChunks) {
    const headingId = chunk.match(/^([a-z][a-z0-9_]*) —/)?.[1] || "?";
    const attrs = [];
    for (const r of chunk.matchAll(/^\| ([^|]+) \| (.+) \|\s*$/gm)) {
      const a = r[1].trim();
      if (a === "Attribute" || /^-+$/.test(a)) continue;
      attrs.push([a, r[2].trim()]);
    }
    if (attrs.length !== 29) {
      failures.push("Metric " + headingId + " has " + attrs.length + " attribute rows, expected 29");
    }
    for (const name of ATTRS) {
      if (!attrs.some(([a]) => a === name)) {
        failures.push("Metric " + headingId + " missing attribute " + name);
      }
    }
    const tableMetricId = attrs.find(([a]) => a === "Metric ID")?.[1];
    if (tableMetricId !== headingId) {
      failures.push(
        "Metric table Metric ID '" +
          tableMetricId +
          "' does not match Section 5 heading '" +
          headingId +
          "'"
      );
    }
    const type = attrs.find(([a]) => a === "Metric type")?.[1];
    if (type && !TYPES.has(type)) {
      failures.push("Metric " + headingId + " bad metric type " + type);
    }
    const support = attrs.find(([a]) => a === "Current-support classification")?.[1];
    if (support && !SUPPORTS.has(support)) {
      failures.push("Metric " + headingId + " bad support " + support);
    }
    const claim = attrs.find(([a]) => a === "Material-claim classification")?.[1];
    if (!claim || !CLAIMS.has(claim)) {
      failures.push(
        "Metric " + headingId + " bad Material-claim classification " + JSON.stringify(claim)
      );
    }
    const dep = attrs.find(([a]) => a === "Exact unresolved dependency")?.[1];
    if (!dep || dep.trim() === "" || /^dependency unresolved$/i.test(dep)) {
      failures.push("Metric " + headingId + " unresolved dependency not exact or NONE");
    }
  }

  // Section 21
  const s21 = extractSection(text, 21);
  const testChunks = s21.split(/^## 21\.\d+ /m).slice(1);
  const testIds = [];
  for (const chunk of testChunks) {
    const titleId = chunk.match(/^(CT[0-9A-Z]+) —/)?.[1] || "?";
    const headerMatch = chunk.match(/^\| ([^|]+) \| ([^|]+) \|\s*$/m);
    if (
      !headerMatch ||
      headerMatch[1].trim() !== "Test field" ||
      headerMatch[2].trim() !== "Contract requirement"
    ) {
      failures.push(
        "Test " +
          titleId +
          " table header must be exactly Test field | Contract requirement"
      );
    }
    const fields = {};
    for (const r of chunk.matchAll(/^\| ([^|]+) \| (.+) \|\s*$/gm)) {
      const a = r[1].trim();
      const d = r[2].trim();
      if (a === "Test field" || a === "Attribute" || /^-+$/.test(a)) continue;
      fields[a] = d;
    }
    for (const f of TEST_FIELDS) {
      if (!fields[f]) failures.push("Test " + titleId + " missing field " + f);
    }
    const present = Object.keys(fields).filter((k) => TEST_FIELDS.includes(k));
    if (present.length !== 10) {
      failures.push("Test " + titleId + " does not have exactly ten required fields");
    }
    const tid = fields["Test ID"];
    if (!tid) {
      failures.push("Test " + titleId + " missing Test ID field value");
    } else if (tid !== titleId) {
      failures.push(
        "Test table Test ID '" + tid + "' does not match Section 21 heading '" + titleId + "'"
      );
    }
    testIds.push(tid || titleId);
    const pass = fields["Pass condition"] || "";
    if (!/^PASS only when /i.test(pass) || !/otherwise FAIL/i.test(pass)) {
      failures.push("Test " + (tid || titleId) + " pass condition not binary PASS/FAIL form");
    }
    for (const key of [
      "Exact metric result or blocked state",
      "Exact quality state",
      "Pass condition",
    ]) {
      const v = fields[key] || "";
      if (CONDITIONAL.test(v) || /\bif\b[\s\S]{0,40}\botherwise\b/i.test(v)) {
        failures.push("Test " + tid + " conditional wording in " + key);
      }
    }
  }
  if (new Set(testIds).size !== testIds.length) {
    failures.push("Duplicate Test IDs");
  }
  if (testIds.length !== 39) {
    failures.push("Expected 39 conformance tests, found " + testIds.length);
  }

  const byId = Object.fromEntries(
    testChunks.map((c) => {
      const id = c.match(/^(CT[0-9A-Z]+) —/)?.[1];
      return [id, c];
    })
  );

  // CT08
  const ct08 = byId.CT08 || "";
  if (
    !/GHS 0/.test(ct08) ||
    !/GHS 100/.test(ct08) ||
    !/100%/.test(ct08) ||
    !/COMPLETE/.test(ct08)
  ) {
    failures.push("CT08 missing GHS 0 COGS / GHS 100 GP / 100% coverage / COMPLETE");
  }
  if (!byId.CT08G) {
    failures.push("Zero-cost-without-provenance gate test CT08G missing");
  }

  // CT10
  const ct10 = byId.CT10 || "";
  if (
    !/70%/.test(ct10) ||
    !/GHS 280/.test(ct10) ||
    !/GHS 300/.test(ct10) ||
    !/no canonical numerical value/i.test(ct10)
  ) {
    failures.push("CT10 missing 70% / no complete GP / 280 / 300 requirements");
  }

  // CT12 split
  if (!byId.CT12 || !byId.CT12P || !byId.CT12G) {
    failures.push("CT12 must be split into CT12, CT12P, CT12G");
  }
  const ct12 = byId.CT12 || "";
  if (
    /operating_expenses_paid/.test(ct12) ||
    (/incurred/i.test(ct12) && /UNAVAILABLE UNTIL DEPENDENCY RESOLVED/.test(ct12))
  ) {
    failures.push("CT12 combines recognised expense with paid or incurred-unrecorded");
  }

  // CT25
  const ct25 = byId.CT25 || "";
  if (
    !/receivable GHS 0|current receivable GHS 0|ar_balance.*GHS 0/i.test(ct25) ||
    !/customer credit\/payable GHS 40|customer_credit_payable GHS 40/i.test(ct25) ||
    !/refund outflow GHS 0|refund_outflows GHS 0/i.test(ct25) ||
    !/return activity GHS 100|returns_incl_tax_activity GHS 100|later-period return activity GHS 100/i.test(
      ct25
    ) ||
    !/COGS corrected by GHS 60|COGS correction GHS 60/i.test(ct25)
  ) {
    failures.push(
      "CT25 missing receivable 0 / payable 40 / refund 0 / return activity 100 / COGS 60"
    );
  }
  if (!/Money Received remains GHS 40|historical money_received GHS 40|money_received remains GHS 40/i.test(ct25)) {
    failures.push("CT25 must preserve historical GHS 40 Money Received");
  }
  if (!byId.CT25G) {
    failures.push("CT25G present-capability gate missing");
  }

  // CT26
  if (!byId.CT26G || !byId.CT26P) {
    failures.push("CT26 gate and post-dependency tests must be separate (CT26G and CT26P)");
  }
  const ct26gResult =
    (byId.CT26G || "").match(/Exact metric result or blocked state \| ([^|]+) \|/)?.[1] || "";
  if (!/UNAVAILABLE UNTIL DEPENDENCY RESOLVED/.test(byId.CT26G || "")) {
    failures.push("CT26G must return UNAVAILABLE UNTIL DEPENDENCY RESOLVED");
  }
  if (/GHS\s*\d+/.test(ct26gResult)) {
    failures.push("CT26G must not return a canonical customer-credit number");
  }

  // Gate separation for known pairs
  const gatePairs = [
    ["CT02G", "CT02"],
    ["CT04G", "CT04"],
    ["CT05G", "CT05"],
    ["CT06G", "CT06"],
    ["CT08G", "CT08"],
    ["CT10G", "CT10"],
    ["CT11G", "CT11"],
    ["CT12G", "CT12"],
    ["CT25G", "CT25"],
    ["CT26G", "CT26P"],
  ];
  for (const [g, p] of gatePairs) {
    if (!byId[g] || !byId[p]) {
      failures.push("Gate/post-dependency pair incomplete: " + g + " / " + p);
    }
  }

  // Unsupported completion / auditability claims (narrow false self-cert in §1 before update is OK until after; check banned phrases)
  if (
    /\ball metrics are currently auditable\b/i.test(text) ||
    /\bevery metric is currently reconciled\b/i.test(text) ||
    /\bcustomer obligations are supported\b/i.test(text)
  ) {
    failures.push("Unsupported completion/reconciliation/auditability claim present");
  }

  if (failures.length) {
    for (const f of failures) console.error("FAIL:", f);
    process.exit(1);
  }
  process.stdout.write("VALIDATION PASSED\n");
}

main();
