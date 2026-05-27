// DWARF mini PRO — Main Application Logic v2.0
// Hardware constraints arrays
const ALLOWED_EXPOSURE = [1, 2, 4, 8, 10, 15, 20, 25, 30, 40, 45, 60];
const ALLOWED_GAIN = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150];

function snapToAllowed(value, allowedArray) {
    if (value === undefined || value === null) return allowedArray[0];
    let closest = allowedArray[0];
    let minDiff = Math.abs(value - closest);
    for (let i = 1; i < allowedArray.length; i++) {
        const diff = Math.abs(value - allowedArray[i]);
        if (diff < minDiff) {
            minDiff = diff;
            closest = allowedArray[i];
        }
    }
    return closest;
}

function getCardinalDirectionFromAzimuth(azDegrees) {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(((azDegrees % 360) / 22.5)) % 16;
    return directions[index];
}

function calculateCardinalDirectionAtTime(obj, date, targetHour) {
    if (!obj || obj.ra_h === undefined || obj.dec === undefined) return 'Unknown';
    const pts = getAltCurve(obj.ra_h, obj.dec, date);
    const targetPoint = pts.find(p => Math.abs(p.h - targetHour) < 0.25);
    if (targetPoint && targetPoint.az !== undefined) {
        return getCardinalDirectionFromAzimuth(targetPoint.az);
    }
    return 'Calculating...';
}

// OBSERVATION MODES
const OBS_MODES = {
    deep_sky: {
        name: "Deep Sky", icon: "🌌", defaults: {exp: 15, gain: 80, filter: "Astro", frames: 300},
        constraints: {maxBortle: 9, maxMoon: 100, minAlt: 30},
        tips: ["Use Dual-band filter for emission nebulae", "Ensure perfect polar alignment", "Focus on a bright star first"],
        post: ["Stack with DeepSkyStacker or Siril", "Use GraXpert for gradient removal"],
        difficulty: "🟡", estTime: "45-120 min"
    },
    milky_way: {
        name: "Milky Way", icon: "🌌✨", defaults: {exp: 10, gain: 80, filter: "None", frames: 30},
        constraints: {maxBortle: 4, maxMoon: 30, minAlt: 30},
        tips: ["Target the Galactic Core (Sagittarius)", "Use a wide-angle lens if possible", "Shoot during New Moon phase"],
        post: ["Stack to reduce noise", "Enhance contrast in Lightroom/Camera Raw"],
        difficulty: "🟢", estTime: "10-20 min"
    },
    star_trails: {
        name: "Star Trails", icon: "💫", defaults: {exp: 30, gain: 60, filter: "None", frames: 120},
        constraints: {maxBortle: 7, maxMoon: 50, minAlt: 20},
        tips: ["Point North for circular trails", "Disable noise reduction between frames", "Use a stable tripod"],
        post: ["Use StarStaX (free) for blending frames", "Enable 'Gap Filling' mode"],
        difficulty: "🟢", estTime: "60-240 min"
    },
    time_lapse: {
        name: "Time-Lapse", icon: "⏱️", defaults: {exp: 1, gain: 40, filter: "None", frames: 600},
        constraints: {maxBortle: 9, maxMoon: 100, minAlt: 10},
        tips: ["Check battery for long sessions", "Lock exposure to avoid flickering", "Set interval slightly longer than exposure"],
        post: ["Assemble frames at 24 or 30 fps", "Add motion blur in post if needed"],
        difficulty: "🟡", estTime: "30-180 min"
    }
};

function switchObsMode(mode) {
    localStorage.setItem('dwarf_obs_mode', mode);
    const searchBox = document.querySelector('.search-box');
    const tags = document.querySelector('.tags');
    const sheet = document.getElementById('sheet');
    const exportSection = document.getElementById('exportSection');
    const tipsSection = document.getElementById('tipsSection');
    const tonightPanel = document.getElementById('tonightPanel');
    const panelMW = document.getElementById('panel_milky_way');
    const panelST = document.getElementById('panel_star_trails');
    const panelTL = document.getElementById('panel_time_lapse');
    
    if (mode === 'deep_sky') {
        if (searchBox) searchBox.style.display = 'flex';
        if (tags) tags.style.display = 'flex';
        if (sheet) sheet.style.display = '';
        if (tonightPanel) tonightPanel.style.display = '';
        if (panelMW) panelMW.style.display = 'none';
        if (panelST) panelST.style.display = 'none';
        if (panelTL) panelTL.style.display = 'none';
    } else {
        if (searchBox) searchBox.style.display = 'none';
        if (tags) tags.style.display = 'none';
        if (sheet) sheet.style.display = 'none';
        if (exportSection) exportSection.style.display = 'none';
        if (tipsSection) tipsSection.style.display = 'none';
        if (tonightPanel) tonightPanel.style.display = 'none';
        if (panelMW) panelMW.style.display = mode === 'milky_way' ? '' : 'none';
        if (panelST) panelST.style.display = mode === 'star_trails' ? '' : 'none';
        if (panelTL) panelTL.style.display = mode === 'time_lapse' ? '' : 'none';
        if (mode === 'milky_way') { calcMW(); restoreMWChecklist(); updateMWAlerts(); }
        if (mode === 'star_trails') { calcST(); restoreSTChecklist(); updateSTAlerts(); }
        if (mode === 'time_lapse') { calcTL(); restoreTLChecklist(); updateTLAlerts(); }
    }
    updateModeBanner(mode);
    if (window._skyQuality) updateSkyQualityBanner();
}

function calcMW() {
    const exp = parseInt(document.getElementById('mw_exp').value) || 20;
    const frames = parseInt(document.getElementById('mw_frames').value) || 30;
    const totalSec = exp * frames;
    const storageGB = (frames * 30 / 1024).toFixed(2);
    document.getElementById('mw_r_session').textContent = formatDur(totalSec);
    document.getElementById('mw_r_storage').textContent = storageGB + ' GB';
}

function calcST() {
    const trailMin = parseInt(document.getElementById('st_trail_min').value) || 60;
    const exp = parseInt(document.getElementById('st_exp').value) || 25;
    const gap = parseInt(document.getElementById('st_gap').value) || 1;
    const cycleTime = exp + gap;
    const totalSec = trailMin * 60;
    const frames = Math.ceil(totalSec / cycleTime);
    const actualSec = frames * cycleTime;
    const storageGB = (frames * 25 / 1024).toFixed(2);
    const battPct = Math.round((actualSec / 60) / 10 * 4);
    document.getElementById('st_r_frames').textContent = frames + ' frames';
    document.getElementById('st_r_session').textContent = formatDur(actualSec);
    document.getElementById('st_r_storage').textContent = storageGB + ' GB';
    document.getElementById('st_r_battery').textContent = battPct + '% est.';
    updateSTAlerts();
}

function calcTL() {
    const vidDur = parseInt(document.getElementById('tl_video_dur').value) || 30;
    const fps = parseInt(document.getElementById('tl_fps').value) || 30;
    const exp = parseInt(document.getElementById('tl_exp').value) || 3;
    const frames = vidDur * fps;
    const captureSec = frames * exp;
    const storageGB = (frames * 8 / 1024).toFixed(2);
    const ratio = Math.round(captureSec / vidDur) + '× speed';
    document.getElementById('tl_r_frames').textContent = frames + ' frames';
    document.getElementById('tl_r_capture').textContent = formatDur(captureSec);
    document.getElementById('tl_r_storage').textContent = storageGB + ' GB';
    document.getElementById('tl_r_ratio').textContent = ratio;
    updateTLAlerts();
}

function formatDur(sec) {
    if (sec < 60) return sec + 's';
    if (sec < 3600) return Math.round(sec / 60) + ' min';
    return (sec / 3600).toFixed(1) + 'h';
}

function _alertBanner(alerts) {
    if (!alerts.length) return '';
    return alerts.map(a => `<div style="background:${a.bg};border:1px solid ${a.col};border-radius:8px;padding:10px 14px;font-size:0.83rem;color:${a.col};font-weight:600;margin-bottom:8px;">${a.icon} ${a.msg}</div>`).join('');
}

function updateMWAlerts() {
    const el = document.getElementById('mw_alerts');
    if (!el) return;
    const bortle = parseInt(document.getElementById('bortleSelect').value) || 5;
    const moon = window._lastLuna || 0;
    const month = new Date().getMonth() + 1;
    const alerts = [];
    if (bortle > 4) alerts.push({bg: 'rgba(252,129,129,0.12)', col: '#fc8181', icon: '🚨', msg: `Bortle ${bortle} — Milky Way core will be washed out. Ideal: ≤ 4. Move to a darker location.`});
    if (moon > 30) alerts.push({bg: 'rgba(252,129,129,0.12)', col: '#fc8181', icon: '🌙', msg: `Moon at ${moon}% — too bright for Milky Way. Wait for phase < 30%.`});
    if (month < 3 || month > 10) alerts.push({bg: 'rgba(252,129,129,0.12)', col: '#fc8181', icon: '📅', msg: `Galactic core NOT visible in this season (northern hemisphere). Best: March–October.`});
    if (window._lastWind && window._lastWind > 30) alerts.push({bg: 'rgba(246,173,85,0.13)', col: '#f6ad55', icon: '💨', msg: `Wind ${window._lastWind} km/h — stabilize your tripod, use low center of gravity.`});
    el.innerHTML = _alertBanner(alerts);
}

function updateSTAlerts() {
    const el = document.getElementById('st_alerts');
    if (!el) return;
    const moon = window._lastLuna || 0;
    const alerts = [];
    if (moon > 10) alerts.push({bg: 'rgba(252,129,129,0.12)', col: '#fc8181', icon: '🌙', msg: `Moon at ${moon}% — too bright for star trails! Need < 10%. Moon glow will overpower fainter stars.`});
    const trailMin = parseInt((document.getElementById('st_trail_min') || {}).value) || 0;
    if (trailMin > 60) alerts.push({bg: 'rgba(246,173,85,0.13)', col: '#f6ad55', icon: '🔋', msg: `Session > 1h — external battery MANDATORY. DWARF internal battery won't last!`});
    if (window._lastWind && window._lastWind > 30) alerts.push({bg: 'rgba(246,173,85,0.13)', col: '#f6ad55', icon: '💨', msg: `Wind ${window._lastWind} km/h — vibrations probable. Use low tripod, add weight to center column.`});
    el.innerHTML = _alertBanner(alerts);
}

function updateTLAlerts() {
    const el = document.getElementById('tl_alerts');
    if (!el) return;
    const alerts = [];
    const frames = parseInt((document.getElementById('tl_r_frames') || {}).textContent) || 0;
    if (frames > 500) alerts.push({bg: 'rgba(246,173,85,0.13)', col: '#f6ad55', icon: '💾', msg: `${frames} frames — SD card ≥ 32 GB strongly recommended.`});
    alerts.push({bg: 'rgba(252,129,129,0.12)', col: '#fc8181', icon: '⚠️', msg: 'Deflicker correction MANDATORY in post. Use LRTimelapse or Lightroom keyframing.'});
    el.innerHTML = _alertBanner(alerts);
}

function saveMWChecklist() {
    const s = [1,2,3,4,5,6].map(i => document.getElementById('mw_chk'+i)?.checked ? '1' : '0').join('');
    try { localStorage.setItem('dwarf_mw_checklist', s); } catch(e) {}
}

function restoreMWChecklist() {
    try {
        const s = localStorage.getItem('dwarf_mw_checklist') || '';
        [1,2,3,4,5,6].forEach((i, idx) => {
            const el = document.getElementById('mw_chk'+i);
            if (el) el.checked = s[idx] === '1';
        });
    } catch(e) {}
}

function resetMWChecklist() {
    [1,2,3,4,5,6].forEach(i => {
        const el = document.getElementById('mw_chk'+i);
        if (el) el.checked = false;
    });
    try { localStorage.removeItem('dwarf_mw_checklist'); } catch(e) {}
}

function saveSTChecklist() {
    const s = [1,2,3,4,5,6].map(i => document.getElementById('st_chk'+i)?.checked ? '1' : '0').join('');
    try { localStorage.setItem('dwarf_st_checklist', s); } catch(e) {}
}

function restoreSTChecklist() {
    try {
        const s = localStorage.getItem('dwarf_st_checklist') || '';
        [1,2,3,4,5,6].forEach((i, idx) => {
            const el = document.getElementById('st_chk'+i);
            if (el) el.checked = s[idx] === '1';
        });
    } catch(e) {}
}

function resetSTChecklist() {
    [1,2,3,4,5,6].forEach(i => {
        const el = document.getElementById('st_chk'+i);
        if (el) el.checked = false;
    });
    try { localStorage.removeItem('dwarf_st_checklist'); } catch(e) {}
}

function saveTLChecklist() {
    const s = [1,2,3,4,5,6].map(i => document.getElementById('tl_chk'+i)?.checked ? '1' : '0').join('');
    try { localStorage.setItem('dwarf_tl_checklist', s); } catch(e) {}
}

function restoreTLChecklist() {
    try {
        const s = localStorage.getItem('dwarf_tl_checklist') || '';
        [1,2,3,4,5,6].forEach((i, idx) => {
            const el = document.getElementById('tl_chk'+i);
            if (el) el.checked = s[idx] === '1';
        });
    } catch(e) {}
}

function resetTLChecklist() {
    [1,2,3,4,5,6].forEach(i => {
        const el = document.getElementById('tl_chk'+i);
        if (el) el.checked = false;
    });
    try { localStorage.removeItem('dwarf_tl_checklist'); } catch(e) {}
}

function updateModeBanner(mode) {
    const data = OBS_MODES[mode];
    let banner = document.getElementById('modeBanner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'modeBanner';
        const container = document.querySelector('.container');
        const sheet = document.getElementById('sheet');
        container.insertBefore(banner, sheet);
    }
    const bortle = parseInt(document.getElementById('bortleSelect').value) || 5;
    const moon = window._lastLuna || 0;
    let warnings = [];
    if (bortle > data.constraints.maxBortle) warnings.push(`⚠️ Bortle ${bortle} is too high (Max ${data.constraints.maxBortle})`);
    if (moon > data.constraints.maxMoon) warnings.push(`⚠️ Moon ${moon}% is too bright (Max ${data.constraints.maxMoon}%)`);
    banner.className = 'advanced-tech';
    banner.style.display = 'block';
    banner.style.marginTop = '20px';
    banner.innerHTML = `<div class="tech-header"><span>${data.icon} Mode: ${data.name}</span><span class="badge ${mode === 'deep_sky' ? 'intermediate' : 'easy'}" style="margin-left:auto">${data.difficulty}</span></div><div style="font-size: 0.85rem; color: var(--text-sub); margin-bottom: 10px;">${data.tips.map(t => `• ${t}`).join('<br>')}</div>${warnings.length > 0 ? `<div style="color: var(--danger); font-weight: 700; font-size: 0.8rem; margin-top: 10px;">${warnings.join('<br>')}</div>` : `<div style="color: var(--success); font-weight: 700; font-size: 0.8rem; margin-top: 10px;">✅ Ideal conditions detected</div>`}`;
}

let userLat = 43.4;
let userLon = 13.55;

(function() {
    const t = new Date();
    const p = n => String(n).padStart(2, '0');
    const d = document.getElementById('obsDate');
    if (d) d.value = t.getFullYear() + '-' + p(t.getMonth() + 1) + '-' + p(t.getDate());
    try {
        const lat = localStorage.getItem('dwarf_lat');
        const lon = localStorage.getItem('dwarf_lon');
        const bor = localStorage.getItem('dwarf_bortle');
        if (lat) document.getElementById('latInput').value = lat;
        if (lon) document.getElementById('lonInput').value = lon;
        if (bor) document.getElementById('bortleSelect').value = bor;
        if (lat && lon) {
            userLat = parseFloat(lat);
            userLon = parseFloat(lon);
        }
    } catch(e) {}
})();

function toJD(date) {
    const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
    const A = Math.floor((14 - m) / 12), Y = y + 4800 - A, M = m + 12 * A - 3;
    return d + Math.floor((153 * M + 2) / 5) + 365 * Y + Math.floor(Y / 4) - Math.floor(Y / 100) + Math.floor(Y / 400) - 32045;
}

function getJD(dateObj) {
    const jdn = toJD(dateObj);
    const h = dateObj.getUTCHours() + dateObj.getUTCMinutes() / 60 + dateObj.getUTCSeconds() / 3600;
    return jdn + (h - 12) / 24;
}

function getLocalSiderealTime(jd, lon_deg) {
    const T = (jd - 2451545.0) / 36525.0;
    let gst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T - T * T * T / 38710000.0;
    gst = ((gst % 360) + 360) % 360;
    return ((gst + lon_deg) % 360 + 360) % 360;
}

function altDeg(ra_h, dec, lstD, lat) {
    const ha = ((lstD - ra_h * 15) % 360 + 360) % 360;
    const haR = ha * Math.PI / 180;
    const dR = dec * Math.PI / 180;
    const lR = lat * Math.PI / 180;
    return Math.asin(Math.max(-1, Math.min(1, Math.sin(dR) * Math.sin(lR) + Math.cos(dR) * Math.cos(lR) * Math.cos(haR)))) * 180 / Math.PI;
}

function azDeg(ra_h, dec, lstD, lat) {
    const ha = ((lstD - ra_h * 15) % 360 + 360) % 360;
    const haR = ha * Math.PI / 180;
    const dR = dec * Math.PI / 180;
    const lR = lat * Math.PI / 180;
    const azR = Math.atan2(Math.sin(haR), Math.cos(haR) * Math.sin(lR) - Math.tan(dR) * Math.cos(lR));
    return (azR * 180 / Math.PI + 180) % 360;
}

function getCardinal(az) {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(az / 45) % 8;
    return directions[index];
}

function getAltCurve(ra_h, dec, date) {
    if (!ra_h && ra_h !== 0) return [];
    if (isNaN(dec) || isNaN(userLat) || isNaN(userLon)) return [];
    const pts = [];
    const tzOffsetH = -date.getTimezoneOffset() / 60;
    for (let h = 18; h <= 30; h += 0.5) {
        const localH = h % 24;
        const dayOffset = h >= 24 ? 1 : 0;
        const hUTC = ((localH - tzOffsetH) % 24 + 24) % 24;
        const baseMs = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate() + dayOffset, Math.floor(hUTC), Math.round((hUTC % 1) * 60), 0);
        const utcDate = new Date(baseMs);
        const jd = getJD(utcDate);
        const lst = getLocalSiderealTime(jd, userLon);
        const alt = altDeg(ra_h, dec, lst, userLat);
        const az = azDeg(ra_h, dec, lst, userLat);
        pts.push({h, alt: isNaN(alt) ? -90 : alt, az: isNaN(az) ? 0 : az, card: getCardinal(isNaN(az) ? 0 : az)});
    }
    return pts;
}

function lunaPhase(date) {
    const jd = toJD(date) + 0.5;
    const T = (jd - 2451545) / 36525;
    const D = ((297.85 + 445267.1115 * T) % 360 + 360) % 360;
    return Math.round((0.5 - 0.5 * Math.cos(D * Math.PI / 180)) * 100);
}

function lunaIcon(p) {
    return p < 5 ? '🌑' : p < 25 ? '🌒' : p < 45 ? '🌓' : p < 55 ? '🌔' : p < 75 ? '🌕' : p < 85 ? '🌖' : p < 95 ? '🌗' : '🌘';
}

function lunaImpact(pct, filter, type) {
    const isDual = filter === 'Dual-band';
    const isNeb = /nebula|remnant|planetary/i.test(type);
    if (isDual) return {bg: 'rgba(104,211,145,0.15)', col: '#68d391', bdr: '#68d391', txt: 'Moon: low impact — Dual-band filter protects well'};
    if (pct < 30) return {bg: 'rgba(104,211,145,0.15)', col: '#68d391', bdr: '#68d391', txt: 'Moon: minimal impact — great conditions tonight'};
    if (pct < 60) return {bg: 'rgba(246,173,85,0.15)', col: '#f6ad55', bdr: '#f6ad55', txt: isNeb ? 'Moon: moderate — consider Dual-band' : 'Moon: moderate — galaxies less sensitive'};
    return {bg: 'rgba(252,129,129,0.15)', col: '#fc8181', bdr: '#fc8181', txt: isNeb ? 'Moon: high impact — postpone or use Dual-band' : 'Moon: high — galaxies still observable'};
}

function sessCalc(framesStr, expStr) {
    const p = framesStr.split('/');
    const fMin = parseInt(p[0]) || 40, fOk = parseInt(p[1]) || 60;
    const exp = parseInt(expStr) || 30;
    const fmt = s => s >= 3600 ? (s / 3600).toFixed(1) + 'h' : Math.round(s / 60) + 'min';
    return {min: fmt(fMin * exp), ok: fmt(fOk * exp), minN: fMin + ' frames × ' + exp + 's', okN: fOk + ' frames × ' + exp + 's', pct: Math.min(100, Math.round(fOk * exp / 18000 * 100))};
}

function drawAlt(pts, drawDate) {
    const canvas = document.getElementById('altCanvas');
    if (!canvas) return;
    if (!pts || pts.length === 0) {
        const dpr = window.devicePixelRatio || 1;
        const W = canvas.offsetWidth || 600;
        const H = 180;
        canvas.style.height = H + 'px';
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        ctx.fillStyle = 'rgba(252,129,129,0.15)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fc8181';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Object not visible from this latitude tonight', W / 2, H / 2);
        return;
    }
    const date = drawDate || getDate();
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth || 600;
    const H = 180;
    canvas.style.height = H + 'px';
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const PAD = {t: 14, r: 10, b: 36, l: 34};
    const cw = W - PAD.l - PAD.r, ch = H - PAD.t - PAD.b;
    const MIN_A = -10, MAX_A = 90, RANGE = 100;
    const yOf = a => PAD.t + ch - ((Math.min(Math.max(a, MIN_A), MAX_A) - MIN_A) / RANGE) * ch;
    const H_START = 18, H_END = 30, H_SPAN = H_END - H_START;
    const xOf = h => PAD.l + ((h - H_START) / H_SPAN) * cw;
    const xMid = xOf(24);
    ctx.fillStyle = 'rgba(15,25,55,0.55)';
    ctx.fillRect(PAD.l, PAD.t, cw, ch);
    ctx.strokeStyle = 'rgba(120,140,220,0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(xMid, PAD.t);
    ctx.lineTo(xMid, PAD.t + ch);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(120,140,220,0.7)';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('00:00', xMid, PAD.t + ch + 13);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 0.5;
    [0, 15, 30, 45, 60, 75, 90].forEach(deg => {
        const y = yOf(deg);
        ctx.beginPath();
        ctx.moveTo(PAD.l, y);
        ctx.lineTo(PAD.l + cw, y);
        ctx.stroke();
        ctx.fillStyle = '#4a5060';
        ctx.font = '8px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(deg + '°', PAD.l - 4, y + 3);
    });
    [18, 20, 22, 24, 26, 28, 30].forEach(hr => {
        const x = xOf(hr);
        if (x < PAD.l || x > PAD.l + cw + 1) return;
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x, PAD.t);
        ctx.lineTo(x, PAD.t + ch);
        ctx.stroke();
        const dispHr = hr % 24;
        if (hr !== 24) {
            ctx.fillStyle = '#6a7490';
            ctx.textAlign = 'center';
            ctx.font = '8px monospace';
            ctx.fillText(String(dispHr).padStart(2, '0') + ':00', x, PAD.t + ch + 13);
            const pt = pts.find(p => Math.abs(p.h - hr) < 0.1);
            if (pt) {
                ctx.fillStyle = 'rgba(183,148,244,0.6)';
                ctx.fillText(`[${pt.card}]`, x, PAD.t + ch + 23);
            }
        }
    });
    const yHor = yOf(0);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(PAD.l, yHor);
    ctx.lineTo(PAD.l + cw, yHor);
    ctx.stroke();
    ctx.setLineDash([]);
    const y30 = yOf(30);
    ctx.strokeStyle = 'rgba(183,148,244,0.3)';
    ctx.lineWidth = 0.8;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(PAD.l, y30);
    ctx.lineTo(PAD.l + cw, y30);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(183,148,244,0.7)';
    ctx.textAlign = 'left';
    ctx.font = '8px monospace';
    ctx.fillText('30° min', PAD.l + 4, y30 - 3);
    
    function sunAltAtHour(h) {
        const localH = h % 24;
        const dayOffset = h >= 24 ? 1 : 0;
        const tzOffsetH = -date.getTimezoneOffset() / 60;
        const hUTC = ((localH - tzOffsetH) % 24 + 24) % 24;
        const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate() + dayOffset, Math.floor(hUTC), Math.round((hUTC % 1) * 60), 0));
        const jd = getJD(utcDate);
        const n = jd - 2451545.0;
        const L = ((280.460 + 0.9856474 * n) % 360 + 360) % 360;
        const g = ((357.528 + 0.9856003 * n) % 360 + 360) % 360;
        const lambda = L + 1.915 * Math.sin(g * Math.PI / 180) + 0.020 * Math.sin(2 * g * Math.PI / 180);
        const epsilon = 23.439 - 0.0000004 * n;
        const sunRa_h = (Math.atan2(Math.cos(epsilon * Math.PI / 180) * Math.sin(lambda * Math.PI / 180), Math.cos(lambda * Math.PI / 180)) * 180 / Math.PI + 360) % 360 / 15;
        const sinDec = Math.sin(epsilon * Math.PI / 180) * Math.sin(lambda * Math.PI / 180);
        const sunDec = Math.asin(Math.max(-1, Math.min(1, sinDec))) * 180 / Math.PI;
        const lst = getLocalSiderealTime(jd, userLon);
        return altDeg(sunRa_h, sunDec, lst, userLat);
    }
    
    const bestPts = pts.filter(p => p.alt >= 30 && sunAltAtHour(p.h) < -12);
    if (bestPts.length >= 2) {
        let segStart = bestPts[0].h, segPrev = bestPts[0].h;
        for (let i = 1; i <= bestPts.length; i++) {
            const isLast = i === bestPts.length;
            const gap = isLast ? true : (bestPts[i].h - bestPts[i - 1].h) > 1.0;
            if (gap) {
                const ns = segStart, ne = segPrev;
                const x0 = xOf(ns), x1 = xOf(ne + 0.5);
                const segW = x1 - x0;
                if (segW > 0) {
                    ctx.fillStyle = 'rgba(104,211,145,0.12)';
                    ctx.fillRect(x0, PAD.t, segW, ch);
                    ctx.strokeStyle = 'rgba(104,211,145,0.4)';
                    ctx.lineWidth = 1;
                    ctx.setLineDash([]);
                    ctx.strokeRect(x0, PAD.t, segW, ch);
                    ctx.fillStyle = 'rgba(104,211,145,0.85)';
                    ctx.font = 'bold 8px monospace';
                    ctx.textAlign = 'center';
                    ctx.fillText('BEST', x0 + segW / 2, PAD.t + 22);
                }
                if (!isLast) segStart = bestPts[i].h;
            }
            if (!isLast) segPrev = bestPts[i].h;
        }
    }
    if (pts.length >= 2) {
        ctx.beginPath();
        pts.forEach((p, i) => {
            const x = xOf(p.h), y = yOf(p.alt);
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.lineTo(xOf(pts[pts.length - 1].h), yHor);
        ctx.lineTo(xOf(pts[0].h), yHor);
        ctx.closePath();
        const gr = ctx.createLinearGradient(0, PAD.t, 0, PAD.t + ch);
        gr.addColorStop(0, 'rgba(183,148,244,0.35)');
        gr.addColorStop(1, 'rgba(183,148,244,0.02)');
        ctx.fillStyle = gr;
        ctx.fill();
        ctx.beginPath();
        pts.forEach((p, i) => {
            const x = xOf(p.h), y = yOf(p.alt);
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.strokeStyle = '#b794f4';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
    let maxA = -99, maxH = pts.length ? pts[0].h : 24;
    pts.forEach(p => {
        if (p.alt > maxA) {
            maxA = p.alt;
            maxH = p.h;
        }
    });
    if (maxA > -99) {
        const cx = xOf(maxH), cy = yOf(maxA);
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 0.8;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx, PAD.t + ch);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        const peakHH = Math.floor(maxH) % 24, peakMM = Math.round((maxH % 1) * 60);
        const peakTime = String(peakHH).padStart(2, '0') + ':' + String(peakMM).padStart(2, '0');
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.textAlign = 'center';
        ctx.font = 'bold 9px monospace';
        const labelX = Math.max(PAD.l + 22, Math.min(PAD.l + cw - 22, cx));
        ctx.fillText(Math.round(maxA) + '° ' + peakTime, labelX, cy - 9);
    }
    ctx.fillStyle = 'rgba(120,140,220,0.55)';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('🌙', PAD.l + 4, PAD.t + 11);
    ctx.textAlign = 'right';
    ctx.fillText('🌙', PAD.l + cw - 4, PAD.t + 11);
}

function getDate() {
    const v = document.getElementById('obsDate').value;
    return v ? new Date(v + 'T12:00:00') : new Date();
}

const monthsNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const dwarfDB = [
    {id:"M1",name:"Crab Nebula",type:"Supernova Remnant",mag:"8.4",diff:"Intermediate",ra_h:5,dec:22,settings:{exp:"25s",gain:"70",frames:"40/60",filter:"Dual-band",noteExp:"Fine filament details",noteGain:"High for gas emission",noteFiltro:"Enhances Ha/OIII"},months:[10,11,0,1,2],advice:"Inner filaments benefit from 3+ hours integration. Dual-band essential."},
    {id:"M2",name:"Pegasus Cluster",type:"Globular",mag:"6.5",diff:"Easy",ra_h:21,dec:-1,settings:{exp:"20s",gain:"50",frames:"40/60",filter:"Astro",noteExp:"Short",noteGain:"Medium",noteFiltro:"Natural light"},months:[7,8,9,10],advice:"One of the brightest globulars. 2x binning recommended."},
    {id:"M3",name:"Canes Venatici Cluster",type:"Globular",mag:"6.2",diff:"Easy",ra_h:13,dec:28,settings:{exp:"25s",gain:"60",frames:"40/60",filter:"Astro",noteExp:"Medium",noteGain:"Medium",noteFiltro:"Natural light"},months:[3,4,5,6,7],advice:"Rich in variables. Moderate gain for dense core."},
    {id:"M4",name:"Scorpius Cluster",type:"Globular",mag:"5.9",diff:"Easy",ra_h:16,dec:-26,settings:{exp:"20s",gain:"50",frames:"40/60",filter:"Astro",noteExp:"Short",noteGain:"Low",noteFiltro:"Natural light"},months:[5,6,7,8],advice:"Near and large. Low southern horizon."},
    {id:"M5",name:"Serpens Cluster",type:"Globular",mag:"5.6",diff:"Easy",ra_h:15,dec:2,settings:{exp:"25s",gain:"55",frames:"40/60",filter:"Astro",noteExp:"Medium",noteGain:"Medium",noteFiltro:"Natural light"},months:[5,6,7,8],advice:"Flattened elliptical. Resolve peripheral stars."},
    {id:"M6",name:"Butterfly Cluster",type:"Open",mag:"4.2",diff:"Easy",ra_h:17,dec:-32,settings:{exp:"15s",gain:"40",frames:"40/60",filter:"Astro",noteExp:"Very short",noteGain:"Low",noteFiltro:"Natural light"},months:[6,7,8],advice:"Bright blue stars. Low horizon."},
    {id:"M7",name:"Ptolemy Cluster",type:"Open",mag:"3.3",diff:"Easy",ra_h:17,dec:-34,settings:{exp:"10s",gain:"30",frames:"40/60",filter:"Astro",noteExp:"Very short",noteGain:"Very low",noteFiltro:"Natural light"},months:[6,7,8],advice:"Huge and bright. Visible to naked eye."},
    {id:"M8",name:"Lagoon Nebula",type:"Nebula",mag:"5.8",diff:"Easy",ra_h:18,dec:-24,settings:{exp:"30s",gain:"70",frames:"40/60",filter:"Dual-band",noteExp:"Medium",noteGain:"High",noteFiltro:"Enhances Ha/OIII"},months:[6,7,8],advice:"Giant nebula. Dual-band essential. Low horizon."},
    {id:"M9",name:"Ophiuchus Cluster",type:"Globular",mag:"7.7",diff:"Intermediate",ra_h:17,dec:-18,settings:{exp:"30s",gain:"80",frames:"40/60",filter:"Astro",noteExp:"Long",noteGain:"High",noteFiltro:"Natural light"},months:[6,7,8],advice:"Darkened by galactic dust. Needs integration."},
    {id:"M10",name:"Ophiuchus Cluster",type:"Globular",mag:"6.4",diff:"Easy",ra_h:16,dec:-4,settings:{exp:"25s",gain:"60",frames:"40/60",filter:"Astro",noteExp:"Medium",noteGain:"Medium",noteFiltro:"Natural light"},months:[6,7,8],advice:"Symmetric and bright."},
    {id:"M11",name:"Wild Duck Cluster",type:"Open",mag:"5.8",diff:"Easy",ra_h:18,dec:-6,settings:{exp:"20s",gain:"50",frames:"40/60",filter:"Astro",noteExp:"Short",noteGain:"Medium",noteFiltro:"Natural light"},months:[6,7,8,9],advice:"V-shape. Hot blue stars."},
    {id:"M12",name:"Ophiuchus Cluster",type:"Globular",mag:"6.7",diff:"Easy",ra_h:16,dec:-1,settings:{exp:"25s",gain:"60",frames:"40/60",filter:"Astro",noteExp:"Medium",noteGain:"Medium",noteFiltro:"Natural light"},months:[6,7,8],advice:"Loosely concentrated, easy to resolve."},
    {id:"M13",name:"Great Hercules Cluster",type:"Globular",mag:"5.8",diff:"Easy",ra_h:16,dec:36,settings:{exp:"20s",gain:"50",frames:"40/60",filter:"Astro",noteExp:"Short core",noteGain:"Medium",noteFiltro:"Natural light"},months:[4,5,6,7,8],advice:"Finest globular in northern sky. 2x binning recommended."},
    {id:"M14",name:"Ophiuchus Cluster",type:"Globular",mag:"7.6",diff:"Intermediate",ra_h:17,dec:-3,settings:{exp:"30s",gain:"75",frames:"40/60",filter:"Astro",noteExp:"Long",noteGain:"High",noteFiltro:"Natural light"},months:[6,7,8],advice:"Compact, requires integration."},
    {id:"M15",name:"Pegasus Cluster",type:"Globular",mag:"6.2",diff:"Easy",ra_h:21,dec:12,settings:{exp:"25s",gain:"60",frames:"40/60",filter:"Astro",noteExp:"Medium",noteGain:"Medium",noteFiltro:"Natural light"},months:[8,9,10],advice:"One of the densest. Contains planetary Pease 1."},
    {id:"M16",name:"Eagle Nebula",type:"Nebula",mag:"6.4",diff:"Intermediate",ra_h:18,dec:-13,settings:{exp:"35s",gain:"80",frames:"40/60",filter:"Dual-band",noteExp:"Long pillars",noteGain:"High",noteFiltro:"Enhances Ha/OIII"},months:[6,7,8,9],advice:"Pillars of Creation. Dual-band essential."},
    {id:"M17",name:"Omega Nebula",type:"Nebula",mag:"6.0",diff:"Intermediate",ra_h:18,dec:-16,settings:{exp:"30s",gain:"75",frames:"40/60",filter:"Dual-band",noteExp:"Medium",noteGain:"High",noteFiltro:"Enhances Ha/OIII"},months:[6,7,8],advice:"C-shape. Bright nebula."},
    {id:"M18",name:"Sagittarius Cluster",type:"Open",mag:"6.9",diff:"Easy",ra_h:18,dec:-17,settings:{exp:"20s",gain:"50",frames:"40/60",filter:"Astro",noteExp:"Short",noteGain:"Medium",noteFiltro:"Natural light"},months:[6,7,8],advice:"Small but bright. Near M17."},
    {id:"M19",name:"Ophiuchus Cluster",type:"Globular",mag:"6.8",diff:"Intermediate",ra_h:17,dec:-26,settings:{exp:"30s",gain:"70",frames:"40/60",filter:"Astro",noteExp:"Medium",noteGain:"Medium-High",noteFiltro:"Natural light"},months:[6,7,8],advice:"Oblate, near galactic center."},
    {id:"M20",name:"Trifid Nebula",type:"Nebula",mag:"6.3",diff:"Intermediate",ra_h:18,dec:-23,settings:{exp:"35s",gain:"75",frames:"40/60",filter:"Dual-band",noteExp:"Long",noteGain:"High",noteFiltro:"Enhances Ha/OIII"},months:[6,7,8],advice:"Dark lanes. Dual-band mandatory."},
    {id:"M21",name:"Sagittarius Cluster",type:"Open",mag:"5.9",diff:"Easy",ra_h:18,dec:-22,settings:{exp:"20s",gain:"50",frames:"40/60",filter:"Astro",noteExp:"Short",noteGain:"Medium",noteFiltro:"Natural light"},months:[6,7,8],advice:"Young, blue stars. Near M20."},
    {id:"M22",name:"Sagittarius Cluster",type:"Globular",mag:"5.1",diff:"Easy",ra_h:18,dec:-23,settings:{exp:"20s",gain:"50",frames:"40/60",filter:"Astro",noteExp:"Short",noteGain:"Medium-Low",noteFiltro:"Natural light"},months:[6,7,8],advice:"One of the brightest. Very easy."},
    {id:"M23",name:"Sagittarius Cluster",type:"Open",mag:"5.5",diff:"Easy",ra_h:17,dec:-19,settings:{exp:"20s",gain:"50",frames:"40/60",filter:"Astro",noteExp:"Short",noteGain:"Medium",noteFiltro:"Natural light"},months:[6,7,8],advice:"Large and bright. 150+ stars."},
    {id:"M24",name:"Sagittarius Star Cloud",type:"Star Cloud",mag:"4.6",diff:"Easy",ra_h:18,dec:-18,settings:{exp:"15s",gain:"40",frames:"40/60",filter:"Astro",noteExp:"Very short",noteGain:"Low",noteFiltro:"Natural light"},months:[6,7,8],advice:"Milky Way window. Wide field."},
    {id:"M25",name:"Sagittarius Cluster",type:"Open",mag:"4.6",diff:"Easy",ra_h:18,dec:-19,settings:{exp:"15s",gain:"45",frames:"40/60",filter:"Astro",noteExp:"Short",noteGain:"Low",noteFiltro:"Natural light"},months:[6,7,8],advice:"Bright. Contains Cepheid."},
    {id:"M26",name:"Scutum Cluster",type:"Open",mag:"8.0",diff:"Intermediate",ra_h:18,dec:-9,settings:{exp:"30s",gain:"70",frames:"40/60",filter:"Astro",noteExp:"Medium",noteGain:"High",noteFiltro:"Natural light"},months:[7,8,9],advice:"Compact. Dusty region."},
    {id:"M27",name:"Dumbbell Nebula",type:"Planetary",mag:"7.4",diff:"Easy",ra_h:19,dec:22,settings:{exp:"30s",gain:"70",frames:"40/60",filter:"Dual-band",noteExp:"Medium",noteGain:"High",noteFiltro:"Enhances Ha/OIII"},months:[6,7,8,9],advice:"Best planetary. Dual-band shines."},
    {id:"M28",name:"Sagittarius Cluster",type:"Globular",mag:"6.8",diff:"Intermediate",ra_h:18,dec:-24,settings:{exp:"30s",gain:"70",frames:"40/60",filter:"Astro",noteExp:"Medium",noteGain:"Medium-High",noteFiltro:"Natural light"},months:[6,7,8],advice:"Compact and dense."},
    {id:"M29",name:"Cygnus Cluster",type:"Open",mag:"6.6",diff:"Easy",ra_h:20,dec:38,settings:{exp:"20s",gain:"55",frames:"40/60",filter:"Astro",noteExp:"Short",noteGain:"Medium",noteFiltro:"Natural light"},months:[7,8,9,10],advice:"Cross shape. Blue stars."},
    {id:"M30",name:"Capricornus Cluster",type:"Globular",mag:"7.2",diff:"Intermediate",ra_h:21,dec:-23,settings:{exp:"30s",gain:"75",frames:"40/60",filter:"Astro",noteExp:"Long",noteGain:"High",noteFiltro:"Natural light"},months:[7,8,9],advice:"Compact, core collapse. Low horizon."},
    {id:"M31",name:"Andromeda Galaxy",type:"Galaxy",mag:"3.4",diff:"Easy",ra_h:0,dec:41,settings:{exp:"30s",gain:"100",frames:"50/80",filter:"Astro",noteExp:"Long arms",noteGain:"Very High",noteFiltro:"Natural light"},months:[8,9,10,11,0],advice:"Huge. Mosaic recommended. Massive integration."},
    {id:"M32",name:"Andromeda Elliptical",type:"Galaxy",mag:"8.1",diff:"Intermediate",ra_h:0,dec:40,settings:{exp:"40s",gain:"90",frames:"40/60",filter:"Astro",noteExp:"Long",noteGain:"High",noteFiltro:"Natural light"},months:[8,9,10,11,0],advice:"M31 satellite. Bright nucleus."},
    {id:"M33",name:"Triangulum Galaxy",type:"Galaxy",mag:"5.7",diff:"Intermediate",ra_h:1,dec:30,settings:{exp:"45s",gain:"100",frames:"50/80",filter:"Astro",noteExp:"Very long",noteGain:"Very High",noteFiltro:"Natural light"},months:[9,10,11,0,1],advice:"Low surface brightness. Dark sky essential."},
    {id:"M34",name:"Perseus Cluster",type:"Open",mag:"5.2",diff:"Easy",ra_h:2,dec:42,settings:{exp:"15s",gain:"45",frames:"40/60",filter:"Astro",noteExp:"Short",noteGain:"Low",noteFiltro:"Natural light"},months:[9,10,11,0,1],advice:"Large and scattered. 100+ stars."},
    {id:"M35",name:"Gemini Cluster",type:"Open",mag:"5.1",diff:"Easy",ra_h:6,dec:24,settings:{exp:"20s",gain:"50",frames:"40/60",filter:"Astro",noteExp:"Short",noteGain:"Medium",noteFiltro:"Natural light"},months:[11,0,1,2,3],advice:"Bright. Easy in winter."},
    {id:"M36",name:"Auriga Cluster",type:"Open",mag:"6.0",diff:"Easy",ra_h:5,dec:34,settings:{exp:"20s",gain:"55",frames:"40/60",filter:"Astro",noteExp:"Short",noteGain:"Medium",noteFiltro:"Natural light"},months:[11,0,1,2,3],advice:"Compact, blue stars. Auriga trio."},
    {id:"M37",name:"Auriga Cluster",type:"Open",mag:"5.6",diff:"Easy",ra_h:5,dec:32,settings:{exp:"20s",gain:"50",frames:"40/60",filter:"Astro",noteExp:"Short",noteGain:"Medium",noteFiltro:"Natural light"},months:[11,0,1,2,3],advice:"Richest of the trio. 500+ stars."},
    {id:"M38",name:"Auriga Cluster",type:"Open",mag:"6.4",diff:"Easy",ra_h:5,dec:35,settings:{exp:"20s",gain:"50",frames:"40/60",filter:"Astro",noteExp:"Short",noteGain:"Medium",noteFiltro:"Natural light"},months:[11,0,1,2,3],advice:"X-shape."},
    {id:"M39",name:"Cygnus Cluster",type:"Open",mag:"4.6",diff:"Easy",ra_h:21,dec:48,settings:{exp:"15s",gain:"40",frames:"40/60",filter:"Astro",noteExp:"Very short",noteGain:"Low",noteFiltro:"Natural light"},months:[7,8,9,10],advice:"Large and bright."},
    {id:"M40",name:"Winnecke 4 Double",type:"Double Star",mag:"8.4",diff:"Easy",ra_h:12,dec:58,settings:{exp:"5s",gain:"30",frames:"40/60",filter:"Astro",noteExp:"Very short",noteGain:"Low",noteFiltro:"Natural light"},months:[3,4,5,6],advice:"Messier error. Two stars."},
    {id:"M41",name:"Canis Major Cluster",type:"Open",mag:"4.5",diff:"Easy",ra_h:6,dec:-20,settings:{exp:"15s",gain:"45",frames:"40/60",filter:"Astro",noteExp:"Short",noteGain:"Low",noteFiltro:"Natural light"},months:[12,0,1,2],advice:"Near Sirius. Low horizon."},
    {id:"M42",name:"Orion Nebula",type:"Nebula",mag:"4.0",diff:"Easy",ra_h:5,dec:-5,settings:{exp:"15s",gain:"50",frames:"40/60",filter:"Dual-band",noteExp:"Bright",noteGain:"Medium",noteFiltro:"Enhances Ha/OIII"},months:[11,0,1,2,3],advice:"Brightest nebula. Short for Trapezium."},
    {id:"M43",name:"De Mairan Nebula",type:"Nebula",mag:"9.0",diff:"Intermediate",ra_h:5,dec:-5,settings:{exp:"30s",gain:"70",frames:"40/60",filter:"Dual-band",noteExp:"Medium",noteGain:"High",noteFiltro:"Enhances Ha/OIII"},months:[11,0,1,2,3],advice:"Part of M42. Dark lane separates."},
    {id:"M44",name:"Beehive Cluster",type:"Open",mag:"3.1",diff:"Easy",ra_h:8,dec:19,settings:{exp:"10s",gain:"35",frames:"40/60",filter:"Astro",noteExp:"Very short",noteGain:"Low",noteFiltro:"Natural light"},months:[1,2,3,4,5],advice:"Naked eye. Very wide field."},
    {id:"M45",name:"Pleiades",type:"Open",mag:"1.6",diff:"Easy",ra_h:3,dec:24,settings:{exp:"10s",gain:"40",frames:"40/60",filter:"Astro",noteExp:"Very short",noteGain:"Low",noteFiltro:"Natural light"},months:[10,11,0,1,2],advice:"5-10s max. Reflection nebulosity."},
    {id:"M46",name:"Puppis Cluster",type:"Open",mag:"6.0",diff:"Easy",ra_h:7,dec:-14,settings:{exp:"20s",gain:"55",frames:"40/60",filter:"Astro",noteExp:"Short",noteGain:"Medium",noteFiltro:"Natural light"},months:[12,0,1,2],advice:"Contains NGC 2438."},
    {id:"M47",name:"Puppis Cluster",type:"Open",mag:"4.4",diff:"Easy",ra_h:7,dec:-14,settings:{exp:"15s",gain:"45",frames:"40/60",filter:"Astro",noteExp:"Short",noteGain:"Low",noteFiltro:"Natural light"},months:[12,0,1,2],advice:"Bright and scattered."},
    {id:"M48",name:"Hydra Cluster",type:"Open",mag:"5.5",diff:"Easy",ra_h:8,dec:-5,settings:{exp:"20s",gain:"50",frames:"40/60",filter:"Astro",noteExp:"Short",noteGain:"Medium",noteFiltro:"Natural light"},months:[1,2,3,4],advice:"Large but faint."},
    {id:"M49",name:"Virgo Galaxy",type:"Galaxy",mag:"8.4",diff:"Intermediate",ra_h:12,dec:8,settings:{exp:"40s",gain:"90",frames:"50/80",filter:"Astro",noteExp:"Long",noteGain:"High",noteFiltro:"Natural light"},months:[3,4,5,6],advice:"Giant elliptical."},
    {id:"M50",name:"Monoceros Cluster",type:"Open",mag:"5.9",diff:"Easy",ra_h:7,dec:-8,settings:{exp:"20s",gain:"55",frames:"40/60",filter:"Astro",noteExp:"Short",noteGain:"Medium",noteFiltro:"Natural light"},months:[12,0,1,2],advice:"Heart shape."},
    {id:"M51",name:"Whirlpool Galaxy",type:"Galaxy",mag:"8.4",diff:"Intermediate",ra_h:13,dec:47,settings:{exp:"40s",gain:"90",frames:"50/80",filter:"Astro",noteExp:"Long spirals",noteGain:"High",noteFiltro:"Natural light"},months:[3,4,5,6],advice:"Classic spiral. NGC 5195 companion."},
    {id:"M52",name:"Cassiopeia Cluster",type:"Open",mag:"6.9",diff:"Intermediate",ra_h:23,dec:61,settings:{exp:"25s",gain:"65",frames:"40/60",filter:"Astro",noteExp:"Medium",noteGain:"Medium",noteFiltro:"Natural light"},months:[8,9,10,11],advice:"Rich but obscured."},
    {id:"M53",name:"Coma Berenices Cluster",type:"Globular",mag:"7.6",diff:"Intermediate",ra_h:13,dec:18,settings:{exp:"30s",gain:"75",frames:"40/60",filter:"Astro",noteExp:"Long",noteGain:"High",noteFiltro:"Natural light"},months:[3,4,5,6],advice:"Peripheral."},
    {id:"M54",name:"Sagittarius Cluster",type:"Globular",mag:"7.6",diff:"Intermediate",ra_h:18,dec:-30,settings:{exp:"35s",gain:"80",frames:"40/60",filter:"Astro",noteExp:"Long",noteGain:"High",noteFiltro:"Natural light"},months:[6,7,8],advice:"SagDEG dwarf galaxy."},
    {id:"M55",name:"Sagittarius Cluster",type:"Globular",mag:"6.3",diff:"Easy",ra_h:19,dec:-30,settings:{exp:"25s",gain:"65",frames:"40/60",filter:"Astro",noteExp:"Medium",noteGain:"Medium",noteFiltro:"Natural light"},months:[6,7,8],advice:"Large, loosely concentrated."},
    {id:"M56",name:"Lyra Cluster",type:"Globular",mag:"8.3",diff:"Hard",ra_h:19,dec:30,settings:{exp:"40s",gain:"90",frames:"50/80",filter:"Astro",noteExp:"Very long",noteGain:"Very High",noteFiltro:"Natural light"},months:[6,7,8,9],advice:"Faint and compact."},
    {id:"M57",name:"Ring Nebula",type:"Planetary",mag:"8.8",diff:"Intermediate",ra_h:18,dec:33,settings:{exp:"35s",gain:"80",frames:"40/60",filter:"Dual-band",noteExp:"Long",noteGain:"High",noteFiltro:"Enhances Ha/OIII"},months:[6,7,8,9],advice:"Small dense. Dual-band essential."},
    {id:"M58",name:"Virgo Galaxy",type:"Galaxy",mag:"9.7",diff:"Hard",ra_h:12,dec:11,settings:{exp:"50s",gain:"100",frames:"50/80",filter:"Astro",noteExp:"Very long",noteGain:"Very High",noteFiltro:"Natural light"},months:[3,4,5,6],advice:"Faint. Dark sky needed."},
    {id:"M59",name:"Virgo Galaxy",type:"Galaxy",mag:"9.6",diff:"Hard",ra_h:12,dec:11,settings:{exp:"50s",gain:"100",frames:"50/80",filter:"Astro",noteExp:"Very long",noteGain:"Very High",noteFiltro:"Natural light"},months:[3,4,5,6],advice:"Faint elliptical."},
    {id:"M60",name:"Virgo Galaxy",type:"Galaxy",mag:"8.8",diff:"Intermediate",ra_h:12,dec:11,settings:{exp:"45s",gain:"95",frames:"50/80",filter:"Astro",noteExp:"Long",noteGain:"High",noteFiltro:"Natural light"},months:[3,4,5,6],advice:"Giant elliptical."},
    {id:"M61",name:"Virgo Galaxy",type:"Galaxy",mag:"9.7",diff:"Hard",ra_h:12,dec:4,settings:{exp:"50s",gain:"100",frames:"50/80",filter:"Astro",noteExp:"Very long",noteGain:"Very High",noteFiltro:"Natural light"},months:[3,4,5,6],advice:"Face-on spiral. Faint."},
    {id:"M62",name:"Ophiuchus Cluster",type:"Globular",mag:"6.5",diff:"Intermediate",ra_h:17,dec:-30,settings:{exp:"30s",gain:"70",frames:"40/60",filter:"Astro",noteExp:"Medium",noteGain:"Medium",noteFiltro:"Natural light"},months:[6,7,8],advice:"Tidally distorted. Low."},
    {id:"M63",name:"Sunflower Galaxy",type:"Galaxy",mag:"8.6",diff:"Intermediate",ra_h:13,dec:42,settings:{exp:"45s",gain:"95",frames:"50/80",filter:"Astro",noteExp:"Long",noteGain:"High",noteFiltro:"Natural light"},months:[3,4,5,6],advice:"Spiral with defined arms."},
    {id:"M64",name:"Black Eye Galaxy",type:"Galaxy",mag:"8.5",diff:"Intermediate",ra_h:12,dec:21,settings:{exp:"45s",gain:"95",frames:"50/80",filter:"Astro",noteExp:"Long",noteGain:"High",noteFiltro:"Natural light"},months:[3,4,5,6],advice:"Dark dust lane. Contrast key."},
    {id:"M65",name:"Leo Galaxy",type:"Galaxy",mag:"9.3",diff:"Intermediate",ra_h:11,dec:13,settings:{exp:"45s",gain:"95",frames:"50/80",filter:"Astro",noteExp:"Long",noteGain:"High",noteFiltro:"Natural light"},months:[2,3,4,5],advice:"Leo Triplet."},
    {id:"M66",name:"Leo Galaxy",type:"Galaxy",mag:"8.9",diff:"Intermediate",ra_h:11,dec:12,settings:{exp:"45s",gain:"95",frames:"50/80",filter:"Astro",noteExp:"Long",noteGain:"High",noteFiltro:"Natural light"},months:[2,3,4,5],advice:"Leo Triplet."},
    {id:"M67",name:"Cancer Cluster",type:"Open",mag:"6.1",diff:"Easy",ra_h:8,dec:11,settings:{exp:"25s",gain:"60",frames:"40/60",filter:"Astro",noteExp:"Medium",noteGain:"Medium",noteFiltro:"Natural light"},months:[1,2,3,4],advice:"Old. 500+ stars."},
    {id:"M68",name:"Hydra Cluster",type:"Globular",mag:"7.8",diff:"Intermediate",ra_h:12,dec:-26,settings:{exp:"35s",gain:"80",frames:"40/60",filter:"Astro",noteExp:"Long",noteGain:"High",noteFiltro:"Natural light"},months:[3,4,5],advice:"Loosely concentrated. Low."},
    {id:"M69",name:"Sagittarius Cluster",type:"Globular",mag:"7.6",diff:"Intermediate",ra_h:18,dec:-32,settings:{exp:"35s",gain:"80",frames:"40/60",filter:"Astro",noteExp:"Long",noteGain:"High",noteFiltro:"Natural light"},months:[6,7,8],advice:"Compact. Low."},
    {id:"M70",name:"Sagittarius Cluster",type:"Globular",mag:"7.9",diff:"Intermediate",ra_h:18,dec:-32,settings:{exp:"35s",gain:"80",frames:"40/60",filter:"Astro",noteExp:"Long",noteGain:"High",noteFiltro:"Natural light"},months:[6,7,8],advice:"Near M69."},
    {id:"M71",name:"Sagitta Cluster",type:"Globular",mag:"6.1",diff:"Easy",ra_h:19,dec:18,settings:{exp:"25s",gain:"60",frames:"40/60",filter:"Astro",noteExp:"Medium",noteGain:"Medium",noteFiltro:"Natural light"},months:[7,8,9],advice:"Once thought open."},
    {id:"M72",name:"Aquarius Cluster",type:"Globular",mag:"9.3",diff:"Hard",ra_h:20,dec:-12,settings:{exp:"45s",gain:"100",frames:"50/80",filter:"Astro",noteExp:"Very long",noteGain:"Very High",noteFiltro:"Natural light"},months:[7,8,9],advice:"Faint, distant."},
    {id:"M73",name:"Aquarius Asterism",type:"Asterism",mag:"9.0",diff:"Easy",ra_h:20,dec:-12,settings:{exp:"20s",gain:"50",frames:"40/60",filter:"Astro",noteExp:"Short",noteGain:"Medium",noteFiltro:"Natural light"},months:[7,8,9],advice:"Four stars."},
    {id:"M74",name:"Phantom Galaxy",type:"Galaxy",mag:"9.4",diff:"Hard",ra_h:1,dec:15,settings:{exp:"50s",gain:"100",frames:"50/80",filter:"Astro",noteExp:"Very long",noteGain:"Very High",noteFiltro:"Natural light"},months:[9,10,11,0],advice:"Low surface brightness."},
    {id:"M75",name:"Sagittarius Cluster",type:"Globular",mag:"8.5",diff:"Intermediate",ra_h:20,dec:-21,settings:{exp:"40s",gain:"90",frames:"50/80",filter:"Astro",noteExp:"Long",noteGain:"High",noteFiltro:"Natural light"},months:[7,8,9],advice:"Compact, concentrated."},
    {id:"M76",name:"Little Dumbbell",type:"Planetary",mag:"10.1",diff:"Hard",ra_h:1,dec:51,settings:{exp:"45s",gain:"100",frames:"50/80",filter:"Dual-band",noteExp:"Very long",noteGain:"Very High",noteFiltro:"Enhances Ha/OIII"},months:[9,10,11],advice:"Small, faint."},
    {id:"M77",name:"Cetus Galaxy",type:"Galaxy",mag:"8.9",diff:"Intermediate",ra_h:2,dec:0,settings:{exp:"45s",gain:"95",frames:"50/80",filter:"Astro",noteExp:"Long",noteGain:"High",noteFiltro:"Natural light"},months:[9,10,11,0],advice:"Seyfert spiral."},
    {id:"M78",name:"Orion Nebula",type:"Nebula",mag:"8.0",diff:"Intermediate",ra_h:5,dec:0,settings:{exp:"35s",gain:"80",frames:"40/60",filter:"Astro",noteExp:"Long",noteGain:"High",noteFiltro:"Broadband Astro — reflection nebula"},months:[11,0,1,2],advice:"Reflection nebula. Astro filter recommended."},
    {id:"M79",name:"Lepus Cluster",type:"Globular",mag:"7.7",diff:"Intermediate",ra_h:5,dec:-24,settings:{exp:"35s",gain:"80",frames:"40/60",filter:"Astro",noteExp:"Long",noteGain:"High",noteFiltro:"Natural light"},months:[11,0,1,2],advice:"Low southern sky."},
    {id:"M80",name:"Scorpius Cluster",type:"Globular",mag:"7.3",diff:"Intermediate",ra_h:16,dec:-22,settings:{exp:"30s",gain:"75",frames:"40/60",filter:"Astro",noteExp:"Medium",noteGain:"Medium",noteFiltro:"Natural light"},months:[5,6,7,8],advice:"Compact. Nova 1860."},
    {id:"M81",name:"Bode's Galaxy",type:"Galaxy",mag:"6.9",diff:"Easy",ra_h:9,dec:69,settings:{exp:"30s",gain:"90",frames:"50/80",filter:"Astro",noteExp:"Long spirals",noteGain:"High",noteFiltro:"Natural light"},months:[1,2,3,4],advice:"Classic pair with M82."},
    {id:"M82",name:"Cigar Galaxy",type:"Galaxy",mag:"8.4",diff:"Intermediate",ra_h:9,dec:69,settings:{exp:"40s",gain:"100",frames:"50/80",filter:"Astro",noteExp:"Very long",noteGain:"Very High",noteFiltro:"Natural light"},months:[1,2,3,4],advice:"Starburst. Ha wind visible."},
    {id:"M83",name:"Southern Pinwheel",type:"Galaxy",mag:"7.5",diff:"Intermediate",ra_h:13,dec:-29,settings:{exp:"45s",gain:"95",frames:"50/80",filter:"Astro",noteExp:"Long",noteGain:"High",noteFiltro:"Natural light"},months:[3,4,5],advice:"Face-on. Low horizon."},
    {id:"M84",name:"Virgo Galaxy",type:"Galaxy",mag:"9.1",diff:"Intermediate",ra_h:12,dec:12,settings:{exp:"45s",gain:"95",frames:"50/80",filter:"Astro",noteExp:"Long",noteGain:"High",noteFiltro:"Natural light"},months:[3,4,5,6],advice:"Elliptical."},
    {id:"M85",name:"Virgo Galaxy",type:"Galaxy",mag:"9.1",diff:"Intermediate",ra_h:12,dec:18,settings:{exp:"45s",gain:"95",frames:"50/80",filter:"Astro",noteExp:"Long",noteGain:"High",noteFiltro:"Natural light"},months:[3,4,5,6],advice:"Lenticular."},
    {id:"M86",name:"Virgo Galaxy",type:"Galaxy",mag:"8.9",diff:"Intermediate",ra_h:12,dec:12,settings:{exp:"45s",gain:"95",frames:"50/80",filter:"Astro",noteExp:"Long",noteGain:"High",noteFiltro:"Natural light"},months:[3,4,5,6],advice:"Elliptical."},
    {id:"M87",name:"Virgo A",type:"Galaxy",mag:"8.6",diff:"Intermediate",ra_h:12,dec:12,settings:{exp:"45s",gain:"95",frames:"50/80",filter:"Astro",noteExp:"Long",noteGain:"High",noteFiltro:"Natural light"},months:[3,4,5,6],advice:"Supergiant. Black hole."},
    {id:"M88",name:"Virgo Galaxy",type:"Galaxy",mag:"9.6",diff:"Hard",ra_h:12,dec:14,settings:{exp:"50s",gain:"100",frames:"50/80",filter:"Astro",noteExp:"Very long",noteGain:"Very High",noteFiltro:"Natural light"},months:[3,4,5,6],advice:"Spiral. Faint."},
    {id:"M89",name:"Virgo Galaxy",type:"Galaxy",mag:"9.8",diff:"Hard",ra_h:12,dec:12,settings:{exp:"50s",gain:"100",frames:"50/80",filter:"Astro",noteExp:"Very long",noteGain:"Very High",noteFiltro:"Natural light"},months:[3,4,5,6],advice:"Elliptical. Very faint."},
    {id:"M90",name:"Virgo Galaxy",type:"Galaxy",mag:"9.5",diff:"Intermediate",ra_h:12,dec:13,settings:{exp:"50s",gain:"100",frames:"50/80",filter:"Astro",noteExp:"Very long",noteGain:"Very High",noteFiltro:"Natural light"},months:[3,4,5,6],advice:"Spiral."},
    {id:"M91",name:"Virgo Galaxy",type:"Galaxy",mag:"10.2",diff:"Hard",ra_h:12,dec:14,settings:{exp:"60s",gain:"110",frames:"50/80",filter:"Astro",noteExp:"Extreme",noteGain:"Very High",noteFiltro:"Natural light"},months:[3,4,5,6],advice:"Barred. Very faint."},
    {id:"M92",name:"Hercules Cluster",type:"Globular",mag:"6.4",diff:"Easy",ra_h:17,dec:43,settings:{exp:"25s",gain:"60",frames:"40/60",filter:"Astro",noteExp:"Medium",noteGain:"Medium",noteFiltro:"Natural light"},months:[5,6,7,8],advice:"Second in Hercules."},
    {id:"M93",name:"Puppis Cluster",type:"Open",mag:"6.0",diff:"Easy",ra_h:7,dec:-23,settings:{exp:"20s",gain:"55",frames:"40/60",filter:"Astro",noteExp:"Short",noteGain:"Medium",noteFiltro:"Natural light"},months:[12,0,1,2],advice:"Butterfly shape."},
    {id:"M94",name:"Cat's Eye Galaxy",type:"Galaxy",mag:"8.2",diff:"Intermediate",ra_h:12,dec:41,settings:{exp:"40s",gain:"90",frames:"50/80",filter:"Astro",noteExp:"Long",noteGain:"High",noteFiltro:"Natural light"},months:[3,4,5,6],advice:"Ring of star formation."},
    {id:"M95",name:"Leo Galaxy",type:"Galaxy",mag:"9.7",diff:"Hard",ra_h:10,dec:11,settings:{exp:"50s",gain:"100",frames:"50/80",filter:"Astro",noteExp:"Very long",noteGain:"Very High",noteFiltro:"Natural light"},months:[2,3,4,5],advice:"Barred. Faint."},
    {id:"M96",name:"Leo Galaxy",type:"Galaxy",mag:"9.2",diff:"Intermediate",ra_h:10,dec:11,settings:{exp:"45s",gain:"95",frames:"50/80",filter:"Astro",noteExp:"Long",noteGain:"High",noteFiltro:"Natural light"},months:[2,3,4,5],advice:"Spiral."},
    {id:"M97",name:"Owl Nebula",type:"Planetary",mag:"9.9",diff:"Intermediate",ra_h:11,dec:55,settings:{exp:"40s",gain:"90",frames:"40/60",filter:"Dual-band",noteExp:"Long",noteGain:"High",noteFiltro:"Enhances Ha/OIII"},months:[3,4,5,6],advice:"Owl face features."},
    {id:"M98",name:"Virgo Galaxy",type:"Galaxy",mag:"10.1",diff:"Hard",ra_h:12,dec:14,settings:{exp:"55s",gain:"105",frames:"50/80",filter:"Astro",noteExp:"Very long",noteGain:"Very High",noteFiltro:"Natural light"},months:[3,4,5,6],advice:"Edge-on. Faint."},
    {id:"M99",name:"Northern Whirlpool",type:"Galaxy",mag:"9.9",diff:"Hard",ra_h:12,dec:14,settings:{exp:"50s",gain:"100",frames:"50/80",filter:"Astro",noteExp:"Very long",noteGain:"Very High",noteFiltro:"Natural light"},months:[3,4,5,6],advice:"Spiral. Faint."},
    {id:"M100",name:"Virgo Galaxy",type:"Galaxy",mag:"9.4",diff:"Intermediate",ra_h:12,dec:15,settings:{exp:"50s",gain:"100",frames:"50/80",filter:"Astro",noteExp:"Very long",noteGain:"Very High",noteFiltro:"Natural light"},months:[3,4,5,6],advice:"Face-on."},
    {id:"M101",name:"Pinwheel Galaxy",type:"Galaxy",mag:"7.9",diff:"Intermediate",ra_h:14,dec:54,settings:{exp:"45s",gain:"100",frames:"50/80",filter:"Astro",noteExp:"Very long",noteGain:"Very High",noteFiltro:"Natural light"},months:[3,4,5,6],advice:"Low surface brightness."},
    {id:"M102",name:"Spindle Galaxy",type:"Galaxy",mag:"9.9",diff:"Hard",ra_h:15,dec:55,settings:{exp:"50s",gain:"100",frames:"50/80",filter:"Astro",noteExp:"Very long",noteGain:"Very High",noteFiltro:"Natural light"},months:[4,5,6,7],advice:"Identity uncertain."},
    {id:"M103",name:"Cassiopeia Cluster",type:"Open",mag:"7.4",diff:"Intermediate",ra_h:1,dec:60,settings:{exp:"25s",gain:"65",frames:"40/60",filter:"Astro",noteExp:"Medium",noteGain:"Medium",noteFiltro:"Natural light"},months:[9,10,11,0],advice:"Small."},
    {id:"M104",name:"Sombrero Galaxy",type:"Galaxy",mag:"8.0",diff:"Intermediate",ra_h:12,dec:-11,settings:{exp:"40s",gain:"90",frames:"50/80",filter:"Astro",noteExp:"Long",noteGain:"High",noteFiltro:"Natural light"},months:[3,4,5],advice:"Dust lane prominent."},
    {id:"M105",name:"Leo Galaxy",type:"Galaxy",mag:"9.3",diff:"Intermediate",ra_h:10,dec:12,settings:{exp:"45s",gain:"95",frames:"50/80",filter:"Astro",noteExp:"Long",noteGain:"High",noteFiltro:"Natural light"},months:[2,3,4,5],advice:"Elliptical."},
    {id:"M106",name:"Canes Venatici Galaxy",type:"Galaxy",mag:"8.4",diff:"Intermediate",ra_h:12,dec:47,settings:{exp:"45s",gain:"95",frames:"50/80",filter:"Astro",noteExp:"Long",noteGain:"High",noteFiltro:"Natural light"},months:[3,4,5,6],advice:"Active spiral."},
    {id:"M107",name:"Ophiuchus Cluster",type:"Globular",mag:"7.9",diff:"Intermediate",ra_h:16,dec:-13,settings:{exp:"35s",gain:"80",frames:"40/60",filter:"Astro",noteExp:"Long",noteGain:"High",noteFiltro:"Natural light"},months:[5,6,7,8],advice:"Last Messier object."},
    {id:"M108",name:"Owl's Tail Galaxy",type:"Galaxy",mag:"10.0",diff:"Hard",ra_h:11,dec:55,settings:{exp:"55s",gain:"105",frames:"50/80",filter:"Astro",noteExp:"Very long",noteGain:"Very High",noteFiltro:"Natural light"},months:[3,4,5,6],advice:"Edge-on. Faint."},
    {id:"M109",name:"Ursa Major Galaxy",type:"Galaxy",mag:"9.8",diff:"Hard",ra_h:11,dec:53,settings:{exp:"50s",gain:"100",frames:"50/80",filter:"Astro",noteExp:"Very long",noteGain:"Very High",noteFiltro:"Natural light"},months:[3,4,5,6],advice:"Barred. Faint."},
    {id:"M110",name:"Andromeda II",type:"Galaxy",mag:"8.5",diff:"Intermediate",ra_h:0,dec:41,settings:{exp:"40s",gain:"90",frames:"50/80",filter:"Astro",noteExp:"Long",noteGain:"High",noteFiltro:"Natural light"},months:[8,9,10,11,0],advice:"M31 satellite."},
    {id:"NGC 224",name:"Andromeda",type:"Galaxy",mag:"3.4",diff:"Easy",ra_h:0,dec:41,settings:{exp:"30s",gain:"100",frames:"50/80",filter:"Astro",noteExp:"Long",noteGain:"Very High",noteFiltro:"Natural light"},months:[8,9,10,11,0],advice:"Same as M31."},
    {id:"NGC 7000",name:"North America Nebula",type:"Nebula",mag:"4.0",diff:"Intermediate",ra_h:20,dec:44,settings:{exp:"45s",gain:"95",frames:"50/80",filter:"Dual-band",noteExp:"Very long",noteGain:"High",noteFiltro:"Enhances Ha/OIII"},months:[7,8,9,10],advice:"Huge. Wide field. Ha essential."},
    {id:"NGC 6960",name:"Western Veil",type:"Supernova Remnant",mag:"7.0",diff:"Intermediate",ra_h:20,dec:30,settings:{exp:"40s",gain:"85",frames:"50/80",filter:"Dual-band",noteExp:"Long",noteGain:"High",noteFiltro:"Enhances Ha/OIII"},months:[8,9,10],advice:"Filaments. OIII."},
    {id:"NGC 6992",name:"Eastern Veil",type:"Supernova Remnant",mag:"7.0",diff:"Intermediate",ra_h:20,dec:31,settings:{exp:"40s",gain:"85",frames:"50/80",filter:"Dual-band",noteExp:"Long",noteGain:"High",noteFiltro:"Enhances Ha/OIII"},months:[8,9,10],advice:"Eastern part."},
    {id:"NGC 869",name:"Double Cluster",type:"Open",mag:"5.3",diff:"Easy",ra_h:2,dec:57,settings:{exp:"20s",gain:"55",frames:"40/60",filter:"Astro",noteExp:"Short",noteGain:"Medium",noteFiltro:"Natural light"},months:[9,10,11,0],advice:"With NGC 884."},
    {id:"NGC 884",name:"Double Cluster",type:"Open",mag:"6.1",diff:"Easy",ra_h:2,dec:57,settings:{exp:"20s",gain:"55",frames:"40/60",filter:"Astro",noteExp:"Short",noteGain:"Medium",noteFiltro:"Natural light"},months:[9,10,11,0],advice:"With NGC 869."},
    {id:"NGC 457",name:"Owl Cluster",type:"Open",mag:"6.4",diff:"Easy",ra_h:1,dec:58,settings:{exp:"20s",gain:"50",frames:"40/60",filter:"Astro",noteExp:"Short",noteGain:"Medium",noteFiltro:"Natural light"},months:[9,10,11,0],advice:"Owl shape."},
    {id:"NGC 1499",name:"California Nebula",type:"Nebula",mag:"6.0",diff:"Intermediate",ra_h:4,dec:36,settings:{exp:"45s",gain:"90",frames:"50/80",filter:"Dual-band",noteExp:"Very long",noteGain:"High",noteFiltro:"Enhances Ha/OIII"},months:[11,0,1,2],advice:"Huge. Ha essential."},
    {id:"NGC 7023",name:"Iris Nebula",type:"Nebula",mag:"6.8",diff:"Intermediate",ra_h:21,dec:68,settings:{exp:"30s",gain:"75",frames:"40/60",filter:"Astro",noteExp:"Medium",noteGain:"Medium",noteFiltro:"Broadband Astro — reflection nebula, not emission"},months:[8,9,10],advice:"Blue reflection nebula. Astro filter recommended, not Dual-band."},
    {id:"NGC 6543",name:"Cat's Eye Nebula",type:"Planetary",mag:"8.1",diff:"Hard",ra_h:17,dec:66,settings:{exp:"45s",gain:"100",frames:"50/80",filter:"Dual-band",noteExp:"Very long",noteGain:"Very High",noteFiltro:"Enhances Ha/OIII"},months:[7,8,9,10],advice:"Complex. Shells."},
    {id:"NGC 7293",name:"Helix Nebula",type:"Planetary",mag:"7.6",diff:"Intermediate",ra_h:22,dec:-20,settings:{exp:"35s",gain:"80",frames:"50/80",filter:"Dual-band",noteExp:"Long",noteGain:"High",noteFiltro:"Enhances Ha/OIII"},months:[8,9,10],advice:"Closest. Wide field."},
    {id:"NGC 2392",name:"Eskimo Nebula",type:"Planetary",mag:"10.1",diff:"Hard",ra_h:7,dec:20,settings:{exp:"45s",gain:"100",frames:"50/80",filter:"Dual-band",noteExp:"Very long",noteGain:"Very High",noteFiltro:"Enhances Ha/OIII"},months:[12,0,1,2],advice:"Small, complex."},
    {id:"NGC 7009",name:"Saturn Nebula",type:"Planetary",mag:"8.0",diff:"Intermediate",ra_h:21,dec:-11,settings:{exp:"35s",gain:"85",frames:"40/60",filter:"Dual-band",noteExp:"Long",noteGain:"High",noteFiltro:"Enhances Ha/OIII"},months:[7,8,9],advice:"Ansae visible."},
    {id:"NGC 2264",name:"Christmas Tree",type:"Nebula",mag:"3.9",diff:"Intermediate",ra_h:6,dec:9,settings:{exp:"35s",gain:"80",frames:"40/60",filter:"Dual-band",noteExp:"Long",noteGain:"High",noteFiltro:"Enhances Ha/OIII"},months:[11,0,1,2],advice:"Emission."},
    {id:"NGC 281",name:"Pac-Man Nebula",type:"Nebula",mag:"7.0",diff:"Intermediate",ra_h:0,dec:56,settings:{exp:"40s",gain:"85",frames:"40/60",filter:"Dual-band",noteExp:"Long",noteGain:"High",noteFiltro:"Enhances Ha/OIII"},months:[9,10,11,0],advice:"Pac-Man shape."},
    {id:"NGC 1333",name:"Perseus Nebula",type:"Nebula",mag:"8.0",diff:"Intermediate",ra_h:3,dec:31,settings:{exp:"40s",gain:"85",frames:"40/60",filter:"Dual-band",noteExp:"Long",noteGain:"High",noteFiltro:"Enhances Ha/OIII"},months:[10,11,0,1],advice:"Star formation."},
    {id:"NGC 6826",name:"Blinking Planetary",type:"Planetary",mag:"10.0",diff:"Hard",ra_h:19,dec:50,settings:{exp:"40s",gain:"95",frames:"50/80",filter:"Dual-band",noteExp:"Long",noteGain:"Very High",noteFiltro:"Enhances Ha/OIII"},months:[7,8,9],advice:"Small, bright."},
    {id:"NGC 3242",name:"Ghost of Jupiter",type:"Planetary",mag:"8.6",diff:"Intermediate",ra_h:10,dec:-18,settings:{exp:"35s",gain:"85",frames:"40/60",filter:"Dual-band",noteExp:"Long",noteGain:"High",noteFiltro:"Enhances Ha/OIII"},months:[2,3,4],advice:"Bright."},
    {id:"NGC 40",name:"Bow-Tie Nebula",type:"Planetary",mag:"11.5",diff:"Hard",ra_h:0,dec:72,settings:{exp:"45s",gain:"100",frames:"50/80",filter:"Dual-band",noteExp:"Very long",noteGain:"Very High",noteFiltro:"Enhances Ha/OIII"},months:[9,10,11,0],advice:"Faint."},
    {id:"NGC 2024",name:"Flame Nebula",type:"Nebula",mag:"7.0",diff:"Intermediate",ra_h:5,dec:-1,settings:{exp:"40s",gain:"85",frames:"40/60",filter:"Dual-band",noteExp:"Long",noteGain:"High",noteFiltro:"Enhances Ha/OIII"},months:[11,0,1,2],advice:"Near M42."},
    {id:"NGC 2174",name:"Monkey Head Nebula",type:"Nebula",mag:"7.5",diff:"Intermediate",ra_h:6,dec:20,settings:{exp:"40s",gain:"85",frames:"40/60",filter:"Dual-band",noteExp:"Long",noteGain:"High",noteFiltro:"Enhances Ha/OIII"},months:[12,0,1,2],advice:"HII region."},
    {id:"NGC 2237",name:"Rosette Nebula",type:"Nebula",mag:"9.0",diff:"Intermediate",ra_h:6,dec:4,settings:{exp:"45s",gain:"90",frames:"50/80",filter:"Dual-band",noteExp:"Very long",noteGain:"High",noteFiltro:"Enhances Ha/OIII"},months:[12,0,1,2],advice:"Huge. Wide field."},
    {id:"NGC 2359",name:"Thor's Helmet",type:"Nebula",mag:"7.0",diff:"Intermediate",ra_h:7,dec:-13,settings:{exp:"40s",gain:"85",frames:"40/60",filter:"Dual-band",noteExp:"Long",noteGain:"High",noteFiltro:"Enhances Ha/OIII"},months:[12,0,1,2],advice:"Wolf-Rayet."},
    {id:"NGC 6888",name:"Crescent Nebula",type:"Nebula",mag:"7.4",diff:"Intermediate",ra_h:20,dec:38,settings:{exp:"40s",gain:"85",frames:"40/60",filter:"Dual-band",noteExp:"Long",noteGain:"High",noteFiltro:"Enhances Ha/OIII"},months:[7,8,9,10],advice:"Wolf-Rayet."},
    {id:"NGC 6946",name:"Fireworks Galaxy",type:"Galaxy",mag:"8.8",diff:"Intermediate",ra_h:20,dec:60,settings:{exp:"45s",gain:"95",frames:"50/80",filter:"Astro",noteExp:"Long",noteGain:"High",noteFiltro:"Natural light"},months:[8,9,10],advice:"Spiral. Many supernovae."},
    {id:"NGC 7027",name:"Jewel Bug Nebula",type:"Planetary",mag:"8.5",diff:"Hard",ra_h:21,dec:42,settings:{exp:"40s",gain:"95",frames:"50/80",filter:"Dual-band",noteExp:"Long",noteGain:"Very High",noteFiltro:"Enhances Ha/OIII"},months:[8,9,10],advice:"Small, bright."},
    {id:"NGC 7635",name:"Bubble Nebula",type:"Nebula",mag:"7.5",diff:"Intermediate",ra_h:23,dec:61,settings:{exp:"40s",gain:"85",frames:"40/60",filter:"Dual-band",noteExp:"Long",noteGain:"High",noteFiltro:"Enhances Ha/OIII"},months:[9,10,11],advice:"Bubble structure."},
    {id:"NGC 7662",name:"Blue Snowball",type:"Planetary",mag:"9.2",diff:"Intermediate",ra_h:23,dec:42,settings:{exp:"35s",gain:"85",frames:"40/60",filter:"Dual-band",noteExp:"Long",noteGain:"High",noteFiltro:"Enhances Ha/OIII"},months:[9,10,11],advice:"Small, bright."},
    {id:"NGC 7789",name:"Cassiopeia Cluster",type:"Open",mag:"6.7",diff:"Intermediate",ra_h:23,dec:56,settings:{exp:"25s",gain:"60",frames:"40/60",filter:"Astro",noteExp:"Medium",noteGain:"Medium",noteFiltro:"Natural light"},months:[9,10,11,0],advice:"Rich, old."}
];

function applyLocation() {
    try {
        localStorage.setItem('dwarf_lat', document.getElementById('latInput').value);
        localStorage.setItem('dwarf_lon', document.getElementById('lonInput').value);
        localStorage.setItem('dwarf_bortle', document.getElementById('bortleSelect').value);
    } catch(e) {}
    const preset = document.getElementById('presetLoc').value;
    if (preset !== 'custom') {
        const [lat, lon] = preset.split(',').map(Number);
        userLat = lat;
        userLon = lon;
    } else {
        const lat = parseFloat(document.getElementById('latInput').value);
        const lon = parseFloat(document.getElementById('lonInput').value);
        if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
            userLat = lat;
            userLon = lon;
        } else {
            alert('Invalid coordinates. Lat: -90/90, Lon: -180/180');
            return;
        }
    }
    const currentId = document.getElementById('objId').innerText;
    if (currentId && document.getElementById('sheet').style.display === 'block') {
        const obj = dwarfDB.find(x => x.id === currentId);
        if (obj) show(obj);
    }
    tonightPage = 1;
    buildTonight();
}

function getRecommendedFilter(obj) {
    const type = (obj.type || '').toLowerCase();
    if (type.includes('galaxy')) return 'Astro / IR-CUT';
    const advice = (obj.advice || '').toLowerCase();
    const name = (obj.name || '').toLowerCase();
    if (type.includes('planetary')) return 'Dual-band';
    if (type.includes('remnant') || type.includes('supernova')) return 'Dual-band';
    if (type.includes('globular') || type.includes('open') || type.includes('star cloud') || type.includes('asterism') || type.includes('double')) return 'Astro / IR-CUT';
    if (type.includes('nebula') || type.includes('nebul')) {
        const isReflection = /reflection|reflect|blue|dust|scattered/i.test(advice + ' ' + name);
        if (isReflection) return 'Astro / IR-CUT';
        return 'Dual-band';
    }
    return obj.settings.filter;
}

function renderMonths(arr) {
    const c = document.getElementById('monthsList');
    c.innerHTML = '';
    monthsNames.forEach((n, i) => {
        const el = document.createElement('div');
        el.className = `month-pill ${arr.includes(i) ? 'active' : ''}`;
        el.innerText = n;
        c.appendChild(el);
    });
}

function isFaint(type, advice) {
    const t = (type + ' ' + (advice || '')).toLowerCase();
    return /low surface|faint|diffuse|bassa|debole|tenue/.test(t);
}

function getLunaCorrection(lunaPct, filter) {
    const isDual = filter === 'Dual-band';
    let gainCorr, espCorr;
    if (lunaPct <= 20) { gainCorr = 0; espCorr = 0; }
    else if (lunaPct <= 40) { gainCorr = -2; espCorr = -8; }
    else if (lunaPct <= 60) { gainCorr = -4; espCorr = -15; }
    else if (lunaPct <= 80) { gainCorr = -6; espCorr = -20; }
    else { gainCorr = -8; espCorr = -25; }
    if (isDual) {
        gainCorr = Math.round(gainCorr / 2);
        espCorr = Math.round(espCorr / 2);
    }
    return { gainCorr, espCorr };
}

function getBortleCorrection(bortle) {
    if (bortle <= 2) return { gainCorr: 0, espCorr: 0 };
    else if (bortle <= 4) return { gainCorr: -2, espCorr: -5 };
    else if (bortle <= 6) return { gainCorr: -5, espCorr: -10 };
    else if (bortle <= 8) return { gainCorr: -8, espCorr: -15 };
    else return { gainCorr: -10, espCorr: -20 };
}

function applyCorrections(baseGain, baseExp, lunaPct, filter, bortle, type, advice) {
    const lc = getLunaCorrection(lunaPct, filter);
    const bc = getBortleCorrection(bortle);
    let gainVal;
    if (typeof baseGain === 'string' && baseGain.includes('-')) {
        const parts = baseGain.split('-').map(Number);
        gainVal = Math.round((parts[0] + parts[1]) / 2);
    } else {
        gainVal = parseInt(baseGain) || 65;
    }
    const expVal = parseInt(baseExp) || 30;
    const faintFactor = isFaint(type, advice) ? 0.4 : 1.0;
    const gainTot = Math.round((lc.gainCorr + bc.gainCorr) * faintFactor);
    const expTot = Math.round((lc.espCorr + bc.espCorr) * faintFactor);
    let adjGain = Math.max(0, Math.min(150, gainVal + gainTot));
    let adjExp = Math.max(1, Math.min(60, expVal + expTot));
    adjGain = snapToAllowed(adjGain, ALLOWED_GAIN);
    adjExp = snapToAllowed(adjExp, ALLOWED_EXPOSURE);
    return {
        gain: adjGain,
        exp: adjExp,
        gainBase: gainVal,
        expBase: expVal,
        gainDelta: gainTot,
        expDelta: expTot,
        faint: isFaint(type, advice)
    };
}

function buildBanner(adj, lunaPct, bortle, filter, objType) {
    const lc = getLunaCorrection(lunaPct, filter);
    const bc = getBortleCorrection(bortle);
    const isDual = filter === 'Dual-band';
    const isOptimal = adj.gainDelta === 0 && adj.expDelta === 0;
    const lunaDesc = lunaPct <= 20 ? 'No moon/minimal' : lunaPct <= 40 ? 'Slight crescent moon' : lunaPct <= 60 ? 'Moderate moon' : lunaPct <= 80 ? 'Significant moon' : 'Full moon';
    const bortleDesc = bortle <= 2 ? 'Perfect dark sky' : bortle <= 4 ? 'Rural sky' : bortle <= 6 ? 'Suburban sky' : bortle <= 8 ? 'Urban sky' : 'City center';
    if (isOptimal) {
        return { color: '#68d391', bg: 'rgba(104,211,145,0.08)', border: '#68d391', html: `<div style="font-size:0.85rem;font-weight:700;margin-bottom:6px">✓ Optimal conditions — no corrections applied</div><div style="font-size:0.78rem;opacity:0.85">Dark sky (Bortle ${bortle}) + Moon ${lunaPct}% = base settings are ideal for this object.</div>` };
    }
    return { color: '#f6ad55', bg: 'rgba(246,173,85,0.08)', border: '#f6ad55', html: `<div style="font-size:0.85rem;font-weight:700;margin-bottom:8px">⚙ Values adapted to tonight's conditions</div><div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:8px"><div><span style="opacity:0.7;font-size:0.75rem">🌙 MOON</span><br><span style="font-size:0.8rem">${lunaDesc} (${lunaPct}%)</span><br><span style="font-size:0.75rem;opacity:0.7">Gain ${lc.gainCorr > 0 ? '+' : ''}${lc.gainCorr}${isDual ? ' (÷2 Dual-band)' : ''} · Exp ${lc.espCorr > 0 ? '+' : ''}${lc.espCorr}s${isDual ? ' (÷2)' : ''}</span></div><div><span style="opacity:0.7;font-size:0.75rem">🌆 BORTLE ${bortle}</span><br><span style="font-size:0.8rem">${bortleDesc}</span><br><span style="font-size:0.75rem;opacity:0.7">Gain ${bc.gainCorr > 0 ? '+' : ''}${bc.gainCorr} · Exp ${bc.espCorr > 0 ? '+' : ''}${bc.espCorr}s</span></div>${adj.faint ? `<div><span style="opacity:0.7;font-size:0.75rem">🔭 FAINT OBJECT</span><br><span style="font-size:0.8rem">Low surface brightness</span><br><span style="font-size:0.75rem;opacity:0.7">Corrections reduced 40%</span></div>` : ''}</div><div style="font-size:0.78rem;border-top:1px solid rgba(246,173,85,0.2);padding-top:6px;opacity:0.85">💡 Values shown are an <em>adaptive starting point</em> snapped to DWARF hardware support. Always experiment and note your best results.</div>` };
}

const MAJOR_CITIES = [[40.71,-74.01],[34.05,-118.24],[41.88,-87.63],[51.51,-0.13],[48.86,2.35],[52.52,13.40],[35.68,139.69],[31.23,121.47],[39.91,116.39],[28.61,77.21],[19.08,72.88],[23.13,-46.63],[19.43,-99.13],[37.77,-122.42],[41.90,12.50],[45.46,9.19],[40.85,14.27],[55.75,37.62],[41.01,28.97],[30.06,31.25],[1.35,103.82],[22.32,114.17],[37.57,126.98],[25.20,55.27],[24.69,46.72],[-33.87,151.21],[-23.55,-46.63],[6.45,3.40],[33.34,44.40],[43.70,-79.42]];
const MEDIUM_CITIES = [[44.49,11.34],[43.77,11.25],[45.44,12.33],[38.11,13.36],[40.42,-3.70],[41.39,2.15],[38.72,-9.14],[37.98,23.73],[47.37,8.54],[50.85,4.35],[52.37,4.90],[59.91,10.75],[59.33,18.07],[60.17,24.94],[50.08,14.44],[47.50,19.04],[33.75,-84.39],[29.76,-95.37],[32.78,-96.80],[47.61,-122.33],[45.52,-122.68],[39.74,-104.98],[42.36,-71.06],[25.77,-80.19],[29.95,-90.07]];

function distKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function estimateBortleInternal(lat, lon) {
    let minMajor = 99999, minMedium = 99999;
    MAJOR_CITIES.forEach(([clat, clon]) => {
        const d = distKm(lat, lon, clat, clon);
        if (d < minMajor) minMajor = d;
    });
    MEDIUM_CITIES.forEach(([clat, clon]) => {
        const d = distKm(lat, lon, clat, clon);
        if (d < minMedium) minMedium = d;
    });
    if (minMajor < 15) return 9;
    if (minMajor < 30) return 8;
    if (minMajor < 60) return 7;
    if (minMedium < 20) return 7;
    if (minMajor < 100) return 6;
    if (minMedium < 50) return 6;
    if (minMajor < 200) return 5;
    if (minMedium < 100) return 5;
    if (minMajor < 400) return 4;
    return 3;
}

function detectGPS() {
    if (!navigator.geolocation) {
        alert('Geolocation not supported by your browser.');
        return;
    }
    const btn = event.target;
    btn.innerText = '⏳';
    btn.disabled = true;
    navigator.geolocation.getCurrentPosition(function(pos) {
        const lat = Math.round(pos.coords.latitude * 100) / 100;
        const lon = Math.round(pos.coords.longitude * 100) / 100;
        document.getElementById('latInput').value = lat;
        document.getElementById('lonInput').value = lon;
        document.getElementById('presetLoc').value = 'custom';
        userLat = lat;
        userLon = lon;
        try {
            localStorage.setItem('dwarf_lat', lat);
            localStorage.setItem('dwarf_lon', lon);
        } catch(e) {}
        estimateBortleFromCoords(lat, lon);
        btn.innerText = '📍 GPS';
        btn.disabled = false;
        if (window._lastObj) show(window._lastObj);
    }, function(err) {
        const msg = err.code === 1 ? 'Location permission denied.\nPlease allow location access in your browser settings, or enter coordinates manually.' : err.code === 2 ? 'Location unavailable.\nPlease enter coordinates manually.' : 'Location request timed out.\nPlease enter coordinates manually.';
        alert('📍 GPS Error\n\n' + msg);
        btn.innerText = '📍 GPS';
        btn.disabled = false;
    }, { timeout: 15000, enableHighAccuracy: true });
}

function estimateBortleFromCoords(lat, lon) {
    const bortle = estimateBortleInternal(lat, lon);
    const sel = document.getElementById('bortleSelect');
    const opts = [1, 3, 5, 7, 9];
    const closest = opts.reduce((a, b) => Math.abs(b - bortle) < Math.abs(a - bortle) ? b : a);
    sel.value = closest;
    try { localStorage.setItem('dwarf_bortle', closest); } catch(e) {}
    showBortleNotice(bortle, closest, true);
    if (window._lastObj) show(window._lastObj);
}

function showBortleNotice(bortle, selected, internal) {
    let notice = document.getElementById('bortleNotice');
    if (!notice) return;
    notice.style.display = 'block';
    if (internal) {
        notice.style.cssText = 'font-size:0.75rem;color:#f6ad55;margin-top:4px;padding:4px 8px;background:rgba(246,173,85,0.1);border-radius:4px;border:1px solid rgba(246,173,85,0.3);';
        notice.innerHTML = '📍 Bortle estimated from coordinates (internal): <strong>' + selected + '</strong> — adjust manually if needed';
    } else {
        notice.style.cssText = 'font-size:0.75rem;color:#68d391;margin-top:4px;padding:4px 8px;background:rgba(104,211,145,0.1);border-radius:4px;border:1px solid rgba(104,211,145,0.3);';
        notice.innerHTML = '🌍 Light pollution detected: Bortle <strong>' + Math.round(bortle) + '</strong> — auto-set to <strong>' + selected + '</strong>';
    }
    setTimeout(() => { if (notice) notice.style.opacity = '0.3'; }, 6000);
}

const THUMBNAILS = {
    "M1": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/00/Crab_Nebula.jpg/320px-Crab_Nebula.jpg",
    "M2": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/M2_Globular_Cluster_by_HST.jpg/320px-M2_Globular_Cluster_by_HST.jpg",
    "M3": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/Messier_3_Hubble_StarClusters.jpg/320px-Messier_3_Hubble_StarClusters.jpg",
    "M4": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9d/M4_Globular_cluster_Hubble_Space_Telescope.jpg/320px-M4_Globular_cluster_Hubble_Space_Telescope.jpg",
    "M5": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/M5s.jpg/320px-M5s.jpg",
    "M8": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Lagoon_Nebula_ESO.jpg/320px-Lagoon_Nebula_ESO.jpg",
    "M13": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Messier_13_Hubble_WikiSky.jpg/320px-Messier_13_Hubble_WikiSky.jpg",
    "M16": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Pillars_of_creation_2014_HST_WFC3-UVIS_full-res_denoised.jpg/320px-Pillars_of_creation_2014_HST_WFC3-UVIS_full-res_denoised.jpg",
    "M17": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Omega_Nebula.jpg/320px-Omega_Nebula.jpg",
    "M20": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/31/Trifid.nebula.arp.750pix.jpg/320px-Trifid.nebula.arp.750pix.jpg",
    "M27": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Dumbbell_Nebula.jpg/320px-Dumbbell_Nebula.jpg",
    "M31": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/98/Andromeda_Galaxy_%28with_h-alpha%29.jpg/320px-Andromeda_Galaxy_%28with_h-alpha%29.jpg",
    "M32": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/M32_HST.jpg/320px-M32_HST.jpg",
    "M33": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/Triangulum_Galaxy_-_Hubble_Legacy_Archive.jpg/320px-Triangulum_Galaxy_-_Hubble_Legacy_Archive.jpg",
    "M42": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Orion_Nebula_-_Hubble_2006_mosaic_18000.jpg/320px-Orion_Nebula_-_Hubble_2006_mosaic_18000.jpg",
    "M43": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/M43_HST.jpg/320px-M43_HST.jpg",
    "M44": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Messier44.jpg/320px-Messier44.jpg",
    "M45": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Pleiades_large.jpg/320px-Pleiades_large.jpg",
    "M51": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/Whirlpool_Galaxy_-_Hubble_2005.jpg/320px-Whirlpool_Galaxy_-_Hubble_2005.jpg",
    "M57": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/M57_The_Ring_Nebula.JPG/320px-M57_The_Ring_Nebula.JPG",
    "M63": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/M63.jpg/320px-M63.jpg",
    "M64": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/M64.jpg/320px-M64.jpg",
    "M74": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/M74_by_HST.jpg/320px-M74_by_HST.jpg",
    "M78": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/50/M78.jpg/320px-M78.jpg",
    "M81": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/Messier_81_HST.jpg/320px-Messier_81_HST.jpg",
    "M82": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/M82_HST_ACS_2006-14-a-large_web.jpg/320px-M82_HST_ACS_2006-14-a-large_web.jpg",
    "M83": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/31/Messier83_-_Heic1403a.jpg/320px-Messier83_-_Heic1403a.jpg",
    "M87": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/M87_jet.jpg/320px-M87_jet.jpg",
    "M97": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Owl_Nebula_M97.png/320px-Owl_Nebula_M97.png",
    "M101": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/M101_hires_STScI-PRC2006-10a.jpg/320px-M101_hires_STScI-PRC2006-10a.jpg",
    "M104": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/M104_ngc4594_sombrero_galaxy_hi-res.jpg/320px-M104_ngc4594_sombrero_galaxy_hi-res.jpg",
    "M106": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0f/Messier_106_image_by_Adam_Block%2C_HST.jpg/320px-Messier_106_image_by_Adam_Block%2C_HST.jpg",
    "NGC7293": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Helixtwo.jpg/320px-Helixtwo.jpg",
    "NGC891": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/NGC_891_which_is_located_30_million_light_years_away.jpg/320px-NGC_891_which_is_located_30_million_light_years_away.jpg",
    "NGC6992": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Veil_Nebula_-_NGC_6960.jpg/320px-Veil_Nebula_-_NGC_6960.jpg",
    "NGC2244": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9b/Rosette_Nebula.jpg/320px-Rosette_Nebula.jpg"
};

let plannerMode = 'auto';

function setPlannerMode(mode) {
    plannerMode = mode;
    const btnAuto = document.getElementById('modeAuto');
    const btnCon = document.getElementById('modeConstrained');
    const conInput = document.getElementById('constrainedInput');
    if (mode === 'auto') {
        btnAuto.style.background = 'var(--accent)';
        btnAuto.style.color = '#000';
        btnAuto.style.borderColor = 'var(--accent)';
        btnCon.style.background = 'transparent';
        btnCon.style.color = 'var(--text-sub)';
        btnCon.style.borderColor = 'var(--border)';
        if (conInput) conInput.style.display = 'none';
    } else {
        btnCon.style.background = 'var(--accent)';
        btnCon.style.color = '#000';
        btnCon.style.borderColor = 'var(--accent)';
        btnAuto.style.background = 'transparent';
        btnAuto.style.color = 'var(--text-sub)';
        btnAuto.style.borderColor = 'var(--border)';
        if (conInput) conInput.style.display = 'block';
    }
    if (window._lastObj) updatePlanner(window._lastObj);
}

function recalcConstrained() {
    if (window._lastObj) updatePlanner(window._lastObj);
}

function calcOptimalMinutes(obj, adjExp) {
    const mag = parseFloat(obj.mag) || 8;
    const isFaintObj = isFaint(obj.type, obj.advice);
    const type = obj.type.toLowerCase();
    let baseMin;
    if (type.includes('globular') || type.includes('open')) baseMin = 15;
    else if (type.includes('galaxy')) baseMin = isFaintObj ? 90 : 45;
    else if (type.includes('planetary')) baseMin = 40;
    else if (type.includes('remnant')) baseMin = 75;
    else baseMin = 60;
    const magMult = mag < 6 ? 0.5 : mag < 8 ? 0.8 : mag < 10 ? 1.2 : 1.6;
    const bortle = parseInt(document.getElementById('bortleSelect').value) || 5;
    const bortMult = bortle <= 2 ? 0.7 : bortle <= 4 ? 0.85 : bortle <= 6 ? 1.0 : bortle <= 8 ? 1.3 : 1.6;
    return Math.round(baseMin * magMult * bortMult);
}

function qualityLabel(frames, optimal) {
    const ratio = frames / optimal;
    if (ratio >= 1.5) return { icon: '🌟', label: 'Excellent' };
    if (ratio >= 0.9) return { icon: '✅', label: 'Good' };
    if (ratio >= 0.6) return { icon: '🔶', label: 'Decent' };
    if (ratio >= 0.3) return { icon: '⚠️', label: 'Minimal' };
    return { icon: '❌', label: 'Too short' };
}

function updatePlanner(obj) {
    const mode = document.getElementById('obsMode').value || 'deep_sky';
    const data = OBS_MODES[mode];
    const bortle = parseInt(document.getElementById('bortleSelect').value) || 5;
    let expSec, gain, filter, sessionMin, frameCount, summary, expNote = 'base value';
    if (mode === 'deep_sky') {
        const adjData = applyCorrections(obj.settings.gain, obj.settings.exp, window._lastLuna || 0, obj._effectiveFilter || obj.settings.filter, bortle, obj.type, obj.advice);
        expSec = adjData.exp;
        gain = adjData.gain;
        filter = obj._effectiveFilter || obj.settings.filter;
        expNote = adjData.expBase !== adjData.exp ? 'adapted from ' + adjData.expBase + 's' : 'base value';
        const optMin = calcOptimalMinutes(obj, expSec);
        if (plannerMode === 'auto') {
            sessionMin = optMin;
        } else {
            sessionMin = parseInt(document.getElementById('availableMinutes').value) || 30;
        }
        frameCount = Math.round((sessionMin * 60) / expSec);
        const q = qualityLabel(frameCount, Math.round((optMin * 60) / expSec));
        summary = plannerMode === 'auto' ? `Tonight for <strong>${obj.id}</strong>: shoot <strong>${frameCount} frames</strong> × <strong>${expSec}s</strong> = <strong>${sessionMin} min</strong> session. ${q.icon} Expected quality: ${q.label}.` : `In your <strong>${sessionMin} min</strong> window: <strong>${frameCount} frames</strong> × <strong>${expSec}s</strong>. ${q.icon} Quality: ${q.label}. Optimal would be ${optMin} min.`;
        document.getElementById('qsQuality').innerText = q.icon + ' ' + q.label;
    } else if (mode === 'milky_way') {
        expSec = 10;
        gain = 80;
        filter = "None";
        sessionMin = 15;
        frameCount = Math.round((sessionMin * 60) / expSec);
        summary = `<strong>Milky Way:</strong> Shoot <strong>${frameCount} frames</strong> of 10s. Stacking will reveal the Galactic Core. Best with Bortle ≤ 4.`;
        document.getElementById('qsQuality').innerText = "🟢 Recommended";
    } else if (mode === 'star_trails') {
        expSec = 30;
        gain = 60;
        filter = "None";
        sessionMin = parseInt(document.getElementById('availableMinutes').value) || 120;
        frameCount = Math.round((sessionMin * 60) / expSec);
        const bat = sessionMin > 180 ? "⚠️ Battery low" : "✅ Battery OK";
        summary = `<strong>Star Trails:</strong> Total <strong>${sessionMin} min</strong>. Frames: <strong>${frameCount}</strong>. ${bat}. Memory: ~${(frameCount * 15 / 1024).toFixed(1)} GB.`;
        document.getElementById('qsQuality').innerText = "🟢 Recommended";
    } else if (mode === 'time_lapse') {
        expSec = 1;
        gain = 40;
        filter = "None";
        const videoSec = 20;
        const fps = 30;
        frameCount = videoSec * fps;
        const interval = 5;
        sessionMin = Math.round((frameCount * interval) / 60);
        summary = `<strong>Time-Lapse:</strong> To get <strong>${videoSec}s</strong> of video at ${fps}fps, you need <strong>${frameCount} frames</strong>. Total capture time: <strong>~${sessionMin} min</strong>.`;
        document.getElementById('qsQuality').innerText = "🟡 Medium";
    }
    document.getElementById('qsExp').innerText = expSec + 's';
    document.getElementById('qsExpNote').innerText = expNote;
    document.getElementById('qsGain').innerText = gain;
    document.getElementById('qsFilter').innerText = filter;
    document.getElementById('qsDuration').innerText = sessionMin + ' min';
    document.getElementById('qsFrames').innerText = frameCount;
    document.getElementById('qsSummary').innerHTML = summary;
}

function toggleHDRWorkflow() {
    const toggle = document.getElementById('hdrToggle');
    const hdrBox = document.getElementById('hdrWorkflowBox');
    if (toggle && hdrBox) {
        if (toggle.checked) {
            hdrBox.classList.add('visible');
        } else {
            hdrBox.classList.remove('visible');
        }
    }
}

function show(obj) {
    window._lastObj = obj;
    const typeIcons = { 'galaxy': '🌀', 'globular': '⚪', 'nebula': '☁️', 'open': '✨', 'cluster': '✨', 'planetary': '🪐', 'remnant': '💥' };
    const lowerType = obj.type.toLowerCase();
    let icon = '🔭';
    for (const [key, val] of Object.entries(typeIcons)) {
        if (lowerType.includes(key)) { icon = val; break; }
    }
    document.getElementById('typeIcon').innerText = icon;
    document.getElementById('astrobinLink').href = `https://www.astrobin.com/search/?q=${obj.id}`;
    document.getElementById('objId').innerHTML = `${obj.id} <span id="typeIcon" style="font-size:1.2rem;opacity:0.8;">${icon}</span>`;
    document.getElementById('objName').innerText = obj.name;
    document.getElementById('objType').innerText = obj.type;
    document.getElementById('objType2').innerText = obj.type;
    document.getElementById('objMag').innerText = obj.mag;
    document.getElementById('objAdvice').innerText = obj.advice;
    const b = document.getElementById('objDiff');
    b.innerText = obj.diff === 'Easy' ? 'EASY' : obj.diff === 'Hard' ? 'HARD' : 'INTERMEDIATE';
    b.className = `badge ${obj.diff === 'Easy' ? 'easy' : obj.diff === 'Hard' ? 'hard' : 'intermediate'}`;
    
    const recommendedFilter = getRecommendedFilter(obj);
    const filterChanged = recommendedFilter !== obj.settings.filter;
    document.getElementById('valFiltro').innerHTML = filterChanged ? obj.settings.filter + ' <span style="color:#f6ad55;font-size:0.8rem;font-weight:700">→ ' + recommendedFilter + '</span>' : recommendedFilter;
    const filterNoteEl = document.getElementById('noteFiltro');
    if (filterChanged) {
        const isReflection = /reflection|reflect|blue|dust|scattered/i.test((obj.advice || '') + ' ' + (obj.name || ''));
        filterNoteEl.innerHTML = isReflection ? '<span style="color:#f6ad55;">Reflection nebula: broadband Astro/IR-CUT filter recommended (not Dual-band)</span>' : obj.settings.noteFiltro;
    } else {
        filterNoteEl.innerText = obj.settings.noteFiltro;
    }
    
    const filterTipText = document.getElementById('filterTipText');
    if (filterTipText) {
        if (lowerType.includes('galaxy')) {
            filterTipText.innerHTML = 'For galaxies, use a broadband Astro/IR-CUT filter to preserve natural star colors. Dual-band filters are not recommended for galaxies.';
        } else {
            filterTipText.innerHTML = 'If light pollution is present (Bortle 5+), use a dual-band filter. Aim for moonless nights for maximum contrast.';
        }
    }
    
    obj._effectiveFilter = recommendedFilter;
    renderMonths(obj.months);
    
    const date = getDate();
    const pts = getAltCurve(obj.ra_h, obj.dec, date);
    let maxA = -99, maxH = 24;
    pts.forEach(p => { if (p.alt > maxA) { maxA = p.alt; maxH = p.h; } });
    const hh = Math.floor(maxH) % 24, mm = Math.round((maxH % 1) * 60);
    const culm = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
    const nightPts = pts.filter(p => p.alt >= 30);
    let winStr;
    if (nightPts.length) {
        const fmt = h => { const hh2 = Math.floor(h) % 24, mm2 = Math.round((h % 1) * 60); return String(hh2).padStart(2, '0') + ':' + String(mm2).padStart(2, '0'); };
        winStr = '✅ ' + fmt(nightPts[0].h) + ' – ' + fmt(nightPts[nightPts.length - 1].h) + ' (alt >30°)';
    } else {
        const nightAllPts = pts;
        const maxNightAlt = nightAllPts.length ? Math.round(Math.max(...nightAllPts.map(p => p.alt))) : -99;
        const bestMonths = obj.months && obj.months.length ? obj.months.map(m => monthsNames[m]).join(', ') : '—';
        winStr = '⚠️ Not optimal tonight (max ' + maxNightAlt + '°). Best months: ' + bestMonths;
    }
    const altCls = maxA >= 60 ? 'color:#68d391' : maxA >= 30 ? 'color:#f6ad55' : 'color:#fc8181';
    document.getElementById('altDateLabel').innerText = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    document.getElementById('altLocLabel').innerText = 'Lat ' + userLat.toFixed(1) + '° Lon ' + userLon.toFixed(1) + '°';
    document.getElementById('altStats').innerHTML = '<span style="' + altCls + '">Max alt: <strong>' + (maxA > -90 ? Math.round(maxA) + '°' : 'Always below horizon') + '</strong></span>' + (maxA > -90 ? '<span>Culmination: <strong>' + culm + '</strong></span>' : '') + '<span>Window &gt;30° (night): <strong>' + winStr + '</strong></span>';
    
    // Cardinal Direction at culmination
    const culminationHour = maxH;
    const cardinalDir = calculateCardinalDirectionAtTime(obj, date, culminationHour);
    const cardinalEl = document.getElementById('cardinalDir');
    if (cardinalEl) {
        cardinalEl.innerHTML = `<span class="direction-badge">${cardinalDir}</span> at culmination (${culm})`;
    }
    
    const luna = lunaPhase(date);
    const limp = lunaImpact(luna, obj._effectiveFilter || obj.settings.filter, obj.type);
    document.getElementById('lunarIcon').innerText = lunaIcon(luna);
    document.getElementById('lunarPct').innerText = luna + '% illuminated';
    document.getElementById('lunarLabel').innerText = date.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    const impEl = document.getElementById('lunarImpact');
    impEl.innerText = limp.txt;
    impEl.style.cssText = 'display:inline-block;margin-top:5px;font-size:0.75rem;font-weight:700;padding:3px 10px;border-radius:4px;background:' + limp.bg + ';color:' + limp.col + ';border:1px solid ' + limp.bdr;
    document.getElementById('lunarRow').style.display = 'flex';
    
    const bortle = parseInt(document.getElementById('bortleSelect').value) || 5;
    document.getElementById('bortleValue').innerText = bortle;
    document.getElementById('bortleValueGain').innerText = bortle;
    
    const baseExpVal = parseInt(obj.settings.exp) || 30;
    const baseGainVal = parseInt(obj.settings.gain) || 70;
    document.getElementById('baseExp').innerHTML = baseExpVal + 's';
    document.getElementById('baseGain').innerHTML = baseGainVal;
    
    const adj = applyCorrections(obj.settings.gain, obj.settings.exp, luna, obj._effectiveFilter || obj.settings.filter, bortle, obj.type, obj.advice);
    document.getElementById('adaptedExp').innerHTML = adj.exp + 's';
    document.getElementById('adaptedExpNote').innerHTML = adj.expBase !== adj.exp ? 'Snapped from ' + adj.expBase + 's to nearest hardware value' : 'Matches hardware exactly';
    document.getElementById('adaptedGain').innerHTML = adj.gain;
    document.getElementById('adaptedGainNote').innerHTML = adj.gainBase !== adj.gain ? 'Snapped from ' + adj.gainBase + ' to nearest hardware value' : 'Matches hardware exactly';
    
    const banner = buildBanner(adj, luna, bortle, obj._effectiveFilter || obj.settings.filter, obj.type);
    let corrBanner = document.getElementById('corrBanner');
    if (!corrBanner) {
        corrBanner = document.createElement('div');
        corrBanner.id = 'corrBanner';
        corrBanner.style.cssText = 'margin:0 0 12px 0;padding:12px 16px;border-radius:8px;border:1px solid;line-height:1.5;';
        const sheetRows = document.querySelector('.tech-sheet');
        if (sheetRows) sheetRows.insertBefore(corrBanner, sheetRows.firstChild);
    }
    if (corrBanner) {
        corrBanner.style.background = banner.bg;
        corrBanner.style.color = banner.color;
        corrBanner.style.borderColor = banner.border;
        corrBanner.innerHTML = banner.html;
    }
    
    const sess = sessCalc(obj.settings.frames, obj.settings.exp);
    document.getElementById('sessMin').innerText = sess.min;
    document.getElementById('sessMinNote').innerText = sess.minN;
    document.getElementById('sessOk').innerText = sess.ok;
    document.getElementById('sessOkNote').innerText = sess.okN;
    document.getElementById('sessBar').style.width = sess.pct + '%';
    document.getElementById('sessionRow').style.display = 'flex';
    
    const thumb = document.getElementById('objThumb');
    if (thumb) {
        const url = THUMBNAILS[obj.id];
        if (url) {
            thumb.src = url;
            thumb.style.display = 'block';
            thumb.alt = obj.name;
        } else {
            thumb.style.display = 'none';
            thumb.src = '';
        }
    }
    const stLink = document.getElementById('stellariumLink');
    if (stLink) stLink.href = 'https://stellarium-web.org/?objectId=' + encodeURIComponent(obj.id);
    const expSecDiv = document.getElementById('exportSection');
    if (expSecDiv) expSecDiv.style.display = 'block';
    document.getElementById('sheet').style.display = 'block';
    document.getElementById('tipsSection').style.display = 'block';
    window._lastLuna = lunaPhase(getDate());
    updatePlanner(obj);
    document.getElementById('sheet').scrollIntoView({ behavior: 'smooth' });
    requestAnimationFrame(() => {
        const c = document.getElementById('altCanvas');
        if (c) { c.style.height = '180px'; }
        setTimeout(() => drawAlt(pts, date), 50);
    });
}

function load(id) {
    const o = dwarfDB.find(x => x.id === id);
    if (o) show(o);
}

function closeSuggestions() {
    const el = document.getElementById('searchSuggestions');
    if (el) el.remove();
}

function find() {
    const q = (document.getElementById('search').value || '').trim().toUpperCase();
    if (!q) { alert('Enter an object name or ID to search.'); return; }
    let o = dwarfDB.find(x => x.id.toUpperCase() === q);
    if (!o) o = dwarfDB.find(x => x.id.toUpperCase().includes(q) || x.name.toUpperCase().includes(q) || x.type.toUpperCase().includes(q));
    if (o) {
        show(o);
        closeSuggestions();
        document.getElementById('search').value = '';
    } else alert('Object not found. Try: M42, Andromeda, Nebula…');
}

document.getElementById('search').addEventListener('input', function() {
    closeSuggestions();
    const q = this.value.trim().toUpperCase();
    if (!q || q.length < 1) return;
    const matches = dwarfDB.filter(x => x.id.toUpperCase().includes(q) || x.name.toUpperCase().includes(q) || x.type.toUpperCase().includes(q)).slice(0, 8);
    if (!matches.length) return;
    const box = document.createElement('div');
    box.id = 'searchSuggestions';
    box.style.cssText = 'position:absolute;top:100%;left:0;right:0;z-index:999;background:var(--bg-panel);border:1px solid var(--accent);border-top:none;border-radius:0 0 10px 10px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.5);';
    box.innerHTML = matches.map(o => {
        const ic = o.type.toLowerCase().includes('galaxy') ? '🌌' : o.type.toLowerCase().includes('globular') ? '✨' : o.type.toLowerCase().includes('open') ? '⭐' : o.type.toLowerCase().includes('planetary') ? '💫' : o.type.toLowerCase().includes('remnant') ? '💥' : '🌫️';
        const dc = o.diff === 'Easy' ? '#68d391' : o.diff === 'Hard' ? '#fc8181' : '#f6ad55';
        return `<div onclick="load('${o.id}');document.getElementById('search').value='';closeSuggestions();" style="display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;border-bottom:1px solid var(--border);" onmouseover="this.style.background='rgba(183,148,244,0.1)'" onmouseout="this.style.background='transparent'"><span>${ic}</span><span style="font-family:var(--font-mono);font-weight:700;color:var(--accent);min-width:65px;">${o.id}</span><span style="flex:1;font-size:0.85rem;">${o.name}</span><span style="font-size:0.72rem;color:var(--text-sub);">${o.type}</span><span style="font-size:0.68rem;font-weight:700;color:${dc};padding:2px 6px;border-radius:3px;border:1px solid ${dc};">${o.diff === 'Intermediate' ? 'INT' : o.diff.toUpperCase()}</span></div>`;
    }).join('');
    const sb = document.querySelector('.search-box');
    sb.style.position = 'relative';
    sb.appendChild(box);
});

document.getElementById('search').addEventListener('keyup', e => {
    if (e.key === 'Enter') find();
    if (e.key === 'Escape') { closeSuggestions(); e.target.value = ''; }
    if (!e.target.value.trim()) { closeSuggestions(); document.getElementById('sheet').style.display = 'none'; document.getElementById('tipsSection').style.display = 'none'; }
});

document.addEventListener('click', e => { if (!e.target.closest('.search-box')) closeSuggestions(); });

function toggleGuide() {
    const content = document.getElementById('guideContent');
    const arrow = document.getElementById('guideArrow');
    if (content.style.display === 'none') {
        content.style.display = 'block';
        arrow.style.transform = 'rotate(180deg)';
    } else {
        content.style.display = 'none';
        arrow.style.transform = 'rotate(0deg)';
    }
}

document.getElementById('obsDate').addEventListener('change', () => {
    if (window._lastObj) show(window._lastObj);
    tonightPage = 1;
    buildTonight();
});

function computeSkyQuality({ clouds, humidity, wind }) {
    let seeingScore;
    if (clouds > 80 || humidity > 90 || wind > 40) seeingScore = 1;
    else if (clouds > 60 || humidity > 80 || wind > 30) seeingScore = 2;
    else if (clouds > 40 || humidity > 70 || wind > 20) seeingScore = 3;
    else if (clouds > 20 || humidity > 60 || wind > 12) seeingScore = 4;
    else seeingScore = 5;
    const seeingLabels = ['', 'Very Poor', 'Poor', 'Fair', 'Good', 'Excellent'];
    const seeingColors = ['', '#fc8181', '#fc8181', '#f6ad55', '#68d391', '#68d391'];
    const seeingNotes = ['', 'Heavy turbulence — stars bloated, trailing likely', 'Significant turbulence — stacking efficiency reduced', 'Moderate turbulence — acceptable for bright targets', 'Stable atmosphere — good for most DSO imaging', 'Exceptional stability — ideal for all targets'];
    let transp, transpNote, transpColor;
    if (clouds > 70 || humidity > 85) { transp = 'Low'; transpNote = 'Significant light scatter'; transpColor = '#fc8181'; }
    else if (clouds > 40 || humidity > 70) { transp = 'Medium'; transpNote = 'Moderate atmospheric haze'; transpColor = '#f6ad55'; }
    else if (clouds > 15 || humidity > 55) { transp = 'High'; transpNote = 'Good photon throughput'; transpColor = '#68d391'; }
    else { transp = 'Superb'; transpNote = 'Near-perfect transparency'; transpColor = '#68d391'; }
    let suitLabel, suitBg, suitCol, suitBorder;
    const qualSum = seeingScore + (transp === 'Superb' ? 5 : transp === 'High' ? 4 : transp === 'Medium' ? 2 : 1);
    if (qualSum >= 9) { suitLabel = '🟢 Excellent night'; suitBg = 'rgba(104,211,145,0.12)'; suitCol = '#68d391'; suitBorder = '#68d391'; }
    else if (qualSum >= 6) { suitLabel = '🟡 Good night'; suitBg = 'rgba(246,173,85,0.12)'; suitCol = '#f6ad55'; suitBorder = '#f6ad55'; }
    else if (qualSum >= 4) { suitLabel = '🟠 Marginal night'; suitBg = 'rgba(252,129,129,0.08)'; suitCol = '#f6ad55'; suitBorder = '#f6ad55'; }
    else { suitLabel = '🔴 Poor night'; suitBg = 'rgba(252,129,129,0.12)'; suitCol = '#fc8181'; suitBorder = '#fc8181'; }
    return { seeingScore, seeingLabel: seeingLabels[seeingScore], seeingColor: seeingColors[seeingScore], seeingNote: seeingNotes[seeingScore], transparency: transp, transparencyNote: transpNote, transparencyColor: transpColor, suitLabel, suitBg, suitCol, suitBorder };
}

function updateSkyQualityBanner() {
    const banner = document.getElementById('skyQualityBanner');
    if (!banner) return;
    const sq = window._skyQuality;
    const mode = (document.getElementById('obsMode') || {}).value || 'deep_sky';
    const clouds = window._lastClouds || 0;
    const messages = [];
    if ((mode === 'deep_sky' || mode === 'milky_way') && sq && sq.seeingScore < 3) {
        messages.push({ icon: '⚠️', col: '#f6ad55', bg: 'rgba(246,173,85,0.1)', bdr: 'rgba(246,173,85,0.35)', title: 'Atmospheric Seeing is Poor', body: `Seeing rated <strong>${sq.seeingScore}/5 — ${sq.seeingLabel}</strong>. Star stacking tracking efficiency might be reduced tonight. Consider shorter exposures (10–15 s) and discard worst frames during stacking.` });
    }
    if (mode === 'time_lapse' && clouds >= 20 && clouds <= 60) {
        messages.push({ icon: '☁️', col: '#b794f4', bg: 'rgba(183,148,244,0.1)', bdr: 'rgba(183,148,244,0.35)', title: 'Cloud Dynamics Opportunity Detected', body: `Cloud cover at <strong>${clouds}%</strong> — weather conditions are perfect for a cloud dynamics time-lapse! The moving cloud layer will create dramatic motion in your final video.` });
    }
    if (mode === 'star_trails' && sq && sq.seeingScore >= 4) {
        messages.push({ icon: '✅', col: '#68d391', bg: 'rgba(104,211,145,0.08)', bdr: 'rgba(104,211,145,0.3)', title: 'Excellent Seeing for Star Trails', body: `Seeing <strong>${sq.seeingScore}/5</strong> — stars will appear sharp and compact. Trails will have tight, well-defined edges. Great night to shoot!` });
    }
    if (!messages.length) { banner.style.display = 'none'; return; }
    banner.style.display = 'block';
    banner.innerHTML = messages.map(m => `<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-top:1px solid var(--border);"><span style="font-size:1.2rem;line-height:1.4;">${m.icon}</span><div style="flex:1;background:${m.bg};border:1px solid ${m.bdr};border-radius:8px;padding:10px 14px;"><div style="font-size:0.8rem;font-weight:700;color:${m.col};margin-bottom:4px;">${m.title}</div><div style="font-size:0.8rem;color:var(--text-sub);line-height:1.5;">${m.body}</div></div></div>`).join('');
}

async function loadWeather() {
    const lat = parseFloat(document.getElementById('latInput').value) || userLat;
    const lon = parseFloat(document.getElementById('lonInput').value) || userLon;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,cloud_cover,wind_speed_10m,weather_code&wind_speed_unit=kmh`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const wRow = document.getElementById('weatherRow');
    const sqBanner = document.getElementById('skyQualityBanner');
    if (wRow) {
        wRow.style.display = 'block';
        wRow.style.borderBottomLeftRadius = '0';
        wRow.style.borderBottomRightRadius = '0';
        document.getElementById('wSeeing').innerText = '⏳ Loading…';
        document.getElementById('wAstroSeeingLabel').innerText = '…';
        document.getElementById('wTransparency').innerText = '…';
    }
    try {
        const r = await fetch(url, { signal: ctrl.signal });
        clearTimeout(timer);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await r.json();
        const c = d.current;
        const clouds = c.cloud_cover, humidity = c.relative_humidity_2m, temp = c.temperature_2m, wind = c.wind_speed_10m;
        window._lastWind = wind;
        window._lastClouds = clouds;
        let seeing, seeingNote;
        if (clouds > 80) { seeing = '❌ Poor'; seeingNote = 'Too cloudy'; }
        else if (humidity > 85) { seeing = '⚠️ Fair'; seeingNote = 'High humidity'; }
        else if (wind > 30) { seeing = '⚠️ Fair'; seeingNote = 'High wind'; }
        else if (clouds < 20 && humidity < 60 && wind < 15) { seeing = '✅ Good'; seeingNote = 'Good conditions'; }
        else { seeing = '🔶 Moderate'; seeingNote = 'Check later'; }
        const sq = computeSkyQuality({ clouds, humidity, wind });
        window._skyQuality = sq;
        const cloudCol = clouds > 60 ? '#fc8181' : clouds > 30 ? '#f6ad55' : '#68d391';
        const humCol = humidity > 80 ? '#fc8181' : humidity > 60 ? '#f6ad55' : '#68d391';
        document.getElementById('wClouds').innerHTML = `<span style="color:${cloudCol}">${clouds}%</span>`;
        document.getElementById('wHumidity').innerHTML = `<span style="color:${humCol}">${humidity}%</span>`;
        document.getElementById('wTemp').innerText = temp + '°C';
        document.getElementById('wWind').innerText = wind + ' km/h';
        document.getElementById('wSeeing').innerText = seeing;
        document.getElementById('wSeeingNote').innerText = seeingNote;
        document.getElementById('wLocation').innerText = `Lat ${lat.toFixed(2)}° Lon ${lon.toFixed(2)}°`;
        document.getElementById('wDesc').innerText = weatherDesc(c.weather_code);
        const starsHTML = Array.from({ length: 5 }, (_, i) => `<span style="color:${i < sq.seeingScore ? sq.seeingColor : 'var(--border)'}">★</span>`).join('');
        document.getElementById('wAstroSeeingLabel').innerHTML = `<span style="color:${sq.seeingColor}">${sq.seeingScore}/5 — ${sq.seeingLabel}</span>`;
        document.getElementById('wAstroSeeingStars').innerHTML = starsHTML;
        document.getElementById('wAstroSeeingNote').innerText = sq.seeingNote;
        document.getElementById('wTransparency').innerHTML = `<span style="color:${sq.transparencyColor}">${sq.transparency}</span>`;
        document.getElementById('wTransparencyNote').innerText = sq.transparencyNote;
        const pill = document.getElementById('wImagingSuit');
        pill.innerHTML = sq.suitLabel;
        pill.style.cssText = `font-size:0.78rem;font-weight:700;padding:5px 14px;border-radius:20px;border:1px solid ${sq.suitBorder};color:${sq.suitCol};font-family:var(--font-mono);background:${sq.suitBg};`;
        if (wRow) wRow.style.display = 'block';
        updateSkyQualityBanner();
    } catch (e) {
        clearTimeout(timer);
        const isTimeout = e.name === 'AbortError';
        document.getElementById('wSeeing').innerText = isTimeout ? '⏱️ Timeout' : '❌ Offline';
        document.getElementById('wSeeingNote').innerText = isTimeout ? 'Request exceeded 15s' : 'No connection';
        document.getElementById('wAstroSeeingLabel').innerText = '—';
        document.getElementById('wAstroSeeingStars').innerText = '';
        document.getElementById('wAstroSeeingNote').innerText = '';
        document.getElementById('wTransparency').innerText = '—';
        document.getElementById('wTransparencyNote').innerText = '';
        document.getElementById('wImagingSuit').innerText = '—';
        ['wClouds', 'wHumidity', 'wTemp', 'wWind'].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = '—'; });
        document.getElementById('wLocation').innerText = isTimeout ? 'Request timed out' : 'Weather unavailable';
        document.getElementById('wDesc').innerText = isTimeout ? 'Check connection speed' : 'Connect to load data';
        if (wRow) wRow.style.display = 'block';
        if (sqBanner) sqBanner.style.display = 'none';
    }
}

function weatherDesc(code) {
    if (code === 0) return '☀️ Clear sky';
    if (code <= 3) return '⛅ Partly cloudy';
    if (code <= 9) return '🌫️ Foggy';
    if (code <= 19) return '🌧️ Drizzle';
    if (code <= 29) return '🌨️ Precipitation';
    if (code <= 39) return '🌫️ Fog';
    if (code <= 49) return '🌧️ Drizzle';
    if (code <= 59) return '🌧️ Rain';
    if (code <= 69) return '❄️ Snow';
    if (code <= 79) return '🌨️ Sleet';
    if (code <= 84) return '🌦️ Rain showers';
    if (code <= 94) return '⛈️ Thunderstorm';
    return '⛈️ Heavy thunderstorm';
}

let sessionLog = [];
try { sessionLog = JSON.parse(localStorage.getItem('dwarf_log') || '[]'); } catch(e) {}

function addToLog() {
    if (!window._lastObj) { alert('Search for an object first!'); return; }
    const obj = window._lastObj;
    const notes = document.getElementById('sessionNotes').value.trim();
    const date = document.getElementById('obsDate').value || new Date().toISOString().split('T')[0];
    const bortle = document.getElementById('bortleSelect').value;
    const mode = (document.getElementById('obsMode') || {}).value || 'deep_sky';
    const isStarTrails = mode === 'star_trails';
    const entry = { date, id: obj.id, name: obj.name, exp: obj.settings.exp, gain: obj.settings.gain, filter: obj.settings.filter, frames: obj.settings.frames, bortle, lat: userLat, lon: userLon, notes, mode, starStax: isStarTrails };
    sessionLog.push(entry);
    try { localStorage.setItem('dwarf_log', JSON.stringify(sessionLog)); } catch(e) {}
    renderLog();
    document.getElementById('sessionNotes').value = '';
}

function renderLog() {
    const list = document.getElementById('sessionLogList');
    const exportBtn = document.getElementById('exportBtn');
    const clearBtn = document.getElementById('clearBtn');
    if (!sessionLog.length) {
        list.innerHTML = '<div style="opacity:0.5">No sessions logged yet.</div>';
        exportBtn.style.display = 'none';
        clearBtn.style.display = 'none';
        return;
    }
    exportBtn.style.display = 'inline-block';
    clearBtn.style.display = 'inline-block';
    list.innerHTML = sessionLog.slice().reverse().map((e, i) => {
        const showStarStax = e.starStax || e.mode === 'star_trails';
        const starStaxBadge = showStarStax ? `<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(183,148,244,0.15);border:1px solid var(--accent);color:var(--accent);border-radius:4px;padding:2px 7px;font-size:0.68rem;font-weight:700;font-family:var(--font-mono);white-space:nowrap;">⚙️ Ready for StarStaX</span>` : '';
        return `<div style="padding:6px 0;border-bottom:1px solid var(--border);display:flex;gap:10px;flex-wrap:wrap;align-items:center;"><span style="color:var(--accent);font-family:var(--font-mono);font-weight:700;">${e.id}</span><span>${e.date}</span><span>⏱️${e.exp}</span><span>📶${e.gain}</span><span>⭕${e.filter}</span><span>🌆B${e.bortle}</span>${starStaxBadge}${e.notes ? `<span style="color:var(--text-sub);font-style:italic;">"${e.notes}"</span>` : ''}<button onclick="removeLog(${sessionLog.length - 1 - i})" style="margin-left:auto;background:none;border:none;color:var(--text-sub);cursor:pointer;font-size:0.8rem;">✕</button></div>`;
    }).join('');
}

function removeLog(idx) {
    sessionLog.splice(idx, 1);
    try { localStorage.setItem('dwarf_log', JSON.stringify(sessionLog)); } catch(e) {}
    renderLog();
}

function clearLog() {
    if (!confirm('Clear all session logs?')) return;
    sessionLog = [];
    try { localStorage.removeItem('dwarf_log'); } catch(e) {}
    renderLog();
}

function exportCSV() {
    const header = 'Date,Object ID,Object Name,Exposure,Gain,Filter,Frames,Bortle,Latitude,Longitude,Mode,Notes';
    const rows = sessionLog.map(e => {
        const isStarTrails = e.starStax || e.mode === 'star_trails';
        let notesVal = e.notes || '';
        if (isStarTrails) {
            const suffix = 'Process with StarStaX using Gap Filling mode.';
            notesVal = notesVal ? `${notesVal} | ${suffix}` : suffix;
        }
        const modeLabel = e.mode || 'deep_sky';
        return [e.date, e.id, `"${e.name}"`, e.exp, e.gain, e.filter, e.frames, e.bortle, e.lat, e.lon, modeLabel, `"${notesVal}"`].join(',');
    });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dwarf_sessions.csv';
    a.click();
    URL.revokeObjectURL(url);
}

renderLog();

document.getElementById('presetLoc').addEventListener('change', function() {
    if (this.value !== 'custom') {
        const [lat, lon] = this.value.split(',').map(Number);
        document.getElementById('latInput').value = lat;
        document.getElementById('lonInput').value = lon;
    }
});

window.addEventListener('resize', () => {
    if (window._lastObj) {
        const d = getDate();
        const pts = getAltCurve(window._lastObj.ra_h, window._lastObj.dec, d);
        requestAnimationFrame(() => {
            const c = document.getElementById('altCanvas');
            if (c) { c.style.height = '180px'; }
            setTimeout(() => drawAlt(pts, d), 50);
        });
    }
});

let tonightFilter = 'all';
let tonightOpen = true;
const TONIGHT_PAGE_SIZE = 24;
let tonightPage = 1;

function toggleTonight() {
    tonightOpen = !tonightOpen;
    document.getElementById('tonightContent').style.display = tonightOpen ? 'block' : 'none';
    document.getElementById('tonightArrow').style.transform = tonightOpen ? 'rotate(0deg)' : 'rotate(-90deg)';
}

function tonightLoadMore() {
    tonightPage++;
    renderTonight(window._tonightResults || []);
}

function setTonightFilter(f) {
    tonightFilter = f;
    tonightPage = 1;
    const ids = ['tbtnAll', 'tbtnGal', 'tbtnNeb', 'tbtnGlob', 'tbtnEasy', 'tbtnInt', 'tbtnHard'];
    const vals = ['all', 'Galaxy', 'Nebula', 'Globular', 'Easy', 'Intermediate', 'Hard'];
    ids.forEach((id, i) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        const active = vals[i] === f;
        btn.style.background = active ? 'var(--accent)' : 'transparent';
        btn.style.color = active ? '#000' : 'var(--text-sub)';
        btn.style.borderColor = active ? 'var(--accent)' : 'var(--border)';
        btn.style.fontWeight = active ? '700' : '400';
    });
    const sel = document.getElementById('tonightFilterSelect');
    if (sel && sel.value !== f) sel.value = f;
    renderTonight(window._tonightResults || []);
}

function buildTonight() {
    const date = getDate();
    const results = [];
    dwarfDB.forEach(obj => {
        const pts = getAltCurve(obj.ra_h, obj.dec, date);
        const nightPts = pts.filter(p => p.alt >= 30);
        if (!nightPts.length) return;
        let maxAlt = -99;
        nightPts.forEach(p => { if (p.alt > maxAlt) maxAlt = p.alt; });
        const fmt = h => { const hh = Math.floor(h) % 24, mm = Math.round((h % 1) * 60); return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'); };
        const winStart = fmt(nightPts[0].h);
        const winEnd = fmt(nightPts[nightPts.length - 1].h);
        results.push({ obj, maxAlt, winStart, winEnd });
    });
    results.sort((a, b) => b.maxAlt - a.maxAlt);
    window._tonightResults = results;
    renderTonight(results);
    const subtitle = document.getElementById('tonightSubtitle');
    if (subtitle) subtitle.innerText = `${results.length} objects visible tonight · ${date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} · Lat ${userLat.toFixed(1)}°`;
}

function renderTonight(results) {
    const grid = document.getElementById('tonightGrid');
    const count = document.getElementById('tonightCount');
    let filtered = results;
    if (tonightFilter === 'Easy' || tonightFilter === 'Intermediate' || tonightFilter === 'Hard') {
        filtered = results.filter(r => r.obj.diff === tonightFilter);
    } else if (tonightFilter !== 'all') {
        filtered = results.filter(r => r.obj.type.toLowerCase().includes(tonightFilter.toLowerCase()));
    }
    if (!filtered.length) {
        grid.innerHTML = '<div style="color:var(--text-sub);font-size:0.85rem;grid-column:1/-1;text-align:center;padding:20px 0;">No objects matching this filter visible tonight.</div>';
        if (count) count.innerText = '';
        return;
    }
    const totalVisible = filtered.length;
    const pageItems = filtered.slice(0, tonightPage * TONIGHT_PAGE_SIZE);
    const hasMore = totalVisible > pageItems.length;
    if (count) count.innerText = `${totalVisible} object${totalVisible !== 1 ? 's' : ''} visible`;
    grid.innerHTML = pageItems.map(r => {
        const obj = r.obj;
        const altColor = r.maxAlt >= 60 ? '#68d391' : r.maxAlt >= 40 ? '#f6ad55' : '#fc8181';
        const barWidth = Math.round(Math.min(100, (r.maxAlt / 90) * 100));
        const diffClass = obj.diff === 'Easy' ? 'color:#68d391;background:rgba(104,211,145,0.15);border:1px solid #68d391;' : obj.diff === 'Hard' ? 'color:#fc8181;background:rgba(252,129,129,0.15);border:1px solid #fc8181;' : 'color:#f6ad55;background:rgba(246,173,85,0.15);border:1px solid #f6ad55;';
        const typeIcon = obj.type.toLowerCase().includes('galaxy') ? '🌌' : obj.type.toLowerCase().includes('globular') ? '✨' : obj.type.toLowerCase().includes('open') ? '⭐' : obj.type.toLowerCase().includes('planetary') ? '💫' : obj.type.toLowerCase().includes('remnant') ? '💥' : '🌫️';
        return `<div class="tonight-card" onclick="load('${obj.id}')"><span class="tc-diff" style="${diffClass}">${obj.diff === 'Easy' ? 'EASY' : obj.diff === 'Hard' ? 'HARD' : 'INT'}</span><div class="tc-id">${typeIcon} ${obj.id}</div><div class="tc-name">${obj.name}</div><div class="tc-alt" style="color:${altColor}">↑ ${Math.round(r.maxAlt)}°</div><div class="tc-win">🕐 ${r.winStart} – ${r.winEnd}</div><div class="tc-bar"><div class="tc-bar-fill" style="width:${barWidth}%;background:${altColor};"></div></div></div>`;
    }).join('');
    if (hasMore) {
        const remaining = totalVisible - pageItems.length;
        const loadMoreEl = document.createElement('div');
        loadMoreEl.style.cssText = 'grid-column:1/-1;text-align:center;padding:10px 0 4px;';
        loadMoreEl.innerHTML = `<button onclick="tonightLoadMore()" style="font-size:0.8rem;padding:8px 24px;border-radius:7px;border:1px solid var(--accent);background:transparent;color:var(--accent);cursor:pointer;font-weight:700;">⬇ Load more (${remaining} remaining)</button>`;
        grid.appendChild(loadMoreEl);
    }
}

setTimeout(() => buildTonight(), 800);

(function() {
    try {
        const savedMode = localStorage.getItem('dwarf_obs_mode');
        if (savedMode && savedMode !== 'deep_sky') {
            const sel = document.getElementById('obsMode');
            if (sel) sel.value = savedMode;
            switchObsMode(savedMode);
        }
    } catch(e) {}
})();