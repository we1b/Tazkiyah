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
let lastUserData = null; // لحفظ آخر نسخة من البيانات للتقارير

const DEFAULT_USER_DATA = {
    prayers: { fajr: false, dhuhr: false, asr: false, maghrib: false, isha: false },
    habits: { rawatib: false, duha: false, witr: false, quran: false, azkar_m: false, azkar_e: false, azkar_s: false },
    customAdhkar: [] 
};

const MESSAGES_DB = {
    high: { title: "الله يفتح عليك.. هذا هو الثبات! 🌟", body: "أداء ممتاز اليوم. هذا الثبات نعمة عظيمة، اسأل الله أن يديمها عليك. استمع لكلمات الشيخ أمجد عن 'لذة القرب'.", link: "https://www.youtube.com/results?search_query=الشيخ+أمجد+سمير+الثبات", sidebar: "أداءك عالٍ! استمر يا بطل 💪" },
    medium: { title: "أحسنت.. واصل المسير ✨", body: "قطعت شوطاً كبيراً، جاهد نفسك في الباقي. النفس تحتاج لترويض، وأنت لها.", link: "https://www.youtube.com/results?search_query=الشيخ+أمجد+سمير+علو+الهمة", sidebar: "اقتربت، شد حيلك 🚀" },
    low: { title: "لا تيأس، البدايات دائماً صعبة 🌿", body: "تعثرت اليوم؟ لا بأس، المهم ألا تتوقف. الله يحب المحاولين. جدد نيتك الآن واستمع لهذه الكلمات لتشحذ همتك.", link: "https://www.youtube.com/results?search_query=الشيخ+أمجد+سمير+حسن+الظن+بالله", sidebar: "بداية جديدة.. استعن بالله ❤️" }
};

document.addEventListener('DOMContentLoaded', () => {
    if (typeof lucide !== 'undefined') lucide.createIcons();
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const today = new Date().toLocaleDateString('ar-EG', dateOptions);
    const dateEl = document.getElementById('current-date');
    if(dateEl) dateEl.innerText = today;
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
    if(loader) { loader.style.opacity = '0'; setTimeout(() => loader.style.display = 'none', 500); }
}

function showScreen(screenId) {
    ['landing-screen', 'auth-screen', 'app-screen'].forEach(id => {
        const el = document.getElementById(id);
        if (id === screenId) {
            el.classList.remove('hidden');
            if (id === 'app-screen') setTimeout(initChart, 100); 
        } else {
            el.classList.add('hidden');
        }
    });
}

function goToAuth(mode) { showScreen('auth-screen'); switchAuthMode(mode); }
function showLandingScreen() { showScreen('landing-screen'); }

function switchAuthMode(mode) {
    const loginForm = document.getElementById('login-form');
    const regForm = document.getElementById('register-form');
    const tabLogin = document.getElementById('tab-login');
    const tabReg = document.getElementById('tab-register');
    const errorBox = document.getElementById('auth-error');
    errorBox.classList.add('hidden');

    if (mode === 'login') {
        loginForm.classList.remove('hidden'); regForm.classList.add('hidden');
        tabLogin.classList.replace('text-gray-500', 'text-[#047857]'); tabLogin.classList.add('bg-white', 'shadow-sm');
        tabReg.classList.remove('bg-white', 'shadow-sm'); tabReg.classList.replace('text-[#047857]', 'text-gray-500');
    } else {
        loginForm.classList.add('hidden'); regForm.classList.remove('hidden');
        tabReg.classList.replace('text-gray-500', 'text-[#047857]'); tabReg.classList.add('bg-white', 'shadow-sm');
        tabLogin.classList.remove('bg-white', 'shadow-sm'); tabLogin.classList.replace('text-[#047857]', 'text-gray-500');
    }
}

// === Auth Logic ===
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    try { await auth.signInWithEmailAndPassword(email, password); } 
    catch (error) { showAuthError("خطأ في الدخول: تأكد من البيانات"); }
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
    } catch (error) { showAuthError("خطأ في التسجيل: " + error.message); }
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

// === Realtime Data & Rendering ===
function syncUserDataRealtime(uid) {
    unsubscribeSnapshot = db.collection('users').doc(uid).onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();
            lastUserData = data; // Save for reports
            renderTasks(data);
            renderAdhkar(data.customAdhkar || []);
            updateDashboardStats(data);
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

    // 1. الصلوات
    let html = `<div><div class="flex items-center gap-3 mb-5"><div class="w-1.5 h-8 bg-[#047857] rounded-full"></div><h3 class="text-xl font-bold text-gray-800">الفرائض (الأساس)</h3></div><div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">`;
    const pNames = { fajr: 'الفجر', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };
    for (const [k, v] of Object.entries(data.prayers)) {
        html += `<div class="bg-white p-5 rounded-2xl border transition-all hover:-translate-y-1 flex justify-between items-center cursor-pointer ${v?'border-green-200 bg-green-50/50':'border-gray-100'}" onclick="toggleTask('prayers','${k}',${!v})">
            <div class="flex gap-4 items-center">
                <div class="w-10 h-10 rounded-full flex items-center justify-center ${v?'bg-[#047857] text-white':'bg-gray-100 text-gray-400'}"><i data-lucide="${v?'check':'clock'}" class="w-5 h-5"></i></div>
                <span class="font-bold text-lg ${v?'text-[#047857]':'text-gray-600'}">${pNames[k]}</span>
            </div>
        </div>`;
    }
    html += `</div></div>`;

    // 2. السنن
    html += `<div class="mt-10"><div class="flex items-center gap-3 mb-5"><div class="w-1.5 h-8 bg-[#D4AF37] rounded-full"></div><h3 class="text-xl font-bold text-gray-800">السنن والنوافل</h3></div><div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">`;
    const hNames = { rawatib: 'السنن الرواتب (12)', duha: 'صلاة الضحى', witr: 'صلاة الوتر', quran: 'ورد القرآن', azkar_m: 'أذكار الصباح', azkar_e: 'أذكار المساء', azkar_s: 'أذكار النوم' };
    const hIcons = { rawatib:'layers', duha:'sun', witr:'moon', quran:'book-open', azkar_m:'sunrise', azkar_e:'sunset', azkar_s:'star' };
    const habits = { ...DEFAULT_USER_DATA.habits, ...data.habits };

    for (const [k, v] of Object.entries(habits)) {
        if(!hNames[k]) continue;
        html += `<div class="bg-white p-5 rounded-2xl border transition-all hover:-translate-y-1 flex justify-between items-center cursor-pointer ${v?'border-yellow-200 bg-yellow-50/50':'border-gray-100'}" onclick="toggleTask('habits','${k}',${!v})">
            <div class="flex gap-4 items-center">
                <div class="w-10 h-10 rounded-full flex items-center justify-center ${v?'bg-yellow-500 text-white':'bg-gray-100 text-gray-400'}"><i data-lucide="${hIcons[k]}" class="w-5 h-5"></i></div>
                <span class="font-bold text-lg ${v?'text-yellow-700':'text-gray-600'}">${hNames[k]}</span>
            </div>
        </div>`;
    }
    html += `</div></div>`;
    container.innerHTML = html;
    lucide.createIcons();
}

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
                    <div>
                        <h4 class="font-bold text-gray-800 text-lg">${item.name}</h4>
                        <span class="text-xs text-gray-400">الهدف: ${item.target}</span>
                    </div>
                    <button onclick="removeAdhkar(${index})" class="text-gray-300 hover:text-red-400"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>
                <div class="flex justify-between items-end relative z-10 mt-2">
                    <span class="text-3xl font-bold text-blue-600">${item.count}</span>
                    <button onclick="incrementAdhkar(${index})" class="click-anim w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 shadow-lg shadow-blue-200"><i data-lucide="plus" class="w-6 h-6"></i></button>
                </div>
                <div class="absolute bottom-0 left-0 h-1.5 bg-blue-100 w-full"><div class="h-full bg-blue-500 transition-all duration-300" style="width: ${progress}%"></div></div>
            </div>
        `;
    });
    document.getElementById('total-adhkar-count').innerText = total;
    lucide.createIcons();
}

function toggleAdhkarModal() { document.getElementById('adhkar-modal').classList.toggle('hidden'); }
async function addNewDhikr() {
    const name = document.getElementById('new-dhikr-name').value;
    const target = parseInt(document.getElementById('new-dhikr-target').value) || 100;
    if(!name) return alert("أدخل اسم الذكر");
    const docRef = db.collection('users').doc(currentUser.uid);
    const doc = await docRef.get();
    let currentList = doc.data().customAdhkar || [];
    currentList.push({ name, count: 0, target });
    await docRef.update({ customAdhkar: currentList });
    toggleAdhkarModal();
    document.getElementById('new-dhikr-name').value = '';
    document.getElementById('new-dhikr-target').value = '';
}
async function incrementAdhkar(index) {
    const docRef = db.collection('users').doc(currentUser.uid);
    const doc = await docRef.get();
    let list = doc.data().customAdhkar;
    list[index].count += 1;
    await docRef.update({ customAdhkar: list });
}
async function removeAdhkar(index) {
    if(!confirm("حذف هذا الذكر؟")) return;
    const docRef = db.collection('users').doc(currentUser.uid);
    const doc = await docRef.get();
    let list = doc.data().customAdhkar;
    list.splice(index, 1);
    await docRef.update({ customAdhkar: list });
}

function toggleTask(cat, key, val) {
    const update = {};
    update[`${cat}.${key}`] = val;
    db.collection('users').doc(currentUser.uid).update(update);
}

function initChart() {
    const ctx = document.getElementById('performanceChart');
    if(!ctx) return;
    if (performanceChartInstance) performanceChartInstance.destroy();
    performanceChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: ['منجز', 'متبقي'], datasets: [{ data: [0, 100], backgroundColor: ['#047857', '#E5E7EB'], borderWidth: 0, cutout: '75%' }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, animation: { animateScale: true, animateRotate: true } }
    });
}

function updateDashboardStats(data) {
    let total = 0, done = 0;
    if (data.prayers) Object.values(data.prayers).forEach(v => { total++; if(v) done++; });
    if (data.habits) Object.values(data.habits).forEach(v => { total++; if(v) done++; });
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

// === REPORT CENTER LOGIC (New) ===

function openReportModal() {
    // Fill Preview Data
    const date = new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const name = currentUser.displayName || "مستخدم تزكية";
    const percent = document.getElementById('chart-percent').innerText;
    const totalAdhkar = document.getElementById('total-adhkar-count').innerText;
    
    document.getElementById('report-date').innerText = date;
    document.getElementById('report-user').innerText = name;
    document.getElementById('report-percent').innerText = percent;
    document.getElementById('report-adhkar').innerText = totalAdhkar;

    // Fill Tasks List for Report
    const listEl = document.getElementById('report-tasks-list');
    listEl.innerHTML = '';
    
    if(lastUserData) {
        const pNames = { fajr: 'الفجر', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };
        let hasItems = false;
        
        // Add Prayers
        for (const [k, v] of Object.entries(lastUserData.prayers)) {
            if(v) {
                listEl.innerHTML += `<li class="flex items-center gap-2 text-green-700"><span class="w-2 h-2 rounded-full bg-green-500"></span> صلاة ${pNames[k]}</li>`;
                hasItems = true;
            }
        }
        
        // Add Habits
        const hNames = { rawatib: 'السنن الرواتب', duha: 'الضحى', witr: 'الوتر', quran: 'ورد القرآن', azkar_m: 'أذكار الصباح', azkar_e: 'أذكار المساء', azkar_s: 'أذكار النوم' };
        for (const [k, v] of Object.entries({ ...DEFAULT_USER_DATA.habits, ...lastUserData.habits })) {
            if(v && hNames[k]) {
                listEl.innerHTML += `<li class="flex items-center gap-2 text-yellow-700"><span class="w-2 h-2 rounded-full bg-yellow-500"></span> ${hNames[k]}</li>`;
                hasItems = true;
            }
        }

        if(!hasItems) listEl.innerHTML = `<li class="text-gray-400 italic">لم يتم إنجاز مهام بعد اليوم.</li>`;
    }

    document.getElementById('report-modal').classList.remove('hidden');
}

function closeReportModal() {
    document.getElementById('report-modal').classList.add('hidden');
}

// 1. Download as Image (PNG)
function downloadAsImage() {
    const element = document.getElementById('report-preview-content');
    html2canvas(element).then(canvas => {
        const link = document.createElement('a');
        link.download = `Tazkiah-Report-${Date.now()}.png`;
        link.href = canvas.toDataURL();
        link.click();
    });
}

// 2. Download as PDF
function downloadAsPDF() {
    const element = document.getElementById('report-preview-content');
    const { jsPDF } = window.jspdf;
    
    html2canvas(element).then(canvas => {
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const imgProps = pdf.getImageProperties(imgData);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
        
        pdf.addImage(imgData, 'PNG', 0, 10, pdfWidth, pdfHeight);
        pdf.save(`Tazkiah-Report-${Date.now()}.pdf`);
    });
}

// 3. Download as Excel
function downloadAsExcel() {
    if(!lastUserData) return;

    // Prepare Data Array
    const rows = [
        ["تقرير تطبيق تزكية اليومي"],
        ["التاريخ", new Date().toLocaleDateString('ar-EG')],
        ["الاسم", currentUser.displayName],
        ["نسبة الإنجاز", document.getElementById('chart-percent').innerText],
        ["إجمالي الذكر", document.getElementById('total-adhkar-count').innerText],
        [],
        ["نوع العبادة", "الحالة"],
    ];

    // Add Prayers
    const pNames = { fajr: 'الفجر', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };
    for (const [k, v] of Object.entries(lastUserData.prayers)) {
        rows.push([`صلاة ${pNames[k]}`, v ? "تم" : "لم يتم"]);
    }

    // Add Habits
    const hNames = { rawatib: 'السنن الرواتب', duha: 'الضحى', witr: 'الوتر', quran: 'ورد القرآن', azkar_m: 'أذكار الصباح', azkar_e: 'أذكار المساء', azkar_s: 'أذكار النوم' };
    const habits = { ...DEFAULT_USER_DATA.habits, ...lastUserData.habits };
    for (const [k, v] of Object.entries(habits)) {
        if(hNames[k]) rows.push([hNames[k], v ? "تم" : "لم يتم"]);
    }

    // Add Adhkar
    if(lastUserData.customAdhkar) {
        rows.push([], ["الأذكار الحرة", "العدد"]);
        lastUserData.customAdhkar.forEach(item => {
            rows.push([item.name, item.count]);
        });
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tazkiah Report");
    XLSX.writeFile(wb, `Tazkiah-Report-${Date.now()}.xlsx`);
}