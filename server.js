const http = require('http');
const path = require('path');
const fs = require('fs');
const url = require('url');

const PORT = 5000;

const CHAMPIONS = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'champions.json'), 'utf-8'));
const MATCHUPS = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'matchups.json'), 'utf-8'));

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
};

function serveStatic(filePath, res) {
    const ext = path.extname(filePath);
    const mime = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Not Found');
            return;
        }
        res.writeHead(200, { 'Content-Type': mime });
        res.end(data);
    });
}

function sendJSON(res, data, status = 200) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
}

function calculateRating(myData, enemyData) {
    let score = 5.0;

    if ((myData.goodAgainst || []).includes(enemyData.id)) score += 1.5;
    if ((myData.counters || []).includes(enemyData.id)) score -= 1.5;

    const weights = {
        early: 0.12, mid: 0.12, late: 0.10,
        sustain: 0.08, burst: 0.10, dps: 0.10,
        cc: 0.08, mobility: 0.10, tankiness: 0.10, utility: 0.05
    };

    for (const [stat, weight] of Object.entries(weights)) {
        const diff = myData.stats[stat] - enemyData.stats[stat];
        score += diff * weight * 0.5;
    }

    if (myData.damageType === 'AD' && enemyData.stats.tankiness >= 8) score -= 0.5;
    if (myData.damageType === 'AP' && enemyData.stats.tankiness >= 8) score -= 0.3;
    if (myData.stats.mobility >= 7 && enemyData.stats.mobility <= 4) score += 0.3;
    if (myData.stats.burst >= 8 && enemyData.stats.tankiness <= 3) score += 0.5;

    return Math.max(1, Math.min(10, Math.round(score)));
}

function generatePhase(myData, enemyData, phase) {
    const diff = myData.stats[phase] - enemyData.stats[phase];
    const phaseKr = { early: '초반', mid: '중반', late: '후반' }[phase];
    const myName = myData.name;
    const enemyName = enemyData.name;

    let desc;
    if (diff >= 3) desc = `${phaseKr}에 ${myName}이(가) 압도적으로 유리합니다. 적극적으로 교전하여 이득을 벌리세요.`;
    else if (diff >= 2) desc = `${phaseKr}에 ${myName}이(가) 우세합니다. 교전 기회를 적극적으로 활용하세요.`;
    else if (diff >= 1) desc = `${phaseKr}에 ${myName}이(가) 약간 유리합니다. 스킬 적중에 따라 결과가 달라집니다.`;
    else if (diff === 0) desc = `${phaseKr}은 두 챔피언이 비슷한 수준입니다. 플레이어 실력과 스킬 적중이 승패를 결정합니다.`;
    else if (diff >= -1) desc = `${phaseKr}에 ${enemyName}이(가) 약간 유리합니다. 무리한 교전을 피하고 CS에 집중하세요.`;
    else if (diff >= -2) desc = `${phaseKr}에 ${enemyName}이(가) 우세합니다. 수비적으로 플레이하며 정글 도움을 요청하세요.`;
    else desc = `${phaseKr}에 ${enemyName}이(가) 압도적으로 유리합니다. 타워 아래에서 안전하게 CS만 챙기세요.`;

    if (phase === 'early') {
        if (myData.stats.sustain >= 7 && enemyData.stats.sustain <= 4) desc += ` ${myName}의 높은 체력 회복력을 활용하세요.`;
        if (myData.rangeType === '원거리' && enemyData.rangeType === '근접') desc += ' 원거리 이점을 활용한 견제가 가능합니다.';
    } else if (phase === 'mid') {
        if (myData.stats.burst >= 8) desc += ` ${myName}의 강력한 폭딜로 원콤을 노려보세요.`;
    } else if (phase === 'late') {
        if (myData.stats.late >= 8) desc += ` ${myName}의 후반 스케일링이 매우 강력합니다.`;
        if (enemyData.stats.late >= 8) desc += ` 하지만 ${enemyName}도 후반에 강하므로 주의하세요.`;
    }

    return { rating: Math.max(1, Math.min(10, 5 + diff)), desc };
}

function generateTips(myData, enemyData) {
    const tips = [];
    const enemyName = enemyData.name;

    if (enemyData.stats.sustain >= 7) tips.push('상대의 체력 회복이 높습니다. 치유 감소 아이템(이그나이트/처형인의 대검)을 고려하세요.');
    if (myData.stats.mobility >= 7 && enemyData.stats.mobility <= 4) tips.push('기동력 차이를 활용하여 짧은 교전 후 빠지는 패턴을 사용하세요.');
    if (enemyData.stats.cc >= 7) tips.push('상대의 CC가 강력합니다. 수은 장식띠/정화를 고려하세요.');
    if (myData.stats.burst >= 8 && enemyData.stats.tankiness <= 4) tips.push(`${enemyName}은(는) 방어력이 낮습니다. 풀콤보로 원콤을 노리세요.`);
    if (myData.rangeType === '원거리' && enemyData.rangeType === '근접') tips.push('사거리 이점을 활용하여 안전하게 견제하세요. 접근당하지 않도록 거리 유지가 핵심입니다.');
    if (myData.rangeType === '근접' && enemyData.rangeType === '원거리') tips.push('원거리 챔피언 상대로 접근 기회를 노려야 합니다. 덤불과 미니언을 활용하세요.');
    if (myData.stats.dps >= 7 && enemyData.stats.burst >= 7) tips.push('상대의 폭딜을 버틴 후 지속 딜로 역전할 수 있습니다.');
    if (enemyData.stats.burst >= 8) tips.push(`${enemyName}의 폭딜에 주의하세요. 체력 관리가 중요합니다.`);
    if (myData.powerSpikes && myData.powerSpikes.length > 0) tips.push(`파워 스파이크: ${myData.powerSpikes[0]} 시점에 적극적으로 교전을 시도하세요.`);
    if (tips.length === 0) tips.push(`${myData.name}의 강점을 활용하여 안정적으로 라인전을 운영하세요.`);

    return tips.slice(0, 5);
}

function generateWarnings(myData, enemyData) {
    const warnings = [];
    const enemyName = enemyData.name;

    if (enemyData.powerSpikes && enemyData.powerSpikes.length > 0) warnings.push(`${enemyName}의 파워 스파이크(${enemyData.powerSpikes[0]})에 주의하세요.`);
    if (myData.weaknesses && myData.weaknesses.length > 0) warnings.push(`주의: ${myData.weaknesses[0]}`);
    if (enemyData.strengths && enemyData.strengths.length > 0) warnings.push(`상대 강점: ${enemyData.strengths[0]}`);
    if (enemyData.stats.mobility >= 8) warnings.push(`${enemyName}의 높은 기동력으로 갱킹 회피가 쉬우니 정글과 협력하세요.`);
    if (enemyData.stats.late >= 8 && myData.stats.late <= 5) warnings.push(`${enemyName}은(는) 후반에 매우 강합니다. 초중반에 이득을 벌리세요.`);
    if (warnings.length === 0) warnings.push(`${enemyName}의 핵심 스킬 쿨다운을 파악하여 교전 타이밍을 잡으세요.`);

    return warnings.slice(0, 4);
}

function generateMatchup(myChampId, enemyChampId) {
    const myData = CHAMPIONS[myChampId];
    const enemyData = CHAMPIONS[enemyChampId];
    const rating = calculateRating(myData, enemyData);
    const myName = myData.name;
    const enemyName = enemyData.name;

    let summary;
    if (rating >= 7) summary = `${myName}은(는) ${enemyName} 상대로 유리한 매치업입니다.`;
    else if (rating >= 6) summary = `${myName}은(는) ${enemyName} 상대로 약간 유리합니다.`;
    else if (rating === 5) summary = `${myName}과(와) ${enemyName}은(는) 균형 잡힌 매치업입니다. 실력이 승패를 결정합니다.`;
    else if (rating >= 4) summary = `${myName}은(는) ${enemyName} 상대로 약간 불리합니다.`;
    else summary = `${myName}은(는) ${enemyName} 상대로 불리한 매치업입니다. 신중한 플레이가 필요합니다.`;

    const statNames = { early: '초반', mid: '중반', late: '후반', sustain: '체력회복', burst: '폭딜', dps: '지속딜', cc: 'CC', mobility: '기동력', tankiness: '탱킹', utility: '유틸' };
    const advantages = [], disadvantages = [];
    for (const [key, label] of Object.entries(statNames)) {
        const diff = myData.stats[key] - enemyData.stats[key];
        if (diff >= 2) advantages.push(label);
        else if (diff <= -2) disadvantages.push(label);
    }
    if (advantages.length > 0) summary += ` ${myName}의 ${advantages.slice(0, 3).join(', ')} 능력이 우세합니다.`;
    if (disadvantages.length > 0) summary += ` 반면 ${enemyName}의 ${disadvantages.slice(0, 3).join(', ')}에 주의해야 합니다.`;

    return {
        rating, summary,
        phases: { early: generatePhase(myData, enemyData, 'early'), mid: generatePhase(myData, enemyData, 'mid'), late: generatePhase(myData, enemyData, 'late') },
        tips: generateTips(myData, enemyData),
        warnings: generateWarnings(myData, enemyData)
    };
}

function getCounters(enemyChampId) {
    const enemyData = CHAMPIONS[enemyChampId];
    const scores = [];

    for (const [champId, champData] of Object.entries(CHAMPIONS)) {
        if (champId === enemyChampId) continue;
        if (champData.role !== enemyData.role) continue;

        const rating = calculateRating(champData, enemyData);
        let reason = `${champData.name}의 전체적인 스탯이 우세합니다`;

        if ((champData.goodAgainst || []).includes(enemyData.id))
            reason = `${champData.name}은(는) ${enemyData.name}에게 강한 챔피언입니다`;

        const advantages = [];
        const statLabels = { burst: '폭딜', mobility: '기동력', cc: 'CC', tankiness: '탱킹', sustain: '체력회복' };
        for (const [key, label] of Object.entries(statLabels)) {
            if (champData.stats[key] - enemyData.stats[key] >= 2) advantages.push(label);
        }
        if (advantages.length > 0) reason = `${advantages.slice(0, 2).join(', ')}에서 우세`;

        scores.push({ id: champId, name: champData.name, role: champData.role, rating, reason });
    }

    scores.sort((a, b) => b.rating - a.rating);
    return scores.slice(0, 5);
}

const server = http.createServer((req, res) => {
    const parsed = url.parse(req.url, true);
    const pathname = parsed.pathname;

    if (pathname === '/') {
        serveStatic(path.join(__dirname, 'templates', 'index.html'), res);
    } else if (pathname.startsWith('/static/')) {
        const filePath = path.join(__dirname, pathname);
        serveStatic(filePath, res);
    } else if (pathname === '/api/champions') {
        const result = {};
        for (const [cid, data] of Object.entries(CHAMPIONS)) {
            result[cid] = { id: data.id, name: data.name, role: data.role, type: data.type };
        }
        sendJSON(res, result);
    } else if (pathname === '/api/matchup') {
        const myChamp = parsed.query.my || '';
        const enemyChamp = parsed.query.enemy || '';

        if (!CHAMPIONS[myChamp] || !CHAMPIONS[enemyChamp]) return sendJSON(res, { error: '챔피언을 찾을 수 없습니다.' }, 404);
        if (myChamp === enemyChamp) return sendJSON(res, { error: '같은 챔피언을 선택할 수 없습니다.' }, 400);

        const matchupData = (MATCHUPS[myChamp] && MATCHUPS[myChamp][enemyChamp])
            ? MATCHUPS[myChamp][enemyChamp]
            : generateMatchup(myChamp, enemyChamp);

        sendJSON(res, {
            myChamp: { id: myChamp, name: CHAMPIONS[myChamp].name, role: CHAMPIONS[myChamp].role },
            enemyChamp: { id: enemyChamp, name: CHAMPIONS[enemyChamp].name, role: CHAMPIONS[enemyChamp].role },
            matchup: matchupData,
            counters: getCounters(enemyChamp)
        });
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

server.listen(PORT, () => {
    console.log(`VS.LOL 서버 실행 중: http://localhost:${PORT}`);
});
