const USE_REAL_FIREBASE = true;

// إعدادات مشروعك
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
let performanceChartInstance = null; // متغير لحفظ الرسم البياني

const DEFAULT_USER_DATA = {
    prayers: { fajr: false, dhuhr: false, asr: false, maghrib: false, isha: false },
    habits: { duha: false, quran: false, azkar: false }
};

// مكتبة الرسائل والمحاضرات (الداتا بيز الخاصة بالرسائل)
const MESSAGES_DB = {
    high: {
        title: "ما شاء الله، همة تناطح السحاب! 🌟",
        body: "ثباتك اليوم يفتح لك أبواباً من الخير. استغل هذه الطاقة في المزيد من القرب. إليك هذا المقطع عن 'لذة الثبات'.",
        link: "https://www.youtube.com/results?search_query=محاضرة+عن+الثبات+في+الطاعة", // استبدل برابط حقيقي
        sidebar: "أداء ممتاز! استمر يا بطل 💪"
    },
    medium: {
        title: "جيد جداً، ولكنك تستطيع المزيد! ✨",
        body: "أنجزت جزءاً كبيراً، ولم يتبق إلا القليل لتكتمل اللوحة. جاهد نفسك في الباقي. استمع لهذا المقطع القصير.",
        link: "https://www.youtube.com/results?search_query=محاضرة+علو+الهمة",
        sidebar: "اقتربت من الكمال، شد حيلك 🚀"
    },
    low: {
        title: "لا تيأس، البدايات دائماً صعبة 🌿",
        body: "تعثرت اليوم؟ لا بأس، المهم ألا تتوقف. الله يحب المحاولين. جدد نيتك الآن واستمع لهذه الكلمات لتشحذ همتك.",
        link: "https://www.youtube.com/results?search_query=محاضرة+عن+عدم+اليأس+من+رحمة+الله",
        sidebar: "بداية جديدة.. استعن بالله ولا تعجز ❤️"
    }
};

document.addEventListener('DOMContentLoaded', () => {
    if (typeof lucide !== 'undefined') lucide.createIcons();
    // تعيين التاريخ
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const today = new Date().toLocaleDateString('ar-EG', dateOptions);
    const dateEl = document.getElementById('current-date');
    if(dateEl) dateEl.innerText = today;
    
    initApp();
});

function initApp() {
    if (typeof firebase === 'undefined') {
        console.error("Firebase SDK missing");
        return;
    }
    
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();

    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            showScreen('app-screen');
            syncUserDataRealtime(user.uid);
        } else {
            currentUser = null;
            showScreen('landing-screen');
        }
        hideLoader();
    });
}

// === Navigation ===

function hideLoader() {
    const loader = document.getElementById('loader');
    if(loader) {
        loader.style.opacity = '0';
        setTimeout(() => loader.style.display = 'none', 500);
    }
}

function showScreen(screenId) {
    ['landing-screen', 'auth-screen', 'app-screen'].forEach(id => {
        const el = document.getElementById(id);
        if (id === screenId) {
            el.classList.remove('hidden');
            if (id === 'landing-screen') el.scrollTop = 0;
            // لو فتحنا التطبيق، لازم نهيأ الرسم البياني لو مش موجود
            if (id === 'app-screen') setTimeout(initChart, 100); 
        } else {
            el.classList.add('hidden');
        }
    });
}

function goToAuth(mode = 'login') {
    showScreen('auth-screen');
    switchAuthMode(mode);
}

function showLandingScreen() {
    showScreen('landing-screen');
}

function switchAuthMode(mode) {
    const loginForm = document.getElementById('login-form');
    const regForm = document.getElementById('register-form');
    const tabLogin = document.getElementById('tab-login');
    const tabReg = document.getElementById('tab-register');
    const errorBox = document.getElementById('auth-error');

    errorBox.classList.add('hidden');

    if (mode === 'login') {
        loginForm.classList.remove('hidden');
        regForm.classList.add('hidden');
        tabLogin.classList.replace('text-gray-500', 'text-[#047857]');
        tabLogin.classList.add('bg-white', 'shadow-sm');
        tabReg.classList.remove('bg-white', 'shadow-sm');
        tabReg.classList.replace('text-[#047857]', 'text-gray-500');
    } else {
        loginForm.classList.add('hidden');
        regForm.classList.remove('hidden');
        tabReg.classList.replace('text-gray-500', 'text-[#047857]');
        tabReg.classList.add('bg-white', 'shadow-sm');
        tabLogin.classList.remove('bg-white', 'shadow-sm');
        tabLogin.classList.replace('text-[#047857]', 'text-gray-500');
    }
}

// === Logic ===

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
        showAuthError("خطأ في الدخول: تأكد من البريد أو كلمة المرور");
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    try {
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        await cred.user.updateProfile({ displayName: name });
        await db.collection('users').doc(cred.user.uid).set(DEFAULT_USER_DATA);
    } catch (error) {
        showAuthError("خطأ في التسجيل: " + error.message);
    }
}

async function handleLogout() {
    if(unsubscribeSnapshot) unsubscribeSnapshot();
    await auth.signOut();
    showScreen('landing-screen');
}

function showAuthError(msg) {
    const el = document.getElementById('auth-error');
    el.innerText = msg;
    el.classList.remove('hidden');
}

// === Realtime Data & UI ===

function syncUserDataRealtime(uid) {
    unsubscribeSnapshot = db.collection('users').doc(uid).onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();
            renderTasks(data);
            updateDashboardStats(data); // تحديث الرسم البياني والرسائل
        } else {
            db.collection('users').doc(uid).set(DEFAULT_USER_DATA);
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

    // الصلوات (تصميم الكروت الجديد)
    let html = `<div><div class="flex items-center gap-3 mb-5"><div class="w-1.5 h-8 bg-[#047857] rounded-full"></div><h3 class="text-xl font-bold text-gray-800">الفرائض والأساسيات</h3></div><div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">`;
    
    const pNames = { fajr: 'الفجر', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };
    for (const [k, v] of Object.entries(data.prayers)) {
        html += `
            <div class="bg-white p-5 rounded-2xl border transition-all duration-300 hover:-translate-y-1 flex justify-between items-center group cursor-pointer ${v?'border-green-200 bg-green-50/50 shadow-sm':'border-gray-100 hover:shadow-md'}" onclick="toggleTask('prayers','${k}',${!v})">
                <div class="flex gap-4 items-center">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center transition-colors ${v?'bg-[#047857] text-white':'bg-gray-100 text-gray-400 group-hover:bg-green-100 group-hover:text-[#047857]'}">
                        <i data-lucide="${v?'check':'clock'}" class="w-5 h-5"></i>
                    </div>
                    <span class="font-bold text-lg ${v?'text-[#047857]':'text-gray-600'}">${pNames[k]}</span>
                </div>
                <div class="w-6 h-6 rounded-full border-2 flex items-center justify-center ${v?'border-[#047857] bg-[#047857]':'border-gray-300'}">
                    ${v ? '<i data-lucide="check" class="w-3 h-3 text-white"></i>' : ''}
                </div>
            </div>`;
    }
    html += `</div></div>`;

    // السنن
    html += `<div class="mt-10"><div class="flex items-center gap-3 mb-5"><div class="w-1.5 h-8 bg-[#D4AF37] rounded-full"></div><h3 class="text-xl font-bold text-gray-800">النوافل والسنن</h3></div><div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">`;
    const hNames = { duha: 'الضحى', quran: 'ورد القرآن', azkar: 'الأذكار' };
    const hIcons = { duha: 'sun', quran: 'book-open', azkar: 'heart' };
    
    for (const [k, v] of Object.entries(data.habits || {})) {
        html += `
            <div class="bg-white p-5 rounded-2xl border transition-all duration-300 hover:-translate-y-1 flex justify-between items-center group cursor-pointer ${v?'border-yellow-200 bg-yellow-50/50 shadow-sm':'border-gray-100 hover:shadow-md'}" onclick="toggleTask('habits','${k}',${!v})">
                <div class="flex gap-4 items-center">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center transition-colors ${v?'bg-yellow-500 text-white':'bg-gray-100 text-gray-400 group-hover:bg-yellow-100 group-hover:text-yellow-600'}">
                        <i data-lucide="${hIcons[k]}" class="w-5 h-5"></i>
                    </div>
                    <span class="font-bold text-lg ${v?'text-yellow-700':'text-gray-600'}">${hNames[k]}</span>
                </div>
                <div class="w-6 h-6 rounded-full border-2 flex items-center justify-center ${v?'border-yellow-500 bg-yellow-500':'border-gray-300'}">
                    ${v ? '<i data-lucide="check" class="w-3 h-3 text-white"></i>' : ''}
                </div>
            </div>`;
    }
    html += `</div></div>`;

    container.innerHTML = html;
    lucide.createIcons();
}

function toggleTask(cat, key, val) {
    const update = {};
    update[`${cat}.${key}`] = val;
    db.collection('users').doc(currentUser.uid).update(update);
}

// === Chart & Smart Messages Logic ===

function initChart() {
    const ctx = document.getElementById('performanceChart');
    if(!ctx) return;
    
    // تدمير الرسم القديم لو موجود لمنع التداخل
    if (performanceChartInstance) {
        performanceChartInstance.destroy();
    }

    performanceChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['منجز', 'متبقي'],
            datasets: [{
                data: [0, 100],
                backgroundColor: ['#047857', '#E5E7EB'],
                borderWidth: 0,
                cutout: '75%' // سمك الدائرة
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            animation: { animateScale: true, animateRotate: true }
        }
    });
}

function updateDashboardStats(data) {
    let total = 0, done = 0;
    if (data.prayers) Object.values(data.prayers).forEach(v => { total++; if(v) done++; });
    if (data.habits) Object.values(data.habits).forEach(v => { total++; if(v) done++; });
    
    const percent = total === 0 ? 0 : Math.round((done / total) * 100);
    
    // 1. تحديث الرسم البياني
    const percentEl = document.getElementById('chart-percent');
    if(percentEl) percentEl.innerText = `${percent}%`;

    if (performanceChartInstance) {
        performanceChartInstance.data.datasets[0].data = [percent, 100 - percent];
        performanceChartInstance.update();
    }

    // 2. تحديث الرسالة الذكية (Smart Feedback)
    updateFeedbackMessage(percent);
}

function updateFeedbackMessage(percent) {
    let msgData;
    
    // تحديد مستوى الأداء
    if (percent >= 80) msgData = MESSAGES_DB.high;
    else if (percent >= 50) msgData = MESSAGES_DB.medium;
    else msgData = MESSAGES_DB.low;

    // تحديث النصوص في الواجهة
    document.getElementById('feedback-title').innerText = msgData.title;
    document.getElementById('feedback-body').innerText = msgData.body;
    document.getElementById('feedback-link').href = msgData.link;
    document.getElementById('sidebar-message-box').innerText = msgData.sidebar;
}