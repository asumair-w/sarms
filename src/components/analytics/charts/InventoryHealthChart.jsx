import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import { Doughnut } from 'react-chartjs-2'
import { INV_GREEN, CHART_YELLOW, CHART_RED } from './analyticsColors'

ChartJS.register(ArcElement, Tooltip, Legend)

const COLOR_NORMAL = INV_GREEN
const COLOR_LOW = CHART_YELLOW
const COLOR_CRITICAL = CHART_RED

const options = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
  },
}

export default function InventoryHealthChart({ data, onSegmentClick }) {
  const normal = data?.normal ?? 0
  const low = data?.low ?? 0
  const critical = data?.critical ?? 0

  const chartData = {
    labels: ['Normal', 'Low', 'Critical'],
    datasets: [
      {
        data: [normal, low, critical],
        backgroundColor: [COLOR_NORMAL, COLOR_LOW, COLOR_CRITICAL],
        borderWidth: 2,
        borderColor: '#fff',
      },
    ],
  }

  const optionsWithClick = {
    ...options,
    onClick: (event, elements, chart) => {
      if (!onSegmentClick || elements.length === 0) return
      const el = elements[0]
      const label = chart.data.labels?.[el.index] ?? ['Normal', 'Low', 'Critical'][el.index]
      onSegmentClick({ label: label ?? '' })
    },
  }

  return <Doughnut data={chartData} options={optionsWithClick} />
}
