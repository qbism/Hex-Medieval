const fs = require("fs");
let c1 = fs.readFileSync("src/game/units.ts", "utf8");
c1 = c1.replace(/getDistance\([^,]+,s*[^,]+,s*board\)/g, (match) => match.replace(", board", ""));
fs.writeFileSync("src/game/units.ts", c1);
let c2 = fs.readFileSync("src/game/board.ts", "utf8");
c2 = c2.replace(/getDistance\([^,]+,s*[^,]+,s*board\)/g, (match) => match.replace(", board", ""));
fs.writeFileSync("src/game/board.ts", c2);
