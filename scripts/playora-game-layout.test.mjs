import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";

const engineSource = readFileSync(fileURLToPath(new URL("../public/playora/core/engine.js", import.meta.url)), "utf8");
const game2048Source = readFileSync(fileURLToPath(new URL("../public/playora/games/2048-game.js", import.meta.url)), "utf8");
const arrowsSource = readFileSync(fileURLToPath(new URL("../public/playora/games/arrows-game.js", import.meta.url)), "utf8");
const carromSource = readFileSync(fileURLToPath(new URL("../public/playora/games/carrom.js", import.meta.url)), "utf8");
const networkSource = readFileSync(fileURLToPath(new URL("../public/playora/core/net.js", import.meta.url)), "utf8");
const bluffSource = readFileSync(fileURLToPath(new URL("../public/playora/games/bluff.js", import.meta.url)), "utf8");
const callBreakSource = readFileSync(fileURLToPath(new URL("../public/playora/games/callbreak.js", import.meta.url)), "utf8");
const crazyEightsSource = readFileSync(fileURLToPath(new URL("../public/playora/games/crazyeights.js", import.meta.url)), "utf8");
const heartsSource = readFileSync(fileURLToPath(new URL("../public/playora/games/hearts.js", import.meta.url)), "utf8");
const spadesSource = readFileSync(fileURLToPath(new URL("../public/playora/games/spades.js", import.meta.url)), "utf8");
const sudokuSource = readFileSync(fileURLToPath(new URL("../public/playora/games/sudoku.js", import.meta.url)), "utf8");
const unoSource = readFileSync(fileURLToPath(new URL("../public/playora/games/uno.js", import.meta.url)), "utf8");
const ludoSource = readFileSync(fileURLToPath(new URL("../public/playora/games/ludo.js", import.meta.url)), "utf8");
const snlSource = readFileSync(fileURLToPath(new URL("../public/playora/games/snl.js", import.meta.url)), "utf8");
const waterSortSource = readFileSync(fileURLToPath(new URL("../public/playora/games/watersort-game.js", import.meta.url)), "utf8");
const chessSource = readFileSync(fileURLToPath(new URL("../public/playora/games/chess.js", import.meta.url)), "utf8");
const checkersSource = readFileSync(fileURLToPath(new URL("../public/playora/games/checkers-game.js", import.meta.url)), "utf8");
const racerSource = readFileSync(fileURLToPath(new URL("../public/playora/games/racer.js", import.meta.url)), "utf8");
const markup = readFileSync(fileURLToPath(new URL("../src/playora/markup.html", import.meta.url)), "utf8");
const gameStyles = readFileSync(fileURLToPath(new URL("../src/playora/site.css", import.meta.url)), "utf8");

test("the host game picker can collapse while showing the selected game", () => {
  assert.match(markup, /<details id="gamePicker" open><summary>Choose a game <span id="gameSelection"><\/span><svg class="game-picker-arrow"/);
  assert.match(markup, /class="game-picker-arrow" viewBox="0 0 16 16"/);
  assert.match(gameStyles, /#room #hostControls #gamePicker\[open\] \.game-picker-arrow/);
  assert.match(networkSource, /\$\('gameSelection'\)\.textContent=GAMES\[pick\]\?\.t\|\|'Select a game'/);
  assert.doesNotMatch(gameStyles, /#room #hostControls #gamePicker\{[^}]*display:grid/);
});

test("guests see available games without controls to change the host selection", () => {
  assert.match(markup, /id="hostControls" class="hide"/);
  assert.match(markup, /id="guestGameChoices" class="hide"/);
  assert.match(gameStyles, /#room #hostControls\.hide\{display:none!important\}/);
  assert.match(networkSource, /\$\('guestGameChoices'\)\.classList\.toggle\('hide',host\)/);
  assert.match(networkSource, /renderLobbyGameCards\(\$\('guestLobbyGames'\),false\)/);
});

test("the game board stays hidden until the room enters active-game mode", () => {
  assert.match(gameStyles, /#room:not\(\.game-active\) #gm\{display:none!important\}/);
});

test("narrow game headers keep the title aligned beside compact controls", () => {
  assert.match(gameStyles, /#room \.rbar #rx,#room \.rbar #bk,#room \.rbar #rs,#room \.rbar #reconnect\{flex:0 0 auto;white-space:nowrap\}/);
  assert.match(gameStyles, /@media\(max-width:380px\)\{#room \.rbar\{gap:6px;padding-right:8px;padding-left:8px\}#room \.rbar h2\{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:16px\}/);
});

test("active games fill the space below the measured toolbar without room scrolling", () => {
  assert.match(gameStyles, /#room\.game-active\{display:flex;flex-direction:column;overflow:hidden\}/);
  assert.match(gameStyles, /#room\.game-active \.rbar\{position:relative;flex:0 0 auto\}/);
  assert.match(gameStyles, /#room\.game-active \.rin\{display:flex;flex:1;flex-direction:column;min-height:0;[^}]*overflow:hidden\}/);
  assert.match(gameStyles, /#room\.game-active #gm\{display:flex;flex:1;flex-direction:column;min-height:0;[^}]*overflow:hidden\}/);
  assert.match(gameStyles, /#room\.game-active #bd\{position:relative;flex:1;min-width:0;min-height:0;overflow:hidden\}/);
});

test("Arrows keeps its HUD at the top and centers the board within the full-screen area", () => {
  assert.match(arrowsSource, /\.ar-wrap\{position:relative;[^}]*min-height:100%;[^}]*display:flex;flex-direction:column;justify-content:center;gap:12px/);
  assert.match(arrowsSource, /\.ar-bar\{position:relative;flex:0 0 auto;z-index:1;/);
  assert.match(arrowsSource, /const maxH = Math\.max\(1, Math\.min\([^;]*hostH - barH - 36\)/);
});

test("standalone games use one full-width, non-scrolling viewport", () => {
  assert.match(gameStyles, /#room\.standalone-game\{overflow:hidden\}/);
  assert.match(gameStyles, /\.standalone-game #gm\{width:100%;height:auto;min-height:0;flex:1;overflow:hidden\}/);
  assert.match(gameStyles, /\.standalone-game-host\{position:absolute;inset:0;overflow:hidden\}/);
});

test("embedded game shells do not create their own scroll viewport", () => {
  assert.match(gameStyles, /\.embedded-game #gm\{height:auto;min-height:0;flex:1;overflow:hidden\}/);
  assert.match(gameStyles, /\.embedded-game-board\{position:relative;height:auto;min-height:0;flex:1;overflow:hidden\}/);
});

test("short landscape game boards and card layouts scale within the game area", () => {
  assert.match(checkersSource, /\.ck-wrap\{[^}]*height:100%;min-height:0/);
  assert.match(checkersSource, /@media\(max-width:899px\) and \(max-height:520px\) and \(orientation:landscape\)\{#room \.ck-board\{width:min\(100%,680px,calc\(100dvh - 210px\)\)\}\}/);
  assert.match(chessSource, /\.cb3w\{width:100%;height:100%;min-height:0/);
  assert.match(ludoSource, /#room\.ludo-game \.lui-wide\{--lui-size:min\(calc\(100dvh - 76px\),680px\)/);
  assert.match(ludoSource, /@media \(max-aspect-ratio:5\/4\)\{[\s\S]*?#room\.ludo-game \.lui-board\{--lui-size:min\(100vw,calc\(100dvh - 270px\),680px\);display:flex;align-items:center;justify-content:center;flex:0 0 var\(--lui-size\)!important\}/);
  assert.match(ludoSource, /@media \(max-aspect-ratio:5\/4\)\{[\s\S]*?#room\.ludo-game #rl\{width:min\(60%,216px\)\}/);
  assert.match(ludoSource, /@media \(max-width:599px\) and \(max-height:520px\) and \(orientation:landscape\)/);
  assert.match(ludoSource, /#room\.ludo-game #rl\.hide\{display:block!important;visibility:hidden\}/);
  assert.match(ludoSource, /#room\.ludo-game #st\{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;[\s\S]*?clip-path:inset\(50%\);white-space:nowrap/);
  assert.match(ludoSource, /#room\.ludo-game #lg:empty\{display:none\}/);
  assert.match(ludoSource, /#room \.g\.c15\.lui\{width:var\(--lui-size,min\(94vw,82vh,680px\)\)\}/);
  assert.match(heartsSource, /@media\(max-height:520px\) and \(orientation:landscape\)\{#room #bd \.hr\{--w:clamp\(24px/);
  assert.match(unoSource, /@media\(max-height:520px\) and \(orientation:landscape\)\{#room #bd \.uno\{--w:clamp\(18px/);
  assert.match(carromSource, /@media\(orientation:landscape\) and \(max-height:1000px\)\{\s*\.cr-wrap\{--bw:min\(88vh,calc\(100dvh - 92px\),760px,calc\(100vw - 360px\)\);display:grid;\s*grid-template-columns:var\(--bw\) minmax\(180px,300px\)/);
  assert.match(carromSource, /@media\(max-height:380px\)\{\.cr-wrap\{gap:2px\}\}/);
  assert.match(crazyEightsSource, /@media\(max-height:380px\) and \(orientation:landscape\)\{\.ce\{--w:clamp\(30px,min\(8vw,10vh\),40px\)\}/);
});

test("Snakes and Ladders centers the board and controls within its viewport", () => {
  assert.match(snlSource, /\.snl\{--bs:min\(94vw,82vh,calc\(100dvh - 242px\),680px\);--tw:[^;]+;display:flex;flex-direction:column;align-items:center;justify-content:center;[^}]*min-height:100%/);
  assert.match(snlSource, /@media \(min-width:900px\) and \(min-aspect-ratio:5\/4\)\{\s*\.snl\{[^}]*align-content:center;min-height:100%\}/);
  assert.match(snlSource, /@media \(max-height:520px\) and \(orientation:landscape\)\{\s*\.snl\{[^}]*align-content:center;min-height:100%\}/);
});

test("Ludo uses available board space without showing bottom status text", () => {
  assert.match(ludoSource, /#room\.ludo-game \.lui-wide\{--lui-size:min\(calc\(100dvh - 76px\),calc\(100vw - 340px\)\)/);
  assert.match(ludoSource, /@media \(max-aspect-ratio:5\/4\)\{[\s\S]*?#room\.ludo-game \.lui-board\{--lui-size:min\(100vw,calc\(100dvh - 270px\),680px\)/);
  assert.match(ludoSource, /@media \(max-height:520px\) and \(orientation:landscape\) and \(min-width:600px\)\{[\s\S]*?#room\.ludo-game \.lui-wide\{--lui-size:min\(calc\(100dvh - 76px\),680px\)/);
  assert.match(ludoSource, /#room\.ludo-game #st\{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;[\s\S]*?clip-path:inset\(50%\);white-space:nowrap/);
  assert.match(ludoSource, /rows\.push\("1fr"\);\s*sideKids\.forEach\(function \(\) \{ rows\.push\("auto"\); \}\);\s*rows\.push\("1fr"\)/);
});

test("Water Sort sizes tubes from the available game viewport", () => {
  assert.match(waterSortSource, /const H = Math\.max\(80, \(area && area\.clientHeight \|\| innerHeight\) - fixedHeight - 16\)/);
  assert.match(waterSortSource, /html,body\{margin:0;height:100%;overflow:hidden;background:#1a0b3b\}/);
  assert.match(waterSortSource, /#ws-root\{position:fixed;inset:0;overflow:hidden;display:flex/);
});

test("Realtime Racer sizes its board from the space below the toolbar", () => {
  assert.match(racerSource, /const availableHeight = board\?\.clientHeight \|\| window\.innerHeight/);
  assert.match(racerSource, /window\.matchMedia\("\(max-width: 700px\), \(max-height: 520px\)"\)/);
});

test("Carrom uses the available width on short portrait phones", () => {
  assert.match(carromSource, /@media\(max-width:600px\) and \(max-height:700px\) and \(orientation:portrait\)\{\s*\.cr-wrap\{--bw:min\(94vw,calc\(100dvh - 320px\),480px\)/);
  assert.doesNotMatch(carromSource, /--bw:min\(94vw,calc\(100dvh - 320px\),260px\)/);
});

test("2048 action buttons fit the game viewport", () => {
  assert.match(game2048Source, /\.g48-btns button\{width:auto;min-width:0;min-height:42px;flex:1 1 0;margin:0;/);
  assert.match(game2048Source, /#room \.g48-btns button\{width:auto;min-width:0;min-height:42px;flex:1 1 0;margin:0;padding:8px 14px\}/);
});

test("2048 board scales to fit short landscape screens without scrolling", () => {
  assert.match(game2048Source, /@media\(max-height:620px\) and \(orientation:landscape\)\{\.g48-wrap\{--g48-size:min\(calc\(100dvh - 230px\),42vw\);padding:8px 16px\}\.g48-bar\{flex-wrap:nowrap;gap:4px;margin-bottom:6px\}/);
  assert.match(game2048Source, /\.g48-board\{height:var\(--g48-size\);min-height:0\}/);
});

test("Spades table cards render above overlapping game messages", () => {
  assert.match(spadesSource, /'\.table\{position:relative;z-index:1;flex:1;min-height:0;/);
});

test("Spades hand cards scale down on narrow and short mobile viewports", () => {
  assert.match(spadesSource, /@media\(max-width:520px\)\{#room #bd \.sp-room \.sp\{--w:clamp\(32px,11vw,44px\)/);
  assert.match(spadesSource, /@media\(max-height:520px\)\{#room #bd \.sp-room \.sp\{--w:clamp\(32px,13vh,56px\)/);
});

test("Spades keeps the trick table visible on short screens", () => {
  assert.match(spadesSource, /@media\(max-height:520px\)\{#room #bd \.sp-room \.sp\{--w:clamp\(24px,8vh,36px\);padding-bottom:calc\(4px \+ env\(safe-area-inset-bottom,0px\)\)\}#room #bd \.sp-room \.sp \.hand\{padding:12px 8px 8px\}#room #bd \.sp-room \.sp \.msg\{padding:2px 8px;min-height:2\.2em\}\}/);
});

test("Spades hides duplicate engine status outside the game board", () => {
  assert.match(gameStyles, /#room\.spades-game #lg,#room\.spades-game #st\{display:none!important\}/);
  assert.match(engineSource, /classList\.toggle\('spades-game',game==='spades'\)/);
});

test("games hide duplicate bottom status except Chess and Ludo", () => {
  assert.match(gameStyles, /#room\.game-active:not\(\.ludo-game\):not\(\.chess-game\) #lg,#room\.game-active:not\(\.ludo-game\):not\(\.chess-game\) #st\{display:none!important\}/);
  assert.match(engineSource, /classList\.toggle\('chess-game',game==='chess'\)/);
});

test("card-game status follows each hand with five-percent bottom spacing", () => {
  const games = [
    { source: bluffSource, root: ".bl-room .bl", hand: ".bl-room .hand", msg: ".bl-room .msg", action: ".bl-room .acts" },
    { source: callBreakSource, root: ".cb", hand: ".cb .hand", msg: ".cb .msg", action: ".cb .room-action" },
    { source: crazyEightsSource, root: ".ce-room .ce", hand: ".ce-room .hand", msg: ".ce-room .msg", action: ".ce-room .acts" },
    { source: heartsSource, root: ".hr", hand: ".hr .hand", msg: ".hr .msg", action: ".hr .acts" },
    { source: spadesSource, root: ".sp-room .sp", hand: ".sp-room .hand", msg: ".sp-room .msg", action: ".sp-room .acts" },
    { source: unoSource, root: ".uno", hand: ".uno .hand", msg: ".uno .msg", action: ".uno .acts" },
  ];
  for (const game of games) {
    assert.ok(game.source.includes(`#room #bd ${game.root}`), `${game.root} keeps its room styles in its own script`);
    assert.ok(game.source.includes(`#room #bd ${game.action}{order:1`), `${game.root} keeps actions above its hand`);
    assert.ok(game.source.includes(`#room #bd ${game.hand}{order:2}`), `${game.root} keeps its hand after actions`);
    assert.ok(game.source.includes(`#room #bd ${game.msg}{order:3;margin-top:8px}`), `${game.root} keeps its message below the hand`);
  }
});

test("Spades unplayable cards stay legible while remaining visually muted", () => {
  assert.match(spadesSource, /'\.hand \.card\.no\{filter:brightness\(\.82\)\}'/);
});

test("Spades bid choices stay within the bid panel on narrow screens", () => {
  assert.match(spadesSource, /'\.bidbox\{[^']*width:min\(90vw,340px\);max-width:calc\(100% - 16px\);/);
  assert.match(spadesSource, /'\.bidbox p\{[^']*\.bids\{display:grid;grid-template-columns:repeat\(5,minmax\(0,1fr\)\);gap:6px;min-width:0\}\.bids \.btn\{width:100%;min-width:0;box-sizing:border-box;padding:\.6em 0\}'/);
});

test("Spades mobile status text sits below the cards with bottom spacing", () => {
  assert.match(spadesSource, /#room #bd \.sp-room \.sp\{box-sizing:border-box;padding-bottom:calc\(18px \+ env\(safe-area-inset-bottom,0px\)\)\}/);
  assert.match(spadesSource, /#room #bd \.sp-room \.msg\{padding-bottom:calc\(12px \+ env\(safe-area-inset-bottom,0px\)\)\}/);
});

test("Crazy Eights mobile text follows cards with five-percent bottom spacing", () => {
  assert.match(crazyEightsSource, /#room #bd \.ce-room \.ce\{--w:clamp[^}]*padding-bottom:5vh\}/);
  assert.match(crazyEightsSource, /#room #bd \.ce-room \.acts\{margin-top:4px\}/);
  assert.match(crazyEightsSource, /#room #bd \.ce-room \.hand button\.card\[style\*="--hand-row"\]\{grid-row:var\(--hand-row\);grid-column:var\(--hand-column\)\}/);
});

test("Crazy Eights mobile card spread centers the incomplete row", () => {
  const helper = crazyEightsSource.match(/function handGridPosition\(index, count\)\s*\{[\s\S]*?\n  \}/)?.[0];
  assert.ok(helper, "Crazy Eights exposes mobile card row positioning");
  const position = vm.runInNewContext("(" + helper + ")");
  assert.equal(position(0, 7), 'style="--hand-row:1;--hand-column:2"');
  assert.equal(position(8, 13), 'style="--hand-row:2;--hand-column:4"');
  assert.equal(position(12, 13), 'style="--hand-row:2;--hand-column:12"');
  assert.match(crazyEightsSource, /@media\(max-width:600px\)\{\.hand\{grid-template-columns:repeat\(16,minmax\(0,1fr\)\)\}\.hand \.card\{grid-column:span 2\}\.hand \.card\[style\*="--hand-row"\]\{grid-row:var\(--hand-row\);grid-column:var\(--hand-column\)\}\}/);
  assert.match(crazyEightsSource, /#room #bd \.ce-room \.hand button\.card\[style\*="--hand-row"\]\{grid-row:var\(--hand-row\);grid-column:var\(--hand-column\)\}/);
});

test("Call Break mobile status follows the hand with five-percent bottom spacing", () => {
  assert.match(callBreakSource, /#room #bd \.cb\{padding-bottom:5vh\}/);
  assert.match(callBreakSource, /#room #bd \.cb \.bar \.logo\{display:none\}/);
  assert.match(callBreakSource, /@media\(max-width:520px\) and \(max-height:700px\)\{#room #bd \.cb\{--w:clamp\(36px,min\(12vw,12vh\),46px\)\}#room #bd \.cb \.hand\{padding-top:24px\}#room #bd \.cb \.bidbox\{top:0;transform:translateX\(-50%\);z-index:30\}\}/);
  assert.match(callBreakSource, /#room #bd \.cb \.hand button\.card\[style\*="--hand-row"\]\{grid-row:var\(--hand-row\);grid-column:var\(--hand-column\) \/ span 2;translate:calc\(var\(--w\)\*\.3\) 0\}/);
});

test("Call Break mobile hand centers its final row", () => {
  const helper = callBreakSource.match(/function handGridPosition\(index, count\)\s*\{[\s\S]*?\n  \}/)?.[0];
  assert.ok(helper, "Call Break exposes mobile card row positioning");
  const position = vm.runInNewContext("(" + helper + ")");
  assert.equal(position(0, 5), 'style="--hand-row:1;--hand-column:4"');
  assert.equal(position(8, 13), 'style="--hand-row:2;--hand-column:4"');
  assert.equal(position(12, 13), 'style="--hand-row:2;--hand-column:12"');
  assert.match(callBreakSource, /@media\(max-width:600px\)\{\.hand\{display:grid;grid-template-columns:repeat\(16,minmax\(0,1fr\)\);grid-auto-rows:calc\(var\(--w\)\*\.95\);align-content:center;justify-items:center;gap:0;overflow:visible\}\.hand \.card\{grid-column:span 2;margin:0\}\.hand \.card\[style\*="--hand-row"\]\{grid-row:var\(--hand-row\);grid-column:var\(--hand-column\) \/ span 2;translate:calc\(var\(--w\)\*\.3\) 0\}/);
  assert.match(callBreakSource, /#room #bd \.cb \.hand button\.card\+button\.card\{margin-left:0\}/);
  assert.match(callBreakSource, /#room #bd \.cb \.hand button\.card\[style\*="--hand-row"\]\{grid-row:var\(--hand-row\);grid-column:var\(--hand-column\) \/ span 2;translate:calc\(var\(--w\)\*\.3\) 0\}/);
});

test("Hearts centers its final mobile row and Spades keeps the hand in one row", () => {
  const helper = heartsSource.match(/function roomHandGridPosition\(index, count\)\s*\{[\s\S]*?\n  \}/)?.[0];
  assert.ok(helper, "Hearts exposes mobile card row positioning");
  const position = vm.runInNewContext("(" + helper + ")");
  assert.equal(position(8, 13), 'style="--hand-row:2;--hand-column:4"');
  assert.equal(position(12, 13), 'style="--hand-row:2;--hand-column:12"');
  assert.doesNotMatch(spadesSource, /function roomHandGridPosition/);
  assert.match(heartsSource, /#room #bd \.hr \.hand button\.card\[style\*="--hand-row"\]\{grid-row:var\(--hand-row\);grid-column:var\(--hand-column\) \/ span 2\}/);
  assert.match(spadesSource, /#room #bd \.sp-room \.sp \.hand\{display:flex;flex-wrap:nowrap;justify-content:center;overflow:hidden;padding-left:calc\(var\(--w\)\*\.275\);padding-right:calc\(var\(--w\)\*\.275\)\}/);
});

test("card hands wrap to fit the game viewport and Ludo wide styles stay scoped to Ludo", () => {
  for (const [source, selector] of [
    [callBreakSource, ".cb"],
    [crazyEightsSource, ".ce-room .ce"],
    [heartsSource, ".hr"],
  ]) {
    assert.ok(source.includes(`#room #bd ${selector}`));
    assert.match(source, /@media\(min-width:601px\)\{#room #bd /);
    assert.match(source, /flex-wrap:wrap;justify-content:center;overflow-x:hidden;overflow-y:hidden/);
  }
  assert.match(spadesSource, /#room #bd \.sp-room \.sp \.hand\{display:flex;flex-wrap:nowrap;justify-content:center;overflow:hidden/);
  assert.match(unoSource, /#room #bd \.uno \.hand\{flex-wrap:wrap;justify-content:center;overflow:visible/);
  assert.match(ludoSource, /#room\.ludo-game \.lui-wide\{--lui-size:min\(calc\(100dvh - 76px\),calc\(100vw - 340px\)\)/);
  assert.doesNotMatch(ludoSource, /"\s+\.lui-wide\{--lui-size/);
});

test("game-specific room styles live in each game's script", () => {
  assert.doesNotMatch(gameStyles, /#room #bd \.bl-room button\.card|#room\.ludo-game #dice\{|\.standalone-game-host \.ar-wrap\{|^\.race\{/m);
  assert.match(ludoSource, /#room\.ludo-game #dice\{width:72px/);
  assert.match(ludoSource, /#room\.ludo-game\.game-active \.rin\{min-height:0;flex:1;display:flex;flex-direction:column\}/);
  assert.match(chessSource, /#room\.chess-game \.lm\{background-image:linear-gradient/);
  assert.match(arrowsSource, /\.standalone-game-host \.ar-wrap\{box-sizing:border-box/);
  assert.match(racerSource, /const CSS = `\s*\.race\{\s*width:min\(100%,1100px\)/);
});

test("Bluff selected cards lift above neighboring cards", () => {
  assert.match(bluffSource, /'\.hand\{[^']*grid-template-columns:repeat\(30,minmax\(0,1fr\)\);grid-auto-rows:calc\(var\(--w\)\*\.95\)/);
  assert.match(bluffSource, /\.hand \.card\{grid-column:span 2;width:var\(--w\);height:calc\(var\(--w\)\*1\.45\);justify-self:center;cursor:default\}/);
  assert.match(bluffSource, /\.hand \.card\.sel\{position:relative;z-index:5;transform:translateY\(calc\(var\(--w\)\*-.55\)\);/);
  assert.match(bluffSource, /#room #bd \.bl-room \.hand\{max-width:1160px;margin:5px auto 0;grid-auto-rows:calc\(var\(--w\)\*\.95\);row-gap:0;overflow:visible;padding-top:28px;padding-bottom:calc\(10px \+ var\(--w\)\*\.5\)\}/);
});

test("Selectable cards stay above overlapping neighbors in every card game", () => {
  for (const [source, selector] of [
    [callBreakSource, /\.hand \.card\.ok\{position:relative;z-index:2;transform:translateY\(-14px\)/],
    [crazyEightsSource, /\.hand \.card\.ok\{[^}]*position:relative;z-index:2;transform:translateY\(-14px\)/],
    [spadesSource, /\.hand \.card\.ok\{position:relative;z-index:2;transform:translateY\(-14px\)/],
    [unoSource, /\.uno \.hand \.card\.ok\{position:relative;z-index:2;transform:translateY\(-14px\)/],
  ]) {
    assert.match(source, selector);
  }
  assert.match(heartsSource, /\.hand \.card\.ok:not\(\.sel\)\{position:relative;z-index:2;transform:translateY\(-8px\)\}\.hand \.card\.sel\{position:relative;z-index:5;transform:translateY\(-20px\)/);
});

test("selected hand cards stack above later overlapping cards in every view", () => {
  const helper = engineSource.match(/function stackHandCards\(root\)(\{[^\n]+\})/)?.[1];
  assert.ok(helper, "the engine exposes shared hand-card stacking");
  const stackHandCards = vm.runInNewContext("(function(root)" + helper + ")");
  const cards = [
    { dataset: { selectedOrder: "0" }, style: {}, classList: { contains: name => name === "sel" } },
    { dataset: {}, style: {}, classList: { contains: name => name === "ok" } },
    { dataset: { selectedOrder: "1" }, style: {}, classList: { contains: name => name === "sel" } },
  ];
  const hand = { querySelectorAll: () => cards };
  stackHandCards({ querySelectorAll: () => [hand] });
  assert.deepEqual(cards.map(card => card.style.zIndex), ["100000", "10001", "100001"]);
  assert.match(engineSource, /\$\(\'bd\'\)\.innerHTML=h;stackHandCards\(\$\(\'bd\'\)\)/);
  for (const source of [bluffSource, callBreakSource, crazyEightsSource, heartsSource, spadesSource, unoSource]) {
    assert.match(source, /global\.playoraStackHandCards\(root\)/);
  }
  assert.match(bluffSource, /data-selected-order="' \+ selectedOrder \+ '"/);
  assert.match(heartsSource, /data-selected-order="' \+ selectedOrder \+ '"/);
});

test("offline Bluff asks in-game for 2, 3, or 4 total players", () => {
  assert.doesNotMatch(markup, /bluffPlayerCount|data-bluff-players/);
  assert.match(engineSource, /\$\('ml'\)\.onclick=\(\)=>begin\(pick,pick==='bluff'\?4:2,null,true\)/);
  assert.match(bluffSource, /how many players\?/);
  assert.match(bluffSource, /data-m="players:' \+ count \+ '"/);
  assert.match(bluffSource, /\.setup-panel\{display:grid;flex:1 1 auto;align-content:center;justify-items:center;gap:\.8rem;padding:\.5rem\}/);
  assert.match(bluffSource, /\.setup-choice\{display:grid;width:4\.2rem;justify-items:center;padding:\.6rem \.4rem;border:2px solid rgba\(255,255,255,\.35\);border-radius:1rem;background:rgba\(0,0,0,\.3\)/);

  for (const count of [2, 3, 4]) {
    let game;
    const context = {
      np: count,
      ids: [],
      localBot: true,
      S: null,
      registerGame(value) { game = value; },
    };
    vm.runInNewContext(bluffSource, context);

    const state = game.init();
    assert.equal(state.phase, "setup");
    assert.equal(game.valid({ type: "players", player: 0, count }), true);
    game.apply({ type: "players", player: 0, count });
    assert.equal(state.players.length, count);
    assert.deepEqual(Array.from(state.players, (player) => player.bot), [false, ...Array(count - 1).fill(true)]);
    assert.deepEqual(Array.from(state.players, (player) => player.name), [
      "Player 1",
      ...Array.from({ length: count - 1 }, (_, index) => `Computer (Bot ${index + 1})`),
    ]);
    const handSizes = Array.from(state.players, (player) => player.hand.length);
    assert.equal(handSizes.reduce((sum, size) => sum + size, 0), 52);
    assert.ok(Math.max(...handSizes) - Math.min(...handSizes) <= 1);
  }
});

test("Bluff centers each desktop and mobile row while increasing overlap", () => {
  const helper = bluffSource.match(/function handGridPosition\(index, count\)\s*\{[\s\S]*?\n  \}/)?.[0];
  assert.ok(helper, "Bluff exposes desktop and mobile card row positioning");
  const position = vm.runInNewContext("(" + helper + ")");
  assert.equal(position(0, 13), 'style="--hand-row:1;--hand-column:3;--mobile-row:1;--mobile-column:3"');
  assert.equal(position(8, 13), 'style="--hand-row:1;--hand-column:19;--mobile-row:2;--mobile-column:6"');
  assert.equal(position(12, 13), 'style="--hand-row:1;--hand-column:27;--mobile-row:2;--mobile-column:14"');
  assert.match(bluffSource, /@media\(max-width:600px\)\{#room #bd \.bl-room \.bl\{--w:clamp\(36px,min\(18vw,calc\(\(100vw - 40px\)\/7\)\),76px\)\}#room #bd \.bl-room \.bl \.setup-choice\{width:3\.6rem;font-size:1\.35rem\}#room #bd \.bl-room \.hand\{grid-template-columns:repeat\(20,minmax\(0,1fr\)\);grid-template-rows:none;grid-auto-rows:calc\(var\(--w\)\*\.95\)\}#room #bd \.bl-room \.hand button\.card\{grid-column:span 2\}#room #bd \.bl-room \.hand button\.card\[style\*="--mobile-row"\]\{grid-row:var\(--mobile-row\);grid-column:var\(--mobile-column\) \/ span 2\}/);
});

test("Bluff mobile cards stay above status and actions with five-percent bottom spacing", () => {
  assert.match(bluffSource, /@media\(max-width:600px\)\{\.bl\{[^}]*padding-bottom:5vh\}/);
  assert.match(bluffSource, /@media\(max-width:600px\)\{#room #bd \.bl-room \.bl\{padding-bottom:5vh\}/);
});

test("Bluff cards overlap on narrow mobile and wide desktop viewports", () => {
  assert.match(bluffSource, /@media\(max-width:1250px\)\{#room #bd \.bl-room \.bl\{--w:clamp\(36px,min\(8vw,calc\(\(100vw - 56px\)\/11\)\),92px\)\}\}/);
  assert.match(bluffSource, /@media\(max-width:600px\)\{#room #bd \.bl-room \.bl\{--w:clamp\(36px,min\(18vw,calc\(\(100vw - 40px\)\/7\)\),76px\)\}#room #bd \.bl-room \.bl \.setup-choice\{width:3\.6rem;font-size:1\.35rem\}#room #bd \.bl-room \.hand\{grid-template-columns:repeat\(20,minmax\(0,1fr\)\);grid-template-rows:none;grid-auto-rows:calc\(var\(--w\)\*\.95\)\}/);
});

test("Call Break, Crazy Eights, and Hearts use larger eight-column mobile hands", () => {
  const gameClasses = [
    [callBreakSource, "#room #bd .cb"],
    [crazyEightsSource, "#room #bd .ce-room .ce"],
    [heartsSource, "#room #bd .hr"],
  ];
  for (const [source, selector] of gameClasses) {
    assert.match(source, /\.hand\{display:flex;overflow-x:auto;overflow-y:hidden/);
    assert.ok(source.includes(selector), `${selector} keeps its responsive styles in its own script`);
  }
  assert.match(callBreakSource, /@media\(max-width:600px\)\{#room #bd \.cb\{--w:clamp\(36px,min\(18vw,calc\(\(100vw - 40px\)\/8\)\),76px\)\}/);
  assert.match(crazyEightsSource, /@media\(max-width:600px\)\{#room #bd \.ce-room \.ce\{--w:clamp\(36px,min\(18vw,calc\(\(100vw - 40px\)\/7\)\),76px\)/);
  assert.match(heartsSource, /@media\(max-width:600px\)\{#room #bd \.hr\{--w:clamp\(36px,min\(18vw,calc\(\(100vw - 40px\)\/7\)\),76px\)/);
  assert.match(spadesSource, /@media\(max-width:600px\)\{#room #bd \.sp-room \.sp\{--w:clamp\(36px,min\(18vw,calc\(\(100vw - 40px\)\/7\)\),76px\)/);
});

test("Call Break bounds the landscape hand and bidding panel", () => {
  assert.match(callBreakSource, /#room #bd \.cb \.hand\{width:100%;min-width:0;max-width:1160px;margin-left:auto;margin-right:auto\}/);
  assert.match(callBreakSource, /@media\(min-width:601px\) and \(max-height:520px\) and \(orientation:landscape\)\{#room #bd \.cb\{--w:clamp\(36px,min\(7\.5vw,13vh,calc\(\(100vw - 40px\)\/14\.75\)\),58px\)\}\}/);
  assert.match(callBreakSource, /@media\(max-height:520px\) and \(orientation:landscape\)\{#room #bd \.cb \.bidbox\{top:0;transform:translateX\(-50%\);z-index:30;padding:8px\}#room #bd \.cb \.bidbox p\{margin:0 0 6px\}#room #bd \.cb \.bids\{gap:4px\}#room #bd \.cb \.bids \.btn\{padding:\.35em 0\}\}/);
});

test("Sudoku fits its board and controls within short landscape game rooms", () => {
  assert.match(sudokuSource, /@media \(max-height:520px\) and \(orientation:landscape\)\{#room \.sdk\{--s:min\(calc\(100dvh - 164px\),49vw\);padding:4px\}#room \.sdk \.bar\{padding:0 2px 6px\}#room \.sdk \.main\{gap:clamp\(12px,2vw,24px\);padding-bottom:0\}#room \.sdk \.panel\{gap:6px;padding:8px\}#room \.sdk \.pad\{gap:4px\}#room \.sdk \.n\{font-size:clamp\(16px,4\.2vh,20px\);padding:3px 0 2px\}#room \.sdk \.t\{padding:6px 3px\}\}/);
});

test("Bluff claim and pile are arranged side by side", () => {
  assert.match(bluffSource, /'\.table\{[^']*grid-template-columns:minmax\(0,1fr\) minmax\(0,2fr\) minmax\(0,1fr\);/);
  assert.match(bluffSource, /'\.mid\{[^']*grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\);grid-template-areas:"need pile" "claim pile" "rev rev";/);
  assert.match(bluffSource, /'\.need\{grid-area:need\}\.pilebox\{grid-area:pile;justify-self:center\}\.claim\{grid-area:claim\}/);
});

test("Bluff claim label and rank are inline on mobile", () => {
  assert.match(bluffSource, /@media\(max-width:600px\)\{[^']*\.mid\{grid-template-columns:minmax\(0,1fr\);grid-template-areas:"need" "pile" "claim" "rev"\}\.need\{display:flex;align-items:center;justify-content:center;gap:4px\}\.need b\{display:inline-block;margin:0;font-size:calc\(var\(--w\)\*\.55\)\}\}/);
});

test("Bluff call and pass buttons fit within the mobile action row", () => {
  assert.match(bluffSource, /@media\(max-width:600px\)\{#room #bd \.bl-room \.bl\{--w:clamp/);
  assert.match(bluffSource, /#room #bd \.bl-room \.acts button\.btn\{width:auto;min-width:0;max-width:100%;flex:1 1 0;margin:0;padding:10px 6px;font-size:clamp\(12px,3\.5vw,14px\);white-space:normal\}/);
});

test("entering a game resets the room scroll position", () => {
  const showAssignment = engineSource.match(/show=id=>\{[^\n]+\}/)?.[0];
  assert.ok(showAssignment, "the engine exposes its shared screen transition helper");

  const roomClasses = new Set();
  const screens = new Map();
  const room = {
    scrollTop: 480,
    classList: {
      toggle(name, enabled) {
        if (enabled) roomClasses.add(name);
        else roomClasses.delete(name);
      },
    },
  };
  const context = {
    $: (id) => {
      if (id === "room") return room;
      if (!screens.has(id)) screens.set(id, new Set());
      const classes = screens.get(id);
      return {
        classList: {
          toggle(name, enabled) {
            if (enabled) classes.add(name);
            else classes.delete(name);
          },
        },
      };
    },
  };

  vm.runInNewContext(`const SC=["mode","net","lobby","gm"]; const ${showAssignment}; show("gm");`, context);

  assert.equal(room.scrollTop, 0);
  assert.ok(roomClasses.has("game-active"));
});

test("restored Ludo and Snakes and Ladders states apply their own dice layout", () => {
  const helper = engineSource.match(/function syncGameLayout\(game\)\{[^\n]+\}/)?.[0];
  assert.ok(helper, "the engine exposes its shared game layout synchronizer");

  const classes = new Set(["hide"]);
  const roomClasses = new Set();
  const room = {
    classList: {
      toggle(name, enabled) {
        if (enabled) roomClasses.add(name);
        else roomClasses.delete(name);
      },
    },
  };
  const dice = {
    textContent: "",
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
    },
  };
  const context = {
    S: { die: 5 },
    $: (id) => id === "room" ? room : dice,
  };
  vm.runInNewContext(helper, context);

  context.syncGameLayout("ludo");
  assert.ok(roomClasses.has("ludo-game"), "restore Ludo-specific room styling");
  assert.ok(!classes.has("hide"), "show the shared Ludo die");
  assert.equal(dice.textContent, 5, "restore the current Ludo roll");

  context.syncGameLayout("snl");
  assert.ok(!roomClasses.has("ludo-game"), "do not apply Ludo styling to Snakes and Ladders");
  assert.ok(classes.has("hide"), "hide the shared die used only by Ludo");
});

test("all rejoin state paths synchronize the restored game's layout", () => {
  assert.equal((networkSource.match(/syncGameLayout\(G\.id\)/g) || []).length, 3);
});
