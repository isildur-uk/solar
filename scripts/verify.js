"use strict";

var path = require("path");
var fs = require("fs");
var spawnSync = require("child_process").spawnSync;

var root = path.resolve(__dirname, "..");
var nodeTests = fs.readdirSync(path.join(root, "tests"))
  .filter(function (name) { return name.endsWith(".test.js"); })
  .map(function (name) { return path.join("tests", name); });
var checks = [
  ["JavaScript syntax", ["scripts/check-js.js"]],
  ["Core engine", ["tests/run_tests.js"]],
  ["CM standards", ["tests/cm_tests.js"]],
  ["Language engine", ["tests/lang_tests.js"]],
  ["Smart NER", ["tests/smartner_tests.js"]],
  ["Demo corpus", ["tests/demo_harness.js"]],
  ["Node test suites", ["--test"].concat(nodeTests)],
  ["UI intelligence", ["tests/ui_intel_tests.js"]],
  ["Drag and drop", ["tests/dragdrop_tests.js"]]
];

if (process.argv.indexOf("--dom-only") !== -1) {
  checks = [["Node test suites", ["--test"].concat(nodeTests)]];
}

for (var i = 0; i < checks.length; i++) {
  var name = checks[i][0];
  var args = checks[i][1];
  console.log("\n=== " + name + " ===");
  var result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: "inherit"
  });
  if (result.status !== 0) {
    console.error("\nVerification stopped: " + name + " failed.");
    process.exit(result.status || 1);
  }
}

console.log("\nAll Solar verification checks passed.");
