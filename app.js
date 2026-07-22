/* ============================================ */
/* STV - MAIN JAVASCRIPT (SPA Refactor)         */
/* ============================================ */

(function() {
    "use strict";

    let _tvData = [];
    let _cinemaData = [];
    let _dataLoaded = false;

    const STORAGE = {
        favChannels: "stv_fav_channels",
        favMovies: "stv_fav_movies",
        history: "stv_history",
        movieProgress: "stv_movie_progress",
        newSnapshot: "stv_new_snapshot",
        newResetDate: "stv_new_reset_date",
        newsContent: "stv_news_content",
        lastPlaying: "stv_last_playing",
        seenNew: "stv_seen_new"
    };

    const ITEMS_PER_PAGE = 20;

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
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        try {
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        } catch (err) {
            clearTimeout(timeoutId);
            throw err;
        }
    }

    function getPlayerUrl(url) {
        if (!url) return null;
        return 'player.html?url=' + encodeURIComponent(url);
    }

    function detectOS() {
        const ua = navigator.userAgent.toLowerCase();
        const isAndroid = /android/.test(ua);
        const isIPad = /ipad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const isIOS = /iphone|ipod/.test(ua) || isIPad;
        const isAndroidTV = isAndroid && (/tv|smarttv|googletv|appletv|hbbtv|pov_tv|netcast.tv/.test(ua) || screen.width > 960);
        const isMac = /macintosh|mac os x/.test(ua) && !/iphone|ipad|ipod/.test(ua);
        const isWindows = /windows/.test(ua);
        const isLinux = /linux/.test(ua) && !isAndroid;
        return { supported: !isWindows, isAndroid, isIOS, isAndroidTV, isMac, isWindows, isLinux };
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

    /* ============================================ */
    /* LOGICA DE SPA (PESTAÑAS)                     */
    /* ============================================ */
            window.switchPage = function(pageId) {
        document.body.dataset.page = pageId;
        
        // Actualizar navegación
        $$('.top-tab').forEach(t => {
            if (t.dataset.target === pageId) t.classList.add('active');
            else t.classList.remove('active');
        });
        
        // Mostrar panel correspondiente
        $$('.tab-panel').forEach(p => {
            if (p.id === 'tab-' + pageId) p.classList.remove('hidden');
            else p.classList.add('hidden');
        });
        
        // Actualizar URL sin recargar
        const url = new URL(window.location);
        url.searchParams.set('p', pageId);
        window.history.pushState({}, '', url);

        // 👇 NUEVA SOLUCIÓN ULTRA ROBUSTA PARA EL SCROLL 👇
        
        // 1. Reiniciar el scroll global del navegador (compatible con móviles viejos y nuevos)
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;

        // 2. Si tu CSS tiene el scroll bloqueado en el contenedor principal, esto lo reinicia:
        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.scrollTop = 0;
        }

        // 3. Reiniciar el panel específico que se acaba de abrir por si tiene overflow interno:
        const activePanel = document.getElementById('tab-' + pageId);
        if (activePanel) {
            activePanel.scrollTop = 0;
        }

        updateBadge();
    };


    function initTabs() {
        $$('.top-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.preventDefault();
                switchPage(tab.dataset.target);
            });
        });

        // Manejar el botón "Atrás" del navegador
        window.addEventListener('popstate', () => {
            const params = new URLSearchParams(location.search);
            switchPage(params.get('p') || 'home');
        });
    }

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
        if (badge) {
            if (total > 0) { badge.textContent = total > 99 ? "99+" : total; badge.style.display = "flex"; }
            else { badge.style.display = "none"; }
        }
    }

    function getNewItems(currentItems, type) {
        const snapshot = load(STORAGE.newSnapshot, {});
        const resetDate = load(STORAGE.newResetDate, null);
        const today = todayStr();
        if (!resetDate || daysDiff(resetDate, today) >= 7) {
            snapshot[type] = currentItems.map(it => it.id);
            save(STORAGE.newSnapshot, snapshot);
            save(STORAGE.newResetDate, today);
            const seen = load(STORAGE.seenNew, {});
            seen[type] = [];
            save(STORAGE.seenNew, seen);
            return [];
        }
        const oldIds = new Set(snapshot[type] || []);
        const seenIds = new Set(load(STORAGE.seenNew, {})[type] || []);
        return currentItems.filter(it => !oldIds.has(it.id) && !seenIds.has(it.id));
    }

    function markNewAsSeen(type, id) {
        const all = load(STORAGE.seenNew, {});
        if (!all[type]) all[type] = [];
        if (!all[type].includes(id)) {
            all[type].push(id);
            save(STORAGE.seenNew, all);
            updateBadge();
        }
    }
    window.markNewAsSeen = markNewAsSeen;

    function getFavs(type) { return load(type === "tv" ? STORAGE.favChannels : STORAGE.favMovies, []); }
    function setFav(type, id, on) {
        const key = type === "tv" ? STORAGE.favChannels : STORAGE.favMovies;
        let list = load(key, []);
        if (on) { if (!list.includes(id)) list.push(id); }
        else { list = list.filter(x => x !== id); }
        save(key, list);
    }
    function isFav(type, id) { return getFavs(type).includes(id); }

    function addHistory(type, item, optionLabel, optIdx, seasonIdx, episodeIdx) {
        let hist = load(STORAGE.history, []);
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
        save(STORAGE.history, hist);
    }

    function getHistory(type, limit) { return load(STORAGE.history, []).filter(h => h.type === type).slice(0, limit || 10); }
    function clearHistory(type) { save(STORAGE.history, load(STORAGE.history, []).filter(h => h.type !== type)); }
    function hasHistory(type) { return load(STORAGE.history, []).some(h => h.type === type); }
    function getMovieProgress(id) { return load(STORAGE.movieProgress, {})[id] || 0; }

    function setPlaying(type, id, optIdx, url, seasonIdx, episodeIdx, optionLabel) {
        save(STORAGE.lastPlaying, { type, id, optIdx, seasonIdx, episodeIdx, optionLabel, time: Date.now() });
    }
    function getPlaying() { return load(STORAGE.lastPlaying, null); }

    /* ============================================ */
    /* LOGICA DE REPRODUCCIÓN INTEGRADAS EN SPA     */
    /* ============================================ */
    window.goToAndPlay = function(type, id, seasonIdx, epIdx, optIdx) {
        const typeKey = type === 'tv' ? 'tv' : 'movie';
        markNewAsSeen(typeKey, id);
        
        const targetTab = type === 'tv' ? 'tv' : 'cinema';
        switchPage(targetTab);

        const data = type === 'tv' ? _tvData : _cinemaData;
        const item = data.find(i => i.id === id);
        if (!item) return;

        if (item.isSeries && seasonIdx !== null && epIdx !== null) playSeriesVideo(type, item, seasonIdx, epIdx, optIdx || 0);
        else playVideo(type, item, optIdx || 0);

        // Desplegar la lista visualmente
        const section = $(`#tab-${targetTab}`);
        const container = section.querySelector('.list-container');
        if (container) {
            container.dataset.openId = id;
            if (seasonIdx !== null) container.dataset.openSeason = `${id}-${seasonIdx}`;
            if (epIdx !== null) container.dataset.openEpisode = `${id}-${seasonIdx}-${epIdx}`;
            
            refreshList(type, container.dataset.tab || "all", section.querySelector("input").value.trim(), 1);
            
            setTimeout(() => {
                const el = container.querySelector(`[data-id="${id}"]`);
                if(el) el.scrollIntoView({behavior: 'smooth', block: 'center'});
            }, 100);
        }
        window.scrollTo({top: 0, behavior: 'smooth'});
    };

    function playVideo(type, item, optionIdx) {
        const typeKey = type === "tv" ? "tv" : "movie";
        markNewAsSeen(typeKey, item.id);

        const opt = item.options[optionIdx];
        if (!opt || !opt.url) return;
        const container = $(`#tab-${type === 'tv' ? 'tv' : 'cinema'} .video-container`);
        if (!container) return;
        
        container.innerHTML = `<iframe src="${getPlayerUrl(opt.url)}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
        addHistory(type, item, opt.label, optionIdx);
        setPlaying(type, item.id, optionIdx, opt.url, null, null, opt.label);
        showReloadButton(type);
    }

    function playSeriesVideo(type, item, seasonIdx, episodeIdx, optionIdx) {
        markNewAsSeen("movie", item.id);
        const season = item.seasons[seasonIdx];
        if (!season) return;
        const episode = season.episodes[episodeIdx];
        if (!episode) return;
        const opt = episode.options[optionIdx];
        if (!opt || !opt.url) return;
        const container = $(`#tab-cinema .video-container`);
        if (!container) return;

        container.innerHTML = `<iframe src="${getPlayerUrl(opt.url)}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
        const label = `T${season.seasonNumber} E${episodeIdx + 1}${episode.name ? ' - ' + episode.name : ''}`;
        addHistory(type, item, label, optionIdx, seasonIdx, episodeIdx);
        setPlaying(type, item.id, optionIdx, opt.url, seasonIdx, episodeIdx, opt.label);
        showReloadButton(type);
    }

    function showReloadButton(type) {
        const btn = $(`#tab-${type === 'tv' ? 'tv' : 'cinema'} .reload-btn`);
        if (btn) btn.classList.add("visible");
    }

    function renderPagination(container, totalItems, currentPage, onPageChange) {
        const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
        if (totalPages <= 1) { container.innerHTML = ""; return; }
        
        let html = `<div class="pagination-inner">`;
        if (currentPage > 1) html += `<button class="page-btn" data-page="${currentPage - 1}"><span class="material-symbols-rounded">chevron_left</span></button>`;
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
                html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
            } else if (i === currentPage - 2 || i === currentPage + 2) {
                html += `<span class="page-dots">...</span>`;
            }
        }
        if (currentPage < totalPages) html += `<button class="page-btn" data-page="${currentPage + 1}"><span class="material-symbols-rounded">chevron_right</span></button>`;
        html += `</div>`;
        container.innerHTML = html;
        container.querySelectorAll(".page-btn").forEach(btn => btn.addEventListener("click", () => onPageChange(parseInt(btn.dataset.page))));
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
            const optCount = isSeries ? item.seasons.length + "" : item.options.length;
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
            const meta = type === "tv" ? `<span>Canal ${item.number}</span>` : `<span>${item.year || ""}</span>`;
            const movieMeta = type !== "tv" ? `
                <div class="movie-meta-row">
                    ${item.genre ? `<span class="movie-genre">${item.genre}</span>` : ""}
                    ${item.rating ? `<span class="movie-rating" data-rating="${item.rating}">${item.rating}</span>` : ""}
                </div>` : "";

            const playingOptionLabel = isPlaying && lastPlaying.optionLabel ? lastPlaying.optionLabel : (isPlaying ? "Reproduciendo" : "");
            const playingIndicator = isPlaying ? `<div class="playing-indicator"><span class="material-symbols-rounded" style="font-size:12px;">play_arrow</span>${playingOptionLabel}</div>` : "";

            let optionsHTML = "";
            if (isSeries) {
                const activeSeason = isPlaying ? lastPlaying.seasonIdx : null;
                const activeEpisode = isPlaying ? lastPlaying.episodeIdx : null;

                optionsHTML = item.seasons.map((season, sIdx) => {
                    const isSeasonOpen = isOpen && (container.dataset.openSeason === `${item.id}-${sIdx}` || activeSeason === sIdx);
                    const epCount = season.episodes ? season.episodes.length : 0;
                    
                    const episodesHTML = (season.episodes || []).map((ep, eIdx) => {
                        const epNum = eIdx + 1;
                        if (ep.options && ep.options.length === 1) {
                            const selected = isPlaying && activeSeason === sIdx && activeEpisode === eIdx && lastPlaying.optIdx === 0;
                            return `<button class="option-btn episode-btn ${selected ? "selected" : ""}" data-season="${sIdx}" data-episode="${eIdx}" data-opt="0">
                                <span class="opt-label"><span class="ep-num-circle">${epNum}</span>${ep.name || ''}</span>
                                <span class="material-symbols-rounded check-icon">${selected ? "check_circle" : "play_circle"}</span>
                            </button>`;
                        } else {
                            const isEpOpen = isSeasonOpen && (container.dataset.openEpisode === `${item.id}-${sIdx}-${eIdx}` || (activeSeason === sIdx && activeEpisode === eIdx));
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
                                        <span class="opt-label"><span class="ep-num-circle">${epNum}</span>${ep.name || ''}</span>
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

            const movieDescription = type !== "tv" && item.description ? `<div class="movie-description">${item.description}</div>` : "";

            el.innerHTML = `
                <div class="item-tag ${tag}"></div>
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
                const searchInput = document.querySelector(`#tab-${type === 'tv' ? 'tv' : 'cinema'} input[type="text"]`);
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
            el.querySelector(".options-toggle").addEventListener("click", e => { e.stopPropagation(); toggleOptions(e); });

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
                        playSeriesVideo(type, item, sIdx, eIdx, optIdx);
                        const activeTab = container.dataset.tab || "all";
                        const searchInput = document.querySelector(`#tab-cinema input[type="text"]`);
                        refreshList(type, activeTab, searchInput ? searchInput.value.trim() : "", parseInt(container.dataset.page || "1"));
                    });
                });
            } else {
                el.querySelectorAll(".option-btn").forEach(btn => {
                    btn.addEventListener("click", e => {
                        e.stopPropagation();
                        playVideo(type, item, parseInt(btn.dataset.idx));
                        const activeTab = container.dataset.tab || "all";
                        const searchInput = document.querySelector(`#tab-${type === 'tv' ? 'tv' : 'cinema'} input[type="text"]`);
                        refreshList(type, activeTab, searchInput ? searchInput.value.trim() : "", parseInt(container.dataset.page || "1"));
                    });
                });
            }

            container.appendChild(el);
        });
    }

    function refreshList(type, tab, filterText, page) {
        page = page || 1;
        const sectionId = type === 'tv' ? 'tab-tv' : 'tab-cinema';
        const section = $(`#${sectionId}`);
        const container = section.querySelector(".list-container");
        const paginationContainer = section.querySelector(".pagination");
        if (!container) return;

        const openId = container.dataset.openId || "";
        const openSeason = container.dataset.openSeason || "";
        const openEpisode = container.dataset.openEpisode || "";

        let items = type === 'tv' ? _tvData : _cinemaData;
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

        renderList(container, paginatedItems, type, filterText);

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
        const item = (type === 'tv' ? _tvData : _cinemaData).find(it => it.id === last.id);
        if (!item) return;

        let url = null;
        if (item.isSeries && item.seasons && last.seasonIdx !== undefined && last.seasonIdx !== null) {
            url = item.seasons[last.seasonIdx]?.episodes[last.episodeIdx]?.options[last.optIdx]?.url;
        } else if (!item.isSeries && last.optIdx !== undefined && last.optIdx !== null) {
            url = item.options[last.optIdx]?.url;
        }

        if (url) {
            const container = $(`#tab-${type === 'tv' ? 'tv' : 'cinema'} .video-container`);
            if (container) {
                container.innerHTML = `<iframe src="${getPlayerUrl(url)}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
                showReloadButton(type);
            }
        }
    }

    function initSection(type) {
        const sectionId = type === 'tv' ? 'tab-tv' : 'tab-cinema';
        const section = $(`#${sectionId}`);
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
            });
        });

        if (searchInput && clearBtn) {
            const updateClear = () => clearBtn.classList.toggle("visible", searchInput.value.trim().length > 0);
            searchInput.addEventListener("input", e => {
                updateClear();
                filterText = e.target.value.trim();
                refreshList(type, currentTab, filterText, 1);
            });
            searchInput.addEventListener("focus", updateClear);
            clearBtn.addEventListener("click", () => {
                searchInput.value = "";
                searchInput.focus();
                updateClear();
                searchInput.dispatchEvent(new Event("input"));
            });
        }

        if (reloadBtn) {
            reloadBtn.addEventListener("click", () => {
                const last = getPlaying();
                if (!last || last.type !== type) return;
                const item = (type === 'tv' ? _tvData : _cinemaData).find(it => it.id === last.id);
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

    function renderHomeHistory() {
        const tvNew = getNewItems(_tvData, "tv");
        const mvNew = getNewItems(_cinemaData, "movie");
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
                    return `<div class="${cardClass}" onclick="window.goToAndPlay('${it.type}', '${it.id}', null, null, 0)">
                                <div class="${thumbClass}">
                                    <img src="${it.image}" alt="${it.name}" loading="lazy" onerror="this.style.display='none'">
                                    <span class="new-badge">NUEVO</span>
                                </div>
                                <p class="${titleClass}">${it.name}</p>
                                <p class="card-subtitle"><span class="tag-badge ${tag}">${tag}</span></p>
                            </div>`;
                }).join("");
            }
        }

        const tvHist = getHistory("tv", 10);
        const tvRow = $("#tv-history-row");
        if (tvRow) {
            if (tvHist.length === 0) tvRow.innerHTML = `<div class="empty-state" style="width:100%;"><span class="material-symbols-rounded">tv_off</span><p>Aún no has visto nada en TV</p></div>`;
            else {
                tvRow.innerHTML = tvHist.map(h => `<div class="media-card" onclick="window.goToAndPlay('tv', '${h.id}', null, null, ${h.optIdx || 0})">
                            <div class="media-thumb"><img src="${h.image || ''}" alt="${h.name}" loading="lazy" onerror="this.style.display='none'"></div>
                            <p class="card-title">${h.name}</p>
                            <p class="card-subtitle">${h.optionLabel || "Desconocido"}</p>
                        </div>`).join("");
            }
        }

        const mvHist = getHistory("movie", 10);
        const mvRow = $("#cinema-history-row");
        if (mvRow) {
            if (mvHist.length === 0) mvRow.innerHTML = `<div class="empty-state" style="width:100%;"><span class="material-symbols-rounded">movie_off</span><p>Aún no has visto nada en Cinema</p></div>`;
            else {
                mvRow.innerHTML = mvHist.map(h => {
                    const progress = h.progress || getMovieProgress(h.id) || 0;
                    const subtitleText = h.optionLabel || (h.seasonIdx !== null ? `T${h.seasonIdx + 1} E${h.episodeIdx + 1}` : "");
                    return `<div class="movie-card" onclick="window.goToAndPlay('movie', '${h.id}', ${h.seasonIdx ?? 'null'}, ${h.episodeIdx ?? 'null'}, ${h.optIdx || 0})">
                                <div class="movie-thumb">
                                    <img src="${h.image || ''}" alt="${h.name}" loading="lazy" onerror="this.style.display='none'">
                                    ${progress > 0 ? `<div class="progress-bar" style="width:${progress}%"></div>` : ""}
                                </div>
                                <p class="movie-title">${h.name}</p>
                                <p class="card-subtitle">${subtitleText}</p>
                            </div>`;
                }).join("");
            }
        }
    }

    function initHome() {
        renderHomeHistory();
        const guide = $("#tag-guide");
        if (guide) guide.innerHTML = `<div class="tag-guide-item"><span class="tag-guide-dot canal"></span>Canal</div><div class="tag-guide-item"><span class="tag-guide-dot pelicula"></span>Película</div><div class="tag-guide-item"><span class="tag-guide-dot serie"></span>Serie</div>`;

        const resetTV = $("#reset-tv-history");
        if (resetTV && !resetTV.dataset.initialized) {
            resetTV.dataset.initialized = "true";
            resetTV.addEventListener("click", () => {
                if (hasHistory("tv") && confirm("¿Borrar todo el historial de TV? Esta acción no se puede deshacer.")) {
                    clearHistory("tv"); renderHomeHistory();
                }
            });
        }

        const resetCinema = $("#reset-cinema-history");
        if (resetCinema && !resetCinema.dataset.initialized) {
            resetCinema.dataset.initialized = "true";
            resetCinema.addEventListener("click", () => {
                if (hasHistory("movie") && confirm("¿Borrar todo el historial de Cine? Esta acción no se puede deshacer.")) {
                    clearHistory("movie"); renderHomeHistory();
                }
            });
        }

        const newsContent = $("#news-content");
        if (newsContent) {
            const saved = load(STORAGE.newsContent, null);
            if (saved) newsContent.textContent = saved;
            newsContent.addEventListener("dblclick", () => { newsContent.contentEditable = true; newsContent.focus(); newsContent.style.outline = "1px dashed var(--accent)"; });
            newsContent.addEventListener("blur", () => { newsContent.contentEditable = false; newsContent.style.outline = "none"; save(STORAGE.newsContent, newsContent.textContent); });
        }
    }

    function handleUrlParams() {
        const params = new URLSearchParams(location.search);
        const gotoId = params.get('goto');
        const pageParam = params.get('p');
        
        if (gotoId && pageParam && (pageParam === 'tv' || pageParam === 'cinema')) {
            const type = pageParam === 'tv' ? 'tv' : 'movie';
            const sIdx = params.get('season') ? parseInt(params.get('season')) : null;
            const eIdx = params.get('ep') ? parseInt(params.get('ep')) : null;
            const oIdx = params.get('opt') ? parseInt(params.get('opt')) : 0;
            
            setTimeout(() => window.goToAndPlay(type, gotoId, sIdx, eIdx, oIdx), 200);
        }
    }

    function initSecurity() {
        document.addEventListener("contextmenu", e => { e.preventDefault(); return false; });
        document.addEventListener("keydown", e => {
            if (e.key === "F12" || ((e.ctrlKey || e.metaKey) && e.shiftKey && ["I","J","C"].includes(e.key)) || ((e.ctrlKey || e.metaKey) && e.key === "u")) { e.preventDefault(); return false; }
        });
        document.addEventListener("dragstart", e => { if (e.target.tagName === "IMG") e.preventDefault(); });
        let devtoolsOpen = false;
        window.addEventListener("resize", () => {
            if (window.outerWidth - window.innerWidth > 160 || window.outerHeight - window.innerHeight > 160) {
                if (!devtoolsOpen) { devtoolsOpen = true; console.clear(); }
            } else { devtoolsOpen = false; }
        });
    }

    function initPWA() {
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker.register("sw.js").catch(err => console.log("STV: SW failed", err));
        }
    }

    function initTouch() {
        let lastTouchEnd = 0;
        document.addEventListener("touchend", e => { const n = Date.now(); if (n - lastTouchEnd <= 300) e.preventDefault(); lastTouchEnd = n; }, { passive: false });
        document.addEventListener("touchmove", e => { if (!e.target.closest(".main-content")) e.preventDefault(); }, { passive: false });
    }

    function initNewsDismiss() {
        const newsSection = $("#news-section");
        const closeBtn = $("#news-close-btn");
        if (!newsSection || !closeBtn) return;
        const STORAGE_KEY = "stv_news_dismissed";
        const HOURS_HIDDEN = 48;

        if (load(STORAGE_KEY, null) && (Date.now() - load(STORAGE_KEY)) / (1000 * 60 * 60) < HOURS_HIDDEN) {
            newsSection.style.display = "none";
            return;
        }
        closeBtn.addEventListener("click", () => { newsSection.style.display = "none"; save(STORAGE_KEY, Date.now()); });
    }

    function initDonateModal() {
        const donateBtn = $("#donate-top-btn"), modal = $("#donate-modal"), backdrop = $("#donate-modal-backdrop"), closeBtn = $("#donate-modal-close");
        if (!donateBtn || !modal) return;
        const close = () => { modal.classList.remove("open"); document.body.classList.remove("modal-open"); };
        donateBtn.addEventListener("click", () => { modal.classList.add("open"); document.body.classList.add("modal-open"); });
        if (backdrop) backdrop.addEventListener("click", close);
        if (closeBtn) closeBtn.addEventListener("click", e => { e.stopPropagation(); close(); });
        document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
    }

    function initNoTranslate() {
        const applyNT = el => { el.setAttribute("translate", "no"); el.setAttribute("lang", "zxx"); };
        document.querySelectorAll(".material-symbols-rounded").forEach(applyNT);
        new MutationObserver(mutations => mutations.forEach(m => m.addedNodes.forEach(n => {
            if (n.nodeType === 1) {
                if (n.classList.contains("material-symbols-rounded")) applyNT(n);
                if (n.querySelectorAll) n.querySelectorAll(".material-symbols-rounded").forEach(applyNT);
            }
        }))).observe(document.body, { childList: true, subtree: true });
    }

    function initPageLoader() {
        const loader = document.getElementById("page-loader");
        const mainContent = document.querySelector(".main-content");
        if (!loader || !mainContent) return;

        mainContent.style.opacity = "0";
        mainContent.style.transition = "opacity 0.3s ease";

        window.hidePageLoader = function(hasError = false) {
            if (hasError) {
                loader.classList.add("has-error");
                const errorBox = document.getElementById("loader-error");
                const status = document.getElementById("loader-status");
                if (errorBox) errorBox.style.display = "flex";
                if (status) status.style.display = "none";
            } else {
                loader.classList.add("hidden");
                mainContent.style.opacity = "1";
                setTimeout(() => mainContent.style.transition = "", 350);
            }
        };
    }

    async function boot() {
        initApp();
        initPageLoader();
        initNoTranslate();
        initNewsDismiss();
        initDonateModal();
        initSecurity();
        initPWA();
        initTouch();
        initTabs();

        let hasError = false;
        try {
            const [chRes, mvRes] = await Promise.allSettled([
                fetchJSON("data/channels.json"),
                fetchJSON("data/movies.json")
            ]);
            _tvData = chRes.status === 'fulfilled' ? chRes.value.channels || [] : [];
            _cinemaData = mvRes.status === 'fulfilled' ? mvRes.value.movies || [] : [];
            if (chRes.status === 'rejected' || mvRes.status === 'rejected') hasError = true;
        } catch (e) {
            hasError = true;
        }

        initHome();
        initSection('tv');
        initSection('movie');

        updateBadge();

        const params = new URLSearchParams(location.search);
        switchPage(params.get('p') || 'home');
        handleUrlParams();

        window.hidePageLoader(hasError);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();

})();
