import {getLanguage} from './i18n.mjs';
const $=id=>document.getElementById(id);
const text=(de,en)=>getLanguage()==='en'?en:de;
export async function installUpdates(app) {
  const button=document.createElement('button');
  button.id='updates-open';button.type='button';button.setAttribute('translate','no');
  $('help').after(button);
  const dialog=document.createElement('dialog');
  dialog.id='updates-dialog';dialog.setAttribute('translate','no');dialog.setAttribute('aria-labelledby','updates-title');
  dialog.innerHTML=`<div class="dialog-heading"><h2 id="updates-title"></h2><button id="updates-close" type="button">×</button></div>
    <p id="updates-versions"></p><p id="updates-status" role="status"></p>
    <progress id="updates-progress" max="1" value="0" hidden></progress>
    <label class="check"><input id="updates-auto" type="checkbox"><span id="updates-auto-label"></span></label>
    <p id="updates-privacy" class="hint"></p><p id="updates-portable" class="hint" hidden></p>
    <div class="dialog-actions"><button id="updates-check" type="button"></button><button id="updates-install" type="button" class="primary" hidden></button>
    <a id="updates-link" class="button primary" target="_blank" rel="noopener noreferrer" hidden></a>
    <button id="updates-cancel" type="button" hidden></button></div>`;
  document.body.append(dialog);
  let state={currentVersion:'',status:'unchecked',automatic:true},busy=false,downloading=false,error='',poll,portable=false,installed=false;
  const native=window.flightStudioUpdates;
  function draw(){
    button.textContent=state.status==='available'?text('Update verfügbar','Update available'):text('Updates','Updates');
    button.classList.toggle('has-update',state.status==='available');
    button.title=text('Updates suchen','Check for updates');
    $('updates-title').textContent=text('FlightStudio aktualisieren','Update FlightStudio');
    $('updates-close').ariaLabel=text('Updates schliessen','Close updates');
    $('updates-versions').textContent=text('Installierte Version: ','Installed version: ')+state.currentVersion+
      (state.version?text(' · GitHub: ',' · GitHub: ')+state.version:'');
    const messages={
      unchecked:text('Du kannst jetzt nach einer neuen Version suchen.','You can check for a new version now.'),
      available:text('Eine neue Version ist verfügbar.','A new version is available.'),
      current:text('Du verwendest die aktuelle veröffentlichte Version.','You are using the current published version.'),
      ahead:text('Deine lokale Version ist neuer als das aktuelle GitHub-Release.','Your local version is newer than the current GitHub release.'),
      error:state.reason==='rate-limit'?text('GitHub begrenzt die Anfragen. Bitte später erneut versuchen.','GitHub is rate limiting requests. Please try again later.'):
        text('Updates konnten nicht geprüft werden. Bitte Internetverbindung prüfen und später erneut versuchen.','Updates could not be checked. Check your connection and try again later.'),
    };
    if(!downloading)$('updates-status').textContent=error||(installed?text('Installation geöffnet. FlightStudio wird geschlossen.','Installer opened. FlightStudio is closing.'):busy?text('Updates werden gesucht …','Checking for updates …'):messages[state.status]);
    $('updates-auto').checked=state.automatic;
    $('updates-auto').disabled=busy;
    $('updates-auto-label').textContent=text('Beim Start automatisch suchen (höchstens einmal täglich)','Check automatically at startup (at most once a day)');
    $('updates-privacy').textContent=text('Die Suche fragt nur das öffentliche FlightStudio-Release auf GitHub ab. Projekte, Flüge und Medien werden nicht übertragen. Vor der Installation wird dein Projekt lokal gespeichert. Windows kann eine Bestätigung verlangen.','The check only requests the public FlightStudio release on GitHub. Projects, flights and media are not uploaded. Your project is saved locally before installation. Windows may ask for confirmation.');
    $('updates-check').textContent=text('Updates suchen','Check for updates');
    $('updates-check').disabled=busy;
    $('updates-install').hidden=!native||state.status!=='available';
    $('updates-install').disabled=busy;
    $('updates-install').textContent=text('Herunterladen und installieren','Download and install');
    $('updates-link').hidden=!!native||state.status!=='available';
    $('updates-link').textContent=text('Downloadseite öffnen','Open download page');
    $('updates-link').href=state.url||'https://github.com/adorres1/FlightStudio/releases';
    $('updates-cancel').textContent=text('Download abbrechen','Cancel download');
    $('updates-cancel').hidden=!downloading;
    $('updates-close').disabled=downloading;
    $('updates-portable').hidden=!portable;
    $('updates-portable').textContent=text('Du nutzt die portable Version. Dieser Knopf installiert die neue Version regulär; deine Projektdaten bleiben im selben Benutzerprofil.','You are using the portable edition. This button installs the new version normally; project data stays in the same user profile.');
  }
  async function check(manual){
    if(busy)return;
    busy=true;error='';draw();
    try{state=await app.api('/api/updates/check',{method:'POST',body:JSON.stringify({manual})});}
    catch{state={...state,status:'error'};}
    finally{busy=false;draw();}
  }
  button.onclick=()=>{app.pause();draw();dialog.showModal();if(state.status==='unchecked')void check(true);};
  $('updates-close').onclick=()=>dialog.close();
  dialog.addEventListener('cancel',e=>{if(downloading)e.preventDefault();});
  $('updates-check').onclick=()=>check(true);
  $('updates-auto').onchange=async()=>{
    try{state=await app.api('/api/updates/preferences',{method:'POST',body:JSON.stringify({automatic:$('updates-auto').checked})});error='';}
    catch{error=text('Einstellung konnte nicht gespeichert werden.','Could not save preference.');}
    draw();
  };
  $('updates-cancel').onclick=()=>native?.cancel();
  $('updates-install').onclick=async()=>{
    if(busy||!native)return;
    busy=downloading=true;error='';draw();$('updates-progress').hidden=false;
    poll=setInterval(async()=>{try{const progress=await native.status();$('updates-progress').value=progress.progress||0;
      $('updates-status').textContent=text('Update herunterladen und prüfen: ','Downloading and verifying update: ')+Math.round((progress.progress||0)*100)+' %';}catch{}},500);
    try{
      app.pause();
      await native.download();
      clearInterval(poll);
      $('updates-status').textContent=text('Projekt speichern und Installation öffnen …','Saving project and opening installer …');
      await app.api('/api/project',{method:'PUT',body:JSON.stringify(app.project())});
      await native.install();
      installed=true;
      $('updates-status').textContent=text('Installation geöffnet. FlightStudio wird geschlossen.','Installer opened. FlightStudio is closing.');
    }catch(e){error=e.message;downloading=false;}
    finally{clearInterval(poll);busy=downloading=false;$('updates-progress').hidden=true;draw();}
  };
  window.addEventListener('flightstudio-language',draw);
  try{state=await app.api('/api/updates');}catch{}
  draw();
  if(native?.info){try{portable=Boolean((await native.info()).portable);draw();}catch{}}
  if(state.automatic)void check(false);
}
