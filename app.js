import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, sendPasswordResetEmail, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

let currentUser = null;
let unsubscribeSnapshot = null;
let performanceChartInstance = null;
let lastUserData = null; // يحمل بيانات اليوم الحالي
let globalUserSettings = null; // يحمل الإعدادات العامة (الموقع، السنن المفضلة)
let currentDate = new Date();

// === متغيرات الموقع والصلاة ===
let prayerTimes = null; 
let adhanAudio = new Audio('https://www.islamcan.com/audio/adhan/azan2.mp3'); 
let adhanEnabled = true;

// === متغيرات المصحف ===
let quranAudio = new Audio();
let currentSurahAyahs = [];
let currentAyahIndex = 0;
let verseRepeatCount = 1;
let currentVerseRepeat = 0;
let isPlaying = false;
let currentReciterId = "ar.alafasy"; 

// === ثوابت النظام ===
const HABITS_META = {
    rawatib: { name: 'السنن الرواتب (12)', icon: 'layers' },
    duha: { name: 'صلاة الضحى', icon: 'sun' },
    witr: { name: 'صلاة الوتر', icon: 'moon' },
    azkar_m: { name: 'أذكار الصباح', icon: 'sunrise' },
    azkar_e: { name: 'أذكار المساء', icon: 'sunset' },
    azkar_s: { name: 'أذكار النوم', icon: 'star' },
    fasting_mon: { name: 'صيام الاثنين', icon: 'calendar' },
    fasting_thu: { name: 'صيام الخميس', icon: 'calendar' },
    qiyam: { name: 'قيام الليل', icon: 'star' }
};

const DEFAULT_HABIT_SETTINGS = { 
    rawatib: true, duha: true, witr: true, azkar_m: true, azkar_e: true, azkar_s: true, fasting_mon: false, fasting_thu: false, qiyam: false 
};

const DEFAULT_LOCATION_SETTINGS = {
    mode: 'auto', // 'auto' or 'manual'
    city: 'Cairo',
    country: 'Egypt',
    lat: null,
    lng: null
};

const MESSAGES_DB = {
    high: { title: "ما شاء الله.. ثبات رائع! 🌟", body: "أداء ممتاز اليوم. هذا الثبات نعمة عظيمة، اسأل الله أن يديمها عليك.", link: "#" },
    medium: { title: "أحسنت.. واصل المسير ✨", body: "قطعت شوطاً جيداً، جاهد نفسك في الباقي.", link: "#" },
    low: { title: "بداية جديدة.. استعن بالله 🌿", body: "لا تيأس، المهم ألا تتوقف. جدد نيتك الآن.", link: "#" }
};

// ================= INITIALIZATION =================
const initAuth = async () => {
    if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
    } else {
        await signInAnonymously(auth);
    }
};

initAuth().then(() => {
    if (typeof lucide !== 'undefined') lucide.createIcons();
    
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            window.showScreen('app-screen');
            currentDate = new Date();
            
            // 1. Load Global Settings First (Location, Habits Prefs)
            await loadGlobalSettings();
            
            // 2. Then Load Daily Data
            loadUserDataForDate(currentDate);
            
            // 3. Init UI components
            injectSettingsUI(); 
            injectMobileNav(); 
            initPrayerTimes(); 
            injectQuranModal();
            injectManualCountModal(); 
            requestNotificationPermission(); 
        } else {
            currentUser = null;
            window.showScreen('landing-screen');
        }
        hideLoader();
    });
});

// ================= SETTINGS PERSISTENCE =================
async function loadGlobalSettings() {
    const userRef = doc(db, 'artifacts', appId, 'users', currentUser.uid);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
        const data = userSnap.data();
        globalUserSettings = {
            habitSettings: data.habitSettings || DEFAULT_HABIT_SETTINGS,
            locationSettings: data.locationSettings || DEFAULT_LOCATION_SETTINGS
        };
    } else {
        globalUserSettings = {
            habitSettings: DEFAULT_HABIT_SETTINGS,
            locationSettings: DEFAULT_LOCATION_SETTINGS
        };
        // Save defaults
        await setDoc(userRef, globalUserSettings, { merge: true });
    }
}

async function saveGlobalSettings(newSettingsPart) {
    const userRef = doc(db, 'artifacts', appId, 'users', currentUser.uid);
    await updateDoc(userRef, newSettingsPart);
    
    // Update local state
    globalUserSettings = { ...globalUserSettings, ...newSettingsPart };
    
    // Re-render UI to reflect changes (e.g. show/hide habits)
    if(lastUserData) renderTasks(lastUserData);
    if(newSettingsPart.locationSettings) initPrayerTimes(); // Refresh prayer times if location changed
}

// ================= PRAYER TIMES (Advanced) =================
window.initPrayerTimes = function() {
    const loc = globalUserSettings.locationSettings;
    
    if (loc.mode === 'manual' && loc.city && loc.country) {
        fetchPrayerTimesByCity(loc.city, loc.country);
    } else {
        // Auto mode
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                pos => fetchPrayerTimesByCoords(pos.coords.latitude, pos.coords.longitude),
                () => fetchPrayerTimesByCity('Cairo', 'Egypt') // Fallback
            );
        } else {
            fetchPrayerTimesByCity('Cairo', 'Egypt');
        }
    }
    setInterval(checkTimeForAlerts, 60000);
};

async function fetchPrayerTimesByCoords(lat, lng) {
    const date = new Date();
    const url = `https://api.aladhan.com/v1/timings/${date.getDate()}-${date.getMonth()+1}-${date.getFullYear()}?latitude=${lat}&longitude=${lng}&method=4`;
    processPrayerFetch(url);
}

async function fetchPrayerTimesByCity(city, country) {
    const date = new Date();
    const url = `https://api.aladhan.com/v1/timingsByCity/${date.getDate()}-${date.getMonth()+1}-${date.getFullYear()}?city=${city}&country=${country}&method=4`;
    processPrayerFetch(url);
}

async function processPrayerFetch(url) {
    try {
        const response = await fetch(url);
        const data = await response.json();
        if(data.code === 200) {
            prayerTimes = data.data.timings;
            updatePrayerUI();
            
            // Update sidebar info
            const sidebarMsg = document.getElementById('sidebar-message-box');
            if(sidebarMsg) {
                const hijri = data.data.date.hijri;
                sidebarMsg.innerHTML = `<div class="font-bold mb-1 text-[#047857]">${hijri.day} ${hijri.month.ar} ${hijri.year}</div><div>${data.data.meta.timezone}</div>`;
            }
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

function checkTimeForAlerts() {
    if(!prayerTimes || !adhanEnabled) return;
    const now = new Date();
    const currentH = now.getHours();
    const currentM = now.getMinutes();
    
    ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'].forEach(p => {
        const [h, m] = prayerTimes[p].split(':');
        if (parseInt(h) === currentH && parseInt(m) === currentM) {
            adhanAudio.play().catch(e => console.log("Audio interaction needed"));
            if (Notification.permission === "granted") new Notification(`📢 حان الآن موعد صلاة ${p}`);
        }
    });
}

// ================= DATA LOADING & UI =================
function loadUserDataForDate(date) {
    if (unsubscribeSnapshot) unsubscribeSnapshot();
    const dateID = getFormattedDateID(date);
    updateDateUI();
    
    const docRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'daily_logs', dateID);
    
    unsubscribeSnapshot = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) { 
            const data = docSnap.data(); 
            lastUserData = data; 
            renderTasks(data); 
            renderAdhkar(data.customAdhkar || []); 
            updateDashboardStats(data); 
        } else { 
            // If today, create with defaults BUT do not overwrite global settings preference
            // We just create the structure for progress
            const initialData = {
                prayers: { fajr: false, dhuhr: false, asr: false, maghrib: false, isha: false },
                quran: false,
                habits: {}, // Will be populated based on global settings dynamically
                customAdhkar: []
            };
            
            // Populate habit keys based on global settings for tracking
            if(globalUserSettings && globalUserSettings.habitSettings) {
                for (const key in globalUserSettings.habitSettings) {
                     if(globalUserSettings.habitSettings[key]) initialData.habits[key] = false;
                }
            }
            
            if (isToday(date)) {
                setDoc(docRef, initialData); 
            } else { 
                lastUserData = initialData; 
                renderTasks(initialData); 
                renderAdhkar([]); 
                updateDashboardStats(initialData); 
            } 
        }
        
        // Update User Name
        const name = currentUser.displayName || "مستخدم";
        document.querySelectorAll('#user-name-display, #welcome-name').forEach(el => el.innerText = name);
        document.getElementById('user-avatar').innerText = name[0].toUpperCase();
    });
}

function renderTasks(data) {
    const container = document.getElementById('tasks-container'); container.innerHTML = '';
    if (!data || !data.prayers) return;
    
    // 1. Prayers Section
    let html = `<div><div class="flex items-center gap-2 mb-4"><div class="w-1 h-6 bg-[#047857] rounded-full"></div><h3 class="text-lg font-bold text-gray-800">الفرائض</h3></div><div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">`;
    const pNames = { fajr: 'الفجر', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };
    
    for (const [k, v] of Object.entries(data.prayers)) {
        html += `
        <div class="bg-white p-4 rounded-xl border transition-all hover:shadow-md cursor-pointer flex justify-between items-center group ${v?'border-green-200 bg-green-50/30':'border-gray-100 hover:border-green-100'}" onclick="window.toggleTask('prayers','${k}',${!v})">
            <div class="flex gap-3 items-center">
                <div class="w-8 h-8 rounded-full flex items-center justify-center transition-colors ${v?'bg-[#047857] text-white':'bg-gray-100 text-gray-400 group-hover:bg-green-100 group-hover:text-green-600'}">
                    <i data-lucide="${v?'check':'clock'}" class="w-4 h-4"></i>
                </div>
                <div>
                    <span class="block font-bold text-sm ${v?'text-[#047857]':'text-gray-700'}">${pNames[k]}</span>
                    <span id="time-${k}" class="text-[10px] text-gray-400 font-bold">--:--</span>
                </div>
            </div>
            ${v ? '<i data-lucide="check-circle-2" class="w-5 h-5 text-green-500"></i>' : ''}
        </div>`;
    }

    // Quran
    const quranDone = (typeof data.quran !== 'undefined') ? data.quran : (data.habits?.quran || false);
    html += `
    <div class="bg-white p-4 rounded-xl border transition-all hover:shadow-md cursor-pointer flex justify-between items-center group ${quranDone?'border-green-200 bg-green-50/30':'border-gray-100 hover:border-green-100'}" onclick="window.toggleTask('root','quran',${!quranDone})">
        <div class="flex gap-3 items-center">
            <div class="w-8 h-8 rounded-full flex items-center justify-center transition-colors ${quranDone?'bg-[#047857] text-white':'bg-gray-100 text-gray-400 group-hover:bg-green-100 group-hover:text-green-600'}">
                <i data-lucide="book-open" class="w-4 h-4"></i>
            </div>
            <div>
                <span class="block font-bold text-sm ${quranDone?'text-[#047857]':'text-gray-700'}">ورد القرآن</span>
                <span class="text-[10px] text-gray-400 cursor-pointer hover:text-[#047857] underline" onclick="event.stopPropagation(); window.openQuran()">فتح المصحف</span>
            </div>
        </div>
        ${quranDone ? '<i data-lucide="check-circle-2" class="w-5 h-5 text-green-500"></i>' : ''}
    </div></div></div>`;

    // 2. Habits Section (Based on Global Settings)
    const activeHabits = globalUserSettings.habitSettings || DEFAULT_HABIT_SETTINGS;
    const habitsToShow = Object.keys(activeHabits).filter(key => activeHabits[key]);
    
    if (habitsToShow.length > 0) {
        html += `<div class="mt-8"><div class="flex items-center gap-2 mb-4"><div class="w-1 h-6 bg-[#D4AF37] rounded-full"></div><h3 class="text-lg font-bold text-gray-800">السنن والنوافل</h3></div><div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">`;
        for (const key of habitsToShow) {
            const meta = HABITS_META[key]; 
            if (!meta) continue; 
            const v = data.habits ? (data.habits[key] || false) : false; 
            html += `
            <div class="bg-white p-4 rounded-xl border transition-all hover:shadow-md cursor-pointer flex justify-between items-center group ${v?'border-yellow-200 bg-yellow-50/30':'border-gray-100 hover:border-yellow-100'}" onclick="window.toggleTask('habits','${key}',${!v})">
                <div class="flex gap-3 items-center">
                    <div class="w-8 h-8 rounded-full flex items-center justify-center transition-colors ${v?'bg-yellow-500 text-white':'bg-gray-100 text-gray-400 group-hover:bg-yellow-100 group-hover:text-yellow-600'}">
                        <i data-lucide="${meta.icon}" class="w-4 h-4"></i>
                    </div>
                    <span class="font-bold text-sm ${v?'text-yellow-700':'text-gray-700'}">${meta.name}</span>
                </div>
                ${v ? '<i data-lucide="check-circle-2" class="w-5 h-5 text-yellow-500"></i>' : ''}
            </div>`; 
        }
        html += `</div></div>`;
    }
    
    container.innerHTML = html;
    lucide.createIcons();
    updatePrayerUI();
}

// === REPORT LOGIC (Daily, Weekly, Monthly) ===
let currentReportType = 'daily';

window.openReportModal = function() {
    window.switchReportPeriod('daily');
    document.getElementById('report-modal').classList.remove('hidden');
};

window.switchReportPeriod = async function(type) {
    currentReportType = type;
    
    // UI Updates for tabs
    ['daily', 'weekly', 'monthly'].forEach(t => {
        const btn = document.getElementById(`rep-btn-${t}`);
        if(t === type) {
            btn.classList.remove('text-gray-500', 'bg-white');
            btn.classList.add('bg-[#047857]', 'text-white', 'shadow-sm');
        } else {
            btn.classList.add('text-gray-500', 'bg-white');
            btn.classList.remove('bg-[#047857]', 'text-white', 'shadow-sm');
        }
    });

    const titleEl = document.getElementById('report-title');
    const dateEl = document.getElementById('report-date');
    const userEl = document.getElementById('report-user');
    const percentEl = document.getElementById('report-percent');
    const listEl = document.getElementById('report-tasks-list');
    
    userEl.innerText = currentUser.displayName || "فاعل خير";
    listEl.innerHTML = '<div class="text-center py-4"><div class="animate-spin w-6 h-6 border-2 border-[#047857] border-t-transparent rounded-full mx-auto"></div></div>';

    let stats = { total: 0, completed: 0, details: [] };
    let dateStr = "";

    if (type === 'daily') {
        titleEl.innerText = "تقرير إنجاز يومي";
        dateStr = getReadableDate(currentDate);
        if(lastUserData) {
            stats = calculateStatsFromData(lastUserData);
        }
    } else if (type === 'weekly') {
        titleEl.innerText = "تقرير إنجاز أسبوعي";
        dateStr = "آخر 7 أيام";
        stats = await fetchAggregatedStats(7);
    } else if (type === 'monthly') {
        titleEl.innerText = "تقرير إنجاز شهري";
        dateStr = "آخر 30 يوم";
        stats = await fetchAggregatedStats(30);
    }

    dateEl.innerText = dateStr;
    const percent = stats.total === 0 ? 0 : Math.round((stats.completed / stats.total) * 100);
    percentEl.innerText = `${percent}%`;

    // Render Details
    listEl.innerHTML = '';
    if (type === 'daily') {
        stats.details.forEach(item => {
            listEl.innerHTML += `<li class="flex items-center gap-2 ${item.color} font-medium"><span class="w-1.5 h-1.5 rounded-full ${item.bg}"></span> ${item.text}</li>`;
        });
    } else {
        listEl.innerHTML += `
        <li class="flex justify-between items-center py-2 border-b border-gray-100"><span>مجموع المهام المطلوبة:</span> <span class="font-bold">${stats.total}</span></li>
        <li class="flex justify-between items-center py-2 border-b border-gray-100"><span>المهام المنجزة:</span> <span class="font-bold text-[#047857]">${stats.completed}</span></li>
        <li class="mt-2 text-xs text-gray-500">يشمل هذا التقرير الفرائض، السنن، وورد القرآن.</li>
        `;
    }
    
    if(stats.details.length === 0 && type === 'daily') {
        listEl.innerHTML = '<p class="text-center text-gray-400 text-xs py-2">لا توجد بيانات مسجلة</p>';
    }
};

function calculateStatsFromData(data) {
    let total = 0, completed = 0, details = [];
    const pNames = { fajr: 'الفجر', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };
    
    // Prayers
    if(data.prayers) {
        for (const [k, v] of Object.entries(data.prayers)) {
            total++;
            if(v) {
                completed++;
                details.push({ text: `صلاة ${pNames[k]}`, color: 'text-green-700', bg: 'bg-green-500' });
            }
        }
    }
    // Quran
    total++;
    const qDone = (typeof data.quran !== 'undefined') ? data.quran : (data.habits?.quran || false);
    if(qDone) {
        completed++;
        details.push({ text: 'ورد القرآن', color: 'text-green-700', bg: 'bg-green-500' });
    }
    // Habits
    const activeHabits = globalUserSettings.habitSettings || DEFAULT_HABIT_SETTINGS;
    for (const key of Object.keys(activeHabits)) {
        if(activeHabits[key] && HABITS_META[key]) {
            total++;
            const hDone = data.habits ? data.habits[key] : false;
            if(hDone) {
                completed++;
                details.push({ text: HABITS_META[key].name, color: 'text-yellow-700', bg: 'bg-yellow-500' });
            }
        }
    }
    return { total, completed, details };
}

async function fetchAggregatedStats(days) {
    let total = 0;
    let completed = 0;
    
    // We generate the IDs for the last N days
    const promises = [];
    const baseDate = new Date(); // Today
    
    for (let i = 0; i < days; i++) {
        const d = new Date(baseDate);
        d.setDate(baseDate.getDate() - i);
        const dateID = getFormattedDateID(d);
        const docRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'daily_logs', dateID);
        promises.push(getDoc(docRef));
    }
    
    const snapshots = await Promise.all(promises);
    
    snapshots.forEach(snap => {
        if(snap.exists()) {
            const data = snap.data();
            const dayStats = calculateStatsFromData(data);
            total += dayStats.total;
            completed += dayStats.completed;
        }
    });
    
    return { total, completed, details: [] };
}

// ================= SETTINGS MODAL & LOGIC =================
window.injectSettingsUI = function() {
    if (document.getElementById('settings-modal')) return;
    
    const modal = document.createElement('div'); 
    modal.id = 'settings-modal'; 
    modal.className = 'modal-overlay hidden';
    modal.onclick = function(e) { if(e.target === this) window.closeSettingsModal(); };

    modal.innerHTML = `
        <div class="modal-content">
            <div class="p-4 border-b border-gray-100 flex justify-between items-center bg-[#f8fafc]">
                <h3 class="text-lg font-bold text-gray-800">الإعدادات</h3>
                <button onclick="window.closeSettingsModal()" class="text-gray-400 hover:text-red-500"><i data-lucide="x" class="w-5 h-5"></i></button>
            </div>
            
            <div class="flex-1 overflow-y-auto p-4 space-y-6">
                
                <!-- 1. Location Settings -->
                <section>
                    <h4 class="text-sm font-bold text-[#047857] mb-3 border-b border-gray-100 pb-2">📍 الموقع ومواقيت الصلاة</h4>
                    <div class="space-y-3">
                        <div class="flex items-center gap-2">
                            <input type="radio" name="loc-mode" id="loc-auto" value="auto" class="accent-[#047857]" onchange="window.toggleLocInputs(false)">
                            <label for="loc-auto" class="text-sm">تحديد تلقائي (GPS)</label>
                        </div>
                        <div class="flex items-center gap-2">
                            <input type="radio" name="loc-mode" id="loc-manual" value="manual" class="accent-[#047857]" onchange="window.toggleLocInputs(true)">
                            <label for="loc-manual" class="text-sm">تحديد يدوي</label>
                        </div>
                        
                        <div id="loc-inputs" class="grid grid-cols-2 gap-3 mt-2 hidden pl-4 border-r-2 border-gray-100">
                            <input type="text" id="set-country" placeholder="الدولة (English)" class="p-2 border rounded-lg text-sm bg-gray-50">
                            <input type="text" id="set-city" placeholder="المدينة (English)" class="p-2 border rounded-lg text-sm bg-gray-50">
                        </div>
                    </div>
                </section>

                <!-- 2. Habits Settings -->
                <section>
                    <h4 class="text-sm font-bold text-[#047857] mb-3 border-b border-gray-100 pb-2">✨ السنن والنوافل (التي تظهر في يومك)</h4>
                    <div class="space-y-2" id="settings-habits-list"></div>
                </section>
                
                <!-- 3. Alerts -->
                <section>
                     <h4 class="text-sm font-bold text-[#047857] mb-3 border-b border-gray-100 pb-2">🔔 التنبيهات</h4>
                     <div class="flex items-center justify-between py-2">
                        <span class="text-sm">صوت الأذان</span>
                        <input type="checkbox" id="set-adhan" class="accent-[#047857] w-4 h-4" onchange="adhanEnabled = this.checked">
                     </div>
                </section>
            </div>

            <div class="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
                <button onclick="window.saveSettings()" class="px-6 py-2.5 bg-[#047857] text-white rounded-xl font-bold hover:bg-[#065f46] shadow-md transition-all">حفظ التغييرات</button>
            </div>
        </div>`;
    document.body.appendChild(modal); 
    lucide.createIcons();
};

window.openSettingsModal = function() {
    if (!globalUserSettings) return;
    
    // Habits
    const container = document.getElementById('settings-habits-list'); 
    container.innerHTML = '';
    const hSettings = globalUserSettings.habitSettings;
    for (const [key, meta] of Object.entries(HABITS_META)) { 
        const isChecked = hSettings[key]; 
        container.innerHTML += `
        <label class="flex items-center justify-between p-3 bg-white border border-gray-100 rounded-lg hover:border-gray-200 cursor-pointer">
            <div class="flex items-center gap-2">
                <i data-lucide="${meta.icon}" class="w-4 h-4 text-gray-400"></i>
                <span class="text-sm font-medium text-gray-700">${meta.name}</span>
            </div>
            <input type="checkbox" class="accent-[#047857] w-4 h-4 setting-habit-toggle" data-key="${key}" ${isChecked ? 'checked' : ''}>
        </label>`; 
    }

    // Location
    const lSettings = globalUserSettings.locationSettings;
    if(lSettings.mode === 'manual') {
        document.getElementById('loc-manual').checked = true;
        window.toggleLocInputs(true);
        document.getElementById('set-country').value = lSettings.country || '';
        document.getElementById('set-city').value = lSettings.city || '';
    } else {
        document.getElementById('loc-auto').checked = true;
        window.toggleLocInputs(false);
    }
    
    // Alerts
    document.getElementById('set-adhan').checked = adhanEnabled;

    document.getElementById('settings-modal').classList.remove('hidden'); 
    lucide.createIcons();
};

window.toggleLocInputs = function(show) {
    const el = document.getElementById('loc-inputs');
    if(show) el.classList.remove('hidden'); else el.classList.add('hidden');
};

window.saveSettings = async function() { 
    // 1. Gather Habits
    const checkboxes = document.querySelectorAll('.setting-habit-toggle'); 
    const newHabitSettings = {}; 
    checkboxes.forEach(cb => { newHabitSettings[cb.dataset.key] = cb.checked; }); 
    
    // 2. Gather Location
    const mode = document.getElementById('loc-manual').checked ? 'manual' : 'auto';
    const country = document.getElementById('set-country').value.trim();
    const city = document.getElementById('set-city').value.trim();
    
    const newLocationSettings = {
        mode,
        country: mode === 'manual' ? country : 'Egypt',
        city: mode === 'manual' ? city : 'Cairo'
    };

    // 3. Save to User Profile (Global)
    await saveGlobalSettings({ 
        habitSettings: newHabitSettings,
        locationSettings: newLocationSettings
    });

    // 4. Update Adhan local var
    adhanEnabled = document.getElementById('set-adhan').checked;

    window.closeSettingsModal(); 
    alert("تم حفظ الإعدادات بنجاح ✅");
};

window.closeSettingsModal = function() { document.getElementById('settings-modal').classList.add('hidden'); };

// ================= Standard Helpers & Chart =================
function getFormattedDateID(date) { const offset = date.getTimezoneOffset(); const localDate = new Date(date.getTime() - (offset*60*1000)); return localDate.toISOString().split('T')[0]; }
function getReadableDate(date) { return date.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); }
function isToday(date) { return getFormattedDateID(date) === getFormattedDateID(new Date()); }
window.changeDate = function(days) { const newDate = new Date(currentDate); newDate.setDate(newDate.getDate() + days); if (newDate > new Date()) return; currentDate = newDate; loadUserDataForDate(currentDate); };

function updateDateUI() {
    const dateStr = getReadableDate(currentDate);
    const dateDisplay = document.getElementById('current-date-display');
    if(dateDisplay) dateDisplay.innerText = dateStr;
    const nextBtn = document.getElementById('btn-next-day');
    if(nextBtn) { if (isToday(currentDate)) { nextBtn.disabled = true; nextBtn.classList.add('opacity-30'); } else { nextBtn.disabled = false; nextBtn.classList.remove('opacity-30'); } }
}

window.toggleTask = function(cat, key, val) { 
    if (!isToday(currentDate)) return; 
    const dateID = getFormattedDateID(currentDate); 
    const docRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'daily_logs', dateID);
    const update = {}; 
    if (cat === 'root') update[key] = val; else update[`${cat}.${key}`] = val; 
    updateDoc(docRef, update); 
};

// ... (Adhkar Functions remain similar, just ensure they are exposed to window)
window.renderAdhkar = function(list) {
    const container = document.getElementById('adhkar-container'); 
    if(!container) return; 
    container.innerHTML = ''; 
    let total = 0;
    
    list.forEach((item, index) => { 
        total += item.count; 
        const progress = Math.min((item.count / (item.target || 100)) * 100, 100); 
        
        container.innerHTML += `
            <div class="bg-white p-3 rounded-xl border border-gray-100 shadow-sm relative overflow-hidden group">
                <div class="flex justify-between items-start mb-2 relative z-10">
                    <h4 class="font-bold text-gray-800 text-sm truncate w-24">${item.name}</h4>
                    <button onclick="window.removeAdhkar(${index})" class="text-gray-300 hover:text-red-400"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
                </div>
                <div class="flex justify-between items-end relative z-10 mt-1">
                    <div class="flex items-end gap-1">
                        <span class="text-xl font-bold text-blue-600">${item.count}</span>
                        <span class="text-[10px] text-gray-400 mb-1">/${item.target}</span>
                         <button onclick="window.openManualCountModal(${index})" class="text-gray-400 hover:text-blue-500 mb-1 p-1"><i data-lucide="edit-3" class="w-3 h-3"></i></button>
                    </div>
                    <button onclick="window.incrementAdhkar(${index})" class="click-anim w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 shadow-md">
                        <i data-lucide="plus" class="w-4 h-4"></i>
                    </button>
                </div>
                <div class="absolute bottom-0 left-0 h-1 bg-blue-100 w-full">
                    <div class="h-full bg-blue-500 transition-all duration-300" style="width: ${progress}%"></div>
                </div>
            </div>`;
    });
    
    const totalEl = document.getElementById('total-adhkar-count'); 
    if(totalEl) totalEl.innerText = total; 
    lucide.createIcons();
};

window.addNewDhikr = async function() { 
    if (!isToday(currentDate)) return; 
    const name = document.getElementById('new-dhikr-name').value; 
    const target = parseInt(document.getElementById('new-dhikr-target').value) || 100; 
    if(!name) return alert("أدخل اسم الذكر"); 
    const dateID = getFormattedDateID(currentDate); 
    const docRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'daily_logs', dateID);
    const docSnap = await getDoc(docRef); 
    let currentList = docSnap.exists() ? (docSnap.data().customAdhkar || []) : []; 
    currentList.push({ name, count: 0, target }); 
    await updateDoc(docRef, { customAdhkar: currentList }); 
    window.toggleAdhkarModal(); 
    document.getElementById('new-dhikr-name').value = ''; 
};

window.incrementAdhkar = async function(index) { 
    if (!isToday(currentDate)) return; 
    const dateID = getFormattedDateID(currentDate); 
    const docRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'daily_logs', dateID);
    const docSnap = await getDoc(docRef); 
    let list = docSnap.data().customAdhkar; 
    list[index].count += 1; 
    await updateDoc(docRef, { customAdhkar: list }); 
};

window.removeAdhkar = async function(index) { 
    if (!isToday(currentDate)) return; 
    if(!confirm("حذف؟")) return; 
    const dateID = getFormattedDateID(currentDate); 
    const docRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'daily_logs', dateID);
    const docSnap = await getDoc(docRef); 
    let list = docSnap.data().customAdhkar; 
    list.splice(index, 1); 
    await updateDoc(docRef, { customAdhkar: list }); 
};

window.toggleAdhkarModal = function() { document.getElementById('adhkar-modal').classList.toggle('hidden'); };

window.injectManualCountModal = function() {
    if (document.getElementById('manual-count-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'manual-count-modal';
    modal.className = 'modal-overlay hidden';
    modal.onclick = function(e) { if(e.target === this) document.getElementById('manual-count-modal').classList.add('hidden'); };
    
    modal.innerHTML = `
        <div class="modal-content max-w-sm p-6">
            <h3 class="text-xl font-bold text-gray-800 mb-2">إضافة عدد</h3>
            <p class="text-sm text-gray-500 mb-4">كم مرة قلت هذا الذكر؟</p>
            <input type="number" id="manual-count-input" placeholder="مثلاً: 100" class="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 mb-6 focus:border-blue-500 outline-none text-center text-lg font-bold">
            <div class="flex gap-3">
                <button onclick="window.saveManualCount()" class="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700">إضافة</button>
                <button onclick="document.getElementById('manual-count-modal').classList.add('hidden')" class="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl font-bold hover:bg-gray-200">إلغاء</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
};

window.openManualCountModal = function(index) {
    if (!isToday(currentDate)) return;
    currentAdhkarEditIndex = index;
    const modal = document.getElementById('manual-count-modal');
    const input = document.getElementById('manual-count-input');
    input.value = ''; 
    modal.classList.remove('hidden');
    setTimeout(() => input.focus(), 100);
};

window.saveManualCount = async function() {
    const input = document.getElementById('manual-count-input');
    const countToAdd = parseInt(input.value);
    
    if (isNaN(countToAdd) || countToAdd <= 0) {
        alert("الرجاء إدخال رقم صحيح");
        return;
    }

    if (currentAdhkarEditIndex !== null) {
        const dateID = getFormattedDateID(currentDate);
        const docRef = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'daily_logs', dateID);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            let list = docSnap.data().customAdhkar;
            if (list && list[currentAdhkarEditIndex]) {
                list[currentAdhkarEditIndex].count += countToAdd;
                await updateDoc(docRef, { customAdhkar: list });
            }
        }
    }
    document.getElementById('manual-count-modal').classList.add('hidden');
};

function hideLoader() { const l=document.getElementById('loader'); if(l){l.style.opacity='0'; setTimeout(()=>l.style.display='none',500);} }
window.showScreen = function(id) { ['landing-screen','auth-screen','app-screen'].forEach(s=>{document.getElementById(s).classList.add('hidden')}); document.getElementById(id).classList.remove('hidden'); if(id==='app-screen') setTimeout(initChart,100); };
window.goToAuth = function(m) { window.showScreen('auth-screen'); window.switchAuthMode(m); };
window.showLandingScreen = function() { window.showScreen('landing-screen'); };

window.switchAuthMode = function(m) {
    document.getElementById('login-form').classList.add('hidden'); document.getElementById('register-form').classList.add('hidden'); document.getElementById('reset-form').classList.add('hidden'); document.getElementById('auth-tabs').classList.remove('hidden'); document.getElementById('auth-error').classList.add('hidden');
    if(m==='login') document.getElementById('login-form').classList.remove('hidden'); else if(m==='register') document.getElementById('register-form').classList.remove('hidden'); else { document.getElementById('reset-form').classList.remove('hidden'); document.getElementById('auth-tabs').classList.add('hidden'); }
};

window.handleLogin = async function(e){ e.preventDefault(); try{ await signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-password').value); }catch(err){showAuthError("خطأ في الدخول");} };
window.handleRegister = async function(e){ e.preventDefault(); try{ const c = await createUserWithEmailAndPassword(auth, document.getElementById('reg-email').value, document.getElementById('reg-password').value); await updateProfile(c.user, {displayName:document.getElementById('reg-name').value}); }catch(err){showAuthError(err.message);} };
window.handleResetPassword = async function(e){ e.preventDefault(); try{ await sendPasswordResetEmail(auth, document.getElementById('reset-email').value); alert("تم الإرسال"); window.switchAuthMode('login'); }catch(err){showAuthError(err.message);} };
window.handleLogout = async function(){ if(unsubscribeSnapshot) unsubscribeSnapshot(); await signOut(auth); window.showScreen('landing-screen'); };
function showAuthError(m){ const e=document.getElementById('auth-error'); e.innerText=m; e.classList.remove('hidden'); }

function initChart() { const ctx = document.getElementById('performanceChart'); if(!ctx) return; if (performanceChartInstance) performanceChartInstance.destroy(); performanceChartInstance = new Chart(ctx, { type: 'doughnut', data: { labels: ['منجز', 'متبقي'], datasets: [{ data: [0, 100], backgroundColor: ['#047857', '#E5E7EB'], borderWidth: 0, cutout: '75%' }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, animation: { animateScale: true, animateRotate: true } } }); }

function updateDashboardStats(data) {
    let total = 0, done = 0; if (data.prayers) Object.values(data.prayers).forEach(v => { total++; if(v) done++; }); const quranDone = (typeof data.quran !== 'undefined') ? data.quran : (data.habits?.quran || false); total++; if(quranDone) done++; 
    
    // Habits (only active ones based on global settings)
    const activeHabits = globalUserSettings.habitSettings || DEFAULT_HABIT_SETTINGS;
    for (const key of Object.keys(activeHabits)) { 
        if(activeHabits[key] && HABITS_META[key]) { 
            total++; 
            if(data.habits && data.habits[key]) done++; 
        } 
    } 
    
    const percent = total === 0 ? 0 : Math.round((done / total) * 100); 
    const percentEl = document.getElementById('chart-percent'); 
    if(percentEl) percentEl.innerText = `${percent}%`; 
    if (performanceChartInstance) { performanceChartInstance.data.datasets[0].data = [percent, 100 - percent]; performanceChartInstance.update(); } 
    let msgData = percent >= 80 ? MESSAGES_DB.high : (percent >= 50 ? MESSAGES_DB.medium : MESSAGES_DB.low); document.getElementById('feedback-title').innerText = msgData.title; document.getElementById('feedback-body').innerText = msgData.body; document.getElementById('feedback-link').href = msgData.link; 
    
    const sidebarMsg = document.getElementById('sidebar-message-box'); 
    if(sidebarMsg && !sidebarMsg.innerText.includes('Hijri')) {
        // If no Hijri date shown (not fetched yet), show msg
        // But we prefer showing date there usually
    }
}

// Quran functions (simplified for brevity, logic remains)
window.injectQuranModal = function() {
    if (document.getElementById('quran-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'quran-modal';
    modal.className = 'modal-overlay hidden';
    modal.onclick = function(e) { if(e.target === this) window.closeQuran(); };
    
    let reciterOptions = '';
    for (const [key, name] of Object.entries(RECITERS)) reciterOptions += `<option value="${key}">${name}</option>`;

    modal.innerHTML = `
        <div class="modal-content h-[95vh]">
            <div class="p-4 border-b border-gray-100 bg-[#ECFDF5] flex flex-col md:flex-row justify-between items-center gap-4">
                <div class="flex items-center gap-3 w-full md:w-auto">
                    <h3 class="text-xl font-bold text-[#047857] whitespace-nowrap"><i data-lucide="book-open" class="inline w-5 h-5"></i> المصحف</h3>
                    <select id="surah-select" class="p-2 rounded-lg border border-gray-300 text-sm flex-1 md:w-48" onchange="window.loadSurah(this.value)"><option value="">اختر السورة...</option></select>
                </div>
                <div class="flex flex-wrap items-center gap-2 w-full md:w-auto justify-center">
                    <select id="reciter-select" class="p-2 rounded-lg border border-gray-300 text-sm" onchange="window.changeReciter(this.value)">${reciterOptions}</select>
                    <div class="flex items-center bg-white rounded-lg border border-gray-300 px-2"><span class="text-xs text-gray-500 pl-2">تكرار:</span><input type="number" id="repeat-count" min="1" max="100" value="1" class="w-12 p-1 text-center outline-none text-sm font-bold" onchange="window.setVerseRepeatCount(this.value)"></div>
                </div>
                <button onclick="window.closeQuran()" class="text-gray-500 hover:text-red-500 bg-white p-2 rounded-full shadow-sm"><i data-lucide="x" class="w-5 h-5"></i></button>
            </div>
            <div id="quran-content" class="flex-1 overflow-y-auto p-6 text-center bg-[#fdfdfd] relative"></div>
            <div id="audio-player-bar" class="p-4 bg-white border-t border-gray-200 flex justify-between items-center hidden">
                <div class="text-xs text-gray-500 hidden md:block"><span id="player-status">--</span></div>
                <div class="flex items-center gap-4 mx-auto">
                    <button onclick="window.prevVerse()" class="p-2 text-gray-600 hover:text-[#047857]"><i data-lucide="skip-back" class="w-6 h-6"></i></button>
                    <button onclick="window.togglePlay()" id="play-btn" class="w-12 h-12 bg-[#047857] text-white rounded-full flex items-center justify-center shadow-lg hover:bg-[#065f46]"><i data-lucide="play" class="w-6 h-6 ml-1"></i></button>
                    <button onclick="window.nextVerse()" class="p-2 text-gray-600 hover:text-[#047857]"><i data-lucide="skip-forward" class="w-6 h-6"></i></button>
                </div>
                <div class="text-xs text-gray-400 font-mono hidden md:block w-24 text-left">AlQuran</div>
            </div>
        </div>`;
    document.body.appendChild(modal);
    fetchSurahList();
    quranAudio.addEventListener('ended', handleAudioEnd);
    quranAudio.addEventListener('play', () => { isPlaying = true; updatePlayIcon(); });
    quranAudio.addEventListener('pause', () => { isPlaying = false; updatePlayIcon(); });
};

window.setVerseRepeatCount = function(val) { verseRepeatCount = parseInt(val); };
async function fetchSurahList() { try { const res = await fetch('https://api.alquran.cloud/v1/surah'); const data = await res.json(); const select = document.getElementById('surah-select'); data.data.forEach(surah => { const option = document.createElement('option'); option.value = surah.number; option.text = `${surah.number}. ${surah.name}`; select.appendChild(option); }); } catch(e) { console.log("Err"); } }
window.changeReciter = function(reciterKey) { currentReciterId = reciterKey; const select = document.getElementById('surah-select'); if (select && select.value) { window.loadSurah(select.value); } };
window.loadSurah = async function(number) { if(!number) return; const container = document.getElementById('quran-content'); container.innerHTML = '<div class="text-center p-10"><div class="animate-spin w-8 h-8 border-4 border-[#047857] border-t-transparent rounded-full mx-auto"></div></div>'; try { const res = await fetch(`https://api.alquran.cloud/v1/surah/${number}/${currentReciterId}`); const data = await res.json(); const ayahs = data.data.ayahs; currentSurahAyahs = ayahs; currentAyahIndex = 0; currentVerseRepeat = 0; let html = `<div class="max-w-3xl mx-auto"><h2 class="text-3xl font-bold text-[#047857] mb-6 font-serif text-center">${data.data.name}</h2><div class="text-2xl leading-[2.5] font-serif text-gray-800 text-justify" style="direction: rtl;">`; if(number != 1 && number != 9) html += `<div class="text-center mb-6 text-xl text-gray-600">بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</div>`; ayahs.forEach((ayah, index) => { const text = ayah.text.replace('بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ', '').trim(); html += `<span id="ayah-${index}" class="ayah-span cursor-pointer hover:bg-green-50 rounded px-1 transition-colors duration-200" onclick="window.playVerse(${index})">${text} <span class="text-[#047857] text-xl font-sans inline-block mx-1">۝${ayah.numberInSurah}</span></span> `; }); html += `</div></div>`; container.innerHTML = html; document.getElementById('audio-player-bar').classList.remove('hidden'); } catch(e) { container.innerHTML = '<p class="text-red-500">حدث خطأ</p>'; } };
window.playVerse = function(index) { if (index < 0 || index >= currentSurahAyahs.length) return; currentAyahIndex = index; const ayah = currentSurahAyahs[index]; if (ayah.audio) { quranAudio.src = ayah.audio; quranAudio.play(); highlightAyah(index); updatePlayerStatus(); } };
function handleAudioEnd() { currentVerseRepeat++; if (currentVerseRepeat < verseRepeatCount) { quranAudio.currentTime = 0; quranAudio.play(); } else { currentVerseRepeat = 0; if (currentAyahIndex < currentSurahAyahs.length - 1) window.playVerse(currentAyahIndex + 1); else { isPlaying = false; updatePlayIcon(); } } }
function highlightAyah(index) { document.querySelectorAll('.ayah-span').forEach(el => el.classList.remove('bg-green-200', 'text-green-900')); const el = document.getElementById(`ayah-${index}`); if (el) { el.classList.add('bg-green-200', 'text-green-900'); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }
window.togglePlay = function() { if (isPlaying) quranAudio.pause(); else quranAudio.play(); };
function updatePlayIcon() { const icon = document.querySelector('#play-btn i'); if (isPlaying) icon.setAttribute('data-lucide', 'pause'); else icon.setAttribute('data-lucide', 'play'); lucide.createIcons(); }
window.nextVerse = function() { currentVerseRepeat = 0; window.playVerse(currentAyahIndex + 1); };
window.prevVerse = function() { currentVerseRepeat = 0; window.playVerse(currentAyahIndex - 1); };
function updatePlayerStatus() { const status = document.getElementById('player-status'); const ayah = currentSurahAyahs[currentAyahIndex]; if(status && ayah) status.innerText = `الآية ${ayah.numberInSurah} - تكرار (${currentVerseRepeat + 1}/${verseRepeatCount})`; }
window.openQuran = function() { const m = document.getElementById('quran-modal'); if(m) m.classList.remove('hidden'); else window.injectQuranModal(); };
window.closeQuran = function() { const m = document.getElementById('quran-modal'); if(m) m.classList.add('hidden'); quranAudio.pause(); };
window.downloadAsImage = function() { const element = document.getElementById('report-preview-content'); const name = currentUser.displayName || "user"; html2canvas(element, { scale: 2 }).then(canvas => { const link = document.createElement('a'); link.download = `Report_${name}_${Date.now()}.png`; link.href = canvas.toDataURL(); link.click(); }); };
window.downloadAsPDF = function() { const element = document.getElementById('report-preview-content'); const name = currentUser.displayName || "user"; const { jsPDF } = window.jspdf; html2canvas(element, { scale: 2 }).then(canvas => { const imgData = canvas.toDataURL('image/png'); const pdf = new jsPDF('p', 'mm', 'a4'); const pdfWidth = pdf.internal.pageSize.getWidth(); const pdfHeight = (canvas.height * pdfWidth) / canvas.width; pdf.addImage(imgData, 'PNG', 0, 10, pdfWidth, pdfHeight); pdf.save(`Report_${name}_${Date.now()}.pdf`); }); };

// Mobile Nav
window.injectMobileNav = function() {
    if (document.getElementById('mobile-bottom-nav')) return;
    const mainContent = document.querySelector('#app-screen main > div');
    if(mainContent) mainContent.classList.add('pb-24');
    const nav = document.createElement('div');
    nav.id = 'mobile-bottom-nav';
    nav.className = 'md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50 flex justify-around items-center h-16 pb-safe';
    nav.innerHTML = `
        <button onclick="window.showScreen('app-screen')" class="flex flex-col items-center justify-center w-full h-full text-[#047857]"><i data-lucide="layout-dashboard" class="w-6 h-6"></i><span class="text-[10px] font-bold mt-1">يوميتي</span></button>
        <button onclick="window.openQuran()" class="flex flex-col items-center justify-center w-full h-full text-gray-500 hover:text-[#047857]"><i data-lucide="book-open" class="w-6 h-6"></i><span class="text-[10px] font-bold mt-1">المصحف</span></button>
        <button onclick="window.openReportModal()" class="flex flex-col items-center justify-center w-full h-full text-gray-500 hover:text-[#047857]"><i data-lucide="bar-chart-2" class="w-6 h-6"></i><span class="text-[10px] font-bold mt-1">تقارير</span></button>
        <button onclick="window.openSettingsModal()" class="flex flex-col items-center justify-center w-full h-full text-gray-500 hover:text-[#047857]"><i data-lucide="settings" class="w-6 h-6"></i><span class="text-[10px] font-bold mt-1">إعدادات</span></button>`;
    document.body.appendChild(nav);
    lucide.createIcons();
};