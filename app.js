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
let performanceChartInstance = null;
let lastUserData = null; 
let globalUserSettings = null; 
let currentDate = new Date();

// === متغيرات المواقيت والقرآن ===
let prayerTimes = null;
let nextPrayer = null;
let adhanAudio = new Audio('https://www.islamcan.com/audio/adhan/azan2.mp3');
let adhanEnabled = true;

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

    auth.onAuthStateChanged(async user => {
        if (user) {
            currentUser = user;
            showScreen('app-screen');
            currentDate = new Date();
            
            // إظهار رسالة ترحيب لطيفة
            showToast(`أهلاً بك مجدداً يا ${user.displayName || 'بطل'} 🌿`);

            await loadGlobalSettings();
            loadUserDataForDate(currentDate);
            injectSettingsUI();
            injectMobileNav();
            initPrayerTimes();
            injectQuranModal();
        } else {
            currentUser = null;
            showScreen('landing-screen');
        }
        hideLoader();
    });
}

// === Toast Notification Logic (الرسالة اللطيفة) ===
function showToast(message) {
    let toast = document.getElementById('toast-notification');
    if (!toast) return;
    
    // إعداد النص
    toast.innerHTML = `<i data-lucide="smile" class="w-5 h-5"></i> <span>${message}</span>`;
    lucide.createIcons();
    
    // إظهار الرسالة
    toast.classList.remove('translate-y-[-150%]', 'opacity-0');
    
    // إخفاء بعد 4 ثواني
    setTimeout(() => {
        toast.classList.add('translate-y-[-150%]', 'opacity-0');
    }, 4000);
}

// تحميل إعدادات المستخدم الدائمة
async function loadGlobalSettings() {
    try {
        const doc = await db.collection('users').doc(currentUser.uid).get();
        if (doc.exists && doc.data().defaultSettings) {
            globalUserSettings = doc.data().defaultSettings;
        }
    } catch (e) { console.log("Error loading settings", e); }
}

// === 1. Prayer Times & Adhan ===

function initPrayerTimes() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(position => {
            fetchPrayerTimes(position.coords.latitude, position.coords.longitude);
        }, () => {
            fetchPrayerTimes(30.0444, 31.2357); // Cairo default
        });
    } else {
        fetchPrayerTimes(30.0444, 31.2357);
    }
    setInterval(checkAdhanTime, 60000);
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
        const timeParts = time.split(':');
        let hours = parseInt(timeParts[0]);
        const minutes = timeParts[1];
        const ampm = hours >= 12 ? 'م' : 'ص';
        hours = hours % 12;
        hours = hours ? hours : 12; 
        
        const timeEl = document.getElementById(`time-${key}`);
        if(timeEl) timeEl.innerText = `${hours}:${minutes} ${ampm}`;
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
            foundNext = true;
            break;
        }
    }
    if(!foundNext) {
        const sidebarMsg = document.getElementById('sidebar-message-box');
        if(sidebarMsg) sidebarMsg.innerHTML = `الصلاة القادمة: <b>الفجر</b> (غداً)`;
    }
}

function checkAdhanTime() {
    if(!prayerTimes || !adhanEnabled) return;
    const now = new Date();
    const currentH = now.getHours();
    const currentM = now.getMinutes();
    const prayersToCheck = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
    prayersToCheck.forEach(p => {
        const [h, m] = prayerTimes[p].split(':');
        if (parseInt(h) === currentH && parseInt(m) === currentM) playAdhan(p);
    });
}

function playAdhan(prayerName) {
    adhanAudio.play().catch(e => console.log("Audio play failed"));
    if (Notification.permission === "granted") new Notification(`حان الآن موعد صلاة ${prayerName}`);
    else if (Notification.permission !== "denied") Notification.requestPermission();
    showToast(`📢 حان الآن موعد صلاة ${prayerName}`);
}

// === 2. Quran Module ===

function injectQuranModal() {
    if (document.getElementById('quran-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'quran-modal';
    modal.className = 'fixed inset-0 bg-black/80 z-[90] hidden flex flex-col items-center justify-center p-4 backdrop-blur-sm';
    modal.innerHTML = `
        <div class="bg-white rounded-3xl w-full max-w-4xl h-[90vh] shadow-2xl overflow-hidden flex flex-col animate-[fadeIn_0.2s_ease-out]">
            <div class="p-4 border-b border-gray-100 flex justify-between items-center bg-[#ECFDF5]">
                <div class="flex items-center gap-3">
                    <h3 class="text-xl font-bold text-[#047857] flex gap-2"><i data-lucide="book-open"></i> المصحف الإلكتروني</h3>
                    <select id="surah-select" class="p-2 rounded-lg border border-gray-300 text-sm w-40" onchange="loadSurah(this.value)">
                        <option>اختر السورة...</option>
                    </select>
                </div>
                <button onclick="document.getElementById('quran-modal').classList.add('hidden')" class="text-gray-500 hover:text-red-500"><i data-lucide="x"></i></button>
            </div>
            <div id="quran-content" class="flex-1 overflow-y-auto p-6 text-center bg-[#fdfdfd]">
                <div class="flex flex-col items-center justify-center h-full text-gray-400">
                    <i data-lucide="book" class="w-16 h-16 mb-4 opacity-50"></i>
                    <p>اختر السورة لبدء القراءة</p>
                </div>
            </div>
        </div>`;
    document.body.appendChild(modal);
    fetchSurahList();
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
    } catch(e) {}
}

async function loadSurah(number) {
    const container = document.getElementById('quran-content');
    container.innerHTML = '<div class="text-center p-10"><div class="animate-spin w-8 h-8 border-4 border-[#047857] border-t-transparent rounded-full mx-auto"></div></div>';
    try {
        const res = await fetch(`https://api.alquran.cloud/v1/surah/${number}`);
        const data = await res.json();
        let html = `<h2 class="text-3xl font-bold text-[#047857] mb-6 font-serif">${data.data.name}</h2>`;
        html += `<div class="text-2xl leading-loose font-serif text-gray-800 text-justify" style="direction: rtl;">`;
        if(number != 1 && number != 9) html += `<div class="text-center mb-4 text-xl">بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</div>`;
        data.data.ayahs.forEach(ayah => {
            html += `${ayah.text.replace('بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ', '').trim()} <span class="text-[#047857] text-xl">۝${ayah.numberInSurah}</span> `;
        });
        html += `</div>`;
        container.innerHTML = html;
    } catch(e) { container.innerHTML = "حدث خطأ في تحميل السورة"; }
}
function openQuran() { const m=document.getElementById('quran-modal'); if(m) m.classList.remove('hidden'); else injectQuranModal(); }

// === Mobile Nav ===
function injectMobileNav() {
    if (document.getElementById('mobile-bottom-nav')) return;
    const mainContent = document.querySelector('#app-screen main > div');
    if(mainContent) mainContent.classList.add('pb-24');
    const nav = document.createElement('div');
    nav.id = 'mobile-bottom-nav';
    nav.className = 'md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50 flex justify-around items-center h-16 pb-safe';
    nav.innerHTML = `
        <button onclick="showScreen('app-screen')" class="flex flex-col items-center justify-center w-full h-full text-[#047857]">
            <i data-lucide="layout-dashboard" class="w-6 h-6"></i><span class="text-[10px] font-bold mt-1">يوميتي</span>
        </button>
        <button onclick="openQuran()" class="flex flex-col items-center justify-center w-full h-full text-gray-500 hover:text-[#047857]">
            <i data-lucide="book-open" class="w-6 h-6"></i><span class="text-[10px] font-bold mt-1">المصحف</span>
        </button>
        <button onclick="openReportModal()" class="flex flex-col items-center justify-center w-full h-full text-gray-500 hover:text-[#047857]">
            <i data-lucide="bar-chart-2" class="w-6 h-6"></i><span class="text-[10px] font-bold mt-1">تقارير</span>
        </button>
        <button onclick="openSettingsModal()" class="flex flex-col items-center justify-center w-full h-full text-gray-500 hover:text-[#047857]">
            <i data-lucide="settings" class="w-6 h-6"></i><span class="text-[10px] font-bold mt-1">إعدادات</span>
        </button>`;
    document.body.appendChild(nav);
    lucide.createIcons();
}

// === Date & Data Loading ===
function getFormattedDateID(date) {
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - (offset*60*1000));
    return localDate.toISOString().split('T')[0];
}
function getReadableDate(date) { return date.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); }
function isToday(date) { return getFormattedDateID(date) === getFormattedDateID(new Date()); }

function changeDate(days) {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + days);
    if (newDate > new Date()) return;
    currentDate = newDate;
    loadUserDataForDate(currentDate);
}

function updateDateUI() {
    const dateStr = getReadableDate(currentDate);
    document.getElementById('current-date-display').innerText = dateStr;
    const nextBtn = document.getElementById('btn-next-day');
    if(nextBtn) {
        if (isToday(currentDate)) { nextBtn.disabled = true; nextBtn.classList.add('opacity-30'); } 
        else { nextBtn.disabled = false; nextBtn.classList.remove('opacity-30'); }
    }
    const isReadOnly = !isToday(currentDate);
    const tasks = document.getElementById('tasks-container');
    const adhkar = document.getElementById('adhkar-container');
    const addBtn = document.getElementById('btn-add-dhikr');
    const badge = document.querySelector('.read-only-badge');
    const motive = document.getElementById('motivational-text');

    if (isReadOnly) {
        if(tasks) tasks.classList.add('read-only-mode');
        if(adhkar) adhkar.classList.add('read-only-mode');
        if(addBtn) addBtn.classList.add('hidden');
        if(badge) badge.style.display = 'inline-flex';
        if(motive) motive.innerText = "عرض أرشيف سابق";
    } else {
        if(tasks) tasks.classList.remove('read-only-mode');
        if(adhkar) adhkar.classList.remove('read-only-mode');
        if(addBtn) addBtn.classList.remove('hidden');
        if(badge) badge.style.display = 'none';
        if(motive) motive.innerText = "كيف هي همتك اليوم؟";
    }
}

function loadUserDataForDate(date) {
    if (unsubscribeSnapshot) unsubscribeSnapshot();
    const dateID = getFormattedDateID(date);
    updateDateUI();

    unsubscribeSnapshot = db.collection('users').doc(currentUser.uid)
        .collection('daily_logs').doc(dateID)
        .onSnapshot(doc => {
            if (doc.exists) {
                const data = doc.data();
                lastUserData = data;
                renderTasks(data);
                renderAdhkar(data.customAdhkar || []);
                updateDashboardStats(data);
            } else {
                if (isToday(date)) {
                    const initialData = JSON.parse(JSON.stringify(DEFAULT_USER_DATA));
                    if (globalUserSettings) {
                        initialData.habitSettings = globalUserSettings;
                    }
                    db.collection('users').doc(currentUser.uid)
                        .collection('daily_logs').doc(dateID)
                        .set(initialData);
                } else {
                    lastUserData = DEFAULT_USER_DATA;
                    renderTasks(DEFAULT_USER_DATA);
                    renderAdhkar([]);
                    updateDashboardStats(DEFAULT_USER_DATA);
                }
            }
            const name = currentUser.displayName || currentUser.email.split('@')[0];
            document.getElementById('user-name-display').innerText = name;
            document.getElementById('welcome-name').innerText = name;
            document.getElementById('user-avatar').innerText = name[0].toUpperCase();
        });
}

function renderTasks(data) {
    const container = document.getElementById('tasks-container');
    container.innerHTML = '';
    if (!data || !data.prayers) return;

    let html = `<div><div class="flex items-center gap-3 mb-5"><div class="w-1.5 h-8 bg-[#047857] rounded-full"></div><h3 class="text-xl font-bold text-gray-800">الفرائض وورد القرآن</h3></div><div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">`;
    const pNames = { fajr: 'الفجر', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };
    
    for (const [k, v] of Object.entries(data.prayers)) {
        html += `<div class="bg-white p-5 rounded-2xl border transition-all hover:-translate-y-1 flex justify-between items-center cursor-pointer ${v?'border-green-200 bg-green-50/50':'border-gray-100'}" onclick="toggleTask('prayers','${k}',${!v})">
            <div class="flex gap-4 items-center">
                <div class="w-10 h-10 rounded-full flex items-center justify-center ${v?'bg-[#047857] text-white':'bg-gray-100 text-gray-400'}"><i data-lucide="${v?'check':'clock'}" class="w-5 h-5"></i></div>
                <div><span class="block font-bold text-lg ${v?'text-[#047857]':'text-gray-600'}">${pNames[k]}</span><span id="time-${k}" class="text-xs text-gray-400 font-bold">--:--</span></div>
            </div>
        </div>`;
    }

    const quranDone = (typeof data.quran !== 'undefined') ? data.quran : (data.habits?.quran || false);
    html += `<div class="bg-white p-5 rounded-2xl border transition-all hover:-translate-y-1 flex justify-between items-center cursor-pointer ${quranDone?'border-green-200 bg-green-50/50':'border-gray-100'}" onclick="toggleTask('root','quran',${!quranDone})">
            <div class="flex gap-4 items-center">
                <div class="w-10 h-10 rounded-full flex items-center justify-center ${quranDone?'bg-[#047857] text-white':'bg-gray-100 text-gray-400'}"><i data-lucide="book-open" class="w-5 h-5"></i></div>
                <div><span class="block font-bold text-lg ${quranDone?'text-[#047857]':'text-gray-600'}">ورد القرآن</span><span class="text-xs text-gray-400 cursor-pointer hover:text-[#047857]" onclick="event.stopPropagation(); openQuran()">📖 اقرأ الآن</span></div>
            </div>
        </div></div></div>`;

    const userSettings = data.habitSettings || (globalUserSettings || DEFAULT_USER_DATA.habitSettings);
    const activeHabits = Object.keys(userSettings).filter(key => userSettings[key]);
    
    if (activeHabits.length > 0) {
        html += `<div class="mt-10"><div class="flex items-center gap-3 mb-5"><div class="w-1.5 h-8 bg-[#D4AF37] rounded-full"></div><h3 class="text-xl font-bold text-gray-800">السنن المختارة</h3></div><div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">`;
        for (const key of activeHabits) {
            const meta = HABITS_META[key];
            if (!meta) continue;
            const v = data.habits[key] || false;
            html += `<div class="bg-white p-5 rounded-2xl border transition-all hover:-translate-y-1 flex justify-between items-center cursor-pointer ${v?'border-yellow-200 bg-yellow-50/50':'border-gray-100'}" onclick="toggleTask('habits','${key}',${!v})">
                <div class="flex gap-4 items-center">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center ${v?'bg-yellow-500 text-white':'bg-gray-100 text-gray-400'}"><i data-lucide="${meta.icon}" class="w-5 h-5"></i></div>
                    <span class="font-bold text-lg ${v?'text-yellow-700':'text-gray-600'}">${meta.name}</span>
                </div>
            </div>`;
        }
        html += `</div></div>`;
    }
    container.innerHTML = html;
    lucide.createIcons();
    updatePrayerUI();
}

// === Adhkar Logic (Edited: FIXED Increment & String Concatenation Issue) ===
function renderAdhkar(list) {
    const container = document.getElementById('adhkar-container');
    if(!container) return;
    
    let total = 0;
    let html = '';

    list.forEach((item, index) => {
        // Ensure count is a number for math logic
        let countVal = parseInt(item.count) || 0;
        total += countVal;
        
        const progress = Math.min((countVal / (item.target || 100)) * 100, 100);
        
        html += `
            <div class="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm relative overflow-hidden group">
                <div class="flex justify-between items-start mb-2 relative z-10">
                    <div><h4 class="font-bold text-gray-800 text-lg">${item.name}</h4><span class="text-xs text-gray-400">الهدف: ${item.target}</span></div>
                    <button onclick="removeAdhkar(${index})" class="text-gray-300 hover:text-red-400"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>
                <div class="flex justify-between items-end relative z-10 mt-2">
                    <div class="flex items-baseline gap-1">
                        <!-- حقل الإدخال: يمكن الكتابة فيه مباشرة -->
                        <input type="number" value="${countVal}" 
                            onchange="updateAdhkarCount(${index}, this.value)"
                            onkeydown="if(event.key === 'Enter') this.blur()"
                            class="text-3xl font-bold text-blue-600 bg-transparent border-b-2 border-gray-200 hover:border-blue-400 focus:border-blue-600 focus:outline-none w-24 p-0 m-0 transition-colors"
                            placeholder="0">
                    </div>
                    <!-- زر الزيادة: يرفع الرقم تلقائياً عند الضغط عليه (تم تغيير الأيقونة لقلب) -->
                    <button onclick="incrementAdhkar(${index})" class="click-anim w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 shadow-lg shadow-blue-200 active:scale-95 transition-transform">
                        <i data-lucide="heart" class="w-6 h-6"></i>
                    </button>
                </div>
                <div class="absolute bottom-0 left-0 h-1.5 bg-blue-100 w-full"><div class="h-full bg-blue-500 transition-all duration-300" style="width: ${progress}%"></div></div>
            </div>`;
    });

    container.innerHTML = html;
    const totalEl = document.getElementById('total-adhkar-count');
    if(totalEl) totalEl.innerText = total;
    lucide.createIcons();
}

function toggleTask(cat, key, val) {
    if (!isToday(currentDate)) return;
    const dateID = getFormattedDateID(currentDate);
    const update = {};
    if (cat === 'root') update[key] = val; else update[`${cat}.${key}`] = val;
    db.collection('users').doc(currentUser.uid).collection('daily_logs').doc(dateID).update(update);
}

async function addNewDhikr() {
    if (!isToday(currentDate)) return; 
    const name = document.getElementById('new-dhikr-name').value;
    const target = parseInt(document.getElementById('new-dhikr-target').value) || 100;
    if(!name) return alert("أدخل اسم الذكر");
    const dateID = getFormattedDateID(currentDate);
    const docRef = db.collection('users').doc(currentUser.uid).collection('daily_logs').doc(dateID);
    const doc = await docRef.get();
    let currentList = doc.exists ? (doc.data().customAdhkar || []) : [];
    // Ensure new items have numeric count
    currentList.push({ name, count: 0, target });
    await docRef.update({ customAdhkar: currentList });
    toggleAdhkarModal();
    document.getElementById('new-dhikr-name').value = '';
}

async function updateAdhkarCount(index, val) {
    if (!isToday(currentDate)) return;
    const newVal = parseInt(val) || 0;
    const dateID = getFormattedDateID(currentDate);
    const docRef = db.collection('users').doc(currentUser.uid).collection('daily_logs').doc(dateID);
    const doc = await docRef.get();
    let list = doc.data().customAdhkar;
    list[index].count = newVal;
    await docRef.update({ customAdhkar: list });
}

async function incrementAdhkar(index) {
    if (!isToday(currentDate)) return;
    const dateID = getFormattedDateID(currentDate);
    const docRef = db.collection('users').doc(currentUser.uid).collection('daily_logs').doc(dateID);
    const doc = await docRef.get();
    let list = doc.data().customAdhkar;
    
    // FIX: Force numeric addition to prevent string concatenation (e.g., "1" + 1 = "11")
    let currentCount = parseInt(list[index].count) || 0;
    list[index].count = currentCount + 1;
    
    await docRef.update({ customAdhkar: list });
}

async function removeAdhkar(index) {
    if (!isToday(currentDate)) return;
    if(!confirm("حذف؟")) return;
    const dateID = getFormattedDateID(currentDate);
    const docRef = db.collection('users').doc(currentUser.uid).collection('daily_logs').doc(dateID);
    const doc = await docRef.get();
    let list = doc.data().customAdhkar;
    list.splice(index, 1);
    await docRef.update({ customAdhkar: list });
}
function toggleAdhkarModal() { document.getElementById('adhkar-modal').classList.toggle('hidden'); }

// === Settings Logic ===
function injectSettingsUI() {
    const sidebarNav = document.querySelector('aside .flex-1.space-y-3');
    if (sidebarNav && !document.getElementById('btn-settings-sidebar')) {
        const btn = document.createElement('button');
        btn.id = 'btn-settings-sidebar';
        btn.className = "w-full flex items-center gap-4 px-6 py-4 text-gray-600 hover:bg-gray-50 hover:text-[#047857] rounded-l-2xl font-bold transition-all";
        btn.innerHTML = `<i data-lucide="settings"></i> إعدادات العبادات`;
        btn.onclick = openSettingsModal;
        sidebarNav.appendChild(btn);
        lucide.createIcons();
    }
    if (!document.getElementById('settings-modal')) {
        const modal = document.createElement('div');
        modal.id = 'settings-modal';
        modal.className = 'fixed inset-0 bg-black/60 z-[80] hidden flex items-center justify-center p-4 backdrop-blur-md';
        modal.innerHTML = `
            <div class="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-[fadeIn_0.2s_ease-out]">
                <div class="p-6 border-b border-gray-100 flex justify-between items-center bg-[#ECFDF5]">
                    <div><h3 class="text-xl font-bold text-[#047857]">تخصيص السنن</h3><p class="text-xs text-gray-500">هذه التعديلات ستحفظ كإعدادات دائمة لك</p></div>
                    <button onclick="closeSettingsModal()" class="text-gray-400 hover:text-red-500"><i data-lucide="x"></i></button>
                </div>
                <div class="p-6 max-h-[60vh] overflow-y-auto space-y-3" id="settings-toggles-container"></div>
                <div class="px-6 pb-2">
                    <div class="flex items-center justify-between p-4 bg-green-50 rounded-xl border border-green-100">
                        <div class="flex items-center gap-3"><div class="bg-white p-2 rounded-lg text-[#047857]"><i data-lucide="volume-2" class="w-5 h-5"></i></div><span class="font-bold text-gray-700">صوت الأذان</span></div>
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" class="sr-only peer" id="adhan-toggle" checked onchange="adhanEnabled = this.checked">
                            <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#047857]"></div>
                        </label>
                    </div>
                </div>
                <div class="p-6 border-t border-gray-100 bg-gray-50 flex justify-end"><button onclick="saveSettings()" class="px-8 py-3 bg-[#047857] text-white rounded-xl font-bold hover:bg-[#065f46] shadow-lg transition-all">حفظ وتثبيت</button></div>
            </div>`;
        document.body.appendChild(modal);
        lucide.createIcons();
    }
}

function openSettingsModal() {
    if (!lastUserData) return;
    const container = document.getElementById('settings-toggles-container');
    container.innerHTML = '';
    const settings = lastUserData.habitSettings || DEFAULT_USER_DATA.habitSettings;
    for (const [key, meta] of Object.entries(HABITS_META)) {
        const isChecked = settings[key] || false;
        container.innerHTML += `
            <div class="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                <div class="flex items-center gap-3"><div class="bg-white p-2 rounded-lg text-yellow-600"><i data-lucide="${meta.icon}" class="w-5 h-5"></i></div><span class="font-bold text-gray-700">${meta.name}</span></div>
                <label class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" class="sr-only peer setting-toggle" data-key="${key}" ${isChecked ? 'checked' : ''}>
                    <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#047857]"></div>
                </label>
            </div>`;
    }
    document.getElementById('settings-modal').classList.remove('hidden');
    lucide.createIcons();
}

function closeSettingsModal() { document.getElementById('settings-modal').classList.add('hidden'); }

async function saveSettings() {
    const checkboxes = document.querySelectorAll('.setting-toggle');
    const newSettings = { ... (lastUserData.habitSettings || {}) };
    checkboxes.forEach(cb => { newSettings[cb.dataset.key] = cb.checked; });
    
    if (isToday(currentDate)) {
        const dateID = getFormattedDateID(currentDate);
        await db.collection('users').doc(currentUser.uid).collection('daily_logs').doc(dateID).update({ habitSettings: newSettings });
    }

    await db.collection('users').doc(currentUser.uid).set({ defaultSettings: newSettings }, { merge: true });
    globalUserSettings = newSettings; 

    showToast("تم حفظ التعديلات وتثبيتها للأيام القادمة ✅");
    closeSettingsModal();
}

// === Chart & Report Logic ===
function initChart() {
    const ctx = document.getElementById('performanceChart');
    if(!ctx) return;
    if (performanceChartInstance) performanceChartInstance.destroy();
    performanceChartInstance = new Chart(ctx, { type: 'doughnut', data: { labels: ['منجز', 'متبقي'], datasets: [{ data: [0, 100], backgroundColor: ['#047857', '#E5E7EB'], borderWidth: 0, cutout: '75%' }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, animation: { animateScale: true, animateRotate: true } } });
}
function updateDashboardStats(data) {
    let total = 0, done = 0;
    if (data.prayers) Object.values(data.prayers).forEach(v => { total++; if(v) done++; });
    const quranDone = (typeof data.quran !== 'undefined') ? data.quran : (data.habits?.quran || false);
    total++; if(quranDone) done++;
    const activeHabits = data.habitSettings || (globalUserSettings || DEFAULT_USER_DATA.habitSettings);
    for (const key of Object.keys(activeHabits)) { if(activeHabits[key] && HABITS_META[key]) { total++; if(data.habits[key]) done++; } }
    const percent = total === 0 ? 0 : Math.round((done / total) * 100);
    const percentEl = document.getElementById('chart-percent');
    if(percentEl) percentEl.innerText = `${percent}%`;
    if (performanceChartInstance) { performanceChartInstance.data.datasets[0].data = [percent, 100 - percent]; performanceChartInstance.update(); }
    let msgData = percent >= 80 ? MESSAGES_DB.high : (percent >= 50 ? MESSAGES_DB.medium : MESSAGES_DB.low);
    document.getElementById('feedback-title').innerText = msgData.title;
    document.getElementById('feedback-body').innerText = msgData.body;
    document.getElementById('feedback-link').href = msgData.link;
    const sidebarMsg = document.getElementById('sidebar-message-box');
    if(sidebarMsg && !sidebarMsg.innerText.includes('الصلاة القادمة')) sidebarMsg.innerText = msgData.sidebar;
}

function openReportModal() {
    const dateStr = getReadableDate(currentDate); 
    const name = currentUser.displayName || "مستخدم تزكية";
    const percent = document.getElementById('chart-percent').innerText;
    const totalAdhkar = document.getElementById('total-adhkar-count').innerText;
    document.getElementById('report-date').innerText = dateStr;
    document.getElementById('report-user').innerText = name;
    document.getElementById('report-percent').innerText = percent;
    document.getElementById('report-adhkar').innerText = totalAdhkar;
    
    const listEl = document.getElementById('report-tasks-list');
    listEl.innerHTML = '';
    if(lastUserData) {
        const pNames = { fajr: 'الفجر', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };
        for (const [k, v] of Object.entries(lastUserData.prayers)) { if(v) listEl.innerHTML += `<li class="flex items-center gap-2 text-green-700"><span class="w-2 h-2 rounded-full bg-green-500"></span> صلاة ${pNames[k]}</li>`; }
        const quranDone = (typeof lastUserData.quran !== 'undefined') ? lastUserData.quran : (lastUserData.habits?.quran || false);
        if(quranDone) listEl.innerHTML += `<li class="flex items-center gap-2 text-green-700"><span class="w-2 h-2 rounded-full bg-green-500"></span> ورد القرآن</li>`;
        const activeHabits = lastUserData.habitSettings || DEFAULT_USER_DATA.habitSettings;
        for (const [k, v] of Object.entries(lastUserData.habits || {})) { if(v && activeHabits[k] && HABITS_META[k]) listEl.innerHTML += `<li class="flex items-center gap-2 text-yellow-700"><span class="w-2 h-2 rounded-full bg-yellow-500"></span> ${HABITS_META[k].name}</li>`; }
    }
    document.getElementById('report-modal').classList.remove('hidden');
}

async function exportPeriodReport(days) {
    const btnText = days === 7 ? 'تقرير أسبوعي' : 'تقرير شهري';
    if(!confirm(`هل تريد استخراج ${btnText} بناءً على الأيام المسجلة؟`)) return;

    try {
        const snapshot = await db.collection('users').doc(currentUser.uid)
            .collection('daily_logs')
            .orderBy(firebase.firestore.FieldPath.documentId(), 'desc')
            .limit(days)
            .get();

        if (snapshot.empty) return alert("لا توجد بيانات مسجلة كافية.");

        const rows = [["تقرير تزكية الدوري"], ["نوع التقرير", btnText], ["تاريخ الاستخراج", new Date().toLocaleDateString('ar-EG')], [], ["التاريخ", "نسبة الإنجاز", "مجموع الأذكار"]];
        
        let totalPercent = 0;
        let count = 0;

        snapshot.forEach(doc => {
            const data = doc.data();
            const dateID = doc.id;
            
            let totalTasks = 0, doneTasks = 0;
            if (data.prayers) Object.values(data.prayers).forEach(v => { totalTasks++; if(v) doneTasks++; });
            const quranDone = (typeof data.quran !== 'undefined') ? data.quran : (data.habits?.quran || false);
            totalTasks++; if(quranDone) doneTasks++;
            const habits = data.habits || {};
            const settings = data.habitSettings || {}; 
            for(const hKey in habits) {
                if(settings[hKey] && HABITS_META[hKey]) {
                    totalTasks++;
                    if(habits[hKey]) doneTasks++;
                }
            }
            const dayPercent = totalTasks === 0 ? 0 : Math.round((doneTasks/totalTasks)*100);
            
            let adhkarSum = 0;
            (data.customAdhkar || []).forEach(a => adhkarSum += (a.count || 0));

            rows.push([dateID, `${dayPercent}%`, adhkarSum]);
            
            totalPercent += dayPercent;
            count++;
        });

        rows.push([], ["المتوسط العام", `${Math.round(totalPercent/count)}%`, "-"]);

        const ws = XLSX.utils.aoa_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Period Report");
        XLSX.writeFile(wb, `Tazkiyah_Report_${days}Days_${Date.now()}.xlsx`);

    } catch (e) { console.error(e); alert("حدث خطأ أثناء جلب البيانات."); }
}

function closeReportModal() { document.getElementById('report-modal').classList.add('hidden'); }
function downloadAsImage() { const e=document.getElementById('report-preview-content'); html2canvas(e).then(c=>{const l=document.createElement('a'); l.download=`Report-${Date.now()}.png`; l.href=c.toDataURL(); l.click();}); }
function downloadAsPDF() { const e=document.getElementById('report-preview-content'); const {jsPDF}=window.jspdf; html2canvas(e).then(c=>{const i=c.toDataURL('image/png'); const p=new jsPDF('p','mm','a4'); const w=p.internal.pageSize.getWidth(); const h=(c.height*w)/c.width; p.addImage(i,'PNG',0,10,w,h); p.save(`Report-${Date.now()}.pdf`);}); }
function downloadAsExcel() {
    if(!lastUserData) return;
    const rows = [["تقرير تزكية اليومي"],["التاريخ", getReadableDate(currentDate)],["النسبة", document.getElementById('chart-percent').innerText],[],["العبادة","الحالة"]];
    const pNames = { fajr: 'الفجر', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };
    for (const [k, v] of Object.entries(lastUserData.prayers)) rows.push([`صلاة ${pNames[k]}`, v?"تم":"لم يتم"]);
    rows.push(["ورد القرآن", (lastUserData.quran||lastUserData.habits?.quran)?"تم":"لم يتم"]);
    const activeHabits = lastUserData.habitSettings || DEFAULT_USER_DATA.habitSettings;
    for (const [k, v] of Object.entries(lastUserData.habits || {})) { if(activeHabits[k] && HABITS_META[k]) rows.push([HABITS_META[k].name, v?"تم":"لم يتم"]); }
    const ws = XLSX.utils.aoa_to_sheet(rows); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Report"); XLSX.writeFile(wb, `Report-${Date.now()}.xlsx`);
}

// === Boilerplate ===
function hideLoader() { const l=document.getElementById('loader'); if(l){l.style.opacity='0'; setTimeout(()=>l.style.display='none',500);} }
function showScreen(id) { ['landing-screen','auth-screen','app-screen'].forEach(s=>{document.getElementById(s).classList.add('hidden')}); document.getElementById(id).classList.remove('hidden'); if(id==='app-screen') setTimeout(initChart,100); }
function goToAuth(m) { showScreen('auth-screen'); switchAuthMode(m); }
function showLandingScreen() { showScreen('landing-screen'); }
function switchAuthMode(m) {
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('register-form').classList.add('hidden');
    document.getElementById('reset-form').classList.add('hidden');
    document.getElementById('auth-tabs').classList.remove('hidden');
    document.getElementById('auth-error').classList.add('hidden');
    if(m==='login') document.getElementById('login-form').classList.remove('hidden');
    else if(m==='register') document.getElementById('register-form').classList.remove('hidden');
    else { document.getElementById('reset-form').classList.remove('hidden'); document.getElementById('auth-tabs').classList.add('hidden'); }
}
async function handleLogin(e){ e.preventDefault(); try{ await auth.signInWithEmailAndPassword(document.getElementById('login-email').value, document.getElementById('login-password').value); }catch(err){showAuthError("خطأ في الدخول");} }
async function handleRegister(e){ e.preventDefault(); try{ const c=await auth.createUserWithEmailAndPassword(document.getElementById('reg-email').value, document.getElementById('reg-password').value); await c.user.updateProfile({displayName:document.getElementById('reg-name').value}); }catch(err){showAuthError(err.message);} }
async function handleResetPassword(e){ e.preventDefault(); try{ await auth.sendPasswordResetEmail(document.getElementById('reset-email').value); alert("تم الإرسال"); switchAuthMode('login'); }catch(err){showAuthError(err.message);} }
async function handleLogout(){ if(unsubscribeSnapshot) unsubscribeSnapshot(); await auth.signOut(); showScreen('landing-screen'); }
function showAuthError(m){ const e=document.getElementById('auth-error'); e.innerText=m; e.classList.remove('hidden'); }