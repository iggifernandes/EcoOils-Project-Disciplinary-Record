// Runs the REAL Code.gs inside node with mocked Apps Script services
const vm=require('vm'),fs=require('fs'),crypto=require('crypto');
module.exports=function(codePath){
  const mails=[];const sheets={};const props={};const cache={};const files={};let fid=0;
  class Sheet{constructor(n){this.n=n;this.v=[];this.fr=0}
    appendRow(a){this.v.push(a.slice())}setFrozenRows(){}deleteRow(r){this.v.splice(r-1,1)}
    getLastRow(){return this.v.length}
    getDataRange(){return{getValues:()=>this.v.map(r=>r.slice())}}
    getRange(r,c,n=1,m=1){const s=this;return{setValue(x){while(s.v.length<r)s.v.push([]);s.v[r-1][c-1]=x},setNumberFormat(){return this},setValues(vals){for(let i=0;i<n;i++){while(s.v.length<r-1+i+1)s.v.push([]);for(let j=0;j<m;j++)s.v[r-1+i][c-1+j]=vals[i][j]}return this}}}}
  const SS={getSheetByName:n=>sheets[n]||null,insertSheet:n=>(sheets[n]=new Sheet(n))};
  const pad=(n,l=2)=>String(n).padStart(l,'0');
  const ctx={
    SpreadsheetApp:{getActiveSpreadsheet:()=>SS},
    ContentService:{MimeType:{JSON:1},createTextOutput:s=>({s,setMimeType(){return this}})},
    MailApp:{sendEmail:o=>mails.push(o),getRemainingDailyQuota:()=>100},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>{props[k]=v}})},
    CacheService:{getScriptCache:()=>({get:k=>cache[k]===undefined?null:cache[k],put:(k,v)=>{cache[k]=v},remove:k=>{delete cache[k]}})},
    LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
    Session:{getEffectiveUser:()=>({getEmail:()=>'iggy@example.com'})},
    Logger:{log:()=>{}},
    DriveApp:{createFolder:n=>({getId:()=>'F1',createFile:b=>{const id='file'+(++fid);files[id]=b;return{getId:()=>id}}}),getFolderById:id=>({getId:()=>id,createFile:b=>{const i='file'+(++fid);files[i]=b;return{getId:()=>i}}}),getFileById:id=>({getBlob:()=>({getBytes:()=>files[id].bytes})})},
    Utilities:{
      formatDate:(d,tz,f)=>{const x=new Date(d.getTime()+7*3600e3);const Y=x.getUTCFullYear(),M=pad(x.getUTCMonth()+1),D=pad(x.getUTCDate()),h=pad(x.getUTCHours()),mi=pad(x.getUTCMinutes()),s=pad(x.getUTCSeconds());
        return f==='yyyy-MM-dd'?`${Y}-${M}-${D}`:f==="yyyy-MM-dd'T'HH:mm:ss"?`${Y}-${M}-${D}T${h}:${mi}:${s}`:f==='yyyy-MM-dd HH:mm'?`${Y}-${M}-${D} ${h}:${mi}`:f},
      formatString:(f,...a)=>{let i=0;return f.replace(/%0?(\d)d/g,(m,w)=>pad(a[i++],+w))},
      base64Decode:s=>Array.from(Buffer.from(s,'base64')),base64Encode:b=>Buffer.from(b).toString('base64'),
      computeDigest:(alg,b)=>Array.from(crypto.createHash('sha256').update(Buffer.from(b)).digest()),DigestAlgorithm:{SHA_256:1},
      newBlob:(b,t,n)=>({bytes:b,t,n}),getUuid:()=>crypto.randomUUID()}
  };
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(codePath,'utf8')+'\n;this.__doPost=doPost;this.__setup=setup;this.__migrate=migrateLegacy;this.__remind=remindICs;',ctx);
  ctx.__setup();
  return{evict:()=>Object.keys(cache).filter(k=>k.startsWith('sess:')).forEach(k=>delete cache[k]),clearWait:()=>Object.keys(cache).filter(k=>k.startsWith('wait:')).forEach(k=>delete cache[k]),mails,sheets,post:body=>JSON.parse(ctx.__doPost({postData:{contents:JSON.stringify(body)}}).s),ctx,files};
};
