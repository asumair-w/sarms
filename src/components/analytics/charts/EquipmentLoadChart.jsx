import { Chart as ChartJS, RadialLinearScale, ArcElement, Tooltip, Legend } from 'chart.js'
import { PolarArea } from 'react-chartjs-2'
import { INV_GREEN, CHART_YELLOW, CHART_RED } from './analyticsColors'

ChartJS.register(RadialLinearScale, ArcElement, Tooltip, Legend)

const LABELS = ['Open faults', 'Scheduled maintenance', 'Overdue maintenance', 'Active equipment %']
const COLORS = [CHART_RED + '80', CHART_YELLOW + '80', CHART_RED + '80', INV_GREEN + 'cc']

const options = {
  responsive: true,
  maintainAspectRatio: false,
  layout: { padding: { bottom: 8 } },
  plugins: {
    legend: {
      position: 'bottom',
      labels: { boxWidth: 10, font: { size: 10 }, padding: 12 },
    },
  },
  scales: {
    r: {
      beginAtZero: true,
      ticks: { font: { size: 9 } },
    },
  },
}

export default function EquipmentLoadChart({ data, onSegmentClick }) {
  const openFaults = data?.openFaults ?? 0
  const scheduledMaintenance = data?.scheduledMaintenance ?? 0
  const overdueMaintenance = data?.overdueMaintenance ?? 0
  const activeEquipmentPct = data?.activeEquipmentPct ?? 0
  const labels = data?.labels ?? LABELS

  const chartData = {
    labels,
    datasets: [
      {
        data: [openFaults, scheduledMaintenance, overdueMaintenance, Math.round(activeEquipmentPct)],
        backgroundColor: COLORS,
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
      const label = labels[el.index] ?? LABELS[el.index]
      onSegmentClick({ index: el.index, label })
    },
  }

  return <PolarArea data={chartData} options={optionsWithClick} />
}
