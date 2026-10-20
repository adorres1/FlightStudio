import fs from 'node:fs/promises';
import { tourSteps, guideSections, shortcuts } from '../public/tutorial-content.mjs';

const directory = new URL('../docs/', import.meta.url);
await fs.mkdir(directory, { recursive: true });
for (const lang of ['de', 'en']) {
  const de = lang === 'de';
  const lines = [
    de ? '# FlightStudio – Anleitung' : '# FlightStudio – User Guide', '',
    de ? '[English guide](GUIDE.en.md) · [Windows-Download](https://github.com/adorres1/FlightStudio/releases/latest)' : '[Deutsche Anleitung](ANLEITUNG.de.md) · [Windows download](https://github.com/adorres1/FlightStudio/releases/latest)', '',
    de ? 'Für FlightStudio 2.4.1. In der App: **Tutorial & Hilfe → Tutorial starten**. Im leeren Projekt gibt es auch direkt **Tutorial starten**. Die Tour hat ' + tourSteps.length + ' Schritte, Pfeile und hervorgehobene Bedienelemente. Zurück/Weiter, Themenauswahl und Esc sind jederzeit verfügbar. Dein Projekt wird dabei nicht bearbeitet; die Vorschau pausiert und die vorherige Anordnung der Menüs wird am Ende wiederhergestellt.' : 'For FlightStudio 2.4.1. In the app: **Tutorial & Help → Start tutorial**. An empty project also offers a direct **Start tutorial** button. The ' + tourSteps.length + '-step tour highlights controls with arrows. Back/Next, topic selection and Esc are available throughout. The tour does not edit your project; it pauses playback and restores the previous panel arrangement when finished.', '',
    de ? 'Die nachlesbare Hilfe im Programm funktioniert ohne Internet und lässt sich durchsuchen. Nur Online-Karten und Gelände brauchen eine Verbindung.' : 'The searchable in-app guide works offline. Online map and terrain layers need a connection.', '',
    de ? '## Inhalt' : '## Contents', '',
    ...guideSections.map(s => `- [${s.title[lang]}](#${s.id})`), '',
  ];
  for (const section of guideSections) {
    lines.push(`<a id="${section.id}"></a>`, '', `## ${section.title[lang]}`, '');
    for (const paragraph of section.paragraphs || []) lines.push(paragraph[lang], '');
    if (section.steps) lines.push(...section.steps.map((step, index) => `${index + 1}. ${step[lang]}`), '');
  }
  lines.push(de ? '## Tastenkürzel' : '## Keyboard shortcuts', '', de ? '| Taste / Geste | Funktion |' : '| Key / gesture | Function |', '| --- | --- |', ...shortcuts.map(([key, description]) => `| ${key} | ${description[lang]} |`), '', de ? 'Tastenkürzel für den Schnitt gelten ausserhalb von Eingabefeldern und Dialogen.' : 'Editor shortcuts apply outside input fields and dialogs.', '');
  await fs.writeFile(new URL(de ? 'ANLEITUNG.de.md' : 'GUIDE.en.md', directory), lines.join('\n'));
}
console.log('Generated German and English guides from the in-app help.');
