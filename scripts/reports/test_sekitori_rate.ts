import { RikishiStatus, GrowthType } from '../../src/logic/models';
import { runSimulation } from '../../src/logic/simulation/runner';

const NUM_SIMULATIONS = 100;

// Mock initial stats
const createInitialStatus = (id: string, potential: number, growthType: GrowthType): RikishiStatus => ({
    heyaId: 'test_heya',
    shikona: `Rikishi${id}`,
    entryAge: 15,
    age: 15,
    rank: { division: 'Maezumo', name: '前相撲', side: 'East' },
    potential,
    growthType,
    tactics: 'BALANCE',
    signatureMoves: [],
    bodyType: 'NORMAL',
    profile: {
        realName: `Rikishi${id}`,
        birthplace: '東京都',
        personality: 'CALM',
    },
    bodyMetrics: {
        heightCm: 182,
        weightKg: 140,
    },
    traits: [],
    stats: {
        tsuki: 10, oshi: 10, kumi: 10, nage: 10,
        koshi: 10, deashi: 10, waza: 10, power: 10
    },
    history: {
        records: [],
        events: [],
        maxRank: { division: 'Maezumo', name: '前相撲' },
        totalWins: 0, totalLosses: 0, totalAbsent: 0,
        yushoCount: { makuuchi: 0, juryo: 0, makushita: 0, others: 0 },
        kimariteTotal: {}
    },
    statHistory: [],
    durability: 100,
    currentCondition: 50,
    injuryLevel: 0,
    injuries: []
});

const runTest = async () => {
    let sekitoriCount = 0;
    let makuuchiCount = 0;
    let sanyakuCount = 0;
    let ozekiCount = 0;
    let yokozunaCount = 0;
    const reasons: Record<string, number> = {};

    console.log(`Starting ${NUM_SIMULATIONS} simulations...`);

    for (let i = 0; i < NUM_SIMULATIONS; i++) {
        const potential = 70 + Math.floor(Math.random() * 30);
        const types: GrowthType[] = ['EARLY', 'NORMAL', 'LATE', 'GENIUS'];
        const growthType = types[Math.floor(Math.random() * types.length)];

        const initial = createInitialStatus(i.toString(), potential, growthType);
        initial.stats = {
            tsuki: 20, oshi: 20, kumi: 20, nage: 20,
            koshi: 20, deashi: 20, waza: 20, power: 20
        };

        const result = await runSimulation({ initialStats: initial, oyakata: null });
        const maxRank = result.history.maxRank;

        const retire = result.history.events.find(e => e.type === 'RETIREMENT');
        const reason = retire ? retire.description : 'Unknown';
        reasons[reason] = (reasons[reason] || 0) + 1;

        if (['Makuuchi', 'Juryo'].includes(maxRank.division)) {
            sekitoriCount++;
        }
        if (maxRank.division === 'Makuuchi') {
            makuuchiCount++;
            if (['横綱', '大関', '関脇', '小結'].includes(maxRank.name)) {
                sanyakuCount++;
            }
            if (['横綱', '大関'].includes(maxRank.name)) {
                ozekiCount++;
            }
            if (maxRank.name === '横綱') {
                yokozunaCount++;
            }
        }

        if (i % 10 === 0) {
            console.log(`completed: ${i + 1}`);
        }
    }

    console.log('\nResults:');
    console.log(`Total: ${NUM_SIMULATIONS}`);
    console.log(`Sekitori: ${sekitoriCount} (${(sekitoriCount / NUM_SIMULATIONS) * 100}%)`);
    console.log(`Makuuchi: ${makuuchiCount} (${(makuuchiCount / NUM_SIMULATIONS) * 100}%)`);
    console.log(`Sanyaku: ${sanyakuCount} (${(sanyakuCount / NUM_SIMULATIONS) * 100}%)`);
    console.log(`Ozeki: ${ozekiCount} (${(ozekiCount / NUM_SIMULATIONS) * 100}%)`);
    console.log(`Yokozuna: ${yokozunaCount} (${(yokozunaCount / NUM_SIMULATIONS) * 100}%)`);

    console.log('\nRetirement Reasons:');
    Object.entries(reasons).forEach(([r, c]) => console.log(`${r}: ${c}`));
};

runTest();
