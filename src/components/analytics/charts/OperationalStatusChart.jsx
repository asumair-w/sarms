import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'

import { CHART_NEUTRAL, CHART_YELLOW, CHART_RED } from './analyticsColors'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

const LABELS = ['Pending', 'In Progress', 'Completed', 'Delayed']
const COLOR_TASKS = CHART_NEUTRAL
const COLOR_SESSIONS = CHART_YELLOW
const COLOR_FAULTS = CHART_RED

export default function OperationalStatusChart({ data, onSegmentClick }) {
  const tasks = data?.tasks ?? [0, 0, 0, 0]
  const sessions = data?.sessions ?? [0, 0, 0, 0]
  const faults = data?.faults ?? [0, 0, 0, 0]

  const chartData = {
    labels: data?.labels ?? LABELS,
    datasets: [
      { label: 'Tasks', data: tasks, backgroundColor: COLOR_TASKS },
      { label: 'Sessions', data: sessions, backgroundColor: COLOR_SESSIONS },
      { label: 'Faults', data: faults, backgroundColor: COLOR_FAULTS },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
    },
    scales: {
      x: {
        stacked: true,
        grid: { display: false },
        ticks: { maxRotation: 0, font: { size: 11 } },
      },
      y: {
        stacked: true,
        beginAtZero: true,
        grid: { color: 'rgba(0,0,0,0.06)' },
        ticks: { font: { size: 10 } },
      },
    },
    onClick: (event, elements, chart) => {
      if (!onSegmentClick || elements.length === 0) return
      const el = elements[0]
      const label = chart.scales.x.getLabelForValue(el.index)
      const datasetLabel = chart.data.datasets[el.datasetIndex]?.label ?? ''
      onSegmentClick({ label, datasetLabel })
    },
  }

  return <Bar data={chartData} options={options} />
}
