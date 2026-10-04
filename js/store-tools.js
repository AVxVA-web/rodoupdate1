/* RODO Study Atelier — premium practical study tools. */
(function () {
    'use strict';

    const FOCUS_CYCLE_MINUTES = 50;
    const FOCUS_BREAK_MINUTES = 10;
    const FOCUS_CYCLE_MS = FOCUS_CYCLE_MINUTES * 60 * 1000;
    const FOCUS_BREAK_MS = FOCUS_BREAK_MINUTES * 60 * 1000;
    const FOCUS_TOOL_ID = `study_focus_${FOCUS_CYCLE_MINUTES}_${FOCUS_BREAK_MINUTES}`;

    const STUDY_STORE_PRODUCTS = [
        {
            id: 'study_backlog', type: 'backlog', title: 'مفكّك التراكم',
            subtitle: 'حوّل التراكم إلى خطوات قابلة للتنفيذ', cost: 180, icon: 'layers-2',
            desc: 'سجّل الدروس المتراكمة، حدّد حجم كل واحدة وأولويتها، وخلي الأداة تطلع لك الخطوة التالية بدل جدول أسبوعي جامد.',
            detail: 'لا يضيف مواعيد تلقائيًا ولا يسجل مذاكرة؛ هو لوحة ترتيب وقرار تساعدك تبدأ من المكان الصح.',
        },
        {
            id: 'study_mastery_path', type: 'mastery', title: 'مسار إتقان الدرس',
            subtitle: 'جلسة من 4 مراحل لدرس واحد', cost: 220, icon: 'route',
            desc: 'خد أي درس من نقطة “مش فاكر” إلى استدعاء ثم فهم وحل واختبار ذاتي، من غير قالب أسبوعي.',
            detail: 'مناسب لما تكون عايز تذاكر موضوعًا واحدًا بترتيب واضح بدل ما تتوه بين مهام كثيرة.',
        },
        {
            id: 'study_flashcards', type: 'flashcards', title: 'دفتر الاسترجاع النشط',
            subtitle: 'أنشئ بطاقات بلا حد داخل RODO', cost: 200, icon: 'layers-3',
            desc: 'أنشئ بطاقاتك حسب المادة في 3 خطوات: المادة ثم السؤال ثم الإجابة، وبعدها راجع كل مادة لوحدها.',
            detail: 'لا يوجد حد عددي تفرضه الأداة على البطاقات؛ كل مادة لها مكتبتها ومراجعتها الخاصة.',
        },
        {
            id: FOCUS_TOOL_ID, type: 'focus', title: `إيقاع التركيز ${FOCUS_CYCLE_MINUTES} / ${FOCUS_BREAK_MINUTES}`,
            subtitle: `${FOCUS_CYCLE_MINUTES} دقيقة تركيز حقيقي ثم ${FOCUS_BREAK_MINUTES} دقائق راحة`, cost: 120, icon: 'timer-reset',
            desc: `يستخدم مؤقت RODO الحالي، ويوقفه تلقائيًا بعد ${FOCUS_CYCLE_MINUTES} دقيقة فعلية ثم يبدأ راحة مستقلة.`,
            detail: 'دقائق الراحة لا تدخل سجل مذاكرتك، والاستئناف يظل بيدك.',
        }
    ];

    const LEGACY_ID_MIGRATIONS = {
        study_template_balanced: 'study_backlog',
        study_template_exam: 'study_mastery_path',
        study_focus_45_10: FOCUS_TOOL_ID
    };

    const DEFAULT_STUDY_TOOLS = {
        owned: [], active: [],
        backlog: [],
        mastery: { subject: '', topic: '', startedAt: null, completed: [false, false, false, false], stepRewardIds: [null, null, null, null], stepEarnedXp: [0, 0, 0, 0], stepEarnedCoins: [0, 0, 0, 0] },
        flashcards: [], flashcardFilter: 'all', flashcardReviewMode: 'due',
        composer: { step: 1, subject: '', question: '', answer: '' },
        focusMode: { phase: 'focus', breakUntil: null, cycleStartElapsedMs: 0 }
    };

    const STUDY_REWARD_VALUES = {
        backlogComplete: { xp: 15, coins: 10 },
        masteryStep: { xp: 15, coins: 10 },
        flashcardReview: { xp: 10, coins: 5 }
    };

    let currentReviewCardId = null;
    let isReviewAnswerVisible = false;
    let normalizedStudyToolsRef = null;
    let focusBreakInterval = null;

    const MASTERY_STEPS = [
        { title: 'استرجع', short: 'إيه اللي فاكره من غير كتاب؟', icon: 'brain', note: 'اكتب أو قول بصوتك أهم نقطتين أو ثلاث تفتكرهم قبل ما تراجع.' },
        { title: 'افهم', short: 'ثبّت الفكرة الأساسية', icon: 'book-open-check', note: 'ارجع للمصدر وركّز فقط على الجزء اللي محتاجه عشان تفهم الفكرة.' },
        { title: 'حل', short: 'طبّق من غير مساعدة', icon: 'pencil-ruler', note: 'حل سؤالًا أو مثالًا بنفسك قبل ما تبص للحل النموذجي.' },
        { title: 'اختبر', short: 'اقفل المصدر واختبر نفسك', icon: 'badge-check', note: 'سؤال أخير أو شرح سريع من الذاكرة يكشف هل الموضوع ثبت فعلًا.' }
    ];

    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function esc(value) { return typeof escapeHTML === 'function' ? escapeHTML(value) : String(value ?? ''); }
    function productFor(id) { return STUDY_STORE_PRODUCTS.find(item => item.id === id) || null; }
    function normalizedId(id) { return LEGACY_ID_MIGRATIONS[id] || id; }

    function ensureStudyToolsState() {
        if (!state.store || typeof state.store !== 'object') state.store = {};
        let tools = state.store.studyTools;
        if (!tools || typeof tools !== 'object' || Array.isArray(tools)) {
            tools = clone(DEFAULT_STUDY_TOOLS);
            state.store.studyTools = tools;
        }
        if (tools === normalizedStudyToolsRef) return tools;

        const rawOwned = Array.isArray(tools.owned) ? tools.owned : [];
        tools.owned = [...new Set(rawOwned.map(normalizedId).filter(id => productFor(id)))];
        const rawActive = Array.isArray(tools.active) ? tools.active : [];
        tools.active = [...new Set(rawActive.map(normalizedId).filter(id => tools.owned.includes(id)))];

        tools.backlog = Array.isArray(tools.backlog) ? tools.backlog.filter(Boolean).map(item => ({
            id: item.id || createEntityId(),
            subject: String(item.subject || '').slice(0, 80),
            topic: String(item.topic || '').slice(0, 140),
            priority: ['high', 'medium', 'low'].includes(item.priority) ? item.priority : 'medium',
            effort: ['small', 'medium', 'large'].includes(item.effort) ? item.effort : 'medium',
            status: ['next', 'queued', 'done'].includes(item.status) ? item.status : 'queued',
            createdAt: Number.isFinite(Number(item.createdAt)) ? Number(item.createdAt) : Date.now(),
            completedAt: Number.isFinite(Number(item.completedAt)) ? Number(item.completedAt) : null,
            rewardId: typeof item.rewardId === 'string' && item.rewardId.trim() ? item.rewardId : null,
            earnedXp: Math.max(0, Math.floor(Number(item.earnedXp) || 0)),
            earnedCoins: Math.max(0, Math.floor(Number(item.earnedCoins) || 0))
        })).filter(item => item.subject.trim() && item.topic.trim()) : [];

        const rawMastery = tools.mastery && typeof tools.mastery === 'object' ? tools.mastery : {};
        tools.mastery = { ...clone(DEFAULT_STUDY_TOOLS.mastery), ...rawMastery };
        tools.mastery.subject = String(tools.mastery.subject || '').slice(0, 80);
        tools.mastery.topic = String(tools.mastery.topic || '').slice(0, 140);
        tools.mastery.startedAt = Number.isFinite(Number(tools.mastery.startedAt)) ? Number(tools.mastery.startedAt) : null;
        tools.mastery.completed = Array.isArray(tools.mastery.completed) ? [0,1,2,3].map(i => !!tools.mastery.completed[i]) : [false, false, false, false];
        tools.mastery.stepRewardIds = Array.isArray(tools.mastery.stepRewardIds) ? [0,1,2,3].map(i => typeof tools.mastery.stepRewardIds[i] === 'string' ? tools.mastery.stepRewardIds[i] : null) : [null, null, null, null];
        tools.mastery.stepEarnedXp = Array.isArray(tools.mastery.stepEarnedXp) ? [0,1,2,3].map(i => Math.max(0, Math.floor(Number(tools.mastery.stepEarnedXp[i]) || 0))) : [0, 0, 0, 0];
        tools.mastery.stepEarnedCoins = Array.isArray(tools.mastery.stepEarnedCoins) ? [0,1,2,3].map(i => Math.max(0, Math.floor(Number(tools.mastery.stepEarnedCoins[i]) || 0))) : [0, 0, 0, 0];

        tools.flashcards = Array.isArray(tools.flashcards) ? tools.flashcards.filter(Boolean).map(card => ({
            id: Number.isSafeInteger(Number(card.id)) && Number(card.id) > 0 ? Number(card.id) : createEntityId(),
            subject: String(card.subject || '').slice(0, 80),
            question: String(card.question || '').slice(0, 500),
            answer: String(card.answer || '').slice(0, 1200),
            createdAt: Number.isFinite(Number(card.createdAt)) ? Number(card.createdAt) : Date.now(),
            lastReviewedAt: Number.isFinite(Number(card.lastReviewedAt)) ? Number(card.lastReviewedAt) : null,
            nextReviewAt: Number.isFinite(Number(card.nextReviewAt)) ? Number(card.nextReviewAt) : 0,
            reviewCount: Math.max(0, Math.floor(Number(card.reviewCount) || 0)),
            lastRewardDate: typeof card.lastRewardDate === 'string' ? card.lastRewardDate : null,
            lastRating: card.lastRating === 'remembered' || card.lastRating === 'hard' ? card.lastRating : null,
            rememberedCount: Math.max(0, Math.floor(Number(card.rememberedCount) || 0))
        })).filter(card => card.subject.trim() && card.question.trim() && card.answer.trim()) : [];

        tools.flashcardFilter = String(tools.flashcardFilter || 'all');
        if (tools.flashcardFilter !== 'all' && !tools.flashcards.some(card => card.subject === tools.flashcardFilter)) tools.flashcardFilter = 'all';
        tools.flashcardReviewMode = tools.flashcardReviewMode === 'remembered' ? 'remembered' : 'due';
        tools.composer = tools.composer && typeof tools.composer === 'object' ? { ...clone(DEFAULT_STUDY_TOOLS.composer), ...tools.composer } : clone(DEFAULT_STUDY_TOOLS.composer);
        tools.composer.step = Math.min(3, Math.max(1, Number(tools.composer.step) || 1));
        tools.composer.subject = String(tools.composer.subject || '').slice(0, 80);
        tools.composer.question = String(tools.composer.question || '').slice(0, 500);
        tools.composer.answer = String(tools.composer.answer || '').slice(0, 1200);

        tools.focusMode = tools.focusMode && typeof tools.focusMode === 'object' ? { ...clone(DEFAULT_STUDY_TOOLS.focusMode), ...tools.focusMode } : clone(DEFAULT_STUDY_TOOLS.focusMode);
        if (!['focus', 'rest'].includes(tools.focusMode.phase)) tools.focusMode.phase = 'focus';
        tools.focusMode.breakUntil = Number.isFinite(Number(tools.focusMode.breakUntil)) ? Number(tools.focusMode.breakUntil) : null;
        tools.focusMode.cycleStartElapsedMs = Math.max(0, Number(tools.focusMode.cycleStartElapsedMs) || 0);

        normalizedStudyToolsRef = tools;
        return tools;
    }
    function studyTools() { return ensureStudyToolsState(); }
    function owns(id) { return studyTools().owned.includes(normalizedId(id)); }
    function isActive(id) { return studyTools().active.includes(normalizedId(id)); }

    function persistAndRefresh({ schedule = false } = {}) {
        saveState();
        if (typeof renderStore === 'function') renderStore();
        if (schedule && typeof renderSchedule === 'function') renderSchedule();
        if (typeof updateGlobalUI === 'function') updateGlobalUI();
        renderFocusPreset();
    }

    function grantStudyReward(scope, entityId, baseXp, baseCoins, meta = {}) {
        if (typeof RewardService === 'undefined' || typeof createRewardId !== 'function') {
            return { granted: false, xp: 0, coins: 0, rewardId: null };
        }
        const xpMultiplier = typeof getBoostMultiplier === 'function' ? getBoostMultiplier('xp') : 1;
        const coinMultiplier = typeof getBoostMultiplier === 'function' ? getBoostMultiplier('coin') : 1;
        const finalXp = Math.floor(Math.max(0, baseXp) * Math.max(0, xpMultiplier));
        const finalCoins = Math.floor(Math.max(0, baseCoins) * Math.max(0, coinMultiplier));
        const rewardId = createRewardId(`study-tool:${scope}`, entityId);
        const granted = RewardService.grant({ id: rewardId, xp: finalXp, coins: finalCoins, meta: { source: 'study-tool', scope, entityId, ...meta } });
        if (!granted) return { granted: false, xp: 0, coins: 0, rewardId };
        if (state.todayStats && typeof state.todayStats.xp === 'number') state.todayStats.xp += finalXp;
        if (state.weeklyStats && typeof state.weeklyStats.xp === 'number') state.weeklyStats.xp += finalXp;
        if (typeof updateHeatmap === 'function' && finalXp > 0) updateHeatmap(finalXp);
        if (typeof updateDailyStreak === 'function') updateDailyStreak();
        return { granted: true, xp: finalXp, coins: finalCoins, rewardId };
    }

    function revokeStudyRewards(rewards) {
        if (!Array.isArray(rewards) || typeof RewardService === 'undefined' || typeof RewardService.revokeBatch !== 'function') return false;
        const requests = rewards.filter(item => item && item.rewardId).map(item => ({ id: item.rewardId, xp: item.xp, coins: item.coins }));
        if (!requests.length) return true;

        const result = RewardService.revokeBatch(requests);
        if (!result.ok) {
            if (result.reason === 'insufficient-balance') {
                showToast(`لا يمكن عكس المكافأة الآن. يلزم توفر كاملها (${result.xp} XP و${result.coins} عملة)؛ لم يتغير الإنجاز أو الرصيد.`, 'info');
            } else {
                showToast('تعذّر التحقق من المكافأة بأمان؛ لم يتغير الإنجاز أو الرصيد. أعد تحميل التطبيق ثم حاول مجددًا.', 'info');
            }
            return false;
        }
        if (state.todayStats && typeof state.todayStats.xp === 'number') state.todayStats.xp = Math.max(0, state.todayStats.xp - result.xp);
        if (state.weeklyStats && typeof state.weeklyStats.xp === 'number') state.weeklyStats.xp = Math.max(0, state.weeklyStats.xp - result.xp);
        if (typeof updateHeatmap === 'function' && result.xp > 0) updateHeatmap(-result.xp);
        return true;
    }

    function revokeStudyReward(rewardId, fallbackXp = 0, fallbackCoins = 0) {
        return revokeStudyRewards([{ rewardId, xp: fallbackXp, coins: fallbackCoins }]);
    }

    function renderStudyProduct(item, featured = false) {
        const tools = studyTools();
        const owned = tools.owned.includes(item.id);
        const active = tools.active.includes(item.id);
        const canAfford = Number(state.coins) >= item.cost;
        const visual = `<span class="rodo-tool-product-art art-${esc(item.type)}"><i data-lucide="${esc(item.icon)}"></i><span class="art-spark"></span></span>`;
        const status = owned ? (active ? 'مفعّلة الآن' : 'في مكتبتك') : 'ميزة دائمة · مرة واحدة';
        const action = owned
            ? `<button type="button" class="rodo-tool-button is-owned" onclick="setStoreCategory('tools')">${active ? 'افتح الأداة' : 'إدارة الأداة'}</button>`
            : `<button type="button" class="rodo-tool-button ${canAfford ? 'is-buy' : 'is-short'}" ${canAfford ? '' : 'disabled'} onclick="buyStudyStoreProduct('${esc(item.id)}')">${canAfford ? `اقتناء · ${item.cost} عملة` : `ينقصك ${item.cost - Number(state.coins)} عملة`}</button>`;
        return `<article class="rodo-tool-product ${featured ? 'is-featured' : ''} ${owned ? 'is-owned' : ''}">
            <div class="rodo-tool-card-head">${visual}<span class="rodo-tool-status ${active ? 'is-active' : ''}">${status}</span></div>
            <div class="rodo-tool-card-copy"><span class="rodo-tool-kicker">${esc(item.subtitle)}</span><h3>${esc(item.title)}</h3><p>${esc(item.desc)}</p></div>
            <div class="rodo-tool-truth"><i data-lucide="shield-check"></i><span>${esc(item.detail)}</span></div>
            <div class="rodo-tool-card-footer"><strong>${owned ? 'مقتناة' : `${item.cost} <small>عملة</small>`}</strong>${action}</div>
        </article>`;
    }

    function renderStoreFront() {
        const goalBox = document.getElementById('ui-store-goal');
        const featuredBox = document.getElementById('ui-store-featured');
        const grid = document.getElementById('ui-store-daily-deals');
        if (!featuredBox || !grid) return;
        const tools = studyTools();
        const nextGoal = STUDY_STORE_PRODUCTS.find(item => !tools.owned.includes(item.id));
        if (goalBox) {
            if (nextGoal) {
                const progress = Math.min(100, Math.floor((Number(state.coins) / nextGoal.cost) * 100));
                const remaining = Math.max(0, nextGoal.cost - Number(state.coins));
                goalBox.innerHTML = `<div class="rodo-tool-goal"><div><span class="rodo-tool-kicker">المحطة التالية</span><strong>${esc(nextGoal.title)}</strong><small>${remaining ? `باقي ${remaining} عملة` : 'رصيدك يكفي للاقتناء'}</small></div><div class="rodo-tool-progress"><div><span>رصيد الاقتناء</span><b>${progress}%</b></div><div class="rodo-tool-track"><span style="width:${progress}%"></span></div><small>${Number(state.coins)} / ${nextGoal.cost} عملة</small></div><button type="button" class="rodo-tool-link" onclick="setStoreCategory('tools')">مكتبة الأدوات</button></div>`;
            } else {
                goalBox.innerHTML = '<div class="rodo-tool-goal is-complete"><div><span class="rodo-tool-kicker">المكتبة مكتملة</span><strong>كل أدوات الدراسة الأساسية عندك.</strong><small>فعّل أي أداة وقت ما تحتاجها.</small></div><button type="button" class="rodo-tool-button is-owned" onclick="setStoreCategory(\'tools\')">افتح المكتبة</button></div>';
            }
        }
        const featured = STUDY_STORE_PRODUCTS.find(item => !tools.owned.includes(item.id)) || STUDY_STORE_PRODUCTS[0];
        featuredBox.innerHTML = `<div class="rodo-tool-hero"><div class="rodo-tool-hero-copy"><span class="rodo-tool-kicker"><i data-lucide="sparkles"></i> RODO STUDY ATELIER</span><h2>أدوات أقل.<br><em>مذاكرة أوضح.</em></h2><p>بدل جداول طويلة وقوالب جامدة، اختر أدوات صغيرة لها وظيفة واضحة: فكّ التراكم، إتقان درس، استرجاع نشط، أو إيقاع 50/10.</p><div class="rodo-tool-hero-pills"><span><i data-lucide="infinity"></i> بطاقات بلا حد داخل التطبيق</span><span><i data-lucide="sliders-horizontal"></i> تعمل وقت احتياجك</span><span><i data-lucide="shield-check"></i> بدون دقائق أو درجات مصطنعة</span></div></div><div class="rodo-tool-hero-art" aria-hidden="true"><span class="rodo-hero-ring ring-one"></span><span class="rodo-hero-ring ring-two"></span><div class="rodo-hero-book"><i data-lucide="orbit"></i><span>RODO<br>ATELIER</span></div><i data-lucide="sparkles" class="rodo-hero-spark spark-a"></i><i data-lucide="sparkles" class="rodo-hero-spark spark-b"></i></div><div class="rodo-tool-hero-bottom"><span>المقترح الآن</span><strong>${esc(featured.title)}</strong><button type="button" class="rodo-tool-button is-buy" onclick="${tools.owned.includes(featured.id) ? 'setStoreCategory(\'tools\')' : `buyStudyStoreProduct('${esc(featured.id)}')`}">${tools.owned.includes(featured.id) ? 'افتح أدواتي' : `اقتناء · ${featured.cost} عملة`}</button></div></div>`;
        grid.innerHTML = STUDY_STORE_PRODUCTS.map(item => renderStudyProduct(item)).join('');
        const ownedPreview = document.getElementById('ui-store-owned-preview');
        if (ownedPreview) {
            const owned = STUDY_STORE_PRODUCTS.filter(item => tools.owned.includes(item.id));
            ownedPreview.innerHTML = owned.length ? `<div class="rodo-store-owned-strip"><span>موجودة في مكتبتك</span>${owned.map(item => `<button type="button" onclick="setStoreCategory('tools')"><i data-lucide="${esc(item.icon)}"></i>${esc(item.title)}</button>`).join('')}<button type="button" class="rodo-owned-all" onclick="setStoreCategory('tools')">إدارة الأدوات <i data-lucide="arrow-left"></i></button></div>` : '';
        }
        lucide.createIcons({ root: document.getElementById('ui-store-front') || document });
    }

    function buyStudyStoreProduct(id) {
        const item = productFor(normalizedId(id));
        if (!item) return false;
        const tools = studyTools();
        if (tools.owned.includes(item.id)) { showToast('الأداة موجودة بالفعل في مكتبتك.', 'info'); return false; }
        if (Number(state.coins) < item.cost) { showToast(`ينقصك ${item.cost - Number(state.coins)} عملة لاقتناء الأداة.`, 'info'); return false; }
        const success = executeStoreTransaction(() => {
            const current = studyTools();
            if (current.owned.includes(item.id) || Number(state.coins) < item.cost) return false;
            state.coins -= item.cost;
            current.owned.push(item.id);
            current.active.push(item.id);
            return true;
        });
        if (success) showToast(`تم اقتناء «${item.title}» وتفعيلها. ستجدها في أدواتي.`, 'success');
        return !!success;
    }

    function toggleStudyFeature(id) {
        const item = productFor(normalizedId(id));
        if (!item || !owns(item.id)) return false;
        const tools = studyTools();
        if (tools.active.includes(item.id)) {
            if (item.type === 'focus' && (state.activeSession?.isRunning || tools.focusMode.phase === 'rest')) {
                showToast('أكمل فترة التركيز أو الراحة الحالية قبل إيقاف النمط.', 'info'); return false;
            }
            tools.active = tools.active.filter(value => value !== item.id);
            if (item.type === 'focus') { tools.focusMode.phase = 'focus'; tools.focusMode.breakUntil = null; clearFocusBreakInterval(); }
            persistAndRefresh();
            showToast(`تم إيقاف «${item.title}». المحتوى محفوظ.`, 'info');
            return true;
        }
        if (item.type === 'focus' && (state.activeSession?.isRunning || state.activeSession?.elapsedMs > 0 || state.activeSession?.pendingSave)) {
            showToast('أوقف أو احفظ مؤقت التركيز الحالي قبل تفعيل نمط 50/10.', 'info'); return false;
        }
        tools.active.push(item.id);
        persistAndRefresh();
        showToast(`تم تفعيل «${item.title}».`, 'success');
        return true;
    }

    function renderStudyToolsLibrary() {
        const container = document.getElementById('ui-study-tool-library');
        if (!container) return;
        const tools = studyTools();
        if (!tools.owned.length) {
            container.innerHTML = `<div class="rodo-tool-empty"><span><i data-lucide="library-big"></i></span><h3>مكتبتك تبدأ من هنا</h3><p>اقتَنِ أدوات عملية صغيرة بدل القوالب الجامدة، ثم فعّل أو أوقف ما تحتاجه.</p><button class="rodo-tool-button is-buy" type="button" onclick="setStoreCategory('storefront')">استكشف أدوات الدراسة</button></div>`;
        } else {
            container.innerHTML = tools.owned.map(id => {
                const item = productFor(id); if (!item) return '';
                const active = tools.active.includes(item.id);
                const label = active ? 'إيقاف الأداة' : 'تفعيل الأداة';
                return `<article class="rodo-owned-tool ${active ? 'is-active' : ''}"><span class="rodo-owned-icon"><i data-lucide="${esc(item.icon)}"></i></span><div class="rodo-owned-copy"><span class="rodo-tool-kicker">${active ? 'مفعّلة الآن' : 'جاهزة متى احتجتها'}</span><h3>${esc(item.title)}</h3><p>${esc(item.desc)}</p></div><button type="button" class="rodo-tool-toggle ${active ? 'is-on' : ''}" aria-pressed="${active}" onclick="toggleStudyFeature('${esc(item.id)}')"><i data-lucide="${active ? 'toggle-right' : 'toggle-left'}"></i><span>${label}</span></button></article>`;
            }).join('');
        }
        renderStudyWorkspaces();
        renderFocusPreset();
        lucide.createIcons({ root: container });
    }

    function renderStudyWorkspaces() {
        renderBacklogWorkspace();
        renderMasteryWorkspace();
        renderFlashcardsWorkspace();
    }

    function renderBacklogWorkspace() {
        const host = document.getElementById('ui-backlog-workspace');
        if (!host) return;
        const tools = studyTools();
        if (!owns('study_backlog')) { host.innerHTML = ''; return; }
        if (!isActive('study_backlog')) {
            host.innerHTML = `<section class="rodo-tool-workspace is-paused"><div><span class="rodo-tool-kicker">مفكّك التراكم</span><h3>الأداة متوقفة مؤقتًا</h3><p>بياناتك محفوظة. فعّل الأداة من مكتبتك لإعادة فتح لوحة التراكم.</p></div><button type="button" class="rodo-tool-button is-owned" onclick="toggleStudyFeature('study_backlog')">إعادة التفعيل</button></section>`;
            return;
        }
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        const effortText = { small: 'صغير', medium: 'متوسط', large: 'كبير' };
        const priorityText = { high: 'أولوية عالية', medium: 'أولوية متوسطة', low: 'أولوية منخفضة' };
        const openItems = tools.backlog.filter(item => item.status !== 'done').sort((a,b) => priorityOrder[a.priority]-priorityOrder[b.priority] || a.createdAt-b.createdAt);
        const nextItem = openItems[0];
        const rows = tools.backlog.length ? tools.backlog.slice().sort((a,b) => (a.status === 'done') - (b.status === 'done') || priorityOrder[a.priority]-priorityOrder[b.priority] || b.createdAt-a.createdAt).map(item => `<article class="rodo-backlog-row ${item.status === 'done' ? 'is-done' : ''}"><div><span>${esc(item.subject)}</span><strong>${esc(item.topic)}</strong><small>${priorityText[item.priority]} · ${effortText[item.effort]}</small></div><div class="rodo-backlog-actions"><button type="button" onclick="toggleBacklogItem('${esc(item.id)}')">${item.status === 'done' ? 'إرجاع' : 'تمت'}</button><button type="button" aria-label="حذف" onclick="deleteBacklogItem('${esc(item.id)}')"><i data-lucide="trash-2"></i></button></div></article>`).join('') : '<div class="rodo-tool-empty-line">أضف أول درس متراكم. ستظهر لك الخطوة التالية تلقائيًا هنا.</div>';
        host.innerHTML = `<section class="rodo-tool-workspace"><div class="rodo-workspace-head"><div><span class="rodo-tool-kicker">بدل «عندي حاجات كتير»</span><h3>شوف الخطوة التالية فقط</h3><p>أنت مش محتاج جدول أسبوع كامل عشان تبدأ؛ رتّب اللي عليك ثم خُد أول خطوة.</p></div><span class="rodo-workspace-count">${openItems.length}<small>مفتوحة</small></span></div>${nextItem ? `<div class="rodo-next-step"><span><i data-lucide="arrow-down-left"></i> الخطوة التالية</span><strong>${esc(nextItem.subject)} · ${esc(nextItem.topic)}</strong><small>${priorityText[nextItem.priority]} · ${effortText[nextItem.effort]}</small></div>` : '<div class="rodo-next-step is-clear"><span><i data-lucide="check-circle-2"></i> الوضع الحالي</span><strong>مفيش تراكم مفتوح.</strong><small>لما يظهر درس جديد، حطه هنا بدل ما تسيبه في دماغك.</small></div>'}<form class="rodo-backlog-form" onsubmit="addBacklogItem(event)"><label>المادة<input id="backlog-subject" maxlength="80" placeholder="مثال: رياضيات" required></label><label>الدرس أو الجزء<input id="backlog-topic" maxlength="140" placeholder="مثال: التفاضل الضمني" required></label><label>الأولوية<select id="backlog-priority"><option value="high">عالية</option><option value="medium" selected>متوسطة</option><option value="low">منخفضة</option></select></label><label>الحجم<select id="backlog-effort"><option value="small">صغير</option><option value="medium" selected>متوسط</option><option value="large">كبير</option></select></label><button type="submit" class="rodo-tool-button is-buy"><i data-lucide="plus"></i> أضف للتراكم</button></form><div class="rodo-backlog-list">${rows}</div></section>`;
        lucide.createIcons({ root: host });
    }

    function addBacklogItem(event) {
        event.preventDefault();
        if (!isActive('study_backlog')) return;
        const subject = document.getElementById('backlog-subject')?.value.trim() || '';
        const topic = document.getElementById('backlog-topic')?.value.trim() || '';
        const priority = document.getElementById('backlog-priority')?.value || 'medium';
        const effort = document.getElementById('backlog-effort')?.value || 'medium';
        if (!subject || !topic) return;
        studyTools().backlog.push({ id: createEntityId(), subject, topic, priority, effort, status: 'queued', createdAt: Date.now(), completedAt: null });
        saveState(); renderStudyWorkspaces(); showToast('اتضاف للتراكم — والـ«خطوة التالية» اتحددت تلقائيًا.', 'success');
    }

    function toggleBacklogItem(id) {
        const tools = studyTools();
        const item = tools.backlog.find(row => String(row.id) === String(id));
        if (!item || !isActive('study_backlog')) return;
        if (item.status === 'done') {
            if (item.rewardId && !revokeStudyReward(item.rewardId, item.earnedXp, item.earnedCoins)) return;
            item.status = 'queued'; item.completedAt = null; item.rewardId = null; item.earnedXp = 0; item.earnedCoins = 0;
            saveState(); renderBacklogWorkspace();
            showToast('تم إرجاع العنصر للتراكم وإلغاء مكافأته.', 'info');
            return;
        }
        const reward = grantStudyReward('backlog-complete', item.id, STUDY_REWARD_VALUES.backlogComplete.xp, STUDY_REWARD_VALUES.backlogComplete.coins, { subject: item.subject, topic: item.topic });
        if (!reward.granted) { showToast('لم يتم تسجيل المكافأة، لذلك لم يُحتسب الإنجاز.', 'info'); return; }
        item.status = 'done';
        item.completedAt = Date.now();
        item.rewardId = reward.rewardId;
        item.earnedXp = reward.xp;
        item.earnedCoins = reward.coins;
        saveState(); renderBacklogWorkspace();
        playSound('success');
        showToast(`إنجاز ممتاز — +${reward.xp} XP و+${reward.coins} عملة.`, 'success', true);
    }

    function deleteBacklogItem(id) {
        const tools = studyTools();
        const item = tools.backlog.find(row => String(row.id) === String(id));
        if (!item || !confirm(`حذف «${item.topic}» من التراكم؟`)) return;
        if (item.status === 'done' && item.rewardId && !revokeStudyReward(item.rewardId, item.earnedXp, item.earnedCoins)) return;
        tools.backlog = tools.backlog.filter(row => String(row.id) !== String(id));
        saveState(); renderBacklogWorkspace();
    }

    function renderMasteryWorkspace() {
        const host = document.getElementById('ui-mastery-workspace');
        if (!host) return;
        const tools = studyTools();
        if (!owns('study_mastery_path')) { host.innerHTML = ''; return; }
        if (!isActive('study_mastery_path')) {
            host.innerHTML = `<section class="rodo-tool-workspace is-paused"><div><span class="rodo-tool-kicker">مسار إتقان الدرس</span><h3>الأداة متوقفة مؤقتًا</h3><p>أعد تفعيلها من مكتبتك للبدء من أي درس.</p></div><button type="button" class="rodo-tool-button is-owned" onclick="toggleStudyFeature('study_mastery_path')">إعادة التفعيل</button></section>`;
            return;
        }
        const m = tools.mastery;
        const completeCount = m.completed.filter(Boolean).length;
        const stepCards = MASTERY_STEPS.map((step, index) => `<button type="button" class="rodo-mastery-step ${m.completed[index] ? 'is-done' : ''}" onclick="toggleMasteryStep(${index})"><span class="rodo-mastery-step-number">${index + 1}</span><span class="rodo-mastery-step-copy"><strong>${esc(step.title)}</strong><small>${esc(step.short)}</small></span><i data-lucide="${m.completed[index] ? 'check-circle-2' : step.icon}"></i></button>`).join('');
        host.innerHTML = `<section class="rodo-tool-workspace"><div class="rodo-workspace-head"><div><span class="rodo-tool-kicker">مسار إتقان الدرس</span><h3>${m.subject && m.topic ? `${esc(m.subject)} · ${esc(m.topic)}` : 'حوّل درسًا واحدًا إلى فهم قابل للاختبار'}</h3><p>أربع مراحل قصيرة. علّم المرحلة فقط لما تعملها فعلًا.</p></div><span class="rodo-workspace-count">${completeCount}/4<small>مراحل</small></span></div>${m.subject && m.topic ? `<div class="rodo-mastery-progress"><div><span>تقدم المسار</span><b>${completeCount * 25}%</b></div><div><span style="width:${completeCount * 25}%"></span></div></div>` : ''}${m.subject && m.topic ? `<div class="rodo-mastery-steps">${stepCards}</div>` : `<form class="rodo-mastery-start" onsubmit="startMasteryRoute(event)"><label>المادة<input id="mastery-subject" maxlength="80" placeholder="مثال: كيمياء" required></label><label>الدرس<input id="mastery-topic" maxlength="140" placeholder="مثال: Transition Elements" required></label><button type="submit" class="rodo-tool-button is-buy"><i data-lucide="play"></i> ابدأ مسار الدرس</button></form>`}${m.subject && m.topic ? `<div class="rodo-mastery-note"><i data-lucide="info"></i><span>${completeCount === 4 ? 'خلصت الأربع مراحل. تقدر تبدأ مسارًا جديدًا للدرس التالي.' : esc(MASTERY_STEPS[completeCount]?.note || 'كمّل المرحلة الحالية ثم انتقل للي بعدها.')}</span></div><div class="rodo-mastery-actions"><button type="button" class="rodo-tool-link" onclick="resetMasteryRoute()">درس جديد</button></div>` : ''}</section>`;
        lucide.createIcons({ root: host });
    }

    function startMasteryRoute(event) {
        event.preventDefault();
        const subject = document.getElementById('mastery-subject')?.value.trim() || '';
        const topic = document.getElementById('mastery-topic')?.value.trim() || '';
        if (!subject || !topic) return;
        const tools = studyTools();
        tools.mastery = { subject, topic, startedAt: Date.now(), completed: [false, false, false, false], stepRewardIds: [null, null, null, null], stepEarnedXp: [0, 0, 0, 0], stepEarnedCoins: [0, 0, 0, 0] };
        saveState(); renderMasteryWorkspace(); showToast('اتفتح مسار الدرس. ابدأ بمرحلة الاسترجاع قبل أي مراجعة.', 'success');
    }

    function toggleMasteryStep(index) {
        const stepIndex = Number(index);
        if (![0,1,2,3].includes(stepIndex)) return;
        const tools = studyTools();
        if (!tools.mastery.subject || !tools.mastery.topic) return;
        if (tools.mastery.completed[stepIndex]) {
            if (tools.mastery.stepRewardIds[stepIndex] && !revokeStudyReward(tools.mastery.stepRewardIds[stepIndex], tools.mastery.stepEarnedXp[stepIndex], tools.mastery.stepEarnedCoins[stepIndex])) return;
            tools.mastery.completed[stepIndex] = false;
            tools.mastery.stepRewardIds[stepIndex] = null;
            tools.mastery.stepEarnedXp[stepIndex] = 0;
            tools.mastery.stepEarnedCoins[stepIndex] = 0;
            saveState(); renderMasteryWorkspace();
            showToast('تم إلغاء المرحلة وإرجاع مكافأتها.', 'info');
            return;
        }
        const reward = grantStudyReward('mastery-step', `${tools.mastery.subject}:${tools.mastery.topic}:${stepIndex}`, STUDY_REWARD_VALUES.masteryStep.xp, STUDY_REWARD_VALUES.masteryStep.coins, { subject: tools.mastery.subject, topic: tools.mastery.topic, stepIndex });
        if (!reward.granted) { showToast('لم يتم تسجيل المكافأة، لذلك لم تُحسب المرحلة.', 'info'); return; }
        tools.mastery.completed[stepIndex] = true;
        tools.mastery.stepRewardIds[stepIndex] = reward.rewardId;
        tools.mastery.stepEarnedXp[stepIndex] = reward.xp;
        tools.mastery.stepEarnedCoins[stepIndex] = reward.coins;
        saveState(); renderMasteryWorkspace();
        playSound('success');
        showToast(`مرحلة مكتملة — +${reward.xp} XP و+${reward.coins} عملة.`, 'success', true);
    }

    function resetMasteryRoute() {
        const tools = studyTools();
        const pendingReversals = tools.mastery.stepRewardIds.map((rewardId, index) => ({
            rewardId,
            xp: tools.mastery.stepEarnedXp[index],
            coins: tools.mastery.stepEarnedCoins[index]
        })).filter(item => item.rewardId);
        if (!revokeStudyRewards(pendingReversals)) return;
        tools.mastery = clone(DEFAULT_STUDY_TOOLS.mastery);
        saveState(); renderMasteryWorkspace();
        showToast('تم إنهاء المسار الحالي وفتح مساحة لدرس جديد.', 'info');
    }

    function getFlashcardSubjects() {
        return [...new Set(studyTools().flashcards.map(card => card.subject.trim()).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'ar'));
    }

    function flashcardMatchesFilter(card, tools) {
        return tools.flashcardFilter === 'all' || card.subject === tools.flashcardFilter;
    }

    function isFlashcardDue(card, now = Date.now()) {
        return !card.nextReviewAt || card.nextReviewAt <= now;
    }

    function hasRememberedState(card) {
        return card.rememberedCount > 0 || card.lastRating === 'remembered';
    }

    function getFlashcardReviewPool(tools, mode = tools.flashcardReviewMode) {
        const filtered = tools.flashcards.filter(card => flashcardMatchesFilter(card, tools));
        return mode === 'remembered'
            ? filtered.filter(hasRememberedState)
            : filtered.filter(card => isFlashcardDue(card));
    }

    function setFlashcardReviewMode(mode) {
        const tools = studyTools();
        tools.flashcardReviewMode = mode === 'remembered' ? 'remembered' : 'due';
        currentReviewCardId = null;
        isReviewAnswerVisible = false;
        saveState();
        renderFlashcardsWorkspace();
    }

    function startStudyFlashcardReview(cardId = null) {
        const tools = studyTools();
        if (!isActive('study_flashcards')) return;

        if (cardId !== null && cardId !== undefined) {
            const target = tools.flashcards.find(card => card.id === Number(cardId) && flashcardMatchesFilter(card, tools) && hasRememberedState(card));
            if (!target) { showToast('البطاقة دي مش موجودة في قائمة «اللي افتكرتهم».', 'info'); return; }
            tools.flashcardReviewMode = 'remembered';
            currentReviewCardId = target.id;
            isReviewAnswerVisible = false;
            renderFlashcardReviewCard();
            return;
        }

        const pool = getFlashcardReviewPool(tools);
        if (!pool.length) {
            showToast(tools.flashcardReviewMode === 'remembered' ? 'لسه مفيش بطاقات اتسجلت كـ«افتكرتها» في الاختيار الحالي.' : 'مفيش بطاقات مستحقة للمراجعة في الاختيار الحالي.', 'info');
            return;
        }
        currentReviewCardId = pool.slice().sort((a,b) => (a.nextReviewAt || 0) - (b.nextReviewAt || 0) || a.createdAt - b.createdAt)[0].id;
        isReviewAnswerVisible = false;
        renderFlashcardReviewCard();
    }

    function renderRememberedFlashcards(tools) {
        const remembered = tools.flashcards
            .filter(card => flashcardMatchesFilter(card, tools) && hasRememberedState(card))
            .slice()
            .sort((a,b) => (b.lastReviewedAt || b.createdAt) - (a.lastReviewedAt || a.createdAt));
        if (!remembered.length) return '<div class="rodo-flashcard-empty">لسه مفيش بطاقات اتسجلت هنا إنك افتكرتها. أول ما تختار «افتكرتها» هتفضل محفوظة هنا.</div>';
        return `<div class="rodo-remembered-card-list">${remembered.map(card => {
            const due = isFlashcardDue(card);
            const timing = due ? 'مستحقة للمراجعة دلوقتي' : 'مراجعتها الجاية لسه محفوظة';
            return `<article class="rodo-remembered-card"><div><span class="rodo-flashcard-subject">${esc(card.subject)}</span><strong>${esc(card.question)}</strong><small>افتكرتها ${card.rememberedCount || 0} مرة · ${timing}</small></div><button type="button" class="rodo-tool-button is-owned" onclick="startStudyFlashcardReview(${card.id})">راجعها <i data-lucide="rotate-ccw"></i></button></article>`;
        }).join('')}</div>`;
    }

    function renderFlashcardsWorkspace() {
        const host = document.getElementById('ui-flashcards-workspace');
        if (!host) return;
        const tools = studyTools();
        if (!owns('study_flashcards')) { host.innerHTML = ''; return; }
        if (!isActive('study_flashcards')) {
            host.innerHTML = `<section class="rodo-flashcards-panel is-paused"><div><span class="rodo-tool-kicker">دفتر الاسترجاع النشط</span><h3>الأداة متوقفة مؤقتًا</h3><p>بطاقاتك محفوظة كما هي؛ أعد التفعيل لفتح المكتبة.</p></div><button type="button" class="rodo-tool-button is-owned" onclick="toggleStudyFeature('study_flashcards')">إعادة التفعيل</button></section>`;
            return;
        }
        const subjects = getFlashcardSubjects();
        const filtered = tools.flashcards.filter(card => flashcardMatchesFilter(card, tools));
        const now = Date.now();
        const dueCount = filtered.filter(card => isFlashcardDue(card, now)).length;
        const rememberedCount = filtered.filter(hasRememberedState).length;
        const subjectChips = [`<button type="button" class="rodo-subject-chip ${tools.flashcardFilter === 'all' ? 'is-active' : ''}" onclick="setFlashcardFilter('all')">كل المواد <b>${tools.flashcards.length}</b></button>`, ...subjects.map(subject => `<button type="button" class="rodo-subject-chip ${tools.flashcardFilter === subject ? 'is-active' : ''}" onclick="setFlashcardFilter(${esc(JSON.stringify(subject))})">${esc(subject)} <b>${tools.flashcards.filter(card => card.subject === subject).length}</b></button>`)].join('');
        const list = filtered.length ? filtered.slice().sort((a,b) => b.createdAt - a.createdAt).map(card => `<article class="rodo-flashcard-row"><span class="rodo-flashcard-subject">${esc(card.subject)}</span><strong>${esc(card.question)}</strong><small>${hasRememberedState(card) ? `افتكرتها ${card.rememberedCount || 0} مرة · ` : ''}${card.reviewCount ? `راجعتها ${card.reviewCount} مرة` : 'لسه ما راجعتهاش'}</small><button type="button" aria-label="حذف البطاقة" onclick="deleteStudyFlashcard(${card.id})"><i data-lucide="trash-2"></i></button></article>`).join('') : '<div class="rodo-flashcard-empty">مفيش بطاقات في المادة دي لسه.</div>';
        const composer = renderFlashcardComposer(tools);
        const reviewModeTabs = `<div class="rodo-flashcard-review-modes"><button type="button" class="${tools.flashcardReviewMode === 'due' ? 'is-active' : ''}" onclick="setFlashcardReviewMode('due')"><span>مستحقة الآن</span><b>${dueCount}</b></button><button type="button" class="${tools.flashcardReviewMode === 'remembered' ? 'is-active' : ''}" onclick="setFlashcardReviewMode('remembered')"><span>اللي افتكرتهم</span><b>${rememberedCount}</b></button></div>`;
        const rememberedBox = tools.flashcardReviewMode === 'remembered' ? `<div class="rodo-remembered-box"><div class="rodo-remembered-box-head"><div><span>مكتبة ثابتة</span><strong>${tools.flashcardFilter === 'all' ? 'البطاقات اللي افتكرتها' : `اللي افتكرتها في ${esc(tools.flashcardFilter)}`}</strong></div><small>البطاقات بتفضل محفوظة هنا وتقدر تعيد مراجعة أي واحدة.</small></div>${renderRememberedFlashcards(tools)}</div>` : '';
        host.innerHTML = `<section class="rodo-flashcards-panel"><div class="rodo-flashcards-heading"><div><span class="rodo-tool-kicker">مكتبة الاسترجاع</span><h3>بطاقاتك حسب المادة</h3><p>البطاقة لا تختفي بعد ما تفتكرها؛ حالتها فقط بتتغير وبتفضل موجودة في مكتبتك.</p></div><span class="rodo-card-count">${tools.flashcards.length}<small>بطاقة</small></span></div><div class="rodo-flashcard-subjects">${subjectChips}</div><div class="rodo-flashcard-layout">${composer}<div class="rodo-flashcard-review"><div class="rodo-flashcard-review-head"><strong>${tools.flashcardReviewMode === 'remembered' ? 'اللي افتكرتهم' : 'مراجعة مستحقة'} · ${tools.flashcardFilter === 'all' ? 'كل المواد' : esc(tools.flashcardFilter)}</strong><span>${tools.flashcardReviewMode === 'remembered' ? `${rememberedCount} محفوظة` : `${dueCount} مستحقة`}</span></div>${reviewModeTabs}<div id="ui-flashcard-review-card"></div><button type="button" class="rodo-tool-button is-owned" ${tools.flashcardReviewMode === 'remembered' ? (!rememberedCount ? 'disabled' : '') : (!dueCount ? 'disabled' : '')} onclick="startStudyFlashcardReview()">${tools.flashcardReviewMode === 'remembered' ? 'ابدأ من اللي افتكرتهم' : 'ابدأ المراجعة'}</button></div></div>${rememberedBox}<div class="rodo-flashcard-list">${list}</div></section>`;
        renderFlashcardReviewCard();
        lucide.createIcons({ root: host });
    }

    function renderFlashcardComposer(tools) {
        const c = tools.composer;
        if (c.step === 1) {
            const chips = getFlashcardSubjects().map(subject => `<button type="button" class="rodo-composer-choice" onclick="chooseFlashcardSubject(${esc(JSON.stringify(subject))})"><span>${esc(subject)}</span><i data-lucide="arrow-left"></i></button>`).join('');
            return `<div class="rodo-flashcard-form rodo-flashcard-composer"><div class="rodo-composer-progress"><span class="is-current">1</span><span>2</span><span>3</span></div><span class="rodo-tool-kicker">الخطوة 1 من 3</span><h4>إيه المادة؟</h4><p class="rodo-composer-help">اختار مادة موجودة أو اكتب مادة جديدة.</p><div class="rodo-composer-choices">${chips || '<span class="rodo-flashcard-empty">لسه مفيش مواد محفوظة.</span>'}</div><label>مادة جديدة<input id="flashcard-subject" maxlength="80" value="${esc(c.subject)}" placeholder="مثال: الفيزياء"></label><button type="button" class="rodo-tool-button is-buy" onclick="nextFlashcardStep()">التالي <i data-lucide="arrow-left"></i></button></div>`;
        }
        if (c.step === 2) {
            return `<div class="rodo-flashcard-form rodo-flashcard-composer"><div class="rodo-composer-progress"><span>1</span><span class="is-current">2</span><span>3</span></div><span class="rodo-tool-kicker">الخطوة 2 من 3 · ${esc(c.subject)}</span><h4>اكتب السؤال</h4><p class="rodo-composer-help">خليه سؤالًا تقدر تجاوب عليه من غير ما تشوف الحل.</p><label>السؤال<textarea id="flashcard-question" maxlength="500" rows="5" placeholder="مثال: ما سبب زيادة ... ؟">${esc(c.question)}</textarea></label><div class="rodo-composer-actions"><button type="button" class="rodo-tool-link" onclick="previousFlashcardStep()">رجوع</button><button type="button" class="rodo-tool-button is-buy" onclick="nextFlashcardStep()">التالي <i data-lucide="arrow-left"></i></button></div></div>`;
        }
        return `<div class="rodo-flashcard-form rodo-flashcard-composer"><div class="rodo-composer-progress"><span>1</span><span>2</span><span class="is-current">3</span></div><span class="rodo-tool-kicker">الخطوة 3 من 3 · ${esc(c.subject)}</span><h4>اكتب الإجابة</h4><p class="rodo-composer-help">اكتب الإجابة اللي هتظهر بعد ما تختبر نفسك.</p><div class="rodo-card-preview"><span>سؤال</span><strong>${esc(c.question || '—')}</strong><span>إجابة</span><strong>${esc(c.answer || 'اكتب الإجابة هنا')}</strong></div><label>الإجابة<textarea id="flashcard-answer" maxlength="1200" rows="6" placeholder="اكتب الإجابة أو النقاط الأساسية">${esc(c.answer)}</textarea></label><div class="rodo-composer-actions"><button type="button" class="rodo-tool-link" onclick="previousFlashcardStep()">رجوع</button><button type="button" class="rodo-tool-button is-buy" onclick="addStudyFlashcard()"><i data-lucide="plus"></i> أنشئ البطاقة</button></div></div>`;
    }

    function nextFlashcardStep() {
        const tools = studyTools();
        if (tools.composer.step === 1) {
            const value = document.getElementById('flashcard-subject')?.value.trim() || '';
            if (!value) { showToast('اكتب اسم المادة الأول.', 'info'); return; }
            tools.composer.subject = value.slice(0, 80); tools.composer.step = 2;
        } else if (tools.composer.step === 2) {
            const value = document.getElementById('flashcard-question')?.value.trim() || '';
            if (!value) { showToast('اكتب السؤال الأول.', 'info'); return; }
            tools.composer.question = value.slice(0, 500); tools.composer.step = 3;
        }
        saveState(); renderFlashcardsWorkspace();
    }

    function previousFlashcardStep() {
        const tools = studyTools();
        if (tools.composer.step === 3) tools.composer.answer = document.getElementById('flashcard-answer')?.value.trim() || tools.composer.answer;
        if (tools.composer.step === 2) tools.composer.question = document.getElementById('flashcard-question')?.value.trim() || tools.composer.question;
        tools.composer.step = Math.max(1, tools.composer.step - 1);
        saveState(); renderFlashcardsWorkspace();
    }

    function chooseFlashcardSubject(subject) {
        const tools = studyTools(); tools.composer.subject = String(subject).slice(0, 80); tools.composer.step = 2;
        saveState(); renderFlashcardsWorkspace();
    }

    function addStudyFlashcard() {
        const tools = studyTools();
        if (!isActive('study_flashcards')) { showToast('فعّل دفتر الاسترجاع أولًا.', 'info'); return; }
        const answer = document.getElementById('flashcard-answer')?.value.trim() || '';
        if (!tools.composer.subject || !tools.composer.question || !answer) { showToast('كمّل الإجابة قبل إنشاء البطاقة.', 'info'); return; }
        tools.flashcards.push({ id: createEntityId(), subject: tools.composer.subject, question: tools.composer.question, answer, createdAt: Date.now(), lastReviewedAt: null, nextReviewAt: 0, reviewCount: 0, lastRewardDate: null, lastRating: null, rememberedCount: 0 });
        const createdSubject = tools.composer.subject;
        tools.flashcardFilter = createdSubject;
        tools.composer = clone(DEFAULT_STUDY_TOOLS.composer);
        currentReviewCardId = null; isReviewAnswerVisible = false;
        saveState();
        renderFlashcardsWorkspace();
        showToast('اتعملت البطاقة واتحفظت داخل مادة «' + esc(createdSubject) + '».', 'success');
    }

    function setFlashcardFilter(subject) {
        studyTools().flashcardFilter = String(subject || 'all');
        currentReviewCardId = null; isReviewAnswerVisible = false;
        saveState(); renderFlashcardsWorkspace();
    }

    function deleteStudyFlashcard(id) {
        const tools = studyTools();
        const card = tools.flashcards.find(item => item.id === Number(id));
        if (!card || !confirm(`حذف بطاقة «${card.question.slice(0, 50)}»؟`)) return;
        tools.flashcards = tools.flashcards.filter(item => item.id !== Number(id));
        if (currentReviewCardId === Number(id)) currentReviewCardId = null;
        saveState(); renderFlashcardsWorkspace();
    }

    function renderFlashcardReviewCard() {
        const host = document.getElementById('ui-flashcard-review-card');
        if (!host) return;
        const tools = studyTools();
        const card = tools.flashcards.find(item => item.id === currentReviewCardId);
        if (!card) {
            host.innerHTML = `<div class="rodo-review-placeholder"><i data-lucide="brain"></i><span>اسأل نفسك أولًا، وبعدها اكشف الإجابة.</span></div>`;
            lucide.createIcons({ root: host }); return;
        }
        host.innerHTML = `<div class="rodo-review-card"><span>${esc(card.subject)}</span><strong>${esc(isReviewAnswerVisible ? card.answer : card.question)}</strong><small>${isReviewAnswerVisible ? 'هل افتكرتها؟' : 'جاوب قبل ما تكشف'}</small></div>${isReviewAnswerVisible ? `<div class="rodo-review-actions"><button type="button" onclick="rateStudyFlashcard('hard')">لسه صعبة</button><button type="button" onclick="rateStudyFlashcard('remembered')">افتكرتها</button></div>` : `<button type="button" class="rodo-reveal-answer" onclick="revealStudyFlashcardAnswer()">اكشف الإجابة</button>`}`;
        lucide.createIcons({ root: host });
    }

    function revealStudyFlashcardAnswer() {
        if (!studyTools().flashcards.some(card => card.id === currentReviewCardId)) return;
        isReviewAnswerVisible = true; renderFlashcardReviewCard();
    }

    function rateStudyFlashcard(rating) {
        const tools = studyTools();
        const card = tools.flashcards.find(item => item.id === currentReviewCardId);
        if (!card || !isReviewAnswerVisible) return;

        const now = Date.now();
        const today = typeof getLocalDateStr === 'function' ? getLocalDateStr(new Date(now)) : new Date(now).toISOString().slice(0, 10);
        let reward = { granted: false, xp: 0, coins: 0, rewardId: null };
        if (card.lastRewardDate !== today) {
            reward = grantStudyReward('flashcard-review', `${card.id}:${today}`, STUDY_REWARD_VALUES.flashcardReview.xp, STUDY_REWARD_VALUES.flashcardReview.coins, { subject: card.subject, cardId: card.id, rating });
            if (reward.granted) card.lastRewardDate = today;
        }

        card.lastReviewedAt = now;
        card.reviewCount += 1;
        card.lastRating = rating === 'remembered' ? 'remembered' : 'hard';
        if (rating === 'remembered') {
            card.rememberedCount = Math.max(0, Number(card.rememberedCount) || 0) + 1;
            card.nextReviewAt = now + 3 * 24 * 60 * 60 * 1000;
        } else {
            // "لسه صعبة" never removes the card from the due queue.
            // Keep it immediately due until the student explicitly remembers it.
            card.nextReviewAt = now;
        }

        if (rating === 'remembered') {
            const pool = getFlashcardReviewPool(tools).filter(item => item.id !== card.id);
            currentReviewCardId = pool[0]?.id || null;
        } else {
            // Keep the hard card as the active card instead of dropping it from the session.
            currentReviewCardId = card.id;
        }
        isReviewAnswerVisible = false;
        saveState(); renderFlashcardsWorkspace();
        const reviewText = rating === 'remembered' ? 'تمام — البطاقة اتسجلت في «اللي افتكرتهم» وهترجع للمراجعة بعد 3 أيام.' : 'خليها معاك — البطاقة لسه صعبة وموجودة في المراجعة لحد ما تختار «افتكرتها».';
        showToast(reward.granted ? `${reviewText} +${reward.xp} XP و+${reward.coins} عملة.` : reviewText, 'success', reward.granted);
    }

    function renderFocusPreset() {
        const panel = document.getElementById('ui-focus-preset');
        if (!panel) return;
        const tools = studyTools();
        const active = tools.active.includes(FOCUS_TOOL_ID);
        panel.classList.toggle('hidden', !active);
        if (!active) { clearFocusBreakInterval(); return; }
        const mode = tools.focusMode;
        if (mode.phase === 'rest' && (!mode.breakUntil || mode.breakUntil <= Date.now())) {
            mode.phase = 'focus'; mode.breakUntil = null; mode.cycleStartElapsedMs = Math.max(0, Number(state.activeSession?.elapsedMs) || 0); saveState();
            clearFocusBreakInterval(); showToast('انتهت استراحتك. استأنف المؤقت عندما تكون جاهزًا.', 'success');
        }
        const status = document.getElementById('ui-focus-preset-status');
        const action = document.getElementById('ui-focus-preset-action');
        const progress = document.getElementById('ui-focus-preset-progress');
        if (mode.phase === 'rest') {
            const seconds = Math.max(0, Math.ceil((mode.breakUntil - Date.now()) / 1000));
            const remaining = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
            if (status) status.textContent = `استراحتك الحقيقية · ${remaining}`;
            if (action) { action.textContent = 'تخطّي الاستراحة'; action.classList.add('is-rest'); action.classList.remove('hidden'); }
            if (progress) progress.style.width = `${Math.max(0, Math.min(100, (seconds / (FOCUS_BREAK_MINUTES * 60)) * 100))}%`;
            startFocusBreakInterval();
        } else {
            const running = !!state.activeSession?.isRunning;
            const elapsed = Math.max(0, Number(state.activeSession?.elapsedMs) || 0) + (running && state.activeSession.startTime ? Date.now() - state.activeSession.startTime : 0);
            const sinceCycle = Math.max(0, elapsed - mode.cycleStartElapsedMs);
            const seconds = Math.max(0, (FOCUS_CYCLE_MINUTES * 60) - Math.floor(sinceCycle / 1000));
            const remaining = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
            if (status) status.textContent = running ? `التركيز الحقيقي · ${remaining} حتى الاستراحة` : (elapsed ? `متوقف · ${remaining} متبقية من هدف التركيز` : `جاهز · ${FOCUS_CYCLE_MINUTES} دقيقة تركيز حقيقي`);
            if (action) { action.textContent = 'تخطّي الاستراحة'; action.classList.remove('is-rest'); action.classList.add('hidden'); }
            if (progress) progress.style.width = `${Math.max(0, Math.min(100, sinceCycle / FOCUS_CYCLE_MS * 100))}%`;
            clearFocusBreakInterval();
        }
    }

    function checkFocusPresetThreshold(totalMs) {
        const tools = studyTools();
        if (!tools.active.includes(FOCUS_TOOL_ID) || tools.focusMode.phase !== 'focus' || !state.activeSession?.isRunning) return false;
        if (totalMs - tools.focusMode.cycleStartElapsedMs < FOCUS_CYCLE_MS) return false;
        state.activeSession.elapsedMs = totalMs;
        state.activeSession.isRunning = false;
        state.activeSession.startTime = null;
        clearStopwatchInterval();
        tools.focusMode.phase = 'rest';
        tools.focusMode.breakUntil = Date.now() + FOCUS_BREAK_MS;
        tools.focusMode.cycleStartElapsedMs = totalMs;
        saveState(); updateStopwatchUI(true); renderFocusPreset();
        showToast(`اكتملت ${FOCUS_CYCLE_MINUTES} دقيقة فعلية؛ أوقف RODO المؤقت وبدأت راحة ${FOCUS_BREAK_MINUTES} دقائق غير محتسبة.`, 'success', true);
        return true;
    }

    function startFocusBreakInterval() {
        if (focusBreakInterval) return;
        focusBreakInterval = setInterval(() => {
            const mode = studyTools().focusMode;
            if (mode.phase !== 'rest') { clearFocusBreakInterval(); return; }
            renderFocusPreset();
        }, 1000);
    }

    function clearFocusBreakInterval() {
        if (focusBreakInterval) clearInterval(focusBreakInterval);
        focusBreakInterval = null;
    }

    function skipFocusBreak() {
        const mode = studyTools().focusMode;
        if (mode.phase !== 'rest') return;
        mode.phase = 'focus'; mode.breakUntil = null; mode.cycleStartElapsedMs = Math.max(0, Number(state.activeSession?.elapsedMs) || 0);
        clearFocusBreakInterval(); saveState(); renderFocusPreset();
        showToast('تخطّيت الاستراحة. الوقت لن يبدأ حتى تضغط تشغيل المؤقت.', 'info');
    }

    function renderInventoryListWithStudyFeatures() {
        baseRenderInventoryList();
        const container = document.getElementById('ui-inventory-container');
        const empty = document.getElementById('ui-inventory-empty');
        if (!container) return;
        const owned = studyTools().owned.map(productFor).filter(Boolean);
        if (!owned.length) return;
        if (empty) empty.classList.add('hidden');
        const cards = `<section class="rodo-inventory-group rodo-study-inventory"><h4>أدوات الدراسة الدائمة <span>${owned.length}</span></h4><div>${owned.map(item => `<article class="rodo-store-product rodo-study-inventory-card"><div class="rodo-store-product-head"><span class="rodo-store-mini-icon"><i data-lucide="${esc(item.icon)}"></i></span><span class="rodo-store-pill">${isActive(item.id) ? 'مفعّلة' : 'مملوكة'}</span></div><h4>${esc(item.title)}</h4><p>${esc(item.desc)}</p><button type="button" class="rodo-store-button ${isActive(item.id) ? 'is-muted' : 'is-outline'}" onclick="setStoreCategory('tools')">إدارة الأداة</button></article>`).join('')}</div></section>`;
        container.insertAdjacentHTML('afterbegin', cards);
        lucide.createIcons({ root: container });
    }

    const baseRenderInventoryList = renderInventoryList;
    const baseRenderStoreGrid = renderStoreGrid;
    const baseRenderScheduleItems = renderScheduleItems;
    const baseToggleStopwatch = toggleStopwatch;
    const baseUpdateStopwatchUI = updateStopwatchUI;

    globalThis.renderStoreFront = renderStoreFront;
    renderStoreGrid = function () {
        baseRenderStoreGrid();
        if (currentStoreCategory === 'tools') renderStudyToolsLibrary();
    };
    globalThis.renderInventoryList = renderInventoryListWithStudyFeatures;
    renderScheduleItems = function () { baseRenderScheduleItems(); };

    toggleStopwatch = function () {
        const mode = studyTools().focusMode;
        if (isActive(FOCUS_TOOL_ID) && mode.phase === 'rest' && mode.breakUntil > Date.now()) {
            showToast(`استراحتك لم تنتهِ بعد. تخطّها من بطاقة ${FOCUS_CYCLE_MINUTES}/${FOCUS_BREAK_MINUTES} لو محتاج.`, 'info'); return;
        }
        const wasRunning = !!state.activeSession?.isRunning;
        if (isActive(FOCUS_TOOL_ID) && !wasRunning && mode.phase !== 'rest') {
            const elapsed = Math.max(0, Number(state.activeSession?.elapsedMs) || 0);
            if (elapsed < mode.cycleStartElapsedMs) mode.cycleStartElapsedMs = elapsed;
        }
        baseToggleStopwatch();
        renderFocusPreset();
    };

    resetStopwatch = function () {
        if (!confirm('هل أنت متأكد من إلغاء هذه الجلسة؟ لن يتم حفظ الوقت.')) return;
        state.activeSession = { isRunning: false, startTime: null, elapsedMs: 0, pendingSave: false };
        clearStopwatchInterval();
        const mode = studyTools().focusMode;
        mode.phase = 'focus'; mode.breakUntil = null; mode.cycleStartElapsedMs = 0;
        clearFocusBreakInterval(); saveState(); updateStopwatchUI(true); renderFocusPreset();
    };

    updateStopwatchUI = function (renderIcons) {
        if (state.activeSession?.isRunning) {
            let totalMs = Number(state.activeSession.elapsedMs) || 0;
            if (state.activeSession.startTime) totalMs += Date.now() - state.activeSession.startTime;
            if (checkFocusPresetThreshold(totalMs)) return;
        }
        baseUpdateStopwatchUI(renderIcons);
        renderFocusPreset();
    };

    window.buyStudyStoreProduct = buyStudyStoreProduct;
    window.toggleStudyFeature = toggleStudyFeature;
    window.addBacklogItem = addBacklogItem;
    window.toggleBacklogItem = toggleBacklogItem;
    window.deleteBacklogItem = deleteBacklogItem;
    window.startMasteryRoute = startMasteryRoute;
    window.toggleMasteryStep = toggleMasteryStep;
    window.resetMasteryRoute = resetMasteryRoute;
    window.nextFlashcardStep = nextFlashcardStep;
    window.previousFlashcardStep = previousFlashcardStep;
    window.chooseFlashcardSubject = chooseFlashcardSubject;
    window.addStudyFlashcard = addStudyFlashcard;
    window.setFlashcardFilter = setFlashcardFilter;
    window.deleteStudyFlashcard = deleteStudyFlashcard;
    window.startStudyFlashcardReview = startStudyFlashcardReview;
    window.setFlashcardReviewMode = setFlashcardReviewMode;
    window.revealStudyFlashcardAnswer = revealStudyFlashcardAnswer;
    window.rateStudyFlashcard = rateStudyFlashcard;
    window.skipFocusBreak = skipFocusBreak;
})();
