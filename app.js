import {initializeApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged,createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,doc,setDoc,getDoc,collection,addDoc,getDocs,query,where,updateDoc,runTransaction,serverTimestamp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {firebaseConfig} from "./firebase-config.js";
const $=id=>document.getElementById(id), msg=t=>$("message").textContent=t;
if(firebaseConfig.apiKey==="COLE_AQUI") msg("Configure firebase-config.js para ativar o sistema.");
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app);
let user=null,role=null;
const safe=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let authMode="login";
function setAuthMode(mode){authMode=mode;const registering=mode==="register";$("loginRoleBlock").hidden=registering;$("registerRoleBlock").hidden=!registering;$("authTitle").textContent=registering?"Crie sua conta":"Acesse sua conta";$("authHint").textContent=registering?"Escolha seu perfil. Essa escolha ficará vinculada à sua conta.":"Entre com seu e-mail e senha.";$("authSubmit").textContent=registering?"Criar conta":"Entrar";$("password").autocomplete=registering?"new-password":"current-password";for(const [id,active] of [["loginTab",!registering],["registerTab",registering]]){$(id).classList.toggle("active",active);$(id).setAttribute("aria-pressed",String(active));}msg("");}
$("loginTab").onclick=()=>setAuthMode("login");
$("registerTab").onclick=()=>setAuthMode("register");
$("authForm").addEventListener("submit",async e=>{e.preventDefault();try{let email=$("email").value.trim(),password=$("password").value;if(authMode==="register"){let selected=document.querySelector('input[name="role"]:checked').value;let c=await createUserWithEmailAndPassword(auth,email,password);await setDoc(doc(db,"users",c.user.uid),{email,role:selected,createdAt:serverTimestamp()});role=selected;await loadProfile(c.user);}else await signInWithEmailAndPassword(auth,email,password);}catch(err){msg("Erro de acesso: "+err.message)}});
$("logout").onclick=()=>signOut(auth);
async function loadProfile(u){try{let p=await getDoc(doc(db,"users",u.uid));role=p.data()?.role;if(!role){msg("Perfil não encontrado. Verifique o cadastro no Firestore.");return;}$("loginRole").value=role==="prestador"?"Prestador de fretes":"Contratante";$("identity").textContent=u.email+" — "+role;document.querySelector('[data-view="publicar"]').hidden=role!=="contratante";document.querySelector('[data-view="veiculos"]').hidden=role!=="prestador";document.querySelector('[data-view="fretes"]').click();}catch(e){msg(e.message)}}
onAuthStateChanged(auth,async u=>{user=u;$("auth").hidden=!!u;$("workspace").hidden=!u;$("logout").hidden=!u;if(!u){role=null;$("loginRole").value="Identificado após entrar";return;}await loadProfile(u);});
document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>{document.querySelectorAll(".view").forEach(v=>v.hidden=v.id!==b.dataset.view);document.querySelectorAll("[data-view]").forEach(x=>{x.classList.toggle("active",x===b);x.setAttribute("aria-current",String(x===b));});refresh()});
$("freightForm").onsubmit=async e=>{e.preventDefault();if(role!=="contratante")return;try{let d=Object.fromEntries(new FormData(e.target));await addDoc(collection(db,"freights"),{...d,origemUF:stateFromLocation(d.origem),destinoUF:stateFromLocation(d.destino),peso:Number(d.peso),valor:d.valor?Number(d.valor):null,ownerId:user.uid,status:"aberto",createdAt:serverTimestamp()});e.target.reset();msg("Frete publicado.");await refresh();}catch(err){msg(err.message)}};
const plateInput=$("vehiclePlate"),plateFeedback=$("plateFeedback");
function normalizePlate(value){let raw=value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,7);return /^[A-Z]{3}[0-9]{4}$/.test(raw)?raw.slice(0,3)+"-"+raw.slice(3):raw;}
function validPlate(value){return /^[A-Z]{3}[0-9]{4}$/.test(value)||/^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(value);}
function checkPlate(){let raw=plateInput.value.replace(/[^A-Z0-9]/g,"");let ok=validPlate(raw);plateInput.setCustomValidity(ok?"":"Informe uma placa válida no formato ABC-1234 ou ABC1D23.");plateFeedback.textContent=ok?"Formato "+(/^[A-Z]{3}[0-9]{4}$/.test(raw)?"antigo":"Mercosul")+" reconhecido.":"Use o padrão antigo ABC-1234 ou Mercosul ABC1D23.";plateFeedback.classList.toggle("plate-valid",ok);return ok;}
plateInput.addEventListener("input",()=>{plateInput.value=normalizePlate(plateInput.value);plateInput.setCustomValidity("");plateFeedback.textContent="Aceita placas antigas e Mercosul. A placa não será exibida nos anúncios.";plateFeedback.classList.remove("plate-valid");});
plateInput.addEventListener("blur",checkPlate);
$("vehicleForm").onsubmit=async e=>{e.preventDefault();if(role!=="prestador")return;if(!checkPlate()){plateInput.reportValidity();return;}try{let d=Object.fromEntries(new FormData(e.target));await addDoc(collection(db,"vehicles"),{...d,capacidade:Number(d.capacidade),ownerId:user.uid,createdAt:serverTimestamp()});e.target.reset();plateFeedback.textContent="Aceita placas antigas e Mercosul. A placa não será exibida nos anúncios.";plateFeedback.classList.remove("plate-valid");msg("Veículo cadastrado.");await refresh();}catch(err){msg(err.message)}};
const UFS=["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
for(const id of ["filterOrigin","filterDestination"]){for(const uf of UFS){const opt=document.createElement("option");opt.value=uf;opt.textContent=uf;$(id).append(opt)}}
let visibleFreights=10;
const normalizeText=s=>String(s??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
const stateFromLocation=value=>{const text=normalizeText(value).trim();const match=text.match(/(?:^|[\s,\-/])([A-Z]{2})\s*$/);return match&&UFS.includes(match[1])?match[1]:"";};
function filteredFreightDocs(docs){const origin=$("filterOrigin").value,destination=$("filterDestination").value,body=$("filterBody").value;return docs.filter(f=>{const d=f.data();const from=d.origemUF||stateFromLocation(d.origem),to=d.destinoUF||stateFromLocation(d.destino);return (!origin||from===origin)&&(!destination||to===destination)&&(!body||d.carroceria===body||d.carroceria==="qualquer");});}
$("searchFreights").onclick=()=>{visibleFreights=10;refresh()};
$("clearFreightFilters").onclick=()=>{$("filterOrigin").value="";$("filterDestination").value="";$("filterBody").value="";visibleFreights=10;refresh()};
$("moreFreights").onclick=()=>{visibleFreights+=10;refresh()};
$("fretebrasSearch").onclick=()=>{
 const from=$("filterOrigin").value,to=$("filterDestination").value;
 if(!from||!to){msg("Selecione a UF de origem e a UF de destino para pesquisar na Fretebras.");return;}
 const path=`https://www.fretebras.com.br/fretes/carga-de-${from.toLowerCase()}/carga-para-${to.toLowerCase()}`;
 window.open(path,"_blank","noopener,noreferrer");
};
$("externalSearch").onclick=()=>{const from=$("filterOrigin").value,to=$("filterDestination").value,body=$("filterBody").value;const terms=["frete carga disponivel",from?"origem "+from:"",to?"destino "+to:"",body?"carroceria "+body:""].filter(Boolean).join(" ");window.open("https://www.google.com/search?q="+encodeURIComponent(terms),"_blank","noopener,noreferrer");};
async function refresh(){if(!user||!role)return;try{
const apps=await getDocs(query(collection(db,"applications"),where(role==="contratante"?"ownerId":"applicantId","==",user.uid)));
const ownApplications=new Map();
if(role==="prestador")apps.forEach(a=>{const d=a.data();if(!ownApplications.has(d.freightId)||d.status==="aceita")ownApplications.set(d.freightId,d.status)});
let fs=await getDocs(query(collection(db,"freights"),where("status","==","aberto")));
const matched=filteredFreightDocs(fs.docs);$("freightCount").textContent=matched.length+" frete(s) encontrado(s) na Central";$("moreFreights").hidden=matched.length<=visibleFreights;
$("freightList").innerHTML="";if(!matched.length){const empty=document.createElement("p");empty.className="muted";empty.textContent="Nenhum frete cadastrado corresponde aos filtros. Experimente outras UFs ou consulte anúncios externos.";$("freightList").append(empty)}for(let f of matched.slice(0,visibleFreights)){let d=f.data(),el=document.createElement("div");el.className="item";el.innerHTML=`<b>${safe(d.origem)} → ${safe(d.destino)}</b><p>${safe(d.descricao)} · ${safe(d.peso)} kg · ${safe(d.carroceria)} · ${safe(d.data)}</p><p class="muted">${d.valor!=null?"R$ "+safe(d.valor):"Valor a negociar"}</p>`;if(role==="prestador"){let b=document.createElement("button");const status=ownApplications.get(f.id);b.textContent=status==="pendente"?"Aguardando aceite do contratante":status==="aceita"?"Candidatura aceita":status==="recusada"?"Candidatura recusada":"Candidatar-se";b.disabled=!!status;b.classList.toggle("awaiting",!!status);if(!status)b.onclick=async()=>{b.disabled=true;b.textContent="Enviando candidatura...";try{await apply(f.id,d)}finally{if(b.isConnected){b.disabled=false;b.textContent="Candidatar-se"}}};el.append(b)}$("freightList").append(el)}
let vs=await getDocs(query(collection(db,"vehicles"),where("ownerId","==",user.uid)));$("vehicleList").innerHTML="";vs.forEach(v=>{let d=v.data(),el=document.createElement("p");el.textContent=`${d.modelo} — ${d.capacidade} kg — ${d.carroceria}`;$("vehicleList").append(el)});
$("applicationList").innerHTML="";apps.forEach(a=>{let d=a.data();if(d.applicantId!==user.uid&&d.ownerId!==user.uid)return;let el=document.createElement("div");el.className="item";el.textContent=`Frete ${d.freightId} — ${d.status==="pendente"?"Aguardando aceite do contratante":d.status==="aceita"?"Aceita":d.status==="recusada"?"Recusada":d.status} — ${d.message||""}`;if(role==="contratante"&&d.ownerId===user.uid&&d.status==="pendente"){for(let status of ["aceita","recusada"]){let b=document.createElement("button");b.textContent=status==="aceita"?"Aceitar":"Recusar";b.onclick=async()=>{try{
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
  await updateDoc(doc(db,"applications",a.id),{status:"recusada"});
  msg("Candidatura recusada.");
 }
 await refresh();
}catch(e){msg("Não foi possível atualizar: "+e.message)}};el.append(b)}}$("applicationList").append(el)});
}catch(e){msg("Não foi possível carregar os dados: "+e.message)}}
async function apply(id,d){try{let vehicles=await getDocs(query(collection(db,"vehicles"),where("ownerId","==",user.uid)));let eligible=vehicles.docs.filter(v=>v.data().capacidade>=d.peso&&(d.carroceria==="qualquer"||v.data().carroceria===d.carroceria));if(!eligible.length){msg("Cadastre um veículo com capacidade e carroceria compatíveis.");return;}let existing=await getDocs(query(collection(db,"applications"),where("freightId","==",id),where("applicantId","==",user.uid)));if(!existing.empty){msg("Você já se candidatou a este frete.");return;}await addDoc(collection(db,"applications"),{freightId:id,ownerId:d.ownerId,applicantId:user.uid,vehicleId:eligible[0].id,status:"pendente",createdAt:serverTimestamp()});msg("Candidatura enviada.");await refresh()}catch(e){msg(e.message)}}
