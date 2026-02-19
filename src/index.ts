import {readFileSync} from 'fs';
import {CardIds} from './card-ids';

let pmv = readFileSync(process.argv[2]);
console.log('replay loaded with total length:', pmv.length);

if (pmv.subarray(0, 3).toString() !== 'PMV') {
    throw new Error('incorrect replay file type');
}

let offset = 3; // first 3 bytes are "PMV"

const readUInt = (bits: number) => {
    if (bits % 8 !== 0) throw new Error(`bits must be divisible by 8 but got ${bits}`);

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

const readString = (wide = false) => {
    const width = readUInt(32) * (wide ? 2 : 1);
    const value = pmv.subarray(offset, offset + width).toString();
    offset += width;
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
};
console.log(replayData);

const relationsMatrixLen = readUInt(16);
enum RelationType {
    Neutral = 0x00,
    Friends = 0x01,
    Enemies = 0xFF,
}
const teamRelations: {teamA: number, teamB: number, relation: RelationType;}[] = [];
for (let idx = 0; idx < relationsMatrixLen; idx++) {
    const teamA = readUInt(8);
    const teamB = readUInt(8);
    const relation = readUInt(8);

    if (!RelationType[relation]) throw new Error(`Invalid relation type: ${relation}`);

    teamRelations.push({teamA, teamB, relation});
}

const numberOfTeams = readUInt(16);
const teams: {name: string, id: number;}[] = [];
for (let idx = 0; idx < numberOfTeams; idx++) {
    const name = readString();
    const id = readUInt(8);
    offset += 5; // useless data to skip

    teams.push({name, id});
}

enum PlayerType {
    Human = 0x01,
    Monsters = 0x02,
    Any = 0x03,
    EmptySlot = 0x04,
    AiBot = 0x08,
}

type Card = {id: number, charges: number;};
type Player = {name: string, id: number, team: number, position: number, playerType: PlayerType, cards: Card[];};

const players: Player[] = [];
while (offset < replayData.headerSize) {
    const name = readString(true).replaceAll('\x00', '');
    const id = Number(readBigInt());
    const team = readUInt(8);
    const position = readUInt(8);
    const playerType = readUInt(8);
    if (!PlayerType[playerType]) throw new Error(`Invalid player type: ${playerType}`);

    const cardsCount = readUInt(16);
    const cards: Card[] = [];
    for (let idx = 0; idx < cardsCount; idx++) {
        cards.push({id: readUInt(32), charges: readUInt(8)});
    }

    players.push({name, id, team, position, playerType, cards});
}
console.log(players)

// TODO how to index into players?
const getPlayerName = (playerId: number) => {
    console.log('getPlayerName', playerId) 
    const player = players.find(p => p.id === playerId);
    return player ? player.name : 'unknown';
}

enum CommandId {
    NotYetImplemented = -1,
    PlayerRemove = 4001,
    PlayerSurrender = 4002,
    PlayerLootResult = 4006,
    ScriptGoal = 4007,
    ProduceSquad = 4009,
    CastSpellGod = 4010,
    BuildHouse = 4012,
    GroupGoto = 4013,
    CastSpellEntity = 4014,
    GroupAttack = 4015,
    GroupHoldPosition = 4020,
    PowerSlotBuild = 4030,
    TokenSlotBuild = 4031,
    GroupKillEntity = 4041,
    GroupLootTarget = 4043,
    SrAddition = 4045,
}

type Target = {category: number, subCategory: number, uid: number, x: number, y: number;};
const readTarget = (): Target => ({
    category: readUInt(32),
    subCategory: readUInt(32),
    uid: readUInt(32),
    x: readFloat(),
    y: readFloat(),
});

type CGdTarget = {version: number, targets: Target[];};
const readCGdTarget = (): CGdTarget => {
    const version = readUInt(8);
    const targetCount = readUInt(32);
    const targets: Target[] = [];
    for (let idx = 0; idx < targetCount; idx++) {
        targets.push(readTarget());
    }

    return {version, targets};
};

type Command = {description: string;} & (
    | {id: CommandId.NotYetImplemented, realId: CommandId;}
    | {id: CommandId.PlayerRemove, player: number;}
    | {id: CommandId.PlayerSurrender, player: number;}
    | {id: CommandId.PlayerLootResult, account: number, lootTarget: number, gold: [number, number][];}
    | {id: CommandId.ScriptGoal, goalSubId: number;}
    | {id: CommandId.ProduceSquad, card: number, player: number, cardPosition: number, tag: number, playedCount: number, x: number, y: number, barrierToMount: number;}
    | {id: CommandId.CastSpellGod, card: number, player: number, cardPosition: number, tag: number, playedCount: number, target: CGdTarget;}
    | {id: CommandId.BuildHouse, card: number, player: number, buildingId: number, x: number, y: number, z: number, angle: number, tag: number, playedCount: number;}
    | {id: CommandId.GroupGoto, player: number, squads: number[], positions: [number, number][], walkMode: number, runOrOrientation: number, orientation: number;}
    | {id: CommandId.CastSpellEntity, player: number, source: number, spell: number, target: CGdTarget;}
    | {id: CommandId.GroupAttack, player: number, squads: number[], target: CGdTarget, forceAttack: number;}
    | {id: CommandId.GroupHoldPosition, player: number, squads: number[];}
    | {id: CommandId.PowerSlotBuild, player: number, slot: number}
    | {id: CommandId.TokenSlotBuild, player: number, slot: number, monument: number;}
    | {id: CommandId.GroupKillEntity, player: number, entities: number[];}
    | {id: CommandId.GroupLootTarget, player: number, squads: number[], lootTarget: number;}
);

const parseCommand = (id: CommandId): Command => {
    const commandParsers: {[id in CommandId]?: () => Command} = {
        [CommandId.PlayerRemove]: () => {
            const player = Number(readBigInt());
            return {
                id: CommandId.PlayerRemove,
                player,
                description: `Player removed (${getPlayerName(player)})`,
            };
        },
        [CommandId.PlayerSurrender]: () => {
            const player = readUInt(32);
            return {
                id: CommandId.PlayerSurrender,
                player,
                description: `Player surrendered (${getPlayerName(player)})`,
            };
        },
        [CommandId.PlayerLootResult]: () => {
            const account = Number(readBigInt());
            const lootTarget = readUInt(32);
            const playerCount = readUInt(32);
            const gold: [number, number][] = [];
            for (let idx = 0; idx < playerCount; idx++) {
                gold.push([Number(readBigInt()), readUInt(32)]);
            }
            return {id: CommandId.PlayerLootResult, account, lootTarget, gold, description: `Loot gold ${gold[0][1]}`};
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
                description: `Play unit ${CardIds[card % 1_000_000]} (${getPlayerName(player)})`,
            };
        },
        [CommandId.CastSpellGod]: () => {
            const card = readUInt(32);
            const player = readUInt(32);
            return {
                id: CommandId.CastSpellGod,
                card,
                player,
                cardPosition: readUInt(8),
                tag: readUInt(32),
                playedCount: readUInt(8),
                target: readCGdTarget(),
                description: `Cast spell ${CardIds[card % 1_000_000]} (${getPlayerName(player)})`,
            };
        },
        [CommandId.BuildHouse]: () => {
            const card = readUInt(32);
            const player = readUInt(32);
            const buildingId = readUInt(32);
            const [x, y, z] = [readFloat(), readFloat(), readFloat()];
            const angle = readFloat();
            const tag = readUInt(32);
            const playedCount = readUInt(8);
            return {id: CommandId.BuildHouse, card, player, buildingId, x, y, z, angle, tag, playedCount, description: `Build ${buildingId} #${playedCount} (${getPlayerName(player)})`};
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

            return {id: CommandId.GroupGoto, player, squads, positions, walkMode, runOrOrientation, orientation, description: `Move command (${getPlayerName(player)})`};
        },
        [CommandId.CastSpellEntity]: () => {
            const player = readUInt(32);
            const source = readUInt(32);
            const spell = readUInt(32);
            return {
                id: CommandId.CastSpellEntity,
                player,
                source,
                spell,
                target: readCGdTarget(),
                description: `Use ability ${source}->${spell} (${getPlayerName(player)})`,
            };
        },
        [CommandId.GroupAttack]: () => {
            const player = readUInt(32);
            const squadCount = readUInt(16);
            const squads: number[] = [];
            for (let idx = 0; idx < squadCount; idx++) {
                squads.push(readUInt(32));
            };

            const target = readCGdTarget();
            const forceAttack = readUInt(8);

            return {id: CommandId.GroupAttack, player, squads, target, forceAttack, description: `Attack command (${getPlayerName(player)})`};
        },
        [CommandId.GroupHoldPosition]: () => {
            const player = readUInt(32);
            const squadCount = readUInt(16);
            const squads: number[] = [];
            for (let idx = 0; idx < squadCount; idx++) {
                squads.push(readUInt(32));
            };

            return {id: CommandId.GroupHoldPosition, player, squads, description: `Hold position (${getPlayerName(player)})`};
        },
        [CommandId.TokenSlotBuild]: () => {
            const player = readUInt(32);
            const slot = readUInt(32);
            const monument = readUInt(8);

            return {id: CommandId.TokenSlotBuild, player, slot, monument, description: `Build monument ${slot} (${getPlayerName(player)})`};
        },
        [CommandId.PowerSlotBuild]: () => {
            const player = readUInt(32);
            const slot = readUInt(32);

            return {id: CommandId.PowerSlotBuild, player, slot, description: `Build power well ${slot} (${getPlayerName(player)})`};
        },
        [CommandId.GroupKillEntity]: () => {
            const player = readUInt(32);
            const entitiesCount = readUInt(32);
            const entities: number[] = [];
            for (let idx = 0; idx < entitiesCount; idx++) {
                entities.push(readUInt(32));
            };

            return {id: CommandId.GroupKillEntity, player, entities, description: `Kill entities ${entities} (${getPlayerName(player)})`};
        },
        [CommandId.GroupLootTarget]: () => {
            const player = readUInt(32);
            const squadCount = readUInt(32);
            const squads: number[] = [];
            for (let idx = 0; idx < squadCount; idx++) {
                squads.push(readUInt(32));
            };
            const lootTarget = readUInt(32);

            return {id: CommandId.GroupLootTarget, player, squads, lootTarget, description: `Try looting (${getPlayerName(player)})`};
        },
    };

    const parser = commandParsers[id];
    if (!parser) return {id: CommandId.NotYetImplemented, realId: id, description: 'Not yet implemented'};

    return parser();
};

// TODO this shouldnt be necessary, but starting at headerSize doesnt work
const getActionsStart = () => {
    let actionsStart = Number.POSITIVE_INFINITY;
    for (let idx = 0; idx < 2000; idx++) {
        const value = pmv.readUInt16LE(idx);
        if (value >= 4000 && value <= 4100) {
            actionsStart = Math.min(actionsStart, idx);
        }
    }
    return actionsStart - 8; // TODO fix
};

offset = getActionsStart();

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
            if (command.realId !== 4045) console.log('WIP', {offset, command});
            commands.push(command);
            continue;
        }
    }
    steps[step] = commands;

    if (offset !== targetOffset) {
        throw new Error(`Target offset not reached when parsing commands, should be ${targetOffset} but got ${offset}`);
    }
}

const toTimestamp = (deciSeconds: number) => {
    const min = Math.floor(deciSeconds / 600);
    const sec = (deciSeconds - 600 * min) / 10;
    return `${min.toString().padStart(2, '0')}:${sec.toFixed(1).toString().padStart(4, '0')}`;
};

const filteredCommandIds: CommandId[] = [
    CommandId.NotYetImplemented,
    CommandId.GroupAttack,
    CommandId.GroupGoto,
];

Object.entries(steps).forEach(([step, commands]) => {
    const valid = commands.filter(c => !filteredCommandIds.includes(c.id)).map(c => c.description);
    if (valid.length > 0) valid.forEach(v => console.log(toTimestamp(+step), '-', v));
});

console.log('Done parsing', process.argv[2], pmv.length);
console.log(players)