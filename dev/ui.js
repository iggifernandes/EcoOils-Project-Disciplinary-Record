const {chromium}=require('playwright');
const g=require('./gas.js')(__dirname+'/../apps-script/Code.gs');
const URL='https://script.google.com/macros/s/AKfycbzC1EUvMoebq_aP_Ph2ZQo-4DntR56W3D0f-QvzvieB16TXCVQnpsEmZIDf8BEJWXlx/exec';
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++};
// tiny jpeg
const JPG=Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=','base64');
(async()=>{
  const b=await chromium.launch();
  async function ctxFor(){const c=await b.newContext({viewport:{width:390,height:800}});
    await c.route(URL,async r=>{const req=r.request();if(req.method()!=='POST')return r.fulfill({status:200,body:'{}'});
      let out;try{const bd=JSON.parse(req.postData());out=g.post(bd);console.log('API',bd.action,JSON.stringify(out).slice(0,120))}catch(e){console.log('ROUTEERR',e.message);out={ok:false,error:'server'}}r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(out)})});
    await c.route('**/*xlsx*',r=>r.fulfill({status:200,contentType:'text/javascript',body:''}));
    await c.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
    return c}
  const errs=[];
  async function open(c){const p=await c.newPage();p.on('pageerror',e=>{errs.push(e.message);console.log('PAGEERR',e.message)});p.on('console',m=>console.log('console:',m.text()));p.on('console',m=>console.log('console:',m.text()));p.on('dialog',d=>d.accept('badge does not match'));await p.goto('file://'+require('path').resolve(__dirname,'../index.html')+'');return p}
  async function signin(p,email){g.clearWait();await p.fill('#lge',email);await p.click('#lgf');await p.click('#lgs');await p.waitForSelector('#lgc');await p.waitForTimeout(400);const code=g.mails.filter(m=>m.to===email).pop().subject.match(/(\d{6})/)[1];await p.fill('#lgc',code);await p.fill('#lgn','123456');await p.fill('#lgn2','123456');await p.click('#lgv');await p.waitForTimeout(1500);console.log('lgm=',await p.textContent('#lgm').catch(()=>'-'),'| nav:',await p.isVisible('#nav'));await p.waitForSelector('#nav button:visible',{timeout:5000})}
  // seed users
  const adm=g.post({action:'verify',email:'x',code:'1',pin:'123456'});
  g.post({action:'reqcode',email:'iggy@example.com'});const A=g.post({action:'verify',email:'iggy@example.com',code:g.mails.pop().subject.match(/(\d{6})/)[1],pin:'123456'}).token;
  g.post({action:'usersave',token:A,user:{email:'gsb@x.com',name:'GSB Admin',company:'GSB',role:'ic'}});
  // --- IC flow
  const c1=await ctxFor(),p=await open(c1);
  ok(await p.isVisible('#lge')&&!(await p.isVisible('#nav')),'signed out: only the login shows');
  await signin(p,'gsb@x.com');
  const tabs=await p.$$eval('#nav button',bs=>bs.filter(x=>x.offsetParent).map(x=>x.dataset.tab));
  ok(JSON.stringify(tabs)==='["wait","reg","wk","out"]','IC tabs wait/reg/wk/out: '+tabs);
  await p.click('#bnew');await p.fill('#id_d','2026-10-01');await p.fill('#id_b','EO 777');await p.fill('#id_n','Candra Wirawan');await p.fill('#id_p','Welder');await p.selectOption('#id_vp2 .vsel','7');await p.selectOption('#id_vp2 .vsel','o');await p.fill('#id_vp2 .vor','Hot surface');await p.fill('#id_vp2 .vom','Touched pipe without sleeves');await p.click('#id_vp2 .vod');ok((await p.innerText('#id_vp2')).includes('Hot surface')&&(await p.$$('#id_vp2 .vchip')).length===2,'IC picks a standard violation + Other with reason and remark');
  await p.click('#id_s');ok((await p.textContent('#toast')).length>5,'submit without photo refused: '+await p.textContent('#toast'));
  const tmp='/tmp/badge.jpg';require('fs').writeFileSync(tmp,JPG);
  await p.setInputFiles('#id_f',tmp);await p.waitForFunction(()=>document.getElementById('id_pv').style.display==='block');
  await p.click('#id_s');await p.waitForFunction(()=>/Sent/.test(document.getElementById('toast').textContent));
  await p.click('#nav [data-tab=reg]');ok((await p.innerText('#tab-reg')).includes('Candra Wirawan')&&(await p.innerText('#tab-reg')).includes('Waiting for verification'),'IC sees own company warning as Pending');
  ok(!(await p.innerText('body')).includes('Letter'),'no letter button for IC');
  await p.click('#bnew');
  g.post({action:'review',token:A,id:1,decision:'verify'});
  await p.fill('#id_b','eo777');await p.waitForFunction(()=>document.getElementById('id_n').readOnly);
  ok(await p.inputValue('#id_n')==='Candra Wirawan'&&await p.inputValue('#id_l')==='2','known badge: name locked, level preset SP2');
  await p.screenshot({path:'/tmp/ic390.png'});
  await p.evaluate(()=>reload());await p.waitForTimeout(500);await p.click('#nav [data-tab=wk]');{const w=await p.innerText('#tab-wk');ok(w.includes('Candra Wirawan'),'IC worker history lists own worker: '+w.slice(0,300).replace(/\n/g,' '));ok(!w.includes('Dewi Lestari'),'IC worker history hides other companies');await p.click('#tab-wk .card >> text=Candra Wirawan').catch(()=>{});ok(!(await p.innerText('body')).includes('Letter'),'no letter button in IC worker history');}
  await p.click('#nav [data-tab=out]');await p.waitForSelector('#lge');ok(true,'sign out returns to login');{await p.fill('#lge','gsb@x.com');await p.fill('#lgp','999999');await p.click('#lgi');await p.waitForTimeout(600);ok((await p.innerText('#lgm')).length>5&&!(await p.isVisible('#nav')),'wrong PIN refused: '+await p.innerText('#lgm'));await p.fill('#lgp','123456');await p.click('#lgi');await p.waitForSelector('#nav button:visible',{timeout:5000});ok(true,'sign in with email + PIN (no code)');}
  // --- Admin flow
  g.post({action:'add',token:g.post({action:'verify',email:'gsb@x.com',code:(g.post({action:'reqcode',email:'gsb@x.com'}),g.mails.pop().subject.match(/(\d{6})/)[1]),pin:'123456'}).token||'',rec:{},photo:''});
  const c2=await ctxFor(),q=await open(c2);
  await signin(q,'iggy@example.com');
  const atabs=await q.$$eval('#nav button',bs=>bs.filter(x=>x.offsetParent).map(x=>x.dataset.tab));
  ok(atabs.length===9&&await q.isVisible('#bnew')&&atabs.includes('rev')&&atabs.includes('set'),'admin sees all tabs: '+atabs);
  await q.click('#nav [data-tab=set]');await q.waitForSelector('#usl table');ok((await q.textContent('#usl')).includes('gsb@x.com'),'users list shows IC');
  await q.click('#bnew');
  await q.fill('#nd','2026-10-10');await q.selectOption('#nc','WEN');await q.fill('#nn','Dewi Lestari');await q.fill('#ni','EO 321');await q.fill('#np','Helper');await q.selectOption('#nvp .vsel','2');await q.fill('#nb','Iggy');
  await q.click('#sv');await q.waitForSelector('#tab-reg.on table');ok((await q.textContent('#tab-reg')).includes('Dewi Lestari'),'admin adds a verified warning directly');
  // IC adds another for review
  const p2=await open(await ctxFor());await signin(p2,'gsb@x.com');
  g.post({action:'reqcode',email:'gsb@x.com'});
  await p2.click('#bnew');await p2.fill('#id_b','EO 888');await p2.fill('#id_n','Eko Prasetyo');await p2.fill('#id_p','Fitter');await p2.selectOption('#id_vp2 .vsel','9');await p2.setInputFiles('#id_f',tmp);await p2.waitForFunction(()=>document.getElementById('id_pv').style.display==='block');await p2.click('#id_s');await p2.waitForFunction(()=>/Sent/.test(document.getElementById('toast').textContent));
  await q.click('#nav [data-tab=dash]');await q.reload();
  ok(true,'reload keeps session');
  await q.waitForSelector('#nav button:visible');
  await q.click('#nav [data-tab=rev]');await q.waitForSelector('#tab-rev .card[data-id]');
  ok((await q.textContent('#tab-rev')).includes('Eko Prasetyo'),'review queue shows the IC warning');
  await q.click('#tab-rev [data-p]');await q.waitForSelector('#pm.on img');ok(true,'badge photo opens');await q.click('#pmc');
  await q.click('#tab-rev [data-v]');await q.waitForFunction(()=>!document.querySelector('#tab-rev .card[data-id]'));ok(true,'verify empties the queue');
  await q.click('#nav [data-tab=reg]');ok((await q.textContent('#tab-reg')).includes('Verified'),'register shows Verified');
  await q.click('#nav [data-tab=legal]');ok((await q.textContent('#tab-legal')).includes("EcoOils' role"),'legal tab has the new role section');
  await q.screenshot({path:'/tmp/admin390.png',fullPage:false});
  // --- v2.1: HSSE posts a photo, IC completes it
  await q.click('#nav [data-tab=post]');await q.selectOption('#pc','GSB');await q.selectOption('#pvp .vsel','0');
  await q.setInputFiles('#pf',tmp);await q.waitForFunction(()=>document.getElementById('pp2').style.display==='block');await q.click('#ps');
  await q.waitForFunction(()=>/Posted/.test(document.getElementById('toast').textContent));
  await q.click('#nav [data-tab=rev]');ok((await q.innerText('#tab-rev')).toLowerCase().includes('waiting for ic details'),'admin sees the awaiting table');
  g.clearWait();const p3=await open(await ctxFor());await signin(p3,'gsb@x.com');
  ok((await p3.innerText('#tab-wait')).includes('Not wearing safety glasses'),'IC lands on Waiting for you with the posted item');
  await p3.click('#tab-wait [data-f]');await p3.waitForSelector('#id_x');
  ok(await p3.evaluate(()=>document.getElementById('id_v').readOnly&&document.getElementById('id_d').readOnly),'date and violation are locked when completing');
  await p3.fill('#id_b','EO 4545');await p3.fill('#id_n','Gunawan');await p3.fill('#id_p','Fitter');await p3.click('#id_s');
  await p3.waitForFunction(()=>document.getElementById('tab-wait').classList.contains('on')&&!document.querySelector('#tab-wait [data-f]'));ok(true,'item leaves the waiting list after filling');
  await q.click('#nav [data-tab=dash]');await q.reload();await q.waitForSelector('#nav button:visible');await q.click('#nav [data-tab=rev]');
  ok((await q.innerText('#tab-rev')).includes('Gunawan'),'admin Review now shows it as Pending to verify');
  // --- v2.2: admin 'IC view' preview
  await q.click('#nav [data-tab=icv]');await q.selectOption('#icc','GSB');await q.click('#icg');await q.waitForSelector('#tab-wait.on');
  const pt=await q.$$eval('#nav button',bs=>bs.filter(x=>x.offsetParent).map(x=>x.dataset.tab));
  ok(JSON.stringify(pt)==='["wait","reg","wk","out"]','IC view shows exactly the IC tabs: '+pt);
  ok((await q.innerText('#pvb')).includes('Preview only'),'preview banner shown');
  ok(!(await q.innerText('#tab-wait')).includes('WEN'),'IC view lists only that company');
  await q.click('#bnew');await q.fill('#id_b','EO 9090');await q.fill('#id_n','Test');await q.fill('#id_p','x');await q.selectOption('#id_vp2 .vsel','0');await q.setInputFiles('#id_f',tmp);await q.waitForFunction(()=>document.getElementById('id_pv').style.display==='block');
  const before=g.post({action:'list',token:A}).records.length;await q.click('#id_s');await q.waitForTimeout(500);
  ok(g.post({action:'list',token:A}).records.length===before&&/Preview only/.test(await q.textContent('#toast')),'sending is blocked in the preview');
  await q.click('#nav [data-tab=out]');await q.waitForSelector('#tab-icv.on');
  ok((await q.$$eval('#nav button',bs=>bs.filter(x=>x.offsetParent).length))===9,'exit returns to the admin menu');
  // --- v2.3 viewer UI
  g.post({action:'usersave',token:A,user:{email:'ron@x.com',name:'Ron',company:'EcoOils',role:'viewer'}});
  g.clearWait();const pv=await open(await ctxFor());await signin(pv,'ron@x.com');
  const vt=await pv.$$eval('#nav button',bs=>bs.filter(x=>x.offsetParent).map(x=>x.dataset.tab));
  ok(vt.join()==='dash,reg,post,rev,wk,legal,out','viewer tabs: '+vt);ok(!(await pv.isVisible('#bnew')),'viewer has no New Warning button');
  await pv.click('#nav [data-tab=reg]');await pv.waitForSelector('#tab-reg table');
  ok((await pv.$$('#tab-reg [data-e],#tab-reg [data-d],#tab-reg [data-l]')).length===0&&(await pv.innerText('#tab-reg')).includes('Dewi Lestari'),'viewer sees the full register without edit/delete/letter');
  // languages
  for(const l of['id','ms']){await q.click('.lang [data-lang='+l+']');await q.click('#nav [data-tab=rev]');}
  ok(errs.length===0,'no page errors '+errs.join('|'));
  console.log(fails?'FAILED '+fails:'ALL UI TESTS PASS');await b.close();process.exit(fails?1:0)})();
