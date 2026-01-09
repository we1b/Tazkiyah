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

const DEFAULT_USER_DATA = {
    prayers: { fajr: false, dhuhr: false, asr: false, maghrib: false, isha: false },
    habits: { duha: false, quran: false, azkar: false }
};

document.addEventListener('DOMContentLoaded', () => {
    if (typeof lucide !== 'undefined') lucide.createIcons();
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
            // لو المستخدم مش مسجل، نظهر له صفحة الهبوط أولاً
            showScreen('landing-screen');
        }
        hideLoader();
    });
}

// === دوال التنقل (Navigation) ===

function hideLoader() {
    const loader = document.getElementById('loader');
    if(loader) {
        loader.style.opacity = '0';
        setTimeout(() => loader.style.display = 'none', 500);
    }
}

// دالة عامة لإظهار شاشة وإخفاء الباقي
function showScreen(screenId) {
    ['landing-screen', 'auth-screen', 'app-screen'].forEach(id => {
        const el = document.getElementById(id);
        if (id === screenId) {
            el.classList.remove('hidden');
            if (id === 'landing-screen') el.scrollTop = 0; // Reset scroll
        } else {
            el.classList.add('hidden');
        }
    });
}

// الانتقال من الهبوط إلى الدخول
function goToAuth(mode = 'login') {
    showScreen('auth-screen');
    switchAuthMode(mode);
}

// الرجوع للهبوط
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

// === دوال المنطق والبيانات (Logic) ===

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
    showScreen('landing-screen'); // ارجع للهبوط بعد الخروج
}

function showAuthError(msg) {
    const el = document.getElementById('auth-error');
    el.innerText = msg;
    el.classList.remove('hidden');
}

// === مزامنة البيانات ===

function syncUserDataRealtime(uid) {
    unsubscribeSnapshot = db.collection('users').doc(uid).onSnapshot(doc => {
        if (doc.exists) renderTasks(doc.data());
        else db.collection('users').doc(uid).set(DEFAULT_USER_DATA);
        
        // تحديث الأسماء
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

    // الصلوات
    let html = `<div><div class="flex items-center gap-2 mb-4"><div class="w-1 h-6 bg-[#047857] rounded-full"></div><h3 class="text-xl font-bold">الفرائض</h3></div><div class="grid grid-cols-1 md:grid-cols-3 gap-4">`;
    const pNames = { fajr: 'الفجر', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };
    for (const [k, v] of Object.entries(data.prayers)) {
        html += `<div class="bg-white p-4 rounded-xl border ${v?'border-green-200 bg-green-50':'border-gray-200'} shadow-sm flex justify-between items-center"><div class="flex gap-3"><input type="checkbox" onchange="toggleTask('prayers','${k}',this.checked)" class="w-6 h-6 accent-[#047857]" ${v?'checked':''}> <span class="font-bold ${v?'text-[#047857]':''}">${pNames[k]}</span></div></div>`;
    }
    html += `</div></div>`;

    // السنن
    html += `<div class="mt-8"><div class="flex items-center gap-2 mb-4"><div class="w-1 h-6 bg-[#D4AF37] rounded-full"></div><h3 class="text-xl font-bold">السنن</h3></div><div class="grid grid-cols-1 md:grid-cols-3 gap-4">`;
    const hNames = { duha: 'الضحى', quran: 'ورد القرآن', azkar: 'الأذكار' };
    for (const [k, v] of Object.entries(data.habits || {})) {
        html += `<div class="bg-white p-4 rounded-xl border ${v?'border-yellow-200 bg-yellow-50':'border-gray-200'} shadow-sm flex justify-between items-center"><div class="flex gap-3"><input type="checkbox" onchange="toggleTask('habits','${k}',this.checked)" class="w-6 h-6 accent-yellow-600" ${v?'checked':''}> <span class="font-bold ${v?'text-yellow-700':''}">${hNames[k]}</span></div></div>`;
    }
    html += `</div></div>`;

    container.innerHTML = html;
    calculateProgress(data);
    lucide.createIcons();
}

function calculateProgress(data) {
    let total = 0, done = 0;
    if (data.prayers) Object.values(data.prayers).forEach(v => { total++; if(v) done++; });
    if (data.habits) Object.values(data.habits).forEach(v => { total++; if(v) done++; });
    const percent = total===0 ? 0 : Math.round((done/total)*100);
    document.getElementById('progress-bar').style.width = `${percent}%`;
    document.getElementById('progress-text').innerText = `${percent}%`;
}

function toggleTask(cat, key, val) {
    const update = {};
    update[`${cat}.${key}`] = val;
    db.collection('users').doc(currentUser.uid).update(update);
}