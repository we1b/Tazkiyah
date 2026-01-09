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

// === إدارة التاريخ ===
let currentDate = new Date(); // التاريخ المعروض حالياً

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
            // عند الدخول، نضبط التاريخ على اليوم ونحمل البيانات
            currentDate = new Date();
            loadUserDataForDate(currentDate);
        } else {
            currentUser = null;
            showScreen('landing-screen');
        }
        hideLoader();
    });
}

// === Date Helpers ===
function getFormattedDateID(date) {
    // يحول التاريخ لصيغة YYYY-MM-DD لاستخدامه كـ ID في قاعدة البيانات
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - (offset*60*1000));
    return localDate.toISOString().split('T')[0];
}

function getReadableDate(date) {
    return date.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function isToday(date) {
    const d1 = getFormattedDateID(date);
    const d2 = getFormattedDateID(new Date());
    return d1 === d2;
}

// === Navigation & Date Control ===
function changeDate(days) {
    // تغيير اليوم
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + days);
    
    // منع الذهاب للمستقبل
    if (newDate > new Date()) return;
    
    currentDate = newDate;
    loadUserDataForDate(currentDate);
}

function updateDateUI() {
    const dateStr = getReadableDate(currentDate);
    document.getElementById('current-date-display').innerText = dateStr;
    
    // تعطيل زر "التالي" لو كنا في يوم النهاردة
    const nextBtn = document.getElementById('btn-next-day');
    if (isToday(currentDate)) {
        nextBtn.disabled = true;
        nextBtn.classList.add('opacity-30');
    } else {
        nextBtn.disabled = false;
        nextBtn.classList.remove('opacity-30');
    }

    // وضع "للقراءة فقط"
    const appContainer = document.querySelector('#app-screen main');
    const isReadOnly = !isToday(currentDate);
    
    // إضافة كلاسات لتعطيل التفاعل بصرياً وعملياً
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

// === Realtime Data (The Core Logic) ===
function loadUserDataForDate(date) {
    if (unsubscribeSnapshot) unsubscribeSnapshot(); // إيقاف الاستماع لليوم السابق
    
    const dateID = getFormattedDateID(date);
    updateDateUI();

    // المسار الجديد: users -> uid -> daily_logs -> YYYY-MM-DD
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
                // لو السجل مش موجود
                if (isToday(date)) {
                    // لو ده النهاردة، ننشئ سجل جديد (تجديد تلقائي)
                    db.collection('users').doc(currentUser.uid)
                        .collection('daily_logs').doc(dateID)
                        .set(DEFAULT_USER_DATA);
                } else {
                    // لو ده يوم فات ومكنش فيه سجل (فاته التقرير)
                    // نعرض صفحة فاضية بس (بدون إنشاء داتا عشان منلعبش في التاريخ)
                    lastUserData = DEFAULT_USER_DATA;
                    renderTasks(DEFAULT_USER_DATA);
                    renderAdhkar([]);
                    updateDashboardStats(DEFAULT_USER_DATA);
                }
            }
            
            // تحديث بيانات المستخدم
            const name = currentUser.displayName || currentUser.email.split('@')[0];
            document.getElementById('user-name-display').innerText = name;
            document.getElementById('welcome-name').innerText = name;
            document.getElementById('user-avatar').innerText = name[0].toUpperCase();
        });
}

// === UI Rendering ===
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

// === Actions Logic (Secured) ===
function toggleTask(cat, key, val) {
    // حماية إضافية: لو مش النهاردة، امنع التعديل
    if (!isToday(currentDate)) return;

    const dateID = getFormattedDateID(currentDate);
    const update = {};
    update[`${cat}.${key}`] = val;
    
    db.collection('users').doc(currentUser.uid)
      .collection('daily_logs').doc(dateID)
      .update(update);
}

async function addNewDhikr() {
    if (!isToday(currentDate)) return; // حماية
    
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
    if (!isToday(currentDate)) return; // حماية

    const dateID = getFormattedDateID(currentDate);
    const docRef = db.collection('users').doc(currentUser.uid).collection('daily_logs').doc(dateID);
    const doc = await docRef.get();
    let list = doc.data().customAdhkar;
    list[index].count += 1;
    await docRef.update({ customAdhkar: list });
}

async function removeAdhkar(index) {
    if (!isToday(currentDate)) return; // حماية
    if(!confirm("حذف هذا الذكر؟")) return;
    
    const dateID = getFormattedDateID(currentDate);
    const docRef = db.collection('users').doc(currentUser.uid).collection('daily_logs').doc(dateID);
    const doc = await docRef.get();
    let list = doc.data().customAdhkar;
    list.splice(index, 1);
    await docRef.update({ customAdhkar: list });
}

function toggleAdhkarModal() { document.getElementById('adhkar-modal').classList.toggle('hidden'); }

// === Standard Boilerplate Logic (Auth, Loader, Screens) ===
// (Same as before, simplified for brevity but functional)
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

// === Chart & Stats ===
function initChart() {
    const ctx = document.getElementById('performanceChart');
    if(!ctx) return;
    if (performanceChartInstance) performanceChartInstance.destroy();
    performanceChartInstance = new Chart(ctx, { type: 'doughnut', data: { labels: ['منجز', 'متبقي'], datasets: [{ data: [0, 100], backgroundColor: ['#047857', '#E5E7EB'], borderWidth: 0, cutout: '75%' }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, animation: { animateScale: true, animateRotate: true } } });
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

// === Report Modal ===
function openReportModal() {
    const dateStr = getReadableDate(currentDate); // Use current viewed date
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
        for (const [k, v] of Object.entries(lastUserData.prayers)) {
            if(v) listEl.innerHTML += `<li class="flex items-center gap-2 text-green-700"><span class="w-2 h-2 rounded-full bg-green-500"></span> صلاة ${pNames[k]}</li>`;
        }
        const hNames = { rawatib: 'السنن الرواتب', duha: 'الضحى', witr: 'الوتر', quran: 'ورد القرآن', azkar_m: 'أذكار الصباح', azkar_e: 'أذكار المساء', azkar_s: 'أذكار النوم' };
        for (const [k, v] of Object.entries({ ...DEFAULT_USER_DATA.habits, ...lastUserData.habits })) {
            if(v && hNames[k]) listEl.innerHTML += `<li class="flex items-center gap-2 text-yellow-700"><span class="w-2 h-2 rounded-full bg-yellow-500"></span> ${hNames[k]}</li>`;
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
    const hNames = { rawatib: 'السنن الرواتب', duha: 'الضحى', witr: 'الوتر', quran: 'ورد القرآن', azkar_m: 'أذكار الصباح', azkar_e: 'أذكار المساء', azkar_s: 'أذكار النوم' };
    const habits = { ...DEFAULT_USER_DATA.habits, ...lastUserData.habits };
    for (const [k, v] of Object.entries(habits)) if(hNames[k]) rows.push([hNames[k], v?"تم":"لم يتم"]);
    const ws = XLSX.utils.aoa_to_sheet(rows); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Report"); XLSX.writeFile(wb, `Report-${Date.now()}.xlsx`);
}