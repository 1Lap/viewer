export const PALETTE = [
  '#0ea5e9',
  '#ef4444',
  '#10b981',
  '#f97316',
  '#8b5cf6',
  '#facc15',
  '#1b5f8c',
  '#f43f5e'
];

export const CHART_BASE_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  interaction: { mode: 'nearest', intersect: false },
  scales: {
    x: {
      type: 'linear',
      title: { display: true, text: 'Distance (m)' },
      grid: { color: '#eef1f6' }
    },
    y: {
      beginAtZero: true,
      suggestedMax: 100,
      title: { display: true, text: '% input' },
      grid: { color: '#eef1f6' }
    }
  },
  plugins: {
    legend: { display: false, position: 'bottom', labels: { boxWidth: 12 } },
    tooltip: { enabled: true }
  }
};

export const STATUS_VARIANTS = {
  info: { className: 'status-info' },
  success: { className: 'status-success' },
  warning: { className: 'status-warning' },
  error: { className: 'status-error' }
};
