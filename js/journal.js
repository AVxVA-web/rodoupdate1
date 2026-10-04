/* ==========================================================================\n   RODO JOURNAL — Independent, local-first journal feature\n   ========================================================================== */
(() => {
    'use strict';

    const JOURNAL_MAX_TITLE = 120;
    const JOURNAL_MAX_CONTENT = 12000;

    const refs = {};
    let activeEntryId = null;
    let editingEntryId = null;

    const normalizeArabic = (value = '') => String(value)
        .toLocaleLowerCase('ar-EG')
        .replace(/[أإآ]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ؤ/g, 'و')
        .replace(/ئ/g, 'ي')
        .replace(/ة/g, 'ه')
        .replace(/[ًٌٍَُِّْـ]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

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

    const countWords = (content) => normalizeArabic(content).split(/\s+/).filter(Boolean).length;

    const makePreview = (content, length = 120) => {
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

    const getFilteredEntries = () => {
        const filter = getActiveFilters();
        return getJournals()
            .filter(entry => {
                if (!matchesDateFilter(entry, filter)) return false;
                if (!filter.query) return true;
                const haystack = normalizeArabic(`${entry.title || ''} ${entry.content || ''}`);
                return haystack.includes(filter.query);
            })
            .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
    };

    const hasActiveFilters = () => {
        const filter = getActiveFilters();
        return Boolean(filter.query || filter.dateFilter !== 'all' || filter.from || filter.to);
    };

    const renderCard = (entry, index) => {
        const title = escape(entry.title || getDefaultTitle(entry.dateKey));
        const date = formatDate(entry.dateKey);
        const preview = escape(makePreview(entry.content));
        return `
            <article class="rodo-journal-card ${index === 0 ? 'is-featured' : ''}" data-journal-id="${escape(entry.id)}">
                <button type="button" class="rodo-journal-card-button" data-journal-open="${escape(entry.id)}" aria-label="فتح يومية ${title}">
                    <div class="rodo-journal-card-top">
                        <div class="rodo-journal-card-copy">
                            <h3>${title}</h3>
                            <time datetime="${escape(entry.dateKey)}">${date}</time>
                        </div>
                        <span class="rodo-journal-card-mark" aria-hidden="true"><i data-lucide="notebook-pen"></i></span>
                    </div>
                    <p>${preview}</p>
                    <span class="rodo-journal-card-link">فتح اليوم <i data-lucide="arrow-left"></i></span>
                </button>
            </article>
        `;
    };

    const render = () => {
        if (!refs.list) return;

        const entries = getFilteredEntries();
        const total = getJournals().length;
        refs.list.innerHTML = entries.map(renderCard).join('');
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ root: refs.list });

        if (refs.resultsCount) {
            refs.resultsCount.textContent = entries.length === 1 ? 'يومية واحدة' : `${entries.length} يوميات`;
        }
        setHidden(refs.clearFilters, !hasActiveFilters());

        const noEntries = total === 0;
        const noResults = !noEntries && entries.length === 0;
        setHidden(refs.empty, !noEntries);
        setHidden(refs.noResults, !noResults);
    };

    const findEntry = (id) => getJournals().find(entry => String(entry.id) === String(id));

    const populateForm = (entry = null) => {
        refs.title.value = entry?.title || '';
        refs.content.value = entry?.content || '';
        refs.composerTitle.textContent = entry ? 'تعديل اليومية' : 'اكتب اليوم';
        refs.composerDate.textContent = formatDate(entry?.dateKey || getTodayKey());
        updateWordCount();
    };

    const openComposer = (entry = null) => {
        editingEntryId = entry ? entry.id : null;
        populateForm(entry);
        setPanelVisible(refs.composer, true);
        requestAnimationFrame(() => refs.title?.focus());
    };

    const closeComposer = () => {
        setPanelVisible(refs.composer, false);
        editingEntryId = null;
        refs.form?.reset();
        refs.composerTitle.textContent = 'اكتب اليوم';
        updateWordCount();
    };

    const openReader = (entry) => {
        activeEntryId = entry.id;
        refs.readerDate.textContent = formatDate(entry.dateKey);
        refs.readerTitle.textContent = entry.title || getDefaultTitle(entry.dateKey);
        refs.readerMeta.textContent = `${countWords(entry.content)} كلمة`;
        refs.readerContent.textContent = entry.content;
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

    const persist = () => {
        if (typeof saveState === 'function') saveState();
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
            entry.title = title;
            entry.content = content;
            entry.updatedAt = now;
            persist();
            closeComposer();
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
            updatedAt: now
        };

        journals.push(entry);
        persist();
        closeComposer();
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
        persist();
        render();
        toast('اتحذفت اليومية.', 'info');
    };

    const editActiveEntry = () => {
        const entry = findEntry(activeEntryId);
        if (!entry) return;
        closeReader();
        openComposer(entry);
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
        refs.reader = document.getElementById('journal-reader');
        refs.closeReader = document.getElementById('journal-close-reader');
        refs.readerDate = document.getElementById('journal-reader-date');
        refs.readerTitle = document.getElementById('journal-reader-title');
        refs.readerMeta = document.getElementById('journal-reader-meta');
        refs.readerContent = document.getElementById('journal-reader-content');
        refs.edit = document.getElementById('journal-edit-entry');
        refs.delete = document.getElementById('journal-delete-entry');
        refs.nav = document.getElementById('nav-journal');

        if (!refs.list || !refs.form || !refs.nav) return false;

        refs.openComposer?.addEventListener('click', () => openComposer());
        refs.emptyAction?.addEventListener('click', () => openComposer());
        refs.closeComposer?.addEventListener('click', closeComposer);
        refs.form.addEventListener('submit', saveEntry);
        refs.content?.addEventListener('input', updateWordCount);
        refs.search?.addEventListener('input', render);
        refs.dateFilter?.addEventListener('change', () => {
            refs.customRange.classList.toggle('hidden', refs.dateFilter.value !== 'custom');
            render();
        });
        refs.dateFrom?.addEventListener('change', render);
        refs.dateTo?.addEventListener('change', render);
        refs.clearFilters?.addEventListener('click', clearFilters);
        refs.closeReader?.addEventListener('click', closeReader);
        refs.edit?.addEventListener('click', editActiveEntry);
        refs.delete?.addEventListener('click', deleteActiveEntry);

        refs.nav.addEventListener('click', () => {
            if (typeof switchTab === 'function') switchTab('journal');
        });

        refs.list.addEventListener('click', (event) => {
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
            if (!refs.composer.classList.contains('hidden')) closeComposer();
            if (!refs.reader.classList.contains('hidden')) closeReader();
        });

        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        render();
        return true;
    };

    window.RODOJournal = { setup, render, openComposer, openReader };
    window.addEventListener('load', setup, { once: true });
})();
