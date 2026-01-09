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
let performanceChartInstance = null; // للرسم البياني الرئيسي
let reportChartInstance = null;      // لرسم التقرير (أسبوعي/شهري)
let lastUserData = null; 
let currentDate = new Date();

// === متغيرات جديدة ===
let prayerTimes = null; 
let nextPrayer = null;  
let adhanAudio = new Audio('https://www.islamcan.com/audio/adhan/azan2.mp3'); 
let adhanEnabled = true;
let adhkarEnabled = true;
let currentAdhkarEditIndex = null; 

// === متغيرات المصحف ===
let quranAudio = new Audio();
let currentSurahAyahs = [];
let currentAyahIndex = 0;
let verseRepeatCount = 1;
let currentVerseRepeat = 0;
let isPlaying = false;
let currentReciterId = "ar.alafasy"; // الافتراضي: مشاري العفاسي

// قائمة القراء المحدثة (روابط موثوقة من AlQuran.cloud)
const RECITERS = {
    "ar.alafasy": "مشاري راشد العفاسي",
    "ar.husary": "محمود خليل الحصري",
    "ar.husarymujawwad": "الحصري (مجود)",
    "ar.minshawi": "محمد صديق المنشاوي",
    "ar.minshawimujawwad": "المنشاوي (مجود)",
    "ar.abdulbasit": "عبد الباسط عبد الصمد",
    "ar.abdulsamad": "عبد الباسط (مجود)",
    "ar.mahermuaiqly": "ماهر المعيقلي",
    "ar.yasseraldossari": "ياسر الدوسري"
};

const HABITS_META = {
    rawatib: { name: 'السنن الرواتب (12)', icon: 'layers' },
    duha: { name: 'صلاة الضحى', icon: 'sun' },
    witr: { name: 'صلاة الوتر', icon: 'moon' },
    azkar_m: { name: 'أذكار الصباح', icon: 'sunrise' },
    azkar_e: { name: 'أذكار المساء', icon: 'sunset' },
    azkar_s: { name: 'أذكار النوم', icon: 'star' },
    fasting_mon: { name: 'صيام الاثنين', icon: 'calendar' },
    fasting_thu: { name: 'صيام الخميس', icon: 'calendar' }
};

const DEFAULT_USER_DATA = {
    prayers: { fajr: false, dhuhr: false, asr: false, maghrib: false, isha: false },
    quran: false,
    habits: { rawatib: false, duha: false, witr: false, azkar_m: false, azkar_e: false, azkar_s: false, fasting_mon: false, fasting_thu: false },
    habitSettings: { rawatib: true, duha: true, witr: true, azkar_m: true, azkar_e: true, azkar_s: true },
    customAdhkar: [] 
};

const MESSAGES_DB = {
    high: { title: "الله يفتح عليك.. هذا هو الثبات! 🌟", body: "أداء ممتاز اليوم. هذا الثبات نعمة عظيمة، اسأل الله أن يديمها عليك. استمع لكلمات الشيخ أمجد عن 'لذة القرب'.", link: "https://www.youtube.com/results?search_query=الشيخ+أمجد+سمير+الثبات", sidebar: "أداءك عالٍ! استمر يا بطل 💪" },
    medium: { title: "أحسنت.. واصل المسير ✨", body: "قطعت شوطاً كبيراً، جاهد نفسك في الباقي. النفس تحتاج لترويض، وأنت لها.", link: "https://www.youtube.com/results?search_query=الشيخ+أمجد+سمير+علو+الهمة", sidebar: "اقتربت، شد حيلك 🚀" },
    low: { title: "لا تيأس، البدايات دائماً صعبة 🌿", body: "تعثرت اليوم؟ لا بأس، المهم ألا تتوقف. الله يحب المحاولين. جدد نيتك الآن واستمع لهذه الكلمات لتشحذ همتك.", link: "https://www.youtube.com/results?search_query=الشيخ+أمجد+سمير+حسن+الظن+بالله", sidebar: "بداية جديدة.. استعن بالله ❤️" }
};

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
            requestNotificationPermission(); 
        } else {
            currentUser = null;
            showScreen('landing-screen');
        }
        hideLoader();
    });
}

function requestNotificationPermission() {
    if ("Notification" in window && Notification.permission !== "granted") {
        Notification.requestPermission();
    }
}

// === 1. Prayer Times & Alerts ===
function initPrayerTimes() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(position => {
            fetchPrayerTimes(position.coords.latitude, position.coords.longitude);
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
        const response = await fetch(url);
        const data = await response.json();
        if(data.code === 200) {
            prayerTimes = data.data.timings;
            updatePrayerUI();
            findNextPrayer();
        }
    } catch (e) { console.error("Error fetching prayers", e); }
}

function updatePrayerUI() {
    if (!prayerTimes) return;
    const mapping = { fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };
    for (const [key, apiName] of Object.entries(mapping)) {
        const time = prayerTimes[apiName];
        const [h, m] = time.split(':');
        let hours = parseInt(h);
        const ampm = hours >= 12 ? 'م' : 'ص';
        hours = hours % 12; hours = hours ? hours : 12; 
        const timeEl = document.getElementById(`time-${key}`);
        if(timeEl) timeEl.innerText = `${hours}:${m} ${ampm}`;
    }
}

function findNextPrayer() {
    if(!prayerTimes) return;
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    const mapping = { Fajr: 'الفجر', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء' };
    let foundNext = false;
    for (const [apiName, arName] of Object.entries(mapping)) {
        const [h, m] = prayerTimes[apiName].split(':');
        const pTime = parseInt(h) * 60 + parseInt(m);
        if (pTime > currentTime) {
            nextPrayer = { name: arName, time: pTime };
            const sidebarMsg = document.getElementById('sidebar-message-box');
            if(sidebarMsg) sidebarMsg.innerHTML = `الصلاة القادمة: <b>${arName}</b><br>الساعة ${h}:${m}`;
            foundNext = true; break;
        }
    }
    if(!foundNext) {
        const sidebarMsg = document.getElementById('sidebar-message-box');
        if(sidebarMsg) sidebarMsg.innerHTML = `الصلاة القادمة: <b>الفجر</b> (غداً)`;
    }
}

function addMinutesToTime(timeStr, minutesToAdd) {
    if(!timeStr) return null;
    const [h, m] = timeStr.split(':').map(Number);
    const date = new Date();
    date.setHours(h, m + minutesToAdd);
    return { h: date.getHours(), m: date.getMinutes() };
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
    if(adhkarEnabled) {
        const morningTime = addMinutesToTime(prayerTimes['Fajr'], 20);
        if (morningTime && morningTime.h === currentH && morningTime.m === currentM) sendAdhkarNotification("🌅 همسة الصباح", "حان موعد أذكار الصباح");
        const eveningTime = addMinutesToTime(prayerTimes['Asr'], 10);
        if (eveningTime && eveningTime.h === currentH && eveningTime.m === currentM) sendAdhkarNotification("🌇 همسة المساء", "حان موعد أذكار المساء");
    }
}

function playAdhan(prayerName) {
    adhanAudio.play().catch(e => console.log("Audio needed interaction"));
    if (Notification.permission === "granted") new Notification(`📢 حان الآن موعد صلاة ${prayerName}`);
    const sidebarMsg = document.getElementById('sidebar-message-box');
    if(sidebarMsg) {
        sidebarMsg.innerHTML = `<span class="text-[#047857] font-bold">الله أكبر! حان الآن موعد ${prayerName}</span>`;
        sidebarMsg.classList.add('animate-pulse');
        setTimeout(() => sidebarMsg.classList.remove('animate-pulse'), 10000);
    }
}

function sendAdhkarNotification(title, body) {
    if (Notification.permission === "granted") new Notification(title, { body: body });
}

// === 2. Quran Modal (Updated with All Reciters) ===
function injectQuranModal() {
    if (document.getElementById('quran-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'quran-modal';
    modal.className = 'modal-overlay hidden';
    modal.onclick = function(e) { if(e.target === this) closeQuran(); };
    
    let reciterOptions = '';
    for (const [key, name] of Object.entries(RECITERS)) reciterOptions += `<option value="${key}">${name}</option>`;

    modal.innerHTML = `
        <div class="modal-content h-[95vh] flex flex-col">
            <div class="p-3 border-b border-gray-100 bg-[#ECFDF5] flex flex-wrap gap-2 items-center justify-between">
                <div class="flex items-center gap-2 flex-1 min-w-[140px]">
                    <h3 class="text-lg font-bold text-[#047857] whitespace-nowrap hidden sm:block"><i data-lucide="book-open" class="inline w-4 h-4"></i> المصحف</h3>
                    <select id="surah-select" class="p-2 rounded-lg border border-gray-300 text-xs w-full" onchange="loadSurah(this.value)">
                        <option value="">اختر السورة...</option>
                    </select>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                    <select id="reciter-select" class="p-2 rounded-lg border border-gray-300 text-xs max-w-[120px]" onchange="changeReciter(this.value)">${reciterOptions}</select>
                    <div class="flex items-center bg-white rounded-lg border border-gray-300 px-1 hidden sm:flex">
                        <span class="text-[10px] text-gray-500 pl-1">تكرار:</span>
                        <input type="number" id="repeat-count" min="1" max="100" value="1" class="w-8 p-1 text-center outline-none text-xs font-bold" onchange="verseRepeatCount = parseInt(this.value)">
                    </div>
                    <button onclick="closeQuran()" class="text-gray-500 hover:text-red-500 bg-white p-2 rounded-full shadow-sm"><i data-lucide="x" class="w-4 h-4"></i></button>
                </div>
            </div>
            <div id="quran-content" class="flex-1 overflow-y-auto p-4 text-center bg-[#fdfdfd] relative">
                <div class="flex flex-col items-center justify-center h-full text-gray-400">
                    <i data-lucide="book" class="w-16 h-16 mb-4 opacity-30"></i><p class="text-sm">اختر السورة والقارئ</p>
                </div>
            </div>
            <div id="audio-player-bar" class="p-3 bg-white border-t border-gray-200 flex justify-between items-center hidden">
                <div class="text-[10px] text-gray-500 hidden sm:block"><span id="player-status">...</span></div>
                <div class="flex items-center gap-4 mx-auto">
                    <button onclick="prevVerse()" class="p-2 text-gray-600 hover:text-[#047857]"><i data-lucide="skip-back" class="w-5 h-5"></i></button>
                    <button onclick="togglePlay()" id="play-btn" class="w-10 h-10 bg-[#047857] text-white rounded-full flex items-center justify-center shadow-lg hover:bg-[#065f46] transition-all"><i data-lucide="play" class="w-5 h-5 ml-0.5"></i></button>
                    <button onclick="nextVerse()" class="p-2 text-gray-600 hover:text-[#047857]"><i data-lucide="skip-forward" class="w-5 h-5"></i></button>
                </div>
            </div>
        </div>`;
    
    document.body.appendChild(modal);
    fetchSurahList();
    quranAudio.addEventListener('ended', handleAudioEnd);
    quranAudio.addEventListener('play', () => { isPlaying = true; updatePlayIcon(); });
    quranAudio.addEventListener('pause', () => { isPlaying = false; updatePlayIcon(); });
}

async function fetchSurahList() {
    try {
        const res = await fetch('https://api.alquran.cloud/v1/surah');
        const data = await res.json();
        const select = document.getElementById('surah-select');
        data.data.forEach(surah => {
            const option = document.createElement('option');
            option.value = surah.number;
            option.text = `${surah.number}. ${surah.name}`;
            select.appendChild(option);
        });
    } catch(e) { console.log("Err loading surahs"); }
}

function changeReciter(reciterKey) {
    currentReciterId = reciterKey;
    if (currentSurahAyahs.length > 0) playVerse(currentAyahIndex);
}

// === loadSurah Updated ===
async function loadSurah(number) {
    if(!number) return;
    const container = document.getElementById('quran-content');
    container.innerHTML = '<div class="text-center p-10"><div class="animate-spin w-8 h-8 border-4 border-[#047857] border-t-transparent rounded-full mx-auto"></div><p class="mt-2 text-gray-500 text-sm">جاري التحميل...</p></div>';
    
    try {
        // نطلب السورة بالمعرف الخاص (مثل ar.alafasy)
        const res = await fetch(`https://api.alquran.cloud/v1/surah/${number}/${currentReciterId}`);
        if (!res.ok) throw new Error("فشل التحميل من المصدر");
        
        const data = await res.json();
        const ayahs = data.data.ayahs;
        
        currentSurahAyahs = ayahs;
        currentAyahIndex = 0;
        currentVerseRepeat = 0;
        
        let html = `<div class="max-w-3xl mx-auto px-2"><h2 class="text-2xl font-bold text-[#047857] mb-4 font-serif text-center">${data.data.name}</h2><div class="text-xl sm:text-2xl leading-[2.2] font-serif text-gray-800 text-justify" style="direction: rtl;">`;
        if(number != 1 && number != 9) html += `<div class="text-center mb-4 text-lg text-gray-600">بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</div>`;
        
        ayahs.forEach((ayah, index) => {
            const text = ayah.text.replace('بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ', '').trim(); 
            html += `<span id="ayah-${index}" class="ayah-span cursor-pointer hover:bg-green-50 rounded px-1 transition-colors duration-200" onclick="playVerse(${index})">${text} <span class="text-[#047857] text-lg font-sans inline-block mx-1">۝${ayah.numberInSurah}</span></span> `;
        });
        
        html += `</div></div>`;
        container.innerHTML = html;
        document.getElementById('audio-player-bar').classList.remove('hidden');
        
    } catch(e) { 
        console.error(e);
        container.innerHTML = `<div class="flex flex-col items-center justify-center h-full text-red-500"><i data-lucide="wifi-off" class="w-10 h-10 mb-2"></i><p class="text-sm">حدث خطأ في تحميل السورة.</p><button onclick="loadSurah(${number})" class="mt-4 px-4 py-2 bg-red-100 rounded-lg hover:bg-red-200 text-red-700 font-bold text-sm">إعادة المحاولة</button></div>`;
        lucide.createIcons();
    }
}

function playVerse(index) {
    if (index < 0 || index >= currentSurahAyahs.length) return;
    currentAyahIndex = index;
    const ayah = currentSurahAyahs[index];
    
    // تأكد من وجود ملف صوتي
    if (ayah.audio || ayah.audioSecondary && ayah.audioSecondary[0]) {
        quranAudio.src = ayah.audio || ayah.audioSecondary[0];
        quranAudio.play().catch(e => console.log("User interaction required for audio"));
        highlightAyah(index);
        updatePlayerStatus();
    } else {
        alert("عذراً، ملف الصوت لهذه الآية غير متوفر حالياً.");
    }
}

function handleAudioEnd() {
    currentVerseRepeat++;
    if (currentVerseRepeat < verseRepeatCount) {
        quranAudio.currentTime = 0;
        quranAudio.play();
    } else {
        currentVerseRepeat = 0;
        if (currentAyahIndex < currentSurahAyahs.length - 1) playVerse(currentAyahIndex + 1);
        else { isPlaying = false; updatePlayIcon(); }
    }
}

function highlightAyah(index) {
    document.querySelectorAll('.ayah-span').forEach(el => el.classList.remove('bg-green-200', 'text-green-900'));
    const el = document.getElementById(`ayah-${index}`);
    if (el) {
        el.classList.add('bg-green-200', 'text-green-900');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function togglePlay() { if (isPlaying) quranAudio.pause(); else quranAudio.play(); }
function updatePlayIcon() {
    const icon = document.querySelector('#play-btn i');
    if (isPlaying) icon.setAttribute('data-lucide', 'pause'); else icon.setAttribute('data-lucide', 'play');
    lucide.createIcons();
}
function nextVerse() { currentVerseRepeat = 0; playVerse(currentAyahIndex + 1); }
function prevVerse() { currentVerseRepeat = 0; playVerse(currentAyahIndex - 1); }
function updatePlayerStatus() {
    const status = document.getElementById('player-status');
    const ayah = currentSurahAyahs[currentAyahIndex];
    if(status && ayah) status.innerText = `الآية ${ayah.numberInSurah} - تكرار (${currentVerseRepeat + 1}/${verseRepeatCount})`;
}
function openQuran() { const m = document.getElementById('quran-modal'); if(m) m.classList.remove('hidden'); else injectQuranModal(); }
function closeQuran() { const m = document.getElementById('quran-modal'); if(m) m.classList.add('hidden'); quranAudio.pause(); }

// === 3. Mobile Nav ===
function injectMobileNav() {
    if (document.getElementById('mobile-bottom-nav')) return;
    const mainContent = document.querySelector('#app-screen main > div');
    if(mainContent) mainContent.classList.add('pb-24');
    const nav = document.createElement('div');
    nav.id = 'mobile-bottom-nav';
    nav.className = 'md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50 flex justify-around items-center h-16 pb-safe';
    nav.innerHTML = `
        <button onclick="showScreen('app-screen')" class="flex flex-col items-center justify-center w-full h-full text-[#047857]"><i data-lucide="layout-dashboard" class="w-5 h-5"></i><span class="text-[9px] font-bold mt-1">يوميتي</span></button>
        <button onclick="openQuran()" class="flex flex-col items-center justify-center w-full h-full text-gray-500 hover:text-[#047857]"><i data-lucide="book-open" class="w-5 h-5"></i><span class="text-[9px] font-bold mt-1">المصحف</span></button>
        <button onclick="openReportModal()" class="flex flex-col items-center justify-center w-full h-full text-gray-500 hover:text-[#047857]"><i data-lucide="bar-chart-2" class="w-5 h-5"></i><span class="text-[9px] font-bold mt-1">تقارير</span></button>
        <button onclick="openSettingsModal()" class="flex flex-col items-center justify-center w-full h-full text-gray-500 hover:text-[#047857]"><i data-lucide="settings" class="w-5 h-5"></i><span class="text-[9px] font-bold mt-1">إعدادات</span></button>`;
    document.body.appendChild(nav);
    lucide.createIcons();
}

// === Standard Logic ===
function getFormattedDateID(date) { const offset = date.getTimezoneOffset(); const localDate = new Date(date.getTime() - (offset*60*1000)); return localDate.toISOString().split('T')[0]; }
function getReadableDate(date) { return date.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); }
function isToday(date) { return getFormattedDateID(date) === getFormattedDateID(new Date()); }
function changeDate(days) { const newDate = new Date(currentDate); newDate.setDate(newDate.getDate() + days); if (newDate > new Date()) return; currentDate = newDate; loadUserDataForDate(currentDate); }
function updateDateUI() {
    const dateStr = getReadableDate(currentDate);
    const dateDisplay = document.getElementById('current-date-display');
    if(dateDisplay) dateDisplay.innerText = dateStr;
    const nextBtn = document.getElementById('btn-next-day');
    if(nextBtn) { if (isToday(currentDate)) { nextBtn.disabled = true; nextBtn.classList.add('opacity-30'); } else { nextBtn.disabled = false; nextBtn.classList.remove('opacity-30'); } }
    const isReadOnly = !isToday(currentDate);
    const tasks = document.getElementById('tasks-container'); const adhkar = document.getElementById('adhkar-container'); const addBtn = document.getElementById('btn-add-dhikr'); const badge = document.querySelector('.read-only-badge'); const motive = document.getElementById('motivational-text');
    if (isReadOnly) { if(tasks) tasks.classList.add('read-only-mode'); if(adhkar) adhkar.classList.add('read-only-mode'); if(addBtn) addBtn.classList.add('hidden'); if(badge) badge.style.display = 'inline-flex'; if(motive) motive.innerText = "عرض أرشيف سابق"; } 
    else { if(tasks) tasks.classList.remove('read-only-mode'); if(adhkar) adhkar.classList.remove('read-only-mode'); if(addBtn) addBtn.classList.remove('hidden'); if(badge) badge.style.display = 'none'; if(motive) motive.innerText = "كيف هي همتك اليوم؟"; }
}
function loadUserDataForDate(date) {
    if (unsubscribeSnapshot) unsubscribeSnapshot();
    const dateID = getFormattedDateID(date);
    updateDateUI();
    unsubscribeSnapshot = db.collection('users').doc(currentUser.uid).collection('daily_logs').doc(dateID).onSnapshot(async doc => {
        if (doc.exists) { 
            const data = doc.data(); 
            lastUserData = data; 
            renderTasks(data); 
            renderAdhkar(data.customAdhkar || []); 
            updateDashboardStats(data); 
        } else { 
            if (isToday(date)) { 
                const userDoc = await db.collection('users').doc(currentUser.uid).get();
                const savedSettings = userDoc.data()?.habitSettings || DEFAULT_USER_DATA.habitSettings;
                const savedAdhkarTemplates = userDoc.data()?.customAdhkarTemplates || [];
                const newDayData = { ...DEFAULT_USER_DATA, habitSettings: savedSettings, customAdhkar: savedAdhkarTemplates.map(t => ({ name: t.name, target: t.target, count: 0 })) };
                db.collection('users').doc(currentUser.uid).collection('daily_logs').doc(dateID).set(newDayData); 
            } else { lastUserData = DEFAULT_USER_DATA; renderTasks(DEFAULT_USER_DATA); renderAdhkar([]); updateDashboardStats(DEFAULT_USER_DATA); } 
        }
        const name = currentUser.displayName || currentUser.email.split('@')[0];
        document.querySelectorAll('#user-name-display, #welcome-name').forEach(el => el.innerText = name);
        document.getElementById('user-avatar').innerText = name[0].toUpperCase();
    });
}
function renderTasks(data) {
    const container = document.getElementById('tasks-container'); container.innerHTML = '';
    if (!data || !data.prayers) return;
    let html = `<div><div class="flex items-center gap-3 mb-5"><div class="w-1.5 h-8 bg-[#047857] rounded-full"></div><h3 class="text-xl font-bold text-gray-800">الفرائض وورد القرآن</h3></div><div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">`;
    const pNames = { fajr: 'الفجر', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };
    for (const [k, v] of Object.entries(data.prayers)) html += `<div class="bg-white p-5 rounded-2xl border transition-all hover:-translate-y-1 flex justify-between items-center cursor-pointer ${v?'border-green-200 bg-green-50/50':'border-gray-100'}" onclick="toggleTask('prayers','${k}',${!v})"><div class="flex gap-4 items-center"><div class="w-10 h-10 rounded-full flex items-center justify-center ${v?'bg-[#047857] text-white':'bg-gray-100 text-gray-400'}"><i data-lucide="${v?'check':'clock'}" class="w-5 h-5"></i></div><div><span class="block font-bold text-lg ${v?'text-[#047857]':'text-gray-600'}">${pNames[k]}</span><span id="time-${k}" class="text-xs text-gray-400 font-bold">--:--</span></div></div></div>`;
    const quranDone = (typeof data.quran !== 'undefined') ? data.quran : (data.habits?.quran || false);
    html += `<div class="bg-white p-5 rounded-2xl border transition-all hover:-translate-y-1 flex justify-between items-center cursor-pointer ${quranDone?'border-green-200 bg-green-50/50':'border-gray-100'}" onclick="toggleTask('root','quran',${!quranDone})"><div class="flex gap-4 items-center"><div class="w-10 h-10 rounded-full flex items-center justify-center ${quranDone?'bg-[#047857] text-white':'bg-gray-100 text-gray-400'}"><i data-lucide="book-open" class="w-5 h-5"></i></div><div><span class="block font-bold text-lg ${quranDone?'text-[#047857]':'text-gray-600'}">ورد القرآن</span><span class="text-xs text-gray-400 cursor-pointer hover:text-[#047857]" onclick="event.stopPropagation(); openQuran()">📖 اقرأ الآن</span></div></div></div></div></div>`;
    const userSettings = data.habitSettings || DEFAULT_USER_DATA.habitSettings;
    const activeHabits = Object.keys(userSettings).filter(key => userSettings[key]);
    if (activeHabits.length > 0) {
        html += `<div class="mt-10"><div class="flex items-center gap-3 mb-5"><div class="w-1.5 h-8 bg-[#D4AF37] rounded-full"></div><h3 class="text-xl font-bold text-gray-800">السنن المختارة</h3></div><div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">`;
        for (const key of activeHabits) { const meta = HABITS_META[key]; if (!meta) continue; const v = data.habits[key] || false; html += `<div class="bg-white p-5 rounded-2xl border transition-all hover:-translate-y-1 flex justify-between items-center cursor-pointer ${v?'border-yellow-200 bg-yellow-50/50':'border-gray-100'}" onclick="toggleTask('habits','${key}',${!v})"><div class="flex gap-4 items-center"><div class="w-10 h-10 rounded-full flex items-center justify-center ${v?'bg-yellow-500 text-white':'bg-gray-100 text-gray-400'}"><i data-lucide="${meta.icon}" class="w-5 h-5"></i></div><span class="font-bold text-lg ${v?'text-yellow-700':'text-gray-600'}">${meta.name}</span></div></div>`; }
        html += `</div></div>`;
    }
    container.innerHTML = html;
    lucide.createIcons();
    updatePrayerUI();
}
function renderAdhkar(list) {
    const container = document.getElementById('adhkar-container'); if(!container) return; container.innerHTML = ''; let total = 0;
    list.forEach((item, index) => { total += item.count; const progress = Math.min((item.count / (item.target || 100)) * 100, 100); container.innerHTML += `<div class="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm relative overflow-hidden group"><div class="flex justify-between items-start mb-2 relative z-10"><div><h4 class="font-bold text-gray-800 text-lg">${item.name}</h4><span class="text-xs text-gray-400">الهدف: ${item.target}</span></div><button onclick="removeAdhkar(${index})" class="text-gray-300 hover:text-red-400"><i data-lucide="trash-2" class="w-4 h-4"></i></button></div><div class="flex justify-between items-end relative z-10 mt-2"><div class="flex items-end gap-2"><span class="text-3xl font-bold text-blue-600">${item.count}</span><button onclick="openManualCountModal(${index})" class="text-gray-400 hover:text-blue-500 mb-1 p-1 rounded hover:bg-blue-50 transition-colors"><i data-lucide="edit-3" class="w-4 h-4"></i></button></div><button onclick="incrementAdhkar(${index})" class="click-anim w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 shadow-lg shadow-blue-200"><i data-lucide="plus" class="w-6 h-6"></i></button></div><div class="absolute bottom-0 left-0 h-1.5 bg-blue-100 w-full"><div class="h-full bg-blue-500 transition-all duration-300" style="width: ${progress}%"></div></div></div>`; });
    const totalEl = document.getElementById('total-adhkar-count'); if(totalEl) totalEl.innerText = total; lucide.createIcons();
}
function toggleTask(cat, key, val) { if (!isToday(currentDate)) return; const dateID = getFormattedDateID(currentDate); const update = {}; if (cat === 'root') update[key] = val; else update[`${cat}.${key}`] = val; db.collection('users').doc(currentUser.uid).collection('daily_logs').doc(dateID).update(update); }
async function addNewDhikr() { if (!isToday(currentDate)) return; const name = document.getElementById('new-dhikr-name').value; const target = parseInt(document.getElementById('new-dhikr-target').value) || 100; if(!name) return alert("أدخل اسم الذكر"); const userRef = db.collection('users').doc(currentUser.uid); const userDoc = await userRef.get(); let templates = userDoc.data()?.customAdhkarTemplates || []; templates.push({ name, target }); await userRef.set({ customAdhkarTemplates: templates }, { merge: true }); const dateID = getFormattedDateID(currentDate); const docRef = userRef.collection('daily_logs').doc(dateID); const doc = await docRef.get(); let currentList = doc.exists ? (doc.data().customAdhkar || []) : []; currentList.push({ name, count: 0, target }); await docRef.update({ customAdhkar: currentList }); toggleAdhkarModal(); document.getElementById('new-dhikr-name').value = ''; }
async function incrementAdhkar(index) { if (!isToday(currentDate)) return; const dateID = getFormattedDateID(currentDate); const docRef = db.collection('users').doc(currentUser.uid).collection('daily_logs').doc(dateID); const doc = await docRef.get(); let list = doc.data().customAdhkar; list[index].count += 1; await docRef.update({ customAdhkar: list }); }
async function removeAdhkar(index) { if (!isToday(currentDate)) return; if(!confirm("حذف؟")) return; const userRef = db.collection('users').doc(currentUser.uid); const userDoc = await userRef.get(); let templates = userDoc.data()?.customAdhkarTemplates || []; if(index < templates.length) { templates.splice(index, 1); await userRef.update({ customAdhkarTemplates: templates }); } const dateID = getFormattedDateID(currentDate); const docRef = userRef.collection('daily_logs').doc(dateID); const doc = await docRef.get(); let list = doc.data().customAdhkar; list.splice(index, 1); await docRef.update({ customAdhkar: list }); }
function toggleAdhkarModal() { document.getElementById('adhkar-modal').classList.toggle('hidden'); }
function injectManualCountModal() { if (document.getElementById('manual-count-modal')) return; const modal = document.createElement('div'); modal.id = 'manual-count-modal'; modal.className = 'modal-overlay hidden'; modal.onclick = function(e) { if(e.target === this) document.getElementById('manual-count-modal').classList.add('hidden'); }; modal.innerHTML = `<div class="modal-content max-w-sm p-6"><h3 class="text-xl font-bold text-gray-800 mb-2">إضافة عدد</h3><p class="text-sm text-gray-500 mb-4">كم مرة قلت هذا الذكر؟</p><input type="number" id="manual-count-input" placeholder="مثلاً: 100" class="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 mb-6 focus:border-blue-500 outline-none text-center text-lg font-bold"><div class="flex gap-3"><button onclick="saveManualCount()" class="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700">إضافة</button><button onclick="document.getElementById('manual-count-modal').classList.add('hidden')" class="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl font-bold hover:bg-gray-200">إلغاء</button></div></div>`; document.body.appendChild(modal); }
function openManualCountModal(index) { if (!isToday(currentDate)) return; currentAdhkarEditIndex = index; const modal = document.getElementById('manual-count-modal'); const input = document.getElementById('manual-count-input'); input.value = ''; modal.classList.remove('hidden'); setTimeout(() => input.focus(), 100); }
async function saveManualCount() { const input = document.getElementById('manual-count-input'); const countToAdd = parseInt(input.value); if (isNaN(countToAdd) || countToAdd <= 0) { alert("الرجاء إدخال رقم صحيح"); return; } if (currentAdhkarEditIndex !== null) { const dateID = getFormattedDateID(currentDate); const docRef = db.collection('users').doc(currentUser.uid).collection('daily_logs').doc(dateID); const doc = await docRef.get(); if (doc.exists) { let list = doc.data().customAdhkar; if (list && list[currentAdhkarEditIndex]) { list[currentAdhkarEditIndex].count += countToAdd; await docRef.update({ customAdhkar: list }); } } } document.getElementById('manual-count-modal').classList.add('hidden'); }
function injectSettingsUI() { const sidebarNav = document.querySelector('aside .flex-1.space-y-3'); if (sidebarNav) { if (!document.getElementById('btn-settings-sidebar')) { const btn = document.createElement('button'); btn.id = 'btn-settings-sidebar'; btn.className = "w-full flex items-center gap-4 px-6 py-4 text-gray-600 hover:bg-gray-50 hover:text-[#047857] rounded-l-2xl font-bold transition-all"; btn.innerHTML = `<i data-lucide="settings"></i> إعدادات العبادات`; btn.onclick = openSettingsModal; sidebarNav.appendChild(btn); } if (!document.getElementById('btn-quran-sidebar')) { const btn = document.createElement('button'); btn.id = 'btn-quran-sidebar'; btn.className = "w-full flex items-center gap-4 px-6 py-4 text-gray-600 hover:bg-gray-50 hover:text-[#047857] rounded-l-2xl font-bold transition-all"; btn.innerHTML = `<i data-lucide="book-open"></i> المصحف الإلكتروني`; btn.onclick = openQuran; const settingsBtn = document.getElementById('btn-settings-sidebar'); if(settingsBtn) sidebarNav.insertBefore(btn, settingsBtn); else sidebarNav.appendChild(btn); } lucide.createIcons(); } if (!document.getElementById('settings-modal')) { const modal = document.createElement('div'); modal.id = 'settings-modal'; modal.className = 'modal-overlay hidden'; modal.onclick = function(e) { if(e.target === this) closeSettingsModal(); }; modal.innerHTML = `<div class="modal-content"><div class="p-6 border-b border-gray-100 flex justify-between items-center bg-[#ECFDF5]"><div><h3 class="text-xl font-bold text-[#047857]">تخصيص السنن</h3><p class="text-xs text-gray-500">تحكم فيما يظهر في يومك</p></div><button onclick="closeSettingsModal()" class="text-gray-400 hover:text-red-500"><i data-lucide="x"></i></button></div><div class="p-6 max-h-[60vh] overflow-y-auto space-y-3" id="settings-toggles-container"></div><div class="px-6 pb-2 space-y-2"><div class="flex items-center justify-between p-4 bg-green-50 rounded-xl border border-green-100"><div class="flex items-center gap-3"><div class="bg-white p-2 rounded-lg text-[#047857]"><i data-lucide="volume-2" class="w-5 h-5"></i></div><span class="font-bold text-gray-700">صوت الأذان</span></div><label class="relative inline-flex items-center cursor-pointer"><input type="checkbox" class="sr-only peer" id="adhan-toggle" checked onchange="adhanEnabled = this.checked"><div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#047857]"></div></label></div><div class="flex items-center justify-between p-4 bg-yellow-50 rounded-xl border border-yellow-100"><div class="flex items-center gap-3"><div class="bg-white p-2 rounded-lg text-yellow-600"><i data-lucide="bell" class="w-5 h-5"></i></div><span class="font-bold text-gray-700">تنبيهات الأذكار (صباح/مساء)</span></div><label class="relative inline-flex items-center cursor-pointer"><input type="checkbox" class="sr-only peer" id="adhkar-toggle" checked onchange="adhkarEnabled = this.checked"><div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-yellow-500"></div></label></div></div><div class="p-6 border-t border-gray-100 bg-gray-50 flex justify-end"><button onclick="saveSettings()" class="px-8 py-3 bg-[#047857] text-white rounded-xl font-bold hover:bg-[#065f46] shadow-lg transition-all">حفظ التغييرات</button></div></div>`; document.body.appendChild(modal); lucide.createIcons(); } }
function openSettingsModal() { if (!lastUserData) return; const container = document.getElementById('settings-toggles-container'); container.innerHTML = ''; const settings = lastUserData.habitSettings || DEFAULT_USER_DATA.habitSettings; for (const [key, meta] of Object.entries(HABITS_META)) { const isChecked = settings[key] || false; container.innerHTML += `<div class="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100"><div class="flex items-center gap-3"><div class="bg-white p-2 rounded-lg text-yellow-600"><i data-lucide="${meta.icon}" class="w-5 h-5"></i></div><span class="font-bold text-gray-700">${meta.name}</span></div><label class="relative inline-flex items-center cursor-pointer"><input type="checkbox" class="sr-only peer setting-toggle" data-key="${key}" ${isChecked ? 'checked' : ''}><div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#047857]"></div></label></div>`; } document.getElementById('settings-modal').classList.remove('hidden'); lucide.createIcons(); }
function closeSettingsModal() { document.getElementById('settings-modal').classList.add('hidden'); }
async function saveSettings() { if (!isToday(currentDate)) return alert("يمكنك تعديل إعدادات اليوم الحالي فقط"); const checkboxes = document.querySelectorAll('.setting-toggle'); const newSettings = { ... (lastUserData.habitSettings || {}) }; checkboxes.forEach(cb => { newSettings[cb.dataset.key] = cb.checked; }); await db.collection('users').doc(currentUser.uid).set({ habitSettings: newSettings }, { merge: true }); const dateID = getFormattedDateID(currentDate); db.collection('users').doc(currentUser.uid).collection('daily_logs').doc(dateID).update({ habitSettings: newSettings }).then(() => { closeSettingsModal(); }); }
function hideLoader() { const l=document.getElementById('loader'); if(l){l.style.opacity='0'; setTimeout(()=>l.style.display='none',500);} }
function showScreen(id) { ['landing-screen','auth-screen','app-screen'].forEach(s=>{document.getElementById(s).classList.add('hidden')}); document.getElementById(id).classList.remove('hidden'); if(id==='app-screen') setTimeout(initChart,100); }
function goToAuth(m) { showScreen('auth-screen'); switchAuthMode(m); }
function showLandingScreen() { showScreen('landing-screen'); }
function switchAuthMode(m) { document.getElementById('login-form').classList.add('hidden'); document.getElementById('register-form').classList.add('hidden'); document.getElementById('reset-form').classList.add('hidden'); document.getElementById('auth-tabs').classList.remove('hidden'); document.getElementById('auth-error').classList.add('hidden'); if(m==='login') document.getElementById('login-form').classList.remove('hidden'); else if(m==='register') document.getElementById('register-form').classList.remove('hidden'); else { document.getElementById('reset-form').classList.remove('hidden'); document.getElementById('auth-tabs').classList.add('hidden'); } }
async function handleLogin(e){ e.preventDefault(); try{ await auth.signInWithEmailAndPassword(document.getElementById('login-email').value, document.getElementById('login-password').value); }catch(err){showAuthError("خطأ في الدخول");} }
async function handleRegister(e){ e.preventDefault(); try{ const c=await auth.createUserWithEmailAndPassword(document.getElementById('reg-email').value, document.getElementById('reg-password').value); await c.user.updateProfile({displayName:document.getElementById('reg-name').value}); }catch(err){showAuthError(err.message);} }
async function handleResetPassword(e){ e.preventDefault(); try{ await auth.sendPasswordResetEmail(document.getElementById('reset-email').value); alert("تم الإرسال"); switchAuthMode('login'); }catch(err){showAuthError(err.message);} }
async function handleLogout(){ if(unsubscribeSnapshot) unsubscribeSnapshot(); await auth.signOut(); showScreen('landing-screen'); }
function showAuthError(m){ const e=document.getElementById('auth-error'); e.innerText=m; e.classList.remove('hidden'); }
function initChart() { const ctx = document.getElementById('performanceChart'); if(!ctx) return; if (performanceChartInstance) performanceChartInstance.destroy(); performanceChartInstance = new Chart(ctx, { type: 'doughnut', data: { labels: ['منجز', 'متبقي'], datasets: [{ data: [0, 100], backgroundColor: ['#047857', '#E5E7EB'], borderWidth: 0, cutout: '75%' }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, animation: { animateScale: true, animateRotate: true } } }); }
function updateDashboardStats(data) { let total = 0, done = 0; if (data.prayers) Object.values(data.prayers).forEach(v => { total++; if(v) done++; }); const quranDone = (typeof data.quran !== 'undefined') ? data.quran : (data.habits?.quran || false); total++; if(quranDone) done++; const activeHabits = data.habitSettings || DEFAULT_USER_DATA.habitSettings; for (const key of Object.keys(activeHabits)) { if(activeHabits[key] && HABITS_META[key]) { total++; if(data.habits[key]) done++; } } const percent = total === 0 ? 0 : Math.round((done / total) * 100); const percentEl = document.getElementById('chart-percent'); if(percentEl) percentEl.innerText = `${percent}%`; if (performanceChartInstance) { performanceChartInstance.data.datasets[0].data = [percent, 100 - percent]; performanceChartInstance.update(); } let msgData = percent >= 80 ? MESSAGES_DB.high : (percent >= 50 ? MESSAGES_DB.medium : MESSAGES_DB.low); document.getElementById('feedback-title').innerText = msgData.title; document.getElementById('feedback-body').innerText = msgData.body; document.getElementById('feedback-link').href = msgData.link; const sidebarMsg = document.getElementById('sidebar-message-box'); if(sidebarMsg && !sidebarMsg.innerText.includes('الصلاة القادمة')) sidebarMsg.innerText = msgData.sidebar; }

// === 🆕 REPORTS GENERATION LOGIC (Weekly/Monthly) & CHARTS ===

function openReportModal() {
    generateReport('day'); 
    const modal = document.getElementById('report-modal');
    modal.classList.remove('hidden');
    const content = modal.querySelector('.modal-content');
    if(content) content.scrollTop = 0;
    
    // Inject Canvas if missing
    let chartContainer = document.getElementById('report-chart-container');
    if (!chartContainer) {
        const preview = document.getElementById('report-preview-content');
        // Add chart container before the tasks list
        const tasksSection = preview.querySelector('.mb-6.relative.z-10');
        chartContainer = document.createElement('div');
        chartContainer.id = 'report-chart-container';
        chartContainer.className = 'mb-6 h-48 relative';
        chartContainer.innerHTML = '<canvas id="reportChart"></canvas>';
        preview.insertBefore(chartContainer, tasksSection);
    }

    document.querySelectorAll('.report-tab').forEach(t => {
        t.onclick = () => generateReport(t.dataset.period);
    });
}

function closeReportModal() { document.getElementById('report-modal').classList.add('hidden'); }

async function generateReport(period) {
    document.querySelectorAll('.report-tab').forEach(t => {
        if(t.dataset.period === period) {
            t.classList.replace('text-gray-500', 'text-[#047857]'); t.classList.add('bg-white', 'shadow-sm');
        } else {
            t.classList.replace('text-[#047857]', 'text-gray-500'); t.classList.remove('bg-white', 'shadow-sm');
        }
    });

    const reportTitle = document.getElementById('report-title-text');
    const reportDate = document.getElementById('report-date');
    const reportUser = document.getElementById('report-user');
    const reportPercent = document.getElementById('report-percent');
    const reportAdhkar = document.getElementById('report-adhkar');
    const listEl = document.getElementById('report-tasks-list');
    
    reportUser.innerText = currentUser.displayName || "فاعل خير";
    listEl.innerHTML = '<li class="text-center text-gray-400 py-4">جاري التحميل...</li>';

    if (period === 'day') {
        reportTitle.innerText = "تقرير إنجاز يومي";
        reportDate.innerText = getReadableDate(currentDate);
        reportPercent.innerText = document.getElementById('chart-percent').innerText;
        reportAdhkar.innerText = document.getElementById('total-adhkar-count').innerText;
        listEl.innerHTML = '';
        if(lastUserData) renderDailyList(lastUserData, listEl);
        renderReportChart('day', { percent: parseInt(reportPercent.innerText) });
    } 
    else {
        const days = period === 'week' ? 7 : 30;
        reportTitle.innerText = period === 'week' ? "تقرير إنجاز أسبوعي" : "تقرير إنجاز شهري";
        reportDate.innerText = `آخر ${days} يوم`;
        
        const stats = await fetchAggregateData(days);
        
        reportPercent.innerText = stats.percent + "%";
        reportAdhkar.innerText = stats.totalAdhkar;
        listEl.innerHTML = '';
        listEl.innerHTML += `<li class="flex justify-between items-center p-2 bg-green-50 rounded-lg"><span class="font-bold text-gray-700">الصلوات المكتملة</span><span class="text-[#047857] font-bold">${stats.prayersDone} / ${stats.totalPrayers}</span></li>`;
        listEl.innerHTML += `<li class="flex justify-between items-center p-2 bg-yellow-50 rounded-lg"><span class="font-bold text-gray-700">أيام القرآن</span><span class="text-yellow-700 font-bold">${stats.quranDays} يوم</span></li>`;
        listEl.innerHTML += `<li class="flex justify-between items-center p-2 bg-blue-50 rounded-lg"><span class="font-bold text-gray-700">متوسط الإنجاز</span><span class="text-blue-700 font-bold">${stats.percent}%</span></li>`;
        
        renderReportChart(period, stats);
    }
}

async function fetchAggregateData(days) {
    let totalPercent = 0; let totalAdhkar = 0; let prayersDone = 0; let totalPrayers = 0; let quranDays = 0; let daysCounted = 0;
    const history = []; // To store daily percentages for chart
    const today = new Date();
    
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateID = getFormattedDateID(d);
        const doc = await db.collection('users').doc(currentUser.uid).collection('daily_logs').doc(dateID).get();
        let dayPercent = 0;
        if (doc.exists) {
            daysCounted++;
            const data = doc.data();
            if (data.prayers) Object.values(data.prayers).forEach(v => { totalPrayers++; if(v) prayersDone++; });
            if (data.quran || data.habits?.quran) quranDays++;
            if (data.customAdhkar) data.customAdhkar.forEach(a => totalAdhkar += (a.count || 0));
            let dayTotal = 5; let dayDone = 0;
            if (data.prayers) Object.values(data.prayers).forEach(v => { if(v) dayDone++; });
            dayPercent = Math.round((dayDone / dayTotal) * 100);
        }
        history.push({ date: d.toLocaleDateString('ar-EG', {day: 'numeric', month: 'numeric'}), percent: dayPercent });
    }
    const avgPercent = daysCounted > 0 ? Math.round(totalPercent / daysCounted) : 0;
    return { percent: avgPercent, totalAdhkar, prayersDone, totalPrayers, quranDays, history };
}

function renderReportChart(period, data) {
    const ctx = document.getElementById('reportChart');
    if(!ctx) return;
    if (reportChartInstance) reportChartInstance.destroy();

    if (period === 'day') {
        const p = data.percent || 0;
        reportChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['منجز', 'متبقي'],
                datasets: [{
                    data: [p, 100 - p],
                    backgroundColor: ['#047857', '#E5E7EB'],
                    borderWidth: 0
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false } } }
        });
    } else {
        // Bar Chart for Week/Month
        reportChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.history.map(h => h.date),
                datasets: [{
                    label: 'نسبة الإنجاز اليومي',
                    data: data.history.map(h => h.percent),
                    backgroundColor: '#047857',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, max: 100 } },
                plugins: { legend: { display: false } }
            }
        });
    }
}

function renderDailyList(data, listEl) {
    const pNames = { fajr: 'الفجر', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };
    for (const [k, v] of Object.entries(data.prayers)) { if(v) listEl.innerHTML += `<li class="flex items-center gap-2 text-green-700 font-bold"><span class="w-2 h-2 rounded-full bg-green-500"></span> صلاة ${pNames[k]}</li>`; }
    const quranDone = (typeof data.quran !== 'undefined') ? data.quran : (data.habits?.quran || false);
    if(quranDone) listEl.innerHTML += `<li class="flex items-center gap-2 text-green-700 font-bold"><span class="w-2 h-2 rounded-full bg-green-500"></span> ورد القرآن</li>`;
    const activeHabits = data.habitSettings || DEFAULT_USER_DATA.habitSettings;
    for (const [k, v] of Object.entries(data.habits || {})) { if(v && activeHabits[k] && HABITS_META[k]) listEl.innerHTML += `<li class="flex items-center gap-2 text-yellow-700"><span class="w-2 h-2 rounded-full bg-yellow-500"></span> ${HABITS_META[k].name}</li>`; }
}

function downloadAsImage() { const element = document.getElementById('report-preview-content'); const name = currentUser.displayName || "user"; html2canvas(element, { scale: 2 }).then(canvas => { const link = document.createElement('a'); link.download = `Report_${name}_${Date.now()}.png`; link.href = canvas.toDataURL(); link.click(); }); }
function downloadAsPDF() { const element = document.getElementById('report-preview-content'); const name = currentUser.displayName || "user"; const { jsPDF } = window.jspdf; html2canvas(element, { scale: 2 }).then(canvas => { const imgData = canvas.toDataURL('image/png'); const pdf = new jsPDF('p', 'mm', 'a4'); const pdfWidth = pdf.internal.pageSize.getWidth(); const pdfHeight = (canvas.height * pdfWidth) / canvas.width; pdf.addImage(imgData, 'PNG', 0, 10, pdfWidth, pdfHeight); pdf.save(`Report_${name}_${Date.now()}.pdf`); }); }
function downloadAsExcel() { if(!lastUserData) return; const name = currentUser.displayName || "فاعل خير"; const rows = [["تقرير تزكية"], ["الاسم", name], ["التاريخ", getReadableDate(currentDate)], ["النسبة", document.getElementById('chart-percent').innerText], [], ["العبادة","الحالة"]]; const pNames = { fajr: 'الفجر', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' }; for (const [k, v] of Object.entries(lastUserData.prayers)) rows.push([`صلاة ${pNames[k]}`, v?"تم":"لم يتم"]); rows.push(["ورد القرآن", (lastUserData.quran||lastUserData.habits?.quran)?"تم":"لم يتم"]); const activeHabits = lastUserData.habitSettings || DEFAULT_USER_DATA.habitSettings; for (const [k, v] of Object.entries(lastUserData.habits || {})) { if(activeHabits[k] && HABITS_META[k]) rows.push([HABITS_META[k].name, v?"تم":"لم يتم"]); } const ws = XLSX.utils.aoa_to_sheet(rows); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Report"); XLSX.writeFile(wb, `Report_${name}_${Date.now()}.xlsx`); }