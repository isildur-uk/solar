/* access-log.run.js — lawful-access audit trail (memory-fallback path). */
"use strict";
var A=require("../core/access-log.js");
var pass=0,fail=0; function ok(c,m){ if(c){pass++;} else {fail++; console.error("  FAIL: "+m);} }
A.clear();
ok(A.list().length===0,"log starts empty");
ok(A.REASONS.length>=5,"reason list provided ("+A.REASONS.length+")");
var row=A.record({actor:"G5 WILSON",action:"View nominal record",target:"June BAILEY",reason:"Intelligence development",justification:"OCG mapping",onBehalfOf:"Self"});
ok(row.ts && /T/.test(row.ts),"entry timestamped");
ok(A.list().length===1,"entry recorded");
ok(A.list()[0].justification==="OCG mapping","entry fields preserved");
ok(A.list()[0].reason==="Intelligence development","reason preserved");
A.record({actor:"x",action:"y",reason:"Disclosure",justification:"z"});
ok(A.list().length===2 && A.list()[0].action==="y","newest first");
A.clear(); ok(A.list().length===0,"clear empties the log");
console.log("\n"+pass+" passed, "+fail+" failed"); if(fail) process.exit(1);
