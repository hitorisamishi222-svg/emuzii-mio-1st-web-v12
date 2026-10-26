/**
 * Replacement for the SINGLE function wonDuplicateKeys_ in the staged GAS Code.gs.
 * NOT DEPLOYED; do not add alongside another function with this name to live GAS.
 * Designed for one participant's CONFIRMED, permanent winning history.
 *
 * Why: Historical column N may contain the former name/key of a prize that
 * operations later rename. Also, two catalog entries can have the same name
 * but different explicit keys. Either situation must never restore eligibility.
 */
function wonDuplicateKeys_(ss,id){
  var catalogRows=rows_(ss,PRIZE_TAB),byPrizeId={},byName={},byKey={};
  catalogRows.forEach(function(row){
    var pid=String(row[1]||'').trim();
    var name=normalizeDuplicateKey_(row[2]);
    var key=prizeDuplicateKeyFromRow_(row);
    var item={key:key,name:name};
    if(pid)byPrizeId[pid]=item;
    if(name)(byName[name]||(byName[name]=[])).push(item);
    if(key)(byKey[key]||(byKey[key]=[])).push(item);
  });

  var won={};
  draws_(ss,id).forEach(function(row){
    var pid=String(row[5]||'').trim();
    var historicalName=normalizeDuplicateKey_(row[6]);
    var historicalKey=normalizeDuplicateKey_(row[13]);
    var names={},keys={},current=byPrizeId[pid];
    if(historicalName)names[historicalName]=true;
    if(historicalKey)keys[historicalKey]=true;
    if(current){
      if(current.name)names[current.name]=true;
      if(current.key)keys[current.key]=true;
    }
    // Expand keys AND names as a small graph. This connects duplicate catalog
    // entries even when one was renamed or explicit duplicate keys diverged.
    for(var round=0;round<catalogRows.length+1;round++){
      var changed=false;
      Object.keys(names).forEach(function(name){
        (byName[name]||[]).forEach(function(item){
          if(item.key&&!keys[item.key]){keys[item.key]=true;changed=true;}
        });
      });
      Object.keys(keys).forEach(function(key){
        (byKey[key]||[]).forEach(function(item){
          if(item.name&&!names[item.name]){names[item.name]=true;changed=true;}
        });
      });
      if(!changed)break;
    }
    Object.keys(names).forEach(function(name){won[name]=true});
    Object.keys(keys).forEach(function(key){won[key]=true});
  });
  return won;
}
