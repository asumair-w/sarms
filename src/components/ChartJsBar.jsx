import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js'
import { Bar } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

const defaultOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: { enabled: true },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { maxRotation: 45, font: { size: 11 } },
    },
    y: {
      beginAtZero: true,
      grid: { color: 'rgba(0,0,0,0.06)' },
      ticks: { font: { size: 10 } },
    },
  },
}

/**
 * Chart.js Bar chart. Data: [{ label, value }].
 */
export default function ChartJsBar({ data = [], title = '', color = '#34d399' }) {
  const chartData = {
    labels: data.map((d) => d.label),
    datasets: [
      {
        label: title,
        data: data.map((d) => d.value),
        backgroundColor: color,
        borderColor: color,
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  }

  if (data.length === 0) {
    return (
      <div style={{ padding: '1rem', textAlign: 'center', color: '#64748b', minHeight: 200 }}>
        {title && <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{title}</div>}
        No data
      </div>
    )
  }

  return (
    <div style={{ width: '100%', minHeight: 220 }}>
      {title && (
        <div style={{ marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.9rem', color: '#334155' }}>{title}</div>
      )}
      <div style={{ height: 200 }}>
        <Bar data={chartData} options={defaultOptions} />
      </div>
    </div>
  )
}
