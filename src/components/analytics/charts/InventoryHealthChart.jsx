import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import { Doughnut } from 'react-chartjs-2'
import { OLIVE_PRIMARY, OLIVE_PRIMARY_HOVER, MUTED_ORANGE, MUTED_ORANGE_HOVER, SOFT_RED, SOFT_RED_HOVER } from './analyticsColors'

ChartJS.register(ArcElement, Tooltip, Legend)

const COLOR_NORMAL = OLIVE_PRIMARY
const COLOR_LOW = MUTED_ORANGE
const COLOR_CRITICAL = SOFT_RED
const HOVER_NORMAL = OLIVE_PRIMARY_HOVER
const HOVER_LOW = MUTED_ORANGE_HOVER
const HOVER_CRITICAL = SOFT_RED_HOVER

const options = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
  },
}

export default function InventoryHealthChart({ data, t, onSegmentClick }) {
  const normal = data?.normal ?? 0
  const low = data?.low ?? 0
  const critical = data?.critical ?? 0
  const sliceLabels = t ? [t('chartNormal'), t('chartLow'), t('chartCritical')] : ['Normal', 'Low', 'Critical']

  const chartData = {
    labels: sliceLabels,
    datasets: [
      {
        data: [normal, low, critical],
        backgroundColor: [COLOR_NORMAL, COLOR_LOW, COLOR_CRITICAL],
        hoverBackgroundColor: [HOVER_NORMAL, HOVER_LOW, HOVER_CRITICAL],
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
      const label = chart.data.labels?.[el.index] ?? sliceLabels[el.index]
      onSegmentClick({ label: label ?? '' })
    },
  }

  return <Doughnut data={chartData} options={optionsWithClick} />
}
