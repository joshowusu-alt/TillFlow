export function parseReportDate(value: string | undefined, fallback: Date) {
	if (!value) return fallback;
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return fallback;
	return parsed;
}

function startOfDay(value: Date) {
	const date = new Date(value);
	date.setHours(0, 0, 0, 0);
	return date;
}

function endOfDay(value: Date) {
	const date = new Date(value);
	date.setHours(23, 59, 59, 999);
	return date;
}

type PeriodPreset = {
	key: string;
	start: Date;
	end: Date;
};

function resolvePeriodPreset(period: string | undefined, now: Date): PeriodPreset {
	const normalized = (period ?? '').toLowerCase();
	const todayStart = startOfDay(now);

	switch (normalized) {
		case 'today':
			return { key: 'today', start: todayStart, end: endOfDay(now) };
		case '7':
		case '7d': {
			const start = new Date(todayStart);
			start.setDate(start.getDate() - 6);
			return { key: '7d', start, end: endOfDay(now) };
		}
		case '14':
		case '14d': {
			const start = new Date(todayStart);
			start.setDate(start.getDate() - 13);
			return { key: '14d', start, end: endOfDay(now) };
		}
		case '30':
		case '30d': {
			const start = new Date(todayStart);
			start.setDate(start.getDate() - 29);
			return { key: '30d', start, end: endOfDay(now) };
		}
		case '90':
		case '90d': {
			const start = new Date(todayStart);
			start.setDate(start.getDate() - 89);
			return { key: '90d', start, end: endOfDay(now) };
		}
		case '365':
		case '365d': {
			const start = new Date(todayStart);
			start.setDate(start.getDate() - 364);
			return { key: '365d', start, end: endOfDay(now) };
		}
		case 'mtd':
		case 'month-to-date':
			return {
				key: 'mtd',
				start: new Date(now.getFullYear(), now.getMonth(), 1),
				end: endOfDay(now),
			};
		default: {
			const fallbackStart = new Date(todayStart);
			fallbackStart.setDate(fallbackStart.getDate() - 29);
			return { key: '30d', start: fallbackStart, end: endOfDay(now) };
		}
	}
}

export function resolveReportDateRange(
	params: { from?: string; to?: string } | undefined,
	fallbackStart: Date,
	fallbackEnd: Date,
) {
	const start = parseReportDate(params?.from, fallbackStart);
	const end = parseReportDate(params?.to, fallbackEnd);
	end.setHours(23, 59, 59, 999);

	return {
		start,
		end,
		fromInputValue: start.toISOString().slice(0, 10),
		toInputValue: end.toISOString().slice(0, 10),
	};
}

export function resolveSelectableReportDateRange(
	params: { from?: string; to?: string; period?: string } | undefined,
	defaultPeriod: string,
	now = new Date(),
) {
	const preset = resolvePeriodPreset(params?.period ?? defaultPeriod, now);
	const normalizedPeriod = (params?.period ?? '').toLowerCase();
	const hasCustomRange = normalizedPeriod === 'custom' || (!normalizedPeriod && Boolean(params?.from || params?.to));
	const start = hasCustomRange
		? startOfDay(parseReportDate(params?.from, preset.start))
		: startOfDay(preset.start);
	const end = hasCustomRange
		? endOfDay(parseReportDate(params?.to, preset.end))
		: endOfDay(preset.end);

	return {
		start,
		end,
		fromInputValue: start.toISOString().slice(0, 10),
		toInputValue: end.toISOString().slice(0, 10),
		periodInputValue: hasCustomRange ? 'custom' : preset.key,
		isCustomRange: hasCustomRange,
	};
}