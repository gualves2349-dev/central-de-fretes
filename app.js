import {initializeApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged,createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,doc,setDoc,getDoc,collection,addDoc,getDocs,query,where,updateDoc,runTransaction,serverTimestamp,Timestamp,orderBy} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {firebaseConfig} from "./firebase-config.js";
const $=id=>document.getElementById(id), msg=t=>$("message").textContent=t;
if(firebaseConfig.apiKey==="COLE_AQUI") msg("Configure firebase-config.js para ativar o sistema.");
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app);
let user=null,role=null,accountCreatedAt=null,subscriptionEnd=null,isAdmin=false,accessTimer=null;
const TRIAL_MS=60*60*1000, LEGACY_CUTOFF=Date.parse('2026-11-23T00:00:00-03:00');
const pixKey=''; // CONFIGURE A CHAVE PIX NO PAINEL DO ADMIN, NÃO AQUI
function accessExpires(){if(isAdmin)return Infinity;if(!accountCreatedAt)return 0;if(accountCreatedAt<LEGACY_CUTOFF)return Infinity;return Math.max(accountCreatedAt+TRIAL_MS,subscriptionEnd||0);}
function hasAccess(){return !!user && Date.now()<accessExpires();}
function formatTime(ms){const s=Math.max(0,Math.ceil(ms/1000));return `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor(s%3600/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}
function updateAccessUI(){if(!user)return;const allowed=hasAccess();$('workspace').hidden=!allowed||isAdmin;$('paywall').hidden=allowed||isAdmin;$('adminPanel').hidden=!isAdmin;$('logout').hidden=false;const label=$('trialLabel');label.hidden=isAdmin;if(allowed){label.textContent=accessExpires()===Infinity?'Acesso liberado':subscriptionEnd&&subscriptionEnd>Date.now()?'Assinatura ativa até '+new Date(subscriptionEnd).toLocaleDateString('pt-BR'):'Demo restante: '+formatTime(accessExpires()-Date.now());}else{label.textContent='Acesso expirado — escolha um plano';} }
async function readSubscription(){subscriptionEnd=null;try{const snap=await getDoc(doc(db,'subscriptions',user.uid));if(snap.exists())subscriptionEnd=snap.data().expiresAt?.toMillis?.()||0;}catch(e){console.warn('Assinatura:',e.message);}updateAccessUI();}
async function initAccess(u){clearInterval(accessTimer);isAdmin=false;accountCreatedAt=null;subscriptionEnd=null;const admin=await getDoc(doc(db,'admins',u.uid));if(admin.exists()){isAdmin=true;role='admin';updateHeaderIdentity('Administrador');updateAccessUI();await loadAdmin();await loadPixKey();return;}const p=await getDoc(doc(db,'users',u.uid));role=p.data()?.role;accountCreatedAt=p.data()?.createdAt?.toMillis?.()||null;if(!role){msg('Perfil ainda não encontrado. Se acabou de se cadastrar, aguarde alguns segundos e entre novamente.');return;}await readSubscription();await loadPixKey();accessTimer=setInterval(()=>{const before=$('workspace').hidden;updateAccessUI();if(!before&&$('workspace').hidden)msg('Seu período de demonstração terminou. Escolha um plano para continuar.');},1000);await loadProfile(u);updateAccessUI();}

const safe=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let authMode="login";
function setAuthMode(mode){authMode=mode;const registering=mode==="register";$("loginRoleBlock").hidden=registering;$("registerRoleBlock").hidden=!registering;$("authTitle").textContent=registering?"Crie sua conta":"Acesse sua conta";$("authHint").textContent=registering?"Escolha seu perfil. Essa escolha ficará vinculada à sua conta.":"Entre com seu e-mail e senha.";$("authSubmit").textContent=registering?"Criar conta":"Entrar";$("password").autocomplete=registering?"new-password":"current-password";for(const [id,active] of [["loginTab",!registering],["registerTab",registering]]){$(id).classList.toggle("active",active);$(id).setAttribute("aria-pressed",String(active));}msg("");}
$("loginTab").onclick=()=>setAuthMode("login");
$("registerTab").onclick=()=>setAuthMode("register");
$("authForm").addEventListener("submit",async e=>{e.preventDefault();try{let email=$("email").value.trim(),password=$("password").value;if(authMode==="register"){let selected=document.querySelector('input[name="role"]:checked').value;let c=await createUserWithEmailAndPassword(auth,email,password);await setDoc(doc(db,"users",c.user.uid),{email,role:selected,createdAt:serverTimestamp()});role=selected;await initAccess(c.user);}else await signInWithEmailAndPassword(auth,email,password);}catch(err){msg("Erro de acesso: "+err.message)}});
$("logout").onclick=()=>signOut(auth);$("sideLogout").onclick=()=>signOut(auth);
async function loadProfile(u){try{let p=await getDoc(doc(db,"users",u.uid));role=p.data()?.role;if(!role){msg("Perfil não encontrado. Verifique o cadastro no Firestore.");return;}$("loginRole").value=role==="prestador"?"Prestador de fretes":"Contratante";updateHeaderIdentity();document.querySelector('[data-view="publicar"]').hidden=role!=="contratante";document.querySelector('[data-view="veiculos"]').hidden=role!=="prestador";await loadProfessionalProfile();
$("homePublish").hidden=role!=="contratante";
document.querySelectorAll(".only-contractor").forEach(el=>el.hidden=role!=="contratante");
document.querySelectorAll(".only-provider").forEach(el=>el.hidden=role!=="prestador");
document.querySelector('[data-view="inicio"]').click();}catch(e){msg(e.message)}}
onAuthStateChanged(auth,async u=>{user=u;$('auth').hidden=!!u;$('workspace').hidden=true;$('paywall').hidden=true;$('adminPanel').hidden=true;$('logout').hidden=!u;clearInterval(accessTimer);if(!u){role=null;isAdmin=false;profileForm.reset();updateHeaderIdentity();$('trialLabel').hidden=true;$('loginRole').value='Identificado após entrar';return;}try{await initAccess(u);}catch(e){msg('Erro ao carregar acesso: '+e.message);}});
for(const uf of "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ")){const option=document.createElement("option");option.value=uf;option.textContent=uf;$("profileUF").append(option);}
const profileFields=["responsavel","empresa","documento","telefone","emergenciaNome","emergenciaTelefone","cep","uf","cidade","bairro","logradouro","numero","complemento","grupoWhatsapp","observacoes"];
const profileForm=$("profileForm");
function updateHeaderIdentity(name=""){
 const el=$("headerIdentity");
 if(!user||!role){el.textContent="";el.hidden=true;return;}
 if(isAdmin){el.textContent="Admin — "+user.email;el.hidden=false;return;}
 const kind=role==="contratante"?"Perfil Contratante":"Perfil Prestador";
 const fullName=String(name||profileForm.elements.namedItem("responsavel")?.value||"").trim();
 el.textContent=[kind,user.email,fullName].filter(Boolean).join(" — ");
 el.hidden=false;
}

async function loadProfessionalProfile(){
 if(!user)return;
 try{
  const snap=await getDoc(doc(db,"professionalProfiles",user.uid));
  const data=snap.exists()?snap.data():{};
  for(const name of profileFields){const el=profileForm.elements.namedItem(name);if(el)el.value=["telefone","emergenciaTelefone"].includes(name)?phoneMask(data[name]??""):(data[name]??"");}
  $("companyNameField").hidden=role!=="contratante";
  $("documentLabel").querySelector("input").placeholder=role==="contratante"?"CNPJ (opcional)":"CPF (opcional)";
  updateHeaderIdentity(data.responsavel);$("profileStatus").textContent=snap.exists()?"Perfil carregado.":"Complete seu perfil profissional.";
 }catch(err){updateHeaderIdentity();$("profileStatus").textContent="Erro ao carregar perfil: "+err.message;}
}

function phoneMask(value){
 const v=String(value||"").replace(/\D/g,"").slice(0,11);
 if(v.length<=2)return v.length?"("+v:"";
 if(v.length<=6)return "("+v.slice(0,2)+") "+v.slice(2);
 if(v.length<=10)return "("+v.slice(0,2)+") "+v.slice(2,6)+"-"+v.slice(6);
 return "("+v.slice(0,2)+") "+v.slice(2,7)+"-"+v.slice(7);
}
for(const name of ["telefone","emergenciaTelefone"]){
 const field=profileForm.elements.namedItem(name);
 field.addEventListener("input",()=>{field.value=phoneMask(field.value);});
}
const cepField=profileForm.elements.namedItem("cep");
cepField.addEventListener("input",()=>{
 const v=cepField.value.replace(/\D/g,"").slice(0,8);
 cepField.value=v.length>5?v.slice(0,5)+"-"+v.slice(5):v;
});
let cepRequest=0;
cepField.addEventListener("blur",async()=>{
 const cep=cepField.value.replace(/\D/g,"");
 if(cep.length!==8)return;
 const request=++cepRequest;
 $("profileStatus").textContent="Consultando CEP...";
 try{
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),6500);
  let response;
  try{response=await fetch("https://viacep.com.br/ws/"+cep+"/json/",{signal:controller.signal});}
  finally{clearTimeout(timeout);}
  if(!response.ok)throw new Error("Serviço de CEP indisponível.");
  const data=await response.json();
  if(request!==cepRequest)return;
  if(data.erro){$("profileStatus").textContent="CEP não encontrado. Preencha o endereço manualmente.";return;}
  for(const [field,value] of Object.entries({uf:data.uf,cidade:data.localidade,bairro:data.bairro,logradouro:data.logradouro})){
   const el=profileForm.elements.namedItem(field);
   if(el&&value)el.value=value;
  }
  $("profileStatus").textContent="Endereço localizado pelo CEP. Confira número e complemento.";
 }catch(e){if(request===cepRequest)$("profileStatus").textContent="Não foi possível consultar o CEP. Preencha manualmente.";}
});

profileForm.addEventListener("submit",async e=>{
 e.preventDefault();
 if(!user||!role||!hasAccess())return;
 const data={};
 for(const name of profileFields)data[name]=String(profileForm.elements.namedItem(name)?.value??"").trim();
 if(data.grupoWhatsapp){
  try{const url=new URL(data.grupoWhatsapp);if(url.protocol!=="https:"||url.hostname!=="chat.whatsapp.com")throw Error();}catch{$("profileStatus").textContent="Use um link válido de grupo: https://chat.whatsapp.com/...";return;}
 }
 if(!/^\d{10,13}$/.test(data.telefone.replace(/\D/g,""))){$("profileStatus").textContent="Informe um telefone com DDD válido.";return;}
 try{
  await setDoc(doc(db,"professionalProfiles",user.uid),{...data,ownerId:user.uid,role,updatedAt:serverTimestamp()},{merge:true});
  updateHeaderIdentity(data.responsavel);$("profileStatus").textContent="Perfil profissional salvo com sucesso.";
 }catch(err){$("profileStatus").textContent="Erro ao salvar perfil: "+err.message;}
});

document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>document.querySelector(`[data-view="${b.dataset.go}"]`)?.click());
document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>{document.querySelectorAll(".view").forEach(v=>v.hidden=v.id!==b.dataset.view);document.querySelectorAll("[data-view]").forEach(x=>{x.classList.toggle("active",x===b);x.setAttribute("aria-current",x===b?"page":"false");});
$("viewHeading").textContent=({inicio:"Visão geral",fretes:"Fretes disponíveis",publicar:"Publicar frete",veiculos:"Meus veículos",candidaturas:"Candidaturas",perfil:"Meu perfil"})[b.dataset.view]||"Central de Fretes";refresh()});
$("freightForm").onsubmit=async e=>{e.preventDefault();if(role!=="contratante"||!hasAccess())return;try{let d=Object.fromEntries(new FormData(e.target));await addDoc(collection(db,"freights"),{...d,origemUF:stateFromLocation(d.origem),destinoUF:stateFromLocation(d.destino),peso:Number(d.peso),valor:d.valor?Number(d.valor):null,ownerId:user.uid,status:"aberto",createdAt:serverTimestamp()});e.target.reset();msg("Frete publicado.");await refresh();}catch(err){msg(err.message)}};
const plateInput=$("vehiclePlate"),plateFeedback=$("plateFeedback");
function normalizePlate(value){let raw=value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,7);return /^[A-Z]{3}[0-9]{4}$/.test(raw)?raw.slice(0,3)+"-"+raw.slice(3):raw;}
function validPlate(value){return /^[A-Z]{3}[0-9]{4}$/.test(value)||/^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(value);}
function checkPlate(){let raw=plateInput.value.replace(/[^A-Z0-9]/g,"");let ok=validPlate(raw);plateInput.setCustomValidity(ok?"":"Informe uma placa válida no formato ABC-1234 ou ABC1D23.");plateFeedback.textContent=ok?"Formato "+(/^[A-Z]{3}[0-9]{4}$/.test(raw)?"antigo":"Mercosul")+" reconhecido.":"Use o padrão antigo ABC-1234 ou Mercosul ABC1D23.";plateFeedback.classList.toggle("plate-valid",ok);return ok;}
plateInput.addEventListener("input",()=>{plateInput.value=normalizePlate(plateInput.value);plateInput.setCustomValidity("");plateFeedback.textContent="Aceita placas antigas e Mercosul. A placa não será exibida nos anúncios.";plateFeedback.classList.remove("plate-valid");});
plateInput.addEventListener("blur",checkPlate);
$("vehicleForm").onsubmit=async e=>{e.preventDefault();if(role!=="prestador"||!hasAccess())return;if(!checkPlate()){plateInput.reportValidity();return;}try{let d=Object.fromEntries(new FormData(e.target));for(const field of ["ano","comprimento","largura","altura"]){d[field]=d[field]?Number(d[field]):null;}await addDoc(collection(db,"vehicles"),{...d,capacidade:Number(d.capacidade),ownerId:user.uid,createdAt:serverTimestamp()});e.target.reset();plateFeedback.textContent="Aceita placas antigas e Mercosul. A placa não será exibida nos anúncios.";plateFeedback.classList.remove("plate-valid");msg("Veículo cadastrado.");await refresh();}catch(err){msg(err.message)}};
const UFS=["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
for(const id of ["filterOrigin","filterDestination"]){for(const uf of UFS){const opt=document.createElement("option");opt.value=uf;opt.textContent=uf;$(id).append(opt)}}
let visibleFreights=10;
const normalizeText=s=>String(s??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
const stateFromLocation=value=>{const text=normalizeText(value).trim();const match=text.match(/(?:^|[\s,\-/])([A-Z]{2})\s*$/);return match&&UFS.includes(match[1])?match[1]:"";};
function filteredFreightDocs(docs){const origin=$("filterOrigin").value,destination=$("filterDestination").value,body=$("filterBody").value;return docs.filter(f=>{const d=f.data();const from=d.origemUF||stateFromLocation(d.origem),to=d.destinoUF||stateFromLocation(d.destino);return (!origin||from===origin)&&(!destination||to===destination)&&(!body||d.carroceria===body||d.carroceria==="qualquer");});}
$("searchFreights").onclick=()=>{visibleFreights=10;refresh()};
$("clearFreightFilters").onclick=()=>{$("filterOrigin").value="";$("filterDestination").value="";$("filterBody").value="";$("filterStatus").value="novas";visibleFreights=10;refresh()};
$("moreFreights").onclick=()=>{visibleFreights+=10;refresh()};

async function refresh(){if(!user||!role||!hasAccess())return;try{
const apps=await getDocs(query(collection(db,"applications"),where(role==="contratante"?"ownerId":"applicantId","==",user.uid)));
const ownApplications=new Map();
if(role==="prestador")apps.forEach(a=>{const d=a.data();if(!ownApplications.has(d.freightId)||d.status==="aceita")ownApplications.set(d.freightId,d.status)});
let pending=0,accepted=0,rejected=0;
apps.forEach(a=>{const s=a.data().status;if(s==="pendente")pending++;if(s==="aceita")accepted++;if(s==="recusada")rejected++;});
$("metricPending").textContent=pending;
$("metricAccepted").textContent=accepted;
$("metricRejected").textContent=rejected;
const statusFilter=$("filterStatus").value;
const openSnapshot=await getDocs(query(collection(db,"freights"),where("status","==","aberto")));
$("metricFreights").textContent=role==="contratante"?openSnapshot.docs.filter(x=>x.data().ownerId===user.uid).length:openSnapshot.size;
$("metricFreightsLabel").textContent=role==="contratante"?"Meus fretes abertos":"Fretes disponíveis";
const openDocs=filteredFreightDocs(openSnapshot.docs);
const display=[];
if(statusFilter==="novas"||statusFilter==="todas")for(const freight of openDocs){const state=ownApplications.get(freight.id);if(statusFilter==="todas"||!state)display.push({freight,application:null,status:state||"novas"});}
if(statusFilter!=="novas"){
 const history=[];
 apps.forEach(a=>{const data=a.data();if(statusFilter==="todas"||data.status===statusFilter)history.push({id:a.id,data});});
 const missing=[...new Set(history.map(a=>a.data.freightId))].filter(id=>!openDocs.some(f=>f.id===id));
 const extra=new Map();
 await Promise.all(missing.map(async id=>{try{const snap=await getDoc(doc(db,"freights",id));if(snap.exists())extra.set(id,snap);}catch(_){}}));
 for(const a of history){const freight=openDocs.find(f=>f.id===a.data.freightId)||extra.get(a.data.freightId);if(!freight)continue;if(!filteredFreightDocs([freight]).length)continue;display.push({freight,application:a.data,status:a.data.status});}
}
$("freightCount").textContent=display.length+" resultado(s) na Central";
$("moreFreights").hidden=display.length<=visibleFreights;
$("freightList").innerHTML="";
if(!display.length){const empty=document.createElement("p");empty.className="muted";empty.textContent="Nenhum frete corresponde aos filtros e à situação selecionada.";$("freightList").append(empty)}
for(const entry of display.slice(0,visibleFreights)){
 const f=entry.freight,d=f.data(),status=entry.status,el=document.createElement("div");
 el.className="item freight-status status-"+status;
 const title=document.createElement("b");title.textContent=d.origem+" → "+d.destino;el.append(title);
 const tag=document.createElement("span");tag.className="status-tag";tag.textContent=({novas:"Nova",pendente:"Aguardando aceite",aceita:"Aceita",recusada:"Recusada"})[status]||status;el.append(tag);
 const detail=document.createElement("p");detail.textContent=[d.descricao,d.peso+" kg",d.carroceria,d.data].join(" · ");el.append(detail);
 const price=document.createElement("p");price.className="muted";price.textContent=d.valor!=null?"R$ "+Number(d.valor).toLocaleString("pt-BR",{minimumFractionDigits:2}):"Valor a negociar";el.append(price);
 if(status==="recusada"&&entry.application?.rejectionReason){const reason=document.createElement("p");reason.className="rejection-note";reason.textContent="Motivo da recusa: "+entry.application.rejectionReason;el.append(reason)}
 if(role==="contratante"&&d.ownerId===user.uid&&d.status==="aberto"&&!entry.application){
  const remove=document.createElement("button");
  remove.type="button";remove.className="danger-outline";remove.textContent="Retirar anúncio";
  remove.onclick=async()=>{
   const hasApps=apps.docs.some(a=>a.data().freightId===f.id);
   const explanation=hasApps?"Existem candidaturas vinculadas. O anúncio será retirado da lista, mas as candidaturas continuarão no histórico.":"O anúncio deixará de aparecer nos fretes disponíveis.";
   if(!window.confirm("Retirar este frete?\n\n"+explanation+"\n\nEsta ação não pode ser desfeita."))return;
   remove.disabled=true;
   try{
    await updateDoc(doc(db,"freights",f.id),{status:"cancelado"});
    msg("Frete retirado dos anúncios disponíveis.");
    await refresh();
   }catch(err){msg("Erro ao retirar anúncio: "+err.message);remove.disabled=false;}
  };
  el.append(remove);
 }
 if(role==="prestador"&&status==="novas"){
 const b=document.createElement("button");b.textContent="Candidatar-se";b.onclick=async()=>{b.disabled=true;b.textContent="Enviando candidatura...";try{await apply(f.id,d)}finally{if(b.isConnected){b.disabled=false;b.textContent="Candidatar-se"}}};el.append(b);
 }
 $("freightList").append(el);
}
let vs=await getDocs(query(collection(db,"vehicles"),where("ownerId","==",user.uid)));$("vehicleList").innerHTML="";vs.forEach(v=>{let d=v.data(),el=document.createElement("p");el.textContent=`${d.modelo} — ${d.capacidade} kg — ${d.carroceria}`;$("vehicleList").append(el)});
$("applicationList").innerHTML="";apps.forEach(a=>{let d=a.data();if(d.applicantId!==user.uid&&d.ownerId!==user.uid)return;let el=document.createElement("div");el.className="item";el.textContent=`Frete ${d.freightId} — ${d.status==="pendente"?"Aguardando aceite do contratante":d.status==="aceita"?"Aceita":d.status==="recusada"?"Recusada":d.status}${d.rejectionReason?" — Motivo: "+d.rejectionReason:""}`;el.classList.add("freight-status","status-"+d.status);if(role==="contratante"&&d.ownerId===user.uid&&d.status==="pendente"){for(let status of ["aceita","recusada"]){let b=document.createElement("button");b.textContent=status==="aceita"?"Aceitar":"Recusar";b.onclick=async()=>{try{
 if(status==="aceita"){
  await runTransaction(db,async tx=>{
   const freightRef=doc(db,"freights",d.freightId),appRef=doc(db,"applications",a.id);
   const freightSnap=await tx.get(freightRef),appSnap=await tx.get(appRef);
   if(!freightSnap.exists()||freightSnap.data().status!=="aberto"||freightSnap.data().ownerId!==user.uid)throw new Error("Este frete já foi encerrado ou não está disponível.");
   if(!appSnap.exists()||appSnap.data().status!=="pendente"||appSnap.data().ownerId!==user.uid)throw new Error("Esta candidatura não está mais pendente.");
   tx.update(freightRef,{status:"fechado",acceptedApplicationId:a.id});
   tx.update(appRef,{status:"aceita"});
  });
  msg("Candidatura aceita. O frete saiu da lista de disponíveis.");
 }else{
  const reason=window.prompt("Informe o motivo da recusa (obrigatório, de 5 a 500 caracteres):","");
  if(reason===null)return;
  const cleaned=reason.trim();
  if(cleaned.length<5||cleaned.length>500){msg("Informe um motivo entre 5 e 500 caracteres.");return;}
  await updateDoc(doc(db,"applications",a.id),{status:"recusada",rejectionReason:cleaned});
  msg("Candidatura recusada. O motivo ficará visível ao prestador.");
 }
 await refresh();
}catch(e){msg("Não foi possível atualizar: "+e.message)}};el.append(b)}}$("applicationList").append(el)});
}catch(e){msg("Não foi possível carregar os dados: "+e.message)}}
async function apply(id,d){try{let vehicles=await getDocs(query(collection(db,"vehicles"),where("ownerId","==",user.uid)));let eligible=vehicles.docs.filter(v=>v.data().capacidade>=d.peso&&(d.carroceria==="qualquer"||v.data().carroceria===d.carroceria));if(!eligible.length){msg("Cadastre um veículo com capacidade e carroceria compatíveis.");return;}let existing=await getDocs(query(collection(db,"applications"),where("freightId","==",id),where("applicantId","==",user.uid)));if(!existing.empty){msg("Você já se candidatou a este frete.");return;}await addDoc(collection(db,"applications"),{freightId:id,ownerId:d.ownerId,applicantId:user.uid,vehicleId:eligible[0].id,status:"pendente",createdAt:serverTimestamp()});msg("Candidatura enviada.");await refresh()}catch(e){msg(e.message)}}


// Pagamento manual: solicitação não ativa assinatura; só a conta admin pode aprovar.
let selectedPlan='mensal';
document.querySelectorAll('[data-plan]').forEach(b=>b.addEventListener('click',()=>{selectedPlan=b.dataset.plan;document.querySelectorAll('[data-plan]').forEach(x=>x.classList.toggle('selected',x===b));$('paymentAmount').textContent=selectedPlan==='mensal'?'R$ 49,00':'R$ 490,00';}));
$('requestPayment').onclick=async()=>{if(!user)return;const btn=$('requestPayment');btn.disabled=true;try{const snap=await getDocs(query(collection(db,'paymentRequests'),where('userId','==',user.uid)));if(snap.docs.some(x=>x.data().status==='pendente')){msg('Você já possui uma solicitação pendente. Aguarde a conferência.');return;}await addDoc(collection(db,'paymentRequests'),{userId:user.uid,email:user.email,role,plan:selectedPlan,amount:selectedPlan==='mensal'?49:490,status:'pendente',createdAt:serverTimestamp()});msg('Solicitação enviada. O administrador irá conferir o Pix no Itaú.');$('paymentNotice').textContent='Solicitação registrada. Aguarde a conferência do pagamento.';}catch(e){msg('Não foi possível solicitar: '+e.message);}finally{btn.disabled=false;}};
$('refreshPayment').onclick=async()=>{await readSubscription();if(hasAccess())await loadProfile(user);else msg('Ainda não há assinatura ativa.');};
$('adminRefresh').onclick=loadAdmin;
async function loadAdmin(){if(!isAdmin)return;const list=$('adminRequests');list.replaceChildren();try{const snap=await getDocs(collection(db,'paymentRequests'));const pending=snap.docs.filter(d=>d.data().status==='pendente').sort((a,b)=>(a.data().createdAt?.seconds||0)-(b.data().createdAt?.seconds||0));$('pendingCount').textContent=pending.length;for(const entry of pending){const d=entry.data(),el=document.createElement('div');el.className='payment-request';const title=document.createElement('strong');title.textContent=d.email+' — '+(d.plan==='anual'?'Anual R$ 490':'Mensal R$ 49');const note=document.createElement('small');note.textContent='UID: '+d.userId+' · Solicitação: '+entry.id;const buttons=document.createElement('div');buttons.className='request-actions';for(const decision of ['aprovado','recusado']){const btn=document.createElement('button');btn.textContent=decision==='aprovado'?'Aprovar Pix':'Recusar';if(decision==='recusado')btn.className='secondary-btn';btn.onclick=async()=>{if(decision==='aprovado'&&!confirm('Você CONFERIU o crédito deste Pix no extrato do Itaú?'))return;const reason=decision==='recusado'?prompt('Motivo da recusa (mínimo 5 caracteres):'):'';if(decision==='recusado'&&(!reason||reason.trim().length<5))return;btn.disabled=true;try{const requestRef=doc(db,'paymentRequests',entry.id),subRef=doc(db,'subscriptions',d.userId);await runTransaction(db,async tx=>{const current=await tx.get(requestRef);if(!current.exists()||current.data().status!=='pendente')throw Error('Solicitação já processada.');let base=Date.now();if(decision==='aprovado'){const prev=await tx.get(subRef);const prior=prev.exists()?prev.data().expiresAt?.toMillis?.()||0:0;base=Math.max(base,prior);const expiry=new Date(base);if(d.plan==='anual')expiry.setFullYear(expiry.getFullYear()+1);else expiry.setDate(expiry.getDate()+30);tx.set(subRef,{userId:d.userId,plan:d.plan,status:'ativa',expiresAt:Timestamp.fromDate(expiry),approvedBy:user.uid,updatedAt:serverTimestamp()});}tx.update(requestRef,{status:decision,reviewedBy:user.uid,reviewedAt:serverTimestamp(),...(decision==='recusado'?{reason:reason.trim()}:{})});});msg(decision==='aprovado'?'Assinatura aprovada.':'Solicitação recusada.');await loadAdmin();}catch(e){msg('Erro: '+e.message);btn.disabled=false;}};buttons.append(btn);}el.append(title,note,buttons);list.append(el);}if(!pending.length)list.textContent='Nenhuma solicitação pendente.';}catch(e){msg('Erro ao carregar pagamentos: '+e.message);}}

async function loadPixKey(){try{const snap=await getDoc(doc(db,'paymentSettings','pix'));const key=snap.exists()?String(snap.data().key||''):'';$('pixDisplay').textContent=key||'Consulte o administrador';if(isAdmin)$('adminPixKey').value=key;}catch(e){console.warn('Configuração Pix:',e.message);}}
$('copyPix').onclick=async()=>{const key=$('pixDisplay').textContent;if(!key||key==='Consulte o administrador')return;try{await navigator.clipboard.writeText(key);msg('Chave Pix copiada.');}catch(e){msg('Selecione e copie a chave Pix exibida.');}};
$('savePixKey').onclick=async()=>{if(!isAdmin)return;const key=$('adminPixKey').value.trim();if(!key){msg('Informe a chave Pix.');return;}try{await setDoc(doc(db,'paymentSettings','pix'),{key,updatedAt:serverTimestamp(),updatedBy:user.uid});await loadPixKey();msg('Chave Pix atualizada.');}catch(e){msg('Erro ao salvar Pix: '+e.message);}};
