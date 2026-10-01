(function() {
	//#region web-demo/design/parallel-tasks/02-regulation-query/prototype/core.mjs
	var compact = (value) => String(value || "").normalize("NFKC").toLowerCase().replace(/[\s·•,，。;；:：/\\()（）【】\[\]_-]/g, "");
	function normalizeQuery(value) {
		return compact(value);
	}
	function resolvePlace(query, places) {
		const normalized = normalizeQuery(query);
		if (!normalized) return {
			state: "unresolved",
			normalized,
			candidates: []
		};
		const matches = [];
		for (const place of places) for (const alias of place.aliases) {
			const aliasKey = normalizeQuery(alias.name);
			let score = 0;
			let matchedBy = alias.kind;
			if (normalized === aliasKey) score = alias.kind === "official_name" ? 1 : .88;
			else if (normalized.includes(aliasKey) || aliasKey.includes(normalized)) score = .7;
			else if (alias.fuzzy && editDistance(normalized, aliasKey) <= 1) {
				score = .52;
				matchedBy = "fuzzy";
			}
			if (/天津/.test(normalized) && place.province === "天津市") score += .09;
			if (/云南|昆明|盘龙/.test(normalized) && place.province === "云南省") score += .09;
			if (/上海/.test(normalized) && place.province === "上海市") score += .09;
			if (/天津/.test(normalized) && place.province !== "天津市") score -= .25;
			if (/云南|昆明|盘龙/.test(normalized) && place.province !== "云南省") score -= .25;
			if (/上海/.test(normalized) && place.province !== "上海市") score -= .25;
			if (score > 0) matches.push({
				...place,
				score: Math.min(score, 1),
				matchedBy,
				alias
			});
		}
		const bestByPlace = /* @__PURE__ */ new Map();
		for (const item of matches.sort((a, b) => b.score - a.score)) if (!bestByPlace.has(item.placeId)) bestByPlace.set(item.placeId, item);
		const deduped = [...bestByPlace.values()].sort((a, b) => b.score - a.score);
		if (!deduped.length) return {
			state: "unresolved",
			normalized,
			candidates: []
		};
		if (deduped.length > 1 && deduped[0].score - deduped[1].score < .18) return {
			state: "ambiguous",
			normalized,
			candidates: deduped
		};
		const first = deduped[0];
		const confirmed = first.matchedBy === "official_name" && first.score >= .99 && first.reviewStatus === "approved_formal" && first.placeType !== "development_zone";
		return {
			state: confirmed ? "resolved_exact" : "resolved_needs_confirmation",
			normalized,
			candidates: confirmed ? [first] : deduped,
			selected: first,
			confirmed
		};
	}
	function editDistance(a, b) {
		const rows = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
		for (let i = 0; i <= a.length; i += 1) rows[i][0] = i;
		for (let j = 0; j <= b.length; j += 1) rows[0][j] = j;
		for (let i = 1; i <= a.length; i += 1) for (let j = 1; j <= b.length; j += 1) rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
		return rows[a.length][b.length];
	}
	function statusLabel(status) {
		return {
			effective: "现行",
			not_yet_effective: "未实施",
			repealed: "已废止",
			superseded: "被替代",
			draft: "征求意见 / 公示",
			implemented_current_unverified: "已发布 / 已执行",
			published_pending_date: "已发布 / 执行待核",
			unknown: "待核实"
		}[status] || "待核实";
	}
	//#endregion
	//#region web-demo/design/parallel-tasks/02-regulation-query/prototype/fixtures.mjs
	var AS_OF_DATE = "2026-09-25";
	function provincePlace(code, province, shortName, aliases = []) {
		return {
			placeId: `PLACE-${code}`,
			province,
			placeType: "province_level_admin",
			displayPath: province,
			reviewStatus: "approved_formal",
			sourceId: `SRC-PLACE-${code}`,
			locator: `重点省份/${province}`,
			aliases: [
				{
					name: province,
					kind: "official_name"
				},
				{
					name: shortName,
					kind: "official_name"
				},
				...aliases.map((name) => ({
					name,
					kind: "official_name"
				}))
			]
		};
	}
	var places = [
		provincePlace("TJ", "天津市", "天津", ["天津滨海新区", "滨海新区"]),
		provincePlace("SH", "上海市", "上海"),
		provincePlace("BJ", "北京市", "北京"),
		provincePlace("GD", "广东省", "广东", ["广州市", "深圳市"]),
		provincePlace("JS", "江苏省", "江苏", ["南京市", "苏州市"]),
		provincePlace("ZJ", "浙江省", "浙江", ["杭州市", "宁波市"]),
		provincePlace("YN", "云南省", "云南", ["昆明市", "云南省昆明市"])
	];
	var scenarios = {
		tianjin: {
			province: "天津市",
			query: "天津市",
			keywords: "岩土工程技术规范\n岩土工程勘察规范\n建筑基桩检测技术规程\n建筑工程消能减震隔震技术规程\n绿色建筑设计标准"
		},
		shanghai: {
			province: "上海市",
			query: "上海市",
			keywords: "建筑抗震设计标准\n地基基础设计标准\n现有建筑抗震鉴定与加固标准\n建筑消能减震及隔震技术标准\n基坑工程技术标准\n岩土工程勘察规范"
		},
		beijing: {
			province: "北京市",
			query: "北京市",
			keywords: "建筑基坑支护技术规程\n基坑工程内支撑技术规程\n农村民居建筑抗震设计施工规程"
		},
		guangdong: {
			province: "广东省",
			query: "广东省",
			keywords: "高层建筑混凝土结构技术规程\n建筑基坑工程技术规程"
		},
		jiangsu: {
			province: "江苏省",
			query: "江苏省",
			keywords: "建筑地基基础检测规程\n住宅设计标准"
		},
		zhejiang: {
			province: "浙江省",
			query: "浙江省",
			keywords: "刚-柔性复合桩基技术规程\n复合地基技术规程\n建筑地基基础设计规范\n工程建设岩土工程勘察规范"
		},
		yunnan: {
			province: "云南省",
			query: "云南省",
			keywords: "建筑基坑工程监测技术规程\n云南省建筑基坑支护技术规程\n岩土工程与地基基础"
		}
	};
	//#endregion
	//#region web-demo/design/parallel-tasks/02-regulation-query/prototype/app.mjs
	var state = {
		resolution: null,
		selectedPlace: null,
		placeConfirmed: false,
		records: [],
		backendOnline: false,
		loading: false,
		lastRun: null,
		activeScenario: "tianjin"
	};
	var $ = (selector) => document.querySelector(selector);
	var queryInput = $("#place-query");
	var provinceFilter = $("#province-filter");
	var resolutionBox = $("#resolution");
	var resultBody = $("#result-body");
	var resultEmpty = $("#result-empty");
	var discoveryButton = $("#discover-online");
	var networkStatus = $("#network-status");
	$("#resolve-form").addEventListener("submit", (event) => {
		event.preventDefault();
		runResolution(queryInput.value, true);
	});
	provinceFilter.addEventListener("change", () => {
		selectScenario(provinceFilter.value, true);
	});
	discoveryButton.addEventListener("click", runLiveAudit);
	async function checkBackend() {
		try {
			const response = await fetch("/api/health", { cache: "no-store" });
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			state.backendOnline = (await response.json()).mode === "live-readonly";
			networkStatus.textContent = state.backendOnline ? "联网服务已连接" : "联网服务状态异常";
			networkStatus.className = state.backendOnline ? "network-status online" : "network-status offline";
		} catch {
			state.backendOnline = false;
			networkStatus.textContent = "联网服务未启动";
			networkStatus.className = "network-status offline";
		}
		updateDiscoveryButton();
		renderResults();
		if (state.backendOnline && state.placeConfirmed && !state.lastRun) await runLiveAudit();
	}
	async function runLiveAudit() {
		if (!state.placeConfirmed || !state.backendOnline || state.loading) return;
		state.loading = true;
		state.records = [];
		state.lastRun = null;
		discoveryButton.textContent = "正在联网查询…";
		updateDiscoveryButton();
		renderResults();
		try {
			const scenario = scenarios[state.activeScenario];
			const response = await fetch("/api/discover", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					province: state.selectedPlace.province,
					placeId: state.selectedPlace.placeId,
					keywords: scenario?.keywords || "建筑结构\n抗震\n地基基础",
					asOf: AS_OF_DATE
				})
			});
			const payload = await response.json();
			if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
			state.records = payload.records || [];
			state.lastRun = payload;
			discoveryButton.textContent = "重新联网查询";
		} catch (error) {
			state.lastRun = { error: error.message };
			discoveryButton.textContent = "重试联网查询";
			toast(`联网查询失败：${error.message}`);
		} finally {
			state.loading = false;
			updateDiscoveryButton();
			renderResults();
		}
	}
	function selectScenario(key, autoSearch) {
		const scenario = scenarios[key];
		if (!scenario) return;
		state.activeScenario = key;
		provinceFilter.value = key;
		queryInput.value = scenario.query;
		window.history.replaceState(null, "", `?province=${key}`);
		runResolution(scenario.query, autoSearch);
	}
	function runResolution(query, autoSearch = false) {
		state.resolution = resolvePlace(query, places);
		state.selectedPlace = state.resolution.selected || null;
		state.placeConfirmed = Boolean(state.resolution.confirmed);
		state.records = [];
		state.lastRun = null;
		if (state.selectedPlace) {
			const matchedScenario = Object.entries(scenarios).find(([, scenario]) => scenario.province === state.selectedPlace.province);
			if (matchedScenario) {
				state.activeScenario = matchedScenario[0];
				provinceFilter.value = matchedScenario[0];
			}
		}
		renderResolution();
		renderResults();
		updateDiscoveryButton();
		if (autoSearch && state.placeConfirmed && state.backendOnline) runLiveAudit();
	}
	function renderResolution() {
		const resolution = state.resolution;
		if (resolution.state === "resolved_exact") {
			resolutionBox.innerHTML = `<p class="resolution-ok">已确认：${escapeHtml(state.selectedPlace.displayPath)}</p>`;
			return;
		}
		if (resolution.state === "ambiguous") {
			resolutionBox.innerHTML = "<p class=\"resolution-warn\">地点有歧义，请输入完整省市名称。</p>";
			return;
		}
		resolutionBox.innerHTML = "<p class=\"resolution-warn\">当前页面仅收录上方 7 个重点省份。</p>";
	}
	function updateDiscoveryButton() {
		discoveryButton.disabled = !state.placeConfirmed || !state.backendOnline || state.loading;
	}
	function renderResults() {
		resultBody.innerHTML = "";
		if (!state.placeConfirmed) {
			showEmpty("请先确认查询地区。");
			return;
		}
		if (state.loading) {
			showEmpty("正在逐条访问权威原始网页，请稍候…");
			return;
		}
		if (!state.lastRun) {
			showEmpty(state.backendOnline ? "点击“联网查询”查看适用规范。" : "正在连接联网服务…");
			return;
		}
		if (state.lastRun.error) {
			showEmpty(`查询失败：${state.lastRun.error}`);
			return;
		}
		if (!state.records.length) {
			showEmpty("本次没有从权威网页核到相关规范。未命中不代表废止。");
			return;
		}
		resultEmpty.hidden = true;
		state.records.forEach((regulation) => {
			const link = regulation.secondarySourceUrl || regulation.sourceUrl;
			const tr = document.createElement("tr");
			tr.innerHTML = `
      <td>${layerLabel(regulation.layer)}</td>
      <td><strong>${escapeHtml(regulation.title)}</strong><code>${escapeHtml(regulation.documentNo)}</code></td>
      <td>
        <b class="status ${regulation.status}">${statusLabel(regulation.status)}</b>
        <span>发布：${regulation.publicationDate || "已发布"}</span>
        <span>执行：${regulation.implementationDate || "待核"}</span>
        ${regulation.repealDate ? `<span>废止：${escapeHtml(regulation.repealDate)}</span>` : ""}
      </td>
      <td><a class="table-source-link" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">打开官网</a></td>`;
			resultBody.appendChild(tr);
		});
	}
	function showEmpty(message) {
		resultEmpty.hidden = false;
		resultEmpty.textContent = message;
	}
	function layerLabel(layer) {
		return {
			national: "国家标准",
			industry: "行业标准",
			local: "地方标准",
			supplementary: "专项规定",
			local_regulation: "地方性法规",
			policy: "政策文件",
			review_guidance: "审查技术文件"
		}[layer] || layer;
	}
	function escapeHtml(value) {
		return String(value ?? "").replace(/[&<>"']/g, (char) => ({
			"&": "&amp;",
			"<": "&lt;",
			">": "&gt;",
			"\"": "&quot;",
			"'": "&#39;"
		})[char]);
	}
	function toast(message) {
		const el = $("#toast");
		el.textContent = message;
		el.classList.add("show");
		window.setTimeout(() => el.classList.remove("show"), 3200);
	}
	var requestedProvince = new URLSearchParams(window.location.search).get("province");
	selectScenario(scenarios[requestedProvince] ? requestedProvince : "tianjin", false);
	checkBackend();
	//#endregion
})();
