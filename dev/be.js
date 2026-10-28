const g=require('./gas.js')(__dirname+'/../apps-script/Code.gs');
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++};
const code=em=>{const m=g.mails.filter(x=>x.to===em).pop();return m&&m.subject.match(/(\d{6})/)[1]};
function login(em){const r=g.post({action:'reqcode',email:em});if(!r.ok)return r;const c=code(em);if(!c)return{ok:false,error:'nomail'};return g.post({action:'verify',email:em,code:c})}
const jpg=Buffer.from('fakejpegbytes1').toString('base64');
// admin bootstrap
const adm=login('iggy@example.com');
ok(adm.ok&&adm.me.role==='admin','admin logs in (seeded)');
const A=adm.token;
ok(g.post({action:'reqcode',email:'nobody@x.com'}).ok&&!g.mails.some(m=>m.to==='nobody@x.com'),'unknown email: same answer, no mail');
ok(g.post({action:'usersave',token:A,user:{email:'gsb@x.com',name:'GSB Admin',company:'GSB',role:'ic'}}).ok,'admin adds GSB IC');
ok(g.post({action:'usersave',token:A,user:{email:'wen@x.com',name:'WEN Admin',company:'WEN',role:'ic'}}).ok,'admin adds WEN IC');
const G=login('gsb@x.com').token,W=login('wen@x.com').token;ok(G&&W,'ICs log in');
ok(login('gsb@x.com').error==='wait','second code within 45 s refused');
// wrong code
g.post({action:'reqcode',email:'wen@x.com'});
// (wait cache blocks) -> skip
ok(g.post({action:'verify',email:'gsb@x.com',code:'000000'}).error==='code','wrong code refused');
// IC add
const rec={date:'2026-10-20',name:'Budi Santoso',empId:'EO 1234',position:'Rigger',level:'1',violation:'No helmet'};
ok(g.post({action:'add',token:G,rec}).error==='photo','photo mandatory for IC');
let r=g.post({action:'add',token:G,rec,photo:jpg});ok(r.ok&&r.status==='Pending','IC add -> Pending');
ok(g.post({action:'add',token:G,rec,photo:jpg}).error==='duplicate','duplicate refused');
let l=g.post({action:'list',token:G});ok(l.records.length===1&&!('flags' in l.records[0])&&l.records[0].hasPhoto==='1'&&!l.records[0].photoId,'IC sees own, no flags/photoId');
ok(g.post({action:'list',token:W}).records.length===0,'WEN IC sees nothing of GSB');
ok(g.post({action:'lookup',token:W,empId:'EO1234'}).other===true,'lookup from other company reveals nothing');
ok(g.post({action:'photo',token:W,id:1}).error==='forbidden','other company cannot fetch photo');
ok(g.post({action:'photo',token:G,id:1}).ok,'own company fetches photo');
ok(g.post({action:'review',token:G,id:1,decision:'verify'}).error==='forbidden','IC cannot verify');
ok(g.post({action:'delete',token:G,id:1}).error==='forbidden','IC cannot delete');
ok(g.post({action:'update',token:G,id:1,rec:{name:'X'}}).error==='forbidden','IC cannot edit');
ok(g.post({action:'users',token:G}).error==='forbidden','IC cannot list users');
ok(g.post({action:'import',token:G,records:[]}).error==='forbidden','IC cannot import');
ok(g.post({action:'list',token:'bogus'}).error==='auth','bad token refused');
// pending does not count for ladder
ok(g.post({action:'lookup',token:G,empId:'EO1234',date:'2026-10-25'}).maxA===0,'pending does not count');
ok(g.post({action:'review',token:A,id:1,decision:'reject'}).error==='note','reject needs a reason');
ok(g.post({action:'review',token:A,id:1,decision:'verify'}).ok,'admin verifies');
let lk=g.post({action:'lookup',token:G,empId:'eo-1234',date:'2026-10-25'});ok(lk.known&&lk.maxA===1&&lk.next===2&&lk.name==='Budi Santoso','lookup after verify: SP1 active -> SP2, key normalised');
// identity drift: same badge, other name; same name other badge; reused photo
r=g.post({action:'add',token:G,rec:{...rec,date:'2026-10-26',name:'Andi Wijaya',level:'2',violation:'Smoking'},photo:Buffer.from('other').toString('base64')});
let rr=g.post({action:'list',token:A}).records.find(x=>x.id==r.id);ok(rr.flags.includes('NAME_MISMATCH'),'NAME_MISMATCH flagged');
r=g.post({action:'add',token:G,rec:{...rec,empId:'EO 9999',date:'2026-10-27',violation:'Other'},photo:jpg});
rr=g.post({action:'list',token:A}).records.find(x=>x.id==r.id);ok(rr.flags.includes('SAME_NAME_NEW_BADGE')&&rr.flags.includes('PHOTO_REUSED'),'SAME_NAME_NEW_BADGE + PHOTO_REUSED flagged');
ok(g.post({action:'add',token:W,rec:{...rec,date:'2026-10-28',violation:'x'},photo:jpg}).error==='other_company','other company cannot add to a foreign badge');
ok(g.post({action:'add',token:G,rec:{...rec,date:'2027-01-01',violation:'f'},photo:jpg}).error==='future','future date refused');
// reject with reason visible to IC
ok(g.post({action:'review',token:A,id:3,decision:'reject',note:'badge not matching'}).ok,'reject');
l=g.post({action:'list',token:G});ok(l.records.find(x=>x.id==3).note==='badge not matching'&&l.records.find(x=>x.id==3).status==='Rejected','IC sees rejection reason');
// admin edit/delete/import + audit
ok(g.post({action:'update',token:A,id:2,rec:{name:'Budi Santoso'}}).ok,'admin edit');
ok(g.post({action:'delete',token:A,id:3}).ok&&!g.post({action:'list',token:A}).records.some(x=>x.id==3),'admin delete is soft and hides it');
const im=g.post({action:'import',token:A,records:[{date:'2026-01-05',company:'KKS',name:'Old Guy',empId:'EO 5',position:'x',level:'2',violation:'v'},{date:'2026-01-05',company:'KKS',name:'Old Guy',empId:'EO 5',position:'x',level:'2',violation:'v'}]});
ok(im.added===1&&im.duplicates===1,'import dedupes');
const au=g.post({action:'audit',token:A});ok(au.rows.some(r=>r[3]==='VERIFY')&&au.rows.some(r=>r[3]==='EDIT')&&au.rows.some(r=>r[3]==='DELETE')&&au.rows.some(r=>r[3]==='IMPORT'),'audit has VERIFY/EDIT/DELETE/IMPORT');
// deactivate
ok(g.post({action:'usersave',token:A,user:{email:'gsb@x.com',name:'GSB Admin',company:'GSB',role:'ic',active:'no'}}).ok&&g.post({action:'list',token:G}).error==='auth','deactivated user loses session at once');
ok(g.post({action:'usersave',token:A,user:{email:'iggy@example.com',role:'ic',company:'X'}}).error==='self','admin cannot demote self');
console.log(fails?'FAILED '+fails:'ALL BACKEND TESTS PASS');process.exit(fails?1:0);
