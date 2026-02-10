const DDRAGON_VERSION = '14.19.1';
const DDRAGON_IMG = `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/champion/`;

let champions = {};
let selectedMyChamp = null;
let selectedEnemyChamp = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
    const res = await fetch('/api/champions');
    champions = await res.json();

    setupSearch('myChampSearch', 'myChampDropdown', 'my');
    setupSearch('enemyChampSearch', 'enemyChampDropdown', 'enemy');

    document.getElementById('analyzeBtn').addEventListener('click', analyze);

    document.addEventListener('click', (e) => {
        document.querySelectorAll('.dropdown').forEach(d => {
            if (!d.parentElement.contains(e.target)) {
                d.classList.remove('active');
            }
        });
    });
}

function setupSearch(inputId, dropdownId, side) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);

    input.addEventListener('input', () => {
        const query = input.value.toLowerCase().trim();
        renderDropdown(dropdown, query, side);
    });

    input.addEventListener('focus', () => {
        const query = input.value.toLowerCase().trim();
        renderDropdown(dropdown, query, side);
    });
}

function renderDropdown(dropdown, query, side) {
    dropdown.innerHTML = '';

    const filtered = Object.entries(champions).filter(([id, data]) => {
        if (!query) return true;
        return data.name.includes(query) || id.toLowerCase().includes(query);
    });

    if (filtered.length === 0) {
        dropdown.innerHTML = '<div style="padding:12px;color:#666;font-size:0.85rem;">결과 없음</div>';
        dropdown.classList.add('active');
        return;
    }

    filtered.forEach(([id, data]) => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        item.innerHTML = `
            <img src="${DDRAGON_IMG}${id}.png" alt="${data.name}"
                 onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2232%22 height=%2232%22><rect fill=%22%23333%22 width=%2232%22 height=%2232%22 rx=%2216%22/></svg>'">
            <div class="champ-info">
                <div class="champ-name">${data.name}</div>
                <div class="champ-role">${data.role} / ${data.type}</div>
            </div>
        `;
        item.addEventListener('click', () => selectChampion(id, data, side));
        dropdown.appendChild(item);
    });

    dropdown.classList.add('active');
}

function selectChampion(id, data, side) {
    if (side === 'my') {
        selectedMyChamp = id;
        updateDisplay('myChampDisplay', id, data);
        document.getElementById('myChampSearch').value = data.name;
        document.getElementById('myChampDropdown').classList.remove('active');
    } else {
        selectedEnemyChamp = id;
        updateDisplay('enemyChampDisplay', id, data);
        document.getElementById('enemyChampSearch').value = data.name;
        document.getElementById('enemyChampDropdown').classList.remove('active');
    }

    const btn = document.getElementById('analyzeBtn');
    btn.disabled = !(selectedMyChamp && selectedEnemyChamp);
}

function updateDisplay(displayId, id, data) {
    const display = document.getElementById(displayId);
    display.classList.add('selected');
    display.innerHTML = `
        <img src="${DDRAGON_IMG}${id}.png" alt="${data.name}"
             onerror="this.style.display='none'">
        <div class="champ-selected-name">${data.name}</div>
        <div class="champ-selected-role">${data.role} / ${data.type}</div>
    `;
}

async function analyze() {
    if (!selectedMyChamp || !selectedEnemyChamp) return;

    const btn = document.getElementById('analyzeBtn');
    const results = document.getElementById('results');

    btn.disabled = true;
    btn.textContent = '분석 중...';

    try {
        const res = await fetch(`/api/matchup?my=${selectedMyChamp}&enemy=${selectedEnemyChamp}`);
        const data = await res.json();

        if (data.error) {
            alert(data.error);
            return;
        }

        renderResults(data);
        results.style.display = 'block';
        results.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
        alert('분석 중 오류가 발생했습니다.');
        console.error(err);
    } finally {
        btn.disabled = false;
        btn.textContent = '상성 분석하기';
    }
}

function renderResults(data) {
    const { myChamp, enemyChamp, matchup, counters } = data;

    document.getElementById('resultMyChamp').textContent = myChamp.name;
    document.getElementById('resultEnemyChamp').textContent = enemyChamp.name;

    const rating = matchup.rating;
    const ratingFill = document.getElementById('ratingFill');
    const ratingText = document.getElementById('ratingText');

    const percentage = (rating / 10) * 100;
    ratingFill.style.width = percentage + '%';

    if (rating >= 7) {
        ratingFill.style.background = 'linear-gradient(90deg, #0AC8B9, #00e6b8)';
        ratingText.style.color = '#0AC8B9';
        ratingText.textContent = `${rating}/10 - 유리한 매치업`;
    } else if (rating >= 5) {
        ratingFill.style.background = 'linear-gradient(90deg, #C89B3C, #e6b84d)';
        ratingText.style.color = '#C89B3C';
        ratingText.textContent = `${rating}/10 - 균형 매치업`;
    } else {
        ratingFill.style.background = 'linear-gradient(90deg, #E84057, #ff6b7a)';
        ratingText.style.color = '#E84057';
        ratingText.textContent = `${rating}/10 - 불리한 매치업`;
    }

    document.getElementById('matchupSummary').textContent = matchup.summary;

    renderPhase('earlyPhase', matchup.phases.early);
    renderPhase('midPhase', matchup.phases.mid);
    renderPhase('latePhase', matchup.phases.late);

    const tipsList = document.getElementById('tipsList');
    tipsList.innerHTML = matchup.tips.map(t => `<li>${t}</li>`).join('');

    const warningsList = document.getElementById('warningsList');
    warningsList.innerHTML = matchup.warnings.map(w => `<li>${w}</li>`).join('');

    renderCounters(counters);
}

function renderPhase(elementId, phaseData) {
    const card = document.getElementById(elementId);
    const ratingEl = card.querySelector('.phase-rating');
    const descEl = card.querySelector('.phase-desc');

    const rating = phaseData.rating;
    let color;
    if (rating >= 7) color = '#0AC8B9';
    else if (rating >= 5) color = '#C89B3C';
    else color = '#E84057';

    ratingEl.textContent = `${rating}/10`;
    ratingEl.style.color = color;
    descEl.textContent = phaseData.desc;
}

function renderCounters(counters) {
    const grid = document.getElementById('countersGrid');
    grid.innerHTML = '';

    if (!counters || counters.length === 0) {
        grid.innerHTML = '<p style="color:#666;text-align:center;grid-column:1/-1;">같은 라인 카운터 데이터가 없습니다.</p>';
        return;
    }

    counters.forEach(c => {
        let ratingColor;
        if (c.rating >= 7) ratingColor = '#0AC8B9';
        else if (c.rating >= 5) ratingColor = '#C89B3C';
        else ratingColor = '#E84057';

        const card = document.createElement('div');
        card.className = 'counter-card';
        card.innerHTML = `
            <img src="${DDRAGON_IMG}${c.id}.png" alt="${c.name}"
                 onerror="this.style.display='none'">
            <div class="counter-name">${c.name}</div>
            <div class="counter-rating" style="color:${ratingColor}">${c.rating}/10</div>
            <div class="counter-reason">${c.reason}</div>
        `;
        grid.appendChild(card);
    });
}
