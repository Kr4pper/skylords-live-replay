export enum PlayerType {
    Human = 0x01,
    Monsters = 0x02,
    Any = 0x03,
    EmptySlot = 0x04,
    AiBot = 0x08,
}
export type Card = {id: number, charges: number;};
export type Player = {name: string, id: number, team: number, position: number, playerType: PlayerType, cards: Card[]; guessedPlayedCards: {[cardId: number]: number;};};

export enum RelationType {
    Neutral = 0x00,
    Friends = 0x01,
    Enemies = 0xFF,
}
export type TeamRelation = {teamA: number, teamB: number, relation: RelationType;};

export type Target = {category: number, subCategory: number, uid: number, x: number, y: number;};
export type CGdTarget = {version: number, targets: Target[];};

export enum CommandId {
    NotYetImplemented = -1,
    PlayerRemove = 4001,
    PlayerSurrender = 4002,
    PlayerLootResult = 4006,
    ScriptGoal = 4007,
    ProduceSquad = 4009,
    CastSpellGod = 4010,
    CastSpellGodMulti = 4011,
    BuildHouse = 4012,
    GroupGoto = 4013,
    CastSpellEntity = 4014,
    GroupAttack = 4015,
    GroupHoldPosition = 4020,
    PowerSlotBuild = 4030,
    TokenSlotBuild = 4031,
    GroupKillEntity = 4041,
    GroupLootTarget = 4043,
    Morph = 4044,
    SrAddition = 4045,
}

export type Command = {description: string;} & (
    | {id: CommandId.NotYetImplemented, realId: CommandId;}
    | {id: CommandId.PlayerRemove, player: number;}
    | {id: CommandId.PlayerSurrender, player: number;}
    | {id: CommandId.PlayerLootResult, account: number, lootTarget: number, gold: [number, number][];}
    | {id: CommandId.ScriptGoal, goalSubId: number;}
    | {id: CommandId.ProduceSquad, card: number, player: number, cardPosition: number, tag: number, playedCount: number, x: number, y: number, barrierToMount: number;}
    | {id: CommandId.CastSpellGod, card: number, player: number, cardPosition: number, tag: number, playedCount: number, target: CGdTarget;}
    | {id: CommandId.CastSpellGodMulti, card: number, player: number, cardPosition: number, tag: number, playedCount: number, target: CGdTarget;}
    | {id: CommandId.BuildHouse, card: number, player: number, buildingId: number, x: number, y: number, z: number, angle: number, tag: number, playedCount: number;}
    | {id: CommandId.GroupGoto, player: number, squads: number[], positions: [number, number][], walkMode: number, runOrOrientation: number, orientation: number;}
    | {id: CommandId.CastSpellEntity, player: number, source: number, spell: number, target: CGdTarget;}
    | {id: CommandId.GroupAttack, player: number, squads: number[], target: CGdTarget, forceAttack: number;}
    | {id: CommandId.GroupHoldPosition, player: number, squads: number[];}
    | {id: CommandId.PowerSlotBuild, player: number, slot: number;}
    | {id: CommandId.TokenSlotBuild, player: number, slot: number, monument: number;}
    | {id: CommandId.GroupKillEntity, player: number, entities: number[];}
    | {id: CommandId.Morph, player: number, card: number, deckPosition: number, tag: number, playedCount: number, spell: number, target: CGdTarget;}
    | {id: CommandId.GroupLootTarget, player: number, squads: number[], lootTarget: number;}
);
