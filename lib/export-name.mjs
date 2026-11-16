// Shared by the export form and backend; the film title does not rename the project.
export function filmName(value) {
  const name=String(value??'').trim().replace(/\.(mp4|webm)$/i,'').trim();
  if(!name)throw new Error('Bitte gib deinem Film einen Namen.');
  if(name.length>120)throw new Error('Der Filmname darf höchstens 120 Zeichen lang sein.');
  if(/[<>:"/\\|?*\x00-\x1f]/.test(name)||/[. ]$/.test(name)||/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(name))
    throw new Error('Bitte einen gültigen Dateinamen ohne Sonderzeichen wie / oder : verwenden.');
  return name;
}
