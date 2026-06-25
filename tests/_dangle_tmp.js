var X = require("../js/core/extract.js");
// Craft text where a descriptor "person" might be created AND pulled into an event/relationship,
// then dropped by the gate, leaving a dangling entityRef.
var samples = [
 "On 14/03/2024 War Memorial travelled to London with John SMITH.",
 "Medium WHITE met Robert OKAFOR on 02/01/2023 and returned on 05/01/2023.",
 "The New Conference Suite paid £500 to Sarah CHEN on 11/11/2022."
];
samples.forEach(function(txt,i){
  var r = X.extract(txt);
  var ents = {}; r.entities.forEach(function(e){ents[e.ref]=e.label+"("+e.type+")";});
  var dangling = [];
  (r.events||[]).forEach(function(ev){
    (ev.entityRefs||[]).forEach(function(ref){ if(!ents[ref]) dangling.push({event:ev.label, ref:ref}); });
  });
  (r.relationships||[]).forEach(function(rel){
    if(!ents[rel.sourceRef]) dangling.push({rel:rel.type, missing:"src", ref:rel.sourceRef});
    if(!ents[rel.targetRef]) dangling.push({rel:rel.type, missing:"tgt", ref:rel.targetRef});
  });
  var primaryOK = (r.primary===null) || !!ents[r.primary];
  console.log("--- sample "+i+" ---");
  console.log("  persons:", r.entities.filter(function(e){return e.type==="person";}).map(function(e){return e.label;}));
  console.log("  events:", (r.events||[]).map(function(e){return e.label+" "+JSON.stringify(e.entityRefs);}));
  console.log("  primary:", r.primary, "primaryResolves:", primaryOK);
  console.log("  DANGLING:", JSON.stringify(dangling));
});
