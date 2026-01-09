const USE_REAL_FIREBASE = true;

const firebaseConfig = {
    apiKey: "AIzaSyDr1bE57IpBPNz0qCCgb-RxLqsnJ0qPrUw",
    authDomain: "tazkiah-app-33b52.firebaseapp.com",
    projectId: "tazkiah-app-33b52",
    storageBucket: "tazkiah-app-33b52.firebasestorage.app",
    messagingSenderId: "578639643202",
    appId: "1:578639643202:web:f292b2b18cc9fdcf8f63db",
    measurementId: "G-T97YMH1YL3"
};

let auth, db;
let currentUser = null;
let unsubscribeSnapshot = null;
let lastUserData = null; 
let currentDate = new Date();
let prayerTimes = null; 
let adhanAudio = new Audio('https://www.islamcan.com/audio/adhan/azan2.mp3'); 
let adhanEnabled = true;
let currentAdhkarEditIndex = null; 

// Quran Vars
let quranAudio = new Audio();
let currentSurahAyahs = [];
let currentAyahIndex = 0;
let isPlaying = false;
let currentReciterId = "ar.yasseraldossari"; 

const RECITERS = {
    "ar.yasseraldossari": "ياسر الدوسري",
    "ar.alafasy": "مشاري العفاسي",
    "ar.husary": "محمود خليل الحصري",
    "ar.minshawi": "محمد صديق المنشاوي",
    "ar.abdulbasit": "عبد الباسط عبد الصمد",
    "ar.mahermuaiqly": "ماهر المعيقلي"
};

const HABITS_META = {
    rawatib: { name: 'السنن (12)', icon: 'layers' },
    duha: { name: 'الضحى', icon: 'sun' },
    witr: { name: 'الوتر', icon: 'moon' },
    azkar_m: { name: 'أذكار الصباح', icon: 'sunrise' },
    azkar_e: { name: 'أذكار المساء', icon: 'sunset' },
    azkar_s: { name: 'أذكار النوم', icon: 'star' },
    fasting_mon: { name: 'صيام الاثنين', icon: 'calendar' },
    fasting_thu: { name: 'صيام الخميس', icon: 'calendar' }
};

const DEFAULT_USER_DATA = {
    prayers: { fajr: false, dhuhr: false, asr: false, maghrib: false, isha: false },
    quran: false,
    habits: { rawatib: false, duha: false, witr: false, azkar_m: false, azkar_e: false, azkar_s: false },
    habitSettings: { rawatib: true, duha: true, witr: true, azkar_m: true, azkar_e: true, azkar_s: true },
    customAdhkar: [] 
};

const MESSAGES_DB = {
    high: { title: "همة عالية! 🌟", body: "أداء ممتاز. استمر يا بطل.", link: "https://www.youtube.com/results?search_query=الشيخ+ياسر+الدوسري+الثبات" },
    medium: { title: "أحسنت ✨", body: "واصل المسير، أنت تقترب.", link: "https://www.youtube.com/results?search_query=الشيخ+ياسر+الدوسري+الهمة" },
    low: { title: "لا تيأس 🌿", body: "بداية جديدة. استعن بالله.", link: "https://www.youtube.com/results?search_query=الشيخ+ياسر+الدوسري+التوبة" }
};

// === INIT ===
document.addEventListener('DOMContentLoaded', () => {
    if (typeof lucide !== 'undefined') lucide.createIcons();
    initApp();
});

function initApp() {
    if (typeof firebase === 'undefined') return;
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();

    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            showScreen('app-screen');
            currentDate = new Date();
            loadUserDataForDate(currentDate);
            initPrayerTimes(); 
            initQuranList();
        } else {
            currentUser = null;
            showScreen('landing-screen');
        }
        document.getElementById('loader').style.display = 'none';
    });
}

// === PRAYER TIMES ===
function initPrayerTimes() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => fetchPrayerTimes(pos.coords.latitude, pos.coords.longitude), 
        () => fetchPrayerTimes(30.0444, 31.2357));
    } else { fetchPrayerTimes(30.0444, 31.2357); }
    setInterval(checkTimeForAlerts, 60000);
}

async function fetchPrayerTimes(lat, lng) {
    const date = new Date();
    const url = `https://api.aladhan.com/v1/timings/${date.getDate()}-${date.getMonth()+1}-${date.getFullYear()}?latitude=${lat}&longitude=${lng}&method=4`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        if(data.code === 200) {
            prayerTimes = data.data.timings;
            updatePrayerUI();
        }
    } catch (e) { console.error(e); }
}

function updatePrayerUI() {
    if (!prayerTimes) return;
    const mapping = { fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };
    for (const [key, apiName] of Object.entries(mapping)) {
        const time = prayerTimes[apiName];
        if(!time) continue;
        const [h, m] = time.split(':');
        let hours = parseInt(h);
        const ampm = hours >= 12 ? 'م' : 'ص';
        hours = hours % 12 || 12; 
        const el = document.getElementById(`time-${key}`);
        if(el) el.innerText = `${hours}:${m} ${ampm}`;
    }
}

function checkTimeForAlerts() {
    if(!prayerTimes || !adhanEnabled) return;
    const now = new Date();
    const currentH = now.getHours();
    const currentM = now.getMinutes();
    ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'].forEach(p => {
        const [h, m] = prayerTimes[p].split(':');
        if (parseInt(h) === currentH && parseInt(m) === currentM) {
            adhanAudio.play().catch(()=>{});
            if (Notification.permission === "granted") new Notification(`📢 حان موعد ${p}`);
        }
    });
}

// === QURAN LOGIC ===
function initQuranList() {
    const sel = document.getElementById('reciter-select');
    sel.innerHTML = '';
    for (const [k, v] of Object.entries(RECITERS)) {
        const opt = document.createElement('option'); opt.value = k; opt.text = v; sel.appendChild(opt);
    }
    sel.value = currentReciterId;
    
    fetch('https://api.alquran.cloud/v1/surah').then(r=>r.json()).then(d => {
        const surahSel = document.getElementById('surah-select');
        surahSel.innerHTML = '<option value="">اختر السورة...</option>';
        d.data.forEach(s => {
            const opt = document.createElement('option'); opt.value = s.number; opt.text = `${s.number}. ${s.name}`; surahSel.appendChild(opt);
        });
    });

    quranAudio.addEventListener('ended', () => {
        if(currentAyahIndex < currentSurahAyahs.length - 1) playVerse(currentAyahIndex + 1);
        else { isPlaying = false; updatePlayIcon(); }
    });
}

function changeReciter(id) { currentReciterId = id; if(currentSurahAyahs.length) playVerse(currentAyahIndex); }

async function loadSurah(num) {
    if(!num) return;
    const div = document.getElementById('quran-content');
    div.innerHTML = '<div class="flex items-center justify-center h-full text-[#047857]">جاري التحميل...</div>';
    
    try {
        const res = await fetch(`https://api.alquran.cloud/v1/surah/${num}/${currentReciterId}`);
        const data = await res.json();
        currentSurahAyahs = data.data.ayahs;
        currentAyahIndex = 0;
        
        let html = `<div class="max-w-2xl mx-auto text-justify pb-10" style="direction: rtl; font-size: 1.25rem; line-height: 2.2;">`;
        if(num!=1 && num!=9) html += `<div class="text-center mb-4 text-sm text-gray-500">بسم الله الرحمن الرحيم</div>`;
        
        currentSurahAyahs.forEach((a, i) => {
            const txt = a.text.replace('بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ', '').trim();
            html += `<span id="ayah-${i}" class="cursor-pointer hover:text-[#047857] transition-colors" onclick="playVerse(${i})">${txt} <span class="text-[#047857] text-sm">(${a.numberInSurah})</span> </span>`;
        });
        html += `</div>`;
        div.innerHTML = html;
        document.getElementById('audio-player-bar').classList.remove('hidden');
    } catch(e) { div.innerHTML = 'حدث خطأ في التحميل'; }
}

function playVerse(i) {
    if(i < 0 || i >= currentSurahAyahs.length) return;
    currentAyahIndex = i;
    const a = currentSurahAyahs[i];
    const url = a.audio || (a.audioSecondary ? a.audioSecondary[0] : null);
    
    if(url) {
        quranAudio.src = url;
        quranAudio.play().catch(()=>{});
        isPlaying = true;
        updatePlayIcon();
        
        document.querySelectorAll('#quran-content span').forEach(s => s.classList.remove('bg-green-100'));
        const el = document.getElementById(`ayah-${i}`);
        if(el) { el.classList.add('bg-green-100'); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        document.getElementById('player-status').innerText = `الآية ${a.numberInSurah}`;
    }
}

function togglePlay() { if(isPlaying) quranAudio.pause(); else quranAudio.play(); isPlaying = !isPlaying; updatePlayIcon(); }
function updatePlayIcon() { const i = document.querySelector('#play-btn i'); if(i) i.setAttribute('data-lucide', isPlaying ? 'pause' : 'play'); lucide.createIcons(); }
function nextVerse() { playVerse(currentAyahIndex + 1); }
function prevVerse() { playVerse(currentAyahIndex - 1); }
function toggleQuranModal() { const m=document.getElementById('quran-modal'); if(m.classList.contains('hidden')) m.classList.remove('hidden'); else { m.classList.add('hidden'); quranAudio.pause(); } }
function closeQuran() { document.getElementById('quran-modal').classList.add('hidden'); quranAudio.pause(); }

// === MAIN LOGIC (DATE & DATA) ===
function getFormattedDateID(d) { return d.toISOString().split('T')[0]; }
function getReadableDate(d) { return d.toLocaleDateString('ar-EG'); }
function isToday(d) { return getFormattedDateID(d) === getFormattedDateID(new Date()); }
function changeDate(d) { const n = new Date(currentDate); n.setDate(n.getDate()+d); if(n>new Date()) return; currentDate=n; loadUserDataForDate(n); }

function updateDateUI() {
    document.getElementById('current-date-display').innerText = getReadableDate(currentDate);
    const ro = !isToday(currentDate);
    const tasks = document.getElementById('tasks-container');
    const badge = document.querySelector('.read-only-badge');
    const btnNext = document.getElementById('btn-next-day');
    
    if(ro) { 
        tasks.classList.add('opacity-75', 'pointer-events-none'); 
        badge.style.display = 'inline-flex'; 
        if(btnNext) btnNext.disabled = false;
    } else { 
        tasks.classList.remove('opacity-75', 'pointer-events-none'); 
        badge.style.display = 'none'; 
        if(btnNext) btnNext.disabled = true;
    }
}

function loadUserDataForDate(date) {
    if(unsubscribeSnapshot) unsubscribeSnapshot();
    const did = getFormattedDateID(date);
    updateDateUI();
    unsubscribeSnapshot = db.collection('users').doc(currentUser.uid).collection('daily_logs').doc(did).onSnapshot(async doc => {
        if(doc.exists) { lastUserData = doc.data(); renderMainUI(lastUserData); }
        else {
            if(isToday(date)) {
                // Persistent Settings Logic
                const root = await db.collection('users').doc(currentUser.uid).get();
                const settings = root.data()?.habitSettings || DEFAULT_USER_DATA.habitSettings;
                const tmpl = root.data()?.customAdhkarTemplates || [];
                const newData = { ...DEFAULT_USER_DATA, habitSettings: settings, customAdhkar: tmpl.map(t=>({name:t.name, target:t.target, count:0})) };
                db.collection('users').doc(currentUser.uid).collection('daily_logs').doc(did).set(newData);
            } else { lastUserData = DEFAULT_USER_DATA; renderMainUI(DEFAULT_USER_DATA); }
        }
        const name = currentUser.displayName || currentUser.email.split('@')[0];
        document.querySelectorAll('#user-name-display, #welcome-name').forEach(el => el.innerText = name);
        document.getElementById('user-avatar').innerText = name[0].toUpperCase();
    });
}

function renderMainUI(data) {
    const pc = document.getElementById('tasks-container'); pc.innerHTML = '';
    const pMap = { fajr:'الفجر', dhuhr:'الظهر', asr:'العصر', maghrib:'المغرب', isha:'العشاء' };
    
    // Prayers
    let html = `<div class="grid grid-cols-2 gap-3 mb-4">`;
    for(const [k, v] of Object.entries(data.prayers)) {
        html += `<div onclick="toggleTask('prayers','${k}',${!v})" class="bg-white p-3 rounded-xl border flex items-center justify-between cursor-pointer ${v?'border-green-500 bg-green-50':'border-gray-100'}">
            <div><p class="font-bold text-xs ${v?'text-green-700':'text-gray-600'}">${pMap[k]}</p><p id="time-${k}" class="text-[10px] text-gray-400">--:--</p></div>
            ${v ? '<i data-lucide="check-circle" class="w-4 h-4 text-green-600"></i>' : '<i data-lucide="circle" class="w-4 h-4 text-gray-300"></i>'}
        </div>`;
    }
    // Quran
    const q = data.quran || false;
    html += `<div onclick="toggleTask('root','quran',${!q})" class="bg-white p-3 rounded-xl border flex items-center justify-between cursor-pointer ${q?'border-green-500 bg-green-50':'border-gray-100'}">
        <div><p class="font-bold text-xs ${q?'text-green-700':'text-gray-600'}">ورد القرآن</p><span class="text-[9px] text-blue-500" onclick="event.stopPropagation(); toggleQuranModal()">📖 قراءة</span></div>
        ${q ? '<i data-lucide="check-circle" class="w-4 h-4 text-green-600"></i>' : '<i data-lucide="circle" class="w-4 h-4 text-gray-300"></i>'}
    </div>`;
    html += `</div>`;
    
    // Habits
    html += `<h3 class="font-bold text-xs mb-2 text-gray-500">السنن</h3><div class="grid grid-cols-2 gap-3">`;
    const settings = data.habitSettings || DEFAULT_USER_DATA.habitSettings;
    for(const [k, meta] of Object.entries(HABITS_META)) {
        if(settings[k]) {
            const v = data.habits[k] || false;
            html += `<div onclick="toggleTask('habits','${k}',${!v})" class="bg-white p-3 rounded-xl border flex items-center gap-2 cursor-pointer ${v?'border-yellow-400 bg-yellow-50':'border-gray-100'}">
                <i data-lucide="${meta.icon}" class="w-3 h-3 ${v?'text-yellow-600':'text-gray-400'}"></i>
                <span class="text-[10px] font-bold ${v?'text-yellow-700':'text-gray-600'}">${meta.name}</span>
            </div>`;
        }
    }
    html += `</div>`;
    pc.innerHTML = html;
    
    // Adhkar
    const ac = document.getElementById('adhkar-container'); ac.innerHTML = '';
    let totalA = 0;
    (data.customAdhkar || []).forEach((a, i) => {
        totalA += a.count;
        const pct = Math.min((a.count/a.target)*100, 100);
        ac.innerHTML += `<div class="bg-white p-2 rounded-xl border border-gray-100 relative overflow-hidden">
            <div class="flex justify-between items-center mb-1"><span class="text-[10px] font-bold truncate">${a.name}</span><button onclick="removeAdhkar(${i})" class="text-red-300"><i data-lucide="x" class="w-3 h-3"></i></button></div>
            <div class="flex justify-between items-end relative z-10">
                <div class="flex items-center gap-1"><span class="text-lg font-bold text-blue-600">${a.count}</span><button onclick="openManualCountModal(${i})" class="text-gray-300"><i data-lucide="edit-2" class="w-3 h-3"></i></button></div>
                <button onclick="incrementAdhkar(${i})" class="w-7 h-7 bg-blue-600 text-white rounded-lg flex items-center justify-center click-anim"><i data-lucide="plus" class="w-3 h-3"></i></button>
            </div>
            <div class="absolute bottom-0 left-0 h-1 bg-blue-100 w-full"><div style="width:${pct}%" class="h-full bg-blue-500"></div></div>
        </div>`;
    });
    
    updateDashboardStats(data, totalA);
    lucide.createIcons();
    updatePrayerUI();
}

function updateDashboardStats(data, totalA) {
    let tot=0, done=0;
    if(data.prayers) Object.values(data.prayers).forEach(v=>{tot++; if(v) done++});
    if(data.quran) { tot++; done++; }
    if(data.habits) { const s = data.habitSettings || {}; for(const k in s) if(s[k]) { tot++; if(data.habits[k]) done++; } }
    const p = tot?Math.round((done/tot)*100):0;
    
    document.getElementById('chart-percent').innerText = p + '%';
    const bar = document.getElementById('progress-bar-visual');
    if(bar) bar.style.width = p + '%';
    
    let msg = MESSAGES_DB.low;
    if(p >= 80) msg = MESSAGES_DB.high; else if(p >= 50) msg = MESSAGES_DB.medium;
    document.getElementById('feedback-title').innerText = msg.title;
    document.getElementById('feedback-body').innerText = msg.body;
    document.getElementById('feedback-link').href = msg.link;
}

// === Actions ===
function toggleTask(cat, k, v) { 
    if(!isToday(currentDate)) return; 
    const did = getFormattedDateID(currentDate); 
    const up = {}; if(cat==='root') up[k]=v; else up[`${cat}.${k}`]=v; 
    db.collection('users').doc(currentUser.uid).collection('daily_logs').doc(did).update(up); 
}

async function addNewDhikr() { 
    if (!isToday(currentDate)) return; 
    const name = document.getElementById('new-dhikr-name').value; 
    const target = parseInt(document.getElementById('new-dhikr-target').value) || 100; 
    if(!name) return alert("أدخل اسم الذكر"); 
    
    // Save Persistent
    const userRef = db.collection('users').doc(currentUser.uid);
    const userDoc = await userRef.get();
    let templates = userDoc.data()?.customAdhkarTemplates || [];
    templates.push({ name, target });
    await userRef.set({ customAdhkarTemplates: templates }, { merge: true });

    // Update Today
    const did = getFormattedDateID(currentDate); 
    const docRef = userRef.collection('daily_logs').doc(did); 
    const doc = await docRef.get(); 
    let currentList = doc.exists ? (doc.data().customAdhkar || []) : []; 
    currentList.push({ name, count: 0, target }); 
    await docRef.update({ customAdhkar: currentList }); 
    toggleAdhkarModal(); document.getElementById('new-dhikr-name').value = ''; 
}

async function incrementAdhkar(i) { if(!isToday(currentDate)) return; const did = getFormattedDateID(currentDate); const ref = db.collection('users').doc(currentUser.uid).collection('daily_logs').doc(did); const doc = await ref.get(); const list = doc.data().customAdhkar; list[i].count++; ref.update({ customAdhkar: list }); }
async function removeAdhkar(i) { 
    if(!isToday(currentDate)) return; if(!confirm('حذف؟')) return; 
    const root = db.collection('users').doc(currentUser.uid); 
    const rd = await root.get(); 
    const t = rd.data().customAdhkarTemplates || []; 
    if(t[i]) { t.splice(i,1); root.update({customAdhkarTemplates:t}); } 
    const did = getFormattedDateID(currentDate); 
    const ref = root.collection('daily_logs').doc(did); 
    const d = await ref.get(); 
    const list = d.data().customAdhkar; list.splice(i,1); 
    ref.update({ customAdhkar: list }); 
}

function openManualCountModal(i) { currentAdhkarEditIndex=i; document.getElementById('manual-count-modal').classList.remove('hidden'); }
async function saveManualCount() { const val = parseInt(document.getElementById('manual-count-input').value); if(val && currentAdhkarEditIndex!==null) { const did = getFormattedDateID(currentDate); const ref = db.collection('users').doc(currentUser.uid).collection('daily_logs').doc(did); const doc = await ref.get(); const list = doc.data().customAdhkar; list[currentAdhkarEditIndex].count += val; await ref.update({ customAdhkar: list }); } document.getElementById('manual-count-modal').classList.add('hidden'); }

// === Settings Logic ===
function toggleSettingsModal(){ const m=document.getElementById('settings-modal'); if(m.classList.contains('hidden')){ openSettingsModal(); } else { m.classList.add('hidden'); } }
function openSettingsModal() { 
    if (!lastUserData) return; 
    const container = document.getElementById('settings-list'); container.innerHTML = ''; 
    const settings = lastUserData.habitSettings || DEFAULT_USER_DATA.habitSettings; 
    for (const [key, meta] of Object.entries(HABITS_META)) { 
        const isChecked = settings[key] || false; 
        container.innerHTML += `<div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg mb-2"><span class="text-sm font-bold text-gray-700">${meta.name}</span><input type="checkbox" class="setting-toggle accent-[#047857] w-5 h-5" data-key="${key}" ${isChecked ? 'checked' : ''}></div>`; 
    } 
    document.getElementById('settings-modal').classList.remove('hidden'); 
}
async function saveSettings() { 
    if (!isToday(currentDate)) return alert("تعديل اليوم فقط"); 
    const checkboxes = document.querySelectorAll('.setting-toggle'); 
    const newSettings = { ... (lastUserData.habitSettings || {}) }; 
    checkboxes.forEach(cb => { newSettings[cb.dataset.key] = cb.checked; }); 
    
    // Persistent Save
    await db.collection('users').doc(currentUser.uid).set({ habitSettings: newSettings }, { merge: true });
    
    const did = getFormattedDateID(currentDate); 
    db.collection('users').doc(currentUser.uid).collection('daily_logs').doc(did).update({ habitSettings: newSettings })
      .then(() => { document.getElementById('settings-modal').classList.add('hidden'); }); 
}

// === Reports Logic (Text Only) ===
async function generateReport(period) {
    document.querySelectorAll('.report-tab').forEach(t => {
        if(t.dataset.period === period) { t.classList.replace('text-gray-500', 'text-[#047857]'); t.classList.add('bg-white', 'shadow-sm'); }
        else { t.classList.replace('text-[#047857]', 'text-gray-500'); t.classList.remove('bg-white', 'shadow-sm'); }
    });
    
    const title = document.getElementById('rep-title');
    const date = document.getElementById('rep-date');
    const percent = document.getElementById('rep-percent');
    const adhkar = document.getElementById('rep-adhkar');
    const list = document.getElementById('rep-list');
    const summary = document.getElementById('rep-summary');
    
    document.getElementById('rep-user').innerText = currentUser.displayName || "مستخدم";
    list.innerHTML = '<li class="text-center text-gray-400">جاري التحميل...</li>';
    summary.classList.add('hidden');

    if (period === 'day') {
        title.innerText = "تقرير يومي";
        date.innerText = getReadableDate(currentDate);
        if(lastUserData) {
            percent.innerText = document.getElementById('chart-percent').innerText;
            adhkar.innerText = document.getElementById('total-adhkar-count').innerText;
            list.innerHTML = '';
            for(const [k,v] of Object.entries(lastUserData.prayers)) if(v) list.innerHTML += `<li class="text-green-700 flex items-center gap-2"><i data-lucide="check" class="w-3 h-3"></i> صلاة ${k}</li>`;
            if(lastUserData.quran) list.innerHTML += `<li class="text-green-700 flex items-center gap-2"><i data-lucide="check" class="w-3 h-3"></i> ورد القرآن</li>`;
            lucide.createIcons();
        }
    } else {
        const days = period === 'week' ? 7 : 30;
        title.innerText = period === 'week' ? "تقرير أسبوعي" : "تقرير شهري";
        date.innerText = `آخر ${days} يوم`;
        
        const stats = await fetchAggregateData(days);
        percent.innerText = stats.percent + "%";
        adhkar.innerText = stats.totalAdhkar;
        
        summary.innerHTML = `
            <p>🕌 صلوات: <span class="font-bold text-green-600">${stats.prayersDone}</span> / ${stats.totalPrayers}</p>
            <p>📖 قرآن: <span class="font-bold text-yellow-600">${stats.quranDays}</span> أيام</p>
        `;
        summary.classList.remove('hidden');
        list.innerHTML = '';
    }
}

async function fetchAggregateData(days) {
    let totalP = 0; let totalA = 0; let prayersDone = 0; let totalPrayers = 0; let quranDays = 0; let count = 0;
    const d = new Date();
    for(let i=0; i<days; i++) {
        const tempD = new Date(); tempD.setDate(d.getDate() - i);
        const did = getFormattedDateID(tempD);
        const doc = await db.collection('users').doc(currentUser.uid).collection('daily_logs').doc(did).get();
        if(doc.exists) {
            const da = doc.data();
            let done=0, tot=0;
            if(da.prayers) Object.values(da.prayers).forEach(v=>{tot++; totalPrayers++; if(v) {done++; prayersDone++;}});
            if(da.quran || da.habits?.quran) quranDays++;
            if(da.customAdhkar) da.customAdhkar.forEach(a=> totalA += (a.count||0));
            if(tot>0) totalP += Math.round((done/tot)*100);
            count++;
        }
    }
    return { percent: count?Math.round(totalP/count):0, totalAdhkar: totalA, prayersDone, totalPrayers, quranDays };
}

function openReportModal() { document.getElementById('report-modal').classList.remove('hidden'); generateReport('day'); }
function toggleAdhkarModal(){ document.getElementById('adhkar-modal').classList.toggle('hidden'); }

// Boilerplate Helpers
function showScreen(id) { ['landing-screen','auth-screen','app-screen'].forEach(i=>document.getElementById(i).classList.add('hidden')); document.getElementById(id).classList.remove('hidden'); }
function goToAuth(m){ showScreen('auth-screen'); if(m==='login'){ document.getElementById('login-form').classList.remove('hidden'); document.getElementById('register-form').classList.add('hidden'); } else { document.getElementById('login-form').classList.add('hidden'); document.getElementById('register-form').classList.remove('hidden'); } }
function showLandingScreen(){ showScreen('landing-screen'); }
async function handleLogin(e){ e.preventDefault(); auth.signInWithEmailAndPassword(document.getElementById('login-email').value, document.getElementById('login-password').value).catch(e=>alert(e.message)); }
async function handleRegister(e){ e.preventDefault(); const n=document.getElementById('reg-name').value; auth.createUserWithEmailAndPassword(document.getElementById('reg-email').value, document.getElementById('reg-password').value).then(c=>c.user.updateProfile({displayName:n})).catch(e=>alert(e.message)); }
function handleLogout(){ auth.signOut(); showLandingScreen(); }
function downloadAsPDF() { const element = document.getElementById('report-preview-content'); const { jsPDF } = window.jspdf; html2canvas(element, { scale: 2 }).then(canvas => { const imgData = canvas.toDataURL('image/png'); const pdf = new jsPDF('p', 'mm', 'a4'); const w = pdf.internal.pageSize.getWidth(); const h = (canvas.height * w) / canvas.width; pdf.addImage(imgData, 'PNG', 0, 10, w, h); pdf.save('report.pdf'); }); }
function downloadAsImage() { const element = document.getElementById('report-preview-content'); html2canvas(element, { scale: 2 }).then(canvas => { const link = document.createElement('a'); link.download = 'report.png'; link.href = canvas.toDataURL(); link.click(); }); }
function downloadAsExcel() { const ws = XLSX.utils.json_to_sheet([{Date: getReadableDate(currentDate)}]); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Report"); XLSX.writeFile(wb, 'report.xlsx'); }