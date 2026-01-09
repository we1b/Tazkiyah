// === إعدادات فايربيس ===
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
let adhanSettings = { enabled: true, method: 5 }; // 5: الهيئة المصرية (الافتراضي)
let currentAdhkarEditIndex = null; 
let openModalsStack = []; // لإدارة زر الرجوع في الموبايل

// === متغيرات القرآن الكريم ===
let quranAudio = new Audio();
let currentSurahAyahs = [];
let currentAyahIndex = 0;
let verseRepeatCount = 1;
let currentVerseRepeat = 0;
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
    rawatib: { name: 'السنن (12 ركعة)', icon: 'layers' },
    duha: { name: 'صلاة الضحى', icon: 'sun' },
    witr: { name: 'صلاة الوتر', icon: 'moon' },
    qiyam: { name: 'قيام الليل', icon: 'star' }, // تمت الإضافة
    azkar_m: { name: 'أذكار الصباح', icon: 'sunrise' },
    azkar_e: { name: 'أذكار المساء', icon: 'sunset' },
    azkar_s: { name: 'أذكار النوم', icon: 'bed' }, // أيقونة السرير أو النجمة
    fasting_mon: { name: 'صيام الاثنين', icon: 'calendar' },
    fasting_thu: { name: 'صيام الخميس', icon: 'calendar' }
};

const DEFAULT_USER_DATA = {
    prayers: { fajr: false, dhuhr: false, asr: false, maghrib: false, isha: false },
    quran: false,
    habits: { rawatib: false, duha: false, witr: false, qiyam: false, azkar_m: false, azkar_e: false, azkar_s: false },
    habitSettings: { rawatib: true, duha: true, witr: true, qiyam: true, azkar_m: true, azkar_e: true, azkar_s: true },
    customAdhkar: [] 
};

// === بدء التشغيل ===
document.addEventListener('DOMContentLoaded', () => {
    if (typeof lucide !== 'undefined') lucide.createIcons();
    initApp();
    handleBrowserHistory(); // تفعيل زر الرجوع للمودال
});

function initApp() {
    if (typeof firebase === 'undefined') return;
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    
    // تفعيل Offline Persistence (للسرعة)
    if(firebase.firestore) {
        db = firebase.firestore();
        db.enablePersistence({ synchronizeTabs: true }).catch(err => console.log("Persistence disabled:", err.code));
    }
    
    auth = firebase.auth();

    auth.onAuthStateChanged(async user => {
        if (user) {
            currentUser = user;
            showScreen('app-screen');
            currentDate = new Date();
            
            // تحميل إعدادات الأذان المحفوظة
            await loadAdhanSettings();
            
            loadUserDataForDate(currentDate);
            injectSettingsUI(); 
            injectMobileNav(); 
            initPrayerTimes(); 
            injectQuranModal();
            injectReportModal(); 
            requestNotificationPermission(); 
            
            // بيانات الهيدر
            document.getElementById('user-name-display').innerText = user.displayName || user.email;
            document.getElementById('user-avatar').innerText = (user.displayName || user.email)[0].toUpperCase();
            document.getElementById('welcome-name').innerText = (user.displayName || user.email).split(' ')[0];

        } else {
            currentUser = null;
            showScreen('landing-screen');
        }
        hideLoader();
    });
}

// === تحسين تجربة الهاتف (زر الرجوع) ===
function handleBrowserHistory() {
    window.onpopstate = (event) => {
        if (openModalsStack.length > 0) {
            const modalId = openModalsStack.pop();
            document.getElementById(modalId).classList.add('hidden');
            // منع الرجوع الفعلي للصفحة السابقة إذا كنا فقط نغلق المودال
            // history.pushState(null, null, window.location.href); 
        }
    };
}

function openModal(modalId) {
    const el = document.getElementById(modalId);
    if(el) {
        el.classList.remove('hidden');
        openModalsStack.push(modalId);
        history.pushState({modal: modalId}, null, "");
    }
}

function closeModal(modalId) {
    const el = document.getElementById(modalId);
    if(el) {
        el.classList.add('hidden');
        // إذا كان هذا المودال هو آخر واحد في الستاك، نزيله
        if (openModalsStack.length > 0 && openModalsStack[openModalsStack.length - 1] === modalId) {
            openModalsStack.pop();
            history.back(); // لمحاكاة الرجوع في المتصفح
        }
    }
}

// === إعدادات الأذان والموقع (منفصلة) ===
function openPrayerSettingsModal() {
    // تعيين القيم الحالية
    document.getElementById('toggle-adhan-sound').checked = adhanSettings.enabled;
    document.getElementById('calculation-method').value = adhanSettings.method;
    openModal('prayer-settings-modal');
}

async function loadAdhanSettings() {
    if(!currentUser) return;
    try {
        const doc = await db.collection('users').doc(currentUser.uid).get();
        if(doc.exists && doc.data().adhanSettings) {
            adhanSettings = doc.data().adhanSettings;
        }
    } catch(e) { console.error("Error loading settings", e); }
}

async function saveAdhanSettings() {
    const enabled = document.getElementById('toggle-adhan-sound').checked;
    const method = parseInt(document.getElementById('calculation-method').value);
    
    adhanSettings = { enabled, method };
    
    if(currentUser) {
        await db.collection('users').doc(currentUser.uid).set({ adhanSettings }, { merge: true });
    }
    
    // إعادة جلب المواقيت بالطريقة الجديدة
    initPrayerTimes();
}

// === مواقيت الصلاة (محدثة لتأخذ الطريقة) ===
function initPrayerTimes() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            fetchPrayerTimes(pos.coords.latitude, pos.coords.longitude);
        }, () => fetchPrayerTimes(30.0444, 31.2357)); // القاهرة افتراضياً
    } else {
        fetchPrayerTimes(30.0444, 31.2357);
    }
    setInterval(checkTimeForAlerts, 60000);
}

async function fetchPrayerTimes(lat, lng) {
    const date = new Date();
    // استخدام طريقة الحساب المختارة من الإعدادات
    const method = adhanSettings.method || 5; 
    const url = `https://api.aladhan.com/v1/timings/${date.getDate()}-${date.getMonth()+1}-${date.getFullYear()}?latitude=${lat}&longitude=${lng}&method=${method}`;
    
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
    const arNames = { fajr: 'الفجر', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };
    
    // Timeline Container
    const tl = document.getElementById('prayer-timeline');
    if(tl) tl.innerHTML = '';
    
    let nextPrayer = null;
    let minDiff = Infinity;
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    for (const [key, apiName] of Object.entries(mapping)) {
        const time = prayerTimes[apiName];
        if(!time) continue;
        const [h, m] = time.split(':');
        let hours = parseInt(h);
        const ampm = hours >= 12 ? 'م' : 'ص';
        const displayH = hours % 12 || 12; 
        
        // تحديث الوقت في الكروت
        const el = document.getElementById(`time-${key}`);
        if(el) el.innerText = `${displayH}:${m} ${ampm}`;

        // Timeline
        if(tl) tl.innerHTML += `<div><span>${arNames[key]}</span><br>${displayH}:${m}</div>`;

        // حساب الصلاة القادمة
        const prayerMinutes = parseInt(h) * 60 + parseInt(m);
        let diff = prayerMinutes - currentMinutes;
        if (diff < 0) diff += 24 * 60; // للصلاة القادمة غداً
        
        if (diff < minDiff) {
            minDiff = diff;
            nextPrayer = { name: arNames[key], time: `${displayH}:${m} ${ampm}` };
        }
    }

    if(nextPrayer) {
        document.getElementById('next-prayer-name').innerText = nextPrayer.name;
        document.getElementById('next-prayer-time').innerText = nextPrayer.time;
    }
}

function checkTimeForAlerts() {
    if(!prayerTimes || !adhanSettings.enabled) return;
    const now = new Date();
    const currentH = now.getHours();
    const currentM = now.getMinutes();
    
    ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'].forEach(p => {
        const [h, m] = prayerTimes[p].split(':');
        if (parseInt(h) === currentH && parseInt(m) === currentM) playAdhan(p);
    });
}

function playAdhan(name) {
    adhanAudio.play().catch(()=>{});
    if (Notification.permission === "granted") new Notification(`📢 حان موعد ${name}`);
}

// === القرآن الكريم ===
function injectQuranModal() {
    if (document.getElementById('quran-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'quran-modal';
    modal.className = 'modal-overlay hidden';
    // modal.onclick handled by handleBrowserHistory logic mostly, but explicit click too:
    modal.onclick = (e) => { if(e.target === modal) closeModal('quran-modal'); };
    
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
                    <button onclick="closeModal('quran-modal')" class="text-gray-500 p-2"><i data-lucide="x" class="w-5 h-5"></i></button>
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
    
    // تحميل السور
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

// ... (نفس دوال القرآن: loadSurah, playVerse, togglePlay, etc. كما هي في الكود السابق)
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
    const url = a.audio || (a.audioSecondary ? a.audioSecondary[0] : null);
    if(url) {
        quranAudio.src = url;
        quranAudio.play();
        isPlaying = true;
        updatePlayIcon();
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
function updatePlayIcon() { const i = document.querySelector('#play-btn i'); if(i) i.setAttribute('data-lucide', isPlaying ? 'pause' : 'play'); lucide.createIcons(); }
function nextVerse() { playVerse(currentAyahIndex + 1); }
function prevVerse() { playVerse(currentAyahIndex - 1); }

// === واجهة المستخدم ===
function injectMobileNav() {
    if (document.getElementById('mobile-bottom-nav')) return;
    const nav = document.createElement('div');
    nav.id = 'mobile-bottom-nav';
    nav.className = 'md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50 flex justify-around items-center h-16';
    nav.innerHTML = `
        <button onclick="showScreen('app-screen')" class="flex flex-col items-center w-full text-[#047857]"><i data-lucide="layout-dashboard" class="w-5 h-5"></i><span class="text-[9px] mt-1">يوميتي</span></button>
        <button onclick="openModal('quran-modal')" class="flex flex-col items-center w-full text-gray-500 hover:text-[#047857]"><i data-lucide="book-open" class="w-5 h-5"></i><span class="text-[9px] mt-1">المصحف</span></button>
        <button onclick="openReportModal()" class="flex flex-col items-center w-full text-gray-500 hover:text-[#047857]"><i data-lucide="bar-chart-2" class="w-5 h-5"></i><span class="text-[9px] mt-1">تقارير</span></button>
        <button onclick="openSettingsModal()" class="flex flex-col items-center w-full text-gray-500 hover:text-[#047857]"><i data-lucide="sliders" class="w-5 h-5"></i><span class="text-[9px] mt-1">تخصيص</span></button>`;
    document.body.appendChild(nav);
    lucide.createIcons();
}

function injectSettingsUI() {
    const sidebar = document.getElementById('sidebar-content');
    if (sidebar && !document.getElementById('btn-settings-pc')) {
        sidebar.innerHTML += `
            <button onclick="openSettingsModal()" id="btn-settings-pc" class="w-full flex items-center gap-4 px-6 py-4 text-gray-600 hover:bg-gray-50 hover:text-[#047857] rounded-l-2xl font-bold transition-all"><i data-lucide="sliders"></i> تخصيص العبادات</button>
        `;
        lucide.createIcons();
    }
    
    if (!document.getElementById('settings-modal')) {
        const div = document.createElement('div');
        div.id = 'settings-modal';
        div.className = 'modal-overlay hidden';
        div.onclick = (e) => { if(e.target === div) closeModal('settings-modal'); };
        div.innerHTML = `
            <div class="modal-content">
                <div class="p-4 border-b bg-gray-50 flex justify-between items-center"><h3 class="font-bold">تخصيص العبادات</h3><button onclick="closeModal('settings-modal')"><i data-lucide="x" class="w-5 h-5"></i></button></div>
                <div class="p-4 overflow-y-auto max-h-[60vh]" id="settings-list"></div>
                <div class="p-4 border-t"><button onclick="saveSettings()" class="w-full bg-[#047857] text-white py-2 rounded-lg font-bold">حفظ التغييرات</button></div>
            </div>`;
        document.body.appendChild(div);
    }
}

// === التقارير (محسنة - Real Data) ===
function injectReportModal() {
    if (document.getElementById('report-modal')) return;
    const div = document.createElement('div');
    div.id = 'report-modal';
    div.className = 'modal-overlay hidden';
    div.onclick = (e) => { if(e.target === div) closeModal('report-modal'); };
    
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
                    <button onclick="downloadAsPDF()" class="w-full py-2 border rounded-lg text-xs flex items-center justify-center gap-2 hover:bg-white"><i data-lucide="file-text" class="w-3 h-3"></i> تحميل PDF</button>
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
    openModal('report-modal');
    generateReport('day');
}

async function generateReport(period) {
    const title = document.getElementById('rep-title');
    const date = document.getElementById('rep-date');
    const percent = document.getElementById('rep-percent');
    const list = document.getElementById('rep-list');
    
    if (reportChartInstance) { reportChartInstance.destroy(); reportChartInstance = null; }
    
    if (period === 'day') {
        title.innerText = "تقرير يومي";
        date.innerText = getReadableDate(currentDate);
        if(lastUserData) {
            percent.innerText = document.getElementById('chart-percent').innerText;
            const adhkCount = document.getElementById('total-adhkar-count')?.innerText || '0';
            document.getElementById('rep-adhkar').innerText = adhkCount;
            
            list.innerHTML = '';
            for(const [k,v] of Object.entries(lastUserData.prayers)) if(v) list.innerHTML += `<li class="text-green-700">✅ صلاة ${k}</li>`;
            
            const p = parseInt(percent.innerText);
            const ctx = document.getElementById('reportChart');
            reportChartInstance = new Chart(ctx, {
                type: 'doughnut',
                data: { labels: ['تم', 'باقي'], datasets: [{ data: [p, 100-p], backgroundColor: ['#047857', '#eee'] }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
            });
        }
    } else {
        const days = period === 'week' ? 7 : 30;
        title.innerText = period === 'week' ? "تقرير أسبوعي" : "تقرير شهري";
        date.innerText = `آخر ${days} يوم`;
        
        // إظهار تحميل بسيط
        list.innerHTML = '<li class="text-gray-500 text-center">جاري جلب البيانات...</li>';
        
        const stats = await fetchAggregateData(days);
        percent.innerText = stats.percent + "%";
        document.getElementById('rep-adhkar').innerText = stats.totalAdhkar;
        list.innerHTML = `<li class="text-gray-600">متوسط الأداء: ${stats.percent}%</li><li class="text-gray-600">إجمالي الأذكار: ${stats.totalAdhkar}</li>`;
        
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
    
    // استخدام Promise.all لجلب البيانات بالتوازي لزيادة السرعة
    const promises = [];
    const dateLabels = [];

    for(let i=days-1; i>=0; i--) {
        const tempD = new Date(); tempD.setDate(d.getDate() - i);
        const did = getFormattedDateID(tempD);
        dateLabels.push(tempD.getDate());
        promises.push(db.collection('users').doc(currentUser.uid).collection('daily_logs').doc(did).get());
    }

    const docs = await Promise.all(promises);

    docs.forEach((doc, index) => {
        let val = 0;
        if(doc.exists) {
            const da = doc.data();
            let done=0, tot=0;
            if(da.prayers) Object.values(da.prayers).forEach(v=>{tot++; if(v) done++});
            if(da.customAdhkar) da.customAdhkar.forEach(a=> totalA += (a.count||0));
            val = tot>0 ? Math.round((done/tot)*100) : 0;
            totalP += val; 
            count++;
        }
        hist.push({ label: dateLabels[index], val });
    });

    return { percent: count ? Math.round(totalP/count) : 0, totalAdhkar: totalA, history: hist };
}

function downloadAsPDF() {
    const { jsPDF } = window.jspdf;
    const content = document.getElementById('report-preview-content');
    html2canvas(content).then(canvas => {
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const width = pdf.internal.pageSize.getWidth();
        const height = (canvas.height * width) / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 10, width, height);
        pdf.save("report.pdf");
    });
}

// === المنطق الرئيسي ===
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
                // تحميل الإعدادات من الملف الرئيسي (لضمان الثبات)
                const root = await db.collection('users').doc(currentUser.uid).get();
                // استخدم الإعدادات المحفوظة أو الافتراضية
                const settings = root.data()?.habitSettings || DEFAULT_USER_DATA.habitSettings;
                const templates = root.data()?.customAdhkarTemplates || [];
                
                const newData = { ...DEFAULT_USER_DATA, habitSettings: settings, customAdhkar: templates.map(t=>({name:t.name, target:t.target, count:0})) };
                
                // إنشاء سجل جديد لليوم
                db.collection('users').doc(currentUser.uid).collection('daily_logs').doc(did).set(newData);
            } else {
                lastUserData = DEFAULT_USER_DATA;
                renderMainUI(DEFAULT_USER_DATA);
            }
        }
    });
}

function renderMainUI(data) {
    // 1. الصلوات
    const pc = document.getElementById('tasks-container'); pc.innerHTML = '';
    const pMap = { fajr:'الفجر', dhuhr:'الظهر', asr:'العصر', maghrib:'المغرب', isha:'العشاء' };
    
    let html = `<div class="grid grid-cols-2 gap-3 mb-6">`;
    for(const [k, v] of Object.entries(data.prayers)) {
        html += `<div onclick="toggleTask('prayers','${k}',${!v})" class="bg-white p-3 rounded-xl border flex items-center justify-between cursor-pointer ${v?'border-green-500 bg-green-50':'border-gray-100'}">
            <div><p class="font-bold text-sm ${v?'text-green-700':'text-gray-600'}">${pMap[k]} <span class="text-[10px] text-gray-400 bg-gray-100 px-1 rounded">فرض</span></p><p id="time-${k}" class="text-[10px] text-gray-400">--:--</p></div>
            ${v ? '<i data-lucide="check-circle" class="w-5 h-5 text-green-600"></i>' : '<i data-lucide="circle" class="w-5 h-5 text-gray-300"></i>'}
        </div>`;
    }
    // قرآن
    const q = data.quran || false;
    html += `<div onclick="toggleTask('root','quran',${!q})" class="bg-white p-3 rounded-xl border flex items-center justify-between cursor-pointer ${q?'border-green-500 bg-green-50':'border-gray-100'}">
        <div><p class="font-bold text-sm ${q?'text-green-700':'text-gray-600'}">ورد القرآن <span class="text-[10px] text-gray-400 bg-gray-100 px-1 rounded">أساسي</span></p><span class="text-[10px] text-blue-500" onclick="event.stopPropagation(); openModal('quran-modal')">📖 قراءة</span></div>
        ${q ? '<i data-lucide="check-circle" class="w-5 h-5 text-green-600"></i>' : '<i data-lucide="circle" class="w-5 h-5 text-gray-300"></i>'}
    </div>`;
    html += `</div>`;
    
    // السنن (حسب الإعدادات)
    html += `<h3 class="font-bold text-sm mb-3">السنن والعادات</h3><div class="grid grid-cols-2 gap-3">`;
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
    
    // الأذكار
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
    
    // تخزين المجموع في عنصر مخفي لاستخدامه في التقارير
    const totalEl = document.getElementById('total-adhkar-count');
    if(!totalEl) { const s = document.createElement('span'); s.id='total-adhkar-count'; s.style.display='none'; document.body.appendChild(s); s.innerText=totalA; }
    else totalEl.innerText = totalA;
    
    updateDashboardStats(data);
    lucide.createIcons();
    updatePrayerUI();
}