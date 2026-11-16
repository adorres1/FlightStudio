import {filmName} from '../lib/export-name.mjs';
import {translate as t} from './i18n.mjs';
const $=id=>document.getElementById(id);
export function prepareExportForm(projectName) {
  const input=$('export-name'),name=String(projectName||'').trim();
  input.value=/^(Mein Flugfilm|My flight film|FlightStudio-Film)$/i.test(name)?'':name;
  input.setCustomValidity('');input.removeAttribute('aria-invalid');$('export-name-error').textContent='';
  $('export-extension').textContent='.'+$('export-format').value;
}
export function readExportName() {
  const input=$('export-name');
  try {const name=filmName(input.value);input.setCustomValidity('');input.removeAttribute('aria-invalid');$('export-name-error').textContent='';input.value=name;return name;}
  catch(e){const message=t(e.message);input.setCustomValidity(message);input.setAttribute('aria-invalid','true');$('export-name-error').textContent=message;input.focus();input.reportValidity();return null;}
}
export function installExportForm() {
  $('export-name').addEventListener('input',()=>{$('export-name').setCustomValidity('');$('export-name').removeAttribute('aria-invalid');$('export-name-error').textContent='';});
  $('export-format').addEventListener('change',()=>{$('export-extension').textContent='.'+$('export-format').value;});
  $('export-name').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();$('export-start').click();}});
}
