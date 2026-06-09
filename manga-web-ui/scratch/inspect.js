const fs = require('fs');
const content = fs.readFileSync('d:/Workspaces/VSCode-workspace/AI_Manga_Translator/manga-web-ui/dist/assets/index-Drjk0-vy.js', 'utf8');
console.log('File length:', content.length);
const lastChars = content.slice(-2000);
console.log('Last 2000 chars:');
console.log(lastChars);
