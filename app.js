/* ============================================ */
/* STV - MAIN JAVASCRIPT (Optimized)            */
/* Cache de datos, loader real, FOUT fix       */
/* ============================================ */

(function() {
    "use strict";

    const STORAGE = {
        favChannels: "stv_fav_channels",
        favMovies: "stv_fav_movies",
        history: "stv_history",
        movieProgress: "stv_movie_progress",
        newSnapshot: "stv_new_snapshot",
        newResetDate: "stv_new_reset_date",
        newsContent: "stv_news_content",
        lastPlaying: "stv_last_playing",
        // NUEVO: Cache de datos JSON
        cachedChannels: "stv_cached_channels",
        cachedMovies: "stv_cached_movies",
        cachedChannelsTime: "stv_cached_channels_time",
        cachedMoviesTime: "stv_cached_movies_time",
        // NUEVO: Cache de estado UI
        uiStateTv: "stv_ui_state_tv",
        uiStateCinema: "stv_ui_state_cinema"
    };

    const ITEMS_PER_PAGE = 30;
    const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 horas

    function $(sel) { return document.querySelector(sel); }
    function $$(sel) { return document.querySelectorAll(sel); }
    function save(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
    function load(key, def) {
        try { return JSON.parse(localStorage.getItem(key)) || def; }
        catch(e) { return def; }
    }
    function now() { return new Date().toISOString(); }
    function daysDiff(d1, d2) { return Math.floor((new Date(d2) - new Date(d1)) / (1000 * 60 * 60 * 24)); }
    function todayStr() { return new Date().toISOString().split("T")[0]; }
    function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

    async function fetchJSON(url) {
        const res = await fetch(url);
        return res.json();
    }

    /* ============================================ */
    /* [NUEVO] CACHE DE DATOS JSON                  */
    /* Carga desde localStorage primero, luego      */
    /* actualiza en background desde red            */
    /* ============================================ */

    async function fetchJSONWithCache(url, cacheKey, cacheTimeKey) {
        const cached = load(cacheKey, null);
        const cachedTime = load(cacheTimeKey, 0);
        const nowTime = Date.now();
        const isFresh = cached && (nowTime - cachedTime) < CACHE_MAX_AGE_MS;

        // Si hay cache fresco, devolver inmediatamente y actualizar en background
        if (isFresh && cached) {
            // Actualizar en background silenciosamente
            fetchJSON(url).then(data => {
                save(cacheKey, data);
                save(cacheTimeKey, Date.now());
            }).catch(() => {});
            return cached;
        }

        // Si no hay cache o está vieja, esperar fetch
        const data = await fetchJSON(url);
        save(cacheKey, data);
        save(cacheTimeKey, Date.now());
        return data;
    }

    /* ============================================ */
    /* [NUEVO] CACHE DE ESTADO UI                   */
    /* Guarda/restaura tab, página, búsqueda        */
    /* ============================================ */

    function saveUIState(type, tab, page, filterText) {
        const key = type === "tv" ? STORAGE.uiStateTv : STORAGE.uiStateCinema;
        save(key, { tab, page, filterText, timestamp: Date.now() });
    }

    function loadUIState(type) {
        const key = type === "tv" ? STORAGE.uiStateTv : STORAGE.uiStateCinema;
        return load(key, { tab: "all", page: 1, filterText: "" });
    }

    function getPlayerUrl(url) {
        if (!url) return null;
        const lower = url.toLowerCase();
        if (lower.includes('youtube.com/watch?v=')) {
            try {
                const id = new URL(url).searchParams.get('v');
                if (id) return 'https://www.youtube.com/embed/' + id + '?autoplay=1&rel=0&modestbranding=1';
            } catch(e) {}
        }
        if (lower.includes('youtu.be/')) {
            const id = url.split('youtu.be/')[1].split('?')[0];
            if (id) return 'https://www.youtube.com/embed/' + id + '?autoplay=1&rel=0&modestbranding=1';
        }
        return 'player.html?url=' + encodeURIComponent(url);
    }


    function detectOS() {
    const ua = navigator.userAgent.toLowerCase();

    // 1. Detectar Android PRIMERO (antes que Linux)
    const isAndroid = /android/.test(ua);

    // 2. Detectar iOS
    const isIOS = /iphone|ipad|ipod/.test(ua);

    // 3. Android TV (debe ir después de isAndroid)
    const isAndroidTV = isAndroid && (/tv|smarttv|googletv|appletv|hbbtv|pov_tv|netcast.tv/.test(ua) || screen.width > 960);

    // 4. Mac (excluyendo iOS)
    const isMac = /macintosh|mac os x/.test(ua) && !/iphone|ipad|ipod/.test(ua);

    // 5. Windows
    const isWindows = /windows/.test(ua);

    // 6. Linux (¡IMPORTANTE: excluir Android explícitamente!)
    const isLinux = /linux/.test(ua) && !isAndroid;

    // 7. SOPORTE: incluir Linux también, o quitarlo si no quieres soporte Linux
    return { 
        supported: isAndroid || isIOS || isAndroidTV || isMac || isWindows || isLinux, 
        isAndroid, 
        isIOS, 
        isAndroidTV, 
        isMac, 
        isWindows, 
        isLinux 
    };
}


    function initApp() {
        const os = detectOS();
        const supportedEl = $("#supported-content");
        const unsupportedEl = $("#unsupported-content");
        if (os.supported) {
            supportedEl.style.display = "block";
            unsupportedEl.style.display = "none";
        } else {
            supportedEl.style.display = "none";
            unsupportedEl.style.display = "flex";
        }
    }

    async function updateBadge() {
        try {
            const chData = await fetchJSON("data/channels.json").catch(() => ({channels: []}));
            const mvData = await fetchJSON("data/movies.json").catch(() => ({movies: []}));
            const tvNew = getNewItems(chData.channels || [], "tv");
            const mvNew = getNewItems(mvData.movies || [], "movie");
            const total = tvNew.length + mvNew.length;
            const badge = $("#home-badge");
            if (badge) {
                if (total > 0) { badge.textContent = total > 99 ? "99+" : total; badge.style.display = "flex"; }
                else { badge.style.display = "none"; }
            }
        } catch(e) {}
    }

    function getNewItems(currentItems, type) {
        const snapshot = load(STORAGE.newSnapshot, {});
        const resetDate = load(STORAGE.newResetDate, null);
        const today = todayStr();
        if (!resetDate || daysDiff(resetDate, today) >= 7) {
            snapshot[type] = currentItems.map(it => it.id);
            save(STORAGE.newSnapshot, snapshot);
            save(STORAGE.newResetDate, today);
            return [];
        }
        const oldIds = new Set(snapshot[type] || []);
        return currentItems.filter(it => !oldIds.has(it.id));
    }

    function getFavs(type) { return load(type === "tv" ? STORAGE.favChannels : STORAGE.favMovies, []); }
    function setFav(type, id, on) {
        const key = type === "tv" ? STORAGE.favChannels : STORAGE.favMovies;
        let list = load(key, []);
        if (on) { if (!list.includes(id)) list.push(id); }
        else { list = list.filter(x => x !== id); }
        save(key, list);
    }
    function isFav(type, id) { return getFavs(type).includes(id); }

    // Historial: cada opción es un registro único. Si se repite, se mueve al top.
    function addHistory(type, item, optionLabel, optIdx, seasonIdx, episodeIdx) {
        let hist = load(STORAGE.history, []);
        // Clave única: id + optIdx + seasonIdx + episodeIdx
        const key = item.id + "|" + (optIdx !== undefined ? optIdx : "") + "|" + (seasonIdx !== undefined ? seasonIdx : "") + "|" + (episodeIdx !== undefined ? episodeIdx : "");
        hist = hist.filter(h => {
            const hKey = h.id + "|" + (h.optIdx !== null ? h.optIdx : "") + "|" + (h.seasonIdx !== null ? h.seasonIdx : "") + "|" + (h.episodeIdx !== null ? h.episodeIdx : "");
            return hKey !== key;
        });
        hist.unshift({
            type, id: item.id, name: item.name, year: item.year || null,
            image: item.image || "", optionLabel, tag: item.tag || "",
            optIdx: optIdx !== undefined ? optIdx : null,
            seasonIdx: seasonIdx !== undefined ? seasonIdx : null,
            episodeIdx: episodeIdx !== undefined ? episodeIdx : null,
            timestamp: now()
        });
        hist = hist.slice(0, 12);
        save(STORAGE.history, hist);
    }

    function getHistory(type, limit) {
        return load(STORAGE.history, []).filter(h => h.type === type).slice(0, limit || 10);
    }

    function clearHistory(type) {
        let hist = load(STORAGE.history, []);
        hist = hist.filter(h => h.type !== type);
        save(STORAGE.history, hist);
    }

    function hasHistory(type) {
        return load(STORAGE.history, []).some(h => h.type === type);
    }

    function getMovieProgress(id) { return load(STORAGE.movieProgress, {})[id] || 0; }
    function setMovieProgress(id, pct) {
        const all = load(STORAGE.movieProgress, {});
        all[id] = clamp(pct, 0, 100);
        save(STORAGE.movieProgress, all);
    }

    function setPlaying(type, id, optIdx, url, seasonIdx, episodeIdx) {
        save(STORAGE.lastPlaying, { type, id, optIdx, url, seasonIdx, episodeIdx, time: Date.now() });
    }
    function getPlaying() { return load(STORAGE.lastPlaying, null); }
    function clearPlaying() { localStorage.removeItem(STORAGE.lastPlaying); }

    function playVideo(type, item, optionIdx) {
        const opt = item.options[optionIdx];
        if (!opt || !opt.url) return;
        const playerUrl = getPlayerUrl(opt.url);
        const container = $(".video-container");
        if (!container) return;
        container.innerHTML = `<iframe src="${playerUrl}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
        addHistory(type, item, opt.label, optionIdx);
        setPlaying(type, item.id, optionIdx, opt.url);
        showReloadButton();
    }

    function playSeriesVideo(type, item, seasonIdx, episodeIdx, optionIdx) {
        const season = item.seasons[seasonIdx];
        if (!season) return;
        const episode = season.episodes[episodeIdx];
        if (!episode) return;
        const opt = episode.options[optionIdx];
        if (!opt || !opt.url) return;
        const playerUrl = getPlayerUrl(opt.url);
        const container = $(".video-container");
        if (!container) return;
        container.innerHTML = `<iframe src="${playerUrl}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
        const label = `T${season.seasonNumber} E${episodeIdx + 1}${episode.name ? ' - ' + episode.name : ''}`;
        addHistory(type, item, label, optionIdx, seasonIdx, episodeIdx);
        setPlaying(type, item.id, optionIdx, opt.url, seasonIdx, episodeIdx);
        showReloadButton();
    }

    function showReloadButton() {
        const btn = $("#reload-btn");
        if (btn) btn.classList.add("visible");
    }
    function hideReloadButton() {
        const btn = $("#reload-btn");
        if (btn) btn.classList.remove("visible");
    }

    function initReloadButton() {
        const btn = $("#reload-btn");
        if (!btn) return;
        btn.addEventListener("click", () => {
            const last = getPlaying();
            if (!last || !last.url) return;
            const container = $(".video-container");
            if (!container) return;
            const playerUrl = getPlayerUrl(last.url);
            container.innerHTML = `<iframe src="${playerUrl}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
        });
    }

    function initSearch() {
        const input = $("#search-input");
        const clearBtn = $("#search-clear");
        if (!input || !clearBtn) return;
        function updateClear() {
            if (input.value.trim().length > 0) clearBtn.classList.add("visible");
            else clearBtn.classList.remove("visible");
        }
        input.addEventListener("input", updateClear);
        input.addEventListener("focus", updateClear);
        clearBtn.addEventListener("click", () => {
            input.value = "";
            input.focus();
            updateClear();
            input.dispatchEvent(new Event("input"));
        });
    }

    function renderPagination(container, totalItems, currentPage, onPageChange) {
        const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
        if (totalPages <= 1) {
            container.innerHTML = "";
            return;
        }
        let html = `<div class="pagination-inner">`;
        if (currentPage > 1) {
            html += `<button class="page-btn" data-page="${currentPage - 1}"><span class="material-symbols-rounded">chevron_left</span></button>`;
        }
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
                html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
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
            btn.addEventListener("click", () => {
                onPageChange(parseInt(btn.dataset.page));
            });
        });
    }

    function renderTagGuide() {
        const guide = $("#tag-guide");
        if (!guide) return;
        guide.innerHTML = `
            <div class="tag-guide-item"><span class="tag-guide-dot canal"></span>Canal</div>
            <div class="tag-guide-item"><span class="tag-guide-dot pelicula"></span>Película</div>
            <div class="tag-guide-item"><span class="tag-guide-dot serie"></span>Serie</div>
        `;
    }

    function renderList(container, items, type, filterText) {
        container.innerHTML = "";
        if (!items.length) {
            container.innerHTML = `<div class="empty-state"><span class="material-symbols-rounded">search_off</span><p>No se encontraron resultados</p></div>`;
            return;
        }
        const lastPlaying = getPlaying();
        items.forEach(item => {
            const fav = isFav(type, item.id);
            const isSeries = item.isSeries && item.seasons && item.seasons.length > 0;
            const optCount = isSeries
                ? item.seasons.length + ""
                : item.options.length;
            const isOpen = container.dataset.openId === item.id;
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

            const playingIndicator = isPlaying
                ? `<div class="playing-indicator"><span class="material-symbols-rounded" style="font-size:12px;">play_arrow</span>Reproduciendo</div>`
                : "";

            let optionsHTML = "";
            if (isSeries) {
                /* ============================================ */
                /* [NUEVO] Determinar qué temporada/capítulo    */
                /* está activo según lastPlaying para marcarlo  */
                /* ============================================ */
                const activeSeason = lastPlaying && lastPlaying.type === type && lastPlaying.id === item.id ? lastPlaying.seasonIdx : null;
                const activeEpisode = lastPlaying && lastPlaying.type === type && lastPlaying.id === item.id ? lastPlaying.episodeIdx : null;
                const activeOpt = lastPlaying && lastPlaying.type === type && lastPlaying.id === item.id ? lastPlaying.optIdx : null;

                optionsHTML = item.seasons.map((season, sIdx) => {
                    const isSeasonOpen = isOpen && (container.dataset.openSeason === `${item.id}-${sIdx}` || activeSeason === sIdx);
                    const epCount = season.episodes ? season.episodes.length : 0;
                    const episodesHTML = (season.episodes || []).map((ep, eIdx) => {
                        const epNum = eIdx + 1;
                        const epOptCount = ep.options ? ep.options.length : 0;
                        if (epOptCount === 1) {
                            const selected = lastPlaying && lastPlaying.type === type && lastPlaying.id === item.id &&
                                lastPlaying.seasonIdx === sIdx && lastPlaying.episodeIdx === eIdx && lastPlaying.optIdx === 0;
                            return `<button class="option-btn episode-btn ${selected ? "selected" : ""}" data-season="${sIdx}" data-episode="${eIdx}" data-opt="0">
                                <span class="opt-label"><span class="ep-num-circle">${epNum}</span>${ep.name || ''}</span>
                                <span class="material-symbols-rounded check-icon">${selected ? "check_circle" : "play_circle"}</span>
                            </button>`;
                        } else {
                            const isEpOpen = isSeasonOpen && (container.dataset.openEpisode === `${item.id}-${sIdx}-${eIdx}` || (activeSeason === sIdx && activeEpisode === eIdx));
                            const epOptionsHTML = ep.options.map((opt, oIdx) => {
                                const selected = lastPlaying && lastPlaying.type === type && lastPlaying.id === item.id &&
                                    lastPlaying.seasonIdx === sIdx && lastPlaying.episodeIdx === eIdx && lastPlaying.optIdx === oIdx;
                                return `<button class="option-btn sub-option ${selected ? "selected" : ""}" data-season="${sIdx}" data-episode="${eIdx}" data-opt="${oIdx}">
                                    <span class="opt-label">${opt.label}</span>
                                    <span class="material-symbols-rounded check-icon">${selected ? "check_circle" : "radio_button_unchecked"}</span>
                                </button>`;
                            }).join("");
                            return `
                                <div class="episode-group">
                                    <button class="option-btn episode-toggle ${isEpOpen ? "open" : ""}" data-season="${sIdx}" data-episode="${eIdx}">
                                        <span class="opt-label"><span class="ep-num-circle">${epNum}</span>${ep.name || ''}</span>
                                        <span class="material-symbols-rounded">expand_more</span>
                                    </button>
                                    <div class="episode-options ${isEpOpen ? "open" : ""}">${epOptionsHTML}</div>
                                </div>
                            `;
                        }
                    }).join("");

                    return `
                        <div class="season-group">
                            <button class="option-btn season-toggle ${isSeasonOpen ? "open" : ""}" data-season="${sIdx}">
                                <span class="opt-label">Temporada ${season.seasonNumber}</span>
                                <span class="season-count">${epCount}</span>
                                <span class="material-symbols-rounded">expand_more</span>
                            </button>
                            <div class="season-episodes ${isSeasonOpen ? "open" : ""}">${episodesHTML}</div>
                        </div>
                    `;
                }).join("");
            } else {
                optionsHTML = item.options.map((opt, idx) => {
                    const selected = lastPlaying && lastPlaying.type === type && lastPlaying.id === item.id && lastPlaying.optIdx === idx;
                    return `<button class="option-btn ${selected ? "selected" : ""}" data-idx="${idx}">
                        <span class="opt-label">${opt.label}</span>
                        <span class="material-symbols-rounded check-icon">${selected ? "check_circle" : "radio_button_unchecked"}</span>
                    </button>`;
                }).join("");
            }

            el.innerHTML = `
                <div class="item-tag ${tag}"></div>
                <div class="list-row">
                    <button class="fav-btn ${fav ? "active" : ""}" data-id="${item.id}">
                        <span class="material-symbols-rounded">${fav ? "star" : "star_outline"}</span>
                    </button>
                    ${imgBox}
                    <div class="item-info">
                        <div class="item-name">${item.name}</div>
                        <div class="item-meta">${meta}${playingIndicator}</div>
                    </div>
                    <button class="options-toggle ${isOpen ? "open" : ""}" data-id="${item.id}">
                        <span>${optCount}</span>
                        <span class="material-symbols-rounded">expand_more</span>
                    </button>
                </div>
                <div class="options-list ${isOpen ? "open" : ""}">${optionsHTML}</div>
            `;

            el.querySelector(".fav-btn").addEventListener("click", e => {
                e.stopPropagation();
                setFav(type, item.id, !isFav(type, item.id));
                const activeTab = container.dataset.tab || "all";
                const currentPage = parseInt(container.dataset.page || "1");
                const searchInput = $("#search-input");
                const filterText = searchInput ? searchInput.value.trim() : "";
                refreshList(type, activeTab, filterText, currentPage);
            });



                        // [NUEVO] Expandir/ocultar al tocar TODA la fila (list-row)
            // El botón options-toggle sigue funcionando igual
            function toggleOptions(ev) {
                // No hacer nada si se tocó el botón de favorito
                if (ev && ev.target.closest(".fav-btn")) return;

                const list = el.querySelector(".options-list");
                const btn = el.querySelector(".options-toggle");
                const wasOpen = list.classList.contains("open");

                // Cerrar todos los demás items abiertos
                container.querySelectorAll(".options-list.open").forEach(l => {
                    l.classList.remove("open");
                    const b = l.previousElementSibling?.querySelector(".options-toggle");
                    if (b) b.classList.remove("open");
                });

                // Resetear temporadas/episodios si estaban abiertos
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

            // Click en toda la fila expande/oculta
            el.querySelector(".list-row").addEventListener("click", function(e) {
                // Si se tocó el fav-btn, no hacer toggle
                if (e.target.closest(".fav-btn")) return;
                toggleOptions(e);
            });

            // Click en el botón toggle también funciona (igual que antes)
            el.querySelector(".options-toggle").addEventListener("click", function(e) {
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
                        el.querySelectorAll(".episode-options").forEach(d => d.classList.remove("open"));
                        el.querySelectorAll(".episode-toggle").forEach(b => b.classList.remove("open"));
                        if (!wasOpen) {
                            seasonDiv.classList.add("open");
                            btn.classList.add("open");
                            container.dataset.openSeason = `${item.id}-${sIdx}`;
                        } else {
                            container.dataset.openSeason = "";
                            container.dataset.openEpisode = "";
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

                el.querySelectorAll(".episode-btn").forEach(btn => {
                    btn.addEventListener("click", e => {
                        e.stopPropagation();
                        const sIdx = parseInt(btn.dataset.season);
                        const eIdx = parseInt(btn.dataset.episode);
                        const optIdx = parseInt(btn.dataset.opt);
                        container.querySelectorAll(".options-list.open").forEach(l => {
                            l.classList.remove("open");
                            const b = l.previousElementSibling?.querySelector(".options-toggle");
                            if (b) b.classList.remove("open");
                        });
                        container.dataset.openId = "";
                        container.dataset.openSeason = "";
                        container.dataset.openEpisode = "";
                        playSeriesVideo(type, item, sIdx, eIdx, optIdx);
                        const activeTab = container.dataset.tab || "all";
                        const currentPage = parseInt(container.dataset.page || "1");
                        const searchInput = $("#search-input");
                        const filterText = searchInput ? searchInput.value.trim() : "";
                        refreshList(type, activeTab, filterText, currentPage);
                    });
                });

                el.querySelectorAll(".sub-option").forEach(btn => {
                    btn.addEventListener("click", e => {
                        e.stopPropagation();
                        const sIdx = parseInt(btn.dataset.season);
                        const eIdx = parseInt(btn.dataset.episode);
                        const optIdx = parseInt(btn.dataset.opt);
                        container.querySelectorAll(".options-list.open").forEach(l => {
                            l.classList.remove("open");
                            const b = l.previousElementSibling?.querySelector(".options-toggle");
                            if (b) b.classList.remove("open");
                        });
                        container.dataset.openId = "";
                        container.dataset.openSeason = "";
                        container.dataset.openEpisode = "";
                        playSeriesVideo(type, item, sIdx, eIdx, optIdx);
                        const activeTab = container.dataset.tab || "all";
                        const currentPage = parseInt(container.dataset.page || "1");
                        const searchInput = $("#search-input");
                        const filterText = searchInput ? searchInput.value.trim() : "";
                        refreshList(type, activeTab, filterText, currentPage);
                    });
                });
            } else {
                el.querySelectorAll(".option-btn").forEach(btn => {
                    btn.addEventListener("click", e => {
                        e.stopPropagation();
                        const idx = parseInt(btn.dataset.idx);
                        container.querySelectorAll(".options-list.open").forEach(l => {
                            l.classList.remove("open");
                            const b = l.previousElementSibling?.querySelector(".options-toggle");
                            if (b) b.classList.remove("open");
                        });
                        container.dataset.openId = "";
                        playVideo(type, item, idx);
                        const activeTab = container.dataset.tab || "all";
                        const currentPage = parseInt(container.dataset.page || "1");
                        const searchInput = $("#search-input");
                        const filterText = searchInput ? searchInput.value.trim() : "";
                        refreshList(type, activeTab, filterText, currentPage);
                    });
                });
            }

            container.appendChild(el);
        });
    }

    function refreshList(type, tab, filterText, page) {
        page = page || 1;
        const container = $("#list-container");
        const paginationContainer = $("#pagination");
        if (!container) return;
        const allItems = window._stvData || [];
        let items = allItems;
        if (tab === "favorites") items = allItems.filter(it => isFav(type, it.id));
        if (filterText) items = items.filter(it => it.name.toLowerCase().includes(filterText.toLowerCase()));

        const totalItems = items.length;
        const start = (page - 1) * ITEMS_PER_PAGE;
        const paginatedItems = items.slice(start, start + ITEMS_PER_PAGE);

        container.dataset.tab = tab;
        container.dataset.page = page;
        renderList(container, paginatedItems, type, filterText);

        if (paginationContainer) {
            renderPagination(paginationContainer, totalItems, page, (newPage) => {
                refreshList(type, tab, filterText, newPage);
                container.scrollIntoView({ behavior: "smooth", block: "start" });
            });
        }

        // Guardar estado UI
        saveUIState(type, tab, page, filterText);
    }

    function restorePlaying(type) {
        const last = getPlaying();
        if (!last || last.type !== type) return;
        const item = (window._stvData || []).find(it => it.id === last.id);
        if (!item) return;

        if (item.isSeries && item.seasons && last.seasonIdx !== undefined) {
            const season = item.seasons[last.seasonIdx];
            if (!season) return;
            const episode = season.episodes[last.episodeIdx];
            if (!episode || !episode.options[last.optIdx]) return;
            const opt = episode.options[last.optIdx];
            if (!opt || !opt.url) return;
            const playerUrl = getPlayerUrl(opt.url);
            const container = $(".video-container");
            if (container) {
                container.innerHTML = `<iframe src="${playerUrl}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
                showReloadButton();
            }
        } else if (!item.isSeries && last.optIdx !== undefined) {
            const opt = item.options[last.optIdx];
            if (!opt || !opt.url) return;
            const playerUrl = getPlayerUrl(opt.url);
            const container = $(".video-container");
            if (container) {
                container.innerHTML = `<iframe src="${playerUrl}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
                showReloadButton();
            }
        }
    }

    async function initTV() {
        const data = await fetchJSONWithCache("data/channels.json", STORAGE.cachedChannels, STORAGE.cachedChannelsTime);
        window._stvData = data.channels || [];
        restorePlaying("tv");

        const subTabs = $$(".sub-tab");
        let currentTab = "all";
        let filterText = "";

        // Restaurar estado UI previo
        const savedState = loadUIState("tv");
        if (savedState) {
            currentTab = savedState.tab || "all";
            // Activar tab visualmente
            subTabs.forEach(t => {
                t.classList.toggle("active", t.dataset.tab === currentTab);
            });
        }

        subTabs.forEach(tab => {
            tab.addEventListener("click", () => {
                subTabs.forEach(t => t.classList.remove("active"));
                tab.classList.add("active");
                currentTab = tab.dataset.tab;
                refreshList("tv", currentTab, filterText, 1);
            });
        });
        const searchInput = $("#search-input");
        if (searchInput) {
            searchInput.addEventListener("input", e => {
                filterText = e.target.value.trim();
                refreshList("tv", currentTab, filterText, 1);
            });
            // Restaurar texto de búsqueda
            if (savedState && savedState.filterText) {
                searchInput.value = savedState.filterText;
                filterText = savedState.filterText;
            }
        }
        initSearch();
        initReloadButton();
        refreshList("tv", currentTab, filterText, savedState ? savedState.page : 1);
    }

    async function initCinema() {
        const data = await fetchJSONWithCache("data/movies.json", STORAGE.cachedMovies, STORAGE.cachedMoviesTime);
        window._stvData = data.movies || [];
        restorePlaying("movie");

        const subTabs = $$(".sub-tab");
        let currentTab = "all";
        let filterText = "";

        // Restaurar estado UI previo
        const savedState = loadUIState("cinema");
        if (savedState) {
            currentTab = savedState.tab || "all";
            subTabs.forEach(t => {
                t.classList.toggle("active", t.dataset.tab === currentTab);
            });
        }

        subTabs.forEach(tab => {
            tab.addEventListener("click", () => {
                subTabs.forEach(t => t.classList.remove("active"));
                tab.classList.add("active");
                currentTab = tab.dataset.tab;
                refreshList("movie", currentTab, filterText, 1);
            });
        });
        const searchInput = $("#search-input");
        if (searchInput) {
            searchInput.addEventListener("input", e => {
                filterText = e.target.value.trim();
                refreshList("movie", currentTab, filterText, 1);
            });
            if (savedState && savedState.filterText) {
                searchInput.value = savedState.filterText;
                filterText = savedState.filterText;
            }
        }
        initSearch();
        initReloadButton();
        refreshList("movie", currentTab, filterText, savedState ? savedState.page : 1);
    }

    function renderHomeHistory(allChannels, allMovies) {
        const tvNew = getNewItems(allChannels, "tv");
        const mvNew = getNewItems(allMovies, "movie");
        const allNew = tvNew.map(it => ({...it, type: "tv"})).concat(mvNew.map(it => ({...it, type: "movie"})));

        const newSection = $("#new-section");
        const newRow = $("#new-row");
        if (newRow) {
            if (allNew.length === 0) { if (newSection) newSection.style.display = "none"; }
            else {
                if (newSection) newSection.style.display = "block";
                newRow.innerHTML = allNew.map(it => {
                    const isMovie = it.type === "movie";
                    const cardClass = isMovie ? "movie-card" : "media-card";
                    const thumbClass = isMovie ? "movie-thumb" : "media-thumb";
                    const titleClass = isMovie ? "movie-title" : "card-title";
                    const tag = it.tag || (isMovie ? "pelicula" : "canal");
                    const url = isMovie ? `cinema.html?goto=${it.id}&opt=0` : `tv.html?goto=${it.id}&opt=0`;
                    return `
                        <div class="${cardClass}" onclick="location.href='${url}'">
                            <div class="${thumbClass}">
                                <img src="${it.image}" alt="${it.name}" loading="lazy" onerror="this.style.display='none'">
                            </div>
                            <p class="${titleClass}">${it.name}</p>
                            <p class="card-subtitle"><span class="tag-badge ${tag}">${tag}</span></p>
                        </div>
                    `;
                }).join("");
            }
        }

        const badge = $("#home-badge");
        if (badge) badge.style.display = "none";

        const tvHist = getHistory("tv", 10);
        const tvRow = $("#tv-history-row");
        if (tvRow) {
            if (tvHist.length === 0) {
                tvRow.innerHTML = `<div class="empty-state" style="width:100%;"><span class="material-symbols-rounded">tv_off</span><p>Aún no has visto nada en TV</p></div>`;
            } else {
                tvRow.innerHTML = tvHist.map(h => {
                    const url = `tv.html?goto=${h.id}&opt=${h.optIdx !== null ? h.optIdx : 0}`;
                    return `
                        <div class="media-card" onclick="location.href='${url}'">
                            <div class="media-thumb">
                                <img src="${h.image || ''}" alt="${h.name}" loading="lazy" onerror="this.style.display='none'">
                            </div>
                            <p class="card-title">${h.name}</p>
                            <p class="card-subtitle">${h.optionLabel || "Desconocido"}</p>
                        </div>
                    `;
                }).join("");
            }
        }

        /* ============================================ */
        /* [FIX] Historial de Cinema - Series ahora   */
        /* incluyen temporada y capítulo en la URL    */
        /* y muestran "T# E#" en el subtítulo         */
        /* ============================================ */
        const mvHist = getHistory("movie", 10);
        const mvRow = $("#cinema-history-row");
        if (mvRow) {
            if (mvHist.length === 0) {
                mvRow.innerHTML = `<div class="empty-state" style="width:100%;"><span class="material-symbols-rounded">movie_off</span><p>Aún no has visto nada en Cinema</p></div>`;
            } else {
                mvRow.innerHTML = mvHist.map(h => {
                    const progress = h.progress || getMovieProgress(h.id) || 0;
                    let url;
                    let subtitleText = h.optionLabel || "";

                    // Si es serie (tiene seasonIdx y episodeIdx), construir URL completa
                    if (h.seasonIdx !== null && h.episodeIdx !== null) {
                        url = `cinema.html?goto=${h.id}&season=${h.seasonIdx}&ep=${h.episodeIdx}&opt=${h.optIdx !== null ? h.optIdx : 0}`;
                        // Mostrar T# E# en el subtítulo
                        subtitleText = h.optionLabel || `T${h.seasonIdx + 1} E${h.episodeIdx + 1}`;
                    } else {
                        url = `cinema.html?goto=${h.id}&opt=${h.optIdx !== null ? h.optIdx : 0}`;
                    }

                    return `
                        <div class="movie-card" onclick="location.href='${url}'">
                            <div class="movie-thumb">
                                <img src="${h.image || ''}" alt="${h.name}" loading="lazy" onerror="this.style.display='none'">
                                ${progress > 0 ? `<div class="progress-bar" style="width:${progress}%"></div>` : ""}
                            </div>
                            <p class="movie-title">${h.name}</p>
                            <p class="card-subtitle">${subtitleText}</p>
                        </div>
                    `;
                }).join("");
            }
        }
    }

    async function initHome() {
        const chData = await fetchJSONWithCache("data/channels.json", STORAGE.cachedChannels, STORAGE.cachedChannelsTime).catch(() => ({channels: []}));
        const mvData = await fetchJSONWithCache("data/movies.json", STORAGE.cachedMovies, STORAGE.cachedMoviesTime).catch(() => ({movies: []}));
        const allChannels = chData.channels || [];
        const allMovies = mvData.movies || [];

        renderHomeHistory(allChannels, allMovies);
        renderTagGuide();

        const resetTV = $("#reset-tv-history");
        if (resetTV && !resetTV.dataset.initialized) {
            resetTV.dataset.initialized = "true";
            resetTV.addEventListener("click", () => {
                if (!hasHistory("tv")) {
                    alert("No se encontró historial para reiniciar.");
                    return;
                }
                if (confirm("¿Borrar todo el historial de TV?")) {
                    clearHistory("tv");
                    renderHomeHistory(allChannels, allMovies);
                }
            });
        }

        const resetCinema = $("#reset-cinema-history");
        if (resetCinema && !resetCinema.dataset.initialized) {
            resetCinema.dataset.initialized = "true";
            resetCinema.addEventListener("click", () => {
                if (!hasHistory("movie")) {
                    alert("No se encontró historial para reiniciar.");
                    return;
                }
                if (confirm("¿Borrar todo el historial de Cinema?")) {
                    clearHistory("movie");
                    renderHomeHistory(allChannels, allMovies);
                }
            });
        }

        const newsContent = $("#news-content");
        if (newsContent) {
            const saved = load(STORAGE.newsContent, null);
            if (saved) newsContent.innerHTML = saved;
            newsContent.addEventListener("dblclick", () => {
                newsContent.contentEditable = true;
                newsContent.focus();
                newsContent.style.outline = "1px dashed var(--accent)";
            });
            newsContent.addEventListener("blur", () => {
                newsContent.contentEditable = false;
                newsContent.style.outline = "none";
                save(STORAGE.newsContent, newsContent.innerHTML);
            });
        }
    }

    /* ============================================ */
    /* [FIX] handleUrlParams ahora maneja series  */
    /* correctamente: abre temporada, capítulo y  */
    /* marca la opción seleccionada               */
    /* ============================================ */
    function handleUrlParams(type) {
        const params = new URLSearchParams(location.search);
        const gotoId = params.get('goto');
        const optIdx = params.get('opt');
        const seasonIdx = params.get('season');
        const epIdx = params.get('ep');
        if (!gotoId || optIdx === null) return;

        const checkAndPlay = setInterval(() => {
            const container = $("#list-container");
            if (!container || !window._stvData) return;
            const item = window._stvData.find(it => it.id === gotoId);
            if (!item) return;

            if (item.isSeries && item.seasons && seasonIdx !== null && epIdx !== null) {
                const sIdx = parseInt(seasonIdx);
                const eIdx = parseInt(epIdx);
                const oIdx = parseInt(optIdx);
                const season = item.seasons[sIdx];
                if (season && season.episodes[eIdx] && season.episodes[eIdx].options[oIdx]) {
                    clearInterval(checkAndPlay);

                    // Abrir la serie, temporada y capítulo correctos
                    container.dataset.openId = gotoId;
                    container.dataset.openSeason = `${gotoId}-${sIdx}`;
                    container.dataset.openEpisode = `${gotoId}-${sIdx}-${eIdx}`;

                    playSeriesVideo(type, item, sIdx, eIdx, oIdx);
                    refreshList(type, "all", "", 1);
                    history.replaceState({}, document.title, location.pathname);
                }
            } else if (item.options && item.options[parseInt(optIdx)]) {
                clearInterval(checkAndPlay);
                playVideo(type, item, parseInt(optIdx));
                refreshList(type, "all", "", 1);
                history.replaceState({}, document.title, location.pathname);
            }
        }, 200);
        setTimeout(() => clearInterval(checkAndPlay), 5000);
    }

    function initSecurity() {
        document.addEventListener("contextmenu", e => { e.preventDefault(); return false; });
        document.addEventListener("keydown", e => {
            if (e.key === "F12") { e.preventDefault(); return false; }
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "I" || e.key === "J" || e.key === "C")) { e.preventDefault(); return false; }
            if ((e.ctrlKey || e.metaKey) && e.key === "u") { e.preventDefault(); return false; }
        });
        document.addEventListener("dragstart", e => { if (e.target.tagName === "IMG") e.preventDefault(); });
        let devtoolsOpen = false;
        const threshold = 160;
        function checkDevTools() {
            const wT = window.outerWidth - window.innerWidth > threshold;
            const hT = window.outerHeight - window.innerHeight > threshold;
            if (wT || hT) { if (!devtoolsOpen) { devtoolsOpen = true; console.clear(); } }
            else { devtoolsOpen = false; }
        }
        window.addEventListener("resize", checkDevTools);
        setInterval(() => { checkDevTools(); (function(){}).constructor("debugger")(); }, 2000);
    }

    function initPWA() {
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker.register("sw.js")
                .then(() => console.log("STV: SW registered"))
                .catch(err => console.log("STV: SW failed", err));
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
    /* [NUEVO] FONT LOADER - Elimina FOUT         */
    /* Carga fuente local primero, fallback CDN     */
    /* Oculta iconos hasta que la fuente esté lista */
    /* ============================================ */

    function initFontLoader() {
        return new Promise(function(resolve) {
            // Timeout de seguridad: si en 4s no carga, mostrar igual
            const safetyTimeout = setTimeout(function() {
                document.body.classList.add("fonts-loaded");
                resolve(false);
            }, 4000);

            // Intentar cargar fuente local primero
            const localFont = new FontFace("Material Symbols Rounded", "url('MaterialSymbolsRounded.woff2') format('woff2')", {
                weight: "100 700",
                style: "normal",
                display: "optional"
            });

            localFont.load().then(function(font) {
                document.fonts.add(font);
                clearTimeout(safetyTimeout);
                document.body.classList.add("fonts-loaded");
                resolve(true);
            }).catch(function() {
                // Fallback: cargar desde CDN
                const link = document.createElement("link");
                link.rel = "stylesheet";
                link.href = "https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200";
                link.onload = function() {
                    clearTimeout(safetyTimeout);
                    document.body.classList.add("fonts-loaded");
                    resolve(true);
                };
                link.onerror = function() {
                    clearTimeout(safetyTimeout);
                    document.body.classList.add("fonts-loaded");
                    resolve(false);
                };
                document.head.appendChild(link);
            });
        });
    }

    /* ============================================ */
    /* [NUEVO] PAGE LOADER REAL                     */
    /* Espera: fonts + datos + render completo      */
    /* Se oculta solo cuando TODO está listo        */
    /* ============================================ */

    function initPageLoaderReal() {
        const loader = document.getElementById("page-loader");
        const mainContent = document.querySelector(".main-content");
        if (!loader || !mainContent) return Promise.resolve();

        // El contenido principal empieza oculto (opacity 0 via CSS)
        mainContent.classList.remove("content-ready");

        // Timeout de error: si tarda más de 8s, mostrar igual
        const errorTimeout = setTimeout(function() {
            loader.classList.add("loader-error");
            setTimeout(function() {
                hideLoader();
            }, 1000);
        }, 8000);

        function hideLoader() {
            clearTimeout(errorTimeout);
            // Primero mostrar el contenido con fade-in
            mainContent.classList.add("content-ready");
            // Luego quitar el loader (que tapa todo incluyendo top-bar)
            // Pequeño delay para que el contenido empiece a pintarse antes
            requestAnimationFrame(function() {
                loader.classList.add("hidden");
            });
        }

        // Exponer globalmente para que initTV/initCinema/initHome lo llamen
        window._stvHideLoader = hideLoader;
        window._stvLoader = loader;

        return new Promise(function(resolve) {
            window._stvResolveLoader = function() {
                hideLoader();
                resolve();
            };
        });
    }

    function markLoaderComplete() {
        if (window._stvResolveLoader) {
            // Pequeña espera para que el navegador termine de pintar
            requestAnimationFrame(function() {
                setTimeout(window._stvResolveLoader, 100);
            });
        }
    }

    /* ============================================ */
    /* [NUEVO] NOTICIAS CON CIERRE TEMPORAL         */
    /* ============================================ */
    /* Se cierra con X y vuelve después de N horas  */
    /* Editable: cambia HOURS_HIDDEN en la función  */
    /* ============================================ */

    function initNewsDismiss() {
        const newsSection = $("#news-section");
        const closeBtn = $("#news-close-btn");
        if (!newsSection || !closeBtn) return;

        const STORAGE_KEY = "stv_news_dismissed";
        const HOURS_HIDDEN = 48; // ← Edita esto para cambiar las horas

        function shouldShow() {
            const dismissedAt = load(STORAGE_KEY, null);
            if (!dismissedAt) return true;
            const elapsed = Date.now() - dismissedAt;
            const hoursElapsed = elapsed / (1000 * 60 * 60);
            return hoursElapsed >= HOURS_HIDDEN;
        }

        if (!shouldShow()) {
            newsSection.style.display = "none";
            return;
        }

        closeBtn.addEventListener("click", () => {
            newsSection.style.display = "none";
            save(STORAGE_KEY, Date.now());
        });
    }

    /* ============================================ */
    /* [NUEVO] MODAL DE DONACIONES                  */
    /* ============================================ */

    function initDonateModal() {
        const donateBtn = $("#donate-top-btn");
        const modal = $("#donate-modal");
        const backdrop = $("#donate-modal-backdrop");
        const closeBtn = $("#donate-modal-close");
        if (!donateBtn || !modal) return;

        function open() {
            modal.classList.add("open");
            document.body.classList.add("modal-open");
        }
        function close() {
            modal.classList.remove("open");
            document.body.classList.remove("modal-open");
        }

        donateBtn.addEventListener("click", open);
        if (backdrop) backdrop.addEventListener("click", close);
        if (closeBtn) closeBtn.addEventListener("click", (e) => { e.stopPropagation(); close(); });
        document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    }





    /* ============================================ */
    /* [NUEVO] BLOQUEAR TRADUCCIÓN DE ICONOS        */
    /* Google Translate traduce los textos dentro   */
    /* de los spans, rompiendo los iconos.          */
    /* ============================================ */

    function initNoTranslate() {
        // Aplicar a todos los iconos existentes
        document.querySelectorAll(".material-symbols-rounded").forEach(function(el) {
            el.setAttribute("translate", "no");
            el.setAttribute("lang", "zxx");  // zxx = sin contenido lingüístico
        });

        // Observar nuevos iconos que se agreguen dinámicamente
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1) {  // Element node
                        if (node.classList && node.classList.contains("material-symbols-rounded")) {
                            node.setAttribute("translate", "no");
                            node.setAttribute("lang", "zxx");
                        }
                        // También revisar hijos
                        if (node.querySelectorAll) {
                            node.querySelectorAll(".material-symbols-rounded").forEach(function(child) {
                                child.setAttribute("translate", "no");
                                child.setAttribute("lang", "zxx");
                            });
                        }
                    }
                });
            });
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }


    /* ============================================ */
    /* [NUEVO] PREFETCH DE PÁGINAS                  */
    /* Precarga las otras páginas para navegación */
    /* más fluida entre pestañas                    */
    /* ============================================ */

    function initPrefetch() {
        const page = document.body.dataset.page;
        const pages = {
            home: ["tv.html", "cinema.html"],
            tv: ["index.html", "cinema.html"],
            cinema: ["index.html", "tv.html"]
        };
        const toPrefetch = pages[page] || [];
        toPrefetch.forEach(function(url) {
            const link = document.createElement("link");
            link.rel = "prefetch";
            link.href = url;
            document.head.appendChild(link);
        });
    }


    async function boot() {
        initApp();
        initPrefetch();
        initSecurity();
        initPWA();
        initTouch();

        // Iniciar loader real ANTES de todo
        const loaderPromise = initPageLoaderReal();

        // Cargar fuentes en paralelo
        const fontPromise = initFontLoader();

        // Esperar que las fuentes estén listas
        await fontPromise;
        initNoTranslate();
        initNewsDismiss();
        initDonateModal();
        updateBadge();

        const page = document.body.dataset.page;
        if (page === "tv") {
            await initTV();
            handleUrlParams("tv");
            markLoaderComplete();
        } else if (page === "cinema") {
            await initCinema();
            handleUrlParams("movie");
            markLoaderComplete();
        } else if (page === "home") {
            await initHome();
            markLoaderComplete();
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }

})();