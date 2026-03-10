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
import { OLIVE_PRIMARY, OLIVE_PRIMARY_HOVER, OLIVE_LIGHT, OLIVE_LIGHT_HOVER, SOFT_RED, SOFT_RED_HOVER } from './analyticsColors'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

const COLOR_TASKS = OLIVE_PRIMARY
const COLOR_SESSIONS = OLIVE_LIGHT
const COLOR_FAULTS = SOFT_RED
const HOVER_TASKS = OLIVE_PRIMARY_HOVER
const HOVER_SESSIONS = OLIVE_LIGHT_HOVER
const HOVER_FAULTS = SOFT_RED_HOVER

const options = {
  responsive: true,
  maintainAspectRatio: false,
  indexAxis: 'y',
  plugins: {
    legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
  },
  scales: {
    x: {
      stacked: true,
      beginAtZero: true,
      grid: { color: 'rgba(0,0,0,0.06)' },
      ticks: { font: { size: 10 } },
    },
    y: {
      stacked: true,
      grid: { display: false },
      ticks: { font: { size: 11 } },
    },
  },
}

function ZoneDistributionChart({ data, onSegmentClick, zoneIds }) {
  const labels = data?.labels ?? []
  const tasks = data?.tasks ?? []
  const sessions = data?.sessions ?? []
  const faults = data?.faults ?? []
  const ids = zoneIds ?? labels

  const chartData = {
    labels: labels.length ? labels : ['No data'],
    datasets: [
      { label: 'Tasks', data: tasks.length ? tasks : [0], backgroundColor: COLOR_TASKS, hoverBackgroundColor: HOVER_TASKS },
      { label: 'Sessions', data: sessions.length ? sessions : [0], backgroundColor: COLOR_SESSIONS, hoverBackgroundColor: HOVER_SESSIONS },
      { label: 'Faults', data: faults.length ? faults : [0], backgroundColor: COLOR_FAULTS, hoverBackgroundColor: HOVER_FAULTS },
    ],
  }

  const optionsWithClick = {
    ...options,
    onClick: (event, elements, chart) => {
      if (!onSegmentClick || elements.length === 0) return
      const el = elements[0]
      const labelIndex = el.index
      const zoneLabel = chart.scales.y.getLabelForValue(labelIndex)
      const zoneId = (ids[labelIndex] ?? zoneLabel ?? '').toString()
      onSegmentClick({ zoneId, zoneLabel, zoneIndex: labelIndex })
    },
  }

  return <Bar data={chartData} options={optionsWithClick} />
}

export default ZoneDistributionChart
