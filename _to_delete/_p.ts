import { buildPrompt } from '/sessions/rcw-70fa34fcb271455084beecd807ca/mnt/NOTAM/app/src/generator/rag';
import { findAirport } from '/sessions/rcw-70fa34fcb271455084beecd807ca/mnt/NOTAM/app/src/master/airports';
import { readFileSync } from 'fs';
const d = JSON.parse(readFileSync('/sessions/rcw-70fa34fcb271455084beecd807ca/mnt/NOTAM/app/data/examples.json', 'utf8'));
const ex = d[114];
console.log(buildPrompt(ex.freeText, findAirport('WIHH')!, ex.freeText));
