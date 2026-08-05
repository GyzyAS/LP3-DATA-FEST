const STORAGE_KEY = 'datafest_asistencia_v1';
const seedFiles = [
  {id:'1',name:'Ana Torres',type:'document',location:'cloud',size:120,date:'2026-08-04T08:05:00',favorite:true,content:'Data Makers · ana@correo.com'},
  {id:'2',name:'Luis Mendoza',type:'document',location:'local',size:118,date:'2026-08-04T08:12:00',favorite:true,content:'Insight Lab · luis@correo.com'},
  {id:'3',name:'Camila Rojas',type:'image',location:'cloud',size:125,date:'2026-08-04T08:35:00',favorite:false,content:'Código Abierto · camila@correo.com'},
  {id:'4',name:'Diego Flores',type:'document',location:'local',size:116,date:'2026-08-04T08:18:00',favorite:true,content:'Data Makers · diego@correo.com'},
  {id:'5',name:'Valeria Cruz',type:'other',location:'cloud',size:122,date:'2026-08-04T08:42:00',favorite:false,content:'Byte Force · valeria@correo.com'}
];

let files = loadFiles();
let currentView = 'all';
let currentLayout = 'list';
let editingId = null;
let editingOriginalLocation = null;
let cloudOnline = false;
let toastTimer;

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const fileGrid = $('#fileGrid');

function loadFiles(){
  try {
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY));
    return (saved || seedFiles.filter(file=>file.location==='local')).filter(file=>file.location==='local');
  } catch { return seedFiles.filter(file=>file.location==='local'); }
}
function saveFiles(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(files.filter(file=>file.location==='local'))); }

async function cloudRequest(url='',options={}){
  const response=await fetch(`/api/asistencias${url}`,{headers:{'Content-Type':'application/json'},...options});
  if(!response.ok) throw new Error('La nube no está disponible');
  return response.status===204 ? null : response.json();
}

async function fetchCloud(showMessage=false){
  try {
    const cloudFiles=await cloudRequest();
    files=[...files.filter(file=>file.location==='local'),...cloudFiles]; cloudOnline=true; render();
    if(showMessage) showToast('Datos sincronizados con PostgreSQL');
  } catch {
    cloudOnline=false; $('#syncStatus').textContent='Nube sin conectar';
    if(showMessage) showToast('Configura DATABASE_URL en Render');
  }
}
function formatSize(bytes){
  if(bytes < 1024) return `${bytes} B`;
  if(bytes < 1048576) return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/1048576).toFixed(1)} MB`;
}
function relativeDate(value){
  const days = Math.floor((Date.now()-new Date(value).getTime())/86400000);
  if(days <= 0) return 'Hoy'; if(days === 1) return 'Ayer'; if(days < 7) return `Hace ${days} días`;
  return new Date(value).toLocaleDateString('es-PE',{day:'numeric',month:'short'});
}
function iconFor(type){ return type === 'image' ? '◷' : type === 'document' ? '✓' : '○'; }
function escapeHTML(text=''){ return text.replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

function getVisibleFiles(){
  const query = $('#searchInput').value.trim().toLowerCase();
  const type = $('#typeFilter').value;
  const sort = $('#sortSelect').value;
  let result = files.filter(file => {
    const viewMatch = currentView === 'all' || file.location === currentView || (currentView === 'favorites' && file.favorite);
    return viewMatch && (type === 'all' || file.type === type) && file.name.toLowerCase().includes(query);
  });
  result.sort((a,b)=> sort === 'name' ? a.name.localeCompare(b.name) : sort === 'size' ? b.size-a.size : new Date(b.date)-new Date(a.date));
  return result;
}

function render(){
  const visible = getVisibleFiles();
  fileGrid.className = `file-grid ${currentLayout === 'list' ? 'list' : ''}`;
  fileGrid.innerHTML = visible.map(file => `
    <article class="file-card" data-id="${file.id}" data-type="${file.type}">
      <div class="file-top"><div class="file-icon">${iconFor(file.type)}</div><h3 title="${escapeHTML(file.name)}">${escapeHTML(file.name)}</h3><button class="file-menu" aria-label="Opciones">•••</button></div>
      <p>${escapeHTML(file.content || 'Sin equipo')}</p>
      <p>${new Date(file.date).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'})}</p>
      <div class="file-meta"><span class="location ${file.location}">${file.location === 'local' ? '▣ Local' : '☁ Nube'}</span><span class="status-badge ${file.type==='image'?'late':file.type==='other'?'pending':''}">${file.type==='document'?'Presente':file.type==='image'?'Llegó tarde':'Pendiente'}</span><button class="favorite ${file.favorite?'active':''}" aria-label="Verificar asistencia">${file.favorite?'✓':'○'}</button></div>
      <div class="file-actions"><button class="edit-file">Editar</button><button class="delete-file">Eliminar</button></div>
    </article>`).join('');
  $('#emptyState').hidden = visible.length > 0;
  $('#resultCount').textContent = `${visible.length} ${visible.length === 1 ? 'persona' : 'personas'}`;
  updateStats();
}

function updateStats(){
  const local = files.filter(f=>f.location==='local');
  const cloud = files.filter(f=>f.location==='cloud');
  const fav = files.filter(f=>f.favorite);
  const localBytes = new Blob([localStorage.getItem(STORAGE_KEY)||'']).size;
  const percent = Math.min(100,(localBytes/(5*1024*1024))*100);
  $('#allCount').textContent=files.length; $('#localCount').textContent=local.length; $('#cloudCount').textContent=cloud.length; $('#favoriteCount').textContent=fav.length;
  $('#statLocal').textContent=local.length; $('#statCloud').textContent=cloud.length; $('#syncStatus').textContent=cloudOnline?'PostgreSQL conectado':'Nube sin conectar';
  $('#usedStorage').textContent=formatSize(localBytes); $('#usedPercent').textContent=`${percent.toFixed(1)}%`; $('#storageBar').style.width=`${percent}%`;
  const latest = [...files].sort((a,b)=>new Date(b.date)-new Date(a.date))[0];
  $('#lastActivity').textContent=latest ? relativeDate(latest.date) : '—';
}

function setView(view){
  currentView=view;
  const text={all:['Control de asistencia','Registra la llegada de participantes y sincroniza la información.'],local:['Asistencia local','Registros guardados en este navegador mediante localStorage.'],cloud:['Asistencia en la nube','Registros compartidos y sincronizados con la organización.'],favorites:['Asistencias verificadas','Participantes cuya entrada ya fue confirmada.']}[view];
  $('#pageTitle').textContent=text[0]; $('#pageSubtitle').textContent=text[1];
  $$('.nav-item').forEach(btn=>btn.classList.toggle('active',btn.dataset.view===view));
  $('#sidebar').classList.remove('open'); render();
}
function showToast(message){
  clearTimeout(toastTimer); $('#toast').textContent=message; $('#toast').classList.add('show');
  toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),2600);
}

function configureLocation(preferredLocation=null){
  const select=$('#fileLocation');
  const locked=currentView==='local'||currentView==='cloud';
  select.disabled=locked;
  select.value=locked?currentView:(preferredLocation||'local');
  $('#locationLabel').textContent=locked?'Destino de almacenamiento':'¿Dónde guardar la lista?';
  $('#locationHelp').textContent=locked?`Fijado por la sección: ${currentView==='local'?'almacenamiento local':'PostgreSQL en la nube'}`:'';
}

function openDialog(){
  editingId=null; editingOriginalLocation=null; $('#fileForm').reset(); $('#dialogTitle').textContent='Registrar lista de asistencia'; $('#submitDialog').textContent='Guardar lista';
  configureLocation(); countPeople(); $('#fileDialog').showModal(); setTimeout(()=>$('#fileName').focus(),50);
}

function openEditDialog(file){
  editingId=file.id; editingOriginalLocation=file.location;
  $('#fileForm').reset();
  $('#fileName').value=[file.name,...String(file.content||'').split(' · ')].join(', ');
  configureLocation(file.location); $('#fileType').value=file.type;
  $('#dialogTitle').textContent='Editar asistencia'; $('#submitDialog').textContent='Guardar cambios';
  countPeople(); $('#fileDialog').showModal(); setTimeout(()=>$('#fileName').focus(),50);
}

function countPeople(){
  const count=$('#fileName').value.split(/\r?\n/).filter(line=>line.trim()).length;
  $('#peopleCount').textContent=`${count} ${count===1?'participante':'participantes'}`;
}

$$('.nav-item').forEach(btn=>btn.addEventListener('click',()=>setView(btn.dataset.view)));
$('#searchInput').addEventListener('input',render);
$('#typeFilter').addEventListener('change',render);
$('#sortSelect').addEventListener('change',render);
$('#newFileBtn').addEventListener('click',openDialog); $('#createBtn').addEventListener('click',openDialog);
$('#closeDialog').addEventListener('click',()=>$('#fileDialog').close()); $('#cancelDialog').addEventListener('click',()=>$('#fileDialog').close());
$('#menuBtn').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
$('#fileName').addEventListener('input',countPeople);

$('#fileForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const rows=$('#fileName').value.split(/\r?\n/).map(line=>line.trim()).filter(Boolean); if(!rows.length) return;
  const location=$('#fileLocation').value;
  const type=$('#fileType').value;
  if(editingId){
    const file=files.find(item=>item.id===editingId); if(!file) return;
    const columns=rows[0].split(/[,;]/).map(value=>value.trim());
    file.name=columns.shift()||file.name; file.content=columns.filter(Boolean).join(' · ')||'Equipo por confirmar';
    file.location=location; file.type=type; file.date=new Date().toISOString();
    try {
      if(editingOriginalLocation==='cloud' && file.location==='cloud') await cloudRequest(`/${file.id}`,{method:'PUT',body:JSON.stringify(file)});
      if(editingOriginalLocation==='local' && file.location==='cloud') { await cloudRequest('',{method:'POST',body:JSON.stringify(file)}); await fetchCloud(); }
      if(editingOriginalLocation==='cloud' && file.location==='local') await cloudRequest(`/${file.id}`,{method:'DELETE'});
      saveFiles(); render(); $('#fileDialog').close(); editingId=null; editingOriginalLocation=null; showToast('Asistencia actualizada correctamente');
    } catch { showToast('No se pudo actualizar en PostgreSQL'); }
    return;
  }
  const newItems=rows.map((row,index)=>{
    const columns=row.split(/[,;]/).map(value=>value.trim());
    const name=columns.shift();
    const content=columns.filter(Boolean).join(' · ')||'Equipo por confirmar';
    return {id:`list-${Date.now()}-${index}-${Math.random()}`,name,type,location,size:new Blob([row]).size,date:new Date().toISOString(),favorite:false,content};
  });
  try {
    if(location==='cloud'){
      await Promise.all(newItems.map(item=>cloudRequest('',{method:'POST',body:JSON.stringify(item)})));
      await fetchCloud();
    } else { files.unshift(...newItems); saveFiles(); render(); }
    $('#fileDialog').close(); showToast(`${rows.length} asistencia(s) guardada(s) ${location==='local'?'localmente':'en PostgreSQL'}`);
  } catch { showToast('No se pudo guardar: revisa PostgreSQL en Render'); }
});

fileGrid.addEventListener('click',async event=>{
  const card=event.target.closest('.file-card'); if(!card)return;
  const file=files.find(f=>f.id===card.dataset.id);
  if(event.target.closest('.edit-file')){ openEditDialog(file); return; }
  if(event.target.closest('.file-menu')){ $$('.file-card').forEach(c=>c!==card&&c.classList.remove('menu-open')); card.classList.toggle('menu-open'); }
  if(event.target.closest('.favorite')){
    file.favorite=!file.favorite;
    try { if(file.location==='cloud') await cloudRequest(`/${file.id}`,{method:'PUT',body:JSON.stringify(file)}); else saveFiles(); render(); showToast(file.favorite?'Asistencia verificada':'Verificación retirada'); }
    catch { file.favorite=!file.favorite; showToast('No se pudo actualizar PostgreSQL'); }
  }
  if(event.target.closest('.delete-file')){
    try { if(file.location==='cloud') await cloudRequest(`/${file.id}`,{method:'DELETE'}); files=files.filter(f=>f.id!==file.id); saveFiles(); render(); showToast('Registro eliminado'); }
    catch { showToast('No se pudo eliminar de PostgreSQL'); }
  }
});

$('#uploadBtn').addEventListener('click',()=>$('#fileInput').click());
$('#fileInput').addEventListener('change',event=>{
  const item=event.target.files[0]; if(!item) return;
  const reader=new FileReader();
  reader.onload=()=>{
    const rows=String(reader.result).split(/\r?\n/).map(row=>row.trim()).filter(Boolean);
    let added=0;
    const imported=[];
    rows.forEach((row,index)=>{
      const columns=row.split(/[,;]/).map(value=>value.trim());
      if(index===0 && /nombre|participante/i.test(columns[0])) return;
      if(!columns[0]) return;
      imported.push({id:`import-${Date.now()}-${index}`,name:columns[0],type:'other',location:currentView==='cloud'?'cloud':'local',size:row.length,date:new Date().toISOString(),favorite:false,content:[columns[1],columns[2]].filter(Boolean).join(' · ')||'Equipo por confirmar'});
      added++;
    });
    const finish=async()=>{ try { if(imported[0]?.location==='cloud'){await Promise.all(imported.map(item=>cloudRequest('',{method:'POST',body:JSON.stringify(item)})));await fetchCloud()}else{files.unshift(...imported);saveFiles();render()}showToast(`${added} participante(s) importado(s)`)}catch{showToast('No se pudo importar en PostgreSQL')}event.target.value=''; };
    finish();
  };
  reader.readAsText(item);
});
$('#syncBtn').addEventListener('click',()=>{
  const btn=$('#syncBtn'); btn.style.animation='spin .7s linear infinite'; $('#syncStatus').textContent='Sincronizando...';
  fetchCloud(true).finally(()=>{btn.style.animation=''});
});
$('#clearLocalBtn').addEventListener('click',()=>{
  if(!files.some(f=>f.location==='local')) return showToast('El almacenamiento local ya está vacío');
  files=files.filter(f=>f.location!=='local'); saveFiles(); render(); showToast('Espacio local liberado');
});
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();$('#searchInput').focus()}});
document.addEventListener('click',event=>{if(!event.target.closest('.file-card'))$$('.file-card').forEach(c=>c.classList.remove('menu-open'))});

const style=document.createElement('style');style.textContent='@keyframes spin{to{transform:rotate(360deg)}}';document.head.appendChild(style);
render();
fetchCloud();
