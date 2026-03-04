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
import { INV_GREEN, CHART_YELLOW, CHART_RED } from './analyticsColors'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

const COLOR_TASKS = INV_GREEN + 'cc'
const COLOR_SESSIONS = CHART_YELLOW + 'cc'
const COLOR_FAULTS = CHART_RED + 'cc'

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
      { label: 'Tasks', data: tasks.length ? tasks : [0], backgroundColor: COLOR_TASKS },
      { label: 'Sessions', data: sessions.length ? sessions : [0], backgroundColor: COLOR_SESSIONS },
      { label: 'Faults', data: faults.length ? faults : [0], backgroundColor: COLOR_FAULTS },
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
