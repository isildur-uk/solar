"use strict";

var fs = require("fs");
var path = require("path");
var spawnSync = require("child_process").spawnSync;

var root = path.resolve(__dirname, "..");
var roots = ["api", "js", "registry", "scripts"];
var ignored = new Set(["lib", "node_modules", "vendor"]);
var files = [];

function collect(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (entry) {
    if (ignored.has(entry.name)) return;
    var full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(full);
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(full);
  });
}

roots.forEach(function (name) {
  var dir = path.join(root, name);
  if (fs.existsSync(dir)) collect(dir);
});

var failures = [];
files.forEach(function (file) {
  var result = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8"
  });
  if (result.status !== 0) {
    failures.push(path.relative(root, file) + "\n" + (result.stderr || result.stdout));
  }
});

if (failures.length) {
  console.error(failures.join("\n"));
  console.error("\nJavaScript syntax: " + failures.length + " failure(s).");
  process.exit(1);
}

console.log("JavaScript syntax: " + files.length + " files checked, 0 failures.");
