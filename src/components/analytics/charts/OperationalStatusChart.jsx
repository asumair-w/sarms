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

import {
  SLATE_GREY,
  SLATE_GREY_HOVER,
  SOFT_BLUE,
  SOFT_BLUE_HOVER,
  OLIVE_PRIMARY,
  OLIVE_PRIMARY_HOVER,
  MUTED_ORANGE,
  MUTED_ORANGE_HOVER,
  SOFT_RED,
  SOFT_RED_HOVER,
} from './analyticsColors'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

const LABELS = ['Pending', 'In Progress', 'Completed', 'Delayed']

function getStatusLabels(t) {
  if (!t) return LABELS
  return [t('chartPending'), t('chartInProgress'), t('chartCompleted'), t('chartDelayed')]
}

/** Per-category colors: Pending, In Progress, Completed, Delayed */
const TASKS_COLORS = [SLATE_GREY, SOFT_BLUE, OLIVE_PRIMARY, MUTED_ORANGE]
const TASKS_HOVER = [SLATE_GREY_HOVER, SOFT_BLUE_HOVER, OLIVE_PRIMARY_HOVER, MUTED_ORANGE_HOVER]
const SESSIONS_COLORS = [SLATE_GREY, SOFT_BLUE, SLATE_GREY, MUTED_ORANGE]
const SESSIONS_HOVER = [SLATE_GREY_HOVER, SOFT_BLUE_HOVER, SLATE_GREY_HOVER, MUTED_ORANGE_HOVER]
const FAULTS_COLORS = [SLATE_GREY, SOFT_RED, SLATE_GREY, SLATE_GREY]
const FAULTS_HOVER = [SLATE_GREY_HOVER, SOFT_RED_HOVER, SLATE_GREY_HOVER, SLATE_GREY_HOVER]

export default function OperationalStatusChart({ data, t, onSegmentClick }) {
  const tasks = data?.tasks ?? [0, 0, 0, 0]
  const sessions = data?.sessions ?? [0, 0, 0, 0]
  const faults = data?.faults ?? [0, 0, 0, 0]
  const labels = t ? getStatusLabels(t) : (data?.labels ?? LABELS)

  const chartData = {
    labels,
    datasets: [
      { label: t ? t('tasks') : 'Tasks', data: tasks, backgroundColor: TASKS_COLORS, hoverBackgroundColor: TASKS_HOVER },
      { label: t ? t('sessions') : 'Sessions', data: sessions, backgroundColor: SESSIONS_COLORS, hoverBackgroundColor: SESSIONS_HOVER },
      { label: t ? t('faults') : 'Faults', data: faults, backgroundColor: FAULTS_COLORS, hoverBackgroundColor: FAULTS_HOVER },
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
