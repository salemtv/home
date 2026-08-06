/* ============================================ */
/* STV - CORE APP (Optimizado y Depurado v2025) */
/* ============================================ */

(function() {
    "use strict";

    /* 1. CONFIGURACION */
    const ITEMS_PER_PAGE = 99;
    const LOADER_TIMEOUT = 8000;
    const STORAGE_KEYS = {
        favChannels: "stv_fav_channels",
        favMovies: "stv_fav_movies",
        history: "stv_history",
        movieProgress: "stv_movie_progress",
        newSnapshot: "stv_new_snapshot",
        newResetDate: "stv_new_reset_date",
        newsContent: "stv_news_content",
        lastPlaying: "stv_last_playing",
        seenNew: "stv_seen_new",
        newsDismissed: "stv_news_dismissed",
        lastActiveTab: "stv_last_active_tab"
    };

    /* 2. ESTADO GLOBAL */
    let _tvData = [];
    let _cinemaData = [];
    let _newItemsCache = null;
    let _isPlaying = false;
    let _loaderProgress = 0;
    let _loaderComplete = false;

    /* 3. UTILIDADES DOM */
    function $(sel) { return document.querySelector(sel); }
    function $$(sel) { return document.querySelectorAll(sel); }

    /* 4. UTILIDADES DATOS */
    function save(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
    function load(key, def) {
        try { return JSON.parse(localStorage.getItem(key)) || def; }
        catch(e) { return def; }
    }
    function now() { return new Date().toISOString(); }
    function todayStr() { return new Date().toISOString().split("T")[0]; }
    function daysDiff(d1, d2) {
        return Math.floor((new Date(d2) - new Date(d1)) / (1000 * 60 * 60 * 24));
    }

    /* 5. API */
    async function fetchJSON(url) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        try {
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (!res.ok) throw new Error("HTTP " + res.status);
            return res.json();
        } catch (err) {
            clearTimeout(timeoutId);
            throw err;
        }
    }

    function getPlayerUrl(url) {
        if (!url) return null;
        return "player.html?url=" + encodeURIComponent(url);
    }

    /* 6. DETECCION DE PLATAFORMA */
    function detectOS() {
        const ua = navigator.userAgent.toLowerCase();
        const isAndroid = /android/.test(ua);
        const isIPad = /ipad/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
        const isIOS = /iphone|ipod/.test(ua) || isIPad;
        const isWindows = /windows/.test(ua);
        return { supported: true, isAndroid, isIOS };
    }

    function initApp() {
        const os = detectOS();
        $("#supported-content").style.display = os.supported ? "block" : "none";
        $("#unsupported-content").style.display = os.supported ? "none" : "flex";
    }

    /* ============================================ */
    /* 7. LOADER CON PROGRESO (DOBLE CAPA)         */
    /* ============================================ */
    
    function updateLoaderProgress(percent) {
        const logo = document.getElementById("loader-logo");
        if (!logo) return;
        
        const rounded = Math.round(percent / 5) * 5;
        const clamped = Math.min(100, Math.max(0, rounded));
        
        logo.className = 'loader-logo loader-logo-front';
        
        if (clamped >= 0 && clamped <= 100) {
            logo.classList.add('progress-' + clamped);
        }
        
        _loaderProgress = clamped;
        
        if (clamped >= 100 && !_loaderComplete) {
            _loaderComplete = true;
            logo.classList.add('glow');
            
            setTimeout(() => {
                logo.classList.add('fade-out');
                const backLogo = document.querySelector('.loader-logo-back');
                if (backLogo) backLogo.classList.add('fade-out');
                
                setTimeout(() => {
                    const loader = document.getElementById("page-loader");
                    if (loader) {
                        loader.classList.add("hidden");
                        const mainContent = document.querySelector(".main-content");
                        if (mainContent) {
                            mainContent.style.opacity = "1";
                            mainContent.style.transition = "opacity 0.3s ease";
                            setTimeout(() => mainContent.style.transition = "", 350);
                        }
                    }
                }, 600);
            }, 900);
        }
    }

    function showLoaderError() {
        const loader = document.getElementById("page-loader");
        if (loader) loader.classList.add("has-error");
        const errorBox = document.getElementById("loader-error");
        if (errorBox) errorBox.style.display = "flex";
    }

    /* ============================================ */
    /* 8. ESPERA DE RECURSOS CRÍTICOS              */
    /* ============================================ */
    
    async function waitForMaterialFonts() {
        updateLoaderProgress(10);
        
        try {
            await document.fonts.load('1em "Material Symbols Rounded"');
            await document.fonts.ready;
            updateLoaderProgress(35);
            return true;
        } catch (e) {
            await new Promise(r => setTimeout(r, 500));
            
            const testIcon = document.querySelector('.material-symbols-rounded');
            if (testIcon) {
                const fontFamily = getComputedStyle(testIcon).fontFamily;
                if (fontFamily.includes('Material Symbols')) {
                    updateLoaderProgress(35);
                    return true;
                }
            }
            
            await new Promise(r => setTimeout(r, 1000));
            updateLoaderProgress(35);
            return true;
        }
    }

    async function preloadImagesFromData() {
        updateLoaderProgress(45);
        
        const allItems = [..._tvData, ..._cinemaData];
        const imageUrls = allItems
            .map(item => item.image)
            .filter(url => url && url.startsWith('http'));
        
        const urlsToLoad = imageUrls.slice(0, 20);
        let loaded = 0;
        const total = urlsToLoad.length || 1;
        
        if (urlsToLoad.length === 0) {
            updateLoaderProgress(75);
            return;
        }
        
        const loadImage = (url) => {
            return new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.onload = () => resolve(true);
                img.onerror = () => resolve(false);
                img.src = url;
                setTimeout(() => resolve(false), 5000);
            });
        };
        
        const batchSize = 5;
        for (let i = 0; i < urlsToLoad.length; i += batchSize) {
            const batch = urlsToLoad.slice(i, i + batchSize);
            await Promise.all(batch.map(url => loadImage(url)));
            loaded += batch.length;
            const progress = 45 + (loaded / total) * 30;
            updateLoaderProgress(Math.min(75, progress));
        }
        
        updateLoaderProgress(75);
    }

    async function waitForCriticalImages() {
        updateLoaderProgress(15);
        
        const criticalImages = [
            'stv.png',
            'icon-192x192.png',
            'icon-512x512.png',
            'maskable-icon-192x192.png',
            'maskable-icon-512x512.png'
        ];
        
        const loadImage = (url) => {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => resolve(true);
                img.onerror = () => resolve(false);
                img.src = url;
                setTimeout(() => resolve(false), 3000);
            });
        };
        
        await Promise.all(criticalImages.map(url => loadImage(url)));
        updateLoaderProgress(30);
    }

    async function waitForCriticalResources() {
        try {
            await Promise.race([
                waitForCriticalImages(),
                new Promise(resolve => setTimeout(resolve, 3000))
            ]);
            
            await Promise.race([
                waitForMaterialFonts(),
                new Promise(resolve => setTimeout(resolve, 3000))
            ]);
            
            await Promise.race([
                preloadImagesFromData(),
                new Promise(resolve => setTimeout(resolve, 4000))
            ]);
            
            updateLoaderProgress(85);
            await new Promise(r => setTimeout(r, 300));
            updateLoaderProgress(95);
            await new Promise(r => setTimeout(r, 200));
            updateLoaderProgress(100);
            
        } catch (e) {
            console.warn("STV: Error en carga de recursos", e);
            updateLoaderProgress(100);
        }
    }

    /* ============================================ */
    /* 9. NAVEGACION SPA - SIN LIMPIEZA AUTOMÁTICA */
    /* ============================================ */
    
    function updateBadgeDeferred() {
        if ("requestIdleCallback" in window) {
            requestIdleCallback(updateBadge, { timeout: 200 });
        } else {
            setTimeout(updateBadge, 0);
        }
    }

    function getInitialTab() {
        const playing = getPlaying();
        const lastTab = load(STORAGE_KEYS.lastActiveTab, "home");
        
        // Verificar si el estado de reproducción es válido
        if (playing && playing.type) {
            const data = playing.type === "tv" ? _tvData : _cinemaData;
            const item = data.find(it => it.id === playing.id);
            if (item) {
                return playing.type === "tv" ? "tv" : "cinema";
            }
        }
        
        return "home";
    }

    window.switchPage = function(pageId) {
        if (document.body.dataset.page === pageId) return;
        
        document.body.dataset.page = pageId;

        $$(".top-tab").forEach(t => t.classList.toggle("active", t.dataset.target === pageId));
        $$(".tab-panel").forEach(p => p.classList.toggle("hidden", p.id !== "tab-" + pageId));

        const url = new URL(window.location);
        if (url.searchParams.get("p") !== pageId) {
            url.searchParams.set("p", pageId);
            window.history.pushState({}, "", url);
        }

        if (pageId === "home") {
            save(STORAGE_KEYS.lastActiveTab, "home");
        }

        requestAnimationFrame(() => {
            window.scrollTo(0, 0);
            const main = document.getElementById("main-content");
            if (main) main.scrollTop = 0;
            const panel = document.getElementById("tab-" + pageId);
            if (panel) panel.scrollTop = 0;
        });

        if (pageId === "home") {
            requestAnimationFrame(() => { initMarquee(); });
        }

        updateBadgeDeferred();
    };

    function initTabs() {
        $$(".top-tab").forEach(tab => {
            const go = (e) => {
                e.preventDefault();
                switchPage(tab.dataset.target);
            };
            tab.addEventListener("click", go);
            tab.addEventListener("touchend", (e) => {
                e.preventDefault();
                go(e);
            }, { passive: false });
        });

        window.addEventListener("popstate", () => {
            const params = new URLSearchParams(location.search);
            let target = params.get("p") || "home";
            
            const playing = getPlaying();
            if (playing && playing.type) {
                const playingTab = playing.type === "tv" ? "tv" : "cinema";
                if (target !== playingTab && target !== "home") {
                    target = playingTab;
                }
            } else {
                target = "home";
            }
            
            if (document.body.dataset.page !== target) switchPage(target);
        });
    }

    /* ============================================ */
    /* 10. NOVEDADES Y FAVORITOS                   */
    /* ============================================ */
    
    function getNewItems(currentItems, type) {
        if (_newItemsCache && _newItemsCache[type]) return _newItemsCache[type];

        const snapshot = load(STORAGE_KEYS.newSnapshot, {});
        const resetDate = load(STORAGE_KEYS.newResetDate, null);
        const today = todayStr();

        if (!resetDate || daysDiff(resetDate, today) >= 7) {
            snapshot[type] = currentItems.map(it => it.id);
            save(STORAGE_KEYS.newSnapshot, snapshot);
            save(STORAGE_KEYS.newResetDate, today);
            const seen = load(STORAGE_KEYS.seenNew, {});
            seen[type] = [];
            save(STORAGE_KEYS.seenNew, seen);
            _newItemsCache = _newItemsCache || {};
            _newItemsCache[type] = [];
            return [];
        }

        const oldIds = new Set(snapshot[type] || []);
        const seenIds = new Set(load(STORAGE_KEYS.seenNew, {})[type] || []);
        const result = currentItems.filter(it => !oldIds.has(it.id) && !seenIds.has(it.id));

        _newItemsCache = _newItemsCache || {};
        _newItemsCache[type] = result;
        return result;
    }

    function invalidateNewCache() { _newItemsCache = null; }

    function markNewAsSeen(type, id) {
        const all = load(STORAGE_KEYS.seenNew, {});
        if (!all[type]) all[type] = [];
        if (!all[type].includes(id)) {
            all[type].push(id);
            save(STORAGE_KEYS.seenNew, all);
            invalidateNewCache();
            updateBadgeDeferred();
        }
    }
    window.markNewAsSeen = markNewAsSeen;

    function updateBadge() {
        if (document.body.dataset.page === "home") {
            const badge = $("#home-badge");
            if (badge) badge.style.display = "none";
            return;
        }
        const tvNew = getNewItems(_tvData, "tv");
        const mvNew = getNewItems(_cinemaData, "movie");
        const total = tvNew.length + mvNew.length;
        const badge = $("#home-badge");
        if (!badge) return;
        if (total > 0) {
            badge.textContent = total > 99 ? "99+" : total;
            badge.style.display = "flex";
        } else {
            badge.style.display = "none";
        }
    }

    function getFavs(type) {
        return load(type === "tv" ? STORAGE_KEYS.favChannels : STORAGE_KEYS.favMovies, []);
    }

    function setFav(type, id, on) {
        const key = type === "tv" ? STORAGE_KEYS.favChannels : STORAGE_KEYS.favMovies;
        let list = load(key, []);
        if (on) { if (!list.includes(id)) list.push(id); }
        else { list = list.filter(x => x !== id); }
        save(key, list);
    }

    function isFav(type, id) { return getFavs(type).includes(id); }

    /* ============================================ */
    /* 11. HISTORIAL Y PROGRESO                    */
    /* ============================================ */
    
    function addHistory(type, item, optionLabel, optIdx, seasonIdx, episodeIdx) {
        let hist = load(STORAGE_KEYS.history, []);
        const key = item.id + "|" + (optIdx ?? "") + "|" + (seasonIdx ?? "") + "|" + (episodeIdx ?? "");
        hist = hist.filter(h => {
            const hKey = h.id + "|" + (h.optIdx ?? "") + "|" + (h.seasonIdx ?? "") + "|" + (h.episodeIdx ?? "");
            return hKey !== key;
        });
        hist.unshift({
            type, id: item.id, name: item.name, year: item.year || null,
            image: item.image || "", optionLabel, tag: item.tag || "",
            optIdx: optIdx ?? null, seasonIdx: seasonIdx ?? null, episodeIdx: episodeIdx ?? null,
            timestamp: now()
        });
        hist = hist.slice(0, 12);
        save(STORAGE_KEYS.history, hist);
        renderHomeHistory();
    }

    function getHistory(type, limit) {
        return load(STORAGE_KEYS.history, []).filter(h => h.type === type).slice(0, limit || 10);
    }

    function clearHistory(type) {
        save(STORAGE_KEYS.history, load(STORAGE_KEYS.history, []).filter(h => h.type !== type));
        renderHomeHistory();
    }

    function hasHistory(type) {
        return load(STORAGE_KEYS.history, []).some(h => h.type === type);
    }

    function getMovieProgress(id) {
        return load(STORAGE_KEYS.movieProgress, {})[id] || 0;
    }

    function setPlaying(type, id, optIdx, url, seasonIdx, episodeIdx, optionLabel) {
        save(STORAGE_KEYS.lastPlaying, { type, id, optIdx, seasonIdx, episodeIdx, optionLabel, time: Date.now() });
        _isPlaying = true;
        save(STORAGE_KEYS.lastActiveTab, type === "tv" ? "tv" : "cinema");
    }

    function getPlaying() { return load(STORAGE_KEYS.lastPlaying, null); }

    /* ============================================ */
    /* 12. LIMPIEZA COMPLETA DE UNA PESTAÑA        */
    /* ============================================ */

    function cleanTabCompletely(type) {
        const tabId = type === "tv" ? "tab-tv" : "tab-cinema";
        const section = $(`#${tabId}`);
        if (!section) {
            console.warn(`[STV] No se encontró la pestaña: ${tabId}`);
            return;
        }

        console.log(`[STV] 🧹 Limpiando pestaña: ${type.toUpperCase()}`);

        // ============================================
        // 1. LIMPIAR EL ESTADO DE REPRODUCCIÓN PRIMERO
        // ============================================
        const lastPlaying = getPlaying();
        if (lastPlaying && lastPlaying.type === type) {
            save(STORAGE_KEYS.lastPlaying, null);
            _isPlaying = false;
            console.log(`[STV] Estado de reproducción limpiado para: ${type}`);
        }

        // ============================================
        // 2. DESTRUIR EL IFRAME (DETENER VIDEO)
        // ============================================
        const videoContainer = section.querySelector(".video-container");
        if (videoContainer) {
            const iframes = videoContainer.querySelectorAll("iframe");
            iframes.forEach(iframe => {
                try {
                    iframe.src = "";
                    iframe.remove();
                } catch(e) {}
            });
            
            const videos = videoContainer.querySelectorAll("video");
            videos.forEach(video => {
                try {
                    video.pause();
                    video.src = "";
                    video.remove();
                } catch(e) {}
            });
            
            videoContainer.innerHTML = `
                <span class="material-symbols-rounded placeholder-icon">${type === "tv" ? "tv" : "theaters"}</span>
                <p class="placeholder-text">Selecciona ${type === "tv" ? "un canal" : "una película"} para reproducir</p>
            `;
        }

        // ============================================
        // 3. LIMPIAR LA LISTA - BORRAR TODO Y RE-RENDER
        // ============================================
        const container = section.querySelector(".list-container");
        if (container) {
            const currentTab = container.dataset.tab || "all";
            const currentPage = parseInt(container.dataset.page) || 1;
            const searchInput = section.querySelector("input[type='text']");
            const filterText = searchInput ? searchInput.value.trim() : "";
            
            container.innerHTML = '';
            container.dataset.openId = "";
            container.dataset.openSeason = "";
            container.dataset.openEpisode = "";
            
            let items = type === "tv" ? _tvData : _cinemaData;
            if (currentTab === "favorites") {
                items = items.filter(it => isFav(type, it.id));
            }
            if (filterText) {
                const searchLower = filterText.toLowerCase();
                items = items.filter(it => it.name.toLowerCase().includes(searchLower));
            }
            
            renderListClean(container, items, type, currentPage);
            
            const paginationContainer = section.querySelector(".pagination");
            if (paginationContainer) {
                const totalItems = items.length;
                renderPagination(paginationContainer, totalItems, currentPage, (newPage) => {
                    refreshList(type, currentTab, filterText, newPage);
                });
            }
        }

        // ============================================
        // 4. OCULTAR BOTÓN DE RECARGA
        // ============================================
        const reloadBtn = section.querySelector(".reload-btn");
        if (reloadBtn) {
            reloadBtn.classList.remove("visible");
        }

        console.log(`[STV] ✅ Pestaña ${type.toUpperCase()} limpiada completamente`);
    }

    /* ============================================ */
    /* 12B. RENDER LIST CLEAN (IGNORA getPlaying)  */
    /* ============================================ */

    function renderListClean(container, items, type, page) {
        container.innerHTML = "";
        if (!items.length) {
            container.innerHTML = `<div class="empty-state"><span class="material-symbols-rounded">search_off</span><p>No se encontraron resultados</p></div>`;
            return;
        }

        const start = (page - 1) * ITEMS_PER_PAGE;
        const paginatedItems = items.slice(start, start + ITEMS_PER_PAGE);

        // FORZAR: isPlaying = false para TODOS los items
        const isPlaying = false;
        const openId = "";
        const openSeason = "";
        const openEpisode = "";

        paginatedItems.forEach(item => {
            const fav = isFav(type, item.id);
            const isSeries = item.isSeries && item.seasons && item.seasons.length > 0;
            const optCount = isSeries ? item.seasons.length + "" : item.options.length;
            const isOpen = false;
            const tag = item.tag || "";

            const el = document.createElement("div");
            el.className = "list-item";
            el.dataset.id = item.id;
            el.style.position = "relative";

            const imgBox = type === "tv"
                ? `<img src="${item.image}" alt="${item.name}" class="item-img" loading="lazy" onerror="this.style.display='none'">`
                : `<img src="${item.image}" alt="${item.name}" class="item-poster-img" loading="lazy" onerror="this.style.display='none'">`;

            const meta = type === "tv"
                ? `<span>Canal ${item.number}</span>`
                : `<span>${item.year || ""}</span>`;

            const movieMeta = type !== "tv" ? `
                <div class="movie-meta-row">
                    ${item.genre ? `<span class="movie-genre">${item.genre}</span>` : ""}
                    ${item.rating ? `<span class="movie-rating" data-rating="${item.rating}">${item.rating}</span>` : ""}
                </div>` : "";

            let optionsHTML = "";
            if (isSeries) {
                optionsHTML = item.seasons.map((season, sIdx) => {
                    const episodesHTML = (season.episodes || []).map((ep, eIdx) => {
                        const epNum = eIdx + 1;
                        if (ep.options && ep.options.length === 1) {
                            return `<button class="option-btn episode-btn" data-season="${sIdx}" data-episode="${eIdx}" data-opt="0">
                                <span class="opt-label"><span class="ep-num-circle">${epNum}</span>${ep.name || ""}</span>
                                <span class="material-symbols-rounded check-icon">play_circle</span>
                            </button>`;
                        } else {
                            const epOptionsHTML = (ep.options || []).map((opt, oIdx) => {
                                return `<button class="option-btn sub-option" data-season="${sIdx}" data-episode="${eIdx}" data-opt="${oIdx}">
                                    <span class="opt-label">${opt.label}</span>
                                    <span class="material-symbols-rounded check-icon">radio_button_unchecked</span>
                                </button>`;
                            }).join("");

                            return `
                                <div class="episode-group">
                                    <button class="option-btn episode-toggle" data-season="${sIdx}" data-episode="${eIdx}">
                                        <span class="opt-label"><span class="ep-num-circle">${epNum}</span>${ep.name || ""}</span>
                                        <span class="material-symbols-rounded">expand_more</span>
                                    </button>
                                    <div class="episode-options">
                                        <div class="accordion-inner"><div class="accordion-body">${epOptionsHTML}</div></div>
                                    </div>
                                </div>`;
                        }
                    }).join("");

                    return `
                        <div class="season-group">
                            <button class="option-btn season-toggle" data-season="${sIdx}">
                                <span class="opt-label">Temporada ${season.seasonNumber}</span>
                                <span class="season-count">${season.episodes ? season.episodes.length : 0}</span>
                                <span class="material-symbols-rounded">expand_more</span>
                            </button>
                            <div class="season-episodes">
                                <div class="accordion-inner"><div class="accordion-body">${episodesHTML}</div></div>
                            </div>
                        </div>`;
                }).join("");
            } else {
                optionsHTML = item.options.map((opt, idx) => {
                    return `<button class="option-btn" data-idx="${idx}">
                        <span class="opt-label">${opt.label}</span>
                        <span class="material-symbols-rounded check-icon">radio_button_unchecked</span>
                    </button>`;
                }).join("");
            }

            const movieDescription = type !== "tv" && item.description
                ? `<div class="movie-description">${item.description}</div>`
                : "";

            el.innerHTML = `
                <div class="list-row">
                    <button class="fav-btn ${fav ? "active" : ""}" data-id="${item.id}">
                        <span class="material-symbols-rounded">${fav ? "star" : "star_outline"}</span>
                    </button>
                    ${imgBox}
                    <div class="item-info">
                        <div class="item-name">${item.name}</div>
                        ${movieMeta}
                        <div class="item-meta">${meta}</div>
                    </div>
                    <button class="options-toggle">
                        <span>${optCount}</span>
                        <span class="material-symbols-rounded">expand_more</span>
                    </button>
                </div>
                <div class="options-list">
                    <div class="accordion-inner">
                        <div class="accordion-body">
                            ${movieDescription}
                            ${optionsHTML}
                        </div>
                    </div>
                </div>`;

            el.querySelector(".fav-btn").addEventListener("click", e => {
                e.stopPropagation();
                setFav(type, item.id, !fav);
                const activeTab = container.dataset.tab || "all";
                const searchInput = document.querySelector(`#tab-${type === "tv" ? "tv" : "cinema"} input[type="text"]`);
                refreshList(type, activeTab, searchInput ? searchInput.value.trim() : "", parseInt(container.dataset.page || "1"));
            });

            function toggleOptions(ev) {
                if (ev && ev.target.closest(".fav-btn")) return;
                const list = el.querySelector(".options-list");
                const btn = el.querySelector(".options-toggle");
                const wasOpen = list.classList.contains("open");

                container.querySelectorAll(".options-list.open").forEach(l => {
                    l.classList.remove("open");
                    const b = l.previousElementSibling?.querySelector(".options-toggle");
                    if (b) b.classList.remove("open");
                });
                container.querySelectorAll(".season-episodes.open").forEach(s => s.classList.remove("open"));
                container.querySelectorAll(".season-toggle.open").forEach(b => b.classList.remove("open"));
                container.querySelectorAll(".episode-options.open").forEach(d => d.classList.remove("open"));
                container.querySelectorAll(".episode-toggle.open").forEach(b => b.classList.remove("open"));
                container.dataset.openSeason = "";
                container.dataset.openEpisode = "";

                if (!wasOpen) {
                    list.classList.add("open");
                    btn.classList.add("open");
                    container.dataset.openId = item.id;
                } else {
                    container.dataset.openId = "";
                }
            }

            el.querySelector(".list-row").addEventListener("click", toggleOptions);
            el.querySelector(".options-toggle").addEventListener("click", e => {
                e.stopPropagation();
                toggleOptions(e);
            });

            if (isSeries) {
                el.querySelectorAll(".season-toggle").forEach(btn => {
                    btn.addEventListener("click", e => {
                        e.stopPropagation();
                        const sIdx = parseInt(btn.dataset.season);
                        const seasonDiv = btn.nextElementSibling;
                        const wasOpen = seasonDiv.classList.contains("open");

                        el.querySelectorAll(".season-episodes").forEach(s => s.classList.remove("open"));
                        el.querySelectorAll(".season-toggle").forEach(b => b.classList.remove("open"));

                        if (!wasOpen) {
                            seasonDiv.classList.add("open");
                            btn.classList.add("open");
                            container.dataset.openSeason = `${item.id}-${sIdx}`;
                        } else {
                            container.dataset.openSeason = "";
                        }
                    });
                });

                el.querySelectorAll(".episode-toggle").forEach(btn => {
                    btn.addEventListener("click", e => {
                        e.stopPropagation();
                        const sIdx = parseInt(btn.dataset.season);
                        const eIdx = parseInt(btn.dataset.episode);
                        const epDiv = btn.nextElementSibling;
                        const wasOpen = epDiv.classList.contains("open");
                        const seasonContainer = btn.closest(".season-episodes");
                        if (seasonContainer) {
                            seasonContainer.querySelectorAll(".episode-options").forEach(d => d.classList.remove("open"));
                            seasonContainer.querySelectorAll(".episode-toggle").forEach(b => b.classList.remove("open"));
                        }
                        if (!wasOpen) {
                            epDiv.classList.add("open");
                            btn.classList.add("open");
                            container.dataset.openEpisode = `${item.id}-${sIdx}-${eIdx}`;
                        } else {
                            container.dataset.openEpisode = "";
                        }
                    });
                });

                el.querySelectorAll(".episode-btn, .sub-option").forEach(btn => {
                    btn.addEventListener("click", e => {
                        e.stopPropagation();
                        const sIdx = parseInt(btn.dataset.season);
                        const eIdx = parseInt(btn.dataset.episode);
                        const optIdx = parseInt(btn.dataset.opt);
                        window.goToAndPlay(type, item.id, sIdx, eIdx, optIdx);
                    });
                });
            } else {
                el.querySelectorAll(".option-btn").forEach(btn => {
                    btn.addEventListener("click", e => {
                        e.stopPropagation();
                        window.goToAndPlay(type, item.id, null, null, parseInt(btn.dataset.idx));
                    });
                });
            }

            container.appendChild(el);
        });
        initMarquee(container);
    }

    function cleanOtherTab(currentType) {
        const otherType = currentType === "tv" ? "movie" : "tv";
        cleanTabCompletely(otherType);
        console.log(`[STV] ✅ Pestaña ${otherType.toUpperCase()} limpiada desde ${currentType.toUpperCase()}`);
    }

    /* ============================================ */
    /* 13. REPRODUCCION - PUNTO DE ENTRADA UNICO   */
    /* ============================================ */

    window.goToAndPlay = function(type, id, seasonIdx, epIdx, optIdx) {
        if (!type || !id) {
            console.warn("[STV] goToAndPlay: faltan parámetros");
            return;
        }

        const typeKey = type === "tv" ? "tv" : "movie";
        markNewAsSeen(typeKey, id);
        
        console.log(`[STV] 🎯 goToAndPlay: ${type} - ${id}`);
        
        cleanOtherTab(type);
        
        const targetTab = type === "tv" ? "tv" : "cinema";
        switchPage(targetTab);

        const data = type === "tv" ? _tvData : _cinemaData;
        const item = data.find(i => i.id === id);
        if (!item) {
            console.warn("[STV] Item no encontrado:", id);
            return;
        }

        if (item.isSeries && seasonIdx !== null && epIdx !== null) {
            playSeriesVideo(type, item, seasonIdx, epIdx, optIdx || 0);
        } else {
            playVideo(type, item, optIdx || 0);
        }

        const section = $(`#tab-${targetTab}`);
        const container = section.querySelector(".list-container");
        if (container) {
            container.dataset.openId = id;
            if (seasonIdx !== null) container.dataset.openSeason = `${id}-${seasonIdx}`;
            if (epIdx !== null) container.dataset.openEpisode = `${id}-${seasonIdx}-${epIdx}`;

            const tab = container.dataset.tab || "all";
            const searchInput = section.querySelector("input[type='text']");
            const filterText = searchInput ? searchInput.value.trim() : "";
            refreshList(type, tab, filterText, 1);

            requestAnimationFrame(() => {
                const el = container.querySelector(`[data-id="${id}"]`);
                const main = document.getElementById("main-content");
                const stickyArea = section.querySelector(".sticky-player-area");
                if (el && main && stickyArea) {
                    const stickyHeight = stickyArea.offsetHeight;
                    const rect = el.getBoundingClientRect();
                    const mainRect = main.getBoundingClientRect();
                    const scrollNeeded = rect.top - mainRect.top + main.scrollTop - stickyHeight - 38;
                    main.scrollTo({ top: Math.max(0, scrollNeeded), behavior: "smooth" });
                }
            });
        }

        window.scrollTo({ top: 0, behavior: "smooth" });
        console.log(`[STV] ▶️ Reproduciendo: ${item.name} (${type})`);
    };

    function playVideo(type, item, optionIdx) {
        const typeKey = type === "tv" ? "tv" : "movie";
        markNewAsSeen(typeKey, item.id);

        const opt = item.options[optionIdx];
        if (!opt || !opt.url) {
            console.warn("[STV] URL no disponible para:", item.name);
            return;
        }
        
        const container = $(`#tab-${type === "tv" ? "tv" : "cinema"} .video-container`);
        if (!container) {
            console.warn("[STV] Contenedor de video no encontrado");
            return;
        }

        container.innerHTML = "";
        
        const iframe = document.createElement("iframe");
        iframe.src = getPlayerUrl(opt.url);
        iframe.allow = "autoplay; fullscreen; encrypted-media; picture-in-picture";
        iframe.allowFullscreen = true;
        container.appendChild(iframe);
        
        addHistory(type, item, opt.label, optionIdx);
        setPlaying(type, item.id, optionIdx, opt.url, null, null, opt.label);
        showReloadButton(type);
        renderHomeHistory();
        
        console.log(`[STV] Video reproducido: ${item.name} - ${opt.label}`);
    }

    function playSeriesVideo(type, item, seasonIdx, episodeIdx, optionIdx) {
        markNewAsSeen("movie", item.id);
        
        const season = item.seasons[seasonIdx];
        if (!season) {
            console.warn("[STV] Temporada no encontrada:", seasonIdx);
            return;
        }
        
        const episode = season.episodes[episodeIdx];
        if (!episode) {
            console.warn("[STV] Episodio no encontrado:", episodeIdx);
            return;
        }
        
        const opt = episode.options[optionIdx];
        if (!opt || !opt.url) {
            console.warn("[STV] URL no disponible para:", episode.name);
            return;
        }
        
        const container = $("#tab-cinema .video-container");
        if (!container) {
            console.warn("[STV] Contenedor de video no encontrado");
            return;
        }

        container.innerHTML = "";
        
        const iframe = document.createElement("iframe");
        iframe.src = getPlayerUrl(opt.url);
        iframe.allow = "autoplay; fullscreen; encrypted-media; picture-in-picture";
        iframe.allowFullscreen = true;
        container.appendChild(iframe);
        
        const label = `T${season.seasonNumber} E${episodeIdx + 1}${episode.name ? " - " + episode.name : ""}`;
        addHistory(type, item, label, optionIdx, seasonIdx, episodeIdx);
        setPlaying(type, item.id, optionIdx, opt.url, seasonIdx, episodeIdx, opt.label);
        showReloadButton(type);
        renderHomeHistory();
        
        console.log(`[STV] Serie reproducida: ${item.name} - ${label}`);
    }

    function showReloadButton(type) {
        const btn = $(`#tab-${type === "tv" ? "tv" : "cinema"} .reload-btn`);
        if (btn) btn.classList.add("visible");
    }

    /* ============================================ */
    /* 13B. PARAR TODO EL PLAYBACK (EMERGENCIA)    */
    /* ============================================ */

    function forceStopAllPlayback() {
        cleanTabCompletely("tv");
        cleanTabCompletely("movie");
        _isPlaying = false;
        save(STORAGE_KEYS.lastPlaying, null);
        console.log("[STV] Playback detenido completamente");
    }

    window.forceStopAllPlayback = forceStopAllPlayback;

    /* ============================================ */
    /* 13C. VALIDAR Y LIMPIAR ESTADO AL INICIAR    */
    /* ============================================ */

    function validatePlayingStateOnLoad() {
        const lastPlaying = getPlaying();
        if (!lastPlaying) return;
        
        const data = lastPlaying.type === "tv" ? _tvData : _cinemaData;
        const item = data.find(it => it.id === lastPlaying.id);
        
        if (!item) {
            save(STORAGE_KEYS.lastPlaying, null);
            _isPlaying = false;
            console.log("[STV] Estado de reproducción limpiado (item no existe)");
            return;
        }
        
        let url = null;
        if (item.isSeries && lastPlaying.seasonIdx !== null && lastPlaying.seasonIdx !== undefined) {
            const season = item.seasons[lastPlaying.seasonIdx];
            if (season && season.episodes && season.episodes[lastPlaying.episodeIdx]) {
                url = season.episodes[lastPlaying.episodeIdx].options[lastPlaying.optIdx]?.url;
            }
        } else if (!item.isSeries) {
            url = item.options[lastPlaying.optIdx]?.url;
        }
        
        if (!url) {
            save(STORAGE_KEYS.lastPlaying, null);
            _isPlaying = false;
            console.log("[STV] Estado de reproducción limpiado (URL no válida)");
        }
    }

    /* ============================================ */
    /* 14. LISTADOS Y PAGINACION                    */
    /* ============================================ */
    
    function renderPagination(container, totalItems, currentPage, onPageChange) {
        const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
        if (totalPages <= 1) { container.innerHTML = ""; return; }

        let html = `<div class="pagination-inner">`;
        if (currentPage > 1) {
            html += `<button class="page-btn" data-page="${currentPage - 1}"><span class="material-symbols-rounded">chevron_left</span></button>`;
        }
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
                html += `<button class="page-btn ${i === currentPage ? "active" : ""}" data-page="${i}">${i}</button>`;
            } else if (i === currentPage - 2 || i === currentPage + 2) {
                html += `<span class="page-dots">...</span>`;
            }
        }
        if (currentPage < totalPages) {
            html += `<button class="page-btn" data-page="${currentPage + 1}"><span class="material-symbols-rounded">chevron_right</span></button>`;
        }
        html += `</div>`;
        container.innerHTML = html;
        container.querySelectorAll(".page-btn").forEach(btn => {
            btn.addEventListener("click", () => onPageChange(parseInt(btn.dataset.page)));
        });
    }

    function renderList(container, items, type) {
        container.innerHTML = "";
        if (!items.length) {
            container.innerHTML = `<div class="empty-state"><span class="material-symbols-rounded">search_off</span><p>No se encontraron resultados</p></div>`;
            return;
        }

        const lastPlaying = getPlaying();
        const openId = container.dataset.openId || "";
        const openSeason = container.dataset.openSeason || "";
        const openEpisode = container.dataset.openEpisode || "";

        items.forEach(item => {
            const fav = isFav(type, item.id);
            const isSeries = item.isSeries && item.seasons && item.seasons.length > 0;
            const optCount = isSeries ? item.seasons.length + "" : item.options.length;
            const isOpen = openId === item.id;
            const isPlaying = lastPlaying && lastPlaying.type === type && lastPlaying.id === item.id;
            const tag = item.tag || "";

            const el = document.createElement("div");
            el.className = "list-item" + (isPlaying ? " playing" : "");
            el.dataset.id = item.id;
            el.style.position = "relative";

            const imgBox = type === "tv"
                ? `<img src="${item.image}" alt="${item.name}" class="item-img" loading="lazy" onerror="this.style.display='none'">`
                : `<img src="${item.image}" alt="${item.name}" class="item-poster-img" loading="lazy" onerror="this.style.display='none'">`;

            const meta = type === "tv"
                ? `<span>Canal ${item.number}</span>`
                : `<span>${item.year || ""}</span>`;

            const movieMeta = type !== "tv" ? `
                <div class="movie-meta-row">
                    ${item.genre ? `<span class="movie-genre">${item.genre}</span>` : ""}
                    ${item.rating ? `<span class="movie-rating" data-rating="${item.rating}">${item.rating}</span>` : ""}
                </div>` : "";

            const playingOptionLabel = isPlaying && lastPlaying.optionLabel ? lastPlaying.optionLabel : "";
            const playingIndicator = isPlaying
                ? `<div class="playing-indicator"><span class="material-symbols-rounded" style="font-size:12px;">play_arrow</span>${playingOptionLabel}</div>`
                : "";

            let optionsHTML = "";
            if (isSeries) {
                const activeSeason = isPlaying ? lastPlaying.seasonIdx : null;
                const activeEpisode = isPlaying ? lastPlaying.episodeIdx : null;

                optionsHTML = item.seasons.map((season, sIdx) => {
                    const isSeasonOpen = isOpen && (openSeason === `${item.id}-${sIdx}` || activeSeason === sIdx);
                    const epCount = season.episodes ? season.episodes.length : 0;

                    const episodesHTML = (season.episodes || []).map((ep, eIdx) => {
                        const epNum = eIdx + 1;
                        if (ep.options && ep.options.length === 1) {
                            const selected = isPlaying && activeSeason === sIdx && activeEpisode === eIdx && lastPlaying.optIdx === 0;
                            return `<button class="option-btn episode-btn ${selected ? "selected" : ""}" data-season="${sIdx}" data-episode="${eIdx}" data-opt="0">
                                <span class="opt-label"><span class="ep-num-circle">${epNum}</span>${ep.name || ""}</span>
                                <span class="material-symbols-rounded check-icon">${selected ? "check_circle" : "play_circle"}</span>
                            </button>`;
                        } else {
                            const isEpOpen = isSeasonOpen && (openEpisode === `${item.id}-${sIdx}-${eIdx}` || (activeSeason === sIdx && activeEpisode === eIdx));
                            const epOptionsHTML = (ep.options || []).map((opt, oIdx) => {
                                const selected = isPlaying && activeSeason === sIdx && activeEpisode === eIdx && lastPlaying.optIdx === oIdx;
                                return `<button class="option-btn sub-option ${selected ? "selected" : ""}" data-season="${sIdx}" data-episode="${eIdx}" data-opt="${oIdx}">
                                    <span class="opt-label">${opt.label}</span>
                                    <span class="material-symbols-rounded check-icon">${selected ? "check_circle" : "radio_button_unchecked"}</span>
                                </button>`;
                            }).join("");

                            return `
                                <div class="episode-group">
                                    <button class="option-btn episode-toggle ${isEpOpen ? "open" : ""}" data-season="${sIdx}" data-episode="${eIdx}">
                                        <span class="opt-label"><span class="ep-num-circle">${epNum}</span>${ep.name || ""}</span>
                                        <span class="material-symbols-rounded">expand_more</span>
                                    </button>
                                    <div class="episode-options ${isEpOpen ? "open" : ""}">
                                        <div class="accordion-inner"><div class="accordion-body">${epOptionsHTML}</div></div>
                                    </div>
                                </div>`;
                        }
                    }).join("");

                    return `
                        <div class="season-group">
                            <button class="option-btn season-toggle ${isSeasonOpen ? "open" : ""}" data-season="${sIdx}">
                                <span class="opt-label">Temporada ${season.seasonNumber}</span>
                                <span class="season-count">${epCount}</span>
                                <span class="material-symbols-rounded">expand_more</span>
                            </button>
                            <div class="season-episodes ${isSeasonOpen ? "open" : ""}">
                                <div class="accordion-inner"><div class="accordion-body">${episodesHTML}</div></div>
                            </div>
                        </div>`;
                }).join("");
            } else {
                optionsHTML = item.options.map((opt, idx) => {
                    const selected = isPlaying && lastPlaying.optIdx === idx;
                    return `<button class="option-btn ${selected ? "selected" : ""}" data-idx="${idx}">
                        <span class="opt-label">${opt.label}</span>
                        <span class="material-symbols-rounded check-icon">${selected ? "check_circle" : "radio_button_unchecked"}</span>
                    </button>`;
                }).join("");
            }

            const movieDescription = type !== "tv" && item.description
                ? `<div class="movie-description">${item.description}</div>`
                : "";

            el.innerHTML = `
                <div class="list-row">
                    <button class="fav-btn ${fav ? "active" : ""}" data-id="${item.id}">
                        <span class="material-symbols-rounded">${fav ? "star" : "star_outline"}</span>
                    </button>
                    ${imgBox}
                    <div class="item-info">
                        <div class="item-name">${item.name}</div>
                        ${movieMeta}
                        <div class="item-meta">${meta}${playingIndicator}</div>
                    </div>
                    <button class="options-toggle ${isOpen ? "open" : ""}">
                        <span>${optCount}</span>
                        <span class="material-symbols-rounded">expand_more</span>
                    </button>
                </div>
                <div class="options-list ${isOpen ? "open" : ""}">
                    <div class="accordion-inner">
                        <div class="accordion-body">
                            ${movieDescription}
                            ${optionsHTML}
                        </div>
                    </div>
                </div>`;

            el.querySelector(".fav-btn").addEventListener("click", e => {
                e.stopPropagation();
                setFav(type, item.id, !fav);
                const activeTab = container.dataset.tab || "all";
                const searchInput = document.querySelector(`#tab-${type === "tv" ? "tv" : "cinema"} input[type="text"]`);
                refreshList(type, activeTab, searchInput ? searchInput.value.trim() : "", parseInt(container.dataset.page || "1"));
            });

            function toggleOptions(ev) {
                if (ev && ev.target.closest(".fav-btn")) return;
                const list = el.querySelector(".options-list");
                const btn = el.querySelector(".options-toggle");
                const wasOpen = list.classList.contains("open");

                container.querySelectorAll(".options-list.open").forEach(l => {
                    l.classList.remove("open");
                    const b = l.previousElementSibling?.querySelector(".options-toggle");
                    if (b) b.classList.remove("open");
                });
                container.querySelectorAll(".season-episodes").forEach(s => s.classList.remove("open"));
                container.querySelectorAll(".season-toggle").forEach(b => b.classList.remove("open"));
                container.querySelectorAll(".episode-options").forEach(d => d.classList.remove("open"));
                container.querySelectorAll(".episode-toggle").forEach(b => b.classList.remove("open"));
                container.dataset.openSeason = "";
                container.dataset.openEpisode = "";

                if (!wasOpen) {
                    list.classList.add("open");
                    btn.classList.add("open");
                    container.dataset.openId = item.id;
                } else {
                    container.dataset.openId = "";
                }
            }

            el.querySelector(".list-row").addEventListener("click", toggleOptions);
            el.querySelector(".options-toggle").addEventListener("click", e => {
                e.stopPropagation();
                toggleOptions(e);
            });

            if (isSeries) {
                el.querySelectorAll(".season-toggle").forEach(btn => {
                    btn.addEventListener("click", e => {
                        e.stopPropagation();
                        const sIdx = parseInt(btn.dataset.season);
                        const seasonDiv = btn.nextElementSibling;
                        const wasOpen = seasonDiv.classList.contains("open");

                        el.querySelectorAll(".season-episodes").forEach(s => s.classList.remove("open"));
                        el.querySelectorAll(".season-toggle").forEach(b => b.classList.remove("open"));

                        if (!wasOpen) {
                            seasonDiv.classList.add("open");
                            btn.classList.add("open");
                            container.dataset.openSeason = `${item.id}-${sIdx}`;
                        } else {
                            container.dataset.openSeason = "";
                        }
                    });
                });

                el.querySelectorAll(".episode-toggle").forEach(btn => {
                    btn.addEventListener("click", e => {
                        e.stopPropagation();
                        const sIdx = parseInt(btn.dataset.season);
                        const eIdx = parseInt(btn.dataset.episode);
                        const epDiv = btn.nextElementSibling;
                        const wasOpen = epDiv.classList.contains("open");
                        const seasonContainer = btn.closest(".season-episodes");
                        if (seasonContainer) {
                            seasonContainer.querySelectorAll(".episode-options").forEach(d => d.classList.remove("open"));
                            seasonContainer.querySelectorAll(".episode-toggle").forEach(b => b.classList.remove("open"));
                        }
                        if (!wasOpen) {
                            epDiv.classList.add("open");
                            btn.classList.add("open");
                            container.dataset.openEpisode = `${item.id}-${sIdx}-${eIdx}`;
                        } else {
                            container.dataset.openEpisode = "";
                        }
                    });
                });

                el.querySelectorAll(".episode-btn, .sub-option").forEach(btn => {
                    btn.addEventListener("click", e => {
                        e.stopPropagation();
                        const sIdx = parseInt(btn.dataset.season);
                        const eIdx = parseInt(btn.dataset.episode);
                        const optIdx = parseInt(btn.dataset.opt);
                        window.goToAndPlay(type, item.id, sIdx, eIdx, optIdx);
                    });
                });
            } else {
                el.querySelectorAll(".option-btn").forEach(btn => {
                    btn.addEventListener("click", e => {
                        e.stopPropagation();
                        window.goToAndPlay(type, item.id, null, null, parseInt(btn.dataset.idx));
                    });
                });
            }

            container.appendChild(el);
        });
        initMarquee(container);
    }

    function refreshList(type, tab, filterText, page) {
        page = page || 1;
        const sectionId = type === "tv" ? "tab-tv" : "tab-cinema";
        const section = $(`#${sectionId}`);
        const container = section.querySelector(".list-container");
        const paginationContainer = section.querySelector(".pagination");
        if (!container) return;

        const openId = container.dataset.openId || "";
        const openSeason = container.dataset.openSeason || "";
        const openEpisode = container.dataset.openEpisode || "";

        let items = type === "tv" ? _tvData : _cinemaData;
        if (tab === "favorites") items = items.filter(it => isFav(type, it.id));
        if (filterText) items = items.filter(it => it.name.toLowerCase().includes(filterText.toLowerCase()));

        const totalItems = items.length;
        const start = (page - 1) * ITEMS_PER_PAGE;
        const paginatedItems = items.slice(start, start + ITEMS_PER_PAGE);

        container.dataset.tab = tab;
        container.dataset.page = page;
        container.dataset.openId = openId;
        container.dataset.openSeason = openSeason;
        container.dataset.openEpisode = openEpisode;

        renderList(container, paginatedItems, type);

        if (paginationContainer) {
            renderPagination(paginationContainer, totalItems, page, (newPage) => {
                refreshList(type, tab, filterText, newPage);
                container.scrollIntoView({ behavior: "smooth", block: "start" });
            });
        }
    }

    function restorePlaying(type) {
        const last = getPlaying();
        if (!last || last.type !== type) return;
        
        const item = (type === "tv" ? _tvData : _cinemaData).find(it => it.id === last.id);
        if (!item) return;

        let url = null;
        if (item.isSeries && item.seasons && last.seasonIdx !== undefined && last.seasonIdx !== null) {
            const season = item.seasons[last.seasonIdx];
            if (season && season.episodes && season.episodes[last.episodeIdx]) {
                url = season.episodes[last.episodeIdx].options[last.optIdx]?.url;
            }
        } else if (!item.isSeries && last.optIdx !== undefined && last.optIdx !== null) {
            url = item.options[last.optIdx]?.url;
        }

        if (url) {
            const container = $(`#tab-${type === "tv" ? "tv" : "cinema"} .video-container`);
            if (container) {
                container.innerHTML = `<iframe src="${getPlayerUrl(url)}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
                showReloadButton(type);
                _isPlaying = true;
            }
        } else {
            save(STORAGE_KEYS.lastPlaying, null);
            _isPlaying = false;
            console.log(`[STV] Estado de reproducción limpiado (URL inválida para ${type})`);
        }
    }

    function initSection(type) {
        const sectionId = type === "tv" ? "tab-tv" : "tab-cinema";
        const section = $(`#${sectionId}`);

		initManualSearch(type);
		
        const subTabs = section.querySelectorAll(".sub-tab");
        const searchInput = section.querySelector("input[type='text']");
        const clearBtn = section.querySelector(".clear-btn");
        const reloadBtn = section.querySelector(".reload-btn");

        let currentTab = "all";
        let filterText = "";

        subTabs.forEach(tab => {
            tab.addEventListener("click", () => {
                subTabs.forEach(t => t.classList.remove("active"));
                tab.classList.add("active");
                currentTab = tab.dataset.tab;
                refreshList(type, currentTab, filterText, 1);
                const main = document.getElementById("main-content");
                if (main) main.scrollTop = 0;
            });
        });

        if (searchInput && clearBtn) {
            const updateClear = () => clearBtn.classList.toggle("visible", searchInput.value.trim().length > 0);
            searchInput.addEventListener("input", e => {
                updateClear();
                filterText = e.target.value.trim();
                refreshList(type, currentTab, filterText, 1);
                const main = document.getElementById("main-content");
                if (main) main.scrollTop = 0;
            });
            searchInput.addEventListener("focus", updateClear);
            clearBtn.addEventListener("click", () => {
                searchInput.value = "";
                searchInput.focus();
                updateClear();
                searchInput.dispatchEvent(new Event("input"));
    
    // 🔥 NUEVO: También limpiar el buscador manual
    _manualSearchQuery = '';
    const keyboardContainer = section.querySelector('.tv-keyboard-search');
    if (keyboardContainer) {
        const displayText = keyboardContainer.querySelector('.search-text');
        const placeholder = keyboardContainer.querySelector('.search-placeholder');
        const clearBtnManual = keyboardContainer.querySelector('.search-clear-btn');
        if (displayText) displayText.textContent = '';
        if (placeholder) placeholder.classList.remove('hidden');
        if (clearBtnManual) clearBtnManual.classList.remove('visible');
    }
});

}

        if (reloadBtn) {
            reloadBtn.addEventListener("click", () => {
                const last = getPlaying();
                if (!last || last.type !== type) return;
                const item = (type === "tv" ? _tvData : _cinemaData).find(it => it.id === last.id);
                if (!item) return;

                let url = null;
                if (item.isSeries && item.seasons && last.seasonIdx !== null) {
                    url = item.seasons[last.seasonIdx]?.episodes[last.episodeIdx]?.options[last.optIdx]?.url;
                } else if (!item.isSeries && last.optIdx !== null) {
                    url = item.options[last.optIdx]?.url;
                }
                if (url) {
                    const container = section.querySelector(".video-container");
                    if (container) container.innerHTML = `<iframe src="${getPlayerUrl(url)}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
                }
            });
        }

        restorePlaying(type);
        refreshList(type, currentTab, "", 1);
    }

    /* ============================================ */
    /* 15. HOME: HISTORIAL Y NOVEDADES             */
    /* ============================================ */
    
    function renderHomeHistory() {
        const tvNew = getNewItems(_tvData, "tv");
        const mvNew = getNewItems(_cinemaData, "movie");
        const allNew = tvNew.map(it => ({...it, type: "tv"})).concat(mvNew.map(it => ({...it, type: "movie"})));

        const newSection = $("#new-section");
        const newRow = $("#new-row");
        if (newRow) {
            if (allNew.length === 0) {
                if (newSection) newSection.style.display = "none";
            } else {
                if (newSection) newSection.style.display = "block";
                newRow.innerHTML = allNew.map(it => {
                    const isMovie = it.type === "movie";
                    const tag = it.tag || (isMovie ? "pelicula" : "canal");
                    return `<div class="content-card" onclick="window.goToAndPlay('${it.type}', '${it.id}', null, null, 0)">
                                <div class="content-thumb">
                                    <img src="${it.image}" alt="${it.name}" loading="lazy" onerror="this.style.display='none'">
                                    <span class="new-badge">NUEVO</span>
                                </div>
                                <p class="content-title">${it.name}</p>
                                <p class="card-subtitle"><span class="tag-badge ${tag}">${tag}</span></p>
                            </div>`;
                }).join("");
            }
        }

        const tvHist = getHistory("tv", 10);
        const tvRow = $("#tv-history-row");
        if (tvRow) {
            if (tvHist.length === 0) {
                tvRow.innerHTML = `<div class="empty-state" style="width:100%;"><span class="material-symbols-rounded">tv_off</span><p>Aun no has visto nada en TV</p></div>`;
            } else {
                tvRow.innerHTML = tvHist.map(h => `<div class="content-card" onclick="window.goToAndPlay('tv', '${h.id}', null, null, ${h.optIdx || 0})">
                            <div class="content-thumb"><img src="${h.image || ''}" alt="${h.name}" loading="lazy" onerror="this.style.display='none'"></div>
                            <p class="content-title">${h.name}</p>
                            <p class="card-subtitle">${h.optionLabel || "Desconocido"}</p>
                        </div>`).join("");
            }
        }

        const mvHist = getHistory("movie", 10);
        const mvRow = $("#cinema-history-row");
        if (mvRow) {
            if (mvHist.length === 0) {
                mvRow.innerHTML = `<div class="empty-state" style="width:100%;"><span class="material-symbols-rounded">movie_off</span><p>Aun no has visto nada en Cinema</p></div>`;
            } else {
                mvRow.innerHTML = mvHist.map(h => {
                    const progress = h.progress || getMovieProgress(h.id) || 0;
                    const subtitleText = h.optionLabel || (h.seasonIdx !== null ? `T${h.seasonIdx + 1} E${h.episodeIdx + 1}` : "");
                    return `<div class="content-card" onclick="window.goToAndPlay('movie', '${h.id}', ${h.seasonIdx ?? 'null'}, ${h.episodeIdx ?? 'null'}, ${h.optIdx || 0})">
                                <div class="content-thumb">
                                    <img src="${h.image || ''}" alt="${h.name}" loading="lazy" onerror="this.style.display='none'">
                                    ${progress > 0 ? `<div class="progress-bar" style="width:${progress}%"></div>` : ""}
                                </div>
                                <p class="content-title">${h.name}</p>
                                <p class="card-subtitle">${subtitleText}</p>
                            </div>`;
                }).join("");
            }
        }
    }

    function initHome() {
        renderHomeHistory();

        const resetTV = $("#reset-tv-history");
        if (resetTV && !resetTV.dataset.initialized) {
            resetTV.dataset.initialized = "true";
            resetTV.addEventListener("click", () => {
                if (hasHistory("tv") && confirm("¿Estás seguro de borrar todo el historial de TV?")) {
                    clearHistory("tv");
                    renderHomeHistory();
                    initMarquee();
                }
            });
        }

        const resetCinema = $("#reset-cinema-history");
        if (resetCinema && !resetCinema.dataset.initialized) {
            resetCinema.dataset.initialized = "true";
            resetCinema.addEventListener("click", () => {
                if (hasHistory("movie") && confirm("Estás seguro de borrar todo el historial de Cine?")) {
                    clearHistory("movie");
                    renderHomeHistory();
                    initMarquee();
                }
            });
        }

        const newsContent = $("#news-content");
        if (newsContent) {
            const saved = load(STORAGE_KEYS.newsContent, null);
            if (saved) newsContent.textContent = saved;
            newsContent.addEventListener("dblclick", () => {
                newsContent.contentEditable = true;
                newsContent.focus();
                newsContent.style.outline = "1px dashed var(--accent)";
            });
            newsContent.addEventListener("blur", () => {
                newsContent.contentEditable = false;
                newsContent.style.outline = "none";
                save(STORAGE_KEYS.newsContent, newsContent.textContent);
            });
        }
    }

    function handleUrlParams() {
        const params = new URLSearchParams(location.search);
        const gotoId = params.get("goto");
        const pageParam = params.get("p");

        if (gotoId && pageParam && (pageParam === "tv" || pageParam === "cinema")) {
            const type = pageParam === "tv" ? "tv" : "movie";
            const sIdx = params.get("season") ? parseInt(params.get("season")) : null;
            const eIdx = params.get("ep") ? parseInt(params.get("ep")) : null;
            const oIdx = params.get("opt") ? parseInt(params.get("opt")) : 0;

            setTimeout(() => window.goToAndPlay(type, gotoId, sIdx, eIdx, oIdx), 200);
        }
    }

    /* ============================================ */
    /* 16. SEGURIDAD                               */
    /* ============================================ */
    
    function initSecurity() {
        document.addEventListener("contextmenu", e => { e.preventDefault(); return false; });
        document.addEventListener("keydown", e => {
            if (e.key === "F12" || ((e.ctrlKey || e.metaKey) && e.shiftKey && ["I","J","C"].includes(e.key)) || ((e.ctrlKey || e.metaKey) && e.key === "u")) {
                e.preventDefault();
                return false;
            }
        });
        document.addEventListener("dragstart", e => { if (e.target.tagName === "IMG") e.preventDefault(); });
    }

    /* ============================================ */
    /* 17. PWA Y TOUCH                             */
    /* ============================================ */
    
    function initPWA() {
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker.register("sw.js").catch(err => console.log("STV: SW failed", err));
        }
    }

    function initTouch() {
        let lastTouchEnd = 0;
        document.addEventListener("touchend", e => {
            const n = Date.now();
            if (n - lastTouchEnd <= 300) e.preventDefault();
            lastTouchEnd = n;
        }, { passive: false });
        document.addEventListener("touchmove", e => {
            if (!e.target.closest(".main-content")) e.preventDefault();
        }, { passive: false });
    }

    /* ============================================ */
    /* 18. MARQUEE                                 */
    /* ============================================ */
    
    function initMarquee(scope) {
        const targets = (scope || document).querySelectorAll(".item-name, .content-title");
        targets.forEach(function(el) {
            if (el.classList.contains("marquee-wrap")) return;
            var inner = document.createElement("span");
            inner.className = "marquee-inner";
            while (el.firstChild) inner.appendChild(el.firstChild);
            el.appendChild(inner);
            el.classList.add("marquee-wrap");
        });
        requestAnimationFrame(function() {
            targets.forEach(function(el) {
                var inner = el.querySelector(".marquee-inner");
                if (!inner) return;
                var overflow = inner.scrollWidth > el.clientWidth;
                if (overflow) {
                    el.classList.add("is-overflow");
                    el.style.setProperty("--marquee-end", (el.clientWidth - inner.scrollWidth) + "px");
                    var duration = Math.min(12, Math.max(6, inner.scrollWidth / 25));
                    el.style.setProperty("--marquee-duration", duration + "s");
                } else {
                    el.classList.remove("is-overflow");
                }
            });
        });
    }

    let _marqueeObserver = null;
    function initMarqueeObserver() {
        if (_marqueeObserver) return;
        _marqueeObserver = new MutationObserver(function(mutations) {
            var hasNew = mutations.some(function(m) { return m.type === "childList" && m.addedNodes.length; });
            if (!hasNew) return;
            clearTimeout(window._marqueeDebounce);
            window._marqueeDebounce = setTimeout(function() { initMarquee(); }, 60);
        });
        var wrapper = document.getElementById("app-wrapper");
        if (wrapper) _marqueeObserver.observe(wrapper, { childList: true, subtree: true });
    }

    /* ============================================ */
    /* 19. NOTICIAS Y DONACIONES                   */
    /* ============================================ */
    
    function initNewsDismiss() {
        const newsSection = $("#news-section");
        const closeBtn = $("#news-close-btn");
        if (!newsSection || !closeBtn) return;
        const HOURS_HIDDEN = 48;

        if (load(STORAGE_KEYS.newsDismissed, null) && (Date.now() - load(STORAGE_KEYS.newsDismissed)) / (1000 * 60 * 60) < HOURS_HIDDEN) {
            newsSection.style.display = "none";
            return;
        }
        closeBtn.addEventListener("click", () => {
            newsSection.style.display = "none";
            save(STORAGE_KEYS.newsDismissed, Date.now());
        });
    }

    function initDonateModal() {
        const donateBtn = $("#donate-top-btn");
        const modal = $("#donate-modal");
        const backdrop = $("#donate-modal-backdrop");
        const closeBtn = $("#donate-modal-close");
        if (!donateBtn || !modal) return;

        const close = () => {
            modal.classList.remove("open");
            document.body.classList.remove("modal-open");
        };

        donateBtn.addEventListener("click", () => {
            modal.classList.add("open");
            document.body.classList.add("modal-open");
        });
        if (backdrop) backdrop.addEventListener("click", close);
        if (closeBtn) closeBtn.addEventListener("click", e => { e.stopPropagation(); close(); });
        document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
    }

    /* ============================================ */
    /* 20. PAGE LOADER                             */
    /* ============================================ */
    
    function initPageLoader() {
        const loader = document.getElementById("page-loader");
        const mainContent = document.querySelector(".main-content");
        if (!loader || !mainContent) return;

        mainContent.style.opacity = "0";
        mainContent.style.transition = "opacity 0.3s ease";
        
        updateLoaderProgress(0);
    }

/* ============================================ */
/* 21. BUSCADOR MANUAL (MODO HORIZONTAL)       */
/* ============================================ */

let _manualSearchQuery = '';
let _manualSearchTimer = null;

function initManualSearch(type) {
    const sectionId = type === "tv" ? "tab-tv" : "tab-cinema";
    const section = $(`#${sectionId}`);
    if (!section) return;

    const keyboardContainer = section.querySelector('.tv-keyboard-search');
    if (!keyboardContainer) return;

    const displayText = keyboardContainer.querySelector('.search-text');
    const placeholder = keyboardContainer.querySelector('.search-placeholder');
    const clearBtn = keyboardContainer.querySelector('.search-clear-btn');
    const searchInput = section.querySelector('input[type="text"]');
    const container = section.querySelector('.list-container');

    if (!displayText || !placeholder || !clearBtn || !searchInput) return;

    // Actualizar display
    function updateDisplay() {
        if (_manualSearchQuery.length > 0) {
            displayText.textContent = _manualSearchQuery;
            placeholder.classList.add('hidden');
            clearBtn.classList.add('visible');
        } else {
            displayText.textContent = '';
            placeholder.classList.remove('hidden');
            clearBtn.classList.remove('visible');
        }
    }

    // Ejecutar búsqueda
    function performSearch() {
        if (searchInput) {
            searchInput.value = _manualSearchQuery;
            const event = new Event('input', { bubbles: true });
            searchInput.dispatchEvent(event);
        }
    }

    // Limpiar búsqueda
    function clearSearch() {
        _manualSearchQuery = '';
        updateDisplay();
        performSearch();
    }

    // Agregar letra
    function addLetter(letter) {
        if (letter === '⌫') {
            _manualSearchQuery = _manualSearchQuery.slice(0, -1);
            updateDisplay();
            performSearch();
            return;
        }

        if (letter === ' ') {
            _manualSearchQuery += ' ';
            updateDisplay();
            performSearch();
            return;
        }

        if (letter === '🔍') {
            return;
        }

        _manualSearchQuery += letter;
        updateDisplay();
        performSearch();
    }

    // Configurar teclas
    const keys = keyboardContainer.querySelectorAll('.key-btn');
    keys.forEach(btn => {
        const letter = btn.dataset.letter;
        if (!letter) return;

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            addLetter(letter);
        });

        btn.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            addLetter(letter);
        }, { passive: false });
    });

    // Botón clear
    clearBtn.addEventListener('click', (e) => {
        e.preventDefault();
        clearSearch();
    });

    // Sincronizar con el input normal
    searchInput.addEventListener('input', () => {
        const val = searchInput.value.trim();
        if (val !== _manualSearchQuery) {
            _manualSearchQuery = val;
            updateDisplay();
        }
    });

    updateDisplay();
}

    /* ============================================ */
    /* 22. BOOT                                    */
    /* ============================================ */
    
    async function boot() {
        initApp();
        initPageLoader();
        initNewsDismiss();
        initDonateModal();
        initSecurity();
        initPWA();
        initTouch();
        initTabs();
        initMarqueeObserver();

        let hasError = false;
        let dataLoaded = false;

        try {
            const [chRes, mvRes] = await Promise.allSettled([
                fetchJSON("data/channels.json"),
                fetchJSON("data/movies.json")
            ]);
            _tvData = chRes.status === "fulfilled" ? chRes.value.channels || [] : [];
            _cinemaData = mvRes.status === "fulfilled" ? mvRes.value.movies || [] : [];
            
            if (chRes.status === "rejected" || mvRes.status === "rejected") {
                hasError = true;
            } else {
                dataLoaded = true;
            }
        } catch (e) {
            hasError = true;
        }

        if (hasError || !dataLoaded) {
            showLoaderError();
            return;
        }

        // 🔥 Validar y limpiar estado de reproducción al inicio
        validatePlayingStateOnLoad();

        initHome();
        initSection("tv");
        initSection("movie");

        updateBadge();

        const initialTab = getInitialTab();
        switchPage(initialTab);
        handleUrlParams();

        try {
            await Promise.race([
                waitForCriticalResources(),
                new Promise((resolve) => {
                    setTimeout(() => {
                        if (!_loaderComplete) {
                            console.warn("STV: Loader timeout, forcing complete");
                            updateLoaderProgress(100);
                        }
                        resolve();
                    }, LOADER_TIMEOUT);
                })
            ]);
        } catch (e) {
            console.warn("STV: Error en carga de recursos", e);
            if (!_loaderComplete) {
                updateLoaderProgress(100);
            }
        }
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();

})();