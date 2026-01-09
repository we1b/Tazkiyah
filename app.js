const USE_REAL_FIREBASE = true;

// ⚠️ استبدل هذا ببيانات مشروعك الحقيقية
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
let performanceChartInstance = null;
let reportChartInstance = null;
let lastUserData = null; 
let currentDate = new Date();

let prayerTimes = null; 
let adhanAudio = new Audio('https://www.islamcan.com/audio/adhan/azan2.mp3'); 
let adhanEnabled = true;
let adhkarEnabled = true;
let currentAdhkarEditIndex = null; 

// === Quran Vars ===
let quranAudio = new Audio();
let currentSurahAyahs = [];
let currentAyahIndex = 0;
let verseRepeatCount = 1;
let currentVerseRepeat = 0;
let isPlaying = false;
let currentReciterId = "ar.yasseraldossari"; // Default Reciter

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
            injectSettingsUI(); 
            injectMobileNav(); 
            initPrayerTimes(); 
            injectQuranModal();
            injectManualCountModal(); 
            injectReportModal(); // Ensure report modal exists
            requestNotificationPermission(); 
        } else {
            currentUser = null;
            showScreen('landing-screen');
        }
        hideLoader();
    });
}

function requestNotificationPermission() {
    if ("Notification" in window && Notification.permission !== "granted") Notification.requestPermission();
}

// === PRAYER TIMES ===
function initPrayerTimes() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            fetchPrayerTimes(pos.coords.latitude, pos.coords.longitude);
        }, () => fetchPrayerTimes(30.0444, 31.2357));
    } else {
        fetchPrayerTimes(30.0444, 31.2357);
    }
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
    if(!prayerTimes) return;
    const now = new Date();
    const currentH = now.getHours();
    const currentM = now.getMinutes();
    
    if(adhanEnabled) {
        ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'].forEach(p => {
            const [h, m] = prayerTimes[p].split(':');
            if (parseInt(h) === currentH && parseInt(m) === currentM) playAdhan(p);
        });
    }
}

function playAdhan(name) {
    adhanAudio.play().catch(()=>{});
    if (Notification.permission === "granted") new Notification(`📢 حان موعد ${name}`);
    alert(`حان موعد صلاة ${name}`);
}

// === QURAN (Improved) ===
function injectQuranModal() {
    if (document.getElementById('quran-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'quran-modal';
    modal.className = 'modal-overlay hidden';
    modal.onclick = (e) => { if(e.target === modal) closeQuran(); };
    
    let options = '';
    for (const [k, v] of Object.entries(RECITERS)) options += `<option value="${k}">${v}</option>`;

    modal.innerHTML = `
        <div class="modal-content h-[90vh] flex flex-col">
            <div class="p-3 border-b bg-gray-50 flex gap-2 items-center justify-between">
                <div class="flex gap-2 items-center flex-1">
                    <select id="surah-select" class="p-2 rounded border text-xs flex-1" onchange="loadSurah(this.value)">
                        <option value="">اختر السورة...</option>
                    </select>
                </div>
                <div class="flex gap-2 items-center">
                    <select id="reciter-select" class="p-2 rounded border text-xs w-24" onchange="currentReciterId=this.value; if(currentSurahAyahs.length) playVerse(currentAyahIndex);">${options}</select>
                    <button onclick="closeQuran()" class="text-gray-500 p-2"><i data-lucide="x" class="w-5 h-5"></i></button>
                </div>
            </div>
            <div id="quran-content" class="flex-1 overflow-y-auto p-4 text-center bg-white text-lg leading-loose font-serif">
                <div class="flex flex-col items-center justify-center h-full text-gray-400"><i data-lucide="book" class="w-12 h-12 mb-2"></i><p>اختر السورة</p></div>
            </div>
            <div id="audio-player-bar" class="p-3 border-t bg-gray-50 flex justify-between items-center hidden">
                <div class="text-[10px] text-gray-500"><span id="player-status">...</span></div>
                <div class="flex gap-4">
                    <button onclick="prevVerse()"><i data-lucide="skip-back" class="w-5 h-5"></i></button>
                    <button onclick="togglePlay()" id="play-btn" class="w-10 h-10 bg-[#047857] text-white rounded-full flex items-center justify-center"><i data-lucide="play" class="w-5 h-5"></i></button>
                    <button onclick="nextVerse()"><i data-lucide="skip-forward" class="w-5 h-5"></i></button>
                </div>
            </div>
        </div>`;
    document.body.appendChild(modal);
    
    // Load Surah List
    fetch('https://api.alquran.cloud/v1/surah').then(r=>r.json()).then(d => {
        const sel = document.getElementById('surah-select');
        d.data.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.number; opt.text = `${s.number}. ${s.name}`;
            sel.appendChild(opt);
        });
    });

    quranAudio.addEventListener('ended', () => {
        if(currentVerseRepeat < verseRepeatCount - 1) {
            currentVerseRepeat++; quranAudio.currentTime = 0; quranAudio.play();
        } else {
            currentVerseRepeat = 0;
            if(currentAyahIndex < currentSurahAyahs.length - 1) playVerse(currentAyahIndex + 1);
            else { isPlaying = false; updatePlayIcon(); }
        }
    });
}

async function loadSurah(num) {
    if(!num) return;
    const div = document.getElementById('quran-content');
    div.innerHTML = '<div class="text-center mt-10">جاري التحميل...</div>';
    
    try {
        const res = await fetch(`https://api.alquran.cloud/v1/surah/${num}/${currentReciterId}`);
        const data = await res.json();
        currentSurahAyahs = data.data.ayahs;
        currentAyahIndex = 0;
        
        let html = `<div class="max-w-2xl mx-auto text-justify" style="direction: rtl;">`;
        if(num!=1 && num!=9) html += `<div class="text-center mb-4 text-sm text-gray-500">بسم الله الرحمن الرحيم</div>`;
        
        currentSurahAyahs.forEach((a, i) => {
            const txt = a.text.replace('بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ', '').trim();
            html += `<span id="ayah-${i}" class="cursor-pointer hover:text-green-600 transition-colors" onclick="playVerse(${i})">${txt} <span class="text-green-600 text-sm">(${a.numberInSurah})</span> </span>`;
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
    
    // Fallback for audio
    const url = a.audio || (a.audioSecondary ? a.audioSecondary[0] : null);
    if(url) {
        quranAudio.src = url;
        quranAudio.play();
        isPlaying = true;
        updatePlayIcon();
        
        // Highlight
        document.querySelectorAll('#quran-content span').forEach(s => s.classList.remove('bg-green-100'));
        const el = document.getElementById(`ayah-${i}`);
        if(el) {
            el.classList.add('bg-green-100');
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        document.getElementById('player-status').innerText = `الآية ${a.numberInSurah}`;
    }
}

function togglePlay() { if(isPlaying) quranAudio.pause(); else quranAudio.play(); isPlaying = !isPlaying; updatePlayIcon(); }
function updatePlayIcon() { 
    const i = document.querySelector('#play-btn i');
    if(i) i.setAttribute('data-lucide', isPlaying ? 'pause' : 'play');
    lucide.createIcons();
}
function nextVerse() { playVerse(currentAyahIndex + 1); }
function prevVerse() { playVerse(currentAyahIndex - 1); }
function closeQuran() { document.getElementById('quran-modal').classList.add('hidden'); quranAudio.pause(); }

// === UI Helpers ===
function injectMobileNav() {
    if (document.getElementById('mobile-bottom-nav')) return;
    const nav = document.createElement('div');
    nav.id = 'mobile-bottom-nav';
    nav.className = 'md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50 flex justify-around items-center h-16';
    nav.innerHTML = `
        <button onclick="showScreen('app-screen')" class="flex flex-col items-center w-full text-[#047857]"><i data-lucide="layout-dashboard" class="w-5 h-5"></i><span class="text-[9px] mt-1">يوميتي</span></button>
        <button onclick="document.getElementById('quran-modal').classList.remove('hidden')" class="flex flex-col items-center w-full text-gray-500 hover:text-[#047857]"><i data-lucide="book-open" class="w-5 h-5"></i><span class="text-[9px] mt-1">المصحف</span></button>
        <button onclick="openReportModal()" class="flex flex-col items-center w-full text-gray-500 hover:text-[#047857]"><i data-lucide="bar-chart-2" class="w-5 h-5"></i><span class="text-[9px] mt-1">تقارير</span></button>
        <button onclick="openSettingsModal()" class="flex flex-col items-center w-full text-gray-500 hover:text-[#047857]"><i data-lucide="settings" class="w-5 h-5"></i><span class="text-[9px] mt-1">إعدادات</span></button>`;
    document.body.appendChild(nav);
    lucide.createIcons();
}

function injectSettingsUI() {
    const sidebar = document.getElementById('sidebar-content');
    if (sidebar && !document.getElementById('btn-settings-pc')) {
        sidebar.innerHTML += `
            <button onclick="openSettingsModal()" id="btn-settings-pc" class="w-full flex items-center gap-4 px-6 py-4 text-gray-600 hover:bg-gray-50 hover:text-[#047857] rounded-l-2xl font-bold transition-all"><i data-lucide="settings"></i> إعدادات العبادات</button>
        `;
        lucide.createIcons();
    }
    
    // Settings Modal
    if (!document.getElementById('settings-modal')) {
        const div = document.createElement('div');
        div.id = 'settings-modal';
        div.className = 'modal-overlay hidden';
        div.onclick = (e) => { if(e.target === div) div.classList.add('hidden'); };
        div.innerHTML = `
            <div class="modal-content">
                <div class="p-4 border-b bg-gray-50 flex justify-between items-center"><h3 class="font-bold">إعدادات العبادات</h3><button onclick="document.getElementById('settings-modal').classList.add('hidden')"><i data-lucide="x" class="w-5 h-5"></i></button></div>
                <div class="p-4 overflow-y-auto max-h-[60vh]" id="settings-list"></div>
                <div class="p-4 border-t"><button onclick="saveSettings()" class="w-full bg-[#047857] text-white py-2 rounded-lg font-bold">حفظ</button></div>
            </div>`;
        document.body.appendChild(div);
    }
}

// === REPORT MODAL & LOGIC ===
function injectReportModal() {
    if (document.getElementById('report-modal')) return;
    const div = document.createElement('div');
    div.id = 'report-modal';
    div.className = 'modal-overlay hidden';
    div.onclick = (e) => { if(e.target === div) div.classList.add('hidden'); };
    
    div.innerHTML = `
        <div class="modal-content max-w-4xl h-[90vh] flex-col md:flex-row">
            <div class="w-full md:w-1/3 bg-gray-50 p-4 border-l overflow-y-auto">
                <h3 class="font-bold mb-4 text-center">التقارير</h3>
                <div class="flex bg-gray-200 p-1 rounded-lg mb-4 text-xs">
                    <button onclick="generateReport('day')" class="flex-1 py-1.5 rounded bg-white shadow-sm font-bold text-[#047857]">يومي</button>
                    <button onclick="generateReport('week')" class="flex-1 py-1.5 rounded text-gray-600">أسبوعي</button>
                    <button onclick="generateReport('month')" class="flex-1 py-1.5 rounded text-gray-600">شهري</button>
                </div>
                <div class="space-y-2">
                    <button onclick="downloadAsPDF()" class="w-full py-2 border rounded-lg text-xs flex items-center justify-center gap-2 hover:bg-white"><i data-lucide="file-text" class="w-3 h-3"></i> PDF</button>
                    <button onclick="downloadAsImage()" class="w-full py-2 border rounded-lg text-xs flex items-center justify-center gap-2 hover:bg-white"><i data-lucide="image" class="w-3 h-3"></i> صورة</button>
                </div>
            </div>
            <div class="w-full md:w-2/3 p-4 overflow-y-auto bg-gray-100 flex justify-center">
                <div id="report-preview-content" class="bg-white p-6 shadow-lg w-full max-w-md relative min-h-[500px]">
                    <div class="text-center border-b pb-4 mb-4">
                        <h2 class="text-xl font-bold text-[#047857]" id="rep-title">تقرير إنجاز</h2>
                        <p class="text-xs text-gray-500" id="rep-date">...</p>
                    </div>
                    <div class="flex justify-around mb-6 text-center">
                        <div><p class="text-xs text-gray-400">إنجاز</p><p class="text-2xl font-bold text-[#047857]" id="rep-percent">0%</p></div>
                        <div><p class="text-xs text-gray-400">أذكار</p><p class="text-2xl font-bold text-blue-600" id="rep-adhkar">0</p></div>
                    </div>
                    <div class="h-40 mb-4" id="rep-chart-container"><canvas id="reportChart"></canvas></div>
                    <ul class="text-xs space-y-2" id="rep-list"></ul>
                </div>
            </div>
        </div>`;
    document.body.appendChild(div);
    lucide.createIcons();
}

function openReportModal() {
    document.getElementById('report-modal').classList.remove('hidden');
    generateReport('day');
}

async function generateReport(period) {
    const title = document.getElementById('rep-title');
    const date = document.getElementById('rep-date');
    const percent = document.getElementById('rep-percent');
    const list = document.getElementById('rep-list');
    
    // Reset Chart
    if (reportChartInstance) { reportChartInstance.destroy(); reportChartInstance = null; }
    
    if (period === 'day') {
        title.innerText = "تقرير يومي";
        date.innerText = getReadableDate(currentDate);
        if(lastUserData) {
            percent.innerText = document.getElementById('chart-percent').innerText;
            document.getElementById('rep-adhkar').innerText = document.getElementById('total-adhkar-count').innerText;
            
            // List
            list.innerHTML = '';
            for(const [k,v] of Object.entries(lastUserData.prayers)) if(v) list.innerHTML += `<li class="text-green-700">✅ صلاة ${k}</li>`;
            
            // Chart (Doughnut)
            const p = parseInt(percent.innerText);
            const ctx = document.getElementById('reportChart');
            reportChartInstance = new Chart(ctx, {
                type: 'doughnut',
                data: { labels: ['تم', 'باقي'], datasets: [{ data: [p, 100-p], backgroundColor: ['#047857', '#eee'] }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
            });
        }
    } else {
        // Weekly/Monthly Logic
        const days = period === 'week' ? 7 : 30;
        title.innerText = period === 'week' ? "تقرير أسبوعي" : "تقرير شهري";
        date.innerText = `آخر ${days} يوم`;
        
        const stats = await fetchAggregateData(days);
        percent.innerText = stats.percent + "%";
        document.getElementById('rep-adhkar').innerText = stats.totalAdhkar;
        list.innerHTML = `<li class="text-gray-600">متوسط الأداء: ${stats.percent}%</li><li class="text-gray-600">إجمالي الأذكار: ${stats.totalAdhkar}</li>`;
        
        // Chart (Bar)
        const ctx = document.getElementById('reportChart');
        reportChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: stats.history.map(h => h.label),
                datasets: [{ label: 'إنجاز', data: stats.history.map(h => h.val), backgroundColor: '#047857' }]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } } }
        });
    }
}

async function fetchAggregateData(days) {
    let totalP = 0; let totalA = 0; let count = 0; const hist = [];
    const d = new Date();
    
    for(let i=days-1; i>=0; i--) {
        const tempD = new Date(); tempD.setDate(d.getDate() - i);
        const did = getFormattedDateID(tempD);
        const doc = await db.collection('users').doc(currentUser.uid).collection('daily_logs').doc(did).get();
        let val = 0;
        if(doc.exists) {
            const da = doc.data();
            // Calculate simple %
            let done=0, tot=0;
            if(da.prayers) Object.values(da.prayers).forEach(v=>{tot++; if(v) done++});
            if(da.customAdhkar) da.customAdhkar.forEach(a=> totalA += (a.count||0));
            val = tot>0 ? Math.round((done/tot)*100) : 0;
            totalP += val; count++;
        }
        hist.push({ label: tempD.getDate(), val });
    }
    return { percent: count?Math.round(totalP/count):0, totalAdhkar: totalA, history: hist };
}

// === MAIN LOGIC ===
function getFormattedDateID(d) { return d.toISOString().split('T')[0]; }
function getReadableDate(d) { return d.toLocaleDateString('ar-EG'); }
function isToday(d) { return getFormattedDateID(d) === getFormattedDateID(new Date()); }

function loadUserDataForDate(date) {
    const did = getFormattedDateID(date);
    document.getElementById('current-date-display').innerText = getReadableDate(date);
    if(unsubscribeSnapshot) unsubscribeSnapshot();
    
    unsubscribeSnapshot = db.collection('users').doc(currentUser.uid).collection('daily_logs').doc(did).onSnapshot(async doc => {
        if(doc.exists) {
            lastUserData = doc.data();
            renderMainUI(lastUserData);
        } else {
            if(isToday(date)) {
                // Load settings from root
                const root = await db.collection('users').doc(currentUser.uid).get();
                const settings = root.data()?.habitSettings || DEFAULT_USER_DATA.habitSettings;
                const templates = root.data()?.customAdhkarTemplates || [];
                const newData = { ...DEFAULT_USER_DATA, habitSettings: settings, customAdhkar: templates.map(t=>({name:t.name, target:t.target, count:0})) };
                db.collection('users').doc(currentUser.uid).collection('daily_logs').doc(did).set(newData);
            } else {
                lastUserData = DEFAULT_USER_DATA;
                renderMainUI(DEFAULT_USER_DATA);
            }
        }
    });
}

function renderMainUI(data) {
    // 1. Prayers
    const pc = document.getElementById('tasks-container'); pc.innerHTML = '';
    const pMap = { fajr:'الفجر', dhuhr:'الظهر', asr:'العصر', maghrib:'المغرب', isha:'العشاء' };
    
    let html = `<div class="grid grid-cols-2 gap-3 mb-6">`;
    for(const [k, v] of Object.entries(data.prayers)) {
        html += `<div onclick="toggleTask('prayers','${k}',${!v})" class="bg-white p-3 rounded-xl border flex items-center justify-between cursor-pointer ${v?'border-green-500 bg-green-50':'border-gray-100'}">
            <div><p class="font-bold text-sm ${v?'text-green-700':'text-gray-600'}">${pMap[k]}</p><p id="time-${k}" class="text-[10px] text-gray-400">--:--</p></div>
            ${v ? '<i data-lucide="check-circle" class="w-5 h-5 text-green-600"></i>' : '<i data-lucide="circle" class="w-5 h-5 text-gray-300"></i>'}
        </div>`;
    }
    // Quran
    const q = data.quran || false;
    html += `<div onclick="toggleTask('root','quran',${!q})" class="bg-white p-3 rounded-xl border flex items-center justify-between cursor-pointer ${q?'border-green-500 bg-green-50':'border-gray-100'}">
        <div><p class="font-bold text-sm ${q?'text-green-700':'text-gray-600'}">ورد القرآن</p><span class="text-[10px] text-blue-500" onclick="event.stopPropagation(); openQuran()">📖 قراءة</span></div>
        ${q ? '<i data-lucide="check-circle" class="w-5 h-5 text-green-600"></i>' : '<i data-lucide="circle" class="w-5 h-5 text-gray-300"></i>'}
    </div>`;
    html += `</div>`;
    
    // Habits
    html += `<h3 class="font-bold text-sm mb-3">السنن</h3><div class="grid grid-cols-2 gap-3">`;
    const settings = data.habitSettings || DEFAULT_USER_DATA.habitSettings;
    for(const [k, meta] of Object.entries(HABITS_META)) {
        if(settings[k]) {
            const v = data.habits[k] || false;
            html += `<div onclick="toggleTask('habits','${k}',${!v})" class="bg-white p-3 rounded-xl border flex items-center gap-2 cursor-pointer ${v?'border-yellow-400 bg-yellow-50':'border-gray-100'}">
                <i data-lucide="${meta.icon}" class="w-4 h-4 ${v?'text-yellow-600':'text-gray-400'}"></i>
                <span class="text-xs font-bold ${v?'text-yellow-700':'text-gray-600'}">${meta.name}</span>
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
        ac.innerHTML += `<div class="bg-white p-3 rounded-xl border border-gray-100 relative overflow-hidden">
            <div class="flex justify-between items-center mb-2"><span class="text-xs font-bold truncate">${a.name}</span><button onclick="removeAdhkar(${i})" class="text-red-300"><i data-lucide="x" class="w-3 h-3"></i></button></div>
            <div class="flex justify-between items-end relative z-10">
                <div class="flex items-center gap-1"><span class="text-xl font-bold text-blue-600">${a.count}</span><button onclick="openManualCountModal(${i})" class="text-gray-300"><i data-lucide="edit-2" class="w-3 h-3"></i></button></div>
                <button onclick="incrementAdhkar(${i})" class="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center click-anim"><i data-lucide="plus" class="w-4 h-4"></i></button>
            </div>
            <div class="absolute bottom-0 left-0 h-1 bg-blue-100 w-full"><div style="width:${pct}%" class="h-full bg-blue-500"></div></div>
        </div>`;
    });
    document.getElementById('total-adhkar-count').innerText = totalA;
    
    // Stats & Chart
    updateDashboardStats(data);
    lucide.createIcons();
    updatePrayerUI();
}

function updateDashboardStats(data) {
    let tot=0, done=0;
    if(data.prayers) Object.values(data.prayers).forEach(v=>{tot++; if(v) done++});
    if(data.quran) { tot++; done++; }
    if(data.habits) {
        const s = data.habitSettings || {};
        for(const k in s) if(s[k]) { tot++; if(data.habits[k]) done++; }
    }
    const p = tot?Math.round((done/tot)*100):0;
    document.getElementById('chart-percent').innerText = p + '%';
    
    if(performanceChartInstance) performanceChartInstance.destroy();
    const ctx = document.getElementById('performanceChart');
    if(ctx) {
        performanceChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: { datasets: [{ data: [p, 100-p], backgroundColor: ['#047857', '#eee'], borderWidth: 0 }] },
            options: { cutout: '75%', responsive: true, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
        });
    }
}

// === Actions ===
function toggleTask(cat, k, v) {
    if(!isToday(currentDate)) return;
    const did = getFormattedDateID(currentDate);
    const up = {}; 
    if(cat==='root') up[k]=v; else up[`${cat}.${k}`]=v;
    db.collection('users').doc(currentUser.uid).collection('daily_logs').doc(did).update(up);
}
async function incrementAdhkar(i) {
    if(!isToday(currentDate)) return;
    const did = getFormattedDateID(currentDate);
    const ref = db.collection('users').doc(currentUser.uid).collection('daily_logs').doc(did);
    const doc = await ref.get();
    const list = doc.data().customAdhkar; list[i].count++;
    ref.update({ customAdhkar: list });
}
async function removeAdhkar(i) {
    if(!isToday(currentDate)) return;
    if(!confirm('حذف؟')) return;
    // Remove from root template too
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
async function saveManualCount() {
    const val = parseInt(document.getElementById('manual-count-input').value);
    if(val && currentAdhkarEditIndex!==null) {
        const did = getFormattedDateID(currentDate);
        const ref = db.collection('users').doc(currentUser.uid).collection('daily_logs').doc(did);
        const doc = await ref.get();
        const list = doc.data().customAdhkar;
        list[currentAdhkarEditIndex].count += val;
        await ref.update({ customAdhkar: list });
    }
    document.getElementById('manual-count-modal').classList.add('hidden');
}
function hideLoader() { const l=document.getElementById('loader'); if(l) l.style.display='none'; }
function showScreen(id) { ['landing-screen','auth-screen','app-screen'].forEach(i=>document.getElementById(i).classList.add('hidden')); document.getElementById(id).classList.remove('hidden'); }
function goToAuth(m){ showScreen('auth-screen'); if(m==='login'){ document.getElementById('login-form').classList.remove('hidden'); document.getElementById('register-form').classList.add('hidden'); } else { document.getElementById('login-form').classList.add('hidden'); document.getElementById('register-form').classList.remove('hidden'); } }
function showLandingScreen(){ showScreen('landing-screen'); }
async function handleLogin(e){ e.preventDefault(); auth.signInWithEmailAndPassword(document.getElementById('login-email').value, document.getElementById('login-password').value).catch(e=>alert(e.message)); }
async function handleRegister(e){ e.preventDefault(); const n=document.getElementById('reg-name').value; auth.createUserWithEmailAndPassword(document.getElementById('reg-email').value, document.getElementById('reg-password').value).then(c=>c.user.updateProfile({displayName:n})).catch(e=>alert(e.message)); }
function handleLogout(){ auth.signOut(); showLandingScreen(); }
function changeDate(d) { const n = new Date(currentDate); n.setDate(n.getDate()+d); if(n>new Date()) return; currentDate=n; loadUserDataForDate(n); }
function toggleAdhkarModal(){ const m=document.getElementById('adhkar-modal'); m.classList.toggle('hidden'); }
function closeSettingsModal() { 
    document.getElementById('settings-modal').classList.add('hidden');
    // Refresh main UI to show changes immediately
    if(lastUserData) renderMainUI(lastUserData); 
}
function openSettingsModal() { 
    if(!lastUserData) return; 
    const c = document.getElementById('settings-list'); c.innerHTML=''; 
    const s = lastUserData.habitSettings || {};
    for(const [k,m] of Object.entries(HABITS_META)) {
        c.innerHTML += `<div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg mb-2"><span class="text-sm font-bold">${m.name}</span><input type="checkbox" class="setting-toggle" data-key="${k}" ${s[k]?'checked':''}></div>`;
    }
    document.getElementById('settings-modal').classList.remove('hidden'); 
}