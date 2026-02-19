import {readFileSync} from 'fs';
import {off} from 'process';
import {CardIds} from './card-ids';

let pmv = readFileSync('replays/movie.pmv');
console.log('replay loaded with total length:', pmv.length);

if (pmv.subarray(0, 3).toString() !== 'PMV') {
    throw new Error('incorrect replay file type');
}

let offset = 3; // first 3 bytes are "PMV"

const readUInt = (bits: number) => {
    const bytes = bits / 8;
    const value = pmv.readUintLE(offset, bytes);
    offset += bytes;
    return value;
};

const readFloat = () => {
    const value = pmv.readFloatLE(offset);
    offset += 4;
    return value;
};

const readBigInt = () => {
    const value = pmv.readBigInt64LE(offset);
    offset += 8;
    return value;
};

const readString = () => {
    const size = readUInt(32);
    const value = pmv.subarray(offset, offset + size).toString();
    offset += size;
    return value;
};

const replayData = {
    gameVersion: readUInt(32),
    clientVersion: readUInt(32),
    finalStep: readUInt(32), // game time in deci-seconds
    mapCrc: readUInt(32),
    mapFileName: readString(),
    headerSize: readUInt(32), // real actions start after this offset
    seed: readUInt(16), // TODO: this is wrong for some reason
    map: readUInt(32),
    difficulty: readUInt(8), // 1 (std), 2 (adv), 3 (exp)
    mapType: readUInt(8), // PVP, PVE
    unknown1: readUInt(8), // unknown
    ownerId: readBigInt(), // ?
    replayFormatVersion: readUInt(8),
    relationsMatrixLen: readUInt(16),
};
console.log(replayData);

// TODO: parse team relations
// TODO: parse teams


const getActionsStartIdx = () => {
    for (let idx = 0; idx < 2000; idx++) {
        const value = pmv.readUint32LE(idx);
        if (value === 278) {
            return idx;
        }
    }
};



/**
 *  #[message_request_command::id = 4015]
    GroupAttack { player: u32, squads: Vec<u32>, target: internal::CGdTarget, force_attack: u8 },
 */

enum CommandId {
    NotYetImplemented = -1,
    PlayerRemove = 4001,
    PlayerSurrender = 4002,
    ScriptGoal = 4007,
    ProduceSquad = 4009,
    GroupGoto = 4013,
    GroupAttack = 4015,
    SrAddition = 4045,
}

type Target = {category: number, subCategory: number, uid: number, x: number, y: number;};

type Command = {description: string;} & (
    | {id: CommandId.NotYetImplemented, realId: CommandId;}
    | {id: CommandId.PlayerRemove, player: number;}
    | {id: CommandId.PlayerSurrender, player: number;}
    | {id: CommandId.ScriptGoal, goalSubId: number;}
    | {id: CommandId.ProduceSquad, card: number, player: number, cardPosition: number, tag: number, playedCount: number, x: number, y: number, barrierToMount: number;}
    | {id: CommandId.GroupGoto, player: number, squads: number[], positions: [number, number][], walkMode: number, runOrOrientation: number, orientation: number;}
    | {id: CommandId.GroupAttack, player: number, squads: number[], target: {version: number, targets: Target[];}, forceAttack: number;}
);

const parseCommand = (id: CommandId): Command => {
    const commandParsers: {[id in CommandId]?: () => Command} = {
        [CommandId.PlayerRemove]: () => {
            const player = Number(readBigInt());
            return {
                id: CommandId.PlayerRemove,
                player,
                description: `Player removed: id=${player}`,
            };
        },
        [CommandId.PlayerSurrender]: () => {
            const player = readUInt(32);
            return {
                id: CommandId.PlayerSurrender,
                player,
                description: `Player surrendered: id=${player}`,
            };
        },
        [CommandId.ScriptGoal]: () => {
            const goalSubId = readUInt(32);
            return {
                id: CommandId.ScriptGoal,
                goalSubId,
                description: `Goal reached: ${goalSubId}`,
            };
        },
        [CommandId.ProduceSquad]: () => {
            const card = readUInt(32);
            const player = readUInt(32);
            return {
                id: CommandId.ProduceSquad,
                card,
                player,
                cardPosition: readUInt(8),
                tag: readUInt(32),
                playedCount: readUInt(8),
                x: readFloat(),
                y: readFloat(),
                barrierToMount: readUInt(32),
                description: `Play unit ${CardIds[card % 1_000_000]} (${player})`,
            };
        },
        [CommandId.GroupGoto]: () => {
            const player = readUInt(32);
            const squadCount = readUInt(16);
            const squads: number[] = [];
            for (let idx = 0; idx < squadCount; idx++) {
                squads.push(readUInt(32));
            };

            const positionsCount = readUInt(16);
            const positions: [number, number][] = [];
            for (let idx = 0; idx < positionsCount; idx++) {
                positions.push([readFloat(), readFloat()]);
            }

            const walkMode = readUInt(8);
            const runOrOrientation = readUInt(8);
            const orientation = readFloat();

            return {id: CommandId.GroupGoto, player, squads, positions, walkMode, runOrOrientation, orientation, description: `Move command (${player})`};
        },
        [CommandId.GroupAttack]: () => {
            const player = readUInt(32);
            const squadCount = readUInt(16);
            const squads: number[] = [];
            for (let idx = 0; idx < squadCount; idx++) {
                squads.push(readUInt(32));
            };

            const version = readUInt(8);
            const targetCount = readUInt(32);
            const targets: Target[] = [];
            for (let idx = 0; idx < targetCount; idx++) {
                const target: Target = {
                    category: readUInt(32),
                    subCategory: readUInt(32),
                    uid: readUInt(32),
                    x: readFloat(),
                    y: readFloat(),
                };
                targets.push(target);
            }
            const forceAttack = readUInt(8);

            return {id: CommandId.GroupAttack, player, squads, target: {version, targets}, forceAttack, description: `Attack command (${player})`};
        }
    };

    const parser = commandParsers[id];
    if (!parser) return {id: CommandId.NotYetImplemented, realId: id, description: 'Not yet implemented'};

    return parser();
};

const bla = () => {
    for (let idx = 0; idx < 2000; idx++) {
        const value = pmv.readUInt16LE(idx);
        if (value >= 4000 && value <= 4100) {
            console.log(idx, value);
        }
    }
};
bla();

offset = getActionsStartIdx();
const steps: {[key: number]: Command[];} = [];
while (offset < pmv.length) {
    const step = readUInt(32);
    const size = readUInt(32);

    const commands: Command[] = [];
    const targetOffset = offset + size;
    while (offset < targetOffset) {
        const id = readUInt(32);
        const command = parseCommand(id);
        commands.push(command);

        if (command.id === CommandId.NotYetImplemented) {
            offset = targetOffset;
            console.log('WIP', command)
            commands.push(command);
            continue;
        }
        else console.log({step, command, offset, targetOffset});
    }
    steps[step] = commands;

    if (offset !== targetOffset) {
        throw new Error(`Target offset not reached when parsing commands, should be ${targetOffset} but got ${offset}`);
    }
}

const toTimestamp = (deciSeconds: number) => {
    const min = Math.floor(deciSeconds / 600);
    const sec = (deciSeconds - 600 * min) / 10;
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(4, '0')}`;
};


Object.entries(steps).forEach(([step, commands]) => {
    const valid = commands.filter(c => c.id !== CommandId.NotYetImplemented).map(c => c.description);
    if (valid.length > 0) console.log(toTimestamp(+step), valid);
});
