/* RODO Store Experience V3 — additive presentation layer; no persistent state schema changes. */
(function () {
    'use strict';

    const detailState = {
        id: null,
        source: null,
        isDaily: false,
        mode: 'detail'
    };

    let chestRevealTimer = null;

    function esc(value) {
        return typeof escapeHTML === 'function' ? escapeHTML(value) : String(value ?? '');
    }

    function coreProduct(id) {
        if (typeof STORE_CATALOG === 'undefined' || !Array.isArray(STORE_CATALOG)) return null;
        return STORE_CATALOG.find(item => item.id === id) || null;
    }

    function studyProduct(id) {
        const catalog = Array.isArray(window.RODO_STUDY_STORE_PRODUCTS) ? window.RODO_STUDY_STORE_PRODUCTS : [];
        return catalog.find(item => item.id === id) || null;
    }

    function resolveProduct(id) {
        const normalized = String(id || '');
        const core = coreProduct(normalized);
        if (core) return { product: core, source: 'catalog' };
        const study = studyProduct(normalized);
        if (study) return { product: study, source: 'study' };
        return null;
    }

    function isPermanent(item, source) {
        return source === 'study' || (typeof isPermanentStoreItem === 'function' && isPermanentStoreItem(item));
    }

    function isOwned(item, source) {
        if (!state || !state.store) return false;
        if (source === 'study') {
            return Array.isArray(state.store.studyTools?.owned) && state.store.studyTools.owned.includes(item.id);
        }
        return isPermanent(item, source) && Array.isArray(state.store.ownedItems) && state.store.ownedItems.includes(item.id);
    }

    function getPrice(item, source, isDaily) {
        if (source === 'catalog' && isDaily && typeof getDailyOfferPrice === 'function') return getDailyOfferPrice(item);
        return Number(item.cost) || 0;
    }

    function getStatusLabel(item, source, owned) {
        if (owned) return source === 'study' ? 'في مكتبتك' : 'في خزانتك';
        if (source === 'study') return 'اقتناء مرة واحدة · ملكية دائمة';
        if (isPermanent(item, source)) return 'تخصيص · ملكية دائمة';
        if (item.type === 'mystery') return 'صندوق اختياري';
        if (item.type === 'chest') return 'صندوق';
        return 'عنصر قابل للاستخدام';
    }

    function getDetailTruth(item, source) {
        if (source === 'study') return item.detail || item.desc || '';
        if (typeof getStoreTruthNote === 'function') return getStoreTruthNote(item);
        return item.desc || '';
    }

    function getBalanceAfter(price) {
        return Math.max(0, Number(state.coins) - price);
    }

    function getModal() {
        return document.getElementById('store-product-detail-modal');
    }

    function productDisplayCategory(item, source) {
        if (source === 'study') return item.subtitle || 'أداة دراسية';
        const labels = { themes: 'مظهر', titles: 'لقب', effects: 'مؤثر بصري', boosts: 'معزز', mystery: 'صندوق اختياري', avatars: 'أفاتار', rewards: 'صندوق', powerups: 'عنصر لعبة' };
        return labels[item.category] || 'عنصر في المتجر';
    }

    function renderDetail() {
        const modal = getModal();
        if (!modal || !detailState.id) return;
        const resolved = resolveProduct(detailState.id);
        if (!resolved) return closeStoreProductDetail();

        const { product: item, source } = resolved;
        const owned = isOwned(item, source);
        const price = getPrice(item, source, detailState.isDaily);
        const canAfford = Number(state.coins) >= price;
        const permanent = isPermanent(item, source);

        const art = modal.querySelector('#store-detail-art');
        const status = modal.querySelector('#store-detail-status');
        const kicker = modal.querySelector('#store-detail-kicker');
        const title = modal.querySelector('#store-detail-title');
        const desc = modal.querySelector('#store-detail-desc');
        const truth = modal.querySelector('#store-detail-truth');
        const priceEl = modal.querySelector('#store-detail-price');
        const balanceEl = modal.querySelector('#store-detail-balance');
        const confirmBalanceEl = modal.querySelector('#store-detail-confirm-balance');
        const balanceAfterEl = modal.querySelector('#store-detail-balance-after');
        const action = modal.querySelector('#store-detail-action');
        const secondary = modal.querySelector('#store-detail-secondary');
        const confirmCopy = modal.querySelector('#store-detail-confirm-copy');
        const detailView = modal.querySelector('#store-detail-view');
        const confirmView = modal.querySelector('#store-detail-confirm');
        const confirmTitle = modal.querySelector('#store-detail-confirm-title');

        if (art) {
            art.innerHTML = `<span class="rodo-store-detail-art-glow"></span><i data-lucide="${esc(item.icon || 'package')}"></i><span class="rodo-store-detail-art-mark">${esc(String(item.rarity || 'RODO').toUpperCase())}</span>`;
        }
        if (status) {
            status.textContent = getStatusLabel(item, source, owned);
            status.className = `rodo-store-detail-status ${owned ? 'is-owned' : ''} ${canAfford ? 'is-ready' : 'is-short'}`;
        }
        if (kicker) kicker.textContent = detailState.isDaily ? 'سعر اليوم' : productDisplayCategory(item, source);
        if (title) title.textContent = item.title || 'عنصر من المتجر';
        if (desc) desc.textContent = item.desc || '';
        if (truth) truth.innerHTML = `<i data-lucide="shield-check"></i><span>${esc(getDetailTruth(item, source))}</span>`;
        if (priceEl) priceEl.innerHTML = owned && permanent ? '<span class="rodo-store-detail-owned-price">مقتنى بالفعل</span>' : `<strong>${price}</strong><span>عملة</span>${detailState.isDaily ? '<em>سعر اليوم</em>' : ''}`;
        if (balanceEl) balanceEl.textContent = String(state.coins);
        if (confirmBalanceEl) confirmBalanceEl.textContent = String(state.coins);
        if (balanceAfterEl) balanceAfterEl.textContent = String(getBalanceAfter(price));

        detailView?.classList.toggle('hidden', detailState.mode !== 'detail');
        confirmView?.classList.toggle('hidden', detailState.mode !== 'confirm');

        if (detailState.mode === 'confirm') {
            if (confirmTitle) confirmTitle.textContent = `اقتناء «${item.title}»؟`;
            if (confirmCopy) confirmCopy.textContent = `سيُخصم ${price} عملة من رصيدك الحالي (${state.coins}). بعد العملية سيصبح رصيدك ${getBalanceAfter(price)} عملة.`;
            if (secondary) {
                secondary.textContent = 'رجوع';
                secondary.onclick = () => { detailState.mode = 'detail'; renderDetail(); };
            }
            if (action) {
                action.textContent = 'تأكيد الاقتناء';
                action.className = 'rodo-store-detail-action is-primary';
                action.disabled = !canAfford || owned && permanent;
                action.onclick = confirmStoreProductPurchase;
            }
        } else {
            if (secondary) {
                secondary.textContent = owned && source === 'study' ? 'أدواتي' : owned ? 'مقتنياتي' : 'إغلاق';
                secondary.onclick = owned ? () => { closeStoreProductDetail(); if (source === 'study') setStoreCategory('tools'); else setStoreCategory('inventory'); } : closeStoreProductDetail;
            }
            if (action) {
                action.disabled = false;
                action.onclick = null;
                if (owned && permanent) {
                    action.textContent = source === 'study' ? 'الأداة في مكتبتك' : 'العنصر في خزانتك';
                    action.className = 'rodo-store-detail-action is-owned';
                    action.disabled = true;
                } else if (!canAfford) {
                    action.textContent = `ينقصك ${price - Number(state.coins)} عملة`;
                    action.className = 'rodo-store-detail-action is-disabled';
                    action.disabled = true;
                } else {
                    action.textContent = `اقتناء · ${price} عملة`;
                    action.className = 'rodo-store-detail-action is-primary';
                    action.onclick = () => { detailState.mode = 'confirm'; renderDetail(); };
                }
            }
        }

        modal.classList.remove('hidden');
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('rodo-store-detail-open');
        if (window.lucide?.createIcons) lucide.createIcons({ root: modal });
    }

    function openStoreProductDetail(id, isDaily = false) {
        const resolved = resolveProduct(id);
        if (!resolved) return false;
        detailState.id = String(id);
        detailState.source = resolved.source;
        detailState.isDaily = Boolean(isDaily);
        detailState.mode = 'detail';
        renderDetail();
        return true;
    }

    function closeStoreProductDetail() {
        const modal = getModal();
        if (!modal) return;
        detailState.id = null;
        detailState.source = null;
        detailState.isDaily = false;
        detailState.mode = 'detail';
        modal.classList.remove('is-open');
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('rodo-store-detail-open');
    }

    function confirmStoreProductPurchase() {
        const resolved = resolveProduct(detailState.id);
        if (!resolved) return false;
        const { product: item, source } = resolved;
        const beforeCoins = Number(state.coins);
        const beforeOwned = isOwned(item, source);
        const beforeConsumables = Array.isArray(state.store?.consumables) ? state.store.consumables.filter(entry => entry?.itemId === item.id).length : 0;

        if (source === 'study') {
            if (typeof buyStudyStoreProduct !== 'function') return false;
            buyStudyStoreProduct(item.id);
        } else {
            if (typeof buyStoreItem !== 'function') return false;
            buyStoreItem(item.id, detailState.isDaily);
        }

        const afterOwned = isOwned(item, source);
        const afterCoins = Number(state.coins);
        const afterConsumables = Array.isArray(state.store?.consumables) ? state.store.consumables.filter(entry => entry?.itemId === item.id).length : 0;
        const succeeded = source === 'study'
            ? (!beforeOwned && afterOwned)
            : (isPermanent(item, source) ? (!beforeOwned && afterOwned) : (afterCoins < beforeCoins || afterConsumables > beforeConsumables));

        if (succeeded) closeStoreProductDetail();
        else renderDetail();
        return succeeded;
    }

    function interceptLegacyPurchaseButtons() {
        const host = document.getElementById('view-store');
        if (!host || host.dataset.storeV3Bound === 'true') return;
        host.dataset.storeV3Bound = 'true';
        host.addEventListener('click', event => {
            const target = event.target instanceof Element ? event.target.closest('button') : null;
            if (!target || target.disabled) return;
            const onclick = target.getAttribute('onclick') || '';
            const coreMatch = onclick.match(/^buyStoreItem\(['"]([^'"]+)['"](?:,\s*(true|false))?\)/);
            const studyMatch = onclick.match(/^buyStudyStoreProduct\(['"]([^'"]+)['"]\)/);
            if (!coreMatch && !studyMatch) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            if (coreMatch) openStoreProductDetail(coreMatch[1], coreMatch[2] === 'true');
            else openStoreProductDetail(studyMatch[1], false);
        }, true);
    }

    function installModalBehavior() {
        const modal = getModal();
        if (!modal || modal.dataset.behaviorBound === 'true') return;
        modal.dataset.behaviorBound = 'true';
        modal.addEventListener('click', event => {
            if (event.target === modal) closeStoreProductDetail();
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && modal.classList.contains('is-open')) closeStoreProductDetail();
        });
    }

    function enhancedChestReveal(chestType, rewardResult) {
        const modal = document.getElementById('chest-reveal-modal');
        if (!modal) return;
        const titleEl = document.getElementById('chest-reveal-title');
        const descEl = document.getElementById('chest-reveal-desc');
        const rewardTextEl = document.getElementById('chest-reveal-reward-text');
        const iconEl = document.getElementById('chest-reveal-icon');
        const rewardBox = document.getElementById('chest-reveal-reward-box');
        const button = modal.querySelector('button[onclick="closeChestRevealModal()"]');
        const names = { scholar: 'Scholar Cache', elite: 'Elite Crate', mythic: 'Mythic Vault' };

        if (chestRevealTimer) clearTimeout(chestRevealTimer);
        modal.classList.remove('is-revealed');
        modal.classList.add('is-opening');
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        if (titleEl) titleEl.innerText = `فتح ${names[chestType] || 'الصندوق'}`;
        if (descEl) descEl.innerText = 'لحظة… بنفتح الصندوق. حصتك اتحددت بالفعل.';
        if (rewardTextEl) rewardTextEl.innerText = '…';
        if (rewardBox) rewardBox.setAttribute('aria-hidden', 'true');
        if (button) button.innerText = 'انتظر لحظة';
        if (iconEl) {
            iconEl.className = 'rodo-chest-reveal-icon is-opening';
            iconEl.innerHTML = '<span class="rodo-chest-reveal-ring ring-one"></span><span class="rodo-chest-reveal-ring ring-two"></span><i data-lucide="package-open"></i>';
        }
        if (window.lucide?.createIcons) lucide.createIcons({ root: modal });

        chestRevealTimer = setTimeout(() => {
            if (rewardResult?.type === 'item') {
                if (descEl) descEl.innerText = 'وصلتك قطعة جديدة إلى خزانتك.';
                if (rewardTextEl) rewardTextEl.innerText = rewardResult.item.title;
            } else if (rewardResult?.type === 'duplicate') {
                if (descEl) descEl.innerText = 'العنصر كان موجودًا عندك؛ تم تحويله لتعويض مناسب.';
                if (rewardTextEl) rewardTextEl.innerText = rewardResult.rewardText;
            } else {
                if (descEl) descEl.innerText = 'دي المكافأة اللي خرجت لك من الصندوق.';
                if (rewardTextEl) rewardTextEl.innerText = rewardResult?.rewardText || 'مكافأة';
            }
            if (rewardBox) rewardBox.removeAttribute('aria-hidden');
            if (button) button.innerText = 'إغلاق';
            modal.classList.remove('is-opening');
            modal.classList.add('is-revealed');
            if (iconEl) {
                iconEl.className = `rodo-chest-reveal-icon is-revealed rarity-${esc(rewardResult?.item?.rarity || 'rare')}`;
                iconEl.innerHTML = `<span class="rodo-chest-reveal-ring ring-one"></span><span class="rodo-chest-reveal-ring ring-two"></span><i data-lucide="${esc(rewardResult?.item?.icon || 'sparkles')}"></i>`;
                if (window.lucide?.createIcons) lucide.createIcons({ root: iconEl });
            }
        }, 760);
    }

    function wrapChestReveal() {
        if (typeof window.showChestRevealModal !== 'function' || window.showChestRevealModal.__rodoV3) return;
        const enhanced = enhancedChestReveal;
        enhanced.__rodoV3 = true;
        window.showChestRevealModal = enhanced;
    }

    function decorateStoreHome() {
        const front = document.getElementById('ui-store-front');
        if (!front || front.dataset.storeV3Home === 'true') return;
        front.dataset.storeV3Home = 'true';
        front.classList.add('rodo-store-home-v3');
    }

    function boot() {
        interceptLegacyPurchaseButtons();
        installModalBehavior();
        wrapChestReveal();
        decorateStoreHome();
        if (window.lucide?.createIcons) lucide.createIcons({ root: document.getElementById('view-store') || document });
    }

    window.openStoreProductDetail = openStoreProductDetail;
    window.closeStoreProductDetail = closeStoreProductDetail;
    window.confirmStoreProductPurchase = confirmStoreProductPurchase;
    window.RODO_STORE_EXPERIENCE_V3 = { boot, openStoreProductDetail, closeStoreProductDetail };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
})();
