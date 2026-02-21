import {Card, CGdTarget, Command, CommandId, Player, PlayerType, RelationType, Target, TeamRelation} from './api';
import {CardIds} from './card-ids';
import {MapName} from './maps';

export const parseReplay = (pmv: Buffer<ArrayBuffer>) => {
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

    const headerData = {
        gameVersion: readUInt(32),
        clientVersion: readUInt(32),
        finalStep: readUInt(32), // game time in deci-seconds
        mapCrc: readUInt(32),
        mapFileName: readString(),
        headerSize: readUInt(32), // real actions start after this offset
        seed: readUInt(16), // TODO: this is wrong for some reason
        map: readUInt(32) as MapName,
        difficulty: readUInt(8), // 1 (std), 2 (adv), 3 (exp)
        mapType: readUInt(8), // PVP, PVE
        unknown1: readUInt(8), // unknown
        ownerId: readBigInt(), // ?
        replayFormatVersion: readUInt(8),
    };

    const relationsMatrixLen = readUInt(16);
    const teamRelations: TeamRelation[] = [];
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

    const players: Player[] = [];
    while (offset < headerData.headerSize) {
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

        players.push({name, id, team, position, playerType, cards, guessedPlayedCards: {}});
    }

    // TODO how to index into players?
    const getPlayerName = (playerId: number) => {
        const player = players.find(p => p.id === playerId);
        return player ? player.name : 'unknown';
    };

    const readTarget = (): Target => ({
        category: readUInt(32),
        subCategory: readUInt(32),
        uid: readUInt(32),
        x: readFloat(),
        y: readFloat(),
    });

    const readCGdTarget = (): CGdTarget => {
        const version = readUInt(8);
        const targetCount = readUInt(32);
        const targets: Target[] = [];
        for (let idx = 0; idx < targetCount; idx++) {
            targets.push(readTarget());
        }

        return {version, targets};
    };

    const readCommand = (id: CommandId): Command => {
        const commandReaders: {[id in CommandId]?: () => Command} = {
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
            [CommandId.CastSpellGodMulti]: () => {
                const card = readUInt(32);
                const player = readUInt(32);
                return {
                    id: CommandId.CastSpellGodMulti,
                    card,
                    player,
                    cardPosition: readUInt(8),
                    tag: readUInt(32),
                    playedCount: readUInt(8),
                    target: readCGdTarget(),
                    description: `Cast spell multi ${CardIds[card % 1_000_000]} (${getPlayerName(player)})`,
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
                return {id: CommandId.BuildHouse, card, player, buildingId, x, y, z, angle, tag, playedCount, description: `Build ${buildingId} (${getPlayerName(player)})`};
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
            [CommandId.Morph]: () => {
                const player = readUInt(32);
                const card = readUInt(32);
                const deckPosition = readUInt(8);
                const tag = readUInt(32);
                const playedCount = readUInt(8);
                const spell = readUInt(32);
                const target = readCGdTarget();
                return {
                    id: CommandId.Morph,
                    player,
                    card,
                    deckPosition,
                    tag,
                    playedCount,
                    spell,
                    target,
                    description: `Morph ${CardIds[card % 1_000_000]} (${getPlayerName(player)})`,
                };
            },
        };

        const reader = commandReaders[id];
        if (!reader) return {id: CommandId.NotYetImplemented, realId: id, description: 'Not yet implemented'};

        return reader();
    };

    // TODO this shouldnt be necessary, but starting at headerSize doesnt work
    const getActionsStart = () => {
        let actionsStart = Number.POSITIVE_INFINITY;
        for (let idx = offset; idx < pmv.length - 4; idx++) {
            const value = pmv.readUInt16LE(idx);
            if (value >= 4000 && value <= 4100) {
                actionsStart = Math.min(actionsStart, idx);
            }
        }
        return actionsStart - 8; // TODO fix
    };

    const readSteps = (actionsStart: number) => {
        console.log('readSteps', {offset, actionsStart});

        if (actionsStart >= pmv.length) return [];
        offset = actionsStart;

        const steps: {[deciSeconds: number]: Command[];} = [];
        while (offset < pmv.length) {
            const step = readUInt(32);
            const size = readUInt(32);

            const commands: Command[] = [];
            const targetOffset = offset + size;
            while (offset < targetOffset) {
                const id = readUInt(32);
                const command = readCommand(id);
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
        return steps;
    };

    const steps = readSteps(getActionsStart());
    
    const commandsByPlayer: {[player: number]: Command[];} = {};
    Object.values(steps)
        .flat()
        .map(c => [(c as any).player, c] as [number, Command])
        .filter(([player, _]) => player)
        .forEach(([player, command]) => {
            if (!commandsByPlayer[player]) commandsByPlayer[player] = [];
            commandsByPlayer[player].push(command);
        });

    const actionPlayerId = +(Object.keys(commandsByPlayer).sort()[0]);

    for (let idx = 0; idx < players.length; idx++) {
        const player = players[idx];
        const playerCommands = commandsByPlayer[actionPlayerId + idx];
        if (!playerCommands) continue;

        const playedCards = playerCommands
            .filter(c => [CommandId.Morph, CommandId.ProduceSquad, CommandId.CastSpellGod, CommandId.CastSpellGodMulti, CommandId.BuildHouse].includes(c.id))
            .map(c => (c as any).card) as number[];

        for (const card of playedCards) {
            if (!player.guessedPlayedCards[card]) {
                player.guessedPlayedCards[card] = 0;
            }

            player.guessedPlayedCards[card] += 1;
        }
    }

    return {
        headerData,
        teamRelations,
        teams,
        players,
        steps,
    };
};
