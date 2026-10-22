/**
 * MIO verified alias helpers v2.1.3 (STAGED ONLY; NOT deployed).
 * Designed for integration with the full v1.9.6+ GAS project,
 * NOT with the old root Code.gs reference.
 * Read-only functions: no data mutation, no setup(), no public API.
 */
function mioAliasMapV213_(ss,canonicalId){
  var people=rows_(ss,'emuzii_参加者');
  var canonical=people.filter(function(p){return p[0]===canonicalId;});
  if(canonical.length!==1)return null;
  var links=rows_(ss,'emuzii_本人統合').filter(function(l){
    return l[0]===canonicalId && l[3]==='確認済み';
  });
  var ids=[canonicalId],names=[canonical[0][1]],approved=[];
  for(var i=0;i<links.length;i++){
    var l=links[i],source=String(l[1]||''),alias=String(l[2]||'');
    if(!/^MIO-[0-9]{4}$/.test(source)||source===canonicalId||
      ids.indexOf(source)>=0||names.indexOf(alias)>=0||
      people.filter(function(p){return p[0]===source&&p[1]===alias}).length!==1)
      return null;
    ids.push(source);names.push(alias);approved.push(l);
  }
  return {canonical:canonical[0],ids:ids,names:names,links:approved};
}
function mioCanonicalPersonV213_(ss,web){
  if(!web || web[5]!=='承認済み' || web[11]!=='確認済み')return null;
  var id=String(web[7]||''),name=String(web[2]||'');
  if(!/^MIO-[0-9]{4}$/.test(id))return null;
  var people=rows_(ss,'emuzii_参加者');
  var current=people.filter(function(p){return p[0]===id});
  if(current.length!==1)return null;
  if(current[0][1]===name){
    var links=rows_(ss,'emuzii_本人統合').filter(function(l){
      return l[1]===id&&l[2]===name&&l[3]==='確認済み';
    });
    if(links.length>1)return null;
    if(!links.length)return current[0];
    var map=mioAliasMapV213_(ss,links[0][0]);
    return map&&map.ids.indexOf(id)>=0?map.canonical:null;
  }
  // New browser identity requires the explicit admin-reviewed browser ID,
  // in addition to an authenticated GAS token in the doPost caller.
  if(web[9]!=='管理者本人確認済み'||web[10]!==id)return null;
  var map=mioAliasMapV213_(ss,id);
  if(!map)return null;
  var link=map.links.filter(function(l){
    return l[2]===name&&l[6]===web[0];
  });
  return link.length===1?map.canonical:null;
}
function mioAliasIntegrityV213_(ss,web){
  if(!web||web[5]!=='承認済み'||web[11]!=='確認済み'||
     web[9]!=='管理者本人確認済み'||web[10]!==web[7])return false;
  var person=mioCanonicalPersonV213_(ss,web);
  if(!person||person[0]!==web[7]||person[1]===web[2])return false;
  var map=mioAliasMapV213_(ss,person[0]);
  var links=map&&map.links.filter(function(l){
    return l[2]===web[2]&&l[6]===web[0];
  });
  if(!links||links.length!==1)return false;
  // Column P is a *derived name-match hint*, not proof of identity.
  // A known alternate name may resolve to the old MIO-ID in column P.
  return !web[15]||web[15]===links[0][1]||web[15]===person[0];
}
function mioMergedDaysV213_(ss,canonicalId){
  var map=mioAliasMapV213_(ss,canonicalId);
  if(!map)return null;
  var attendance=rows_(ss,'emuzii_皆勤31日'),days=[];
  for(var i=0;i<map.ids.length;i++){
    var matches=attendance.filter(function(a){
      return a[0]===map.ids[i]&&a[1]===map.names[i];
    });
    if(matches.length!==1)return null;
    for(var day=1;day<=31;day++){
      if(matches[0][day+1]==='○'&&days.indexOf(day)<0)days.push(day);
    }
  }
  days.sort(function(a,b){return a-b});
  return days;
}
function mioMergedAttemptsV213_(ss,canonicalId,day){
  var map=mioAliasMapV213_(ss,canonicalId);
  if(!map)return CHECKIN_MAX_ATTEMPTS;
  var total=0;
  for(var i=0;i<map.ids.length;i++){
    var n=checkinAttempts_(map.ids[i],day);
    if(!Number.isSafeInteger(n)||n<0)return CHECKIN_MAX_ATTEMPTS;
    total+=n;
  }
  return total;
}
function mioMergedLockedDaysV213_(ss,canonicalId){
  var days=mioMergedDaysV213_(ss,canonicalId);
  if(days===null)return null;
  var locked=[];
  for(var day=1;day<=31;day++){
    if(days.indexOf(day)<0&&
       mioMergedAttemptsV213_(ss,canonicalId,day)>=CHECKIN_MAX_ATTEMPTS)
      locked.push(day);
  }
  return locked;
}
function mioMergedDrawsV213_(ss,canonicalId){
  var map=mioAliasMapV213_(ss,canonicalId);
  if(!map)return null;
  return rows_(ss,DRAW_TAB).filter(function(row){
    return map.ids.indexOf(row[2])>=0&&row[10]==='確定';
  });
}
function mioMergedManualV213_(ss,canonicalId){
  var map=mioAliasMapV213_(ss,canonicalId);
  if(!map)return null;
  var all=rows_(ss,'emuzii_ガチャ'),used=0;
  for(var i=0;i<map.ids.length;i++){
    var rows=all.filter(function(row){
      return row[0]===map.ids[i]&&row[1]===map.names[i];
    });
    // Missing or ambiguous source ledgers require human review.
    if(rows.length!==1 || rows[0][12]!=='OK'||rows[0][13]!=='OK')
      return null;
    var n=Number(rows[0][6]),f=Number(rows[0][9]);
    if(!Number.isSafeInteger(n)||!Number.isSafeInteger(f)||n<0||f<0)
      return null;
    // Do not accidentally duplicate separately awarded gacha rights.
    if(i>0&&Number(rows[0][5])!==0)return null;
    used+=n+f;
  }
  return Number.isSafeInteger(used)?used:null;
}
