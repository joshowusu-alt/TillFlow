export function parseReportDate(value: string | undefined, fallback: Date) {
	if (!value) return fallback;
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return fallback;
	return parsed;
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