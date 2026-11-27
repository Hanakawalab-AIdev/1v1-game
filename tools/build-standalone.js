// build-standalone.js — writes StompDuel.html: the whole game in ONE file (all js/ inlined), so it
// can be downloaded or shared on its own and opened with a double-click.
//   node tools/build-standalone.js
// The test suite checks that StompDuel.html is up to date with index.html + js/.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'StompDuel.html');

function build() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  return html.replace(/<script src="js\/([a-z0-9_-]+\.js)"><\/script>/gi, (m, file) => {
    const code = fs.readFileSync(path.join(ROOT, 'js', file), 'utf8').replace(/<\/script/gi, '<\\/script');
    return '<script>\n// ---- js/' + file + '\n' + code + '\n</script>';
  });
}

module.exports = { build, OUT };

if (require.main === module) {
  fs.writeFileSync(OUT, build());
  console.log('Wrote ' + path.relative(ROOT, OUT));
}
