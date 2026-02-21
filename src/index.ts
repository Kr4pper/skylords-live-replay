import {existsSync, readFileSync, watchFile} from 'fs';
import {parseReplay} from './parser';
import {Card, Command, CommandId} from './api';

const filePath = process.argv[2];

let runs = 0;
const analyze = () => {
    if (!existsSync(filePath)) {
        console.log('File does not exist:', filePath);
        return;
    }

    const pmv = readFileSync(filePath);
    console.log('replay loaded with total length:', pmv.length);
    const {headerData, players, teams, teamRelations, steps} = parseReplay(pmv);

    const toTimestamp = (deciSeconds: number) => {
        const min = Math.floor(deciSeconds / 600);
        const sec = (deciSeconds - 600 * min) / 10;
        return `${min.toString().padStart(2, '0')}:${sec.toFixed(1).toString().padStart(4, '0')}`;
    };

    const filteredCommandIds: CommandId[] = [
        CommandId.NotYetImplemented,
        CommandId.GroupAttack,
    ];

    Object.entries(steps).forEach(([step, commands]) => {
        const valid = commands.filter(c => !filteredCommandIds.includes(c.id)).map(c => c.description);
        if (valid.length > 0) valid.forEach(v => console.log(toTimestamp(+step), '-', v));
    });

    runs++;
    console.log(`Done parsing update #${runs}`, filePath, pmv.length, '\n');

    const cometShots: [number, (Command & {id: CommandId.CastSpellEntity;})][] = Object.entries(steps).reduce((res, [step, commands]) => [
        ...res,
        ...commands.filter(c => c.id === CommandId.CastSpellEntity && c.spell % 1_000_000 === 2069).map(v => [step, v]),
    ], []);
    console.log(cometShots);

    const cometCatchers: {[id: number]: number[];} = {};
    cometShots.forEach(([step, shot]) => {
        if (!cometCatchers[shot.source]) cometCatchers[shot.source] = [];
        cometCatchers[shot.source].push(step);
    });
    console.log(cometCatchers);
};

analyze();
watchFile(process.argv[2], analyze);
