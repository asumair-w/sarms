import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import {
  OLIVE_PRIMARY,
  OLIVE_PRIMARY_HOVER,
  SOFT_BLUE,
  SOFT_BLUE_HOVER,
  MUTED_ORANGE,
  MUTED_ORANGE_HOVER,
  SOFT_RED,
  SOFT_RED_HOVER,
} from './analyticsColors'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

const LABELS = ['Open faults', 'Scheduled maintenance', 'Overdue maintenance', 'Active equipment %']

function getEquipmentLabels(t) {
  if (!t) return LABELS
  return [t('openFaults'), t('scheduledMaintenance'), t('overdueMaintenance'), t('activeEquipmentPct')]
}

const COLORS = [SOFT_RED, SOFT_BLUE, MUTED_ORANGE, OLIVE_PRIMARY]
const HOVER_COLORS = [SOFT_RED_HOVER, SOFT_BLUE_HOVER, MUTED_ORANGE_HOVER, OLIVE_PRIMARY_HOVER]

const options = {
  responsive: true,
  maintainAspectRatio: false,
  layout: { padding: { bottom: 8 } },
  plugins: {
    legend: {
      position: 'bottom',
      labels: { boxWidth: 10, font: { size: 10 }, padding: 12 },
    },
    tooltip: {
      callbacks: {
        label: (ctx) => `${ctx.label}: ${ctx.raw}${ctx.dataIndex === 3 ? '%' : ''}`,
      },
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { maxRotation: 25, font: { size: 10 } },
    },
    y: {
      beginAtZero: true,
      suggestedMax: 100,
      ticks: { font: { size: 10 } },
    },
  },
}

export default function EquipmentLoadChart({ data, t, onSegmentClick }) {
  const openFaults = data?.openFaults ?? 0
  const scheduledMaintenance = data?.scheduledMaintenance ?? 0
  const overdueMaintenance = data?.overdueMaintenance ?? 0
  const activeEquipmentPct = data?.activeEquipmentPct ?? 0
  const labels = t ? getEquipmentLabels(t) : (data?.labels ?? LABELS)

  const values = [openFaults, scheduledMaintenance, overdueMaintenance, Math.round(activeEquipmentPct)]
  const maxVal = Math.max(100, ...values)

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Value',
        data: values,
        backgroundColor: COLORS,
        hoverBackgroundColor: HOVER_COLORS,
        borderWidth: 0,
      },
    ],
  }

  const optionsWithClick = {
    ...options,
    scales: {
      ...options.scales,
      y: { ...options.scales.y, max: maxVal },
    },
    onClick: (event, elements, chart) => {
      if (!onSegmentClick || elements.length === 0) return
      const el = elements[0]
      const label = labels[el.index] ?? LABELS[el.index]
      onSegmentClick({ index: el.index, label })
    },
  }

  return <Bar data={chartData} options={optionsWithClick} />
}
