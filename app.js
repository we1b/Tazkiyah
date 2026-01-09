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
let currentDate = new Date();

// === تعريفات السنن المتاحة (Metadata) ===
const HABITS_META = {
    rawatib: { name: 'السنن الرواتب (12)', icon: 'layers' },
    duha: { name: 'صلاة الضحى', icon: 'sun' },
    witr: { name: 'صلاة الوتر', icon: 'moon' },
    azkar_m: { name: 'أذكار الصباح', icon: 'sunrise' },
    azkar_e: { name: 'أذكار المساء', icon: 'sunset' },
    azkar_s: { name: 'أذكار النوم', icon: 'star' },
    fasting_mon: { name: 'صيام الاثنين', icon: 'calendar' }, // جديد
    fasting_thu: { name: 'صيام الخميس', icon: 'calendar' }  // جديد
};

// === البيانات الافتراضية ===
const DEFAULT_USER_DATA = {
    prayers: { fajr: false, dhuhr: false, asr: false, maghrib: false, isha: false },
    quran: false, // 🌟 تم نقله ليصبح أساسي (توب ليفل)
    habits: { 
        rawatib: false, duha: false, witr: false, azkar_m: false, azkar_e: false, azkar_s: false, fasting_mon: false, fasting_thu: false 
    },
    // ⚙️ إعدادات العبادات (التحكم في الظهور)
    habitSettings: { 
        rawatib: true, duha: true, witr: true, azkar_m: true, azkar_e: true, azkar_s: true, fasting_mon: false, fasting_thu: false 
    },
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
            injectSettingsUI(); // 🛠️ حقن واجهة الإعدادات
        } else {
            currentUser = null;
            showScreen('landing-screen');
        }
        hideLoader();
    });
}

// === Date Helpers ===
function getFormattedDateID(date) {
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - (offset*60*1000));
    return localDate.toISOString().split('T')[0];
}

function getReadableDate(date) {
    return date.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function isToday(date) {
    return getFormattedDateID(date) === getFormattedDateID(new Date());
}

// === Navigation & Date Control ===
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
    if (isToday(currentDate)) { nextBtn.disabled = true; nextBtn.classList.add('opacity-30'); } 
    else { nextBtn.disabled = false; nextBtn.classList.remove('opacity-30'); }

    const isReadOnly = !isToday(currentDate);
    if (isReadOnly) {
        document.getElementById('tasks-container').classList.add('read-only-mode');
        document.getElementById('adhkar-container').classList.add('read-only-mode');
        document.getElementById('btn-add-dhikr').classList.add('hidden');
        document.querySelector('.read-only-badge').style.display = 'inline-flex';
        document.getElementById('motivational-text').innerText = "عرض أرشيف سابق";
    } else {
        document.getElementById('tasks-container').classList.remove('read-only-mode');
        document.getElementById('adhkar-container').classList.remove('read-only-mode');
        document.getElementById('btn-add-dhikr').classList.remove('hidden');
        document.querySelector('.read-only-badge').style.display = 'none';
        document.getElementById('motivational-text').innerText = "كيف هي همتك اليوم؟";
    }
}

// === Realtime Data ===
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
                    // نسخ الإعدادات الافتراضية أو آخر إعدادات محفوظة للمستخدم
                    // (للتبسيط سنستخدم الافتراضي هنا، لكن التعديل سيحفظ لليوم الحالي)
                    db.collection('users').doc(currentUser.uid)
                        .collection('daily_logs').doc(dateID)
                        .set(DEFAULT_USER_DATA);
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

// === UI Rendering (Updated) ===
function renderTasks(data) {
    const container = document.getElementById('tasks-container');
    container.innerHTML = '';
    if (!data || !data.prayers) return;

    // 1️⃣ الفرائض + ورد القرآن (الأساسيات)
    let html = `<div>
        <div class="flex items-center gap-3 mb-5">
            <div class="w-1.5 h-8 bg-[#047857] rounded-full"></div>
            <h3 class="text-xl font-bold text-gray-800">الفرائض وورد القرآن (الأساس)</h3>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">`;
    
    const pNames = { fajr: 'الفجر', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };
    
    // ريندر الصلوات
    for (const [k, v] of Object.entries(data.prayers)) {
        html += `<div class="bg-white p-5 rounded-2xl border transition-all hover:-translate-y-1 flex justify-between items-center cursor-pointer ${v?'border-green-200 bg-green-50/50':'border-gray-100'}" onclick="toggleTask('prayers','${k}',${!v})">
            <div class="flex gap-4 items-center">
                <div class="w-10 h-10 rounded-full flex items-center justify-center ${v?'bg-[#047857] text-white':'bg-gray-100 text-gray-400'}"><i data-lucide="${v?'check':'clock'}" class="w-5 h-5"></i></div>
                <span class="font-bold text-lg ${v?'text-[#047857]':'text-gray-600'}">${pNames[k]}</span>
            </div>
        </div>`;
    }

    // 📖 ريندر ورد القرآن (مع الفرائض)
    // نتأكد من مكان البيانات (لأننا غيرنا الهيكل، فبندعم القديم والجديد)
    const quranDone = (typeof data.quran !== 'undefined') ? data.quran : (data.habits?.quran || false);
    html += `<div class="bg-white p-5 rounded-2xl border transition-all hover:-translate-y-1 flex justify-between items-center cursor-pointer ${quranDone?'border-green-200 bg-green-50/50':'border-gray-100'}" onclick="toggleTask('root','quran',${!quranDone})">
            <div class="flex gap-4 items-center">
                <div class="w-10 h-10 rounded-full flex items-center justify-center ${quranDone?'bg-[#047857] text-white':'bg-gray-100 text-gray-400'}"><i data-lucide="book-open" class="w-5 h-5"></i></div>
                <span class="font-bold text-lg ${quranDone?'text-[#047857]':'text-gray-600'}">ورد القرآن</span>
            </div>
        </div>`;

    html += `</div></div>`;

    // 2️⃣ السنن والنوافل (التي اختارها المستخدم)
    const userSettings = data.habitSettings || DEFAULT_USER_DATA.habitSettings;
    const activeHabits = Object.keys(userSettings).filter(key => userSettings[key]);
    
    if (activeHabits.length > 0) {
        html += `<div class="mt-10">
            <div class="flex items-center gap-3 mb-5">
                <div class="w-1.5 h-8 bg-[#D4AF37] rounded-full"></div>
                <h3 class="text-xl font-bold text-gray-800">السنن والنوافل (المختارة)</h3>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">`;
        
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
}

// ... renderAdhkar ... (نفس القديم)
function renderAdhkar(list) {
    const container = document.getElementById('adhkar-container');
    container.innerHTML = '';
    let total = 0;
    list.forEach((item, index) => {
        total += item.count;
        const progress = Math.min((item.count / (item.target || 100)) * 100, 100);
        container.innerHTML += `
            <div class="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm relative overflow-hidden group">
                <div class="flex justify-between items-start mb-2 relative z-10">
                    <div><h4 class="font-bold text-gray-800 text-lg">${item.name}</h4><span class="text-xs text-gray-400">الهدف: ${item.target}</span></div>
                    <button onclick="removeAdhkar(${index})" class="text-gray-300 hover:text-red-400"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>
                <div class="flex justify-between items-end relative z-10 mt-2">
                    <span class="text-3xl font-bold text-blue-600">${item.count}</span>
                    <button onclick="incrementAdhkar(${index})" class="click-anim w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 shadow-lg shadow-blue-200"><i data-lucide="plus" class="w-6 h-6"></i></button>
                </div>
                <div class="absolute bottom-0 left-0 h-1.5 bg-blue-100 w-full"><div class="h-full bg-blue-500 transition-all duration-300" style="width: ${progress}%"></div></div>
            </div>`;
    });
    document.getElementById('total-adhkar-count').innerText = total;
    lucide.createIcons();
}

// === Actions Logic ===

function toggleTask(cat, key, val) {
    if (!isToday(currentDate)) return;

    const dateID = getFormattedDateID(currentDate);
    const update = {};
    
    if (cat === 'root') {
        // تحديث في المستوى الأول (مثل القرآن)
        update[key] = val;
    } else {
        update[`${cat}.${key}`] = val;
    }
    
    db.collection('users').doc(currentUser.uid)
      .collection('daily_logs').doc(dateID)
      .update(update);
}

// ... addNewDhikr, incrementAdhkar, removeAdhkar, toggleAdhkarModal ...
async function addNewDhikr() {
    if (!isToday(currentDate)) return; 
    const name = document.getElementById('new-dhikr-name').value;
    const target = parseInt(document.getElementById('new-dhikr-target').value) || 100;
    if(!name) return alert("أدخل اسم الذكر");
    const dateID = getFormattedDateID(currentDate);
    const docRef = db.collection('users').doc(currentUser.uid).collection('daily_logs').doc(dateID);
    const doc = await docRef.get();
    let currentList = doc.exists ? (doc.data().customAdhkar || []) : [];
    currentList.push({ name, count: 0, target });
    await docRef.update({ customAdhkar: currentList });
    toggleAdhkarModal();
    document.getElementById('new-dhikr-name').value = '';
    document.getElementById('new-dhikr-target').value = '';
}

async function incrementAdhkar(index) {
    if (!isToday(currentDate)) return;
    const dateID = getFormattedDateID(currentDate);
    const docRef = db.collection('users').doc(currentUser.uid).collection('daily_logs').doc(dateID);
    const doc = await docRef.get();
    let list = doc.data().customAdhkar;
    list[index].count += 1;
    await docRef.update({ customAdhkar: list });
}

async function removeAdhkar(index) {
    if (!isToday(currentDate)) return;
    if(!confirm("حذف هذا الذكر؟")) return;
    const dateID = getFormattedDateID(currentDate);
    const docRef = db.collection('users').doc(currentUser.uid).collection('daily_logs').doc(dateID);
    const doc = await docRef.get();
    let list = doc.data().customAdhkar;
    list.splice(index, 1);
    await docRef.update({ customAdhkar: list });
}

function toggleAdhkarModal() { document.getElementById('adhkar-modal').classList.toggle('hidden'); }

// === SETTINGS & HABITS MANAGEMENT (NEW) ===

// حقن زر الإعدادات والمودال تلقائياً
function injectSettingsUI() {
    // 1. زر في السايد بار
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
    
    // 2. المودال HTML
    if (!document.getElementById('settings-modal')) {
        const modal = document.createElement('div');
        modal.id = 'settings-modal';
        modal.className = 'fixed inset-0 bg-black/60 z-[80] hidden flex items-center justify-center p-4 backdrop-blur-md';
        modal.innerHTML = `
            <div class="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-[fadeIn_0.2s_ease-out]">
                <div class="p-6 border-b border-gray-100 flex justify-between items-center bg-[#ECFDF5]">
                    <div>
                        <h3 class="text-xl font-bold text-[#047857]">تخصيص السنن</h3>
                        <p class="text-xs text-gray-500">اختر ما تريد إضافته لوردك اليومي</p>
                    </div>
                    <button onclick="closeSettingsModal()" class="text-gray-400 hover:text-red-500"><i data-lucide="x"></i></button>
                </div>
                <div class="p-6 max-h-[60vh] overflow-y-auto space-y-3" id="settings-toggles-container"></div>
                <div class="p-6 border-t border-gray-100 bg-gray-50 flex justify-end">
                    <button onclick="saveSettings()" class="px-8 py-3 bg-[#047857] text-white rounded-xl font-bold hover:bg-[#065f46] shadow-lg transition-all">حفظ التغييرات</button>
                </div>
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
                <div class="flex items-center gap-3">
                    <div class="bg-white p-2 rounded-lg text-yellow-600"><i data-lucide="${meta.icon}" class="w-5 h-5"></i></div>
                    <span class="font-bold text-gray-700">${meta.name}</span>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" class="sr-only peer setting-toggle" data-key="${key}" ${isChecked ? 'checked' : ''}>
                    <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#047857]"></div>
                </label>
            </div>`;
    }
    document.getElementById('settings-modal').classList.remove('hidden');
    lucide.createIcons();
}

function closeSettingsModal() {
    document.getElementById('settings-modal').classList.add('hidden');
}

function saveSettings() {
    if (!isToday(currentDate)) return alert("يمكنك تعديل إعدادات اليوم الحالي فقط");
    
    const checkboxes = document.querySelectorAll('.setting-toggle');
    const newSettings = { ... (lastUserData.habitSettings || {}) };
    
    checkboxes.forEach(cb => {
        newSettings[cb.dataset.key] = cb.checked;
    });

    const dateID = getFormattedDateID(currentDate);
    db.collection('users').doc(currentUser.uid)
      .collection('daily_logs').doc(dateID)
      .update({ habitSettings: newSettings })
      .then(() => {
          closeSettingsModal();
      });
}

// === Standard Boilerplate Logic (Simplified) ===
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

// === Chart & Stats & Reports ===
function initChart() {
    const ctx = document.getElementById('performanceChart');
    if(!ctx) return;
    if (performanceChartInstance) performanceChartInstance.destroy();
    performanceChartInstance = new Chart(ctx, { type: 'doughnut', data: { labels: ['منجز', 'متبقي'], datasets: [{ data: [0, 100], backgroundColor: ['#047857', '#E5E7EB'], borderWidth: 0, cutout: '75%' }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, animation: { animateScale: true, animateRotate: true } } });
}

function updateDashboardStats(data) {
    let total = 0, done = 0;
    if (data.prayers) Object.values(data.prayers).forEach(v => { total++; if(v) done++; });
    
    // حساب القرآن كفريضة
    const quranDone = (typeof data.quran !== 'undefined') ? data.quran : (data.habits?.quran || false);
    total++; if(quranDone) done++;

    // حساب السنن النشطة فقط
    const activeHabits = data.habitSettings || DEFAULT_USER_DATA.habitSettings;
    for (const key of Object.keys(activeHabits)) {
        if(activeHabits[key] && HABITS_META[key]) {
            total++;
            if(data.habits[key]) done++;
        }
    }

    const percent = total === 0 ? 0 : Math.round((done / total) * 100);
    const percentEl = document.getElementById('chart-percent');
    if(percentEl) percentEl.innerText = `${percent}%`;
    if (performanceChartInstance) { performanceChartInstance.data.datasets[0].data = [percent, 100 - percent]; performanceChartInstance.update(); }
    let msgData = percent >= 80 ? MESSAGES_DB.high : (percent >= 50 ? MESSAGES_DB.medium : MESSAGES_DB.low);
    document.getElementById('feedback-title').innerText = msgData.title;
    document.getElementById('feedback-body').innerText = msgData.body;
    document.getElementById('feedback-link').href = msgData.link;
    document.getElementById('sidebar-message-box').innerText = msgData.sidebar;
}

// ... openReportModal, closeReportModal, downloadAsImage, downloadAsPDF, downloadAsExcel ...
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
        for (const [k, v] of Object.entries(lastUserData.habits || {})) {
            if(v && activeHabits[k] && HABITS_META[k]) listEl.innerHTML += `<li class="flex items-center gap-2 text-yellow-700"><span class="w-2 h-2 rounded-full bg-yellow-500"></span> ${HABITS_META[k].name}</li>`;
        }
    }
    document.getElementById('report-modal').classList.remove('hidden');
}
function closeReportModal() { document.getElementById('report-modal').classList.add('hidden'); }
function downloadAsImage() { const e=document.getElementById('report-preview-content'); html2canvas(e).then(c=>{const l=document.createElement('a'); l.download=`Report-${Date.now()}.png`; l.href=c.toDataURL(); l.click();}); }
function downloadAsPDF() { const e=document.getElementById('report-preview-content'); const {jsPDF}=window.jspdf; html2canvas(e).then(c=>{const i=c.toDataURL('image/png'); const p=new jsPDF('p','mm','a4'); const w=p.internal.pageSize.getWidth(); const h=(c.height*w)/c.width; p.addImage(i,'PNG',0,10,w,h); p.save(`Report-${Date.now()}.pdf`);}); }
function downloadAsExcel() {
    if(!lastUserData) return;
    const rows = [["تقرير تزكية"],["التاريخ", getReadableDate(currentDate)],["النسبة", document.getElementById('chart-percent').innerText],[],["العبادة","الحالة"]];
    const pNames = { fajr: 'الفجر', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };
    for (const [k, v] of Object.entries(lastUserData.prayers)) rows.push([`صلاة ${pNames[k]}`, v?"تم":"لم يتم"]);
    rows.push(["ورد القرآن", (lastUserData.quran||lastUserData.habits?.quran)?"تم":"لم يتم"]);
    
    const activeHabits = lastUserData.habitSettings || DEFAULT_USER_DATA.habitSettings;
    for (const [k, v] of Object.entries(lastUserData.habits || {})) {
         if(activeHabits[k] && HABITS_META[k]) rows.push([HABITS_META[k].name, v?"تم":"لم يتم"]);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Report"); XLSX.writeFile(wb, `Report-${Date.now()}.xlsx`);
}