import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import ReportActionGroup from './ReportActionGroup';
import DateRangeFilterCard from './DateRangeFilterCard';
import ReportFilterCard from './ReportFilterCard';
import ReportSectionHeader from './ReportSectionHeader';
import ReportSummaryCard, { ReportSummaryRow } from './ReportSummaryCard';
import ReportTableCard, { ReportTableEmptyRow } from './ReportTableCard';

describe('ReportActionGroup', () => {
	it('renders grouped action links in a shared layout container', () => {
		render(
			<ReportActionGroup>
				<a href="/reports/a">Action A</a>
				<a href="/reports/b">Action B</a>
			</ReportActionGroup>
		);

		expect(screen.getByRole('link', { name: 'Action A' })).toHaveAttribute('href', '/reports/a');
		expect(screen.getByRole('link', { name: 'Action B' })).toHaveAttribute('href', '/reports/b');
	});
});

describe('ReportSectionHeader', () => {
	it('renders title, subtitle, and trailing content', () => {
		render(
			<ReportSectionHeader
				title="Top Profit Contributors"
				subtitle="Products generating the most profit"
				trailing={<span>5 items</span>}
			/>
		);

		expect(screen.getByText('Top Profit Contributors')).toBeInTheDocument();
		expect(screen.getByText('Products generating the most profit')).toBeInTheDocument();
		expect(screen.getByText('5 items')).toBeInTheDocument();
	});
});

describe('ReportFilterCard', () => {
	it('renders a submit button and optional action area', () => {
		render(
			<ReportFilterCard
				actions={<a href="/exports/test">Export</a>}
				columnsClassName="sm:grid-cols-5"
				submitLabel="Apply"
				submitTone="secondary"
			>
				<div>
					<label htmlFor="storeId">Store</label>
					<select id="storeId" name="storeId">
						<option value="ALL">All branches</option>
					</select>
				</div>
			</ReportFilterCard>
		);

		expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Export' })).toHaveAttribute('href', '/exports/test');
	});
});

describe('DateRangeFilterCard', () => {
	it('renders date inputs using the shared filter shell', () => {
		render(<DateRangeFilterCard from="2026-03-01" to="2026-03-12" />);

		expect(screen.getByDisplayValue('2026-03-01')).toBeInTheDocument();
		expect(screen.getByDisplayValue('2026-03-12')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument();
	});
});

describe('ReportTableCard', () => {
	it('renders title and empty state row', () => {
		render(
			<ReportTableCard title="Recent Alerts">
				<thead>
					<tr>
						<th>Type</th>
					</tr>
				</thead>
				<tbody>
					<ReportTableEmptyRow colSpan={1} message="No alerts found." />
				</tbody>
			</ReportTableCard>
		);

		expect(screen.getByText('Recent Alerts')).toBeInTheDocument();
		expect(screen.getByText('No alerts found.')).toBeInTheDocument();
		expect(screen.getByRole('table')).toBeInTheDocument();
	});
});

describe('ReportSummaryCard', () => {
	it('renders summary rows with shared card styling', () => {
		render(
			<ReportSummaryCard>
				<ReportSummaryRow label="Net Profit" value="GH₵42.00" divider="default" emphasis="strong" />
			</ReportSummaryCard>
		);

		expect(screen.getByText('Net Profit')).toBeInTheDocument();
		expect(screen.getByText('GH₵42.00')).toBeInTheDocument();
	});
});