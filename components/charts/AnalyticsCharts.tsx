'use client';

import { Line, Bar, Doughnut } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    Title,
    Tooltip,
    Legend,
    Filler
} from 'chart.js';

// Register Chart.js components
ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    Title,
    Tooltip,
    Legend,
    Filler
);

interface SalesTrendChartProps {
    data: {
        labels: string[];
        values: number[];
    };
    title?: string;
    currency?: string;
}

export function SalesTrendChart({ data, title = 'Sales Trend', currency = '£' }: SalesTrendChartProps) {
    const chartData = {
        labels: data.labels,
        datasets: [
            {
                label: 'Sales',
                data: data.values,
                fill: true,
                backgroundColor: 'rgba(5, 150, 105, 0.1)',
                borderColor: 'rgba(5, 150, 105, 1)',
                borderWidth: 2,
                tension: 0.4,
                pointBackgroundColor: 'rgba(5, 150, 105, 1)',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6
            }
        ]
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            title: { display: false },
            tooltip: {
                callbacks: {
                    label: (context: any) => `${currency}${(context.raw / 100).toFixed(2)}`
                }
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                ticks: {
                    callback: (value: any) => `${currency}${(value / 100).toFixed(0)}`
                },
                grid: {
                    color: 'rgba(0, 0, 0, 0.05)'
                }
            },
            x: {
                grid: {
                    display: false
                }
            }
        }
    };

    return (
        <div className="card p-6">
            <h3 className="mb-4 font-display font-semibold">{title}</h3>
            <div className="h-64">
                <Line data={chartData} options={options} />
            </div>
        </div>
    );
}

interface HourlyHeatmapProps {
    data: { hour: number; day: string; sales: number }[];
    title?: string;
}

export function HourlyHeatmap({ data, title = 'Sales by Hour' }: HourlyHeatmapProps) {
    // Group by day of week
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const hours = Array.from({ length: 24 }, (_, i) => i);

    // Find max for scaling
    const maxSales = Math.max(...data.map((d) => d.sales), 1);

    const getIntensity = (dayIdx: number, hour: number) => {
        const item = data.find((d) => d.day === days[dayIdx] && d.hour === hour);
        if (!item || item.sales === 0) return 0;
        return item.sales / maxSales;
    };

    return (
        <div className="card p-6">
            <h3 className="mb-4 font-display font-semibold">{title}</h3>
            <div className="overflow-x-auto">
                <div className="min-w-96">
                    {/* Hour labels */}
                    <div className="mb-1 flex gap-0.5 pl-12">
                        {hours.filter((h) => h % 3 === 0).map((h) => (
                            <div key={h} className="w-8 text-center text-xs text-black/40">
                                {h.toString().padStart(2, '0')}
                            </div>
                        ))}
                    </div>

                    {/* Grid */}
                    {days.map((day, dayIdx) => (
                        <div key={day} className="flex items-center gap-0.5">
                            <div className="w-10 text-right text-xs text-black/60">{day}</div>
                            <div className="ml-2 flex gap-0.5">
                                {hours.map((hour) => {
                                    const intensity = getIntensity(dayIdx, hour);
                                    const bgColor = intensity === 0
                                        ? 'bg-black/5'
                                        : `bg-emerald-500`;
                                    const opacity = intensity === 0 ? 1 : 0.2 + intensity * 0.8;

                                    return (
                                        <div
                                            key={hour}
                                            className={`h-4 w-3 rounded-sm ${bgColor}`}
                                            style={{ opacity }}
                                            title={`${day} ${hour}:00 - Sales: ${data.find((d) => d.day === days[dayIdx] && d.hour === hour)?.sales ?? 0}`}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    ))}

                    {/* Legend */}
                    <div className="mt-4 flex items-center justify-end gap-2 text-xs text-black/50">
                        <span>Less</span>
                        <div className="flex gap-0.5">
                            {[0.2, 0.4, 0.6, 0.8, 1].map((opacity) => (
                                <div
                                    key={opacity}
                                    className="h-3 w-3 rounded-sm bg-emerald-500"
                                    style={{ opacity }}
                                />
                            ))}
                        </div>
                        <span>More</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

interface CategoryBreakdownProps {
    data: { name: string; value: number; color?: string }[];
    title?: string;
    currency?: string;
}

export function CategoryBreakdown({ data, title = 'Sales by Category', currency = '£' }: CategoryBreakdownProps) {
    const colors = [
        'rgba(5, 150, 105, 0.8)',
        'rgba(59, 130, 246, 0.8)',
        'rgba(168, 85, 247, 0.8)',
        'rgba(249, 115, 22, 0.8)',
        'rgba(236, 72, 153, 0.8)',
        'rgba(20, 184, 166, 0.8)',
        'rgba(245, 158, 11, 0.8)'
    ];

    const chartData = {
        labels: data.map((d) => d.name),
        datasets: [
            {
                data: data.map((d) => d.value),
                backgroundColor: data.map((d, i) => d.color || colors[i % colors.length]),
                borderWidth: 0
            }
        ]
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'right' as const,
                labels: {
                    boxWidth: 12,
                    padding: 12
                }
            },
            tooltip: {
                callbacks: {
                    label: (context: any) => {
                        const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
                        const percentage = ((context.raw / total) * 100).toFixed(1);
                        return `${currency}${(context.raw / 100).toFixed(2)} (${percentage}%)`;
                    }
                }
            }
        }
    };

    return (
        <div className="card p-6">
            <h3 className="mb-4 font-display font-semibold">{title}</h3>
            <div className="h-64">
                <Doughnut data={chartData} options={options} />
            </div>
        </div>
    );
}

interface ProductPerformanceProps {
    data: { name: string; revenue: number; profit: number; margin: number }[];
    title?: string;
    currency?: string;
}

export function ProductPerformance({ data, title = 'Top Products', currency = '£' }: ProductPerformanceProps) {
    const chartData = {
        labels: data.map((d) => d.name.length > 15 ? d.name.slice(0, 15) + '...' : d.name),
        datasets: [
            {
                label: 'Revenue',
                data: data.map((d) => d.revenue),
                backgroundColor: 'rgba(5, 150, 105, 0.8)',
                borderRadius: 4
            },
            {
                label: 'Profit',
                data: data.map((d) => d.profit),
                backgroundColor: 'rgba(59, 130, 246, 0.8)',
                borderRadius: 4
            }
        ]
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y' as const,
        plugins: {
            legend: {
                position: 'top' as const
            },
            tooltip: {
                callbacks: {
                    label: (context: any) => `${context.dataset.label}: ${currency}${(context.raw / 100).toFixed(2)}`
                }
            }
        },
        scales: {
            x: {
                ticks: {
                    callback: (value: any) => `${currency}${(value / 100).toFixed(0)}`
                },
                grid: {
                    color: 'rgba(0, 0, 0, 0.05)'
                }
            },
            y: {
                grid: {
                    display: false
                }
            }
        }
    };

    return (
        <div className="card p-6">
            <h3 className="mb-4 font-display font-semibold">{title}</h3>
            <div className="h-64">
                <Bar data={chartData} options={options} />
            </div>
            {/* Margin table */}
            <div className="mt-4 space-y-2">
                {data.slice(0, 5).map((product) => (
                    <div key={product.name} className="flex items-center justify-between text-sm">
                        <span className="truncate text-black/60">{product.name}</span>
                        <span className={`font-semibold ${product.margin >= 30 ? 'text-emerald-600' : product.margin >= 15 ? 'text-amber-600' : 'text-rose-600'}`}>
                            {product.margin.toFixed(1)}% margin
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

interface ComparisonChartProps {
    data: {
        labels: string[];
        current: number[];
        previous: number[];
    };
    title?: string;
    currency?: string;
}

export function ComparisonChart({ data, title = 'Period Comparison', currency = '£' }: ComparisonChartProps) {
    const chartData = {
        labels: data.labels,
        datasets: [
            {
                label: 'Current Period',
                data: data.current,
                backgroundColor: 'rgba(5, 150, 105, 0.8)',
                borderRadius: 4
            },
            {
                label: 'Previous Period',
                data: data.previous,
                backgroundColor: 'rgba(0, 0, 0, 0.2)',
                borderRadius: 4
            }
        ]
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top' as const
            },
            tooltip: {
                callbacks: {
                    label: (context: any) => `${context.dataset.label}: ${currency}${(context.raw / 100).toFixed(2)}`
                }
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                ticks: {
                    callback: (value: any) => `${currency}${(value / 100).toFixed(0)}`
                },
                grid: {
                    color: 'rgba(0, 0, 0, 0.05)'
                }
            },
            x: {
                grid: {
                    display: false
                }
            }
        }
    };

    return (
        <div className="card p-6">
            <h3 className="mb-4 font-display font-semibold">{title}</h3>
            <div className="h-64">
                <Bar data={chartData} options={options} />
            </div>
        </div>
    );
}
