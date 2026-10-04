/* ==========================================================================\n   RODO JOURNAL — Independent, local-first journal feature\n   V2: drafts, timeline archive, pinning, and smarter search\n   ========================================================================== */
(() => {
    'use strict';

    const JOURNAL_MAX_TITLE = 120;
    const JOURNAL_MAX_CONTENT = 12000;
    const JOURNAL_DRAFT_KEY = 'hsQuestPremium_journal_draft_v2';
    const JOURNAL_DRAFT_DEBOUNCE_MS = 700;

    const refs = {};
    let activeEntryId = null;
    let editingEntryId = null;
    let draftSaveTimer = null;

    const normalizeArabic = (value = '') => String(value)
        .toLocaleLowerCase('ar-EG')
        .replace(/[أإآ]/g, 'ا')
        .replace(/[ى]/g, 'ي')
        .replace(/[ؤ]/g, 'و')
        .replace(/[ئ]/g, 'ي')
        .replace(/[ة]/g, 'ه')
        .replace(/[ًٌٍَُِّْـ]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const tokenize = (value = '') => normalizeArabic(value)
        .split(/\s+/)
        .map(token => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
        .filter(token => token.length >= 2);

    const getJournals = () => {
        if (typeof state === 'undefined') return [];
        if (!Array.isArray(state.journals)) state.journals = [];
        return state.journals;
    };

    const getTodayKey = () => {
        if (typeof getLocalDateStr === 'function') return getLocalDateStr();
        return new Date().toISOString().slice(0, 10);
    };

    const parseDateKey = (key) => {
        const [year, month, day] = String(key || '').split('-').map(Number);
        if (!year || !month || !day) return null;
        const date = new Date(year, month - 1, day);
        return Number.isNaN(date.getTime()) ? null : date;
    };

    const dateKeyFromDate = (date) => {
        if (typeof getLocalDateStr === 'function') return getLocalDateStr(date);
        const offset = date.getTimezoneOffset() * 60000;
        return new Date(date.getTime() - offset).toISOString().split('T')[0];
    };

    const addDays = (date, amount) => {
        const next = new Date(date);
        next.setDate(next.getDate() + amount);
        return next;
    };

    const formatDate = (dateKey, options = { day: 'numeric', month: 'long', year: 'numeric' }) => {
        const date = parseDateKey(dateKey);
        return date ? date.toLocaleDateString('ar-EG', options) : String(dateKey || '');
    };

    const formatDayLabel = (dateKey) => {
        if (dateKey === getTodayKey()) return 'اليوم';
        const yesterday = parseDateKey(getTodayKey());
        if (yesterday && dateKey === dateKeyFromDate(addDays(yesterday, -1))) return 'أمس';
        return formatDate(dateKey, { weekday: 'long', day: 'numeric', month: 'long' });
    };

    const formatMonthLabel = (dateKey) => formatDate(dateKey, { month: 'long', year: 'numeric' });

    const countWords = (content) => tokenize(content).length;

    const makePreview = (content, length = 150) => {
        const clean = String(content || '').replace(/\s+/g, ' ').trim();
        return clean.length > length ? `${clean.slice(0, length).trim()}…` : clean;
    };

    const getDefaultTitle = (dateKey) => {
        const date = parseDateKey(dateKey);
        return date ? `يوم ${date.toLocaleDateString('ar-EG', { weekday: 'long' })}` : 'يوم اليوم';
    };

    const escape = (value) => {
        if (typeof escapeHTML === 'function') return escapeHTML(value);
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    const setHidden = (element, hidden) => {
        if (!element) return;
        element.classList.toggle('hidden', hidden);
    };

    const setPanelVisible = (element, visible) => {
        if (!element) return;
        element.classList.toggle('hidden', !visible);
        element.setAttribute('aria-hidden', visible ? 'false' : 'true');
        document.body.classList.toggle('rodo-journal-modal-open', visible);
    };

    const getActiveFilters = () => ({
        query: normalizeArabic(refs.search?.value || ''),
        rawQuery: String(refs.search?.value || '').trim(),
        dateFilter: refs.dateFilter?.value || 'all',
        from: refs.dateFrom?.value || '',
        to: refs.dateTo?.value || ''
    });

    const matchesDateFilter = (entry, filter) => {
        const today = parseDateKey(getTodayKey());
        const entryDate = parseDateKey(entry.dateKey);
        if (!today || !entryDate) return false;

        switch (filter.dateFilter) {
            case 'today':
                return entry.dateKey === getTodayKey();
            case 'yesterday':
                return entry.dateKey === dateKeyFromDate(addDays(today, -1));
            case '7days': {
                const oldest = addDays(today, -6);
                return entryDate >= oldest && entryDate <= today;
            }
            case 'month':
                return entryDate.getFullYear() === today.getFullYear() && entryDate.getMonth() === today.getMonth();
            case 'custom':
                if (filter.from && entry.dateKey < filter.from) return false;
                if (filter.to && entry.dateKey > filter.to) return false;
                return true;
            default:
                return true;
        }
    };

    const getSearchScore = (entry, filter) => {
        if (!filter.query) return 0;

        const title = normalizeArabic(entry.title || '');
        const content = normalizeArabic(entry.content || '');
        const query = filter.query;
        const tokens = tokenize(query);
        let score = 0;

        if (title === query) score += 150;
        else if (title.includes(query)) score += 95;
        if (content.includes(query)) score += 55;

        tokens.forEach(token => {
            if (title.includes(token)) score += 25;
            if (content.includes(token)) score += 9;
            if (title.startsWith(token)) score += 8;
        });

        const titleTokenCount = tokens.filter(token => title.includes(token)).length;
        const contentTokenCount = tokens.filter(token => content.includes(token)).length;
        if (tokens.length && titleTokenCount === tokens.length) score += 30;
        if (tokens.length && contentTokenCount === tokens.length) score += 12;

        return score;
    };

    const highlightLiteral = (value, rawQuery) => {
        const source = String(value || '');
        const query = String(rawQuery || '').trim();
        if (!query) return escape(source);

        const tokens = query.split(/\s+/).filter(Boolean).sort((a, b) => b.length - a.length);
        if (!tokens.length) return escape(source);

        const pattern = tokens.map(token => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
        try {
            return escape(source).replace(new RegExp(`(${pattern})`, 'giu'), '<mark>$1</mark>');
        } catch {
            return escape(source);
        }
    };

    const makeSmartPreview = (content, filter) => {
        const clean = String(content || '').replace(/\s+/g, ' ').trim();
        if (!clean) return '';
        if (!filter.rawQuery) return escape(makePreview(clean));

        const normalizedContent = normalizeArabic(clean);
        const normalizedQuery = filter.query;
        const matchIndex = normalizedContent.indexOf(normalizedQuery);
        if (matchIndex < 0) return escape(makePreview(clean));

        const approxIndex = Math.min(clean.length, Math.max(0, matchIndex));
        const start = Math.max(0, approxIndex - 48);
        const end = Math.min(clean.length, start + 145);
        let snippet = clean.slice(start, end).trim();
        if (start > 0) snippet = `…${snippet}`;
        if (end < clean.length) snippet = `${snippet}…`;
        return highlightLiteral(snippet, filter.rawQuery);
    };

    const getFilteredEntries = () => {
        const filter = getActiveFilters();
        return getJournals()
            .filter(entry => matchesDateFilter(entry, filter))
            .map(entry => ({ entry, score: getSearchScore(entry, filter) }))
            .filter(item => !filter.query || item.score > 0)
            .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                if (Boolean(b.entry.isPinned) !== Boolean(a.entry.isPinned)) return b.entry.isPinned ? -1 : 1;
                return (b.entry.updatedAt || b.entry.createdAt || 0) - (a.entry.updatedAt || a.entry.createdAt || 0);
            });
    };

    const hasActiveFilters = () => {
        const filter = getActiveFilters();
        return Boolean(filter.query || filter.dateFilter !== 'all' || filter.from || filter.to);
    };

    const getDraft = () => {
        try {
            const raw = localStorage.getItem(JOURNAL_DRAFT_KEY);
            if (!raw) return null;
            const draft = JSON.parse(raw);
            if (!draft || typeof draft !== 'object') return null;
            const title = String(draft.title || '').slice(0, JOURNAL_MAX_TITLE);
            const content = String(draft.content || '').slice(0, JOURNAL_MAX_CONTENT);
            if (!title && !content) return null;
            return {
                entryId: draft.entryId ? String(draft.entryId) : null,
                title,
                content,
                savedAt: Number(draft.savedAt) || Date.now()
            };
        } catch {
            return null;
        }
    };

    const clearDraft = () => {
        if (draftSaveTimer) window.clearTimeout(draftSaveTimer);
        draftSaveTimer = null;
        try { localStorage.removeItem(JOURNAL_DRAFT_KEY); } catch { /* best-effort only */ }
        updateDraftBanner(null);
    };

    const persistDraft = () => {
        draftSaveTimer = null;
        if (!refs.form || !refs.composer || refs.composer.classList.contains('hidden')) return;

        const title = String(refs.title?.value || '').trim().slice(0, JOURNAL_MAX_TITLE);
        const content = String(refs.content?.value || '').slice(0, JOURNAL_MAX_CONTENT);
        if (!title && !content) {
            try { localStorage.removeItem(JOURNAL_DRAFT_KEY); } catch { /* best-effort only */ }
            updateDraftBanner(null);
            return;
        }

        const draft = {
            version: 2,
            entryId: editingEntryId ? String(editingEntryId) : null,
            title,
            content,
            savedAt: Date.now()
        };
        try {
            localStorage.setItem(JOURNAL_DRAFT_KEY, JSON.stringify(draft));
            updateDraftBanner(draft);
        } catch {
            // Drafts are an extra safety net. Journal saving remains independent.
        }
    };

    const scheduleDraftSave = () => {
        if (draftSaveTimer) window.clearTimeout(draftSaveTimer);
        updateDraftBanner({ pending: true, entryId: editingEntryId ? String(editingEntryId) : null });
        draftSaveTimer = window.setTimeout(persistDraft, JOURNAL_DRAFT_DEBOUNCE_MS);
    };

    const formatDraftTime = (savedAt) => {
        if (!savedAt) return '';
        const date = new Date(savedAt);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' });
    };

    const updateDraftBanner = (draft) => {
        if (!refs.draftBanner || !refs.draftMeta || !refs.draftState) return;
        const visible = Boolean(draft && (draft.content || draft.title || draft.pending));
        setHidden(refs.draftBanner, !visible);

        if (!visible) {
            refs.draftState.textContent = '';
            refs.draftMeta.textContent = '';
            return;
        }

        if (draft.pending) {
            refs.draftState.textContent = 'مسودة';
            refs.draftMeta.textContent = 'جارٍ حفظ آخر تعديل…';
            return;
        }

        const matchesCurrentEditor = String(draft.entryId || '') === String(editingEntryId || '');
        if (draft.entryId && !matchesCurrentEditor) {
            refs.draftState.textContent = 'مسودة سابقة';
            refs.draftMeta.textContent = `آخر تعديل ${formatDraftTime(draft.savedAt)}`;
            return;
        }

        refs.draftState.textContent = 'مسودة محفوظة';
        refs.draftMeta.textContent = `آخر تعديل ${formatDraftTime(draft.savedAt)}`;
    };

    const renderCard = (entry, filter) => {
        const titleText = entry.title || getDefaultTitle(entry.dateKey);
        const title = filter.rawQuery ? highlightLiteral(titleText, filter.rawQuery) : escape(titleText);
        const date = formatDate(entry.dateKey, { day: 'numeric', month: 'long', year: 'numeric' });
        const preview = makeSmartPreview(entry.content, filter);
        const pinned = Boolean(entry.isPinned);
        return `
            <article class="rodo-journal-card ${pinned ? 'is-pinned' : ''}" data-journal-id="${escape(entry.id)}">
                <button type="button" class="rodo-journal-card-button" data-journal-open="${escape(entry.id)}" aria-label="فتح يومية ${escape(titleText)}">
                    <div class="rodo-journal-card-top">
                        <div class="rodo-journal-card-copy">
                            <h3>${title}</h3>
                            <time datetime="${escape(entry.dateKey)}">${escape(date)}</time>
                        </div>
                        <span class="rodo-journal-card-mark" aria-hidden="true"><i data-lucide="notebook-pen"></i></span>
                    </div>
                    <p>${preview}</p>
                    <span class="rodo-journal-card-link">فتح اليوم <i data-lucide="arrow-left"></i></span>
                </button>
                <button type="button" class="rodo-journal-pin" data-journal-pin="${escape(entry.id)}" aria-pressed="${pinned ? 'true' : 'false'}" aria-label="${pinned ? 'إلغاء تثبيت اليومية' : 'تثبيت اليومية'}">
                    <i data-lucide="pin"></i>
                    <span class="sr-only">${pinned ? 'مثبتة' : 'تثبيت'}</span>
                </button>
            </article>
        `;
    };

    const groupEntriesByTimeline = (items) => {
        const monthMap = new Map();
        items.forEach(({ entry, score }) => {
            const monthKey = String(entry.dateKey || '').slice(0, 7);
            if (!monthMap.has(monthKey)) monthMap.set(monthKey, { monthKey, entries: [] });
            monthMap.get(monthKey).entries.push({ entry, score });
        });
        return [...monthMap.values()]
            .sort((a, b) => b.monthKey.localeCompare(a.monthKey))
            .map(month => {
                const dayMap = new Map();
                month.entries.forEach(item => {
                    if (!dayMap.has(item.entry.dateKey)) dayMap.set(item.entry.dateKey, []);
                    dayMap.get(item.entry.dateKey).push(item);
                });
                return {
                    ...month,
                    days: [...dayMap.entries()]
                        .sort((a, b) => b[0].localeCompare(a[0]))
                        .map(([dateKey, entries]) => ({ dateKey, entries }))
                };
            });
    };

    const renderTimeline = (items, filter) => {
        const groups = groupEntriesByTimeline(items);
        return groups.map(group => `
            <section class="rodo-journal-month" aria-label="${escape(formatMonthLabel(group.monthKey + '-01'))}">
                <div class="rodo-journal-month-label">${escape(formatMonthLabel(group.monthKey + '-01'))}</div>
                <div class="rodo-journal-timeline">
                    ${group.days.map(day => `
                        <div class="rodo-journal-day">
                            <div class="rodo-journal-day-rail">
                                <span class="rodo-journal-day-dot" aria-hidden="true"></span>
                                <div class="rodo-journal-day-label">
                                    <strong>${escape(formatDayLabel(day.dateKey))}</strong>
                                    <time datetime="${escape(day.dateKey)}">${escape(formatDate(day.dateKey, { day: 'numeric', month: 'short' }))}</time>
                                </div>
                            </div>
                            <div class="rodo-journal-day-entries">
                                ${day.entries.map(({ entry }) => renderCard(entry, filter)).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </section>
        `).join('');
    };

    const render = () => {
        if (!refs.list) return;

        const filter = getActiveFilters();
        const matches = getFilteredEntries();
        const total = getJournals().length;
        const pinnedMatches = matches.filter(item => Boolean(item.entry.isPinned));
        const timelineMatches = matches.filter(item => !item.entry.isPinned);
        const pinnedMarkup = pinnedMatches.length ? `
            <section class="rodo-journal-pinned" aria-label="اليوميات المثبتة">
                <div class="rodo-journal-section-label"><i data-lucide="pin" aria-hidden="true"></i><span>مثبتة</span></div>
                <div class="rodo-journal-pinned-list">${pinnedMatches.map(({ entry }) => renderCard(entry, filter)).join('')}</div>
            </section>
        ` : '';
        refs.list.innerHTML = pinnedMarkup + renderTimeline(timelineMatches, filter);
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ root: refs.list });

        if (refs.resultsCount) {
            if (filter.query && matches.length) {
                refs.resultsCount.textContent = matches.length === 1 ? 'نتيجة واحدة' : `${matches.length} نتائج`;
            } else {
                refs.resultsCount.textContent = matches.length === 1 ? 'يومية واحدة' : `${matches.length} يوميات`;
            }
        }
        setHidden(refs.clearFilters, !hasActiveFilters());

        const noEntries = total === 0;
        const noResults = !noEntries && matches.length === 0;
        setHidden(refs.empty, !noEntries);
        setHidden(refs.noResults, !noResults);
    };

    const findEntry = (id) => getJournals().find(entry => String(entry.id) === String(id));

    const populateForm = (entry = null, draft = null) => {
        refs.title.value = draft?.title ?? entry?.title ?? '';
        refs.content.value = draft?.content ?? entry?.content ?? '';
        refs.composerTitle.textContent = entry ? 'تعديل اليومية' : 'اكتب اليوم';
        refs.composerDate.textContent = formatDate(entry?.dateKey || getTodayKey());
        updateWordCount();
        updateDraftBanner(draft);
    };

    const openComposer = (entry = null) => {
        editingEntryId = entry ? entry.id : null;
        const draft = getDraft();
        const usableDraft = draft && String(draft.entryId || '') === String(editingEntryId || '') ? draft : (entry ? null : draft);
        populateForm(entry, usableDraft);
        setPanelVisible(refs.composer, true);
        requestAnimationFrame(() => refs.title?.focus());
    };

    const closeComposer = ({ preserveDraft = true } = {}) => {
        if (draftSaveTimer) window.clearTimeout(draftSaveTimer);
        if (preserveDraft) persistDraft();
        setPanelVisible(refs.composer, false);
        editingEntryId = null;
        refs.composerTitle.textContent = 'اكتب اليوم';
        refs.composerDate.textContent = '';
        updateWordCount();
        const draft = getDraft();
        updateDraftBanner(draft);
    };

    const openReader = (entry) => {
        activeEntryId = entry.id;
        refs.readerDate.textContent = formatDate(entry.dateKey);
        refs.readerTitle.textContent = entry.title || getDefaultTitle(entry.dateKey);
        refs.readerMeta.textContent = `${countWords(entry.content)} كلمة`;
        refs.readerContent.textContent = entry.content;
        refs.readerPinButton?.setAttribute('aria-pressed', entry.isPinned ? 'true' : 'false');
        refs.readerPinButton?.classList.toggle('is-active', Boolean(entry.isPinned));
        if (refs.readerPinLabel) refs.readerPinLabel.textContent = entry.isPinned ? 'مثبتة' : 'تثبيت';
        setPanelVisible(refs.reader, true);
        requestAnimationFrame(() => refs.closeReader?.focus());
    };

    const closeReader = () => {
        setPanelVisible(refs.reader, false);
        activeEntryId = null;
    };

    const createJournalId = () => {
        if (typeof createEntityId === 'function') return createEntityId();
        return Date.now();
    };

    const persist = (verification = null) => {
        if (typeof saveState !== 'function') return false;
        try {
            saveState();
            if (!verification) return true;
            const raw = localStorage.getItem('hsQuestPremium_v4');
            if (!raw) return false;
            const saved = JSON.parse(raw);
            const savedJournals = Array.isArray(saved?.journals) ? saved.journals : [];
            if (verification.type === 'present') {
                const entry = savedJournals.find(item => String(item.id) === String(verification.id));
                return Boolean(entry)
                    && String(entry.title || '') === String(verification.title || '')
                    && String(entry.content || '') === String(verification.content || '')
                    && String(entry.dateKey || '') === String(verification.dateKey || '')
                    && Boolean(entry.isPinned) === Boolean(verification.isPinned);
            }
            if (verification.type === 'deleted') {
                return !savedJournals.some(item => String(item.id) === String(verification.id));
            }
            return true;
        } catch {
            return false;
        }
    };

    const handlePersistenceFailure = () => {
        toast('اتحفظت التغييرات داخل التطبيق، لكن التخزين الدائم لم يؤكدها. المسودة لسه محفوظة.', 'info');
    };

    const toast = (message, type = 'info') => {
        if (typeof showToast === 'function') showToast(message, type);
    };

    const saveEntry = (event) => {
        event.preventDefault();

        const content = String(refs.content?.value || '').trim().slice(0, JOURNAL_MAX_CONTENT);
        const title = String(refs.title?.value || '').trim().slice(0, JOURNAL_MAX_TITLE);
        if (!content) {
            refs.content?.focus();
            toast('اكتب حاجة الأول، حتى لو سطر واحد.', 'info');
            scheduleDraftSave();
            return;
        }

        const journals = getJournals();
        const now = Date.now();

        if (editingEntryId) {
            const entry = findEntry(editingEntryId);
            if (!entry) {
                closeComposer();
                openComposer();
                return;
            }
            const previous = { title: entry.title, content: entry.content, updatedAt: entry.updatedAt };
            entry.title = title;
            entry.content = content;
            entry.updatedAt = now;
            const persisted = persist({ type: 'present', id: entry.id, title: entry.title, content: entry.content, dateKey: entry.dateKey, isPinned: entry.isPinned });
            if (!persisted) {
                entry.title = previous.title;
                entry.content = previous.content;
                entry.updatedAt = previous.updatedAt;
                persistDraft();
                handlePersistenceFailure();
                render();
                updateDraftBanner(getDraft());
                return;
            }
            clearDraft();
            refs.form?.reset();
            closeComposer({ preserveDraft: false });
            render();
            openReader(entry);
            toast('اتحفظت التعديلات.', 'success');
            return;
        }

        const entry = {
            id: createJournalId(),
            title,
            content,
            dateKey: getTodayKey(),
            createdAt: now,
            updatedAt: now,
            isPinned: false
        };

        journals.push(entry);
        const persisted = persist({ type: 'present', id: entry.id, title: entry.title, content: entry.content, dateKey: entry.dateKey, isPinned: entry.isPinned });
        if (!persisted) {
            const index = journals.findIndex(item => String(item.id) === String(entry.id));
            if (index >= 0) journals.splice(index, 1);
            persistDraft();
            handlePersistenceFailure();
            render();
            updateDraftBanner(getDraft());
            return;
        }
        clearDraft();
        refs.form?.reset();
        closeComposer({ preserveDraft: false });
        render();
        openReader(entry);
        toast('اتحفظت يومياتك.', 'success');
    };

    const deleteActiveEntry = () => {
        const entry = findEntry(activeEntryId);
        if (!entry) return;
        if (!window.confirm('تحذف اليومية دي نهائيًا؟')) return;

        const journals = getJournals();
        const index = journals.findIndex(item => String(item.id) === String(activeEntryId));
        if (index < 0) return;

        journals.splice(index, 1);
        closeReader();
        const persisted = persist({ type: 'deleted', id: activeEntryId });
        if (persisted && String(getDraft()?.entryId || '') === String(activeEntryId)) clearDraft();
        if (!persisted) {
            // Restore the in-memory entry when durable deletion was not confirmed.
            journals.splice(index, 0, entry);
            handlePersistenceFailure();
        }
        render();
        toast('اتحذفت اليومية.', 'info');
    };

    const editActiveEntry = () => {
        const entry = findEntry(activeEntryId);
        if (!entry) return;
        closeReader();
        openComposer(entry);
    };

    const togglePin = (id) => {
        const entry = findEntry(id);
        if (!entry) return;
        const previousPinned = Boolean(entry.isPinned);
        const previousUpdatedAt = entry.updatedAt;
        entry.isPinned = !previousPinned;
        const nextPinned = Boolean(entry.isPinned);
        entry.updatedAt = Date.now();
        const persisted = persist({ type: 'present', id: entry.id, title: entry.title, content: entry.content, dateKey: entry.dateKey, isPinned: nextPinned });
        if (!persisted) {
            entry.isPinned = previousPinned;
            entry.updatedAt = previousUpdatedAt;
            handlePersistenceFailure();
        }
        render();
        if (String(activeEntryId || '') === String(entry.id)) openReader(entry);
        if (persisted) toast(entry.isPinned ? 'اتثبتت اليومية فوق.' : 'اتشالت من المثبتة.', 'info');
    };

    const updateWordCount = () => {
        if (!refs.wordCount) return;
        refs.wordCount.textContent = `${countWords(refs.content?.value || '')} كلمة`;
    };

    const clearFilters = () => {
        refs.search.value = '';
        refs.dateFilter.value = 'all';
        refs.dateFrom.value = '';
        refs.dateTo.value = '';
        refs.customRange.classList.add('hidden');
        render();
    };

    const discardDraft = () => {
        clearDraft();
        const entry = editingEntryId ? findEntry(editingEntryId) : null;
        if (entry) {
            refs.title.value = entry.title || '';
            refs.content.value = entry.content || '';
        } else {
            refs.title.value = '';
            refs.content.value = '';
        }
        updateWordCount();
        toast('اتمسحت المسودة.', 'info');
    };

    const restoreDraft = () => {
        const draft = getDraft();
        if (!draft) return;
        const matchesCurrentEditor = String(draft.entryId || '') === String(editingEntryId || '');
        if (draft.entryId && !matchesCurrentEditor && editingEntryId) return;
        refs.title.value = draft.title;
        refs.content.value = draft.content;
        updateWordCount();
        updateDraftBanner(draft);
        refs.content.focus();
    };

    const setup = () => {
        refs.list = document.getElementById('journal-list');
        refs.empty = document.getElementById('journal-empty');
        refs.noResults = document.getElementById('journal-no-results');
        refs.search = document.getElementById('journal-search');
        refs.dateFilter = document.getElementById('journal-date-filter');
        refs.dateFrom = document.getElementById('journal-date-from');
        refs.dateTo = document.getElementById('journal-date-to');
        refs.customRange = document.getElementById('journal-custom-range');
        refs.resultsCount = document.getElementById('journal-results-count');
        refs.clearFilters = document.getElementById('journal-clear-filters');
        refs.openComposer = document.getElementById('journal-open-composer');
        refs.emptyAction = document.getElementById('journal-empty-action');
        refs.composer = document.getElementById('journal-composer');
        refs.closeComposer = document.getElementById('journal-close-composer');
        refs.composerTitle = document.getElementById('journal-composer-title');
        refs.composerDate = document.getElementById('journal-composer-date');
        refs.form = document.getElementById('journal-form');
        refs.title = document.getElementById('journal-title');
        refs.content = document.getElementById('journal-content');
        refs.wordCount = document.getElementById('journal-word-count');
        refs.draftBanner = document.getElementById('journal-draft-banner');
        refs.draftState = document.getElementById('journal-draft-state');
        refs.draftMeta = document.getElementById('journal-draft-meta');
        refs.restoreDraft = document.getElementById('journal-restore-draft');
        refs.discardDraft = document.getElementById('journal-discard-draft');
        refs.reader = document.getElementById('journal-reader');
        refs.closeReader = document.getElementById('journal-close-reader');
        refs.readerDate = document.getElementById('journal-reader-date');
        refs.readerTitle = document.getElementById('journal-reader-title');
        refs.readerMeta = document.getElementById('journal-reader-meta');
        refs.readerContent = document.getElementById('journal-reader-content');
        refs.readerPinButton = document.getElementById('journal-pin-entry');
        refs.readerPinLabel = document.getElementById('journal-pin-label');
        refs.edit = document.getElementById('journal-edit-entry');
        refs.delete = document.getElementById('journal-delete-entry');
        refs.nav = document.getElementById('nav-journal');

        if (!refs.list || !refs.form || !refs.nav) return false;

        refs.openComposer?.addEventListener('click', () => openComposer());
        refs.emptyAction?.addEventListener('click', () => openComposer());
        refs.closeComposer?.addEventListener('click', closeComposer);
        refs.form.addEventListener('submit', saveEntry);
        refs.title?.addEventListener('input', scheduleDraftSave);
        refs.content?.addEventListener('input', () => { updateWordCount(); scheduleDraftSave(); });
        refs.search?.addEventListener('input', render);
        refs.dateFilter?.addEventListener('change', () => {
            refs.customRange.classList.toggle('hidden', refs.dateFilter.value !== 'custom');
            render();
        });
        refs.dateFrom?.addEventListener('change', render);
        refs.dateTo?.addEventListener('change', render);
        refs.clearFilters?.addEventListener('click', clearFilters);
        refs.restoreDraft?.addEventListener('click', restoreDraft);
        refs.discardDraft?.addEventListener('click', discardDraft);
        refs.closeReader?.addEventListener('click', closeReader);
        refs.edit?.addEventListener('click', editActiveEntry);
        refs.delete?.addEventListener('click', deleteActiveEntry);
        refs.readerPinButton?.addEventListener('click', () => togglePin(activeEntryId));

        refs.nav.addEventListener('click', () => {
            if (typeof switchTab === 'function') switchTab('journal');
        });

        refs.list.addEventListener('click', (event) => {
            const pin = event.target.closest('[data-journal-pin]');
            if (pin) {
                event.preventDefault();
                event.stopPropagation();
                togglePin(pin.dataset.journalPin);
                return;
            }
            const target = event.target.closest('[data-journal-open]');
            if (!target) return;
            const entry = findEntry(target.dataset.journalOpen);
            if (entry) openReader(entry);
        });

        document.querySelectorAll('[data-journal-close]').forEach(backdrop => {
            backdrop.addEventListener('click', () => {
                closeComposer();
                closeReader();
            });
        });

        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;
            if (refs.composer && !refs.composer.classList.contains('hidden')) closeComposer();
            if (refs.reader && !refs.reader.classList.contains('hidden')) closeReader();
        });

        window.addEventListener('beforeunload', () => {
            if (refs.composer && !refs.composer.classList.contains('hidden')) persistDraft();
        });

        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        render();
        return true;
    };

    window.RODOJournal = { setup, render, openComposer, openReader, togglePin };
    window.addEventListener('load', setup, { once: true });
})();
